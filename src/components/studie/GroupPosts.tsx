import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { LinkifiedText, extractMentions } from "@/components/LinkifiedText";
import { VerifiedBadge } from "@/components/VerifiedBadge";
import { useVerifiedUsers } from "@/hooks/useVerifiedStatus";
import { PostReactions } from "./PostReactions";
import { PollCard } from "./PollCard";
import { CreatePollDialog } from "./CreatePollDialog";
import { 
  Image as ImageIcon, 
  FileText, 
  X, 
  Send,
  MoreHorizontal,
  Trash2,
  MessageCircle,
  ChevronDown,
  ChevronUp,
  BarChart3
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
    user_id: string;
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
    user_id: string;
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

interface Poll {
  id: string;
  question: string;
  created_at: string;
  created_by: string;
  group_id: string;
  options: any[];
}

interface GroupPostsProps {
  groupId: string;
  isPublicGroup?: boolean;
  isAdmin?: boolean;
}

export function GroupPosts({ groupId, isPublicGroup = false, isAdmin = true }: GroupPostsProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { verifiedUserIds } = useVerifiedUsers();
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

  // Delete state
  const [postToDelete, setPostToDelete] = useState<GroupPost | null>(null);

  // User profile for the composer
  const [myProfile, setMyProfile] = useState<Profile | null>(null);

  // Comments state
  const [expandedComments, setExpandedComments] = useState<Set<string>>(new Set());
  const [commentsMap, setCommentsMap] = useState<Map<string, Comment[]>>(new Map());
  const [newComments, setNewComments] = useState<Map<string, string>>(new Map());
  const [postingComment, setPostingComment] = useState<string | null>(null);

  // Polls state
  const [polls, setPolls] = useState<Poll[]>([]);
  const [showPollDialog, setShowPollDialog] = useState(false);

  useEffect(() => {
    loadPosts();
    loadPolls();
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

  const loadPolls = async () => {
    try {
      const { data: pollsData } = await supabase
        .from("polls")
        .select("id, question, created_at, created_by, group_id")
        .eq("group_id", groupId)
        .order("created_at", { ascending: false });

      if (!pollsData || pollsData.length === 0) {
        setPolls([]);
        return;
      }

      // Load options and votes for each poll
      const pollIds = pollsData.map(p => p.id);
      const { data: optionsData } = await supabase
        .from("poll_options")
        .select("id, poll_id, option_text, sort_order")
        .in("poll_id", pollIds);

      const { data: votesData } = await supabase
        .from("poll_votes")
        .select("id, poll_id, option_id, user_id")
        .in("poll_id", pollIds);

      // Get voter profiles
      const voterIds = [...new Set(votesData?.map(v => v.user_id) || [])];
      const { data: voterProfiles } = voterIds.length > 0 ? await supabase
        .from("profiles")
        .select("user_id, avatar_url, full_name")
        .in("user_id", voterIds) : { data: [] };

      const enrichedPolls = pollsData.map(poll => ({
        ...poll,
        group_id: poll.group_id,
        options: (optionsData || [])
          .filter(o => o.poll_id === poll.id)
          .map(opt => ({
            ...opt,
            votes: (votesData || [])
              .filter(v => v.option_id === opt.id)
              .map(vote => ({
                ...vote,
                profile: voterProfiles?.find(p => p.user_id === vote.user_id)
              }))
          }))
      }));

      setPolls(enrichedPolls);
    } catch (error) {
      console.error("Failed to load polls:", error);
    }
  };

  const loadPosts = async () => {
    try {
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

        // Get comment counts from group_message_comments
        const postIds = data.map(p => p.id);
        const { data: commentCounts } = await supabase
          .from("group_message_comments")
          .select("message_id")
          .in("message_id", postIds);

        const countMap = new Map<string, number>();
        commentCounts?.forEach(c => {
          countMap.set(c.message_id, (countMap.get(c.message_id) || 0) + 1);
        });

        const enriched = data.map(post => ({
          id: post.id,
          group_id: post.group_id,
          user_id: post.sender_id,
          content: post.content,
          image_url: (post as any).image_url || null,
          file_url: (post as any).file_url || null,
          file_name: (post as any).file_name || null,
          created_at: post.created_at,
          profile: profiles?.find(p => p.user_id === post.sender_id),
          comment_count: countMap.get(post.id) || 0
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

  const loadComments = async (postId: string) => {
    const { data } = await supabase
      .from("group_message_comments")
      .select("*")
      .eq("message_id", postId)
      .order("created_at", { ascending: true });

    if (data && data.length > 0) {
      const userIds = [...new Set(data.map(c => c.user_id))];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, username, full_name, display_name, avatar_url")
        .in("user_id", userIds);

      const enrichedComments = data.map(comment => ({
        ...comment,
        profile: profiles?.find(p => p.user_id === comment.user_id)
      }));

      setCommentsMap(prev => new Map(prev).set(postId, enrichedComments));
    } else {
      setCommentsMap(prev => new Map(prev).set(postId, []));
    }
  };

  const toggleComments = async (postId: string) => {
    const newExpanded = new Set(expandedComments);
    if (newExpanded.has(postId)) {
      newExpanded.delete(postId);
    } else {
      newExpanded.add(postId);
      if (!commentsMap.has(postId)) {
        await loadComments(postId);
      }
    }
    setExpandedComments(newExpanded);
  };

  const postComment = async (postId: string) => {
    if (!user) return;
    const content = newComments.get(postId)?.trim();
    if (!content) return;

    setPostingComment(postId);
    try {
      const { error } = await supabase
        .from("group_message_comments")
        .insert({
          message_id: postId,
          user_id: user.id,
          content,
        });

      if (error) throw error;

      setNewComments(prev => {
        const newMap = new Map(prev);
        newMap.delete(postId);
        return newMap;
      });
      
      await loadComments(postId);
      
      // Update comment count
      setPosts(prev => prev.map(p => 
        p.id === postId 
          ? { ...p, comment_count: (p.comment_count || 0) + 1 }
          : p
      ));

      toast.success("Reactie geplaatst");
    } catch (error) {
      console.error("Comment error:", error);
      toast.error("Kon reactie niet plaatsen");
    } finally {
      setPostingComment(null);
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
    if (!user || (!newContent.trim() && !selectedImage && !selectedFile)) {
      toast.error("Voeg tekst, een afbeelding of bestand toe");
      return;
    }

    setIsPublishing(true);
    try {
      let imageUrl: string | null = null;
      let fileUrl: string | null = null;
      let fileName: string | null = null;

      // Upload image if selected
      if (selectedImage) {
        const filePath = `${user.id}/group-posts/${Date.now()}-${selectedImage.name}`;
        const { error: uploadError } = await supabase.storage
          .from('user-files')
          .upload(filePath, selectedImage);

        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage
          .from('user-files')
          .getPublicUrl(filePath);

        imageUrl = urlData.publicUrl;
      }

      // Upload file if selected
      if (selectedFile) {
        const filePath = `${user.id}/group-posts/${Date.now()}-${selectedFile.name}`;
        const { error: uploadError } = await supabase.storage
          .from('user-files')
          .upload(filePath, selectedFile);

        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage
          .from('user-files')
          .getPublicUrl(filePath);

        fileUrl = urlData.publicUrl;
        fileName = selectedFile.name;
      }

      // Create post with image and file data
      const { data: postData, error } = await supabase
        .from("group_messages")
        .insert({
          group_id: groupId,
          sender_id: user.id,
          content: newContent.trim() || null,
          image_url: imageUrl,
          file_url: fileUrl,
          file_name: fileName,
        })
        .select()
        .single();

      if (error) throw error;

      // Handle @mentions - send notifications
      const mentions = extractMentions(newContent);
      if (mentions.length > 0) {
        // Get user IDs from usernames
        const { data: mentionedProfiles } = await supabase
          .from("profiles")
          .select("user_id, username")
          .in("username", mentions);

        // Get group name
        const { data: groupData } = await supabase
          .from("study_groups")
          .select("name")
          .eq("id", groupId)
          .single();

        // Send notifications
        for (const profile of mentionedProfiles || []) {
          if (profile.user_id !== user.id) {
            await supabase.from("notifications").insert({
              recipient_id: profile.user_id,
              sender_id: user.id,
              type: "mention",
              message: `heeft je genoemd in een gesprek in ${groupData?.name || 'een studiegroep'}`,
            });
          }
        }
      }

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

  const isUserVerified = (userId: string) => verifiedUserIds.includes(userId);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  // Determine if user can post (for public groups: only admins, for private groups: everyone)
  const canPost = !isPublicGroup || isAdmin;

  return (
    <div className="space-y-4 max-w-[80%] mx-auto">
      {/* Create Post - only show if user can post */}
      {user && canPost && (
        <Card>
          <CardContent className="p-4">
            <div className="flex gap-3">
              <Avatar className="w-15 h-15 bg-background" style={{ width: '3.75rem', height: '3.75rem' }}>
                <AvatarImage src={myProfile?.avatar_url || undefined} className="object-cover" />
                <AvatarFallback className="bg-muted text-foreground">
                  {myProfile ? getInitials(myProfile.display_name || myProfile.full_name) : "?"}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <Textarea
                  placeholder="Deel iets met de groep... (Ctrl+V om afbeelding te plakken)"
                  value={newContent}
                  onChange={(e) => setNewContent(e.target.value)}
                  className="min-h-[80px] resize-none border-none shadow-none focus-visible:ring-0 p-0 text-base"
                />

                {/* Image Preview */}
                {imagePreview && (
                  <div className="relative mt-3">
                    <img
                      src={imagePreview}
                      alt="Preview"
                      className="rounded-xl max-h-64 object-cover"
                    />
                    <Button
                      variant="secondary"
                      size="icon"
                      className="absolute top-2 right-2 rounded-full h-8 w-8"
                      onClick={clearAttachments}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                )}

                {/* File Preview */}
                {selectedFile && (
                  <div className="mt-3 flex items-center gap-2 p-3 rounded-xl bg-muted">
                    <FileText className="w-5 h-5 text-muted-foreground" />
                    <span className="flex-1 truncate text-sm">{selectedFile.name}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 rounded-full"
                      onClick={clearAttachments}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center justify-between mt-3 pt-3 border-t">
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="rounded-full h-9 w-9"
                      onClick={() => imageInputRef.current?.click()}
                    >
                      <ImageIcon className="w-5 h-5 text-primary" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="rounded-full h-9 w-9"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <FileText className="w-5 h-5 text-primary" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="rounded-full h-9 w-9"
                      onClick={() => setShowPollDialog(true)}
                      title="Poll aanmaken"
                    >
                      <BarChart3 className="w-5 h-5 text-primary" />
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
                    disabled={isPublishing || (!newContent.trim() && !selectedImage && !selectedFile)}
                    className="rounded-full gap-2"
                  >
                    {isPublishing ? (
                      <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                    Publiceren
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Poll Creation Dialog */}
      <CreatePollDialog
        groupId={groupId}
        open={showPollDialog}
        onOpenChange={setShowPollDialog}
        onPollCreated={loadPolls}
      />

      {/* Polls */}
      {polls.map((poll) => (
        <PollCard key={poll.id} poll={poll} onVote={loadPolls} isAdmin={isAdmin} />
      ))}

      {/* Posts Feed */}
      {posts.length === 0 && polls.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <MessageCircle className="w-10 h-10 mx-auto mb-3 opacity-50" />
          <p className="text-sm">Nog geen posts in deze groep</p>
          <p className="text-xs">Wees de eerste die iets deelt!</p>
        </div>
      ) : (
        <div className="space-y-4">
          {posts.map((post) => (
            <Card key={post.id} className="overflow-hidden">
              <CardContent className="p-4">
                {/* Header */}
                <div className="flex items-start justify-between mb-3">
                  <button
                    onClick={() => post.profile?.username && navigate(`/profiel/${post.profile.username}`)}
                    className="flex items-center gap-3 hover:opacity-80 transition-opacity"
                  >
                    <Avatar className="w-15 h-15 bg-background" style={{ width: '3.75rem', height: '3.75rem' }}>
                      {post.profile?.avatar_url && <AvatarImage src={post.profile.avatar_url} className="object-cover" />}
                      <AvatarFallback className="bg-background text-foreground">
                        {getInitials(post.profile?.display_name || post.profile?.full_name || "?")}
                      </AvatarFallback>
                    </Avatar>
                    <div className="text-left">
                      <p className="font-semibold flex items-center">
                        {post.profile?.display_name || post.profile?.full_name}
                        {post.profile?.user_id && isUserVerified(post.profile.user_id) && (
                          <VerifiedBadge />
                        )}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        @{post.profile?.username} • {formatDate(post.created_at)}
                      </p>
                    </div>
                  </button>

                  {post.user_id === user?.id && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="rounded-full h-8 w-8">
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

                {/* Content */}
                {post.content && (
                  <p className="text-foreground whitespace-pre-wrap mb-3">
                    <LinkifiedText text={post.content} />
                  </p>
                )}

                {/* Image */}
                {post.image_url && (
                  <img
                    src={post.image_url}
                    alt="Post"
                    className="rounded-xl max-h-96 w-full object-cover mb-3"
                  />
                )}

                {/* File */}
                {post.file_url && post.file_name && (
                  <a
                    href={post.file_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 p-3 rounded-xl bg-muted hover:bg-muted/80 transition-colors mb-3"
                  >
                    <FileText className="w-5 h-5 text-primary" />
                    <span className="flex-1 truncate">{post.file_name}</span>
                  </a>
                )}

                {/* Reactions Section */}
                <div className="mt-3">
                  <PostReactions messageId={post.id} />
                </div>

                {/* Comments Section */}
                <div className="mt-4 pt-3 border-t">
                  <button
                    onClick={() => toggleComments(post.id)}
                    className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <MessageCircle className="w-4 h-4" />
                    <span>{post.comment_count || 0} opmerkingen</span>
                    {expandedComments.has(post.id) ? (
                      <ChevronUp className="w-4 h-4" />
                    ) : (
                      <ChevronDown className="w-4 h-4" />
                    )}
                  </button>

                  {expandedComments.has(post.id) && (
                    <div className="mt-3 space-y-3">
                      {/* Comment input */}
                      {user && (
                        <div className="flex items-start gap-2">
                          <Avatar className="w-10 h-10 bg-background">
                            {myProfile?.avatar_url && <AvatarImage src={myProfile.avatar_url} className="object-cover" />}
                            <AvatarFallback className="text-xs bg-background text-foreground">
                              {myProfile ? getInitials(myProfile.display_name || myProfile.full_name) : "?"}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 flex gap-2">
                            <Input
                              placeholder="Schrijf een reactie... 😊"
                              value={newComments.get(post.id) || ""}
                              onChange={(e) => setNewComments(prev => new Map(prev).set(post.id, e.target.value))}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                  e.preventDefault();
                                  postComment(post.id);
                                }
                              }}
                              className="flex-1 h-9 rounded-full text-sm"
                            />
                            <Button
                              size="sm"
                              className="rounded-full h-9 w-9 p-0"
                              disabled={postingComment === post.id || !newComments.get(post.id)?.trim()}
                              onClick={() => postComment(post.id)}
                            >
                              {postingComment === post.id ? (
                                <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                              ) : (
                                <Send className="w-4 h-4" />
                              )}
                            </Button>
                          </div>
                        </div>
                      )}

                      {/* Comments list */}
                      {commentsMap.get(post.id)?.map((comment) => (
                        <div key={comment.id} className="flex items-start gap-2">
                          <Avatar 
                            className="w-10 h-10 cursor-pointer bg-background"
                            onClick={() => comment.profile?.username && navigate(`/profiel/${comment.profile.username}`)}
                          >
                            {comment.profile?.avatar_url && <AvatarImage src={comment.profile.avatar_url} className="object-cover" />}
                            <AvatarFallback className="text-xs bg-background text-foreground">
                              {getInitials(comment.profile?.display_name || comment.profile?.full_name || "?")}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 bg-muted rounded-2xl px-3 py-2">
                            <p 
                              className="text-sm font-medium cursor-pointer hover:underline flex items-center"
                              onClick={() => comment.profile?.username && navigate(`/profiel/${comment.profile.username}`)}
                            >
                              {comment.profile?.display_name || comment.profile?.full_name}
                              {comment.profile?.user_id && isUserVerified(comment.profile.user_id) && (
                                <VerifiedBadge className="w-4 h-4" />
                              )}
                            </p>
                            <p className="text-sm">
                              <LinkifiedText text={comment.content} />
                            </p>
                            <p className="text-xs text-muted-foreground mt-1">
                              {formatDate(comment.created_at)}
                            </p>
                          </div>
                        </div>
                      ))}

                      {commentsMap.get(post.id)?.length === 0 && (
                        <p className="text-sm text-muted-foreground text-center py-2">
                          Nog geen reacties. Wees de eerste!
                        </p>
                      )}
                    </div>
                  )}
                </div>
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
