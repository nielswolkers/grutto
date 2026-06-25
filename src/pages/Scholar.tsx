import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ArrowRight, Copy, GraduationCap, Plus, Send, Trash2, Loader2, PanelLeft, X, Star, Paperclip, Image as ImageIcon, FileText, Upload, BookOpen } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

// ============ Attachments (#15, #16) ============
const IMAGE_MIMES = ["image/jpeg","image/jpg","image/png","image/webp","image/gif"];
const TEXT_MIMES = ["text/plain","text/markdown","text/csv","application/csv"];
const DOC_MIMES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // docx
  "application/vnd.openxmlformats-officedocument.presentationml.presentation", // pptx
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // xlsx
];
const TEXT_EXT = ["txt","md","csv"];
const DOC_EXT = ["pdf","docx","pptx","xlsx"];
const IMG_EXT = ["jpg","jpeg","png","webp","gif"];
const MAX_FILE_MB = 20;

interface Attachment {
  id: string;
  kind: "image" | "file";
  name: string;
  mime: string;
  size: number;
  dataUrl?: string;
  text?: string;
}

function extOf(name: string) { return (name.split(".").pop() || "").toLowerCase(); }
function isAccepted(file: File) {
  const ext = extOf(file.name);
  if (IMAGE_MIMES.includes(file.type) || IMG_EXT.includes(ext)) return "image" as const;
  if (DOC_MIMES.includes(file.type) || DOC_EXT.includes(ext) || TEXT_MIMES.includes(file.type) || TEXT_EXT.includes(ext)) return "file" as const;
  return null;
}
function fileToDataUrl(f: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(f);
  });
}
function fileToText(f: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsText(f);
  });
}
async function buildAttachment(file: File): Promise<Attachment | null> {
  const kind = isAccepted(file);
  if (!kind) { toast.error(`Niet ondersteund: ${file.name}`); return null; }
  if (file.size > MAX_FILE_MB * 1024 * 1024) { toast.error(`${file.name} is te groot (max ${MAX_FILE_MB}MB)`); return null; }
  const ext = extOf(file.name);
  const dataUrl = await fileToDataUrl(file);
  const att: Attachment = { id: crypto.randomUUID(), kind, name: file.name, mime: file.type || "", size: file.size, dataUrl };
  if (TEXT_MIMES.includes(file.type) || TEXT_EXT.includes(ext)) {
    try { att.text = await fileToText(file); } catch { /* noop */ }
  }
  return att;
}

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
  updated_date?: string | null;
  favicon?: string | null;
  access?: "open" | "paywall" | "unknown";
  kind?: "press_release" | "blog" | null;
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
interface StarredRow {
  id: string;
  title: string;
  link: string;
  venue: string | null;
  favicon: string | null;
  source: string;
}

function stripStars(text: string) {
  return text
    .replace(/^\s*json\s*/i, "")
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "")
    .replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, "$2")
    .replace(/[\*`_]+/g, "")
    .trim();
}

function safePayloadFromContent(content: string, payload?: AssistantPayload): AssistantPayload | undefined {
  if (payload?.results?.length) return payload;
  const cleaned = stripStars(content || "");
  if (!cleaned.includes('"results"')) return payload;
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) return payload;
  try {
    const parsed = JSON.parse(cleaned.slice(start, end + 1));
    return {
      intro: stripStars(parsed.intro || ""),
      results: Array.isArray(parsed.results) ? parsed.results : [],
      comparison: stripStars(parsed.comparison || ""),
      followUps: Array.isArray(parsed.followUps) ? parsed.followUps.map(stripStars) : [],
    };
  } catch {
    return payload;
  }
}

function formatDateNl(iso?: string | null) {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" });
}

export default function Scholar() {
  const { user } = useAuth();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [starred, setStarred] = useState<StarredRow[]>([]);
  const starredLinks = useMemo(() => new Set(starred.map((s) => s.link)), [starred]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => { if (user) { loadThreads(); loadStarred(); } }, [user]);
  useEffect(() => { if (activeId) loadMessages(activeId); else setMessages([]); }, [activeId]);
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }); }, [messages, sending]);

  async function loadThreads() {
    const { data } = await supabase
      .from("scholar_threads").select("id, title, updated_at")
      .order("updated_at", { ascending: false });
    setThreads(data || []);
  }

  async function loadStarred() {
    const { data } = await supabase
      .from("starred_sources").select("id, title, link, venue, favicon, source")
      .order("created_at", { ascending: false });
    setStarred((data as StarredRow[]) || []);
  }

  const toggleStar = useCallback(async (r: ResultItem) => {
    if (!user) { toast.error("Log in om bronnen te bewaren"); return; }
    if (starredLinks.has(r.link)) {
      const row = starred.find((s) => s.link === r.link);
      if (!row) return;
      await supabase.from("starred_sources").delete().eq("id", row.id);
      setStarred((p) => p.filter((s) => s.id !== row.id));
      toast.success("Verwijderd uit Starred Sources");
    } else {
      const { data, error } = await supabase.from("starred_sources").insert({
        user_id: user.id,
        title: r.title,
        link: r.link,
        venue: r.venue,
        authors: r.authors,
        published_date: r.published_date ?? null,
        source: r.source ?? "scholar",
        citation: r.citation,
        favicon: r.favicon ?? null,
      }).select("id, title, link, venue, favicon, source").single();
      if (error) { toast.error("Kon bron niet bewaren"); return; }
      setStarred((p) => [data as StarredRow, ...p]);
      toast.success("Toegevoegd aan Starred Sources");
    }
  }, [user, starred, starredLinks]);

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

  async function loadMessages(threadId: string) {
    const { data } = await supabase
      .from("scholar_messages").select("id, role, parts")
      .eq("thread_id", threadId).order("created_at");
    setMessages((data || []).map((m: any) => ({
      id: m.id,
      role: m.role,
      content: typeof m.parts?.text === "string" ? stripStars(m.parts.text) : "",
      payload: safePayloadFromContent(typeof m.parts?.text === "string" ? m.parts.text : "", m.parts?.payload),
    })));
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
        intro: stripStars(data?.intro || ""),
        results: data?.results || [],
        comparison: stripStars(data?.comparison || ""),
        followUps: (data?.followUps || []).map(stripStars),
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

      {/* Slide-over history sidebar — flush against main menu, no spring overshoot */}
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
              initial={{ x: "-100%" }} animate={{ x: 0 }} exit={{ x: "-100%" }}
              transition={{ type: "tween", duration: 0.26, ease: [0.22, 0.61, 0.36, 1] }}
            >
              <div className="p-4 border-b flex items-center justify-between pl-16">
                <span className="font-bold text-2xl">Geschiedenis</span>
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

              {/* Starred Sources section */}
              <div className="border-t">
                <div className="px-4 pt-3 pb-2 flex items-center gap-2">
                  <Star className="w-4 h-4 text-amber-500 fill-amber-400" />
                  <span className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">Starred Sources</span>
                </div>
                <div className="max-h-64 overflow-y-auto px-2 pb-3 space-y-1">
                  {starred.length === 0 && (
                    <p className="text-sm text-muted-foreground px-2 py-2">Klik op de ster bij een bron om hem te bewaren.</p>
                  )}
                  {starred.map((s) => (
                    <a key={s.id} href={s.link} target="_blank" rel="noopener noreferrer"
                       className="group flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-muted/60">
                      {s.favicon
                        ? <img src={s.favicon} alt="" className="w-5 h-5 rounded-full border bg-white object-contain shrink-0" />
                        : <div className="w-5 h-5 rounded-full bg-muted shrink-0" />}
                      <div className="min-w-0 flex-1">
                        <div className="text-sm truncate">{s.title}</div>
                        {s.venue && <div className="text-xs text-muted-foreground truncate">{s.venue}</div>}
                      </div>
                      <button
                        onClick={async (e) => {
                          e.preventDefault();
                          await supabase.from("starred_sources").delete().eq("id", s.id);
                          setStarred((p) => p.filter((x) => x.id !== s.id));
                        }}
                        className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive shrink-0"
                        aria-label="Verwijder uit favorieten"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </a>
                  ))}
                </div>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 relative">
        <div ref={scrollRef} className="flex-1 overflow-y-auto">
          <div className="max-w-5xl mx-auto px-6 py-8 pt-16 pb-32 space-y-8">
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
                <AssistantMessage
                  key={m.id}
                  message={m}
                  onFollowUp={send}
                  starredLinks={starredLinks}
                  onToggleStar={toggleStar}
                />
              ))
            )}
            {sending && <div className="flex items-center gap-2 text-base text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Onderzoeken… (synoniemen, meerdere rondes)</div>}
          </div>
        </div>

        {/* Floating composer — no chin border, just a transparent floating bar */}
        <div className="absolute bottom-4 left-0 right-0 px-4 pointer-events-none">
          <div className="max-w-2xl mx-auto pointer-events-auto">
            <div className="flex items-end gap-2 rounded-2xl border bg-background/70 backdrop-blur-md p-2 shadow-lg">
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }}
                placeholder="Vraag Grutto AI naar studies, nieuws of bronnen…"
                className="resize-none border-0 focus-visible:ring-0 min-h-[44px] max-h-40 text-base bg-transparent"
              />
              <Button onClick={() => send(input)} disabled={!input.trim() || sending} size="icon" className="rounded-full shrink-0">
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function AssistantMessage({ message, onFollowUp, starredLinks, onToggleStar }: {
  message: Message; onFollowUp: (s: string) => void;
  starredLinks: Set<string>; onToggleStar: (r: ResultItem) => void;
}) {
  const p = safePayloadFromContent(message.content, message.payload);
  const results = p?.results || [];
  return (
    <div className="space-y-4">
      {(p?.intro || message.content) && (
        <p className="text-base leading-relaxed">{stripStars(p?.intro || message.content)}</p>
      )}

      <div className="space-y-3">
        {results.map((r, i) => (
          <ResultCard
            key={i}
            r={r}
            index={i}
            isStarred={starredLinks.has(ensureProtocol(stripStars(r.link || "").trim()))}
            onToggleStar={onToggleStar}
          />
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

function ensureProtocol(u: string) {
  const s = (u || "").trim();
  if (!s) return "";
  if (/^https?:\/\//i.test(s)) return s;
  if (s.startsWith("//")) return `https:${s}`;
  if (/^[\w.-]+\.[a-z]{2,}(\/|$)/i.test(s)) return `https://${s}`;
  return s;
}

function hostOf(u: string) {
  try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return null; }
}

function ResultCard({ r, index, isStarred, onToggleStar }: {
  r: ResultItem; index: number; isStarred: boolean; onToggleStar: (r: ResultItem) => void;
}) {
  const link = ensureProtocol(stripStars(r.link || "").trim());
  const host = hostOf(link);
  const favicon = r.favicon || (host ? `https://www.google.com/s2/favicons?domain=${host}&sz=64` : null);
  const citation = stripStars(r.citation || `${(r.authors || []).join(", ")} (${r.year ?? "n.d."}). ${r.title}. ${r.venue ?? ""}`.trim());
  const dateLabel = formatDateNl(r.published_date) || (r.year ? String(r.year) : null);
  const updatedLabel = r.updated_date ? formatDateNl(r.updated_date) : null;

  const copy = async () => {
    try { await navigator.clipboard.writeText(citation); toast.success("Citatie gekopieerd"); }
    catch { toast.error("Kopiëren mislukt"); }
  };

  // Access label
  const access = r.access ?? (r.open_access ? "open" : "unknown");
  const accessChip = access === "open"
    ? <span className="text-[10px] uppercase tracking-wide font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">Open Access</span>
    : access === "paywall"
      ? <span className="text-[10px] uppercase tracking-wide font-semibold px-2 py-0.5 rounded-full bg-orange-100 text-orange-800">Paywall</span>
      : null;

  // Kind label
  const kindChip = r.kind === "press_release"
    ? <span className="text-[10px] uppercase tracking-wide font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800">Persbericht</span>
    : r.kind === "blog"
      ? <span className="text-[10px] uppercase tracking-wide font-semibold px-2 py-0.5 rounded-full bg-purple-100 text-purple-800">Officiële blog</span>
      : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: index * 0.12, ease: "easeOut" }}
      className="flex gap-3 items-stretch"
    >
      <div className="flex-1 rounded-2xl border bg-card p-5 shadow-sm">
        {/* Top row: publisher icon + name + date */}
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          {favicon ? (
            <img
              src={favicon}
              alt={host || "bron"}
              className="w-7 h-7 rounded-full border bg-white object-contain shrink-0"
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
            />
          ) : (
            <div className="w-7 h-7 rounded-full bg-muted shrink-0" />
          )}
          <span className="font-semibold text-sm">{stripStars(r.venue || host || "Bron")}</span>
          {dateLabel && <span className="text-xs text-muted-foreground">· {dateLabel}</span>}
          {updatedLabel && updatedLabel !== dateLabel && (
            <span className="text-xs text-muted-foreground">· bijgewerkt {updatedLabel}</span>
          )}
          <span className={cn(
            "text-[10px] uppercase tracking-wide font-semibold px-2 py-0.5 rounded-full",
            r.source === "news" ? "bg-amber-100 text-amber-900" : "bg-indigo-100 text-indigo-900",
          )}>
            {r.source === "news" ? "Nieuws" : "Studie"}
          </span>
          {accessChip}
          {kindChip}
        </div>

        <h3 className="font-semibold text-lg leading-snug">{stripStars(r.title)}</h3>

        {r.authors && r.authors.length > 0 && (
          <p className="text-sm text-muted-foreground mt-1">
            {r.authors.slice(0, 4).join(", ")}{r.authors.length > 4 ? " e.a." : ""}
          </p>
        )}

        {r.source !== "news" && r.cited_by_count > 0 && (
          <p className="text-sm text-muted-foreground mt-1">{r.cited_by_count.toLocaleString()} citaties</p>
        )}

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
        <button
          onClick={() => onToggleStar({ ...r, link })}
          aria-label={isStarred ? "Verwijder uit favorieten" : "Bewaar bron"}
          className={cn(
            "inline-flex items-center justify-center w-10 h-10 rounded-xl transition-colors",
            isStarred
              ? "bg-amber-100 text-amber-700 hover:bg-amber-200"
              : "bg-muted text-foreground hover:bg-muted/70",
          )}
        >
          <Star className={cn("w-4 h-4", isStarred && "fill-amber-400")} />
        </button>
      </div>
    </motion.div>
  );
}
