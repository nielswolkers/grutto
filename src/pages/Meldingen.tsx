import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { FileIcon, Undo2, Trash2, Bell, Calendar, Users, Check, X } from "lucide-react";
import { toast } from "sonner";
import { formatRelativeDate } from "@/lib/dateUtils";
import { useAuth } from "@/hooks/useAuth";
import { format, parseISO } from "date-fns";
import { nl } from "date-fns/locale";

interface Notification {
  id: string;
  message: string;
  type: string;
  read_status: boolean;
  created_at: string;
  sender_id: string;
  file_id: string | null;
  profiles?: { username: string; display_name: string | null; full_name: string };
  files?: { id: string; filename: string; file_size: number; deleted_at: string | null };
}

interface EventInvitation {
  id: string;
  event_id: string;
  inviter_id: string;
  status: string;
  event?: {
    id: string;
    title: string;
    start_time: string;
    end_time: string;
    color: string;
    description: string | null;
    location: string | null;
    all_day: boolean;
  };
  inviter?: {
    full_name: string;
    display_name: string | null;
  };
}

interface GroupInvitation {
  id: string;
  group_id: string;
  status: string;
  invited_by: string;
  request_type?: string | null;
  group?: {
    id: string;
    name: string;
  };
  inviter?: {
    full_name: string;
    display_name: string | null;
    username?: string;
  };
}

interface GroupJoinRequest {
  id: string;
  group_id: string;
  user_id: string;
  status: string;
  request_type: string | null;
  group?: {
    id: string;
    name: string;
  };
  requester?: {
    full_name: string;
    display_name: string | null;
    username: string;
    avatar_url: string | null;
  };
}

interface AdminRequest {
  id: string;
  group_id: string;
  requester_id: string;
  status: string;
  group?: { id: string; name: string };
  requester?: { full_name: string; display_name: string | null; username: string };
}

const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
};

const Meldingen = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [eventInvitations, setEventInvitations] = useState<EventInvitation[]>([]);
  const [groupInvitations, setGroupInvitations] = useState<GroupInvitation[]>([]);
  const [groupJoinRequests, setGroupJoinRequests] = useState<GroupJoinRequest[]>([]);
  const [adminRequests, setAdminRequests] = useState<AdminRequest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      loadNotifications();
      loadEventInvitations();
      loadGroupInvitations();
      loadGroupJoinRequests();
      loadAdminRequests();
      markAllAsReadOnOpen();
    }
  }, [user]);

  const loadAdminRequests = async () => {
    if (!user) return;
    try {
      const { data } = await supabase
        .from("group_admin_requests")
        .select("id, group_id, requester_id, status")
        .eq("target_admin_id", user.id)
        .eq("status", "pending");

      if (!data || data.length === 0) { setAdminRequests([]); return; }

      const groupIds = data.map(r => r.group_id);
      const requesterIds = data.map(r => r.requester_id);
      const { data: groups } = await supabase.from("study_groups").select("id, name").in("id", groupIds);
      const { data: profiles } = await supabase.from("profiles").select("user_id, full_name, display_name, username").in("user_id", requesterIds);

      setAdminRequests(data.map(req => ({
        ...req,
        group: groups?.find(g => g.id === req.group_id),
        requester: profiles?.find(p => p.user_id === req.requester_id)
      })));
    } catch (error) { console.error("Load admin requests error:", error); }
  };

  const respondToAdminRequest = async (request: AdminRequest, accept: boolean) => {
    if (!user) return;
    try {
      await supabase.from("group_admin_requests").update({ status: accept ? "accepted" : "declined", responded_at: new Date().toISOString() }).eq("id", request.id);
      if (accept) {
        await supabase.from("group_admins").insert({ group_id: request.group_id, user_id: request.requester_id });
        await supabase.from("notifications").insert({ recipient_id: request.requester_id, sender_id: user.id, type: "admin_accepted", message: `Je bent nu beheerder van "${request.group?.name}"` });
      } else {
        await supabase.from("notifications").insert({ recipient_id: request.requester_id, sender_id: user.id, type: "admin_declined", message: `Je verzoek om beheerder te worden van "${request.group?.name}" is afgewezen` });
      }
      toast.success(accept ? "Beheerder toegevoegd" : "Verzoek afgewezen");
      loadAdminRequests();
    } catch (error) { toast.error("Kon niet reageren"); }
  };

  const markAllAsReadOnOpen = async () => {
    if (!user) return;
    
    await supabase
      .from('notifications')
      .update({ read_status: true })
      .eq('recipient_id', user.id)
      .eq('read_status', false);
  };

  const loadEventInvitations = async () => {
    if (!user) return;

    try {
      const { data: invitations } = await supabase
        .from("event_invitations")
        .select("id, event_id, inviter_id, status")
        .eq("invitee_id", user.id)
        .eq("status", "pending");

      if (!invitations || invitations.length === 0) {
        setEventInvitations([]);
        return;
      }

      // Load event details
      const eventIds = invitations.map(i => i.event_id);
      const { data: events } = await supabase
        .from("calendar_events")
        .select("id, title, start_time, end_time, color, description, location, all_day, user_id")
        .in("id", eventIds);

      // Load inviter profiles
      const inviterIds = invitations.map(i => i.inviter_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name, display_name")
        .in("user_id", inviterIds);

      const enrichedInvitations = invitations.map(inv => ({
        ...inv,
        event: events?.find(e => e.id === inv.event_id),
        inviter: profiles?.find(p => p.user_id === inv.inviter_id)
      }));

      setEventInvitations(enrichedInvitations);
    } catch (error) {
      console.error("Failed to load event invitations:", error);
    }
  };

  const loadGroupInvitations = async () => {
    if (!user) return;

    try {
      // Only load invitations where I was invited (not my own requests)
      const { data: invitations } = await supabase
        .from("group_members")
        .select("id, group_id, status, invited_by, request_type")
        .eq("user_id", user.id)
        .eq("status", "pending")
        .or("request_type.is.null,request_type.eq.invite");

      if (!invitations || invitations.length === 0) {
        setGroupInvitations([]);
        return;
      }

      // Load group details
      const groupIds = invitations.map(i => i.group_id);
      const { data: groups } = await supabase
        .from("study_groups")
        .select("id, name")
        .in("id", groupIds);

      // Load inviter profiles
      const inviterIds = invitations.map(i => i.invited_by);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name, display_name, username")
        .in("user_id", inviterIds);

      const enrichedInvitations = invitations.map(inv => ({
        ...inv,
        group: groups?.find(g => g.id === inv.group_id),
        inviter: profiles?.find(p => p.user_id === inv.invited_by)
      }));

      setGroupInvitations(enrichedInvitations);
    } catch (error) {
      console.error("Failed to load group invitations:", error);
    }
  };

  const loadGroupJoinRequests = async () => {
    if (!user) return;

    try {
      // Get groups where I am the owner
      const { data: myGroups } = await supabase
        .from("study_groups")
        .select("id, name")
        .eq("owner_id", user.id);

      if (!myGroups || myGroups.length === 0) {
        setGroupJoinRequests([]);
        return;
      }

      const myGroupIds = myGroups.map(g => g.id);

      // Get pending join requests for my groups
      const { data: requests } = await supabase
        .from("group_members")
        .select("id, group_id, user_id, status, request_type")
        .in("group_id", myGroupIds)
        .eq("status", "pending")
        .eq("request_type", "request");

      if (!requests || requests.length === 0) {
        setGroupJoinRequests([]);
        return;
      }

      // Load requester profiles
      const requesterIds = requests.map(r => r.user_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name, display_name, username, avatar_url")
        .in("user_id", requesterIds);

      const enrichedRequests = requests.map(req => ({
        ...req,
        group: myGroups.find(g => g.id === req.group_id),
        requester: profiles?.find(p => p.user_id === req.user_id)
      }));

      setGroupJoinRequests(enrichedRequests);
    } catch (error) {
      console.error("Failed to load group join requests:", error);
    }
  };

  const respondToJoinRequest = async (request: GroupJoinRequest, accept: boolean) => {
    if (!user) return;

    try {
      if (accept) {
        // Accept - update status to accepted
        await supabase
          .from("group_members")
          .update({ 
            status: "accepted",
            responded_at: new Date().toISOString()
          })
          .eq("id", request.id);

        // Notify the requester
        await supabase.from("notifications").insert({
          recipient_id: request.user_id,
          sender_id: user.id,
          type: "group_request_accepted",
          message: `Je verzoek om lid te worden van "${request.group?.name}" is geaccepteerd!`,
        });

        toast.success("Verzoek geaccepteerd");
      } else {
        // Decline - delete the request
        await supabase
          .from("group_members")
          .delete()
          .eq("id", request.id);

        // Notify the requester
        await supabase.from("notifications").insert({
          recipient_id: request.user_id,
          sender_id: user.id,
          type: "group_request_declined",
          message: `Je verzoek om lid te worden van "${request.group?.name}" is afgewezen.`,
        });

        toast.success("Verzoek afgewezen");
      }

      loadGroupJoinRequests();
    } catch (error) {
      console.error("Error responding to join request:", error);
      toast.error("Kon niet reageren op verzoek");
    }
  };

  const loadNotifications = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      await supabase.from('notifications').delete().eq('recipient_id', user.id).lt('created_at', thirtyDaysAgo.toISOString());

      const { data: notifData, error } = await supabase.from('notifications').select('*').eq('recipient_id', user.id).order('created_at', { ascending: false });
      if (error) throw error;

      const senderIds = [...new Set(notifData?.map(n => n.sender_id) || [])];
      const { data: profiles } = await supabase.from('profiles').select('user_id, username, display_name, full_name').in('user_id', senderIds);

      const fileIds = [...new Set(notifData?.filter(n => n.file_id).map(n => n.file_id!) || [])];
      let fileMap = new Map();
      if (fileIds.length > 0) {
        const { data: files } = await supabase
          .from('files')
          .select('id, filename, file_size, deleted_at')
          .in('id', fileIds);
        fileMap = new Map(files?.map(f => [f.id, f]) || []);
      }

      const profileMap = new Map(profiles?.map(p => [p.user_id, p]) || []);
      const enrichedNotifications = notifData?.map(n => ({
        ...n,
        profiles: profileMap.get(n.sender_id),
        files: n.file_id ? fileMap.get(n.file_id) : undefined,
      })) || [];

      setNotifications(enrichedNotifications as Notification[]);
    } catch (error) {
      toast.error("Kon meldingen niet laden");
    } finally {
      setLoading(false);
    }
  };

  const respondToEventInvitation = async (invitation: EventInvitation, accept: boolean) => {
    if (!user) return;

    try {
      // Update the invitation status
      await supabase
        .from("event_invitations")
        .update({ 
          status: accept ? "accepted" : "declined",
          responded_at: new Date().toISOString()
        })
        .eq("id", invitation.id);

      // If accepted, copy the event to BOTH the invitee's calendar
      if (accept && invitation.event) {
        // Insert the event into the invitee's (current user's) calendar
        const { error: insertError } = await supabase.from("calendar_events").insert({
          user_id: user.id,
          title: invitation.event.title,
          start_time: invitation.event.start_time,
          end_time: invitation.event.end_time,
          all_day: invitation.event.all_day,
          color: invitation.event.color,
          event_type: 'meeting',
          description: invitation.event.description,
          location: invitation.event.location,
        });

        if (insertError) {
          console.error("Failed to insert event for invitee:", insertError);
        }
      }

      // Send notification to the original inviter about the response
      const { data: responderProfile } = await supabase
        .from("profiles")
        .select("full_name, display_name")
        .eq("user_id", user.id)
        .single();

      const responderName = responderProfile?.display_name || responderProfile?.full_name || "Iemand";
      const statusMessage = accept ? "geaccepteerd" : "afgewezen";

      await supabase.from("notifications").insert({
        recipient_id: invitation.inviter_id,
        sender_id: user.id,
        type: 'meeting_response',
        message: `${responderName} heeft je uitnodiging voor "${invitation.event?.title}" ${statusMessage}.`,
      });

      toast.success(accept ? "Uitnodiging geaccepteerd - afspraak toegevoegd aan je agenda" : "Uitnodiging afgewezen");
      loadEventInvitations();
    } catch (error) {
      console.error("Error responding to invitation:", error);
      toast.error("Kon niet reageren op uitnodiging");
    }
  };

  const respondToGroupInvitation = async (invitation: GroupInvitation, accept: boolean) => {
    if (!user) return;

    try {
      await supabase
        .from("group_members")
        .update({ 
          status: accept ? "accepted" : "declined",
          responded_at: new Date().toISOString()
        })
        .eq("id", invitation.id);

      // Send notification to the inviter about the response
      const { data: responderProfile } = await supabase
        .from("profiles")
        .select("full_name, display_name")
        .eq("user_id", user.id)
        .single();

      const responderName = responderProfile?.display_name || responderProfile?.full_name || "Iemand";
      const statusMessage = accept ? "geaccepteerd" : "afgewezen";

      await supabase.from("notifications").insert({
        recipient_id: invitation.invited_by,
        sender_id: user.id,
        type: 'group_response',
        message: `${responderName} heeft je uitnodiging voor de groep "${invitation.group?.name}" ${statusMessage}.`,
      });

      toast.success(accept ? "Uitnodiging geaccepteerd" : "Uitnodiging afgewezen");
      loadGroupInvitations();
    } catch (error) {
      console.error("Error responding to group invitation:", error);
      toast.error("Kon niet reageren op uitnodiging");
    }
  };

  const dismissEventInvitation = async (invitationId: string) => {
    try {
      await supabase.from("event_invitations").delete().eq("id", invitationId);
      loadEventInvitations();
      toast.success("Melding verwijderd");
    } catch (error) {
      toast.error("Kon melding niet verwijderen");
    }
  };

  const markAsRead = async (notificationId: string) => {
    await supabase.from('notifications').delete().eq('id', notificationId);
    setNotifications(prev => prev.filter(n => n.id !== notificationId));
    toast.success("Melding verwijderd");
  };

  const markAllAsRead = async () => {
    if (notifications.length === 0) return;
    await supabase.from('notifications').delete().eq('recipient_id', user?.id);
    setNotifications([]);
    toast.success("Alle meldingen verwijderd");
  };

  const handleRecoverFile = async (notification: Notification) => {
    if (!notification.file_id) return;
    try {
      await supabase.from('files').update({ deleted_at: null, deleted_by: null }).eq('id', notification.file_id);
      await supabase.from('notifications').delete().eq('id', notification.id);
      toast.success('Bestand hersteld');
      loadNotifications();
    } catch (error) {
      toast.error('Kon bestand niet herstellen');
    }
  };

  const handlePermanentDelete = async (notification: Notification) => {
    if (!notification.file_id) return;
    try {
      const { data: file } = await supabase.from('files').select('storage_url').eq('id', notification.file_id).maybeSingle();
      if (file) await supabase.storage.from('user-files').remove([file.storage_url]);
      await supabase.from('files').delete().eq('id', notification.file_id);
      await supabase.from('notifications').delete().eq('id', notification.id);
      toast.success('Bestand permanent verwijderd');
      loadNotifications();
    } catch (error) {
      toast.error('Kon bestand niet verwijderen');
    }
  };

  const handleFileClick = (notification: Notification) => {
    if (notification.file_id && notification.files && !notification.files.deleted_at) {
      navigate(`/materialen/preview/${notification.file_id}`);
    }
  };

  if (!user) return null;

  const hasAnyContent = notifications.length > 0 || eventInvitations.length > 0 || groupInvitations.length > 0 || groupJoinRequests.length > 0 || adminRequests.length > 0;

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-4xl font-bold text-foreground">Meldingen</h1>
        {notifications.length > 0 && (
          <Button 
            size="sm" 
            variant="secondary" 
            onClick={markAllAsRead}
            className="rounded-full px-4 h-9 bg-muted hover:bg-muted/80"
          >
            Wis alles
          </Button>
        )}
      </div>

      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      )}

      {!loading && !hasAnyContent && (
        <div className="text-center py-12">
          <Bell className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
          <p className="text-muted-foreground">Geen meldingen</p>
        </div>
      )}

      {!loading && (
        <div className="space-y-4">
          {/* Event Invitations */}
          {eventInvitations.map((invitation) => (
            <div key={invitation.id} className="rounded-2xl border bg-card border-border p-5">
              <div className="flex items-start justify-between gap-4 mb-3">
                <p className="text-[15px] flex-1">
                  <span className="font-semibold">
                    {invitation.inviter?.display_name || invitation.inviter?.full_name}
                  </span>
                  {' '}heeft u uitgenodigd voor een agenda activiteit.
                </p>
                <Button 
                  size="sm" 
                  variant="secondary" 
                  className="rounded-full px-4 h-8 text-xs bg-muted hover:bg-muted/80 shrink-0"
                  onClick={() => dismissEventInvitation(invitation.id)}
                >
                  Wis
                </Button>
              </div>

              {invitation.event && (
                <div className="bg-secondary/50 rounded-xl p-4 mb-3">
                  <div className="flex items-center gap-3">
                    <Calendar className="w-5 h-5 text-muted-foreground shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-sm">
                        {invitation.event.title === 'Nieuwe Afspraak' || !invitation.event.title.trim()
                          ? `Nieuwe Afspraak (${invitation.inviter?.display_name || invitation.inviter?.full_name})`
                          : invitation.event.title}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {format(parseISO(invitation.event.start_time), "d MMMM HH:mm", { locale: nl })}
                        {" - "}
                        {format(parseISO(invitation.event.end_time), "HH:mm", { locale: nl })}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex gap-2 mb-3">
                <Button 
                  size="sm" 
                  variant="outline" 
                  className="rounded-full h-9"
                  onClick={() => respondToEventInvitation(invitation, true)}
                >
                  <Check className="w-4 h-4 mr-2" />
                  Bevestig
                </Button>
                <Button 
                  size="sm" 
                  variant="outline" 
                  className="rounded-full h-9 text-destructive hover:text-destructive border-destructive/30 hover:bg-destructive/10"
                  onClick={() => respondToEventInvitation(invitation, false)}
                >
                  <X className="w-4 h-4 mr-2" />
                  Weiger
                </Button>
              </div>
            </div>
          ))}

          {/* Group Invitations */}
          {groupInvitations.map((invitation) => (
            <div key={invitation.id} className="rounded-2xl border bg-card border-border p-5">
              <div className="flex items-start justify-between gap-4 mb-3">
                <p className="text-[15px] flex-1">
                  <span className="font-semibold">
                    {invitation.inviter?.display_name || invitation.inviter?.full_name}
                  </span>
                  {' '}heeft u uitgenodigd voor de studiegroep "{invitation.group?.name}".
                </p>
                <Button 
                  size="sm" 
                  variant="secondary" 
                  className="rounded-full px-4 h-8 text-xs bg-muted hover:bg-muted/80 shrink-0"
                  onClick={() => respondToGroupInvitation(invitation, false)}
                >
                  Wis
                </Button>
              </div>

              <div className="bg-secondary/50 rounded-xl p-4 mb-3">
                <div className="flex items-center gap-3">
                  <Users className="w-5 h-5 text-muted-foreground shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm">{invitation.group?.name}</p>
                  </div>
                </div>
              </div>

              <div className="flex gap-2 mb-3">
                <Button 
                  size="sm" 
                  variant="outline" 
                  className="rounded-full h-9"
                  onClick={() => respondToGroupInvitation(invitation, true)}
                >
                  <Check className="w-4 h-4 mr-2" />
                  Bevestig
                </Button>
                <Button 
                  size="sm" 
                  variant="outline" 
                  className="rounded-full h-9 text-destructive hover:text-destructive border-destructive/30 hover:bg-destructive/10"
                  onClick={() => respondToGroupInvitation(invitation, false)}
                >
                  <X className="w-4 h-4 mr-2" />
                  Weiger
                </Button>
              </div>
            </div>
          ))}

          {/* Group Join Requests (for group owners) */}
          {groupJoinRequests.map((request) => (
            <div key={request.id} className="rounded-2xl border bg-card border-border p-5">
              <div className="flex items-start justify-between gap-4 mb-3">
                <p className="text-[15px] flex-1">
                  <span className="font-semibold">
                    {request.requester?.display_name || request.requester?.full_name}
                  </span>
                  {' '}wil lid worden van "{request.group?.name}".
                </p>
              </div>

              <div className="bg-secondary/50 rounded-xl p-4 mb-3">
                <div className="flex items-center gap-3">
                  <Users className="w-5 h-5 text-muted-foreground shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm">{request.requester?.display_name || request.requester?.full_name}</p>
                    <p className="text-xs text-muted-foreground">@{request.requester?.username}</p>
                  </div>
                </div>
              </div>

              <div className="flex gap-2 mb-3">
                <Button 
                  size="sm" 
                  variant="outline" 
                  className="rounded-full h-9"
                  onClick={() => respondToJoinRequest(request, true)}
                >
                  <Check className="w-4 h-4 mr-2" />
                  Bevestig
                </Button>
                <Button 
                  size="sm" 
                  variant="outline" 
                  className="rounded-full h-9 text-destructive hover:text-destructive border-destructive/30 hover:bg-destructive/10"
                  onClick={() => respondToJoinRequest(request, false)}
                >
                  <X className="w-4 h-4 mr-2" />
                  Weiger
                </Button>
              </div>
            </div>
          ))}

          {/* Regular Notifications */}
          {notifications.map((notification) => {
            const isDeleteNotification = notification.type === 'file_deleted' || notification.type === 'folder_deleted';
            const isShareNotification = notification.type === 'file_shared';
            const canOpenFile = notification.file_id && notification.files && !notification.files.deleted_at;

            return (
              <div 
                key={notification.id} 
                className="rounded-2xl border bg-card border-border p-5"
              >
                <div className="flex items-start justify-between gap-4 mb-3">
                  <p className="text-[15px] flex-1">
                    {isShareNotification ? (
                      <>
                        <span className="font-semibold">
                          {notification.profiles?.full_name || notification.profiles?.display_name || notification.profiles?.username}
                        </span>
                        {' '}heeft een bestand met u gedeeld.
                      </>
                    ) : (
                      notification.message
                    )}
                  </p>
                  <Button 
                    size="sm" 
                    variant="secondary" 
                    className="rounded-full px-4 h-8 text-xs bg-muted hover:bg-muted/80 shrink-0" 
                    onClick={() => markAsRead(notification.id)}
                  >
                    Wis
                  </Button>
                </div>

                {notification.files && (
                  <div 
                    className={`bg-secondary/50 rounded-xl p-4 mb-3 ${canOpenFile ? 'cursor-pointer hover:bg-secondary/70 transition-colors' : ''}`}
                    onClick={() => canOpenFile && handleFileClick(notification)}
                  >
                    <div className="flex items-center gap-3">
                      <FileIcon className="w-5 h-5 text-muted-foreground shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-sm truncate">
                          {notification.files?.filename}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatFileSize(notification.files?.file_size || 0)}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {isDeleteNotification && notification.file_id && (
                  <div className="flex gap-2 mb-3">
                    <Button 
                      size="sm" 
                      variant="outline" 
                      className="rounded-full h-9"
                      onClick={() => handleRecoverFile(notification)}
                    >
                      <Undo2 className="w-4 h-4 mr-2" />
                      Zet terug
                    </Button>
                    <Button 
                      size="sm" 
                      variant="outline" 
                      className="rounded-full h-9 text-destructive hover:text-destructive border-destructive/30 hover:bg-destructive/10"
                      onClick={() => handlePermanentDelete(notification)}
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Verwijder permanent
                    </Button>
                  </div>
                )}

                <p className="text-xs text-muted-foreground text-right">
                  {formatRelativeDate(notification.created_at)}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default Meldingen;
