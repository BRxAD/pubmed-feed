/**
 * Map article geography to the six WHO regions (AFR, AMR, SEAR, EUR, EMR, WPR).
 * Country lists follow WHO member assignment (Wikipedia List of WHO regions,
 * with official gaps filled: USA / Paraguay / Saint Kitts → AMR; Libya → EMR;
 * Indonesia → WPR as of May 2025). Rules-only — no LLM.
 *
 * Signals: author affiliations (ingest), plus title, abstract, keywords, MeSH.
 * Multi-label: a US–Kenya paper can be both Americas and African Region.
 */

export type WhoRegion = "afr" | "amr" | "sear" | "eur" | "emr" | "wpr";

export const ARTICLE_WHO_REGION_ORDER: WhoRegion[] = [
  "afr",
  "amr",
  "sear",
  "eur",
  "emr",
  "wpr",
];

export const ARTICLE_WHO_REGION_LABELS: Record<WhoRegion, string> = {
  afr: "African Region",
  amr: "Region of the Americas",
  sear: "South-East Asia Region",
  eur: "European Region",
  emr: "Eastern Mediterranean Region",
  wpr: "Western Pacific Region",
};

/**
 * Country / territory aliases per region. Matched longest-first on
 * punctuation-stripped lowercase text so "south sudan" wins over "sudan".
 */
const REGION_ALIASES: Record<WhoRegion, string[]> = {
  afr: [
    "democratic republic of the congo",
    "united republic of tanzania",
    "sao tome and principe",
    "central african republic",
    "republic of the congo",
    "equatorial guinea",
    "guinea bissau",
    "burkina faso",
    "cote d ivoire",
    "ivory coast",
    "south sudan",
    "south africa",
    "cabo verde",
    "cape verde",
    "sierra leone",
    "sub saharan africa",
    "congo kinshasa",
    "congo brazzaville",
    "western africa",
    "east africa",
    "west africa",
    "southern africa",
    "central africa",
    "who african region",
    "african region",
    "swaziland",
    "eswatini",
    "tanzania",
    "zimbabwe",
    "botswana",
    "lesotho",
    "namibia",
    "mozambique",
    "madagascar",
    "mauritius",
    "seychelles",
    "comoros",
    "mayotte",
    "reunion",
    "algeria",
    "angola",
    "benin",
    "burundi",
    "cameroon",
    "chad",
    "eritrea",
    "ethiopia",
    "gabon",
    "gambia",
    "ghana",
    "guinea",
    "kenya",
    "liberia",
    "malawi",
    "mali",
    "mauritania",
    "niger",
    "nigeria",
    "rwanda",
    "senegal",
    "togo",
    "uganda",
    "zambia",
    "zaire",
    "drc",
    "sao tome",
    "south sudanese",
    "kenyan",
    "nigerian",
    "ghanaian",
    "tanzanian",
    "ugandan",
    "ethiopian",
    "rwandan",
    "malawian",
    "zambian",
    "zimbabwean",
    "mozambican",
    "botswanan",
    "namibian",
    "senegalese",
    "ivorian",
    "cameroonian",
    "congolese",
    "algerian",
  ],
  amr: [
    "saint vincent and the grenadines",
    "united states of america",
    "antigua and barbuda",
    "trinidad and tobago",
    "saint kitts and nevis",
    "dominican republic",
    "el salvador",
    "costa rica",
    "united states",
    "puerto rico",
    "saint lucia",
    "st kitts and nevis",
    "st vincent",
    "latin america",
    "south america",
    "north america",
    "who region of the americas",
    "region of the americas",
    "bolivia",
    "venezuela",
    "argentina",
    "barbados",
    "bahamas",
    "belize",
    "brazil",
    "canada",
    "chile",
    "colombia",
    "cuba",
    "dominica",
    "ecuador",
    "grenada",
    "guatemala",
    "guyana",
    "haiti",
    "honduras",
    "jamaica",
    "mexico",
    "nicaragua",
    "panama",
    "paraguay",
    "peru",
    "suriname",
    "uruguay",
    "st lucia",
    "st kitts",
    "usa",
    "canadian",
    "brazilian",
    "mexican",
    "colombian",
    "argentine",
    "argentinian",
    "peruvian",
    "chilean",
    "cuban",
    "haitian",
    "jamaican",
  ],
  sear: [
    "democratic people s republic of korea",
    "democratic peoples republic of korea",
    "south east asia region",
    "southeast asia region",
    "who south east asia",
    "north korea",
    "timor leste",
    "east timor",
    "sri lanka",
    "bangladesh",
    "maldives",
    "myanmar",
    "thailand",
    "bhutan",
    "nepal",
    "india",
    "burma",
    "dprk",
    "indian",
    "bangladeshi",
    "nepalese",
    "nepali",
    "thai",
    "maldivian",
    "bhutanese",
    "burmese",
    "sri lankan",
  ],
  eur: [
    "united kingdom of great britain and northern ireland",
    "bosnia and herzegovina",
    "republic of moldova",
    "russian federation",
    "northern ireland",
    "north macedonia",
    "czech republic",
    "united kingdom",
    "great britain",
    "san marino",
    "who european region",
    "european union",
    "netherlands",
    "switzerland",
    "luxembourg",
    "kyrgyzstan",
    "kazakhstan",
    "azerbaijan",
    "uzbekistan",
    "turkmenistan",
    "tajikistan",
    "montenegro",
    "macedonia",
    "lithuania",
    "czechia",
    "slovakia",
    "slovenia",
    "bulgaria",
    "romania",
    "hungary",
    "portugal",
    "germany",
    "belgium",
    "austria",
    "ireland",
    "iceland",
    "finland",
    "denmark",
    "sweden",
    "norway",
    "poland",
    "france",
    "spain",
    "italy",
    "greece",
    "cyprus",
    "turkey",
    "turkiye",
    "ukraine",
    "belarus",
    "moldova",
    "estonia",
    "latvia",
    "croatia",
    "albania",
    "andorra",
    "armenia",
    "georgia",
    "israel",
    "monaco",
    "serbia",
    "kosovo",
    "russia",
    "england",
    "scotland",
    "wales",
    "holland",
    "britain",
    "tbilisi",
    "uk",
    "belgian",
    "british",
    "dutch",
    "swedish",
    "danish",
    "norwegian",
    "finnish",
    "german",
    "italian",
    "polish",
    "turkish",
    "irish",
    "swiss",
    "austrian",
    "portuguese",
    "greek",
    "hungarian",
    "romanian",
    "bulgarian",
    "croatian",
    "serbian",
    "ukrainian",
    "russian",
    "czech",
  ],
  emr: [
    "syrian arab republic",
    "islamic republic of iran",
    "united arab emirates",
    "eastern mediterranean region",
    "who eastern mediterranean",
    "saudi arabia",
    "afghanistan",
    "west bank",
    "palestine",
    "bahrain",
    "djibouti",
    "morocco",
    "pakistan",
    "tunisia",
    "lebanon",
    "somalia",
    "sudan",
    "jordan",
    "kuwait",
    "oman",
    "qatar",
    "yemen",
    "egypt",
    "syria",
    "libya",
    "iraq",
    "iran",
    "gaza",
    "uae",
    "pakistani",
    "iranian",
    "egyptian",
    "saudi",
    "lebanese",
    "moroccan",
    "iraqi",
    "afghan",
    "sudanese",
    "yemeni",
    "jordanian",
    "kuwaiti",
    "omani",
    "qatari",
    "emirati",
    "tunisian",
    "syrian",
    "libyan",
  ],
  wpr: [
    "lao people s democratic republic",
    "federated states of micronesia",
    "papua new guinea",
    "western pacific region",
    "who western pacific",
    "brunei darussalam",
    "marshall islands",
    "solomon islands",
    "republic of korea",
    "cook islands",
    "new zealand",
    "south korea",
    "hong kong",
    "viet nam",
    "vietnam",
    "australia",
    "cambodia",
    "indonesia",
    "kiribati",
    "malaysia",
    "mongolia",
    "philippines",
    "singapore",
    "vanuatu",
    "micronesia",
    "brunei",
    "taiwan",
    "taipei",
    "macau",
    "macao",
    "japan",
    "china",
    "korea",
    "nauru",
    "niue",
    "palau",
    "samoa",
    "tonga",
    "tuvalu",
    "fiji",
    "laos",
    "australian",
    "japanese",
    "chinese",
    "indonesian",
    "vietnamese",
    "filipino",
    "malaysian",
    "korean",
    "taiwanese",
    "singaporean",
    "cambodian",
    "mongolian",
  ],
};

type AliasHit = { alias: string; region: WhoRegion };

const SORTED_ALIASES: AliasHit[] = (
  Object.entries(REGION_ALIASES) as [WhoRegion, string[]][]
)
  .flatMap(([region, aliases]) =>
    aliases.map((alias) => ({ alias: normalizeText(alias), region }))
  )
  .filter((h) => h.alias.length > 0)
  .sort((a, b) => b.alias.length - a.alias.length || a.alias.localeCompare(b.alias));

const US_GEORGIA_MARKERS = [
  "university of georgia",
  "athens georgia",
  "atlanta",
  "savannah",
  "augusta",
  "macon",
  "usa",
  "united states",
];

function normalizeText(raw: string): string {
  return raw
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\bu\.s\.a\.?\b/g, " usa ")
    .replace(/\bu\.s\.?\b/g, " usa ")
    .replace(/\bu\.k\.?\b/g, " uk ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Phrases that look like country names but are not geography. */
const NOISE_PHRASES = [
  "guinea pigs",
  "guinea pig",
  "turkeys",
  "turkey meat",
  "wild turkey",
];

function padded(hay: string): string {
  return ` ${hay} `;
}

function stripNoise(hay: string): string {
  let out = padded(hay);
  for (const phrase of NOISE_PHRASES) {
    out = out.split(` ${phrase} `).join(" ");
  }
  return out.replace(/\s+/g, " ").trim();
}

/**
 * Georgia the country (EUR) vs Georgia the US state. Bare "georgia" only
 * counts as EUR when Tbilisi / republic markers are present, or when there
 * is no US-state context.
 */
function hayHasCountryGeorgia(hay: string): boolean {
  const p = padded(hay);
  if (!p.includes(" georgia ") && !p.includes(" tbilisi ")) return false;
  if (p.includes(" tbilisi ") || p.includes(" republic of georgia ")) return true;
  return !US_GEORGIA_MARKERS.some((m) => p.includes(` ${m} `));
}

export function classifyArticleWhoRegions(params: {
  title?: string | null;
  abstract?: string | null;
  keywords?: string[] | null;
  meshTerms?: string[] | null;
  affiliations?: string[] | null;
}): WhoRegion[] {
  const chunks = [
    ...(params.affiliations ?? []),
    params.title ?? "",
    params.abstract ?? "",
    ...(params.keywords ?? []),
    ...(params.meshTerms ?? []),
  ];
  let hay = stripNoise(normalizeText(chunks.filter(Boolean).join(" ")));
  if (!hay) return [];

  const found = new Set<WhoRegion>();
  for (const { alias, region } of SORTED_ALIASES) {
    if (alias === "georgia") continue;
    const needle = ` ${alias} `;
    if (!padded(hay).includes(needle)) continue;
    found.add(region);
    hay = padded(hay).split(needle).join(" ").replace(/\s+/g, " ").trim();
  }

  if (hayHasCountryGeorgia(hay)) found.add("eur");

  return ARTICLE_WHO_REGION_ORDER.filter((r) => found.has(r));
}
