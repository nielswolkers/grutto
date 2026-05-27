import { useState, useEffect, useRef } from "react";
import { Flashcard } from "@/types/study";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { RotateCcw, Timer } from "lucide-react";

interface Props {
  cards: Flashcard[];
  onFinish: (timeSeconds: number, mistakes: number) => void;
}

interface Tile {
  id: string;
  text: string;
  cardId: string;
  type: "term" | "definition";
}

function shuffle<T>(arr: T[]): T[] {
  return [...arr].sort(() => Math.random() - 0.5);
}

export default function MatchMode({ cards, onFinish }: Props) {
  const gameCards = cards.slice(0, Math.min(6, cards.length));
  const [tiles, setTiles] = useState<Tile[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [matched, setMatched] = useState<Set<string>>(new Set());
  const [wrong, setWrong] = useState<Set<string>>(new Set());
  const [mistakes, setMistakes] = useState(0);
  const [startTime] = useState(Date.now());
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const t: Tile[] = [];
    gameCards.forEach((card) => {
      t.push({ id: `t-${card.id}`, text: card.term, cardId: card.id, type: "term" });
      t.push({ id: `d-${card.id}`, text: card.definition, cardId: card.id, type: "definition" });
    });
    setTiles(shuffle(t));
    setSelected(null);
    setMatched(new Set());
    setWrong(new Set());
    setMistakes(0);
  }, [cards]);

  useEffect(() => {
    timerRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime) / 1000));
    }, 100);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [startTime]);

  useEffect(() => {
    if (matched.size === tiles.length && tiles.length > 0) {
      if (timerRef.current) clearInterval(timerRef.current);
      setTimeout(() => onFinish(elapsed, mistakes), 500);
    }
  }, [matched.size, tiles.length]);

  function handleTileClick(tile: Tile) {
    if (matched.has(tile.id)) return;
    if (selected === tile.id) { setSelected(null); return; }
    if (!selected) { setSelected(tile.id); return; }

    const selectedTile = tiles.find(t => t.id === selected)!;
    if (selectedTile.cardId === tile.cardId && selectedTile.type !== tile.type) {
      setMatched(prev => new Set([...prev, tile.id, selected]));
      setSelected(null);
    } else {
      setMistakes(m => m + 1);
      setWrong(new Set([tile.id, selected]));
      setTimeout(() => { setWrong(new Set()); setSelected(null); }, 600);
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between text-base text-muted-foreground">
        <span className="flex items-center gap-1"><Timer className="w-5 h-5" /> {elapsed}s</span>
        <span>{mistakes} fouten</span>
      </div>
      <div className="grid grid-cols-3 gap-4">
        {tiles.map((tile) => (
          <button
            key={tile.id}
            onClick={() => handleTileClick(tile)}
            disabled={matched.has(tile.id)}
            className={cn(
              "p-5 rounded-2xl border text-base text-center min-h-[120px] flex items-center justify-center transition-all",
              matched.has(tile.id) && "opacity-30 scale-95 border-emerald-300 bg-emerald-50",
              selected === tile.id && "border-primary bg-primary/10 ring-2 ring-primary",
              wrong.has(tile.id) && "border-destructive bg-destructive/10 animate-pulse",
              !matched.has(tile.id) && selected !== tile.id && !wrong.has(tile.id) && "hover:border-primary/50 hover:bg-muted/50"
            )}
          >
            <span className="line-clamp-4">{tile.text}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
