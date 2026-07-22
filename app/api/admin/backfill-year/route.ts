import { NextRequest, NextResponse } from "next/server";
import { GET as runPubmedIngest } from "@/app/api/ingest/route";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * One-time (or periodic) year backfill for The Stewardship Brief.
 * Pulls PubMed records from the last ~365 days and summarizes new ones.
 *
 *   GET /api/admin/backfill-year?secret=CRON_SECRET&maxSummaries=100
 *
 * Run multiple times if needed until found/summarized stabilize — each pass
 * fills more of the year under Vercel time/summary caps.
 */
export async function GET(request: NextRequest) {
  const expected = process.env.CRON_SECRET;
  const secretParam = request.nextUrl.searchParams.get("secret");
  const authHeader = request.headers.get("authorization");
  const bearer =
    authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const secret = secretParam ?? bearer;

  if (!expected?.trim() || secret !== expected) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const maxSummaries = Math.min(
    250,
    Math.max(
      1,
      parseInt(request.nextUrl.searchParams.get("maxSummaries") ?? "100", 10) ||
        100
    )
  );
  const daysBack = Math.min(
    400,
    Math.max(
      30,
      parseInt(request.nextUrl.searchParams.get("daysBack") ?? "365", 10) || 365
    )
  );

  const url = new URL(
    `/api/ingest?topicName=main&summarize=1&daysBack=${daysBack}&maxArticles=500&maxSummaries=${maxSummaries}`,
    "http://backfill-internal"
  );
  const ingestReq = new NextRequest(url);
  const response = await runPubmedIngest(ingestReq);
  const data = (await response.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;

  return NextResponse.json({
    ok: response.ok,
    backfill: { daysBack, maxSummaries },
    ingest: data,
    tip:
      "Re-run until summarized approaches zero new rows. Top 10 uses article dates within the past 12 months.",
  });
}

export async function POST(request: NextRequest) {
  return GET(request);
}
