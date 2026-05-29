// Soft answer-correction utilities for study modes.
// - "correct": exact match (after normalization)
// - "partial": within 1-2 character deviations (Levenshtein) — shown in orange
// - "wrong": more than 2 deviations, or substring-only / too short

export type AnswerVerdict = "correct" | "partial" | "wrong";

function normalize(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip diacritics
    .replace(/\s+/g, " ");
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const dp = Array.from({ length: a.length + 1 }, (_, i) => i);
  for (let j = 1; j <= b.length; j++) {
    let prev = dp[0];
    dp[0] = j;
    for (let i = 1; i <= a.length; i++) {
      const tmp = dp[i];
      dp[i] = Math.min(
        dp[i] + 1,            // deletion
        dp[i - 1] + 1,        // insertion
        prev + (a[i - 1] === b[j - 1] ? 0 : 1) // substitution
      );
      prev = tmp;
    }
  }
  return dp[a.length];
}

export function checkAnswer(user: string, correct: string): { verdict: AnswerVerdict; distance: number } {
  const u = normalize(user);
  const c = normalize(correct);
  if (!u) return { verdict: "wrong", distance: c.length };
  if (u === c) return { verdict: "correct", distance: 0 };

  // Reject substring "stubs" (e.g. "La P" for "La Paz") — must be near-complete.
  // Require user answer to be at least 80% of the correct length before allowing fuzzy.
  if (u.length < Math.max(3, Math.floor(c.length * 0.8))) {
    return { verdict: "wrong", distance: Math.max(c.length - u.length, levenshtein(u, c)) };
  }

  const d = levenshtein(u, c);
  if (d <= 2) return { verdict: "partial", distance: d };
  return { verdict: "wrong", distance: d };
}

// Returns an array of character diff segments comparing user answer to correct,
// based on character-level LCS. Used to render partial answers in orange with
// the differing letters highlighted.
export type DiffSeg = { text: string; type: "same" | "missing" | "extra" };

export function diffSegments(user: string, correct: string): DiffSeg[] {
  const a = user;
  const b = correct;
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1].toLowerCase() === b[j - 1].toLowerCase()
        ? dp[i - 1][j - 1] + 1
        : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  const segs: DiffSeg[] = [];
  let i = m, j = n;
  const push = (type: DiffSeg["type"], ch: string) => {
    const last = segs[0];
    if (last && last.type === type) last.text = ch + last.text;
    else segs.unshift({ type, text: ch });
  };
  while (i > 0 && j > 0) {
    if (a[i - 1].toLowerCase() === b[j - 1].toLowerCase()) {
      push("same", b[j - 1]); i--; j--;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      push("extra", a[i - 1]); i--;
    } else {
      push("missing", b[j - 1]); j--;
    }
  }
  while (i > 0) { push("extra", a[i - 1]); i--; }
  while (j > 0) { push("missing", b[j - 1]); j--; }
  return segs;
}
