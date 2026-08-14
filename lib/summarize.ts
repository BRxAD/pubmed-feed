import "server-only";
import OpenAI from "openai";

const SYSTEM_PROMPT = `You summarize biomedical research abstracts for "The Stewardship Brief" — a literature feed for infectious diseases and antimicrobial-stewardship experts.

Audience:
- Readers are ID / AMS experts who already know the basics (stewardship principles, common syndromes, standard drug classes)
- Frame METHODS, RESULTS, and especially BOTTOM LINE around what is interesting from an antimicrobial stewardship perspective (prescribing, resistance, diagnostics stewardship, implementation, practice-changing outcomes)
- Prefer the stewardship-relevant angle over a generic biomedical restatement
- Do not over-explain foundational concepts

Format your response using exactly these section labels (one per line):
- [METHODS] 1–2 sentences on what was done: study design, population, setting, intervention (omit this section entirely for opinion pieces, editorials, or papers with no methods)
- [RESULTS] 1–2 sentences on key findings — include specific numbers, percentages, or effect sizes where the abstract provides them
- [BOTTOM LINE] 1 sentence stating the main finding directly — lead with the conclusion itself, not a meta phrase

Rules:
- Base every section only on what is in the abstract; do not invent implications or audiences
- Use plain language; do not restate the abstract verbatim
- Be specific — avoid vague phrases like "may help improve outcomes" or "further research is needed" unless the abstract says that
- Include numbers in RESULTS when the abstract provides them
- BOTTOM LINE should lead with the finding when possible — do not open with empty meta phrases ("In conclusion", "Overall")
- BOTTOM LINE may (and often should) name the study design up front when it helps experts weigh the claim — e.g., "Systematic review showed…", "In this multicenter cohort…", "In this randomized trial…"
- Prefer "Systematic review showed that…" / "This RCT found…" over a vague "this study"
- If the finding stands alone without mentioning the study, that is still fine when design is already clear from METHODS
- Do not over-promise: if primary results look strong but sensitivity, adjusted, or propensity-score analyses weaken or erase them, RESULTS should note that tension, and BOTTOM LINE should follow the authors' durable conclusion — not the fragile primary point estimate alone
- Causality: use causal language ONLY for randomized trials (RCT) of a clear intervention. Systematic reviews / meta-analyses mixing observational data are non-causal unless limited to RCT evidence. For observational, cohort, cross-sectional, quasi-experimental, or any non-RCT design, state associations or patterns — do not imply the intervention "led to", "caused", "drove", or "resulted in" the outcome
- When study design is unclear, default to non-causal wording
- Do not prescribe actions ("should implement", "clinicians must") unless the authors explicitly recommend them
- Max 40 words per section
- Keep the total summary under 110 words

Note: Headlines for the brief are generated in a separate step.`;

export type ParsedSummary = {
  summaryText: string;
  headline: string | null;
};

const HYPE_WORDS =
  /\b(breakthrough|game-changer|game changer|revolutionary|cure|miracle|landmark)\b/i;

/** Parse model output; strips [HEADLINE] from stored summary body when extracted. */
export function parseSummaryResponse(content: string): ParsedSummary {
  const lines = content
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

  let headline: string | null = null;
  const bodyLines: string[] = [];

  for (const line of lines) {
    const stripped = line.replace(/^[-•*]\s*/, "");
    if (/^\[HEADLINE\]/i.test(stripped)) {
      const h = stripped.replace(/^\[HEADLINE\]\s*/i, "").trim();
      if (h && h.length <= 110 && !HYPE_WORDS.test(h)) {
        headline = h;
      } else if (h) {
        headline = h.slice(0, 110).trim();
      }
    } else {
      bodyLines.push(line);
    }
  }

  return {
    summaryText: bodyLines.join("\n").trim(),
    headline,
  };
}

export async function summarizeAbstract(abstract: string): Promise<ParsedSummary> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || !apiKey.trim()) {
    throw new Error("Missing OPENAI_API_KEY environment variable");
  }

  const client = new OpenAI({ apiKey });

  const completion = await client.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.2,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: abstract },
    ],
  });

  const content = completion.choices[0]?.message?.content;
  if (content == null) {
    throw new Error("OpenAI returned no summary content");
  }

  return parseSummaryResponse(content.trim());
}
