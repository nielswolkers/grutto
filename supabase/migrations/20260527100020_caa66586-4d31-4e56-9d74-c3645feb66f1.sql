DROP POLICY IF EXISTS "Users can view their groups or public groups" ON public.study_groups;

CREATE POLICY "Users can view their groups or public groups"
ON public.study_groups
FOR SELECT
TO authenticated
USING (
  (auth.uid() = owner_id)
  OR is_group_member(auth.uid(), id)
  OR (is_public = true)
);

REVOKE SELECT ON public.study_groups FROM anon;