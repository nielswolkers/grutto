// deno-lint-ignore-file no-explicit-any
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY");

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

async function openAlexSearch(args: {
  query: string;
  from_year?: number;
  to_year?: number;
  languages?: string[]; // e.g. ['en','nl']
  max?: number;
}) {
  const params = new URLSearchParams({
    search: args.query,
    "per-page": String(Math.min(args.max ?? 15, 25)),
    select: "id,doi,title,publication_year,cited_by_count,open_access,authorships,primary_location,abstract_inverted_index,language",
    mailto: "scholar@lovable.app",
  });
  const filters: string[] = [];
  if (args.from_year) filters.push(`from_publication_date:${args.from_year}-01-01`);
  if (args.to_year) filters.push(`to_publication_date:${args.to_year}-12-31`);
  if (args.languages && args.languages.length) filters.push(`language:${args.languages.join("|")}`);
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
        source: "scholar" as const,
        title,
        authors,
        year: w.publication_year,
        venue,
        cited_by_count: w.cited_by_count ?? 0,
        open_access: w.open_access?.is_oa ?? false,
        link,
        language: w.language ?? null,
        abstract: reconstructAbstract(w.abstract_inverted_index).slice(0, 500),
        citation: formatHarvardScholar({ authors, year: w.publication_year, title, venue, url: link }),
      };
    });
    return { total: json.meta?.count ?? results.length, results };
  } catch (e) {
    return { error: (e as Error).message, results: [] };
  } finally {
    clearTimeout(t);
  }
}

// ============== Firecrawl news ==============
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

// Map domain → human publisher / outlet name.
const PUBLISHER_NAMES: Record<string, string> = {
  "theguardian.com": "The Guardian",
  "nytimes.com": "The New York Times",
  "washingtonpost.com": "The Washington Post",
  "wsj.com": "The Wall Street Journal",
  "ft.com": "Financial Times",
  "bbc.com": "BBC", "bbc.co.uk": "BBC",
  "reuters.com": "Reuters",
  "apnews.com": "Associated Press",
  "bloomberg.com": "Bloomberg",
  "economist.com": "The Economist",
  "nrc.nl": "NRC", "volkskrant.nl": "de Volkskrant", "ad.nl": "AD",
  "telegraaf.nl": "De Telegraaf", "trouw.nl": "Trouw", "parool.nl": "Het Parool",
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
  "pubmed.ncbi.nlm.nih.gov": "PubMed", "ncbi.nlm.nih.gov": "NCBI",
  "doi.org": "DOI",
};

const PAYWALL_HOSTS = new Set([
  "nytimes.com","wsj.com","ft.com","economist.com","bloomberg.com",
  "telegraaf.nl","nrc.nl","volkskrant.nl","parool.nl","trouw.nl","fd.nl",
  "washingtonpost.com",
]);
const OPEN_HOSTS = new Set([
  "theguardian.com","bbc.com","bbc.co.uk","reuters.com","apnews.com",
  "nu.nl","nos.nl","rtlnieuws.nl","arxiv.org","biorxiv.org",
  "plos.org","journals.plos.org","frontiersin.org","mdpi.com",
]);

function prettyVenue(rawVenue: string | null | undefined, host: string | null) {
  if (host && PUBLISHER_NAMES[host]) return PUBLISHER_NAMES[host];
  const v = (rawVenue || "").trim();
  // strip domain-looking venues like "theguardian.com"
  if (/^[\w-]+\.[a-z.]{2,}$/i.test(v) && host && PUBLISHER_NAMES[host]) return PUBLISHER_NAMES[host];
  if (/^[\w-]+\.[a-z.]{2,}$/i.test(v)) {
    // capitalise first part
    return v.replace(/\.[a-z.]+$/i, "").replace(/(^|\s|-)\w/g, (m) => m.toUpperCase());
  }
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
  januari: 1, februari: 2, maart: 3, april: 4, mei: 5, juni: 6, juli: 7, augustus: 8, september: 9, oktober: 10, november: 11, december: 12,
  jan: 1, feb: 2, mrt: 3, apr: 4, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, okt: 10, nov: 11, dec: 12,
  january: 1, february: 2, march: 3, may: 5, june: 6, july: 7, october: 10,
};
function toIsoDate(input: unknown): string | null {
  if (!input) return null;
  const s = String(input).trim();
  if (!s) return null;
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (dmy) {
    const d = +dmy[1], m = +dmy[2]; let y = +dmy[3]; if (y < 100) y += 2000;
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    }
  }
  const word = s.toLowerCase().match(/(\d{1,2})\s+([a-zéû]+)\.?\s+(\d{4})/) ||
    s.toLowerCase().match(/([a-zéû]+)\.?\s+(\d{1,2}),?\s+(\d{4})/);
  if (word) {
    const a = word[1], b = word[2], c = word[3];
    const monthWord = isNaN(+a) ? a : b;
    const dayStr = isNaN(+a) ? b : a;
    const m = MONTH_LOOKUP[monthWord];
    if (m) {
      const d = +dayStr, y = +c;
      return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    }
  }
  const t = Date.parse(s);
  if (!isNaN(t)) {
    const d = new Date(t);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  }
  return null;
}

function formatDateNl(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS_NL[m - 1]} ${y}`;
}

function formatHarvardNews(opts: {
  authors: string[]; isoDate: string | null; title: string; venue: string | null; url: string;
}) {
  const author = opts.authors && opts.authors.length ? opts.authors.slice(0, 3).join(", ") : (opts.venue || "Onbekende auteur");
  const year = opts.isoDate ? opts.isoDate.slice(0, 4) : "n.d.";
  const dayMonth = opts.isoDate ? formatDateNl(opts.isoDate) : "n.d.";
  const now = new Date();
  const accessed = `${now.getUTCDate()} ${MONTHS_NL[now.getUTCMonth()]} ${now.getUTCFullYear()}`;
  return `${author} (${year}) '${opts.title}', ${opts.venue ?? "Onbekend medium"}, ${dayMonth}. Beschikbaar via: ${opts.url} (Geraadpleegd: ${accessed}).`;
}

function formatHarvardScholar(opts: {
  authors: string[]; year: number | null; title: string; venue: string | null; url: string;
}) {
  const author = opts.authors && opts.authors.length ? opts.authors.slice(0, 3).join(", ") : "Onbekende auteur";
  const year = opts.year ?? "n.d.";
  return `${author} (${year}) '${opts.title}'${opts.venue ? `, ${opts.venue}` : ""}. Beschikbaar via: ${opts.url}.`;
}

async function firecrawlNewsSearch(args: {
  query: string;
  from_date?: string;
  to_date?: string;
  source_site?: string;
  max?: number;
  tbs?: "qdr:d" | "qdr:w" | "qdr:m" | "qdr:y";
}) {
  if (!FIRECRAWL_API_KEY) return { error: "Firecrawl niet beschikbaar", results: [] };
  const parts: string[] = [args.query];
  if (args.source_site) parts.push(`site:${args.source_site}`);
  if (args.from_date) parts.push(`after:${args.from_date}`);
  if (args.to_date) parts.push(`before:${args.to_date}`);
  const body: Record<string, any> = {
    query: parts.join(" "),
    limit: Math.min(args.max ?? 10, 20),
    sources: ["news"],
  };
  if (args.tbs) body.tbs = args.tbs;

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 25_000);
  try {
    const res = await fetch("https://api.firecrawl.dev/v2/search", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${FIRECRAWL_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      const txt = await res.text();
      return { error: `Firecrawl ${res.status}: ${txt.slice(0, 200)}`, results: [] };
    }
    const json = await res.json();
    const items: any[] = json?.data?.news ?? json?.data?.web ?? json?.data ?? [];
    const todayIso = new Date().toISOString().slice(0, 10);
    const results = items.map((it: any) => {
      const rawUrl = it.url ?? it.link ?? it.sourceURL ?? "";
      const url = normalizeUrl(rawUrl);
      const host = hostnameOf(url);
      const rawDate = it.date ?? it.publishedDate ?? it.published_at ?? it.published ?? it.metadata?.publishedTime ?? it.metadata?.date ?? null;
      const iso = toIsoDate(rawDate) ?? todayIso;
      const author = it.author ?? it.metadata?.author ?? null;
      const authors = author ? [String(author)] : [];
      const venue = it.source ?? it.metadata?.siteName ?? host ?? null;
      const title = it.title ?? it.metadata?.title ?? url ?? "Untitled";
      return {
        source: "news" as const,
        title,
        authors,
        year: iso ? Number(iso.slice(0, 4)) : null,
        published_date: iso,
        venue,
        cited_by_count: 0,
        open_access: true,
        link: url,
        favicon: host ? `https://www.google.com/s2/favicons?domain=${host}&sz=64` : null,
        language: null,
        abstract: it.description ?? it.snippet ?? it.markdown ?? "",
        citation: formatHarvardNews({ authors, isoDate: iso, title, venue, url }),
      };
    }).filter((r: any) => r.link);
    return { total: results.length, results };
  } catch (e) {
    return { error: (e as Error).message, results: [] };
  } finally {
    clearTimeout(t);
  }
}

function stripUiMarkup(value: any) {
  return typeof value === "string"
    ? value
      .replace(/^\s*json\s*/i, "")
      .replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, "$2")
      .replace(/[\*`_]+/g, "")
      .trim()
    : value;
}

function extractJsonObject(raw: string) {
  let cleaned = raw
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "")
    .replace(/^\s*json\s*/i, "")
    .trim();

  if (!cleaned.startsWith("{")) {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) cleaned = cleaned.slice(start, end + 1);
  }

  return JSON.parse(cleaned);
}

function deterministicPayload(prompt: string, candidates: any[], rawIntro?: string) {
  const todayIso = new Date().toISOString().slice(0, 10);
  const results = candidates.slice(0, 5).map((r) => {
    const link = normalizeUrl(stripUiMarkup(r.link) || "");
    const host = hostnameOf(link);
    const title = stripUiMarkup(r.title) || "Bron zonder titel";
    const authors = Array.isArray(r.authors) ? r.authors.slice(0, 6).map(stripUiMarkup).filter(Boolean) : [];
    const venue = stripUiMarkup(r.venue) || host || null;
    const source = r.source === "news" ? "news" : "scholar";
    const published_date = toIsoDate(r.published_date) ?? (source === "news" ? todayIso : null);
    const year = typeof r.year === "number" ? r.year : (published_date ? Number(published_date.slice(0, 4)) : null);
    const citation = source === "news"
      ? formatHarvardNews({ authors, isoDate: published_date, title, venue, url: link })
      : formatHarvardScholar({ authors, year, title, venue, url: link });
    return {
      title, authors, year, venue,
      cited_by_count: Number(r.cited_by_count || 0),
      open_access: Boolean(r.open_access),
      link,
      favicon: r.favicon ?? (host ? `https://www.google.com/s2/favicons?domain=${host}&sz=64` : null),
      reason: stripUiMarkup(r.abstract) || `Deze bron sluit aan op de zoekvraag: ${prompt}`,
      citation,
      source,
      published_date,
    };
  });


  return {
    intro: results.length
      ? "Ik heb de meest relevante bronnen hieronder gezet."
      : stripUiMarkup(rawIntro) || "Ik kon geen betrouwbare bronnen vinden voor deze zoekvraag.",
    results,
    comparison: results.length
      ? "De bronnen zijn geselecteerd op relevantie voor je vraag. Studies komen uit OpenAlex; nieuwsbronnen komen uit web-search."
      : "Er waren onvoldoende betrouwbare resultaten om te vergelijken.",
    followUps: [
      "Zoek alleen wetenschappelijke studies over dit onderwerp",
      "Zoek alleen recente nieuwsartikelen over dit onderwerp",
      "Vergelijk de belangrijkste bronnen inhoudelijk",
    ],
  };
}

// ============== Agent loop ==============
const PLANNER_SYSTEM = `Je bent Scholar AI, een onderzoeksagent. Je doel: voor de gebruiker zo grondig mogelijk relevante bronnen vinden.

JE HEBT TWEE TOOLS:
- search_scholar: doorzoekt OpenAlex (wetenschappelijke publicaties). Resultaten kunnen in alle talen zijn — sta standaard Engels en Nederlands toe, tenzij de gebruiker expliciet een andere taal vraagt.
- search_news: doorzoekt actuele nieuwsartikelen op het web via Firecrawl. Ondersteunt site:, after:YYYY-MM-DD, before:YYYY-MM-DD via query, en losse from_date/to_date/source_site velden.

ROUTING:
- Vraagt de gebruiker om studies / onderzoek / papers → gebruik alleen search_scholar.
- Vraagt om nieuwsartikelen / artikelen uit kranten / actualiteit → gebruik alleen search_news.
- Vraagt om "bronnen" of breed onderzoek → gebruik beide tools.

INTELLIGENTIE:
- Verzin zelf synoniemen, gerelateerde termen, en parallelle vertalingen (EN ↔ NL) om Scholar breed af te zoeken.
- Doe meerdere zoekrondes (tot 5) met verschillende query-varianten als de eerste ronde dun of off-topic is.
- Combineer resultaten en verwijder duidelijke duplicaten op basis van titel/link.
- Respecteer expliciete jaar-, auteur-, titel-, of bronfilters van de gebruiker letterlijk.

NA ZOEKEN:
- Roep GEEN tool meer aan zodra je voldoende kwalitatieve resultaten hebt.
- Antwoord dan met STRICT JSON (geen markdown, geen code fences, geen sterretjes of backticks):
{
  "intro": string,
  "results": [
    {
      "title": string,
      "authors": string[],
      "year": number | null,
      "venue": string | null,
      "cited_by_count": number,
      "open_access": boolean,
      "link": string,
      "reason": string,
      "citation": string,
      "source": "scholar" | "news",
      "published_date": string | null
    }
  ],
  "comparison": string,
  "followUps": [string, string, string]
}

REGELS:
- Selecteer 5 resultaten (of het door de gebruiker gevraagde aantal).
- Gebruik ALLEEN bronnen die in tool-resultaten verschenen. Verzin niets.
- Geen markdown-syntax (*, **, _, \`, [..](..)) in welke string dan ook.
- Alle UI-tekst (intro, reason, comparison, followUps) in het Nederlands.`;

const TOOLS = [
  {
    type: "function",
    function: {
      name: "search_scholar",
      description: "Zoek wetenschappelijke publicaties via OpenAlex. Standaard talen: en + nl.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Zoekzin, bij voorkeur 2-8 kernwoorden" },
          from_year: { type: "number" },
          to_year: { type: "number" },
          languages: { type: "array", items: { type: "string" }, description: "ISO-codes, bv. ['en','nl']" },
          max: { type: "number", description: "1-25, default 15" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_news",
      description: "Zoek nieuwsartikelen op het web via Firecrawl. Ondersteunt datum- en bronfilters.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string" },
          from_date: { type: "string", description: "YYYY-MM-DD" },
          to_date: { type: "string", description: "YYYY-MM-DD" },
          source_site: { type: "string", description: "bv. nrc.nl, nytimes.com" },
          tbs: { type: "string", enum: ["qdr:d", "qdr:w", "qdr:m", "qdr:y"] },
          max: { type: "number" },
        },
        required: ["query"],
      },
    },
  },
];

async function runTool(name: string, args: any) {
  if (name === "search_scholar") return await openAlexSearch(args);
  if (name === "search_news") return await firecrawlNewsSearch(args);
  return { error: `Onbekende tool: ${name}` };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (!LOVABLE_API_KEY) {
    return new Response(JSON.stringify({ error: "Missing LOVABLE_API_KEY" }), { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });
  }

  try {
    const body = await req.json();
    const incoming: Array<{ role: string; content: string }> = body.messages || [];
    const lastUser = [...incoming].reverse().find((m) => m.role === "user");
    const prompt = (lastUser?.content || "").trim();
    if (!prompt) {
      return new Response(JSON.stringify({ error: "Prompt required" }), { status: 400, headers: { ...CORS, "Content-Type": "application/json" } });
    }

    // Build conversation: history (text only) + system + current user
    const history = incoming
      .filter((m) => m.role === "user" || m.role === "assistant")
      .slice(-10)
      .map((m) => ({ role: m.role, content: m.content }));

    const convo: any[] = [
      { role: "system", content: PLANNER_SYSTEM },
      ...history,
    ];

    const allResults: any[] = [];
    const seenLinks = new Set<string>();
    const searchLog: Array<{ tool: string; args: any; count: number }> = [];

    const MAX_ROUNDS = 6; // up to ~5 tool calls + final answer
    for (let round = 0; round < MAX_ROUNDS; round++) {
      const isLastRound = round === MAX_ROUNDS - 1;
      const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: convo,
          tools: isLastRound ? undefined : TOOLS,
          tool_choice: isLastRound ? undefined : "auto",
          ...(isLastRound ? { response_format: { type: "json_object" } } : {}),
          stream: false,
        }),
      });

      if (aiRes.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit bereikt. Probeer het later opnieuw." }), { status: 429, headers: { ...CORS, "Content-Type": "application/json" } });
      }
      if (aiRes.status === 402) {
        return new Response(JSON.stringify({ error: "Geen AI credits meer in de workspace." }), { status: 402, headers: { ...CORS, "Content-Type": "application/json" } });
      }
      if (!aiRes.ok) {
        const txt = await aiRes.text();
        return new Response(JSON.stringify({ error: `AI gateway ${aiRes.status}: ${txt.slice(0, 400)}` }), { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });
      }

      const aiJson = await aiRes.json();
      const msg = aiJson.choices?.[0]?.message;
      if (!msg) break;

      const toolCalls = msg.tool_calls;
      if (toolCalls && toolCalls.length && !isLastRound) {
        convo.push({ role: "assistant", content: msg.content ?? "", tool_calls: toolCalls });
        for (const call of toolCalls) {
          let args: any = {};
          try { args = JSON.parse(call.function?.arguments ?? "{}"); } catch { /* ignore */ }
          const result = await runTool(call.function?.name, args);
          // Deduplicate & accumulate
          const items = (result?.results ?? []) as any[];
          for (const r of items) {
            const key = (r.link || r.title || "").toString().toLowerCase();
            if (key && !seenLinks.has(key)) { seenLinks.add(key); allResults.push(r); }
          }
          searchLog.push({ tool: call.function?.name, args, count: items.length });
          // Trim payload sent back to model
          const trimmed = {
            ...(result?.error ? { error: result.error } : {}),
            total: result?.total,
            results: items.slice(0, 12).map((r: any) => ({
              source: r.source,
              title: r.title,
              authors: r.authors,
              year: r.year,
              venue: r.venue,
              cited_by_count: r.cited_by_count,
              link: r.link,
              language: r.language,
              published_date: r.published_date ?? null,
              abstract: (r.abstract || "").slice(0, 300),
            })),
          };
          convo.push({
            role: "tool",
            tool_call_id: call.id,
            content: JSON.stringify(trimmed),
          });
        }
        continue;
      }

      // No more tool calls → final JSON answer expected
      const raw = msg.content ?? "{}";
      let payload: any;
      try { payload = extractJsonObject(raw); } catch { payload = deterministicPayload(prompt, allResults, raw); }

      payload.intro = stripUiMarkup(payload.intro) || "";
      payload.comparison = stripUiMarkup(payload.comparison) || "";
      payload.followUps = Array.isArray(payload.followUps) ? payload.followUps.map(stripUiMarkup).filter(Boolean).slice(0, 3) : [];
      payload.results = Array.isArray(payload.results) ? payload.results.map((r: any) => {
        const link = normalizeUrl(stripUiMarkup(r.link));
        const host = hostnameOf(link);
        const match = allResults.find((c) => (c.link || "").toLowerCase() === link.toLowerCase()) ||
          allResults.find((c) => (c.title || "").toLowerCase() === String(r.title || "").toLowerCase());
        const source = r.source === "news" ? "news" : (match?.source ?? "scholar");
        const published_date = toIsoDate(r.published_date) ?? match?.published_date ?? (source === "news" ? new Date().toISOString().slice(0, 10) : null);
        const title = stripUiMarkup(r.title) || match?.title || "Bron zonder titel";
        const venue = stripUiMarkup(r.venue) || match?.venue || host;
        const authors = Array.isArray(r.authors) && r.authors.length ? r.authors.map(stripUiMarkup).filter(Boolean) : (match?.authors ?? []);
        const year = typeof r.year === "number" ? r.year : (published_date ? Number(published_date.slice(0, 4)) : (match?.year ?? null));
        // Always overwrite the citation with a server-built Harvard string so we control the format.
        const citation = source === "news"
          ? formatHarvardNews({ authors, isoDate: published_date, title, venue, url: link })
          : formatHarvardScholar({ authors, year, title, venue, url: link });
        return {
          ...r,
          title,
          authors,
          year,
          venue,
          link,
          reason: stripUiMarkup(r.reason),
          citation,
          published_date,
          favicon: match?.favicon ?? (host ? `https://www.google.com/s2/favicons?domain=${host}&sz=64` : null),
          source,
        };
      }).filter((r: any) => r.title && r.link).slice(0, 8) : [];

      if (!payload.results.length && allResults.length) payload = deterministicPayload(prompt, allResults, payload.intro);

      return new Response(JSON.stringify({
        ...payload,
        search: { rounds: searchLog.length, log: searchLog, totalCandidates: allResults.length },
      }), { headers: { ...CORS, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ intro: "Geen antwoord kunnen formuleren.", results: [], comparison: "", followUps: [], search: { rounds: searchLog.length, log: searchLog } }), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });
  }
});
