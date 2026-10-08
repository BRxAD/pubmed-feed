/**
 * Visual abstract (beta): a picture of one paper's findings, made only when a signed-in reader clicks.
 * Shared by the server logic, the API route and the dialog. No server-only imports, so it is testable and the
 * browser can import the response types.
 */

export const VA_STATUSES = [
  "pending",
  "extracting",
  "extracted",
  "rendering",
  "ready",
  "failed",
] as const;
export type VaStatus = (typeof VA_STATUSES)[number];

/** Why something stopped. The service's codes pass through; the rest are pubmed-feed's own. */
export type VaErrorCode =
  | "SIGN_IN_REQUIRED"
  | "DISABLED"
  | "NOT_CONFIGURED"
  | "NOT_FOUND"
  | "LIMIT_USER"
  | "LIMIT_DAY"
  | "NO_ABSTRACT"
  | "NO_FINDINGS"
  | "VALIDATION_FAILED"
  | "LAYOUT_FAILED"
  | "MODEL_BUSY"
  | "MODEL_TIMEOUT"
  | "EXTRACTION_FAILED"
  | "BUSY"
  | "SERVICE_DOWN"
  | "TIMEOUT"
  | "STORAGE_FAILED"
  | "INTERNAL";

/** One paper's row, without the findings (those are read separately, by pmid). */
export type VaRow = {
  pmid: string;
  status: VaStatus;
  content_version: string | null;
  render_version: string | null;
  image_path: string | null;
  error_code: string | null;
  error_message: string | null;
  attempts: number;
  requested_by: string | null;
  requested_at: string;
  created_at: string;
  updated_at: string;
};

/** What the API tells the dialog. */
export type VaStatusResponse =
  | { status: "none" }
  | { status: "working"; step: "extract" | "draw" }
  | { status: "ready"; url: string }
  | { status: "failed"; code: VaErrorCode; message: string; retryable: boolean }
  | { status: "signin"; message: string }
  | { status: "disabled"; message: string };

/** The findings and facts the service returns from reading an abstract. */
export type VaExtraction = {
  content: unknown;
  contentVersion: string;
  costUsd: number;
};

/** The picture the service returns. */
export type VaPicture = {
  png: Uint8Array;
  renderVersion: string;
};

/** The service, as the pipeline sees it (the real client, or a fake in tests). */
export interface VaServiceClient {
  extract(pmid: string): Promise<VaExtraction>;
  render(content: unknown): Promise<VaPicture>;
}

/** Where rows live (Supabase, or a Map in tests). Methods are small and each one is atomic. */
export interface VaStore {
  get(pmid: string): Promise<VaRow | null>;
  articleExists(pmid: string): Promise<boolean>;
  /** Requests started since `sinceIso`, in total or by one person. */
  countRequests(sinceIso: string, userId?: string): Promise<number>;
  /** Create a pending row; false when the paper already has one. */
  insertPending(pmid: string, userId: string, nowIso: string): Promise<boolean>;
  /**
   * Move a failed row on as a new request: back to "pending" (read the abstract again), or to "extracted" when its
   * findings are already saved (only the drawing is repeated). False when it was not failed any more.
   */
  reclaimFailed(pmid: string, userId: string, attempts: number, resumeAt: "pending" | "extracted", nowIso: string): Promise<boolean>;
  /** Change status only if it is one of `from`; false when another request got there first. */
  transition(pmid: string, from: VaStatus[], to: VaStatus, nowIso: string): Promise<boolean>;
  saveContent(pmid: string, extraction: VaExtraction, nowIso: string): Promise<void>;
  loadContent(pmid: string): Promise<unknown | null>;
  markReady(pmid: string, imagePath: string, renderVersion: string, nowIso: string): Promise<void>;
  markFailed(pmid: string, code: VaErrorCode, message: string, nowIso: string): Promise<void>;
}

/** Where pictures live. */
export interface VaImages {
  upload(path: string, png: Uint8Array): Promise<void>;
  publicUrl(path: string): string;
}

export class VaError extends Error {
  constructor(
    readonly code: VaErrorCode,
    message: string
  ) {
    super(message);
    this.name = "VaError";
  }
}
