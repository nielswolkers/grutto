import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from '@/hooks/use-toast';
import gruttoLogo from '@/assets/grutto-logo.png';

function safeNext(raw: string | null): string | null {
  if (!raw) return null;
  if (!raw.startsWith('/') || raw.startsWith('//')) return null;
  return raw;
}

export default function Auth() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const nextPath = safeNext(searchParams.get('next'));
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [schoolName, setSchoolName] = useState('');
  const [loading, setLoading] = useState(false);
  const [usernameError, setUsernameError] = useState('');
  const [forgotPassword, setForgotPassword] = useState(searchParams.get('reset') === '1');
  const [resetSent, setResetSent] = useState(false);

  useEffect(() => {
    const checkUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user && !forgotPassword) {
        if (nextPath) window.location.href = nextPath;
        else navigate('/dashboard');
      }
    };
    checkUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session && !forgotPassword && event !== 'PASSWORD_RECOVERY') {
        if (nextPath) window.location.href = nextPath;
        else navigate('/dashboard');
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate, nextPath, forgotPassword]);

  const checkUsernameAvailability = async (usernameToCheck: string): Promise<boolean> => {
    if (!usernameToCheck || usernameToCheck.length < 3) {
      setUsernameError('Gebruikersnaam moet minimaal 3 tekens bevatten');
      return false;
    }

    const usernameRegex = /^[a-zA-Z0-9_]+$/;
    if (!usernameRegex.test(usernameToCheck)) {
      setUsernameError('Alleen letters, cijfers en underscores toegestaan');
      return false;
    }

    const { data, error } = await supabase
      .from('profiles')
      .select('username')
      .eq('username', usernameToCheck.toLowerCase())
      .maybeSingle();

    if (error) {
      console.error('Error checking username:', error);
      return false;
    }

    if (data) {
      setUsernameError('Deze gebruikersnaam is al in gebruik');
      return false;
    }

    setUsernameError('');
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (forgotPassword) {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw error;
        setResetSent(true);
        return;
      }
      if (isLogin) {
        if (email.trim().includes('@') && !email.trim().startsWith('@')) {
          const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
          if (error) throw error;
        } else {
          const { data, error } = await supabase.functions.invoke('username-login', { body: { username: email.trim(), password } });
          if (error || data?.error || !data?.access_token || !data?.refresh_token) throw new Error(data?.error || 'Ongeldige gebruikersnaam of wachtwoord');
          const { error: sessionError } = await supabase.auth.setSession({ access_token: data.access_token, refresh_token: data.refresh_token });
          if (sessionError) throw sessionError;
        }
        toast({ title: 'Welkom terug!', description: 'Je bent succesvol ingelogd.' });
      } else {
        // Validate username availability
        const isUsernameAvailable = await checkUsernameAvailability(username);
        if (!isUsernameAvailable) {
          setLoading(false);
          return;
        }

        // Sign up user
        const { data: authData, error: authError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: {
              full_name: fullName,
              username: username.toLowerCase(),
              school_name: schoolName || null,
            },
          },
        });
        if (authError) throw authError;

        // Create profile
        if (authData.user) {
          const { error: profileError } = await supabase.from('profiles').insert({
            user_id: authData.user.id,
            full_name: fullName,
            username: username.toLowerCase(),
            display_name: fullName.split(' ')[0],
          });

          if (profileError) {
            console.error('Profile creation error:', profileError);
          }
        }

        toast({ title: 'Account aangemaakt!', description: authData.session ? 'Je bent succesvol geregistreerd.' : 'Controleer je e-mail om je account te bevestigen.' });
      }
    } catch (error: any) {
      let message = error.message;
      if (error.message?.includes('User already registered')) {
        message = 'Dit e-mailadres is al geregistreerd. Probeer in te loggen.';
      } else if (error.message?.includes('Invalid login credentials')) {
        message = 'Ongeldige inloggegevens. Controleer je e-mail of gebruikersnaam en wachtwoord.';
      }
      toast({ title: 'Fout', description: message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <img src={gruttoLogo} alt="Grutto" className="h-10 w-auto mx-auto mb-4" />
          <CardTitle>{forgotPassword ? 'Wachtwoord vergeten' : isLogin ? 'Inloggen' : 'Registreren'}</CardTitle>
          <CardDescription>
            {forgotPassword ? 'Ontvang een herstel-link op het e-mailadres van je account' : isLogin 
              ? 'Voer je gegevens in om in te loggen'
              : 'Maak een nieuw account aan'
            }
          </CardDescription>
        </CardHeader>
        <CardContent>
          {resetSent ? <p className="text-sm">Als dit e-mailadres bij een account hoort, ontvang je een herstel-link. Controleer ook je spamfolder.</p> : <form onSubmit={handleSubmit} className="space-y-4">
            {!isLogin && !forgotPassword && (
              <>
                <div>
                  <Input
                    type="text"
                    placeholder="Volledige naam"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <Input
                    type="text"
                    placeholder="Gebruikersnaam"
                    value={username}
                    onChange={(e) => {
                      setUsername(e.target.value);
                      setUsernameError('');
                    }}
                    onBlur={() => username && checkUsernameAvailability(username)}
                    required
                    className={usernameError ? 'border-destructive' : ''}
                  />
                  {usernameError && (
                    <p className="text-sm text-destructive mt-1">{usernameError}</p>
                  )}
                </div>
                <div>
                  <Input
                    type="text"
                    placeholder="School naam (optioneel)"
                    value={schoolName}
                    onChange={(e) => setSchoolName(e.target.value)}
                  />
                </div>
              </>
            )}
            <div>
              <Input
                type={isLogin && !forgotPassword ? 'text' : 'email'}
                autoComplete="username"
                aria-label={isLogin && !forgotPassword ? 'E-mailadres of gebruikersnaam' : 'E-mailadres'}
                placeholder={isLogin && !forgotPassword ? 'E-mailadres of @gebruikersnaam' : 'E-mailadres'}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            {!forgotPassword && <div>
              <Input
                type="password"
                autoComplete={isLogin ? 'current-password' : 'new-password'}
                placeholder="Wachtwoord"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
              />
            </div>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Laden...' : forgotPassword ? 'Verstuur herstel-link' : isLogin ? 'Inloggen' : 'Registreren'}
            </Button>
          </form>}
          {isLogin && !forgotPassword && <Button variant="link" className="w-full mt-2" onClick={() => { setForgotPassword(true); setEmail(''); }}>Wachtwoord vergeten?</Button>}
          <div className="mt-4 text-center">
            <Button variant="link"
              type="button"
              onClick={() => {
                if (forgotPassword) { setForgotPassword(false); setResetSent(false); setIsLogin(true); }
                else setIsLogin(!isLogin);
                setUsernameError('');
              }}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              {forgotPassword ? 'Terug naar inloggen' : isLogin 
                ? 'Nog geen account? Registreer hier'
                : 'Al een account? Log hier in'
              }
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
