import { useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, Board, Position, Connection } from '@/types/board';
import { NoteCardComponent } from './cards/NoteCardComponent';
import { TodoCardComponent } from './cards/TodoCardComponent';
import { ImageCardComponent } from './cards/ImageCardComponent';
import { LinkCardComponent } from './cards/LinkCardComponent';
import { BoardCardComponent } from './cards/BoardCardComponent';

interface CanvasProps {
  cards: Card[];
  connections: Connection[];
  selectedCardId: string | null;
  activeTool: string | null;
  zoom: number;
  onSelectCard: (id: string | null) => void;
  onStartDrag: () => void;
  onBringToFront: (id: string) => void;
  onUpdateCardPosition: (id: string, position: Position) => void;
  onCommitCardPosition: () => void;
  onUpdateCard: (id: string, updates: Partial<Card>) => void;
  onDeleteCard: (id: string) => void;
  onAddNote: (position: Position) => void;
  onAddTodo: (position: Position) => void;
  onAddLink: (position: Position, url: string) => void;
  onToggleTodoItem: (cardId: string, itemId: string) => void;
  onAddTodoItem: (cardId: string, text: string) => void;
  onDeleteTodoItem: (cardId: string, itemId: string) => void;
  onAddConnection: (fromId: string, toId: string) => void;
  childBoards: Board[];
  onNavigateToBoard: (boardId: string) => void;
}

export function Canvas({
  cards,
  connections,
  selectedCardId,
  activeTool,
  zoom,
  onSelectCard,
  onStartDrag,
  onBringToFront,
  onUpdateCardPosition,
  onCommitCardPosition,
  onUpdateCard,
  onDeleteCard,
  onAddNote,
  onAddTodo,
  onAddLink,
  onToggleTodoItem,
  onAddTodoItem,
  onDeleteTodoItem,
  onAddConnection,
  childBoards,
  onNavigateToBoard,
}: CanvasProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [anchorFromId, setAnchorFromId] = useState<string | null>(null);

  const handleCanvasClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === canvasRef.current || (e.target as HTMLElement).classList.contains('canvas-inner')) {
        const rect = canvasRef.current!.getBoundingClientRect();
        const x = (e.clientX - rect.left) / (zoom / 100);
        const y = (e.clientY - rect.top) / (zoom / 100);

        if (activeTool === 'note') {
          onAddNote({ x, y });
        } else if (activeTool === 'todo') {
          onAddTodo({ x, y });
        } else if (activeTool === 'link') {
          const url = window.prompt('Voer URL in:');
          if (url) onAddLink({ x, y }, url);
        } else {
          onSelectCard(null);
        }
      }
    },
    [activeTool, zoom, onAddNote, onAddTodo, onAddLink, onSelectCard]
  );

  const handleDragStart = (id: string) => {
    onStartDrag();
    onBringToFront(id);
    onSelectCard(id);
  };

  const handleAnchorDragStart = (cardId: string) => {
    setAnchorFromId(cardId);
  };

  const handleAnchorDragEnd = (cardId: string) => {
    if (anchorFromId && anchorFromId !== cardId) {
      onAddConnection(anchorFromId, cardId);
    }
    setAnchorFromId(null);
  };

  // Calculate center position of a card for connection lines
  const getCardCenter = (cardId: string): { x: number; y: number } | null => {
    const card = cards.find(c => c.id === cardId);
    if (card) {
      const w = card.width || 260;
      const h = card.height || 100;
      return { x: card.position.x + w / 2, y: card.position.y + h / 2 };
    }
    // Check child boards
    const boardIdx = childBoards.findIndex(b => b.id === cardId);
    if (boardIdx >= 0) {
      return { x: 100 + boardIdx * 200 + 80, y: 500 + 60 };
    }
    return null;
  };

  const renderCard = (card: Card) => {
    const commonProps = {
      isSelected: selectedCardId === card.id,
      onSelect: () => onSelectCard(card.id),
      onDelete: () => onDeleteCard(card.id),
      onDragStart: () => handleDragStart(card.id),
      onDrag: (_x: number, _y: number) => {},
      onDragEnd: () => onCommitCardPosition(),
      onAnchorDragStart: handleAnchorDragStart,
      onAnchorDragEnd: handleAnchorDragEnd,
    };

    switch (card.type) {
      case 'note':
        return (
          <NoteCardComponent
            key={card.id}
            card={card}
            {...commonProps}
            onUpdate={(updates) => onUpdateCard(card.id, updates)}
          />
        );
      case 'todo':
        return (
          <TodoCardComponent
            key={card.id}
            card={card}
            {...commonProps}
            onUpdate={(updates) => onUpdateCard(card.id, updates)}
            onToggleItem={(itemId) => onToggleTodoItem(card.id, itemId)}
            onAddItem={(text) => onAddTodoItem(card.id, text)}
            onDeleteItem={(itemId) => onDeleteTodoItem(card.id, itemId)}
          />
        );
      case 'image':
        return (
          <ImageCardComponent
            key={card.id}
            card={card}
            {...commonProps}
            onUpdate={(updates) => onUpdateCard(card.id, updates)}
          />
        );
      case 'link':
        return (
          <LinkCardComponent key={card.id} card={card} {...commonProps} />
        );
      default:
        return null;
    }
  };

  return (
    <div
      ref={canvasRef}
      onClick={handleCanvasClick}
      className="absolute inset-0 top-[104px] bg-canvas canvas-dots overflow-hidden"
      style={{ cursor: activeTool ? 'crosshair' : 'default' }}
    >
      <motion.div
        className="canvas-inner relative"
        style={{
          transform: `scale(${zoom / 100})`,
          transformOrigin: 'top left',
          width: `${10000 / (zoom / 100)}px`,
          height: `${10000 / (zoom / 100)}px`,
        }}
      >
        {/* Connection arrows */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none z-0">
          <defs>
            <marker
              id="arrowhead"
              markerWidth="10"
              markerHeight="7"
              refX="9"
              refY="3.5"
              orient="auto"
            >
              <polygon points="0 0, 10 3.5, 0 7" className="fill-primary" />
            </marker>
          </defs>
          {connections.map(conn => {
            const from = getCardCenter(conn.fromCardId);
            const to = getCardCenter(conn.toCardId);
            if (!from || !to) return null;
            return (
              <line
                key={conn.id}
                x1={from.x}
                y1={from.y}
                x2={to.x}
                y2={to.y}
                className="stroke-primary"
                strokeWidth="2"
                markerEnd="url(#arrowhead)"
                opacity={0.6}
              />
            );
          })}
        </svg>

        <AnimatePresence>
          {cards.map(renderCard)}
        </AnimatePresence>

        {/* Render child board cards on the canvas */}
        {childBoards.map((board, i) => (
          <BoardCardComponent
            key={board.id}
            board={board}
            position={{ x: 100 + i * 200, y: 500 }}
            onNavigate={() => onNavigateToBoard(board.id)}
            onDragStart={() => handleDragStart(board.id)}
            onDragEnd={() => onCommitCardPosition()}
            onAnchorDragStart={handleAnchorDragStart}
            onAnchorDragEnd={handleAnchorDragEnd}
          />
        ))}
      </motion.div>
    </div>
  );
}
