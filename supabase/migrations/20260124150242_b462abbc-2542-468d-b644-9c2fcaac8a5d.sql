-- Add banner_url column to study_groups table for group banner images
ALTER TABLE public.study_groups 
ADD COLUMN IF NOT EXISTS banner_url text DEFAULT NULL;