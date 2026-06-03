/**
 * Debug endpoint: verify PubMed CRDT windowing behavior.
 *
 * Usage:
 *   GET /api/pubmed/test-search-window?q=antimicrobial+stewardship&mindate=2025-01-01&maxdate=2025-02-01
 *
 * Query params:
 *   q        - PubMed search query (required)
 *   mindate  - YYYY-MM-DD (optional)
 *   maxdate  - YYYY-MM-DD (optional)
 *
 * Returns:
 *   count         - total results on PubMed for this window
 *   first20       - first 20 PMIDs
 *   pages         - number of pages that would be fetched for maxTotal=1000
 *   esearchParams - the exact query params sent to PubMed (for copy-paste debugging)
 *   queryUrl      - the full ESearch URL used
 */

import { NextRequest, NextResponse } from "next/server";
import { searchPubMedPage } from "@/lib/pubmed/esearch";
import { formatDateForPubMed, getTodayISO, getDateNDaysAgo } from "@/lib/pubmed/watermark";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(request: NextRequest) {
  const url = request.nextUrl;

  const q = url.searchParams.get("q")?.trim() || "";
  if (!q) {
    return NextResponse.json(
      { ok: false, error: "Provide ?q= (PubMed query string)" },
      { status: 400 }
    );
  }

  const mindateRaw = url.searchParams.get("mindate")?.trim() || null;
  const maxdateRaw = url.searchParams.get("maxdate")?.trim() || null;

  // Default window: last 30 days → today
  const mindate = mindateRaw ?? getDateNDaysAgo(30);
  const maxdate = maxdateRaw ?? getTodayISO();

  try {
    const result = await searchPubMedPage({
      query: q,
      mindate,
      maxdate,
      retmax: 20,
      retstart: 0,
    });

    const totalPages =
      result.count > 0 ? Math.ceil(Math.min(result.count, 1000) / 500) : 0;

    return NextResponse.json({
      ok: true,
      query: q,
      window: {
        mindate,
        maxdate,
        mindatePubMed: formatDateForPubMed(mindate),
        maxdatePubMed: formatDateForPubMed(maxdate),
      },
      count: result.count,
      first20: result.pmids.slice(0, 20),
      estimatedPagesFor1000: totalPages,
      queryUrl: result.queryUrl,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
