-- Phase 5: Visual Project Map.
--
-- The map (nodes/edges/external services/env var names) is derived purely
-- from workspace_project_files, so it's cached here as jsonb rather than
-- recomputed on every view. Cache is invalidated (set back to null) by
-- applyProjectModification whenever a project's files change, so the map
-- never silently goes stale after an edit.
alter table public.workspace_projects add column if not exists project_map jsonb;
