-- Zeus AI Pro Fair Usage Policy
-- Adds monthly request tracking for Pro-plan accounts. Free-plan usage
-- (questions_used / usage_reset_at, 12h rolling window) is untouched.
-- Pro users get a much higher, monthly-rolling allowance instead of a
-- hard-coded "unlimited" — see src/lib/achievements.ts for the limits.

alter table public.profiles
  add column if not exists pro_requests_used integer not null default 0,
  add column if not exists pro_usage_reset_at timestamptz not null default now();

comment on column public.profiles.pro_requests_used is
  'Number of AI requests made by a Pro-plan user in the current monthly window (Fair Usage Policy).';
comment on column public.profiles.pro_usage_reset_at is
  'Start of the current Pro Fair Usage Policy window; resets automatically every 30 days.';
