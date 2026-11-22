/**
 * The words sent to the image model.
 * The article sits above the instructions so the picture can follow that paper.
 * Those words are context only: the model is told not to draw them as text.
 */
export type StoryImagePromptInput = {
  headline: string | null;
  title: string | null;
  abstract: string | null;
  keywords: string[];
  meshTerms: string[];
  /** Care setting. Passed as a fact about the paper, not as a scene to copy. */
  settings?: string[] | null;
};

const ABSTRACT_MAX = 2500;
const LIST_MAX = 15;

function clean(text: string | null | undefined): string {
  return (text ?? "").replace(/\s+/g, " ").trim();
}

function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  const slice = text.slice(0, max);
  const space = slice.lastIndexOf(" ");
  return (space > 40 ? slice.slice(0, space) : slice).trim();
}

function listLine(label: string, items: string[]): string | null {
  const values = items.map(clean).filter(Boolean).slice(0, LIST_MAX);
  if (values.length === 0) return null;
  return `${label}: ${values.join("; ")}`;
}

/** Facts from the paper. Empty fields are left out. */
function articleContext(candidate: StoryImagePromptInput): string {
  const headline = clean(candidate.headline);
  const title = clean(candidate.title);
  const lines = [
    headline ? `Headline: ${headline}` : null,
    title && title.toLowerCase() !== headline.toLowerCase() ? `Title: ${title}` : null,
    candidate.settings?.length
      ? `Care setting: ${candidate.settings.map(clean).filter(Boolean).join(", ")}`
      : null,
    listLine("Keywords", candidate.keywords),
    listLine("MeSH", candidate.meshTerms),
    clean(candidate.abstract)
      ? `Abstract: ${clip(clean(candidate.abstract), ABSTRACT_MAX)}`
      : null,
  ];
  return lines.filter(Boolean).join("\n");
}

/** The paper is about neonates and does not include adults. */
export function allowsNeonatalImage(text: string): boolean {
  const neonatal = /\b(neonat\w*|newborns?|nicu|preterm)\b/i.test(text);
  const adult = /\badults?\b/i.test(text);
  return neonatal && !adult;
}

/**
 * A photo of one narrow subject must not be used for a different subject.
 * Checked on the file name, label, and tags so a recycled dental photo
 * cannot ride along on shared words such as "drug resistance".
 */
const NARROW_SUBJECTS: RegExp[] = [
  /\b(dental|dentists?|dentistry|odontogenic|periodont\w*|endodontic)\b/,
  /\bpregnan\w*/,
  /\b(veterinar\w*|dogs?)\b/,
  /\b(kidneys?|renal|urine|urinary|cystitis|pyelonephritis|bacteriuria)\b/,
  /\b(neoplasms?|cancers?|oncolog\w*|tumou?rs?)\b/,
  /\b(biofilms?|resistomes?|microbiomes?|microbiota)\b/,
  /\b(tuberculos\w*|antitubercular)\b/,
  /\b(peritonit\w*|cirrhos\w*)\b/,
  /\b(lepros\w*)\b/,
  /\b(autis\w*|adhd)\b/,
  /\b(phages?|bacteriophages?)\b/,
  /\b(difficile|\bcdi\b|\bcdiff\b)\b/,
  /\b(cellulit\w*|soft tissue)\b/,
  /\b(pneumon\w*|\blungs?\b|\bcap\b|\blrti\b|\bvap\b|respiratory)\b/,
  /\b(blood cultures?|bacterem\w*|bloodstream)\b/,
  /\b(operating rooms?|\bsurger(?:y|ies|ical)\b|perioperative|\bssi\b)\b/,
  /\b(intensive care|\bicu\b|critical care|ventilators?)\b/,
  /\b(wastewater|sewage)\b/,
  /\b(livestocks?|cattle)\b/,
  /\b(vaccin\w*)\b/,
  /\b(candid\w*|antifungals?|echinocandin)\b/,
  /\b(endocardit\w*)\b/,
  /\b(septic arthritis|native joint|\bjoints?\b|synovial)\b/,
  /\b(otitis|ear infection)\b/,
  /\b(gram-?negative|\bcarbapenem\w*)\b/,
  /\b(\bsti\b|gonorr\w*|chlamydia|syphilis|sexually transmitted)\b/,
];

export function narrowSubjectMismatch(
  corpus: string,
  entry: { id: string; label: string; tags?: string[] }
): boolean {
  const about = `${entry.id} ${entry.label} ${(entry.tags ?? []).join(" ")}`
    .toLowerCase()
    .replace(/[-_]/g, " ");
  const story = corpus.toLowerCase();
  return NARROW_SUBJECTS.some((test) => test.test(about) && !test.test(story));
}

/** A photo of a child or a pediatric visit. Checked on the file name and label, not tags. */
export function isChildSubjectImage(entry: { id: string; label: string }): boolean {
  const about = `${entry.id} ${entry.label}`.toLowerCase().replace(/[-_]/g, " ");
  return /\b(pediatr\w*|paediatr\w*|children|child)\b/.test(about);
}

/** The story is about children. "Childhood" alone does not count. */
export function allowsChildImage(text: string): boolean {
  return /\b(pediatr\w*|paediatr\w*|children|child|kids?|infants?)\b/i.test(text);
}

/** Pill, bottle, blister, and vial still lifes. */
export function isMedicationStillLife(entry: { id: string; label: string }): boolean {
  const about = `${entry.id} ${entry.label}`.toLowerCase().replace(/[-_]/g, " ");
  return /\b(pills?|capsules?|blister|bottles?|vials?|tablets?)\b/.test(about);
}

/** Penicillin-allergy label, challenge, or delabeling — not a product photo. */
export function isAllergyEvaluationStory(text: string): boolean {
  return /\b(delabel\w*|drug provocation|penicillin allergy|allergy labels?|oral challenge|skin testing)\b/i.test(
    text
  );
}

/**
 * A pill, bottle, or blister photo is allowed only when the headline is about
 * that product. A cancer, resistance, or prescribing paper does not get one.
 */
function mentionsListedSubject(entry: { id: string; label: string; tags?: string[] }): boolean {
  const about = `${entry.id} ${entry.label} ${(entry.tags ?? []).join(" ")}`
    .toLowerCase()
    .replace(/[-_]/g, " ");
  return NARROW_SUBJECTS.some((test) => test.test(about));
}

export function allowsMedicationStillLife(
  focus: string,
  entry: { id: string; label: string; tags?: string[] }
): boolean {
  if (!isMedicationStillLife(entry)) return true;
  if (mentionsListedSubject(entry) && !narrowSubjectMismatch(focus, entry)) return true;
  return /\b(biofilms?|microbiomes?|vaccin\w*|candid\w*|antifungals?|adherence|dispensing|step-?down|iv to oral|oral switch)\b/i.test(
    focus
  );
}

/** The catalog file is the neonatal / NICU picture, not a general pediatric photo. */
export function isNeonatalSubjectImage(entry: { id: string; label: string }): boolean {
  const about = `${entry.id} ${entry.label}`.toLowerCase().replace(/[-_]/g, " ");
  return /\b(neonat\w*|newborns?|nicu|preterm|incubator)\b/.test(about);
}

/**
 * A posed photo of one clinician. A study set in a named country must not
 * use it: the face reads as the staff in that place.
 */
const CLINICIAN_PORTRAIT_IDS = new Set(["doctor-exam", "white-coat"]);

export function isClinicianPortrait(entry: { id: string; label: string }): boolean {
  if (CLINICIAN_PORTRAIT_IDS.has(entry.id)) return true;
  const about = `${entry.id} ${entry.label}`.toLowerCase().replace(/[-_]/g, " ");
  return /\bportrait\b/.test(about);
}

/** Headline or title names a country, so a stock face is the wrong person. */
export function storyNamesCountry(text: string): boolean {
  return /\b(china|chinese|india|indian|brazil|brazilian|nigeria|kenya|japan|japanese|korea|korean|vietnam|thailand|indonesia|pakistan|bangladesh|egypt|mexico|ethiopia|uganda|tanzania|ghana|nepal|philippines|australia|canada|france|germany|italy|spain|sweden|norway|denmark|netherlands|belgium|switzerland|poland|turkey|iran|iraq|saudi|israel|argentina|chile|peru|colombia|taiwan|singapore|malaysia|england|scotland|wales|ireland)\b|\bunited states\b|\bunited kingdom\b|\bsouth africa\b|\bnew zealand\b|\bhong kong\b/i.test(
    text
  );
}

export function portraitMismatchForCountry(
  focus: string,
  entry: { id: string; label: string }
): boolean {
  return isClinicianPortrait(entry) && storyNamesCountry(focus);
}

/**
 * A patient in a hospital bed with an IV. Outpatient parenteral therapy
 * is not an admission, so this picture is the wrong place.
 */
const INPATIENT_BED_IDS = new Set([
  "local-intravenous-bag",
  "local-intravenous-medication-vancomycin-aminoglycoside",
]);

export function isInpatientBedImage(entry: { id: string; label: string }): boolean {
  if (INPATIENT_BED_IDS.has(entry.id)) return true;
  const about = `${entry.id} ${entry.label}`.toLowerCase().replace(/[-_]/g, " ");
  return /\b(bedside|hospital bed)\b/.test(about);
}

/** OPAT, home infusion, or other IV therapy given without a hospital stay. */
export function isOutpatientParenteralStory(text: string): boolean {
  return /\b(opats?|copats?|outpatient parenteral|home infusions?|home iv|outpatient iv|ambulatory infusions?)\b/i.test(
    text
  );
}

export function inpatientBedMismatch(
  focus: string,
  entry: { id: string; label: string }
): boolean {
  return isOutpatientParenteralStory(focus) && isInpatientBedImage(entry);
}

/** A photo of a hospital place. Labs, germs, and medicine bottles are not places. */
export function isHospitalPlaceImage(entry: { id: string; label: string }): boolean {
  const about = `${entry.id} ${entry.label}`.toLowerCase().replace(/[-_]/g, " ");
  return /\b(hospitals?|inpatient|ward|icu|corridor|nosocomial|atrium)\b/.test(about);
}

export function buildStoryImagePrompt(candidate: StoryImagePromptInput): string {
  const context = articleContext(candidate);
  return [
    context
      ? "Article context. Use this only to decide the scene. Do not draw any of these words, letters, or numbers in the photograph."
      : "",
    context,
    "Generate a documentary-style editorial news photograph to illustrate the main core theme or setting of the article above.",
    "Visual approach and subject:",
    "Select the single most grounded visual metaphor or setting described in the article (for example a hospital unit, a microbiology workspace, a clinical consultation room, a pharmacy archive, or an administrative office).",
    "Include a real person only if human interaction or workflow is central to the article. If the paper focuses on systems, diagnostic devices, environment, or data, show an authentic physical environment, workstation, or detail without a forced human subject.",
    "If a person is present, show an unposed, candid moment caught mid-action. Match age, sex, professional role, and tone strictly to who the article is about. Show a neonatal unit, incubator, or newborn only when the article is about neonates and does not include adults. A study of women or pregnancy does not show a man as the patient. When the study is set in a named country, show that place — a clinic, ward, village health post, or lab — not a close portrait of one person. Do not guess what the clinicians look like. Outpatient parenteral therapy and home infusion are not a hospital stay. Do not show a patient in a hospital bed. Show the pump in a home or a clinic.",
    "Camera and lighting:",
    "Realistic news photojournalism, 3:2 landscape orientation.",
    "Choose a focal length and depth of field that fits the subject: deep focus for a broad clinical environment, natural background blur for a focused moment.",
    "Natural ambient daylight or realistic room lighting. Use the real location's colors. Never oversaturated, stylized, or artificially tinted.",
    "Constraints:",
    "No text, letters, numbers, logos, charts, infographics, titles, headlines, captions, labels, or watermarks anywhere in the frame.",
    "No studio backdrops, staged poses, sterile stock-photo cliches, floating elements, or poster graphics. No pile of unlabeled medicine bottles, blister packs, or loose pills. Professional, quiet, and respectful. No nudity, distress, wounds, blood, rashes, weapons, or stereotypes.",
  ]
    .filter(Boolean)
    .join("\n\n");
}
