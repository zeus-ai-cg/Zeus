-- Replacing Paddle with Lemon Squeezy as the payment processor.
--
-- Additive only: paddle_customer_id / paddle_subscription_id stay on the
-- table (any historical Paddle subscribers keep their record) — the app
-- just stops reading/writing them going forward. New subscriptions are
-- tracked by these two columns instead.
alter table public.profiles
  add column if not exists lemonsqueezy_customer_id text,
  add column if not exists lemonsqueezy_subscription_id text;

comment on column public.profiles.lemonsqueezy_customer_id is
  'Lemon Squeezy customer ID, set by the /api/webhooks handler on subscription_created/subscription_updated.';
comment on column public.profiles.lemonsqueezy_subscription_id is
  'Lemon Squeezy subscription ID — used both by the webhook (to find the profile on subscription_cancelled/subscription_expired) and by the real cancel-via-API flow in src/lib/lemonsqueezy.server.ts.';
