import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ArrowRight, Copy, GraduationCap, Plus, Send, Trash2, Loader2, PanelLeft, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

interface Thread { id: string; title: string; updated_at: string; }
interface ResultItem {
  title: string;
  authors: string[];
  year: number | null;
  venue: string | null;
  cited_by_count: number;
  open_access: boolean;
  link: string;
  reason: string;
  citation: string;
  source?: "scholar" | "news";
  published_date?: string | null;
}
interface AssistantPayload {
  intro?: string;
  results?: ResultItem[];
  comparison?: string;
  followUps?: string[];
}
interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  payload?: AssistantPayload;
}

function stripStars(text: string) {
  return text
    .replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, "$2")
    .replace(/\*+/g, "")
    .replace(/`+/g, "");
}

export default function Scholar() {
  const { user } = useAuth();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
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
      content: typeof m.parts?.text === "string" ? stripStars(m.parts.text) : "",
      payload: m.parts?.payload,
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
      const payload: AssistantPayload = {
        intro: data?.intro,
        results: data?.results || [],
        comparison: data?.comparison,
        followUps: data?.followUps || [],
      };
      const assistant: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: stripStars(payload.intro || ""),
        payload,
      };
      setMessages((p) => [...p, assistant]);
      await supabase.from("scholar_messages").insert({
        thread_id: threadId,
        role: "assistant",
        parts: { text: payload.intro || "", payload, search: data?.search } as any,
      });
      await supabase.from("scholar_threads").update({ updated_at: new Date().toISOString() }).eq("id", threadId);
    } catch (e: any) {
      toast.error(e?.message || "Verzoek mislukt");
      setMessages((p) => [...p, { id: crypto.randomUUID(), role: "assistant", content: "Er ging iets mis. Probeer opnieuw." }]);
    } finally {
      setSending(false);
    }
  }

  const suggestions = useMemo(() => [
    "Recente studies over transformer-interpretatie sinds 2022",
    "Nieuwsartikelen over EU AI Act van de afgelopen maand",
    "Bronnen over CRISPR off-target effecten (studies + nieuws)",
  ], []);

  return (
    <div className="flex h-[calc(100vh-64px)] relative overflow-hidden">
      {/* Floating sidebar toggle */}
      <button
        onClick={() => setSidebarOpen((s) => !s)}
        className="absolute top-3 left-3 z-30 inline-flex items-center justify-center w-10 h-10 rounded-full bg-background border hover:bg-muted transition-colors"
        aria-label="Toon geschiedenis"
      >
        <PanelLeft className="w-5 h-5" />
      </button>

      {/* Slide-over history sidebar — sits below main menu (z-10), not over it */}
      <AnimatePresence>
        {sidebarOpen && (
          <>
            <motion.div
              className="absolute inset-0 bg-black/20 z-10"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setSidebarOpen(false)}
            />
            <motion.aside
              className="absolute top-0 left-0 h-full w-80 bg-background border-r z-10 flex flex-col"
              initial={{ x: -320 }} animate={{ x: 0 }} exit={{ x: -320 }}
              transition={{ type: "spring", damping: 25, stiffness: 220 }}
            >
              <div className="p-4 border-b flex items-center justify-between pl-16">
                <span className="font-bold text-xl">Geschiedenis</span>
                <button onClick={() => setSidebarOpen(false)} className="text-muted-foreground hover:text-foreground">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-3">
                <Button onClick={newThread} className="w-full gap-2 rounded-full" size="sm">
                  <Plus className="w-4 h-4" /> Nieuw gesprek
                </Button>
              </div>
              <div className="flex-1 overflow-y-auto px-2 pb-3 space-y-1">
                {threads.map((t) => (
                  <div key={t.id} className={cn(
                    "group flex items-center gap-1 rounded-lg px-3 py-2 cursor-pointer text-base",
                    activeId === t.id ? "bg-muted" : "hover:bg-muted/50",
                  )} onClick={() => { setActiveId(t.id); setSidebarOpen(false); }}>
                    <span className="flex-1 truncate">{t.title}</span>
                    <button onClick={(e) => { e.stopPropagation(); deleteThread(t.id); }} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                {threads.length === 0 && <p className="text-sm text-muted-foreground px-2 py-3">Nog geen gesprekken.</p>}
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 relative">
        <div ref={scrollRef} className="flex-1 overflow-y-auto">
          <div className="max-w-5xl mx-auto px-6 py-8 pt-16 pb-40 space-y-8">
            {messages.length === 0 ? (
              <div className="text-center py-12">
                <GraduationCap className="w-14 h-14 mx-auto text-muted-foreground mb-4" />
                <h2 className="font-semibold text-2xl">Wat onderzoek je?</h2>
                <p className="text-base text-muted-foreground mb-6 mt-2">Vraag in gewone taal. Ik zoek in OpenAlex met precieze filters — jaar, auteur, venue, open access.</p>
                <div className="flex flex-col gap-2 max-w-lg mx-auto">
                  {suggestions.map((s) => (
                    <button key={s} onClick={() => send(s)} className="rounded-lg border px-4 py-3 text-left text-base text-muted-foreground hover:text-foreground hover:border-foreground/20">
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((m) => m.role === "user" ? (
                <div key={m.id} className="flex justify-end">
                  <div className="max-w-[85%] rounded-lg px-4 py-3 text-base bg-secondary">{m.content}</div>
                </div>
              ) : (
                <AssistantMessage key={m.id} message={m} onFollowUp={send} />
              ))
            )}
            {sending && <div className="flex items-center gap-2 text-base text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Onderzoeken… (synoniemen, meerdere rondes)</div>}
          </div>
        </div>

        {/* Floating composer with blurred backdrop */}
        <div className="absolute bottom-0 left-0 right-0 pointer-events-none">
          <div className="h-32 bg-gradient-to-t from-background/90 via-background/60 to-transparent backdrop-blur-md" />
          <div className="absolute bottom-4 left-0 right-0 px-4 pointer-events-none">
            <div className="max-w-2xl mx-auto pointer-events-auto">
              <div className="flex items-end gap-2 rounded-2xl border bg-background/95 backdrop-blur p-2 shadow-lg">
                <Textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }}
                  placeholder="Vraag Scholar AI naar papers, auteurs, onderwerpen…"
                  className="resize-none border-0 focus-visible:ring-0 min-h-[44px] max-h-40 text-base bg-transparent"
                />
                <Button onClick={() => send(input)} disabled={!input.trim() || sending} size="icon" className="rounded-full shrink-0">
                  <Send className="w-4 h-4" />
                </Button>
              </div>
              <p className="text-center text-xs text-muted-foreground mt-2">Bronnen uit OpenAlex (studies) en nieuwsartikelen via web-search. Verifieer altijd citaties.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function AssistantMessage({ message, onFollowUp }: { message: Message; onFollowUp: (s: string) => void }) {
  const p = message.payload;
  const results = p?.results || [];
  return (
    <div className="space-y-4">
      {(p?.intro || message.content) && (
        <p className="text-base leading-relaxed">{stripStars(p?.intro || message.content)}</p>
      )}

      <div className="space-y-3">
        {results.map((r, i) => (
          <ResultCard key={i} r={r} index={i} />
        ))}
      </div>

      {p?.comparison && (
        <motion.p
          initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: results.length * 0.12 + 0.1 }}
          className="text-base text-muted-foreground leading-relaxed"
        >
          {stripStars(p.comparison)}
        </motion.p>
      )}

      {p?.followUps && p.followUps.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: results.length * 0.12 + 0.2 }}
          className="pt-2"
        >
          <p className="text-base font-medium mb-2">Wil je meer details over:</p>
          <div className="flex flex-wrap gap-2">
            {p.followUps.map((f, i) => (
              <button
                key={i}
                onClick={() => onFollowUp(f)}
                className="rounded-full border bg-background px-4 py-2 text-sm hover:bg-muted hover:border-foreground/30 transition-colors text-left"
              >
                {stripStars(f)}
              </button>
            ))}
          </div>
        </motion.div>
      )}
    </div>
  );
}

function ResultCard({ r, index }: { r: ResultItem; index: number }) {
  const link = (r.link || "").trim();
  const citation = r.citation || `${(r.authors || []).join(", ")} (${r.year ?? "n.d."}). ${r.title}. ${r.venue ?? ""}`.trim();

  const copy = async () => {
    try { await navigator.clipboard.writeText(citation); toast.success("Citatie gekopieerd"); }
    catch { toast.error("Kopiëren mislukt"); }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: index * 0.12, ease: "easeOut" }}
      className="flex gap-3 items-stretch"
    >
      <div className="flex-1 rounded-2xl border bg-card p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-1">
          <span className={cn(
            "text-[10px] uppercase tracking-wide font-semibold px-2 py-0.5 rounded-full",
            r.source === "news" ? "bg-amber-100 text-amber-900" : "bg-indigo-100 text-indigo-900",
          )}>
            {r.source === "news" ? "Nieuws" : "Studie"}
          </span>
          {r.published_date && r.source === "news" && (
            <span className="text-xs text-muted-foreground">{new Date(r.published_date).toLocaleDateString("nl-NL")}</span>
          )}
        </div>
        <h3 className="font-semibold text-lg leading-snug">{stripStars(r.title)}</h3>
        <p className="text-sm text-muted-foreground mt-1">
          {(r.authors || []).slice(0, 4).join(", ")}{r.authors && r.authors.length > 4 ? " e.a." : ""}
          {r.year ? ` · ${r.year}` : ""}
          {r.venue ? ` · ${stripStars(r.venue)}` : ""}
        </p>
        <div className="flex flex-wrap gap-2 mt-2 text-sm text-muted-foreground">
          {r.source !== "news" && <span>{r.cited_by_count.toLocaleString()} citaties</span>}
          {r.open_access && r.source !== "news" && <span className="text-emerald-600">Open Access</span>}
        </div>
        {r.reason && <p className="text-base mt-3 leading-relaxed">{stripStars(r.reason)}</p>}
      </div>
      <div className="flex flex-col gap-2 shrink-0">
        <a
          href={link}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Open link"
          className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-muted text-foreground hover:bg-muted/70 transition-colors"
        >
          <ArrowRight className="w-4 h-4" />
        </a>
        <button
          onClick={copy}
          aria-label="Kopieer citatie"
          className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-muted text-foreground hover:bg-muted/70 transition-colors"
        >
          <Copy className="w-4 h-4" />
        </button>
      </div>
    </motion.div>
  );
}
