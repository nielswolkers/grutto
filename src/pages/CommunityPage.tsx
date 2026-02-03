import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useVerifiedGroups } from "@/hooks/useVerifiedStatus";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import { VerifiedBadge } from "@/components/VerifiedBadge";
import { GroupPosts } from "@/components/studie/GroupPosts";
import { GroupMaterials } from "@/components/studie/GroupMaterials";
import { GroupUpdates } from "@/components/studie/GroupUpdates";
import { 
  Users, 
  ChevronLeft, 
  Newspaper, 
  FolderOpen, 
  Lock, 
  Settings, 
  UserPlus, 
  Trash2, 
  Camera, 
  Globe,
  Bell
} from "lucide-react";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger 
} from "@/components/ui/dialog";
import { 
  AlertDialog, 
  AlertDialogAction, 
  AlertDialogCancel, 
  AlertDialogContent, 
  AlertDialogDescription, 
  AlertDialogFooter, 
  AlertDialogHeader, 
  AlertDialogTitle, 
  AlertDialogTrigger 
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { fireConfetti } from "@/components/ConfettiOverlay";

interface StudyGroup {
  id: string;
  name: string;
  avatar_url: string | null;
  owner_id: string;
  is_public: boolean;
  bio: string | null;
  banner_url: string | null;
  created_at: string;
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
}

interface Profile {
  user_id: string;
  username: string;
  full_name: string;
  display_name: string | null;
}

export default function CommunityPage() {
  const { communityId } = useParams<{ communityId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { verifiedGroupIds } = useVerifiedGroups();
  
  const [group, setGroup] = useState<StudyGroup | null>(null);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [isMember, setIsMember] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  
  // Tabs: private groups get Updates tab
  const [activeTab, setActiveTab] = useState("posts");
  
  // Admin functionality
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [editGroupName, setEditGroupName] = useState("");
  const [editGroupBio, setEditGroupBio] = useState("");
  const [editGroupIsPublic, setEditGroupIsPublic] = useState(true);
  const [isSavingGroup, setIsSavingGroup] = useState(false);
  const [isDeletingGroup, setIsDeletingGroup] = useState(false);
  const [uploadingGroupAvatar, setUploadingGroupAvatar] = useState(false);
  const [uploadingGroupBanner, setUploadingGroupBanner] = useState(false);
  const editAvatarInputRef = useRef<HTMLInputElement>(null);
  const editBannerInputRef = useRef<HTMLInputElement>(null);
  
  // Invite
  const [inviteSearchQuery, setInviteSearchQuery] = useState("");
  const [inviteSearchResults, setInviteSearchResults] = useState<Profile[]>([]);
  const [isInviting, setIsInviting] = useState(false);

  useEffect(() => {
    if (communityId) {
      loadCommunity();
    }
  }, [communityId, user]);

  // Check first visit and show confetti
  useEffect(() => {
    const checkFirstVisit = async () => {
      if (!user || !group || !isMember) return;

      const { data: existingVisit } = await supabase
        .from("group_first_visits")
        .select("id")
        .eq("user_id", user.id)
        .eq("group_id", group.id)
        .maybeSingle();

      if (!existingVisit) {
        await supabase.from("group_first_visits").insert({
          user_id: user.id,
          group_id: group.id,
        });

        if (group.owner_id !== user.id) {
          fireConfetti();
        }
      }
    };

    checkFirstVisit();
  }, [group, user, isMember]);

  const loadCommunity = async () => {
    if (!communityId) return;

    try {
      // Load group
      const { data: groupData, error } = await supabase
        .from("study_groups")
        .select("*")
        .eq("id", communityId)
        .single();

      if (error || !groupData) {
        navigate("/communities");
        return;
      }

      setGroup(groupData);
      setEditGroupName(groupData.name);
      setEditGroupBio(groupData.bio || "");
      setEditGroupIsPublic(groupData.is_public ?? true);

      // Check membership
      if (user) {
        const ownerStatus = groupData.owner_id === user.id;
        setIsOwner(ownerStatus);
        
        if (ownerStatus) {
          setIsMember(true);
          setIsAdmin(true);
        } else {
          const { data: memberData } = await supabase
            .from("group_members")
            .select("status")
            .eq("group_id", communityId)
            .eq("user_id", user.id)
            .maybeSingle();

          const memberStatus = memberData?.status === "accepted";
          setIsMember(memberStatus);

          if (!memberStatus) {
            // Not a member, redirect to public profile
            navigate(`/groep/${communityId}`);
            return;
          }

          // Check admin status
          const { data: adminData } = await supabase
            .from("group_admins")
            .select("id")
            .eq("group_id", communityId)
            .eq("user_id", user.id)
            .maybeSingle();

          setIsAdmin(!!adminData);
        }
      }

      // Load members
      const { data: membersData } = await supabase
        .from("group_members")
        .select("id, user_id, status")
        .eq("group_id", communityId);

      if (membersData && membersData.length > 0) {
        const userIds = membersData.map(m => m.user_id);
        const { data: profiles } = await supabase
          .from("profiles")
          .select("user_id, username, full_name, display_name, avatar_url")
          .in("user_id", userIds);

        const enrichedMembers = membersData.map(m => ({
          ...m,
          profile: profiles?.find(p => p.user_id === m.user_id)
        }));

        setMembers(enrichedMembers);
      }
    } catch (error) {
      console.error("Failed to load community:", error);
      navigate("/communities");
    } finally {
      setLoading(false);
    }
  };

  const searchUsersForInvite = async (query: string) => {
    if (query.length < 2) {
      setInviteSearchResults([]);
      return;
    }

    try {
      const { data } = await supabase
        .from("profiles")
        .select("user_id, username, full_name, display_name")
        .or(`username.ilike.%${query}%,full_name.ilike.%${query}%`)
        .neq("user_id", user?.id)
        .limit(10);

      const existingMemberIds = members.map(m => m.user_id);
      const filtered = (data || []).filter(
        profile => !existingMemberIds.includes(profile.user_id) && profile.user_id !== group?.owner_id
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
    if (!user || !group) return;

    setIsInviting(true);
    try {
      await supabase.from("group_members").insert({
        group_id: group.id,
        user_id: profile.user_id,
        invited_by: user.id,
        status: "accepted",
        request_type: "invite",
      });

      await supabase.from("notifications").insert({
        recipient_id: profile.user_id,
        sender_id: user.id,
        type: "group_added",
        message: `Je bent toegevoegd aan de community "${group.name}"`,
      });

      toast.success(`${profile.display_name || profile.full_name} toegevoegd`);
      setInviteSearchQuery("");
      setInviteSearchResults([]);
      setInviteDialogOpen(false);
      loadCommunity();
    } catch (error) {
      toast.error("Kon gebruiker niet toevoegen");
    } finally {
      setIsInviting(false);
    }
  };

  const handleEditGroupAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user || !group) return;

    setUploadingGroupAvatar(true);
    try {
      const fileExt = file.name.split('.').pop();
      const filePath = `${user.id}/group-avatars/${group.id}-${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('user-files')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('user-files')
        .getPublicUrl(filePath);

      await supabase
        .from('study_groups')
        .update({ avatar_url: urlData.publicUrl })
        .eq('id', group.id);

      toast.success("Groepsfoto bijgewerkt");
      loadCommunity();
    } catch (error) {
      toast.error("Kon groepsfoto niet uploaden");
    } finally {
      setUploadingGroupAvatar(false);
    }
  };

  const handleEditGroupBannerUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user || !group) return;

    setUploadingGroupBanner(true);
    try {
      const fileExt = file.name.split('.').pop();
      const filePath = `${user.id}/group-banners/${group.id}-${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('user-files')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('user-files')
        .getPublicUrl(filePath);

      await supabase
        .from('study_groups')
        .update({ banner_url: urlData.publicUrl })
        .eq('id', group.id);

      toast.success("Groepsbanner bijgewerkt");
      loadCommunity();
    } catch (error) {
      toast.error("Kon groepsbanner niet uploaden");
    } finally {
      setUploadingGroupBanner(false);
    }
  };

  const saveGroupEdit = async () => {
    if (!editGroupName.trim() || !group) return;

    setIsSavingGroup(true);
    try {
      await supabase
        .from('study_groups')
        .update({ 
          name: editGroupName.trim(),
          bio: editGroupBio.trim() || null,
          is_public: editGroupIsPublic,
        })
        .eq('id', group.id);

      toast.success("Groep bijgewerkt");
      setEditDialogOpen(false);
      loadCommunity();
    } catch (error) {
      toast.error("Kon groep niet bijwerken");
    } finally {
      setIsSavingGroup(false);
    }
  };

  const deleteGroup = async () => {
    if (!group) return;
    setIsDeletingGroup(true);
    try {
      await supabase
        .from('study_groups')
        .delete()
        .eq('id', group.id);

      toast.success("Groep verwijderd");
      navigate("/communities");
    } catch (error) {
      toast.error("Kon groep niet verwijderen");
    } finally {
      setIsDeletingGroup(false);
    }
  };

  const leaveGroup = async () => {
    if (!user || !group) return;
    
    try {
      await supabase
        .from('group_members')
        .delete()
        .eq('group_id', group.id)
        .eq('user_id', user.id);
      
      toast.success("Je hebt de community verlaten");
      navigate("/communities");
    } catch (error) {
      toast.error("Kon community niet verlaten");
    }
  };

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const isGroupVerified = (groupId: string) => verifiedGroupIds.includes(groupId);
  const acceptedMembers = members.filter(m => m.status === "accepted");
  const isPrivateGroup = group && !group.is_public;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!group) {
    return (
      <div className="w-full text-center py-12">
        <Users className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
        <h2 className="text-xl font-semibold mb-2">Community niet gevonden</h2>
        <Button variant="outline" onClick={() => navigate("/communities")} className="rounded-full">
          Terug
        </Button>
      </div>
    );
  }

  return (
    <div className="w-full">
      {/* Group Banner */}
      <div className="relative h-48 rounded-2xl overflow-hidden bg-gradient-to-br from-primary/20 to-primary/5">
        {group.banner_url && (
          <img
            src={group.banner_url}
            alt="Group banner"
            className="w-full h-full object-cover"
          />
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate("/communities")}
          className="absolute top-3 left-3 rounded-full bg-background/80 backdrop-blur-sm hover:bg-background/90"
        >
          <ChevronLeft className="w-5 h-5" />
        </Button>
      </div>

      {/* Avatar positioned exactly halfway on banner */}
      <div className="relative flex justify-start px-8" style={{ marginTop: '-3.9375rem', zIndex: 10 }}>
        <Avatar className="border-4 border-background shadow-xl ring-4 ring-background bg-background" style={{ width: '7.875rem', height: '7.875rem' }}>
          {group.avatar_url ? (
            <AvatarImage src={group.avatar_url} className="object-cover" />
          ) : null}
          <AvatarFallback className="bg-background text-primary text-3xl">
            <Users className="w-10 h-10" />
          </AvatarFallback>
        </Avatar>
      </div>

      {/* Group Title and Actions */}
      <div className="flex items-start justify-between mb-4 mt-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-bold text-foreground">{group.name}</h1>
            {group.is_public && isGroupVerified(group.id) && <VerifiedBadge />}
            {!group.is_public && <Lock className="w-5 h-5 text-muted-foreground" />}
          </div>
          <p className="text-muted-foreground">
            {acceptedMembers.length + 1} leden
          </p>
          {group.bio && (
            <p className="text-foreground mt-2 text-sm">{group.bio}</p>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Leave group button for non-owners */}
          {!isOwner && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" className="rounded-full">
                  Verlaat groep
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Groep verlaten?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Weet je zeker dat je deze community wilt verlaten?
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Annuleren</AlertDialogCancel>
                  <AlertDialogAction onClick={leaveGroup}>
                    Verlaten
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}

          {/* Invite button for admins */}
          {isAdmin && (
            <Dialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="icon" className="rounded-full">
                  <UserPlus className="w-4 h-4" />
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Lid toevoegen</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <Input
                    placeholder="Zoek op naam of gebruikersnaam..."
                    value={inviteSearchQuery}
                    onChange={(e) => setInviteSearchQuery(e.target.value)}
                  />
                  <ScrollArea className="h-48">
                    <div className="space-y-2">
                      {inviteSearchResults.map((profile) => (
                        <div
                          key={profile.user_id}
                          className="flex items-center justify-between p-2 rounded-lg hover:bg-muted"
                        >
                          <span className="text-sm font-medium">
                            {profile.display_name || profile.full_name}
                          </span>
                          <Button
                            size="sm"
                            onClick={() => inviteUserToGroup(profile)}
                            disabled={isInviting}
                            className="rounded-full"
                          >
                            Toevoegen
                          </Button>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              </DialogContent>
            </Dialog>
          )}

          {/* Settings for owner */}
          {isOwner && (
            <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="icon" className="rounded-full">
                  <Settings className="w-4 h-4" />
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>Groepsinstellingen</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label>Groepsfoto</Label>
                    <div className="flex items-center gap-4 mt-2">
                      <Avatar className="w-16 h-16 bg-background">
                        {group.avatar_url && <AvatarImage src={group.avatar_url} className="object-cover" />}
                        <AvatarFallback><Users className="w-8 h-8" /></AvatarFallback>
                      </Avatar>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => editAvatarInputRef.current?.click()}
                        disabled={uploadingGroupAvatar}
                        className="rounded-full"
                      >
                        <Camera className="w-4 h-4 mr-2" />
                        {uploadingGroupAvatar ? "Uploaden..." : "Wijzigen"}
                      </Button>
                      <input
                        ref={editAvatarInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleEditGroupAvatarUpload}
                      />
                    </div>
                  </div>

                  <div>
                    <Label>Banner</Label>
                    <div className="flex items-center gap-4 mt-2">
                      <div className="w-32 h-16 rounded-lg bg-muted overflow-hidden">
                        {group.banner_url && (
                          <img src={group.banner_url} alt="Banner" className="w-full h-full object-cover" />
                        )}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => editBannerInputRef.current?.click()}
                        disabled={uploadingGroupBanner}
                        className="rounded-full"
                      >
                        <Camera className="w-4 h-4 mr-2" />
                        {uploadingGroupBanner ? "Uploaden..." : "Wijzigen"}
                      </Button>
                      <input
                        ref={editBannerInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleEditGroupBannerUpload}
                      />
                    </div>
                  </div>

                  <div>
                    <Label>Naam</Label>
                    <Input
                      value={editGroupName}
                      onChange={(e) => setEditGroupName(e.target.value)}
                      className="mt-1"
                    />
                  </div>

                  <div>
                    <Label>Bio</Label>
                    <Textarea
                      value={editGroupBio}
                      onChange={(e) => setEditGroupBio(e.target.value)}
                      className="mt-1"
                      rows={3}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {editGroupIsPublic ? <Globe className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                      <Label>Openbare community</Label>
                    </div>
                    <Switch
                      checked={editGroupIsPublic}
                      onCheckedChange={setEditGroupIsPublic}
                    />
                  </div>

                  <div className="flex gap-2">
                    <Button
                      onClick={saveGroupEdit}
                      disabled={isSavingGroup}
                      className="flex-1 rounded-full"
                    >
                      {isSavingGroup ? "Opslaan..." : "Opslaan"}
                    </Button>
                  </div>

                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="destructive" className="w-full rounded-full">
                        <Trash2 className="w-4 h-4 mr-2" />
                        Groep verwijderen
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Groep verwijderen?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Dit kan niet ongedaan worden gemaakt. Alle berichten en materialen worden verwijderd.
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
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      {/* Tabs - Private groups get Updates tab */}
      <div className="flex gap-2 mb-6 border-b">
        <button
          onClick={() => setActiveTab("posts")}
          className={`flex items-center gap-2 px-4 py-2 border-b-2 transition-colors ${
            activeTab === "posts"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Newspaper className="w-4 h-4" />
          Posts
        </button>
        
        {isPrivateGroup && (
          <button
            onClick={() => setActiveTab("updates")}
            className={`flex items-center gap-2 px-4 py-2 border-b-2 transition-colors ${
              activeTab === "updates"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <Bell className="w-4 h-4" />
            Updates
          </button>
        )}

        <button
          onClick={() => setActiveTab("leden")}
          className={`flex items-center gap-2 px-4 py-2 border-b-2 transition-colors ${
            activeTab === "leden"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Users className="w-4 h-4" />
          Leden
        </button>

        <button
          onClick={() => setActiveTab("materials")}
          className={`flex items-center gap-2 px-4 py-2 border-b-2 transition-colors ${
            activeTab === "materials"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <FolderOpen className="w-4 h-4" />
          Materialen
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === "posts" && user && (
        <GroupPosts groupId={group.id} isPublicGroup={group.is_public} />
      )}

      {activeTab === "updates" && isPrivateGroup && user && (
        <GroupUpdates groupId={group.id} userId={user.id} members={members} ownerId={group.owner_id} />
      )}

      {activeTab === "leden" && (
        <MembersList 
          members={members} 
          ownerId={group.owner_id} 
          navigate={navigate}
          isAdmin={isAdmin}
          isPublic={group.is_public}
        />
      )}

      {activeTab === "materials" && user && (
        <GroupMaterials groupId={group.id} />
      )}
    </div>
  );
}

// Members list component
function MembersList({ 
  members, 
  ownerId, 
  navigate,
  isAdmin,
  isPublic
}: { 
  members: GroupMember[]; 
  ownerId: string; 
  navigate: (path: string) => void;
  isAdmin: boolean;
  isPublic: boolean;
}) {
  const [ownerProfile, setOwnerProfile] = useState<any>(null);
  
  useEffect(() => {
    const loadOwner = async () => {
      const { data } = await supabase
        .from("profiles")
        .select("user_id, username, full_name, display_name, avatar_url")
        .eq("user_id", ownerId)
        .single();
      if (data) setOwnerProfile(data);
    };
    loadOwner();
  }, [ownerId]);

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const acceptedMembers = members.filter(m => m.status === "accepted");

  // In public communities, only admins can see member list
  if (isPublic && !isAdmin) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <Users className="w-12 h-12 mx-auto mb-2 opacity-50" />
        <p>Alleen beheerders kunnen de ledenlijst bekijken</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Owner */}
      {ownerProfile && (
        <Card 
          className="cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => ownerProfile.username && navigate(`/profiel/${ownerProfile.username}`)}
        >
          <CardContent className="p-4 flex items-center gap-3">
            <Avatar className="w-12 h-12 bg-background">
              {ownerProfile.avatar_url && <AvatarImage src={ownerProfile.avatar_url} className="object-cover" />}
              <AvatarFallback className="bg-background text-primary">
                {getInitials(ownerProfile.display_name || ownerProfile.full_name)}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <p className="font-medium flex items-center gap-2">
                {ownerProfile.display_name || ownerProfile.full_name}
                <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary">Beheerder</span>
              </p>
              <p className="text-sm text-muted-foreground">@{ownerProfile.username}</p>
            </div>
          </CardContent>
        </Card>
      )}
      
      {/* Members */}
      {acceptedMembers.map((member) => member.profile && (
        <Card 
          key={member.id}
          className="cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => member.profile?.username && navigate(`/profiel/${member.profile.username}`)}
        >
          <CardContent className="p-4 flex items-center gap-3">
            <Avatar className="w-12 h-12 bg-background">
              {member.profile.avatar_url && <AvatarImage src={member.profile.avatar_url} className="object-cover" />}
              <AvatarFallback className="bg-background text-primary">
                {getInitials(member.profile.display_name || member.profile.full_name)}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <p className="font-medium">
                {member.profile.display_name || member.profile.full_name}
              </p>
              <p className="text-sm text-muted-foreground">@{member.profile.username}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
