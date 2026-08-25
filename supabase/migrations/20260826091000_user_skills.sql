-- Zeus AI Skills System
-- Builtin skill toggling + custom user skills
-- Migration: 20260826091000_user_skills.sql

CREATE TABLE IF NOT EXISTS public.user_custom_skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  instructions TEXT NOT NULL,
  examples TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.user_custom_skills ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own custom skills select" ON public.user_custom_skills
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "own custom skills insert" ON public.user_custom_skills
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "own custom skills update" ON public.user_custom_skills
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "own custom skills delete" ON public.user_custom_skills
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX idx_user_custom_skills_user ON public.user_custom_skills(user_id, is_active);

-- Enabled skill IDs stored in profiles (array of builtin skill IDs)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS enabled_skill_ids TEXT[] DEFAULT '{}';
