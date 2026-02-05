import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { VerifiedBadge } from "@/components/VerifiedBadge";
import { Users, MapPin } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { extractDominantColor } from "@/utils/colorExtractor";
import { useEffect, useState } from "react";

interface CommunityCardProps {
  id: string;
  name: string;
  avatar_url: string | null;
  banner_url: string | null;
  bio: string | null;
  member_count: number;
  isVerified: boolean;
  isAdmin: boolean;
}

export function CommunityCard({ 
  id, 
  name, 
  avatar_url, 
  banner_url,
  bio,
  member_count, 
  isVerified,
  isAdmin
}: CommunityCardProps) {
  const navigate = useNavigate();
  const [buttonColor, setButtonColor] = useState('hsl(var(--foreground))');

  useEffect(() => {
    const loadColor = async () => {
      if (avatar_url) {
        try {
          const color = await extractDominantColor(avatar_url);
          setButtonColor(color);
        } catch {
          // Keep default
        }
      }
    };
    loadColor();
  }, [avatar_url]);

  return (
    <div 
      className="rounded-2xl overflow-hidden bg-card border shadow-sm hover:shadow-md transition-shadow cursor-pointer"
      onClick={() => navigate(`/community/${id}`)}
    >
      {/* Banner */}
      <div className="h-24 bg-gradient-to-br from-primary/20 to-primary/5 relative overflow-hidden">
        {banner_url && (
          <img
            src={banner_url}
            alt=""
            className="w-full h-full object-cover"
          />
        )}
      </div>

      {/* Content */}
      <div className="px-4 pb-4">
        {/* Avatar overlapping banner */}
        <div className="flex items-end gap-3" style={{ marginTop: '-1.5rem' }}>
          <Avatar className="w-12 h-12 border-2 border-background shadow-lg bg-background">
            {avatar_url ? (
              <AvatarImage src={avatar_url} className="object-cover" />
            ) : null}
            <AvatarFallback className="bg-background text-primary">
              <Users className="w-5 h-5" />
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0 pb-0.5">
            <div className="flex items-center gap-1.5">
              <h3 className="font-semibold text-foreground truncate">{name}</h3>
              {isVerified && <VerifiedBadge />}
            </div>
            <p className="text-xs text-muted-foreground">Community</p>
          </div>
        </div>

        {/* Location & member count */}
        <div className="mt-3 flex items-center justify-between">
          <div className="text-xs text-muted-foreground space-y-0.5">
            {bio && (
              <div className="flex items-center gap-1">
                <MapPin className="w-3 h-3" />
                <span className="truncate max-w-[120px]">{bio.split('\n')[0]}</span>
              </div>
            )}
            <div>
              Community · {member_count} Leden
            </div>
          </div>
          <Button
            size="sm"
            className="rounded-full text-xs px-4 text-white"
            style={{ backgroundColor: buttonColor }}
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/community/${id}`);
            }}
          >
            Posts
          </Button>
        </div>
      </div>
    </div>
  );
}
