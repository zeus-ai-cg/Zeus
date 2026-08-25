-- Zeus AI Memory System
-- Long-term user facts/preferences separate from conversation history
-- Migration: 20260826090000_user_memories.sql

CREATE TABLE IF NOT EXISTS public.user_memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general',
  -- Categories: general, preference, goal, context, constraint
  source TEXT NOT NULL DEFAULT 'user',
  -- Sources: user (explicit), auto (detected), system
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.user_memories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own memories select" ON public.user_memories
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "own memories insert" ON public.user_memories
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "own memories update" ON public.user_memories
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "own memories delete" ON public.user_memories
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX idx_user_memories_user ON public.user_memories(user_id, is_active, updated_at DESC);

-- Memory settings in profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS memory_enabled BOOLEAN NOT NULL DEFAULT true;
