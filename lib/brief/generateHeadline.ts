import "server-only";
import OpenAI from "openai";

const HYPE_WORDS =
  /\b(breakthrough|game-changer|game changer|revolutionary|cure|miracle|landmark|paradigm[- ]shifting)\b/i;

/** Hard max for display. Headlines over this fail validation and are regenerated. */
export const HEADLINE_MAX_CHARS = 100;

/** Target length band — keeps headlines complete without truncation. */
export const HEADLINE_TARGET_MAX = 88;

const HEADLINE_SYSTEM = `You write headlines for "The Stewardship Brief" — a daily editorial digest for antimicrobial-stewardship clinicians (Nature Briefing / STAT News quality).

Write exactly ONE headline per study.

Requirements:
- 50–${HEADLINE_TARGET_MAX} characters preferred; never exceed ${HEADLINE_MAX_CHARS}
- One complete, grammatical sentence that stands alone — must not feel cut off mid-thought
- Pithy and interesting: lead with the finding or surprise, NOT the paper title, framework name, or acronyms
- High-quality science journalism: precise, readable, no hype
- Use at most ONE statistic — round large counts (e.g., "728,000 patients" not "727,958"; "118 VA hospitals" not "118" alone)
- Never end on a bare number, preposition, or unfinished phrase ("across 118" is invalid — say "across 118 VA hospitals")
- Never pack contradictory statistics into one headline
- Do NOT use banned hype words: breakthrough, game-changer, revolutionary, cure, miracle, landmark, paradigm-shifting
- Do NOT write a bottom-line, recommendation, or methods dump
- Do NOT start with "Study shows", "Researchers find", "New framework", "New [ACRONYM]", or "[NAME] framework reveals"
- Do NOT paste the paper title or lead with tool/metric acronyms (DASC-LOT, S3, etc.) — translate into plain English

Causality (critical):
- If the study is a randomized trial, you may use direct verbs (cut, reduced, lowered, boosted) for findings the abstract attributes to the intervention
- For observational, cross-sectional, descriptive, cohort, or quasi-experimental designs, do NOT imply causation — never "led to", "resulted in", "caused", "drove", or "triggered"
- For non-RCT studies, use varied non-causal framing: state the pattern directly ("use varied widely…", "prescribing was higher among…"), or soft association verbs (associated with, tied to, coincided with, correlated with, aligned with, accompanied by)
- Do NOT reach for "linked to" by default — vary phrasing across headlines; many observational findings read best as plain descriptive statements
- When unsure of design, default to non-causal / descriptive language

Good examples:
- "Antimicrobial use varied widely across 118 VA hospitals in a 728,000-patient audit"
- "Higher macrolide prescribing accompanied broader-spectrum regimens in 12 EDs"
- "Report cards tied to higher guideline concordance and less cefdinir use in kids"
- "Stewardship bundle cut broad-spectrum use 23% across 42 ICUs" (RCT)
- "Four in five sinusitis visits meeting criteria still got antibiotics"

Bad examples (never write these):
- "New DASC-LOT framework reveals 727,958 patients' antimicrobial use varies widely across 118"
- "Study shows antibiotic use was high"

Return ONLY the headline text — no quotes, labels, or extra lines.`;

const STRONG_CAUSAL_RE =
  /\b(led to|resulted in|caused|drove|triggered|spurred|yielded)\b/i;

const INTERVENTION_CAUSAL_RE =
  /\b(cut|boosted|lowered|reduced|increased|improved|slashed|dropped|raised|curbed)\b/i;

const DANGLING_ENDING_RE =
  /\b(in|on|at|for|with|and|or|the|a|an|of|to|by|from|without|among|across|during|after|before|under|over|into|through|about|between|pediatric|paediatric|adult|hospital|clinical|acute|chronic|outpatient|inpatient|wide|widely|varies|varied)$/i;

const RCT_RE =
  /\b(randomized|randomised|randomized controlled|randomised controlled|placebo[- ]controlled|cluster[- ]randomized|cluster[- ]randomised|double[- ]blind|rct\b)\b/i;

const FRAMEWORK_LEAD_RE =
  /^(new\s+|.*\bframework\s+(reveals|shows|finds|demonstrates)\b)/i;

const BARE_NUMBER_END_RE =
  /\b(across|in|at|for|of|among|from|over|under|within|between|to|with|and)\s+\d[\d,.\s]*$/i;

export type HeadlineValidation = {
  ok: boolean;
  issues: string[];
};

export function allowsCausalLanguage(abstract: string): boolean {
  return RCT_RE.test(abstract);
}

function sanitizeHeadline(raw: string): string {
  let h = raw
    .trim()
    .replace(/^["'""]+|["'""]+$/g, "")
    .replace(/^\[HEADLINE\]\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
  if (HYPE_WORDS.test(h)) {
    h = h.replace(HYPE_WORDS, "").replace(/\s+/g, " ").trim();
  }
  return h;
}

function countMajorStats(headline: string): number {
  const matches = headline.match(/\d[\d,]*(?:\.\d+)?%?/g) ?? [];
  return matches.filter((m) => {
    const digits = m.replace(/\D/g, "");
    return digits.length >= 2;
  }).length;
}

function hasContradictoryPercentages(headline: string): boolean {
  const lower = headline.toLowerCase();
  if (!lower.includes("but")) return false;

  const pcts = [...headline.matchAll(/(\d+(?:\.\d+)?)\s*%/g)].map((m) =>
    parseFloat(m[1])
  );
  if (pcts.length < 2) return false;

  if (
    /\d+(?:\.\d+)?\s*%[^.]{0,100}\bbut\b[^.]{0,60}\d+(?:\.\d+)?\s*%[^.]{0,40}\b(did not|were not|was not|without)\b/i.test(
      headline
    )
  ) {
    return true;
  }

  if (
    pcts.length >= 2 &&
    pcts.every((p) => p >= 50) &&
    /\bbut\b/i.test(headline) &&
    !/\b(up from|down from|vs\.?|versus|compared with|compared to|from \d)\b/i.test(
      lower
    )
  ) {
    return true;
  }

  return false;
}

function looksTruncated(headline: string): boolean {
  const h = headline.trim();
  if (!h) return true;
  if (h.endsWith("…") || h.endsWith("...")) return true;
  if (h.length >= HEADLINE_MAX_CHARS - 1) return true;
  if (DANGLING_ENDING_RE.test(h)) return true;
  if (BARE_NUMBER_END_RE.test(h)) return true;
  if (/\b\d{1,4}$/.test(h)) return true;
  if (/\([^)]*$/.test(h)) return true;

  return false;
}

export function validateHeadlineQuality(
  headline: string,
  abstract: string
): HeadlineValidation {
  const h = headline.trim();
  const issues: string[] = [];

  if (!h) issues.push("empty headline");
  if (h.length > HEADLINE_MAX_CHARS) {
    issues.push(`over ${HEADLINE_MAX_CHARS} characters — shorten`);
  }
  if (looksTruncated(h)) {
    issues.push("incomplete or truncated — finish the thought with a noun (e.g., '118 VA hospitals')");
  }
  if (hasContradictoryPercentages(h)) {
    issues.push("contradictory or confusing statistics");
  }
  if (countMajorStats(h) > 1) {
    issues.push("too many numbers — use at most one statistic and round large counts");
  }
  if (FRAMEWORK_LEAD_RE.test(h)) {
    issues.push("do not lead with framework name or 'New … framework reveals'");
  }
  if (/^new\s+/i.test(h)) {
    issues.push('do not start with "New …"');
  }
  if (HYPE_WORDS.test(h)) issues.push("hype language");

  const causalAllowed = allowsCausalLanguage(abstract);
  if (!causalAllowed && STRONG_CAUSAL_RE.test(h)) {
    issues.push('causal wording ("led to/resulted in") on non-RCT study');
  }
  if (!causalAllowed && INTERVENTION_CAUSAL_RE.test(h)) {
    issues.push(
      "intervention-style causal verb on non-RCT study — use descriptive or non-causal phrasing"
    );
  }

  return { ok: issues.length === 0, issues };
}

function isTruncatedHeadline(headline: string): boolean {
  return looksTruncated(headline);
}

export function isStaleHeadline(
  headline: string,
  abstract?: string | null
): boolean {
  const h = headline.trim();
  if (!h) return true;
  if (isTruncatedHeadline(h)) return true;
  if (h.length > HEADLINE_MAX_CHARS) return true;
  if (hasContradictoryPercentages(h)) return true;
  if (FRAMEWORK_LEAD_RE.test(h)) return true;
  if (countMajorStats(h) > 1) return true;
  if (/\blinked to\b/i.test(h)) return true;
  if (abstract?.trim()) {
    const v = validateHeadlineQuality(h, abstract);
    if (!v.ok) return true;
  }
  return false;
}

async function requestHeadline(
  client: OpenAI,
  title: string,
  abstract: string,
  revision?: { previous: string; issues: string[]; strict?: boolean }
): Promise<string> {
  const strictNote = revision?.strict
    ? `\n\nFINAL ATTEMPT: Under 80 characters. One statistic max. Plain English only. Complete sentence ending with a noun.`
    : "";

  const userContent = revision
    ? `Title: ${title.trim()}

Abstract:
${abstract.trim()}

Your previous headline was rejected:
"${revision.previous}"

Problems: ${revision.issues.join("; ")}

Write a NEW headline that fixes all problems. Shorter and clearer. One complete sentence under ${HEADLINE_TARGET_MAX} characters.${strictNote}`
    : `Title: ${title.trim()}

Abstract:
${abstract.trim()}

Study design hint: ${allowsCausalLanguage(abstract) ? "Randomized trial — direct intervention verbs allowed if supported by abstract." : "Non-RCT — use descriptive or non-causal phrasing (vary wording; do not default to \"linked to\")."}`;

  const completion = await client.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: revision?.strict ? 0.25 : revision ? 0.35 : 0.4,
    messages: [
      { role: "system", content: HEADLINE_SYSTEM },
      { role: "user", content: userContent },
    ],
    max_tokens: 50,
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

  let lastHeadline = "";
  let lastIssues: string[] = [];

  for (let attempt = 0; attempt < 4; attempt++) {
    const headline = await requestHeadline(
      client,
      title,
      abstract,
      attempt > 0
        ? {
            previous: lastHeadline,
            issues: lastIssues,
            strict: attempt >= 3,
          }
        : undefined
    );

    const validation = validateHeadlineQuality(headline, abstract);
    if (validation.ok) return headline;

    lastHeadline = headline;
    lastIssues = validation.issues;
  }

  throw new Error(
    `Failed to generate valid headline after retries: ${lastIssues.join("; ")}`
  );
}

/** True when we should call GenAI instead of using stored/fallback text. */
export function headlineNeedsGeneration(
  storedHeadline: string | null | undefined,
  summaryText: string,
  bottomLine: string | null,
  abstract?: string | null
): boolean {
  if (storedHeadline?.trim()) {
    const h = storedHeadline.trim();
    if (bottomLine?.trim() && h === bottomLine.trim()) return true;
    if (isStaleHeadline(h, abstract)) return true;
    return false;
  }

  for (const line of summaryText.split("\n")) {
    const t = line.trim().replace(/^[-•*]\s*/, "");
    if (/^\[HEADLINE\]/i.test(t)) {
      const h = t.replace(/^\[HEADLINE\]\s*/i, "").trim();
      if (h && h !== bottomLine?.trim() && !isStaleHeadline(h, abstract)) {
        return false;
      }
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
