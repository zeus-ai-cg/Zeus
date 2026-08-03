-- Security fix (production audit, 2026-07-25).
--
-- Two related problems found:
--
-- 1. `public.profiles` grants UPDATE to `authenticated` with an RLS policy
--    that only checks row ownership (`auth.uid() = id`), not which columns
--    are being changed. Every server route in this app also talks to
--    Supabase using the *user's own* forwarded JWT (see
--    src/integrations/supabase/auth-middleware.ts) rather than the service
--    role, so from Postgres's point of view a legitimate app request and a
--    user hand-crafting `supabase.from('profiles').update({ plan: 'pro' })`
--    in their browser console are indistinguishable — both run as the
--    `authenticated` role against their own row. Nothing stopped a user
--    from setting their own `plan`, `questions_used`, `pro_requests_used`,
--    or `score` directly.
--
-- 2. `src/lib/profile.functions.ts` (`setPlan`, `completeOnboarding`) let
--    the client set `plan = 'pro'` directly with no payment check at all —
--    a client-side bug, fixed separately in that file, but (1) means even
--    a perfect fix there wouldn't have been sufficient on its own, since
--    the table itself had no floor under it.
--
-- Fix: a BEFORE UPDATE trigger that freezes the privileged columns back to
-- their previous value whenever the write is coming from the plain
-- `authenticated` role. SECURITY DEFINER functions (owned by a non-
-- `authenticated` role, e.g. `postgres`) execute with an elevated
-- `current_user`, so the RPCs below can still update these columns; direct
-- table writes from user-JWT-scoped clients (browser or server) cannot.

create or replace function public.protect_privileged_profile_columns()
returns trigger
language plpgsql
as $$
begin
  if current_user = 'authenticated' then
    new.plan := old.plan;
    new.questions_used := old.questions_used;
    new.usage_reset_at := old.usage_reset_at;
    new.pro_requests_used := old.pro_requests_used;
    new.pro_usage_reset_at := old.pro_usage_reset_at;
    new.score := old.score;
    new.created_at := old.created_at;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_privileged_profile_columns on public.profiles;
create trigger protect_privileged_profile_columns
  before update on public.profiles
  for each row execute function public.protect_privileged_profile_columns();

-- Read-only (reset-if-due, no increment) counterpart to increment_usage.
-- Lets chat.ts / getMe do the "is it time to reset the rolling window"
-- check and get back trustworthy numbers, atomically, without needing a
-- direct UPDATE on the now-protected columns.
create or replace function public.get_current_usage(p_user_id uuid)
returns table (
  plan text,
  questions_used integer,
  usage_reset_at timestamptz,
  pro_requests_used integer,
  pro_usage_reset_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user_id is distinct from auth.uid() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  return query
  update public.profiles p
  set
    questions_used = case
      when p.plan <> 'pro' and now() >= p.usage_reset_at + make_interval(hours => 12) then 0
      else p.questions_used
    end,
    usage_reset_at = case
      when p.plan <> 'pro' and now() >= p.usage_reset_at + make_interval(hours => 12) then now()
      else p.usage_reset_at
    end,
    pro_requests_used = case
      when p.plan = 'pro' and now() >= p.pro_usage_reset_at + make_interval(days => 30) then 0
      else p.pro_requests_used
    end,
    pro_usage_reset_at = case
      when p.plan = 'pro' and now() >= p.pro_usage_reset_at + make_interval(days => 30) then now()
      else p.pro_usage_reset_at
    end
  where p.id = p_user_id
  returning p.plan, p.questions_used, p.usage_reset_at, p.pro_requests_used, p.pro_usage_reset_at;
end;
$$;

revoke all on function public.get_current_usage(uuid) from public;
grant execute on function public.get_current_usage(uuid) to authenticated;

-- Atomic, bounds-checked score increment. Replaces the read-then-write
-- `select score ... ; update profiles set score = x + 1` pattern that was
-- in src/routes/api/chat.ts and src/lib/profile.functions.ts (addScore) —
-- both a lost-update race under concurrent requests, and (per the trigger
-- above) no longer writable directly by the client at all.
create or replace function public.increment_score(p_user_id uuid, p_amount integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  new_score integer;
begin
  if p_user_id is distinct from auth.uid() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_amount < 1 or p_amount > 500 then
    raise exception 'invalid amount' using errcode = '22003';
  end if;

  update public.profiles
  set score = coalesce(score, 0) + p_amount
  where id = p_user_id
  returning score into new_score;

  return new_score;
end;
$$;

revoke all on function public.increment_score(uuid, integer) from public;
grant execute on function public.increment_score(uuid, integer) to authenticated;

-- Server-side (service-role only) plan activation, called from the Paddle
-- webhook handler after a signature-verified payment event. Deliberately
-- has NO auth.uid() self-service path — only a role with BYPASSRLS /
-- service_role can reach this table for `plan` writes now that the trigger
-- above blocks the `authenticated` role.
comment on function public.protect_privileged_profile_columns() is
  'Freezes profiles.plan / usage counters / score against direct writes from the authenticated role. See supabase/migrations/20260725120000_lock_down_profile_privileges.sql for the full writeup.';
