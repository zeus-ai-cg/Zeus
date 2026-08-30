-- Fix: allow anon (public) to read profiles for the feedback showcase.
-- The profiles table was locked to authenticated-only SELECT, which broke
-- the feedback listing's profiles(display_name, avatar_url) join.

-- Grant SELECT to anon so PostgREST can resolve the join
GRANT SELECT ON public.profiles TO anon;

-- Allow any visitor to read profile display_name/avatar_url (public data)
CREATE POLICY "public_can_read_profiles"
  ON public.profiles FOR SELECT
  TO anon
  USING (true);
