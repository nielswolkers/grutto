import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Search, X } from "lucide-react";

export interface PickedUser {
  id: string;
  username: string;
  name: string;
  avatar_url?: string | null;
}

const RECENT_KEY = "grutto_recent_people";

export function getRecentUsers(): PickedUser[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
  } catch {
    return [];
  }
}

/** Call after a successful share/invite so these people show up first next time. */
export function rememberUsers(users: PickedUser[]) {
  const existing = getRecentUsers().filter((u) => !users.some((n) => n.id === u.id));
  localStorage.setItem(RECENT_KEY, JSON.stringify([...users, ...existing].slice(0, 8)));
}

const initials = (n: string) => n.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase();

function UserRow({ u, onClick }: { u: PickedUser; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="w-full px-3 py-2 text-left hover:bg-accent transition-colors flex items-center gap-3">
      <Avatar className="w-8 h-8">
        {u.avatar_url && <AvatarImage src={u.avatar_url} className="object-cover" />}
        <AvatarFallback className="text-xs">{initials(u.name || u.username)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <p className="font-medium truncate">{u.name}</p>
        <p className="text-sm text-muted-foreground truncate">@{u.username}</p>
      </div>
    </button>
  );
}

interface Props {
  selected: PickedUser[];
  onChange: (users: PickedUser[]) => void;
  excludeIds?: string[];
}

export function UserPicker({ selected, onChange, excludeIds = [] }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PickedUser[]>([]);
  const [myId, setMyId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setMyId(data.session?.user.id ?? null));
  }, []);

  const hidden = (id: string) => id === myId || excludeIds.includes(id) || selected.some((s) => s.id === id);

  useEffect(() => {
    if (query.trim().length < 2) { setResults([]); return; }
    const t = setTimeout(async () => {
      const q = query.trim().toLowerCase().replace(/[%,()]/g, "");
      const { data } = await supabase
        .from("profiles")
        .select("user_id, username, display_name, full_name, avatar_url")
        .or(`username.ilike.%${q}%,display_name.ilike.%${q}%,full_name.ilike.%${q}%`)
        .limit(10);
      setResults((data || []).map((p: any) => ({
        id: p.user_id, username: p.username, name: p.display_name || p.full_name || p.username, avatar_url: p.avatar_url,
      })));
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  const add = (u: PickedUser) => { onChange([...selected, u]); setQuery(""); setResults([]); };
  const recents = getRecentUsers().filter((u) => !hidden(u.id)).slice(0, 5);
  const visibleResults = results.filter((u) => !hidden(u.id));

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder="Zoek op naam of gebruikersnaam" value={query} onChange={(e) => setQuery(e.target.value)} className="pl-9" />
      </div>

      {query === "" && recents.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium">Laatst gebruikt:</p>
          <div className="border rounded-lg overflow-hidden">
            {recents.map((u) => <UserRow key={u.id} u={u} onClick={() => add(u)} />)}
          </div>
        </div>
      )}

      {visibleResults.length > 0 && (
        <div className="border rounded-lg max-h-56 overflow-y-auto">
          {visibleResults.map((u) => <UserRow key={u.id} u={u} onClick={() => add(u)} />)}
        </div>
      )}
      {query.trim().length >= 2 && visibleResults.length === 0 && (
        <p className="text-sm text-muted-foreground">Geen gebruikers gevonden</p>
      )}

      {selected.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium">Geselecteerde gebruikers:</p>
          <div className="flex flex-wrap gap-2">
            {selected.map((u) => (
              <Badge key={u.id} variant="secondary" className="pl-3 pr-1 py-1 gap-1">
                <span>{u.name}</span>
                <span className="text-muted-foreground font-normal">@{u.username}</span>
                <Button type="button" variant="ghost" size="icon" className="h-4 w-4 ml-1" onClick={() => onChange(selected.filter((x) => x.id !== u.id))}>
                  <X className="w-3 h-3" />
                </Button>
              </Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
