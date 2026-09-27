import type { PubMedRecord } from "@/lib/pubmed/efetch";

const CASE_REPORT_RE =
  /\bcase report(s)?\b|\bcase series\b|\ba case of\b|\bfirst case\b|\bwe report a\b|\bletter to the editor\b|\beditorial\b/i;

const NOISE_PUB_TYPE_RE =
  /\b(letter|editorial|comment|news|preprint|case reports?)\b/i;

const ANIMAL_RE =
  /\b(veterinar|livestock|bovine|porcine|canine|feline|poultry|swine|cattle|murine|rat(s)?|mouse|mice|animal model|zebrafish|broiler|weanling)\b/i;

const HUMAN_RE =
  /\b(patient(s)?|human(s)?|hospital|clinical|adult(s)?|pediatric|children|icu|inpatient|outpatient)\b/i;

const OFID_JOURNAL_RE = /\bopen forum infectious diseases\b/i;

const OFID_AMS_SIGNAL_RE =
  /\b(stewardship|antibiotic|antimicrobial|antifungal|prescrib|de-escalat|deescalat|duration of therapy|days of therapy|oral switch|oral step-?down|iv.?to.?oral)\b/i;

const NAMED_DRUG_RE =
  /\b(vancomycin|piperacillin|pip-?tazo|piptazo|tazobactam|meropenem|imipenem|ertapenem|doripenem|carbapenem|ceftriaxone|cefepime|ceftazidime|cefazolin|cefotaxime|cephalexin|cefalexin|cefadroxil|cephalosporin|ciprofloxacin|levofloxacin|moxifloxacin|fluoroquinolon|azithromycin|linezolid|daptomycin|gentamicin|tobramycin|amikacin|aminoglycoside|amoxicillin|ampicillin|metronidazole|clindamycin|doxycycline|trimethoprim-sulfamethoxazole|co-?trimoxazole|colistin|polymyxin|aztreonam|ceftaroline|ceftolozane|cefiderocol|nitrofurantoin|fosfomycin|fidaxomicin|nafcillin|oxacillin|penicillin|beta-?lactam|rezafungin|echinocandin)\b/i;

function isOfidJournal(journal: string | null | undefined): boolean {
  return OFID_JOURNAL_RE.test(journal ?? "");
}

function ofidHasAmsOrDrugSignal(title: string, abstract: string): boolean {
  const text = `${title} ${abstract}`;
  return OFID_AMS_SIGNAL_RE.test(text) || NAMED_DRUG_RE.test(text);
}

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
  if (NOISE_PUB_TYPE_RE.test(pubTypes)) return false;

  if (ANIMAL_RE.test(combined) && !HUMAN_RE.test(combined)) return false;

  if (isOfidJournal(rec.journal) && !ofidHasAmsOrDrugSignal(title, abstract)) {
    return false;
  }

  return true;
}
