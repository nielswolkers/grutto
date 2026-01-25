-- Create polls table
CREATE TABLE public.polls (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id UUID NOT NULL REFERENCES public.study_groups(id) ON DELETE CASCADE,
  created_by UUID NOT NULL,
  question TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create poll options table
CREATE TABLE public.poll_options (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  poll_id UUID NOT NULL REFERENCES public.polls(id) ON DELETE CASCADE,
  option_text TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

-- Create poll votes table
CREATE TABLE public.poll_votes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  poll_id UUID NOT NULL REFERENCES public.polls(id) ON DELETE CASCADE,
  option_id UUID NOT NULL REFERENCES public.poll_options(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(poll_id, user_id)
);

-- Create post/message reactions table
CREATE TABLE public.post_reactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id UUID NOT NULL REFERENCES public.group_messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  emoji TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(message_id, user_id, emoji)
);

-- Enable RLS on all tables
ALTER TABLE public.polls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.poll_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.poll_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_reactions ENABLE ROW LEVEL SECURITY;

-- Polls: Group members can view and create polls
CREATE POLICY "Members can view polls" ON public.polls
  FOR SELECT USING (
    is_group_member(auth.uid(), group_id) OR is_group_owner(auth.uid(), group_id)
  );

CREATE POLICY "Admins can create polls in public groups" ON public.polls
  FOR INSERT WITH CHECK (
    auth.uid() = created_by AND (
      is_group_owner(auth.uid(), group_id) OR 
      EXISTS (SELECT 1 FROM group_admins WHERE group_id = polls.group_id AND user_id = auth.uid()) OR
      NOT EXISTS (SELECT 1 FROM study_groups WHERE id = polls.group_id AND is_public = true)
    )
  );

CREATE POLICY "Creators can delete polls" ON public.polls
  FOR DELETE USING (auth.uid() = created_by);

-- Poll options: Members can view
CREATE POLICY "Members can view poll options" ON public.poll_options
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM polls 
      WHERE polls.id = poll_options.poll_id 
      AND (is_group_member(auth.uid(), polls.group_id) OR is_group_owner(auth.uid(), polls.group_id))
    )
  );

CREATE POLICY "Poll creators can add options" ON public.poll_options
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM polls 
      WHERE polls.id = poll_options.poll_id 
      AND polls.created_by = auth.uid()
    )
  );

-- Poll votes: Members can vote
CREATE POLICY "Members can view votes" ON public.poll_votes
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM polls 
      WHERE polls.id = poll_votes.poll_id 
      AND (is_group_member(auth.uid(), polls.group_id) OR is_group_owner(auth.uid(), polls.group_id))
    )
  );

CREATE POLICY "Members can vote" ON public.poll_votes
  FOR INSERT WITH CHECK (
    auth.uid() = user_id AND
    EXISTS (
      SELECT 1 FROM polls 
      WHERE polls.id = poll_votes.poll_id 
      AND (is_group_member(auth.uid(), polls.group_id) OR is_group_owner(auth.uid(), polls.group_id))
    )
  );

CREATE POLICY "Users can change their vote" ON public.poll_votes
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can remove their vote" ON public.poll_votes
  FOR DELETE USING (auth.uid() = user_id);

-- Post reactions: Members can react
CREATE POLICY "Members can view reactions" ON public.post_reactions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM group_messages 
      WHERE group_messages.id = post_reactions.message_id 
      AND (is_group_member(auth.uid(), group_messages.group_id) OR is_group_owner(auth.uid(), group_messages.group_id))
    )
  );

CREATE POLICY "Members can add reactions" ON public.post_reactions
  FOR INSERT WITH CHECK (
    auth.uid() = user_id AND
    EXISTS (
      SELECT 1 FROM group_messages 
      WHERE group_messages.id = post_reactions.message_id 
      AND (is_group_member(auth.uid(), group_messages.group_id) OR is_group_owner(auth.uid(), group_messages.group_id))
    )
  );

CREATE POLICY "Users can remove their reactions" ON public.post_reactions
  FOR DELETE USING (auth.uid() = user_id);