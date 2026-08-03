/**
 * Heuristic photo caption: pick a short, concrete sentence from the abstract
 * that is distinct from the editorial headline / bottom line.
 */

const MIN_WORDS = 8;
const MAX_WORDS = 32;
const MAX_CHARS = 180;

/** Prefer finding / magnitude language. */
const FINDING_RE =
  /\b(\d+(\.\d+)?%?|ci\b|p\s*[=<>]|odds ratio|hazard ratio|relative risk|reduced|reduction|increased|decrease|decreased|lower|higher|fewer|more|significant|associated|compared with|versus|vs\.?)\b/i;

/** Skip boilerplate abstract openers. */
const BOILERPLATE_RE =
  /^(background|objective|objectives|purpose|methods|methodology|introduction|aim|aims|context)\b/i;

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

function tokenize(text: string): Set<string> {
  return new Set(
    normalize(text)
      .split(" ")
      .filter((w) => w.length > 2)
  );
}

/** Jaccard overlap on content words — high means near-duplicate. */
function overlapScore(a: string, b: string): number {
  const A = tokenize(a);
  const B = tokenize(b);
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const w of A) if (B.has(w)) inter += 1;
  return inter / (A.size + B.size - inter);
}

function splitSentences(text: string): string[] {
  const cleaned = text
    .replace(/\s+/g, " ")
    .replace(/…$/, "")
    .trim();
  if (!cleaned) return [];

  // Split on sentence enders; keep abbreviations rough (e.g. vs. e.g.) out of the way.
  const parts = cleaned.split(/(?<=[.!?])\s+(?=[A-Z(“"])/);
  return parts
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => s.replace(/\s+/g, " "));
}

function trimToWordBudget(sentence: string): string {
  let s = sentence.trim();
  if (s.length > MAX_CHARS) {
    const cut = s.slice(0, MAX_CHARS);
    const lastSpace = cut.lastIndexOf(" ");
    s = (lastSpace > 40 ? cut.slice(0, lastSpace) : cut).trim();
    if (!/[.!?]"?$/.test(s)) s = `${s}…`;
  }
  const words = s.split(/\s+/);
  if (words.length > MAX_WORDS) {
    s = `${words.slice(0, MAX_WORDS).join(" ")}…`;
  }
  return s;
}

function scoreSentence(sentence: string): number {
  const words = wordCount(sentence);
  if (words < MIN_WORDS || words > MAX_WORDS + 8) return -1;
  if (BOILERPLATE_RE.test(sentence)) return -1;

  let score = 0;
  if (FINDING_RE.test(sentence)) score += 3;
  if (/\d/.test(sentence)) score += 2;
  if (/%/.test(sentence)) score += 1.5;
  // Prefer mid-length captions.
  if (words >= 12 && words <= 24) score += 1;
  // Soft penalty for very long.
  if (words > 28) score -= 1;
  // Results-section vibe.
  if (/^results?\b/i.test(sentence)) score += 0.5;
  return score;
}

export type PhotoQuoteFields = {
  abstractSnippet?: string | null;
  bottomLine?: string | null;
  headline?: string | null;
  results?: string | null;
};

/**
 * Returns a caption-worthy abstract sentence, or null if nothing unique enough.
 */
export function pickPhotoQuote(item: PhotoQuoteFields): string | null {
  const raw = item.abstractSnippet?.trim();
  if (!raw) return null;

  const avoid = [item.bottomLine, item.headline, item.results]
    .filter((s): s is string => Boolean(s?.trim()))
    .map((s) => s.trim());

  const sentences = splitSentences(raw);
  let best: { text: string; score: number } | null = null;

  for (let i = 0; i < sentences.length; i++) {
    const sentence = sentences[i]!;
    // Drop truncated trailing fragment from the snippet cut.
    if (/…$/.test(sentence) && wordCount(sentence) < 12) continue;

    let score = scoreSentence(sentence);
    if (score < 0) continue;
    // Prefer later sentences (findings usually follow background/methods).
    score += Math.min(1.5, i * 0.35);

    const tooSimilar = avoid.some((a) => overlapScore(sentence, a) >= 0.45);
    if (tooSimilar) continue;

    // Also reject if normalized equality / containment of bottom line.
    const n = normalize(sentence);
    if (avoid.some((a) => {
      const na = normalize(a);
      return n === na || n.includes(na) || na.includes(n);
    })) {
      continue;
    }

    if (!best || score > best.score) {
      best = { text: trimToWordBudget(sentence), score };
    }
  }

  return best?.text ?? null;
}
