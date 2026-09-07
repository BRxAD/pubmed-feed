import "server-only";
import { getServerSession } from "next-auth/next";
import { getToken } from "next-auth/jwt";
import type { NextRequest } from "next/server";
import { authOptions } from "@/lib/auth";
import { ensureAuthUserId } from "@/lib/ensureAuthUser";
import {
  listSavedArticles,
  mergeSavedArticles,
  setSavedArticle,
} from "@/lib/savedArticles";
import {
  sanitizeSavedItem,
  type SavedBriefItem,
} from "@/lib/savedArticleTypes";

type SessionLike = {
  id?: string | null;
  email?: string | null;
  name?: string | null;
  image?: string | null;
};

async function sessionFromCookies(): Promise<SessionLike | null> {
  const session = await getServerSession(authOptions);
  if (!session?.user) return null;
  return {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
    image: session.user.image,
  };
}

/** Prefer JWT from the incoming request (reliable in App Router route handlers). */
export async function sessionFromRequest(
  request: NextRequest
): Promise<SessionLike | null> {
  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
    // Match NextAuth cookie naming on HTTPS production hosts.
    secureCookie: (process.env.NEXTAUTH_URL ?? "").startsWith("https://"),
  });
  if (token) {
    return {
      id: typeof token.id === "string" ? token.id : null,
      email: typeof token.email === "string" ? token.email : null,
      name: typeof token.name === "string" ? token.name : null,
      image: typeof token.picture === "string" ? token.picture : null,
    };
  }
  return sessionFromCookies();
}

export async function resolveSavedUserId(
  session?: SessionLike | null
): Promise<{ id: string } | { error: string }> {
  const user = session === undefined ? await sessionFromCookies() : session;
  if (!user?.email && !user?.id) {
    return { error: "Please sign in to save articles." };
  }
  return ensureAuthUserId({
    id: user?.id,
    email: user?.email,
    name: user?.name,
    image: user?.image,
  });
}

export async function loadAccountSavedArticles(
  session?: SessionLike | null
): Promise<{ items: SavedBriefItem[]; error?: string }> {
  const auth = await resolveSavedUserId(session);
  if ("error" in auth) return { items: [], error: auth.error };
  return listSavedArticles(auth.id);
}

export async function pushAndLoadSavedArticles(
  incoming: SavedBriefItem[],
  session?: SessionLike | null
): Promise<{ items: SavedBriefItem[]; error?: string }> {
  const auth = await resolveSavedUserId(session);
  // Do not echo local items back on auth failure — that made each device
  // think sync succeeded while the cloud stayed empty.
  if ("error" in auth) return { items: [], error: auth.error };
  return mergeSavedArticles(auth.id, incoming);
}

export async function writeSavedArticle(
  input: {
    pmid: string;
    title?: string | null;
    pubmedUrl?: string | null;
    saved: boolean;
  },
  session?: SessionLike | null
): Promise<
  { ok: true; items: SavedBriefItem[] } | { ok: false; error: string }
> {
  const auth = await resolveSavedUserId(session);
  if ("error" in auth) return { ok: false, error: auth.error };

  const item = sanitizeSavedItem({
    pmid: input.pmid,
    title: input.title,
    pubmedUrl: input.pubmedUrl,
  });
  if (!item) return { ok: false, error: "That article id is not valid." };

  const result = await setSavedArticle(auth.id, item, input.saved);
  if (!result.success) {
    return {
      ok: false,
      error: result.error ?? "Could not update saved article.",
    };
  }

  const listed = await listSavedArticles(auth.id);
  return { ok: true, items: listed.items };
}
