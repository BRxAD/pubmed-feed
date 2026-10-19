import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  hasDisallowedCausalLanguage,
  hasInterventionCausalVerb,
} from "./causality";

const ECOLOGICAL = "An ecological study of neighborhood antibiotic utilization.";

describe("intervention causal verbs", () => {
  it("allows reduced or increased when they only modify a noun", () => {
    assert.equal(
      hasInterventionCausalVerb(
        "Reduced doses matched standard therapy for cure rates."
      ),
      false
    );
    assert.equal(
      hasInterventionCausalVerb(
        "Higher antibiotic use was associated with increased C. difficile rates."
      ),
      false
    );
    assert.equal(
      hasInterventionCausalVerb(
        "Patients on an increased dosing schedule had similar cure rates."
      ),
      false
    );
  });

  it("flags reduced or increased when they are verbs", () => {
    assert.equal(
      hasInterventionCausalVerb(
        "Antibiotic utilization increased community C. difficile rates."
      ),
      true
    );
    assert.equal(
      hasInterventionCausalVerb("CA-CDI rates were reduced in the trial."),
      true
    );
    assert.equal(
      hasInterventionCausalVerb("High-risk antibiotics reduced CDI rates."),
      true
    );
    assert.equal(
      hasInterventionCausalVerb("CDI rates significantly increased."),
      true
    );
    assert.equal(
      hasInterventionCausalVerb("Broad-spectrum use was reduced by 13%."),
      true
    );
  });

  it("still blocks causal claims on non-RCTs and allows them on RCTs", () => {
    assert.equal(
      hasDisallowedCausalLanguage(
        "Neighborhood antibiotic use was associated with increased C. difficile rates.",
        ECOLOGICAL
      ),
      false
    );
    assert.equal(
      hasDisallowedCausalLanguage(
        "Antibiotic use increased community C. difficile rates.",
        ECOLOGICAL
      ),
      true
    );
    assert.equal(
      hasDisallowedCausalLanguage(
        "Higher use led to more community C. difficile.",
        ECOLOGICAL
      ),
      true
    );
    assert.equal(
      hasDisallowedCausalLanguage(
        "The stewardship bundle reduced broad-spectrum use.",
        "A randomized placebo-controlled trial."
      ),
      false
    );
  });
});
