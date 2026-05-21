import { useState, useRef, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { NoteCard } from '@/types/board';
import { cn } from '@/lib/utils';
import { X, GripHorizontal } from 'lucide-react';

interface NoteCardComponentProps {
  card: NoteCard;
  isSelected: boolean;
  onSelect: () => void;
  onUpdate: (updates: Partial<NoteCard>) => void;
  onDelete: () => void;
  onDragStart: () => void;
  onDrag: (x: number, y: number) => void;
  onDragEnd: () => void;
  onAnchorDragStart: (cardId: string) => void;
  onAnchorDragEnd: (cardId: string) => void;
}

export function NoteCardComponent({
  card,
  isSelected,
  onSelect,
  onUpdate,
  onDelete,
  onDragStart,
  onDrag,
  onDragEnd,
  onAnchorDragStart,
  onAnchorDragEnd,
}: NoteCardComponentProps) {
  const [isEditing, setIsEditing] = useState(!card.content && !card.title);
  const [localContent, setLocalContent] = useState(card.content);
  const [localTitle, setLocalTitle] = useState(card.title || '');
  const [isResizing, setIsResizing] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLocalContent(card.content);
    setLocalTitle(card.title || '');
  }, [card.content, card.title]);

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
      autoResize();
    }
  }, [isEditing]);

  const autoResize = () => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
    }
  };

  const handleBlur = () => {
    setIsEditing(false);
    onUpdate({ content: localContent, title: localTitle });
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsEditing(true);
  };

  // Resize handling
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setIsResizing(true);
    const startX = e.clientX;
    const startY = e.clientY;
    const startW = card.width || 260;
    const startH = card.height || (cardRef.current?.offsetHeight || 100);

    const onMove = (me: MouseEvent) => {
      const dw = me.clientX - startX;
      const dh = me.clientY - startY;
      onUpdate({ width: Math.max(180, startW + dw), height: Math.max(60, startH + dh) } as any);
    };
    const onUp = () => {
      setIsResizing(false);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [card.width, card.height, onUpdate]);

  return (
    <motion.div
      ref={cardRef}
      drag={!isEditing && !isResizing}
      dragMomentum={false}
      onDragStart={onDragStart}
      onDrag={(_, info) => onDrag(info.point.x, info.point.y)}
      onDragEnd={onDragEnd}
      onClick={onSelect}
      onDoubleClick={handleDoubleClick}
      style={{
        position: 'absolute',
        left: card.position.x,
        top: card.position.y,
        width: card.width || 260,
        minHeight: card.height,
        zIndex: card.zIndex,
      }}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      whileHover={isEditing ? {} : { scale: 1.02 }}
      transition={{ duration: 0.15 }}
      className={cn(
        'bg-card rounded-xl shadow-card cursor-move transition-shadow group/card',
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
          className="absolute -top-2 -right-2 w-6 h-6 bg-card rounded-full shadow-md flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors z-10"
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
      <div
        className="absolute -top-2 left-1/2 w-4 h-4 bg-primary rounded-full opacity-0 group-hover/card:opacity-100 cursor-crosshair transition-opacity z-20 flex items-center justify-center"
        onMouseDown={(e) => { e.stopPropagation(); onAnchorDragStart(card.id); }}
        onMouseUp={(e) => { e.stopPropagation(); onAnchorDragEnd(card.id); }}
      >
        <div className="w-2 h-2 bg-primary-foreground rounded-full" />
      </div>
      <div
        className="absolute -bottom-2 left-1/2 w-4 h-4 bg-primary rounded-full opacity-0 group-hover/card:opacity-100 cursor-crosshair transition-opacity z-20 flex items-center justify-center"
        onMouseDown={(e) => { e.stopPropagation(); onAnchorDragStart(card.id); }}
        onMouseUp={(e) => { e.stopPropagation(); onAnchorDragEnd(card.id); }}
      >
        <div className="w-2 h-2 bg-primary-foreground rounded-full" />
      </div>

      <div className="p-4">
        {/* Title - always editable */}
        {isEditing ? (
          <input
            type="text"
            value={localTitle}
            onChange={(e) => setLocalTitle(e.target.value)}
            placeholder="Titel"
            className="w-full text-sm font-semibold text-foreground bg-transparent border-none outline-none mb-2 placeholder:text-muted-foreground/50"
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <h3
            className="text-sm font-semibold text-foreground mb-2 min-h-[20px] cursor-text"
            onDoubleClick={handleDoubleClick}
          >
            {localTitle || <span className="text-muted-foreground/50">Titel...</span>}
          </h3>
        )}

        {/* Content */}
        {isEditing ? (
          <textarea
            ref={textareaRef}
            value={localContent}
            onChange={(e) => { setLocalContent(e.target.value); autoResize(); }}
            onBlur={handleBlur}
            placeholder="Schrijf iets..."
            className="w-full min-h-[60px] text-sm text-foreground bg-transparent border-none outline-none resize-none placeholder:text-muted-foreground/50"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => { if (e.key === 'Escape') handleBlur(); }}
          />
        ) : (
          <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
            {localContent || <span className="text-muted-foreground/50">Dubbelklik om te bewerken...</span>}
          </p>
        )}
      </div>

      {/* Bottom accent line */}
      <div className="h-1 bg-primary/20 rounded-b-xl" />

      {/* Resize handle */}
      <div
        onMouseDown={handleResizeStart}
        className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize opacity-0 group-hover/card:opacity-60 transition-opacity z-20"
      >
        <GripHorizontal className="w-3 h-3 text-muted-foreground rotate-[-45deg] absolute bottom-0.5 right-0.5" />
      </div>
    </motion.div>
  );
}
