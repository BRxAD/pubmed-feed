/** Bound ingest model calls so one hung request cannot use the whole cron. */
export const OPENAI_TIMEOUT_MS = 45_000;
export const OPENAI_MAX_RETRIES = 1;

export function openAIClientOptions(apiKey: string): {
  apiKey: string;
  timeout: number;
  maxRetries: number;
} {
  return {
    apiKey,
    timeout: OPENAI_TIMEOUT_MS,
    maxRetries: OPENAI_MAX_RETRIES,
  };
}
