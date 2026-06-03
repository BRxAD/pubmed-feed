import "server-only";
import OpenAI from "openai";

const SYSTEM_PROMPT = `You are a clinical summarizer for an antimicrobial stewardship program (ASP) newsletter.
Given the following PubMed abstract, produce a concise structured summary for busy clinicians and stewardship pharmacists.

Format your response using exactly these section labels:
- [METHODS] 1–2 sentences on what was done: study design, population, setting, intervention (omit this section entirely for opinion pieces, editorials, or papers with no methods)
- [RESULTS] 1–2 sentences on key findings — include specific numbers, percentages, or effect sizes where meaningful
- [BOTTOM LINE] 1 sentence: the single most important practical takeaway for a clinician or stewardship pharmacist

Rules:
- Use plain clinical language; do not restate the abstract verbatim
- Be specific — avoid vague phrases like "may help improve outcomes" or "further research is needed"
- Include numbers in RESULTS whenever available (e.g. "reduced 30-day mortality by 18%", "n=342 patients")
- BOTTOM LINE must be actionable or directly relevant to antimicrobial prescribing or stewardship practice
- Max 35 words per section
- Keep the total summary under 100 words`;

export async function summarizeAbstract(abstract: string): Promise<string> {
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

  return content.trim();
}
