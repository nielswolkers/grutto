import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { VerifiedBadge } from "@/components/VerifiedBadge";
import { useVerifiedGroups } from "@/hooks/useVerifiedStatus";
import { Users } from "lucide-react";

interface GroupAffiliation {
  id: string;
  name: string;
  avatar_url: string | null;
}

interface UserGroupAffiliationsProps {
  userId: string;
}

export function UserGroupAffiliations({ userId }: UserGroupAffiliationsProps) {
  const navigate = useNavigate();
  const { verifiedGroupIds } = useVerifiedGroups();
  const [affiliations, setAffiliations] = useState<GroupAffiliation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAffiliations();
  }, [userId]);

  const loadAffiliations = async () => {
    try {
      // Get groups where user is admin (from group_admins table)
      const { data: adminGroups } = await supabase
        .from("group_admins")
        .select("group_id")
        .eq("user_id", userId);

      // Get groups where user is owner
      const { data: ownedGroups } = await supabase
        .from("study_groups")
        .select("id")
        .eq("owner_id", userId)
        .eq("is_public", true);

      const groupIds = [
        ...(adminGroups?.map(a => a.group_id) || []),
        ...(ownedGroups?.map(g => g.id) || [])
      ];

      const uniqueGroupIds = [...new Set(groupIds)];

      if (uniqueGroupIds.length === 0) {
        setAffiliations([]);
        setLoading(false);
        return;
      }

      // Get group details for public groups only - LIMIT TO 1
      const { data: groups } = await supabase
        .from("study_groups")
        .select("id, name, avatar_url")
        .in("id", uniqueGroupIds)
        .eq("is_public", true)
        .limit(1);

      setAffiliations(groups || []);
    } catch (error) {
      console.error("Load affiliations error:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading || affiliations.length === 0) return null;

  return (
    <div className="space-y-1">
      {affiliations.map((group) => (
        <button
          key={group.id}
          onClick={(e) => {
            e.stopPropagation();
            navigate(`/groep/${group.id}`);
          }}
          className="flex items-center gap-2 px-3 py-2 rounded-xl bg-background shadow-md hover:shadow-lg transition-all text-left cursor-pointer"
        >
          <Avatar className="w-8 h-8 bg-background">
            {group.avatar_url ? (
              <AvatarImage src={group.avatar_url} className="object-cover" />
            ) : null}
            <AvatarFallback className="bg-muted text-primary text-xs">
              <Users className="w-4 h-4" />
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate flex items-center gap-1">
              {group.name}
              {verifiedGroupIds.includes(group.id) && <VerifiedBadge className="w-3.5 h-3.5" />}
            </p>
            <p className="text-xs text-muted-foreground">Community beheerder</p>
          </div>
        </button>
      ))}
    </div>
  );
}
