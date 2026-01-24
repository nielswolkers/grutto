-- Add is_public column to study_groups for public/private toggle
ALTER TABLE public.study_groups ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT false;

-- Add image_url, file_url, file_name columns to group_messages for posts with attachments
ALTER TABLE public.group_messages ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE public.group_messages ADD COLUMN IF NOT EXISTS file_url TEXT;
ALTER TABLE public.group_messages ADD COLUMN IF NOT EXISTS file_name TEXT;

-- Add a table to track first-time group visits for confetti
CREATE TABLE IF NOT EXISTS public.group_first_visits (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  group_id UUID NOT NULL REFERENCES public.study_groups(id) ON DELETE CASCADE,
  visited_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, group_id)
);

-- Enable RLS for group_first_visits
ALTER TABLE public.group_first_visits ENABLE ROW LEVEL SECURITY;

-- Create policy for users to manage their own visits
CREATE POLICY "Users can manage their own first visits"
ON public.group_first_visits
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);