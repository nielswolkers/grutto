
-- 1. Tighten follows SELECT to authenticated
DROP POLICY IF EXISTS "Anyone can view follows" ON public.follows;
CREATE POLICY "Authenticated users can view follows"
ON public.follows FOR SELECT TO authenticated USING (true);

-- 2. Tighten publications + comments SELECT to authenticated
DROP POLICY IF EXISTS "Anyone can view publications" ON public.publications;
CREATE POLICY "Authenticated users can view publications"
ON public.publications FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Anyone can view comments" ON public.publication_comments;
CREATE POLICY "Authenticated users can view comments"
ON public.publication_comments FOR SELECT TO authenticated USING (true);

-- 3. group_admins: only owners can add admins (remove self-promotion)
DROP POLICY IF EXISTS "Existing admins can add admins" ON public.group_admins;
CREATE POLICY "Only owners can add admins"
ON public.group_admins FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.study_groups
    WHERE study_groups.id = group_admins.group_id
      AND study_groups.owner_id = auth.uid()
  )
);

-- 4. polls: explicit membership/admin check, no negated existence
DROP POLICY IF EXISTS "Admins can create polls in public groups" ON public.polls;
CREATE POLICY "Owners or admins can create polls"
ON public.polls FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = created_by
  AND EXISTS (SELECT 1 FROM public.study_groups sg WHERE sg.id = polls.group_id)
  AND (
    public.is_group_owner(auth.uid(), group_id)
    OR EXISTS (
      SELECT 1 FROM public.group_admins
      WHERE group_admins.group_id = polls.group_id
        AND group_admins.user_id = auth.uid()
    )
  )
);

-- 5. Lock down SECURITY DEFINER function EXECUTE from anon/authenticated.
-- RLS evaluation uses these via SECURITY DEFINER context; direct API exposure isn't needed.
REVOKE EXECUTE ON FUNCTION public.is_group_owner(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_group_member(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;

-- 6. Realtime channel authorization: restrict subscriptions to authenticated users
-- (Prevents anon from subscribing to channels; broadcast/presence still gated by app logic.)
ALTER TABLE IF EXISTS realtime.messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated can receive realtime" ON realtime.messages;
CREATE POLICY "Authenticated can receive realtime"
ON realtime.messages FOR SELECT TO authenticated USING (true);
