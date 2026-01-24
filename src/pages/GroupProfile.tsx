import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { VerifiedBadge } from "@/components/VerifiedBadge";
import { useVerifiedGroups } from "@/hooks/useVerifiedStatus";
import { ChevronLeft, Users, Calendar, UserPlus, Check, Lock } from "lucide-react";
import { format } from "date-fns";
import { nl } from "date-fns/locale";
import { toast } from "sonner";

interface GroupProfileData {
  id: string;
  name: string;
  bio: string | null;
  avatar_url: string | null;
  banner_url: string | null;
  is_public: boolean;
  owner_id: string;
  created_at: string;
}

export default function GroupProfile() {
  const { groupId } = useParams<{ groupId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [group, setGroup] = useState<GroupProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [memberCount, setMemberCount] = useState(0);
  const [isMember, setIsMember] = useState(false);
  const [hasPendingRequest, setHasPendingRequest] = useState(false);
  const [requestingJoin, setRequestingJoin] = useState(false);
  const { verifiedGroupIds } = useVerifiedGroups();

  useEffect(() => {
    if (groupId) {
      loadGroup();
    }
  }, [groupId, user]);

  const loadGroup = async () => {
    try {
      const { data, error } = await supabase
        .from("study_groups")
        .select("*")
        .eq("id", groupId)
        .single();

      if (error) throw error;
      setGroup(data);

      // Get member count (accepted members + owner)
      const { count } = await supabase
        .from("group_members")
        .select("*", { count: 'exact', head: true })
        .eq("group_id", groupId)
        .eq("status", "accepted");

      setMemberCount((count || 0) + 1); // +1 for owner

      // Check if user is member
      if (user) {
        if (data.owner_id === user.id) {
          setIsMember(true);
        } else {
          const { data: memberData } = await supabase
            .from("group_members")
            .select("status")
            .eq("group_id", groupId)
            .eq("user_id", user.id)
            .maybeSingle();

          if (memberData) {
            if (memberData.status === "accepted") {
              setIsMember(true);
            } else if (memberData.status === "pending") {
              setHasPendingRequest(true);
            }
          }
        }
      }
    } catch (error) {
      console.error("Failed to load group:", error);
    } finally {
      setLoading(false);
    }
  };

  const requestJoin = async () => {
    if (!user || !group) return;

    setRequestingJoin(true);
    try {
      // Create join request
      await supabase.from("group_members").insert({
        group_id: group.id,
        user_id: user.id,
        invited_by: user.id,
        status: "pending",
        request_type: "request",
      });

      // Notify the group owner
      await supabase.from("notifications").insert({
        recipient_id: group.owner_id,
        sender_id: user.id,
        type: "group_join_request",
        message: `wil lid worden van "${group.name}"`,
      });

      setHasPendingRequest(true);
      toast.success("Verzoek verstuurd naar de groepsbeheerder");
    } catch (error) {
      console.error("Join request error:", error);
      toast.error("Kon verzoek niet versturen");
    } finally {
      setRequestingJoin(false);
    }
  };

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
        <h2 className="text-xl font-semibold mb-2">Groep niet gevonden</h2>
        <p className="text-muted-foreground mb-4">Deze groep bestaat niet of is privé</p>
        <Button variant="outline" onClick={() => navigate(-1)} className="rounded-full">
          Terug
        </Button>
      </div>
    );
  }

  // Redirect to Studie page if already a member
  if (isMember) {
    return (
      <div className="w-full text-center py-12">
        <Check className="w-16 h-16 mx-auto text-green-500 mb-4" />
        <h2 className="text-xl font-semibold mb-2">Je bent al lid!</h2>
        <p className="text-muted-foreground mb-4">Ga naar Studie om de groep te bekijken</p>
        <Button onClick={() => navigate("/studie")} className="rounded-full">
          Naar Studie
        </Button>
      </div>
    );
  }

  return (
    <div className="w-full relative">
      <Button
        variant="ghost"
        size="icon"
        onClick={() => navigate(-1)}
        className="rounded-full mb-4"
      >
        <ChevronLeft className="w-5 h-5" />
      </Button>

      {/* Banner */}
      <div className="relative h-48 rounded-2xl overflow-hidden mb-20 bg-gradient-to-br from-primary/20 to-primary/5">
        {group.banner_url && (
          <img
            src={group.banner_url}
            alt="Banner"
            className="w-full h-full object-cover"
          />
        )}
      </div>
      
      {/* Avatar - positioned exactly halfway on banner */}
      <div className="absolute left-8" style={{ top: 'calc(12rem - 4.375rem)', zIndex: 10 }}>
        <Avatar className="w-35 h-35 border-4 border-background shadow-xl ring-4 ring-background bg-background" style={{ width: '8.75rem', height: '8.75rem' }}>
          {group.avatar_url ? (
            <AvatarImage src={group.avatar_url} alt={group.name} className="object-cover" />
          ) : null}
          <AvatarFallback className="text-4xl bg-background text-primary">
            <Users className="w-12 h-12" />
          </AvatarFallback>
        </Avatar>
      </div>

      {/* Group Info */}
      <div className="px-2">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold inline-flex items-center gap-2">
              {group.name}
              {verifiedGroupIds.includes(group.id) && <VerifiedBadge />}
              {!group.is_public && <Lock className="w-5 h-5 text-muted-foreground" />}
            </h1>
            <p className="text-muted-foreground">{memberCount} leden</p>
          </div>
          
          {hasPendingRequest ? (
            <Button variant="secondary" disabled className="rounded-full gap-2">
              <Check className="w-4 h-4" />
              Verzoek verstuurd
            </Button>
          ) : (
            <Button
              onClick={requestJoin}
              disabled={requestingJoin}
              className="rounded-full gap-2"
            >
              {requestingJoin ? (
                <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
              ) : (
                <UserPlus className="w-4 h-4" />
              )}
              Lid worden
            </Button>
          )}
        </div>

        {group.bio && (
          <p className="text-foreground mb-6 whitespace-pre-wrap">
            {group.bio}
          </p>
        )}

        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-1">
            <Calendar className="w-4 h-4" />
            <span>
              Opgericht {format(new Date(group.created_at), "MMMM yyyy", { locale: nl })}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
