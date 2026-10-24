/**
 * Headlines must match the people the result is about.
 * "Despite co-infections" makes a rare side fact sound like the finding.
 */

export function headlineScopeIssues(
  headline: string,
  causalAllowed: boolean
): string[] {
  const issues: string[] = [];
  if (/\bdespite\b/i.test(headline)) {
    issues.push(
      "do not use despite — it makes a side fact sound like the result. Headline the exposure and outcome in the group that was studied"
    );
  }
  if (!causalAllowed && /\bno\s+(?:\w+\s+){0,3}benefits?\b/i.test(headline)) {
    issues.push(
      'non-RCT — do not say "no benefit". Say the exposure was not associated with a better outcome'
    );
  }
  return issues;
}
