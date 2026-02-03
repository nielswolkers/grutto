import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Plus, ChevronLeft, ChevronRight, X, Camera } from "lucide-react";
import { toast } from "sonner";

interface GroupMember {
  id: string;
  user_id: string;
  status: string;
  profile?: {
    username: string;
    full_name: string;
    display_name: string | null;
    avatar_url: string | null;
  };
}

interface Story {
  id: string;
  user_id: string;
  group_id: string;
  image_url: string;
  created_at: string;
}

interface GroupedStory {
  user_id: string;
  profile: {
    username: string;
    full_name: string;
    display_name: string | null;
    avatar_url: string | null;
  };
  stories: Story[];
  hasUnviewed: boolean;
}

interface GroupUpdatesProps {
  groupId: string;
  userId: string;
  members: GroupMember[];
  ownerId: string;
}

export function GroupUpdates({ groupId, userId, members, ownerId }: GroupUpdatesProps) {
  const [stories, setStories] = useState<GroupedStory[]>([]);
  const [myStories, setMyStories] = useState<Story[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Story viewer state
  const [viewerOpen, setViewerOpen] = useState(false);
  const [currentGroupIndex, setCurrentGroupIndex] = useState(0);
  const [currentStoryIndex, setCurrentStoryIndex] = useState(0);
  const [viewedStories, setViewedStories] = useState<Set<string>>(new Set());
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    loadStories();
  }, [groupId]);

  // Auto-progress timer for story viewer
  useEffect(() => {
    if (!viewerOpen) return;

    const interval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 100) {
          handleNextStory();
          return 0;
        }
        return prev + 2;
      });
    }, 100);

    return () => clearInterval(interval);
  }, [viewerOpen, currentGroupIndex, currentStoryIndex]);

  const loadStories = async () => {
    try {
      // Get all member IDs including owner
      const memberIds = [ownerId, ...members.filter(m => m.status === "accepted").map(m => m.user_id)];

      // Load stories from last 24 hours
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      
      const { data: storiesData } = await supabase
        .from("group_stories")
        .select("*")
        .eq("group_id", groupId)
        .gte("created_at", oneDayAgo)
        .order("created_at", { ascending: true });

      // Load viewed stories for current user
      const { data: viewedData } = await supabase
        .from("story_views")
        .select("story_id")
        .eq("user_id", userId);

      const viewedIds = new Set(viewedData?.map(v => v.story_id) || []);
      setViewedStories(viewedIds);

      // My stories
      const myStoriesFiltered = (storiesData || []).filter(s => s.user_id === userId);
      setMyStories(myStoriesFiltered);

      // Group stories by user
      const otherStories = (storiesData || []).filter(s => s.user_id !== userId);
      const userStoriesMap = new Map<string, Story[]>();

      otherStories.forEach(story => {
        const existing = userStoriesMap.get(story.user_id) || [];
        userStoriesMap.set(story.user_id, [...existing, story]);
      });

      // Load profiles for users with stories
      const userIds = Array.from(userStoriesMap.keys());
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, username, full_name, display_name, avatar_url")
        .in("user_id", userIds);

      const grouped: GroupedStory[] = [];
      userStoriesMap.forEach((userStories, uId) => {
        const profile = profiles?.find(p => p.user_id === uId);
        if (profile) {
          const hasUnviewed = userStories.some(s => !viewedIds.has(s.id));
          grouped.push({
            user_id: uId,
            profile,
            stories: userStories,
            hasUnviewed
          });
        }
      });

      // Sort: unviewed first, then by most recent
      grouped.sort((a, b) => {
        if (a.hasUnviewed && !b.hasUnviewed) return -1;
        if (!a.hasUnviewed && b.hasUnviewed) return 1;
        const aLatest = Math.max(...a.stories.map(s => new Date(s.created_at).getTime()));
        const bLatest = Math.max(...b.stories.map(s => new Date(s.created_at).getTime()));
        return bLatest - aLatest;
      });

      setStories(grouped);
    } catch (error) {
      console.error("Failed to load stories:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error("Selecteer een afbeelding");
      return;
    }

    setUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const filePath = `${userId}/stories/${groupId}-${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('user-files')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('user-files')
        .getPublicUrl(filePath);

      await supabase.from("group_stories").insert({
        group_id: groupId,
        user_id: userId,
        image_url: urlData.publicUrl,
      });

      toast.success("Update geplaatst!");
      loadStories();
    } catch (error) {
      console.error("Upload error:", error);
      toast.error("Kon update niet plaatsen");
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const openStoryViewer = (groupIndex: number) => {
    setCurrentGroupIndex(groupIndex);
    setCurrentStoryIndex(0);
    setProgress(0);
    setViewerOpen(true);
    markStoryAsViewed(stories[groupIndex].stories[0].id);
  };

  const openMyStories = () => {
    if (myStories.length === 0) return;
    // Create a temporary grouped story for viewing own stories
    const myGroupedStory: GroupedStory = {
      user_id: userId,
      profile: {
        username: "",
        full_name: "Jij",
        display_name: "Jij",
        avatar_url: null,
      },
      stories: myStories,
      hasUnviewed: false,
    };
    setStories(prev => [myGroupedStory, ...prev.filter(s => s.user_id !== userId)]);
    setCurrentGroupIndex(0);
    setCurrentStoryIndex(0);
    setProgress(0);
    setViewerOpen(true);
  };

  const markStoryAsViewed = async (storyId: string) => {
    if (viewedStories.has(storyId)) return;

    try {
      await supabase.from("story_views").insert({
        story_id: storyId,
        user_id: userId,
      });
      setViewedStories(prev => new Set([...prev, storyId]));
    } catch (error) {
      // Ignore duplicate errors
    }
  };

  const handleNextStory = () => {
    const currentGroup = stories[currentGroupIndex];
    if (!currentGroup) return;

    if (currentStoryIndex < currentGroup.stories.length - 1) {
      // Next story in same group
      const nextIndex = currentStoryIndex + 1;
      setCurrentStoryIndex(nextIndex);
      setProgress(0);
      markStoryAsViewed(currentGroup.stories[nextIndex].id);
    } else if (currentGroupIndex < stories.length - 1) {
      // Next group
      const nextGroupIndex = currentGroupIndex + 1;
      setCurrentGroupIndex(nextGroupIndex);
      setCurrentStoryIndex(0);
      setProgress(0);
      markStoryAsViewed(stories[nextGroupIndex].stories[0].id);
    } else {
      // End of all stories
      setViewerOpen(false);
    }
  };

  const handlePrevStory = () => {
    if (currentStoryIndex > 0) {
      setCurrentStoryIndex(prev => prev - 1);
      setProgress(0);
    } else if (currentGroupIndex > 0) {
      const prevGroupIndex = currentGroupIndex - 1;
      setCurrentGroupIndex(prevGroupIndex);
      setCurrentStoryIndex(stories[prevGroupIndex].stories.length - 1);
      setProgress(0);
    }
  };

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const [myProfile, setMyProfile] = useState<any>(null);
  useEffect(() => {
    const loadMyProfile = async () => {
      const { data } = await supabase
        .from("profiles")
        .select("avatar_url, display_name, full_name")
        .eq("user_id", userId)
        .single();
      if (data) setMyProfile(data);
    };
    loadMyProfile();
  }, [userId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  const currentGroup = stories[currentGroupIndex];
  const currentStory = currentGroup?.stories[currentStoryIndex];

  return (
    <div className="space-y-6">
      {/* Story circles - Instagram style horizontal scroll */}
      <div className="flex gap-4 overflow-x-auto pb-4 -mx-2 px-2">
        {/* Add story button */}
        <div className="flex flex-col items-center gap-2 shrink-0">
          <button
            onClick={() => myStories.length > 0 ? openMyStories() : fileInputRef.current?.click()}
            className="relative"
            disabled={uploading}
          >
            <div className={`w-20 h-20 rounded-full flex items-center justify-center ${
              myStories.length > 0 
                ? 'ring-2 ring-primary ring-offset-2 ring-offset-background' 
                : 'border-2 border-dashed border-muted-foreground/50'
            }`}>
              {myProfile?.avatar_url ? (
                <Avatar className="w-full h-full">
                  <AvatarImage src={myProfile.avatar_url} className="object-cover" />
                  <AvatarFallback>{getInitials(myProfile.display_name || myProfile.full_name || "Jij")}</AvatarFallback>
                </Avatar>
              ) : (
                <div className="w-full h-full rounded-full bg-muted flex items-center justify-center">
                  <Plus className="w-6 h-6 text-muted-foreground" />
                </div>
              )}
            </div>
            {/* Plus badge */}
            <div className="absolute bottom-0 right-0 w-6 h-6 rounded-full bg-primary flex items-center justify-center border-2 border-background">
              <Plus className="w-3 h-3 text-primary-foreground" />
            </div>
          </button>
          <span className="text-xs text-muted-foreground">Jouw update</span>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileSelect}
          />
        </div>

        {/* Other users' stories */}
        {stories.filter(s => s.user_id !== userId).map((group, idx) => (
          <div key={group.user_id} className="flex flex-col items-center gap-2 shrink-0">
            <button
              onClick={() => openStoryViewer(stories.findIndex(s => s.user_id === group.user_id))}
              className="relative"
            >
              <div className={`w-20 h-20 rounded-full p-0.5 ${
                group.hasUnviewed
                  ? 'bg-gradient-to-tr from-yellow-400 via-red-500 to-purple-500'
                  : 'bg-muted'
              }`}>
                <div className="w-full h-full rounded-full bg-background p-0.5">
                  <Avatar className="w-full h-full">
                    {group.profile.avatar_url && (
                      <AvatarImage src={group.profile.avatar_url} className="object-cover" />
                    )}
                    <AvatarFallback>
                      {getInitials(group.profile.display_name || group.profile.full_name)}
                    </AvatarFallback>
                  </Avatar>
                </div>
              </div>
            </button>
            <span className="text-xs text-muted-foreground truncate max-w-[80px]">
              {group.profile.display_name || group.profile.full_name.split(' ')[0]}
            </span>
          </div>
        ))}
      </div>

      {/* Empty state */}
      {stories.filter(s => s.user_id !== userId).length === 0 && myStories.length === 0 && (
        <Card className="p-8 text-center">
          <Camera className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
          <h3 className="font-semibold mb-2">Geen updates</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Deel een foto om je groepsgenoten te laten zien waar je mee bezig bent!
          </p>
          <Button onClick={() => fileInputRef.current?.click()} className="rounded-full">
            <Plus className="w-4 h-4 mr-2" />
            Update plaatsen
          </Button>
        </Card>
      )}

      {/* Story Viewer Dialog */}
      <Dialog open={viewerOpen} onOpenChange={setViewerOpen}>
        <DialogContent className="max-w-md p-0 bg-black border-none overflow-hidden">
          {currentGroup && currentStory && (
            <div className="relative w-full aspect-[9/16] bg-black">
              {/* Progress bars */}
              <div className="absolute top-2 left-2 right-2 flex gap-1 z-20">
                {currentGroup.stories.map((_, idx) => (
                  <div key={idx} className="flex-1 h-0.5 bg-white/30 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-white transition-all duration-100"
                      style={{
                        width: idx < currentStoryIndex ? '100%' : idx === currentStoryIndex ? `${progress}%` : '0%'
                      }}
                    />
                  </div>
                ))}
              </div>

              {/* Header */}
              <div className="absolute top-6 left-4 right-4 flex items-center gap-3 z-20">
                <Avatar className="w-10 h-10 border-2 border-white">
                  {currentGroup.profile.avatar_url && (
                    <AvatarImage src={currentGroup.profile.avatar_url} className="object-cover" />
                  )}
                  <AvatarFallback className="text-sm">
                    {getInitials(currentGroup.profile.display_name || currentGroup.profile.full_name)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <p className="text-white text-sm font-medium">
                    {currentGroup.profile.display_name || currentGroup.profile.full_name}
                  </p>
                  <p className="text-white/70 text-xs">
                    {new Date(currentStory.created_at).toLocaleTimeString('nl-NL', { 
                      hour: '2-digit', 
                      minute: '2-digit' 
                    })}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setViewerOpen(false)}
                  className="text-white hover:bg-white/20 rounded-full"
                >
                  <X className="w-5 h-5" />
                </Button>
              </div>

              {/* Story image */}
              <img
                src={currentStory.image_url}
                alt="Story"
                className="w-full h-full object-contain"
              />

              {/* Navigation areas */}
              <button
                onClick={handlePrevStory}
                className="absolute left-0 top-20 bottom-20 w-1/3 z-10"
                aria-label="Previous"
              />
              <button
                onClick={handleNextStory}
                className="absolute right-0 top-20 bottom-20 w-1/3 z-10"
                aria-label="Next"
              />

              {/* Navigation arrows */}
              {(currentStoryIndex > 0 || currentGroupIndex > 0) && (
                <button
                  onClick={handlePrevStory}
                  className="absolute left-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/50 text-white z-20"
                >
                  <ChevronLeft className="w-6 h-6" />
                </button>
              )}
              {(currentStoryIndex < currentGroup.stories.length - 1 || currentGroupIndex < stories.length - 1) && (
                <button
                  onClick={handleNextStory}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/50 text-white z-20"
                >
                  <ChevronRight className="w-6 h-6" />
                </button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
