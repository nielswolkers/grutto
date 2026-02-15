
-- Subjects (Vakken) table
CREATE TABLE public.subjects (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  emoji TEXT DEFAULT '📚',
  color TEXT DEFAULT '#4CAF50',
  sort_order INT DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own subjects" ON public.subjects FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own subjects" ON public.subjects FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own subjects" ON public.subjects FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own subjects" ON public.subjects FOR DELETE USING (auth.uid() = user_id);

-- Lessons (Lessen) table - folders within subjects
CREATE TABLE public.lessons (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  subject_id UUID NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.lessons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own lessons" ON public.lessons FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own lessons" ON public.lessons FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own lessons" ON public.lessons FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own lessons" ON public.lessons FOR DELETE USING (auth.uid() = user_id);

-- Lesson items (files, youtube links, notes within a lesson)
CREATE TABLE public.lesson_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  lesson_id UUID NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL CHECK (item_type IN ('file', 'youtube', 'note')),
  title TEXT NOT NULL,
  content TEXT,
  youtube_url TEXT,
  file_id UUID REFERENCES public.files(id) ON DELETE SET NULL,
  storage_url TEXT,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.lesson_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own lesson items" ON public.lesson_items FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own lesson items" ON public.lesson_items FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own lesson items" ON public.lesson_items FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own lesson items" ON public.lesson_items FOR DELETE USING (auth.uid() = user_id);

-- Add triggers for updated_at
CREATE TRIGGER update_subjects_updated_at BEFORE UPDATE ON public.subjects FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_lessons_updated_at BEFORE UPDATE ON public.lessons FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_lesson_items_updated_at BEFORE UPDATE ON public.lesson_items FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
