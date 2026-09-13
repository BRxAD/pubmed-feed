/**
 * Normalizes references to antistaphylococcal penicillins to prevent using
 * "ASP" or "ASPs" (which universally refers to Antimicrobial Stewardship Programs in ID literature).
 */

const ANTISTAPH_CONTEXT_RE =
  /\b(antistaph|antistaphylococcal|anti-staphylococcal|anti-staph|cefazolin|mssa|nafcillin|oxacillin|flucloxacillin|cloxacillin|methicillin-susceptible)\b/i;

export function cleanAntistaphPenicillinAbbreviations(
  text: string,
  opts?: { isHeadline?: boolean }
): string {
  if (!text) return "";

  // 1. Remove parenthetical abbreviations like "antistaphylococcal penicillins (ASPs)"
  let cleaned = text
    .replace(
      /\b(antistaphylococcal\s+penicillins?)\s*\(\s*ASPs?\s*\)/gi,
      (_, p1: string) => p1
    )
    .replace(
      /\b(anti-staphylococcal\s+penicillins?)\s*\(\s*ASPs?\s*\)/gi,
      (_, p1: string) => p1
    )
    .replace(
      /\b(anti-staph\s+penicillins?)\s*\(\s*ASPs?\s*\)/gi,
      (_, p1: string) => p1
    );

  // 2. If the text is in the context of antistaphylococcal penicillins or MSSA therapy,
  // replace comparative or class uses of "ASPs" where it refers to the penicillins.
  if (ANTISTAPH_CONTEXT_RE.test(cleaned)) {
    // In headlines, if full "antistaphylococcal penicillins" would push headline over length,
    // "anti-staph penicillins" is a concise, unambiguous alternative.
    const replacement =
      opts?.isHeadline && cleaned.length > 70
        ? "anti-staph penicillins"
        : "antistaphylococcal penicillins";

    // e.g. "than ASPs", "vs ASPs", "versus ASPs", "or ASPs", "with ASPs", "to ASPs"
    cleaned = cleaned.replace(
      /\b(than|vs\.?|versus|or|with|to|over|between|either)\s+ASPs\b/gi,
      (_, p1: string) => `${p1} ${replacement}`
    );

    cleaned = cleaned.replace(
      /\bASPs\s+(in\s+MSSA|for\s+MSSA|in\s+methicillin|for\s+methicillin)\b/gi,
      (_, p1: string) => `${replacement} ${p1}`
    );
  }

  return cleaned;
}
