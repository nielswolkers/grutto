import { StudySet } from "@/types/study";
import { COLOR_MAP, COLOR_BG_MAP } from "@/lib/studyData";
import { Clock, Layers } from "lucide-react";

interface Props {
  set: StudySet;
  onClick: () => void;
}

function timeAgo(ms: number): string {
  const diff = Date.now() - ms;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "zojuist";
  if (mins < 60) return `${mins}m geleden`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}u geleden`;
  return `${Math.floor(hours / 24)}d geleden`;
}

export default function StudySetCard({ set, onClick }: Props) {
  const gradient = COLOR_MAP[set.color] || COLOR_MAP.indigo;
  const badge = COLOR_BG_MAP[set.color] || COLOR_BG_MAP.indigo;

  return (
    <div
      onClick={onClick}
      className="group block rounded-2xl border border-border bg-card overflow-hidden transition-all hover:shadow-lg hover:-translate-y-0.5 cursor-pointer"
    >
      <div className={`h-2 w-full bg-gradient-to-r ${gradient}`} />
      <div className="p-5">
        <div className="flex items-center justify-between mb-3">
          <span className="text-3xl">{set.emoji}</span>
          <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${badge}`}>
            {set.cards.length} kaarten
          </span>
        </div>
        <h3 className="font-semibold text-base mb-1 truncate group-hover:text-primary transition-colors">
          {set.title}
        </h3>
        <p className="text-xs text-muted-foreground line-clamp-2 mb-3">{set.description}</p>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Layers className="w-3 h-3" />
            {set.cards.length} termen
          </span>
          {set.lastStudied && (
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {timeAgo(set.lastStudied)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
