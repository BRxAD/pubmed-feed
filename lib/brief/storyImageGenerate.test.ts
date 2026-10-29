import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  allowsNeonatalImage,
  buildStoryImagePrompt,
  isHospitalPlaceImage,
  isNeonatalSubjectImage,
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
