import "server-only";
import OpenAI from "openai";

const SYSTEM_PROMPT = `You summarize biomedical research abstracts for a literature feed.

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
- If the bottom line references the study itself, name the design when helpful (e.g., "this cross-sectional study", "findings from a randomized controlled trial") — never a vague "this study" alone
- If the finding stands alone without mentioning the study, that is preferred
- BOTTOM LINE must reflect the paper's actual scope (clinical, implementation, policy, methods, etc.) — do not assume the reader is a clinician or pharmacist unless the abstract is clearly about clinical practice
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
