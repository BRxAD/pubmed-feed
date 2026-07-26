import type { ArticleSetting } from "@/lib/classifySetting";

export type CatalogEntry = {
  id: string;
  url: string;
  label: string;
  /** Attribution / license note for debugging. */
  source: "unsplash" | "wikimedia" | "pexels";
  tags: string[];
  requireAny?: string[];
  settings?: ArticleSetting[];
};

/**
 * Curated open-license images for stewardship themes.
 * Prefer distinctive, high-quality (often artistic) photographs.
 * Sources: Unsplash, Wikimedia Commons, Pexels — free for editorial use.
 * freeimages.co.uk is not used for hotlinking (unreliable CDN / unclear reuse).
 */
export const STORY_IMAGE_CATALOG: CatalogEntry[] = [
  // ── Oral / pharmacy ──────────────────────────────────────────────
  {
    id: "pills-capsule",
    url: "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?auto=format&fit=crop&w=1200&q=80",
    label: "capsules and pills",
    source: "unsplash",
    requireAny: ["pill", "pills", "capsule", "oral", "prescribing", "prescription", "pharmacy", "outpatient antibiotic"],
    tags: ["oral antibiotic", "pill", "pills", "capsule", "prescribing", "prescription", "pharmacy", "outpatient"],
  },
  {
    id: "pills-scattered-art",
    url: "https://images.unsplash.com/photo-1471864190281-a93a3070b6de?auto=format&fit=crop&w=1200&q=80",
    label: "colorful capsules still life",
    source: "unsplash",
    requireAny: ["pill", "capsule", "oral", "prescribing", "antibiotic course", "tablet"],
    tags: ["capsule", "pill", "oral", "tablet", "prescribing", "medication"],
  },
  {
    id: "medicine-bottles",
    url: "https://images.unsplash.com/photo-1587854692152-cbe660dbde88?auto=format&fit=crop&w=1200&q=80",
    label: "medicine bottles",
    source: "unsplash",
    requireAny: ["pharmacy", "dispensing", "medication", "outpatient", "community"],
    tags: ["pharmacy", "medication", "dispensing", "outpatient", "community", "retail pharmacy"],
    settings: ["community"],
  },
  {
    id: "pharmacy-shelves",
    url: "https://images.unsplash.com/photo-1585435557343-3b092031a831?auto=format&fit=crop&w=1200&q=80",
    label: "pharmacy shelves",
    source: "unsplash",
    requireAny: ["pharmacy", "dispensing", "community", "outpatient", "prescription"],
    tags: ["pharmacy", "dispensing", "community", "outpatient", "prescription"],
    settings: ["community"],
  },
  {
    id: "wikimedia-penicillin",
    url: "https://upload.wikimedia.org/wikipedia/commons/thumb/8/8a/Penicillin_culture.jpg/1280px-Penicillin_culture.jpg",
    label: "penicillin culture plate",
    source: "wikimedia",
    requireAny: ["penicillin", "beta-lactam", "culture", "microbiology", "discovery"],
    tags: ["penicillin", "culture", "microbiology", "antibiotic history", "beta-lactam"],
  },

  // ── IV / hospital drugs ──────────────────────────────────────────
  {
    id: "antibiotic-vials",
    url: "https://images.unsplash.com/photo-1583947215259-38e31be8751f?auto=format&fit=crop&w=1200&q=80",
    label: "glass medication vials",
    source: "unsplash",
    requireAny: ["vial", "intravenous", "infusion", "injection", "iv", "parenteral", "broad-spectrum"],
    tags: ["vial", "injection", "intravenous", "infusion", "parenteral", "inpatient antibiotic"],
    settings: ["hospital"],
  },
  {
    id: "iv-drip",
    url: "https://images.unsplash.com/photo-1579154204601-01588f351e67?auto=format&fit=crop&w=1200&q=80",
    label: "IV infusion line",
    source: "unsplash",
    requireAny: ["intravenous", "infusion", "iv", "drip", "parenteral", "inpatient"],
    tags: ["intravenous", "infusion", "iv", "inpatient", "hospital"],
    settings: ["hospital"],
  },
  {
    id: "syringe-ampoules",
    url: "https://images.unsplash.com/photo-1631549916768-4119b2e5f926?auto=format&fit=crop&w=1200&q=80",
    label: "syringe and ampoules",
    source: "unsplash",
    requireAny: ["injection", "syringe", "ampoule", "vaccine", "parenteral"],
    tags: ["injection", "syringe", "ampoule", "vaccine", "parenteral", "dose"],
  },

  // ── Hospital / clinicians ────────────────────────────────────────
  {
    id: "hospital-corridor",
    url: "https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?auto=format&fit=crop&w=1200&q=80",
    label: "hospital corridor light",
    source: "unsplash",
    requireAny: ["hospital", "inpatient", "ward", "nosocomial", "healthcare-associated", "admission"],
    tags: ["hospital", "inpatient", "ward", "nosocomial", "admission", "acute care"],
    settings: ["hospital"],
  },
  {
    id: "hospital-architecture",
    url: "https://images.unsplash.com/photo-1586773860418-d37222d8fce3?auto=format&fit=crop&w=1200&q=80",
    label: "modern hospital atrium",
    source: "unsplash",
    requireAny: ["hospital", "facility", "health system", "inpatient", "institution"],
    tags: ["hospital", "facility", "health system", "inpatient"],
    settings: ["hospital"],
  },
  {
    id: "hospital-staff",
    url: "https://images.unsplash.com/photo-1631217868264-e5b90bb7e133?auto=format&fit=crop&w=1200&q=80",
    label: "clinicians in discussion",
    source: "unsplash",
    requireAny: ["clinician", "physician", "doctor", "rounds", "stewardship team", "guideline"],
    tags: ["clinician", "physician", "doctor", "rounds", "guideline", "stewardship program"],
    settings: ["hospital"],
  },
  {
    id: "surgeon-or",
    url: "https://images.unsplash.com/photo-1551190822-a9333d879b1f?auto=format&fit=crop&w=1200&q=80",
    label: "operating room",
    source: "unsplash",
    requireAny: ["surgery", "surgical", "perioperative", "prophylaxis", "operating"],
    tags: ["surgery", "surgical", "perioperative", "prophylaxis", "operating room"],
    settings: ["hospital"],
  },
  {
    id: "icu-monitor",
    url: "https://images.unsplash.com/photo-1579684385127-1ef15d508118?auto=format&fit=crop&w=1200&q=80",
    label: "critical care monitors",
    source: "unsplash",
    requireAny: ["icu", "intensive", "critical", "ventilator", "sepsis", "shock"],
    tags: ["icu", "intensive care", "critical care", "ventilator", "sepsis", "shock"],
    settings: ["hospital"],
  },
  {
    id: "pexels-stethoscope-desk",
    url: "https://images.pexels.com/photos/4386467/pexels-photo-4386467.jpeg?auto=compress&cs=tinysrgb&w=1200",
    label: "stethoscope on chart",
    source: "pexels",
    requireAny: ["clinician", "physician", "diagnosis", "consultation", "guideline"],
    tags: ["stethoscope", "clinician", "diagnosis", "consultation", "guideline"],
  },

  // ── Community / outpatient ───────────────────────────────────────
  {
    id: "clinic-stethoscope",
    url: "https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?auto=format&fit=crop&w=1200&q=80",
    label: "clinic stethoscope",
    source: "unsplash",
    requireAny: ["clinic", "outpatient", "primary", "ambulatory", "sinusitis", "uri", "community"],
    tags: ["clinic", "outpatient", "primary care", "ambulatory", "sinusitis", "uri", "community"],
    settings: ["community"],
  },
  {
    id: "emergency-care",
    url: "https://images.unsplash.com/photo-1516549655169-df83a0774514?auto=format&fit=crop&w=1200&q=80",
    label: "emergency department",
    source: "unsplash",
    requireAny: ["emergency", "ed", "er", "triage", "urgent"],
    tags: ["emergency", "emergency department", "triage", "urgent", "ed visit"],
    settings: ["hospital", "community"],
  },
  {
    id: "pediatric-care",
    url: "https://images.unsplash.com/photo-1584515933487-779824d29309?auto=format&fit=crop&w=1200&q=80",
    label: "pediatric clinical care",
    source: "unsplash",
    requireAny: ["pediatric", "paediatric", "child", "children", "kids", "infant", "otitis"],
    tags: ["pediatric", "paediatric", "child", "children", "infant", "otitis"],
    settings: ["community", "hospital"],
  },
  {
    id: "doctor-exam",
    url: "https://images.unsplash.com/photo-1612349317150-e413f6a5b16d?auto=format&fit=crop&w=1200&q=80",
    label: "physician consultation",
    source: "unsplash",
    requireAny: ["consultation", "clinical visit", "diagnosis", "primary care"],
    tags: ["consultation", "physician", "clinical visit", "diagnosis", "exam"],
    settings: ["community"],
  },

  // ── Microbiology / lab (verified micro themes) ───────────────────
  {
    id: "petri-culture",
    url: "https://images.unsplash.com/photo-1530026405186-ed1f139313f8?auto=format&fit=crop&w=1200&q=80",
    label: "bacterial culture plates",
    source: "unsplash",
    requireAny: ["microbiology", "culture", "petri", "antibiogram", "susceptibility", "colony", "bacterial"],
    tags: ["microbiology", "culture", "bacteria", "antibiogram", "susceptibility", "colony", "pathogen"],
  },
  {
    id: "wikimedia-agar-plates",
    url: "https://upload.wikimedia.org/wikipedia/commons/thumb/5/5a/Agar_plates_with_bacterial_colonies.jpg/1280px-Agar_plates_with_bacterial_colonies.jpg",
    label: "agar plates with colonies",
    source: "wikimedia",
    requireAny: ["culture", "colony", "bacteria", "microbiology", "agar", "pathogen"],
    tags: ["agar", "colony", "bacteria", "microbiology", "culture", "pathogen"],
  },
  {
    id: "lab-microscope",
    url: "https://images.unsplash.com/photo-1576086213369-97a306d36557?auto=format&fit=crop&w=1200&q=80",
    label: "laboratory microscope",
    source: "unsplash",
    requireAny: ["laboratory", "lab", "microbiology", "diagnostic", "pathogen", "mic", "susceptibility"],
    tags: ["laboratory", "microbiology", "diagnostic", "pathogen", "mic", "assay"],
  },
  {
    id: "lab-pipette",
    url: "https://images.unsplash.com/photo-1532187863486-abf9dbad1b69?auto=format&fit=crop&w=1200&q=80",
    label: "lab pipette work",
    source: "unsplash",
    requireAny: ["molecular", "pcr", "genomic", "sequencing", "pipette", "assay", "sample"],
    tags: ["molecular", "pcr", "genomic", "sequencing", "assay", "laboratory research"],
  },
  {
    id: "wikimedia-e-coli",
    url: "https://upload.wikimedia.org/wikipedia/commons/thumb/3/32/EscherichiaColi_NIAID.jpg/1280px-EscherichiaColi_NIAID.jpg",
    label: "E. coli microscopy",
    source: "wikimedia",
    requireAny: ["escherichia", "e. coli", "e coli", "gram-negative", "bacilli", "enterobacteriaceae"],
    tags: ["escherichia", "gram-negative", "bacteria", "pathogen", "microbiology"],
  },
  {
    id: "blood-culture",
    url: "https://images.unsplash.com/photo-1579154204601-01588f351e67?auto=format&fit=crop&w=1200&q=80",
    label: "blood sample draw",
    source: "unsplash",
    requireAny: ["blood", "bacteremia", "sepsis", "phlebotomy", "blood culture"],
    tags: ["blood", "blood culture", "bacteremia", "sepsis", "phlebotomy"],
    settings: ["hospital"],
  },

  // ── Long-term care / aging ───────────────────────────────────────
  {
    id: "elder-care",
    url: "https://images.unsplash.com/photo-1576091160550-2173dba999ef?auto=format&fit=crop&w=1200&q=80",
    label: "elder care",
    source: "unsplash",
    requireAny: ["elderly", "aging", "nursing", "long-term", "ltc", "geriatric", "care home"],
    tags: ["elderly", "nursing home", "long-term care", "ltc", "geriatric", "care home"],
    settings: ["long-term care"],
  },
  {
    id: "nurse-patient",
    url: "https://images.unsplash.com/photo-1559839734-2b71ea197ec2?auto=format&fit=crop&w=1200&q=80",
    label: "nurse with patient",
    source: "unsplash",
    requireAny: ["nurse", "nursing", "bedside", "patient care"],
    tags: ["nurse", "nursing", "bedside", "patient care", "ward care"],
    settings: ["long-term care", "hospital"],
  },
  {
    id: "pexels-elderly-hands",
    url: "https://images.pexels.com/photos/7551643/pexels-photo-7551643.jpeg?auto=compress&cs=tinysrgb&w=1200",
    label: "caring hands elder",
    source: "pexels",
    requireAny: ["elderly", "geriatric", "nursing home", "long-term", "ltc"],
    tags: ["elderly", "geriatric", "nursing home", "long-term care", "care"],
    settings: ["long-term care"],
  },

  // ── Surveillance / data / public health ──────────────────────────
  {
    id: "data-dashboard",
    url: "https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&w=1200&q=80",
    label: "data analytics",
    source: "unsplash",
    requireAny: ["surveillance", "audit", "dashboard", "metric", "benchmark", "scorecard", "utilization", "nationwide"],
    tags: ["surveillance", "audit", "dashboard", "metric", "benchmark", "utilization", "nationwide"],
  },
  {
    id: "public-health",
    url: "https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?auto=format&fit=crop&w=1200&q=80",
    label: "public health planning",
    source: "unsplash",
    requireAny: ["epidemiology", "outbreak", "public health", "population", "national", "policy", "health system"],
    tags: ["epidemiology", "outbreak", "public health", "population", "national", "policy"],
  },
  {
    id: "globe-network",
    url: "https://images.unsplash.com/photo-1529107386315-e1a2ed48a620?auto=format&fit=crop&w=1200&q=80",
    label: "global network lights",
    source: "unsplash",
    requireAny: ["global", "international", "worldwide", "lmic", "low-income", "multi-country"],
    tags: ["global", "international", "worldwide", "network", "policy"],
    settings: ["environment"],
  },

  // ── One Health / environment / animals ───────────────────────────
  {
    id: "vet-care",
    url: "https://images.unsplash.com/photo-1548199973-03cce0bbc87b?auto=format&fit=crop&w=1200&q=80",
    label: "companion animals",
    source: "unsplash",
    requireAny: ["veterinary", "animal", "pet", "companion", "one health", "zoonotic"],
    tags: ["veterinary", "animal", "companion animal", "one health", "zoonotic"],
    settings: ["animal"],
  },
  {
    id: "livestock",
    url: "https://images.unsplash.com/photo-1500595046743-cd271d694d30?auto=format&fit=crop&w=1200&q=80",
    label: "livestock pasture",
    source: "unsplash",
    requireAny: ["livestock", "cattle", "farm", "agriculture", "food animal"],
    tags: ["livestock", "cattle", "farm", "agriculture", "food animal", "veterinary"],
    settings: ["animal"],
  },
  {
    id: "wastewater",
    url: "https://images.unsplash.com/photo-1581093588401-fbb62a02f120?auto=format&fit=crop&w=1200&q=80",
    label: "water treatment",
    source: "unsplash",
    requireAny: ["wastewater", "effluent", "resistome", "environmental", "sewage", "water"],
    tags: ["wastewater", "effluent", "resistome", "environmental", "sewage", "water treatment"],
    settings: ["environment"],
  },
  {
    id: "wikimedia-one-health",
    url: "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4e/One_Health_Triad.png/1280px-One_Health_Triad.png",
    label: "One Health triad diagram",
    source: "wikimedia",
    requireAny: ["one health", "zoonotic", "human-animal", "interdisciplinary"],
    tags: ["one health", "zoonotic", "interdisciplinary", "animal", "environment"],
    settings: ["animal", "environment"],
  },

  // ── Artistic / atmospheric medical ───────────────────────────────
  {
    id: "blue-gloves-art",
    url: "https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?auto=format&fit=crop&w=1200&q=80",
    label: "gloved hands laboratory",
    source: "unsplash",
    requireAny: ["laboratory", "aseptic", "sterile", "infection control", "ppe", "gloves"],
    tags: ["laboratory", "gloves", "aseptic", "infection control", "ppe"],
  },
  {
    id: "light-microscope-art",
    url: "https://images.unsplash.com/photo-1532094349884-543bc11b234d?auto=format&fit=crop&w=1200&q=80",
    label: "microscope in soft light",
    source: "unsplash",
    requireAny: ["research", "laboratory", "science", "discovery", "translational"],
    tags: ["research", "laboratory", "science", "microscope", "discovery"],
  },
  {
    id: "pexels-medical-abstract",
    url: "https://images.pexels.com/photos/356040/pexels-photo-356040.jpeg?auto=compress&cs=tinysrgb&w=1200",
    label: "abstract medical blue",
    source: "pexels",
    requireAny: ["review", "commentary", "editorial", "perspective", "framework"],
    tags: ["review", "commentary", "editorial", "perspective", "framework"],
  },
  {
    id: "hand-hygiene",
    url: "https://images.unsplash.com/photo-1584820927498-cfe5211fd8bf?auto=format&fit=crop&w=1200&q=80",
    label: "hand washing",
    source: "unsplash",
    requireAny: ["hand hygiene", "infection prevention", "infection control", "washing", "ppe"],
    tags: ["hand hygiene", "infection prevention", "infection control", "washing"],
    settings: ["hospital"],
  },
  {
    id: "mri-diagnostics",
    url: "https://images.unsplash.com/photo-1530497610245-94d3c16cda28?auto=format&fit=crop&w=1200&q=80",
    label: "hospital diagnostics",
    source: "unsplash",
    requireAny: ["diagnostic imaging", "radiology", "ct", "mri", "imaging"],
    tags: ["diagnostic imaging", "radiology", "hospital diagnostics", "imaging"],
    settings: ["hospital"],
  },

  // ── UTI / urine ──────────────────────────────────────────────────
  {
    id: "uti-lab-sample",
    url: "https://images.unsplash.com/photo-1579154204601-01588f351e67?auto=format&fit=crop&w=1200&q=80",
    label: "clinical sample collection",
    source: "unsplash",
    requireAny: ["uti", "urinary", "cystitis", "pyelonephritis", "urine", "bacteriuria"],
    tags: ["urinary tract infection", "uti", "cystitis", "pyelonephritis", "urine", "bacteriuria"],
    settings: ["community", "hospital", "long-term care"],
  },
  {
    id: "pexels-urine-dipstick",
    url: "https://images.pexels.com/photos/8460157/pexels-photo-8460157.jpeg?auto=compress&cs=tinysrgb&w=1200",
    label: "point-of-care testing",
    source: "pexels",
    requireAny: ["uti", "urinary", "diagnostic stewardship", "point-of-care", "urine culture"],
    tags: ["uti", "urinary", "diagnostic", "urine culture", "point-of-care", "stewardship"],
    settings: ["community", "hospital"],
  },

  // ── C. difficile / GI ────────────────────────────────────────────
  {
    id: "hospital-isolation",
    url: "https://images.unsplash.com/photo-1584820927498-cfe5211fd8bf?auto=format&fit=crop&w=1200&q=80",
    label: "infection control hygiene",
    source: "unsplash",
    requireAny: ["clostridioides", "c. difficile", "cdiff", "colitis", "diarrhea", "isolation"],
    tags: ["clostridioides", "difficile", "colitis", "diarrhea", "infection control", "isolation"],
    settings: ["hospital", "long-term care"],
  },

  // ── Respiratory / pneumonia ──────────────────────────────────────
  {
    id: "chest-xray-light",
    url: "https://images.unsplash.com/photo-1559757175-5700dde675bc?auto=format&fit=crop&w=1200&q=80",
    label: "chest imaging review",
    source: "unsplash",
    requireAny: ["pneumonia", "respiratory", "cap", "hap", "vap", "lung", "pulmonary"],
    tags: ["pneumonia", "respiratory", "lung", "community-acquired pneumonia", "hospital-acquired"],
    settings: ["hospital", "community"],
  },
  {
    id: "pexels-oxygen-mask",
    url: "https://images.pexels.com/photos/263402/pexels-photo-263402.jpeg?auto=compress&cs=tinysrgb&w=1200",
    label: "acute respiratory care",
    source: "pexels",
    requireAny: ["pneumonia", "respiratory", "ventilator", "vap", "oxygen", "icu"],
    tags: ["pneumonia", "respiratory", "ventilator", "icu", "critical care"],
    settings: ["hospital"],
  },

  // ── Sepsis / bacteremia ──────────────────────────────────────────
  {
    id: "sepsis-urgent",
    url: "https://images.unsplash.com/photo-1581595220892-b0739db3b8c5?auto=format&fit=crop&w=1200&q=80",
    label: "urgent hospital care",
    source: "unsplash",
    requireAny: ["sepsis", "septic", "bacteremia", "bloodstream", "shock", "bsi"],
    tags: ["sepsis", "bacteremia", "bloodstream infection", "shock", "critical care"],
    settings: ["hospital"],
  },

  // ── Stewardship program / rounds ─────────────────────────────────
  {
    id: "stewardship-meeting",
    url: "https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?auto=format&fit=crop&w=1200&q=80",
    label: "clinical team discussion",
    source: "unsplash",
    requireAny: ["stewardship", "asp", "rounds", "prospective audit", "feedback", "guideline adherence"],
    tags: ["stewardship", "antimicrobial stewardship", "rounds", "audit", "feedback", "guideline"],
    settings: ["hospital"],
  },
  {
    id: "pexels-team-huddle",
    url: "https://images.pexels.com/photos/7089020/pexels-photo-7089020.jpeg?auto=compress&cs=tinysrgb&w=1200",
    label: "care team huddle",
    source: "pexels",
    requireAny: ["stewardship", "multidisciplinary", "team", "pharmacist", "intervention"],
    tags: ["stewardship", "multidisciplinary", "pharmacist", "team", "intervention"],
    settings: ["hospital", "community"],
  },

  // ── Antibiogram / resistance ─────────────────────────────────────
  {
    id: "wikimedia-antibiogram",
    url: "https://upload.wikimedia.org/wikipedia/commons/thumb/5/5a/Agar_plates_with_bacterial_colonies.jpg/1280px-Agar_plates_with_bacterial_colonies.jpg",
    label: "culture susceptibility plates",
    source: "wikimedia",
    requireAny: ["antibiogram", "susceptibility", "resistance", "mic", "ast", "resistant"],
    tags: ["antibiogram", "susceptibility", "resistance", "microbiology", "mic"],
  },
  {
    id: "pexels-lab-tubes",
    url: "https://images.pexels.com/photos/2280571/pexels-photo-2280571.jpeg?auto=compress&cs=tinysrgb&w=1200",
    label: "laboratory sample tubes",
    source: "pexels",
    requireAny: ["resistance", "mrsa", "vre", "cre", "esbl", "mdro", "pathogen"],
    tags: ["resistance", "mrsa", "pathogen", "multidrug", "microbiology", "gram-positive"],
  },

  // ── Catheter / devices ───────────────────────────────────────────
  {
    id: "iv-catheter-care",
    url: "https://images.unsplash.com/photo-1579154204601-01588f351e67?auto=format&fit=crop&w=1200&q=80",
    label: "vascular access care",
    source: "unsplash",
    requireAny: ["catheter", "central line", "clabsi", "cauti", "device-associated", "picc"],
    tags: ["catheter", "central line", "clabsi", "cauti", "device", "infection prevention"],
    settings: ["hospital"],
  },

  // ── Perioperative / SSI ──────────────────────────────────────────
  {
    id: "surgical-scrub",
    url: "https://images.unsplash.com/photo-1551190822-a9333d879b1f?auto=format&fit=crop&w=1200&q=80",
    label: "surgical suite",
    source: "unsplash",
    requireAny: ["surgical site", "ssi", "perioperative", "prophylaxis", "orthopedic surgery"],
    tags: ["surgical site infection", "perioperative", "prophylaxis", "surgery", "ssi"],
    settings: ["hospital"],
  },

  // ── Dental / outpatient specialty ────────────────────────────────
  {
    id: "dental-care",
    url: "https://images.unsplash.com/photo-1606811841689-23dfddce3e95?auto=format&fit=crop&w=1200&q=80",
    label: "dental clinical care",
    source: "unsplash",
    requireAny: ["dental", "dentist", "odontogenic", "oral surgery", "prophylaxis dental"],
    tags: ["dental", "dentist", "oral", "outpatient", "prophylaxis"],
    settings: ["community"],
  },

  // ── Vaccination / prevention ─────────────────────────────────────
  {
    id: "vaccination",
    url: "https://images.unsplash.com/photo-1631549916768-4119b2e5f926?auto=format&fit=crop&w=1200&q=80",
    label: "vaccination syringe",
    source: "unsplash",
    requireAny: ["vaccine", "vaccination", "immunization", "influenza vaccine", "pneumococcal"],
    tags: ["vaccine", "vaccination", "immunization", "prevention", "influenza"],
    settings: ["community", "hospital"],
  },

  // ── Pharmacist / prescribing ─────────────────────────────────────
  {
    id: "pharmacist-counsel",
    url: "https://images.unsplash.com/photo-1587854692152-cbe660dbde88?auto=format&fit=crop&w=1200&q=80",
    label: "pharmacy medications",
    source: "unsplash",
    requireAny: ["pharmacist", "prescribing", "prescription", "outpatient antibiotic", "community pharmacy"],
    tags: ["pharmacist", "prescribing", "prescription", "pharmacy", "outpatient"],
    settings: ["community"],
  },

  // ── Neonates / maternity (niche) ─────────────────────────────────
  {
    id: "neonatal-care",
    url: "https://images.unsplash.com/photo-1584515933487-779824d29309?auto=format&fit=crop&w=1200&q=80",
    label: "pediatric clinical setting",
    source: "unsplash",
    requireAny: ["neonatal", "neonate", "nicu", "newborn", "maternal", "obstetric"],
    tags: ["neonatal", "nicu", "newborn", "pediatric", "maternal"],
    settings: ["hospital"],
  },
];
