import "server-only";
import OpenAI from "openai";

const HYPE_WORDS =
  /\b(breakthrough|game-changer|game changer|revolutionary|cure|miracle|landmark|paradigm[- ]shifting)\b/i;

const HEADLINE_SYSTEM = `You write headlines for "The Stewardship Brief" — a daily digest for antimicrobial-stewardship pharmacists and physicians (similar to Nature Briefing).

Write exactly ONE headline per study.

Requirements:
- Maximum 110 characters
- Plain language: state the finding AND its scope (setting, population, or design when relevant)
- Keep exact numbers, percentages, and effect sizes from the abstract when present
- Active, journalistic tone — interesting to read but strictly factual
- No causal claims the study does not make (use "associated with", "linked to" when appropriate)
- Do NOT use banned hype words: breakthrough, game-changer, revolutionary, cure, miracle, landmark, paradigm-shifting
- Do NOT write a bottom-line or recommendation — this is a headline, not a conclusion sentence
- Do NOT start with "Study shows" or "Researchers find"

Good examples:
- "Stewardship bundle cut broad-spectrum use 23% across 42 ICUs in a stepped-wedge trial"
- "ML model flagged unnecessary antibiotics with 81% sensitivity in a 12-hospital ED cohort"
- "Outpatient stewardship texts reduced macrolide prescribing 18% over six months"

Return ONLY the headline text — no quotes, labels, or extra lines.`;

function sanitizeHeadline(raw: string): string {
  let h = raw
    .trim()
    .replace(/^["'""]+|["'""]+$/g, "")
    .replace(/^\[HEADLINE\]\s*/i, "")
    .trim();
  if (h.length > 110) h = h.slice(0, 107).trim() + "…";
  if (HYPE_WORDS.test(h)) {
    h = h.replace(HYPE_WORDS, "").replace(/\s+/g, " ").trim();
  }
  return h;
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
