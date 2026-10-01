import { useState, useEffect } from 'react';
import { useOutletContext, useNavigate } from 'react-router-dom';
import { getStoredAccessToken } from '@/auth/spotifyAuth';
import { MusicRecommendations } from '@/components/MusicRecommendations';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { format, startOfDay, endOfDay } from 'date-fns';
import { nl } from 'date-fns/locale';
import { BookOpen, FileText, GraduationCap } from 'lucide-react';

type TimeFilter = 'dag' | 'week' | 'maand';

const filterTitles: Record<TimeFilter, string> = {
  dag: 'Vandaag',
  week: 'Deze week',
  maand: 'Deze maand',
};

interface OutletContextType {
  deviceId: string | null;
  setCurrentContext: (name: string, type: 'artist' | 'playlist') => void;
}

interface UpcomingTest {
  id: string;
  title: string;
  start_time: string;
  event_type: string;
  color: string;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const accessToken = getStoredAccessToken();
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('dag');
  const { deviceId, setCurrentContext } = useOutletContext<OutletContextType>() || {};
  
  const [studyProgress, setStudyProgress] = useState(0);
  const [studyGoal, setStudyGoal] = useState(120);
  const [todayStudyMinutes, setTodayStudyMinutes] = useState(0);
  const [upcomingTests, setUpcomingTests] = useState<UpcomingTest[]>([]);
  const [loadingTests, setLoadingTests] = useState(true);
  const [sessionStatus, setSessionStatus] = useState<'none' | 'running' | 'paused'>('none');

  useEffect(() => {
    if (!user) return;

    loadStudyProgress();
    loadUpcomingTests();
    loadSessionStatus();

    const channel = supabase
      .channel('dashboard-study-sessions')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'study_sessions' }, () => {
        loadSessionStatus();
        loadStudyProgress();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  const loadSessionStatus = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('study_sessions')
      .select('is_paused')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('started_at', { ascending: false })
      .limit(1);

    const active = data?.[0];
    setSessionStatus(!active ? 'none' : active.is_paused ? 'paused' : 'running');
  };

  const loadStudyProgress = async () => {
    if (!user) return;
    
    try {
      const { data: profile } = await supabase.from("profiles").select("study_goal_minutes").eq("user_id", user.id).single();
      if (profile?.study_goal_minutes) setStudyGoal(profile.study_goal_minutes);

      const today = new Date();
      const dayStart = startOfDay(today).toISOString();
      const dayEnd = endOfDay(today).toISOString();
      
      const { data: sessions, error } = await supabase
        .from("study_sessions")
        .select("duration_minutes, is_active, started_at")
        .eq("user_id", user.id)
        .gte("started_at", dayStart)
        .lte("started_at", dayEnd);

      if (error) {
        console.error("Error loading study sessions:", error);
        return;
      }

      let totalMinutes = 0;
      sessions?.forEach(session => {
        if (session.is_active) {
          // For active sessions, calculate time from started_at until now
          const startTime = new Date(session.started_at).getTime();
          const activeMinutes = Math.floor((Date.now() - startTime) / 60000);
          totalMinutes += Math.max(0, activeMinutes);
        } else {
          totalMinutes += session.duration_minutes || 0;
        }
      });
      
      setTodayStudyMinutes(totalMinutes);
      const goalMinutes = profile?.study_goal_minutes || 120;
      setStudyProgress(Math.min(100, Math.round((totalMinutes / goalMinutes) * 100)));
    } catch (error) {
      console.error("Failed to load study progress:", error);
    }
  };

  const loadUpcomingTests = async () => {
    if (!user) return;
    setLoadingTests(true);
    try {
      const { data } = await supabase.from("calendar_events").select("id, title, start_time, event_type, color").eq("user_id", user.id).in("event_type", ["proefwerk", "schoolexamen", "project", "toets"]).gte("start_time", new Date().toISOString()).order("start_time", { ascending: true }).limit(3);
      setUpcomingTests(data || []);
    } finally {
      setLoadingTests(false);
    }
  };

  const getProgressLabel = () => {
    if (studyProgress >= 100) return { text: "Doel bereikt!", className: "bg-green-100 text-green-800" };
    if (studyProgress >= 70) return { text: "Goed bezig", className: "bg-blue-100 text-blue-800" };
    return { text: "Achter op schema", className: "bg-yellow-100 text-yellow-800" };
  };

  const formatStudyTime = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    return hours > 0 ? `${hours}u ${minutes % 60}m` : `${minutes}m`;
  };

  const getEventIcon = (eventType: string) => {
    if (eventType === 'proefwerk' || eventType === 'toets') return <FileText className="w-4 h-4" />;
    if (eventType === 'schoolexamen') return <GraduationCap className="w-4 h-4" />;
    return <BookOpen className="w-4 h-4" />;
  };

  const progressLabel = getProgressLabel();

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-4xl font-bold text-foreground">{filterTitles[timeFilter]}</h1>
          <div className="inline-flex bg-muted rounded-full p-1 border relative" style={{ minWidth: '240px' }}>
            {/* Sliding indicator */}
            <div 
              className="absolute top-1 bottom-1 rounded-full bg-background shadow-sm transition-all duration-300 ease-out"
              style={{
                width: 'calc(33.333% - 2px)',
                left: `calc(${(['dag', 'week', 'maand'] as TimeFilter[]).indexOf(timeFilter)} * 33.333% + 1px)`,
              }}
            />
            {(['dag', 'week', 'maand'] as TimeFilter[]).map((filter) => (
              <button key={filter} onClick={() => setTimeFilter(filter)} className={`flex-1 px-4 py-2 text-sm font-medium rounded-full transition-colors relative z-10 ${timeFilter === filter ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
                {filter === 'dag' ? 'Dag' : filter === 'week' ? 'Week' : 'Maand'}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <CardContent className="p-6">
              <h3 className="text-lg font-semibold text-foreground mb-4">Aankomende toetsen</h3>
              {loadingTests ? <div className="animate-pulse space-y-3">{[1,2,3].map(i => <div key={i} className="h-12 bg-muted rounded-lg" />)}</div> : upcomingTests.length === 0 ? <p className="text-sm text-muted-foreground">Geen aankomende toetsen</p> : (
                <div className="space-y-3">
                  {upcomingTests.map((test) => (
                    <button key={test.id} onClick={() => navigate(`/agenda?date=${test.start_time.split('T')[0]}`)} className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-muted transition-colors text-left">
                      <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: `${test.color}20` }}>
                        <div style={{ color: test.color }}>{getEventIcon(test.event_type)}</div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{test.title}</p>
                        <p className="text-xs text-muted-foreground">{format(new Date(test.start_time), "EEEE d MMMM, HH:mm", { locale: nl })}</p>
                      </div>
                      <span className="text-xs px-2 py-1 rounded-full bg-muted capitalize">{test.event_type}</span>
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
          <Card><CardContent className="p-6"><h3 className="text-lg font-semibold text-foreground mb-4">Je laatste cijfers</h3><p className="text-sm text-muted-foreground">Nog geen cijfers toegevoegd</p></CardContent></Card>
        </div>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <h3 className="text-lg font-semibold text-foreground">Je studievoortgang vandaag</h3>
                <span className={`text-xs font-medium px-2 py-1 rounded-full ${progressLabel.className}`}>{progressLabel.text}</span>
              </div>
              <div className="text-right">
                <p className="text-sm text-muted-foreground mb-1">{formatStudyTime(todayStudyMinutes)} / {formatStudyTime(studyGoal)}</p>
                <p className="text-2xl font-bold text-primary">{studyProgress}%</p>
              </div>
            </div>
            <div className="w-full bg-muted rounded-full h-2"><div className="bg-primary h-2 rounded-full transition-all duration-500" style={{ width: `${Math.min(100, studyProgress)}%` }} /></div>
          </CardContent>
        </Card>

        {accessToken ? <MusicRecommendations deviceId={deviceId || null} onContextChange={(name, type) => setCurrentContext?.(name, type)} /> : (
          <Card><CardContent className="p-6"><div className="text-center py-8"><h3 className="text-xl font-semibold text-foreground mb-2">Aanbevolen studiemuziek</h3><p className="text-sm text-muted-foreground mb-4">Log in met Spotify om gepersonaliseerde muziekaanbevelingen te zien</p><Button onClick={() => window.location.href = '/instellingen'}>Verbind met Spotify</Button></div></CardContent></Card>
        )}
      </div>
    </div>
  );
}