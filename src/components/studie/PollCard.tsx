import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import { Check } from "lucide-react";
import { format } from "date-fns";
import { nl } from "date-fns/locale";

interface Poll {
  id: string;
  question: string;
  created_at: string;
  created_by: string;
  options: PollOption[];
}

interface PollOption {
  id: string;
  option_text: string;
  sort_order: number;
  votes: PollVote[];
}

interface PollVote {
  id: string;
  user_id: string;
  profile?: {
    avatar_url: string | null;
    full_name: string;
  };
}

interface PollCardProps {
  poll: Poll;
  onVote?: () => void;
}

export function PollCard({ poll, onVote }: PollCardProps) {
  const { user } = useAuth();
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [voting, setVoting] = useState(false);
  const [localPoll, setLocalPoll] = useState(poll);

  useEffect(() => {
    // Check if user already voted
    const userVote = poll.options.flatMap(o => o.votes).find(v => v.user_id === user?.id);
    if (userVote) {
      const votedOption = poll.options.find(o => o.votes.some(v => v.id === userVote.id));
      setSelectedOption(votedOption?.id || null);
    }
  }, [poll, user]);

  const totalVotes = localPoll.options.reduce((acc, opt) => acc + opt.votes.length, 0);

  const handleVote = async (optionId: string) => {
    if (!user || voting) return;

    setVoting(true);
    try {
      // If user already voted, update their vote
      const existingVote = localPoll.options.flatMap(o => o.votes).find(v => v.user_id === user.id);
      
      if (existingVote) {
        // Delete old vote and add new one
        await supabase.from("poll_votes").delete().eq("id", existingVote.id);
      }

      // Add new vote
      await supabase.from("poll_votes").insert({
        poll_id: poll.id,
        option_id: optionId,
        user_id: user.id,
      });

      // Update local state optimistically
      setLocalPoll(prev => ({
        ...prev,
        options: prev.options.map(opt => ({
          ...opt,
          votes: opt.id === optionId 
            ? [...opt.votes.filter(v => v.user_id !== user.id), { id: 'temp', user_id: user.id }]
            : opt.votes.filter(v => v.user_id !== user.id)
        }))
      }));

      setSelectedOption(optionId);
      onVote?.();
    } catch (error) {
      console.error("Vote error:", error);
    } finally {
      setVoting(false);
    }
  };

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  return (
    <Card className="bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-200/50 dark:border-emerald-800/30">
      <CardContent className="p-4">
        <h3 className="font-semibold text-lg mb-4">{localPoll.question}</h3>
        
        <div className="space-y-3">
          {localPoll.options
            .sort((a, b) => a.sort_order - b.sort_order)
            .map(option => {
              const voteCount = option.votes.length;
              const percentage = totalVotes > 0 ? Math.round((voteCount / totalVotes) * 100) : 0;
              const isSelected = selectedOption === option.id;
              const maxVotes = Math.max(...localPoll.options.map(o => o.votes.length));
              const isWinning = voteCount === maxVotes && voteCount > 0;

              return (
                <button
                  key={option.id}
                  onClick={() => handleVote(option.id)}
                  disabled={voting}
                  className="w-full text-left"
                >
                  <div className="flex items-center gap-3 mb-1">
                    <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${
                      isSelected 
                        ? 'border-emerald-500 bg-emerald-500 text-white' 
                        : 'border-muted-foreground/30'
                    }`}>
                      {isSelected && <Check className="w-4 h-4" />}
                    </div>
                    <span className="flex-1 font-medium">{option.option_text}</span>
                    
                    {/* Voter avatars */}
                    {voteCount > 0 && (
                      <div className="flex items-center gap-1">
                        <div className="flex -space-x-2">
                          {option.votes.slice(0, 3).map((vote, idx) => (
                            <Avatar key={vote.id || idx} className="w-6 h-6 border-2 border-background">
                              {vote.profile?.avatar_url ? (
                                <AvatarImage src={vote.profile.avatar_url} className="object-cover" />
                              ) : null}
                              <AvatarFallback className="text-[10px] bg-muted">
                                {vote.profile ? getInitials(vote.profile.full_name) : '?'}
                              </AvatarFallback>
                            </Avatar>
                          ))}
                        </div>
                        <span className="text-sm font-medium text-muted-foreground ml-1">
                          {voteCount}
                        </span>
                      </div>
                    )}
                  </div>
                  
                  {/* Progress bar */}
                  <div className="relative h-2 bg-muted/50 rounded-full overflow-hidden ml-9">
                    <div 
                      className={`absolute inset-y-0 left-0 rounded-full transition-all duration-300 ${
                        isWinning ? 'bg-emerald-500' : 'bg-emerald-400/60'
                      }`}
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </button>
              );
            })}
        </div>

        <div className="flex items-center justify-between mt-4 text-sm text-muted-foreground">
          <span>{totalVotes} {totalVotes === 1 ? 'stem' : 'stemmen'}</span>
          <span>{format(new Date(localPoll.created_at), "HH:mm", { locale: nl })}</span>
        </div>
      </CardContent>
    </Card>
  );
}
