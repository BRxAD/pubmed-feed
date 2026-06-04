/** Digest email configuration — reuses existing project env vars when possible. */

export function parseRecipientEmails(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  return [
    ...new Set(
      raw
        .split(/[,;\s]+/)
        .map((e) => e.trim().toLowerCase())
        .filter((e) => e.includes("@"))
    ),
  ];
}

/**
 * Recipient order:
 * 1. DIGEST_RECIPIENT_EMAILS (optional override)
 * 2. OPENALEX_MAILTO (already required for OpenAlex)
 * 3. NCBI_EMAIL (already recommended for PubMed)
 */
export function getDigestRecipients(): string[] {
  const explicit = parseRecipientEmails(process.env.DIGEST_RECIPIENT_EMAILS);
  if (explicit.length > 0) return explicit;

  const openAlex = parseRecipientEmails(process.env.OPENALEX_MAILTO);
  if (openAlex.length > 0) return openAlex;

  const ncbi = parseRecipientEmails(process.env.NCBI_EMAIL);
  if (ncbi.length > 0) return ncbi;

  return [];
}

/** Contact email already on the project (for reply-to / from display). */
export function getProjectContactEmail(): string | null {
  const mailto = process.env.OPENALEX_MAILTO?.trim();
  if (mailto?.includes("@")) return mailto;
  const ncbi = process.env.NCBI_EMAIL?.trim();
  if (ncbi?.includes("@")) return ncbi;
  return null;
}

export function getDigestFromAddress(): string {
  const explicit = process.env.DIGEST_FROM_EMAIL?.trim();
  if (explicit) return explicit;

  // Resend requires a verified domain for custom From addresses.
  // Use their shared sender; replies go to OPENALEX_MAILTO via Reply-To.
  return "ASP Literature Feed <onboarding@resend.dev>";
}

export function getDigestReplyTo(): string | undefined {
  return (
    process.env.DIGEST_REPLY_TO?.trim() ??
    getProjectContactEmail() ??
    undefined
  );
}

/** Default 20% — same as feed admin “min relevance” baseline. */
export const DEFAULT_DIGEST_MIN_RELEVANCE = 20;

export const DEFAULT_DIGEST_MAX_SUMMARIES = 100;

export const DEFAULT_DIGEST_HOURS_BACK = 24;
