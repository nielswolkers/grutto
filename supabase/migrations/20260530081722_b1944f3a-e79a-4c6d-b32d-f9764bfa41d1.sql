
-- ============ STUDY SETS ============
CREATE TABLE public.study_sets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  emoji TEXT DEFAULT '📚',
  color TEXT DEFAULT 'indigo',
  subject_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.study_sets TO authenticated;
GRANT ALL ON public.study_sets TO service_role;

ALTER TABLE public.study_sets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can view study sets"
ON public.study_sets FOR SELECT TO authenticated USING (true);

CREATE POLICY "Owner can insert"
ON public.study_sets FOR INSERT TO authenticated WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Owner can update"
ON public.study_sets FOR UPDATE TO authenticated USING (auth.uid() = owner_id);

CREATE POLICY "Owner can delete"
ON public.study_sets FOR DELETE TO authenticated USING (auth.uid() = owner_id);

CREATE TRIGGER update_study_sets_updated_at
BEFORE UPDATE ON public.study_sets
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ STUDY CARDS ============
CREATE TABLE public.study_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  set_id UUID NOT NULL REFERENCES public.study_sets(id) ON DELETE CASCADE,
  term TEXT NOT NULL,
  definition TEXT NOT NULL,
  position INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_study_cards_set ON public.study_cards(set_id, position);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.study_cards TO authenticated;
GRANT ALL ON public.study_cards TO service_role;

ALTER TABLE public.study_cards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can view cards"
ON public.study_cards FOR SELECT TO authenticated USING (true);

CREATE POLICY "Owner can insert cards"
ON public.study_cards FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.study_sets s WHERE s.id = set_id AND s.owner_id = auth.uid()));

CREATE POLICY "Owner can update cards"
ON public.study_cards FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.study_sets s WHERE s.id = set_id AND s.owner_id = auth.uid()));

CREATE POLICY "Owner can delete cards"
ON public.study_cards FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM public.study_sets s WHERE s.id = set_id AND s.owner_id = auth.uid()));

-- ============ STUDY SET LIBRARY ============
CREATE TABLE public.study_set_library (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  set_id UUID NOT NULL REFERENCES public.study_sets(id) ON DELETE CASCADE,
  subject_id UUID,
  last_studied TIMESTAMPTZ,
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, set_id)
);

CREATE INDEX idx_lib_user ON public.study_set_library(user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.study_set_library TO authenticated;
GRANT ALL ON public.study_set_library TO service_role;

ALTER TABLE public.study_set_library ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own library"
ON public.study_set_library FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users add to own library"
ON public.study_set_library FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own library"
ON public.study_set_library FOR UPDATE TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users delete from own library"
ON public.study_set_library FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Trigger: auto-add owner to library when set is created
CREATE OR REPLACE FUNCTION public.add_owner_to_library()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.study_set_library (user_id, set_id, subject_id)
  VALUES (NEW.owner_id, NEW.id, NEW.subject_id)
  ON CONFLICT (user_id, set_id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_add_owner_to_library
AFTER INSERT ON public.study_sets
FOR EACH ROW EXECUTE FUNCTION public.add_owner_to_library();

-- ============ SCHOLAR THREADS ============
CREATE TABLE public.scholar_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  title TEXT NOT NULL DEFAULT 'Nieuw gesprek',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_scholar_threads_user ON public.scholar_threads(user_id, updated_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.scholar_threads TO authenticated;
GRANT ALL ON public.scholar_threads TO service_role;

ALTER TABLE public.scholar_threads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own threads" ON public.scholar_threads FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users create own threads" ON public.scholar_threads FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own threads" ON public.scholar_threads FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users delete own threads" ON public.scholar_threads FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER update_scholar_threads_updated_at
BEFORE UPDATE ON public.scholar_threads
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ SCHOLAR MESSAGES ============
CREATE TABLE public.scholar_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL REFERENCES public.scholar_threads(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  parts JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_scholar_messages_thread ON public.scholar_messages(thread_id, created_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.scholar_messages TO authenticated;
GRANT ALL ON public.scholar_messages TO service_role;

ALTER TABLE public.scholar_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read messages of own threads" ON public.scholar_messages FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.scholar_threads t WHERE t.id = thread_id AND t.user_id = auth.uid()));

CREATE POLICY "Users insert messages in own threads" ON public.scholar_messages FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.scholar_threads t WHERE t.id = thread_id AND t.user_id = auth.uid()));

CREATE POLICY "Users delete messages of own threads" ON public.scholar_messages FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM public.scholar_threads t WHERE t.id = thread_id AND t.user_id = auth.uid()));
