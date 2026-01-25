import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { LinkifiedText } from "@/components/LinkifiedText";
import { VerifiedBadge } from "@/components/VerifiedBadge";
import { useVerifiedUsers } from "@/hooks/useVerifiedStatus";
import { UserGroupAffiliations } from "@/components/studie/UserGroupAffiliations";
import { ChevronLeft, User, Calendar, UserPlus, Check, FileText } from "lucide-react";
import { format } from "date-fns";
import { nl } from "date-fns/locale";
import { toast } from "sonner";

interface UserProfileData {
  user_id: string;
  username: string;
  full_name: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  banner_url: string | null;
  created_at: string;
}

interface Publication {
  id: string;
  content: string | null;
  image_url: string | null;
  file_url: string | null;
  file_name: string | null;
  created_at: string;
}

export default function UserProfile() {
  const { username } = useParams<{ username: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [profile, setProfile] = useState<UserProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  const [publications, setPublications] = useState<Publication[]>([]);
  const [followerCount, setFollowerCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const { verifiedUserIds } = useVerifiedUsers();

  useEffect(() => {
    if (username) {
      loadProfile();
    }
  }, [username, user]);

  const loadProfile = async () => {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, username, full_name, display_name, avatar_url, bio, banner_url, created_at")
        .eq("username", username)
        .single();

      if (error) throw error;
      setProfile(data);

      if (data) {
        // Load user's publications
        const { data: pubs } = await supabase
          .from("publications")
          .select("*")
          .eq("user_id", data.user_id)
          .order("created_at", { ascending: false });
        
        setPublications(pubs || []);

        // Load follow counts
        const { count: followers } = await supabase
          .from("follows")
          .select("*", { count: 'exact', head: true })
          .eq("following_id", data.user_id);

        const { count: following } = await supabase
          .from("follows")
          .select("*", { count: 'exact', head: true })
          .eq("follower_id", data.user_id);

        setFollowerCount(followers || 0);
        setFollowingCount(following || 0);

        // Check if current user is following this profile
        if (user && user.id !== data.user_id) {
          const { data: followData } = await supabase
            .from("follows")
            .select("id")
            .eq("follower_id", user.id)
            .eq("following_id", data.user_id)
            .maybeSingle();
          
          setIsFollowing(!!followData);
        }
      }
    } catch (error) {
      console.error("Failed to load profile:", error);
    } finally {
      setLoading(false);
    }
  };

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const handleFollow = async () => {
    if (!user || !profile) return;

    setFollowLoading(true);
    try {
      if (isFollowing) {
        // Unfollow
        await supabase
          .from("follows")
          .delete()
          .eq("follower_id", user.id)
          .eq("following_id", profile.user_id);

        setIsFollowing(false);
        setFollowerCount(prev => prev - 1);
        toast.success("Niet meer volgend");
      } else {
        // Follow
        await supabase
          .from("follows")
          .insert({
            follower_id: user.id,
            following_id: profile.user_id,
          });

        setIsFollowing(true);
        setFollowerCount(prev => prev + 1);
        toast.success("Je volgt nu deze gebruiker");

        // Send notification
        await supabase.from("notifications").insert({
          recipient_id: profile.user_id,
          sender_id: user.id,
          type: "new_follower",
          message: "volgt je nu",
        });
      }
    } catch (error) {
      console.error("Follow error:", error);
      toast.error("Er ging iets mis");
    } finally {
      setFollowLoading(false);
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return format(date, "d MMM yyyy", { locale: nl });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="w-full text-center py-12">
        <User className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
        <h2 className="text-xl font-semibold mb-2">Gebruiker niet gevonden</h2>
        <p className="text-muted-foreground mb-4">@{username} bestaat niet</p>
        <Button variant="outline" onClick={() => navigate(-1)} className="rounded-full">
          Terug
        </Button>
      </div>
    );
  }

  const displayName = profile.display_name || profile.full_name;
  const isOwnProfile = user?.id === profile.user_id;

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
        {profile.banner_url && (
          <img
            src={profile.banner_url}
            alt="Banner"
            className="w-full h-full object-cover"
          />
        )}
      </div>
      
      {/* Avatar - positioned exactly halfway on banner */}
      <div className="absolute left-8" style={{ top: 'calc(12rem - 4.375rem)', zIndex: 10 }}>
        <Avatar className="border-4 border-background shadow-xl ring-4 ring-background bg-background" style={{ width: '8.75rem', height: '8.75rem' }}>
          {profile.avatar_url ? (
            <AvatarImage src={profile.avatar_url} alt={displayName} className="object-cover" />
          ) : null}
          <AvatarFallback className="text-3xl bg-background text-primary">
            {getInitials(displayName)}
          </AvatarFallback>
        </Avatar>
      </div>

      {/* Profile Info */}
      <div className="px-2">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold inline-flex items-center">
              {displayName}
              {verifiedUserIds.includes(profile.user_id) && <VerifiedBadge />}
            </h1>
            <p className="text-muted-foreground">@{profile.username}</p>
          </div>
          
          {isOwnProfile ? (
            <Button
              variant="outline"
              onClick={() => navigate("/account")}
              className="rounded-full"
            >
              Bewerken
            </Button>
          ) : (
            <Button
              variant={isFollowing ? "secondary" : "default"}
              onClick={handleFollow}
              disabled={followLoading}
              className="rounded-full gap-2"
            >
              {followLoading ? (
                <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
              ) : isFollowing ? (
                <>
                  <Check className="w-4 h-4" />
                  Volgend
                </>
              ) : (
                <>
                  <UserPlus className="w-4 h-4" />
                  Volgen
                </>
              )}
            </Button>
          )}
        </div>

        {/* Group Affiliations - show max 2 public groups where user is admin */}
        <div className="absolute right-4 top-0">
          <UserGroupAffiliations userId={profile.user_id} />
        </div>

        {/* Follow stats */}
        <div className="flex items-center gap-4 mb-4">
          <div className="flex items-center gap-1">
            <span className="font-semibold">{followerCount}</span>
            <span className="text-muted-foreground text-sm">volgers</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="font-semibold">{followingCount}</span>
            <span className="text-muted-foreground text-sm">volgend</span>
          </div>
        </div>

        {profile.bio && (
          <p className="text-foreground mb-6 whitespace-pre-wrap">
            {profile.bio}
          </p>
        )}

        <div className="flex items-center gap-4 text-sm text-muted-foreground mb-8">
          <div className="flex items-center gap-1">
            <Calendar className="w-4 h-4" />
            <span>
              Lid sinds {format(new Date(profile.created_at), "MMMM yyyy", { locale: nl })}
            </span>
          </div>
        </div>

        {/* Publications */}
        {publications.length > 0 && (
          <div>
            <h2 className="text-lg font-semibold mb-4">Publicaties</h2>
            <div className="space-y-4">
              {publications.map((pub) => (
                <Card key={pub.id}>
                  <CardContent className="p-4">
                    {pub.content && (
                      <p className="text-foreground whitespace-pre-wrap mb-2">
                        <LinkifiedText text={pub.content} />
                      </p>
                    )}
                    {pub.image_url && (
                      <img
                        src={pub.image_url}
                        alt="Publication"
                        className="rounded-xl max-h-64 object-cover mb-2"
                      />
                    )}
                    {pub.file_url && pub.file_name && (
                      <a
                        href={pub.file_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 p-2 rounded-lg bg-muted text-sm hover:bg-muted/80"
                      >
                        <FileText className="w-4 h-4" />
                        {pub.file_name}
                      </a>
                    )}
                    <p className="text-xs text-muted-foreground mt-2">
                      {formatDate(pub.created_at)}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
