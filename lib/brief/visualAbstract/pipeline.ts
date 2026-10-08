import { capDecision, DAY_MS, HOUR_MS } from "./caps";
import type { VaConfig } from "./config";
import { asVaErrorCode, isRetryable, messageFor } from "./messages";
import {
  VaError,
  type VaErrorCode,
  type VaImages,
  type VaRow,
  type VaServiceClient,
  type VaStatusResponse,
  type VaStore,
} from "./types";

/**
 * The visual abstract (beta) state machine. It holds no secrets and imports nothing from Next or Supabase, so it can
 * be tested with a Map and a fake service. The route gives it the real store, pictures and service client.
 *
 *   click -> pending -> extracting -> extracted -> rendering -> ready
 *                          \_____________\______________\______> failed (a click can try again, within limits)
 *
 * Nothing here runs by itself: a state only moves when a signed-in person clicks (requestVisualAbstract) or the
 * dialog they have open asks how it is going (checkVisualAbstract). There is no timer and no cron, because the
 * Hobby plan allows only one cron run a day.
 */

/** A PubMed ID. Papers from other sources have no PubMed abstract for the service to read. */
export const PMID_RE = /^[1-9]\d{0,8}$/;

/** Reading the abstract takes under two minutes; a row quiet for longer than this lost its worker. */
export const WORKING_STALE_MS = 200_000;
/** Drawing takes seconds; a row quiet for longer than this lost its worker. */
export const DRAWING_STALE_MS = 90_000;
/** After a failure, a click within this time shows the failure again instead of starting a new request (a double click). */
export const RETRY_COOLDOWN_MS = 5_000;
/** Model calls spent on one paper: a paper that keeps failing is not retried for ever. */
export const MAX_ATTEMPTS = 3;

export type VaDeps = {
  config: VaConfig;
  store: VaStore;
  images: VaImages;
  /** Null until the service address and key are set. */
  client: VaServiceClient | null;
  now?: () => number;
};

const clock = (deps: VaDeps) => (deps.now ?? Date.now)();
const stamp = (deps: VaDeps) => new Date(clock(deps)).toISOString();

const working = (step: "extract" | "draw"): VaStatusResponse => ({ status: "working", step });

function failed(code: VaErrorCode, retryable = isRetryable(code)): VaStatusResponse {
  return { status: "failed", code, message: messageFor(code), retryable };
}

/** What a stored row means to the dialog. Pure. */
export function responseForRow(row: VaRow, images: VaImages): VaStatusResponse {
  switch (row.status) {
    case "ready":
      return row.image_path ? { status: "ready", url: images.publicUrl(row.image_path) } : failed("INTERNAL");
    case "failed": {
      const code = asVaErrorCode(row.error_code);
      // A paper that has used its attempts, or failed for its own reasons, is not offered another try.
      return failed(code, isRetryable(code) && row.attempts < MAX_ATTEMPTS);
    }
    case "extracted":
    case "rendering":
      return working("draw");
    default:
      return working("extract");
  }
}

async function recordFailure(deps: VaDeps, pmid: string, error: unknown): Promise<void> {
  const code: VaErrorCode = error instanceof VaError ? error.code : "INTERNAL";
  const detail = error instanceof Error ? error.message : String(error);
  console.error(`[visualAbstract] ${pmid} failed (${code}): ${detail}`);
  try {
    await deps.store.markFailed(pmid, code, detail.slice(0, 300), stamp(deps));
  } catch (storeError) {
    // The row stays in its working state; the next click or poll reaps it as stale.
    console.error(`[visualAbstract] ${pmid}: could not record the failure:`, storeError);
  }
}

/** Draw a paper whose findings are saved. Safe to call from two places at once: only one wins the row. Never throws. */
export async function drawStep(deps: VaDeps, pmid: string): Promise<void> {
  try {
    if (!deps.client) throw new VaError("NOT_CONFIGURED", "The service is not configured.");
    if (!(await deps.store.transition(pmid, ["extracted"], "rendering", stamp(deps)))) return;
    const content = await deps.store.loadContent(pmid);
    if (!content) throw new VaError("INTERNAL", "The saved findings are missing.");
    const picture = await deps.client.render(content);
    const path = `${pmid}/${clock(deps).toString(36)}.png`;
    try {
      await deps.images.upload(path, picture.png);
    } catch (error) {
      throw new VaError("STORAGE_FAILED", error instanceof Error ? error.message : "Upload failed.");
    }
    await deps.store.markReady(pmid, path, picture.renderVersion, stamp(deps));
  } catch (error) {
    await recordFailure(deps, pmid, error);
  }
}

/** Read the abstract, save the findings, then draw. Never throws. */
export async function extractStep(deps: VaDeps, pmid: string): Promise<void> {
  try {
    if (!deps.client) throw new VaError("NOT_CONFIGURED", "The service is not configured.");
    if (!(await deps.store.transition(pmid, ["pending"], "extracting", stamp(deps)))) return;
    const extraction = await deps.client.extract(pmid);
    await deps.store.saveContent(pmid, extraction, stamp(deps));
  } catch (error) {
    await recordFailure(deps, pmid, error);
    return;
  }
  await drawStep(deps, pmid);
}

export type StartResult = {
  response: VaStatusResponse;
  /** Work to run after the response is sent (the route passes it to after()). Null when there is none. */
  run: (() => Promise<void>) | null;
};

/**
 * A signed-in person clicked. Returns at once with what to show; any slow work is in `run`.
 * Existing pictures and saved findings are free. Only a new paper (or a retry) is counted against the caps.
 */
export async function requestVisualAbstract(deps: VaDeps, input: { pmid: string; userId: string }): Promise<StartResult> {
  const { pmid, userId } = input;
  const { store, config } = deps;
  if (!PMID_RE.test(pmid)) return { response: failed("NOT_FOUND", false), run: null };
  if (config.state === "off") return { response: { status: "disabled", message: messageFor("DISABLED") }, run: null };
  if (config.state === "unconfigured" || !deps.client) return { response: { status: "disabled", message: messageFor("NOT_CONFIGURED") }, run: null };

  const nowMs = clock(deps);
  let row = await store.get(pmid);

  if (row) {
    const age = nowMs - Date.parse(row.updated_at);
    switch (row.status) {
      case "ready":
        if (row.image_path) return { response: responseForRow(row, deps.images), run: null };
        // Ready with no picture is a broken row: treat it as a failure and start over below.
        await store.markFailed(pmid, "INTERNAL", "Ready without a picture.", stamp(deps));
        row = { ...row, status: "failed", error_code: "INTERNAL" };
        break;
      case "extracted":
        return { response: working("draw"), run: () => drawStep(deps, pmid) };
      case "pending":
      case "extracting":
        if (age < WORKING_STALE_MS) return { response: working("extract"), run: null };
        await store.markFailed(pmid, "TIMEOUT", "Reading the abstract took too long.", stamp(deps));
        row = { ...row, status: "failed", error_code: "TIMEOUT" };
        break;
      case "rendering":
        if (age < DRAWING_STALE_MS) return { response: working("draw"), run: null };
        await store.transition(pmid, ["rendering"], "extracted", stamp(deps));
        return { response: working("draw"), run: () => drawStep(deps, pmid) };
      case "failed":
        break;
    }
    // A failure is shown again, not retried, when the paper itself is the reason, when it has used its attempts,
    // or when it failed a moment ago.
    if (row.status === "failed") {
      const shown = responseForRow(row, deps.images);
      const tooSoon = Number.isFinite(age) && age >= 0 && age < RETRY_COOLDOWN_MS;
      if (shown.status === "failed" && (!shown.retryable || tooSoon)) return { response: shown, run: null };
    }
  }

  // A new paper, or a retry of a failed one: a new request, so the caps apply.
  const [userLastHour, allLastDay] = await Promise.all([
    store.countRequests(new Date(nowMs - HOUR_MS).toISOString(), userId),
    store.countRequests(new Date(nowMs - DAY_MS).toISOString()),
  ]);
  const limit = capDecision({ userLastHour, allLastDay }, { userPerHour: config.userPerHour, perDay: config.perDay });
  if (limit) return { response: failed(limit), run: null };
  if (!row && !(await store.articleExists(pmid))) return { response: failed("NOT_FOUND", false), run: null };

  // A retry after a drawing or saving failure keeps the findings it already paid for and only draws again.
  const hasFindings = Boolean(row?.content_version);
  const claimed = row
    ? await store.reclaimFailed(pmid, userId, row.attempts + 1, hasFindings ? "extracted" : "pending", stamp(deps))
    : await store.insertPending(pmid, userId, stamp(deps));
  const step = hasFindings ? "draw" : "extract";
  // Someone else claimed it a moment ago: they are doing the work, and this person waits for the same picture.
  if (!claimed) return { response: working(step), run: null };
  return { response: working(step), run: () => (hasFindings ? drawStep(deps, pmid) : extractStep(deps, pmid)) };
}

/**
 * The open dialog asks how it is going. A row whose worker died is moved on here: findings saved but not drawn are
 * drawn now, and a row quiet for too long is marked failed.
 */
export async function checkVisualAbstract(deps: VaDeps, pmid: string): Promise<VaStatusResponse> {
  if (!PMID_RE.test(pmid)) return failed("NOT_FOUND", false);
  let row = await deps.store.get(pmid);
  if (!row) return { status: "none" };
  const age = clock(deps) - Date.parse(row.updated_at);

  if (row.status === "rendering" && age >= DRAWING_STALE_MS) {
    await deps.store.transition(pmid, ["rendering"], "extracted", stamp(deps));
    row = { ...row, status: "extracted" };
  }
  if (row.status === "extracted") {
    await drawStep(deps, pmid);
    row = (await deps.store.get(pmid)) ?? row;
  }
  if ((row.status === "pending" || row.status === "extracting") && age >= WORKING_STALE_MS) {
    await deps.store.markFailed(pmid, "TIMEOUT", "Reading the abstract took too long.", stamp(deps));
    row = { ...row, status: "failed", error_code: "TIMEOUT" };
  }
  return responseForRow(row, deps.images);
}
