import { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { LinkifiedText } from "@/components/LinkifiedText";
import { VerifiedBadge } from "@/components/VerifiedBadge";
import { CommunityCard } from "@/components/communities/CommunityCard";
import { useVerifiedUsers, useVerifiedGroups } from "@/hooks/useVerifiedStatus";
import {
  Search, 
  Image as ImageIcon, 
  FileText, 
  X, 
  User, 
  Users, 
  Send,
  MoreHorizontal,
  Trash2,
  MessageCircle,
  ChevronDown,
  ChevronUp,
  Lock
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

interface Publication {
  id: string;
  user_id: string;
  content: string | null;
  image_url: string | null;
  video_url: string | null;
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

interface StudyGroup {
  id: string;
  name: string;
  avatar_url: string | null;
  banner_url: string | null;
  bio: string | null;
  owner_id: string;
  is_public?: boolean;
  member_count?: number;
}

type SearchResultType = 
  | { type: 'profile'; data: Profile }
  | { type: 'group'; data: StudyGroup };

export default function Ontdekken() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { verifiedUserIds } = useVerifiedUsers();
  const { verifiedGroupIds } = useVerifiedGroups();
  const [activeView, setActiveView] = useState<"mijn" | "ontdekken">("mijn");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResultType[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [publications, setPublications] = useState<Publication[]>([]);
  const [loading, setLoading] = useState(true);

  // New publication state
  const [newContent, setNewContent] = useState("");
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedVideo, setSelectedVideo] = useState<File | null>(null);
  const [videoPreview, setVideoPreview] = useState<string | null>(null);
  const [isPublishing, setIsPublishing] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  // Delete state
  const [publicationToDelete, setPublicationToDelete] = useState<Publication | null>(null);

  // User profile for the composer
  const [myProfile, setMyProfile] = useState<Profile | null>(null);

  // Comments state
  const [expandedComments, setExpandedComments] = useState<Set<string>>(new Set());
  const [commentsMap, setCommentsMap] = useState<Map<string, Comment[]>>(new Map());
  const [newComments, setNewComments] = useState<Map<string, string>>(new Map());
  const [postingComment, setPostingComment] = useState<string | null>(null);

  // Group membership check
  const [myGroupIds, setMyGroupIds] = useState<Set<string>>(new Set());
  const [myGroups, setMyGroups] = useState<StudyGroup[]>([]);
  const [adminGroupIds, setAdminGroupIds] = useState<Set<string>>(new Set());
  const [pendingOpenCommunityId, setPendingOpenCommunityId] = useState<string | null>(
    (location.state as any)?.openCommunityId || null
  );

  const isUserVerified = (userId: string) => verifiedUserIds.includes(userId);
  const isGroupVerified = (groupId: string) => verifiedGroupIds.includes(groupId);

  useEffect(() => {
    if (activeView === "ontdekken") {
      loadPublications();
    }
    loadMyProfile();
    loadMyGroups();

    const channel = supabase
      .channel("publications-realtime")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "publications",
        },
        () => {
          if (activeView === "ontdekken") {
            loadPublications();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeView]);

  // Handle navigation with openCommunityId state - redirect to community page
  useEffect(() => {
    if (pendingOpenCommunityId) {
      navigate(`/community/${pendingOpenCommunityId}`, { replace: true });
      setPendingOpenCommunityId(null);
    }
  }, [pendingOpenCommunityId, navigate]);

  const loadMyGroups = async () => {
    if (!user) return;
    
    // Get groups where user is owner (only public ones for this view)
    const { data: ownedGroups } = await supabase
      .from("study_groups")
      .select("id, name, avatar_url, banner_url, bio, owner_id, is_public")
      .eq("owner_id", user.id)
      .eq("is_public", true);

    // Get groups where user is a member (accepted)
    const { data: memberGroups } = await supabase
      .from("group_members")
      .select("group_id")
      .eq("user_id", user.id)
      .eq("status", "accepted");

    // Get groups where user is admin
    const { data: adminGroups } = await supabase
      .from("group_admins")
      .select("group_id")
      .eq("user_id", user.id);

    const ids = new Set<string>();
    const adminIds = new Set<string>();
    
    ownedGroups?.forEach(g => {
      ids.add(g.id);
      adminIds.add(g.id); // Owners are also admins
    });
    memberGroups?.forEach(m => ids.add(m.group_id));
    adminGroups?.forEach(a => adminIds.add(a.group_id));
    
    setMyGroupIds(ids);
    setAdminGroupIds(adminIds);
    
    // Load full details for PUBLIC groups only (private groups stay in Studie page)
    const allGroupIds = Array.from(ids);
    if (allGroupIds.length > 0) {
      const { data: allGroupsData } = await supabase
        .from("study_groups")
        .select("id, name, avatar_url, banner_url, bio, owner_id, is_public")
        .in("id", allGroupIds)
        .eq("is_public", true); // Only public communities
      
      // Get member counts
      const enrichedGroups: StudyGroup[] = [];
      for (const group of allGroupsData || []) {
        const { count } = await supabase
          .from("group_members")
          .select("*", { count: 'exact', head: true })
          .eq("group_id", group.id)
          .eq("status", "accepted");
        
        enrichedGroups.push({
          ...group,
          banner_url: group.banner_url || null,
          bio: group.bio || null,
          member_count: (count || 0) + 1 // +1 for owner
        });
      }
      setMyGroups(enrichedGroups);
    } else {
      setMyGroups([]);
    }
  };

  const loadMyProfile = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("profiles")
      .select("user_id, username, full_name, display_name, avatar_url")
      .eq("user_id", user.id)
      .single();
    if (data) setMyProfile(data);
  };

  const loadPublications = async () => {
    try {
      const { data, error } = await supabase
        .from("publications")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) throw error;

      // Enrich with profiles and comment counts
      if (data && data.length > 0) {
        const userIds = [...new Set(data.map(p => p.user_id))];
        const { data: profiles } = await supabase
          .from("profiles")
          .select("user_id, username, full_name, display_name, avatar_url")
          .in("user_id", userIds);

        // Get comment counts
        const pubIds = data.map(p => p.id);
        const { data: commentCounts } = await supabase
          .from("publication_comments")
          .select("publication_id")
          .in("publication_id", pubIds);

        const countMap = new Map<string, number>();
        commentCounts?.forEach(c => {
          countMap.set(c.publication_id, (countMap.get(c.publication_id) || 0) + 1);
        });

        const enriched = data.map(pub => ({
          ...pub,
          profile: profiles?.find(p => p.user_id === pub.user_id),
          comment_count: countMap.get(pub.id) || 0
        }));
        setPublications(enriched);
      } else {
        setPublications([]);
      }
    } catch (error) {
      console.error("Failed to load publications:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadComments = async (publicationId: string) => {
    const { data } = await supabase
      .from("publication_comments")
      .select("*")
      .eq("publication_id", publicationId)
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

      setCommentsMap(prev => new Map(prev).set(publicationId, enrichedComments));
    } else {
      setCommentsMap(prev => new Map(prev).set(publicationId, []));
    }
  };

  const toggleComments = async (publicationId: string) => {
    const newExpanded = new Set(expandedComments);
    if (newExpanded.has(publicationId)) {
      newExpanded.delete(publicationId);
    } else {
      newExpanded.add(publicationId);
      if (!commentsMap.has(publicationId)) {
        await loadComments(publicationId);
      }
    }
    setExpandedComments(newExpanded);
  };

  const postComment = async (publicationId: string) => {
    if (!user) return;
    const content = newComments.get(publicationId)?.trim();
    if (!content) return;

    setPostingComment(publicationId);
    try {
      const { error } = await supabase
        .from("publication_comments")
        .insert({
          publication_id: publicationId,
          user_id: user.id,
          content,
        });

      if (error) throw error;

      setNewComments(prev => {
        const newMap = new Map(prev);
        newMap.delete(publicationId);
        return newMap;
      });
      
      await loadComments(publicationId);
      
      // Update comment count
      setPublications(prev => prev.map(p => 
        p.id === publicationId 
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

  const search = async (query: string) => {
    if (query.length < 2) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    try {
      const results: SearchResultType[] = [];

      // Search profiles
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, username, full_name, display_name, avatar_url")
        .or(`username.ilike.%${query}%,full_name.ilike.%${query}%`)
        .limit(5);

      profiles?.forEach(p => results.push({ type: 'profile', data: p }));

      // Search study groups (only public ones)
      const { data: groups } = await supabase
        .from("study_groups")
        .select("id, name, avatar_url, banner_url, bio, owner_id, is_public")
        .ilike("name", `%${query}%`)
        .eq("is_public", true)
        .limit(5);

      groups?.forEach(g => results.push({ type: 'group', data: { ...g, banner_url: g.banner_url || null, bio: g.bio || null } }));

      setSearchResults(results);
    } catch (error) {
      console.error("Search error:", error);
    } finally {
      setIsSearching(false);
    }
  };

  useEffect(() => {
    const debounce = setTimeout(() => {
      search(searchQuery);
    }, 300);
    return () => clearTimeout(debounce);
  }, [searchQuery]);

  // Handle Ctrl+V paste for images
  useEffect(() => {
    const handlePaste = async (e: ClipboardEvent) => {
      if (activeView !== "ontdekken") return;
      
      const items = e.clipboardData?.items;
      if (!items) return;

      for (const item of items) {
        if (item.type.startsWith('image/')) {
          e.preventDefault();
          const file = item.getAsFile();
          if (file) {
            setSelectedImage(file);
            setSelectedFile(null);
            setSelectedVideo(null);
            setVideoPreview(null);
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
  }, [activeView]);

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error("Selecteer een afbeelding");
      return;
    }

    setSelectedImage(file);
    setSelectedFile(null);
    setSelectedVideo(null);
    setVideoPreview(null);
    const reader = new FileReader();
    reader.onload = (e) => setImagePreview(e.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleVideoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('video/')) {
      toast.error("Selecteer een video");
      return;
    }

    if (file.size > 100 * 1024 * 1024) {
      toast.error("Video mag maximaal 100MB zijn");
      return;
    }

    setSelectedVideo(file);
    setSelectedImage(null);
    setSelectedFile(null);
    setImagePreview(null);
    setVideoPreview(URL.createObjectURL(file));
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
    setSelectedVideo(null);
    setImagePreview(null);
    setVideoPreview(null);
  };

  const clearAttachments = () => {
    setSelectedImage(null);
    setSelectedFile(null);
    setSelectedVideo(null);
    setImagePreview(null);
    setVideoPreview(null);
    if (imageInputRef.current) imageInputRef.current.value = '';
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (videoInputRef.current) videoInputRef.current.value = '';
  };

  const publishPost = async () => {
    if (!user || (!newContent.trim() && !selectedImage && !selectedFile && !selectedVideo)) {
      toast.error("Voeg tekst, een afbeelding, video of bestand toe");
      return;
    }

    setIsPublishing(true);
    try {
      let imageUrl: string | null = null;
      let videoUrl: string | null = null;
      let fileUrl: string | null = null;
      let fileName: string | null = null;

      // Upload image if selected
      if (selectedImage) {
        const filePath = `${user.id}/publications/${Date.now()}-${selectedImage.name}`;
        const { error: uploadError } = await supabase.storage
          .from('user-files')
          .upload(filePath, selectedImage);

        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage
          .from('user-files')
          .getPublicUrl(filePath);

        imageUrl = urlData.publicUrl;
      }

      // Upload video if selected
      if (selectedVideo) {
        const filePath = `${user.id}/publications/${Date.now()}-${selectedVideo.name}`;
        const { error: uploadError } = await supabase.storage
          .from('user-files')
          .upload(filePath, selectedVideo);

        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage
          .from('user-files')
          .getPublicUrl(filePath);

        videoUrl = urlData.publicUrl;
      }

      // Upload file if selected
      if (selectedFile) {
        const filePath = `${user.id}/publications/${Date.now()}-${selectedFile.name}`;
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

      // Create publication
      const { error } = await supabase
        .from("publications")
        .insert({
          user_id: user.id,
          content: newContent.trim() || null,
          image_url: imageUrl,
          video_url: videoUrl,
          file_url: fileUrl,
          file_name: fileName,
        });

      if (error) throw error;

      toast.success("Publicatie geplaatst!");
      setNewContent("");
      clearAttachments();
      loadPublications();
    } catch (error) {
      console.error("Publish error:", error);
      toast.error("Kon publicatie niet plaatsen");
    } finally {
      setIsPublishing(false);
    }
  };

  const deletePublication = async () => {
    if (!publicationToDelete) return;

    try {
      const { error } = await supabase
        .from("publications")
        .delete()
        .eq("id", publicationToDelete.id);

      if (error) throw error;
      setPublicationToDelete(null);
      toast.success("Publicatie verwijderd");
      loadPublications();
    } catch (error) {
      toast.error("Kon publicatie niet verwijderen");
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

  return (
    <div className="w-full">
      {/* Toggle - Mijn Communities / Ontdekken + Search button - centered, no page title */}
      <div className="flex justify-center items-center gap-3 mb-8">
        <div className="inline-flex bg-muted rounded-full p-1 border" style={{ minWidth: '400px' }}>
          <button
            onClick={() => setActiveView("mijn")}
            className={`flex-1 px-8 py-2.5 rounded-full text-sm font-medium transition-colors ${
              activeView === "mijn" 
                ? "bg-background shadow-sm text-foreground" 
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Mijn Communities
          </button>
          <button
            onClick={() => setActiveView("ontdekken")}
            className={`flex-1 px-8 py-2.5 rounded-full text-sm font-medium transition-colors ${
              activeView === "ontdekken" 
                ? "bg-background shadow-sm text-foreground" 
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Ontdekken
          </button>
        </div>
        {/* Round search button */}
        <Button
          variant="outline"
          size="icon"
          className="rounded-full h-[46px] w-[46px] bg-muted border hover:bg-muted/80"
          onClick={() => setActiveView("ontdekken")}
        >
          <Search className="w-5 h-5" />
        </Button>
      </div>

      {activeView === "mijn" ? (
        // My Communities View - New card design grid
        <div className="space-y-6">
          {myGroups.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p className="text-lg font-medium">Geen communities gevonden</p>
              <p className="text-sm">Ontdek nieuwe communities om lid te worden!</p>
              <Button 
                variant="outline" 
                className="mt-4 rounded-full"
                onClick={() => setActiveView("ontdekken")}
              >
                Ontdekken
              </Button>
            </div>
          ) : (
            // Community Cards Grid - matching the screenshot design with more vertical space
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {myGroups.map((group) => {
                const isAdmin = adminGroupIds.has(group.id);
                return (
                  <CommunityCard
                    key={group.id}
                    id={group.id}
                    name={group.name}
                    avatar_url={group.avatar_url}
                    banner_url={group.banner_url}
                    bio={group.bio}
                    member_count={group.member_count || 1}
                    isVerified={isGroupVerified(group.id)}
                    isAdmin={isAdmin}
                  />
                );
              })}
            </div>
          )}
        </div>
      ) : (
        // Ontdekken View - Search + Publications Feed only
        <div className="space-y-6">
          {/* Search Bar */}
          <div className="sticky top-0 z-10 bg-background pb-4">
            <div className="relative max-w-2xl mx-auto">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <Input
                placeholder="Zoek accounts, groepen en publicaties..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && searchQuery.length >= 2) {
                    navigate(`/zoeken?q=${encodeURIComponent(searchQuery)}`);
                  }
                }}
                className="pl-12 h-12 text-lg rounded-full bg-muted/50 border-none focus-visible:ring-2"
              />
            </div>

            {/* Search Results Dropdown */}
            {searchQuery.length >= 2 && (
              <Card className="mt-2 shadow-lg max-w-2xl mx-auto">
                <CardContent className="p-2">
                  {isSearching ? (
                    <div className="flex items-center justify-center py-4">
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary" />
                    </div>
                  ) : searchResults.length === 0 ? (
                    <p className="text-center text-muted-foreground py-4">Geen resultaten gevonden</p>
                  ) : (
                    <ScrollArea className={searchResults.length > 6 ? "h-80" : ""}>
                      <div className="space-y-1">
                        {searchResults.map((result) => {
                          if (result.type === 'profile') {
                            const p = result.data;
                            return (
                              <div
                                key={`profile-${p.user_id}`}
                                className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-muted transition-colors cursor-pointer"
                                onClick={() => {
                                  navigate(`/profiel/${p.username}`);
                                  setSearchQuery("");
                                }}
                              >
                                <Avatar className="w-10 h-10">
                                  {p.avatar_url && <AvatarImage src={p.avatar_url} className="object-cover" />}
                                  <AvatarFallback>{getInitials(p.display_name || p.full_name)}</AvatarFallback>
                                </Avatar>
                                <div className="text-left flex-1">
                                  <p className="font-medium flex items-center">
                                    {p.display_name || p.full_name}
                                    {isUserVerified(p.user_id) && <VerifiedBadge />}
                                  </p>
                                  <p className="text-sm text-muted-foreground">@{p.username}</p>
                                </div>
                              </div>
                            );
                          }

                          if (result.type === 'group') {
                            const g = result.data;
                            return (
                              <div
                                key={`group-${g.id}`}
                                className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-muted transition-colors cursor-pointer"
                                onClick={() => {
                                  navigate(`/groep/${g.id}`);
                                  setSearchQuery("");
                                }}
                              >
                                <Avatar className="w-10 h-10 bg-background">
                                  {g.avatar_url && <AvatarImage src={g.avatar_url} className="object-cover" />}
                                  <AvatarFallback className="bg-muted text-primary"><Users className="w-5 h-5" /></AvatarFallback>
                                </Avatar>
                                <div className="text-left flex-1">
                                  <p className="font-medium flex items-center">
                                    {g.name}
                                    {isGroupVerified(g.id) && <VerifiedBadge />}
                                  </p>
                                  <p className="text-sm text-muted-foreground">Community</p>
                                </div>
                              </div>
                            );
                          }

                          return null;
                        })}
                      </div>
                    </ScrollArea>
                  )}
                </CardContent>
              </Card>
            )}
          </div>

          {/* Publications Feed - Constrained width */}
          <div className="max-w-2xl mx-auto">
            {/* Create Publication */}
            {user && (
              <Card className="mb-6">
                <CardContent className="p-4">
                  <div className="flex gap-3">
                    <Avatar className="w-12 h-12 bg-background">
                      <AvatarImage src={myProfile?.avatar_url || undefined} className="object-cover" />
                      <AvatarFallback className="bg-muted">
                        {myProfile ? getInitials(myProfile.display_name || myProfile.full_name) : "?"}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <Textarea
                        placeholder="Deel iets met de community... (Ctrl+V om afbeelding te plakken)"
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

                      {/* Video Preview */}
                      {videoPreview && (
                        <div className="relative mt-3">
                          <video
                            src={videoPreview}
                            controls
                            className="rounded-xl max-h-64 w-full"
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
                        <div className="flex gap-1">
                          <input
                            ref={imageInputRef}
                            type="file"
                            accept="image/*"
                            onChange={handleImageSelect}
                            className="hidden"
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            className="rounded-full h-9 w-9"
                            onClick={() => imageInputRef.current?.click()}
                          >
                            <ImageIcon className="w-5 h-5 text-muted-foreground" />
                          </Button>

                          <input
                            ref={videoInputRef}
                            type="file"
                            accept="video/*"
                            onChange={handleVideoSelect}
                            className="hidden"
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            className="rounded-full h-9 w-9"
                            onClick={() => videoInputRef.current?.click()}
                            title="Video uploaden (max 100MB)"
                          >
                            <svg className="w-5 h-5 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <rect x="2" y="4" width="20" height="16" rx="2" />
                              <polygon points="10,8 16,12 10,16" fill="currentColor" stroke="none" />
                            </svg>
                          </Button>

                          <input
                            ref={fileInputRef}
                            type="file"
                            onChange={handleFileSelect}
                            className="hidden"
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            className="rounded-full h-9 w-9"
                            onClick={() => fileInputRef.current?.click()}
                          >
                            <FileText className="w-5 h-5 text-muted-foreground" />
                          </Button>
                        </div>

                        <Button
                          onClick={publishPost}
                          disabled={isPublishing || (!newContent.trim() && !selectedImage && !selectedFile && !selectedVideo)}
                          className="rounded-full"
                        >
                          {isPublishing ? (
                            <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                          ) : (
                            "Publiceren"
                          )}
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Publications List */}
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
              </div>
            ) : publications.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Search className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p className="text-lg font-medium">Nog geen publicaties</p>
                <p className="text-sm">Wees de eerste die iets deelt!</p>
              </div>
            ) : (
              <div className="space-y-4">
                {publications.map((pub) => (
                  <Card key={pub.id} className="overflow-hidden">
                    <CardContent className="p-4">
                      {/* Header */}
                      <div className="flex items-start justify-between mb-3">
                        <button
                          onClick={() => pub.profile?.username && navigate(`/profiel/${pub.profile.username}`)}
                          className="flex items-center gap-3 hover:opacity-80 transition-opacity"
                        >
                          <Avatar className="w-12 h-12">
                            {pub.profile?.avatar_url && <AvatarImage src={pub.profile.avatar_url} className="object-cover" />}
                            <AvatarFallback>
                              {getInitials(pub.profile?.display_name || pub.profile?.full_name || "?")}
                            </AvatarFallback>
                          </Avatar>
                          <div className="text-left">
                            <p className="font-semibold flex items-center">
                              {pub.profile?.display_name || pub.profile?.full_name}
                              {pub.profile?.user_id && isUserVerified(pub.profile.user_id) && (
                                <VerifiedBadge />
                              )}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              @{pub.profile?.username} • {formatDate(pub.created_at)}
                            </p>
                          </div>
                        </button>

                        {pub.user_id === user?.id && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="rounded-full h-8 w-8">
                                <MoreHorizontal className="w-4 h-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={() => setPublicationToDelete(pub)}
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
                      {pub.content && (
                        <p className="text-foreground whitespace-pre-wrap mb-3">
                          <LinkifiedText text={pub.content} />
                        </p>
                      )}

                      {/* Image */}
                      {pub.image_url && (
                        <img
                          src={pub.image_url}
                          alt="Publication"
                          className="rounded-xl max-h-96 w-full object-cover"
                        />
                      )}

                      {/* Video */}
                      {pub.video_url && (
                        <video
                          src={pub.video_url}
                          controls
                          className="rounded-xl max-h-96 w-full"
                        />
                      )}

                      {/* File */}
                      {pub.file_url && pub.file_name && (
                        <a
                          href={pub.file_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-3 p-3 rounded-xl bg-muted hover:bg-muted/80 transition-colors"
                        >
                          <FileText className="w-5 h-5 text-primary" />
                          <span className="flex-1 truncate">{pub.file_name}</span>
                        </a>
                      )}

                      {/* Comments Section */}
                      <div className="mt-4 pt-3 border-t">
                        <button
                          onClick={() => toggleComments(pub.id)}
                          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                        >
                          <MessageCircle className="w-4 h-4" />
                          <span>{pub.comment_count || 0} reacties</span>
                          {expandedComments.has(pub.id) ? (
                            <ChevronUp className="w-4 h-4" />
                          ) : (
                            <ChevronDown className="w-4 h-4" />
                          )}
                        </button>

                        {expandedComments.has(pub.id) && (
                          <div className="mt-3 space-y-3">
                            {/* Comment input */}
                            {user && (
                              <div className="flex items-start gap-2">
                                <Avatar className="w-8 h-8">
                                  {myProfile?.avatar_url && <AvatarImage src={myProfile.avatar_url} className="object-cover" />}
                                  <AvatarFallback className="text-xs">
                                    {myProfile ? getInitials(myProfile.display_name || myProfile.full_name) : "?"}
                                  </AvatarFallback>
                                </Avatar>
                                <div className="flex-1 flex gap-2">
                                  <Input
                                    placeholder="Schrijf een reactie... 😊"
                                    value={newComments.get(pub.id) || ""}
                                    onChange={(e) => setNewComments(prev => new Map(prev).set(pub.id, e.target.value))}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        postComment(pub.id);
                                      }
                                    }}
                                    className="flex-1 h-9 rounded-full text-sm"
                                  />
                                  <Button
                                    size="sm"
                                    className="rounded-full h-9 w-9 p-0"
                                    disabled={postingComment === pub.id || !newComments.get(pub.id)?.trim()}
                                    onClick={() => postComment(pub.id)}
                                  >
                                    {postingComment === pub.id ? (
                                      <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                                    ) : (
                                      <Send className="w-4 h-4" />
                                    )}
                                  </Button>
                                </div>
                              </div>
                            )}

                            {/* Comments list */}
                            {commentsMap.get(pub.id)?.map((comment) => (
                              <div key={comment.id} className="flex items-start gap-2">
                                <Avatar 
                                  className="w-8 h-8 cursor-pointer"
                                  onClick={() => comment.profile?.username && navigate(`/profiel/${comment.profile.username}`)}
                                >
                                  {comment.profile?.avatar_url && <AvatarImage src={comment.profile.avatar_url} className="object-cover" />}
                                  <AvatarFallback className="text-xs">
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
                                  <p className="text-sm">{comment.content}</p>
                                  <p className="text-xs text-muted-foreground mt-1">
                                    {formatDate(comment.created_at)}
                                  </p>
                                </div>
                              </div>
                            ))}

                            {commentsMap.get(pub.id)?.length === 0 && (
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
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      <AlertDialog open={!!publicationToDelete} onOpenChange={() => setPublicationToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Publicatie verwijderen?</AlertDialogTitle>
            <AlertDialogDescription>
              Deze actie kan niet ongedaan worden gemaakt.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction
              onClick={deletePublication}
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
