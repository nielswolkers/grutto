-- Add video_url column to group_messages table
ALTER TABLE public.group_messages ADD COLUMN IF NOT EXISTS video_url TEXT;

-- Add video_url column to publications table
ALTER TABLE public.publications ADD COLUMN IF NOT EXISTS video_url TEXT;

-- Add is_pinned column to group_messages for pinning functionality (only for community posts)
ALTER TABLE public.group_messages ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN DEFAULT false;