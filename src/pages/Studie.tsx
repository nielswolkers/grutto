import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Users, X, UserPlus, Play, Pause, Clock, ChevronLeft, MessageCircle, Settings, Trash2, Camera, FolderOpen, Newspaper } from "lucide-react";
import { toast } from "sonner";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { format, startOfDay, endOfDay } from "date-fns";
import { GroupPosts } from "@/components/studie/GroupPosts";
import { GroupMaterials } from "@/components/studie/GroupMaterials";
import { VerifiedBadge } from "@/components/VerifiedBadge";
import { useVerifiedGroups } from "@/hooks/useVerifiedStatus";

interface StudyGroup {
  id: string;
  name: string;
  owner_id: string;
  avatar_url: string | null;
  banner_url: string | null;
  created_at: string;
  members?: GroupMember[];
}

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
  isStudying?: boolean;
  todayStudyTime?: number;
}

interface Profile {
  user_id: string;
  username: string;
  full_name: string;
  display_name: string | null;
}

interface StudySession {
  id: string;
  user_id: string;
  started_at: string;
  is_active: boolean;
  duration_minutes?: number;
}

// Owner Member Card Component
function OwnerMemberCard({
  ownerId,
  isStudying,
  elapsedTime,
  todayMinutes,
  activeSession,
  formatTime,
  formatMinutes,
  navigateToProfile,
}: {
  ownerId: string;
  isStudying: boolean;
  elapsedTime: number;
  todayMinutes: number;
  activeSession?: StudySession;
  formatTime: (seconds: number) => string;
  formatMinutes: (minutes: number) => string;
  navigateToProfile: (username: string) => void;
}) {
  const [ownerProfile, setOwnerProfile] = useState<{
    username: string;
    full_name: string;
    display_name: string | null;
    avatar_url: string | null;
  } | null>(null);

  useEffect(() => {
    const loadOwnerProfile = async () => {
      const { data } = await supabase
        .from("profiles")
        .select("username, full_name, display_name, avatar_url")
        .eq("user_id", ownerId)
        .single();
      if (data) setOwnerProfile(data);
    };
    loadOwnerProfile();
  }, [ownerId]);

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const displayName = ownerProfile?.display_name || ownerProfile?.full_name || "Beheerder";
  const currentSessionTime = activeSession 
    ? Math.floor((Date.now() - new Date(activeSession.started_at).getTime()) / 60000)
    : 0;
  const totalTodayMinutes = todayMinutes + currentSessionTime;

  return (
    <Card 
      className="cursor-pointer hover:shadow-md transition-shadow"
      onClick={() => ownerProfile?.username && navigateToProfile(ownerProfile.username)}
    >
      <CardContent className="p-4">
        <div className="flex items-center gap-4">
          <Avatar className="w-12 h-12">
            {ownerProfile?.avatar_url && (
              <AvatarImage src={ownerProfile.avatar_url} />
            )}
            <AvatarFallback className={`font-semibold ${isStudying ? 'bg-green-100 text-green-700' : 'bg-primary/10 text-primary'}`}>
              {getInitials(displayName)}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <p className={`font-medium ${isStudying ? 'text-green-600' : ''}`}>
                {displayName}
              </p>
              <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary">Beheerder</span>
              {isStudying && (
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              )}
            </div>
            {ownerProfile?.username && (
              <p className="text-sm text-muted-foreground">@{ownerProfile.username}</p>
            )}
            {isStudying && (
              <p className="text-sm text-green-600 mt-1">
                Aan het studeren • {formatMinutes(totalTodayMinutes)} vandaag
              </p>
            )}
            {!isStudying && totalTodayMinutes > 0 && (
              <p className="text-sm text-muted-foreground mt-1">
                {formatMinutes(totalTodayMinutes)} gestudeerd vandaag
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Studie() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [groups, setGroups] = useState<StudyGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Profile[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<Profile[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  // Group avatar upload for creation
  const groupAvatarInputRef = useRef<HTMLInputElement>(null);
  const [newGroupAvatarFile, setNewGroupAvatarFile] = useState<File | null>(null);
  const [newGroupAvatarPreview, setNewGroupAvatarPreview] = useState<string | null>(null);

  // Selected group for detail view
  const [selectedGroup, setSelectedGroup] = useState<StudyGroup | null>(null);
  const [activeTab, setActiveTab] = useState("posts");
  const { verifiedGroupIds } = useVerifiedGroups();

  // Group editing
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editGroupName, setEditGroupName] = useState("");
  const [isSavingGroup, setIsSavingGroup] = useState(false);
  const [isDeletingGroup, setIsDeletingGroup] = useState(false);
  const editAvatarInputRef = useRef<HTMLInputElement>(null);
  const editBannerInputRef = useRef<HTMLInputElement>(null);
  const [uploadingGroupAvatar, setUploadingGroupAvatar] = useState(false);
  const [uploadingGroupBanner, setUploadingGroupBanner] = useState(false);

  // Invite dialog
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [inviteSearchQuery, setInviteSearchQuery] = useState("");
  const [inviteSearchResults, setInviteSearchResults] = useState<Profile[]>([]);
  const [isInviting, setIsInviting] = useState(false);

  // Study timer state
  const [isStudying, setIsStudying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [studyStartTime, setStudyStartTime] = useState<Date | null>(null);
  const [pausedElapsedTime, setPausedElapsedTime] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [activeSessions, setActiveSessions] = useState<Map<string, StudySession>>(new Map());
  const [todayStudyTimes, setTodayStudyTimes] = useState<Map<string, number>>(new Map());
  const [myTodayStudyMinutes, setMyTodayStudyMinutes] = useState(0);

  useEffect(() => {
    if (user) {
      loadGroups();
      checkActiveSession();
      loadActiveSessions();
      loadMyTodayStudyTime();

      const channel = supabase
        .channel('study-sessions-realtime')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'study_sessions',
          },
          () => {
            loadActiveSessions();
            loadMyTodayStudyTime();
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [user]);

  const loadMyTodayStudyTime = async () => {
    if (!user) return;
    const today = new Date();
    const dayStart = startOfDay(today).toISOString();
    const dayEnd = endOfDay(today).toISOString();

    const { data: sessions } = await supabase
      .from("study_sessions")
      .select("duration_minutes, is_active, started_at")
      .eq("user_id", user.id)
      .gte("started_at", dayStart)
      .lte("started_at", dayEnd);

    let totalMinutes = 0;
    sessions?.forEach(session => {
      if (session.is_active) {
        const startTime = new Date(session.started_at).getTime();
        totalMinutes += Math.floor((Date.now() - startTime) / 60000);
      } else {
        totalMinutes += session.duration_minutes || 0;
      }
    });
    setMyTodayStudyMinutes(totalMinutes);
  };

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isStudying && studyStartTime) {
      interval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - studyStartTime.getTime()) / 1000);
        // Ensure elapsed time is never negative
        setElapsedTime(Math.max(0, elapsed));
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isStudying, studyStartTime]);

  useEffect(() => {
    if (groups.length > 0) {
      loadActiveSessions();
    }
  }, [groups]);

  const checkActiveSession = async () => {
    if (!user) return;

    const { data } = await supabase
      .from("study_sessions")
      .select("*")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .maybeSingle();

    if (data) {
      setIsStudying(true);
      setStudyStartTime(new Date(data.started_at));
      setCurrentSessionId(data.id);
      setElapsedTime(Math.floor((Date.now() - new Date(data.started_at).getTime()) / 1000));
    }
  };

  const loadActiveSessions = async () => {
    if (!user) return;

    const groupMemberIds = new Set<string>();
    groups.forEach(group => {
      group.members?.forEach(member => {
        if (member.status === 'accepted') {
          groupMemberIds.add(member.user_id);
        }
      });
    });

    if (groupMemberIds.size === 0) return;

    const memberIdsArray = Array.from(groupMemberIds);

    const { data: activeSess } = await supabase
      .from("study_sessions")
      .select("*")
      .in("user_id", memberIdsArray)
      .eq("is_active", true);

    const sessionsMap = new Map<string, StudySession>();
    activeSess?.forEach(session => {
      sessionsMap.set(session.user_id, session);
    });
    setActiveSessions(sessionsMap);

    const today = new Date();
    const dayStart = startOfDay(today).toISOString();
    const dayEnd = endOfDay(today).toISOString();

    const { data: todaySessions } = await supabase
      .from("study_sessions")
      .select("user_id, duration_minutes, started_at, is_active")
      .in("user_id", memberIdsArray)
      .gte("started_at", dayStart)
      .lte("started_at", dayEnd);

    const timesMap = new Map<string, number>();
    todaySessions?.forEach(session => {
      const current = timesMap.get(session.user_id) || 0;
      const duration = session.duration_minutes || 0;
      timesMap.set(session.user_id, current + duration);
    });
    setTodayStudyTimes(timesMap);
  };

  const startStudySession = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from("study_sessions")
        .insert({
          user_id: user.id,
          is_active: true,
        })
        .select()
        .single();

      if (error) throw error;

      setIsStudying(true);
      setStudyStartTime(new Date(data.started_at));
      setCurrentSessionId(data.id);
      setElapsedTime(0);
      toast.success("Studiesessie gestart");
    } catch (error) {
      console.error("Failed to start session:", error);
      toast.error("Kon studiesessie niet starten");
    }
  };

  const pauseStudySession = () => {
    if (!isStudying || isPaused) return;
    setPausedElapsedTime(elapsedTime);
    setIsPaused(true);
    toast.success("Studiesessie gepauzeerd");
  };

  const resumeStudySession = () => {
    if (!isPaused) return;
    // Set new start time accounting for already elapsed time
    const newStartTime = new Date(Date.now() - pausedElapsedTime * 1000);
    setStudyStartTime(newStartTime);
    setIsPaused(false);
    toast.success("Studiesessie hervat");
  };

  const stopStudySession = async () => {
    if (!user || !currentSessionId) return;

    try {
      const durationMinutes = Math.floor(elapsedTime / 60);

      await supabase
        .from("study_sessions")
        .update({
          is_active: false,
          ended_at: new Date().toISOString(),
          duration_minutes: durationMinutes,
        })
        .eq("id", currentSessionId);

      setIsStudying(false);
      setIsPaused(false);
      setStudyStartTime(null);
      setCurrentSessionId(null);
      setElapsedTime(0);
      setPausedElapsedTime(0);
      toast.success(`Studiesessie beëindigd (${formatTime(elapsedTime)})`);
    } catch (error) {
      console.error("Failed to stop session:", error);
      toast.error("Kon studiesessie niet stoppen");
    }
  };

  const formatTime = (seconds: number) => {
    // Ensure seconds is never negative
    const safeSeconds = Math.max(0, seconds);
    const hours = Math.floor(safeSeconds / 3600);
    const mins = Math.floor((safeSeconds % 3600) / 60);
    const secs = safeSeconds % 60;
    
    if (hours > 0) {
      return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatMinutes = (minutes: number) => {
    const safeMinutes = Math.max(0, minutes);
    const hours = Math.floor(safeMinutes / 60);
    const mins = safeMinutes % 60;
    if (hours > 0) {
      return `${hours}u ${mins}m`;
    }
    return `${mins}m`;
  };

  const loadGroups = async () => {
    if (!user) return;
    setLoading(true);

    try {
      const { data: ownedGroups, error: ownedError } = await supabase
        .from("study_groups")
        .select("*")
        .eq("owner_id", user.id);

      if (ownedError) {
        console.error("Error loading owned groups:", ownedError);
      }

      const { data: memberGroups, error: memberError } = await supabase
        .from("group_members")
        .select("group_id")
        .eq("user_id", user.id)
        .eq("status", "accepted");

      if (memberError) {
        console.error("Error loading member groups:", memberError);
      }

      const memberGroupIds = memberGroups?.map(m => m.group_id) || [];
      
      let joinedGroups: StudyGroup[] = [];
      if (memberGroupIds.length > 0) {
        const { data } = await supabase
          .from("study_groups")
          .select("*")
          .in("id", memberGroupIds);
        joinedGroups = data || [];
      }

      const allGroups = [...(ownedGroups || []), ...joinedGroups];
      const uniqueGroups = allGroups.filter((group, index, self) => 
        index === self.findIndex(g => g.id === group.id)
      );

      const groupsWithMembers: StudyGroup[] = [];
      for (const group of uniqueGroups) {
        const { data: members } = await supabase
          .from("group_members")
          .select("id, user_id, status")
          .eq("group_id", group.id);

        let enrichedMembers: GroupMember[] = [];
        if (members && members.length > 0) {
          const userIds = members.map(m => m.user_id);
          const { data: profiles } = await supabase
            .from("profiles")
            .select("user_id, username, full_name, display_name, avatar_url")
            .in("user_id", userIds);

          enrichedMembers = members.map(m => ({
            ...m,
            profile: profiles?.find(p => p.user_id === m.user_id)
          }));
        }
        
        groupsWithMembers.push({
          ...group,
          members: enrichedMembers
        });
      }

      setGroups(groupsWithMembers);
    } catch (error) {
      console.error("Failed to load groups:", error);
      toast.error("Kon groepen niet laden");
    } finally {
      setLoading(false);
    }
  };

  const searchUsers = async (query: string) => {
    if (query.length < 2) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, username, full_name, display_name")
        .or(`username.ilike.%${query}%,full_name.ilike.%${query}%`)
        .neq("user_id", user?.id)
        .limit(10);

      if (error) throw error;

      const filtered = (data || []).filter(
        profile => !selectedUsers.some(u => u.user_id === profile.user_id)
      );
      setSearchResults(filtered);
    } catch (error) {
      console.error("Search error:", error);
    } finally {
      setIsSearching(false);
    }
  };

  useEffect(() => {
    const debounce = setTimeout(() => {
      searchUsers(searchQuery);
    }, 300);
    return () => clearTimeout(debounce);
  }, [searchQuery]);

  // Invite search
  const searchUsersForInvite = async (query: string) => {
    if (query.length < 2 || !selectedGroup) {
      setInviteSearchResults([]);
      return;
    }

    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, username, full_name, display_name")
        .or(`username.ilike.%${query}%,full_name.ilike.%${query}%`)
        .neq("user_id", user?.id)
        .limit(10);

      if (error) throw error;

      // Filter out existing members
      const existingMemberIds = selectedGroup.members?.map(m => m.user_id) || [];
      const filtered = (data || []).filter(
        profile => !existingMemberIds.includes(profile.user_id) && profile.user_id !== selectedGroup.owner_id
      );
      setInviteSearchResults(filtered);
    } catch (error) {
      console.error("Search error:", error);
    }
  };

  useEffect(() => {
    const debounce = setTimeout(() => {
      searchUsersForInvite(inviteSearchQuery);
    }, 300);
    return () => clearTimeout(debounce);
  }, [inviteSearchQuery]);

  const inviteUserToGroup = async (profile: Profile) => {
    if (!user || !selectedGroup) return;

    setIsInviting(true);
    try {
      // Direct add - no verification needed, status is 'accepted'
      const { error: memberError } = await supabase
        .from("group_members")
        .insert({
          group_id: selectedGroup.id,
          user_id: profile.user_id,
          invited_by: user.id,
          status: "accepted",
          request_type: "invite",
        });

      if (memberError) throw memberError;

      // Notify the user that they've been added
      await supabase.from("notifications").insert({
        recipient_id: profile.user_id,
        sender_id: user.id,
        type: "group_added",
        message: `Je bent toegevoegd aan de studiegroep "${selectedGroup.name}"`,
      });

      toast.success(`${profile.display_name || profile.full_name} toegevoegd`);
      setInviteSearchQuery("");
      setInviteSearchResults([]);
      setInviteDialogOpen(false);
      loadGroups();
    } catch (error) {
      console.error("Invite error:", error);
      toast.error("Kon gebruiker niet toevoegen");
    } finally {
      setIsInviting(false);
    }
  };

  const addUser = (profile: Profile) => {
    setSelectedUsers(prev => [...prev, profile]);
    setSearchResults(prev => prev.filter(p => p.user_id !== profile.user_id));
    setSearchQuery("");
  };

  const removeUser = (userId: string) => {
    setSelectedUsers(prev => prev.filter(u => u.user_id !== userId));
  };

  const handleNewGroupAvatarSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error("Alleen afbeeldingen zijn toegestaan");
      return;
    }

    setNewGroupAvatarFile(file);
    setNewGroupAvatarPreview(URL.createObjectURL(file));
  };

  const createGroup = async () => {
    if (!user || !newGroupName.trim()) return;

    setIsCreating(true);
    try {
      let avatarUrl: string | null = null;

      // Upload avatar if selected - path must start with user.id to match RLS policy
      if (newGroupAvatarFile) {
        const fileExt = newGroupAvatarFile.name.split('.').pop();
        const filePath = `${user.id}/group-avatars/${Date.now()}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from('user-files')
          .upload(filePath, newGroupAvatarFile);

        if (!uploadError) {
          const { data: urlData } = supabase.storage
            .from('user-files')
            .getPublicUrl(filePath);
          avatarUrl = urlData.publicUrl;
        }
      }

      const { data: group, error: groupError } = await supabase
        .from("study_groups")
        .insert({
          name: newGroupName.trim(),
          owner_id: user.id,
          avatar_url: avatarUrl,
        })
        .select()
        .single();

      if (groupError) {
        console.error("Group creation error:", groupError);
        throw groupError;
      }

      if (!group) {
        throw new Error("No group data returned");
      }

      if (selectedUsers.length > 0) {
        // Direct add - no verification needed, status is 'accepted'
        const membersToInsert = selectedUsers.map(u => ({
          group_id: group.id,
          user_id: u.user_id,
          invited_by: user.id,
          status: "accepted",
          request_type: "invite",
        }));

        const { error: membersError } = await supabase
          .from("group_members")
          .insert(membersToInsert);

        if (membersError) {
          console.error("Members insertion error:", membersError);
        }

        // Notify users they've been added
        const notifications = selectedUsers.map(u => ({
          recipient_id: u.user_id,
          sender_id: user.id,
          type: "group_added",
          message: `Je bent toegevoegd aan de studiegroep "${newGroupName.trim()}"`,
        }));

        const { error: notifError } = await supabase.from("notifications").insert(notifications);
        if (notifError) {
          console.error("Notifications error:", notifError);
        }
      }

      toast.success("Groep aangemaakt!");
      setNewGroupName("");
      setSelectedUsers([]);
      setNewGroupAvatarFile(null);
      setNewGroupAvatarPreview(null);
      setCreateDialogOpen(false);
      loadGroups();
    } catch (error: any) {
      console.error("Failed to create group:", error);
      toast.error(`Kon groep niet aanmaken: ${error.message || 'Onbekende fout'}`);
    } finally {
      setIsCreating(false);
    }
  };

  const handleEditGroupAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedGroup) return;

    if (!file.type.startsWith('image/')) {
      toast.error("Alleen afbeeldingen zijn toegestaan");
      return;
    }

    setUploadingGroupAvatar(true);
    try {
      const fileExt = file.name.split('.').pop();
      // Path must start with user.id to match storage RLS policy
      const filePath = `${user!.id}/group-avatars/${selectedGroup.id}-${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('user-files')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('user-files')
        .getPublicUrl(filePath);

      const { error: updateError } = await supabase
        .from('study_groups')
        .update({ avatar_url: urlData.publicUrl })
        .eq('id', selectedGroup.id);

      if (updateError) throw updateError;

      toast.success("Groepsfoto bijgewerkt");
      loadGroups();
      setSelectedGroup(prev => prev ? { ...prev, avatar_url: urlData.publicUrl } : null);
    } catch (error) {
      console.error("Avatar upload error:", error);
      toast.error("Kon groepsfoto niet uploaden");
    } finally {
      setUploadingGroupAvatar(false);
    }
  };

  const handleEditGroupBannerUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedGroup) return;

    if (!file.type.startsWith('image/')) {
      toast.error("Alleen afbeeldingen zijn toegestaan");
      return;
    }

    setUploadingGroupBanner(true);
    try {
      const fileExt = file.name.split('.').pop();
      const filePath = `${user!.id}/group-banners/${selectedGroup.id}-${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('user-files')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('user-files')
        .getPublicUrl(filePath);

      const { error: updateError } = await supabase
        .from('study_groups')
        .update({ banner_url: urlData.publicUrl })
        .eq('id', selectedGroup.id);

      if (updateError) throw updateError;

      toast.success("Groepsbanner bijgewerkt");
      loadGroups();
      setSelectedGroup(prev => prev ? { ...prev, banner_url: urlData.publicUrl } : null);
    } catch (error) {
      console.error("Banner upload error:", error);
      toast.error("Kon groepsbanner niet uploaden");
    } finally {
      setUploadingGroupBanner(false);
    }
  };

  const saveGroupEdit = async () => {
    if (!selectedGroup || !editGroupName.trim()) return;

    setIsSavingGroup(true);
    try {
      const { error } = await supabase
        .from('study_groups')
        .update({ name: editGroupName.trim() })
        .eq('id', selectedGroup.id);

      if (error) throw error;

      toast.success("Groep bijgewerkt");
      setEditDialogOpen(false);
      loadGroups();
      setSelectedGroup(prev => prev ? { ...prev, name: editGroupName.trim() } : null);
    } catch (error) {
      toast.error("Kon groep niet bijwerken");
    } finally {
      setIsSavingGroup(false);
    }
  };

  const deleteGroup = async () => {
    if (!selectedGroup) return;

    setIsDeletingGroup(true);
    try {
      // Delete group members first
      await supabase.from('group_members').delete().eq('group_id', selectedGroup.id);
      // Delete group messages
      await supabase.from('group_messages').delete().eq('group_id', selectedGroup.id);
      // Delete group materials
      await supabase.from('group_materials').delete().eq('group_id', selectedGroup.id);
      // Delete the group
      const { error } = await supabase
        .from('study_groups')
        .delete()
        .eq('id', selectedGroup.id);

      if (error) throw error;

      toast.success("Groep verwijderd");
      setSelectedGroup(null);
      loadGroups();
    } catch (error) {
      console.error("Delete group error:", error);
      toast.error("Kon groep niet verwijderen");
    } finally {
      setIsDeletingGroup(false);
    }
  };

  const navigateToProfile = (username: string) => {
    navigate(`/profiel/${username}`);
  };

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  if (!user) return null;

  // Group detail view
  if (selectedGroup) {
    const acceptedMembers = selectedGroup.members?.filter(m => m.status === 'accepted') || [];
    const pendingMembers = selectedGroup.members?.filter(m => m.status === 'pending') || [];
    const isOwner = selectedGroup.owner_id === user.id;

    return (
      <div className="w-full">
        {/* Group Banner */}
        <div className="relative h-40 rounded-2xl overflow-hidden mb-16 bg-gradient-to-br from-primary/20 to-primary/5">
          {selectedGroup.banner_url && (
            <img
              src={selectedGroup.banner_url}
              alt="Group banner"
              className="w-full h-full object-cover"
            />
          )}
          {isOwner && (
            <>
              <button
                onClick={() => editBannerInputRef.current?.click()}
                disabled={uploadingGroupBanner}
                className="absolute bottom-3 right-3 px-3 py-1.5 rounded-full bg-background/80 backdrop-blur-sm text-foreground text-sm flex items-center gap-2 hover:bg-background/90 transition-colors"
              >
                {uploadingGroupBanner ? (
                  <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                ) : (
                  <Camera className="w-4 h-4" />
                )}
                <span>Banner wijzigen</span>
              </button>
              <input
                ref={editBannerInputRef}
                type="file"
                accept="image/*"
                onChange={handleEditGroupBannerUpload}
                className="hidden"
              />
            </>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSelectedGroup(null)}
            className="absolute top-3 left-3 rounded-full bg-background/80 backdrop-blur-sm hover:bg-background/90"
          >
            <ChevronLeft className="w-5 h-5" />
          </Button>
        </div>

        {/* Avatar positioned in front of banner - relative to parent, not absolute */}
        <div className="relative -mt-12 ml-8 mb-4" style={{ zIndex: 10 }}>
          <div className="relative inline-block">
            <Avatar className="w-20 h-20 border-4 border-background shadow-xl ring-4 ring-background">
              {selectedGroup.avatar_url ? (
                <AvatarImage src={selectedGroup.avatar_url} />
              ) : null}
              <AvatarFallback className="bg-primary/10 text-primary">
                <Users className="w-8 h-8" />
              </AvatarFallback>
            </Avatar>
            {isOwner && (
              <>
                <button
                  onClick={() => editAvatarInputRef.current?.click()}
                  disabled={uploadingGroupAvatar}
                  className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/90 transition-colors"
                >
                  {uploadingGroupAvatar ? (
                    <div className="w-3.5 h-3.5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                  ) : (
                    <Camera className="w-3.5 h-3.5" />
                  )}
                </button>
                <input
                  ref={editAvatarInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleEditGroupAvatarUpload}
                  className="hidden"
                />
              </>
            )}
          </div>
        </div>

        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-foreground">{selectedGroup.name}</h1>
            <p className="text-muted-foreground">
              {acceptedMembers.length + 1} leden
            </p>
          </div>

          {isOwner && (
            <div className="flex items-center gap-2">
              <Dialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" className="rounded-full gap-2">
                    <UserPlus className="w-4 h-4" />
                    Nodig leden uit
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle>Leden uitnodigen</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 pt-4">
                    <Input
                      value={inviteSearchQuery}
                      onChange={(e) => setInviteSearchQuery(e.target.value)}
                      placeholder="Zoek op gebruikersnaam of naam..."
                    />
                    
                    {inviteSearchResults.length > 0 && (
                      <ScrollArea className="max-h-48 border rounded-lg">
                        <div className="p-2 space-y-1">
                          {inviteSearchResults.map((profile) => (
                            <button
                              key={profile.user_id}
                              onClick={() => inviteUserToGroup(profile)}
                              disabled={isInviting}
                              className="w-full flex items-center gap-2 p-2 rounded-lg hover:bg-muted text-left"
                            >
                              <UserPlus className="w-4 h-4 text-muted-foreground" />
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium truncate">
                                  {profile.display_name || profile.full_name}
                                </p>
                                <p className="text-xs text-muted-foreground">@{profile.username}</p>
                              </div>
                            </button>
                          ))}
                        </div>
                      </ScrollArea>
                    )}
                  </div>
                </DialogContent>
              </Dialog>

              <Dialog open={editDialogOpen} onOpenChange={(open) => {
                setEditDialogOpen(open);
                if (open) setEditGroupName(selectedGroup.name);
              }}>
                <DialogTrigger asChild>
                  <Button variant="ghost" size="icon" className="rounded-full">
                    <Settings className="w-5 h-5" />
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle>Groep bewerken</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 pt-4">
                    <div className="space-y-2">
                      <Label>Groepsnaam</Label>
                      <Input
                        value={editGroupName}
                        onChange={(e) => setEditGroupName(e.target.value)}
                        placeholder="Groepsnaam"
                      />
                    </div>

                    <div className="flex gap-2">
                      <Button
                        onClick={saveGroupEdit}
                        disabled={!editGroupName.trim() || isSavingGroup}
                        className="flex-1"
                      >
                        {isSavingGroup ? "Opslaan..." : "Opslaan"}
                      </Button>
                    </div>

                    <div className="pt-4 border-t">
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="destructive" className="w-full gap-2">
                            <Trash2 className="w-4 h-4" />
                            Groep verwijderen
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Groep verwijderen?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Dit verwijdert de groep permanent, inclusief alle berichten en lesmateriaal. Deze actie kan niet ongedaan worden gemaakt.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Annuleren</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={deleteGroup}
                              disabled={isDeletingGroup}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              {isDeletingGroup ? "Verwijderen..." : "Verwijderen"}
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          )}
        </div>

        {/* Study Timer Card */}
        <Card className="mb-8">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className={`w-16 h-16 rounded-full flex items-center justify-center ${isStudying ? 'bg-primary/10' : 'bg-muted'}`}>
                  <Clock className={`w-8 h-8 ${isStudying ? 'text-primary' : 'text-muted-foreground'}`} />
                </div>
                <div>
                  <h2 className="text-2xl font-bold">Studietimer</h2>
                  <p className="text-muted-foreground">
                    {isStudying 
                      ? isPaused 
                        ? 'Gepauzeerd' 
                        : 'Je bent aan het studeren' 
                      : 'Start een studiesessie'}
                  </p>
                </div>
              </div>
              
              <div className="flex items-center gap-6">
                <div className="text-right">
                  <p className={`text-4xl font-mono font-bold tabular-nums ${isPaused ? 'text-muted-foreground' : ''}`}>
                    {formatTime(elapsedTime)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {isStudying 
                      ? isPaused 
                        ? 'Gepauzeerd' 
                        : 'Huidige sessie' 
                      : 'Verstreken tijd'}
                  </p>
                </div>
                
                {isStudying ? (
                  <div className="flex items-center gap-2">
                    {/* Pause/Resume button */}
                    <Button
                      size="lg"
                      variant="outline"
                      onClick={isPaused ? resumeStudySession : pauseStudySession}
                      className="rounded-full w-14 h-14 p-0"
                    >
                      {isPaused ? (
                        <Play className="w-6 h-6 ml-1" />
                      ) : (
                        <Pause className="w-6 h-6" />
                      )}
                    </Button>
                    {/* Finish button */}
                    <Button
                      size="lg"
                      onClick={stopStudySession}
                      className="rounded-full w-14 h-14 p-0 bg-destructive hover:bg-destructive/90"
                    >
                      <X className="w-6 h-6" />
                    </Button>
                  </div>
                ) : (
                  <Button
                    size="lg"
                    onClick={startStudySession}
                    className="rounded-full w-14 h-14 p-0"
                  >
                    <Play className="w-6 h-6 ml-1" />
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Tabs for Posts, Members, Materials - reordered, no study timer */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="posts" className="gap-2">
              <Newspaper className="w-4 h-4" />
              Posts
            </TabsTrigger>
            <TabsTrigger value="members" className="gap-2">
              <Users className="w-4 h-4" />
              Leden
            </TabsTrigger>
            <TabsTrigger value="materials" className="gap-2">
              <FolderOpen className="w-4 h-4" />
              Materiaal
            </TabsTrigger>
          </TabsList>

          <TabsContent value="posts">
            <GroupPosts groupId={selectedGroup.id} />
          </TabsContent>

          <TabsContent value="members" className="space-y-4">
            {/* Owner - fetch profile */}
            <OwnerMemberCard 
              ownerId={selectedGroup.owner_id}
              isStudying={selectedGroup.owner_id === user.id ? isStudying : activeSessions.has(selectedGroup.owner_id)}
              elapsedTime={selectedGroup.owner_id === user.id ? elapsedTime : 0}
              todayMinutes={selectedGroup.owner_id === user.id ? myTodayStudyMinutes : (todayStudyTimes.get(selectedGroup.owner_id) || 0)}
              activeSession={activeSessions.get(selectedGroup.owner_id)}
              formatTime={formatTime}
              formatMinutes={formatMinutes}
              navigateToProfile={navigateToProfile}
            />

            {/* Accepted Members (excluding owner) */}
            {acceptedMembers.filter(m => m.user_id !== selectedGroup.owner_id).map((member) => {
              const memberIsStudying = activeSessions.has(member.user_id);
              const activeSession = activeSessions.get(member.user_id);
              const todayTime = todayStudyTimes.get(member.user_id) || 0;
              const currentSessionTime = activeSession 
                ? Math.floor((Date.now() - new Date(activeSession.started_at).getTime()) / 60000)
                : 0;
              const totalTodayMinutes = todayTime + currentSessionTime;
              const displayName = member.profile?.display_name || member.profile?.full_name || "Onbekend";

              return (
                <Card 
                  key={member.id} 
                  className="cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => member.profile?.username && navigateToProfile(member.profile.username)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center gap-4">
                      <Avatar className="w-12 h-12">
                        {member.profile?.avatar_url && (
                          <AvatarImage src={member.profile.avatar_url} />
                        )}
                        <AvatarFallback className={`font-semibold ${memberIsStudying ? 'bg-green-100 text-green-700' : 'bg-muted'}`}>
                          {getInitials(displayName)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className={`font-medium ${memberIsStudying ? 'text-green-600' : ''}`}>
                            {displayName}
                          </p>
                          {memberIsStudying && (
                            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">@{member.profile?.username}</p>
                        {memberIsStudying && (
                          <p className="text-sm text-green-600 mt-1">
                            Aan het studeren • {formatMinutes(totalTodayMinutes)} vandaag
                          </p>
                        )}
                        {!memberIsStudying && totalTodayMinutes > 0 && (
                          <p className="text-sm text-muted-foreground mt-1">
                            {formatMinutes(totalTodayMinutes)} gestudeerd vandaag
                          </p>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}

            {/* Pending Members */}
            {pendingMembers.length > 0 && (
              <>
                <h3 className="text-lg font-medium text-muted-foreground mt-6">Uitgenodigd</h3>
                {pendingMembers.map((member) => {
                  const displayName = member.profile?.display_name || member.profile?.full_name || "Onbekend";
                  return (
                    <Card key={member.id} className="opacity-60">
                      <CardContent className="p-4">
                        <div className="flex items-center gap-4">
                          <Avatar className="w-12 h-12">
                            {member.profile?.avatar_url && (
                              <AvatarImage src={member.profile.avatar_url} />
                            )}
                            <AvatarFallback className="bg-yellow-100 text-yellow-700 font-semibold">
                              {getInitials(displayName)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1">
                            <p className="font-medium">{displayName}</p>
                            <p className="text-sm text-yellow-600">Wacht op reactie</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </>
            )}
          </TabsContent>

          <TabsContent value="materials">
            <Card>
              <CardContent className="p-6">
                <GroupMaterials groupId={selectedGroup.id} />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-4xl font-bold text-foreground">Studie</h1>
        
        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button className="rounded-full gap-2">
              <Plus className="w-4 h-4" />
              Nieuwe groep
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Nieuwe studiegroep</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              {/* Group avatar selection */}
              <div className="flex justify-center">
                <div className="relative">
                  <Avatar className="w-20 h-20">
                    {newGroupAvatarPreview ? (
                      <AvatarImage src={newGroupAvatarPreview} />
                    ) : null}
                    <AvatarFallback className="bg-primary/10 text-primary">
                      <Users className="w-8 h-8" />
                    </AvatarFallback>
                  </Avatar>
                  <button
                    onClick={() => groupAvatarInputRef.current?.click()}
                    className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/90 transition-colors"
                  >
                    <Camera className="w-4 h-4" />
                  </button>
                  <input
                    ref={groupAvatarInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleNewGroupAvatarSelect}
                    className="hidden"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Groepsnaam</Label>
                <Input
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  placeholder="Bijv. Wiskunde studiegroep"
                />
              </div>

              <div className="space-y-2">
                <Label>Leden uitnodigen</Label>
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Zoek op gebruikersnaam of naam..."
                />
                
                {searchResults.length > 0 && (
                  <ScrollArea className="max-h-32 border rounded-lg">
                    <div className="p-2 space-y-1">
                      {searchResults.map((profile) => (
                        <button
                          key={profile.user_id}
                          onClick={() => addUser(profile)}
                          className="w-full flex items-center gap-2 p-2 rounded-lg hover:bg-muted text-left"
                        >
                          <UserPlus className="w-4 h-4 text-muted-foreground" />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium truncate">
                              {profile.display_name || profile.full_name}
                            </p>
                            <p className="text-xs text-muted-foreground">@{profile.username}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  </ScrollArea>
                )}

                {selectedUsers.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-2">
                    {selectedUsers.map((profile) => (
                      <div
                        key={profile.user_id}
                        className="flex items-center gap-1 px-2 py-1 rounded-full bg-primary/10 text-primary text-sm"
                      >
                        <span>{profile.display_name || profile.full_name}</span>
                        <button
                          onClick={() => removeUser(profile.user_id)}
                          className="p-0.5 rounded-full hover:bg-primary/20"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex gap-2 pt-4">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    setCreateDialogOpen(false);
                    setNewGroupName("");
                    setSelectedUsers([]);
                    setNewGroupAvatarFile(null);
                    setNewGroupAvatarPreview(null);
                  }}
                >
                  Annuleren
                </Button>
                <Button
                  className="flex-1"
                  onClick={createGroup}
                  disabled={!newGroupName.trim() || isCreating}
                >
                  {isCreating ? "Aanmaken..." : "Aanmaken"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Study Timer Card */}
      <Card className="mb-8">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className={`w-16 h-16 rounded-full flex items-center justify-center ${isStudying ? 'bg-primary/10' : 'bg-muted'}`}>
                <Clock className={`w-8 h-8 ${isStudying ? 'text-primary' : 'text-muted-foreground'}`} />
              </div>
              <div>
                <h2 className="text-2xl font-bold">Studietimer</h2>
                <p className="text-muted-foreground">
                  {isStudying ? 'Je bent aan het studeren' : 'Start een studiesessie'}
                </p>
                <p className="text-sm text-primary font-medium mt-1">
                  Vandaag: {formatMinutes(myTodayStudyMinutes + (isStudying ? Math.floor(elapsedTime / 60) : 0))} gestudeerd
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-6">
              <div className="text-right">
                <p className="text-4xl font-mono font-bold tabular-nums">
                  {formatTime(elapsedTime)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {isStudying ? 'Huidige sessie' : 'Verstreken tijd'}
                </p>
              </div>
              
              <Button
                size="lg"
                onClick={isStudying ? stopStudySession : startStudySession}
                className={`rounded-full w-14 h-14 p-0 ${isStudying ? 'bg-destructive hover:bg-destructive/90' : ''}`}
              >
                {isStudying ? (
                  <Pause className="w-6 h-6" />
                ) : (
                  <Play className="w-6 h-6 ml-1" />
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      ) : groups.length === 0 ? (
        <div className="text-center py-12">
          <Users className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
          <p className="text-muted-foreground mb-4">Nog geen studiegroepen</p>
          <Button onClick={() => setCreateDialogOpen(true)} className="rounded-full gap-2">
            <Plus className="w-4 h-4" />
            Maak je eerste groep
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {groups.map((group) => (
            <Card 
              key={group.id} 
              className="hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => setSelectedGroup(group)}
            >
              <CardContent className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <Avatar className="w-10 h-10">
                      {group.avatar_url ? (
                        <AvatarImage src={group.avatar_url} />
                      ) : null}
                      <AvatarFallback className="bg-primary/10 text-primary">
                        <Users className="w-5 h-5" />
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <h3 className="font-semibold text-foreground">{group.name}</h3>
                      <p className="text-sm text-muted-foreground">
                        {(group.members?.filter(m => m.status === "accepted").length || 0) + 1} leden
                      </p>
                    </div>
                  </div>
                  {group.owner_id === user.id && (
                    <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded-full">
                      Beheerder
                    </span>
                  )}
                </div>

                {group.members && group.members.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground font-medium">Leden</p>
                    <div className="flex flex-wrap gap-1">
                      {group.members.slice(0, 5).map((member) => {
                        const memberIsStudying = activeSessions.has(member.user_id);
                        return (
                          <span
                            key={member.id}
                            className={`text-xs px-2 py-1 rounded-full flex items-center gap-1 ${
                              member.status === "pending"
                                ? "bg-yellow-100 text-yellow-800"
                                : memberIsStudying
                                ? "bg-green-100 text-green-800"
                                : "bg-muted text-muted-foreground"
                            }`}
                          >
                            {memberIsStudying && (
                              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                            )}
                            {member.profile?.display_name || member.profile?.full_name || "Onbekend"}
                            {member.status === "pending" && " (wachtend)"}
                          </span>
                        );
                      })}
                      {group.members.length > 5 && (
                        <span className="text-xs px-2 py-1 rounded-full bg-muted text-muted-foreground">
                          +{group.members.length - 5} meer
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
