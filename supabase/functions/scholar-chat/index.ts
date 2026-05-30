// deno-lint-ignore-file no-explicit-any
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
}

const STOP = new Set([
  "the","and","for","with","from","that","this","what","which","show","find",
  "give","papers","articles","studies","research","recent","best","top","most",
  "about","into","using","between","compare","comparison","since","after","before",
  "newer","older","from","onwards","or",
]);

function keywords(text: string) {
  return [...new Set(text.toLowerCase().match(/[a-z0-9]{3,}/g) ?? [])].filter((t) => !STOP.has(t));
}

function compactQuery(prompt: string) {
  return keywords(prompt).slice(0, 12).join(" ") || prompt.trim();
}

function reconstructAbstract(idx?: Record<string, number[]> | null) {
  if (!idx) return "";
  const positions: { pos: number; word: string }[] = [];
  for (const [word, posArr] of Object.entries(idx)) {
    for (const pos of posArr) positions.push({ pos, word });
  }
  return positions.sort((a, b) => a.pos - b.pos).map((p) => p.word).join(" ").slice(0, 900);
}

function extractRequestedCount(prompt: string) {
  const m = prompt.match(/\b(?:top|best|show|find|give|return|list)\s+(\d{1,2})\b/i)?.[1];
  return m ? Math.min(Math.max(Number(m), 1), 20) : 5;
}

/**
 * Detect year filter from the prompt. Supports:
 *   "since 2022", "from 2022", "after 2022", "newer than 2022",
 *   "2022 or newer", "2022 onwards", "published in 2023",
 *   "between 2018 and 2022", "before 2010".
 * Returns OpenAlex filter parts.
 */
function extractYearFilter(prompt: string): { filter: string | null; descr: string | null } {
  const p = prompt.toLowerCase();
  const currentYear = new Date().getUTCFullYear();

  // between X and Y
  const between = p.match(/between\s+(\d{4})\s+and\s+(\d{4})/);
  if (between) {
    const lo = Math.min(+between[1], +between[2]);
    const hi = Math.max(+between[1], +between[2]);
    return { filter: `from_publication_date:${lo}-01-01,to_publication_date:${hi}-12-31`, descr: `${lo}–${hi}` };
  }

  // "since/from/after YYYY", "YYYY or newer/later", "YYYY onwards", "newer than YYYY"
  const newer = p.match(/(?:since|from|after|newer than|>\s*|>=\s*)\s*(\d{4})/) ||
                p.match(/(\d{4})\s*(?:or\s+newer|or\s+later|onwards|onward|and\s+newer|and\s+later)/);
  if (newer) {
    const y = +newer[1];
    return { filter: `from_publication_date:${y}-01-01`, descr: `${y} or newer` };
  }

  // "before YYYY" / "older than YYYY"
  const older = p.match(/(?:before|older than|<\s*)\s*(\d{4})/);
  if (older) {
    const y = +older[1] - 1;
    return { filter: `to_publication_date:${y}-12-31`, descr: `before ${+older[1]}` };
  }

  // "in YYYY" / "published in YYYY"
  const inYear = p.match(/(?:^|\s)(?:in|published in|year)\s+(\d{4})\b/);
  if (inYear) {
    const y = +inYear[1];
    if (y >= 1800 && y <= currentYear + 1) {
      return { filter: `from_publication_date:${y}-01-01,to_publication_date:${y}-12-31`, descr: `${y}` };
    }
  }

  // bare "YYYY" near the end of the prompt (e.g. "...studies 2024")
  const bare = p.match(/\b(20\d{2}|19\d{2})\b/);
  if (bare) {
    const y = +bare[1];
    if (y >= 1900 && y <= currentYear + 1) {
      return { filter: `from_publication_date:${y}-01-01`, descr: `${y} or newer` };
    }
  }

  return { filter: null, descr: null };
}

async function searchOpenAlex(prompt: string) {
  const query = compactQuery(prompt);
  const year = extractYearFilter(prompt);
  const params = new URLSearchParams({
    search: query,
    "per-page": "25",
    select: "id,doi,title,publication_year,cited_by_count,open_access,authorships,primary_location,abstract_inverted_index",
    mailto: "scholar@lovable.app",
  });
  if (year.filter) params.set("filter", year.filter);
  const url = `https://api.openalex.org/works?${params.toString()}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  let json: { meta?: { count?: number }; results?: OAWork[] } = {};
  try {
    const res = await fetch(url, { headers: { Accept: "application/json" }, signal: controller.signal });
    if (!res.ok) throw new Error(`OpenAlex ${res.status}`);
    json = await res.json();
  } finally {
    clearTimeout(timeout);
  }

  const tokens = keywords(prompt);
  const currentYear = new Date().getUTCFullYear();
  const results = (json.results ?? []).map((w) => {
    const title = w.title ?? "Untitled";
    const abstract = reconstructAbstract(w.abstract_inverted_index);
    const haystack = `${title} ${abstract}`.toLowerCase();
    const kw = tokens.reduce((s, t) => s + (haystack.includes(t) ? 1 : 0), 0);
    const tw = tokens.reduce((s, t) => s + (title.toLowerCase().includes(t) ? 1 : 0), 0);
    const rec = w.publication_year ? Math.max(0, 12 - (currentYear - w.publication_year)) / 12 : 0;
    const cit = Math.log10((w.cited_by_count ?? 0) + 1) / 5;
    return {
      id: w.id,
      title,
      year: w.publication_year,
      authors: (w.authorships ?? []).slice(0, 6).map((a) => a.author?.display_name).filter(Boolean) as string[],
      venue: w.primary_location?.source?.display_name ?? null,
      cited_by_count: w.cited_by_count ?? 0,
      open_access: w.open_access?.is_oa ?? false,
      doi: w.doi,
      link: w.doi ?? w.primary_location?.landing_page_url ?? w.id,
      abstract,
      relevance_score: kw * 3 + tw * 2 + cit + rec,
    };
  });
  results.sort((a, b) => b.relevance_score - a.relevance_score || b.cited_by_count - a.cited_by_count);
  return { query, query_url: url, year_filter: year.descr, total: json.meta?.count ?? results.length, results };
}

const SYSTEM_PROMPT = `You are Scholar AI, a precise academic search assistant.

Use ONLY the supplied scholarly search results. Never invent papers, authors, DOIs, links, or result counts.

When a user requests papers from a specific year or newer (e.g. "since 2022", "from 2020 onwards", "after 2019"), the search has ALREADY been filtered by year on the server. Trust the filter and never include papers outside it. If the user asks for a specific year, mention it.

Default behavior:
- Compare the entire supplied candidate set.
- Pick the top 5 papers most specifically suited to the user's prompt unless another number is requested.
- If no candidates are supplied, answer from the user's query only and say no indexed matches were returned.

Answer format:
1. Start with one sentence explaining what was searched (mention any year filter) and how many candidate matches were found.
2. Give a numbered list of the selected papers: **Title** — authors (year), venue. Include why it suits the prompt, citations, OA status, and the link.
3. Include a short comparison paragraph explaining why these were selected over the other matches.
4. End with exactly one line: "Would you like more details on: [option 1] | [option 2] | [option 3]".`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  try {
    const body = await req.json();
    const messages: Array<{ role: string; content: string }> = body.messages || [];
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    const prompt = (lastUser?.content || "").trim();
    if (!prompt) return new Response(JSON.stringify({ error: "Prompt required" }), { status: 400, headers: { ...CORS, "Content-Type": "application/json" } });

    const search = await searchOpenAlex(prompt);
    const selectedCount = extractRequestedCount(prompt);
    const selected = search.results.slice(0, selectedCount);

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "Missing LOVABLE_API_KEY" }), { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });
    }

    const userPayload = {
      userPrompt: prompt,
      searchQuery: search.query,
      yearFilter: search.year_filter,
      totalIndexedMatches: search.total,
      comparedCandidateCount: search.results.length,
      requestedAnswerCount: selectedCount,
      selectedResults: selected,
      otherComparedResults: search.results.slice(selectedCount, 25).map((r) => ({
        title: r.title, year: r.year, cited_by_count: r.cited_by_count, relevance_score: r.relevance_score,
      })),
    };

    const aiHistory = messages
      .filter((m) => m.role === "user" || m.role === "assistant")
      .slice(-8)
      .map((m) => ({ role: m.role, content: m.content }));
    aiHistory[aiHistory.length - 1] = { role: "user", content: JSON.stringify(userPayload) };

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "system", content: SYSTEM_PROMPT }, ...aiHistory],
        stream: false,
      }),
    });

    if (!aiRes.ok) {
      const txt = await aiRes.text();
      return new Response(JSON.stringify({ error: `AI gateway ${aiRes.status}: ${txt.slice(0, 400)}` }), { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });
    }
    const aiJson = await aiRes.json();
    const text = aiJson.choices?.[0]?.message?.content ?? "";

    return new Response(JSON.stringify({
      text,
      search: { query: search.query, yearFilter: search.year_filter, total: search.total, returned: selected.length },
    }), { headers: { ...CORS, "Content-Type": "application/json" } });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });
  }
});
