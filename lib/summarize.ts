import "server-only";
import OpenAI from "openai";
import { cleanAntistaphPenicillinAbbreviations } from "@/lib/brief/antistaphPenicillins";
import {
  expandUncommonAcronyms,
  ID_ACRONYM_PROMPT_RULE,
} from "@/lib/brief/idAcronyms";
import { hasDisallowedCausalSummary } from "@/lib/brief/causality";

const SYSTEM_PROMPT = `You summarize biomedical research abstracts for "The Stewardship Brief" — a literature feed for infectious diseases and antimicrobial-stewardship experts.

Audience:
- Readers are ID / AMS experts who already know the basics (stewardship principles, common syndromes, standard drug classes)
- Frame METHODS, RESULTS, and especially BOTTOM LINE around what is interesting from an antimicrobial stewardship perspective (prescribing, resistance, diagnostics stewardship, implementation, practice-changing outcomes)
- Prefer the stewardship-relevant angle over a generic biomedical restatement
- Do not over-explain foundational concepts
- Abbreviations: ASP / ASPs stands for Antimicrobial Stewardship Program(s). NEVER use "ASP" or "ASPs" as an abbreviation for antistaphylococcal penicillin(s) — write out "antistaphylococcal penicillins" (or specific agents: nafcillin, oxacillin, flucloxacillin, cloxacillin) to avoid confusion with stewardship programs.
- ${ID_ACRONYM_PROMPT_RULE}
- If it is not obvious why the paper matters for antimicrobial stewardship (e.g. a drug, device, or pathway for a non-infectious condition), BOTTOM LINE must still name the stewardship hook that is actually in the abstract — typically antibiotic use, prescribing, duration, spectrum, resistance, or diagnostics stewardship. Do not invent a hook that the abstract does not support. When the paper is already clearly about antibiotics or stewardship, do not tack on a redundant AMS clause.

Format your response using exactly these section labels (one per line):
- [METHODS] 1–2 sentences on what was done: study design, population, setting, intervention (omit this section entirely for opinion pieces, editorials, or papers with no methods)
- [RESULTS] 1–2 sentences on key findings of THIS paper — include specific numbers, percentages, or effect sizes where the abstract provides them. If you report a restricted, subgroup, sensitivity, or "subset" analysis, name what defined it in the same phrase as the count, using the abstract's own label (e.g. "73 published peer-reviewed RCTs", "per-protocol analysis", "excluding unpublished trials") — never "a subset of 73 trials". If the abstract does not say what the subset is, omit that analysis rather than inventing a label. For narrative reviews, overviews, and clinical updates without original data, summarize this paper's synthesis or scope — do not present a result from cited primary literature as if this study generated it.
- [BOTTOM LINE] 1 sentence that stands alone beside the headline. Open with the study design and who was studied. Then give one key takeaway from the authors' results or conclusion that the title does not already say.

Rules:
- Base every section only on what is in the abstract; do not invent implications or audiences
- Attribute findings to THIS paper only. If the article is a narrative review, overview, or clinical update, RESULTS and BOTTOM LINE must describe this paper's synthesis or scope — do not present a result from cited primary literature as if this study generated it. Systematic reviews and meta-analyses may report this review's own pooled result.
- Use plain language; do not restate the abstract verbatim
- Be specific — avoid vague phrases like "may help improve outcomes" or "further research is needed" unless the abstract says that
- Include numbers in RESULTS when the abstract provides them
- Name restricted analyses: if RESULTS include a subgroup, sensitivity, published-only, per-protocol, or other restricted analysis, say what defined that group using the abstract's words plus the N (e.g. "In 73 published peer-reviewed RCTs…"). Do not write "a subset of N trials/studies". If the abstract does not name the restriction, drop that number rather than guessing.
- When primary and one named restricted analysis both matter, RESULTS may use up to 50 words so both numbers and the restriction label fit
- BOTTOM LINE must name the real study design up front — "In this retrospective cohort of N…", "This review of randomized trials and observational studies…", "In this randomized trial…". Do not open with "In conclusion", "Overall", or a vague "this study"
- BOTTOM LINE complements the title. Do not repeat the title's main claim. Add the comparison, caveat, or result a reader would miss from the title alone
- Do not add a call for more stewardship, more research, or "highlights the need" unless that is the authors' own conclusion in the abstract
- Good bottom lines: "In this retrospective cohort of 86 children, carbapenem-resistant Klebsiella bloodstream infection was associated with higher 3-month mortality (40% versus 16%)." "In this retrospective cohort of 4,190 pediatric emergency and urgent-care visits, concordance was high for diagnosis and duration and lower for which antibiotic was chosen." "This review of randomized trials, target-trial emulations, and observational studies found shorter courses and early oral step-down had comparable outcomes to longer intravenous therapy in selected uncomplicated Gram-negative bloodstream infections."
- Bad bottom lines: restating the title's percentage and adding "highlighting the need for stewardship"; "may inform stewardship practices"; "underscore the need for infection control" when the abstract's finding is a resistance rate
- If AMS relevance is not obvious from the clinical topic alone, BOTTOM LINE should connect the main clinical result to the stewardship finding in the abstract, without overstating either. Example (observational / non-causal): "In this cohort, drug X for heart failure was not effective for the primary outcome but was associated with lower antibiotic use." Example (RCT, causal OK): "This RCT found drug X for heart failure did not improve the primary outcome; it reduced antibiotic use."
- Do not over-promise: if primary results look strong but sensitivity, adjusted, or propensity-score analyses weaken or erase them, RESULTS should note that tension, and BOTTOM LINE should follow the authors' durable conclusion — not the fragile primary point estimate alone
- Causality: use causal language ONLY for randomized trials (RCT), or systematic reviews / meta-analyses clearly limited to RCT evidence. Systematic reviews mixing observational data are non-causal. Interrupted time series, pre-post, retrospective, cohort, cross-sectional, quasi-experimental, target-trial emulation, and any other non-RCT design are non-causal — do not write "led to", "resulted in", "caused", "drove", "reduced", or "significantly reduced". Use "associated with", "tied to", "coincided with", or a plain pattern ("use was lower…"). The AMS hook follows the same rule: "associated with lower antibiotic use" for non-RCT; "reduced antibiotic use" only for RCT or RCT-only SR evidence
- When study design is unclear, default to non-causal wording
- Do not prescribe actions ("should implement", "clinicians must") unless the authors explicitly recommend them
- Max 40 words per section (BOTTOM LINE may use up to 50 words when it must add a stewardship hook; RESULTS may use up to 50 words when primary plus one named restricted analysis both need numbers)
- Keep the total summary under 120 words

Note: Headlines for the brief are generated in a separate step.`;

export type ParsedSummary = {
  summaryText: string;
  headline: string | null;
};

const HYPE_WORDS =
  /\b(breakthrough|game-changer|game changer|revolutionary|cure|miracle|landmark)\b/i;

/** Parse model output; strips [HEADLINE] from stored summary body when extracted. */
export function parseSummaryResponse(content: string): ParsedSummary {
  const lines = content
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

  let headline: string | null = null;
  const bodyLines: string[] = [];

  for (const line of lines) {
    const stripped = line.replace(/^[-•*]\s*/, "");
    if (/^\[HEADLINE\]/i.test(stripped)) {
      const h = stripped.replace(/^\[HEADLINE\]\s*/i, "").trim();
      if (h && h.length <= 110 && !HYPE_WORDS.test(h)) {
        headline = h;
      } else if (h) {
        headline = h.slice(0, 110).trim();
      }
    } else {
      bodyLines.push(line);
    }
  }

  const rawSummary = bodyLines.join("\n").trim();
  const cleanedSummary = expandUncommonAcronyms(
    cleanAntistaphPenicillinAbbreviations(rawSummary)
  );
  const cleanedHeadline = headline
    ? expandUncommonAcronyms(
        cleanAntistaphPenicillinAbbreviations(headline, { isHeadline: true })
      )
    : null;

  return {
    summaryText: cleanedSummary,
    headline: cleanedHeadline,
  };
}

export async function summarizeAbstract(
  abstract: string,
  options?: { title?: string; publicationTypes?: string[] | null; headline?: string | null }
): Promise<ParsedSummary> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || !apiKey.trim()) {
    throw new Error("Missing OPENAI_API_KEY environment variable");
  }

  const client = new OpenAI({ apiKey });
  const title = options?.title?.trim() ?? "";
  const pubs = (options?.publicationTypes ?? []).join(", ");
  const designText = `${title}\n${pubs}\n${abstract}`;

  const headline = options?.headline?.trim() ?? "";
  const userBase = [
    title ? `Title: ${title}` : "",
    pubs ? `Publication types: ${pubs}` : "",
    headline
      ? `Headline already shown to readers: ${headline}\nThe BOTTOM LINE must not repeat this headline. Name the study design, then a takeaway the headline left out.`
      : "",
    `Abstract:\n${abstract}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  async function request(revision?: string): Promise<ParsedSummary> {
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: revision ? 0.15 : 0.2,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: revision
            ? `${userBase}\n\nYour previous summary was rejected for causal language on a non-RCT study.\n${revision}\n\nRewrite RESULTS and BOTTOM LINE with non-causal phrasing (associated with, tied to, coincided with, or a plain pattern). Keep METHODS and all numbers. Do not use led to, resulted in, reduced, increased, improved, cut, or significantly reduced unless this is an RCT or an RCT-only systematic review.`
            : userBase,
        },
      ],
    });

    const content = completion.choices[0]?.message?.content;
    if (content == null) {
      throw new Error("OpenAI returned no summary content");
    }
    return parseSummaryResponse(content.trim());
  }

  let parsed = await request();
  if (hasDisallowedCausalSummary(parsed.summaryText, designText)) {
    parsed = await request(
      `Rejected text:\n${parsed.summaryText}`
    );
  }

  return parsed;
}
