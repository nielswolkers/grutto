import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, GraduationCap, Plus, Send, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Thread { id: string; title: string; updated_at: string; }
interface Message { id: string; role: "user" | "assistant"; content: string; }

function renderMarkdownLite(text: string) {
  // Bold **x**, links http(s)://, line breaks.
  const escaped = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const withBold = escaped.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  const withLinks = withBold.replace(/(https?:\/\/[^\s<]+)/g, '<a class="underline text-primary" target="_blank" rel="noopener" href="$1">$1</a>');
  return withLinks.replace(/\n/g, "<br/>");
}

export default function Scholar() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => { if (user) loadThreads(); }, [user]);
  useEffect(() => { if (activeId) loadMessages(activeId); else setMessages([]); }, [activeId]);
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }); }, [messages, sending]);

  async function loadThreads() {
    const { data } = await supabase
      .from("scholar_threads").select("id, title, updated_at")
      .order("updated_at", { ascending: false });
    setThreads(data || []);
  }

  async function loadMessages(threadId: string) {
    const { data } = await supabase
      .from("scholar_messages").select("id, role, parts")
      .eq("thread_id", threadId).order("created_at");
    setMessages((data || []).map((m: any) => ({
      id: m.id,
      role: m.role,
      content: (m.parts?.text as string) || "",
    })));
  }

  async function newThread(): Promise<string | null> {
    if (!user) return null;
    const { data, error } = await supabase
      .from("scholar_threads").insert({ user_id: user.id, title: "Nieuw gesprek" }).select().single();
    if (error) { toast.error("Kon gesprek niet aanmaken"); return null; }
    setThreads((prev) => [data as Thread, ...prev]);
    setActiveId(data.id);
    setMessages([]);
    return data.id;
  }

  async function deleteThread(id: string) {
    await supabase.from("scholar_threads").delete().eq("id", id);
    setThreads((p) => p.filter((t) => t.id !== id));
    if (activeId === id) { setActiveId(null); setMessages([]); }
  }

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    let threadId = activeId;
    if (!threadId) threadId = await newThread();
    if (!threadId) return;

    setSending(true);
    setInput("");
    const userMsg: Message = { id: crypto.randomUUID(), role: "user", content: trimmed };
    setMessages((p) => [...p, userMsg]);
    await supabase.from("scholar_messages").insert({ thread_id: threadId, role: "user", parts: { text: trimmed } });

    // Title from first user message
    if (messages.length === 0) {
      const title = trimmed.slice(0, 60);
      await supabase.from("scholar_threads").update({ title }).eq("id", threadId);
      setThreads((p) => p.map((t) => (t.id === threadId ? { ...t, title } : t)));
    }

    try {
      const history = [...messages, userMsg].map((m) => ({ role: m.role, content: m.content }));
      const { data, error } = await supabase.functions.invoke("scholar-chat", {
        body: { messages: history },
      });
      if (error) throw error;
      const reply = (data?.text || "").trim() || "(geen antwoord)";
      const assistant: Message = { id: crypto.randomUUID(), role: "assistant", content: reply };
      setMessages((p) => [...p, assistant]);
      await supabase.from("scholar_messages").insert({ thread_id: threadId, role: "assistant", parts: { text: reply, search: data?.search } });
      await supabase.from("scholar_threads").update({ updated_at: new Date().toISOString() }).eq("id", threadId);
    } catch (e: any) {
      toast.error(e?.message || "Verzoek mislukt");
      setMessages((p) => [...p, { id: crypto.randomUUID(), role: "assistant", content: "Er ging iets mis. Probeer opnieuw." }]);
    } finally {
      setSending(false);
    }
  }

  const suggestions = useMemo(() => [
    "Recente reviews over transformer-interpretatie sinds 2022",
    "Meest geciteerde papers over CRISPR off-target effecten",
    "Open-access studies over LLM hallucinations vanaf 2023",
  ], []);

  return (
    <div className="flex h-[calc(100vh-64px)]">
      {/* Sidebar */}
      <aside className="w-64 border-r flex flex-col">
        <div className="p-3 border-b flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => navigate("/apps")}><ArrowLeft className="w-4 h-4" /></Button>
          <span className="font-semibold text-sm">Scholar</span>
        </div>
        <div className="p-3">
          <Button onClick={newThread} className="w-full gap-2 rounded-full" size="sm">
            <Plus className="w-4 h-4" /> Nieuw gesprek
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto px-2 pb-3 space-y-1">
          {threads.map((t) => (
            <div key={t.id} className={cn(
              "group flex items-center gap-1 rounded-lg px-2 py-1.5 cursor-pointer text-sm",
              activeId === t.id ? "bg-muted" : "hover:bg-muted/50",
            )} onClick={() => setActiveId(t.id)}>
              <span className="flex-1 truncate">{t.title}</span>
              <button onClick={(e) => { e.stopPropagation(); deleteThread(t.id); }} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
          {threads.length === 0 && <p className="text-xs text-muted-foreground px-2 py-3">Nog geen gesprekken.</p>}
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col">
        <div ref={scrollRef} className="flex-1 overflow-y-auto">
          <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">
            {messages.length === 0 ? (
              <div className="text-center py-12">
                <GraduationCap className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                <h2 className="font-semibold text-lg">Wat onderzoek je?</h2>
                <p className="text-sm text-muted-foreground mb-6">Vraag in gewone taal. Ik zoek in OpenAlex met precieze filters — jaar, auteur, venue, open access.</p>
                <div className="flex flex-col gap-2 max-w-md mx-auto">
                  {suggestions.map((s) => (
                    <button key={s} onClick={() => send(s)} className="rounded-md border px-3 py-2 text-left text-sm text-muted-foreground hover:text-foreground hover:border-foreground/20">
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((m) => (
                <div key={m.id} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
                  <div className={cn(
                    "max-w-[85%] rounded-lg px-4 py-3 text-sm",
                    m.role === "user" ? "bg-secondary" : "bg-transparent",
                  )} dangerouslySetInnerHTML={{ __html: renderMarkdownLite(m.content) }} />
                </div>
              ))
            )}
            {sending && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Zoeken in OpenAlex…</div>}
          </div>
        </div>

        <div className="border-t bg-background">
          <div className="max-w-3xl mx-auto p-4">
            <div className="flex items-end gap-2 rounded-2xl border bg-background p-2">
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }}
                placeholder="Vraag Scholar AI naar papers, auteurs, onderwerpen…"
                className="resize-none border-0 focus-visible:ring-0 min-h-[44px] max-h-40"
              />
              <Button onClick={() => send(input)} disabled={!input.trim() || sending} size="icon" className="rounded-full shrink-0">
                <Send className="w-4 h-4" />
              </Button>
            </div>
            <p className="text-center text-xs text-muted-foreground mt-2">Resultaten van OpenAlex. Verifieer altijd citaties.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
