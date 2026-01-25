-- Create group_message_comments table for comments on group posts
CREATE TABLE public.group_message_comments (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    message_id UUID NOT NULL REFERENCES public.group_messages(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.group_message_comments ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Members can view comments on group messages" ON public.group_message_comments 
FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM public.group_messages gm
        WHERE gm.id = group_message_comments.message_id
        AND (is_group_member(auth.uid(), gm.group_id) OR is_group_owner(auth.uid(), gm.group_id))
    )
);

CREATE POLICY "Members can create comments" ON public.group_message_comments 
FOR INSERT WITH CHECK (
    auth.uid() = user_id 
    AND EXISTS (
        SELECT 1 FROM public.group_messages gm
        WHERE gm.id = group_message_comments.message_id
        AND (is_group_member(auth.uid(), gm.group_id) OR is_group_owner(auth.uid(), gm.group_id))
    )
);

CREATE POLICY "Users can delete their own comments" ON public.group_message_comments 
FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own comments" ON public.group_message_comments 
FOR UPDATE USING (auth.uid() = user_id);