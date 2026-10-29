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

/** The catalog file is the neonatal / NICU picture, not a general pediatric photo. */
export function isNeonatalSubjectImage(entry: { id: string; label: string }): boolean {
  const about = `${entry.id} ${entry.label}`.toLowerCase().replace(/[-_]/g, " ");
  return /\b(neonat\w*|newborns?|nicu|preterm|incubator)\b/.test(about);
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
    "If a person is present, show an unposed, candid moment caught mid-action. Match age, sex, professional role, and tone strictly to who the article is about. Show a neonatal unit, incubator, or newborn only when the article is about neonates and does not include adults. A study of women or pregnancy does not show a man as the patient.",
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
