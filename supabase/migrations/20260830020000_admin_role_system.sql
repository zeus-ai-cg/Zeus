-- Admin role system: hidden moderation for feedback
-- Adds a 'role' column to profiles for admin identification

-- Add role column (default 'user', only 'admin' gets special powers)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'user';

-- Only allow 'user' and 'admin' values
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check CHECK (role IN ('user', 'admin'));

-- Create an index for fast admin lookups
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);

-- Grant anon/authenticated SELECT on the role column (already covered by existing policies)
-- The role column is readable but only modifiable via service_role (server-side only)
