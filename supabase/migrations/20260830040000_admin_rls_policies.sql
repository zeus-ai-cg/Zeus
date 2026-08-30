-- Admin RLS policies: allow admin users to moderate any feedback
-- Without these, RLS only allows owners to update/delete their own rows.

-- Admin can update any feedback (hide, delete, change status)
CREATE POLICY "admin_update_feedback"
  ON public.feedback FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Admin can delete any feedback
CREATE POLICY "admin_delete_feedback"
  ON public.feedback FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Admin can view all reports
CREATE POLICY "admin_select_reports"
  ON public.feedback_reports FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Admin can update report status
CREATE POLICY "admin_update_reports"
  ON public.feedback_reports FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Admin can block users (update profiles)
CREATE POLICY "admin_update_profiles"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles AS p
      WHERE p.id = auth.uid()
      AND p.role = 'admin'
    )
  );

-- Set your admin role (run once)
UPDATE public.profiles SET role = 'admin' WHERE id IN (
  SELECT id FROM auth.users WHERE email = 'haidersiddique0909@gmail.com'
);
