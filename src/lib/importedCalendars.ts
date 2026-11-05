import ICAL from 'ical.js';
import { supabase } from '@/integrations/supabase/client';
import { TestCandidate } from './upcomingTests';

export function parseImportedCalendar(content: string, connectionId: string): TestCandidate[] {
  const calendar = new ICAL.Component(ICAL.parse(content));
  return calendar.getAllSubcomponents('vevent').flatMap(component => {
    const event = new ICAL.Event(component);
    if (!event.startDate || event.component.getFirstPropertyValue('status') === 'CANCELLED') return [];
    return [{ id: `ics-${connectionId}-${event.uid}`, title: event.summary || '',
      start_time: event.startDate.toJSDate().toISOString(), event_type: 'toets', color: 'hsl(var(--primary))' }];
  });
}

export async function loadImportedCalendarTests(userId: string): Promise<TestCandidate[]> {
  const [connections, google] = await Promise.all([
    supabase.from('calendar_connections').select('id, ics_url').eq('user_id', userId),
    supabase.from('google_calendar_connections').select('access_token, refresh_token').eq('user_id', userId).maybeSingle(),
  ]);
  if (connections.error) throw connections.error;
  if (google.error) throw google.error;
  const sources = connections.data.map(async connection => {
    const { data, error } = await supabase.functions.invoke('fetch-ics', { body: { url: connection.ics_url } });
    if (error) throw error;
    return parseImportedCalendar(data.content, connection.id);
  });
  if (google.data?.access_token) {
    const connection = google.data;
    sources.push((async () => {
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const { data, error } = await supabase.functions.invoke('google-calendar-events', { body: {
        access_token: connection.access_token, refresh_token: connection.refresh_token, time_min: today.toISOString(),
      }});
      if (error) throw error;
      if (data.new_token) await supabase.from('google_calendar_connections').update({ access_token: data.new_token }).eq('user_id', userId);
      return (data.events || []).map((event: { id: string; title: string; start: string; calendarColor?: string }) => ({
        id: `google-${event.id}`, title: event.title, start_time: event.start,
        event_type: '', color: event.calendarColor || 'hsl(var(--primary))',
      }));
    })());
  }
  const results = await Promise.allSettled(sources);
  results.forEach(result => { if (result.status === 'rejected') console.error('Calendar import failed:', result.reason); });
  return results.flatMap(result => result.status === 'fulfilled' ? result.value : []);
}