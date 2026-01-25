import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { VerifiedBadge } from "@/components/VerifiedBadge";
import { LinkifiedText } from "@/components/LinkifiedText";
import { useVerifiedGroups } from "@/hooks/useVerifiedStatus";
import { extractDominantColor } from "@/utils/colorExtractor";
import { ChevronLeft, Users, Calendar, Check, Lock } from "lucide-react";
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
  const [joining, setJoining] = useState(false);
  const [buttonColor, setButtonColor] = useState('hsl(var(--primary))');
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

      // Extract color from avatar if available
      if (data.avatar_url) {
        const color = await extractDominantColor(data.avatar_url);
        setButtonColor(color);
      }

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

          if (memberData && memberData.status === "accepted") {
            setIsMember(true);
          }
        }
      }
    } catch (error) {
      console.error("Failed to load group:", error);
    } finally {
      setLoading(false);
    }
  };

  // Public groups: anyone can join directly without request
  const joinGroup = async () => {
    if (!user || !group) return;

    setJoining(true);
    try {
      // Insert as accepted member directly for public groups
      await supabase.from("group_members").insert({
        group_id: group.id,
        user_id: user.id,
        invited_by: user.id,
        status: "accepted",
        request_type: "join",
      });

      setIsMember(true);
      toast.success("Je bent nu lid van deze Community!");
      navigate("/communities");
    } catch (error) {
      console.error("Join error:", error);
      toast.error("Kon niet lid worden");
    } finally {
      setJoining(false);
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
        <h2 className="text-xl font-semibold mb-2">Community niet gevonden</h2>
        <p className="text-muted-foreground mb-4">Deze Community bestaat niet of is privé</p>
        <Button variant="outline" onClick={() => navigate(-1)} className="rounded-full">
          Terug
        </Button>
      </div>
    );
  }

  // For members, show "Ga naar community" button instead of redirect
  if (isMember) {
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
        <div className="relative h-48 rounded-2xl overflow-hidden bg-gradient-to-br from-primary/20 to-primary/5">
          {group.banner_url && (
            <img
              src={group.banner_url}
              alt="Banner"
              className="w-full h-full object-cover"
            />
          )}
        </div>
        
        {/* Avatar */}
        <div className="relative flex justify-start px-8" style={{ marginTop: '-3.9375rem' }}>
          <Avatar className="border-4 border-background shadow-xl ring-4 ring-background bg-background" style={{ width: '7.875rem', height: '7.875rem' }}>
            {group.avatar_url ? (
              <AvatarImage src={group.avatar_url} alt={group.name} className="object-cover" />
            ) : null}
            <AvatarFallback className="text-4xl bg-background text-primary">
              <Users className="w-12 h-12" />
            </AvatarFallback>
          </Avatar>
        </div>

        {/* Group Info */}
        <div className="px-2 mt-4">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h1 className="text-2xl font-bold inline-flex items-center gap-2">
                {group.name}
                {group.is_public && verifiedGroupIds.includes(group.id) && <VerifiedBadge />}
              </h1>
              <p className="text-muted-foreground">{memberCount} leden</p>
            </div>
            
            {/* Go to Community button */}
            <Button
              onClick={() => navigate("/communities")}
              className="rounded-full"
            >
              Ga naar community
            </Button>
          </div>

          {group.bio && (
            <p className="text-foreground mb-6 whitespace-pre-wrap mt-4">
              <LinkifiedText text={group.bio} />
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
      <div className="relative h-48 rounded-2xl overflow-hidden bg-gradient-to-br from-primary/20 to-primary/5">
        {group.banner_url && (
          <img
            src={group.banner_url}
            alt="Banner"
            className="w-full h-full object-cover"
          />
        )}
      </div>
      
      {/* Avatar - positioned exactly halfway on banner (decreased by 10%) */}
      <div className="relative flex justify-start px-8" style={{ marginTop: '-3.9375rem' }}>
        <Avatar className="border-4 border-background shadow-xl ring-4 ring-background bg-background" style={{ width: '7.875rem', height: '7.875rem' }}>
          {group.avatar_url ? (
            <AvatarImage src={group.avatar_url} alt={group.name} className="object-cover" />
          ) : null}
          <AvatarFallback className="text-4xl bg-background text-primary">
            <Users className="w-12 h-12" />
          </AvatarFallback>
        </Avatar>
      </div>

      {/* Group Info */}
      <div className="px-2 mt-4">
        {/* Header with name and button on the same row */}
        <div className="flex items-center justify-between mb-2">
          <div>
            <h1 className="text-2xl font-bold inline-flex items-center gap-2">
              {group.name}
              {group.is_public && verifiedGroupIds.includes(group.id) && <VerifiedBadge />}
              {!group.is_public && <Lock className="w-5 h-5 text-muted-foreground" />}
            </h1>
            <p className="text-muted-foreground">{memberCount} leden</p>
          </div>
          
          {/* Join button - positioned on same row as title */}
          <Button
            onClick={joinGroup}
            disabled={joining}
            className="rounded-full text-white"
            style={{ backgroundColor: buttonColor, borderColor: buttonColor }}
          >
            {joining ? (
              <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
            ) : (
              "Lid worden"
            )}
          </Button>
        </div>

        {group.bio && (
          <p className="text-foreground mb-6 whitespace-pre-wrap mt-4">
            <LinkifiedText text={group.bio} />
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
