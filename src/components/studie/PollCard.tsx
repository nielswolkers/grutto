import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { VerifiedBadge } from "@/components/VerifiedBadge";
import { useVerifiedUsers } from "@/hooks/useVerifiedStatus";
import { PostReactions } from "./PostReactions";
import { Check, ChevronDown, ChevronUp, MoreHorizontal, Trash2, Edit, Pin, PinOff } from "lucide-react";
import { format } from "date-fns";
import { nl } from "date-fns/locale";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface PollCreator {
  user_id: string;
  username: string;
  full_name: string;
  display_name: string | null;
  avatar_url: string | null;
}

interface Poll {
  id: string;
  question: string;
  created_at: string;
  created_by: string;
  group_id: string;
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
    username: string;
  };
}

interface PollCardProps {
  poll: Poll;
  onVote?: () => void;
  isAdmin?: boolean;
  onDelete?: () => void;
}

export function PollCard({ poll, onVote, isAdmin = false, onDelete }: PollCardProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { verifiedUserIds } = useVerifiedUsers();
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [voting, setVoting] = useState(false);
  const [localPoll, setLocalPoll] = useState(poll);
  const [creator, setCreator] = useState<PollCreator | null>(null);
  const [expandedVoters, setExpandedVoters] = useState<string | null>(null);
  
  // Edit/Delete state
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editQuestion, setEditQuestion] = useState(poll.question);
  const [saving, setSaving] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    setLocalPoll(poll);
    // Check if user already voted
    const userVote = poll.options.flatMap(o => o.votes).find(v => v.user_id === user?.id);
    if (userVote) {
      const votedOption = poll.options.find(o => o.votes.some(v => v.id === userVote.id));
      setSelectedOption(votedOption?.id || null);
    } else {
      setSelectedOption(null);
    }
    
    loadCreator();
  }, [poll, user]);

  const loadCreator = async () => {
    const { data } = await supabase
      .from("profiles")
      .select("user_id, username, full_name, display_name, avatar_url")
      .eq("user_id", poll.created_by)
      .single();
    if (data) setCreator(data);
  };

  const totalVotes = localPoll.options.reduce((acc, opt) => acc + opt.votes.length, 0);

  const handleVote = async (optionId: string) => {
    if (!user || voting) return;

    // If clicking the same option, do nothing (no toggle)
    if (selectedOption === optionId) return;

    setVoting(true);
    try {
      // If user already voted, delete their old vote first
      const existingVote = localPoll.options.flatMap(o => o.votes).find(v => v.user_id === user.id);
      
      if (existingVote) {
        await supabase.from("poll_votes").delete().eq("id", existingVote.id);
      }

      // Add new vote
      const { data: newVote } = await supabase.from("poll_votes").insert({
        poll_id: poll.id,
        option_id: optionId,
        user_id: user.id,
      }).select().single();

      // Update local state immediately
      setLocalPoll(prev => ({
        ...prev,
        options: prev.options.map(opt => ({
          ...opt,
          votes: opt.id === optionId 
            ? [...opt.votes.filter(v => v.user_id !== user.id), { id: newVote?.id || 'temp', user_id: user.id }]
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

  const handleEdit = async () => {
    if (!editQuestion.trim()) return;
    setSaving(true);
    try {
      await supabase
        .from("polls")
        .update({ question: editQuestion.trim() })
        .eq("id", poll.id);
      
      setLocalPoll(prev => ({ ...prev, question: editQuestion.trim() }));
      setShowEditDialog(false);
      toast.success("Poll bijgewerkt");
      onVote?.();
    } catch (error) {
      console.error("Edit poll error:", error);
      toast.error("Kon poll niet bewerken");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      // Delete votes first
      await supabase.from("poll_votes").delete().eq("poll_id", poll.id);
      // Delete options
      await supabase.from("poll_options").delete().eq("poll_id", poll.id);
      // Delete poll
      await supabase.from("polls").delete().eq("id", poll.id);
      
      toast.success("Poll verwijderd");
      setShowDeleteDialog(false);
      onDelete?.();
      onVote?.();
    } catch (error) {
      console.error("Delete poll error:", error);
      toast.error("Kon poll niet verwijderen");
    } finally {
      setDeleting(false);
    }
  };

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const displayName = creator?.display_name || creator?.full_name || "Onbekend";
  const isCreatorVerified = creator ? verifiedUserIds.includes(creator.user_id) : false;
  const canManage = isAdmin || poll.created_by === user?.id;

  return (
    <Card className="bg-card border overflow-hidden">
      <CardContent className="p-4">
        {/* Creator header with admin actions */}
        <div className="flex items-start justify-between mb-4">
          <button
            onClick={() => creator?.username && navigate(`/profiel/${creator.username}`)}
            className="flex items-center gap-3 hover:opacity-80 transition-opacity"
          >
            <Avatar className="w-12 h-12 bg-background">
              <AvatarImage src={creator?.avatar_url || undefined} className="object-cover" />
              <AvatarFallback className="bg-muted text-foreground">
                {getInitials(displayName)}
              </AvatarFallback>
            </Avatar>
            <div className="text-left">
              <p className="font-semibold flex items-center">
                {displayName}
                {isCreatorVerified && <VerifiedBadge />}
              </p>
              <p className="text-sm text-muted-foreground">
                @{creator?.username} • {format(new Date(localPoll.created_at), "HH:mm", { locale: nl })}
              </p>
            </div>
          </button>

          {canManage && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="rounded-full h-8 w-8">
                  <MoreHorizontal className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => {
                  setEditQuestion(localPoll.question);
                  setShowEditDialog(true);
                }}>
                  <Edit className="w-4 h-4 mr-2" />
                  Bewerken
                </DropdownMenuItem>
                <DropdownMenuItem 
                  onClick={() => setShowDeleteDialog(true)}
                  className="text-destructive"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Verwijderen
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
        
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
              const isExpanded = expandedVoters === option.id;

              return (
                <div key={option.id}>
                  <button
                    onClick={() => handleVote(option.id)}
                    disabled={voting}
                    className="w-full text-left"
                  >
                    <div className="flex items-center gap-3 mb-1">
                      <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${
                        isSelected 
                          ? 'border-primary bg-primary text-primary-foreground' 
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
                          isWinning ? 'bg-primary' : 'bg-primary/60'
                        }`}
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </button>
                  
                  {/* Admin: show voter list */}
                  {isAdmin && voteCount > 0 && (
                    <button
                      onClick={() => setExpandedVoters(isExpanded ? null : option.id)}
                      className="ml-9 mt-1 text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                    >
                      {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                      {isExpanded ? 'Verberg stemmers' : 'Bekijk stemmers'}
                    </button>
                  )}
                  
                  {isAdmin && isExpanded && (
                    <div className="ml-9 mt-2 space-y-1 bg-muted/30 rounded-lg p-2">
                      {option.votes.map((vote) => (
                        <div key={vote.id} className="flex items-center gap-2 text-sm">
                          <Avatar className="w-5 h-5">
                            <AvatarImage src={vote.profile?.avatar_url || undefined} className="object-cover" />
                            <AvatarFallback className="text-[8px]">
                              {vote.profile ? getInitials(vote.profile.full_name) : '?'}
                            </AvatarFallback>
                          </Avatar>
                          <span className="text-muted-foreground">
                            {vote.profile?.full_name || 'Onbekend'}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
        </div>

        {/* Emoji Reactions */}
        <div className="mt-4 pt-3 border-t">
          <PostReactions messageId={poll.id} />
        </div>

        <div className="flex items-center justify-between mt-3 text-sm text-muted-foreground">
          <span>{totalVotes} {totalVotes === 1 ? 'stem' : 'stemmen'}</span>
        </div>
      </CardContent>

      {/* Edit Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Poll bewerken</DialogTitle>
          </DialogHeader>
          <Input
            value={editQuestion}
            onChange={(e) => setEditQuestion(e.target.value)}
            placeholder="Stel een vraag..."
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>
              Annuleren
            </Button>
            <Button onClick={handleEdit} disabled={saving || !editQuestion.trim()}>
              {saving ? "Opslaan..." : "Opslaan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Poll verwijderen?</AlertDialogTitle>
            <AlertDialogDescription>
              Deze actie kan niet ongedaan worden gemaakt. Alle stemmen worden ook verwijderd.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Verwijderen..." : "Verwijderen"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
