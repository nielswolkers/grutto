-- Restore execute rights so RLS policies calling these helpers no longer fail
GRANT EXECUTE ON FUNCTION public.is_group_member(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_group_owner(uuid, uuid) TO authenticated, service_role;

-- Track which subject (vak) a study session belongs to
ALTER TABLE public.study_sessions
  ADD COLUMN IF NOT EXISTS subject_id uuid,
  ADD COLUMN IF NOT EXISTS subject_name text;

CREATE INDEX IF NOT EXISTS study_sessions_subject_id_idx ON public.study_sessions (subject_id);

GRANT SELECT, INSERT, UPDATE ON public.study_sessions TO authenticated;
GRANT ALL ON public.study_sessions TO service_role;