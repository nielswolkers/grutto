import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Workspace } from "@/components/notities/whiteboard/Workspace";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Plus, 
  Search, 
  Pin, 
  Trash2, 
  ChevronLeft, 
  Folder, 
  MoreHorizontal,
  StickyNote,
  Bold,
  Italic,
  List,
  CheckSquare
} from "lucide-react";
import { toast } from "sonner";
import { format, formatDistanceToNow } from "date-fns";
import { nl } from "date-fns/locale";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

interface Note {
  id: string;
  user_id: string;
  title: string;
  content: string;
  is_pinned: boolean;
  folder_name: string | null;
  created_at: string;
  updated_at: string;
}

export default function Notities() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [activeView, setActiveView] = useState<"notities" | "whiteboard">("notities");
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [noteToDelete, setNoteToDelete] = useState<Note | null>(null);
  
  // Editing state
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const contentRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!user) return;
    
    loadNotes();

    const channel = supabase
      .channel("notes-realtime")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notes",
          filter: `user_id=eq.${user.id}`,
        },
        () => loadNotes()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  const loadNotes = async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from("notes")
        .select("*")
        .eq("user_id", user.id)
        .order("is_pinned", { ascending: false })
        .order("updated_at", { ascending: false });

      if (error) throw error;
      setNotes(data || []);
    } catch (error) {
      console.error("Failed to load notes:", error);
      toast.error("Kon notities niet laden");
    } finally {
      setLoading(false);
    }
  };

  const createNote = async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from("notes")
        .insert({
          user_id: user.id,
          title: "",
          content: "",
          folder_name: selectedFolder,
        })
        .select()
        .single();

      if (error) throw error;
      setSelectedNote(data);
      setEditTitle("");
      setEditContent("");
      setTimeout(() => contentRef.current?.focus(), 100);
    } catch (error) {
      console.error("Failed to create note:", error);
      toast.error("Kon notitie niet aanmaken");
    }
  };

  const autoSave = useCallback(async () => {
    if (!selectedNote || !user) return;
    
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from("notes")
        .update({
          title: editTitle,
          content: editContent,
          updated_at: new Date().toISOString(),
        })
        .eq("id", selectedNote.id);

      if (error) throw error;
    } catch (error) {
      console.error("Failed to save note:", error);
    } finally {
      setIsSaving(false);
    }
  }, [selectedNote, editTitle, editContent, user]);

  const debouncedSave = useCallback(() => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = setTimeout(() => {
      autoSave();
    }, 500);
  }, [autoSave]);

  useEffect(() => {
    if (selectedNote) {
      debouncedSave();
    }
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [editTitle, editContent, debouncedSave]);

  const selectNote = (note: Note) => {
    // Save current note before switching
    if (selectedNote && (editTitle !== selectedNote.title || editContent !== selectedNote.content)) {
      autoSave();
    }
    setSelectedNote(note);
    setEditTitle(note.title);
    setEditContent(note.content);
  };

  const togglePin = async (note: Note) => {
    try {
      const { error } = await supabase
        .from("notes")
        .update({ is_pinned: !note.is_pinned })
        .eq("id", note.id);

      if (error) throw error;
      loadNotes();
      if (selectedNote?.id === note.id) {
        setSelectedNote({ ...note, is_pinned: !note.is_pinned });
      }
    } catch (error) {
      toast.error("Kon notitie niet vastzetten");
    }
  };

  const deleteNote = async () => {
    if (!noteToDelete) return;
    try {
      const { error } = await supabase
        .from("notes")
        .delete()
        .eq("id", noteToDelete.id);

      if (error) throw error;
      if (selectedNote?.id === noteToDelete.id) {
        setSelectedNote(null);
        setEditTitle("");
        setEditContent("");
      }
      setNoteToDelete(null);
      loadNotes();
      toast.success("Notitie verwijderd");
    } catch (error) {
      toast.error("Kon notitie niet verwijderen");
    }
  };

  const insertFormatting = (format: string) => {
    const textarea = contentRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = editContent.substring(start, end);
    let newText = "";
    let cursorOffset = 0;

    switch (format) {
      case "bold":
        newText = `**${selectedText}**`;
        cursorOffset = selectedText ? newText.length : 2;
        break;
      case "italic":
        newText = `_${selectedText}_`;
        cursorOffset = selectedText ? newText.length : 1;
        break;
      case "list":
        newText = `\n- ${selectedText}`;
        cursorOffset = selectedText ? newText.length : 3;
        break;
      case "checkbox":
        newText = `\n☐ ${selectedText}`;
        cursorOffset = selectedText ? newText.length : 3;
        break;
    }

    const newContent = editContent.substring(0, start) + newText + editContent.substring(end);
    setEditContent(newContent);

    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + cursorOffset, start + cursorOffset);
    }, 0);
  };

  // Get unique folders
  const folders = [...new Set(notes.filter(n => n.folder_name).map(n => n.folder_name!))];

  // Filter notes
  const filteredNotes = notes.filter(note => {
    const matchesSearch = searchQuery === "" || 
      note.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      note.content.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFolder = selectedFolder === null || note.folder_name === selectedFolder;
    return matchesSearch && matchesFolder;
  });

  const pinnedNotes = filteredNotes.filter(n => n.is_pinned);
  const unpinnedNotes = filteredNotes.filter(n => !n.is_pinned);

  const getPreviewText = (content: string) => {
    const lines = content.split('\n').filter(l => l.trim());
    return lines.slice(0, 2).join(' ').substring(0, 100) || "Geen extra tekst";
  };

  const formatNoteDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) {
      return format(date, "HH:mm", { locale: nl });
    } else if (diffDays < 7) {
      return format(date, "EEEE", { locale: nl });
    } else {
      return format(date, "d MMM", { locale: nl });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (activeView === "whiteboard") {
    return (
      <div className="h-[calc(100vh-6rem)] -mt-6 -mx-6 relative">
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[70]">
          <NotitiesTabs activeView={activeView} setActiveView={setActiveView} />
        </div>
        <Workspace />
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-6rem)] -mt-6 -mx-6 relative">
      <div className="absolute top-3 left-1/2 -translate-x-1/2 z-50">
        <NotitiesTabs activeView={activeView} setActiveView={setActiveView} />
      </div>
      {/* Sidebar - Folders & Notes List */}
      <div className="w-80 border-r border-border flex flex-col bg-muted/30">
        {/* Header */}
        <div className="p-4 border-b border-border">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-xl font-semibold text-foreground">Notities</h1>
            <Button
              onClick={createNote}
              size="icon"
              variant="ghost"
              className="rounded-full h-8 w-8"
            >
              <Plus className="w-5 h-5" />
            </Button>
          </div>
          
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Zoek notities..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 rounded-full bg-background"
            />
          </div>
        </div>

        {/* Folders */}
        {folders.length > 0 && (
          <div className="p-2 border-b border-border">
            <button
              onClick={() => setSelectedFolder(null)}
              className={cn(
                "w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors",
                selectedFolder === null 
                  ? "bg-primary/10 text-primary" 
                  : "hover:bg-muted text-muted-foreground"
              )}
            >
              <StickyNote className="w-4 h-4" />
              <span>Alle notities</span>
              <span className="ml-auto text-xs">{notes.length}</span>
            </button>
            {folders.map(folder => (
              <button
                key={folder}
                onClick={() => setSelectedFolder(folder)}
                className={cn(
                  "w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors",
                  selectedFolder === folder 
                    ? "bg-primary/10 text-primary" 
                    : "hover:bg-muted text-muted-foreground"
                )}
              >
                <Folder className="w-4 h-4" />
                <span>{folder}</span>
                <span className="ml-auto text-xs">
                  {notes.filter(n => n.folder_name === folder).length}
                </span>
              </button>
            ))}
          </div>
        )}

        {/* Notes List */}
        <ScrollArea className="flex-1">
          <div className="p-2">
            {/* Pinned Notes */}
            {pinnedNotes.length > 0 && (
              <div className="mb-4">
                <p className="px-3 py-1 text-xs font-medium text-muted-foreground uppercase">
                  Vastgezet
                </p>
                {pinnedNotes.map(note => (
                  <NoteListItem
                    key={note.id}
                    note={note}
                    isSelected={selectedNote?.id === note.id}
                    onClick={() => selectNote(note)}
                    onPin={() => togglePin(note)}
                    onDelete={() => setNoteToDelete(note)}
                    formatDate={formatNoteDate}
                    getPreview={getPreviewText}
                  />
                ))}
              </div>
            )}

            {/* Regular Notes */}
            {unpinnedNotes.map(note => (
              <NoteListItem
                key={note.id}
                note={note}
                isSelected={selectedNote?.id === note.id}
                onClick={() => selectNote(note)}
                onPin={() => togglePin(note)}
                onDelete={() => setNoteToDelete(note)}
                formatDate={formatNoteDate}
                getPreview={getPreviewText}
              />
            ))}

            {filteredNotes.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <StickyNote className="w-10 h-10 mx-auto mb-2 opacity-50" />
                <p>Geen notities gevonden</p>
                <Button
                  variant="link"
                  onClick={createNote}
                  className="mt-2"
                >
                  Maak je eerste notitie
                </Button>
              </div>
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Note Editor */}
      <div className="flex-1 flex flex-col bg-background">
        {selectedNote ? (
          <>
            {/* Toolbar */}
            <div className="flex items-center justify-between px-4 py-2 border-b border-border">
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-lg"
                  onClick={() => insertFormatting("bold")}
                  title="Vet"
                >
                  <Bold className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-lg"
                  onClick={() => insertFormatting("italic")}
                  title="Cursief"
                >
                  <Italic className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-lg"
                  onClick={() => insertFormatting("list")}
                  title="Lijst"
                >
                  <List className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-lg"
                  onClick={() => insertFormatting("checkbox")}
                  title="Checklist"
                >
                  <CheckSquare className="w-4 h-4" />
                </Button>
              </div>

              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                {isSaving && <span className="text-xs">Opslaan...</span>}
                <span className="text-xs">
                  {format(new Date(selectedNote.updated_at), "d MMM yyyy, HH:mm", { locale: nl })}
                </span>
              </div>
            </div>

            {/* Editor */}
            <div className="flex-1 p-6 overflow-auto">
              <Input
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                placeholder="Titel"
                className="text-2xl font-bold border-none shadow-none px-0 h-auto focus-visible:ring-0 placeholder:text-muted-foreground/50 mb-4"
              />
              <Textarea
                ref={contentRef}
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                placeholder="Begin met typen..."
                className="min-h-[calc(100vh-16rem)] border-none shadow-none px-0 resize-none focus-visible:ring-0 placeholder:text-muted-foreground/50 text-base leading-relaxed"
              />
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <StickyNote className="w-16 h-16 mx-auto mb-4 opacity-30" />
              <p className="text-lg mb-2">Selecteer een notitie</p>
              <p className="text-sm">of maak een nieuwe aan</p>
              <Button onClick={createNote} className="mt-4 rounded-full">
                <Plus className="w-4 h-4 mr-2" />
                Nieuwe notitie
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Delete Confirmation */}
      <AlertDialog open={!!noteToDelete} onOpenChange={() => setNoteToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Notitie verwijderen?</AlertDialogTitle>
            <AlertDialogDescription>
              Weet je zeker dat je "{noteToDelete?.title || "Naamloze notitie"}" wilt verwijderen? 
              Dit kan niet ongedaan worden gemaakt.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-full">Annuleren</AlertDialogCancel>
            <AlertDialogAction onClick={deleteNote} className="rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Verwijderen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// Note list item component
interface NoteListItemProps {
  note: Note;
  isSelected: boolean;
  onClick: () => void;
  onPin: () => void;
  onDelete: () => void;
  formatDate: (date: string) => string;
  getPreview: (content: string) => string;
}

function NoteListItem({ note, isSelected, onClick, onPin, onDelete, formatDate, getPreview }: NoteListItemProps) {
  return (
    <div
      onClick={onClick}
      className={cn(
        "group relative p-3 rounded-xl cursor-pointer transition-colors mb-1",
        isSelected 
          ? "bg-primary/10 border border-primary/20" 
          : "hover:bg-muted"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            {note.is_pinned && (
              <Pin className="w-3 h-3 text-primary shrink-0" />
            )}
            <h3 className="font-medium truncate text-sm">
              {note.title || "Naamloze notitie"}
            </h3>
          </div>
          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
            {getPreview(note.content)}
          </p>
          <p className="text-xs text-muted-foreground/70 mt-1">
            {formatDate(note.updated_at)}
          </p>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
            >
              <MoreHorizontal className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onPin(); }}>
              <Pin className="w-4 h-4 mr-2" />
              {note.is_pinned ? "Losmaken" : "Vastzetten"}
            </DropdownMenuItem>
            <DropdownMenuItem 
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Verwijderen
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
