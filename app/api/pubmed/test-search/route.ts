import { NextRequest, NextResponse } from "next/server";
import { searchPubMed } from "@/lib/pubmed/esearch";

export async function GET(request: NextRequest) {
  try {
    const q = request.nextUrl.searchParams.get("q") ?? "antimicrobial stewardship";
    const pmids = await searchPubMed(q, 7, 10);
    return NextResponse.json({ ok: true, q, pmids });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
