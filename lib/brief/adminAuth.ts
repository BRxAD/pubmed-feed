/** Auth for brief admin pages (settings dashboard). */
export function getBriefAdminSecret(): string | null {
  return (
    process.env.BRIEF_ADMIN_SECRET?.trim() ||
    process.env.CRON_SECRET?.trim() ||
    process.env.DAILY_RUN_SECRET?.trim() ||
    null
  );
}

export function verifyBriefAdminSecret(
  secret: string | null | undefined
): boolean {
  const expected = getBriefAdminSecret();
  if (!expected || !secret?.trim()) return false;
  return secret.trim() === expected;
}
