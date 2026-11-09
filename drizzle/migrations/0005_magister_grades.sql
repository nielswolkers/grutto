CREATE TABLE public.magister_connections (
  user_id uuid PRIMARY KEY,
  refresh_token text,
  selected_year_ids bigint[] NOT NULL DEFAULT '{}',
  last_synced_at timestamptz,
  connected_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.magister_connections TO authenticated;
GRANT ALL ON public.magister_connections TO service_role;
ALTER TABLE public.magister_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own magister connection" ON public.magister_connections FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.magister_years (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  year_id bigint NOT NULL,
  label text NOT NULL,
  begin_date text,
  end_date text,
  grades jsonb NOT NULL DEFAULT '[]',
  course_averages jsonb NOT NULL DEFAULT '[]',
  attendance jsonb NOT NULL DEFAULT '{}',
  synced_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, year_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.magister_years TO authenticated;
GRANT ALL ON public.magister_years TO service_role;
ALTER TABLE public.magister_years ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own magister years" ON public.magister_years FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);