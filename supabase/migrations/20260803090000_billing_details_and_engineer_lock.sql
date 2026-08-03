-- Production fix (2026-08-03) — two independent problems:
--
-- 1. ISSUE 1 (payment succeeds, account never upgrades / billing details
--    missing): supabase/migrations/20260728120000_lemonsqueezy_columns.sql
--    only ever added `lemonsqueezy_customer_id` / `lemonsqueezy_subscription_id`
--    to `profiles`. The spec requires storing the order id, renewal status,
--    and next renewal date too, and none of those columns existed, so
--    src/routes/api/webhooks.ts had nowhere to write them even after the
--    accompanying code fix. Also: those two existing Lemon Squeezy columns
--    (and the three new ones below) were never added to
--    `protect_privileged_profile_columns()` from
--    20260725120000_lock_down_profile_privileges.sql, so — unlike `plan`
--    itself — a user could overwrite their own billing metadata directly
--    from the browser console. Closing that gap here too.
--
-- 2. ISSUES 2 & 3 (Engineer Mode credit accounting / one free project):
--    the Free plan needs a permanent (not 24h-rolling) record of whether
--    the user's one free Engineer Mode project has already been built, and
--    a way to atomically consume the rest of their question quota when it
--    finishes, in the same "no direct client write" style as
--    increment_usage/increment_score. `credit_ledger` (20260728100000) is
--    explicitly write-only/informational and does not gate anything, so it
--    is not a substitute for this.

alter table public.profiles
  add column if not exists lemonsqueezy_order_id text,
  add column if not exists lemonsqueezy_renewal_status text,
  add column if not exists lemonsqueezy_next_renewal_at timestamptz,
  add column if not exists engineer_free_project_used boolean not null default false;

comment on column public.profiles.lemonsqueezy_order_id is
  'Lemon Squeezy order id backing the active subscription, set by /api/webhooks on subscription_created/subscription_updated.';
comment on column public.profiles.lemonsqueezy_renewal_status is
  'Raw Lemon Squeezy subscription status (active, on_trial, cancelled, expired, paused, ...) as of the last webhook delivery.';
comment on column public.profiles.lemonsqueezy_next_renewal_at is
  'Lemon Squeezy subscription "renews_at" — next renewal/billing date. Cleared when the subscription is cancelled/expired/paused.';
comment on column public.profiles.engineer_free_project_used is
  'Free plan only: true once the user has completed one Zeus Project Engineer run. Unlike questions_used this never resets on the 24h window — it permanently locks Engineer Mode until the account upgrades. Set only by consume_free_engineer_project() below.';

-- ---------------------------------------------------------------------
-- Extend the privilege-lockdown trigger to freeze the billing + engineer
-- lock columns too, for the same reason `plan` is frozen: every server
-- route in this app talks to Supabase using the user's own forwarded JWT
-- (role = authenticated), so without this a user could directly
-- `supabase.from('profiles').update({ engineer_free_project_used: false })`
-- to re-unlock Engineer Mode, or forge lemonsqueezy_* ids.
-- ---------------------------------------------------------------------
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
    new.lemonsqueezy_customer_id := old.lemonsqueezy_customer_id;
    new.lemonsqueezy_subscription_id := old.lemonsqueezy_subscription_id;
    new.lemonsqueezy_order_id := old.lemonsqueezy_order_id;
    new.lemonsqueezy_renewal_status := old.lemonsqueezy_renewal_status;
    new.lemonsqueezy_next_renewal_at := old.lemonsqueezy_next_renewal_at;
    new.engineer_free_project_used := old.engineer_free_project_used;
  end if;
  return new;
end;
$$;

-- Trigger already exists (created in 20260725120000) and points at this
-- function by name, so replacing the function body above is sufficient —
-- but re-create it defensively in case that migration was ever skipped.
drop trigger if exists protect_privileged_profile_columns on public.profiles;
create trigger protect_privileged_profile_columns
  before update on public.profiles
  for each row execute function public.protect_privileged_profile_columns();

-- ---------------------------------------------------------------------
-- Atomic, self-service-safe consumption of a Free plan user's one
-- Engineer Mode project. Called from src/routes/api/engineer.ts (using
-- the request-scoped, user-JWT client) only after a project has actually
-- finished generating. SECURITY DEFINER lets it write the two frozen
-- columns above despite the trigger, same pattern as increment_usage /
-- increment_score. No-ops (returns without change) for pro/ultimate,
-- who are never subject to the one-project lock.
-- ---------------------------------------------------------------------
create or replace function public.consume_free_engineer_project(p_user_id uuid)
returns table (
  plan text,
  questions_used integer,
  engineer_free_project_used boolean
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
    -- 15 = FREE_QUESTION_LIMIT (src/lib/achievements.ts). Building one
    -- Engineer project consumes the entire remaining Free plan balance,
    -- per spec — never reduces an already-higher count.
    questions_used = case
      when p.plan = 'free' then greatest(p.questions_used, 15)
      else p.questions_used
    end,
    engineer_free_project_used = case
      when p.plan = 'free' then true
      else p.engineer_free_project_used
    end
  where p.id = p_user_id
  returning p.plan, p.questions_used, p.engineer_free_project_used;
end;
$$;

revoke all on function public.consume_free_engineer_project(uuid) from public;
grant execute on function public.consume_free_engineer_project(uuid) to authenticated;
