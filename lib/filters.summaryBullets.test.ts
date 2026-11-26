import assert from "node:assert/strict";
import test from "node:test";
import { parseSummaryBullets } from "./filters.ts";

test("section text on the line after the label still counts", () => {
  const bullets = parseSummaryBullets(
    [
      "[METHODS]",
      "This global survey collected data from 296 infectious diseases specialists.",
      "[RESULTS]",
      "Eighty-six percent of respondents reported prescribing SAT.",
      "[BOTTOM LINE]",
      "In this global survey of 296 infectious diseases specialists, suppressive antibiotic therapy is commonly prescribed with wide variation in how it is managed.",
    ].join("\n")
  );

  assert.equal(
    bullets?.methods,
    "This global survey collected data from 296 infectious diseases specialists."
  );
  assert.equal(
    bullets?.results,
    "Eighty-six percent of respondents reported prescribing SAT."
  );
  assert.match(bullets?.bottomLine ?? "", /global survey of 296/);
});

test("same-line section labels stay intact", () => {
  const bullets = parseSummaryBullets(
    "[METHODS] A cohort of 40 patients.\n[RESULTS] Cure in 30.\n[BOTTOM LINE] In this cohort of 40 patients, most were cured."
  );
  assert.equal(bullets?.methods, "A cohort of 40 patients.");
  assert.equal(bullets?.bottomLine, "In this cohort of 40 patients, most were cured.");
});
