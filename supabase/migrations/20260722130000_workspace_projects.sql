-- Phase 1: Project Workspace.
--
-- Lets a user upload a whole project (as a ZIP, parsed client-side) so
-- Zeus AI can index it, remember its structure, and use it as context
-- for later features (project-aware chat, modification, diffing, etc.).
--
-- workspace_projects: one row per indexed project (metadata + folder tree).
-- workspace_project_files: one row per stored file's content, linked to
-- its project. Kept separate from the metadata row so listing projects
-- stays cheap and never has to pull file contents.

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
  updated_at timestamptz not null default now()
);

comment on table public.workspace_projects is
  'Indexed metadata for a project uploaded to the Project Workspace (Phase 1): folder structure, detected framework/language, and dependency list. File contents live in workspace_project_files.';

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

alter table public.workspace_projects enable row level security;
alter table public.workspace_project_files enable row level security;

create policy "Users manage their own workspace projects"
  on public.workspace_projects
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

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
