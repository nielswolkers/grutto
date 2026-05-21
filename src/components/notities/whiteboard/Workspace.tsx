import { useState, useCallback } from 'react';
import { Header } from './Header';
import { Toolbar } from './Toolbar';
import { Canvas } from './Canvas';
import { AddContentModal } from './AddContentModal';
import { useBoard } from '@/hooks/useBoard';
import { Position } from '@/types/board';

export function Workspace() {
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const [zoom, setZoom] = useState(100);
  const [modalType, setModalType] = useState<'link' | 'image' | 'board' | null>(null);
  const [pendingPosition, setPendingPosition] = useState<Position>({ x: 200, y: 200 });

  const {
    boards,
    activeBoard,
    activeBoardId,
    cards,
    selectedCardId,
    setSelectedCardId,
    startDrag,
    bringToFront,
    updateCardPosition,
    commitCardPosition,
    updateCard,
    deleteCard,
    addNote,
    addImage,
    addLink,
    addTodo,
    toggleTodoItem,
    addTodoItem,
    deleteTodoItem,
    addConnection,
    deleteConnection,
    searchCards,
    undo,
    redo,
    createBoard,
    deleteBoard,
    renameBoard,
    navigateToBoard,
    getBreadcrumbs,
    getChildBoards,
  } = useBoard();

  const handleToolSelect = useCallback((tool: string) => {
    if (tool === 'trash') {
      if (selectedCardId) deleteCard(selectedCardId);
      return;
    }
    if (tool === 'board') {
      setModalType('board');
      return;
    }
    if (tool === 'link' || tool === 'image') {
      setModalType(tool);
      return;
    }
    setActiveTool((prev) => (prev === tool ? null : tool));
  }, [selectedCardId, deleteCard]);

  const handleAddLink = useCallback((url: string, title?: string) => {
    addLink(pendingPosition, url, title);
    setModalType(null);
  }, [addLink, pendingPosition]);

  const handleAddImage = useCallback((src: string) => {
    addImage(pendingPosition, src);
    setModalType(null);
  }, [addImage, pendingPosition]);

  const handleCreateBoard = useCallback((name: string) => {
    createBoard(name, activeBoardId === 'home' ? undefined : activeBoardId);
    setModalType(null);
  }, [createBoard, activeBoardId]);

  return (
    <div className="relative w-full h-full overflow-hidden bg-canvas">
      <Header
        boardName={activeBoard.name}
        zoom={zoom}
        onZoomChange={setZoom}
        onUndo={undo}
        onRedo={redo}
        breadcrumbs={getBreadcrumbs()}
        onNavigateToBoard={navigateToBoard}
        onSearch={searchCards}
        onSelectCard={(id) => { setSelectedCardId(id); }}
      />

      <Toolbar
        activeTool={activeTool}
        onToolSelect={handleToolSelect}
      />

      <Canvas
        cards={cards}
        connections={activeBoard.connections || []}
        selectedCardId={selectedCardId}
        activeTool={activeTool}
        zoom={zoom}
        onSelectCard={setSelectedCardId}
        onStartDrag={startDrag}
        onBringToFront={bringToFront}
        onUpdateCardPosition={updateCardPosition}
        onCommitCardPosition={commitCardPosition}
        onUpdateCard={updateCard}
        onDeleteCard={deleteCard}
        onAddNote={(pos) => { addNote(pos); setActiveTool(null); }}
        onAddTodo={(pos) => { addTodo(pos); setActiveTool(null); }}
        onAddLink={(pos, url) => { addLink(pos, url); setActiveTool(null); }}
        onToggleTodoItem={toggleTodoItem}
        onAddTodoItem={addTodoItem}
        onDeleteTodoItem={deleteTodoItem}
        onAddConnection={addConnection}
        childBoards={getChildBoards(activeBoardId)}
        onNavigateToBoard={navigateToBoard}
      />

      <AddContentModal
        type={modalType}
        onClose={() => setModalType(null)}
        onAddLink={handleAddLink}
        onAddImage={handleAddImage}
        onCreateBoard={handleCreateBoard}
      />
    </div>
  );
}
