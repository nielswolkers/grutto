import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';

export default function ResetPassword() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    const recoveryHash = new URLSearchParams(window.location.hash.slice(1)).get('type') === 'recovery';
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setReady(true);
    });
    if (recoveryHash) supabase.auth.getUser().then(({ data }) => setReady(!!data.user));
    return () => subscription.unsubscribe();
  }, []);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (password !== confirmation) { toast.error('De wachtwoorden komen niet overeen'); return; }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Je wachtwoord is gewijzigd');
    navigate('/dashboard', { replace: true });
  };
  return <div className="min-h-screen bg-background flex items-center justify-center p-4">
    <Card className="w-full max-w-md"><CardHeader><CardTitle>Wachtwoord herstellen</CardTitle></CardHeader><CardContent>
      {ready ? <form onSubmit={submit} className="space-y-4">
        <Input aria-label="Nieuw wachtwoord" placeholder="Nieuw wachtwoord" type="password" autoComplete="new-password" minLength={6} required value={password} onChange={e => setPassword(e.target.value)} />
        <Input aria-label="Herhaal nieuw wachtwoord" placeholder="Herhaal nieuw wachtwoord" type="password" autoComplete="new-password" minLength={6} required value={confirmation} onChange={e => setConfirmation(e.target.value)} />
        <Button type="submit" disabled={loading} className="w-full">{loading ? 'Opslaan…' : 'Wachtwoord opslaan'}</Button>
      </form> : <div className="space-y-4"><p className="text-muted-foreground">Open de herstel-link uit je e-mail. Is de link verlopen? Vraag een nieuwe aan.</p><Button onClick={() => navigate('/auth?reset=1')}>Nieuwe herstel-link aanvragen</Button></div>}
    </CardContent></Card>
  </div>;
}