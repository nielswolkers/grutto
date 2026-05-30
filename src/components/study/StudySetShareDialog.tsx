import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, X, Share2, Link as LinkIcon, Check } from "lucide-react";
import { toast } from "sonner";
import { studySetShareUrl } from "@/lib/studySets";

interface Profile { id: string; username: string; display_name: string | null; }
interface Props {
  setId: string;
  setTitle: string;
  open: boolean;
  onClose: () => void;
}

export default function StudySetShareDialog({ setId, setTitle, open, onClose }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Profile[]>([]);
  const [selected, setSelected] = useState<Profile[]>([]);
  const [recs, setRecs] = useState<Profile[]>([]);
  const [sharing, setSharing] = useState(false);
  const [copied, setCopied] = useState(false);
  const shareUrl = studySetShareUrl(setId);

  useEffect(() => {
    if (!open) { setQuery(""); setResults([]); setSelected([]); setCopied(false); return; }
    (async () => {
      const { data: session } = await supabase.auth.getSession();
      const uid = session.session?.user.id;
      if (!uid) return;
      const { data } = await supabase
        .from("file_shares")
        .select("shared_with_user_id, shared_date")
        .eq("shared_by_user_id", uid)
        .order("shared_date", { ascending: false })
        .limit(20);
      const ids = [...new Set((data || []).map((s: any) => s.shared_with_user_id))].slice(0, 3);
      if (ids.length === 0) return;
      const { data: profs } = await supabase
        .from("profiles")
        .select("user_id, username, display_name, full_name")
        .in("user_id", ids);
      setRecs((profs || []).map((p: any) => ({ id: p.user_id, username: p.username, display_name: p.display_name || p.full_name })));
    })();
  }, [open]);

  useEffect(() => {
    if (query.length < 2) { setResults([]); return; }
    (async () => {
      const { data: session } = await supabase.auth.getSession();
      const uid = session.session?.user.id;
      if (!uid) return;
      const q = query.toLowerCase();
      const { data } = await supabase
        .from("profiles")
        .select("user_id, username, display_name, full_name")
        .neq("user_id", uid)
        .or(`username.ilike.%${q}%,display_name.ilike.%${q}%,full_name.ilike.%${q}%`)
        .limit(10);
      setResults((data || [])
        .filter((p: any) => !selected.some((s) => s.id === p.user_id))
        .map((p: any) => ({ id: p.user_id, username: p.username, display_name: p.display_name || p.full_name })));
    })();
  }, [query]);

  const addUser = (p: Profile) => {
    setSelected((prev) => [...prev, p]);
    setQuery("");
    setResults([]);
    setRecs((prev) => prev.filter((x) => x.id !== p.id));
  };

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
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Zoek op naam of gebruikersnaam" value={query} onChange={(e) => setQuery(e.target.value)} className="pl-9" />
          </div>

          {recs.length > 0 && results.length === 0 && query === "" && (
            <div className="space-y-2">
              <p className="text-sm font-medium">Laatst gedeeld met:</p>
              <div className="border rounded-lg">
                {recs.map((p) => (
                  <button key={p.id} onClick={() => addUser(p)} className="w-full px-4 py-2 text-left hover:bg-accent transition-colors">
                    <p className="font-medium">{p.display_name || p.username}</p>
                    <p className="text-sm text-muted-foreground">@{p.username}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {results.length > 0 && (
            <div className="border rounded-lg max-h-48 overflow-y-auto">
              {results.map((p) => (
                <button key={p.id} onClick={() => addUser(p)} className="w-full px-4 py-2 text-left hover:bg-accent transition-colors">
                  <p className="font-medium">{p.display_name || p.username}</p>
                  <p className="text-sm text-muted-foreground">@{p.username}</p>
                </button>
              ))}
            </div>
          )}

          {selected.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium">Geselecteerde gebruikers:</p>
              <div className="flex flex-wrap gap-2">
                {selected.map((u) => (
                  <Badge key={u.id} variant="secondary" className="pl-3 pr-1">
                    {u.display_name || u.username}
                    <Button variant="ghost" size="icon" className="h-4 w-4 ml-1" onClick={() => setSelected((p) => p.filter((x) => x.id !== u.id))}>
                      <X className="w-3 h-3" />
                    </Button>
                  </Badge>
                ))}
              </div>
            </div>
          )}

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
