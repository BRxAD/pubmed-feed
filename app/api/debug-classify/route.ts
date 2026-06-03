import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { getStudyTaxonomyPrompt } from "@/lib/studyTaxonomy";

/**
 * GET /api/debug-classify?abstract=...&title=...
 * Returns raw OpenAI response + parsed classification so you can see
 * whether the issue is parsing, key names, or the model returning Unclear.
 */
export async function GET(request: NextRequest) {
  const abstract = request.nextUrl.searchParams.get("abstract")?.trim();
  const title = request.nextUrl.searchParams.get("title")?.trim() ?? null;

  if (!abstract) {
    return NextResponse.json(
      { error: "Provide ?abstract=... (and optionally &title=...)" },
      { status: 400 }
    );
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey?.trim()) {
    return NextResponse.json(
      { error: "Missing OPENAI_API_KEY" },
      { status: 500 }
    );
  }

  const systemPrompt = getStudyTaxonomyPrompt();
  const userParts = [
    title && `Title: ${title}`,
    `Abstract: ${abstract}`,
  ].filter(Boolean);
  const userMessage = userParts.join("\n\n");

  const client = new OpenAI({ apiKey });

  const completion = await client.chat.completions.create({
    model: "gpt-4o-mini",
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ],
  });

  const rawContent = completion.choices[0]?.message?.content ?? null;

  let parsed: { study_subheading: string; study_label: string } | string = {
    study_subheading: "",
    study_label: "",
  };
  if (rawContent) {
    try {
      let s = rawContent.trim();
      const codeBlock = s.match(/^```(?:json)?\s*([\s\S]*?)```$/);
      if (codeBlock) s = codeBlock[1].trim();
      const obj = JSON.parse(s) as Record<string, unknown>;
      const sub = obj.study_subheading ?? obj.subheading;
      const label = obj.study_label ?? obj.label;
      parsed = {
        study_subheading: typeof sub === "string" ? sub : "",
        study_label: typeof label === "string" ? label : "",
      };
    } catch (e) {
      parsed = `Parse error: ${e instanceof Error ? e.message : String(e)}`;
    }
  }

  return NextResponse.json({
    raw_content: rawContent,
    parsed,
    prompt_preview: {
      system_length: systemPrompt.length,
      user_length: userMessage.length,
    },
  });
}
