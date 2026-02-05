import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { VerifiedBadge } from "@/components/VerifiedBadge";
import { Users, MapPin } from "lucide-react";
import { useNavigate } from "react-router-dom";

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

      {/* Content section with light background notch overlapping the banner */}
      <div className="relative px-4 pb-4">
        {/* Light background notch that overlaps the banner */}
        <div 
          className="absolute left-0 right-0 bg-card rounded-t-2xl"
          style={{ top: '-1rem', height: '2.5rem' }}
        />
        
        {/* Avatar and title row - positioned on top of the notch */}
        <div className="relative flex items-center gap-3" style={{ marginTop: '-1.75rem' }}>
          <Avatar className="w-14 h-14 border-2 border-background shadow-lg bg-background flex-shrink-0">
            {avatar_url ? (
              <AvatarImage src={avatar_url} className="object-cover" />
            ) : null}
            <AvatarFallback className="bg-background text-primary">
              <Users className="w-6 h-6" />
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0 pt-1">
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
            className="rounded-full text-xs px-4 bg-foreground text-background hover:bg-foreground/90"
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
