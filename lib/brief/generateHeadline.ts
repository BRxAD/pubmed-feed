import "server-only";
import OpenAI from "openai";

const HYPE_WORDS =
  /\b(breakthrough|game-changer|game changer|revolutionary|cure|miracle|landmark|paradigm[- ]shifting)\b/i;

/** Hard max for display; headlines over this are regenerated. */
export const HEADLINE_MAX_CHARS = 100;

const HEADLINE_SYSTEM = `You write headlines for "The Stewardship Brief" — a daily digest for antimicrobial-stewardship pharmacists and physicians (similar to Nature Briefing or The Atlantic).

Write exactly ONE headline per study.

Requirements:
- Maximum ${HEADLINE_MAX_CHARS} characters — count carefully; shorter is better
- Pithy and interesting: lead with the hook (finding, number, or surprise), not the study name or framework acronym
- One crisp sentence — active voice, magazine tone, strictly factual
- Include one anchor detail (setting, N, or design) only if it fits without bloating
- Keep exact numbers or percentages from the abstract when they make the line punchier
- No causal claims the study does not make
- Do NOT use banned hype words: breakthrough, game-changer, revolutionary, cure, miracle, landmark, paradigm-shifting
- Do NOT write a bottom-line or recommendation
- Do NOT start with "Study shows", "Researchers find", or "New framework"
- Do NOT paste the paper title or acronym-heavy names unless unavoidable

Good examples (note length and punch):
- "Stewardship bundle cut broad-spectrum use 23% across 42 ICUs"
- "ED algorithm flagged unnecessary antibiotics with 81% sensitivity"
- "Text nudges lowered macrolide prescribing 18% in six months"
- "118-hospital VA audit scores when hospitals start, stop, and de-escalate antibiotics"

Return ONLY the headline text — no quotes, labels, or extra lines.`;

function trimAtWordBoundary(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  const slice = text.slice(0, maxLen);
  const lastSpace = slice.lastIndexOf(" ");
  if (lastSpace > maxLen * 0.55) return slice.slice(0, lastSpace).trim();
  return slice.trim();
}

function sanitizeHeadline(raw: string): string {
  let h = raw
    .trim()
    .replace(/^["'""]+|["'""]+$/g, "")
    .replace(/^\[HEADLINE\]\s*/i, "")
    .trim();
  if (h.length > HEADLINE_MAX_CHARS) {
    h = trimAtWordBoundary(h, HEADLINE_MAX_CHARS);
  }
  if (HYPE_WORDS.test(h)) {
    h = h.replace(HYPE_WORDS, "").replace(/\s+/g, " ").trim();
  }
  return h;
}

function isTruncatedHeadline(headline: string): boolean {
  const h = headline.trim();
  return h.endsWith("…") || h.endsWith("...");
}

export function isStaleHeadline(headline: string): boolean {
  const h = headline.trim();
  if (!h) return true;
  if (isTruncatedHeadline(h)) return true;
  if (h.length > HEADLINE_MAX_CHARS) return true;
  return false;
}

export async function generateBriefHeadline(options: {
  title: string;
  abstract: string;
}): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey?.trim()) {
    throw new Error("Missing OPENAI_API_KEY environment variable");
  }

  const { title, abstract } = options;
  const client = new OpenAI({ apiKey });

  const userContent = `Title: ${title.trim()}

Abstract:
${abstract.trim()}`;

  const completion = await client.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.45,
    messages: [
      { role: "system", content: HEADLINE_SYSTEM },
      { role: "user", content: userContent },
    ],
    max_tokens: 60,
  });

  const content = completion.choices[0]?.message?.content?.trim();
  if (!content) {
    throw new Error("OpenAI returned no headline");
  }

  const headline = sanitizeHeadline(content);
  if (!headline) {
    throw new Error("Headline empty after sanitization");
  }
  return headline;
}

/** True when we should call GenAI instead of using stored/fallback text. */
export function headlineNeedsGeneration(
  storedHeadline: string | null | undefined,
  summaryText: string,
  bottomLine: string | null
): boolean {
  if (storedHeadline?.trim()) {
    const h = storedHeadline.trim();
    if (bottomLine?.trim() && h === bottomLine.trim()) return true;
    if (isStaleHeadline(h)) return true;
    return false;
  }

  for (const line of summaryText.split("\n")) {
    const t = line.trim().replace(/^[-•*]\s*/, "");
    if (/^\[HEADLINE\]/i.test(t)) {
      const h = t.replace(/^\[HEADLINE\]\s*/i, "").trim();
      if (h && h !== bottomLine?.trim() && !isStaleHeadline(h)) return false;
    }
  }

  return true;
}

export function headlineFromSummaryText(summaryText: string): string | null {
  for (const line of summaryText.split("\n")) {
    const t = line.trim().replace(/^[-•*]\s*/, "");
    if (/^\[HEADLINE\]/i.test(t)) {
      const h = sanitizeHeadline(t.replace(/^\[HEADLINE\]\s*/i, ""));
      return h || null;
    }
  }
  return null;
}
