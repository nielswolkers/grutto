// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// ============== OpenAlex ==============
interface OAWork {
  id: string;
  doi: string | null;
  title: string | null;
  publication_year: number | null;
  cited_by_count: number;
  open_access?: { is_oa?: boolean } | null;
  authorships?: Array<{ author?: { display_name?: string | null } | null }>;
  primary_location?: {
    landing_page_url?: string | null;
    source?: { display_name?: string | null } | null;
  } | null;
  abstract_inverted_index?: Record<string, number[]> | null;
  language?: string | null;
}

function reconstructAbstract(idx?: Record<string, number[]> | null) {
  if (!idx) return "";
  const positions: { pos: number; word: string }[] = [];
  for (const [word, posArr] of Object.entries(idx)) {
    for (const pos of posArr) positions.push({ pos, word });
  }
  return positions.sort((a, b) => a.pos - b.pos).map((p) => p.word).join(" ").slice(0, 900);
}

async function openAlexSearch(args: { query: string; from_year?: number; to_year?: number; languages?: string[]; max?: number; }) {
  const params = new URLSearchParams({
    search: args.query,
    "per-page": String(Math.min(args.max ?? 15, 25)),
    select: "id,doi,title,publication_year,cited_by_count,open_access,authorships,primary_location,abstract_inverted_index,language",
    mailto: "scholar@lovable.app",
  });
  const filters: string[] = [];
  if (args.from_year) filters.push(`from_publication_date:${args.from_year}-01-01`);
  if (args.to_year) filters.push(`to_publication_date:${args.to_year}-12-31`);
  if (args.languages?.length) filters.push(`language:${args.languages.join("|")}`);
  if (filters.length) params.set("filter", filters.join(","));
  const url = `https://api.openalex.org/works?${params.toString()}`;
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 20_000);
  try {
    const res = await fetch(url, { headers: { Accept: "application/json" }, signal: controller.signal });
    if (!res.ok) return { error: `OpenAlex ${res.status}`, results: [] };
    const json = await res.json() as { meta?: { count?: number }; results?: OAWork[] };
    const results = (json.results ?? []).map((w) => {
      const authors = (w.authorships ?? []).slice(0, 6).map((a) => a.author?.display_name).filter(Boolean) as string[];
      const title = w.title ?? "Untitled";
      const venue = w.primary_location?.source?.display_name ?? null;
      const link = w.doi ?? w.primary_location?.landing_page_url ?? w.id;
      return {
        source: "scholar" as const, title, authors, year: w.publication_year, venue,
        cited_by_count: w.cited_by_count ?? 0, open_access: w.open_access?.is_oa ?? false,
        link, language: w.language ?? null,
        abstract: reconstructAbstract(w.abstract_inverted_index).slice(0, 500),
        citation: formatHarvardScholar({ authors, year: w.publication_year, title, venue, url: link }),
      };
    });
    return { total: json.meta?.count ?? results.length, results };
  } catch (e) { return { error: (e as Error).message, results: [] }; }
  finally { clearTimeout(t); }
}

// ============== Helpers ==============
function normalizeUrl(u?: string | null): string {
  if (!u) return "";
  const s = String(u).trim();
  if (!s) return "";
  if (/^https?:\/\//i.test(s)) return s;
  if (s.startsWith("//")) return `https:${s}`;
  if (/^[\w.-]+\.[a-z]{2,}(\/|$)/i.test(s)) return `https://${s}`;
  return s;
}
function hostnameOf(url?: string) {
  if (!url) return null;
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return null; }
}
function pathOf(url?: string) {
  if (!url) return "";
  try { return new URL(url).pathname || "/"; } catch { return ""; }
}

const PUBLISHER_NAMES: Record<string, string> = {
  "theguardian.com": "The Guardian", "nytimes.com": "The New York Times",
  "washingtonpost.com": "The Washington Post", "wsj.com": "The Wall Street Journal",
  "ft.com": "Financial Times", "bbc.com": "BBC", "bbc.co.uk": "BBC",
  "reuters.com": "Reuters", "apnews.com": "Associated Press", "bloomberg.com": "Bloomberg",
  "economist.com": "The Economist", "nrc.nl": "NRC", "volkskrant.nl": "de Volkskrant",
  "ad.nl": "AD", "telegraaf.nl": "De Telegraaf", "trouw.nl": "Trouw", "parool.nl": "Het Parool",
  "nu.nl": "Nu.nl", "nos.nl": "NOS", "rtlnieuws.nl": "RTL Nieuws",
  "tweakers.net": "Tweakers", "fd.nl": "Het Financieele Dagblad",
  "nature.com": "Nature", "science.org": "Science",
  "sciencedirect.com": "Elsevier ScienceDirect", "elsevier.com": "Elsevier",
  "springer.com": "Springer", "link.springer.com": "Springer",
  "wiley.com": "Wiley", "onlinelibrary.wiley.com": "Wiley",
  "mdpi.com": "MDPI", "frontiersin.org": "Frontiers",
  "plos.org": "PLOS", "journals.plos.org": "PLOS",
  "tandfonline.com": "Taylor & Francis", "sagepub.com": "SAGE",
  "cambridge.org": "Cambridge University Press", "oup.com": "Oxford University Press",
  "arxiv.org": "arXiv", "biorxiv.org": "bioRxiv", "ssrn.com": "SSRN",
  "pubmed.ncbi.nlm.nih.gov": "PubMed", "ncbi.nlm.nih.gov": "NCBI", "doi.org": "DOI",
};
const PAYWALL_HOSTS = new Set(["nytimes.com","wsj.com","ft.com","economist.com","bloomberg.com","telegraaf.nl","nrc.nl","volkskrant.nl","parool.nl","trouw.nl","fd.nl","washingtonpost.com"]);
const OPEN_HOSTS = new Set(["theguardian.com","bbc.com","bbc.co.uk","reuters.com","apnews.com","nu.nl","nos.nl","rtlnieuws.nl","arxiv.org","biorxiv.org","plos.org","journals.plos.org","frontiersin.org","mdpi.com"]);

function prettyVenue(rawVenue: string | null | undefined, host: string | null) {
  if (host && PUBLISHER_NAMES[host]) return PUBLISHER_NAMES[host];
  const v = (rawVenue || "").trim();
  if (/^[\w-]+\.[a-z.]{2,}$/i.test(v) && host && PUBLISHER_NAMES[host]) return PUBLISHER_NAMES[host];
  if (/^[\w-]+\.[a-z.]{2,}$/i.test(v)) return v.replace(/\.[a-z.]+$/i, "").replace(/(^|\s|-)\w/g, (m) => m.toUpperCase());
  return v || (host ? (PUBLISHER_NAMES[host] ?? host) : null);
}
function detectAccess(host: string | null, openAccessHint?: boolean): "open" | "paywall" | "unknown" {
  if (openAccessHint === true) return "open";
  if (!host) return "unknown";
  if (OPEN_HOSTS.has(host)) return "open";
  if (PAYWALL_HOSTS.has(host)) return "paywall";
  if (host.endsWith(".gov") || host.endsWith(".edu") || host.endsWith(".gov.uk") || host.endsWith(".overheid.nl")) return "open";
  return "unknown";
}
function detectKind(link: string): "press_release" | "blog" | null {
  const u = link.toLowerCase();
  if (/\/(press|pers|persbericht|newsroom|press-release|press_release|media)\b/.test(u)) return "press_release";
  if (/\/blog(s)?\b/.test(u) || /\.blog\./.test(u)) return "blog";
  return null;
}

const MONTHS_NL = ["januari","februari","maart","april","mei","juni","juli","augustus","september","oktober","november","december"];
const MONTH_LOOKUP: Record<string, number> = {
  januari:1,februari:2,maart:3,april:4,mei:5,juni:6,juli:7,augustus:8,september:9,oktober:10,november:11,december:12,
  jan:1,feb:2,mrt:3,apr:4,jun:6,jul:7,aug:8,sep:9,sept:9,okt:10,nov:11,dec:12,
  january:1,february:2,march:3,may:5,june:6,july:7,october:10,
};
function toIsoDate(input: unknown): string | null {
  if (!input) return null;
  const s = String(input).trim(); if (!s) return null;
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (dmy) { const d=+dmy[1],m=+dmy[2]; let y=+dmy[3]; if (y<100) y+=2000; if (m>=1&&m<=12&&d>=1&&d<=31) return `${y}-${String(m).padStart(2,"0")}-${String(d).padStart(2,"0")}`; }
  const word = s.toLowerCase().match(/(\d{1,2})\s+([a-zéû]+)\.?\s+(\d{4})/) || s.toLowerCase().match(/([a-zéû]+)\.?\s+(\d{1,2}),?\s+(\d{4})/);
  if (word) { const a=word[1],b=word[2],c=word[3]; const monthWord=isNaN(+a)?a:b; const dayStr=isNaN(+a)?b:a; const m=MONTH_LOOKUP[monthWord]; if (m) return `${+c}-${String(m).padStart(2,"0")}-${String(+dayStr).padStart(2,"0")}`; }
  const t = Date.parse(s);
  if (!isNaN(t)) { const d=new Date(t); return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,"0")}-${String(d.getUTCDate()).padStart(2,"0")}`; }
  return null;
}
function formatDateNl(iso: string) { const [y,m,d]=iso.split("-").map(Number); return `${d} ${MONTHS_NL[m-1]} ${y}`; }
function formatHarvardNews(opts: { authors: string[]; isoDate: string | null; title: string; venue: string | null; url: string }) {
  const author = opts.authors?.length ? opts.authors.slice(0,3).join(", ") : (opts.venue || "Onbekende auteur");
  const year = opts.isoDate ? opts.isoDate.slice(0,4) : "n.d.";
  const dayMonth = opts.isoDate ? formatDateNl(opts.isoDate) : "n.d.";
  const now = new Date();
  const accessed = `${now.getUTCDate()} ${MONTHS_NL[now.getUTCMonth()]} ${now.getUTCFullYear()}`;
  return `${author} (${year}) '${opts.title}', ${opts.venue ?? "Onbekend medium"}, ${dayMonth}. Beschikbaar via: ${opts.url} (Geraadpleegd: ${accessed}).`;
}
function formatHarvardScholar(opts: { authors: string[]; year: number | null; title: string; venue: string | null; url: string }) {
  const author = opts.authors?.length ? opts.authors.slice(0,3).join(", ") : "Onbekende auteur";
  const year = opts.year ?? "n.d.";
  return `${author} (${year}) '${opts.title}'${opts.venue ? `, ${opts.venue}` : ""}. Beschikbaar via: ${opts.url}.`;
}

// ============== Firecrawl ==============
async function firecrawlNewsSearch(args: { query: string; from_date?: string; to_date?: string; source_site?: string; max?: number; tbs?: string }) {
  if (!FIRECRAWL_API_KEY) return { error: "Firecrawl niet beschikbaar", results: [] };
  const parts: string[] = [args.query];
  if (args.source_site) parts.push(`site:${args.source_site}`);
  if (args.from_date) parts.push(`after:${args.from_date}`);
  if (args.to_date) parts.push(`before:${args.to_date}`);
  const body: Record<string, any> = { query: parts.join(" "), limit: Math.min(args.max ?? 10, 20), sources: ["news"] };
  if (args.tbs) body.tbs = args.tbs;
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 25_000);
  try {
    const res = await fetch("https://api.firecrawl.dev/v2/search", {
      method: "POST",
      headers: { "Authorization": `Bearer ${FIRECRAWL_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(body), signal: controller.signal,
    });
    if (!res.ok) { const txt = await res.text(); return { error: `Firecrawl ${res.status}: ${txt.slice(0,200)}`, results: [] }; }
    const json = await res.json();
    const items: any[] = json?.data?.news ?? json?.data?.web ?? json?.data ?? [];
    const results = items.map((it: any) => {
      const rawUrl = it.url ?? it.link ?? it.sourceURL ?? "";
      const url = normalizeUrl(rawUrl); const host = hostnameOf(url);
      const rawDate = it.date ?? it.publishedDate ?? it.published_at ?? it.published ?? it.metadata?.publishedTime ?? it.metadata?.publishedDate ?? it.metadata?.article_published_time ?? it.metadata?.date ?? null;
      const updatedRaw = it.metadata?.modifiedTime ?? it.metadata?.article_modified_time ?? it.updated ?? null;
      const iso = toIsoDate(rawDate); const updatedIso = toIsoDate(updatedRaw);
      const author = it.author ?? it.metadata?.author ?? it.metadata?.byline ?? null;
      const authors = author ? [String(author)] : [];
      const venue = prettyVenue(it.source ?? it.metadata?.siteName ?? null, host);
      const title = it.title ?? it.metadata?.title ?? url ?? "Untitled";
      const access = detectAccess(host); const kind = detectKind(url);
      return {
        source: "news" as const, title, authors, year: iso ? +iso.slice(0,4) : null,
        published_date: iso, updated_date: updatedIso, venue, cited_by_count: 0,
        open_access: access === "open", access, kind, link: url,
        favicon: host ? `https://www.google.com/s2/favicons?domain=${host}&sz=64` : null,
        language: null, abstract: it.description ?? it.snippet ?? it.markdown ?? "",
        citation: formatHarvardNews({ authors, isoDate: iso, title, venue, url }),
      };
    }).filter((r: any) => r.link);
    return { total: results.length, results };
  } catch (e) { return { error: (e as Error).message, results: [] }; }
  finally { clearTimeout(t); }
}

// ============== Link validation (#5) ==============
// Drops dead links (404, network fail) and obvious homepage-only links.
async function validateLink(url: string, source: "scholar" | "news"): Promise<{ ok: boolean; reason?: string }> {
  if (!url) return { ok: false, reason: "leeg" };
  const path = pathOf(url);
  // Homepage / category-only links are not valid article references.
  // For scholar/news a real article URL has a path segment with some depth or a slug.
  const segs = path.split("/").filter(Boolean);
  if (segs.length === 0) return { ok: false, reason: "homepage" };
  if (source === "news") {
    const looksLikeArticle = segs.some((s) => s.length > 8 || /\d{4}/.test(s)) || segs.length >= 2;
    if (!looksLikeArticle) return { ok: false, reason: "categorie" };
  }
  // Network probe — HEAD first, fallback to ranged GET, tight timeout.
  const probe = async (method: "HEAD" | "GET") => {
    const ctrl = new AbortController();
    const tt = setTimeout(() => ctrl.abort(), 4500);
    try {
      const r = await fetch(url, {
        method,
        redirect: "follow",
        headers: method === "GET" ? { "Range": "bytes=0-1024", "User-Agent": "Mozilla/5.0 GruttoBot" } : { "User-Agent": "Mozilla/5.0 GruttoBot" },
        signal: ctrl.signal,
      });
      return r.status;
    } catch { return 0; }
    finally { clearTimeout(tt); }
  };
  let status = await probe("HEAD");
  if (status === 0 || status === 405 || status === 403 || status === 501 || status >= 500) {
    status = await probe("GET");
  }
  if (status === 0) return { ok: false, reason: "onbereikbaar" };
  if (status === 404 || status === 410) return { ok: false, reason: `http ${status}` };
  if (status === 401 || status === 403) return { ok: true }; // gated content still exists
  if (status >= 400) return { ok: false, reason: `http ${status}` };
  return { ok: true };
}

async function validateResults<T extends { link: string; source: string; title: string }>(results: T[]): Promise<T[]> {
  if (!results.length) return results;
  const checks = await Promise.all(results.map((r) =>
    validateLink(r.link, (r.source === "news" ? "news" : "scholar")).then((v) => ({ r, v }))
  ));
  return checks.filter(({ v }) => v.ok).map(({ r }) => r);
}

function stripUiMarkup(value: any) {
  return typeof value === "string"
    ? value.replace(/^\s*json\s*/i,"").replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g,"$2").replace(/[\*`_]+/g,"").trim()
    : value;
}
function extractJsonObject(raw: string) {
  let cleaned = raw.replace(/^```json\s*/i,"").replace(/^```\s*/i,"").replace(/```\s*$/i,"").replace(/^\s*json\s*/i,"").trim();
  if (!cleaned.startsWith("{")) { const s=cleaned.indexOf("{"),e=cleaned.lastIndexOf("}"); if (s>=0&&e>s) cleaned=cleaned.slice(s,e+1); }
  return JSON.parse(cleaned);
}

// ============== Study set tools (#17, #18) ==============
function makeDb(userId: string) {
  return createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
}

async function listStudySets(userId: string) {
  const db = makeDb(userId);
  const { data: lib } = await db.from("study_set_library").select("set_id, subject_id, study_sets(id, title, description, emoji, owner_id)").eq("user_id", userId);
  const { data: subjects } = await db.from("subjects").select("id, name").eq("user_id", userId);
  const subMap = new Map((subjects ?? []).map((s: any) => [s.id, s.name]));
  return (lib ?? []).filter((l: any) => l.study_sets).map((l: any) => ({
    id: l.study_sets.id, title: l.study_sets.title, emoji: l.study_sets.emoji,
    description: l.study_sets.description, owner_id: l.study_sets.owner_id,
    subject_id: l.subject_id, subject_name: l.subject_id ? subMap.get(l.subject_id) ?? null : null,
  }));
}

async function getStudySet(userId: string, setId: string) {
  const db = makeDb(userId);
  const { data: set } = await db.from("study_sets").select("*").eq("id", setId).maybeSingle();
  if (!set) return { error: "Niet gevonden" };
  const { data: cards } = await db.from("study_cards").select("id, term, definition, position").eq("set_id", setId).order("position");
  return { id: set.id, title: set.title, description: set.description, emoji: set.emoji, subject_id: set.subject_id, cards: cards ?? [] };
}

async function resolveSubjectId(db: any, userId: string, subject: string | null | undefined): Promise<string | null> {
  if (!subject) {
    const { data } = await db.from("subjects").select("id").eq("user_id", userId).order("sort_order").limit(1);
    return data?.[0]?.id ?? null;
  }
  // Try id first
  const { data: byId } = await db.from("subjects").select("id").eq("id", subject).eq("user_id", userId).maybeSingle();
  if (byId) return byId.id;
  const { data: byName } = await db.from("subjects").select("id").eq("user_id", userId).ilike("name", subject).maybeSingle();
  if (byName) return byName.id;
  // Create new subject
  const { data: created } = await db.from("subjects").insert({ user_id: userId, name: subject, emoji: "📚", sort_order: 999 }).select("id").single();
  return created?.id ?? null;
}

async function createStudySetTool(userId: string, args: any) {
  const db = makeDb(userId);
  const subjectId = await resolveSubjectId(db, userId, args.subject ?? args.subject_id ?? args.subject_name);
  if (!subjectId) return { error: "Geen 'vak' beschikbaar. Maak eerst een vak aan in Materialen." };
  const cards = Array.isArray(args.cards) ? args.cards : [];
  if (cards.length === 0) return { error: "Geen kaarten meegegeven" };
  const { data: set, error } = await db.from("study_sets").insert({
    owner_id: userId, title: args.title || "Nieuwe studieset",
    description: args.description || "", emoji: args.emoji || "📚",
    subject_id: subjectId,
  }).select().single();
  if (error) return { error: error.message };
  const rows = cards.slice(0, 1000).map((c: any, i: number) => ({
    set_id: set.id, term: String(c.term ?? c.front ?? "").slice(0, 1000),
    definition: String(c.definition ?? c.back ?? "").slice(0, 4000), position: i,
  })).filter((r: any) => r.term && r.definition);
  if (rows.length) {
    const { error: cErr } = await db.from("study_cards").insert(rows);
    if (cErr) return { error: cErr.message };
  }
  return { id: set.id, title: set.title, emoji: set.emoji, subject_id: subjectId, card_count: rows.length, action: "created" as const };
}

async function updateStudySetTool(userId: string, args: any) {
  const db = makeDb(userId);
  const setId = args.set_id || args.id;
  if (!setId) return { error: "set_id ontbreekt" };
  const { data: existing } = await db.from("study_sets").select("owner_id").eq("id", setId).maybeSingle();
  if (!existing || existing.owner_id !== userId) return { error: "Geen toegang" };
  const upd: any = {};
  if (args.title) upd.title = args.title;
  if (args.description !== undefined) upd.description = args.description;
  if (args.emoji) upd.emoji = args.emoji;
  if (args.subject || args.subject_id || args.subject_name) {
    const subjectId = await resolveSubjectId(db, userId, args.subject ?? args.subject_id ?? args.subject_name);
    if (subjectId) upd.subject_id = subjectId;
  }
  if (Object.keys(upd).length) await db.from("study_sets").update(upd).eq("id", setId);

  // Card operations
  if (Array.isArray(args.replace_cards)) {
    await db.from("study_cards").delete().eq("set_id", setId);
    const rows = args.replace_cards.slice(0, 1000).map((c: any, i: number) => ({
      set_id: setId, term: String(c.term ?? "").slice(0, 1000),
      definition: String(c.definition ?? "").slice(0, 4000), position: i,
    })).filter((r: any) => r.term && r.definition);
    if (rows.length) await db.from("study_cards").insert(rows);
  } else if (Array.isArray(args.add_cards) && args.add_cards.length) {
    const { data: maxRow } = await db.from("study_cards").select("position").eq("set_id", setId).order("position", { ascending: false }).limit(1);
    let pos = (maxRow?.[0]?.position ?? -1) + 1;
    const rows = args.add_cards.map((c: any) => ({
      set_id: setId, term: String(c.term ?? "").slice(0, 1000),
      definition: String(c.definition ?? "").slice(0, 4000), position: pos++,
    })).filter((r: any) => r.term && r.definition);
    if (rows.length) await db.from("study_cards").insert(rows);
  }
  if (Array.isArray(args.delete_card_ids) && args.delete_card_ids.length) {
    await db.from("study_cards").delete().eq("set_id", setId).in("id", args.delete_card_ids);
  }
  const { data: set } = await db.from("study_sets").select("id, title, emoji, subject_id").eq("id", setId).single();
  return { ...set, action: "updated" as const };
}

// ============== Agent loop ==============
const PLANNER_SYSTEM_BASE = `Je bent Grutto AI, de persoonlijke studie-assistent van de gebruiker in de Grutto app. Je doet onderzoek (bronnen zoeken) EN je hebt volledige toegang tot de eigen gegevens van de gebruiker: vakken, studiesets + kaarten, taken, agenda, notities en whiteboard. Zeg NOOIT dat je hier geen toegang toe hebt — gebruik de tools.

TOOLS:
- search_scholar: doorzoekt OpenAlex (wetenschappelijke publicaties). Standaard EN+NL, tenzij anders gevraagd.
- search_news: doorzoekt nieuwsartikelen via Firecrawl. Datum/bron filters beschikbaar.
- list_subjects: vakken van de gebruiker.
- list_study_sets / get_study_set / create_study_set / update_study_set: studiesets en kaarten beheren.
- list_tasks / create_task / complete_task: taken.
- list_calendar_events / create_calendar_event: agenda. Gebruik tijdzone Europe/Amsterdam.
- list_notes / create_note: notities.
- get_whiteboard: whiteboard-kaarten lezen.

ROUTING:
- Studies/onderzoek/papers → search_scholar.
- Nieuws/actualiteit → search_news.
- "Bronnen" of breed onderzoek → beide.
- Vragen over planning, huiswerk, deadlines, "wat moet ik doen" → list_tasks en/of list_calendar_events.
- "Zet in mijn agenda / plan in" → create_calendar_event. "Voeg taak toe" → create_task.
- Vragen over notities of whiteboard → list_notes / get_whiteboard.
- Vraag over eigen studiesets → list_study_sets, evt. get_study_set.
- "Maak een studieset over..." → create_study_set.
- "Voeg kaart toe / pas studieset aan" → eerst list_study_sets als id onbekend, dan update_study_set.
- Bij vragen over eigen gegevens: zet het volledige antwoord (lijstjes met regeleinden, datums in het Nederlands) in "intro" en laat results leeg.

INTELLIGENTIE:
- Verzin synoniemen en vertalingen (EN↔NL) voor brede dekking.
- Doe meerdere zoekrondes als de eerste dun is.
- Respecteer expliciete jaar/auteur/bron filters letterlijk.
- Als gebruiker bijlagen heeft meegestuurd (afbeeldingen of bestanden), analyseer ze en gebruik ze in je antwoord.

NA ZOEKEN:
- Roep GEEN tool meer aan zodra je voldoende hebt.
- Antwoord met STRICT JSON (geen markdown, geen code fences, geen sterretjes):
{
  "intro": string,
  "results": [{ "title": string, "authors": string[], "year": number|null, "venue": string|null, "cited_by_count": number, "open_access": boolean, "link": string, "reason": string, "citation": string, "source": "scholar"|"news", "published_date": string|null }],
  "comparison": string,
  "followUps": [string, string, string],
  "study_sets": [{ "id": string, "title": string, "emoji": string, "action": "created"|"updated" }]
}

REGELS:
- Selecteer 5 resultaten max (of het gevraagde aantal). Lege results-array is ok als er geen bronnenvraag was.
- Gebruik ALLEEN bronnen die in tool-resultaten verschenen. Verzin niets.
- Vul study_sets alleen wanneer je create_study_set of update_study_set hebt aangeroepen; anders lege array.
- Geen markdown-syntax. Alle UI-tekst in het Nederlands.`;

const TOOLS = [
  { type: "function", function: { name: "search_scholar", description: "Zoek wetenschappelijke publicaties via OpenAlex.", parameters: { type: "object", properties: { query: { type: "string" }, from_year: { type: "number" }, to_year: { type: "number" }, languages: { type: "array", items: { type: "string" } }, max: { type: "number" } }, required: ["query"] } } },
  { type: "function", function: { name: "search_news", description: "Zoek nieuwsartikelen via Firecrawl.", parameters: { type: "object", properties: { query: { type: "string" }, from_date: { type: "string" }, to_date: { type: "string" }, source_site: { type: "string" }, tbs: { type: "string", enum: ["qdr:d","qdr:w","qdr:m","qdr:y"] }, max: { type: "number" } }, required: ["query"] } } },
  { type: "function", function: { name: "list_study_sets", description: "Haal alle studiesets van de gebruiker op.", parameters: { type: "object", properties: {} } } },
  { type: "function", function: { name: "get_study_set", description: "Haal één studieset met kaarten op.", parameters: { type: "object", properties: { set_id: { type: "string" } }, required: ["set_id"] } } },
  { type: "function", function: { name: "create_study_set", description: "Maak een nieuwe studieset met kaarten. 'subject' is de naam van het vak; wordt zo nodig aangemaakt.", parameters: { type: "object", properties: { title: { type: "string" }, description: { type: "string" }, emoji: { type: "string" }, subject: { type: "string" }, cards: { type: "array", items: { type: "object", properties: { term: { type: "string" }, definition: { type: "string" } }, required: ["term","definition"] } } }, required: ["title","cards"] } } },
  { type: "function", function: { name: "update_study_set", description: "Bewerk een bestaande studieset. Eigenaar alleen.", parameters: { type: "object", properties: { set_id: { type: "string" }, title: { type: "string" }, description: { type: "string" }, emoji: { type: "string" }, subject: { type: "string" }, add_cards: { type: "array", items: { type: "object", properties: { term: { type: "string" }, definition: { type: "string" } } } }, replace_cards: { type: "array", items: { type: "object", properties: { term: { type: "string" }, definition: { type: "string" } } } }, delete_card_ids: { type: "array", items: { type: "string" } } }, required: ["set_id"] } } },
];

// ============== Personal data tools (vakken, taken, agenda, notities, whiteboard) ==============
const PERSONAL_TOOLS = [
  { type: "function", function: { name: "list_subjects", description: "Haal de vakken van de gebruiker op.", parameters: { type: "object", properties: {} } } },
  { type: "function", function: { name: "list_tasks", description: "Haal taken van de gebruiker op, optioneel gefilterd.", parameters: { type: "object", properties: { completed: { type: "boolean" }, due_from: { type: "string", description: "YYYY-MM-DD" }, due_to: { type: "string", description: "YYYY-MM-DD" } } } } },
  { type: "function", function: { name: "create_task", description: "Maak een taak aan.", parameters: { type: "object", properties: { title: { type: "string" }, description: { type: "string" }, due_date: { type: "string", description: "YYYY-MM-DD" }, due_time: { type: "string", description: "HH:MM" }, priority: { type: "string", enum: ["low","medium","high"] } }, required: ["title","due_date"] } } },
  { type: "function", function: { name: "complete_task", description: "Markeer een taak als voltooid (of heropen met completed=false).", parameters: { type: "object", properties: { task_id: { type: "string" }, completed: { type: "boolean" } }, required: ["task_id"] } } },
  { type: "function", function: { name: "list_calendar_events", description: "Haal agenda-afspraken op binnen een periode.", parameters: { type: "object", properties: { from: { type: "string", description: "ISO datum/tijd" }, to: { type: "string", description: "ISO datum/tijd" } } } } },
  { type: "function", function: { name: "create_calendar_event", description: "Maak een agenda-afspraak.", parameters: { type: "object", properties: { title: { type: "string" }, start_time: { type: "string", description: "ISO 8601 met tijdzone" }, end_time: { type: "string", description: "ISO 8601 met tijdzone" }, description: { type: "string" }, location: { type: "string" }, all_day: { type: "boolean" }, event_type: { type: "string" } }, required: ["title","start_time","end_time"] } } },
  { type: "function", function: { name: "list_notes", description: "Haal notities op, optioneel met zoekterm of map.", parameters: { type: "object", properties: { search: { type: "string" }, folder_name: { type: "string" } } } } },
  { type: "function", function: { name: "create_note", description: "Maak een notitie.", parameters: { type: "object", properties: { title: { type: "string" }, content: { type: "string" }, folder_name: { type: "string" }, is_pinned: { type: "boolean" } }, required: ["title"] } } },
  { type: "function", function: { name: "get_whiteboard", description: "Lees de whiteboards van de gebruiker (kaarten: notities, todo's, links).", parameters: { type: "object", properties: {} } } },
];
TOOLS.push(...(PERSONAL_TOOLS as any));

let currentWhiteboard: any = null;

async function runPersonalTool(name: string, args: any, userId: string) {
  const db = makeDb(userId);
  if (name === "list_subjects") {
    const { data, error } = await db.from("subjects").select("id, name, emoji").eq("user_id", userId).order("sort_order");
    return error ? { error: error.message } : { data };
  }
  if (name === "list_tasks") {
    let q = db.from("tasks").select("id, title, description, due_date, due_time, priority, completed").eq("user_id", userId).order("due_date").limit(150);
    if (typeof args.completed === "boolean") q = q.eq("completed", args.completed);
    if (args.due_from) q = q.gte("due_date", args.due_from);
    if (args.due_to) q = q.lte("due_date", args.due_to);
    const { data, error } = await q;
    return error ? { error: error.message } : { data };
  }
  if (name === "create_task") {
    const { data, error } = await db.from("tasks").insert({ user_id: userId, title: args.title, description: args.description ?? null, due_date: args.due_date, due_time: args.due_time ?? null, priority: args.priority ?? "medium" }).select("id, title, due_date, due_time, priority").single();
    return error ? { error: error.message } : { data };
  }
  if (name === "complete_task") {
    const done = args.completed !== false;
    const { data, error } = await db.from("tasks").update({ completed: done, completed_at: done ? new Date().toISOString() : null }).eq("id", args.task_id).eq("user_id", userId).select("id, title, completed").maybeSingle();
    return error ? { error: error.message } : data ? { data } : { error: "Taak niet gevonden" };
  }
  if (name === "list_calendar_events") {
    let q = db.from("calendar_events").select("id, title, description, start_time, end_time, all_day, location, event_type").eq("user_id", userId).order("start_time").limit(150);
    if (args.from) q = q.gte("start_time", args.from);
    if (args.to) q = q.lte("start_time", args.to);
    const { data, error } = await q;
    return error ? { error: error.message } : { data };
  }
  if (name === "create_calendar_event") {
    const { data, error } = await db.from("calendar_events").insert({ user_id: userId, title: args.title, start_time: args.start_time, end_time: args.end_time, description: args.description ?? null, location: args.location ?? null, all_day: args.all_day ?? false, ...(args.event_type ? { event_type: args.event_type } : {}) }).select("id, title, start_time, end_time").single();
    return error ? { error: error.message } : { data };
  }
  if (name === "list_notes") {
    let q = db.from("notes").select("id, title, content, folder_name, is_pinned, updated_at").eq("user_id", userId).order("updated_at", { ascending: false }).limit(50);
    if (args.folder_name) q = q.eq("folder_name", args.folder_name);
    if (args.search) q = q.or(`title.ilike.%${String(args.search).replace(/[,()%]/g, "")}%,content.ilike.%${String(args.search).replace(/[,()%]/g, "")}%`);
    const { data, error } = await q;
    return error ? { error: error.message } : { data: (data ?? []).map((n: any) => ({ ...n, content: String(n.content ?? "").slice(0, 3000) })) };
  }
  if (name === "create_note") {
    const { data, error } = await db.from("notes").insert({ user_id: userId, title: args.title, content: args.content ?? "", folder_name: args.folder_name ?? null, is_pinned: args.is_pinned ?? false }).select("id, title").single();
    return error ? { error: error.message } : { data };
  }
  if (name === "get_whiteboard") {
    return currentWhiteboard ? { data: currentWhiteboard } : { error: "Geen whiteboard-gegevens beschikbaar op dit apparaat." };
  }
  return null;
}

async function runTool(name: string, args: any, userId: string) {
  if (name === "search_scholar") return await openAlexSearch(args);
  if (name === "search_news") return await firecrawlNewsSearch(args);
  if (userId === "anon") return { error: "Niet ingelogd" };
  if (name === "list_study_sets") return { sets: await listStudySets(userId) };
  if (name === "get_study_set") return await getStudySet(userId, args.set_id);
  if (name === "create_study_set") return await createStudySetTool(userId, args);
  if (name === "update_study_set") return await updateStudySetTool(userId, args);
  const personal = await runPersonalTool(name, args, userId);
  if (personal) return personal;
  return { error: `Onbekende tool: ${name}` };
}

function decodeJwtUserId(authHeader: string | null): string | null {
  if (!authHeader) return null;
  const token = authHeader.replace(/^Bearer\s+/i, "");
  const parts = token.split(".");
  if (parts.length < 2) return null;
  try {
    const payload = JSON.parse(atob(parts[1].replace(/-/g,"+").replace(/_/g,"/")));
    return payload?.sub ?? null;
  } catch { return null; }
}

// Convert frontend attachments into OpenAI-compatible multimodal content parts.
function buildUserContent(text: string, attachments: any[] | undefined) {
  if (!attachments?.length) return text;
  const parts: any[] = [{ type: "text", text: text || "(geen bericht — analyseer de bijlagen)" }];
  for (const a of attachments) {
    if (!a?.dataUrl) continue;
    if (a.kind === "image") {
      parts.push({ type: "image_url", image_url: { url: a.dataUrl } });
    } else if (a.mime === "application/pdf" || a.kind === "file") {
      // For PDFs and other documents, send as file part.
      parts.push({ type: "file", file: { filename: a.name || "bijlage", file_data: a.dataUrl } });
    }
    if (typeof a.text === "string" && a.text.length) {
      // Inline text for txt/md/csv extracted client-side.
      parts.push({ type: "text", text: `[Bijlage ${a.name}]\n${a.text.slice(0, 50000)}` });
    }
  }
  return parts;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (!LOVABLE_API_KEY) return new Response(JSON.stringify({ error: "Missing LOVABLE_API_KEY" }), { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });

  try {
    const body = await req.json();
    const incoming: Array<{ role: string; content: string }> = body.messages || [];
    const attachments: any[] = body.attachments || [];
    const lastUser = [...incoming].reverse().find((m) => m.role === "user");
    const prompt = (lastUser?.content || "").trim();
    if (!prompt && !attachments.length) {
      return new Response(JSON.stringify({ error: "Prompt required" }), { status: 400, headers: { ...CORS, "Content-Type": "application/json" } });
    }

    const userId = decodeJwtUserId(req.headers.get("Authorization")) || "anon";

    // Build conversation
    const history = incoming.filter((m) => m.role === "user" || m.role === "assistant").slice(-10);
    const convo: any[] = [{ role: "system", content: PLANNER_SYSTEM }];
    for (let i = 0; i < history.length; i++) {
      const m = history[i];
      const isLast = i === history.length - 1;
      if (isLast && m.role === "user") {
        convo.push({ role: "user", content: buildUserContent(m.content, attachments) });
      } else {
        convo.push({ role: m.role, content: m.content });
      }
    }

    const allResults: any[] = [];
    const seenLinks = new Set<string>();
    const searchLog: Array<{ tool: string; args: any; count: number }> = [];
    const studySetActions: any[] = [];

    const MAX_ROUNDS = 7;
    for (let round = 0; round < MAX_ROUNDS; round++) {
      const isLastRound = round === MAX_ROUNDS - 1;
      const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${LOVABLE_API_KEY}` },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: convo,
          tools: isLastRound ? undefined : TOOLS,
          tool_choice: isLastRound ? undefined : "auto",
          ...(isLastRound ? { response_format: { type: "json_object" } } : {}),
          stream: false,
        }),
      });
      if (aiRes.status === 429) return new Response(JSON.stringify({ error: "Rate limit bereikt." }), { status: 429, headers: { ...CORS, "Content-Type": "application/json" } });
      if (aiRes.status === 402) return new Response(JSON.stringify({ error: "Geen AI credits meer." }), { status: 402, headers: { ...CORS, "Content-Type": "application/json" } });
      if (!aiRes.ok) { const txt = await aiRes.text(); return new Response(JSON.stringify({ error: `AI gateway ${aiRes.status}: ${txt.slice(0,400)}` }), { status: 500, headers: { ...CORS, "Content-Type": "application/json" } }); }

      const aiJson = await aiRes.json();
      const msg = aiJson.choices?.[0]?.message;
      if (!msg) break;
      const toolCalls = msg.tool_calls;
      if (toolCalls?.length && !isLastRound) {
        convo.push({ role: "assistant", content: msg.content ?? "", tool_calls: toolCalls });
        for (const call of toolCalls) {
          let args: any = {};
          try { args = JSON.parse(call.function?.arguments ?? "{}"); } catch { /* noop */ }
          const result = await runTool(call.function?.name, args, userId);
          const items = (result?.results ?? []) as any[];
          for (const r of items) {
            const key = (r.link || r.title || "").toString().toLowerCase();
            if (key && !seenLinks.has(key)) { seenLinks.add(key); allResults.push(r); }
          }
          if ((call.function?.name === "create_study_set" || call.function?.name === "update_study_set") && (result as any)?.id) {
            studySetActions.push({ id: (result as any).id, title: (result as any).title, emoji: (result as any).emoji, action: (result as any).action });
          }
          searchLog.push({ tool: call.function?.name, args, count: items.length });
          const trimmed = {
            ...(result?.error ? { error: result.error } : {}),
            ...((result as any)?.sets ? { sets: (result as any).sets } : {}),
            ...((result as any)?.id && !items.length ? { id: (result as any).id, title: (result as any).title, action: (result as any).action } : {}),
            ...((result as any)?.cards ? { cards: (result as any).cards.slice(0, 100) } : {}),
            total: (result as any)?.total,
            results: items.slice(0, 12).map((r: any) => ({
              source: r.source, title: r.title, authors: r.authors, year: r.year,
              venue: r.venue, cited_by_count: r.cited_by_count, link: r.link,
              language: r.language, published_date: r.published_date ?? null,
              abstract: (r.abstract || "").slice(0, 300),
            })),
          };
          convo.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(trimmed) });
        }
        continue;
      }

      // Final answer
      const raw = msg.content ?? "{}";
      let payload: any;
      try { payload = extractJsonObject(raw); } catch { payload = { intro: stripUiMarkup(raw), results: [], comparison: "", followUps: [] }; }

      payload.intro = stripUiMarkup(payload.intro) || "";
      payload.comparison = stripUiMarkup(payload.comparison) || "";
      payload.followUps = Array.isArray(payload.followUps) ? payload.followUps.map(stripUiMarkup).filter(Boolean).slice(0,3) : [];
      payload.results = Array.isArray(payload.results) ? payload.results.map((r: any) => {
        const link = normalizeUrl(stripUiMarkup(r.link));
        const host = hostnameOf(link);
        const match = allResults.find((c) => (c.link || "").toLowerCase() === link.toLowerCase()) || allResults.find((c) => (c.title || "").toLowerCase() === String(r.title || "").toLowerCase());
        const source = r.source === "news" ? "news" : (match?.source ?? "scholar");
        const published_date = toIsoDate(r.published_date) ?? match?.published_date ?? null;
        const updated_date = toIsoDate(r.updated_date) ?? match?.updated_date ?? null;
        const title = stripUiMarkup(r.title) || match?.title || "Bron zonder titel";
        const venue = prettyVenue(stripUiMarkup(r.venue) || match?.venue || null, host);
        const authors = Array.isArray(r.authors) && r.authors.length ? r.authors.map(stripUiMarkup).filter(Boolean) : (match?.authors ?? []);
        const year = typeof r.year === "number" ? r.year : (published_date ? +published_date.slice(0,4) : (match?.year ?? null));
        const access = detectAccess(host, match?.open_access === true || r.open_access === true);
        const kind = detectKind(link);
        const citation = source === "news"
          ? formatHarvardNews({ authors, isoDate: published_date, title, venue, url: link })
          : formatHarvardScholar({ authors, year, title, venue, url: link });
        const weight = access === "open" ? 1.0 : access === "paywall" ? 0.7 : 0.85;
        return { ...r, title, authors, year, venue, link, reason: stripUiMarkup(r.reason), citation, published_date, updated_date,
          favicon: match?.favicon ?? (host ? `https://www.google.com/s2/favicons?domain=${host}&sz=64` : null),
          source, open_access: access === "open", access, kind, _weight: weight };
      }).filter((r: any) => r.title && r.link) : [];

      // ===== #5: Validate links =====
      if (payload.results.length) {
        const validated = await validateResults(payload.results);
        payload.results = validated;
      }

      payload.results = payload.results
        .sort((a: any, b: any) => b._weight - a._weight)
        .slice(0, 8)
        .map(({ _weight, ...rest }: any) => rest);

      // Merge tool-tracked study set actions
      const incomingSets = Array.isArray(payload.study_sets) ? payload.study_sets : [];
      const mergedSets: any[] = [];
      const seenSet = new Set<string>();
      for (const s of [...studySetActions, ...incomingSets]) {
        if (s?.id && !seenSet.has(s.id)) { seenSet.add(s.id); mergedSets.push({ id: s.id, title: s.title, emoji: s.emoji || "📚", action: s.action || "created" }); }
      }
      payload.study_sets = mergedSets;

      return new Response(JSON.stringify({ ...payload, search: { rounds: searchLog.length, log: searchLog, totalCandidates: allResults.length } }),
        { headers: { ...CORS, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ intro: "Geen antwoord kunnen formuleren.", results: [], comparison: "", followUps: [], study_sets: [], search: { rounds: searchLog.length, log: searchLog } }),
      { headers: { ...CORS, "Content-Type": "application/json" } });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });
  }
});
