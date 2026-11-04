import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { VerifiedBadge } from "@/components/VerifiedBadge";
import { GroupPosts } from "@/components/studie/GroupPosts";
import { GroupMaterials } from "@/components/studie/GroupMaterials";
import { Users, ChevronLeft, Newspaper, FolderOpen, Lock, Settings, UserPlus, Trash2, Camera, Globe } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { UserPicker, PickedUser, rememberUsers } from "@/components/UserPicker";
import { User } from "@supabase/supabase-js";
import { useRef } from "react";

interface StudyGroup {
  id: string;
  name: string;
  avatar_url: string | null;
  owner_id: string;
  is_public?: boolean;
  member_count?: number;
  bio?: string | null;
  banner_url?: string | null;
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

interface CommunityDetailViewProps {
  group: StudyGroup;
  user: User | null;
  onBack: () => void;
  isGroupVerified: (groupId: string) => boolean;
}

// Simple members list component for communities
function SimpleMembersList({ 
  members, 
  ownerId, 
  navigate 
}: { 
  members: GroupMember[]; 
  ownerId: string; 
  navigate: (path: string) => void;
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

export function CommunityDetailView({ group, user, onBack, isGroupVerified }: CommunityDetailViewProps) {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("posts");
  const [fullGroup, setFullGroup] = useState<StudyGroup & { members?: GroupMember[] }>(group);
  const [loading, setLoading] = useState(true);
  
  // Admin functionality
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [editGroupName, setEditGroupName] = useState(group.name);
  const [editGroupBio, setEditGroupBio] = useState(group.bio || "");
  const [editGroupIsPublic, setEditGroupIsPublic] = useState(group.is_public ?? true);
  const [isSavingGroup, setIsSavingGroup] = useState(false);
  const [isDeletingGroup, setIsDeletingGroup] = useState(false);
  const [uploadingGroupAvatar, setUploadingGroupAvatar] = useState(false);
  const [uploadingGroupBanner, setUploadingGroupBanner] = useState(false);
  const editAvatarInputRef = useRef<HTMLInputElement>(null);
  const editBannerInputRef = useRef<HTMLInputElement>(null);
  
  // Invite
  const [inviteSearchQuery, setInviteSearchQuery] = useState("");
  const [invitePicked, setInvitePicked] = useState<PickedUser[]>([]);
  const [inviteSearchResults, setInviteSearchResults] = useState<Profile[]>([]);
  const [isInviting, setIsInviting] = useState(false);

  const isOwner = user?.id === group.owner_id;
  const [isAdmin, setIsAdmin] = useState(isOwner);

  useEffect(() => {
    loadFullGroup();
    checkAdminStatus();
  }, [group.id]);

  const checkAdminStatus = async () => {
    if (!user) return;
    if (group.owner_id === user.id) {
      setIsAdmin(true);
      return;
    }
    
    const { data } = await supabase
      .from("group_admins")
      .select("id")
      .eq("group_id", group.id)
      .eq("user_id", user.id)
      .maybeSingle();
    
    setIsAdmin(!!data);
  };

  const loadFullGroup = async () => {
    try {
      const { data: groupData } = await supabase
        .from("study_groups")
        .select("*")
        .eq("id", group.id)
        .single();

      if (groupData) {
        // Load members
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

        setFullGroup({
          ...groupData,
          is_public: groupData.is_public ?? true,
          members: enrichedMembers,
          member_count: enrichedMembers.filter(m => m.status === 'accepted').length + 1
        });
      }
    } catch (error) {
      console.error("Failed to load group:", error);
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

      const existingMemberIds = fullGroup.members?.map(m => m.user_id) || [];
      const filtered = (data || []).filter(
        profile => !existingMemberIds.includes(profile.user_id) && profile.user_id !== fullGroup.owner_id
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

  const inviteUsersToGroup = async () => {
    if (!user || !fullGroup || invitePicked.length === 0) return;
    setIsInviting(true);
    try {
      const { error } = await supabase.from("group_members").insert(invitePicked.map((u) => ({
        group_id: fullGroup!.id,
        user_id: u.id,
        invited_by: user.id,
        status: "accepted",
        request_type: "invite",
      })));
      if (error) throw error;
      await supabase.from("notifications").insert(invitePicked.map((u) => ({
        recipient_id: u.id,
        sender_id: user.id,
        type: "group_added",
        message: `Je bent toegevoegd aan de community "${fullGroup!.name}"`,
      })));
      rememberUsers(invitePicked);
      toast.success(`${invitePicked.length} lid/leden toegevoegd`);
      setInvitePicked([]);
      setInviteDialogOpen(false);
      loadFullGroup();
    } catch (error) {
      console.error("Invite error:", error);
      toast.error("Kon gebruiker niet toevoegen");
    } finally {
      setIsInviting(false);
    }
  };

  const handleEditGroupAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    setUploadingGroupAvatar(true);
    try {
      const fileExt = file.name.split('.').pop();
      const filePath = `${user.id}/group-avatars/${fullGroup.id}-${Date.now()}.${fileExt}`;

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
        .eq('id', fullGroup.id);

      toast.success("Groepsfoto bijgewerkt");
      loadFullGroup();
    } catch (error) {
      toast.error("Kon groepsfoto niet uploaden");
    } finally {
      setUploadingGroupAvatar(false);
    }
  };

  const handleEditGroupBannerUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    setUploadingGroupBanner(true);
    try {
      const fileExt = file.name.split('.').pop();
      const filePath = `${user.id}/group-banners/${fullGroup.id}-${Date.now()}.${fileExt}`;

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
        .eq('id', fullGroup.id);

      toast.success("Groepsbanner bijgewerkt");
      loadFullGroup();
    } catch (error) {
      toast.error("Kon groepsbanner niet uploaden");
    } finally {
      setUploadingGroupBanner(false);
    }
  };

  const saveGroupEdit = async () => {
    if (!editGroupName.trim()) return;

    setIsSavingGroup(true);
    try {
      await supabase
        .from('study_groups')
        .update({ 
          name: editGroupName.trim(),
          bio: editGroupBio.trim() || null,
          is_public: editGroupIsPublic,
        })
        .eq('id', fullGroup.id);

      toast.success("Groep bijgewerkt");
      setEditDialogOpen(false);
      loadFullGroup();
    } catch (error) {
      toast.error("Kon groep niet bijwerken");
    } finally {
      setIsSavingGroup(false);
    }
  };

  const deleteGroup = async () => {
    setIsDeletingGroup(true);
    try {
      await supabase
        .from('study_groups')
        .delete()
        .eq('id', fullGroup.id);

      toast.success("Groep verwijderd");
      onBack();
    } catch (error) {
      toast.error("Kon groep niet verwijderen");
    } finally {
      setIsDeletingGroup(false);
    }
  };

  const leaveGroup = async () => {
    if (!user) return;
    
    try {
      await supabase
        .from('group_members')
        .delete()
        .eq('group_id', fullGroup.id)
        .eq('user_id', user.id);
      
      toast.success("Je hebt de community verlaten");
      onBack();
    } catch (error) {
      toast.error("Kon community niet verlaten");
    }
  };

  const acceptedMembers = fullGroup.members?.filter(m => m.status === "accepted") || [];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="w-full">
      {/* Group Banner */}
      <div className="relative h-48 rounded-2xl overflow-hidden bg-gradient-to-br from-primary/20 to-primary/5">
        {fullGroup.banner_url && (
          <img
            src={fullGroup.banner_url}
            alt="Group banner"
            className="w-full h-full object-cover"
          />
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={onBack}
          className="absolute top-3 left-3 rounded-full bg-background/80 backdrop-blur-sm hover:bg-background/90"
        >
          <ChevronLeft className="w-5 h-5" />
        </Button>
      </div>

      {/* Avatar positioned exactly halfway on banner */}
      <div className="relative flex justify-start px-8" style={{ marginTop: '-3.9375rem', zIndex: 10 }}>
        <Avatar className="border-4 border-background shadow-xl ring-4 ring-background bg-background" style={{ width: '7.875rem', height: '7.875rem' }}>
          {fullGroup.avatar_url ? (
            <AvatarImage src={fullGroup.avatar_url} className="object-cover" />
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
            <h1 className="text-3xl font-bold text-foreground">{fullGroup.name}</h1>
            {fullGroup.is_public && isGroupVerified(fullGroup.id) && <VerifiedBadge />}
            {!fullGroup.is_public && <Lock className="w-5 h-5 text-muted-foreground" />}
          </div>
          <p className="text-muted-foreground">
            {acceptedMembers.length + 1} leden
          </p>
          {fullGroup.bio && (
            <p className="text-foreground mt-2 text-sm">{fullGroup.bio}</p>
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

          {isOwner && (
            <>
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
                  <div className="space-y-4 pt-2">
                    <UserPicker
                      selected={invitePicked}
                      onChange={setInvitePicked}
                      excludeIds={[fullGroup?.owner_id, ...(fullGroup?.members?.map((m: any) => m.user_id) || [])].filter(Boolean) as string[]}
                    />
                    <div className="flex gap-2">
                      <Button variant="outline" onClick={() => setInviteDialogOpen(false)} className="flex-1">Annuleren</Button>
                      <Button onClick={inviteUsersToGroup} disabled={invitePicked.length === 0 || isInviting} className="flex-1">
                        <UserPlus className="w-4 h-4 mr-2" />
                        {isInviting ? "Toevoegen..." : `Toevoegen (${invitePicked.length})`}
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>

              <Dialog open={editDialogOpen} onOpenChange={(open) => {
                setEditDialogOpen(open);
                if (open) {
                  setEditGroupName(fullGroup.name);
                  setEditGroupBio(fullGroup.bio || "");
                  setEditGroupIsPublic(fullGroup.is_public ?? true);
                }
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
                    <div className="flex justify-center">
                      <div className="relative">
                        <Avatar className="w-25 h-25 bg-background" style={{ width: '6.25rem', height: '6.25rem' }}>
                          {fullGroup.avatar_url ? (
                            <AvatarImage src={fullGroup.avatar_url} className="object-cover" />
                          ) : null}
                          <AvatarFallback className="bg-background text-primary">
                            <Users className="w-10 h-10" />
                          </AvatarFallback>
                        </Avatar>
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
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Banner afbeelding</Label>
                      <Button
                        variant="outline"
                        className="w-full gap-2"
                        onClick={() => editBannerInputRef.current?.click()}
                        disabled={uploadingGroupBanner}
                      >
                        {uploadingGroupBanner ? (
                          <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                        ) : (
                          <Camera className="w-4 h-4" />
                        )}
                        Banner wijzigen
                      </Button>
                      <input
                        ref={editBannerInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handleEditGroupBannerUpload}
                        className="hidden"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Groepsnaam</Label>
                      <Input
                        value={editGroupName}
                        onChange={(e) => setEditGroupName(e.target.value)}
                        placeholder="Groepsnaam"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Bio</Label>
                      <Textarea
                        value={editGroupBio}
                        onChange={(e) => setEditGroupBio(e.target.value)}
                        placeholder="Beschrijf de groep..."
                        rows={3}
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label className="flex items-center gap-2">
                          {editGroupIsPublic ? <Globe className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                          {editGroupIsPublic ? "Openbaar" : "Privé"}
                        </Label>
                        <p className="text-xs text-muted-foreground">
                          {editGroupIsPublic 
                            ? "Iedereen kan deze groep vinden en lid worden" 
                            : "Alleen via uitnodiging"}
                        </p>
                      </div>
                      <Switch
                        checked={editGroupIsPublic}
                        onCheckedChange={setEditGroupIsPublic}
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
                              Dit verwijdert de groep permanent. Deze actie kan niet ongedaan worden gemaakt.
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
            </>
          )}
        </div>
      </div>

      {/* Tabs - Pill style design */}
      <div className="mb-6">
        <div className="flex bg-muted/50 rounded-full p-1 gap-1 w-fit">
          {[
            { value: 'posts', label: 'Posts', icon: Newspaper },
            ...((fullGroup.is_public && !isAdmin) ? [] : [{ value: 'members', label: 'Leden', icon: Users }]),
            { value: 'materials', label: 'Materiaal', icon: FolderOpen },
          ].map((tab) => (
            <button 
              key={tab.value} 
              onClick={() => setActiveTab(tab.value)} 
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-full transition-all ${
                activeTab === tab.value 
                  ? 'bg-background text-foreground shadow-sm' 
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === 'posts' && (
        <GroupPosts groupId={fullGroup.id} isPublicGroup={fullGroup.is_public} isAdmin={isAdmin} />
      )}
      {activeTab === 'members' && (
        <SimpleMembersList 
          members={fullGroup.members || []} 
          ownerId={fullGroup.owner_id}
          navigate={navigate}
        />
      )}
      {activeTab === 'materials' && (
        <GroupMaterials groupId={fullGroup.id} />
      )}
    </div>
  );
}
