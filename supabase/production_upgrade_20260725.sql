-- ============================================================================
-- Zeus AI — Production database upgrade (safe, non-destructive, idempotent)
-- Generated: 2026-07-25
--
-- WHY THIS SCRIPT EXISTS
--   The production database only contains the schema from the first eight
--   migrations (profiles/threads/messages/achievements/saved_snippets/
--   project_contexts + the usage counters + increment_usage). A live probe
--   of the PostgREST API confirmed the following gaps vs. the current code:
--
--     profiles  missing: pro_requests_used, pro_usage_reset_at,
--                        active_model_provider, active_model_id,
--                        coding_style, response_length, creativity_level
--     threads   missing: workspace_project_id
--     MISSING TABLES:    workspace_projects, workspace_project_files,
--                        workspace_modifications, user_api_keys
--     increment_usage    exists, but is an old definition (must be replaced
--                        with the 24h-window version that also handles the
--                        Pro Fair Usage counters)
--
-- GUARANTEES
--   * No DROP TABLE, no DELETE, no TRUNCATE, no column drops.
--   * Existing tables are only ALTERed with ADD COLUMN IF NOT EXISTS.
--   * New tables use CREATE TABLE IF NOT EXISTS.
--   * Policies are recreated via DROP POLICY IF EXISTS + CREATE POLICY
--     (policy objects hold no data; this is the idempotent pattern since
--     Postgres has no CREATE POLICY IF NOT EXISTS).
--   * increment_usage is dropped and recreated (functions hold no data;
--     DROP is required because the old return signature may differ).
--
-- HOW TO RUN: paste the whole file into the Supabase SQL Editor and run once.
-- Running it a second time is harmless.
-- ============================================================================


-- ============================================================================
-- 1. profiles — add every column the current code reads/writes.
--    (Includes the columns the probe found missing; the IF NOT EXISTS guard
--    makes the already-present ones no-ops.)
-- ============================================================================
alter table public.profiles
  add column if not exists pro_requests_used integer not null default 0,
  add column if not exists pro_usage_reset_at timestamptz not null default now(),
  add column if not exists active_model_provider text not null default 'gemini',
  add column if not exists active_model_id text not null default 'gemini-2.5-flash',
  add column if not exists coding_style text not null default 'idiomatic',
  add column if not exists response_length text not null default 'balanced',
  add column if not exists creativity_level text not null default 'balanced';

comment on column public.profiles.pro_requests_used is
  'Number of Pro requests used in the current 30-day Fair Usage Policy window.';
comment on column public.profiles.pro_usage_reset_at is
  'Start timestamp of the current Pro Fair Usage Policy window.';
comment on column public.profiles.questions_used is
  'Number of free questions used in the current 24-hour rolling window (limit: FREE_QUESTION_LIMIT = 15, src/lib/achievements.ts).';
comment on column public.profiles.usage_reset_at is
  'Timestamp representing the start of the current 24-hour free question window.';


-- ============================================================================
-- 2. workspace_projects + workspace_project_files (Phase 1: Project Workspace)
--    Includes the Phase 5/7 columns (project_map, health_score,
--    ignore_patterns) directly in the CREATE, plus ADD COLUMN guards in case
--    a partial version of the table ever existed.
-- ============================================================================
create table if not exists public.workspace_projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'Untitled Project',
  framework text,
  primary_language text,
  file_count integer not null default 0,
  total_bytes bigint not null default 0,
  folder_tree jsonb not null default '{}'::jsonb,
  dependencies jsonb not null default '[]'::jsonb,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  project_map jsonb,
  health_score jsonb,
  ignore_patterns text
);

-- Guards for a pre-existing partial table (no-ops on a fresh create).
alter table public.workspace_projects
  add column if not exists project_map jsonb,
  add column if not exists health_score jsonb,
  add column if not exists ignore_patterns text;

comment on table public.workspace_projects is
  'Indexed metadata for a project uploaded to the Project Workspace: folder structure, detected framework/language, dependency list, and cached project map / health score. File contents live in workspace_project_files.';

create table if not exists public.workspace_project_files (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.workspace_projects(id) on delete cascade,
  path text not null,
  content text not null default '',
  size integer not null default 0,
  created_at timestamptz not null default now()
);

comment on table public.workspace_project_files is
  'Text/code file contents for an indexed workspace project. Binary and oversized files are skipped at upload time and never stored here.';

create index if not exists workspace_projects_user_id_idx on public.workspace_projects (user_id);
create index if not exists workspace_project_files_project_id_idx on public.workspace_project_files (project_id);
create unique index if not exists workspace_project_files_project_path_idx on public.workspace_project_files (project_id, path);

grant select, insert, update, delete on public.workspace_projects to authenticated;
grant all on public.workspace_projects to service_role;
grant select, insert, update, delete on public.workspace_project_files to authenticated;
grant all on public.workspace_project_files to service_role;

alter table public.workspace_projects enable row level security;
alter table public.workspace_project_files enable row level security;

drop policy if exists "Users manage their own workspace projects" on public.workspace_projects;
create policy "Users manage their own workspace projects"
  on public.workspace_projects
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users manage files of their own workspace projects" on public.workspace_project_files;
create policy "Users manage files of their own workspace projects"
  on public.workspace_project_files
  for all
  using (exists (
    select 1 from public.workspace_projects p
    where p.id = workspace_project_files.project_id
      and p.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.workspace_projects p
    where p.id = workspace_project_files.project_id
      and p.user_id = auth.uid()
  ));

create or replace function public.set_workspace_project_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists workspace_projects_set_updated_at on public.workspace_projects;
create trigger workspace_projects_set_updated_at
  before update on public.workspace_projects
  for each row execute function public.set_workspace_project_updated_at();


-- ============================================================================
-- 3. threads.workspace_project_id (Phase 2: Project Chat)
--    ON DELETE SET NULL: deleting an indexed project must never delete or
--    corrupt chat history — the thread just becomes un-attached.
--    (Must come after section 2 because of the foreign key.)
-- ============================================================================
alter table public.threads
  add column if not exists workspace_project_id uuid references public.workspace_projects(id) on delete set null;

create index if not exists threads_workspace_project_id_idx on public.threads (workspace_project_id);


-- ============================================================================
-- 4. workspace_modifications (Phase 3: Project Modification + Diff Viewer)
-- ============================================================================
create table if not exists public.workspace_modifications (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.workspace_projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  instructions text not null,
  summary text not null default '',
  status text not null default 'proposed' check (status in ('proposed', 'applied')),
  files jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  applied_at timestamptz
);

comment on table public.workspace_modifications is
  'Proposed and applied AI-generated modifications for a Project Workspace project. Holds full before/after content per changed file so the diff viewer and apply step never need to re-derive it.';

create index if not exists workspace_modifications_project_id_idx on public.workspace_modifications (project_id);
create index if not exists workspace_modifications_user_id_idx on public.workspace_modifications (user_id);

grant select, insert, update, delete on public.workspace_modifications to authenticated;
grant all on public.workspace_modifications to service_role;

alter table public.workspace_modifications enable row level security;

drop policy if exists "Users manage their own workspace modifications" on public.workspace_modifications;
create policy "Users manage their own workspace modifications"
  on public.workspace_modifications
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);


-- ============================================================================
-- 5. user_api_keys (Phase 4: Multi-Model Support / BYOK)
--    Keys are AES-256-GCM encrypted server-side before insert; this table
--    only ever stores ciphertext.
-- ============================================================================
create table if not exists public.user_api_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('gemini', 'openai', 'anthropic', 'openrouter', 'groq', 'deepseek', 'mistral')),
  encrypted_key text not null,
  last_four text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider)
);

comment on table public.user_api_keys is
  'User-supplied ("bring your own key") API keys for AI model providers, encrypted at rest. Never queried from client code — only from server functions in src/lib/model-keys.functions.ts.';

grant select, insert, update, delete on public.user_api_keys to authenticated;
grant all on public.user_api_keys to service_role;

alter table public.user_api_keys enable row level security;

drop policy if exists "Users manage their own API keys" on public.user_api_keys;
create policy "Users manage their own API keys"
  on public.user_api_keys
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create or replace function public.set_user_api_key_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists user_api_keys_set_updated_at on public.user_api_keys;
create trigger user_api_keys_set_updated_at
  before update on public.user_api_keys
  for each row execute function public.set_user_api_key_updated_at();


-- ============================================================================
-- 6. increment_usage — replace the old function with the current definition
--    (24-hour free window + 30-day Pro Fair Usage window).
--    DROP + CREATE (not CREATE OR REPLACE) because the deployed version may
--    have a different return signature, which CREATE OR REPLACE rejects.
--    Functions hold no data, so this is non-destructive.
-- ============================================================================
drop function if exists public.increment_usage(uuid);

create function public.increment_usage(p_user_id uuid)
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


-- ============================================================================
-- 7. Mark all 15 local migrations as applied in the CLI's migration history,
--    so future `supabase db push` runs are clean instead of trying to replay
--    CREATE TABLE statements against existing objects.
--    (INSERT ... ON CONFLICT DO NOTHING — never overwrites existing history.)
-- ============================================================================
create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (
  version text not null primary key,
  statements text[],
  name text
);

insert into supabase_migrations.schema_migrations (version, name) values
  ('20260605100016', '00ed673a-1a59-413e-950e-dbb98fa58869'),
  ('20260605100040', '9abdf868-1211-4d3f-9c50-b938f712b788'),
  ('20260606090341', '9ce6c68c-fb29-4051-adb9-419229fa8153'),
  ('20260608102944', '3b1e8982-837c-4a7c-ae97-3b45a00678e9'),
  ('20260705120000', 'pro_fair_usage_policy'),
  ('20260706090000', 'atomic_usage_increment'),
  ('20260707000000', 'missing_usage_columns_and_increment_function'),
  ('20260713120000', 'free_tier_24h_window'),
  ('20260713121000', 'project_contexts'),
  ('20260722130000', 'workspace_projects'),
  ('20260722140000', 'thread_workspace_project'),
  ('20260722150000', 'workspace_modifications'),
  ('20260722160000', 'byok_model_keys'),
  ('20260722170000', 'workspace_project_map'),
  ('20260722180000', 'phase7_settings_health'),
  ('20260725120000', 'lock_down_profile_privileges'),
  ('20260725130000', 'paddle_subscription_columns'),
  ('20260726090000', 'fix_usage_reset_window_mismatch'),
  ('20260726093000', 'fix_project_context_token_leak')
on conflict (version) do nothing;


-- ============================================================================
-- 9. profiles — columns added by migrations generated AFTER this catch-up
--    script was first written (2026-07-25). Added here so a database that
--    only ever runs this single file (its stated purpose, per the header
--    above) still ends up fully current instead of missing the single most
--    important fix in the whole audit: the Free-Pro-upgrade exploit closure
--    below in section 10 depends on paddle_subscription_id existing.
-- ============================================================================
alter table public.profiles
  add column if not exists paddle_customer_id text,
  add column if not exists paddle_subscription_id text;

comment on column public.profiles.paddle_subscription_id is
  'Paddle subscription id backing this user''s Pro plan, if any. Used by the webhook handler to tell subscription.canceled/paused apart for the right user and to make webhook delivery idempotent.';

create unique index if not exists profiles_paddle_subscription_id_idx
  on public.profiles (paddle_subscription_id)
  where paddle_subscription_id is not null;

alter table public.workspace_projects
  add column if not exists project_map jsonb,
  add column if not exists health_score jsonb,
  add column if not exists ignore_patterns text;

alter table public.profiles
  add column if not exists coding_style text not null default 'idiomatic',
  add column if not exists response_length text not null default 'balanced',
  add column if not exists creativity_level text not null default 'balanced';


-- ============================================================================
-- 10. THE CRITICAL FIX — close the Free-Pro-upgrade exploit at the database
--     level. Without this, a user can open the browser console and run
--     `supabase.from('profiles').update({ plan: 'pro' })` against their own
--     row and it succeeds — the existing RLS policy on profiles only checks
--     row ownership (auth.uid() = id), not which columns are being written,
--     and every server route in this app (including the client) talks to
--     Supabase using the user's own forwarded JWT, so a legitimate app
--     request and a hand-crafted browser-console request are otherwise
--     indistinguishable to Postgres.
--
--     This trigger freezes plan / usage counters / score back to their
--     previous value on any UPDATE coming from the plain `authenticated`
--     role. The SECURITY DEFINER functions below (get_current_usage,
--     increment_score) still work because they execute as a different,
--     elevated role — only direct table writes are blocked.
--
--     DROP + CREATE for the two functions (not CREATE OR REPLACE) in case
--     an older, differently-shaped version of either already exists on this
--     database from a partial/manual deploy.
-- ============================================================================
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

drop function if exists public.get_current_usage(uuid);

create function public.get_current_usage(p_user_id uuid)
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

-- Note: this is the corrected 24-hour version from the start (see
-- 20260726090000_fix_usage_reset_window_mismatch.sql) — a database that
-- runs only this catch-up file never sees the earlier buggy 12-hour copy.

revoke all on function public.get_current_usage(uuid) from public;
grant execute on function public.get_current_usage(uuid) to authenticated;

drop function if exists public.increment_score(uuid, integer);

create function public.increment_score(p_user_id uuid, p_amount integer)
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


-- ============================================================================
-- 12. project_contexts — close the anon full-table-read bypass. The original
--     "Anyone with the token can read a project context" policy (`using
--     (true)`, no role restriction) let anyone with the public anon key
--     read every user's shared project content directly via the REST API,
--     with no token required — the token was only enforced by the app's
--     own query, not by the database. See
--     supabase/migrations/20260726093000_fix_project_context_token_leak.sql
--     for the full writeup. Skipped harmlessly if this table doesn't exist
--     yet on this database (project_contexts is created in section — see
--     migration 20260713121000 — which this script assumes is already
--     applied per its header; the DROP POLICY IF EXISTS below is a no-op
--     either way).
-- ============================================================================
drop policy if exists "Anyone with the token can read a project context" on public.project_contexts;

create or replace function public.get_project_context_by_token(p_token text)
returns table (
  project_name text,
  content text,
  created_at timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  select pc.project_name, pc.content, pc.created_at
  from public.project_contexts pc
  where pc.token = p_token;
$$;

revoke all on function public.get_project_context_by_token(text) from public;
grant execute on function public.get_project_context_by_token(text) to anon, authenticated;


-- ============================================================================
-- 13. Tell PostgREST to reload its schema cache immediately, so the API layer
--    sees the new tables/columns/functions without waiting or restarting.
-- ============================================================================
notify pgrst, 'reload schema';
