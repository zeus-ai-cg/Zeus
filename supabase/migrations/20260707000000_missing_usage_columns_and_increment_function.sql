-- One-time recovery helper for missing chat usage schema and the atomic
-- increment_usage function.

alter table public.profiles
  add column if not exists questions_used integer not null default 0,
  add column if not exists usage_reset_at timestamptz not null default now(),
  add column if not exists pro_requests_used integer not null default 0,
  add column if not exists pro_usage_reset_at timestamptz not null default now();

comment on column public.profiles.questions_used is
  'Number of free questions used in the current 12-hour rolling window.';
comment on column public.profiles.usage_reset_at is
  'Timestamp representing the start of the current 12-hour free question window.';
comment on column public.profiles.pro_requests_used is
  'Number of Pro requests used in the current 30-day Fair Usage Policy window.';
comment on column public.profiles.pro_usage_reset_at is
  'Start timestamp of the current Pro Fair Usage Policy window.';

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

revoke all on function public.increment_usage(uuid) from public;
grant execute on function public.increment_usage(uuid) to authenticated;
