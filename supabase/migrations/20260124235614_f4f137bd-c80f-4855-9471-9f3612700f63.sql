-- Create group_admins table to track admin status (separate from group_members)
CREATE TABLE public.group_admins (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    group_id UUID NOT NULL REFERENCES public.study_groups(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE (group_id, user_id)
);

-- Create group_admin_requests table for admin request flow
CREATE TABLE public.group_admin_requests (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    group_id UUID NOT NULL REFERENCES public.study_groups(id) ON DELETE CASCADE,
    requester_id UUID NOT NULL,
    target_admin_id UUID NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    responded_at TIMESTAMP WITH TIME ZONE
);

-- Enable RLS
ALTER TABLE public.group_admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_admin_requests ENABLE ROW LEVEL SECURITY;

-- RLS for group_admins
CREATE POLICY "Anyone can view group admins" ON public.group_admins 
FOR SELECT USING (true);

CREATE POLICY "Group owners can manage admins" ON public.group_admins 
FOR ALL USING (
    EXISTS (
        SELECT 1 FROM public.study_groups 
        WHERE study_groups.id = group_admins.group_id 
        AND study_groups.owner_id = auth.uid()
    )
);

CREATE POLICY "Existing admins can add admins" ON public.group_admins 
FOR INSERT WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.group_admins ga 
        WHERE ga.group_id = group_admins.group_id 
        AND ga.user_id = auth.uid()
    )
    OR
    EXISTS (
        SELECT 1 FROM public.study_groups 
        WHERE study_groups.id = group_admins.group_id 
        AND study_groups.owner_id = auth.uid()
    )
);

-- RLS for group_admin_requests
CREATE POLICY "Requesters can create requests" ON public.group_admin_requests 
FOR INSERT WITH CHECK (auth.uid() = requester_id);

CREATE POLICY "Involved parties can view requests" ON public.group_admin_requests 
FOR SELECT USING (
    auth.uid() = requester_id 
    OR auth.uid() = target_admin_id
    OR EXISTS (
        SELECT 1 FROM public.study_groups 
        WHERE study_groups.id = group_admin_requests.group_id 
        AND study_groups.owner_id = auth.uid()
    )
);

CREATE POLICY "Target admins can update requests" ON public.group_admin_requests 
FOR UPDATE USING (
    auth.uid() = target_admin_id
    OR EXISTS (
        SELECT 1 FROM public.study_groups 
        WHERE study_groups.id = group_admin_requests.group_id 
        AND study_groups.owner_id = auth.uid()
    )
);

CREATE POLICY "Requesters can delete their requests" ON public.group_admin_requests 
FOR DELETE USING (auth.uid() = requester_id);

-- Add RLS policy for study_groups to allow public groups to be viewable by everyone
DROP POLICY IF EXISTS "Users can view groups they own or are members of" ON public.study_groups;

CREATE POLICY "Users can view their groups or public groups" ON public.study_groups 
FOR SELECT USING (
    auth.uid() = owner_id 
    OR is_group_member(auth.uid(), id)
    OR is_public = true
);