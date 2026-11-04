import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface SessionRow {
  user_id: string;
  started_at: string;
  is_active: boolean;
  is_paused: boolean;
  elapsed_seconds: number;
  last_resumed_at: string | null;
  duration_minutes: number | null;
  subject_name: string | null;
}

interface ProfileRow {
  user_id: string;
  username: string;
  full_name: string;
  display_name: string | null;
  avatar_url: string | null;
}

/** Seconds studied in a session, counting only un-paused time. */
export function sessionSeconds(s: SessionRow, now = Date.now()): number {
  if (!s.is_active) {
    return Math.max((s.duration_minutes || 0) * 60, s.elapsed_seconds || 0);
  }
  let secs = s.elapsed_seconds || 0;
  if (!s.is_paused) {
    const from = s.last_resumed_at || (secs === 0 ? s.started_at : null);
    if (from) secs += Math.max(0, Math.floor((now - new Date(from).getTime()) / 1000));
  }
  return secs;
}

const fmt = (secs: number) => {
  const m = Math.floor(secs / 60);
  const h = Math.floor(m / 60);
  return h > 0 ? `${h}u ${m % 60}m` : `${m}m`;
};

const initials = (n: string) => n.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase();

interface Props {
  userIds: string[];
  onOpenProfile?: (username: string) => void;
}

export function MemberStatsGrid({ userIds, onOpenProfile }: Props) {
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [now, setNow] = useState(Date.now());
  const [openId, setOpenId] = useState<string | null>(null);
  const key = userIds.join(",");

  useEffect(() => {
    if (userIds.length === 0) return;
    supabase.from("profiles").select("user_id, username, full_name, display_name, avatar_url").in("user_id", userIds)
      .then(({ data }) => setProfiles((data as ProfileRow[]) || []));

    const load = async () => {
      const start = new Date(); start.setHours(0, 0, 0, 0);
      const { data } = await supabase
        .from("study_sessions")
        .select("user_id, started_at, is_active, is_paused, elapsed_seconds, last_resumed_at, duration_minutes, subject_name")
        .in("user_id", userIds)
        .gte("started_at", start.toISOString());
      setSessions((data as SessionRow[]) || []);
    };
    load();
    const poll = setInterval(load, 30000);
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => { clearInterval(poll); clearInterval(tick); };
  }, [key]);

  const stats = useMemo(() => {
    const map = new Map<string, { total: number; maxFocus: number; status: "active" | "paused" | null; perCourse: Map<string, number> }>();
    for (const id of userIds) map.set(id, { total: 0, maxFocus: 0, status: null, perCourse: new Map() });
    for (const s of sessions) {
      const st = map.get(s.user_id);
      if (!st) continue;
      const secs = sessionSeconds(s, now);
      st.total += secs;
      st.maxFocus = Math.max(st.maxFocus, secs);
      if (s.is_active) st.status = s.is_paused ? "paused" : "active";
      const course = s.subject_name || "Geen vak";
      st.perCourse.set(course, (st.perCourse.get(course) || 0) + secs);
    }
    return map;
  }, [sessions, now, key]);

  const ordered = userIds
    .map((id) => ({ id, profile: profiles.find((p) => p.user_id === id), stat: stats.get(id)! }))
    .sort((a, b) => b.stat.total - a.stat.total);

  const open = ordered.find((o) => o.id === openId);
  const openName = open?.profile?.display_name || open?.profile?.full_name || "Onbekend";
  const courses = open ? [...open.stat.perCourse.entries()].sort((a, b) => b[1] - a[1]) : [];

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
        {ordered.map(({ id, profile, stat }) => {
          const name = profile?.display_name || profile?.full_name || "Onbekend";
          return (
            <button
              key={id}
              onClick={() => setOpenId(id)}
              className="aspect-square rounded-2xl border bg-card p-4 flex flex-col items-center justify-center gap-2 text-center hover:shadow-md transition-shadow relative"
            >
              {stat.status && (
                <span className={`absolute top-3 right-3 w-2.5 h-2.5 rounded-full animate-pulse ${stat.status === "active" ? "bg-green-500" : "bg-orange-500"}`} />
              )}
              <Avatar className="w-16 h-16">
                {profile?.avatar_url && <AvatarImage src={profile.avatar_url} className="object-cover" />}
                <AvatarFallback className="font-semibold">{initials(name)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 w-full">
                <p className="font-medium truncate">{name}</p>
                <p className="text-xs text-muted-foreground truncate">@{profile?.username}</p>
              </div>
              <p className={`text-lg font-bold tabular-nums ${stat.status === "active" ? "text-green-600" : ""}`}>{fmt(stat.total)}</p>
              <p className="text-xs text-muted-foreground -mt-2">vandaag</p>
            </button>
          );
        })}
      </div>

      <Dialog open={!!open} onOpenChange={(o) => !o && setOpenId(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Statistieken van {openName}</DialogTitle>
          </DialogHeader>
          {open && (
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-muted p-4">
                  <p className="text-xs text-muted-foreground">Totaal vandaag</p>
                  <p className="text-2xl font-bold tabular-nums">{fmt(open.stat.total)}</p>
                </div>
                <div className="rounded-xl bg-muted p-4">
                  <p className="text-xs text-muted-foreground">Langste focus</p>
                  <p className="text-2xl font-bold tabular-nums">{fmt(open.stat.maxFocus)}</p>
                </div>
              </div>
              <div className="space-y-3">
                <p className="text-sm font-medium">Per vak</p>
                {courses.length === 0 && <p className="text-sm text-muted-foreground">Vandaag nog niet gestudeerd.</p>}
                {courses.map(([course, secs]) => {
                  const pct = open.stat.total > 0 ? Math.round((secs / open.stat.total) * 100) : 0;
                  return (
                    <div key={course} className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className="font-medium">{course}</span>
                        <span className="text-muted-foreground tabular-nums">{fmt(secs)} · {pct}%</span>
                      </div>
                      <div className="h-2 rounded-full bg-muted overflow-hidden">
                        <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
              {open.profile?.username && onOpenProfile && (
                <Button variant="outline" className="w-full rounded-full" onClick={() => onOpenProfile(open.profile!.username)}>
                  Bekijk profiel
                </Button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
