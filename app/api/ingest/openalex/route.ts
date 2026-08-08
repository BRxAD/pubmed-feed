/**
 * OpenAlex ingest is disabled — product is PubMed-only.
 * Former implementation lives in git history.
 */
import { NextResponse } from "next/server";

export const runtime = "nodejs";

function disabled() {
  return NextResponse.json(
    {
      ok: false,
      error: "OpenAlex ingest is disabled. This product uses PubMed only.",
    },
    { status: 410 }
  );
}

export async function GET() {
  return disabled();
}

export async function POST() {
  return disabled();
}
