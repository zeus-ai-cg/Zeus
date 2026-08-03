-- Phase 7: Workspace Tools, AI Agents, Health Score, Git Tools, Code
-- Review, AI Terminal, Rollback, Settings.

-- Cached like project_map (Phase 5) — deterministic/heuristic, recomputed
-- lazily, invalidated whenever a modification is applied.
alter table public.workspace_projects add column if not exists health_score jsonb;

-- Per-project glob-ish ignore patterns (comma-separated), applied client-side
-- during upload indexing on top of the built-in skip list from Phase 1.
alter table public.workspace_projects add column if not exists ignore_patterns text;

-- Coding preferences (Professional Settings, Phase X Feature 9). Threaded
-- into chat and modification system prompts. Defaults preserve current
-- behavior exactly.
alter table public.profiles add column if not exists coding_style text not null default 'idiomatic';
alter table public.profiles add column if not exists response_length text not null default 'balanced';
alter table public.profiles add column if not exists creativity_level text not null default 'balanced';
