import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

/** Routes only available with Grutto Plus enabled. */
export const PLUS_ROUTES = ['/communities', '/ontdekken', '/community', '/notities', '/taken', '/grutto-ai', '/apps'];

export function isPlusRoute(pathname: string) {
  return PLUS_ROUTES.some((r) => pathname === r || pathname.startsWith(r + '/'));
}

interface GruttoPlusContextType {
  enabled: boolean;
  loading: boolean;
  setEnabled: (value: boolean) => Promise<void>;
}

const GruttoPlusContext = createContext<GruttoPlusContextType | undefined>(undefined);

export function GruttoPlusProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [enabled, setEnabledState] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setEnabledState(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    supabase
      .from('profiles')
      .select('grutto_plus')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        setEnabledState(!!data?.grutto_plus);
        setLoading(false);
      });
  }, [user?.id]);

  const setEnabled = async (value: boolean) => {
    if (!user) return;
    const previous = enabled;
    setEnabledState(value);
    const { error } = await supabase.from('profiles').update({ grutto_plus: value }).eq('user_id', user.id);
    if (error) {
      setEnabledState(previous);
      throw error;
    }
  };

  return (
    <GruttoPlusContext.Provider value={{ enabled, loading, setEnabled }}>
      {children}
    </GruttoPlusContext.Provider>
  );
}

export function useGruttoPlus() {
  const ctx = useContext(GruttoPlusContext);
  if (!ctx) throw new Error('useGruttoPlus must be used within GruttoPlusProvider');
  return ctx;
}
