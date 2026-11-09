import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { magisterLogin, magisterFetch, saveImport, type YearInfo } from "@/lib/magister";

/** Login (MagImp window) → choose classes → import with loading until fully done. */
export function useMagisterConnect() {
  const { toast } = useToast();
  const [years, setYears] = useState<YearInfo[] | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const start = async () => {
    setBusy("Inloggen bij Magister…");
    try {
      const res = await magisterLogin();
      const sorted = [...res.years].sort((a, b) => b.begin.localeCompare(a.begin));
      setToken(res.refresh_token); setYears(sorted); setSelected(sorted.slice(0, 1).map((y) => y.id));
    } catch (e: any) { toast({ title: "Koppelen mislukt", description: e?.message ?? String(e), variant: "destructive" }); }
    finally { setBusy(null); }
  };

  const importNow = async () => {
    if (!token) { toast({ title: "Geen Magister-sessie", variant: "destructive" }); return; }
    const ids = selected; setYears(null);
    setBusy("Cijfers en aanwezigheid importeren…");
    try {
      const res = await magisterFetch(token, ids);
      await saveImport(res.refresh_token ?? token, ids, res.years);
      toast({ title: "Magister gesynchroniseerd" });
    } catch (e: any) { toast({ title: "Importeren mislukt", description: e?.message ?? String(e), variant: "destructive" }); }
    finally { setBusy(null); }
  };

  const element = (
    <>
      <Dialog open={!!years} onOpenChange={(o) => !o && setYears(null)}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle>Welke klassen synchroniseren?</DialogTitle>
            <DialogDescription>Kies de klassen waarvan je cijfers wilt importeren.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 max-h-72 overflow-y-auto">
            {years?.map((y) => (
              <label key={y.id} className="flex items-center gap-3 rounded-xl bg-secondary/40 px-4 py-3 cursor-pointer">
                <Checkbox checked={selected.includes(y.id)} onCheckedChange={(c) => setSelected((s) => c ? [...s, y.id] : s.filter((x) => x !== y.id))} />
                <span className="font-medium">{y.class_label || y.period}</span>
              </label>
            ))}
          </div>
          <Button onClick={importNow} disabled={!selected.length} className="rounded-full bg-primary text-primary-foreground">Importeren</Button>
        </DialogContent>
      </Dialog>
      <Dialog open={!!busy}>
        <DialogContent className="rounded-2xl [&>button]:hidden" onInteractOutside={(e) => e.preventDefault()}>
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="font-medium">{busy}</p>
            <p className="text-sm text-muted-foreground">Even geduld, dit kan een minuut duren.</p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
  return { start, element, busy: !!busy };
}
