-- Main AMS PubMed topic.
-- 1) AMS MeSH or stewardship phrases alone are enough.
-- 2) Use/exposure still needs a high-signal study/design/scope block
--    (no loose intervention*/implementation/guidance/recommendation*/ASP).
-- 3) Priority journals: antibiotic/antimicrobial in TITLE only.
--    Lancet list is ID/public-health titles only. No Nat Commun.
-- 4) Named drugs (vancomycin, pip-tazo, etc.) only with a stewardship
--    co-term, so PK/toxicity papers without an AMS frame stay out.
-- Animal exclusion stays (animals NOT humans). AI stewardship matches main.
-- Run in Supabase SQL Editor (ASCII comments only).

UPDATE public.topics
SET query_string = '(
  "Antimicrobial Stewardship"[MeSH]
  OR "antimicrobial stewardship"[Title/Abstract]
  OR "antibiotic stewardship"[Title/Abstract]
  OR
  (
    (
      "antibiotic use"[Title/Abstract]
      OR "antimicrobial use"[Title/Abstract]
      OR "antimicrobial exposure"[Title/Abstract]
      OR "antibiotic exposure"[Title/Abstract]
    )
    AND
    (
      "Practice Guideline"[Publication Type]
      OR "Guideline"[Publication Type]
      OR "Systematic Review"[Publication Type]
      OR "Meta-Analysis"[Publication Type]
      OR "Randomized Controlled Trial"[Publication Type]
      OR "Controlled Clinical Trial"[Publication Type]
      OR "Observational Study"[Publication Type]
      OR "Comparative Study"[Publication Type]
      OR "Multicenter Study"[Publication Type]
      OR "Clinical Trial"[Publication Type]

      OR guideline*[Title/Abstract]
      OR "consensus statement"[Title/Abstract]
      OR "consensus guideline"[Title/Abstract]

      OR national[Title/Abstract]
      OR international[Title/Abstract]
      OR multicountry[Title/Abstract]
      OR "multi-country"[Title/Abstract]
      OR worldwide[Title/Abstract]

      OR "systematic review"[Title/Abstract]
      OR "meta-analysis"[Title/Abstract]
      OR "meta analysis"[Title/Abstract]

      OR randomized[Title/Abstract]
      OR randomised[Title/Abstract]
      OR "controlled trial"[Title/Abstract]
      OR "clinical trial"[Title/Abstract]

      OR cohort[Title/Abstract]
      OR "cross-sectional"[Title/Abstract]
      OR "cross sectional"[Title/Abstract]
      OR observational[Title/Abstract]
      OR prospective[Title/Abstract]
      OR retrospective[Title/Abstract]
      OR multicenter[Title/Abstract]
      OR multicentre[Title/Abstract]
      OR "multi-center"[Title/Abstract]
      OR "multi-centre"[Title/Abstract]
      OR "interrupted time series"[Title/Abstract]
      OR "quasi-experimental"[Title/Abstract]
      OR "before-and-after"[Title/Abstract]
      OR "before and after"[Title/Abstract]
      OR "difference-in-differences"[Title/Abstract]
      OR "difference in differences"[Title/Abstract]

      OR "stewardship program"[Title/Abstract]
      OR "stewardship programme"[Title/Abstract]
      OR "antimicrobial stewardship program"[Title/Abstract]
      OR "antibiotic stewardship program"[Title/Abstract]
      OR "quality improvement"[Title/Abstract]
    )
  )
  OR
  (
    (
      antimicrobial[Title]
      OR antimicrobials[Title]
      OR antibiotic[Title]
      OR antibiotics[Title]
    )
    AND
    (
      "Lancet"[Journal]
      OR "Lancet Infect Dis"[Journal]
      OR "Lancet Microbe"[Journal]
      OR "Lancet Glob Health"[Journal]
      OR "Lancet Public Health"[Journal]
      OR "Lancet Digit Health"[Journal]
      OR "Lancet Reg Health Eur"[Journal]
      OR "Lancet Reg Health Am"[Journal]
      OR "Lancet Reg Health West Pac"[Journal]
      OR "Lancet Reg Health Southeast Asia"[Journal]
      OR "EClinicalMedicine"[Journal]

      OR "N Engl J Med"[Journal]
      OR "New England Journal of Medicine"[Journal]

      OR "JAMA"[Journal]

      OR "Nature"[Journal]
      OR "Nat Med"[Journal]
      OR "Nat Microbiol"[Journal]
      OR "npj Antimicrob Resist"[Journal]
      OR "Clin Microbiol Infect"[Journal]
      OR "Clinical Microbiology and Infection"[Journal]
      OR "CMI Commun"[Journal]
      OR "CMI Communications"[Journal]
      OR "Infect Control Hosp Epidemiol"[Journal]
      OR "Infection Control and Hospital Epidemiology"[Journal]
      OR "Clin Infect Dis"[Journal]
      OR "Clinical Infectious Diseases"[Journal]
      OR "Open Forum Infect Dis"[Journal]
      OR "Open Forum Infectious Diseases"[Journal]
      OR "Antimicrob Steward Healthc Epidemiol"[Journal]
      OR "Antimicrobial Stewardship & Healthcare Epidemiology"[Journal]
      OR "Antimicrobial Stewardship and Healthcare Epidemiology"[Journal]
    )
  )
  OR
  (
    (
      stewardship[Title/Abstract]
      OR de-escalat*[Title/Abstract]
      OR deescalat*[Title/Abstract]
      OR "audit and feedback"[Title/Abstract]
      OR "prospective audit"[Title/Abstract]
      OR "iv to oral"[Title/Abstract]
      OR "iv to po"[Title/Abstract]
      OR "intravenous to oral"[Title/Abstract]
      OR "oral switch"[Title/Abstract]
      OR "oral step-down"[Title/Abstract]
      OR "days of therapy"[Title/Abstract]
      OR "duration of therapy"[Title/Abstract]
      OR "length of therapy"[Title/Abstract]
      OR "antibiotic timeout"[Title/Abstract]
      OR prescribing[Title/Abstract]
    )
    AND
    (
      vancomycin[Title/Abstract]
      OR piperacillin*[Title/Abstract]
      OR "pip-tazo"[Title/Abstract]
      OR "pip/tazo"[Title/Abstract]
      OR piptazo[Title/Abstract]
      OR tazobactam[Title/Abstract]
      OR meropenem[Title/Abstract]
      OR imipenem[Title/Abstract]
      OR ertapenem[Title/Abstract]
      OR doripenem[Title/Abstract]
      OR carbapenem*[Title/Abstract]
      OR ceftriaxone[Title/Abstract]
      OR cefepime[Title/Abstract]
      OR ceftazidime[Title/Abstract]
      OR cefazolin[Title/Abstract]
      OR cefotaxime[Title/Abstract]
      OR cephalexin[Title/Abstract]
      OR cefalexin[Title/Abstract]
      OR cephalosporin*[Title/Abstract]
      OR ciprofloxacin[Title/Abstract]
      OR levofloxacin[Title/Abstract]
      OR moxifloxacin[Title/Abstract]
      OR fluoroquinolon*[Title/Abstract]
      OR azithromycin[Title/Abstract]
      OR linezolid[Title/Abstract]
      OR daptomycin[Title/Abstract]
      OR gentamicin[Title/Abstract]
      OR tobramycin[Title/Abstract]
      OR amikacin[Title/Abstract]
      OR aminoglycoside*[Title/Abstract]
      OR amoxicillin[Title/Abstract]
      OR ampicillin[Title/Abstract]
      OR metronidazole[Title/Abstract]
      OR clindamycin[Title/Abstract]
      OR doxycycline[Title/Abstract]
      OR "trimethoprim-sulfamethoxazole"[Title/Abstract]
      OR cotrimoxazole[Title/Abstract]
      OR "co-trimoxazole"[Title/Abstract]
      OR colistin[Title/Abstract]
      OR polymyxin*[Title/Abstract]
      OR aztreonam[Title/Abstract]
      OR ceftaroline[Title/Abstract]
      OR ceftolozane[Title/Abstract]
      OR cefiderocol[Title/Abstract]
      OR nitrofurantoin[Title/Abstract]
      OR fosfomycin[Title/Abstract]
      OR fidaxomicin[Title/Abstract]
      OR nafcillin[Title/Abstract]
      OR oxacillin[Title/Abstract]
      OR penicillin*[Title/Abstract]
      OR "beta-lactam"[Title/Abstract]
      OR "beta lactam"[Title/Abstract]
    )
  )
)

NOT
(
  (animals[MeSH] NOT humans[MeSH])
  OR case reports[Publication Type]
  OR Comment[Publication Type]
  OR Editorial[Publication Type]
  OR Letter[Publication Type]
  OR "Newspaper Article"[Publication Type]
)'
WHERE name ILIKE '%antimicrobial stewardship%';
