import type { VaErrorCode } from "./types";

/**
 * What a reader is told when something stops. Plain words, no codes, no blame. `retryable` means trying again
 * soon can work (a busy or slow service); otherwise the paper itself is the reason.
 */
const COPY: Record<VaErrorCode, { message: string; retryable: boolean }> = {
  SIGN_IN_REQUIRED: { message: "Sign in to make a visual abstract.", retryable: false },
  DISABLED: { message: "Visual abstracts are paused for now.", retryable: false },
  // A refused key or a PubMed hiccup is about the setup, not the paper: it can work once that is fixed.
  NOT_CONFIGURED: { message: "Visual abstracts are not switched on yet.", retryable: true },
  NOT_FOUND: { message: "A visual abstract is not available for this paper.", retryable: true },
  LIMIT_USER: {
    message: "You have made a few visual abstracts in the last hour. Please try again later.",
    retryable: false,
  },
  LIMIT_DAY: {
    message: "We have reached today's limit for new visual abstracts. Please try again tomorrow.",
    retryable: false,
  },
  NO_ABSTRACT: {
    message: "This paper has no abstract on PubMed, so a visual abstract cannot be made.",
    retryable: false,
  },
  NO_FINDINGS: {
    message: "The abstract has no results with numbers that we can draw.",
    retryable: false,
  },
  VALIDATION_FAILED: {
    message: "We could not make a reliable visual abstract for this paper.",
    retryable: false,
  },
  LAYOUT_FAILED: {
    message: "We could not fit this paper's results into a clean picture.",
    retryable: false,
  },
  EXTRACTION_FAILED: {
    message: "We could not read the results from this abstract.",
    retryable: true,
  },
  MODEL_BUSY: {
    message: "The visual abstract maker is busy. Please try again in a minute.",
    retryable: true,
  },
  MODEL_TIMEOUT: {
    message: "The visual abstract maker was too slow. Please try again.",
    retryable: true,
  },
  BUSY: {
    message: "The visual abstract maker is busy. Please try again in a minute.",
    retryable: true,
  },
  SERVICE_DOWN: {
    message: "The visual abstract maker could not be reached. Please try again in a minute.",
    retryable: true,
  },
  TIMEOUT: {
    message: "That took too long. Please try again.",
    retryable: true,
  },
  STORAGE_FAILED: {
    message: "The picture was made but could not be saved. Please try again.",
    retryable: true,
  },
  INTERNAL: {
    message: "Something went wrong. Please try again.",
    retryable: true,
  },
};

export function messageFor(code: VaErrorCode): string {
  return COPY[code].message;
}

export function isRetryable(code: VaErrorCode): boolean {
  return COPY[code].retryable;
}

const KNOWN = new Set<string>(Object.keys(COPY));

/** A code stored in the database or sent by the service, narrowed to one we have words for. */
export function asVaErrorCode(value: string | null | undefined): VaErrorCode {
  return value && KNOWN.has(value) ? (value as VaErrorCode) : "INTERNAL";
}
