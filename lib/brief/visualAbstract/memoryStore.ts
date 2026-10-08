import type { VaErrorCode, VaExtraction, VaImages, VaRow, VaStatus, VaStore } from "./types";

/**
 * A store that lives in a Map. Used by the tests; it has the same one-winner rules as the database (an insert of an
 * existing paper fails, a transition only works from the listed states), so what the tests prove is what the
 * Supabase store must do.
 */
export class MemoryStore implements VaStore {
  readonly rows = new Map<string, VaRow & { content: unknown | null; cost_usd: number }>();
  readonly articles = new Set<string>();
  /** Calls that read the findings: they are read for one paper at a time, never in bulk. */
  contentReads: string[] = [];
  /** Set to make the next write fail, to see what the pipeline does when the database is down. */
  failNextWrite = false;

  private write() {
    if (this.failNextWrite) {
      this.failNextWrite = false;
      throw new Error("database is down");
    }
  }

  async get(pmid: string): Promise<VaRow | null> {
    const row = this.rows.get(pmid);
    if (!row) return null;
    const { content: _content, cost_usd: _cost, ...light } = row;
    void _content;
    void _cost;
    return { ...light };
  }

  async articleExists(pmid: string): Promise<boolean> {
    return this.articles.has(pmid);
  }

  async countRequests(sinceIso: string, userId?: string): Promise<number> {
    return [...this.rows.values()].filter((row) => row.requested_at >= sinceIso && (!userId || row.requested_by === userId)).length;
  }

  async insertPending(pmid: string, userId: string, nowIso: string): Promise<boolean> {
    this.write();
    if (this.rows.has(pmid)) return false;
    this.rows.set(pmid, {
      pmid,
      status: "pending",
      content: null,
      content_version: null,
      render_version: null,
      image_path: null,
      error_code: null,
      error_message: null,
      attempts: 1,
      cost_usd: 0,
      requested_by: userId,
      requested_at: nowIso,
      created_at: nowIso,
      updated_at: nowIso,
    });
    return true;
  }

  async reclaimFailed(pmid: string, userId: string, attempts: number, resumeAt: "pending" | "extracted", nowIso: string): Promise<boolean> {
    this.write();
    const row = this.rows.get(pmid);
    if (!row || row.status !== "failed") return false;
    Object.assign(row, { status: resumeAt, error_code: null, error_message: null, attempts, requested_by: userId, requested_at: nowIso, updated_at: nowIso });
    return true;
  }

  async transition(pmid: string, from: VaStatus[], to: VaStatus, nowIso: string): Promise<boolean> {
    this.write();
    const row = this.rows.get(pmid);
    if (!row || !from.includes(row.status)) return false;
    row.status = to;
    row.updated_at = nowIso;
    return true;
  }

  async saveContent(pmid: string, extraction: VaExtraction, nowIso: string): Promise<void> {
    this.write();
    const row = this.rows.get(pmid);
    if (!row) throw new Error("no row");
    Object.assign(row, { status: "extracted", content: extraction.content, content_version: extraction.contentVersion, cost_usd: extraction.costUsd, updated_at: nowIso });
  }

  async loadContent(pmid: string): Promise<unknown | null> {
    this.contentReads.push(pmid);
    return this.rows.get(pmid)?.content ?? null;
  }

  async markReady(pmid: string, imagePath: string, renderVersion: string, nowIso: string): Promise<void> {
    this.write();
    const row = this.rows.get(pmid);
    if (!row) throw new Error("no row");
    Object.assign(row, { status: "ready", image_path: imagePath, render_version: renderVersion, error_code: null, error_message: null, updated_at: nowIso });
  }

  async markFailed(pmid: string, code: VaErrorCode, message: string, nowIso: string): Promise<void> {
    this.write();
    const row = this.rows.get(pmid);
    if (!row) throw new Error("no row");
    Object.assign(row, { status: "failed", error_code: code, error_message: message, updated_at: nowIso });
  }
}

export class MemoryImages implements VaImages {
  readonly files = new Map<string, Uint8Array>();
  failUploads = false;

  async upload(path: string, png: Uint8Array): Promise<void> {
    if (this.failUploads) throw new Error("storage is down");
    this.files.set(path, png);
  }

  publicUrl(path: string): string {
    return `https://files.test/visual-abstracts/${path}`;
  }
}
