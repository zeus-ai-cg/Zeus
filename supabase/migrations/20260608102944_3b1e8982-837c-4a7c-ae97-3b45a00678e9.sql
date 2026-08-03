ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS avatar_url text,
  ADD COLUMN IF NOT EXISTS full_name text,
  ADD COLUMN IF NOT EXISTS age integer,
  ADD COLUMN IF NOT EXISTS nationality text,
  ADD COLUMN IF NOT EXISTS score integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS profiles_score_idx ON public.profiles(score DESC);