import { NextResponse, after, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/brief/visualAbstract/client";
import { readVaConfig } from "@/lib/brief/visualAbstract/config";
import { messageFor } from "@/lib/brief/visualAbstract/messages";
import {
  checkVisualAbstract,
  requestVisualAbstract,
  type VaDeps,
} from "@/lib/brief/visualAbstract/pipeline";
import { supabaseVaImages, supabaseVaStore } from "@/lib/brief/visualAbstract/store";
import type { VaStatusResponse } from "@/lib/brief/visualAbstract/types";
import { ensureAuthUserId } from "@/lib/ensureAuthUser";
import { sessionFromRequest } from "@/lib/savedArticlesService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** The background work reads the abstract (up to about two minutes) and draws; both run after the reply is sent. */
export const maxDuration = 300;

const NO_STORE = { "cache-control": "no-store" };

function json(body: VaStatusResponse, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

function deps(): VaDeps {
  const config = readVaConfig();
  const client =
    config.state === "on" && config.serviceUrl && config.serviceKey
      ? createServiceClient({ url: config.serviceUrl, key: config.serviceKey })
      : null;
  return { config, store: supabaseVaStore(), images: supabaseVaImages(), client };
}

/** Browsers say where a request came from; one from another site is refused (the session cookie would ride along). */
function fromThisSite(request: NextRequest): boolean {
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") return false;
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === request.nextUrl.host;
  } catch {
    return false;
  }
}

/** The signed-in person's account id, or null. Visual abstracts are for signed-in readers only. */
async function signedInUserId(request: NextRequest): Promise<string | null> {
  const session = await sessionFromRequest(request);
  if (!session?.id && !session?.email) return null;
  const auth = await ensureAuthUserId({
    id: session.id,
    email: session.email,
    name: session.name,
    image: session.image,
  });
  return "id" in auth ? auth.id : null;
}

const SIGN_IN: VaStatusResponse = { status: "signin", message: messageFor("SIGN_IN_REQUIRED") };

const BROKEN: VaStatusResponse = {
  status: "failed",
  code: "INTERNAL",
  message: messageFor("INTERNAL"),
  retryable: true,
};

/**
 * POST { pmid } — a signed-in person clicked "Visual abstract (beta)".
 * Replies at once; reading the abstract and drawing continue after the reply.
 */
export async function POST(request: NextRequest) {
  if (!fromThisSite(request)) return json(BROKEN, 403);
  try {
    const userId = await signedInUserId(request);
    if (!userId) return json(SIGN_IN, 401);

    let pmid = "";
    try {
      const body = (await request.json()) as { pmid?: unknown };
      pmid = typeof body.pmid === "string" ? body.pmid.trim() : "";
    } catch {
      return json(BROKEN, 400);
    }

    const { response, run } = await requestVisualAbstract(deps(), { pmid, userId });
    if (run) after(run);
    return json(response);
  } catch (error) {
    console.error("[visualAbstract] POST failed:", error);
    return json(BROKEN, 500);
  }
}

/** GET ?pmid= — how is it going? Moves a stalled paper on (draws saved findings, retires a lost worker). */
export async function GET(request: NextRequest) {
  if (!fromThisSite(request)) return json(BROKEN, 403);
  try {
    const userId = await signedInUserId(request);
    if (!userId) return json(SIGN_IN, 401);
    const pmid = (request.nextUrl.searchParams.get("pmid") ?? "").trim();
    return json(await checkVisualAbstract(deps(), pmid));
  } catch (error) {
    console.error("[visualAbstract] GET failed:", error);
    return json(BROKEN, 500);
  }
}
