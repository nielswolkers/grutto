import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { LinkifiedText } from "@/components/LinkifiedText";
import { 
  Image as ImageIcon, 
  FileText, 
  X, 
  Send,
  MoreHorizontal,
  Trash2,
  MessageCircle,
  ChevronDown,
  ChevronUp
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
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

interface GroupPost {
  id: string;
  group_id: string;
  user_id: string;
  content: string | null;
  image_url: string | null;
  file_url: string | null;
  file_name: string | null;
  created_at: string;
  profile?: {
    username: string;
    full_name: string;
    display_name: string | null;
    avatar_url: string | null;
  };
  comment_count?: number;
}

interface Comment {
  id: string;
  user_id: string;
  content: string;
  created_at: string;
  profile?: {
    username: string;
    full_name: string;
    display_name: string | null;
    avatar_url: string | null;
  };
}

interface Profile {
  user_id: string;
  username: string;
  full_name: string;
  display_name: string | null;
  avatar_url: string | null;
}

interface GroupPostsProps {
  groupId: string;
}

export function GroupPosts({ groupId }: GroupPostsProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [posts, setPosts] = useState<GroupPost[]>([]);
  const [loading, setLoading] = useState(true);

  // New post state
  const [newContent, setNewContent] = useState("");
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isPublishing, setIsPublishing] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Delete state
  const [postToDelete, setPostToDelete] = useState<GroupPost | null>(null);

  // User profile for the composer
  const [myProfile, setMyProfile] = useState<Profile | null>(null);

  // Comments state
  const [expandedComments, setExpandedComments] = useState<Set<string>>(new Set());
  const [commentsMap, setCommentsMap] = useState<Map<string, Comment[]>>(new Map());
  const [newComments, setNewComments] = useState<Map<string, string>>(new Map());
  const [postingComment, setPostingComment] = useState<string | null>(null);

  useEffect(() => {
    loadPosts();
    loadMyProfile();

    const channel = supabase
      .channel(`group-posts-${groupId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "group_messages",
          filter: `group_id=eq.${groupId}`,
        },
        () => loadPosts()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [groupId]);

  // Handle Ctrl+V paste for images
  useEffect(() => {
    const handlePaste = async (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (const item of items) {
        if (item.type.startsWith('image/')) {
          e.preventDefault();
          const file = item.getAsFile();
          if (file) {
            setSelectedImage(file);
            setSelectedFile(null);
            const reader = new FileReader();
            reader.onload = (ev) => setImagePreview(ev.target?.result as string);
            reader.readAsDataURL(file);
            toast.success("Afbeelding geplakt");
          }
          break;
        }
      }
    };

    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, []);

  const loadMyProfile = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("profiles")
      .select("user_id, username, full_name, display_name, avatar_url")
      .eq("user_id", user.id)
      .single();
    if (data) setMyProfile(data);
  };

  const loadPosts = async () => {
    try {
      // Using group_messages table but treating them as posts
      const { data, error } = await supabase
        .from("group_messages")
        .select("*")
        .eq("group_id", groupId)
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) throw error;

      if (data && data.length > 0) {
        const userIds = [...new Set(data.map(p => p.sender_id))];
        const { data: profiles } = await supabase
          .from("profiles")
          .select("user_id, username, full_name, display_name, avatar_url")
          .in("user_id", userIds);

        const enriched = data.map(post => ({
          id: post.id,
          group_id: post.group_id,
          user_id: post.sender_id,
          content: post.content,
          image_url: null, // Will add image support
          file_url: null,
          file_name: null,
          created_at: post.created_at,
          profile: profiles?.find(p => p.user_id === post.sender_id),
          comment_count: 0
        }));
        setPosts(enriched);
      } else {
        setPosts([]);
      }
    } catch (error) {
      console.error("Failed to load posts:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error("Selecteer een afbeelding");
      return;
    }

    setSelectedImage(file);
    setSelectedFile(null);
    const reader = new FileReader();
    reader.onload = (e) => setImagePreview(e.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 25 * 1024 * 1024) {
      toast.error("Bestand mag maximaal 25MB zijn");
      return;
    }

    setSelectedFile(file);
    setSelectedImage(null);
    setImagePreview(null);
  };

  const clearAttachments = () => {
    setSelectedImage(null);
    setSelectedFile(null);
    setImagePreview(null);
    if (imageInputRef.current) imageInputRef.current.value = '';
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const publishPost = async () => {
    if (!user || !newContent.trim()) {
      toast.error("Voeg tekst toe");
      return;
    }

    setIsPublishing(true);
    try {
      const { error } = await supabase
        .from("group_messages")
        .insert({
          group_id: groupId,
          sender_id: user.id,
          content: newContent.trim(),
        });

      if (error) throw error;

      toast.success("Post geplaatst!");
      setNewContent("");
      clearAttachments();
      loadPosts();
    } catch (error) {
      console.error("Publish error:", error);
      toast.error("Kon post niet plaatsen");
    } finally {
      setIsPublishing(false);
    }
  };

  const deletePost = async () => {
    if (!postToDelete) return;

    try {
      const { error } = await supabase
        .from("group_messages")
        .delete()
        .eq("id", postToDelete.id);

      if (error) throw error;
      setPostToDelete(null);
      toast.success("Post verwijderd");
      loadPosts();
    } catch (error) {
      toast.error("Kon post niet verwijderen");
    }
  };

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Zojuist";
    if (diffMins < 60) return `${diffMins}m`;
    if (diffHours < 24) return `${diffHours}u`;
    if (diffDays < 7) return `${diffDays}d`;
    return format(date, "d MMM", { locale: nl });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Create Post */}
      {user && (
        <Card>
          <CardContent className="p-4">
            <div className="flex gap-3">
              <Avatar className="w-10 h-10">
                {myProfile?.avatar_url && <AvatarImage src={myProfile.avatar_url} className="object-cover" />}
                <AvatarFallback>
                  {myProfile ? getInitials(myProfile.display_name || myProfile.full_name) : "?"}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <Textarea
                  ref={textareaRef}
                  placeholder="Deel iets met de groep... (Ctrl+V om afbeelding te plakken)"
                  value={newContent}
                  onChange={(e) => setNewContent(e.target.value)}
                  className="min-h-[60px] resize-none border-none shadow-none focus-visible:ring-0 p-0 text-base"
                />

                {imagePreview && (
                  <div className="relative mt-3">
                    <img
                      src={imagePreview}
                      alt="Preview"
                      className="rounded-xl max-h-48 object-cover"
                    />
                    <Button
                      variant="secondary"
                      size="icon"
                      className="absolute top-2 right-2 rounded-full h-6 w-6"
                      onClick={clearAttachments}
                    >
                      <X className="w-3 h-3" />
                    </Button>
                  </div>
                )}

                {selectedFile && (
                  <div className="mt-3 flex items-center gap-2 p-2 rounded-xl bg-muted">
                    <FileText className="w-4 h-4 text-muted-foreground" />
                    <span className="flex-1 truncate text-sm">{selectedFile.name}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5 rounded-full"
                      onClick={clearAttachments}
                    >
                      <X className="w-3 h-3" />
                    </Button>
                  </div>
                )}

                <div className="flex items-center justify-between mt-3 pt-3 border-t">
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="rounded-full h-8 w-8"
                      onClick={() => imageInputRef.current?.click()}
                    >
                      <ImageIcon className="w-4 h-4 text-primary" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="rounded-full h-8 w-8"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <FileText className="w-4 h-4 text-primary" />
                    </Button>
                    <input
                      ref={imageInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleImageSelect}
                      className="hidden"
                    />
                    <input
                      ref={fileInputRef}
                      type="file"
                      onChange={handleFileSelect}
                      className="hidden"
                    />
                  </div>
                  <Button
                    onClick={publishPost}
                    disabled={isPublishing || !newContent.trim()}
                    className="rounded-full gap-2"
                    size="sm"
                  >
                    {isPublishing ? (
                      <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <Send className="w-3 h-3" />
                    )}
                    Plaatsen
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Posts Feed */}
      {posts.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <MessageCircle className="w-10 h-10 mx-auto mb-3 opacity-50" />
          <p className="text-sm">Nog geen posts in deze groep</p>
          <p className="text-xs">Wees de eerste die iets deelt!</p>
        </div>
      ) : (
        <div className="space-y-3">
          {posts.map((post) => (
            <Card key={post.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <button
                    onClick={() => post.profile?.username && navigate(`/profiel/${post.profile.username}`)}
                    className="flex items-center gap-2 hover:opacity-80 transition-opacity"
                  >
                    <Avatar className="w-9 h-9">
                      {post.profile?.avatar_url && <AvatarImage src={post.profile.avatar_url} className="object-cover" />}
                      <AvatarFallback className="text-xs">
                        {getInitials(post.profile?.display_name || post.profile?.full_name || "?")}
                      </AvatarFallback>
                    </Avatar>
                    <div className="text-left">
                      <p className="font-medium text-sm">{post.profile?.display_name || post.profile?.full_name}</p>
                      <p className="text-xs text-muted-foreground">
                        @{post.profile?.username} • {formatDate(post.created_at)}
                      </p>
                    </div>
                  </button>

                  {post.user_id === user?.id && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="rounded-full h-7 w-7">
                          <MoreHorizontal className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => setPostToDelete(post)}
                          className="text-destructive"
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          Verwijderen
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>

                {post.content && (
                  <p className="text-sm text-foreground whitespace-pre-wrap">
                    <LinkifiedText text={post.content} />
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Delete Confirmation */}
      <AlertDialog open={!!postToDelete} onOpenChange={() => setPostToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Post verwijderen?</AlertDialogTitle>
            <AlertDialogDescription>
              Deze actie kan niet ongedaan worden gemaakt.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction
              onClick={deletePost}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Verwijderen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
