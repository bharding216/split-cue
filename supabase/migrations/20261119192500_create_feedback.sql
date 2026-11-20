-- In-app feedback submissions from users.
CREATE TABLE public.feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  category text NOT NULL CHECK (category IN ('bug', 'idea', 'other')),
  message text NOT NULL CHECK (char_length(message) BETWEEN 1 AND 5000),
  email text,
  open_to_followup boolean NOT NULL DEFAULT false,
  app_version text,
  platform text,
  os_version text,
  device_model text,
  screen text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;

-- Authenticated users can insert their own feedback
CREATE POLICY feedback_insert_own ON public.feedback
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Anonymous users can insert feedback (user_id must be null)
CREATE POLICY feedback_insert_anon ON public.feedback
  FOR INSERT TO anon
  WITH CHECK (user_id IS NULL);

-- Users can read only their own feedback
CREATE POLICY feedback_select_own ON public.feedback
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

COMMENT ON TABLE public.feedback IS 'In-app feedback submissions from users.';
