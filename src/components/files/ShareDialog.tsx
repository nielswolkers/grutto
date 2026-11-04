import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, X, Share2 } from "lucide-react";
import { toast } from "sonner";
import { UserPicker, PickedUser, rememberUsers } from "@/components/UserPicker";

interface ShareDialogProps {
  file: {
    id: string;
    filename: string;
  };
  open: boolean;
  onClose: () => void;
}

interface Profile {
  id: string;
  username: string;
  display_name: string | null;
}

export const ShareDialog = ({ file, open, onClose }: ShareDialogProps) => {
  const [selectedUsers, setSelectedUsers] = useState<PickedUser[]>([]);
  const [currentShares, setCurrentShares] = useState<string[]>([]);
  const [isSharing, setIsSharing] = useState(false);

  useEffect(() => {
    if (open) {
      setSelectedUsers([]);
      supabase.from('file_shares').select('shared_with_user_id').eq('file_id', file.id)
        .then(({ data }) => setCurrentShares((data || []).map(s => s.shared_with_user_id)));
    }
  }, [open, file.id]);

  const handleShare = async () => {
    if (selectedUsers.length === 0) return;

    setIsSharing(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      const currentUserId = session.session?.user.id;

      const shareInserts = selectedUsers.map(user => ({
        file_id: file.id,
        shared_with_user_id: user.id,
        shared_by_user_id: currentUserId!,
      }));

      const { error: shareError } = await supabase
        .from('file_shares')
        .insert(shareInserts);

      if (shareError) throw shareError;

      const notificationInserts = selectedUsers.map(user => ({
        recipient_id: user.id,
        sender_id: currentUserId!,
        type: 'file_share',
        file_id: file.id,
        message: `heeft "${file.filename}" met je gedeeld`,
      }));

      const { error: notifError } = await supabase
        .from('notifications')
        .insert(notificationInserts);

      if (notifError) console.error("Notification error:", notifError);

      rememberUsers(selectedUsers);
      toast.success(`Bestand gedeeld met ${selectedUsers.length} gebruiker(s)`);
      onClose();
    } catch (error: any) {
      toast.error("Kon bestand niet delen");
      console.error(error);
    } finally {
      setIsSharing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Bestand Delen</DialogTitle>
          <DialogDescription>
            Deel "{file.filename}" met andere gebruikers
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <UserPicker selected={selectedUsers} onChange={setSelectedUsers} excludeIds={currentShares} />

          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} className="flex-1">
              Annuleren
            </Button>
            <Button
              onClick={handleShare}
              disabled={selectedUsers.length === 0 || isSharing}
              className="flex-1"
            >
              <Share2 className="w-4 h-4 mr-2" />
              {isSharing ? "Delen..." : `Delen met ${selectedUsers.length}`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
