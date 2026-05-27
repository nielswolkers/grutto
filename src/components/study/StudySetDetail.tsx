import { useState, useEffect } from "react";
import { StudySet, Flashcard } from "@/types/study";
import { getStudySet, deleteStudySet, saveStudySet, updateLastStudied, COLOR_MAP } from "@/lib/studyData";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, BookOpen, GraduationCap, Zap, Grid3X3, Pencil, Trash2, ArrowRight, RotateCcw, Plus, Save } from "lucide-react";
import { cn } from "@/lib/utils";
import FlashCard from "./FlashCard";
import QuizMode from "./QuizMode";
import LearnMode from "./LearnMode";
import MatchMode from "./MatchMode";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type ViewMode = "detail" | "flashcards" | "quiz" | "learn" | "match" | "edit" | "result";

interface Props {
  setId: string;
  onBack: () => void;
}

const COLORS = ["indigo", "orange", "teal", "rose", "violet", "sky"];
const EMOJIS = ["📚", "🧬", "🌍", "🇪🇸", "🔢", "⚛️", "🎨", "💡", "🏛️", "🌱", "🎵", "💻"];

function generateId() {
  return Math.random().toString(36).slice(2, 9);
}

export default function StudySetDetail({ setId, onBack }: Props) {
  const [set, setSet] = useState<StudySet | undefined>(getStudySet(setId));
  const [viewMode, setViewMode] = useState<ViewMode>("detail");
  const [cardIndex, setCardIndex] = useState(0);
  const [cards, setCards] = useState<Flashcard[]>(set?.cards ?? []);
  const [shuffled, setShuffled] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [resultScore, setResultScore] = useState(0);
  const [resultTotal, setResultTotal] = useState(0);
  const [resultWrong, setResultWrong] = useState<Array<{ card: Flashcard; userAnswer: string }>>([]);
  const [matchTime, setMatchTime] = useState(0);
  const [matchMistakes, setMatchMistakes] = useState(0);

  // Edit mode state
  const [editTitle, setEditTitle] = useState(set?.title || "");
  const [editDescription, setEditDescription] = useState(set?.description || "");
  const [editEmoji, setEditEmoji] = useState(set?.emoji || "📚");
  const [editColor, setEditColor] = useState(set?.color || "indigo");
  const [editCards, setEditCards] = useState<Flashcard[]>(set?.cards || [{ id: generateId(), term: "", definition: "" }, { id: generateId(), term: "", definition: "" }]);

  useEffect(() => {
    if (set) updateLastStudied(set.id);
  }, [set]);

  if (!set) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p>Set niet gevonden.</p>
        <Button variant="link" onClick={onBack}>Terug</Button>
      </div>
    );
  }

  function handleDelete() {
    deleteStudySet(set!.id);
    onBack();
  }

  function handleShuffle() {
    setCards([...cards].sort(() => Math.random() - 0.5));
    setCardIndex(0);
    setShuffled(true);
  }

  function handleQuizFinish(score: number, total: number, wrong: Array<{ card: Flashcard; userAnswer: string }>) {
    setResultScore(score);
    setResultTotal(total);
    setResultWrong(wrong);
    setViewMode("result");
  }

  function handleMatchFinish(time: number, mistakes: number) {
    setMatchTime(time);
    setMatchMistakes(mistakes);
    setResultScore(0);
    setResultTotal(0);
    setViewMode("result");
  }

  function handleSaveEdit() {
    const validCards = editCards.filter(c => c.term.trim() && c.definition.trim());
    if (!editTitle.trim() || validCards.length < 2) return;

    const updated: StudySet = {
      ...set!,
      title: editTitle.trim(),
      description: editDescription.trim(),
      emoji: editEmoji,
      color: editColor,
      cards: validCards,
    };
    saveStudySet(updated);
    setSet(updated);
    setCards(updated.cards);
    setViewMode("detail");
  }

  const modes = [
    { label: "Kaarten", icon: BookOpen, mode: "flashcards" as const, desc: "Blader door kaarten" },
    { label: "Leren", icon: GraduationCap, mode: "learn" as const, desc: "Typ het antwoord" },
    { label: "Test", icon: Zap, mode: "quiz" as const, desc: "Meerkeuze & open vragen" },
    { label: "Combineren", icon: Grid3X3, mode: "match" as const, desc: "Koppel term en definitie" },
  ];

  // Detail view
  if (viewMode === "detail") {
    return (
      <div className="space-y-6">
        <Button variant="ghost" size="sm" onClick={onBack} className="rounded-full gap-2">
          <ArrowLeft className="w-4 h-4" /> Terug
        </Button>

        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <span className="text-4xl">{set.emoji}</span>
              <span className="text-xs bg-muted px-2.5 py-1 rounded-full">{set.cards.length} kaarten</span>
            </div>
            <h2 className="text-2xl font-bold">{set.title}</h2>
            <p className="text-sm text-muted-foreground mt-1">{set.description}</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="rounded-full gap-2" onClick={() => {
              setEditTitle(set.title);
              setEditDescription(set.description);
              setEditEmoji(set.emoji);
              setEditColor(set.color);
              setEditCards(set.cards);
              setViewMode("edit");
            }}>
              <Pencil className="w-4 h-4" /> Bewerken
            </Button>
            <Button variant="outline" size="sm" className="rounded-full text-destructive hover:text-destructive gap-2" onClick={() => setShowDeleteDialog(true)}>
              <Trash2 className="w-4 h-4" /> Verwijderen
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {modes.map(({ label, icon: Icon, mode, desc }) => (
            <button
              key={mode}
              onClick={() => { setCardIndex(0); setViewMode(mode); }}
              className="flex items-center gap-3 p-4 rounded-xl border bg-card hover:shadow-md transition-all text-left"
            >
              <Icon className="w-5 h-5 text-primary shrink-0" />
              <div>
                <p className="font-medium text-sm">{label}</p>
                <p className="text-xs text-muted-foreground">{desc}</p>
              </div>
            </button>
          ))}
        </div>

        <div>
          <h3 className="font-semibold text-sm text-muted-foreground mb-3">Woorden ({set.cards.length})</h3>
          <div className="space-y-2">
            {set.cards.map((card, i) => (
              <div key={card.id} className="flex items-start gap-3 p-3 bg-muted/50 rounded-xl">
                <span className="text-xs text-muted-foreground mt-1 w-5">{i + 1}</span>
                <div className="flex-1 grid grid-cols-2 gap-4">
                  <p className="text-sm font-medium">{card.term}</p>
                  <p className="text-sm text-muted-foreground">{card.definition}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>"{set.title}" verwijderen?</AlertDialogTitle>
              <AlertDialogDescription>Dit verwijdert de studieset en alle {set.cards.length} kaarten permanent.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="rounded-full">Annuleren</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete} className="rounded-full bg-destructive text-destructive-foreground">Verwijderen</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  }

  // Edit view
  if (viewMode === "edit") {
    return (
      <div className="space-y-6">
        <Button variant="ghost" size="sm" onClick={() => setViewMode("detail")} className="rounded-full gap-2">
          <ArrowLeft className="w-4 h-4" /> Annuleren
        </Button>
        <h2 className="text-xl font-bold">{set ? "Set Bewerken" : "Nieuwe Set"}</h2>

        <div className="space-y-4">
          <div className="flex gap-3">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Emoji</label>
              <div className="flex flex-wrap gap-1">
                {EMOJIS.map(e => (
                  <button key={e} onClick={() => setEditEmoji(e)} className={cn("w-8 h-8 rounded-lg flex items-center justify-center text-lg", editEmoji === e ? "bg-primary/20 ring-2 ring-primary" : "hover:bg-muted")}>
                    {e}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} placeholder="Titel van je set" className="text-lg font-semibold" />
          <Input value={editDescription} onChange={(e) => setEditDescription(e.target.value)} placeholder="Beschrijving" />


          <div className="space-y-3">
            {editCards.map((card, i) => (
              <div key={card.id} className="flex gap-2 items-start">
                <span className="text-xs text-muted-foreground mt-3 w-5">{i + 1}</span>
                <Input value={card.term} onChange={(e) => {
                  const newCards = [...editCards];
                  newCards[i] = { ...card, term: e.target.value };
                  setEditCards(newCards);
                }} placeholder="Term" className="flex-1" />
                <Input value={card.definition} onChange={(e) => {
                  const newCards = [...editCards];
                  newCards[i] = { ...card, definition: e.target.value };
                  setEditCards(newCards);
                }} placeholder="Definitie" className="flex-1" />
                <Button variant="ghost" size="icon" className="shrink-0" onClick={() => setEditCards(editCards.filter((_, idx) => idx !== i))}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))}
            <Button variant="outline" onClick={() => setEditCards([...editCards, { id: generateId(), term: "", definition: "" }])} className="rounded-full gap-2">
              <Plus className="w-4 h-4" /> Kaart toevoegen
            </Button>
          </div>

          <Button onClick={handleSaveEdit} className="rounded-full gap-2">
            <Save className="w-4 h-4" /> Opslaan
          </Button>
        </div>
      </div>
    );
  }

  // Result view
  if (viewMode === "result") {
    const pct = resultTotal > 0 ? Math.round((resultScore / resultTotal) * 100) : 0;
    return (
      <div className="max-w-md mx-auto text-center space-y-6 py-8">
        <Button variant="ghost" size="sm" onClick={() => setViewMode("detail")} className="rounded-full gap-2">
          <ArrowLeft className="w-4 h-4" /> Terug naar set
        </Button>
        {matchTime > 0 ? (
          <>
            <div className="text-5xl font-bold text-primary">{matchTime}s</div>
            <p className="text-lg text-muted-foreground">{matchMistakes} fouten</p>
          </>
        ) : (
          <>
            <div className="text-5xl font-bold text-primary">{pct}%</div>
            <p className="text-lg text-muted-foreground">{resultScore}/{resultTotal} goed</p>
          </>
        )}
        <div className="flex gap-2 justify-center">
          <Button onClick={() => setViewMode("detail")} variant="outline" className="rounded-full">Terug</Button>
          <Button onClick={() => { setCardIndex(0); setViewMode(matchTime > 0 ? "match" : "quiz"); }} className="rounded-full gap-2">
            <RotateCcw className="w-4 h-4" /> Opnieuw
          </Button>
        </div>

        {resultWrong.length > 0 && (
          <div className="text-left space-y-2 mt-6">
            <h3 className="font-semibold text-sm text-muted-foreground">Fout beantwoord:</h3>
            {resultWrong.map(({ card, userAnswer }, i) => (
              <div key={i} className="p-3 bg-destructive/5 rounded-xl border border-destructive/20">
                <p className="font-medium text-sm">{card.term}</p>
                <p className="text-xs text-destructive">Jouw antwoord: {userAnswer}</p>
                <p className="text-xs text-emerald-600">Correct: {card.definition}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Flashcards view
  if (viewMode === "flashcards") {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={() => setViewMode("detail")} className="rounded-full gap-2">
            <ArrowLeft className="w-4 h-4" /> Terug
          </Button>
          <Button variant="outline" size="sm" onClick={handleShuffle} className="rounded-full gap-2">
            <RotateCcw className="w-4 h-4" /> Shuffle
          </Button>
        </div>
        <FlashCard
          card={cards[cardIndex]}
          index={cardIndex}
          total={cards.length}
          onPrev={() => setCardIndex(c => Math.max(0, c - 1))}
          onNext={() => setCardIndex(c => Math.min(cards.length - 1, c + 1))}
        />
        <div className="flex justify-center gap-4">
          <Button variant="outline" disabled={cardIndex === 0} onClick={() => setCardIndex(c => c - 1)} className="rounded-full">
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <Button variant="outline" disabled={cardIndex === cards.length - 1} onClick={() => setCardIndex(c => c + 1)} className="rounded-full">
            <ArrowRight className="w-4 h-4" />
          </Button>
        </div>
      </div>
    );
  }

  // Quiz/Learn/Match views
  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" onClick={() => setViewMode("detail")} className="rounded-full gap-2">
        <ArrowLeft className="w-4 h-4" /> Terug
      </Button>
      {viewMode === "quiz" && <QuizMode cards={cards} onFinish={handleQuizFinish} />}
      {viewMode === "learn" && <LearnMode cards={cards} onFinish={handleQuizFinish} />}
      {viewMode === "match" && <MatchMode cards={cards} onFinish={handleMatchFinish} />}
    </div>
  );
}
