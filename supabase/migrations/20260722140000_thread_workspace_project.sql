-- Phase 2: Project Chat.
--
-- A thread can optionally be "attached" to an indexed workspace project
-- (see 20260722130000_workspace_projects.sql). When attached, /api/chat
-- pulls in project structure + relevant file contents as extra context so
-- the assistant can answer project-specific questions ("where is login
-- handled?", "find all API endpoints", etc.).
--
-- ON DELETE SET NULL: deleting an indexed project must never delete or
-- corrupt the user's chat history — the thread just becomes un-attached.
alter table public.threads
  add column if not exists workspace_project_id uuid references public.workspace_projects(id) on delete set null;

create index if not exists threads_workspace_project_id_idx on public.threads (workspace_project_id);
