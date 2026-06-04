import "server-only";
import OpenAI from "openai";

const SYSTEM_PROMPT = `You summarize biomedical research abstracts for a literature feed.

Format your response using exactly these section labels:
- [METHODS] 1–2 sentences on what was done: study design, population, setting, intervention (omit this section entirely for opinion pieces, editorials, or papers with no methods)
- [RESULTS] 1–2 sentences on key findings — include specific numbers, percentages, or effect sizes where the abstract provides them
- [BOTTOM LINE] 1 sentence stating the paper's main conclusion or takeaway as written in the abstract — describe what the study found or argued, not what a specific reader role should do

Rules:
- Base every section only on what is in the abstract; do not invent implications or audiences
- Use plain language; do not restate the abstract verbatim
- Be specific — avoid vague phrases like "may help improve outcomes" or "further research is needed" unless the abstract says that
- Include numbers in RESULTS when the abstract provides them
- BOTTOM LINE must reflect the paper's actual scope (clinical, implementation, policy, methods, etc.) — do not assume the reader is a clinician or pharmacist unless the abstract is clearly about clinical practice
- Do not prescribe actions ("should implement", "clinicians must") unless the authors explicitly recommend them
- Max 40 words per section
- Keep the total summary under 110 words`;

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
