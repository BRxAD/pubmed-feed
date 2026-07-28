import { NextRequest, NextResponse } from "next/server";
import { removeBriefSubscriber } from "@/lib/digest/briefSubscribers";
import { verifyUnsubscribeToken } from "@/lib/digest/unsubscribeToken";

export const runtime = "nodejs";

async function unsubscribeFromToken(token: string | null): Promise<{
  ok: boolean;
  email?: string;
  removed?: boolean;
  error?: string;
  status: number;
}> {
  if (!token?.trim()) {
    return { ok: false, error: "Missing unsubscribe token", status: 400 };
  }

  const email = verifyUnsubscribeToken(token);
  if (!email) {
    return {
      ok: false,
      error: "Invalid or expired unsubscribe link",
      status: 400,
    };
  }

  const result = await removeBriefSubscriber(email);
  if (result.error) {
    return { ok: false, email, error: result.error, status: 503 };
  }

  // Idempotent: already gone still counts as success.
  return { ok: true, email, removed: result.removed, status: 200 };
}

/** One-click / browser unsubscribe (token in query). */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  const result = await unsubscribeFromToken(token);
  return NextResponse.json(
    {
      ok: result.ok,
      email: result.email,
      removed: result.removed,
      error: result.error,
    },
    { status: result.status }
  );
}

/**
 * RFC 8058 one-click (List-Unsubscribe=One-Click) and form POST.
 * Accepts token via query, JSON body, or form body.
 */
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
      // Gmail one-click may POST without a body token when URL has ?token=
    }
  } catch {
    // Fall through to query token
  }

  const result = await unsubscribeFromToken(token);
  return NextResponse.json(
    {
      ok: result.ok,
      email: result.email,
      removed: result.removed,
      error: result.error,
    },
    { status: result.status }
  );
}
