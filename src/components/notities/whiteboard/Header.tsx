import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronRight,
  Share2,
  Download,
  Search,
  Settings,
  Undo2,
  Redo2,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Board, Card } from '@/types/board';
import { toast } from 'sonner';

interface HeaderProps {
  boardName: string;
  zoom: number;
  onZoomChange: (zoom: number) => void;
  onUndo: () => void;
  onRedo: () => void;
  breadcrumbs: Board[];
  onNavigateToBoard: (boardId: string) => void;
  onSearch: (query: string) => Card[];
  onSelectCard: (id: string) => void;
}

export function Header({
  boardName,
  zoom,
  onZoomChange,
  onUndo,
  onRedo,
  breadcrumbs,
  onNavigateToBoard,
  onSearch,
  onSelectCard,
}: HeaderProps) {
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Card[]>([]);
  const [showSettings, setShowSettings] = useState(false);

  const handleSearchChange = useCallback((q: string) => {
    setSearchQuery(q);
    setSearchResults(onSearch(q));
  }, [onSearch]);

  const handleShare = () => {
    const url = window.location.href;
    navigator.clipboard.writeText(url);
    toast.success('Link gekopieerd naar klembord');
  };

  const handleExport = () => {
    try {
      const data = localStorage.getItem('workspace_boards');
      if (data) {
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `werkruimte-export-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success('Werkruimte geëxporteerd');
      }
    } catch {
      toast.error('Export mislukt');
    }
  };

  const getCardLabel = (card: Card) => {
    if (card.type === 'note') return card.title || card.content?.slice(0, 40) || 'Notitie';
    if (card.type === 'todo') return card.title || 'Taken';
    if (card.type === 'link') return card.title || card.url;
    if (card.type === 'image') return card.alt || 'Afbeelding';
    return 'Item';
  };

  return (
    <>
      <motion.header
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="absolute top-0 left-0 right-0 z-50 h-14"
      >
        <div className="h-full px-4 flex items-center justify-between bg-toolbar/80 backdrop-blur-xl border-b border-border/50">
          {/* Left - Breadcrumbs */}
          <div className="flex items-center gap-1.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center flex-shrink-0">
              <span className="text-primary-foreground font-semibold text-sm">W</span>
            </div>
            {breadcrumbs.map((board, i) => (
              <div key={board.id} className="flex items-center gap-1.5">
                {i > 0 && <ChevronRight className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />}
                <button
                  onClick={() => onNavigateToBoard(board.id)}
                  className="text-sm font-medium text-foreground hover:text-primary transition-colors truncate max-w-[120px]"
                >
                  {board.name}
                </button>
              </div>
            ))}
          </div>

          {/* Right - Actions */}
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="w-8 h-8 text-muted-foreground hover:text-foreground" onClick={onUndo} title="Ongedaan maken (Ctrl+Z)">
              <Undo2 className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="icon" className="w-8 h-8 text-muted-foreground hover:text-foreground" onClick={onRedo} title="Opnieuw (Ctrl+Shift+Z)">
              <Redo2 className="w-4 h-4" />
            </Button>

            <div className="w-px h-5 bg-border mx-1" />

            <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground gap-1.5" onClick={handleShare}>
              <Share2 className="w-4 h-4" />
              <span className="hidden sm:inline">Delen</span>
            </Button>
            <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground gap-1.5" onClick={handleExport}>
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">Exporteren</span>
            </Button>

            <div className="w-px h-5 bg-border mx-1" />

            {/* Zoom */}
            <div className="flex items-center gap-1 bg-secondary rounded-lg px-2 py-1">
              <button onClick={() => onZoomChange(Math.max(25, zoom - 10))} className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors px-1">−</button>
              <span className="text-xs font-medium text-foreground min-w-[3ch] text-center">{zoom}%</span>
              <button onClick={() => onZoomChange(Math.min(200, zoom + 10))} className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors px-1">+</button>
            </div>

            <div className="w-px h-5 bg-border mx-1" />

            <Button variant="ghost" size="icon" className="w-8 h-8 text-muted-foreground hover:text-foreground" onClick={() => { setShowSearch(s => !s); setSearchQuery(''); setSearchResults([]); }}>
              <Search className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="icon" className="w-8 h-8 text-muted-foreground hover:text-foreground" onClick={() => setShowSettings(s => !s)}>
              <Settings className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </motion.header>

      {/* Search overlay */}
      <AnimatePresence>
        {showSearch && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="absolute top-16 left-1/2 -translate-x-1/2 z-[60] w-full max-w-md"
          >
            <div className="bg-card rounded-xl shadow-xl border border-border p-3">
              <div className="flex items-center gap-2">
                <Search className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                <Input
                  autoFocus
                  value={searchQuery}
                  onChange={e => handleSearchChange(e.target.value)}
                  placeholder="Zoek kaarten..."
                  className="flex-1 border-none shadow-none focus-visible:ring-0"
                />
                <button onClick={() => { setShowSearch(false); setSearchQuery(''); setSearchResults([]); }} className="text-muted-foreground hover:text-foreground">
                  <X className="w-4 h-4" />
                </button>
              </div>
              {searchQuery && (
                <div className="mt-2 max-h-60 overflow-y-auto">
                  {searchResults.length === 0 ? (
                    <p className="text-sm text-muted-foreground p-2">Geen resultaten gevonden</p>
                  ) : (
                    searchResults.map(card => (
                      <button
                        key={card.id}
                        onClick={() => {
                          onSelectCard(card.id);
                          setShowSearch(false);
                          setSearchQuery('');
                          setSearchResults([]);
                        }}
                        className="w-full text-left p-2 rounded-lg hover:bg-muted transition-colors flex items-center gap-2"
                      >
                        <span className="text-xs font-medium text-primary capitalize bg-primary-soft px-1.5 py-0.5 rounded">
                          {card.type === 'note' ? 'Notitie' : card.type === 'todo' ? 'Taken' : card.type === 'image' ? 'Afb.' : 'Link'}
                        </span>
                        <span className="text-sm text-foreground truncate">{getCardLabel(card)}</span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Settings overlay */}
      <AnimatePresence>
        {showSettings && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowSettings(false)}
              className="fixed inset-0 bg-foreground/10 backdrop-blur-sm z-50"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-sm"
            >
              <div className="bg-card rounded-2xl shadow-xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-foreground">Instellingen</h2>
                  <button onClick={() => setShowSettings(false)} className="text-muted-foreground hover:text-foreground">
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <div className="space-y-3 text-sm text-muted-foreground">
                  <p>Je werkruimte wordt lokaal opgeslagen in je browser.</p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => {
                      if (confirm('Alle gegevens wissen? Dit kan niet ongedaan worden gemaakt.')) {
                        localStorage.removeItem('workspace_boards');
                        localStorage.removeItem('workspace_active_board');
                        window.location.reload();
                      }
                    }}
                  >
                    Alle gegevens wissen
                  </Button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
