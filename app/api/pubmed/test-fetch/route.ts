import { NextRequest, NextResponse } from "next/server";
import { searchPubMed } from "@/lib/pubmed/esearch";
import { fetchPubMedRecords } from "@/lib/pubmed/efetch";

const DEFAULT_QUERY = "antimicrobial stewardship";

export async function GET(request: NextRequest) {
  try {
    const idsParam = request.nextUrl.searchParams.get("ids");
    let pmids: string[];

    if (idsParam) {
      pmids = idsParam.split(",").map((id) => id.trim()).filter(Boolean);
    } else {
      pmids = await searchPubMed(DEFAULT_QUERY, 7, 3);
    }

    const records = await fetchPubMedRecords(pmids);
    const pmidPreview = records.slice(0, 5).map((r) => r.pmid);

    return NextResponse.json({
      ok: true,
      count: records.length,
      pmidPreview,
      records,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
