-- Add bio column to study_groups
ALTER TABLE public.study_groups ADD COLUMN IF NOT EXISTS bio TEXT;