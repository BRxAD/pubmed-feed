import { asVaErrorCode } from "./messages";
import { VaError, type VaExtraction, type VaPicture, type VaServiceClient } from "./types";

/** The service reads one abstract with one model call (a second only to repair a bad answer). */
export const EXTRACT_TIMEOUT_MS = 150_000;
/** Drawing takes a few seconds; the rest is headroom for a cold start. */
export const RENDER_TIMEOUT_MS = 45_000;

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
/** A 1600 x 900 plate is about 150 to 400 KB; anything past this is not one. */
const MAX_PNG_BYTES = 2_000_000;

type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

type ServiceBody = { error?: { code?: string; message?: string } } & Record<string, unknown>;

/** What went wrong, from a failed call. The service's own words stay in the log; readers get messages.ts. */
async function failure(response: Response): Promise<VaError> {
  let body: ServiceBody = {};
  try {
    body = (await response.json()) as ServiceBody;
  } catch {
    /* not JSON: a gateway page, say */
  }
  const code = body.error?.code ?? "";
  if (response.status === 401 || response.status === 403 || code === "UNAUTHORIZED" || code === "SERVICE_NOT_CONFIGURED") {
    // pubmed-feed and the service disagree about the key, or the service is not set up: a person cannot fix either.
    console.error(`[visualAbstract] service refused the request (${response.status} ${code || "no code"}). Check VISUAL_ABSTRACT_KEY and the service's VISUAL_ABSTRACT_SERVICE_KEYS.`);
    return new VaError("NOT_CONFIGURED", "The service refused the key.");
  }
  if (code === "BAD_CONTENT" || code === "BAD_REQUEST") {
    console.error(`[visualAbstract] service rejected our request: ${code} ${body.error?.message ?? ""}`);
    return new VaError("INTERNAL", body.error?.message ?? "The service rejected the request.");
  }
  if (response.status >= 500 && !code) return new VaError("SERVICE_DOWN", `The service answered ${response.status}.`);
  return new VaError(asVaErrorCode(code), body.error?.message ?? `The service answered ${response.status}.`);
}

function networkError(error: unknown): VaError {
  const name = error instanceof Error ? error.name : "";
  if (name === "TimeoutError" || name === "AbortError") return new VaError("TIMEOUT", "The service took too long to answer.");
  return new VaError("SERVICE_DOWN", "The service could not be reached.");
}

/**
 * Talks to the Visual Abstract service (a separate deployment) from the server. Never from the browser: the key
 * stays here. `fetchImpl` is the real fetch unless a test passes its own.
 */
export function createServiceClient(settings: { url: string; key: string }, fetchImpl: FetchLike = fetch as FetchLike): VaServiceClient {
  const call = async (path: string, body: unknown, timeoutMs: number): Promise<Response> => {
    let response: Response;
    try {
      response = await fetchImpl(`${settings.url}${path}`, {
        method: "POST",
        headers: { authorization: `Bearer ${settings.key}`, "content-type": "application/json", accept: "application/json, image/png" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
        cache: "no-store",
      });
    } catch (error) {
      throw networkError(error);
    }
    if (!response.ok) throw await failure(response);
    return response;
  };

  return {
    async extract(pmid: string): Promise<VaExtraction> {
      const response = await call("/api/v1/extract", { pmid }, EXTRACT_TIMEOUT_MS);
      let body: { content?: unknown; version?: { content?: unknown }; usage?: { estimated_usd?: unknown } };
      try {
        body = await response.json();
      } catch {
        throw new VaError("SERVICE_DOWN", "The service sent an unreadable answer.");
      }
      const version = typeof body.version?.content === "string" ? body.version.content : "";
      if (!body.content || typeof body.content !== "object" || !version) throw new VaError("SERVICE_DOWN", "The service sent an incomplete answer.");
      const cost = Number(body.usage?.estimated_usd);
      return { content: body.content, contentVersion: version, costUsd: Number.isFinite(cost) && cost >= 0 ? Math.round(cost * 10_000) / 10_000 : 0 };
    },

    async render(content: unknown): Promise<VaPicture> {
      const response = await call("/api/v1/render", { content }, RENDER_TIMEOUT_MS);
      let bytes: Uint8Array;
      try {
        bytes = new Uint8Array(await response.arrayBuffer());
      } catch {
        throw new VaError("SERVICE_DOWN", "The picture could not be read.");
      }
      const isPng = bytes.length > 100 && bytes.length <= MAX_PNG_BYTES && PNG_SIGNATURE.every((b, i) => bytes[i] === b);
      if (!isPng) throw new VaError("SERVICE_DOWN", "The service did not send a picture.");
      return { png: bytes, renderVersion: response.headers.get("x-va-render-version") ?? "" };
    },
  };
}
