import { motion } from 'framer-motion';
import { LinkCard } from '@/types/board';
import { cn } from '@/lib/utils';
import { X, ExternalLink, Globe } from 'lucide-react';

interface LinkCardComponentProps {
  card: LinkCard;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onDragStart: () => void;
  onDrag: (x: number, y: number) => void;
  onDragEnd: () => void;
}

export function LinkCardComponent({
  card,
  isSelected,
  onSelect,
  onDelete,
  onDragStart,
  onDrag,
  onDragEnd,
}: LinkCardComponentProps) {
  const hostname = (() => {
    try {
      return new URL(card.url).hostname;
    } catch {
      return card.url;
    }
  })();

  const handleOpenLink = (e: React.MouseEvent) => {
    e.stopPropagation();
    window.open(card.url, '_blank');
  };

  return (
    <motion.div
      drag
      dragMomentum={false}
      onDragStart={onDragStart}
      onDrag={(_, info) => onDrag(info.point.x, info.point.y)}
      onDragEnd={onDragEnd}
      onClick={onSelect}
      style={{
        position: 'absolute',
        left: card.position.x,
        top: card.position.y,
        width: card.width || 280,
        zIndex: card.zIndex,
      }}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      whileHover={{ scale: 1.02 }}
      transition={{ duration: 0.15 }}
      className={cn(
        'bg-card rounded-xl shadow-card cursor-move transition-shadow overflow-hidden',
        isSelected && 'ring-2 ring-primary shadow-card-hover',
        !isSelected && 'hover:shadow-card-hover'
      )}
    >
      {/* Delete button */}
      {isSelected && (
        <motion.button
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="absolute top-2 right-2 w-6 h-6 bg-card/90 backdrop-blur-sm rounded-full shadow-md flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors z-10"
        >
          <X className="w-3.5 h-3.5" />
        </motion.button>
      )}

      {/* Preview image */}
      {card.image && (
        <div className="aspect-video bg-muted">
          <img
            src={card.image}
            alt=""
            className="w-full h-full object-cover"
            draggable={false}
          />
        </div>
      )}

      <div className="p-4">
        {/* URL with favicon */}
        <div className="flex items-center gap-2 mb-2">
          <div className="w-4 h-4 rounded bg-muted flex items-center justify-center flex-shrink-0">
            {card.favicon ? (
              <img src={card.favicon} alt="" className="w-3 h-3" />
            ) : (
              <Globe className="w-3 h-3 text-muted-foreground" />
            )}
          </div>
          <span className="text-xs text-muted-foreground truncate">
            {hostname}
          </span>
        </div>

        {/* Title */}
        <h3 className="text-sm font-semibold text-primary line-clamp-2 mb-1 hover:underline">
          <button onClick={handleOpenLink} className="text-left">
            {card.title || hostname}
          </button>
        </h3>

        {/* Description */}
        {card.description && (
          <p className="text-xs text-muted-foreground line-clamp-2">
            {card.description}
          </p>
        )}

        {/* Open link button */}
        <button
          onClick={handleOpenLink}
          className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors"
        >
          <ExternalLink className="w-3 h-3" />
          Open link
        </button>
      </div>
    </motion.div>
  );
}
