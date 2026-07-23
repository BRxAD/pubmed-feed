import { NextRequest, NextResponse } from "next/server";
import { GET as runPubmedIngest } from "@/app/api/ingest/route";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * One-time (or periodic) year backfill for The Stewardship Brief.
 * Pulls PubMed IDs from the last ~365 days, prioritizes PMIDs missing
 * summaries, then summarizes up to maxSummaries per pass.
 *
 *   GET /api/admin/backfill-year?secret=CRON_SECRET&maxSummaries=200
 *
 * Re-run until ingest.needingSummaryAmongScanned approaches 0 (or
 * storedSummaries stays 0 with summarizeAttempted 0). Each pass fills
 * more of the year under Vercel time/summary caps (~250 max per call).
 */
export async function GET(request: NextRequest) {
  const expected = process.env.CRON_SECRET;
  const secretParam = request.nextUrl.searchParams.get("secret");
  const authHeader = request.headers.get("authorization");
  const bearer =
    authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const secret = secretParam ?? bearer;

  if (!expected?.trim()) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "CRON_SECRET is not set on this deployment. Add it in Vercel → Environment Variables, then Redeploy.",
      },
      { status: 503 }
    );
  }

  if (!secret || secret !== expected) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Unauthorized — secret does not match CRON_SECRET on this deployment. In Vercel → Settings → Environment Variables, edit CRON_SECRET, save, Redeploy, then use that exact value in the URL.",
      },
      { status: 401 }
    );
  }

  const maxSummaries = Math.min(
    250,
    Math.max(
      1,
      parseInt(request.nextUrl.searchParams.get("maxSummaries") ?? "200", 10) ||
        200
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

  const needing = Number(data.needingSummaryAmongScanned ?? 0);
  const stored = Number(data.storedSummaries ?? 0);

  return NextResponse.json({
    ok: response.ok,
    backfill: { daysBack, maxSummaries },
    ingest: data,
    tip:
      needing > 0 || stored > 0
        ? `Re-run until needingSummaryAmongScanned is near 0. This pass stored ${stored} summaries; ~${needing} still needed among scanned IDs.`
        : "No unsummarized PMIDs left in the scanned window (or OpenAI failed — check ingest.summarizeErrors).",
  });
}

export async function POST(request: NextRequest) {
  return GET(request);
}
