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
    const results = (json.results ?? []).map((w) => ({
      source: "scholar" as const,
      title: w.title ?? "Untitled",
      authors: (w.authorships ?? []).slice(0, 6).map((a) => a.author?.display_name).filter(Boolean) as string[],
      year: w.publication_year,
      venue: w.primary_location?.source?.display_name ?? null,
      cited_by_count: w.cited_by_count ?? 0,
      open_access: w.open_access?.is_oa ?? false,
      link: w.doi ?? w.primary_location?.landing_page_url ?? w.id,
      language: w.language ?? null,
      abstract: reconstructAbstract(w.abstract_inverted_index).slice(0, 500),
    }));
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
    const results = items.map((it: any) => {
      const rawUrl = it.url ?? it.link ?? it.sourceURL ?? "";
      const url = normalizeUrl(rawUrl);
      const host = hostnameOf(url);
      const dateStr = it.date ?? it.publishedDate ?? it.published_at ?? null;
      return {
        source: "news" as const,
        title: it.title ?? url ?? "Untitled",
        authors: it.author ? [String(it.author)] : [],
        year: dateStr ? new Date(dateStr).getUTCFullYear() : null,
        published_date: dateStr,
        venue: it.source ?? host,
        cited_by_count: 0,
        open_access: true,
        link: url,
        favicon: host ? `https://www.google.com/s2/favicons?domain=${host}&sz=64` : null,
        language: null,
        abstract: it.description ?? it.snippet ?? it.markdown ?? "",
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
  const results = candidates.slice(0, 5).map((r) => {
    const link = normalizeUrl(stripUiMarkup(r.link) || "");
    const host = hostnameOf(link);
    return {
      title: stripUiMarkup(r.title) || "Bron zonder titel",
      authors: Array.isArray(r.authors) ? r.authors.slice(0, 6).map(stripUiMarkup).filter(Boolean) : [],
      year: typeof r.year === "number" ? r.year : null,
      venue: stripUiMarkup(r.venue) || host || null,
      cited_by_count: Number(r.cited_by_count || 0),
      open_access: Boolean(r.open_access),
      link,
      favicon: r.favicon ?? (host ? `https://www.google.com/s2/favicons?domain=${host}&sz=64` : null),
      reason: stripUiMarkup(r.abstract) || `Deze bron sluit aan op de zoekvraag: ${prompt}`,
      citation: `${Array.isArray(r.authors) && r.authors.length ? `${r.authors.slice(0, 3).join(", ")} ` : ""}${r.year ? `(${r.year}). ` : ""}${r.title || "Bron zonder titel"}.${r.venue ? ` ${r.venue}.` : ""}`,
      source: r.source === "news" ? "news" : "scholar",
      published_date: r.published_date ?? null,
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
      payload.results = Array.isArray(payload.results) ? payload.results.map((r: any) => ({
        ...r,
        title: stripUiMarkup(r.title),
        reason: stripUiMarkup(r.reason),
        citation: stripUiMarkup(r.citation),
        venue: stripUiMarkup(r.venue),
        link: stripUiMarkup(r.link),
        source: r.source === "news" ? "news" : "scholar",
      })).filter((r: any) => r.title && r.link).slice(0, 8) : [];

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
