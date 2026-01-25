import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { LinkifiedText, extractMentions } from "@/components/LinkifiedText";
import { Send, Paperclip, Smile, FileText, CheckSquare, X } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { nl } from "date-fns/locale";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface Message {
  id: string;
  group_id: string;
  sender_id: string;
  content: string | null;
  file_id: string | null;
  task_id: string | null;
  created_at: string;
  sender?: {
    full_name: string;
    display_name: string | null;
    username: string;
    avatar_url: string | null;
  };
  file?: {
    id: string;
    filename: string;
    file_type: string;
    storage_url: string;
  };
  task?: {
    title: string;
    due_date: string;
    completed: boolean;
  };
}

interface File {
  id: string;
  filename: string;
  file_type: string;
  storage_url: string;
}

interface Task {
  id: string;
  title: string;
  due_date: string;
  completed: boolean;
}

interface GroupChatProps {
  groupId: string;
  groupName?: string;
}

const EMOJI_LIST = ["😀", "😂", "😍", "🎉", "👍", "👎", "❤️", "🔥", "✨", "💪", "📚", "✅", "❌", "🤔", "💡"];

export function GroupChat({ groupId, groupName = "een Community" }: GroupChatProps) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  
  // File/Task selection dialogs
  const [showFileDialog, setShowFileDialog] = useState(false);
  const [showTaskDialog, setShowTaskDialog] = useState(false);
  const [userFiles, setUserFiles] = useState<File[]>([]);
  const [userTasks, setUserTasks] = useState<Task[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);

  useEffect(() => {
    if (groupId) {
      loadMessages();
      
      // Subscribe to new messages
      const channel = supabase
        .channel(`group-messages-${groupId}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'group_messages',
            filter: `group_id=eq.${groupId}`,
          },
          (payload) => {
            loadMessages();
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [groupId]);

  useEffect(() => {
    // Auto-scroll to bottom when new messages arrive
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const loadMessages = async () => {
    try {
      const { data: messagesData, error } = await supabase
        .from("group_messages")
        .select("*")
        .eq("group_id", groupId)
        .order("created_at", { ascending: true });

      if (error) throw error;

      if (!messagesData || messagesData.length === 0) {
        setMessages([]);
        setLoading(false);
        return;
      }

      // Enrich with sender profiles
      const senderIds = [...new Set(messagesData.map(m => m.sender_id))];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name, display_name, username, avatar_url")
        .in("user_id", senderIds);

      // Get file details if any
      const fileIds = messagesData.filter(m => m.file_id).map(m => m.file_id!);
      let filesMap = new Map<string, File>();
      if (fileIds.length > 0) {
        const { data: files } = await supabase
          .from("files")
          .select("id, filename, file_type, storage_url")
          .in("id", fileIds);
        files?.forEach(f => filesMap.set(f.id, f));
      }

      // Get task details if any
      const taskIds = messagesData.filter(m => m.task_id).map(m => m.task_id!);
      let tasksMap = new Map<string, Task>();
      if (taskIds.length > 0) {
        const { data: tasks } = await supabase
          .from("tasks")
          .select("id, title, due_date, completed")
          .in("id", taskIds);
        tasks?.forEach(t => tasksMap.set(t.id, t));
      }

      const enrichedMessages = messagesData.map(m => ({
        ...m,
        sender: profiles?.find(p => p.user_id === m.sender_id),
        file: m.file_id ? filesMap.get(m.file_id) : undefined,
        task: m.task_id ? tasksMap.get(m.task_id) : undefined,
      }));

      setMessages(enrichedMessages);
    } catch (error) {
      console.error("Failed to load messages:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadUserFiles = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("files")
      .select("id, filename, file_type, storage_url")
      .eq("owner_id", user.id)
      .is("deleted_at", null)
      .order("upload_date", { ascending: false })
      .limit(20);
    setUserFiles(data || []);
  };

  const loadUserTasks = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("tasks")
      .select("id, title, due_date, completed")
      .eq("user_id", user.id)
      .eq("completed", false)
      .order("due_date", { ascending: true })
      .limit(20);
    setUserTasks(data || []);
  };

  const sendMessage = async () => {
    if (!user || (!newMessage.trim() && !selectedFile && !selectedTask)) return;

    setSending(true);
    try {
      const { error } = await supabase.from("group_messages").insert({
        group_id: groupId,
        sender_id: user.id,
        content: newMessage.trim() || null,
        file_id: selectedFile?.id || null,
        task_id: selectedTask?.id || null,
      });

      if (error) throw error;

      // Handle @mentions - send notifications
      const mentions = extractMentions(newMessage);
      if (mentions.length > 0) {
        // Get user IDs from usernames
        const { data: mentionedProfiles } = await supabase
          .from("profiles")
          .select("user_id, username")
          .in("username", mentions);

        // Send notifications to mentioned users
        for (const profile of mentionedProfiles || []) {
          if (profile.user_id !== user.id) {
            await supabase.from("notifications").insert({
              recipient_id: profile.user_id,
              sender_id: user.id,
              type: "mention",
              message: `heeft je benoemd in een gesprek in ${groupName}`,
            });
          }
        }
      }

      setNewMessage("");
      setSelectedFile(null);
      setSelectedTask(null);
    } catch (error) {
      console.error("Failed to send message:", error);
      toast.error("Kon bericht niet versturen");
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const addEmoji = (emoji: string) => {
    setNewMessage(prev => prev + emoji);
  };

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const openFileInNewTab = async (file: File) => {
    const { data } = await supabase.storage.from("user-files").getPublicUrl(file.storage_url);
    if (data?.publicUrl) {
      window.open(data.publicUrl, "_blank");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[500px] border rounded-xl bg-card">
      {/* Messages Area */}
      <ScrollArea className="flex-1 p-4" ref={scrollRef}>
        {messages.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <p>Nog geen berichten in deze groep</p>
            <p className="text-sm">Start het gesprek!</p>
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((message) => {
              const isOwn = message.sender_id === user?.id;
              const displayName = message.sender?.display_name || message.sender?.full_name || "Onbekend";

              return (
                <div
                  key={message.id}
                  className={`flex gap-3 ${isOwn ? "flex-row-reverse" : ""}`}
                >
                  <Avatar className="w-8 h-8 shrink-0">
                    {message.sender?.avatar_url ? (
                      <AvatarImage src={message.sender.avatar_url} />
                    ) : null}
                    <AvatarFallback className="text-xs">
                      {getInitials(displayName)}
                    </AvatarFallback>
                  </Avatar>

                  <div className={`max-w-[70%] ${isOwn ? "text-right" : ""}`}>
                    <p className="text-xs text-muted-foreground mb-1">
                      {isOwn ? "Jij" : displayName}
                      <span className="ml-2">
                        {format(new Date(message.created_at), "HH:mm", { locale: nl })}
                      </span>
                    </p>
                    
                    <div className={`rounded-2xl p-3 ${isOwn ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                      {/* Text content */}
                      {message.content && (
                        <p className="text-sm whitespace-pre-wrap">
                          <LinkifiedText text={message.content} />
                        </p>
                      )}

                      {/* File attachment */}
                      {message.file && (
                        <button
                          onClick={() => openFileInNewTab(message.file!)}
                          className={`flex items-center gap-2 p-2 rounded-lg mt-2 ${isOwn ? "bg-primary-foreground/10" : "bg-background"}`}
                        >
                          <FileText className="w-4 h-4" />
                          <span className="text-sm truncate">{message.file.filename}</span>
                        </button>
                      )}

                      {/* Task attachment */}
                      {message.task && (
                        <div className={`flex items-center gap-2 p-2 rounded-lg mt-2 ${isOwn ? "bg-primary-foreground/10" : "bg-background"}`}>
                          <CheckSquare className={`w-4 h-4 ${message.task.completed ? "text-green-500" : ""}`} />
                          <div className="text-left">
                            <p className="text-sm font-medium">{message.task.title}</p>
                            <p className="text-xs opacity-70">
                              {format(new Date(message.task.due_date), "d MMM", { locale: nl })}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </ScrollArea>

      {/* Selected attachments preview */}
      {(selectedFile || selectedTask) && (
        <div className="px-4 py-2 border-t flex gap-2 flex-wrap">
          {selectedFile && (
            <div className="flex items-center gap-2 px-3 py-1 bg-muted rounded-full text-sm">
              <FileText className="w-4 h-4" />
              <span className="truncate max-w-[150px]">{selectedFile.filename}</span>
              <button onClick={() => setSelectedFile(null)}>
                <X className="w-3 h-3" />
              </button>
            </div>
          )}
          {selectedTask && (
            <div className="flex items-center gap-2 px-3 py-1 bg-muted rounded-full text-sm">
              <CheckSquare className="w-4 h-4" />
              <span className="truncate max-w-[150px]">{selectedTask.title}</span>
              <button onClick={() => setSelectedTask(null)}>
                <X className="w-3 h-3" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Input Area */}
      <div className="p-4 border-t">
        <div className="flex items-center gap-2">
          {/* File attachment button */}
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0 rounded-full"
            onClick={() => {
              loadUserFiles();
              setShowFileDialog(true);
            }}
          >
            <Paperclip className="w-5 h-5" />
          </Button>

          {/* Task attachment button */}
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0 rounded-full"
            onClick={() => {
              loadUserTasks();
              setShowTaskDialog(true);
            }}
          >
            <CheckSquare className="w-5 h-5" />
          </Button>

          {/* Emoji picker */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon" className="shrink-0 rounded-full">
                <Smile className="w-5 h-5" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-2">
              <div className="grid grid-cols-5 gap-1">
                {EMOJI_LIST.map((emoji) => (
                  <button
                    key={emoji}
                    onClick={() => addEmoji(emoji)}
                    className="w-8 h-8 hover:bg-muted rounded flex items-center justify-center text-lg"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>

          {/* Message input */}
          <Input
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Typ een bericht..."
            className="flex-1 rounded-full"
          />

          {/* Send button */}
          <Button
            onClick={sendMessage}
            disabled={sending || (!newMessage.trim() && !selectedFile && !selectedTask)}
            size="icon"
            className="shrink-0 rounded-full"
          >
            <Send className="w-5 h-5" />
          </Button>
        </div>
      </div>

      {/* File selection dialog */}
      <Dialog open={showFileDialog} onOpenChange={setShowFileDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Bestand delen</DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-80">
            <div className="space-y-2">
              {userFiles.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">Geen bestanden gevonden</p>
              ) : (
                userFiles.map((file) => (
                  <button
                    key={file.id}
                    onClick={() => {
                      setSelectedFile(file);
                      setShowFileDialog(false);
                    }}
                    className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-muted text-left"
                  >
                    <FileText className="w-5 h-5 text-muted-foreground" />
                    <span className="truncate flex-1">{file.filename}</span>
                  </button>
                ))
              )}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Task selection dialog */}
      <Dialog open={showTaskDialog} onOpenChange={setShowTaskDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Taak delen</DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-80">
            <div className="space-y-2">
              {userTasks.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">Geen taken gevonden</p>
              ) : (
                userTasks.map((task) => (
                  <button
                    key={task.id}
                    onClick={() => {
                      setSelectedTask(task);
                      setShowTaskDialog(false);
                    }}
                    className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-muted text-left"
                  >
                    <CheckSquare className="w-5 h-5 text-muted-foreground" />
                    <div className="flex-1 min-w-0">
                      <p className="truncate">{task.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(task.due_date), "d MMM yyyy", { locale: nl })}
                      </p>
                    </div>
                  </button>
                ))
              )}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}