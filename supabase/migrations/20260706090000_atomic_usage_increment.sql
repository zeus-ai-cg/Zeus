-- Atomic usage increment for the free-tier question counter and the
-- Zeus AI Pro Fair Usage Policy counter.
--
-- Why: src/routes/api/chat.ts previously did a classic
-- read-modify-write (SELECT questions_used, add 1 in JavaScript, then
-- UPDATE with the computed value). Under concurrent requests (e.g. a user
-- firing off several prompts quickly, or retried requests), two requests
-- can both read the same starting count before either writes back,
-- so one increment silently gets lost — e.g. 4 prompts only add 2 to
-- questions_used.
--
-- Fix: perform the read, the 12h/30-day rolling reset check, and the
-- increment in a single UPDATE statement executed inside Postgres. A
-- single UPDATE takes a row-level lock on the target profile row for its
-- duration, so concurrent calls are serialized by Postgres itself and each
-- one sees the previous call's committed result — no lost updates,
-- no client-side read-modify-write.
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
      when p.plan <> 'pro' and now() >= p.usage_reset_at + (make_interval(hours => 12))
        then 1
      when p.plan <> 'pro'
        then p.questions_used + 1
      else p.questions_used
    end,
    usage_reset_at = case
      when p.plan <> 'pro' and now() >= p.usage_reset_at + (make_interval(hours => 12))
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

-- Only the row's own owner (via the server, using the user's JWT) may call
-- this — matches the existing RLS posture on profiles (auth.uid() = id).
revoke all on function public.increment_usage(uuid) from public;
grant execute on function public.increment_usage(uuid) to authenticated;
