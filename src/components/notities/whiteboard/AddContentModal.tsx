import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Link, Image, Upload, LayoutGrid } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type ModalType = 'link' | 'image' | 'board' | null;

interface AddContentModalProps {
  type: ModalType;
  onClose: () => void;
  onAddLink: (url: string, title?: string) => void;
  onAddImage: (src: string) => void;
  onCreateBoard: (name: string) => void;
}

export function AddContentModal({
  type,
  onClose,
  onAddLink,
  onAddImage,
  onCreateBoard,
}: AddContentModalProps) {
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [boardName, setBoardName] = useState('');
  const [imageTab, setImageTab] = useState<'upload' | 'url'>('upload');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (type === 'link') {
      if (!url.trim()) return;
      onAddLink(url, title || undefined);
    } else if (type === 'image') {
      if (imageTab === 'url' && !url.trim()) return;
      if (imageTab === 'url') onAddImage(url);
    } else if (type === 'board') {
      if (!boardName.trim()) return;
      onCreateBoard(boardName.trim());
    }

    resetAndClose();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      onAddImage(dataUrl);
      resetAndClose();
    };
    reader.readAsDataURL(file);
  };

  const resetAndClose = () => {
    setUrl('');
    setTitle('');
    setBoardName('');
    setImageTab('upload');
    onClose();
  };

  const getIcon = () => {
    switch (type) {
      case 'link': return <Link className="w-5 h-5 text-primary" />;
      case 'image': return <Image className="w-5 h-5 text-primary" />;
      case 'board': return <LayoutGrid className="w-5 h-5 text-primary" />;
      default: return null;
    }
  };

  const getTitle = () => {
    switch (type) {
      case 'link': return 'Link toevoegen';
      case 'image': return 'Afbeelding toevoegen';
      case 'board': return 'Bord aanmaken';
      default: return '';
    }
  };

  return (
    <AnimatePresence>
      {type && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={resetAndClose}
            className="fixed inset-0 bg-foreground/20 backdrop-blur-sm z-50"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.2 }}
            className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-md"
          >
            <div className="bg-card rounded-2xl shadow-xl p-6">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary-soft flex items-center justify-center">
                    {getIcon()}
                  </div>
                  <h2 className="text-lg font-semibold text-foreground">{getTitle()}</h2>
                </div>
                <button
                  onClick={resetAndClose}
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {type === 'board' ? (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="text-sm font-medium text-foreground mb-1.5 block">Bordnaam</label>
                    <Input
                      value={boardName}
                      onChange={e => setBoardName(e.target.value)}
                      placeholder="Mijn bord"
                      autoFocus
                    />
                  </div>
                  <div className="flex gap-3 pt-2">
                    <Button type="button" variant="outline" onClick={resetAndClose} className="flex-1">Annuleren</Button>
                    <Button type="submit" className="flex-1">Bord aanmaken</Button>
                  </div>
                </form>
              ) : type === 'image' ? (
                <div className="space-y-4">
                  {/* Tabs - Upload first */}
                  <div className="flex gap-1 bg-secondary rounded-lg p-1">
                    <button
                      onClick={() => setImageTab('upload')}
                      className={`flex-1 text-sm py-1.5 rounded-md transition-colors ${imageTab === 'upload' ? 'bg-card text-foreground shadow-sm font-medium' : 'text-muted-foreground'}`}
                    >
                      Uploaden
                    </button>
                    <button
                      onClick={() => setImageTab('url')}
                      className={`flex-1 text-sm py-1.5 rounded-md transition-colors ${imageTab === 'url' ? 'bg-card text-foreground shadow-sm font-medium' : 'text-muted-foreground'}`}
                    >
                      URL
                    </button>
                  </div>

                  {imageTab === 'upload' ? (
                    <div className="space-y-4">
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handleFileChange}
                        className="hidden"
                      />
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        className="w-full border-2 border-dashed border-border rounded-xl p-8 flex flex-col items-center gap-3 text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors"
                      >
                        <Upload className="w-8 h-8" />
                        <span className="text-sm font-medium">Klik om een afbeelding te uploaden</span>
                        <span className="text-xs">JPG, PNG, GIF, WebP</span>
                      </button>
                      <div className="flex gap-3">
                        <Button type="button" variant="outline" onClick={resetAndClose} className="flex-1">Annuleren</Button>
                      </div>
                    </div>
                  ) : (
                    <form onSubmit={handleSubmit} className="space-y-4">
                      <div>
                        <label className="text-sm font-medium text-foreground mb-1.5 block">Afbeelding URL</label>
                        <Input
                          type="url"
                          value={url}
                          onChange={e => setUrl(e.target.value)}
                          placeholder="https://voorbeeld.com/afbeelding.jpg"
                          autoFocus
                        />
                      </div>
                      <div className="flex gap-3 pt-2">
                        <Button type="button" variant="outline" onClick={resetAndClose} className="flex-1">Annuleren</Button>
                        <Button type="submit" className="flex-1">Toevoegen</Button>
                      </div>
                    </form>
                  )}
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="text-sm font-medium text-foreground mb-1.5 block">URL</label>
                    <Input
                      type="url"
                      value={url}
                      onChange={e => setUrl(e.target.value)}
                      placeholder="https://voorbeeld.com"
                      autoFocus
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-foreground mb-1.5 block">Titel (optioneel)</label>
                    <Input
                      value={title}
                      onChange={e => setTitle(e.target.value)}
                      placeholder="Link titel"
                    />
                  </div>
                  <div className="flex gap-3 pt-2">
                    <Button type="button" variant="outline" onClick={resetAndClose} className="flex-1">Annuleren</Button>
                    <Button type="submit" className="flex-1">Toevoegen</Button>
                  </div>
                </form>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
