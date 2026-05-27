import { useState, useEffect } from "react";
import { Flashcard } from "@/types/study";
import { cn } from "@/lib/utils";

interface Props {
  card: Flashcard;
  index: number;
  total: number;
  onPrev?: () => void;
  onNext?: () => void;
}

export default function FlashCardComponent({ card, index, total, onPrev, onNext }: Props) {
  const [flipped, setFlipped] = useState(false);

  // Reset flip when card changes
  useEffect(() => {
    setFlipped(false);
  }, [card.id]);

  // Keyboard shortcuts: space=flip, ←=prev, →=next
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === " ") {
        e.preventDefault();
        setFlipped(f => !f);
      } else if (e.key === "ArrowLeft" && onPrev) {
        e.preventDefault();
        onPrev();
      } else if (e.key === "ArrowRight" && onNext) {
        e.preventDefault();
        onNext();
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onPrev, onNext]);

  return (
    <div className="w-full max-w-3xl mx-auto">
      <div className="text-sm text-muted-foreground text-center mb-4">
        {index + 1} / {total}
      </div>
      <div
        className="relative w-full cursor-pointer"
        style={{ perspective: "1200px" }}
        onClick={() => setFlipped(!flipped)}
      >
        <div
          className={cn(
            "relative w-full min-h-[440px] transition-transform duration-500",
            flipped && "[transform:rotateY(180deg)]"
          )}
          style={{ transformStyle: "preserve-3d" }}
        >
          {/* Front */}
          <div className="absolute inset-0 flex flex-col items-center justify-center p-12 bg-card border rounded-2xl shadow-sm [backface-visibility:hidden]">
            <span className="text-sm text-muted-foreground mb-3 uppercase tracking-wider">Term</span>
            <span className="text-3xl font-semibold text-center">{card.term}</span>
            <span className="text-sm text-muted-foreground mt-6">Spatie om te draaien · ← → om te navigeren</span>
          </div>
          {/* Back */}
          <div className="absolute inset-0 flex flex-col items-center justify-center p-12 bg-card border rounded-2xl shadow-sm [backface-visibility:hidden] [transform:rotateY(180deg)]">
            <span className="text-sm text-muted-foreground mb-3 uppercase tracking-wider">Definitie</span>
            <span className="text-xl text-center leading-relaxed">{card.definition}</span>
            <span className="text-sm text-muted-foreground mt-6">Spatie om terug te draaien</span>
          </div>
        </div>
      </div>
    </div>
  );
}
