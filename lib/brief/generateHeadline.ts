import "server-only";
import OpenAI from "openai";

const HYPE_WORDS =
  /\b(breakthrough|game-changer|game changer|revolutionary|cure|miracle|landmark|paradigm[- ]shifting)\b/i;

/** Soft target for the model; display is not hard-truncated. */
export const HEADLINE_MAX_CHARS = 180;

const HEADLINE_SYSTEM = `You write headlines for "The Stewardship Brief" — a daily digest for antimicrobial-stewardship pharmacists and physicians (similar to Nature Briefing).

Write exactly ONE headline per study.

Requirements:
- One complete sentence, ideally 90–140 characters (never exceed ${HEADLINE_MAX_CHARS})
- Plain language: state the finding AND its scope (setting, population, or design when relevant)
- Keep exact numbers, percentages, and effect sizes from the abstract when present
- Active, journalistic tone — interesting to read but strictly factual
- No causal claims the study does not make (use "associated with", "linked to" when appropriate)
- Do NOT use banned hype words: breakthrough, game-changer, revolutionary, cure, miracle, landmark, paradigm-shifting
- Do NOT write a bottom-line or recommendation — this is a headline, not a conclusion sentence
- Do NOT start with "Study shows" or "Researchers find"
- Must read as a finished phrase — never trail off or end mid-word

Good examples:
- "Stewardship bundle cut broad-spectrum use 23% across 42 ICUs in a stepped-wedge trial"
- "ML model flagged unnecessary antibiotics with 81% sensitivity in a 12-hospital ED cohort"
- "Outpatient stewardship texts reduced macrolide prescribing 18% over six months"

Return ONLY the headline text — no quotes, labels, or extra lines.`;

function trimAtWordBoundary(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  const slice = text.slice(0, maxLen);
  const lastSpace = slice.lastIndexOf(" ");
  if (lastSpace > maxLen * 0.6) return slice.slice(0, lastSpace).trim();
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
    temperature: 0.35,
    messages: [
      { role: "system", content: HEADLINE_SYSTEM },
      { role: "user", content: userContent },
    ],
    max_tokens: 80,
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
    if (isTruncatedHeadline(h)) return true;
    return false;
  }

  for (const line of summaryText.split("\n")) {
    const t = line.trim().replace(/^[-•*]\s*/, "");
    if (/^\[HEADLINE\]/i.test(t)) {
      const h = t.replace(/^\[HEADLINE\]\s*/i, "").trim();
      if (h && h !== bottomLine?.trim()) return false;
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
