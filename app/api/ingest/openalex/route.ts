import { NextRequest, NextResponse } from "next/server";
import { runOpenAlexIngest } from "@/lib/openalex/ingest";
import { OPENALEX_JOURNAL_LABELS } from "@/lib/openalex/journals";

export const runtime = "nodejs";
export const maxDuration = 300;

function parseInteger(
  value: string | null | undefined,
  fallback: number
): number {
  if (!value) return fallback;
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

/** GET is a cheap health probe so CI cannot trigger a live ingest. */
export async function GET() {
  return NextResponse.json({
    ok: true,
    enabled: true,
    journals: OPENALEX_JOURNAL_LABELS,
  });
}

export async function POST(request: NextRequest) {
  try {
    const url = request.nextUrl;
    let body: Record<string, unknown> = {};
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      body = {};
    }
    const pick = (key: string): string | undefined => {
      const q = url.searchParams.get(key);
      if (q) return q;
      const b = body[key];
      return b != null ? String(b) : undefined;
    };

    const result = await runOpenAlexIngest({
      topicId: pick("topicId") ?? null,
      topicName: pick("topicName") ?? "main",
      daysBack: pick("daysBack") ? parseInteger(pick("daysBack"), 0) : null,
      maxArticles: parseInteger(pick("maxArticles") ?? pick("limit"), 200),
      maxSummaries: parseInteger(pick("maxSummaries"), 5),
      summarize: pick("summarize") === "1" || pick("summarize") === "true",
      persistStats: pick("persistStats") !== "0",
    });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[openalex ingest] Error", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
