-- Feature 6: Zeus Credits.
--
-- Deliberately additive, not a replacement of the existing free/Pro
-- question-quota system in `profiles` (questions_used / pro_requests_used)
-- — that system keeps gating access exactly as it does today, so
-- subscriptions and the Fair Usage Policy are untouched. This table is a
-- write-only usage ledger purely for a transparent, per-action "Zeus
-- Credits" display (see src/lib/credits.ts for the cost table), logged
-- best-effort from /api/chat, /api/engineer, and the Feature Generator —
-- never blocking a request if the insert fails.
create table if not exists public.credit_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null,
  credits integer not null check (credits >= 0),
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

comment on table public.credit_ledger is
  'Write-only, per-action Zeus Credits usage log (Feature 6). Informational/display only — does not gate access; the existing profiles.questions_used / pro_requests_used quota system is still the single source of truth for limits.';

create index if not exists credit_ledger_user_id_created_at_idx on public.credit_ledger (user_id, created_at desc);

alter table public.credit_ledger enable row level security;

-- Users can read their own history (for the Credits badge/breakdown) and
-- insert their own entries — inserts happen from server routes using the
-- request-scoped, user-JWT-bound Supabase client (same pattern as the
-- `messages` and `achievements` inserts in /api/chat.ts), never a
-- service-role key.
create policy "Users read their own credit ledger"
  on public.credit_ledger
  for select
  using (auth.uid() = user_id);

create policy "Users insert their own credit ledger entries"
  on public.credit_ledger
  for insert
  with check (auth.uid() = user_id);
