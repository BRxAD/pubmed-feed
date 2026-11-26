/** A run that tried to summarize and saved nothing should fail the cron. */
export function summaryRunFailedCompletely(
  attempted: number,
  stored: number
): boolean {
  return attempted > 0 && stored === 0;
}
