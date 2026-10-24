import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { headlineScopeIssues } from "./headlineScope";

const BAD =
  "High antibiotic use in COVID-19 patients showed no mortality benefit despite co-infections.";
const GOOD =
  "High antibiotic use in COVID-19 patients was not associated with improved outcomes.";

describe("headline scope", () => {
  it("rejects despite and a no-benefit claim on a cohort", () => {
    const issues = headlineScopeIssues(BAD, false).join(" ");
    assert.match(issues, /despite/);
    assert.match(issues, /no benefit/);
  });

  it("keeps a no-benefit claim when the study is a trial", () => {
    const issues = headlineScopeIssues(
      "Antibiotic therapy showed no mortality benefit over placebo.",
      true
    );
    assert.equal(issues.length, 0);
  });

  it("accepts a non-causal headline about the patients who were studied", () => {
    assert.deepEqual(headlineScopeIssues(GOOD, false), []);
  });
});
