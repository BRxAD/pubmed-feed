import type { PubMedRecord } from "@/lib/pubmed/efetch";
import { classifyArticleSetting } from "@/lib/classifySetting";
import {
  DEFAULT_PENALTY_WEIGHTS,
  type PenaltyWeights,
} from "@/lib/brief/feedSettings";

const DEFAULT_SMALL_SAMPLE_MAX = 100;

const SIZE_PATTERNS: RegExp[] = [
  /\bn\s*[=≥>]\s*([\d,]+)/gi,
  /\b([\d,]+)\s+(?:patients?|participants?|subjects?|individuals?|adults?|children|cases?|encounters?|episodes?)\b/gi,
  /\b(?:included?|enrolled?|recruited?|analyzed?|analysed?)\s+([\d,]+)\b/gi,
  /\b([\d,]+)\s+(?:hospitals?|sites?|centers?|centres?|facilities|institutions?|icus?)\b/gi,
];

export type RelevancePenalty = {
  factor: number;
  reasons: string[];
};

const ONE_HEALTH_RE =
  /\b(one health|one-health|human-animal interface|human and animal|humans and animals|animal and human|animals and humans|human-animal)\b/i;

const ZOONOTIC_HUMAN_RE =
  /\b(zoonotic|zoonosis)\b/i;

const HUMAN_CLINICAL_RE =
  /\b(human|patient|hospital|clinical|healthcare|public health|inpatient|outpatient|icu\b|intensive care)\b/i;

const VET_ONLY_RE =
  /\b(veterinary|veterinarian|companion animal|food animal|livestock|poultry|swine|cattle|bovine|porcine|canine|feline|equine|animal hospital|dairy farm|broiler|feedlot|food-producing)\b/i;

const MULTI_CENTER_RE =
  /\b(multi[- ]center|multi[- ]centre|multicenter|multicentre|multi[- ]site|multisite|multi hospital|multiple hospitals|network of|collaborative network|\d+\s+(?:hospitals?|centers?|centres?|sites?|countries?))\b/i;

const SINGLE_CENTER_RE =
  /\b(single[- ]center|single[- ]centre|one hospital|one centre|one center|a tertiary|our hospital|university hospital|tertiary care (?:center|centre|hospital))\b/i;

const MAJOR_SCOPE_RE =
  /\b(nationwide|nation-wide|countrywide|country-wide|national(?:ly)?|national survey|national audit|national surveillance|national study|across (?:the )?(?:us|u\.s\.|united states|usa|canada|uk|united kingdom|europe|australia|oceania)|united states|u\.s\.|usa|canada|united kingdom|uk-wide|european union|eu-wide|multi[- ]country|international|global (?:surveillance|study|survey)|continental|statewide|province-wide|multi-province|\d+\s+(?:states?|provinces|regions))\b/i;

const DESCRIPTIVE_RE =
  /\b(descriptive|cross[- ]sectional|retrospective (?:chart|cohort)? review|ecological study|surveillance (?:study|data|report)?|survey|prevalence (?:study|of)|consumption (?:data|pattern|rate|study)|utilization (?:pattern|study)|prescribing pattern|antibiogram|resistance pattern|point prevalence)\b/i;

const AMR_TOPIC_RE =
  /\b(antibiotic (?:use|usage|consumption|prescribing|resistance)|antimicrobial (?:use|usage|consumption|resistance)|antibacterial use|amr\b|resistance rate|multidrug[- ]resistant|mdr\b|resistance prevalence)\b/i;

const INTERVENTION_RE =
  /\b(intervention|stewardship program|implementation|randomized|randomised|controlled trial|before[- ]after|stepped wedge|quality improvement|bundle|de-escalation program|audit and feedback)\b/i;

function studyText(rec: PubMedRecord): string {
  return [rec.title ?? "", rec.abstract ?? ""].join(" ").toLowerCase();
}

export function extractSampleSizes(abstract: string): number[] {
  const sizes: number[] = [];
  for (const re of SIZE_PATTERNS) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(abstract)) !== null) {
      const numStr = (m[1] ?? m[2] ?? "").replace(/,/g, "");
      const n = parseInt(numStr, 10);
      if (Number.isFinite(n) && n > 0) sizes.push(n);
    }
  }
  return sizes;
}

function primarySampleSize(rec: PubMedRecord): number | null {
  const abstract = rec.abstract ?? "";
  if (!abstract.trim()) return null;
  const sizes = extractSampleSizes(abstract);
  if (sizes.length === 0) return null;
  return Math.max(...sizes);
}

export function isOneHealthStudy(rec: PubMedRecord): boolean {
  const text = studyText(rec);
  if (ONE_HEALTH_RE.test(text)) return true;
  if (ZOONOTIC_HUMAN_RE.test(text) && HUMAN_CLINICAL_RE.test(text)) return true;
  return false;
}

export function isVeterinaryOnlyStudy(rec: PubMedRecord): boolean {
  if (isOneHealthStudy(rec)) return false;

  const setting = classifyArticleSetting({
    title: rec.title,
    abstract: rec.abstract,
    keywords: rec.keywords,
    meshTerms: rec.meshTerms,
  });
  if (setting === "animal") return true;

  const text = studyText(rec);
  if (VET_ONLY_RE.test(text) && !HUMAN_CLINICAL_RE.test(text)) return true;
  return false;
}

export function isSingleCenterSmallSampleStudy(
  rec: PubMedRecord,
  smallSampleMax = DEFAULT_SMALL_SAMPLE_MAX
): boolean {
  const text = studyText(rec);
  if (MAJOR_SCOPE_RE.test(text) || MULTI_CENTER_RE.test(text)) return false;

  const n = primarySampleSize(rec);
  const smallSample = n != null && n <= smallSampleMax;
  const singleCenter = SINGLE_CENTER_RE.test(text);

  if (singleCenter && smallSample) return true;

  // Single explicit n ≤ 50 with no multi-site signal is treated as small single-center.
  if (n != null && n <= 50 && !MULTI_CENTER_RE.test(text)) return true;

  return false;
}

export function isSmallRegionalDescriptiveStudy(rec: PubMedRecord): boolean {
  const text = studyText(rec);
  if (MAJOR_SCOPE_RE.test(text) || MULTI_CENTER_RE.test(text)) return false;
  if (!DESCRIPTIVE_RE.test(text) || !AMR_TOPIC_RE.test(text)) return false;
  if (INTERVENTION_RE.test(text)) return false;
  return true;
}

/** Multiplicative down-rates applied to final relevance. */
export function computeRelevancePenalty(
  rec: PubMedRecord,
  options?: Partial<PenaltyWeights> & { smallSampleMax?: number }
): RelevancePenalty {
  const weights = { ...DEFAULT_PENALTY_WEIGHTS, ...options };
  const smallSampleMax = options?.smallSampleMax ?? DEFAULT_SMALL_SAMPLE_MAX;
  const reasons: string[] = [];
  let factor = 1;

  if (isVeterinaryOnlyStudy(rec)) {
    factor *= weights.veterinary;
    reasons.push("Veterinary (non–One Health)");
  }
  if (isSingleCenterSmallSampleStudy(rec, smallSampleMax)) {
    factor *= weights.singleCenterSmall;
    reasons.push("Single-center, small sample");
  }
  if (isSmallRegionalDescriptiveStudy(rec)) {
    factor *= weights.descriptiveAmr;
    reasons.push("Small-scope descriptive AMR/use");
  }

  return {
    factor: Math.max(weights.minFactor, factor),
    reasons,
  };
}
