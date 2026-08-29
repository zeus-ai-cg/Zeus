-- ============================================================================
-- Zeus AI v1.5 — Feedback & Community Showcase
-- Single migration: tables, RLS policies, storage bucket, indexes
-- ============================================================================

-- 1. FEEDBACK — core review/feedback table
CREATE TABLE IF NOT EXISTS public.feedback (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title       TEXT,
  body        TEXT NOT NULL,
  rating      SMALLINT NOT NULL CHECK (rating >= 1 AND rating <= 5),
  category    TEXT NOT NULL DEFAULT 'general'
              CHECK (category IN (
                'general','chat','engineer','memory','skills',
                'desktop','vscode','billing','performance','other'
              )),
  visibility  TEXT NOT NULL DEFAULT 'public'
              CHECK (visibility IN ('public','private')),
  status      TEXT NOT NULL DEFAULT 'published'
              CHECK (status IN ('published','hidden','deleted')),
  helpful_count INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_feedback_user_id ON public.feedback(user_id);
CREATE INDEX IF NOT EXISTS idx_feedback_visibility ON public.feedback(visibility, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_category ON public.feedback(category, visibility, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_rating ON public.feedback(rating, visibility, created_at DESC);

-- 2. FEEDBACK ATTACHMENTS — images/files attached to feedback
CREATE TABLE IF NOT EXISTS public.feedback_attachments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feedback_id   UUID NOT NULL REFERENCES public.feedback(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  storage_path  TEXT NOT NULL,
  file_name     TEXT NOT NULL,
  mime_type     TEXT NOT NULL,
  file_size     INT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_feedback_attachments_feedback ON public.feedback_attachments(feedback_id);

-- 3. FEEDBACK PROJECTS — project/work showcase attached to feedback
CREATE TABLE IF NOT EXISTS public.feedback_projects (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feedback_id       UUID NOT NULL REFERENCES public.feedback(id) ON DELETE CASCADE,
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id        UUID NOT NULL REFERENCES public.workspace_projects(id) ON DELETE CASCADE,
  title             TEXT NOT NULL,
  description       TEXT,
  preview_metadata  JSONB DEFAULT '{}',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_feedback_projects_feedback ON public.feedback_projects(feedback_id);

-- 4. PUBLIC FEEDBACK CONVERSATIONS — sanitized snapshots of shared conversations
CREATE TABLE IF NOT EXISTS public.public_feedback_conversations (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feedback_id       UUID NOT NULL REFERENCES public.feedback(id) ON DELETE CASCADE,
  created_by        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title             TEXT,
  message_count     INT NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pfc_feedback ON public.public_feedback_conversations(feedback_id);

-- 5. PUBLIC FEEDBACK MESSAGES — individual messages in a shared conversation
CREATE TABLE IF NOT EXISTS public.public_feedback_messages (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  public_conversation_id  UUID NOT NULL REFERENCES public.public_feedback_conversations(id) ON DELETE CASCADE,
  role                    TEXT NOT NULL CHECK (role IN ('user','assistant')),
  content                 TEXT NOT NULL,
  display_order           INT NOT NULL DEFAULT 0,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pfm_conversation ON public.public_feedback_messages(public_conversation_id, display_order);

-- 6. FEEDBACK VOTES — helpful/upvote system
CREATE TABLE IF NOT EXISTS public.feedback_votes (
  feedback_id  UUID NOT NULL REFERENCES public.feedback(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (feedback_id, user_id)
);

-- 7. FEEDBACK REPORTS — moderation reports
CREATE TABLE IF NOT EXISTS public.feedback_reports (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feedback_id       UUID NOT NULL REFERENCES public.feedback(id) ON DELETE CASCADE,
  reporter_user_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason            TEXT NOT NULL
                    CHECK (reason IN (
                      'spam','harassment','personal_info','malicious',
                      'copyright','sensitive_info','other'
                    )),
  details           TEXT,
  status            TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','reviewed','resolved','dismissed')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_feedback_reports_feedback ON public.feedback_reports(feedback_id);
CREATE INDEX IF NOT EXISTS idx_feedback_reports_status ON public.feedback_reports(status, created_at DESC);

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feedback_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feedback_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.public_feedback_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.public_feedback_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feedback_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feedback_reports ENABLE ROW LEVEL SECURITY;

-- FEEDBACK policies
CREATE POLICY "feedback_insert_own"
  ON public.feedback FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "feedback_select_public"
  ON public.feedback FOR SELECT
  USING (visibility = 'public' AND status = 'published');

CREATE POLICY "feedback_select_own"
  ON public.feedback FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "feedback_update_own"
  ON public.feedback FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "feedback_delete_own"
  ON public.feedback FOR DELETE
  USING (auth.uid() = user_id);

-- FEEDBACK ATTACHMENTS policies
CREATE POLICY "feedback_attachments_insert_own"
  ON public.feedback_attachments FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "feedback_attachments_select_public"
  ON public.feedback_attachments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.feedback f
      WHERE f.id = feedback_attachments.feedback_id
        AND f.visibility = 'public' AND f.status = 'published'
    )
  );

CREATE POLICY "feedback_attachments_select_own"
  ON public.feedback_attachments FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "feedback_attachments_delete_own"
  ON public.feedback_attachments FOR DELETE
  USING (auth.uid() = user_id);

-- FEEDBACK PROJECTS policies
CREATE POLICY "feedback_projects_insert_own"
  ON public.feedback_projects FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "feedback_projects_select_public"
  ON public.feedback_projects FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.feedback f
      WHERE f.id = feedback_projects.feedback_id
        AND f.visibility = 'public' AND f.status = 'published'
    )
  );

CREATE POLICY "feedback_projects_select_own"
  ON public.feedback_projects FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "feedback_projects_delete_own"
  ON public.feedback_projects FOR DELETE
  USING (auth.uid() = user_id);

-- PUBLIC FEEDBACK CONVERSATIONS policies
CREATE POLICY "pfc_insert_own"
  ON public.public_feedback_conversations FOR INSERT
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "pfc_select_public"
  ON public.public_feedback_conversations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.feedback f
      WHERE f.id = public_feedback_conversations.feedback_id
        AND f.visibility = 'public' AND f.status = 'published'
    )
  );

CREATE POLICY "pfc_select_own"
  ON public.public_feedback_conversations FOR SELECT
  USING (auth.uid() = created_by);

CREATE POLICY "pfc_delete_own"
  ON public.public_feedback_conversations FOR DELETE
  USING (auth.uid() = created_by);

-- PUBLIC FEEDBACK MESSAGES policies
CREATE POLICY "pfm_insert_own"
  ON public.public_feedback_messages FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.public_feedback_conversations pfc
      WHERE pfc.id = public_feedback_messages.public_conversation_id
        AND pfc.created_by = auth.uid()
    )
  );

CREATE POLICY "pfm_select_public"
  ON public.public_feedback_messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.public_feedback_conversations pfc
      JOIN public.feedback f ON f.id = pfc.feedback_id
      WHERE pfc.id = public_feedback_messages.public_conversation_id
        AND f.visibility = 'public' AND f.status = 'published'
    )
  );

CREATE POLICY "pfm_select_own"
  ON public.public_feedback_messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.public_feedback_conversations pfc
      WHERE pfc.id = public_feedback_messages.public_conversation_id
        AND pfc.created_by = auth.uid()
    )
  );

-- FEEDBACK VOTES policies
CREATE POLICY "feedback_votes_insert_own"
  ON public.feedback_votes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "feedback_votes_select_public"
  ON public.feedback_votes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.feedback f
      WHERE f.id = feedback_votes.feedback_id
        AND f.visibility = 'public' AND f.status = 'published'
    )
  );

CREATE POLICY "feedback_votes_select_own"
  ON public.feedback_votes FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "feedback_votes_delete_own"
  ON public.feedback_votes FOR DELETE
  USING (auth.uid() = user_id);

-- FEEDBACK REPORTS policies
CREATE POLICY "feedback_reports_insert_own"
  ON public.feedback_reports FOR INSERT
  WITH CHECK (auth.uid() = reporter_user_id);

CREATE POLICY "feedback_reports_select_own"
  ON public.feedback_reports FOR SELECT
  USING (auth.uid() = reporter_user_id);

-- ============================================================================
-- TRIGGER: auto-update updated_at on feedback
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_feedback_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_feedback_updated_at
  BEFORE UPDATE ON public.feedback
  FOR EACH ROW
  EXECUTE FUNCTION public.update_feedback_updated_at();

-- ============================================================================
-- FUNCTION: atomically toggle vote and update helpful_count
-- ============================================================================

CREATE OR REPLACE FUNCTION public.toggle_feedback_vote(
  p_feedback_id UUID,
  p_user_id UUID
)
RETURNS JSONB AS $$
DECLARE
  v_exists BOOLEAN;
  v_new_count INT;
BEGIN
  -- Check if vote exists
  SELECT EXISTS(
    SELECT 1 FROM public.feedback_votes
    WHERE feedback_id = p_feedback_id AND user_id = p_user_id
  ) INTO v_exists;

  IF v_exists THEN
    -- Remove vote
    DELETE FROM public.feedback_votes
    WHERE feedback_id = p_feedback_id AND user_id = p_user_id;
  ELSE
    -- Add vote
    INSERT INTO public.feedback_votes (feedback_id, user_id)
    VALUES (p_feedback_id, p_user_id);
  END IF;

  -- Update count atomically
  UPDATE public.feedback
  SET helpful_count = (
    SELECT COUNT(*)::INT FROM public.feedback_votes
    WHERE feedback_id = p_feedback_id
  )
  WHERE id = p_feedback_id
  RETURNING helpful_count INTO v_new_count;

  RETURN jsonb_build_object(
    'voted', NOT v_exists,
    'helpful_count', v_new_count
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
   SET search_path = public;

-- ============================================================================
-- STORAGE BUCKET for feedback attachments
-- ============================================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('feedback-attachments', 'feedback-attachments', false)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS policies
CREATE POLICY "feedback_storage_insert_auth"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'feedback-attachments'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "feedback_storage_select_public"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'feedback-attachments'
  );

CREATE POLICY "feedback_storage_delete_own"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'feedback-attachments'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
