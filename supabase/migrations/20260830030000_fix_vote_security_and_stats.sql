-- Fix SECURITY DEFINER on toggle_feedback_vote — add auth.uid() validation
-- Also add a function for server-side rating stats

-- Drop and recreate the vote function with auth check
DROP FUNCTION IF EXISTS public.toggle_feedback_vote(uuid, uuid);

CREATE OR REPLACE FUNCTION public.toggle_feedback_vote(
  p_feedback_id uuid,
  p_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Security: only allow voting as yourself
  IF p_user_id != auth.uid() THEN
    RAISE EXCEPTION 'Cannot vote on behalf of another user';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.feedback_votes
    WHERE feedback_id = p_feedback_id AND user_id = p_user_id
  ) THEN
    DELETE FROM public.feedback_votes
    WHERE feedback_id = p_feedback_id AND user_id = p_user_id;

    UPDATE public.feedback
    SET helpful_count = GREATEST(0, helpful_count - 1)
    WHERE id = p_feedback_id;
  ELSE
    INSERT INTO public.feedback_votes (feedback_id, user_id)
    VALUES (p_feedback_id, p_user_id);

    UPDATE public.feedback
    SET helpful_count = helpful_count + 1
    WHERE id = p_feedback_id;
  END IF;
END;
$$;

-- Server-side rating stats function (returns accurate totals without loading all rows)
CREATE OR REPLACE FUNCTION public.get_feedback_stats()
RETURNS TABLE(
  total_count bigint,
  avg_rating numeric,
  count_1 bigint,
  count_2 bigint,
  count_3 bigint,
  count_4 bigint,
  count_5 bigint
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    COUNT(*) as total_count,
    COALESCE(AVG(rating), 0) as avg_rating,
    COUNT(*) FILTER (WHERE rating = 1) as count_1,
    COUNT(*) FILTER (WHERE rating = 2) as count_2,
    COUNT(*) FILTER (WHERE rating = 3) as count_3,
    COUNT(*) FILTER (WHERE rating = 4) as count_4,
    COUNT(*) FILTER (WHERE rating = 5) as count_5
  FROM public.feedback
  WHERE visibility = 'public' AND status = 'published';
$$;

-- Function to check if user has voted on a feedback item
CREATE OR REPLACE FUNCTION public.has_user_voted(
  p_feedback_id uuid,
  p_user_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.feedback_votes
    WHERE feedback_id = p_feedback_id AND user_id = p_user_id
  );
$$;
