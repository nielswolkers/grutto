import { useState, useEffect, useRef } from "react";
import { Flashcard } from "@/types/study";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  cards: Flashcard[];
  onFinish: (score: number, total: number, wrongCards: Array<{ card: Flashcard; userAnswer: string }>) => void;
}

function shuffle<T>(arr: T[]): T[] {
  return [...arr].sort(() => Math.random() - 0.5);
}

export default function LearnMode({ cards, onFinish }: Props) {
  const [queue, setQueue] = useState<Flashcard[]>([]);
  const [current, setCurrent] = useState(0);
  const [answer, setAnswer] = useState("");
  const [answered, setAnswered] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [score, setScore] = useState(0);
  const [wrongCards, setWrongCards] = useState<Array<{ card: Flashcard; userAnswer: string }>>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const autoRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setQueue(shuffle(cards));
    setCurrent(0);
    setScore(0);
    setWrongCards([]);
  }, [cards]);

  useEffect(() => {
    return () => { if (autoRef.current) clearTimeout(autoRef.current); };
  }, []);

  if (queue.length === 0) return null;

  const card = queue[current];
  const total = queue.length;

  function checkAnswer() {
    if (answered) return;
    const userTrimmed = answer.trim().toLowerCase();
    const correctTrimmed = card.definition.trim().toLowerCase();
    const correct = userTrimmed === correctTrimmed ||
      (userTrimmed.length > 3 && correctTrimmed.includes(userTrimmed)) ||
      (userTrimmed.length > 3 && userTrimmed.includes(correctTrimmed));

    setAnswered(true);
    setIsCorrect(correct);
    if (correct) setScore(s => s + 1);
    else setWrongCards(prev => [...prev, { card, userAnswer: answer }]);

    autoRef.current = setTimeout(() => {
      if (current + 1 >= total) {
        onFinish(correct ? score + 1 : score, total, correct ? wrongCards : [...wrongCards, { card, userAnswer: answer }]);
      } else {
        setCurrent(c => c + 1);
        setAnswer("");
        setAnswered(false);
        setIsCorrect(false);
        inputRef.current?.focus();
      }
    }, 1500);
  }

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>Vraag {current + 1} / {total}</span>
        <span>{score} goed</span>
      </div>
      <div className="bg-card border rounded-2xl p-6">
        <p className="text-xs text-muted-foreground mb-2 uppercase tracking-wider">Wat betekent:</p>
        <p className="text-xl font-semibold mb-6">{card.term}</p>
        <div className="space-y-3">
          <input
            ref={inputRef}
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && checkAnswer()}
            disabled={answered}
            placeholder="Typ je antwoord..."
            className={cn(
              "w-full px-4 py-3 rounded-xl border text-sm outline-none transition-colors",
              answered && isCorrect && "border-emerald-500 bg-emerald-50",
              answered && !isCorrect && "border-destructive bg-destructive/5"
            )}
          />
          {answered && (
            <div className={cn("flex items-center gap-2 text-sm font-medium", isCorrect ? "text-emerald-600" : "text-destructive")}>
              {isCorrect ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
              {isCorrect ? "Correct!" : `Fout — ${card.definition}`}
            </div>
          )}
          {!answered && (
            <Button onClick={checkAnswer} disabled={!answer.trim()} className="w-full rounded-xl">
              Controleer
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
