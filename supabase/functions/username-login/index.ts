import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { z } from 'npm:zod@3';

const schema = z.object({ username: z.string().trim().min(1).max(100), password: z.string().min(1).max(1024) });
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return reply({ error: 'Niet toegestaan' }, 405);
  try {
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) return reply({ error: 'Ongeldige inloggegevens' }, 400);
    const username = parsed.data.username.replace(/^@/, '').toLowerCase();
    if (!/^[a-z0-9_]+$/.test(username)) return reply({ error: 'Ongeldige inloggegevens' }, 401);
    const url = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    if (!url || !serviceKey || !anonKey) return reply({ error: 'Inloggen is tijdelijk niet beschikbaar' }, 503);
    const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    const hash = async (value: string) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))).map(v => v.toString(16).padStart(2, '0')).join('');
    for (const bucket of [`name:${username}`, `ip:${ip}`]) {
      const { data, error } = await admin.rpc('consume_login_attempt', { bucket_key: await hash(bucket) });
      if (error) return reply({ error: 'Inloggen is tijdelijk niet beschikbaar' }, 503);
      if (!data) return reply({ error: 'Te veel pogingen. Probeer het over 15 minuten opnieuw.' }, 429);
    }
    const { data: profiles, error: profileError } = await admin.from('profiles').select('user_id').ilike('username', username).limit(2);
    const profile = !profileError && profiles?.length === 1 ? profiles[0] : null;
    const account = profile ? await admin.auth.admin.getUserById(profile.user_id) : null;
    // Authenticate even for unknown usernames; never return the resolved email.
    const email = account?.data.user?.email || `${crypto.randomUUID()}@invalid.local`;
    const client = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await client.auth.signInWithPassword({ email, password: parsed.data.password });
    if (error || !data.session || !profile) return reply({ error: 'Ongeldige gebruikersnaam of wachtwoord' }, 401);
    return reply({ access_token: data.session.access_token, refresh_token: data.session.refresh_token });
  } catch {
    return reply({ error: 'Inloggen is tijdelijk niet beschikbaar' }, 500);
  }
});