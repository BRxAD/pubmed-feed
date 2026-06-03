import { NextRequest, NextResponse } from "next/server";

const EFETCH_URL =
  "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi";

export async function GET(request: NextRequest) {
  try {
    const idsParam = request.nextUrl.searchParams.get("ids");
    const pmids = idsParam
      ? idsParam.split(",").map((id) => id.trim()).filter(Boolean)
      : ["3901234"];

    if (pmids.length === 0) {
      return NextResponse.json(
        { ok: false, error: "No ids provided" },
        { status: 400 }
      );
    }

    const params = new URLSearchParams({
      db: "pubmed",
      id: pmids.join(","),
      retmode: "xml",
    });

    const tool = process.env.NCBI_TOOL;
    const email = process.env.NCBI_EMAIL;
    const apiKey = process.env.NCBI_API_KEY;
    if (tool) params.set("tool", tool);
    if (email) params.set("email", email);
    if (apiKey) params.set("api_key", apiKey);

    const url = `${EFETCH_URL}?${params.toString()}`;
    const res = await fetch(url);

    if (!res.ok) {
      return NextResponse.json(
        { ok: false, error: `${res.status} ${res.statusText}` },
        { status: 502 }
      );
    }

    const xml = await res.text();

    return new NextResponse(xml, {
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
