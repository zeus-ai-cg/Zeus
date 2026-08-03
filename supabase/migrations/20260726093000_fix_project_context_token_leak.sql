-- Security fix (production audit, 2026-07-26).
--
-- supabase/migrations/20260713121000_project_contexts.sql added this policy
-- to let /api/context/$token (an intentionally public, unauthenticated
-- route — see that file's comments) read a single row by token using the
-- publishable/anon key:
--
--   create policy "Anyone with the token can read a project context"
--     on public.project_contexts
--     for select
--     using (true);
--
-- The intent was "anyone who *knows the token* can read that one row",
-- the same trust model as a Google Docs share link. But the policy itself
-- has no `to authenticated` role restriction (so it applies to the `anon`
-- role too, which Supabase grants table-level SELECT to by default) and
-- the `using (true)` condition is unconditionally true for every row —
-- there is nothing in the policy that actually requires knowing the
-- token. The app's own route always adds `.eq('token', ...)`, so the UI
-- never exposed this, but the token check was enforced only by the
-- client's query, not by the database. Anyone with the public anon key
-- (which ships in every page load — see VITE_SUPABASE_PUBLISHABLE_KEY)
-- could call the Supabase REST API directly —
-- `GET /rest/v1/project_contexts?select=*` — with no token at all and
-- read every user's shared project content (potentially full source
-- trees, since this is exactly the content the Connectors feature
-- bundles for pasting into an external AI tool).
--
-- Fix: remove the blanket policy (so anon/authenticated table-level SELECT
-- is denied by RLS by default again) and replace it with a SECURITY
-- DEFINER function that looks up a single row by exact token match. A
-- function argument is not something you can enumerate the way a
-- `select *` is, and this makes the token the only key that unlocks a row,
-- matching the feature's actual intended security model. The route change
-- to call this instead of a direct table select is in
-- src/routes/api/context.$token.ts.

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

-- Callable by anon (unauthenticated fetches from external tools) and
-- authenticated alike — the token itself is the credential, not the role.
revoke all on function public.get_project_context_by_token(text) from public;
grant execute on function public.get_project_context_by_token(text) to anon, authenticated;
