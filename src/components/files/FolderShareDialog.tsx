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

interface FolderShareDialogProps {
  folderId: string;
  folderName: string;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface Profile {
  id: string;
  username: string;
  display_name: string | null;
}

export const FolderShareDialog = ({ folderId, folderName, open, onClose, onSuccess }: FolderShareDialogProps) => {
  const [selectedUsers, setSelectedUsers] = useState<PickedUser[]>([]);
  const [isSharing, setIsSharing] = useState(false);

  useEffect(() => { if (!open) setSelectedUsers([]); }, [open]);

  const handleShare = async () => {
    if (selectedUsers.length === 0) return;

    setIsSharing(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      const currentUserId = session.session?.user.id;

      const { data: files, error: filesError } = await supabase
        .from('files')
        .select('id, filename')
        .eq('folder_id', folderId);

      if (filesError) throw filesError;

      const shareInserts: any[] = [];
      const notificationInserts: any[] = [];

      for (const user of selectedUsers) {
        for (const file of files || []) {
          shareInserts.push({
            file_id: file.id,
            shared_with_user_id: user.id,
            shared_by_user_id: currentUserId!,
          });

          notificationInserts.push({
            recipient_id: user.id,
            sender_id: currentUserId!,
            type: 'file_share',
            file_id: file.id,
            message: `heeft "${file.filename}" met je gedeeld (map: ${folderName})`,
          });
        }
      }

      if (shareInserts.length > 0) {
        const { error: shareError } = await supabase
          .from('file_shares')
          .insert(shareInserts);

        if (shareError) throw shareError;
      }

      if (notificationInserts.length > 0) {
        const { error: notifError } = await supabase
          .from('notifications')
          .insert(notificationInserts);

        if (notifError) console.error('Notification error:', notifError);
      }

      rememberUsers(selectedUsers);
      toast.success(`Map gedeeld met ${selectedUsers.length} gebruiker(s)`);
      onSuccess();
      onClose();
    } catch (error) {
      toast.error('Kon map niet delen');
      console.error(error);
    } finally {
      setIsSharing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Map delen</DialogTitle>
          <DialogDescription>
            Deel "{folderName}" met andere gebruikers. Alle bestanden in deze map worden gedeeld.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <UserPicker selected={selectedUsers} onChange={setSelectedUsers} />

          <div className="pt-2 flex justify-end">
            <Button
              onClick={handleShare}
              disabled={isSharing || selectedUsers.length === 0}
            >
              <Share2 className="w-4 h-4 mr-2" />
              {isSharing ? 'Delen...' : 'Delen'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
