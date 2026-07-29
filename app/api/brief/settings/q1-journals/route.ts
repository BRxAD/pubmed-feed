import { NextRequest, NextResponse } from "next/server";
import { verifyBriefAdminSecret } from "@/lib/brief/adminAuth";
import { searchScimagoQ1Journals } from "@/lib/scimago";

export const runtime = "nodejs";

function authSecret(request: NextRequest): string | null {
  return (
    request.headers.get("x-brief-admin-secret") ??
    request.nextUrl.searchParams.get("secret")
  );
}

/** Browse / search the SCImago 2025 Q1 journal list used for +2 Q1 scoring. */
export async function GET(request: NextRequest) {
  const secret = authSecret(request);
  if (!verifyBriefAdminSecret(secret)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const q = request.nextUrl.searchParams.get("q") ?? "";
  const limit = Number(request.nextUrl.searchParams.get("limit") ?? "50");
  const offset = Number(request.nextUrl.searchParams.get("offset") ?? "0");

  const result = searchScimagoQ1Journals({
    q,
    limit: Number.isFinite(limit) ? limit : 50,
    offset: Number.isFinite(offset) ? offset : 0,
  });

  return NextResponse.json({ ok: true, ...result });
}
