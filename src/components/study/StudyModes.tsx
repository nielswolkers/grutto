// Kaarten / Leren / Oefentoets — logic ported 1:1 from flip-flash-study-club, styled for Grutto.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight, Maximize2, Minimize2, Shuffle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Flashcard as Card } from "@/types/study";

/* ---------- helpers (from repo store) ---------- */
export function normalize(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\p{L}\p{N} ]/gu, "").replace(/\s+/g, " ").trim();
}
export function isCorrect(answer: string, expected: string) {
  const a = normalize(answer);
  if (!a) return false;
  return expected.split(/[,;/]/).map(normalize).some((e) => e === a) || normalize(expected) === a;
}
export function shuffle<T>(a: T[]): T[] {
  const r = [...a];
  for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; }
  return r;
}

type Dir = "td" | "dt";
const prompt = (c: Card, d: Dir) => (d === "td" ? c.term : c.definition);
const answer = (c: Card, d: Dir) => (d === "td" ? c.definition : c.term);

export function Progress({ value, className }: { value: number; className?: string }) {
  return (
    <div className={cn("h-2 w-full overflow-hidden rounded-full bg-muted", className)}>
      <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${Math.min(100, Math.max(0, value * 100))}%` }} />
    </div>
  );
}

function Confetti() {
  const colors = ["hsl(var(--primary))", "hsl(var(--accent))", "hsl(var(--destructive))", "hsl(var(--secondary))"];
  return (
    <div className="pointer-events-none fixed inset-0 z-[200] overflow-hidden">
      {Array.from({ length: 60 }).map((_, i) => (
        <span key={i} className="absolute -top-4 h-3 w-2 rounded-sm"
          style={{ left: `${(i * 37) % 100}%`, background: colors[i % 4], animation: `study-confetti ${1.8 + (i % 7) * 0.25}s ${(i % 10) * 0.08}s ease-in forwards` }} />
      ))}
    </div>
  );
}

function DirToggle({ dir, setDir }: { dir: Dir; setDir: (d: Dir) => void }) {
  return (
    <div className="inline-flex rounded-full bg-muted border p-1 text-sm font-medium">
      {(["td", "dt"] as Dir[]).map((d) => (
        <button key={d} onClick={() => setDir(d)} className={cn("rounded-full px-4 py-1.5 transition", dir === d ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground")}>
          {d === "td" ? "Antwoord met definitie" : "Antwoord met term"}
        </button>
      ))}
    </div>
  );
}

function Done({ title, sub, onRestart, onBack }: { title: string; sub: string; onRestart: () => void; onBack: () => void }) {
  return (
    <div className="animate-rise rounded-3xl border bg-card p-10 text-center shadow-sm">
      <Confetti />
      <div className="text-6xl">🎉</div>
      <h2 className="mt-4 text-3xl font-bold">{title}</h2>
      <p className="mt-2 text-muted-foreground">{sub}</p>
      <div className="mt-6 flex justify-center gap-3">
        <Button className="rounded-full" onClick={onRestart}>Opnieuw oefenen</Button>
        <Button variant="outline" className="rounded-full" onClick={onBack}>Terug naar set</Button>
      </div>
    </div>
  );
}

/* ---------------- Kaarten ---------------- */
export function Kaarten({ cards, onBack }: { cards: Card[]; onBack: () => void }) {
  const [order, setOrder] = useState(() => cards.map((c) => c.id));
  const [i, setI] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [anim, setAnim] = useState<"" | "left" | "right">("");
  const [full, setFull] = useState(false);
  const byId = useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards]);
  const deck = order.map((id) => byId.get(id)).filter((c): c is Card => !!c);
  const card = deck[i];
  const done = i >= deck.length;

  const go = useCallback((delta: number) => {
    setAnim(delta > 0 ? "left" : "right");
    setTimeout(() => {
      setFlipped(false);
      setI((x) => Math.max(0, Math.min(deck.length, x + delta)));
      setAnim("");
    }, 180);
  }, [deck.length]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.code === "Space") { e.preventDefault(); setFlipped((f) => !f); }
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft" && i > 0) go(-1);
      if (e.key === "Escape" && full) exitFull();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onChange = () => { if (!document.fullscreenElement) setFull(false); };
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const enterFull = () => { setFull(true); document.documentElement.requestFullscreen?.().catch(() => {}); };
  function exitFull() { setFull(false); if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {}); }

  const body = done ? (
    <Done title="Je hebt alle kaarten bekeken" sub="Goed bezig. Nog een rondje?" onRestart={() => setI(0)} onBack={() => { exitFull(); onBack(); }} />
  ) : (
    <div>
      <div className="perspective">
        <button
          onClick={() => setFlipped((f) => !f)}
          className={cn("relative block w-full preserve-3d transition-all duration-500", full ? "h-[60vh]" : "h-96",
            flipped && "rotate-y-180",
            anim === "left" && "-translate-x-16 opacity-0", anim === "right" && "translate-x-16 opacity-0")}
          style={{ transformStyle: "preserve-3d" }}
        >
          {[card.term, card.definition].map((text, side) => (
            <div key={side} className={cn("absolute inset-0 grid place-items-center rounded-3xl border bg-card p-8 shadow-sm backface-hidden", side === 1 && "rotate-y-180")}>
              <span className="absolute left-5 top-4 text-xs font-semibold uppercase text-muted-foreground">{side === 0 ? "Term" : "Definitie"}</span>
              <span className="text-center text-3xl font-semibold md:text-4xl whitespace-pre-wrap">{text}</span>
            </div>
          ))}
        </button>
      </div>
      <div className="mt-5 flex items-center justify-between">
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="rounded-full gap-2" onClick={() => { setOrder(shuffle(order)); setI(0); setFlipped(false); }}>
            <Shuffle className="w-4 h-4" /> Shuffle
          </Button>
          {!full && (
            <Button variant="outline" size="sm" className="rounded-full px-2.5" onClick={enterFull} aria-label="Volledig scherm" title="Volledig scherm">
              <Maximize2 className="w-4 h-4" />
            </Button>
          )}
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" size="icon" className="rounded-full" onClick={() => go(-1)} disabled={i === 0}><ArrowLeft className="w-4 h-4" /></Button>
          <span className="font-semibold tabular-nums">{i + 1} / {deck.length}</span>
          <Button variant="outline" size="icon" className="rounded-full" onClick={() => go(1)}><ArrowRight className="w-4 h-4" /></Button>
        </div>
        <span className="hidden text-xs text-muted-foreground md:block">Spatie om te draaien · ← →</span>
      </div>
      <Progress className="mt-4" value={(i + 1) / deck.length} />
    </div>
  );

  if (!full) return body;
  return (
    <div className="fixed inset-0 z-[100] overflow-auto bg-background">
      <Button variant="outline" size="sm" className="absolute right-6 top-6 rounded-full gap-2" onClick={exitFull}>
        <Minimize2 className="w-4 h-4" /> Sluiten
      </Button>
      <div className="mx-auto flex min-h-full max-w-5xl flex-col justify-center px-6 py-20">{body}</div>
    </div>
  );
}

/* ---------------- Shared answer input ---------------- */
function WrittenQuestion({ card, dir, onResult }: { card: Card; dir: Dir; onResult: (ok: boolean) => void }) {
  const [val, setVal] = useState("");
  const [state, setState] = useState<"ask" | "right" | "wrong">("ask");
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { setVal(""); setState("ask"); ref.current?.focus(); }, [card.id]);

  const submit = () => {
    if (state !== "ask") return onResult(state === "right");
    const ok = isCorrect(val, answer(card, dir));
    setState(ok ? "right" : "wrong");
    if (ok) setTimeout(() => onResult(true), 700);
  };

  return (
    <div className={cn("rounded-3xl border bg-card p-8 shadow-sm animate-rise", state === "wrong" && "animate-shake")} key={card.id}>
      <div className="text-xs font-semibold uppercase text-muted-foreground">{dir === "td" ? "Term" : "Definitie"}</div>
      <div className="mt-2 text-3xl font-semibold">{prompt(card, dir)}</div>
      <form onSubmit={(e) => { e.preventDefault(); submit(); }} className="mt-8">
        <input ref={ref} value={val} onChange={(e) => setVal(e.target.value)} readOnly={state !== "ask"} placeholder="Typ het antwoord"
          className={cn("w-full rounded-xl border-2 bg-background px-4 py-3 text-lg outline-none transition focus:border-primary",
            state === "right" && "border-primary bg-primary/10 animate-pop", state === "wrong" && "border-destructive bg-destructive/10")} />
        {state === "wrong" && (
          <div className="mt-4 animate-rise rounded-xl border-2 border-primary bg-primary/10 p-4">
            <div className="text-xs font-semibold uppercase text-primary">Juiste antwoord</div>
            <div className="text-lg font-semibold">{answer(card, dir)}</div>
          </div>
        )}
        <div className="mt-4 flex justify-end gap-2">
          {state === "ask" && <Button type="button" variant="ghost" className="rounded-full" onClick={() => setState("wrong")}>Weet ik niet</Button>}
          {state === "wrong" && val && <Button type="button" variant="ghost" className="rounded-full" onClick={() => onResult(true)}>Toch goed gerekend</Button>}
          <Button type="submit" className="rounded-full">{state === "ask" ? "Antwoord" : "Doorgaan"}</Button>
        </div>
      </form>
    </div>
  );
}

function ChoiceQuestion({ card, dir, pool, onResult }: { card: Card; dir: Dir; pool: Card[]; onResult: (ok: boolean) => void }) {
  const options = useMemo(() => shuffle([card, ...shuffle(pool.filter((c) => c.id !== card.id)).slice(0, 3)]), [card.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const [picked, setPicked] = useState<string | null>(null);
  useEffect(() => setPicked(null), [card.id]);
  const pick = (id: string) => {
    if (picked) return;
    setPicked(id);
    setTimeout(() => onResult(id === card.id), id === card.id ? 700 : 1500);
  };
  useEffect(() => {
    const h = (e: KeyboardEvent) => { const n = Number(e.key); if (n >= 1 && n <= options.length && !picked) pick(options[n - 1].id); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  });

  return (
    <div className="rounded-3xl border bg-card p-8 shadow-sm animate-rise" key={card.id}>
      <div className="text-xs font-semibold uppercase text-muted-foreground">{dir === "td" ? "Term" : "Definitie"}</div>
      <div className="mt-2 text-3xl font-semibold">{prompt(card, dir)}</div>
      <div className="mt-8 text-sm font-medium text-muted-foreground">Kies het juiste antwoord</div>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        {options.map((o, n) => (
          <button key={o.id} onClick={() => pick(o.id)}
            className={cn("flex items-center gap-3 rounded-xl border-2 p-4 text-left font-medium transition hover:border-primary",
              picked && o.id === card.id && "border-primary bg-primary/10 animate-pop",
              picked === o.id && o.id !== card.id && "border-destructive bg-destructive/10 animate-shake",
              picked && o.id !== card.id && picked !== o.id && "opacity-50")}>
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-muted text-sm font-semibold">{n + 1}</span>
            {answer(o, dir)}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ---------------- Leren ---------------- */
export function Leren({ cards, onBack }: { cards: Card[]; onBack: () => void }) {
  const [dir, setDir] = useState<Dir>("td");
  const init = () => Object.fromEntries(cards.map((c) => [c.id, 0])) as Record<string, number>;
  const [level, setLevel] = useState(init);
  const [queue, setQueue] = useState(() => shuffle(cards.map((c) => c.id)).slice(0, 7));
  const [roundStats, setRoundStats] = useState<{ ok: number; total: number } | null>(null);
  const [stats, setStats] = useState({ ok: 0, total: 0 });

  const mastered = Object.values(level).filter((l) => l >= 2).length;
  const card = cards.find((c) => c.id === queue[0]);

  const result = (ok: boolean) => {
    if (!card) return;
    const nl = { ...level, [card.id]: ok ? level[card.id] + 1 : Math.max(0, level[card.id] - 1) };
    setLevel(nl);
    const s = { ok: stats.ok + (ok ? 1 : 0), total: stats.total + 1 };
    setStats(s);
    const rest = queue.slice(1);
    if (rest.length === 0) {
      setRoundStats(s);
      setStats({ ok: 0, total: 0 });
      setQueue(shuffle(cards.filter((c) => nl[c.id] < 2).map((c) => c.id)).slice(0, 7));
    } else setQueue(rest);
  };
  const restart = () => { setLevel(init()); setQueue(shuffle(cards.map((c) => c.id)).slice(0, 7)); setRoundStats(null); };

  if (mastered === cards.length) return <Done title="Je beheerst alle termen!" sub={`${cards.length} termen geleerd`} onRestart={restart} onBack={onBack} />;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <DirToggle dir={dir} setDir={setDir} />
        <div className="text-sm font-semibold"><span className="text-primary">{mastered}</span> / {cards.length} beheerst</div>
      </div>
      <Progress value={mastered / cards.length} className="mb-6 h-3" />
      {roundStats ? (
        <div className="animate-rise rounded-3xl border bg-card p-10 text-center shadow-sm">
          <h2 className="text-3xl font-bold">Ronde klaar — ga zo door!</h2>
          <p className="mt-2 text-muted-foreground">{roundStats.ok} van {roundStats.total} goed deze ronde</p>
          <Button className="mt-6 rounded-full" onClick={() => setRoundStats(null)}>Door naar volgende ronde</Button>
        </div>
      ) : card && (
        level[card.id] === 0
          ? <ChoiceQuestion card={card} dir={dir} pool={cards} onResult={result} />
          : <WrittenQuestion card={card} dir={dir} onResult={result} />
      )}
    </div>
  );
}

/* ---------------- Oefentoets ---------------- */
type Q = { card: Card; kind: "written" | "mc" | "tf"; options?: Card[]; shown?: Card };
export function Oefentoets({ cards }: { cards: Card[] }) {
  const [dir, setDir] = useState<Dir>("td");
  const [count, setCount] = useState(Math.min(10, cards.length));
  const [kinds, setKinds] = useState({ written: true, mc: true, tf: true });
  const [qs, setQs] = useState<Q[] | null>(null);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [submitted, setSubmitted] = useState(false);

  const build = () => {
    const ks = (Object.keys(kinds) as Q["kind"][]).filter((k) => kinds[k]);
    if (!ks.length) return;
    setQs(shuffle(cards).slice(0, count).map((card, n) => {
      const kind = ks[n % ks.length];
      if (kind === "mc") return { card, kind, options: shuffle([card, ...shuffle(cards.filter((c) => c.id !== card.id)).slice(0, 3)]) };
      if (kind === "tf") return { card, kind, shown: Math.random() < 0.5 ? card : shuffle(cards.filter((c) => c.id !== card.id))[0] };
      return { card, kind };
    }));
    setAnswers({}); setSubmitted(false);
  };
  const grade = (q: Q, a = "") =>
    q.kind === "written" ? isCorrect(a, answer(q.card, dir)) : q.kind === "mc" ? a === q.card.id : a === String(q.shown!.id === q.card.id);

  if (!qs) {
    return (
      <div className="animate-rise mx-auto max-w-lg rounded-3xl border bg-card p-8 shadow-sm">
        <h2 className="text-2xl font-bold">Stel je oefentoets samen</h2>
        <label className="mt-6 flex items-center justify-between font-medium">Vragen (max {cards.length})
          <input type="number" min={1} max={cards.length} value={count} onChange={(e) => setCount(Math.max(1, Math.min(cards.length, +e.target.value)))} className="w-20 rounded-lg border-2 bg-background px-2 py-1" />
        </label>
        {([["tf", "Waar / Niet waar"], ["mc", "Meerkeuze"], ["written", "Open vraag"]] as const).map(([k, l]) => (
          <label key={k} className="mt-3 flex items-center justify-between font-medium">{l}
            <input type="checkbox" checked={kinds[k]} onChange={(e) => setKinds({ ...kinds, [k]: e.target.checked })} className="h-5 w-5 accent-primary" />
          </label>
        ))}
        <div className="mt-4"><DirToggle dir={dir} setDir={setDir} /></div>
        <Button className="mt-6 w-full rounded-full" onClick={build}>Maak oefentoets</Button>
      </div>
    );
  }

  const score = qs.filter((q, n) => grade(q, answers[n])).length;
  const answeredCount = Object.keys(answers).filter((k) => answers[+k] !== "").length;

  return (
    <div className="space-y-5">
      {submitted ? (
        <div className="animate-rise sticky top-20 z-10 flex items-center justify-between rounded-3xl bg-primary p-6 text-primary-foreground">
          {score / qs.length >= 0.8 && <Confetti />}
          <div><div className="text-4xl font-bold">{Math.round((score / qs.length) * 100)}%</div><div className="opacity-80">{score} / {qs.length} goed</div></div>
          <div className="flex gap-2">
            <Button variant="secondary" className="rounded-full" onClick={build}>Nieuwe toets</Button>
            <Button variant="outline" className="rounded-full text-foreground" onClick={() => setQs(null)}>Opties</Button>
          </div>
        </div>
      ) : (
        <Progress value={answeredCount / qs.length} className="h-3" />
      )}
      {qs.map((q, n) => {
        const ok = submitted && grade(q, answers[n]);
        return (
          <div key={n} className={cn("rounded-3xl border-2 bg-card p-6 shadow-sm animate-rise", submitted ? (ok ? "border-primary" : "border-destructive") : "border-border")} style={{ animationDelay: `${n * 40}ms` }}>
            <div className="flex justify-between text-xs font-semibold uppercase text-muted-foreground"><span>{q.kind === "tf" ? "Waar of niet waar" : q.kind === "mc" ? "Meerkeuze" : "Open vraag"}</span><span>{n + 1} van {qs.length}</span></div>
            <div className="mt-2 text-2xl font-semibold">{prompt(q.card, dir)}</div>
            {q.kind === "tf" && (
              <>
                <div className="mt-3 text-lg">= <span className="font-semibold">{answer(q.shown!, dir)}</span></div>
                <div className="mt-4 flex gap-3">
                  {[["true", "Waar"], ["false", "Niet waar"]].map(([v, l]) => (
                    <button key={v} disabled={submitted} onClick={() => setAnswers({ ...answers, [n]: v })} className={cn("flex-1 rounded-xl border-2 p-3 font-medium transition hover:border-primary", answers[n] === v && "border-primary bg-muted")}>{l}</button>
                  ))}
                </div>
              </>
            )}
            {q.kind === "mc" && (
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {q.options!.map((o) => (
                  <button key={o.id} disabled={submitted} onClick={() => setAnswers({ ...answers, [n]: o.id })}
                    className={cn("rounded-xl border-2 p-3 text-left transition hover:border-primary", answers[n] === o.id && "border-primary bg-muted", submitted && o.id === q.card.id && "border-primary bg-primary/10")}>{answer(o, dir)}</button>
                ))}
              </div>
            )}
            {q.kind === "written" && (
              <input disabled={submitted} value={answers[n] ?? ""} onChange={(e) => setAnswers({ ...answers, [n]: e.target.value })} placeholder="Typ het antwoord" className="mt-4 w-full rounded-xl border-2 bg-background px-4 py-3 outline-none focus:border-primary" />
            )}
            {submitted && !ok && <div className="mt-3 text-sm font-semibold text-primary">Juist: {answer(q.card, dir)}{q.kind === "tf" && ` → ${q.shown!.id === q.card.id ? "Waar" : "Niet waar"}`}</div>}
          </div>
        );
      })}
      {!submitted && <Button className="w-full rounded-full py-6 text-base" onClick={() => { setSubmitted(true); window.scrollTo({ top: 0, behavior: "smooth" }); }}>Toets inleveren</Button>}
    </div>
  );
}
