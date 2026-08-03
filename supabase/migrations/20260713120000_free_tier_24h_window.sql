-- Free plan policy change: 20 questions / 12 hours -> 15 questions / 24 hours.
--
-- The question COUNT (20 -> 15) is enforced entirely in application code via
-- FREE_QUESTION_LIMIT in src/lib/achievements.ts (src/routes/api/chat.ts
-- checks `questions_used >= FREE_QUESTION_LIMIT` before calling this
-- function), so it needs no database change.
--
-- The rolling WINDOW (12h -> 24h) is hardcoded inside increment_usage(),
-- so it does need a new function definition. This migration only changes
-- `make_interval(hours => 12)` to `make_interval(hours => 24)` in both
-- branches that reset the free-tier counter; the Pro Fair Usage Policy
-- (30-day window) is untouched.
create or replace function public.increment_usage(p_user_id uuid)
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
      when p.plan <> 'pro' and now() >= p.usage_reset_at + (make_interval(hours => 24))
        then 1
      when p.plan <> 'pro'
        then p.questions_used + 1
      else p.questions_used
    end,
    usage_reset_at = case
      when p.plan <> 'pro' and now() >= p.usage_reset_at + (make_interval(hours => 24))
        then now()
      else p.usage_reset_at
    end,
    pro_requests_used = case
      when p.plan = 'pro' and now() >= p.pro_usage_reset_at + (make_interval(days => 30))
        then 1
      when p.plan = 'pro'
        then p.pro_requests_used + 1
      else p.pro_requests_used
    end,
    pro_usage_reset_at = case
      when p.plan = 'pro' and now() >= p.pro_usage_reset_at + (make_interval(days => 30))
        then now()
      else p.pro_usage_reset_at
    end
  where p.id = p_user_id
  returning p.plan, p.questions_used, p.usage_reset_at, p.pro_requests_used, p.pro_usage_reset_at;
end;
$$;

revoke all on function public.increment_usage(uuid) from public;
grant execute on function public.increment_usage(uuid) to authenticated;

comment on column public.profiles.questions_used is
  'Number of free questions used in the current 24-hour rolling window (limit: FREE_QUESTION_LIMIT = 15, src/lib/achievements.ts).';
comment on column public.profiles.usage_reset_at is
  'Timestamp representing the start of the current 24-hour free question window.';
