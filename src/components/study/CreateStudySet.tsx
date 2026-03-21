import { useState } from "react";
import { StudySet, Flashcard } from "@/types/study";
import { saveStudySet, COLOR_MAP } from "@/lib/studyData";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Trash2, Save, ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const COLORS = ["indigo", "orange", "teal", "rose", "violet", "sky"];
const EMOJIS = ["📚", "🧬", "🌍", "🇪🇸", "🔢", "⚛️", "🎨", "💡", "🏛️", "🌱", "🎵", "💻"];

function generateId() {
  return Math.random().toString(36).slice(2, 9);
}

interface Props {
  onBack: () => void;
  onCreated: (id: string) => void;
}

export default function CreateStudySet({ onBack, onCreated }: Props) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [emoji, setEmoji] = useState("📚");
  const [color, setColor] = useState("indigo");
  const [cards, setCards] = useState<Flashcard[]>([
    { id: generateId(), term: "", definition: "" },
    { id: generateId(), term: "", definition: "" },
    { id: generateId(), term: "", definition: "" },
  ]);

  function handleSave() {
    if (!title.trim()) { toast.error("Voeg een titel toe"); return; }
    const validCards = cards.filter(c => c.term.trim() && c.definition.trim());
    if (validCards.length < 2) { toast.error("Voeg minstens 2 kaarten toe"); return; }

    const newSet: StudySet = {
      id: generateId(),
      title: title.trim(),
      description: description.trim(),
      emoji,
      color,
      cards: validCards,
      createdAt: Date.now(),
    };
    saveStudySet(newSet);
    toast.success("Studieset aangemaakt!");
    onCreated(newSet.id);
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

        <div className="flex flex-wrap gap-2">
          {COLORS.map(c => (
            <button key={c} onClick={() => setColor(c)} className={cn("w-8 h-8 rounded-full bg-gradient-to-br", COLOR_MAP[c], color === c && "ring-2 ring-offset-2 ring-primary")} />
          ))}
        </div>

        <div className="space-y-3">
          {cards.map((card, i) => (
            <div key={card.id} className="flex gap-2 items-start">
              <span className="text-xs text-muted-foreground mt-3 w-5">{i + 1}</span>
              <Input value={card.term} onChange={(e) => {
                const newCards = [...cards];
                newCards[i] = { ...card, term: e.target.value };
                setCards(newCards);
              }} placeholder="Term" className="flex-1" />
              <Input value={card.definition} onChange={(e) => {
                const newCards = [...cards];
                newCards[i] = { ...card, definition: e.target.value };
                setCards(newCards);
              }} placeholder="Definitie" className="flex-1" />
              {cards.length > 2 && (
                <Button variant="ghost" size="icon" className="shrink-0" onClick={() => setCards(cards.filter((_, idx) => idx !== i))}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              )}
            </div>
          ))}
          <Button variant="outline" onClick={() => setCards([...cards, { id: generateId(), term: "", definition: "" }])} className="rounded-full gap-2">
            <Plus className="w-4 h-4" /> Kaart toevoegen
          </Button>
        </div>

        <Button onClick={handleSave} className="rounded-full gap-2">
          <Save className="w-4 h-4" /> Set Aanmaken
        </Button>
      </div>
    </div>
  );
}
