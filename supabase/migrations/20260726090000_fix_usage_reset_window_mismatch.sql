-- Bug fix (production audit, 2026-07-26).
--
-- src/lib/achievements.ts sets FREE_RESET_HOURS = 24, and
-- supabase/migrations/20260713120000_free_tier_24h_window.sql correctly
-- updated increment_usage() (the function that actually consumes a free
-- question on every chat message) to reset the free-tier window every
-- 24 hours.
--
-- But get_current_usage() — added later in
-- supabase/migrations/20260725120000_lock_down_profile_privileges.sql as a
-- read-only "reset-if-due" check used by getMe() (src/lib/profile.functions.ts)
-- and by the pre-flight check in src/routes/api/chat.ts — was written from
-- an older copy of the function and still hardcodes a 12-hour window.
--
-- Effect: any request that calls getMe() (loading the dashboard, sidebar,
-- profile, billing page, etc.) more than 12 hours after a free user's last
-- reset will silently zero out questions_used and restart the window early
-- — 12 hours after the *previous* silent reset, not the intended 24 hours
-- after the user's last question. In practice this means the free tier's
-- real-world reset cadence collapses toward ~12h instead of the intended
-- 24h any time the user or UI polls their usage (which happens routinely
-- just from navigating the app), effectively giving free users roughly
-- double their intended daily quota.
--
-- Fix: redefine get_current_usage() with the same 24-hour window as
-- increment_usage(). Pro's 30-day window was already correct in both
-- functions and is unchanged here.

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
      when p.plan <> 'pro' and now() >= p.usage_reset_at + make_interval(hours => 24) then 0
      else p.questions_used
    end,
    usage_reset_at = case
      when p.plan <> 'pro' and now() >= p.usage_reset_at + make_interval(hours => 24) then now()
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
