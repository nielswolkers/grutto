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

type QuizType = "multiple" | "open";

export default function QuizMode({ cards, onFinish }: Props) {
  const [quizType, setQuizType] = useState<QuizType>("multiple");
  const [questions, setQuestions] = useState<any[]>([]);
  const [current, setCurrent] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [openAnswer, setOpenAnswer] = useState("");
  const [score, setScore] = useState(0);
  const [answered, setAnswered] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [wrongCards, setWrongCards] = useState<Array<{ card: Flashcard; userAnswer: string }>>([]);
  const autoRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    buildQuestions();
  }, [cards, quizType]);

  function buildQuestions() {
    const q = shuffle(cards).map((card) => {
      const wrong = shuffle(cards.filter((c) => c.id !== card.id)).slice(0, 3).map((c) => c.definition);
      const options = shuffle([card.definition, ...wrong]);
      return { card, options, correct: options.indexOf(card.definition) };
    });
    setQuestions(q);
    setCurrent(0);
    setSelected(null);
    setOpenAnswer("");
    setScore(0);
    setAnswered(false);
    setIsCorrect(false);
    setWrongCards([]);
  }

  useEffect(() => {
    return () => { if (autoRef.current) clearTimeout(autoRef.current); };
  }, []);

  if (questions.length === 0) return null;

  const q = questions[current];
  const total = questions.length;

  function handleSelect(idx: number) {
    if (answered) return;
    setSelected(idx);
    const correct = idx === q.correct;
    setAnswered(true);
    setIsCorrect(correct);
    if (correct) setScore(s => s + 1);
    else setWrongCards(prev => [...prev, { card: q.card, userAnswer: q.options[idx] }]);

    autoRef.current = setTimeout(advance, 1200);
  }

  function handleOpenSubmit() {
    if (answered) return;
    const userTrimmed = openAnswer.trim().toLowerCase();
    const correctTrimmed = q.card.definition.trim().toLowerCase();
    const correct = userTrimmed === correctTrimmed || 
      (userTrimmed.length > 3 && correctTrimmed.includes(userTrimmed));

    setAnswered(true);
    setIsCorrect(correct);
    if (correct) setScore(s => s + 1);
    else setWrongCards(prev => [...prev, { card: q.card, userAnswer: openAnswer }]);

    autoRef.current = setTimeout(advance, 1500);
  }

  function advance() {
    if (current + 1 >= total) {
      onFinish(score + (isCorrect ? 0 : 0), total, wrongCards);
      return;
    }
    setCurrent(c => c + 1);
    setSelected(null);
    setOpenAnswer("");
    setAnswered(false);
    setIsCorrect(false);
    inputRef.current?.focus();
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>Vraag {current + 1} / {total}</span>
        <div className="flex gap-2">
          <button onClick={() => setQuizType("multiple")} className={cn("px-3 py-1 rounded-full text-xs", quizType === "multiple" ? "bg-primary text-primary-foreground" : "bg-muted")}>
            Meerkeuze
          </button>
          <button onClick={() => setQuizType("open")} className={cn("px-3 py-1 rounded-full text-xs", quizType === "open" ? "bg-primary text-primary-foreground" : "bg-muted")}>
            Open
          </button>
        </div>
      </div>

      <div className="bg-card border rounded-2xl p-12 min-h-[440px]">
        <p className="text-sm text-muted-foreground mb-3 uppercase tracking-wider">Wat betekent:</p>
        <p className="text-3xl font-semibold mb-8">{q.card.term}</p>

        {quizType === "multiple" ? (
          <div className="space-y-3">
            {q.options.map((opt: string, idx: number) => (
              <button
                key={idx}
                onClick={() => handleSelect(idx)}
                disabled={answered}
                className={cn(
                  "w-full text-left px-5 py-4 rounded-xl border text-base transition-colors",
                  !answered && "hover:border-primary hover:bg-primary/5",
                  answered && idx === q.correct && "border-emerald-500 bg-emerald-50",
                  answered && selected === idx && idx !== q.correct && "border-destructive bg-destructive/5"
                )}
              >
                <div className="flex items-center gap-2">
                  {answered && idx === q.correct && <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />}
                  {answered && selected === idx && idx !== q.correct && <XCircle className="w-5 h-5 text-destructive shrink-0" />}
                  <span className="line-clamp-3">{opt}</span>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            <input
              ref={inputRef}
              value={openAnswer}
              onChange={(e) => setOpenAnswer(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleOpenSubmit()}
              disabled={answered}
              placeholder="Typ je antwoord en druk Enter..."
              className={cn(
                "w-full px-5 py-4 rounded-xl border text-lg outline-none",
                answered && isCorrect && "border-emerald-500 bg-emerald-50",
                answered && !isCorrect && "border-destructive bg-destructive/5"
              )}
            />
            {answered && !isCorrect && (
              <p className="text-base text-destructive flex items-center gap-1">
                <XCircle className="w-5 h-5" /> {q.card.definition}
              </p>
            )}
            {!answered && (
              <Button onClick={handleOpenSubmit} disabled={!openAnswer.trim()} className="w-full rounded-xl h-12 text-base">
                Controleer
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
