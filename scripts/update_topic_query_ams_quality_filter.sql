-- Main AMS PubMed topic.
-- Antimicrobial Stewardship MeSH or stewardship phrases alone are enough.
-- Broader use/exposure terms still need a high-signal study/design/scope block
-- so they do not flood low-priority ID papers.
-- Animal exclusion stays (animals NOT humans). No separate AI topic filter:
-- AI stewardship papers that match this query belong in the main feed.
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
