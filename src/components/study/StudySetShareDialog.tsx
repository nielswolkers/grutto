import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, X, Share2, Link as LinkIcon, Check } from "lucide-react";
import { toast } from "sonner";
import { UserPicker, PickedUser, rememberUsers } from "@/components/UserPicker";
import { studySetShareUrl } from "@/lib/studySets";

interface Profile { id: string; username: string; display_name: string | null; }
interface Props {
  setId: string;
  setTitle: string;
  open: boolean;
  onClose: () => void;
}

export default function StudySetShareDialog({ setId, setTitle, open, onClose }: Props) {
  const [selected, setSelected] = useState<PickedUser[]>([]);
  const [sharing, setSharing] = useState(false);
  const [copied, setCopied] = useState(false);
  const shareUrl = studySetShareUrl(setId);

  useEffect(() => { if (!open) { setSelected([]); setCopied(false); } }, [open]);

  const handleShare = async () => {
    if (selected.length === 0) return;
    setSharing(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      const uid = session.session?.user.id!;
      const inserts = selected.map((u) => ({
        recipient_id: u.id,
        sender_id: uid,
        type: "studyset_share",
        message: `heeft de studieset "${setTitle}" met je gedeeld: ${shareUrl}`,
      }));
      await supabase.from("notifications").insert(inserts);
      rememberUsers(selected);
      toast.success(`Gedeeld met ${selected.length} gebruiker(s)`);
      onClose();
    } catch (e: any) {
      toast.error("Kon niet delen");
    } finally {
      setSharing(false);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      toast.success("Link gekopieerd");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Kopiëren mislukt");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Studieset Delen</DialogTitle>
          <DialogDescription>Deel "{setTitle}" met andere gebruikers</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <UserPicker selected={selected} onChange={setSelected} />

          <Button onClick={handleCopy} variant="outline" className="w-full gap-2">
            {copied ? <Check className="w-4 h-4" /> : <LinkIcon className="w-4 h-4" />}
            {copied ? "Gekopieerd!" : "Kopieer Link"}
          </Button>

          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} className="flex-1">Annuleren</Button>
            <Button onClick={handleShare} disabled={selected.length === 0 || sharing} className="flex-1">
              <Share2 className="w-4 h-4 mr-2" />
              {sharing ? "Delen..." : `Delen met ${selected.length}`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
