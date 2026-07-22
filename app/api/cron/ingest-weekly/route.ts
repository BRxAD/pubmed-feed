import { NextRequest, NextResponse } from "next/server";

/**
 * Legacy weekly AI-stewardship ingest — retired.
 * AI + stewardship papers are covered by the main daily ingest when they match
 * stewardship / antibiotic use terms. See scripts/consolidate_ai_into_main.sql.
 */
export async function GET(_request: NextRequest) {
  return NextResponse.json({
    ok: true,
    skipped: true,
    reason:
      "AI stewardship feed consolidated into the main Stewardship Brief. Use /api/cron/daily-digest instead.",
  });
}

export async function POST(request: NextRequest) {
  return GET(request);
}
