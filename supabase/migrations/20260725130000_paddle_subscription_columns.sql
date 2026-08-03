-- Supports the Paddle webhook handler (src/routes/api/webhooks/paddle.ts),
-- which is the ONLY place that should ever set profiles.plan = 'pro' (it
-- runs with the service role, so it isn't affected by the
-- protect_privileged_profile_columns trigger added in
-- 20260725120000_lock_down_profile_privileges.sql).
alter table public.profiles
  add column if not exists paddle_customer_id text,
  add column if not exists paddle_subscription_id text;

comment on column public.profiles.paddle_subscription_id is
  'Paddle subscription id backing this user''s Pro plan, if any. Used by the webhook handler to tell subscription.canceled/paused apart for the right user and to make webhook delivery idempotent.';

create unique index if not exists profiles_paddle_subscription_id_idx
  on public.profiles (paddle_subscription_id)
  where paddle_subscription_id is not null;
