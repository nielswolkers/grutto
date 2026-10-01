ALTER TABLE public.study_sessions
  ADD COLUMN IF NOT EXISTS is_paused boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS elapsed_seconds integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_resumed_at timestamp with time zone;

UPDATE public.study_sessions
SET last_resumed_at = started_at
WHERE last_resumed_at IS NULL;