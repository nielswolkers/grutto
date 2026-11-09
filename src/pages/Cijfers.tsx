import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChevronRight, CheckCircle2, UserX, Clock3, CalendarDays, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { loadYears, getConnection, autoSync, numericGrade, classOf, type SchoolYear } from "@/lib/magister";
import { useMagisterConnect } from "@/components/magister/MagisterConnectFlow";

export default function Cijfers() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [years, setYears] = useState<SchoolYear[]>([]);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [syncing, setSyncing] = useState(false);
  const connect = useMagisterConnect();

  const refresh = async () => {
    const [conn, ys] = await Promise.all([getConnection(), loadYears()]);
    setConnected(!!conn); setYears(ys);
  };
  useEffect(() => {
    refresh();
    const h = () => refresh();
    window.addEventListener("magister-updated", h);
    return () => window.removeEventListener("magister-updated", h);
  }, []);

  const yearId = Number(params.get("jaar")) || years[0]?.id;
  const year = years.find((y) => y.id === yearId) ?? years[0];

  const averages = useMemo(() => (year?.course_averages ?? [])
    .map((a) => ({ course: a.course, average: numericGrade(a.average), shown: a.average }))
    .filter((a) => a.average !== null)
    .sort((a, b) => a.course.localeCompare(b.course)), [year]);

  const courses = useMemo(() => {
    const set = new Set<string>([...(year?.grades ?? []).map((g) => g.course || "Overig"), ...averages.map((a) => a.course)]);
    return [...set].sort((a, b) => a.localeCompare(b)).map((c) => ({ course: c, average: year?.course_averages.find((a) => a.course === c)?.average }));
  }, [year, averages]);

  if (connected === null) return <div className="p-8 text-muted-foreground">Laden…</div>;

  if (!connected || !years.length) return (
    <div className="flex min-h-[70vh] items-center justify-center p-6">
      <div className="max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
        <p className="text-lg font-medium">Magister is nog niet gekoppeld aan Grutto. Verbind met magister om je cijfers te weergeven</p>
        <Button onClick={connect.start} disabled={connect.busy} className="mt-6 rounded-full bg-primary px-6 text-primary-foreground hover:bg-primary/90">Verbinden met Magister</Button>
      </div>
      {connect.element}
    </div>
  );

  const attendance = year?.attendance;
  const sync = async () => { setSyncing(true); await autoSync(); setSyncing(false); };

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 p-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex gap-1 overflow-x-auto rounded-full bg-muted p-1">
          {years.map((y) => (
            <button key={y.id} onClick={() => setParams({ jaar: String(y.id) })}
              className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition ${y.id === year?.id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}>
              {classOf(y.label)}
            </button>
          ))}
        </div>
        <button aria-label="Synchroniseren" onClick={sync} disabled={syncing} className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card text-muted-foreground">
          <RefreshCw size={16} className={syncing ? "animate-spin" : ""} />
        </button>
      </div>

      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <h2 className="mb-3 text-xl font-semibold">Gemiddeldes</h2>
        {averages.length ? (
          <div className="h-[320px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={averages} margin={{ top: 8, right: 8, left: -20, bottom: 40 }}>
                <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="hsl(var(--border))" />
                <XAxis dataKey="course" interval={0} angle={-30} textAnchor="end" height={60} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                <YAxis domain={[1, 10]} ticks={[1, 5, 10]} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                <ReferenceLine y={5.5} stroke="hsl(var(--destructive))" strokeDasharray="10 6" strokeWidth={2} />
                <Tooltip cursor={{ fill: "hsl(var(--muted))" }} formatter={(_v, _n, p: any) => [p.payload.shown, "Gemiddelde"]} />
                <Bar dataKey="average" fill="hsl(var(--primary))" radius={[10, 10, 4, 4]} maxBarSize={36} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : <p className="py-10 text-center text-sm text-muted-foreground">Nog geen gemiddeldes voor dit jaar.</p>}
      </section>

      <section className="space-y-1">
        {courses.map(({ course, average }) => {
          const n = numericGrade(average);
          return (
            <button key={course} onClick={() => navigate(`/cijfers/vak/${encodeURIComponent(course)}?jaar=${year?.id}`)}
              className="flex w-full items-center gap-4 rounded-2xl px-3 py-3 text-left transition hover:bg-secondary/50">
              <span className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-base font-semibold tabular-nums ${n === null ? "bg-muted text-muted-foreground" : n >= 5.5 ? "bg-primary/15 text-primary" : "bg-destructive/10 text-destructive"}`}>{average ?? "—"}</span>
              <span className="flex-1 text-lg">{course}</span>
              <ChevronRight className="h-5 w-5 text-muted-foreground" />
            </button>
          );
        })}
      </section>

      {/* Aanwezigheid — exact MagImp card */}
      <section className="rounded-[20px] border border-[#e9eeea] bg-white p-5 shadow-[0_3px_16px_rgba(32,57,42,.035)]">
        <div className="mb-4"><h2 className="text-sm font-semibold text-[#35443b]">Aanwezigheid</h2><p className="mt-1 text-[10px] text-[#9aa59d]">Dit schooljaar</p></div>
        {attendance && attendance.total_lessons > 0 ? <>
          <div className="flex items-end justify-between"><div><p className="text-[32px] font-semibold tracking-tight text-[#5f9277] tabular-nums">{attendance.percentage}<span className="text-base">%</span></p><p className="text-[10px] text-[#9aa59d]">Aanwezig</p></div><p className="text-[10px] text-[#9aa59d]">{attendance.present} van {attendance.total_lessons - attendance.excused} lessen</p></div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#edf1ee]"><div className="h-full rounded-full bg-[#78a58d]" style={{ width: `${attendance.percentage}%` }} /></div>
          <div className="mt-4 grid grid-cols-4 gap-2">
            <MiniStat icon={<CheckCircle2 size={13}/>} label="Aanwezig" value={attendance.present}/>
            <MiniStat icon={<UserX size={13}/>} label="Afwezig" value={attendance.absent}/>
            <MiniStat icon={<Clock3 size={13}/>} label="Te laat" value={attendance.late}/>
            <MiniStat icon={<CalendarDays size={13}/>} label="Geoorloofd" value={attendance.excused}/>
          </div>
        </> : <p className="py-5 text-center text-xs text-[#9aa59d]">Geen aanwezigheidsgegevens ontvangen.</p>}
      </section>
    </div>
  );
}

function MiniStat({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return <div className="rounded-xl bg-[#f7f9f7] px-1.5 py-2 text-center"><div className="flex items-center justify-center gap-1 text-[9px] text-[#8d9a90]">{icon}{label}</div><p className="mt-1 text-sm font-semibold tabular-nums text-[#45564b]">{value}</p></div>;
}
