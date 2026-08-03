-- Feature 9: Dashboard Redesign — "Pinned Projects".
alter table public.workspace_projects
  add column if not exists pinned boolean not null default false;

comment on column public.workspace_projects.pinned is
  'User-toggled pin, shown first on the redesigned dashboard (Feature 9). Purely a display preference — no other behavior depends on it.';
