import { useState } from "react";
import { Flashcard } from "@/types/study";
import { createStudySet } from "@/lib/studySets";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Trash2, Save, ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const EMOJIS = ["📚", "🧬", "🌍", "🇪🇸", "🔢", "⚛️", "🎨", "💡", "🏛️", "🌱", "🎵", "💻"];
const genId = () => Math.random().toString(36).slice(2, 9);

interface SubjectOption { id: string; name: string; emoji: string; }
interface Props {
  onBack: () => void;
  onCreated: (id: string) => void;
  subjects: SubjectOption[];
  defaultSubjectId?: string | null;
}

export default function CreateStudySet({ onBack, onCreated, subjects, defaultSubjectId }: Props) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [emoji, setEmoji] = useState("📚");
  const [subjectId, setSubjectId] = useState<string>(defaultSubjectId || "");
  const [saving, setSaving] = useState(false);
  const [cards, setCards] = useState<Flashcard[]>([
    { id: genId(), term: "", definition: "" },
    { id: genId(), term: "", definition: "" },
    { id: genId(), term: "", definition: "" },
  ]);

  async function handleSave() {
    if (!title.trim()) { toast.error("Voeg een titel toe"); return; }
    if (!subjectId) { toast.error("Kies een vak"); return; }
    const validCards = cards.filter(c => c.term.trim() && c.definition.trim());
    if (validCards.length < 2) { toast.error("Voeg minstens 2 kaarten toe"); return; }
    setSaving(true);
    try {
      const id = await createStudySet({
        title: title.trim(), description: description.trim(), emoji, subjectId,
        cards: validCards.map(({ term, definition }) => ({ term, definition })),
      });
      toast.success("Studieset aangemaakt!");
      onCreated(id);
    } catch (e: any) {
      toast.error(e?.message || "Aanmaken mislukt");
    } finally { setSaving(false); }
  }

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" onClick={onBack} className="rounded-full gap-2">
        <ArrowLeft className="w-4 h-4" /> Terug
      </Button>
      <h2 className="text-xl font-bold">Nieuwe Studieset</h2>

      <div className="space-y-4">
        <div className="flex flex-wrap gap-1">
          {EMOJIS.map(e => (
            <button key={e} onClick={() => setEmoji(e)} className={cn("w-8 h-8 rounded-lg flex items-center justify-center text-lg", emoji === e ? "bg-primary/20 ring-2 ring-primary" : "hover:bg-muted")}>
              {e}
            </button>
          ))}
        </div>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Titel van je set" className="text-lg font-semibold" />
        <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Beschrijving (optioneel)" />

        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Vak</label>
          <Select value={subjectId} onValueChange={setSubjectId}>
            <SelectTrigger className="rounded-xl"><SelectValue placeholder="Kies een vak" /></SelectTrigger>
            <SelectContent>
              {subjects.length === 0 ? (
                <SelectItem value="__none" disabled>Geen vakken — maak er eerst een aan</SelectItem>
              ) : subjects.map(s => (
                <SelectItem key={s.id} value={s.id}><span className="mr-2">{s.emoji}</span>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-3">
          <Button variant="outline" onClick={() => setCards([{ id: genId(), term: "", definition: "" }, ...cards])} className="rounded-full gap-2">
            <Plus className="w-4 h-4" /> Kaart toevoegen
          </Button>
          {cards.map((card, i) => (
            <div key={card.id} className="flex gap-2 items-start">
              <span className="text-xs text-muted-foreground mt-3 w-5">{i + 1}</span>
              <Input value={card.term} onChange={(e) => { const n = [...cards]; n[i] = { ...card, term: e.target.value }; setCards(n); }} placeholder="Term" className="flex-1" />
              <Input value={card.definition} onChange={(e) => { const n = [...cards]; n[i] = { ...card, definition: e.target.value }; setCards(n); }} placeholder="Definitie" className="flex-1" />
              {cards.length > 2 && (
                <Button variant="ghost" size="icon" className="shrink-0" onClick={() => setCards(cards.filter((_, idx) => idx !== i))}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              )}
            </div>
          ))}
        </div>

        <Button onClick={handleSave} disabled={saving} className="rounded-full gap-2">
          <Save className="w-4 h-4" /> {saving ? "Aanmaken..." : "Set Aanmaken"}
        </Button>
      </div>
    </div>
  );
}
