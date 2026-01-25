import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { VerifiedBadge } from "@/components/VerifiedBadge";
import { useVerifiedUsers } from "@/hooks/useVerifiedStatus";
import { MoreHorizontal, Trash2, UserPlus, Shield, Users } from "lucide-react";
import { toast } from "sonner";
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

interface AdminInfo {
  user_id: string;
}

interface GroupMembersListProps {
  groupId: string;
  ownerId: string;
  members: GroupMember[];
  isOwner: boolean;
  isAdmin: boolean;
  isPublicGroup: boolean;
  activeSessions: Map<string, any>;
  todayStudyTimes: Map<string, number>;
  currentUserId: string;
  isStudying: boolean;
  elapsedTime: number;
  myTodayStudyMinutes: number;
  formatTime: (seconds: number) => string;
  formatMinutes: (minutes: number) => string;
  onMemberRemoved: () => void;
}

export function GroupMembersList({
  groupId,
  ownerId,
  members,
  isOwner,
  isAdmin,
  isPublicGroup,
  activeSessions,
  todayStudyTimes,
  currentUserId,
  isStudying,
  elapsedTime,
  myTodayStudyMinutes,
  formatTime,
  formatMinutes,
  onMemberRemoved,
}: GroupMembersListProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { verifiedUserIds } = useVerifiedUsers();
  const [admins, setAdmins] = useState<string[]>([]);
  const [ownerProfile, setOwnerProfile] = useState<any>(null);
  const [memberToDelete, setMemberToDelete] = useState<GroupMember | null>(null);
  const [requestingAdmin, setRequestingAdmin] = useState<string | null>(null);
  const [existingRequests, setExistingRequests] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadAdmins();
    loadOwnerProfile();
    loadExistingRequests();
  }, [groupId]);

  const loadAdmins = async () => {
    const { data } = await supabase
      .from("group_admins")
      .select("user_id")
      .eq("group_id", groupId);
    
    // Owner is always admin + explicit admins
    const adminIds = [ownerId, ...(data?.map(a => a.user_id) || [])];
    setAdmins([...new Set(adminIds)]);
  };

  const loadOwnerProfile = async () => {
    const { data } = await supabase
      .from("profiles")
      .select("user_id, username, full_name, display_name, avatar_url")
      .eq("user_id", ownerId)
      .single();
    if (data) setOwnerProfile(data);
  };

  const loadExistingRequests = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("group_admin_requests")
      .select("target_admin_id")
      .eq("group_id", groupId)
      .eq("requester_id", user.id)
      .eq("status", "pending");
    
    setExistingRequests(new Set(data?.map(r => r.target_admin_id) || []));
  };

  const requestAdminRole = async (targetAdminId: string) => {
    if (!user) return;
    
    setRequestingAdmin(targetAdminId);
    try {
      // Get group name
      const { data: group } = await supabase
        .from("study_groups")
        .select("name")
        .eq("id", groupId)
        .single();

      // Create admin request
      const { error } = await supabase.from("group_admin_requests").insert({
        group_id: groupId,
        requester_id: user.id,
        target_admin_id: targetAdminId,
      });

      if (error) throw error;

      // Send notification to target admin
      await supabase.from("notifications").insert({
        recipient_id: targetAdminId,
        sender_id: user.id,
        type: "admin_request",
        message: `wil beheerder worden van "${group?.name}"`,
      });

      setExistingRequests(prev => new Set([...prev, targetAdminId]));
      toast.success("Verzoek verstuurd");
    } catch (error) {
      console.error("Admin request error:", error);
      toast.error("Kon verzoek niet versturen");
    } finally {
      setRequestingAdmin(null);
    }
  };

  const removeMember = async () => {
    if (!memberToDelete) return;

    try {
      const { error } = await supabase
        .from("group_members")
        .delete()
        .eq("id", memberToDelete.id);

      if (error) throw error;

      toast.success("Lid verwijderd");
      setMemberToDelete(null);
      onMemberRemoved();
    } catch (error) {
      console.error("Remove member error:", error);
      toast.error("Kon lid niet verwijderen");
    }
  };

  const navigateToProfile = (username: string) => {
    navigate(`/profiel/${username}`);
  };

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  // For public groups, only admins can see member list
  if (isPublicGroup && !isAdmin && !isOwner) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <Users className="w-10 h-10 mx-auto mb-3 opacity-50" />
        <p className="text-sm">Alleen beheerders kunnen de ledenlijst zien</p>
      </div>
    );
  }

  const acceptedMembers = members.filter(m => m.status === "accepted");
  
  // Sort: admins first, then regular members
  const adminMembers = acceptedMembers.filter(m => admins.includes(m.user_id));
  const regularMembers = acceptedMembers.filter(m => !admins.includes(m.user_id) && m.user_id !== ownerId);

  const isUserAdmin = (userId: string) => admins.includes(userId);
  const canShowAdminRequest = (userId: string) => {
    // Show "Vraag om beheerder te worden" for non-admins viewing admins
    return isPublicGroup && !isAdmin && !isOwner && isUserAdmin(userId) && userId !== currentUserId;
  };

  const renderMemberCard = (member: GroupMember | null, isOwnerCard = false) => {
    const profile = isOwnerCard ? ownerProfile : member?.profile;
    const userId = isOwnerCard ? ownerId : member?.user_id;
    if (!profile || !userId) return null;

    const memberIsStudying = userId === currentUserId ? isStudying : activeSessions.has(userId);
    const activeSession = activeSessions.get(userId);
    const todayTime = userId === currentUserId ? myTodayStudyMinutes : (todayStudyTimes.get(userId) || 0);
    const currentSessionTime = activeSession 
      ? Math.floor((Date.now() - new Date(activeSession.started_at).getTime()) / 60000)
      : 0;
    const totalTodayMinutes = todayTime + (userId === currentUserId && isStudying ? Math.floor(elapsedTime / 60) : currentSessionTime);
    const displayName = profile.display_name || profile.full_name;
    const isThisAdmin = isUserAdmin(userId);

    return (
      <Card key={isOwnerCard ? 'owner' : member?.id} className="overflow-hidden">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <button
              onClick={() => profile.username && navigateToProfile(profile.username)}
              className="flex items-center gap-4 flex-1 hover:opacity-80 transition-opacity text-left"
            >
              <Avatar className="w-15 h-15 bg-background" style={{ width: '3.75rem', height: '3.75rem' }}>
                {profile.avatar_url && (
                  <AvatarImage src={profile.avatar_url} className="object-cover" />
                )}
                <AvatarFallback className={`font-semibold bg-background ${memberIsStudying ? 'text-green-700' : 'text-primary'}`}>
                  {getInitials(displayName)}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className={`font-medium ${memberIsStudying ? 'text-green-600' : ''}`}>
                    {displayName}
                  </p>
                  {verifiedUserIds.includes(userId) && <VerifiedBadge className="w-4 h-4" />}
                  {isThisAdmin && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary flex items-center gap-1">
                      <Shield className="w-3 h-3" />
                      Beheerder
                    </span>
                  )}
                  {memberIsStudying && (
                    <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                  )}
                </div>
                <p className="text-sm text-muted-foreground">@{profile.username}</p>
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
            </button>

            <div className="flex items-center gap-2">
              {/* Admin request button for non-admins */}
              {canShowAdminRequest(userId) && (
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-full text-xs gap-1"
                  disabled={requestingAdmin === userId || existingRequests.has(userId)}
                  onClick={(e) => {
                    e.stopPropagation();
                    requestAdminRole(userId);
                  }}
                >
                  {requestingAdmin === userId ? (
                    <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  ) : existingRequests.has(userId) ? (
                    "Verstuurd"
                  ) : (
                    <>
                      <UserPlus className="w-3 h-3" />
                      Vraag beheerder
                    </>
                  )}
                </Button>
              )}

              {/* Delete member option for admins - not for owner and not for self */}
              {(isOwner || isAdmin) && !isOwnerCard && userId !== currentUserId && userId !== ownerId && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="rounded-full h-8 w-8"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <MoreHorizontal className="w-4 h-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onClick={(e) => {
                        e.stopPropagation();
                        setMemberToDelete(member);
                      }}
                      className="text-destructive"
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Verwijderen
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-4">
      {/* Owner is always first */}
      {renderMemberCard(null, true)}
      
      {/* Other admins (excluding owner) */}
      {adminMembers.filter(m => m.user_id !== ownerId).map(member => renderMemberCard(member))}
      
      {/* Spacer between admins and regular members */}
      {regularMembers.length > 0 && adminMembers.length > 0 && (
        <div className="border-t my-4" />
      )}
      
      {/* Regular members */}
      {regularMembers.map(member => renderMemberCard(member))}

      {/* Delete confirmation */}
      <AlertDialog open={!!memberToDelete} onOpenChange={() => setMemberToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Lid verwijderen?</AlertDialogTitle>
            <AlertDialogDescription>
              Weet je zeker dat je {memberToDelete?.profile?.display_name || memberToDelete?.profile?.full_name} wilt verwijderen uit de groep?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction
              onClick={removeMember}
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
