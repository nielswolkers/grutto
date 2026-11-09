import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useBackNavigation } from "@/hooks/useBackNavigation";
import { loadYears, numericGrade, classOf, type SchoolYear, type GradeRow } from "@/lib/magister";

const fmt = (d?: string) => d ? new Date(d).toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" }) : "—";

export default function CijfersVak() {
  const { course = "" } = useParams();
  const [params] = useSearchParams();
  const [years, setYears] = useState<SchoolYear[]>([]);
  const [open, setOpen] = useState<GradeRow | null>(null);
  const back = useBackNavigation(`/cijfers?jaar=${params.get("jaar") ?? ""}`);
  useEffect(() => { loadYears().then(setYears); }, []);
  const year = years.find((y) => y.id === Number(params.get("jaar"))) ?? years[0];
  const name = decodeURIComponent(course);
  const rows = useMemo(() => (year?.grades ?? []).filter((g) => (g.course || "Overig") === name)
    .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? "")), [year, name]);
  const average = year?.course_averages.find((a) => a.course === name)?.average;

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 p-6">
      <div className="flex items-center gap-3">
        <button onClick={back} aria-label="Terug" className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-secondary"><ArrowLeft className="h-5 w-5" /></button>
        <div className="flex-1"><h1 className="text-4xl font-bold">{name}</h1><p className="text-sm text-muted-foreground">{year ? classOf(year.label) : ""} · Gemiddelde {average ?? "—"}</p></div>
      </div>
      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        {rows.length ? rows.map((r, i) => {
          const n = numericGrade(r.grade);
          return (
            <button key={i} onClick={() => setOpen(r)} className={`flex w-full items-center gap-4 px-5 py-4 text-left hover:bg-secondary/40 ${i ? "border-t border-border" : ""}`}>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{r.title || "Toets"}</p>
                <p className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">{fmt(r.date)} · Weging {r.weight || "—"}{r.pta && <span className="rounded-full bg-orange-100 px-2 py-0.5 font-medium text-orange-600">PTA</span>}</p>
              </div>
              <span className={`rounded-xl px-3 py-1.5 font-semibold tabular-nums ${n === null ? "bg-muted text-muted-foreground" : n >= 5.5 ? "bg-primary/15 text-primary" : "bg-destructive/10 text-destructive"}`}>{r.grade || "—"}</span>
            </button>
          );
        }) : <p className="p-8 text-center text-sm text-muted-foreground">Geen toetsen gevonden.</p>}
      </div>
      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="rounded-2xl">
          <DialogHeader><DialogTitle className="flex items-center gap-2">{open?.title || "Toets"}{open?.pta && <span className="rounded-full bg-orange-100 px-2.5 py-0.5 text-xs font-medium text-orange-600">PTA</span>}</DialogTitle></DialogHeader>
          {open && <div className="space-y-2 text-sm">
            <p className="text-center text-5xl font-bold tabular-nums">{open.grade || "—"}</p>
            {([
              ["Ondertitel", open.subtitle], ["Vak", open.course], ["Weging", open.weight], ["Datum", fmt(open.date)],
              ["Periode", open.period], ["PTA", open.pta ? "Ja" : "Nee"],
              ["Voldoende", open.passed == null ? undefined : open.passed ? "Ja" : "Nee"], ["Klas", year ? classOf(year.label) : undefined],
            ] as [string, string | undefined][]).filter(([, v]) => v).map(([k, v]) => (
              <div key={k} className="flex justify-between rounded-xl bg-secondary/40 px-4 py-2.5"><span className="text-muted-foreground">{k}</span><span className="font-medium">{v}</span></div>
            ))}
          </div>}
        </DialogContent>
      </Dialog>
    </div>
  );
}
