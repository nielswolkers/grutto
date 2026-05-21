import { useCallback, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { ImageCard } from '@/types/board';
import { cn } from '@/lib/utils';
import { X } from 'lucide-react';

interface ImageCardComponentProps {
  card: ImageCard;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onUpdate: (updates: Partial<ImageCard>) => void;
  onDragStart: () => void;
  onDrag: (x: number, y: number) => void;
  onDragEnd: () => void;
  onAnchorDragStart: (cardId: string) => void;
  onAnchorDragEnd: (cardId: string) => void;
}

export function ImageCardComponent({
  card,
  isSelected,
  onSelect,
  onDelete,
  onUpdate,
  onDragStart,
  onDrag,
  onDragEnd,
  onAnchorDragStart,
  onAnchorDragEnd,
}: ImageCardComponentProps) {
  const [isResizing, setIsResizing] = useState(false);

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setIsResizing(true);
    const startX = e.clientX;
    const startW = card.width || 200;

    const onMove = (me: MouseEvent) => {
      const dw = me.clientX - startX;
      onUpdate({ width: Math.max(100, startW + dw) });
    };
    const onUp = () => {
      setIsResizing(false);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [card.width, onUpdate]);

  return (
    <motion.div
      drag={!isResizing}
      dragMomentum={false}
      onDragStart={onDragStart}
      onDrag={(_, info) => onDrag(info.point.x, info.point.y)}
      onDragEnd={onDragEnd}
      onClick={onSelect}
      style={{
        position: 'absolute',
        left: card.position.x,
        top: card.position.y,
        width: card.width || 200,
        zIndex: card.zIndex,
      }}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      whileHover={{ scale: isResizing ? 1 : 1.02 }}
      transition={{ duration: 0.15 }}
      className={cn(
        'bg-card rounded-xl shadow-card cursor-move transition-shadow overflow-hidden group/card',
        isSelected && 'ring-2 ring-primary shadow-card-hover',
        !isSelected && 'hover:shadow-card-hover'
      )}
    >
      {/* Delete button */}
      {isSelected && (
        <motion.button
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="absolute top-2 right-2 w-6 h-6 bg-card/90 backdrop-blur-sm rounded-full shadow-md flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors z-10"
        >
          <X className="w-3.5 h-3.5" />
        </motion.button>
      )}

      {/* Anchor points */}
      <div
        className="absolute top-1/2 -left-2 w-4 h-4 bg-primary rounded-full opacity-0 group-hover/card:opacity-100 cursor-crosshair transition-opacity z-20 flex items-center justify-center"
        onMouseDown={(e) => { e.stopPropagation(); onAnchorDragStart(card.id); }}
        onMouseUp={(e) => { e.stopPropagation(); onAnchorDragEnd(card.id); }}
      >
        <div className="w-2 h-2 bg-primary-foreground rounded-full" />
      </div>
      <div
        className="absolute top-1/2 -right-2 w-4 h-4 bg-primary rounded-full opacity-0 group-hover/card:opacity-100 cursor-crosshair transition-opacity z-20 flex items-center justify-center"
        onMouseDown={(e) => { e.stopPropagation(); onAnchorDragStart(card.id); }}
        onMouseUp={(e) => { e.stopPropagation(); onAnchorDragEnd(card.id); }}
      >
        <div className="w-2 h-2 bg-primary-foreground rounded-full" />
      </div>

      <img
        src={card.src}
        alt={card.alt || 'Afbeelding'}
        className="w-full h-auto object-cover"
        draggable={false}
      />

      {card.alt && (
        <div className="p-3">
          <p className="text-xs text-muted-foreground">{card.alt}</p>
        </div>
      )}

      {/* Resize handle */}
      <div
        onMouseDown={handleResizeStart}
        className="absolute bottom-0 right-0 w-5 h-5 cursor-se-resize opacity-0 group-hover/card:opacity-60 transition-opacity z-20"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" className="absolute bottom-1 right-1 text-muted-foreground">
          <path d="M9 1L1 9M9 5L5 9M9 9L9 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </div>
    </motion.div>
  );
}
