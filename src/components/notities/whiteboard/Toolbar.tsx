import { motion } from 'framer-motion';
import {
  FileText,
  Link,
  CheckSquare,
  Image,
  Trash2,
  LayoutGrid,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface ToolbarProps {
  activeTool: string | null;
  onToolSelect: (tool: string) => void;
}

const tools = [
  { id: 'note', icon: FileText, label: 'Notitie' },
  { id: 'todo', icon: CheckSquare, label: 'Taken' },
  { id: 'link', icon: Link, label: 'Link' },
  { id: 'image', icon: Image, label: 'Afbeelding' },
  { id: 'divider1', type: 'divider' },
  { id: 'board', icon: LayoutGrid, label: 'Bord' },
  { id: 'divider2', type: 'divider' },
  { id: 'trash', icon: Trash2, label: 'Prullenbak' },
];

export function Toolbar({ activeTool, onToolSelect }: ToolbarProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
      className="fixed top-14 left-0 right-0 z-40 h-12"
    >
      <div className="h-full px-4 flex items-center gap-1 bg-toolbar/80 backdrop-blur-xl border-b border-border/50">
        {tools.map((tool) => {
          if (tool.type === 'divider') {
            return (
              <div
                key={tool.id}
                className="w-px h-6 bg-border mx-1"
              />
            );
          }

          const Icon = tool.icon!;
          const isActive = activeTool === tool.id;
          const isTrash = tool.id === 'trash';

          return (
            <motion.button
              key={tool.id}
              onClick={() => onToolSelect(tool.id)}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className={cn(
                'relative flex items-center gap-1.5 px-3 h-8 rounded-lg transition-smooth text-sm',
                isActive && !isTrash && 'bg-primary-soft text-primary font-medium',
                !isActive && 'hover:bg-toolbar-hover text-toolbar-foreground',
                isTrash && 'text-muted-foreground hover:text-destructive'
              )}
            >
              <Icon className={cn('w-4 h-4', isActive && !isTrash && 'text-primary')} />
              <span className="hidden sm:inline">{tool.label}</span>
            </motion.button>
          );
        })}
      </div>
    </motion.div>
  );
}
