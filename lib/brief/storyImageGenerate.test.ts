import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildStoryImagePrompt,
  isHospitalPlaceImage,
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
  it("does not write the headline, and shows the germ instead of a pile of bottles", () => {
    const headline =
      "Adjuvant atorvastatin significantly boosted H. pylori eradication rates with triple therapy.";
    const prompt = buildStoryImagePrompt(
      candidate({
        headline,
        title: "Atorvastatin as an adjunct to triple therapy for Helicobacter pylori",
        keywords: ["Helicobacter pylori", "atorvastatin"],
      })
    );
    assert.equal(prompt.includes(headline), false);
    assert.equal(prompt.toLowerCase().includes("newspaper"), false);
    assert.match(prompt, /curved spiral bacteria/);
    assert.equal(/unlabeled medicine bottles/i.test(prompt), false);
    assert.match(prompt, /no text of any kind/i);
    assert.match(prompt, /no beige text band/i);
  });

  it("shows one bottle of white oval tablets when the story names a statin and no germ", () => {
    const prompt = buildStoryImagePrompt(
      candidate({ headline: "Atorvastatin was tied to fewer antibiotic days." })
    );
    assert.match(prompt, /white oval tablets/);
    assert.match(prompt, /Only one bottle/);
    assert.equal(prompt.includes("Atorvastatin was tied"), false);
  });

  it("keeps a pregnancy story on the person, not a medicine bottle", () => {
    const prompt = buildStoryImagePrompt(
      candidate({ headline: "Amoxicillin in pregnancy was not tied to birth defects." })
    );
    assert.match(prompt, /pregnant woman/);
    assert.equal(/amber bottle/i.test(prompt), false);
  });

  it("shows C. difficile spores, not a hospital, for a community study", () => {
    const prompt = buildStoryImagePrompt(
      candidate({
        headline:
          "Higher antibiotic use in neighborhoods associated with more community-associated CDI cases.",
        title:
          "Association Between Neighbourhood-level Antibiotic Utilization and the Rate of Community-Associated C. difficile",
        settings: ["community"],
      })
    );
    assert.match(prompt, /spores/);
    assert.match(prompt, /Do not show a hospital/);
    assert.equal(/residential neighborhood/i.test(prompt), false);
  });

  it("uses a neighborhood when a community story names no germ", () => {
    const prompt = buildStoryImagePrompt(
      candidate({
        headline: "Antibiotic use varied across neighborhoods.",
        settings: ["community"],
      })
    );
    assert.match(prompt, /residential neighborhood/);
    assert.match(prompt, /Do not show a hospital/);
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
