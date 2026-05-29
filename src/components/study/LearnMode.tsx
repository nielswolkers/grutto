import { useState, useEffect, useRef } from "react";
import { Flashcard } from "@/types/study";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { checkAnswer, diffSegments, AnswerVerdict } from "@/lib/answerCheck";

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
  const [verdict, setVerdict] = useState<AnswerVerdict>("wrong");
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

  function check() {
    if (answered) return;
    const { verdict: v } = checkAnswer(answer, card.definition);
    setAnswered(true);
    setVerdict(v);
    const isWrong = v === "wrong";
    if (v === "correct") setScore(s => s + 1);
    if (isWrong) setWrongCards(prev => [...prev, { card, userAnswer: answer }]);

    autoRef.current = setTimeout(() => {
      if (current + 1 >= total) {
        onFinish(
          v === "correct" ? score + 1 : score,
          total,
          isWrong ? [...wrongCards, { card, userAnswer: answer }] : wrongCards
        );
      } else {
        setCurrent(c => c + 1);
        setAnswer("");
        setAnswered(false);
        setVerdict("wrong");
        inputRef.current?.focus();
      }
    }, v === "correct" ? 1200 : 2200);
  }

  const colorClass =
    !answered ? "" :
    verdict === "correct" ? "border-emerald-500 bg-emerald-50" :
    verdict === "partial" ? "border-orange-400 bg-orange-50" :
    "border-destructive bg-destructive/5";

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>Vraag {current + 1} / {total}</span>
        <span>{score} goed</span>
      </div>
      <div className="bg-card border rounded-2xl p-12 min-h-[440px] flex flex-col justify-center">
        <p className="text-sm text-muted-foreground mb-3 uppercase tracking-wider">Wat betekent:</p>
        <p className="text-3xl font-semibold mb-8">{card.term}</p>
        <div className="space-y-3">
          <input
            ref={inputRef}
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && check()}
            disabled={answered}
            placeholder="Typ je antwoord en druk Enter..."
            className={cn(
              "w-full px-5 py-4 rounded-xl border text-lg outline-none transition-colors",
              colorClass
            )}
          />
          {answered && verdict === "correct" && (
            <div className="flex items-center gap-2 text-base font-medium text-emerald-600">
              <CheckCircle2 className="w-5 h-5" /> Correct!
            </div>
          )}
          {answered && verdict === "partial" && (
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-base font-medium text-orange-600">
                <AlertCircle className="w-5 h-5" /> Bijna goed — let op de verschillen:
              </div>
              <p className="text-base">
                {diffSegments(answer, card.definition).map((seg, i) => (
                  <span
                    key={i}
                    className={cn(
                      seg.type === "same" && "text-emerald-700",
                      seg.type === "missing" && "text-orange-600 font-semibold underline decoration-orange-400",
                      seg.type === "extra" && "text-destructive line-through"
                    )}
                  >
                    {seg.text}
                  </span>
                ))}
              </p>
              <p className="text-xs text-muted-foreground">Correct: {card.definition}</p>
            </div>
          )}
          {answered && verdict === "wrong" && (
            <div className="flex items-center gap-2 text-base font-medium text-destructive">
              <XCircle className="w-5 h-5" /> Fout — {card.definition}
            </div>
          )}
          {!answered && (
            <Button onClick={check} disabled={!answer.trim()} className="w-full rounded-xl h-12 text-base">
              Controleer
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
