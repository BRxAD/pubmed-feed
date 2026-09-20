/**
 * OpenAlex journal allowlist: CID, OFID, ASHE, ICHE, CMI.
 * ISSN filter is journal-articles only (no preprint servers).
 */
export const OPENALEX_JOURNAL_ISSNS = [
  // Clinical Infectious Diseases
  "1058-4838",
  "1537-6591",
  // Open Forum Infectious Diseases
  "2328-8957",
  // Antimicrobial Stewardship & Healthcare Epidemiology
  "2732-494X",
  // Infection Control & Hospital Epidemiology
  "0899-823X",
  "1559-6834",
  // Clinical Microbiology and Infection
  "1198-743X",
  "1469-0691",
] as const;

export const OPENALEX_JOURNAL_LABELS = [
  "CID",
  "OFID",
  "ASHE",
  "ICHE",
  "CMI",
] as const;

/** OpenAlex `filter=` fragment: these ISSNs, journal articles + reviews. */
export function openAlexJournalFilter(): string {
  const issns = OPENALEX_JOURNAL_ISSNS.join("|");
  return [
    `primary_location.source.issn:${issns}`,
    "type:article|review",
    "primary_location.source.type:journal",
  ].join(",");
}
