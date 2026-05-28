import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

interface Subject {
  id: string;
  name: string;
  emoji: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  subjects: Subject[];
  onChanged: () => void;
}

export default function SubjectEditDialog({ open, onClose, subjects, onChanged }: Props) {
  const [editing, setEditing] = useState<Record<string, { name: string; emoji: string }>>({});

  useEffect(() => {
    const init: Record<string, { name: string; emoji: string }> = {};
    subjects.forEach((s) => (init[s.id] = { name: s.name, emoji: s.emoji }));
    setEditing(init);
  }, [subjects, open]);

  async function save(id: string) {
    const v = editing[id];
    if (!v?.name.trim()) return;
    const { error } = await supabase
      .from("subjects")
      .update({ name: v.name.trim(), emoji: v.emoji || "📚" })
      .eq("id", id);
    if (error) return toast.error("Kon vak niet opslaan");
    toast.success("Opgeslagen");
    onChanged();
  }

  async function remove(id: string) {
    if (!confirm("Weet je zeker dat je dit vak wilt verwijderen?")) return;
    const { error } = await supabase.from("subjects").delete().eq("id", id);
    if (error) return toast.error("Kon vak niet verwijderen");
    toast.success("Vak verwijderd");
    onChanged();
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Vakken bewerken</DialogTitle>
          <DialogDescription>Hernoem, verander de emoji of verwijder vakken.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 max-h-[60vh] overflow-y-auto">
          {subjects.length === 0 && (
            <p className="text-sm text-muted-foreground">Nog geen vakken.</p>
          )}
          {subjects.map((s) => {
            const v = editing[s.id] ?? { name: s.name, emoji: s.emoji };
            return (
              <div key={s.id} className="flex items-end gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Emoji</Label>
                  <Input
                    value={v.emoji}
                    onChange={(e) =>
                      setEditing((p) => ({ ...p, [s.id]: { ...v, emoji: e.target.value } }))
                    }
                    maxLength={4}
                    className="w-16 text-center text-xl"
                  />
                </div>
                <div className="space-y-1 flex-1">
                  <Label className="text-xs">Naam</Label>
                  <Input
                    value={v.name}
                    onChange={(e) =>
                      setEditing((p) => ({ ...p, [s.id]: { ...v, name: e.target.value } }))
                    }
                  />
                </div>
                <Button size="sm" onClick={() => save(s.id)} className="rounded-full">
                  Opslaan
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="text-destructive hover:text-destructive"
                  onClick={() => remove(s.id)}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            );
          })}
        </div>
        <div className="flex justify-end pt-2">
          <Button variant="outline" onClick={onClose} className="rounded-full">
            Sluiten
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
