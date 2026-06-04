import type { PubMedRecord } from "@/lib/pubmed/efetch";

const CASE_REPORT_RE =
  /\bcase report(s)?\b|\bcase series\b|\bletter to the editor\b|\beditorial\b/i;

const ANIMAL_RE =
  /\b(veterinar|livestock|bovine|porcine|canine|feline|poultry|swine|cattle|murine|rat(s)?|mouse|mice|animal model)\b/i;

const HUMAN_RE =
  /\b(patient(s)?|human(s)?|hospital|clinical|adult(s)?|pediatric|children|icu|inpatient|outpatient)\b/i;

/** Post-filter OpenAlex/PubMed records when topic query excludes case reports and animal-only work. */
export function passesClinicalInclusionFilter(
  rec: PubMedRecord,
  excludeNoise: boolean
): boolean {
  if (!excludeNoise) return true;

  const title = rec.title ?? "";
  const abstract = rec.abstract ?? "";
  const pubTypes = (rec.publicationTypes ?? []).join(" ");
  const combined = `${title} ${abstract} ${pubTypes}`;

  if (CASE_REPORT_RE.test(combined)) return false;
  if (pubTypes.toLowerCase().includes("case reports")) return false;

  if (ANIMAL_RE.test(combined) && !HUMAN_RE.test(combined)) return false;

  return true;
}
