import "server-only";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import type { VaErrorCode, VaExtraction, VaImages, VaRow, VaStatus, VaStore } from "./types";

const TABLE = "visual_abstracts";
const BUCKET = "visual-abstracts";

/** Every column except the findings (about 15 KB). The findings are read on their own, for one paper. */
const LIGHT_COLUMNS =
  "pmid, status, content_version, render_version, image_path, error_code, error_message, attempts, requested_by, requested_at, created_at, updated_at";

type DbError = { message: string; code?: string };

function fail(error: DbError, what: string): never {
  const notReady = /does not exist|schema cache|could not find the table/i.test(error.message);
  throw new Error(
    notReady
      ? "Visual abstract storage is not ready. Run scripts/add_visual_abstracts.sql in the Supabase SQL Editor."
      : `Visual abstract ${what} failed: ${error.message}`
  );
}

/**
 * Rows in Supabase (service role). Each write that must have one winner is a single conditional UPDATE or an INSERT
 * on the primary key, so two clicks at once cannot both start the same paper.
 */
export function supabaseVaStore(): VaStore {
  const db = () => getSupabaseServerClient();

  return {
    async get(pmid: string): Promise<VaRow | null> {
      const { data, error } = await db()
        .from(TABLE)
        .select(LIGHT_COLUMNS)
        .eq("pmid", pmid)
        .maybeSingle();
      if (error) fail(error, "read");
      return (data as VaRow | null) ?? null;
    },

    async articleExists(pmid: string): Promise<boolean> {
      const { count, error } = await db()
        .from("articles")
        .select("pmid", { count: "exact", head: true })
        .eq("pmid", pmid);
      if (error) fail(error, "article lookup");
      return (count ?? 0) > 0;
    },

    async countRequests(sinceIso: string, userId?: string): Promise<number> {
      let query = db()
        .from(TABLE)
        .select("pmid", { count: "exact", head: true })
        .gte("requested_at", sinceIso);
      if (userId) query = query.eq("requested_by", userId);
      const { count, error } = await query;
      if (error) fail(error, "count");
      return count ?? 0;
    },

    async insertPending(pmid: string, userId: string, nowIso: string): Promise<boolean> {
      const { error } = await db().from(TABLE).insert({
        pmid,
        status: "pending",
        attempts: 1,
        requested_by: userId,
        requested_at: nowIso,
        created_at: nowIso,
        updated_at: nowIso,
      });
      if (!error) return true;
      // 23505: the paper already has a row, so someone else started it first.
      if (error.code === "23505") return false;
      fail(error, "start");
    },

    async reclaimFailed(pmid: string, userId: string, attempts: number, resumeAt: "pending" | "extracted", nowIso: string): Promise<boolean> {
      const { data, error } = await db()
        .from(TABLE)
        .update({
          status: resumeAt,
          error_code: null,
          error_message: null,
          attempts,
          requested_by: userId,
          requested_at: nowIso,
          updated_at: nowIso,
        })
        .eq("pmid", pmid)
        .eq("status", "failed")
        .select("pmid");
      if (error) fail(error, "restart");
      return (data?.length ?? 0) > 0;
    },

    async transition(pmid: string, from: VaStatus[], to: VaStatus, nowIso: string): Promise<boolean> {
      const { data, error } = await db()
        .from(TABLE)
        .update({ status: to, updated_at: nowIso })
        .eq("pmid", pmid)
        .in("status", from)
        .select("pmid");
      if (error) fail(error, "update");
      return (data?.length ?? 0) > 0;
    },

    async saveContent(pmid: string, extraction: VaExtraction, nowIso: string): Promise<void> {
      const { error } = await db()
        .from(TABLE)
        .update({
          status: "extracted",
          content: extraction.content,
          content_version: extraction.contentVersion,
          cost_usd: extraction.costUsd,
          updated_at: nowIso,
        })
        .eq("pmid", pmid)
        .eq("status", "extracting");
      if (error) fail(error, "save");
    },

    async loadContent(pmid: string): Promise<unknown | null> {
      const { data, error } = await db().from(TABLE).select("content").eq("pmid", pmid).maybeSingle();
      if (error) fail(error, "read findings");
      return (data as { content?: unknown } | null)?.content ?? null;
    },

    async markReady(pmid: string, imagePath: string, renderVersion: string, nowIso: string): Promise<void> {
      const { error } = await db()
        .from(TABLE)
        .update({
          status: "ready",
          image_path: imagePath,
          render_version: renderVersion || null,
          error_code: null,
          error_message: null,
          updated_at: nowIso,
        })
        .eq("pmid", pmid);
      if (error) fail(error, "finish");
    },

    async markFailed(pmid: string, code: VaErrorCode, message: string, nowIso: string): Promise<void> {
      const { error } = await db()
        .from(TABLE)
        .update({ status: "failed", error_code: code, error_message: message, updated_at: nowIso })
        .eq("pmid", pmid);
      if (error) fail(error, "record failure");
    },
  };
}

/** Pictures in the public visual-abstracts bucket. The path carries a stamp, so a URL never changes meaning. */
export function supabaseVaImages(): VaImages {
  return {
    async upload(path: string, png: Uint8Array): Promise<void> {
      const { error } = await getSupabaseServerClient()
        .storage.from(BUCKET)
        .upload(path, png, { contentType: "image/png", cacheControl: "31536000", upsert: false });
      if (error) throw new Error(error.message);
    },

    publicUrl(path: string): string {
      return getSupabaseServerClient().storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
    },
  };
}
