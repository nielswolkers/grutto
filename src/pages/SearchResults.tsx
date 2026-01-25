import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { LinkifiedText } from "@/components/LinkifiedText";
import { VerifiedBadge } from "@/components/VerifiedBadge";
import { useVerifiedUsers, useVerifiedGroups } from "@/hooks/useVerifiedStatus";
import { ChevronLeft, User, Users, FileText, Hash } from "lucide-react";
import { format } from "date-fns";
import { nl } from "date-fns/locale";

interface Profile {
  user_id: string;
  username: string;
  full_name: string;
  display_name: string | null;
  avatar_url: string | null;
}

interface StudyGroup {
  id: string;
  name: string;
  avatar_url: string | null;
  owner_id: string;
  is_public?: boolean;
}

interface Publication {
  id: string;
  user_id: string;
  content: string | null;
  image_url: string | null;
  file_url: string | null;
  file_name: string | null;
  created_at: string;
  profile?: Profile;
}

export default function SearchResults() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const query = searchParams.get("q") || "";
  const { user } = useAuth();
  const { verifiedUserIds } = useVerifiedUsers();
  const { verifiedGroupIds } = useVerifiedGroups();

  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [groups, setGroups] = useState<StudyGroup[]>([]);
  const [publications, setPublications] = useState<Publication[]>([]);
  const [loading, setLoading] = useState(true);
  const [myGroupIds, setMyGroupIds] = useState<Set<string>>(new Set());

  // Check if query is a hashtag
  const isHashtag = query.startsWith("#");
  const hashtagQuery = isHashtag ? query.slice(1) : query;

  useEffect(() => {
    if (query.length >= 2) {
      search();
      loadMyGroups();
    }
  }, [query]);

  const loadMyGroups = async () => {
    if (!user) return;
    
    const { data: ownedGroups } = await supabase
      .from("study_groups")
      .select("id")
      .eq("owner_id", user.id);

    const { data: memberGroups } = await supabase
      .from("group_members")
      .select("group_id")
      .eq("user_id", user.id)
      .eq("status", "accepted");

    const ids = new Set<string>();
    ownedGroups?.forEach(g => ids.add(g.id));
    memberGroups?.forEach(m => ids.add(m.group_id));
    setMyGroupIds(ids);
  };

  const search = async () => {
    setLoading(true);
    try {
      // If it's a hashtag search, only search publications
      if (isHashtag) {
        const { data: pubs } = await supabase
          .from("publications")
          .select("*")
          .ilike("content", `%#${hashtagQuery}%`)
          .order("created_at", { ascending: false })
          .limit(50);

        if (pubs && pubs.length > 0) {
          const userIds = [...new Set(pubs.map(p => p.user_id))];
          const { data: pubProfiles } = await supabase
            .from("profiles")
            .select("user_id, username, full_name, display_name, avatar_url")
            .in("user_id", userIds);

          setPublications(pubs.map(pub => ({
            ...pub,
            profile: pubProfiles?.find(p => p.user_id === pub.user_id)
          })));
        } else {
          setPublications([]);
        }

        setProfiles([]);
        setGroups([]);
      } else {
        // Full search
        // Search profiles
        const { data: profilesData } = await supabase
          .from("profiles")
          .select("user_id, username, full_name, display_name, avatar_url")
          .or(`username.ilike.%${query}%,full_name.ilike.%${query}%`)
          .limit(3);

        setProfiles(profilesData || []);

        // Search public study groups
        const { data: groupsData } = await supabase
          .from("study_groups")
          .select("id, name, avatar_url, owner_id, is_public")
          .ilike("name", `%${query}%`)
          .eq("is_public", true)
          .limit(3);

        setGroups(groupsData || []);

        // Search publications
        const { data: pubs } = await supabase
          .from("publications")
          .select("*")
          .ilike("content", `%${query}%`)
          .order("created_at", { ascending: false })
          .limit(50);

        if (pubs && pubs.length > 0) {
          const userIds = [...new Set(pubs.map(p => p.user_id))];
          const { data: pubProfiles } = await supabase
            .from("profiles")
            .select("user_id, username, full_name, display_name, avatar_url")
            .in("user_id", userIds);

          setPublications(pubs.map(pub => ({
            ...pub,
            profile: pubProfiles?.find(p => p.user_id === pub.user_id)
          })));
        } else {
          setPublications([]);
        }
      }
    } catch (error) {
      console.error("Search error:", error);
    } finally {
      setLoading(false);
    }
  };

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Zojuist";
    if (diffMins < 60) return `${diffMins}m`;
    if (diffHours < 24) return `${diffHours}u`;
    if (diffDays < 7) return `${diffDays}d`;
    return format(date, "d MMM", { locale: nl });
  };

  if (loading) {
    return (
      <div className="w-full max-w-2xl mx-auto">
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="rounded-full">
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-2xl font-bold">Zoekresultaten</h1>
        </div>
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      </div>
    );
  }

  const hasNoResults = profiles.length === 0 && groups.length === 0 && publications.length === 0;

  return (
    <div className="w-full">
      <div className="flex items-center gap-4 mb-6">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="rounded-full">
          <ChevronLeft className="w-5 h-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">
            {isHashtag ? (
              <span className="flex items-center gap-2">
                <Hash className="w-6 h-6" />
                {hashtagQuery}
              </span>
            ) : (
              `Resultaten voor "${query}"`
            )}
          </h1>
          <p className="text-sm text-muted-foreground">
            {profiles.length + groups.length + publications.length} resultaten
          </p>
        </div>
      </div>

      {hasNoResults ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground">Geen resultaten gevonden voor "{query}"</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Accounts Section */}
          {profiles.length > 0 && (
            <div>
              <h2 className="text-sm font-medium text-muted-foreground mb-3">
                Accounts
              </h2>
              <div className="space-y-2">
                {profiles.map((p) => (
                  <Card 
                    key={p.user_id} 
                    className="cursor-pointer hover:shadow-md transition-shadow"
                    onClick={() => navigate(`/profiel/${p.username}`)}
                  >
                    <CardContent className="p-4 flex items-center gap-3">
                      <Avatar className="w-12 h-12">
                        {p.avatar_url && <AvatarImage src={p.avatar_url} className="object-cover" />}
                        <AvatarFallback>{getInitials(p.display_name || p.full_name)}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <p className="font-medium flex items-center">
                          {p.display_name || p.full_name}
                          {verifiedUserIds.includes(p.user_id) && <VerifiedBadge />}
                        </p>
                        <p className="text-sm text-muted-foreground">@{p.username}</p>
                      </div>
                      <Button size="sm" variant="outline" className="rounded-full">
                        Bekijk
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* Communities Section */}
          {groups.length > 0 && (
            <div>
              <h2 className="text-sm font-medium text-muted-foreground mb-3">
                Communities
              </h2>
              <div className="space-y-2">
                {groups.map((g) => {
                  const isMember = myGroupIds.has(g.id);
                  const isOwner = g.owner_id === user?.id;
                  
                  return (
                    <Card 
                      key={g.id} 
                      className="cursor-pointer hover:shadow-md transition-shadow"
                      onClick={() => {
                        if (isMember || isOwner) {
                          navigate("/communities");
                        } else {
                          navigate(`/groep/${g.id}`);
                        }
                      }}
                    >
                      <CardContent className="p-4 flex items-center gap-3">
                        <Avatar className="w-12 h-12 bg-background">
                          {g.avatar_url && <AvatarImage src={g.avatar_url} className="object-cover" />}
                          <AvatarFallback className="bg-background text-primary">
                            <Users className="w-6 h-6" />
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1">
                          <p className="font-medium flex items-center">
                            {g.name}
                            {verifiedGroupIds.includes(g.id) && <VerifiedBadge />}
                          </p>
                          <p className="text-sm text-muted-foreground">Community</p>
                        </div>
                        <Button size="sm" variant="outline" className="rounded-full">
                          Bekijk
                        </Button>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          )}

          {/* Publications Section */}
          {publications.length > 0 && (
            <div>
              <h2 className="text-sm font-medium text-muted-foreground mb-3">
                Publicaties
              </h2>
              <div className="space-y-4">
                {publications.map((pub) => (
                  <Card key={pub.id}>
                    <CardContent className="p-4">
                      <div 
                        className="flex items-center gap-3 mb-3 cursor-pointer"
                        onClick={() => pub.profile?.username && navigate(`/profiel/${pub.profile.username}`)}
                      >
                        <Avatar className="w-10 h-10">
                          {pub.profile?.avatar_url && <AvatarImage src={pub.profile.avatar_url} className="object-cover" />}
                          <AvatarFallback>
                            {getInitials(pub.profile?.display_name || pub.profile?.full_name || "?")}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-medium flex items-center">
                            {pub.profile?.display_name || pub.profile?.full_name}
                            {pub.profile && verifiedUserIds.includes(pub.profile.user_id) && <VerifiedBadge />}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            @{pub.profile?.username} • {formatDate(pub.created_at)}
                          </p>
                        </div>
                      </div>

                      {pub.content && (
                        <p className="text-foreground whitespace-pre-wrap mb-3">
                          <LinkifiedText text={pub.content} />
                        </p>
                      )}

                      {pub.image_url && (
                        <img
                          src={pub.image_url}
                          alt="Publication"
                          className="rounded-xl max-h-96 object-cover w-full"
                        />
                      )}

                      {pub.file_url && pub.file_name && (
                        <a
                          href={pub.file_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 p-3 rounded-xl bg-muted hover:bg-muted/80 transition-colors"
                        >
                          <FileText className="w-5 h-5 text-primary" />
                          <span className="text-sm font-medium truncate">{pub.file_name}</span>
                        </a>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
