-- Create group_stories table for private group updates/stories
CREATE TABLE public.group_stories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id UUID NOT NULL REFERENCES public.study_groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  image_url TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create story_views table to track which stories have been viewed
CREATE TABLE public.story_views (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  story_id UUID NOT NULL REFERENCES public.group_stories(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  viewed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(story_id, user_id)
);

-- Enable RLS
ALTER TABLE public.group_stories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.story_views ENABLE ROW LEVEL SECURITY;

-- Stories policies
CREATE POLICY "Group members can view stories"
ON public.group_stories FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM study_groups WHERE id = group_id AND owner_id = auth.uid()
  ) OR EXISTS (
    SELECT 1 FROM group_members WHERE group_id = group_stories.group_id AND user_id = auth.uid() AND status = 'accepted'
  )
);

CREATE POLICY "Group members can create stories"
ON public.group_stories FOR INSERT
WITH CHECK (
  auth.uid() = user_id AND (
    EXISTS (
      SELECT 1 FROM study_groups WHERE id = group_id AND owner_id = auth.uid()
    ) OR EXISTS (
      SELECT 1 FROM group_members WHERE group_id = group_stories.group_id AND user_id = auth.uid() AND status = 'accepted'
    )
  )
);

CREATE POLICY "Users can delete own stories"
ON public.group_stories FOR DELETE
USING (auth.uid() = user_id);

-- Story views policies
CREATE POLICY "Users can view story_views"
ON public.story_views FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create story_views"
ON public.story_views FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Enable realtime for stories
ALTER PUBLICATION supabase_realtime ADD TABLE public.group_stories;