import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { TodoCard } from '@/types/board';
import { cn } from '@/lib/utils';
import { X, Plus, Check, Trash2 } from 'lucide-react';

interface TodoCardComponentProps {
  card: TodoCard;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onUpdate: (updates: Partial<TodoCard>) => void;
  onToggleItem: (itemId: string) => void;
  onAddItem: (text: string) => void;
  onDeleteItem: (itemId: string) => void;
  onDragStart: () => void;
  onDrag: (x: number, y: number) => void;
  onDragEnd: () => void;
  onAnchorDragStart: (cardId: string) => void;
  onAnchorDragEnd: (cardId: string) => void;
}

export function TodoCardComponent({
  card,
  isSelected,
  onSelect,
  onDelete,
  onUpdate,
  onToggleItem,
  onAddItem,
  onDeleteItem,
  onDragStart,
  onDrag,
  onDragEnd,
  onAnchorDragStart,
  onAnchorDragEnd,
}: TodoCardComponentProps) {
  const [newItemText, setNewItemText] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [localTitle, setLocalTitle] = useState(card.title || 'Taken');
  const inputRef = useRef<HTMLInputElement>(null);

  const handleAddItem = () => {
    if (newItemText.trim()) {
      onAddItem(newItemText.trim());
      setNewItemText('');
    }
    setIsAdding(false);
  };

  const handleTitleBlur = () => {
    setIsEditingTitle(false);
    onUpdate({ title: localTitle });
  };

  const completedCount = card.items.filter((item) => item.completed).length;

  return (
    <motion.div
      drag={!isAdding && !isEditingTitle}
      dragMomentum={false}
      onDragStart={onDragStart}
      onDrag={(_, info) => onDrag(info.point.x, info.point.y)}
      onDragEnd={onDragEnd}
      onClick={onSelect}
      style={{
        position: 'absolute',
        left: card.position.x,
        top: card.position.y,
        width: card.width || 260,
        zIndex: card.zIndex,
      }}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      whileHover={{ scale: 1.02 }}
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
        {/* Header with editable title */}
        <div className="flex items-center justify-between mb-3">
          {isEditingTitle ? (
            <input
              autoFocus
              value={localTitle}
              onChange={(e) => setLocalTitle(e.target.value)}
              onBlur={handleTitleBlur}
              onKeyDown={(e) => { if (e.key === 'Enter') handleTitleBlur(); if (e.key === 'Escape') handleTitleBlur(); }}
              onClick={(e) => e.stopPropagation()}
              className="text-sm font-semibold text-foreground bg-transparent border-none outline-none flex-1"
            />
          ) : (
            <h3
              className="text-sm font-semibold text-foreground cursor-text"
              onDoubleClick={(e) => { e.stopPropagation(); setIsEditingTitle(true); }}
            >
              {localTitle}
            </h3>
          )}
          <span className="text-xs text-muted-foreground">
            {completedCount}/{card.items.length}
          </span>
        </div>

        {/* Items */}
        <div className="space-y-1">
          <AnimatePresence>
            {card.items.map((item) => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="group flex items-center gap-2"
              >
                <button
                  onClick={(e) => { e.stopPropagation(); onToggleItem(item.id); }}
                  className={cn(
                    'w-4 h-4 rounded border-2 flex items-center justify-center transition-all flex-shrink-0',
                    item.completed ? 'bg-primary border-primary' : 'border-muted-foreground/30 hover:border-primary'
                  )}
                >
                  {item.completed && <Check className="w-2.5 h-2.5 text-primary-foreground" />}
                </button>
                <span className={cn('text-sm flex-1 transition-colors', item.completed ? 'text-muted-foreground line-through' : 'text-foreground')}>
                  {item.text}
                </span>
                <button
                  onClick={(e) => { e.stopPropagation(); onDeleteItem(item.id); }}
                  className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {/* Add item */}
        {isAdding ? (
          <div className="mt-2 flex items-center gap-2">
            <input
              ref={inputRef}
              autoFocus
              type="text"
              value={newItemText}
              onChange={(e) => setNewItemText(e.target.value)}
              onBlur={handleAddItem}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAddItem();
                if (e.key === 'Escape') setIsAdding(false);
              }}
              onClick={(e) => e.stopPropagation()}
              placeholder="Item toevoegen..."
              className="flex-1 text-sm bg-transparent border-none outline-none text-foreground placeholder:text-muted-foreground/50"
            />
          </div>
        ) : (
          <button
            onClick={(e) => { e.stopPropagation(); setIsAdding(true); }}
            className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Item toevoegen
          </button>
        )}
      </div>

      {/* Bottom accent line */}
      <div className="h-1 bg-primary/20 rounded-b-xl" />
    </motion.div>
  );
}
