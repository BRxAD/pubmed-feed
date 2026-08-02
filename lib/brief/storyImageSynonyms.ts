/**
 * Expands common stewardship abbreviations / aliases into matchable phrases
 * so catalog tags hit more often without loosening the score threshold.
 */
const SYNONYM_EXPANSIONS: Array<{ match: RegExp; add: string }> = [
  { match: /\bmrsa\b/i, add: "methicillin-resistant staphylococcus aureus staph gram-positive" },
  { match: /\bvre\b/i, add: "vancomycin-resistant enterococcus gram-positive" },
  { match: /\bcre\b/i, add: "carbapenem-resistant enterobacterales gram-negative" },
  { match: /\besbl\b/i, add: "extended-spectrum beta-lactamase gram-negative" },
  { match: /\bcdiff\b|\bc\.?\s*diff(icile)?\b/i, add: "clostridioides difficile colitis cdiff diarrhea" },
  { match: /\buti\b|urinary tract infection/i, add: "urinary tract infection cystitis pyelonephritis urine" },
  { match: /\bcystitis\b/i, add: "urinary tract infection uti" },
  { match: /\bpyelonephritis\b/i, add: "urinary tract infection uti kidney" },
  { match: /\basp\b|antimicrobial stewardship/i, add: "antimicrobial stewardship stewardship program antibiotic stewardship" },
  { match: /\bhai\b|healthcare[- ]associated/i, add: "healthcare-associated nosocomial hospital-acquired infection" },
  { match: /\bcap\b|community[- ]acquired pneumonia/i, add: "community-acquired pneumonia respiratory lung" },
  { match: /\bhap\b|hospital[- ]acquired pneumonia/i, add: "hospital-acquired pneumonia nosocomial respiratory" },
  { match: /\bvap\b|ventilator[- ]associated/i, add: "ventilator-associated pneumonia icu intensive care" },
  { match: /\bbacteremia\b|bloodstream infection|\bbsi\b/i, add: "bacteremia bloodstream infection sepsis blood culture" },
  { match: /\bsepsis\b|septic shock/i, add: "sepsis septic shock critical care icu" },
  { match: /\bssi\b|surgical site/i, add: "surgical site infection perioperative surgery prophylaxis" },
  { match: /\bcatheter\b|\bcauti\b|central line|\bclabsi\b/i, add: "catheter bloodstream infection device" },
  { match: /\bpneumonia\b/i, add: "pneumonia respiratory lung infection" },
  { match: /\bmeningitis\b/i, add: "meningitis central nervous system" },
  { match: /\botitis\b/i, add: "otitis pediatric ear infection" },
  { match: /\bsinusitis\b|\buri\b|\burti\b|upper respiratory/i, add: "sinusitis uri urti upper respiratory outpatient flu cold" },
  { match: /\blrti\b|lower respiratory/i, add: "lrti lower respiratory pneumonia lung" },
  { match: /\bpharyngitis\b|strep throat/i, add: "pharyngitis outpatient streptococcus" },
  { match: /\bcellulitis\b|\bssti\b|soft[- ]tissue infection/i, add: "cellulitis soft tissue ssti skin infection abscess" },
  { match: /\behr\b|electronic health record|\bemr\b/i, add: "ehr electronic health record informatics clinical decision support" },
  { match: /\bdental\b|odontogenic|dentist/i, add: "dental dentist odontogenic oral surgery prophylaxis" },
  { match: /\bartificial intelligence\b|\bmachine learning\b|\bai\b/i, add: "artificial intelligence machine learning predictive ehr informatics" },
  { match: /\bantibiogram\b|susceptibility/i, add: "antibiogram susceptibility microbiology culture" },
  { match: /\bprocalcitonin\b|\bpct\b/i, add: "procalcitonin biomarker diagnostic stewardship" },
  { match: /\bde[- ]?escalat/i, add: "de-escalation stewardship intravenous oral" },
  { match: /\bduration\b|days of therapy|\bdot\b/i, add: "duration antibiotic course stewardship" },
  { match: /\boutpatient parenteral|\bopaat\b|\bcopaat\b/i, add: "outpatient parenteral antibiotic infusion" },
  { match: /\bltc\b|long[- ]term care|nursing home/i, add: "long-term care nursing home geriatric elderly" },
  { match: /\bone health\b/i, add: "one health zoonotic veterinary animal environment" },
  { match: /\bwastewater\b|resistome\b/i, add: "wastewater environmental resistome sewage" },
  { match: /\bpenicillin\b|beta[- ]lactam/i, add: "penicillin beta-lactam antibiotic" },
  { match: /\bvancomycin\b/i, add: "vancomycin intravenous gram-positive" },
  { match: /\bfluoroquinolone\b|\bciprofloxacin\b|\blevofloxacin\b/i, add: "fluoroquinolone prescribing outpatient" },
  { match: /\bnurse\b|\bnursing\b|\bnurses\b/i, add: "nurse nurses nursing health profession" },
  { match: /\bphysician\b|\bphysicians\b|\bdoctor\b|\bdoctors\b/i, add: "physician physicians doctor doctors health profession" },
  { match: /\bhealth professions?\b|\bhealthcare professionals?\b|\bhealth professionals?\b/i, add: "health profession health professions healthcare professional physician nurse" },
  { match: /\blaboratory\b|\bmicrobiology\b|\blab[- ]based\b|\bclinical lab(?:oratory)?\b/i, add: "laboratory microbiology lab-based clinical laboratory" },
  { match: /\bendocarditis\b|\bpericarditis\b/i, add: "heart endocarditis pericarditis" },
  { match: /\bmeningitis\b|\bcns\b|central nervous system/i, add: "brain meningitis central nervous system cns" },
  { match: /\bhand hygiene\b|infection prevention|\bipc\b/i, add: "hand hygiene infection prevention infection control" },
];

/** Append synonym expansions when abbreviations/aliases appear in the corpus. */
export function expandStoryCorpus(normalizedCorpus: string): string {
  const extras: string[] = [];
  for (const { match, add } of SYNONYM_EXPANSIONS) {
    if (match.test(normalizedCorpus)) extras.push(add);
  }
  if (extras.length === 0) return normalizedCorpus;
  return `${normalizedCorpus} ${extras.join(" ")}`.replace(/\s+/g, " ").trim();
}
