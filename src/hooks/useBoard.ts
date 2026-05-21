import { useState, useCallback, useEffect, useRef } from 'react';
import { Card, Board, Position, NoteCard, ImageCard, LinkCard, TodoCard, TodoItem, Connection } from '@/types/board';

const generateId = () => Math.random().toString(36).substr(2, 9);

const STORAGE_KEY = 'workspace_boards';
const ACTIVE_BOARD_KEY = 'workspace_active_board';

const defaultBoard: Board = {
  id: 'home',
  name: 'Startpagina',
  cards: [
    {
      id: '1',
      type: 'note',
      position: { x: 100, y: 100 },
      content: 'Welkom in je werkruimte! Dubbelklik om notities te bewerken.',
      title: 'Aan de slag',
      zIndex: 1,
      width: 280,
    },
    {
      id: '2',
      type: 'todo',
      position: { x: 420, y: 100 },
      title: 'Taken',
      zIndex: 2,
      width: 260,
      items: [
        { id: 't1', text: 'Voeg je eerste notitie toe', completed: true },
        { id: 't2', text: 'Upload een afbeelding', completed: false },
        { id: 't3', text: 'Sla een link op', completed: false },
      ],
    },
  ],
  connections: [],
};

function loadBoards(): Board[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (data) {
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed) && parsed.length > 0) {
        // Migrate old boards without connections
        return parsed.map((b: any) => ({ ...b, connections: b.connections || [] }));
      }
    }
  } catch {}
  return [defaultBoard];
}

function saveBoards(boards: Board[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(boards));
  } catch {}
}

function loadActiveBoardId(): string {
  try {
    return localStorage.getItem(ACTIVE_BOARD_KEY) || 'home';
  } catch {
    return 'home';
  }
}

const MAX_HISTORY = 50;

export function useBoard() {
  const [boards, setBoards] = useState<Board[]>(loadBoards);
  const [activeBoardId, setActiveBoardId] = useState<string>(loadActiveBoardId);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [maxZIndex, setMaxZIndex] = useState(10);

  // Undo/Redo history
  const historyRef = useRef<Board[][]>([JSON.parse(JSON.stringify(loadBoards()))]);
  const historyIndexRef = useRef(0);
  const skipHistoryRef = useRef(false);

  // Pre-drag snapshot for correct undo
  const preDragSnapshotRef = useRef<Board[] | null>(null);

  const activeBoard = boards.find(b => b.id === activeBoardId) || boards[0];
  const cards = activeBoard?.cards || [];

  // Auto-save to localStorage
  useEffect(() => {
    saveBoards(boards);
  }, [boards]);

  useEffect(() => {
    try {
      localStorage.setItem(ACTIVE_BOARD_KEY, activeBoardId);
    } catch {}
  }, [activeBoardId]);

  const pushHistory = useCallback((newBoards: Board[]) => {
    if (skipHistoryRef.current) {
      skipHistoryRef.current = false;
      return;
    }
    const idx = historyIndexRef.current;
    const newHistory = historyRef.current.slice(0, idx + 1);
    newHistory.push(JSON.parse(JSON.stringify(newBoards)));
    if (newHistory.length > MAX_HISTORY) newHistory.shift();
    historyRef.current = newHistory;
    historyIndexRef.current = newHistory.length - 1;
  }, []);

  const updateBoards = useCallback((updater: (prev: Board[]) => Board[]) => {
    setBoards(prev => {
      const next = updater(prev);
      pushHistory(next);
      return next;
    });
  }, [pushHistory]);

  const updateActiveBoard = useCallback((updater: (board: Board) => Board) => {
    updateBoards(prev =>
      prev.map(b => b.id === activeBoardId ? updater(b) : b)
    );
  }, [activeBoardId, updateBoards]);

  const undo = useCallback(() => {
    if (historyIndexRef.current > 0) {
      historyIndexRef.current--;
      const snapshot = JSON.parse(JSON.stringify(historyRef.current[historyIndexRef.current]));
      skipHistoryRef.current = true;
      setBoards(snapshot);
    }
  }, []);

  const redo = useCallback(() => {
    if (historyIndexRef.current < historyRef.current.length - 1) {
      historyIndexRef.current++;
      const snapshot = JSON.parse(JSON.stringify(historyRef.current[historyIndexRef.current]));
      skipHistoryRef.current = true;
      setBoards(snapshot);
    }
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const mod = isMac ? e.metaKey : e.ctrlKey;
      if (mod && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      }
      if (mod && e.key === 'z' && e.shiftKey) {
        e.preventDefault();
        redo();
      }
      if (mod && e.key === 'y') {
        e.preventDefault();
        redo();
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedCardId && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
          e.preventDefault();
          deleteCard(selectedCardId);
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [undo, redo, selectedCardId]);

  // Board management
  const createBoard = useCallback((name: string, parentId?: string) => {
    const newBoard: Board = {
      id: generateId(),
      name,
      cards: [],
      connections: [],
      parentId: parentId || null,
    };
    updateBoards(prev => [...prev, newBoard]);
    setActiveBoardId(newBoard.id);
    return newBoard.id;
  }, [updateBoards]);

  const deleteBoard = useCallback((boardId: string) => {
    if (boardId === 'home') return;
    updateBoards(prev => prev.filter(b => b.id !== boardId));
    if (activeBoardId === boardId) setActiveBoardId('home');
  }, [activeBoardId, updateBoards]);

  const renameBoard = useCallback((boardId: string, name: string) => {
    updateBoards(prev =>
      prev.map(b => b.id === boardId ? { ...b, name } : b)
    );
  }, [updateBoards]);

  const navigateToBoard = useCallback((boardId: string) => {
    setActiveBoardId(boardId);
    setSelectedCardId(null);
  }, []);

  // Card operations - drag with proper undo
  const startDrag = useCallback(() => {
    // Capture snapshot before any drag changes
    preDragSnapshotRef.current = JSON.parse(JSON.stringify(boards));
  }, [boards]);

  const bringToFront = useCallback((id: string) => {
    const newZ = maxZIndex + 1;
    setMaxZIndex(newZ);
    // Don't push history here - drag will handle it
    setBoards(prev =>
      prev.map(b =>
        b.id === activeBoardId
          ? { ...b, cards: b.cards.map(c => c.id === id ? { ...c, zIndex: newZ } : c) }
          : b
      )
    );
  }, [maxZIndex, activeBoardId]);

  const updateCardPosition = useCallback((id: string, position: Position) => {
    setBoards(prev =>
      prev.map(b =>
        b.id === activeBoardId
          ? { ...b, cards: b.cards.map(c => c.id === id ? { ...c, position } : c) }
          : b
      )
    );
  }, [activeBoardId]);

  const commitCardPosition = useCallback(() => {
    // Push the pre-drag snapshot, then the current state
    if (preDragSnapshotRef.current) {
      const idx = historyIndexRef.current;
      const newHistory = historyRef.current.slice(0, idx + 1);
      // The pre-drag state is already at historyRef.current[idx] if no other changes happened
      // Just push current state as the new state
      newHistory.push(JSON.parse(JSON.stringify(boards)));
      if (newHistory.length > MAX_HISTORY) newHistory.shift();
      historyRef.current = newHistory;
      historyIndexRef.current = newHistory.length - 1;
      preDragSnapshotRef.current = null;
    }
  }, [boards]);

  const updateCard = useCallback(<T extends Card>(id: string, updates: Partial<T>) => {
    updateActiveBoard(board => ({
      ...board,
      cards: board.cards.map(card =>
        card.id === id ? { ...card, ...updates } as Card : card
      ),
    }));
  }, [updateActiveBoard]);

  const deleteCard = useCallback((id: string) => {
    updateActiveBoard(board => ({
      ...board,
      cards: board.cards.filter(card => card.id !== id),
      connections: board.connections.filter(c => c.fromCardId !== id && c.toCardId !== id),
    }));
    if (selectedCardId === id) setSelectedCardId(null);
  }, [selectedCardId, updateActiveBoard]);

  const addNote = useCallback((position: Position) => {
    const newCard: NoteCard = {
      id: generateId(),
      type: 'note',
      position,
      content: '',
      title: '',
      zIndex: maxZIndex + 1,
      width: 260,
    };
    setMaxZIndex(prev => prev + 1);
    updateActiveBoard(board => ({
      ...board,
      cards: [...board.cards, newCard],
    }));
    setSelectedCardId(newCard.id);
  }, [maxZIndex, updateActiveBoard]);

  const addImage = useCallback((position: Position, src: string) => {
    const newCard: ImageCard = {
      id: generateId(),
      type: 'image',
      position,
      src,
      zIndex: maxZIndex + 1,
      width: 200,
    };
    setMaxZIndex(prev => prev + 1);
    updateActiveBoard(board => ({
      ...board,
      cards: [...board.cards, newCard],
    }));
  }, [maxZIndex, updateActiveBoard]);

  const addLink = useCallback((position: Position, url: string, title?: string) => {
    const newCard: LinkCard = {
      id: generateId(),
      type: 'link',
      position,
      url,
      title: title || url,
      zIndex: maxZIndex + 1,
      width: 280,
    };
    setMaxZIndex(prev => prev + 1);
    updateActiveBoard(board => ({
      ...board,
      cards: [...board.cards, newCard],
    }));
  }, [maxZIndex, updateActiveBoard]);

  const addTodo = useCallback((position: Position) => {
    const newCard: TodoCard = {
      id: generateId(),
      type: 'todo',
      position,
      title: 'Taken',
      zIndex: maxZIndex + 1,
      width: 260,
      items: [],
    };
    setMaxZIndex(prev => prev + 1);
    updateActiveBoard(board => ({
      ...board,
      cards: [...board.cards, newCard],
    }));
    setSelectedCardId(newCard.id);
  }, [maxZIndex, updateActiveBoard]);

  const toggleTodoItem = useCallback((cardId: string, itemId: string) => {
    updateActiveBoard(board => ({
      ...board,
      cards: board.cards.map(card => {
        if (card.id === cardId && card.type === 'todo') {
          return {
            ...card,
            items: card.items.map(item =>
              item.id === itemId ? { ...item, completed: !item.completed } : item
            ),
          };
        }
        return card;
      }),
    }));
  }, [updateActiveBoard]);

  const addTodoItem = useCallback((cardId: string, text: string) => {
    const newItem: TodoItem = {
      id: generateId(),
      text,
      completed: false,
    };
    updateActiveBoard(board => ({
      ...board,
      cards: board.cards.map(card => {
        if (card.id === cardId && card.type === 'todo') {
          return { ...card, items: [...card.items, newItem] };
        }
        return card;
      }),
    }));
  }, [updateActiveBoard]);

  const deleteTodoItem = useCallback((cardId: string, itemId: string) => {
    updateActiveBoard(board => ({
      ...board,
      cards: board.cards.map(card => {
        if (card.id === cardId && card.type === 'todo') {
          return { ...card, items: card.items.filter(item => item.id !== itemId) };
        }
        return card;
      }),
    }));
  }, [updateActiveBoard]);

  // Connections
  const addConnection = useCallback((fromCardId: string, toCardId: string) => {
    if (fromCardId === toCardId) return;
    updateActiveBoard(board => {
      const exists = board.connections.some(
        c => (c.fromCardId === fromCardId && c.toCardId === toCardId)
      );
      if (exists) return board;
      return {
        ...board,
        connections: [...board.connections, { id: generateId(), fromCardId, toCardId }],
      };
    });
  }, [updateActiveBoard]);

  const deleteConnection = useCallback((connectionId: string) => {
    updateActiveBoard(board => ({
      ...board,
      connections: board.connections.filter(c => c.id !== connectionId),
    }));
  }, [updateActiveBoard]);

  // Search
  const searchCards = useCallback((query: string): Card[] => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    return cards.filter(card => {
      if (card.type === 'note') {
        return (card.content?.toLowerCase().includes(q)) || (card.title?.toLowerCase().includes(q));
      }
      if (card.type === 'todo') {
        return (card.title?.toLowerCase().includes(q)) || card.items.some(i => i.text.toLowerCase().includes(q));
      }
      if (card.type === 'link') {
        return (card.url?.toLowerCase().includes(q)) || (card.title?.toLowerCase().includes(q));
      }
      if (card.type === 'image') {
        return card.alt?.toLowerCase().includes(q);
      }
      return false;
    });
  }, [cards]);

  // Get breadcrumb path
  const getBreadcrumbs = useCallback(() => {
    const path: Board[] = [];
    let current = activeBoard;
    while (current) {
      path.unshift(current);
      if (current.parentId) {
        current = boards.find(b => b.id === current!.parentId) || undefined as any;
      } else {
        break;
      }
    }
    return path;
  }, [activeBoard, boards]);

  const getChildBoards = useCallback((parentId?: string) => {
    return boards.filter(b => b.parentId === (parentId || null) && b.id !== 'home');
  }, [boards]);

  return {
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
  };
}
