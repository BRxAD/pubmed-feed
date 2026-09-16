import { NextRequest, NextResponse } from "next/server";
import { addAuthorOutreachOptOut } from "@/lib/digest/authorOutreach";
import { verifyAuthorOutreachOptOutToken } from "@/lib/digest/authorOutreachToken";

export const runtime = "nodejs";

async function optOutFromToken(token: string | null): Promise<{
  ok: boolean;
  email?: string;
  error?: string;
  status: number;
}> {
  if (!token?.trim()) {
    return { ok: false, error: "Missing opt-out token", status: 400 };
  }

  const email = verifyAuthorOutreachOptOutToken(token);
  if (!email) {
    return {
      ok: false,
      error: "Invalid or expired opt-out link",
      status: 400,
    };
  }

  const result = await addAuthorOutreachOptOut(email);
  if (result.error) {
    return { ok: false, email, error: result.error, status: 503 };
  }

  return { ok: true, email, status: 200 };
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  const result = await optOutFromToken(token);
  return NextResponse.json(
    { ok: result.ok, email: result.email, error: result.error },
    { status: result.status }
  );
}

export async function POST(request: NextRequest) {
  let token = request.nextUrl.searchParams.get("token");

  const contentType = request.headers.get("content-type") ?? "";
  try {
    if (contentType.includes("application/json")) {
      const body = (await request.json()) as { token?: string };
      token = body.token?.trim() || token;
    } else if (
      contentType.includes("application/x-www-form-urlencoded") ||
      contentType.includes("multipart/form-data")
    ) {
      const form = await request.formData();
      const fromForm = form.get("token");
      if (typeof fromForm === "string" && fromForm.trim()) {
        token = fromForm.trim();
      }
    }
  } catch {
    // Fall through to query token
  }

  const result = await optOutFromToken(token);
  return NextResponse.json(
    { ok: result.ok, email: result.email, error: result.error },
    { status: result.status }
  );
}
