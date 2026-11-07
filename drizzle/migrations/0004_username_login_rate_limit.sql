CREATE TABLE public.login_rate_limits (key text PRIMARY KEY, window_started_at timestamptz NOT NULL DEFAULT now(), attempts integer NOT NULL DEFAULT 1);
GRANT ALL ON public.login_rate_limits TO service_role;
ALTER TABLE public.login_rate_limits ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.consume_login_attempt(bucket_key text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE attempt_count integer;
BEGIN
INSERT INTO public.login_rate_limits AS limits (key) VALUES (bucket_key)
ON CONFLICT (key) DO UPDATE SET attempts = CASE WHEN limits.window_started_at < now() - interval '15 minutes' THEN 1 ELSE limits.attempts + 1 END, window_started_at = CASE WHEN limits.window_started_at < now() - interval '15 minutes' THEN now() ELSE limits.window_started_at END
RETURNING attempts INTO attempt_count;
RETURN attempt_count <= 10;
END; $$;
REVOKE ALL ON FUNCTION public.consume_login_attempt(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_login_attempt(text) TO service_role;