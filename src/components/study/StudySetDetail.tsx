import { useState, useEffect } from "react";
import { StudySet, Flashcard } from "@/types/study";
import {
  getStudySet,
  deleteStudySetAsOwner,
  removeFromLibrary,
  updateStudySet,
  addToLibrary,
  touchLastStudied,
} from "@/lib/studySets";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, BookOpen, GraduationCap, Zap, Grid3X3, Pencil, Trash2, ArrowRight, RotateCcw, Plus, Save, Share2, Bookmark, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Kaarten, Leren, Oefentoets } from "./StudyModes";
import MatchMode from "./MatchMode";
import StudySetShareDialog from "./StudySetShareDialog";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type ViewMode = "detail" | "flashcards" | "quiz" | "learn" | "match" | "edit" | "result";

interface SubjectOption { id: string; name: string; emoji: string; }
interface Props { setId: string; onBack: () => void; subjects?: SubjectOption[]; }

const EMOJIS = ["📚", "🧬", "🌍", "🇪🇸", "🔢", "⚛️", "🎨", "💡", "🏛️", "🌱", "🎵", "💻"];
const genId = () => Math.random().toString(36).slice(2, 9);

export default function StudySetDetail({ setId, onBack, subjects = [] }: Props) {
  const { user } = useAuth();
  const [set, setSet] = useState<StudySet | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>("detail");
  const [cardIndex, setCardIndex] = useState(0);
  const [cards, setCards] = useState<Flashcard[]>([]);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [savingToLib, setSavingToLib] = useState(false);
  const [inLibrary, setInLibrary] = useState(false);

  const [resultScore, setResultScore] = useState(0);
  const [resultTotal, setResultTotal] = useState(0);
  const [resultWrong, setResultWrong] = useState<Array<{ card: Flashcard; userAnswer: string }>>([]);
  const [matchTime, setMatchTime] = useState(0);
  const [matchMistakes, setMatchMistakes] = useState(0);

  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editEmoji, setEditEmoji] = useState("📚");
  const [editSubjectId, setEditSubjectId] = useState<string>("");
  const [editCards, setEditCards] = useState<Flashcard[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [setId, user?.id]);

  async function reload() {
    setLoading(true);
    const s = await getStudySet(setId, user?.id);
    setSet(s);
    setCards(s?.cards || []);
    setLoading(false);
    // Check library membership
    if (s && user) {
      // crude: assume owner is always in library via trigger; for others, check
      if (s.isOwner) setInLibrary(true);
      else {
        const { data } = await (await import("@/integrations/supabase/client")).supabase
          .from("study_set_library").select("id").eq("user_id", user.id).eq("set_id", setId).maybeSingle();
        setInLibrary(!!data);
      }
    }
  }

  async function autoAddToLibrary() {
    if (!set || set.isOwner || inLibrary) return;
    try { await addToLibrary(setId, set.subjectId); setInLibrary(true); } catch {}
  }

  async function handleDelete() {
    if (!set) return;
    try {
      if (set.isOwner) {
        await deleteStudySetAsOwner(set.id);
        toast.success("Studieset verwijderd");
      } else {
        await removeFromLibrary(set.id);
        toast.success("Verwijderd uit bibliotheek");
      }
      onBack();
    } catch (e: any) {
      toast.error(e?.message || "Verwijderen mislukt");
    }
  }

  async function handleSaveToLibrary() {
    if (!set) return;
    setSavingToLib(true);
    try {
      await addToLibrary(set.id, set.subjectId);
      setInLibrary(true);
      toast.success("Toegevoegd aan jouw studiesets");
    } catch (e: any) {
      toast.error(e?.message || "Bewaren mislukt");
    } finally { setSavingToLib(false); }
  }

  async function handleSaveEdit() {
    if (!set) return;
    const validCards = editCards.filter(c => c.term.trim() && c.definition.trim());
    if (!editTitle.trim() || validCards.length < 2) return;
    setSaving(true);
    try {
      await updateStudySet(set.id, {
        title: editTitle.trim(),
        description: editDescription.trim(),
        emoji: editEmoji,
        subjectId: editSubjectId || set.subjectId,
        cards: validCards.map(({ term, definition }) => ({ term, definition })),
      });
      toast.success("Opgeslagen");
      await reload();
      setViewMode("detail");
    } catch (e: any) {
      toast.error(e?.message || "Opslaan mislukt");
    } finally { setSaving(false); }
  }

  if (loading) return <div className="py-12 flex justify-center"><Loader2 className="animate-spin" /></div>;
  if (!set) return (
    <div className="text-center py-12 text-muted-foreground">
      <p>Set niet gevonden.</p>
      <Button variant="link" onClick={onBack}>Terug</Button>
    </div>
  );

  function startMode(mode: "quiz" | "learn" | "match") {
    autoAddToLibrary();
    touchLastStudied(setId);
    setCardIndex(0);
    setViewMode(mode);
  }
  function startFlashcards() {
    // No auto-add per spec
    setCardIndex(0);
    setViewMode("flashcards");
  }

  function handleShuffle() {
    setCards([...cards].sort(() => Math.random() - 0.5));
    setCardIndex(0);
  }

  const modes = [
    { label: "Kaarten", icon: BookOpen, onClick: startFlashcards },
    { label: "Leren", icon: GraduationCap, onClick: () => startMode("learn") },
    { label: "Oefentoets", icon: Zap, onClick: () => startMode("quiz") },
    { label: "Combineren", icon: Grid3X3, onClick: () => startMode("match") },
  ];

  // Detail view
  if (viewMode === "detail") {
    return (
      <div className="space-y-6">
        <Button variant="ghost" size="sm" onClick={onBack} className="rounded-full gap-2">
          <ArrowLeft className="w-4 h-4" /> Terug
        </Button>

        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <span className="text-4xl">{set.emoji}</span>
              <span className="text-xs bg-muted px-2.5 py-1 rounded-full">{set.cards.length} kaarten</span>
            </div>
            <h2 className="text-2xl font-bold">{set.title}</h2>
            <p className="text-sm text-muted-foreground mt-1">{set.description}</p>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button variant="outline" size="icon" className="rounded-full" onClick={() => setShowShare(true)} title="Delen">
              <Share2 className="w-4 h-4" />
            </Button>
            {!set.isOwner && !inLibrary && (
              <Button variant="default" size="sm" className="rounded-full gap-2" onClick={handleSaveToLibrary} disabled={savingToLib}>
                <Bookmark className="w-4 h-4" /> Bewaar
              </Button>
            )}
            {set.isOwner && (
              <Button variant="outline" size="sm" className="rounded-full gap-2" onClick={() => {
                setEditTitle(set.title); setEditDescription(set.description); setEditEmoji(set.emoji);
                setEditSubjectId(set.subjectId || ""); setEditCards(set.cards); setViewMode("edit");
              }}>
                <Pencil className="w-4 h-4" /> Bewerken
              </Button>
            )}
            <Button variant="outline" size="sm" className="rounded-full text-destructive hover:text-destructive gap-2" onClick={() => setShowDeleteDialog(true)}>
              <Trash2 className="w-4 h-4" /> Verwijderen
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {modes.map(({ label, icon: Icon, onClick }) => (
            <button key={label} onClick={onClick} className="flex items-center gap-3 p-4 rounded-xl border bg-card hover:shadow-md transition-all text-left">
              <Icon className="w-5 h-5 text-primary shrink-0" />
              <p className="font-medium text-sm">{label}</p>
            </button>
          ))}
        </div>

        <div>
          <h3 className="font-semibold text-sm text-muted-foreground mb-3">Kaarten ({set.cards.length})</h3>
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

        <StudySetShareDialog setId={set.id} setTitle={set.title} open={showShare} onClose={() => setShowShare(false)} />

        <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>"{set.title}" verwijderen?</AlertDialogTitle>
              <AlertDialogDescription>
                {set.isOwner
                  ? `Dit verwijdert de studieset en alle ${set.cards.length} kaarten permanent voor iedereen.`
                  : "Dit verwijdert de studieset alleen uit jouw bibliotheek."}
              </AlertDialogDescription>
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
        <div className="flex items-start justify-between gap-4">
          <h2 className="text-xl font-bold">Set Bewerken</h2>
          <Button onClick={handleSaveEdit} size="sm" disabled={saving} className="rounded-full gap-2 shrink-0">
            <Save className="w-4 h-4" /> {saving ? "Opslaan..." : "Opslaan"}
          </Button>
        </div>

        <div className="space-y-4">
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
          <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} placeholder="Titel van je set" className="text-lg font-semibold" />

          <div className="grid grid-cols-1 md:grid-cols-[1fr_240px] gap-3 items-start">
            <Input value={editDescription} onChange={(e) => setEditDescription(e.target.value)} placeholder="Beschrijving" />
            {subjects.length > 0 && (
              <Select value={editSubjectId} onValueChange={setEditSubjectId}>
                <SelectTrigger className="rounded-xl"><SelectValue placeholder="Kies een vak" /></SelectTrigger>
                <SelectContent>
                  {subjects.map((s) => (
                    <SelectItem key={s.id} value={s.id}><span className="mr-2">{s.emoji}</span>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="space-y-3">
            <Button variant="outline" onClick={() => setEditCards([{ id: genId(), term: "", definition: "" }, ...editCards])} className="rounded-full gap-2">
              <Plus className="w-4 h-4" /> Kaart toevoegen
            </Button>
            {editCards.map((card, i) => (
              <div key={card.id} className="flex gap-2 items-start">
                <span className="text-xs text-muted-foreground mt-3 w-5">{i + 1}</span>
                <Input value={card.term} onChange={(e) => { const n = [...editCards]; n[i] = { ...card, term: e.target.value }; setEditCards(n); }} placeholder="Term" className="flex-1" />
                <Input value={card.definition} onChange={(e) => { const n = [...editCards]; n[i] = { ...card, definition: e.target.value }; setEditCards(n); }} placeholder="Definitie" className="flex-1" />
                <Button variant="ghost" size="icon" className="shrink-0" onClick={() => setEditCards(editCards.filter((_, idx) => idx !== i))}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </div>
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
          <><div className="text-5xl font-bold text-primary">{matchTime}s</div><p className="text-lg text-muted-foreground">{matchMistakes} fouten</p></>
        ) : (
          <><div className="text-5xl font-bold text-primary">{pct}%</div><p className="text-lg text-muted-foreground">{resultScore}/{resultTotal} goed</p></>
        )}
        <div className="flex gap-2 justify-center">
          <Button onClick={() => setViewMode("detail")} variant="outline" className="rounded-full">Terug</Button>
          <Button onClick={() => { setCardIndex(0); setViewMode("match"); }} className="rounded-full gap-2">
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

  // Study modes: white top bar with back button + title (no emoji)
  const exitMode = () => setViewMode("detail");
  return (
    <div>
      <div className="sticky top-0 z-30 -mx-8 -mt-8 mb-8 flex items-center gap-3 border-b bg-card px-8 py-3">
        <Button variant="ghost" size="icon" onClick={exitMode} className="rounded-full" aria-label="Terug">
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h2 className="truncate text-lg font-semibold">{set.title}</h2>
      </div>
      <div className="mx-auto max-w-4xl">
        {cards.length < 2 ? <p className="text-muted-foreground">Voeg minstens 2 kaarten toe om te oefenen.</p>
          : viewMode === "flashcards" ? <Kaarten key={setId} cards={cards} onBack={exitMode} />
          : viewMode === "learn" ? <Leren key={setId} cards={cards} onBack={exitMode} />
          : viewMode === "quiz" ? <Oefentoets key={setId} cards={cards} />
          : viewMode === "match" ? <MatchMode cards={cards} onFinish={(time, mis) => { setMatchTime(time); setMatchMistakes(mis); setResultScore(0); setResultTotal(0); setViewMode("result"); }} />
          : null}
      </div>
    </div>
  );
}
