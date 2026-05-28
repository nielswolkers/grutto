import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Loader2, Upload } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { saveStudySet } from "@/lib/studyData";
import { StudySet } from "@/types/study";
import { toast } from "sonner";

interface SubjectOption {
  id: string;
  name: string;
  emoji: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  subjects: SubjectOption[];
  defaultSubjectId?: string | null;
  onImported: (id: string) => void;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const result = r.result as string;
      resolve(result.split(",")[1] || "");
    };
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

function genId() {
  return Math.random().toString(36).slice(2, 9);
}

export default function ImportStudySetDialog({ open, onClose, subjects, defaultSubjectId, onImported }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [subjectId, setSubjectId] = useState<string>(defaultSubjectId || "");
  const [loading, setLoading] = useState(false);

  async function handleImport() {
    if (!file) return toast.error("Kies een bestand of foto");
    if (!subjectId) return toast.error("Kies een vak");

    setLoading(true);
    try {
      const base64 = await fileToBase64(file);
      const { data, error } = await supabase.functions.invoke("extract-studyset", {
        body: { fileBase64: base64, mimeType: file.type, fileName: file.name },
      });
      if (error) throw error;
      if (!data?.cards || !Array.isArray(data.cards) || data.cards.length === 0) {
        throw new Error("Geen kaarten gegenereerd");
      }

      const newSet: StudySet = {
        id: genId(),
        title: data.title || file.name.replace(/\.[^.]+$/, ""),
        description: data.description || "",
        emoji: data.emoji || "📚",
        color: "indigo",
        subjectId,
        cards: data.cards.map((c: any) => ({
          id: genId(),
          term: String(c.term || "").trim(),
          definition: String(c.definition || "").trim(),
        })).filter((c: any) => c.term && c.definition),
        createdAt: Date.now(),
      };

      saveStudySet(newSet);
      toast.success(`Studieset aangemaakt met ${newSet.cards.length} kaarten!`);
      setFile(null);
      onImported(newSet.id);
      onClose();
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "Importeren mislukt");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Importeer studieset</DialogTitle>
          <DialogDescription>
            Upload een document of foto. AI maakt automatisch flashcards.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Vak</Label>
            <Select value={subjectId} onValueChange={setSubjectId}>
              <SelectTrigger><SelectValue placeholder="Kies een vak" /></SelectTrigger>
              <SelectContent>
                {subjects.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    <span className="mr-2">{s.emoji}</span>{s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Bestand of foto</Label>
            <Input
              type="file"
              accept="image/*,application/pdf"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
            {file && <p className="text-xs text-muted-foreground">{file.name}</p>}
          </div>
          <div className="flex gap-2 pt-2">
            <Button variant="outline" onClick={onClose} className="flex-1 rounded-full" disabled={loading}>
              Annuleren
            </Button>
            <Button onClick={handleImport} disabled={loading || !file} className="flex-1 rounded-full gap-2">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              {loading ? "Bezig..." : "Importeer"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
