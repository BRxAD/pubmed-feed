import "server-only";
import OpenAI from "openai";
import { getStudyTaxonomyPrompt } from "@/lib/studyTaxonomy";

const UNCLEAR = "Unclear";

function stripJsonMarkdown(raw: string): string {
  let s = raw.trim();
  const codeBlock = s.match(/^```(?:json)?\s*([\s\S]*?)```$/);
  if (codeBlock) s = codeBlock[1].trim();
  return s;
}

const CONFIDENCE_THRESHOLD = 95;

function parseClassification(content: string): {
  study_subheading: string;
  study_label: string;
} {
  const blank = { study_subheading: "", study_label: "" };
  const trimmed = content?.trim();
  if (!trimmed) return blank;

  const toParse = stripJsonMarkdown(trimmed);
  if (!toParse) return blank;

  try {
    const parsed = JSON.parse(toParse) as unknown;
    if (parsed === null || typeof parsed !== "object") return blank;
    const obj = parsed as Record<string, unknown>;

    // Enforce confidence gate — only accept classifications at or above threshold
    const confidence = typeof obj.confidence === "number" ? obj.confidence : 100;
    if (confidence < CONFIDENCE_THRESHOLD) {
      return blank; // will be coerced to Unclear downstream
    }

    const sub = obj.study_subheading ?? obj.subheading;
    const label = obj.study_label ?? obj.label;
    return {
      study_subheading: typeof sub === "string" ? sub.trim() : "",
      study_label: typeof label === "string" ? label.trim() : "",
    };
  } catch {
    return blank;
  }
}

export async function classifyStudyAbstract(input: {
  title?: string | null;
  abstract?: string | null;
  publicationTypes?: string[] | null;
}): Promise<{ study_subheading: string; study_label: string }> {
  const abstract = input.abstract?.trim();
  if (!abstract) {
    return { study_subheading: UNCLEAR, study_label: UNCLEAR };
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey?.trim()) {
    throw new Error("Missing OPENAI_API_KEY environment variable");
  }

  const systemPrompt = getStudyTaxonomyPrompt();

  const titleStr = input.title != null ? String(input.title).trim() : "";
  const pubTypes = Array.isArray(input.publicationTypes)
    ? input.publicationTypes.join(", ")
    : "";
  const userParts = [
    titleStr && `Title: ${titleStr}`,
    `Abstract: ${abstract}`,
    pubTypes && `Publication types: ${pubTypes}`,
  ].filter(Boolean);
  const userMessage = userParts.join("\n\n");

  const client = new OpenAI({ apiKey });

  const completion = await client.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ],
  });

  const content = completion.choices[0]?.message?.content;
  const result = parseClassification(content ?? "");

  if (result.study_subheading === "" || result.study_label === "") {
    return { study_subheading: UNCLEAR, study_label: UNCLEAR };
  }

  return result;
}
