/**
 * The words sent to the image model. No headline sentence: the model prints
 * any sentence it is given. The picture is documentary and loosely about the
 * story, in the manner of a public-health news photo. A named germ is shown
 * close up. An unlabeled medicine bottle is not a picture.
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

const CLINIC_VISIT =
  "A documentary photo of a primary-care visit: a clinician and an adult patient talking, both clothed, natural window light. The people are the subject. No medicine bottle as the subject. No labels.";

const HOSPITAL_BEDSIDE =
  "A documentary photo of a hospital clinician with a calm adult patient at the bedside, natural light. No unlabeled bottle as the subject. No readable screens or papers.";

const NASAL_SPRAY =
  "A documentary photo of an adult using a small nasal spray, at home or in a clinic, seen from the side, natural light. The spray is in their hand and is not the whole picture. No label and no letters.";

const POINT_OF_CARE =
  "A documentary photo of a primary-care clinician using a small rapid test while an adult patient sits beside them. Natural light. No readable labels. Not a product shot.";

const PRESCRIBING_DESK =
  "A documentary photo of a clinician at a computer in a hospital workroom, seen from the side, the screen turned away so nothing on it can be read. No medicine bottles.";

const ALLERGY_VISIT =
  "A documentary photo of a clinician and an adult patient talking in a clinic room about a drug allergy, calm, natural light. No bottles, no needles, no labels.";

const UTI_VISIT =
  "A documentary photo of an older woman speaking with a clinician in a primary-care room. A lidded specimen cup may sit on a side table, out of focus. The people are the subject. No labels.";

const IV_BEDSIDE =
  "A documentary photo of a clinician checking an intravenous line at the bedside of a calm adult patient. Natural light. No close-up of a bag label. No syringe in a hand.";

/**
 * One safe subject a reader could not call wrong.
 * Specific story scenes come before broad ones.
 */
function sceneMotif(text: string): string | null {
  const pregnant = /\bpregnan/.test(text);
  const child = /\b(child|children|pediatric|paediatric|infant|newborn|neonat)\b/.test(text);
  const nicu = /\b(nicu|preterm|neonat)\b/.test(text);
  const tb = /\btuberculosis\b|\btb\b/.test(text);
  const bacteremia = /\b(bacteremi[aa]|bloodstream|blood culture)\b|\bbsi\b/.test(text);

  if (/\bnasal spray/.test(text)) return NASAL_SPRAY;
  if (/\b(point-of-care|point of care|rapid test)\b/.test(text)) return POINT_OF_CARE;
  if (/\b(electronic prescribing|e-prescribing|eprescribing|prescribing system)\b/.test(text)) {
    return PRESCRIBING_DESK;
  }
  if (/\b(penicillin allergy|drug allergy|allergy label|delabel|de-label)\b/.test(text)) {
    return ALLERGY_VISIT;
  }
  if (pregnant) {
    return "A documentary portrait of a clothed pregnant woman in soft daylight, calm. No men. No procedure. No nudity. No syringe. No medicine bottle.";
  }
  if (nicu) {
    return "A documentary photo of a clear neonatal incubator with a baby's hand resting inside. Peaceful. No adult faces. No distress. No blood.";
  }
  if (tb && child) {
    return "A documentary portrait of a calm child, fully clothed, soft daylight. No hospital bed, no syringe, no device, no lesions.";
  }
  if (tb) {
    return "A documentary photo of a chest radiograph on a lightbox showing lungs only. No readable text. No patient. No syringe.";
  }
  if (bacteremia) {
    return "A documentary photo of gloved hands setting sealed blood-culture bottles on a lab bench. Not a product shot. No readable labels. No people beyond the hands.";
  }
  if (/\bmultiplex\b|\bpathogen panel\b|\brespiratory panel\b/.test(text)) {
    return "A documentary photo of a laboratory bench where a gloved hand loads one flat sealed cartridge into a small instrument. Not a home test. No readable labels. No operating room.";
  }
  if (/\b(dental|dentist|dentistry|odontogenic|periodont)\b/.test(text)) {
    return "A documentary photo of a dental clinic with instruments on a tray and the chair empty. No patient. No labels.";
  }
  if (/\b(urine|urinary|cystitis|bacteriuria|pyelonephritis|bladder)\b/.test(text)) {
    return UTI_VISIT;
  }
  if (/\b(pneumonia|ventilat)\b/.test(text)) {
    return "A documentary photo of a clinician listening to an adult patient's chest with a stethoscope. Calm, clothed, natural light. No labels.";
  }
  if (/\b(susceptib\w*|antibiogram|breakpoints?|eucast|clsi)\b/.test(text)) {
    return "A documentary news photo of a microbiologist at a sunlit lab bench, seen from the side, looking at one round culture plate. The person is the subject. No readable labels, letters, or numbers.";
  }
  if (/\b(respiratory|cough)\b/.test(text)) return CLINIC_VISIT;
  if (/\b(intravenous|infusion|parenteral)\b/.test(text)) return IV_BEDSIDE;
  if (/\b(nurse|nurses|nursing)\b/.test(text)) {
    return "A documentary photo of a nurse at a ward counter, turned partly away, at work. No petri dishes. No readable papers.";
  }
  if (child) {
    return "A documentary portrait of a calm child, fully clothed, soft daylight. No devices. No syringe. No distress. No medicine bottle.";
  }
  return null;
}

/** A named germ, drawn as the organism itself. Checked before a clinical scene. */
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

/** A named medicine becomes the clinical situation, not a product shot. */
function drugScene(text: string): string | null {
  if (/\b(vancomycin|daptomycin|ceftriaxone|cefepime|piperacillin|meropenem|imipenem|ertapenem|gentamicin|tobramycin|amikacin)\b/.test(text)) {
    return IV_BEDSIDE;
  }
  if (/\b(atorvastatin|rosuvastatin|simvastatin|pravastatin|fluvastatin|pitavastatin|amoxicillin|ampicillin|azithromycin|ciprofloxacin|levofloxacin|moxifloxacin|doxycycline|metronidazole|clindamycin|nitrofurantoin|cephalexin|cefalexin|linezolid|fluconazole|penicillin|fosfomycin|fidaxomicin|methenamine)\b/.test(text)) {
    return CLINIC_VISIT;
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
  return "A quiet residential neighborhood in daylight: houses, trees, and a sidewalk. Documentary, not a studio shot. No hospital, no clinic, no ward, no corridor, no people close up, no signs, no letters.";
}

/** A photo of a hospital place. Labs, germs, and medicine bottles are not places. */
export function isHospitalPlaceImage(entry: { id: string; label: string }): boolean {
  const about = `${entry.id} ${entry.label}`.toLowerCase().replace(/[-_]/g, " ");
  return /\b(hospitals?|inpatient|ward|icu|corridor|nosocomial|atrium)\b/.test(about);
}

export function isCommunityStudy(settings: string[] | null | undefined): boolean {
  return Boolean(settings?.includes("community") && !settings.includes("hospital"));
}

function defaultScene(settings: string[] | null | undefined): string {
  if (isCommunityStudy(settings)) return CLINIC_VISIT;
  if (settings?.includes("hospital")) return HOSPITAL_BEDSIDE;
  return CLINIC_VISIT;
}

function pictureMotif(
  primary: string,
  extra: string,
  settings: string[] | null | undefined
): string {
  return (
    organismScene(primary) ??
    sceneMotif(primary) ??
    drugScene(primary) ??
    neighborhoodScene(primary) ??
    organismScene(extra) ??
    sceneMotif(extra) ??
    drugScene(extra) ??
    neighborhoodScene(extra) ??
    defaultScene(settings)
  );
}

export function buildStoryImagePrompt(candidate: StoryImagePromptInput): string {
  const headline = (candidate.headline ?? "").replace(/\s+/g, " ").trim();
  const title = (candidate.title ?? "").replace(/\s+/g, " ").trim();
  const extra = [...candidate.keywords, ...candidate.meshTerms, candidate.abstract ?? ""]
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  const motif = pictureMotif(
    `${headline} ${title}`.toLowerCase(),
    extra.toLowerCase(),
    candidate.settings
  );
  const communityNote = isCommunityStudy(candidate.settings)
    ? "The study is in the community. Do not show a hospital, ward, corridor, hospital bed, inpatient room, or emergency department."
    : "";
  return [
    "Photojournalism for a public-health news site. One real person at work in a real place, natural light, horizontal, quiet and specific. A news photograph, not a poster.",
    "Not an illustration, not a cover, not a product shot, not a studio still life, not a gray scientific diagram.",
    "Color grade: warm cream, olive green, deep plum, soft salmon, and steel blue. Muted.",
    `Show only this: ${motif}.`,
    communityNote,
    "Do not make an unlabeled medicine bottle, pill bottle, or amber bottle the subject.",
    "If an object is not named above, do not add it. Do not invent syringes, needles, or injections for medicines that are swallowed.",
    "Do not show the wrong sex. A story about women or pregnancy must not show a man.",
    "Professional and respectful. No nudity, no distress, no graphic disease, wounds, blood, rashes, or lesions, no weapons, no stereotypes.",
    "The picture contains no text of any kind. No title, no headline, no caption, no words, no letters, no numbers, no title bar, no beige text band, no labels, no logos, no flags, no watermarks, no readable documents, no charts.",
  ]
    .filter(Boolean)
    .join(" ");
}
