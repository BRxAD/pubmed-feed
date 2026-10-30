import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { expandStoryCorpus } from "./storyImageSynonyms";
import {
  allowsChildImage,
  allowsMedicationStillLife,
  allowsNeonatalImage,
  buildStoryImagePrompt,
  isAllergyEvaluationStory,
  isChildSubjectImage,
  isHospitalPlaceImage,
  isMedicationStillLife,
  isNeonatalSubjectImage,
  narrowSubjectMismatch,
  type StoryImagePromptInput,
} from "./storyImagePrompt";

function candidate(partial: Partial<StoryImagePromptInput>): StoryImagePromptInput {
  return {
    title: null,
    headline: null,
    abstract: null,
    keywords: [],
    meshTerms: [],
    ...partial,
  };
}

describe("buildStoryImagePrompt", () => {
  it("puts the article above the instructions and forbids drawing that text", () => {
    const headline =
      "Adjuvant atorvastatin significantly boosted H. pylori eradication rates with triple therapy.";
    const prompt = buildStoryImagePrompt(
      candidate({
        headline,
        title: "Atorvastatin as an adjunct to triple therapy for Helicobacter pylori",
        keywords: ["Helicobacter pylori", "atorvastatin"],
        abstract: "A randomized trial of adults treated for Helicobacter pylori.",
      })
    );
    const contextAt = prompt.indexOf(headline);
    const instructionsAt = prompt.indexOf("Generate a documentary-style");
    assert.ok(contextAt >= 0 && contextAt < instructionsAt);
    assert.match(prompt, /Helicobacter pylori/);
    assert.match(prompt, /Do not draw any of these words/);
    assert.match(prompt, /No text, letters, numbers/);
    assert.equal(/show only this/i.test(prompt), false);
    assert.equal(/curved spiral bacteria/i.test(prompt), false);
  });

  it("keeps a mixed-age study from being assigned a neonatal scene", () => {
    const prompt = buildStoryImagePrompt(
      candidate({
        headline: "Antibiotic duration was similar in children and adults with pneumonia.",
        abstract:
          "This cohort included pediatric and adult patients. Neonatal cases were a small subset.",
        meshTerms: ["Child", "Adult", "Infant, Newborn"],
      })
    );
    assert.match(prompt, /children and adults/);
    assert.match(prompt, /Infant, Newborn/);
    assert.match(prompt, /only when the article is about neonates and does not include adults/);
  });

  it("does not reuse a urine or kidney photo for a penicillin allergy story", () => {
    const allergy =
      "successful penicillin allergy delabeling did not ensure subsequent penicillin use in children long-term antibiotic use cohort";
    assert.equal(
      narrowSubjectMismatch(allergy, {
        id: "generated-42768754",
        label: "Long-term antibiotic use in childhood associated with higher kidney cancer risk",
        tags: ["kidney neoplasms", "urine", "antibiotic use", "childhood", "cohort"],
      }),
      true
    );
    assert.equal(allowsChildImage(allergy), true);
    assert.equal(isAllergyEvaluationStory(allergy), true);
    assert.equal(
      isChildSubjectImage({
        id: "pediatric-clinic-consult",
        label: "pediatrician talking with a child and parent",
      }),
      true
    );
    assert.equal(
      isMedicationStillLife({
        id: "local-deescalate-duration-adherence",
        label: "antibiotic duration and adherence blister pack",
      }),
      true
    );
  });

  it("keeps a side mention from choosing a specimen, organ, or pill photo", () => {
    assert.equal(
      narrowSubjectMismatch("pharmacist interventions for antibiotic duration were low", {
        id: "generated-42819753",
        label: "Delays in modifying antibiotic therapy observed for resistant urine cultures",
        tags: ["urine culture", "urinary tract infection"],
      }),
      true
    );
    assert.equal(
      narrowSubjectMismatch("antibiotic exposure and survival in cancer immunotherapy", {
        id: "local-biofilm-resistome-antibiotic",
        label: "antibiotic capsule approaching biofilm",
        tags: ["biofilm", "microbiome"],
      }),
      true
    );
    assert.equal(
      allowsMedicationStillLife("antibiotic exposure and survival in cancer immunotherapy", {
        id: "local-biofilm-resistome-antibiotic",
        label: "antibiotic capsule approaching biofilm",
      }),
      false
    );
    assert.equal(
      allowsMedicationStillLife("blood culture contamination fell after a collection change", {
        id: "local-blood-culture-laboratory",
        label: "blood culture vials in laboratory",
        tags: ["blood culture"],
      }),
      true
    );
    assert.equal(/surgery/.test(expandStoryCorpus("dental infections")), false);
    assert.equal(
      narrowSubjectMismatch("review of native joint septic arthritis microbiology", {
        id: "local-blood-culture-laboratory",
        label: "blood culture vials in laboratory",
        tags: ["blood culture", "microbiology"],
      }),
      true
    );
    assert.equal(
      narrowSubjectMismatch("blood culture contamination fell after a collection change", {
        id: "local-blood-culture-laboratory",
        label: "blood culture vials in laboratory",
        tags: ["blood culture"],
      }),
      false
    );
    assert.equal(
      narrowSubjectMismatch("cdss increased first-line antibiotic use for pediatric cap", {
        id: "local-lungs-pneumonia-lrti",
        label: "lungs and lower respiratory pathology",
        tags: ["pneumonia", "cap"],
      }),
      false
    );
    assert.equal(
      narrowSubjectMismatch("antibiotic prophylaxis reduced infection", {
        id: "surgeon-or",
        label: "operating room",
        tags: ["surgery", "prophylaxis"],
      }),
      true
    );
  });

  it("keeps a child clinic photo off an adult hospital delabeling review", () => {
    const review =
      "hospital-based penicillin allergy delabeling improved antibiotic prescribing in hospitalized patients";
    assert.equal(allowsChildImage(review), false);
    assert.equal(isAllergyEvaluationStory(review), true);
    assert.equal(
      isChildSubjectImage({
        id: "pediatric-clinic-consult",
        label: "pediatrician talking with a child and parent",
      }) && !allowsChildImage(review),
      true
    );
  });

  it("does not reuse a dental photo for a gram-negative resistance review", () => {
    const review =
      "review outlines key factors for gram-negative bacterial resistance drug resistance bacterial anti-bacterial agents";
    assert.equal(
      narrowSubjectMismatch(review, {
        id: "generated-42807492",
        label: "Dental education's role in shaping antibiotic prescribing practices remains underexplored.",
        tags: ["drug resistance bacterial", "anti-bacterial agents", "dental education", "humans"],
      }),
      true
    );
    assert.equal(
      narrowSubjectMismatch(review, {
        id: "local-mdr-gramneg-culture",
        label: "MDR culture plate and susceptibility grid",
        tags: ["gram-negative", "carbapenem", "culture"],
      }),
      false
    );
    assert.equal(
      narrowSubjectMismatch("dental antibiotic prescribing in community clinics", {
        id: "dental-care",
        label: "dental clinical care",
        tags: ["dental", "dentist"],
      }),
      false
    );
  });

  it("lets a neonatal photo through only when the paper is neonatal and not adult", () => {
    assert.equal(allowsNeonatalImage("preterm neonates in the nicu"), true);
    assert.equal(allowsNeonatalImage("neonatal and adult patients"), false);
    assert.equal(allowsNeonatalImage("pediatric and adult blood cultures"), false);
    assert.equal(allowsNeonatalImage("school-age children with otitis"), false);
    assert.equal(
      isNeonatalSubjectImage({
        id: "local-neonatal-nicu-newborn",
        label: "neonatal intensive care newborn",
      }),
      true
    );
    assert.equal(
      isNeonatalSubjectImage({
        id: "pediatric-care",
        label: "pediatric clinical care",
      }),
      false
    );
  });

  it("names the care setting as a fact about the paper", () => {
    const prompt = buildStoryImagePrompt(
      candidate({
        headline: "Nasal sprays reduced respiratory illness days in primary care.",
        settings: ["community"],
      })
    );
    assert.match(prompt, /Care setting: community/);
    assert.match(prompt, /Include a real person only if/);
  });

  it("asks for a candid news photo in the place's real colors", () => {
    const prompt = buildStoryImagePrompt(
      candidate({ headline: "Electronic prescribing systems varied in how often they caught unsafe orders." })
    );
    assert.match(prompt, /3:2 landscape/);
    assert.match(prompt, /Never oversaturated, stylized, or artificially tinted/);
    assert.match(prompt, /stock-photo cliches/);
    assert.equal(/warm cream, olive/i.test(prompt), false);
  });

  it("drops empty article fields", () => {
    const prompt = buildStoryImagePrompt(
      candidate({ headline: "A stewardship programme changed prescribing." })
    );
    assert.equal(/Title:/i.test(prompt), false);
    assert.equal(/Abstract:/i.test(prompt), false);
    assert.equal(/Keywords:/i.test(prompt), false);
    assert.equal(/MeSH:/i.test(prompt), false);
  });

  it("treats a ward photo as a hospital place and a medicine bottle as not one", () => {
    assert.equal(
      isHospitalPlaceImage({
        id: "local-hospital-ward-difficile-vre",
        label: "inpatient ward and infection-prevention station",
      }),
      true
    );
    assert.equal(
      isHospitalPlaceImage({
        id: "local-medications-antibiotics",
        label: "one amber medicine bottle",
      }),
      false
    );
  });
});
