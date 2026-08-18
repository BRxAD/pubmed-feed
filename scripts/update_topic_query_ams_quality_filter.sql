-- Main AMS PubMed topic.
-- Antimicrobial Stewardship MeSH or stewardship phrases alone are enough.
-- Broader use/exposure terms still need a high-signal study/design/scope block.
-- Also: bare antibiotic/antimicrobial Title/Abstract in priority journals
-- (Lancet family, JAMA, NEJM, Nature family, key ID/ICHE/ASHE/OFID/CMI).
-- Animal exclusion stays (animals NOT humans). AI stewardship matches main feed.
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
      OR guidance[Title/Abstract]
      OR recommendation*[Title/Abstract]
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
      OR ASP[Title/Abstract]
      OR intervention*[Title/Abstract]
      OR implementation[Title/Abstract]
      OR "quality improvement"[Title/Abstract]
    )
  )
  OR
  (
    (
      antimicrobial[Title/Abstract]
      OR antimicrobials[Title/Abstract]
      OR antibiotic[Title/Abstract]
      OR antibiotics[Title/Abstract]
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
      OR "Lancet Healthy Longev"[Journal]
      OR "Lancet Planet Health"[Journal]
      OR "Lancet Respir Med"[Journal]
      OR "Lancet Gastroenterol Hepatol"[Journal]
      OR "Lancet Oncol"[Journal]
      OR "Lancet Neurol"[Journal]
      OR "Lancet Psychiatry"[Journal]
      OR "Lancet Child Adolesc Health"[Journal]
      OR "Lancet Haematol"[Journal]
      OR "Lancet HIV"[Journal]
      OR "Lancet Rheumatol"[Journal]

      OR "N Engl J Med"[Journal]
      OR "New England Journal of Medicine"[Journal]

      OR "JAMA"[Journal]

      OR "Nature"[Journal]
      OR "Nat Med"[Journal]
      OR "Nat Microbiol"[Journal]
      OR "Nat Commun"[Journal]
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
