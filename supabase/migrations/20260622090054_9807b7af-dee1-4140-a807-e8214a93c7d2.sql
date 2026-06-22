CREATE POLICY "Group members can view owner study sessions"
ON public.study_sessions
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.study_groups sg
    JOIN public.group_members gm ON gm.group_id = sg.id
    WHERE sg.owner_id = study_sessions.user_id
      AND gm.user_id = auth.uid()
      AND gm.status = 'accepted'
  )
);