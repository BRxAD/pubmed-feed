/**
 * Heuristic photo caption: pick a short, concrete sentence from the abstract
 * that is distinct from the editorial headline / bottom line.
 *
 * Prefer labeled Results / Discussion; otherwise the latter 40% of the abstract.
 */

const MIN_WORDS = 8;
const MAX_WORDS = 32;
const MAX_CHARS = 180;

/** Prefer finding / magnitude language. */
const FINDING_RE =
  /\b(\d+(\.\d+)?%?|ci\b|p\s*[=<>]|odds ratio|hazard ratio|relative risk|reduced|reduction|increased|decrease|decreased|lower|higher|fewer|more|significant|associated|compared with|versus|vs\.?)\b/i;

/** Skip boilerplate abstract openers / methods framing. */
const BOILERPLATE_RE =
  /^(background|objective|objectives|purpose|methods|methodology|introduction|aim|aims|context|design|setting|participants?)\b/i;

/** Structured IMRaD-style headers (order matters for splitting). */
const SECTION_HEADER_RE =
  /\b(background|objective|objectives|purpose|introduction|methods|methodology|materials and methods|results|findings|discussion|conclusion|conclusions|conclusion\/interpretation|interpretation)\s*[:.\-–—]?\s*/gi;

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

  const parts = cleaned.split(/(?<=[.!?])\s+(?=[A-Z(“"])/);
  return parts
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) =>
      s
        .replace(
          /^(results?|findings?|discussion|conclusions?)\s*[:.\-–—]\s*/i,
          ""
        )
        .replace(/\s+/g, " ")
        .trim()
    )
    .filter(Boolean);
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
  if (words >= 12 && words <= 24) score += 1;
  if (words > 28) score -= 1;
  return score;
}

type AbstractSection = { name: string; body: string };

function parseAbstractSections(abstract: string): AbstractSection[] {
  const text = abstract.replace(/\s+/g, " ").trim();
  if (!text) return [];

  const re = new RegExp(SECTION_HEADER_RE.source, "gi");
  const hits: Array<{ name: string; index: number; end: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    hits.push({
      name: m[1]!.toLowerCase(),
      index: m.index,
      end: m.index + m[0].length,
    });
  }
  if (hits.length === 0) return [];

  const sections: AbstractSection[] = [];
  for (let i = 0; i < hits.length; i++) {
    const hit = hits[i]!;
    const bodyEnd = i + 1 < hits.length ? hits[i + 1]!.index : text.length;
    const body = text.slice(hit.end, bodyEnd).trim();
    if (body) sections.push({ name: hit.name, body });
  }
  return sections;
}

function isResultsOrDiscussion(name: string): boolean {
  return (
    name === "results" ||
    name === "findings" ||
    name === "discussion"
  );
}

/**
 * Prefer Results/Discussion bodies when labeled; otherwise latter 40% of text.
 */
function preferredQuoteSource(abstract: string): string {
  const sections = parseAbstractSections(abstract);
  const preferred = sections
    .filter((s) => isResultsOrDiscussion(s.name))
    .map((s) => s.body)
    .join(" ")
    .trim();
  if (preferred.length >= 40) return preferred;

  const cleaned = abstract.replace(/\s+/g, " ").trim();
  const start = Math.floor(cleaned.length * 0.6);
  // Snap back to a word boundary so we don't start mid-token.
  let cut = start;
  while (cut > 0 && cut < cleaned.length && cleaned[cut] !== " ") cut -= 1;
  if (cut <= 0 || cut >= cleaned.length - 20) {
    return cleaned.slice(Math.floor(cleaned.length * 0.6));
  }
  return cleaned.slice(cut + 1).trim();
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

  const source = preferredQuoteSource(raw);
  const sentences = splitSentences(source);
  let best: { text: string; score: number } | null = null;

  for (let i = 0; i < sentences.length; i++) {
    const sentence = sentences[i]!;
    if (/…$/.test(sentence) && wordCount(sentence) < 12) continue;

    let score = scoreSentence(sentence);
    if (score < 0) continue;
    // Mild preference for later sentences within the preferred span.
    score += Math.min(1, i * 0.25);

    const tooSimilar = avoid.some((a) => overlapScore(sentence, a) >= 0.45);
    if (tooSimilar) continue;

    const n = normalize(sentence);
    if (
      avoid.some((a) => {
        const na = normalize(a);
        return n === na || n.includes(na) || na.includes(n);
      })
    ) {
      continue;
    }

    if (!best || score > best.score) {
      best = { text: trimToWordBudget(sentence), score };
    }
  }

  return best?.text ?? null;
}
