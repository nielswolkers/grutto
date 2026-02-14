import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { ChevronLeft, ChevronRight, Plus, Monitor, Search, MapPin } from "lucide-react";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths, startOfWeek, endOfWeek, parseISO, addWeeks, subWeeks, addDays, subDays } from "date-fns";
import { useSearchParams, useNavigate } from "react-router-dom";
import { nl } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { UserInviteSearch } from "@/components/agenda/UserInviteSearch";

type TimeFilter = 'dag' | 'week' | 'maand';
type SidebarMode = 'events' | 'create' | 'meeting' | 'view' | 'search';

const filterTitles: Record<TimeFilter, string> = {
  dag: 'Vandaag',
  week: 'Deze week',
  maand: 'Deze maand',
};

interface CalendarEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  allDay: boolean;
  source: 'task' | 'zermelo' | 'outlook' | 'google' | 'local';
  color: string;
  eventType?: string;
  description?: string;
  location?: string;
  dbId?: string; // Original database ID for editing
  taskId?: string; // For task events - store the original task ID
  mergedSources?: string[]; // If this event was merged from multiple sources
}

interface Task {
  id: string;
  title: string;
  due_date: string;
  due_time: string | null;
  completed: boolean;
  add_to_calendar: boolean;
}

interface CalendarEventDB {
  id: string;
  title: string;
  start_time: string;
  end_time: string;
  all_day: boolean;
  color: string;
  event_type: string;
  description?: string;
  location?: string;
}

interface CalendarConnection {
  id: string;
  provider: string;
  ics_url: string;
  display_name: string | null;
}

const parseICS = (icsContent: string, source: 'zermelo' | 'outlook'): CalendarEvent[] => {
  const events: CalendarEvent[] = [];
  const lines = icsContent.split(/\r?\n/);
  let currentEvent: Partial<CalendarEvent> | null = null;

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    
    while (i + 1 < lines.length && (lines[i + 1].startsWith(' ') || lines[i + 1].startsWith('\t'))) {
      i++;
      line += lines[i].substring(1);
    }

    if (line.startsWith('BEGIN:VEVENT')) {
      currentEvent = { source, color: source === 'zermelo' ? '#3B82F6' : '#8B5CF6' };
    } else if (line.startsWith('END:VEVENT') && currentEvent) {
      if (currentEvent.title && currentEvent.start) {
        events.push({
          id: `${source}-${Math.random().toString(36).substr(2, 9)}`,
          title: currentEvent.title,
          start: currentEvent.start,
          end: currentEvent.end || currentEvent.start,
          allDay: currentEvent.allDay || false,
          source,
          color: currentEvent.color!,
        });
      }
      currentEvent = null;
    } else if (currentEvent) {
      if (line.startsWith('SUMMARY:')) {
        currentEvent.title = line.substring(8).replace(/\\,/g, ',').replace(/\\;/g, ';');
      } else if (line.startsWith('DTSTART')) {
        const dateStr = line.split(':').pop() || '';
        currentEvent.allDay = !dateStr.includes('T');
        currentEvent.start = parseICSDate(dateStr);
      } else if (line.startsWith('DTEND')) {
        const dateStr = line.split(':').pop() || '';
        currentEvent.end = parseICSDate(dateStr);
      }
    }
  }

  return events;
};

const parseICSDate = (dateStr: string): Date => {
  const year = parseInt(dateStr.substring(0, 4));
  const month = parseInt(dateStr.substring(4, 6)) - 1;
  const day = parseInt(dateStr.substring(6, 8));
  
  if (dateStr.includes('T')) {
    const hour = parseInt(dateStr.substring(9, 11));
    const minute = parseInt(dateStr.substring(11, 13));
    const second = parseInt(dateStr.substring(13, 15));
    
    if (dateStr.endsWith('Z')) {
      return new Date(Date.UTC(year, month, day, hour, minute, second));
    }
    return new Date(year, month, day, hour, minute, second);
  }
  
  return new Date(year, month, day);
};

// Helper to normalize event titles for comparison (remove room numbers, class codes, etc.)
const normalizeTitle = (title: string): string => {
  // Remove leading numbers, room codes (e.g. "311", "k02"), and # prefix
  return title.replace(/^#?\s*/, '').replace(/^[a-z]?\d+\s*/i, '').toLowerCase().trim();
};

// Extract core activity name from title (e.g., "k02 lo 5v.lo2" -> "lo 5v")
const extractCoreActivity = (title: string): string => {
  let core = title.toLowerCase()
    .replace(/^#?\s*/, '') // Remove # prefix
    .replace(/^[a-z]?\d+\s*/i, '') // Remove room codes like "k02", "311"
    .replace(/\.\w+\d*$/, '') // Remove trailing class codes like ".lo2", ".netl5"
    .trim();
  return core;
};

// Check if two events are similar enough to merge
const areEventsSimilar = (a: CalendarEvent, b: CalendarEvent): boolean => {
  // Must be within exact same time period (start and end times match closely)
  const startDiff = Math.abs(a.start.getTime() - b.start.getTime());
  const endDiff = Math.abs(a.end.getTime() - b.end.getTime());
  
  // Allow 5 minutes tolerance
  if (startDiff > 5 * 60 * 1000 || endDiff > 5 * 60 * 1000) return false;

  // Both should be ICS events (zermelo or outlook) for merging
  if (!['zermelo', 'outlook'].includes(a.source) || !['zermelo', 'outlook'].includes(b.source)) return false;
  if (a.source === b.source) return false; // Only merge different sources

  // Extract core activity names
  const coreA = extractCoreActivity(a.title);
  const coreB = extractCoreActivity(b.title);
  
  // Check if cores are similar
  if (coreA.includes(coreB) || coreB.includes(coreA)) return true;
  
  // Check for significant word overlap
  const wordsA = coreA.split(/[\s.]+/).filter(w => w.length > 1);
  const wordsB = coreB.split(/[\s.]+/).filter(w => w.length > 1);
  const commonWords = wordsA.filter(w => wordsB.some(wb => wb.includes(w) || w.includes(wb)));
  
  return commonWords.length >= 1;
};

// Deduplicate events with same time slots from different sources
// Prioritize Zermelo naming, fall back to Outlook
const deduplicateEvents = (events: CalendarEvent[]): CalendarEvent[] => {
  const result: CalendarEvent[] = [];
  const merged = new Set<string>();

  for (let i = 0; i < events.length; i++) {
    if (merged.has(events[i].id)) continue;

    const current = events[i];
    const similarEvents: CalendarEvent[] = [current];

    // Find similar events
    for (let j = i + 1; j < events.length; j++) {
      if (merged.has(events[j].id)) continue;
      if (areEventsSimilar(current, events[j])) {
        similarEvents.push(events[j]);
        merged.add(events[j].id);
      }
    }

    if (similarEvents.length > 1) {
      // Prefer Zermelo title, fall back to Outlook
      const zermeloEvent = similarEvents.find(e => e.source === 'zermelo');
      const outlookEvent = similarEvents.find(e => e.source === 'outlook');
      const preferredEvent = zermeloEvent || outlookEvent || current;
      
      result.push({
        ...preferredEvent,
        mergedSources: [...new Set(similarEvents.map(e => e.source))],
      });
    } else {
      result.push(current);
    }
    merged.add(current.id);
  }

  return result;
}

const EVENT_COLORS = [
  { name: 'yellow', value: '#FBBF24' },
  { name: 'orange', value: '#F97316' },
  { name: 'red', value: '#EF4444' },
  { name: 'pink', value: '#EC4899' },
  { name: 'green', value: '#10B981' },
  { name: 'cyan', value: '#06B6D4' },
  { name: 'blue', value: '#3B82F6' },
  { name: 'gray', value: '#9CA3AF' },
];

const EVENT_TYPES = [
  { value: 'project', label: 'Project' },
  { value: 'huiswerk', label: 'Huiswerk' },
  { value: 'proefwerk', label: 'Proefwerk' },
  { value: 'schoolexamen', label: 'Schoolexamen' },
  { value: 'toets', label: 'Toets' },
  { value: 'studietijd', label: 'Studietijd' },
  { value: 'anders', label: 'Anders' },
];

const Agenda = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingBackground, setLoadingBackground] = useState(false); // For background refresh
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('maand');
  const [sidebarMode, setSidebarMode] = useState<SidebarMode>('events');
  const [searchQuery, setSearchQuery] = useState('');
  const [currentEventId, setCurrentEventId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  
  // Cache key for localStorage
  const cacheKey = useMemo(() => user ? `calendar-events-${user.id}` : null, [user]);
  const icsCacheKey = useMemo(() => user ? `calendar-ics-${user.id}` : null, [user]);

  // Selected event for viewing/editing
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);

  // Deleted event for undo functionality
  const [deletedEvent, setDeletedEvent] = useState<CalendarEvent | null>(null);

  // Refs for auto-scroll to current time
  const weekScrollRef = useRef<HTMLDivElement>(null);
  const dayScrollRef = useRef<HTMLDivElement>(null);

  // Current time state for the time indicator
  const [currentTime, setCurrentTime] = useState(new Date());

  // Drag state
  const [isDragging, setIsDragging] = useState(false);
  const [dragEventId, setDragEventId] = useState<string | null>(null);
  const [dragStartY, setDragStartY] = useState(0);
  const [dragCurrentY, setDragCurrentY] = useState(0);

  // Update current time every minute
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  // Event creation form state (for 'create' mode - no invites)
  const [newEventTitle, setNewEventTitle] = useState('Nieuwe Gebeurtenis');
  const [newEventStartDate, setNewEventStartDate] = useState('');
  const [newEventEndDate, setNewEventEndDate] = useState('');
  const [newEventStartTime, setNewEventStartTime] = useState('13:20');
  const [newEventEndTime, setNewEventEndTime] = useState('16:25');
  const [newEventAllDay, setNewEventAllDay] = useState(false);
  const [newEventRepeat, setNewEventRepeat] = useState('none');
  const [newEventReminder, setNewEventReminder] = useState('5min');
  const [newEventDescription, setNewEventDescription] = useState('');
  const [newEventColor, setNewEventColor] = useState('#10B981');
  const [newEventType, setNewEventType] = useState('anders');
  const [newEventLocation, setNewEventLocation] = useState('');

  // Meeting creation form state (for 'meeting' mode - with invites)
  const [meetingTitle, setMeetingTitle] = useState('Nieuwe Afspraak');
  const [meetingStartDate, setMeetingStartDate] = useState('');
  const [meetingEndDate, setMeetingEndDate] = useState('');
  const [meetingStartTime, setMeetingStartTime] = useState('13:20');
  const [meetingEndTime, setMeetingEndTime] = useState('16:25');
  const [meetingAllDay, setMeetingAllDay] = useState(false);
  const [meetingDescription, setMeetingDescription] = useState('');
  const [meetingColor, setMeetingColor] = useState('#3B82F6');
  const [meetingLocation, setMeetingLocation] = useState('');
  const [meetingInvitees, setMeetingInvitees] = useState<string[]>([]);
  const [currentMeetingId, setCurrentMeetingId] = useState<string | null>(null);

  // Handle URL date parameter
  useEffect(() => {
    const dateParam = searchParams.get('date');
    if (dateParam) {
      const parsedDate = parseISO(dateParam);
      if (!isNaN(parsedDate.getTime())) {
        setCurrentDate(parsedDate);
        setSelectedDate(parsedDate);
        setTimeFilter('dag');
      }
    }
  }, [searchParams]);

  useEffect(() => {
    if (user) {
      loadEvents();
    }
  }, [user, currentDate]);

  useEffect(() => {
    const dateStr = format(selectedDate, 'yyyy-MM-dd');
    setNewEventStartDate(dateStr);
    setNewEventEndDate(dateStr);
    setMeetingStartDate(dateStr);
    setMeetingEndDate(dateStr);
  }, [selectedDate]);

  // Auto-scroll to current time on week/day view
  useEffect(() => {
    const scrollToCurrentTime = () => {
      const now = new Date();
      const currentHour = now.getHours();
      const currentMinute = now.getMinutes();
      const hourHeight = timeFilter === 'dag' ? 64 : 48;
      const scrollPosition = (currentHour * hourHeight) + ((currentMinute / 60) * hourHeight) - 200;

      if (timeFilter === 'week' && weekScrollRef.current) {
        const scrollArea = weekScrollRef.current.querySelector('[data-radix-scroll-area-viewport]');
        if (scrollArea) {
          scrollArea.scrollTop = Math.max(0, scrollPosition);
        }
      } else if (timeFilter === 'dag' && dayScrollRef.current) {
        const scrollArea = dayScrollRef.current.querySelector('[data-radix-scroll-area-viewport]');
        if (scrollArea) {
          scrollArea.scrollTop = Math.max(0, scrollPosition);
        }
      }
    };

    // Small delay to ensure DOM is ready
    const timeout = setTimeout(scrollToCurrentTime, 100);
    return () => clearTimeout(timeout);
  }, [timeFilter, loading]);

  // Keyboard handler for backspace delete and Ctrl+Z undo
  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      // Backspace to delete selected event
      if (e.key === 'Backspace' && selectedEvent && selectedEvent.source === 'local' && sidebarMode === 'view') {
        e.preventDefault();
        await deleteSelectedEvent();
      }
      
      // Ctrl+Z to undo
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && deletedEvent) {
        e.preventDefault();
        await undoDelete();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedEvent, deletedEvent, sidebarMode]);

  const deleteSelectedEvent = async () => {
    if (!selectedEvent || !selectedEvent.dbId) return;

    try {
      // Store for undo
      setDeletedEvent(selectedEvent);

      await supabase.from("calendar_events").delete().eq('id', selectedEvent.dbId);
      
      toast.success("Gebeurtenis verwijderd", {
        action: {
          label: "Ongedaan maken",
          onClick: () => undoDelete(),
        },
      });
      
      setSelectedEvent(null);
      setSidebarMode('events');
      loadEvents();
    } catch (error) {
      console.error("Failed to delete event:", error);
      toast.error("Kon gebeurtenis niet verwijderen");
    }
  };

  const undoDelete = async () => {
    if (!deletedEvent || !user) return;

    try {
      await supabase.from("calendar_events").insert({
        user_id: user.id,
        title: deletedEvent.title,
        start_time: deletedEvent.start.toISOString(),
        end_time: deletedEvent.end.toISOString(),
        all_day: deletedEvent.allDay,
        color: deletedEvent.color,
        event_type: deletedEvent.eventType || 'anders',
        description: deletedEvent.description || null,
        location: deletedEvent.location || null,
      });

      toast.success("Gebeurtenis hersteld");
      setDeletedEvent(null);
      loadEvents();
    } catch (error) {
      console.error("Failed to restore event:", error);
      toast.error("Kon gebeurtenis niet herstellen");
    }
  };

  const saveEvent = async () => {
    if (!user || !newEventTitle.trim()) return;

    setIsSaving(true);
    try {
      const startDate = newEventStartDate || format(selectedDate, 'yyyy-MM-dd');
      const startDateTime = newEventAllDay 
        ? new Date(`${startDate}T00:00:00`) 
        : new Date(`${startDate}T${newEventStartTime}:00`);
      const endDateTime = newEventAllDay 
        ? new Date(`${startDate}T23:59:59`) 
        : new Date(`${startDate}T${newEventEndTime}:00`);

      if (currentEventId) {
        // Update existing event
        const { error } = await supabase.from("calendar_events").update({
          title: newEventTitle.trim(),
          description: newEventDescription || null,
          start_time: startDateTime.toISOString(),
          end_time: endDateTime.toISOString(),
          all_day: newEventAllDay,
          color: newEventColor,
          event_type: newEventType,
          location: newEventLocation || null,
          repeat_type: newEventRepeat === 'none' ? null : newEventRepeat,
          reminder_minutes: newEventReminder === 'none' ? null : parseInt(newEventReminder),
        }).eq('id', currentEventId);

        if (error) throw error;
      } else {
        // Create new event
        const { data, error } = await supabase.from("calendar_events").insert({
          user_id: user.id,
          title: newEventTitle.trim(),
          description: newEventDescription || null,
          start_time: startDateTime.toISOString(),
          end_time: endDateTime.toISOString(),
          all_day: newEventAllDay,
          color: newEventColor,
          event_type: newEventType,
          location: newEventLocation || null,
          repeat_type: newEventRepeat === 'none' ? null : newEventRepeat,
          reminder_minutes: newEventReminder === 'none' ? null : parseInt(newEventReminder),
        }).select().single();

        if (error) throw error;
        if (data) setCurrentEventId(data.id);
      }

      toast.success("Gebeurtenis opgeslagen");
      loadEvents();
      // Close the creation column
      resetEventFormAndClose();
    } catch (error) {
      console.error("Failed to save event:", error);
      toast.error("Kon gebeurtenis niet opslaan");
    } finally {
      setIsSaving(false);
    }
  };

  const saveMeeting = async () => {
    if (!user || !meetingTitle.trim()) return;

    setIsSaving(true);
    try {
      const startDate = meetingStartDate || format(selectedDate, 'yyyy-MM-dd');
      const startDateTime = meetingAllDay 
        ? new Date(`${startDate}T00:00:00`) 
        : new Date(`${startDate}T${meetingStartTime}:00`);
      const endDateTime = meetingAllDay 
        ? new Date(`${startDate}T23:59:59`) 
        : new Date(`${startDate}T${meetingEndTime}:00`);

      if (currentMeetingId) {
        // Update existing meeting
        const { error } = await supabase.from("calendar_events").update({
          title: meetingTitle.trim(),
          description: meetingDescription || null,
          start_time: startDateTime.toISOString(),
          end_time: endDateTime.toISOString(),
          all_day: meetingAllDay,
          color: meetingColor,
          event_type: 'meeting',
          location: meetingLocation || null,
        }).eq('id', currentMeetingId);

        if (error) throw error;

        // Update invitations
        await supabase.from("event_invitations").delete().eq('event_id', currentMeetingId);
        
        if (meetingInvitees.length > 0) {
          const invitations = meetingInvitees.map(inviteeId => ({
            event_id: currentMeetingId,
            inviter_id: user.id,
            invitee_id: inviteeId,
            status: 'pending',
          }));
          await supabase.from("event_invitations").insert(invitations);

          // Send notifications
          const notifications = meetingInvitees.map(inviteeId => ({
            recipient_id: inviteeId,
            sender_id: user.id,
            type: 'meeting_invite',
            message: `Je bent uitgenodigd voor "${meetingTitle.trim()}"`,
          }));
          await supabase.from("notifications").insert(notifications);
        }
      } else {
        // Create new meeting
        const { data, error } = await supabase.from("calendar_events").insert({
          user_id: user.id,
          title: meetingTitle.trim(),
          description: meetingDescription || null,
          start_time: startDateTime.toISOString(),
          end_time: endDateTime.toISOString(),
          all_day: meetingAllDay,
          color: meetingColor,
          event_type: 'meeting',
          location: meetingLocation || null,
        }).select().single();

        if (error) throw error;
        if (data) {
          setCurrentMeetingId(data.id);

          // Send invitations
          if (meetingInvitees.length > 0) {
            const invitations = meetingInvitees.map(inviteeId => ({
              event_id: data.id,
              inviter_id: user.id,
              invitee_id: inviteeId,
              status: 'pending',
            }));
            await supabase.from("event_invitations").insert(invitations);

            // Send notifications
            const notifications = meetingInvitees.map(inviteeId => ({
              recipient_id: inviteeId,
              sender_id: user.id,
              type: 'meeting_invite',
              message: `Je bent uitgenodigd voor "${meetingTitle.trim()}"`,
            }));
            await supabase.from("notifications").insert(notifications);
          }
        }
      }

      toast.success("Afspraak opgeslagen");
      loadEvents();
      // Close the creation column
      resetMeetingFormAndClose();
    } catch (error) {
      console.error("Failed to save meeting:", error);
      toast.error("Kon afspraak niet opslaan");
    } finally {
      setIsSaving(false);
    }
  };

  const loadEvents = useCallback(async (forceRefresh = false) => {
    if (!user) return;
    
    // Try to load from cache first for instant display
    if (!forceRefresh && cacheKey) {
      try {
        const cachedData = localStorage.getItem(cacheKey);
        if (cachedData) {
          const { events: cachedEvents, timestamp } = JSON.parse(cachedData);
          const cacheAge = Date.now() - timestamp;
          
          // Use cache if less than 2 minutes old
          if (cacheAge < 2 * 60 * 1000 && cachedEvents.length > 0) {
            const hydratedEvents = cachedEvents.map((e: any) => ({
              ...e,
              start: new Date(e.start),
              end: new Date(e.end),
            }));
            setEvents(hydratedEvents);
            setLoading(false);
            
            // Refresh in background if cache is older than 30 seconds
            if (cacheAge > 30 * 1000) {
              setLoadingBackground(true);
              loadEventsFromServer();
            }
            return;
          }
        }
      } catch (e) {
        console.error('Cache read error:', e);
      }
    }
    
    setLoading(true);
    await loadEventsFromServer();
  }, [user, cacheKey]);

  const loadEventsFromServer = async () => {
    if (!user) return;

    try {
      // Load all data in parallel for faster loading
      const [calendarEventsResult, tasksResult, connectionsResult, googleConnectionResult] = await Promise.all([
        supabase
          .from('calendar_events')
          .select('id, title, start_time, end_time, all_day, color, event_type, description, location')
          .eq('user_id', user.id),
        supabase
          .from('tasks')
          .select('id, title, due_date, due_time, completed, add_to_calendar')
          .eq('user_id', user.id)
          .eq('completed', false)
          .eq('add_to_calendar', true),
        supabase
          .from('calendar_connections')
          .select('*')
          .eq('user_id', user.id),
        supabase
          .from('google_calendar_connections')
          .select('access_token, refresh_token')
          .eq('user_id', user.id)
          .maybeSingle()
      ]);

      const localEvents: CalendarEvent[] = (calendarEventsResult.data || []).map((event: CalendarEventDB) => ({
        id: `local-${event.id}`,
        dbId: event.id,
        title: event.title,
        start: new Date(event.start_time),
        end: new Date(event.end_time),
        allDay: event.all_day,
        source: 'local' as const,
        color: event.color,
        eventType: event.event_type,
        description: event.description,
        location: event.location,
      }));

      const taskEvents: CalendarEvent[] = (tasksResult.data || []).map((task: Task) => {
        const date = parseISO(task.due_date);
        if (task.due_time) {
          const [hours, minutes] = task.due_time.split(':');
          date.setHours(parseInt(hours), parseInt(minutes));
        }
        return {
          id: `task-${task.id}`,
          taskId: task.id,
          title: task.title,
          start: date,
          end: date,
          allDay: !task.due_time,
          source: 'task' as const,
          color: '#10B981',
        };
      });

      // Fetch ICS events in parallel with timeout
      const icsPromises = (connectionsResult.data || []).map(async (connection: CalendarConnection) => {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 second timeout
          
          const response = await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/fetch-ics`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
              },
              body: JSON.stringify({ url: connection.ics_url }),
              signal: controller.signal,
            }
          );
          
          clearTimeout(timeoutId);
          
          if (response.ok) {
            const { content } = await response.json();
            return parseICS(content, connection.provider as 'zermelo' | 'outlook');
          }
        } catch (error) {
          console.error(`Failed to fetch ICS from ${connection.provider}:`, error);
        }
        return [];
      });

      const icsResults = await Promise.all(icsPromises);
      const icsEvents = icsResults.flat();

      // Load Google Calendar events
      let googleEvents: CalendarEvent[] = [];
      if (googleConnectionResult.data?.access_token) {
        try {
          const timeMin = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1).toISOString();
          const timeMax = new Date(currentDate.getFullYear(), currentDate.getMonth() + 2, 0).toISOString();
          
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 8000);
          
          const response = await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/google-calendar-events`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
              },
              body: JSON.stringify({
                access_token: googleConnectionResult.data.access_token,
                refresh_token: googleConnectionResult.data.refresh_token,
                time_min: timeMin,
                time_max: timeMax,
              }),
              signal: controller.signal,
            }
          );

          clearTimeout(timeoutId);

          if (response.ok) {
            const data = await response.json();
            
            if (data.new_token) {
              await supabase
                .from('google_calendar_connections')
                .update({ access_token: data.new_token, updated_at: new Date().toISOString() })
                .eq('user_id', user.id);
            }

            googleEvents = (data.events || []).map((event: any) => ({
              id: `google-${event.id}`,
              title: event.title,
              start: new Date(event.start),
              end: new Date(event.end),
              allDay: event.allDay,
              source: 'google' as const,
              color: event.calendarColor || '#EA4335',
            }));
          }
        } catch (error) {
          console.error('Failed to fetch Google Calendar events:', error);
        }
      }

      // Merge/deduplicate similar events from different sources (e.g. same lesson in Zermelo and Outlook)
      const allEvents = [...localEvents, ...taskEvents, ...icsEvents, ...googleEvents];
      const deduplicatedEvents = deduplicateEvents(allEvents);

      setEvents(deduplicatedEvents);
      
      // Cache the events
      if (cacheKey) {
        try {
          const cacheData = {
            events: deduplicatedEvents.map(e => ({
              ...e,
              start: e.start.toISOString(),
              end: e.end.toISOString(),
            })),
            timestamp: Date.now(),
          };
          localStorage.setItem(cacheKey, JSON.stringify(cacheData));
        } catch (e) {
          console.error('Cache write error:', e);
        }
      }
    } catch (error) {
      console.error('Failed to load events:', error);
    } finally {
      setLoading(false);
      setLoadingBackground(false);
    }
  };

  const navigatePrevious = () => {
    if (timeFilter === 'dag') {
      setCurrentDate(subDays(currentDate, 1));
      setSelectedDate(subDays(currentDate, 1));
    } else if (timeFilter === 'week') {
      setCurrentDate(subWeeks(currentDate, 1));
    } else {
      setCurrentDate(subMonths(currentDate, 1));
    }
  };

  const navigateNext = () => {
    if (timeFilter === 'dag') {
      setCurrentDate(addDays(currentDate, 1));
      setSelectedDate(addDays(currentDate, 1));
    } else if (timeFilter === 'week') {
      setCurrentDate(addWeeks(currentDate, 1));
    } else {
      setCurrentDate(addMonths(currentDate, 1));
    }
  };

  const goToToday = () => {
    setCurrentDate(new Date());
    setSelectedDate(new Date());
  };

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(currentDate, { weekStartsOn: 1 });
  const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd });

  const hours = Array.from({ length: 24 }, (_, i) => i);

  const eventsForSelectedDate = useMemo(() => {
    return events.filter(event => isSameDay(event.start, selectedDate));
  }, [events, selectedDate]);

  // Search results
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const query = searchQuery.toLowerCase();
    return events.filter(event => 
      event.title.toLowerCase().includes(query)
    ).sort((a, b) => a.start.getTime() - b.start.getTime());
  }, [events, searchQuery]);

  const getEventsForDay = (day: Date) => {
    return events.filter(event => isSameDay(event.start, day));
  };

  const getEventsForHourRange = (day: Date) => {
    return events.filter(event => {
      if (event.allDay) return false;
      return isSameDay(event.start, day);
    });
  };

  const getAllDayEventsForDay = (day: Date) => {
    return events.filter(event => event.allDay && isSameDay(event.start, day));
  };

  const getEventStyle = (event: CalendarEvent, hourHeight: number) => {
    const startHour = event.start.getHours();
    const startMinute = event.start.getMinutes();
    const endHour = event.end.getHours();
    const endMinute = event.end.getMinutes();
    
    const startOffset = (startMinute / 60) * hourHeight;
    const durationMinutes = (endHour * 60 + endMinute) - (startHour * 60 + startMinute);
    const height = Math.max((durationMinutes / 60) * hourHeight, 20);
    
    return {
      top: `${startOffset}px`,
      height: `${height}px`,
    };
  };

  // Calculate current time indicator position
  const getCurrentTimePosition = (hourHeight: number) => {
    const hours = currentTime.getHours();
    const minutes = currentTime.getMinutes();
    return (hours * hourHeight) + ((minutes / 60) * hourHeight);
  };

  const weekDayHeaders = ['Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za', 'Zo'];

  const getNavigationTitle = () => {
    if (timeFilter === 'dag') {
      return format(currentDate, 'd MMMM yyyy', { locale: nl });
    } else if (timeFilter === 'week') {
      return `${format(weekStart, 'd', { locale: nl })} - ${format(weekEnd, 'd MMMM yyyy', { locale: nl })}`;
    }
    return format(currentDate, 'MMMM yyyy', { locale: nl });
  };

  const calculateDuration = (startTime: string, endTime: string, allDay: boolean) => {
    if (allDay) return '';
    const [startH, startM] = startTime.split(':').map(Number);
    const [endH, endM] = endTime.split(':').map(Number);
    const startMins = startH * 60 + startM;
    const endMins = endH * 60 + endM;
    const diffMins = endMins - startMins;
    if (diffMins <= 0) return '';
    const hours = Math.floor(diffMins / 60);
    const mins = diffMins % 60;
    return `(${hours}h ${mins}m)`;
  };

  const resetEventFormAndClose = () => {
    setNewEventTitle('Nieuwe Gebeurtenis');
    setNewEventDescription('');
    setNewEventStartTime('13:20');
    setNewEventEndTime('16:25');
    setNewEventAllDay(false);
    setNewEventRepeat('none');
    setNewEventReminder('5min');
    setNewEventColor('#10B981');
    setNewEventType('anders');
    setNewEventLocation('');
    setCurrentEventId(null);
    setSidebarMode('events');
  };

  const resetEventForm = async () => {
    // Delete the event if it was being created
    if (currentEventId) {
      await supabase.from("calendar_events").delete().eq('id', currentEventId);
      loadEvents();
    }
    resetEventFormAndClose();
  };

  const resetMeetingFormAndClose = () => {
    setMeetingTitle('Nieuwe Afspraak');
    setMeetingDescription('');
    setMeetingStartTime('13:20');
    setMeetingEndTime('16:25');
    setMeetingAllDay(false);
    setMeetingColor('#3B82F6');
    setMeetingLocation('');
    setMeetingInvitees([]);
    setCurrentMeetingId(null);
    setSidebarMode('events');
  };

  const resetMeetingForm = async () => {
    // Delete the meeting if it was being created
    if (currentMeetingId) {
      await supabase.from("event_invitations").delete().eq('event_id', currentMeetingId);
      await supabase.from("calendar_events").delete().eq('id', currentMeetingId);
      loadEvents();
    }
    resetMeetingFormAndClose();
  };

  // State for editing tasks
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editingTaskTitle, setEditingTaskTitle] = useState('');
  const [editingTaskDate, setEditingTaskDate] = useState('');
  const [editingTaskTime, setEditingTaskTime] = useState('');

  // Click on event to open details
  const handleEventClick = (event: CalendarEvent, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedEvent(event);
    
    if (event.source === 'local' && event.dbId) {
      // Populate form with event data for editing
      setNewEventTitle(event.title);
      setNewEventStartDate(format(event.start, 'yyyy-MM-dd'));
      setNewEventEndDate(format(event.end, 'yyyy-MM-dd'));
      setNewEventStartTime(format(event.start, 'HH:mm'));
      setNewEventEndTime(format(event.end, 'HH:mm'));
      setNewEventAllDay(event.allDay);
      setNewEventDescription(event.description || '');
      setNewEventColor(event.color);
      setNewEventType(event.eventType || 'anders');
      setNewEventLocation(event.location || '');
      setCurrentEventId(event.dbId);
      setEditingTaskId(null);
    } else if (event.source === 'task' && event.taskId) {
      // Populate form for editing task
      setEditingTaskId(event.taskId);
      setEditingTaskTitle(event.title);
      setEditingTaskDate(format(event.start, 'yyyy-MM-dd'));
      setEditingTaskTime(event.allDay ? '' : format(event.start, 'HH:mm'));
      setCurrentEventId(null);
    } else {
      setEditingTaskId(null);
      setCurrentEventId(null);
    }
    
    setSidebarMode('view');
  };

  // Save task edits
  const saveTaskEdit = async () => {
    if (!editingTaskId || !editingTaskTitle.trim()) return;
    
    setIsSaving(true);
    try {
      const { error } = await supabase.from("tasks").update({
        title: editingTaskTitle.trim(),
        due_date: editingTaskDate,
        due_time: editingTaskTime || null,
      }).eq('id', editingTaskId);

      if (error) throw error;

      toast.success("Taak bijgewerkt");
      loadEvents();
      setSelectedEvent(null);
      setSidebarMode('events');
    } catch (error) {
      console.error("Failed to update task:", error);
      toast.error("Kon taak niet bijwerken");
    } finally {
      setIsSaving(false);
    }
  };

  // Drag handling for local events
  const handleDragStart = useCallback((event: CalendarEvent, e: React.MouseEvent) => {
    if (event.source !== 'local' || !event.dbId) return;
    e.preventDefault();
    setIsDragging(true);
    setDragEventId(event.id);
    setDragStartY(e.clientY);
    setDragCurrentY(e.clientY);
  }, []);

  const handleDragMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging) return;
    setDragCurrentY(e.clientY);
  }, [isDragging]);

  const handleDragEnd = useCallback(async (hourHeight: number) => {
    if (!isDragging || !dragEventId) return;
    
    const event = events.find(ev => ev.id === dragEventId);
    if (!event || !event.dbId) {
      setIsDragging(false);
      setDragEventId(null);
      return;
    }

    const deltaY = dragCurrentY - dragStartY;
    const deltaMinutes = Math.round((deltaY / hourHeight) * 60 / 5) * 5; // Snap to 5-minute marks
    
    if (deltaMinutes !== 0) {
      const newStart = new Date(event.start.getTime() + deltaMinutes * 60000);
      const newEnd = new Date(event.end.getTime() + deltaMinutes * 60000);

      try {
        await supabase.from("calendar_events").update({
          start_time: newStart.toISOString(),
          end_time: newEnd.toISOString(),
        }).eq('id', event.dbId);

        loadEvents();
      } catch (error) {
        console.error("Failed to update event time:", error);
        toast.error("Kon tijd niet aanpassen");
      }
    }

    setIsDragging(false);
    setDragEventId(null);
  }, [isDragging, dragEventId, dragStartY, dragCurrentY, events]);

  // Navigate to specific event
  const navigateToEvent = (event: CalendarEvent) => {
    setCurrentDate(event.start);
    setSelectedDate(event.start);
    setTimeFilter('dag');
    setSearchQuery('');
    setSidebarMode('events');
  };

  // Update selected event
  const saveSelectedEvent = async () => {
    if (!selectedEvent?.dbId || !user) return;

    setIsSaving(true);
    try {
      const startDate = newEventStartDate || format(selectedDate, 'yyyy-MM-dd');
      const startDateTime = newEventAllDay 
        ? new Date(`${startDate}T00:00:00`) 
        : new Date(`${startDate}T${newEventStartTime}:00`);
      const endDateTime = newEventAllDay 
        ? new Date(`${startDate}T23:59:59`) 
        : new Date(`${startDate}T${newEventEndTime}:00`);

      const { error } = await supabase.from("calendar_events").update({
        title: newEventTitle.trim(),
        description: newEventDescription || null,
        start_time: startDateTime.toISOString(),
        end_time: endDateTime.toISOString(),
        all_day: newEventAllDay,
        color: newEventColor,
        event_type: newEventType,
        location: newEventLocation || null,
      }).eq('id', selectedEvent.dbId);

      if (error) throw error;

      toast.success("Gebeurtenis bijgewerkt");
      loadEvents();
      setSelectedEvent(null);
      setSidebarMode('events');
    } catch (error) {
      console.error("Failed to update event:", error);
      toast.error("Kon gebeurtenis niet bijwerken");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="w-full h-[calc(100vh-7rem)] flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-shrink-0">
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
            <button
              key={filter}
              onClick={() => setTimeFilter(filter)}
              className={`flex-1 px-4 py-2 text-sm font-medium rounded-full transition-colors relative z-10 ${
                timeFilter === filter
                  ? 'text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {filter === 'dag' ? 'Dag' : filter === 'week' ? 'Week' : 'Maand'}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 flex gap-6 min-h-0 overflow-hidden">
        {/* Calendar Grid */}
        <div className="flex-1 flex flex-col bg-card rounded-2xl border border-border p-6 min-h-0 overflow-hidden">
          {/* Navigation */}
          <div className="flex items-center justify-between mb-6 flex-shrink-0">
            <h2 className="text-2xl font-semibold capitalize">
              {getNavigationTitle()}
            </h2>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" onClick={navigatePrevious} className="rounded-full">
                <ChevronLeft className="w-5 h-5" />
              </Button>
              <Button variant="ghost" size="sm" onClick={goToToday} className="rounded-full px-4">
                Vandaag
              </Button>
              <Button variant="ghost" size="icon" onClick={navigateNext} className="rounded-full">
                <ChevronRight className="w-5 h-5" />
              </Button>
            </div>
          </div>

          {/* Month View */}
          {timeFilter === 'maand' && (
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
              <div className="grid grid-cols-7 gap-1 mb-2 flex-shrink-0">
                {weekDayHeaders.map((day) => (
                  <div key={day} className="text-center text-sm font-medium text-muted-foreground py-2">
                    {day}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-1 flex-1 auto-rows-fr overflow-hidden">
                {days.map((day) => {
                  const dayEvents = getEventsForDay(day);
                  const isSelected = isSameDay(day, selectedDate);
                  const isToday = isSameDay(day, new Date());
                  const isCurrentMonth = isSameMonth(day, currentDate);

                  return (
                    <button
                      key={day.toISOString()}
                      onClick={() => {
                        setSelectedDate(day);
                        setSidebarMode('events');
                      }}
                      className={cn(
                        "relative p-2 rounded-xl text-sm transition-all flex flex-col items-start overflow-hidden",
                        isSelected && "bg-primary text-primary-foreground",
                        !isSelected && isToday && "bg-primary/10",
                        !isSelected && !isToday && "hover:bg-muted/50",
                        !isCurrentMonth && "text-muted-foreground/50"
                      )}
                    >
                      <span className={cn(
                        "font-medium mb-1",
                        isToday && !isSelected && "text-primary"
                      )}>
                        {format(day, 'd')}
                      </span>
                      
                      <div className="flex flex-wrap gap-0.5 mt-auto">
                        {dayEvents.slice(0, 3).map((event, idx) => (
                          <div
                            key={idx}
                            className={cn(
                              "w-1.5 h-1.5 rounded-full",
                              isSelected ? "bg-primary-foreground/70" : ""
                            )}
                            style={{ backgroundColor: isSelected ? undefined : event.color }}
                          />
                        ))}
                        {dayEvents.length > 3 && (
                          <span className={cn(
                            "text-xs",
                            isSelected ? "text-primary-foreground/70" : "text-muted-foreground"
                          )}>
                            +{dayEvents.length - 3}
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Week View */}
          {timeFilter === 'week' && (
            <div 
              className="flex-1 flex flex-col min-h-0 overflow-hidden"
              onMouseMove={handleDragMove}
              onMouseUp={() => handleDragEnd(48)}
              onMouseLeave={() => handleDragEnd(48)}
            >
              {/* Week header row - aligned with grid below */}
              <div className="flex mb-2 flex-shrink-0">
                <div className="w-14 flex-shrink-0" />
                <div className="flex-1 grid grid-cols-7 gap-1">
                  {weekDays.map((day) => {
                    const isToday = isSameDay(day, new Date());
                    const isSelected = isSameDay(day, selectedDate);
                    return (
                      <button
                        key={day.toISOString()}
                        onClick={() => {
                          setSelectedDate(day);
                          setSidebarMode('events');
                        }}
                        className={cn(
                          "text-center py-2 rounded-lg transition-all",
                          isSelected && "bg-primary text-primary-foreground",
                          !isSelected && isToday && "bg-primary/10",
                          !isSelected && "hover:bg-muted/50"
                        )}
                      >
                        <div className="text-xs text-muted-foreground font-medium">
                          {format(day, 'EEE', { locale: nl })}
                        </div>
                        <div className={cn(
                          "text-lg font-semibold",
                          isToday && !isSelected && "text-primary"
                        )}>
                          {format(day, 'd')}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* All-day events row - aligned with grid below */}
              <div className="flex mb-2 flex-shrink-0">
                <div className="w-14 flex-shrink-0 text-xs text-muted-foreground text-right pr-2 pt-1">Hele dag</div>
                <div className="flex-1 grid grid-cols-7 gap-1">
                  {weekDays.map((day) => {
                    const allDayEvents = getAllDayEventsForDay(day);
                    return (
                      <div key={day.toISOString()} className="min-h-[32px]">
                        {allDayEvents.slice(0, 2).map((event) => (
                          <div
                            key={event.id}
                            className="text-xs px-1 py-0.5 rounded truncate mb-0.5 cursor-pointer hover:opacity-80"
                            style={{ backgroundColor: event.color, color: 'white' }}
                            onClick={(e) => handleEventClick(event, e)}
                          >
                            {event.title}
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              </div>

              <ScrollArea className="flex-1" ref={weekScrollRef}>
                <div className="relative flex">
                  {/* Time labels column */}
                  <div className="w-14 flex-shrink-0 relative">
                    {hours.map((hour) => (
                      <div key={hour} className="h-12 text-xs text-muted-foreground text-right pr-2 flex items-start justify-end">
                        {hour.toString().padStart(2, '0')}:00
                      </div>
                    ))}
                    {/* Current time stamp on the left */}
                    <div 
                      className="absolute right-0 z-30 pointer-events-none"
                      style={{ top: `${getCurrentTimePosition(48) - 10}px` }}
                    >
                      <div className="bg-destructive text-white text-xs font-medium px-1.5 py-0.5 rounded">
                        {format(currentTime, 'HH:mm')}
                      </div>
                    </div>
                  </div>
                  
                  {/* Days grid */}
                  <div className="flex-1 grid grid-cols-7 gap-1 relative">
                    {/* Continuous time indicator line spanning all days */}
                    <div 
                      className="absolute left-0 right-0 z-20 pointer-events-none h-0.5 bg-destructive/30"
                      style={{ top: `${getCurrentTimePosition(48)}px` }}
                    />
                    
                    {weekDays.map((day, dayIndex) => {
                      const dayEvents = getEventsForHourRange(day);
                      const isToday = isSameDay(day, new Date());
                      return (
                        <div key={day.toISOString()} className="relative">
                          {hours.map((hour) => (
                            <div
                              key={hour}
                              className="h-12 border-t border-border/50"
                            />
                          ))}
                          
                          {/* Bright red line overlay only on current day */}
                          {isToday && (
                            <div 
                              className="absolute left-0 right-0 z-21 pointer-events-none h-0.5 bg-destructive"
                              style={{ top: `${getCurrentTimePosition(48)}px` }}
                            />
                          )}
                          
                          {dayEvents.map((event) => {
                            const startHour = event.start.getHours();
                            const style = getEventStyle(event, 48);
                            const isDraggedEvent = dragEventId === event.id;
                            const dragOffset = isDraggedEvent ? dragCurrentY - dragStartY : 0;
                            
                              // Calculate overlap index for this event
                              const overlappingEvents = dayEvents.filter(other => {
                                if (other.id === event.id) return false;
                                return other.start < event.end && other.end > event.start;
                              });
                              const allOverlapping = [event, ...overlappingEvents].sort((a, b) => a.start.getTime() - b.start.getTime() || a.id.localeCompare(b.id));
                              const overlapIndex = allOverlapping.findIndex(e => e.id === event.id);
                              const totalOverlapping = allOverlapping.length;
                              const widthPercent = totalOverlapping > 1 ? 100 / totalOverlapping : 100;
                              const leftPercent = overlapIndex * widthPercent;

                              return (
                              <div
                                key={event.id}
                                className={cn(
                                  "absolute text-xs px-1.5 py-1 rounded-xl z-10 overflow-hidden border",
                                  event.source === 'local' && "cursor-grab active:cursor-grabbing",
                                  isDraggedEvent && "opacity-75 shadow-lg"
                                )}
                                style={{ 
                                  backgroundColor: `${event.color}30`,
                                  borderColor: `${event.color}50`,
                                  color: event.color,
                                  left: `${leftPercent}%`,
                                  width: `${widthPercent}%`,
                                  top: `calc(${startHour * 48}px + ${style.top} + ${dragOffset}px)`,
                                  height: style.height,
                                }}
                                onClick={(e) => handleEventClick(event, e)}
                                onMouseDown={(e) => handleDragStart(event, e)}
                              >
                                <span className="font-semibold">{event.title}</span>
                                <div className="opacity-80 text-[10px]">{format(event.start, 'HH:mm')} – {format(event.end, 'HH:mm')}</div>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </ScrollArea>
            </div>
          )}

          {/* Day View */}
          {timeFilter === 'dag' && (
            <div 
              className="flex-1 flex flex-col min-h-0 overflow-hidden"
              onMouseMove={handleDragMove}
              onMouseUp={() => handleDragEnd(64)}
              onMouseLeave={() => handleDragEnd(64)}
            >
              <div className="flex gap-2 mb-4 flex-shrink-0">
                <div className="w-14 text-xs text-muted-foreground text-right pr-2 pt-1">Hele dag</div>
                <div className="flex-1 min-h-[32px] flex flex-wrap gap-1">
                  {getAllDayEventsForDay(currentDate).map((event) => (
                    <div
                      key={event.id}
                      className="text-xs px-2 py-1 rounded cursor-pointer hover:opacity-80"
                      style={{ backgroundColor: event.color, color: 'white' }}
                      onClick={(e) => handleEventClick(event, e)}
                    >
                      {event.title}
                    </div>
                  ))}
                </div>
              </div>

              <ScrollArea className="flex-1" ref={dayScrollRef}>
                <div className="relative">
                  {hours.map((hour) => (
                    <div key={hour} className="flex gap-2">
                      <div className="w-14 text-xs text-muted-foreground text-right pr-2 h-16 flex items-start justify-end pt-1 flex-shrink-0 relative">
                        {hour.toString().padStart(2, '0')}:00
                      </div>
                      <div className="flex-1 h-16 border-t border-border/50" />
                    </div>
                  ))}
                  
                  {/* Current time stamp on the left */}
                  <div 
                    className="absolute left-0 z-30 pointer-events-none"
                    style={{ top: `${getCurrentTimePosition(64) - 10}px` }}
                  >
                    <div className="bg-destructive text-white text-xs font-medium px-1.5 py-0.5 rounded">
                      {format(currentTime, 'HH:mm')}
                    </div>
                  </div>
                  
                  {/* Current time indicator line for day view */}
                  <div 
                    className="absolute left-14 right-0 z-20 pointer-events-none h-0.5 bg-destructive"
                    style={{ top: `${getCurrentTimePosition(64)}px` }}
                  />
                  
                  <div className="absolute left-16 right-0 top-0">
                    {getEventsForHourRange(currentDate).map((event) => {
                      const startHour = event.start.getHours();
                      const style = getEventStyle(event, 64);
                      const isDraggedEvent = dragEventId === event.id;
                      const dragOffset = isDraggedEvent ? dragCurrentY - dragStartY : 0;
                      
                      // Calculate overlap for day view
                      const dayViewEvents = getEventsForHourRange(currentDate);
                      const overlappingEvents = dayViewEvents.filter(other => {
                        if (other.id === event.id) return false;
                        return other.start < event.end && other.end > event.start;
                      });
                      const allOverlapping = [event, ...overlappingEvents].sort((a, b) => a.start.getTime() - b.start.getTime() || a.id.localeCompare(b.id));
                      const overlapIndex = allOverlapping.findIndex(e => e.id === event.id);
                      const totalOverlapping = allOverlapping.length;
                      const widthPercent = totalOverlapping > 1 ? 100 / totalOverlapping : 100;
                      const leftPercent = overlapIndex * widthPercent;

                      return (
                        <div
                          key={event.id}
                          className={cn(
                            "absolute text-sm px-3 py-1.5 rounded-xl z-10 overflow-hidden border",
                            event.source === 'local' && "cursor-grab active:cursor-grabbing",
                            isDraggedEvent && "opacity-75 shadow-lg"
                          )}
                          style={{ 
                            backgroundColor: `${event.color}30`,
                            borderColor: `${event.color}50`,
                            color: event.color,
                            left: `${leftPercent}%`,
                            width: `${widthPercent}%`,
                            top: `calc(${startHour * 64}px + ${style.top} + ${dragOffset}px)`,
                            height: style.height,
                          }}
                          onClick={(e) => handleEventClick(event, e)}
                          onMouseDown={(e) => handleDragStart(event, e)}
                        >
                          <span className="font-semibold">{event.title}</span>
                          <div className="opacity-80 text-xs">
                            {format(event.start, 'HH:mm')} – {format(event.end, 'HH:mm')}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </ScrollArea>
            </div>
          )}
        </div>

        {/* Right Sidebar */}
        <div className="w-96 flex flex-col gap-4 overflow-hidden flex-shrink-0">
          {/* Events/Create/Meeting/View/Search Card */}
          <div className="flex-1 bg-card rounded-2xl border border-border p-4 flex flex-col overflow-hidden min-h-0">
            {sidebarMode === 'search' ? (
              <>
                {/* Search Results Header */}
                <div className="flex items-center gap-2 mb-4 flex-shrink-0">
                  <h3 className="text-lg font-semibold flex-1">Zoekresultaten</h3>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setSearchQuery('');
                      setSidebarMode('events');
                    }}
                    className="rounded-full"
                  >
                    Sluiten
                  </Button>
                </div>
                
                <ScrollArea className="flex-1">
                  <div className="space-y-2 pr-2">
                    {searchResults.length === 0 ? (
                      <p className="text-muted-foreground text-sm text-center py-8">
                        Geen resultaten gevonden
                      </p>
                    ) : (
                      searchResults.map((event) => (
                        <button
                          key={event.id}
                          onClick={() => navigateToEvent(event)}
                          className="w-full p-3 rounded-xl border-l-4 text-left hover:bg-muted/50 transition-colors"
                          style={{ 
                            borderLeftColor: event.color,
                            backgroundColor: `${event.color}10`
                          }}
                        >
                          <p className="font-medium text-sm">{event.title}</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {format(event.start, 'd MMMM yyyy', { locale: nl })}
                            {!event.allDay && ` • ${format(event.start, 'HH:mm')}`}
                          </p>
                          <span 
                            className="inline-block mt-2 text-xs px-2 py-0.5 rounded-full"
                            style={{ backgroundColor: event.color, color: 'white' }}
                          >
                            {event.source === 'task' ? 'Taak' : event.source === 'zermelo' ? 'Zermelo' : event.source === 'google' ? 'Google' : event.source === 'outlook' ? 'Outlook' : 'Lokaal'}
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                </ScrollArea>

                {/* Search bar at bottom while in search mode */}
                <div className="mt-4 pt-4 border-t border-border flex-shrink-0">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      value={searchQuery}
                      onChange={(e) => {
                        setSearchQuery(e.target.value);
                        if (!e.target.value.trim()) {
                          setSidebarMode('events');
                        }
                      }}
                      placeholder="Zoeken in Agenda"
                      className="pl-9 h-10"
                      autoFocus
                    />
                  </div>
                </div>
              </>
            ) : sidebarMode === 'view' && selectedEvent ? (
              <>
                {/* View/Edit Event Header */}
                <div className="flex items-center gap-2 mb-3 flex-shrink-0">
                  {selectedEvent.source === 'local' ? (
                    <Input
                      value={newEventTitle}
                      onChange={(e) => setNewEventTitle(e.target.value)}
                      className="text-lg font-semibold flex-1 border-none bg-transparent px-0 h-auto focus-visible:ring-0 focus-visible:ring-offset-0"
                      placeholder="Gebeurtenis"
                    />
                  ) : selectedEvent.source === 'task' ? (
                    <Input
                      value={editingTaskTitle}
                      onChange={(e) => setEditingTaskTitle(e.target.value)}
                      className="text-lg font-semibold flex-1 border-none bg-transparent px-0 h-auto focus-visible:ring-0 focus-visible:ring-offset-0"
                      placeholder="Taak"
                    />
                  ) : (
                    <h3 className="text-lg font-semibold flex-1">{selectedEvent.title}</h3>
                  )}
                  {selectedEvent.source === 'local' && (
                    <Button
                      size="sm"
                      onClick={saveSelectedEvent}
                      disabled={isSaving || !newEventTitle.trim()}
                      className="rounded-full"
                    >
                      {isSaving ? 'Opslaan...' : 'Opslaan'}
                    </Button>
                  )}
                  {selectedEvent.source === 'task' && (
                    <Button
                      size="sm"
                      onClick={saveTaskEdit}
                      disabled={isSaving || !editingTaskTitle.trim()}
                      className="rounded-full"
                    >
                      {isSaving ? 'Opslaan...' : 'Opslaan'}
                    </Button>
                  )}
                </div>
                
                <ScrollArea className="flex-1 -mx-1 px-1">
                  <div className="space-y-3 pr-2">
                    {selectedEvent.source === 'local' ? (
                      <>
                        {/* Editable fields for local events */}
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Type</Label>
                          <Select value={newEventType} onValueChange={setNewEventType}>
                            <SelectTrigger className="h-8 text-sm">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {EVENT_TYPES.map((type) => (
                                <SelectItem key={type.value} value={type.value}>
                                  {type.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Datum</Label>
                          <Input
                            type="date"
                            value={newEventStartDate}
                            onChange={(e) => setNewEventStartDate(e.target.value)}
                            className="h-8 text-sm"
                          />
                        </div>

                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Tijd</Label>
                          <div className="flex items-center gap-2">
                            <Input
                              type="time"
                              value={newEventStartTime}
                              onChange={(e) => setNewEventStartTime(e.target.value)}
                              className="h-8 text-sm flex-1"
                              disabled={newEventAllDay}
                            />
                            <span className="text-muted-foreground text-xs">-</span>
                            <Input
                              type="time"
                              value={newEventEndTime}
                              onChange={(e) => setNewEventEndTime(e.target.value)}
                              className="h-8 text-sm flex-1"
                              disabled={newEventAllDay}
                            />
                          </div>
                        </div>

                        <div className="flex items-center justify-between">
                          <Label className="text-xs text-muted-foreground">Hele dag</Label>
                          <Switch
                            checked={newEventAllDay}
                            onCheckedChange={setNewEventAllDay}
                          />
                        </div>

                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Locatie</Label>
                          <div className="relative">
                            <MapPin className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                            <Input
                              value={newEventLocation}
                              onChange={(e) => setNewEventLocation(e.target.value)}
                              className="h-8 text-sm pl-7"
                              placeholder="Voeg locatie toe"
                            />
                          </div>
                        </div>

                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Beschrijving</Label>
                          <Textarea
                            value={newEventDescription}
                            onChange={(e) => setNewEventDescription(e.target.value)}
                            className="min-h-[60px] text-sm resize-none"
                            placeholder=""
                          />
                        </div>

                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Kleur</Label>
                          <div className="flex gap-1.5 flex-wrap">
                            {EVENT_COLORS.map((color) => (
                              <button
                                key={color.name}
                                onClick={() => setNewEventColor(color.value)}
                                className={cn(
                                  "w-5 h-5 rounded-full transition-all",
                                  newEventColor === color.value && "ring-2 ring-offset-1 ring-primary"
                                )}
                                style={{ backgroundColor: color.value }}
                              />
                            ))}
                          </div>
                        </div>

                        <div className="pt-2">
                          <p className="text-xs text-muted-foreground">
                            Druk op Backspace om te verwijderen • Ctrl+Z om ongedaan te maken
                          </p>
                        </div>
                      </>
                    ) : selectedEvent.source === 'task' ? (
                      <>
                        {/* Editable fields for tasks */}
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Datum</Label>
                          <Input
                            type="date"
                            value={editingTaskDate}
                            onChange={(e) => setEditingTaskDate(e.target.value)}
                            className="h-8 text-sm"
                          />
                        </div>

                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Tijd (optioneel)</Label>
                          <Input
                            type="time"
                            value={editingTaskTime}
                            onChange={(e) => setEditingTaskTime(e.target.value)}
                            className="h-8 text-sm"
                          />
                        </div>

                        <div>
                          <Label className="text-xs text-muted-foreground">Bron</Label>
                          <span 
                            className="inline-block mt-1 text-xs px-2 py-0.5 rounded-full"
                            style={{ backgroundColor: selectedEvent.color, color: 'white' }}
                          >
                            Taak
                          </span>
                        </div>

                        <p className="text-xs text-muted-foreground pt-2">
                          Wijzigingen worden ook opgeslagen in Taken
                        </p>
                      </>
                    ) : (
                      <>
                        {/* Read-only view for imported events */}
                        <div className="space-y-3">
                          <div>
                            <Label className="text-xs text-muted-foreground">Datum & Tijd</Label>
                            <p className="text-sm font-medium">
                              {format(selectedEvent.start, 'd MMMM yyyy', { locale: nl })}
                              {!selectedEvent.allDay && (
                                <span className="text-muted-foreground ml-2">
                                  {format(selectedEvent.start, 'HH:mm')} - {format(selectedEvent.end, 'HH:mm')}
                                </span>
                              )}
                            </p>
                          </div>
                          
                          <div>
                            <Label className="text-xs text-muted-foreground">Bron</Label>
                            <span 
                              className="inline-block mt-1 text-xs px-2 py-0.5 rounded-full"
                              style={{ backgroundColor: selectedEvent.color, color: 'white' }}
                            >
                              {selectedEvent.source === 'zermelo' ? 'Zermelo' : selectedEvent.source === 'google' ? 'Google' : selectedEvent.source === 'outlook' ? 'Outlook' : 'Lokaal'}
                            </span>
                          </div>

                          <p className="text-xs text-muted-foreground">
                            Geïmporteerde events kunnen niet worden bewerkt
                          </p>
                        </div>
                      </>
                    )}
                  </div>
                </ScrollArea>
              </>
            ) : sidebarMode === 'create' ? (
              <>
                {/* Create Event Header - Non-editable placeholder */}
                <div className="flex items-center gap-2 mb-3 flex-shrink-0">
                  <h3 className="text-lg font-semibold flex-1 text-muted-foreground">Nieuwe Activiteit</h3>
                  <Button
                    size="sm"
                    onClick={saveEvent}
                    disabled={isSaving || !newEventTitle.trim()}
                    className="rounded-full"
                  >
                    {isSaving ? 'Opslaan...' : 'Opslaan'}
                  </Button>
                </div>
                
                <ScrollArea className="flex-1 -mx-1 px-1">
                  <div className="space-y-3 pr-2">
                    {/* Event Name */}
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Naam</Label>
                      <Input
                        value={newEventTitle === 'Nieuwe Gebeurtenis' ? '' : newEventTitle}
                        onChange={(e) => setNewEventTitle(e.target.value || 'Nieuwe Gebeurtenis')}
                        className="h-8 text-sm"
                        placeholder="Naam van de activiteit"
                      />
                    </div>

                    {/* Event Type */}
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Type</Label>
                      <Select value={newEventType} onValueChange={setNewEventType}>
                        <SelectTrigger className="h-8 text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {EVENT_TYPES.map((type) => (
                            <SelectItem key={type.value} value={type.value}>
                              {type.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Date */}
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Datum</Label>
                      <Input
                        type="date"
                        value={newEventStartDate}
                        onChange={(e) => setNewEventStartDate(e.target.value)}
                        className="h-8 text-sm"
                      />
                    </div>

                    {/* Time */}
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Tijd</Label>
                      <div className="flex items-center gap-2">
                        <Input
                          type="time"
                          value={newEventStartTime}
                          onChange={(e) => setNewEventStartTime(e.target.value)}
                          className="h-8 text-sm flex-1"
                          disabled={newEventAllDay}
                        />
                        <span className="text-muted-foreground text-xs">-</span>
                        <Input
                          type="time"
                          value={newEventEndTime}
                          onChange={(e) => setNewEventEndTime(e.target.value)}
                          className="h-8 text-sm flex-1"
                          disabled={newEventAllDay}
                        />
                      </div>
                      <span className="text-xs text-muted-foreground">{calculateDuration(newEventStartTime, newEventEndTime, newEventAllDay)}</span>
                    </div>

                    {/* All Day Toggle */}
                    <div className="flex items-center justify-between">
                      <Label className="text-xs text-muted-foreground">Hele dag</Label>
                      <Switch
                        checked={newEventAllDay}
                        onCheckedChange={setNewEventAllDay}
                      />
                    </div>

                    {/* Repeat */}
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Herhalen</Label>
                      <Select value={newEventRepeat} onValueChange={setNewEventRepeat}>
                        <SelectTrigger className="h-8 text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Nooit</SelectItem>
                          <SelectItem value="daily">Dagelijks</SelectItem>
                          <SelectItem value="weekly">Wekelijks</SelectItem>
                          <SelectItem value="monthly">Maandelijks</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Location */}
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Locatie</Label>
                      <div className="relative">
                        <MapPin className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                        <Input
                          value={newEventLocation}
                          onChange={(e) => setNewEventLocation(e.target.value)}
                          className="h-8 text-sm pl-7"
                          placeholder="Voeg locatie toe"
                        />
                      </div>
                    </div>

                    {/* Description */}
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Beschrijving</Label>
                      <Textarea
                        value={newEventDescription}
                        onChange={(e) => setNewEventDescription(e.target.value)}
                        className="min-h-[60px] text-sm resize-none"
                        placeholder=""
                      />
                    </div>

                    {/* Color */}
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Kleur</Label>
                      <div className="flex gap-1.5 flex-wrap">
                        {EVENT_COLORS.map((color) => (
                          <button
                            key={color.name}
                            onClick={() => setNewEventColor(color.value)}
                            className={cn(
                              "w-5 h-5 rounded-full transition-all",
                              newEventColor === color.value && "ring-2 ring-offset-1 ring-primary"
                            )}
                            style={{ backgroundColor: color.value }}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                </ScrollArea>
              </>
            ) : sidebarMode === 'meeting' ? (
              <>
                {/* Meeting Header - Non-editable placeholder */}
                <div className="flex items-center gap-2 mb-3 flex-shrink-0">
                  <h3 className="text-lg font-semibold flex-1 text-muted-foreground">Nieuwe Afspraak</h3>
                  <Button
                    size="sm"
                    onClick={saveMeeting}
                    disabled={isSaving || !meetingTitle.trim()}
                    className="rounded-full"
                  >
                    {isSaving ? 'Opslaan...' : 'Opslaan'}
                  </Button>
                </div>
                
                <ScrollArea className="flex-1 -mx-1 px-1">
                  <div className="space-y-3 pr-2">
                    {/* Meeting Name */}
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Naam</Label>
                      <Input
                        value={meetingTitle === 'Nieuwe Afspraak' ? '' : meetingTitle}
                        onChange={(e) => setMeetingTitle(e.target.value || 'Nieuwe Afspraak')}
                        className="h-8 text-sm"
                        placeholder="Naam van de afspraak"
                      />
                    </div>

                    {/* Date */}
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Datum</Label>
                      <Input
                        type="date"
                        value={meetingStartDate}
                        onChange={(e) => setMeetingStartDate(e.target.value)}
                        className="h-8 text-sm"
                      />
                    </div>

                    {/* Time */}
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Tijd</Label>
                      <div className="flex items-center gap-2">
                        <Input
                          type="time"
                          value={meetingStartTime}
                          onChange={(e) => setMeetingStartTime(e.target.value)}
                          className="h-8 text-sm flex-1"
                          disabled={meetingAllDay}
                        />
                        <span className="text-muted-foreground text-xs">-</span>
                        <Input
                          type="time"
                          value={meetingEndTime}
                          onChange={(e) => setMeetingEndTime(e.target.value)}
                          className="h-8 text-sm flex-1"
                          disabled={meetingAllDay}
                        />
                      </div>
                      <span className="text-xs text-muted-foreground">{calculateDuration(meetingStartTime, meetingEndTime, meetingAllDay)}</span>
                    </div>

                    {/* All Day Toggle */}
                    <div className="flex items-center justify-between">
                      <Label className="text-xs text-muted-foreground">Hele dag</Label>
                      <Switch
                        checked={meetingAllDay}
                        onCheckedChange={setMeetingAllDay}
                      />
                    </div>

                    {/* Invitees */}
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Uitnodigen</Label>
                      <UserInviteSearch
                        invitees={meetingInvitees}
                        onInviteesChange={setMeetingInvitees}
                      />
                    </div>

                    {/* Location */}
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Locatie</Label>
                      <div className="relative">
                        <MapPin className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                        <Input
                          value={meetingLocation}
                          onChange={(e) => setMeetingLocation(e.target.value)}
                          className="h-8 text-sm pl-7"
                          placeholder="Voeg locatie toe"
                        />
                      </div>
                    </div>

                    {/* Description */}
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Beschrijving</Label>
                      <Textarea
                        value={meetingDescription}
                        onChange={(e) => setMeetingDescription(e.target.value)}
                        className="min-h-[60px] text-sm resize-none"
                        placeholder=""
                      />
                    </div>

                    {/* Color */}
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Kleur</Label>
                      <div className="flex gap-1.5 flex-wrap">
                        {EVENT_COLORS.map((color) => (
                          <button
                            key={color.name}
                            onClick={() => setMeetingColor(color.value)}
                            className={cn(
                              "w-5 h-5 rounded-full transition-all",
                              meetingColor === color.value && "ring-2 ring-offset-1 ring-primary"
                            )}
                            style={{ backgroundColor: color.value }}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                </ScrollArea>
              </>
            ) : (
              <>
                {/* Selected Day Events Header */}
                <div className="flex items-center justify-between mb-4 flex-shrink-0">
                  <div>
                    <h3 className="text-lg font-semibold">
                      {format(selectedDate, 'd MMMM', { locale: nl })}
                    </h3>
                    <p className="text-sm text-muted-foreground capitalize">
                      {format(selectedDate, 'EEEE', { locale: nl })}
                    </p>
                  </div>
                </div>

                {loading ? (
                  <div className="flex-1 flex items-center justify-center">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                  </div>
                ) : eventsForSelectedDate.length === 0 ? (
                  <div className="flex-1 flex items-center justify-center">
                    <p className="text-muted-foreground text-sm">Geen afspraken</p>
                  </div>
                ) : (
                  <ScrollArea className="flex-1">
                    <div className="space-y-2 pr-2">
                      {eventsForSelectedDate.map((event) => (
                        <button
                          key={event.id}
                          onClick={(e) => handleEventClick(event, e)}
                          className="w-full p-3 rounded-xl border-l-4 text-left hover:bg-muted/50 transition-colors"
                          style={{ 
                            borderLeftColor: event.color,
                            backgroundColor: `${event.color}10`
                          }}
                        >
                          <p className="font-medium text-sm">{event.title}</p>
                          {!event.allDay && (
                            <p className="text-xs text-muted-foreground mt-1">
                              {format(event.start, 'HH:mm')}
                              {event.end && event.start.getTime() !== event.end.getTime() && 
                                ` - ${format(event.end, 'HH:mm')}`}
                            </p>
                          )}
                          <span 
                            className="inline-block mt-2 text-xs px-2 py-0.5 rounded-full"
                            style={{ backgroundColor: event.color, color: 'white' }}
                          >
                            {event.source === 'task' ? 'Taak' : event.source === 'zermelo' ? 'Zermelo' : event.source === 'google' ? 'Google' : event.source === 'outlook' ? 'Outlook' : 'Lokaal'}
                          </span>
                        </button>
                      ))}
                    </div>
                  </ScrollArea>
                )}

                {/* Search */}
                <div className="mt-4 pt-4 border-t border-border flex-shrink-0">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      value={searchQuery}
                      onChange={(e) => {
                        setSearchQuery(e.target.value);
                        if (e.target.value.trim()) {
                          setSidebarMode('search');
                        }
                      }}
                      placeholder="Zoeken in Agenda"
                      className="pl-9 h-10"
                    />
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Action Buttons - Only show in events mode */}
          {sidebarMode === 'events' && (
            <div className="flex flex-col gap-2 flex-shrink-0">
              <Button
                variant="outline"
                className="w-full h-12 justify-start gap-3 rounded-xl"
                onClick={() => setSidebarMode('create')}
              >
                <Plus className="w-5 h-5" />
                Voeg gebeurtenis toe
              </Button>
              <Button
                variant="outline"
                className="w-full h-12 justify-start gap-3 rounded-xl"
                onClick={() => setSidebarMode('meeting')}
              >
                <Monitor className="w-5 h-5" />
                Maak een afspraak
              </Button>
            </div>
          )}

          {/* Back button in create mode */}
          {sidebarMode === 'create' && (
            <Button
              variant="outline"
              className="w-full h-12 rounded-xl flex-shrink-0"
              onClick={resetEventForm}
            >
              Annuleren
            </Button>
          )}

          {/* Back button in meeting mode */}
          {sidebarMode === 'meeting' && (
            <Button
              variant="outline"
              className="w-full h-12 rounded-xl flex-shrink-0"
              onClick={resetMeetingForm}
            >
              Annuleren
            </Button>
          )}

          {/* Back button in view mode */}
          {sidebarMode === 'view' && (
            <Button
              variant="outline"
              className="w-full h-12 rounded-xl flex-shrink-0"
              onClick={() => {
                setSelectedEvent(null);
                setSidebarMode('events');
              }}
            >
              Terug
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export default Agenda;
