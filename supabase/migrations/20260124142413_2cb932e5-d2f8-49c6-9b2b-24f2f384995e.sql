-- Create publications table for public posts (like LinkedIn publications)
CREATE TABLE public.publications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  content TEXT,
  image_url TEXT,
  file_url TEXT,
  file_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.publications ENABLE ROW LEVEL SECURITY;

-- Everyone can view all publications (public)
CREATE POLICY "Anyone can view publications"
ON public.publications
FOR SELECT
USING (true);

-- Users can create their own publications
CREATE POLICY "Users can create their own publications"
ON public.publications
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Users can update their own publications
CREATE POLICY "Users can update their own publications"
ON public.publications
FOR UPDATE
USING (auth.uid() = user_id);

-- Users can delete their own publications
CREATE POLICY "Users can delete their own publications"
ON public.publications
FOR DELETE
USING (auth.uid() = user_id);

-- Add trigger for updated_at
CREATE TRIGGER update_publications_updated_at
BEFORE UPDATE ON public.publications
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Add realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.publications;

-- Fix group_members RLS policy to allow all members to see each other
DROP POLICY IF EXISTS "Users can view members of groups they belong to" ON public.group_members;

CREATE POLICY "Group members and owners can view all members"
ON public.group_members
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM study_groups sg
    WHERE sg.id = group_members.group_id
    AND (sg.owner_id = auth.uid() OR is_group_member(auth.uid(), sg.id))
  )
);