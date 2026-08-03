-- Connectors tab: shareable, read-only "project context" links a user can
-- generate from their code and paste into Claude, ChatGPT, or any other
-- tool that can fetch a URL, so that tool has the same project context
-- Zeus AI does.
--
-- Security model: same as a Google Docs "anyone with the link" share —
-- the token is a long random secret (generated server-side, never
-- enumerable), so a public SELECT-by-token policy is safe. Only the
-- owning user (via their authenticated session) may create or delete
-- their own context links.
create table if not exists public.project_contexts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token text not null unique,
  project_name text not null default 'My Project',
  content text not null,
  created_at timestamptz not null default now()
);

comment on table public.project_contexts is
  'Shareable, read-only project context snapshots for the Connectors tab. Fetched publicly by token via /api/context/$token so external tools (Claude, ChatGPT, etc.) can read project context from a pasted URL.';

create index if not exists project_contexts_user_id_idx on public.project_contexts (user_id);
create index if not exists project_contexts_token_idx on public.project_contexts (token);

alter table public.project_contexts enable row level security;

-- Owner can manage their own links (list/create/delete from the Connectors UI).
create policy "Users manage their own project contexts"
  on public.project_contexts
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Anyone holding the (unguessable) token can read the content — this is
-- what lets an external AI tool fetch /api/context/$token without a
-- Supabase session, exactly like following a share link.
create policy "Anyone with the token can read a project context"
  on public.project_contexts
  for select
  using (true);
