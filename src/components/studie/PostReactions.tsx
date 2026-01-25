import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Smile } from "lucide-react";

interface Reaction {
  emoji: string;
  count: number;
  users: string[];
  hasReacted: boolean;
}

interface PostReactionsProps {
  messageId: string;
  compact?: boolean;
}

const EMOJI_OPTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏", "🔥", "👏"];

export function PostReactions({ messageId, compact = false }: PostReactionsProps) {
  const { user } = useAuth();
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [userReactionEmoji, setUserReactionEmoji] = useState<string | null>(null);

  useEffect(() => {
    loadReactions();
  }, [messageId]);

  const loadReactions = async () => {
    try {
      const { data } = await supabase
        .from("post_reactions")
        .select("emoji, user_id")
        .eq("message_id", messageId);

      if (!data) return;

      // Group by emoji
      const emojiMap = new Map<string, { count: number; users: string[] }>();
      let userEmoji: string | null = null;
      
      data.forEach(reaction => {
        const existing = emojiMap.get(reaction.emoji) || { count: 0, users: [] };
        existing.count++;
        existing.users.push(reaction.user_id);
        emojiMap.set(reaction.emoji, existing);
        
        // Track user's existing reaction
        if (reaction.user_id === user?.id) {
          userEmoji = reaction.emoji;
        }
      });

      setUserReactionEmoji(userEmoji);

      const reactionList: Reaction[] = [];
      emojiMap.forEach((value, emoji) => {
        reactionList.push({
          emoji,
          count: value.count,
          users: value.users,
          hasReacted: value.users.includes(user?.id || ''),
        });
      });

      // Sort by count
      reactionList.sort((a, b) => b.count - a.count);
      setReactions(reactionList);
    } catch (error) {
      console.error("Load reactions error:", error);
    }
  };

  const toggleReaction = async (emoji: string) => {
    if (!user || loading) return;

    setLoading(true);
    try {
      const existingReaction = reactions.find(r => r.emoji === emoji && r.hasReacted);
      
      if (existingReaction) {
        // Remove reaction if clicking the same emoji
        await supabase
          .from("post_reactions")
          .delete()
          .eq("message_id", messageId)
          .eq("user_id", user.id)
          .eq("emoji", emoji);
        setUserReactionEmoji(null);
      } else {
        // User already has a different reaction - delete it first (only 1 reaction allowed)
        if (userReactionEmoji) {
          await supabase
            .from("post_reactions")
            .delete()
            .eq("message_id", messageId)
            .eq("user_id", user.id);
        }
        
        // Add new reaction
        await supabase.from("post_reactions").insert({
          message_id: messageId,
          user_id: user.id,
          emoji,
        });
        setUserReactionEmoji(emoji);
      }

      await loadReactions();
    } catch (error) {
      console.error("Toggle reaction error:", error);
    } finally {
      setLoading(false);
    }
  };

  const totalReactions = reactions.reduce((acc, r) => acc + r.count, 0);

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {/* Show existing reactions */}
      {reactions.slice(0, 5).map((reaction) => (
        <button
          key={reaction.emoji}
          onClick={() => toggleReaction(reaction.emoji)}
          disabled={loading}
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-sm transition-colors ${
            reaction.hasReacted
              ? 'bg-primary/10 border border-primary/30'
              : 'bg-muted hover:bg-muted/80'
          }`}
        >
          <span>{reaction.emoji}</span>
          <span className="text-xs font-medium">{reaction.count}</span>
        </button>
      ))}

      {/* Emoji picker */}
      <Popover>
        <PopoverTrigger asChild>
          <Button 
            variant="ghost" 
            size="sm"
            className={`rounded-full ${compact ? 'h-7 w-7 p-0' : 'h-8 px-2'}`}
          >
            <Smile className="w-4 h-4" />
            {!compact && totalReactions === 0 && (
              <span className="ml-1 text-xs">Reageer</span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-2" align="start">
          <div className="flex gap-1">
            {EMOJI_OPTIONS.map((emoji) => {
              const existing = reactions.find(r => r.emoji === emoji);
              const isSelected = userReactionEmoji === emoji;
              return (
                <button
                  key={emoji}
                  onClick={() => toggleReaction(emoji)}
                  disabled={loading}
                  className={`w-8 h-8 rounded flex items-center justify-center text-lg transition-colors ${
                    isSelected
                      ? 'bg-primary/10 ring-2 ring-primary/30'
                      : 'hover:bg-muted'
                  }`}
                >
                  {emoji}
                </button>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
