/**
 * The words sent to the image model. No headline sentence: the model prints
 * any sentence it is given. A named germ is shown close up. A named medicine,
 * when no germ is named, is one unlabeled dose. Nothing else is a pile of bottles.
 */
export type StoryImagePromptInput = {
  headline: string | null;
  title: string | null;
  abstract: string | null;
  keywords: string[];
  meshTerms: string[];
  /** Care setting. A community study must not be drawn as a hospital. */
  settings?: string[] | null;
};

/**
 * One safe subject. If the headline does not make an object certain,
 * use a person or organ that cannot be factually wrong.
 * Never invent a syringe for a medicine that is swallowed.
 */
function sceneMotif(text: string): string | null {
  const t = text.toLowerCase();
  const pregnant = /\bpregnan/.test(t);
  const child = /\b(child|children|pediatric|paediatric|infant|newborn|neonat)\b/.test(t);
  const nicu = /\b(nicu|preterm|neonat)\b/.test(t);
  const tb = /\btuberculosis\b|\btb\b/.test(t);
  const bacteremia = /\b(bacteremi[aa]|bloodstream|blood culture)\b|\bbsi\b/.test(t);
  const urine = /\b(urine|urinary|cystitis|bacteriuria|pyelonephritis|bladder)\b/.test(t);
  const lung = /\b(pneumonia|lung|respiratory|ventilat)\b/.test(t);
  const dental = /\b(dental|dentist|dentistry|odontogenic|periodont)\b/.test(t);
  const infusion = /\b(intravenous|infusion|parenteral)\b/.test(t);
  const nurse = /\b(nurse|nurses|nursing)\b/.test(t);

  if (pregnant) {
    return "A clothed pregnant woman, calm, visibly pregnant, soft daylight, magazine portrait. No men. No procedure. No nudity. No syringe.";
  }
  if (nicu) {
    return "Close-up of a clear neonatal incubator with a baby's hand resting inside. Peaceful. No adult faces. No distress. No blood. No syringe in the foreground.";
  }
  if (tb && child) {
    return "A calm child, fully clothed, soft daylight, magazine portrait. No hospital bed, no syringe, no needle, no device, no lesions.";
  }
  if (tb) {
    return "A chest radiograph on a lightbox showing lungs only. No readable text. No patient. No syringe.";
  }
  if (bacteremia) {
    return "Sealed blood culture bottles on a clean bench. No people. No petri dishes. No syringe. No dental chair.";
  }
  if (/\bmultiplex\b|\bpathogen panel\b|\brespiratory panel\b/.test(t)) {
    return "A laboratory multiplex PCR cartridge: one flat sealed plastic pouch standing in a small benchtop instrument slot. Not a home rapid test, not a lateral-flow cassette, not a pregnancy-test shape. No people. No operating room, surgical lights, or operating table. No syringe. No readable labels. No petri dishes.";
  }
  if (dental) {
    return "Dental instruments and a mouth mirror on a tray, chair empty. No patient.";
  }
  if (urine) {
    return "A lidded urine specimen cup on a clean tray. No people. No syringe.";
  }
  if (lung) {
    return "A chest radiograph on a lightbox showing lungs only. No readable text. No patient. No syringe.";
  }
  if (infusion) {
    return "An IV bag hanging in an empty room. No people. No syringe in a hand.";
  }
  if (nurse) {
    return "A nurses' station counter with a closed binder. No petri dishes. No people unless a nurse is clearly at work, turned away.";
  }
  if (child) {
    return "A calm child, fully clothed, soft daylight. No devices. No syringe. No distress.";
  }
  return null;
}

const DEFAULT_MOTIF =
  "One amber medicine bottle, cap on, on a linen cloth. Only one bottle. No people. No syringe. No needle. No petri dishes. No dental chair. No label and no letters.";

/** A named germ, drawn as the organism itself. Checked before a medicine bottle. */
const ORGANISM_SCENES: Array<[RegExp, string]> = [
  [/\bh\.?\s*pylori\b|\bhelicobacter\b/, "A close-up scientific photograph of curved spiral bacteria on a plain warm-gray background. No bottles. No people."],
  [/\bc\.?\s*diff(?:icile)?\b|\bclostridioides\b|\bclostridium difficile\b|\bcdi\b/, "A close-up scientific photograph of rod-shaped bacteria and a few round spores on a plain warm-gray background. No hospital, no ward, no bottles, no people."],
  [/\bmrsa\b|\bstaphylococcus aureus\b|\bs\.?\s*aureus\b/, "A close-up scientific photograph of round bacteria in grape-like clusters on a plain warm-gray background. No bottles. No people."],
  [/\bpseudomonas\b/, "A close-up scientific photograph of slender rod-shaped bacteria on a plain warm-gray background. No bottles. No people."],
  [/\bklebsiella\b/, "A close-up scientific photograph of short rod-shaped bacteria on a plain warm-gray background. No bottles. No people."],
  [/\bcandida\b/, "A close-up scientific photograph of oval yeast cells on a plain warm-gray background. No bottles. No people."],
  [/\bescherichia coli\b|\be\.?\s*coli\b/, "A close-up scientific photograph of short rod-shaped bacteria on a plain warm-gray background. No bottles. No people."],
  [/\bpneumococcus\b|\bstreptococcus pneumoniae\b/, "A close-up scientific photograph of round bacteria in pairs on a plain warm-gray background. No bottles. No people."],
  [/\bgonorrhoeae\b|\bgonorrhea\b|\bgonorrhoea\b/, "A close-up scientific photograph of paired round bacteria on a plain warm-gray background. No bottles. No people."],
  [/\binfluenza\b/, "A close-up scientific photograph of small round virus particles on a plain warm-gray background. No bottles. No people."],
  [/\bplasmodium\b|\bmalaria\b/, "A close-up scientific photograph of a red blood cell with a small ring form inside, on a plain warm-gray background. No bottles. No people."],
  [/\baspergillus\b/, "A close-up scientific photograph of a fungus with a stalk and a radiating head of spores, on a plain warm-gray background. No bottles. No people."],
];

/**
 * One dose of a named medicine, with nothing printed on it.
 * A statin is white oval tablets. A drug usually given by vein is one infusion bag.
 * Other named antibiotics are one bottle of capsules.
 */
function drugScene(text: string): string | null {
  if (/\b(atorvastatin|rosuvastatin|simvastatin|pravastatin|fluvastatin|pitavastatin)\b/.test(text)) {
    return "One amber bottle filled with plain white oval tablets, cap on, on linen. Only one bottle. No label and no letters.";
  }
  if (/\b(vancomycin|daptomycin|ceftriaxone|cefepime|piperacillin|meropenem|imipenem|ertapenem|gentamicin|tobramycin|amikacin)\b/.test(text)) {
    return "One clear intravenous fluid bag hanging on a stand in an empty room. No label, no letters, no people, no syringe in a hand.";
  }
  if (/\b(amoxicillin|ampicillin|azithromycin|ciprofloxacin|levofloxacin|moxifloxacin|doxycycline|metronidazole|clindamycin|nitrofurantoin|cephalexin|cefalexin|linezolid|fluconazole|penicillin|fosfomycin|fidaxomicin)\b/.test(text)) {
    return "One amber bottle of plain capsules, cap on, on linen. Only one bottle. No label and no letters.";
  }
  return null;
}

function organismScene(text: string): string | null {
  for (const [test, scene] of ORGANISM_SCENES) {
    if (test.test(text)) return scene;
  }
  return null;
}

function neighborhoodScene(text: string): string | null {
  if (!/\b(neighbourhood|neighborhood)s?\b/.test(text)) return null;
  return "A quiet residential neighborhood in daylight: houses, trees, and a sidewalk. No hospital, no clinic, no ward, no corridor, no people close up, no signs, no letters.";
}

/** A photo of a hospital place. Labs, germs, and medicine bottles are not places. */
export function isHospitalPlaceImage(entry: { id: string; label: string }): boolean {
  const about = `${entry.id} ${entry.label}`.toLowerCase().replace(/[-_]/g, " ");
  return /\b(hospitals?|inpatient|ward|icu|corridor|nosocomial|atrium)\b/.test(about);
}

export function isCommunityStudy(settings: string[] | null | undefined): boolean {
  return Boolean(settings?.includes("community") && !settings.includes("hospital"));
}

function pictureMotif(primary: string, extra: string): string {
  return (
    sceneMotif(primary) ??
    organismScene(primary) ??
    drugScene(primary) ??
    neighborhoodScene(primary) ??
    sceneMotif(extra) ??
    organismScene(extra) ??
    drugScene(extra) ??
    neighborhoodScene(extra) ??
    DEFAULT_MOTIF
  );
}

export function buildStoryImagePrompt(candidate: StoryImagePromptInput): string {
  const headline = (candidate.headline ?? "").replace(/\s+/g, " ").trim();
  const title = (candidate.title ?? "").replace(/\s+/g, " ").trim();
  const extra = [...candidate.keywords, ...candidate.meshTerms, candidate.abstract ?? ""]
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  const motif = pictureMotif(`${headline} ${title}`.toLowerCase(), extra.toLowerCase());
  const communityNote = isCommunityStudy(candidate.settings)
    ? "The study is in the community. Do not show a hospital, ward, corridor, hospital bed, inpatient room, or emergency department."
    : "";
  return [
    "Photorealistic photograph, landscape, natural light, shallow depth of field. Not an illustration, not a poster, not a cover.",
    "Color grade: warm cream, olive green, deep plum, soft salmon, and steel blue. Muted.",
    `Show only this: ${motif}.`,
    communityNote,
    "If an object is not named above, do not add it. Do not invent syringes, needles, or injections for medicines that are swallowed.",
    "Do not show the wrong sex. A story about women or pregnancy must not show a man.",
    "Professional and respectful. No nudity, no distress, no graphic disease, wounds, blood, rashes, or lesions, no weapons, no stereotypes.",
    "The picture contains no text of any kind. No title, no headline, no caption, no words, no letters, no numbers, no title bar, no beige text band, no labels, no logos, no flags, no watermarks, no readable documents, no charts.",
  ]
    .filter(Boolean)
    .join(" ");
}
