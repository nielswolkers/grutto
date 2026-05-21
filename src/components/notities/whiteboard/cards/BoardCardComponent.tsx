import { motion } from 'framer-motion';
import { LayoutGrid, ChevronRight, X } from 'lucide-react';
import { Board, Position } from '@/types/board';
import { cn } from '@/lib/utils';

interface BoardCardComponentProps {
  board: Board;
  position: Position;
  zIndex?: number;
  isSelected?: boolean;
  onNavigate: () => void;
  onSelect?: () => void;
  onDelete?: () => void;
  onDragStart?: () => void;
  onDrag?: (x: number, y: number) => void;
  onDragEnd?: () => void;
  onAnchorDragStart?: (cardId: string) => void;
  onAnchorDragEnd?: (cardId: string) => void;
}

export function BoardCardComponent({
  board,
  position,
  zIndex = 1,
  isSelected = false,
  onNavigate,
  onSelect,
  onDelete,
  onDragStart,
  onDrag,
  onDragEnd,
  onAnchorDragStart,
  onAnchorDragEnd,
}: BoardCardComponentProps) {
  return (
    <motion.div
      drag
      dragMomentum={false}
      onDragStart={onDragStart}
      onDrag={onDrag ? (_, info) => onDrag(info.point.x, info.point.y) : undefined}
      onDragEnd={onDragEnd}
      onClick={onSelect}
      onDoubleClick={onNavigate}
      style={{
        position: 'absolute',
        left: position.x,
        top: position.y,
        width: 160,
        zIndex,
      }}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.97 }}
      transition={{ duration: 0.15 }}
      className={cn(
        'bg-card rounded-xl shadow-card cursor-move hover:shadow-card-hover transition-shadow group/card',
        isSelected && 'ring-2 ring-primary shadow-card-hover'
      )}
    >
      {isSelected && onDelete && (
        <motion.button
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="absolute -top-2 -right-2 w-6 h-6 bg-card rounded-full shadow-md flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors z-10"
        >
          <X className="w-3.5 h-3.5" />
        </motion.button>
      )}

      {/* Anchor points */}
      {onAnchorDragStart && onAnchorDragEnd && (
        <>
          <div
            className="absolute top-1/2 -left-2 w-4 h-4 bg-primary rounded-full opacity-0 group-hover/card:opacity-100 cursor-crosshair transition-opacity z-20 flex items-center justify-center"
            onMouseDown={(e) => { e.stopPropagation(); onAnchorDragStart(board.id); }}
            onMouseUp={(e) => { e.stopPropagation(); onAnchorDragEnd(board.id); }}
          >
            <div className="w-2 h-2 bg-primary-foreground rounded-full" />
          </div>
          <div
            className="absolute top-1/2 -right-2 w-4 h-4 bg-primary rounded-full opacity-0 group-hover/card:opacity-100 cursor-crosshair transition-opacity z-20 flex items-center justify-center"
            onMouseDown={(e) => { e.stopPropagation(); onAnchorDragStart(board.id); }}
            onMouseUp={(e) => { e.stopPropagation(); onAnchorDragEnd(board.id); }}
          >
            <div className="w-2 h-2 bg-primary-foreground rounded-full" />
          </div>
        </>
      )}

      <div className="p-4 flex flex-col items-center gap-3">
        <div className="w-12 h-12 rounded-xl bg-primary-soft flex items-center justify-center">
          <LayoutGrid className="w-6 h-6 text-primary" />
        </div>
        <div className="text-center">
          <h3 className="text-sm font-semibold text-foreground truncate max-w-full">{board.name}</h3>
          <p className="text-xs text-muted-foreground mt-0.5">{board.cards.length} items</p>
        </div>
        <div className="flex items-center gap-1 text-xs text-primary font-medium">
          Openen <ChevronRight className="w-3 h-3" />
        </div>
      </div>
    </motion.div>
  );
}
