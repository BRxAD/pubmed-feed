import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { journalsForQuery } from "./journalSearch";

const JOURNALS = [
  "Antimicrobial Stewardship & Healthcare Epidemiology",
  "Antimicrobial stewardship & healthcare epidemiology : ASHE",
  "Clinical Infectious Diseases",
  "Clinical infectious diseases : an official publication of the Infectious Diseases Society of America",
  "Infection control and hospital epidemiology",
  "Infection Control and Hospital Epidemiology",
  "Open forum infectious diseases",
  "Open Forum Infectious Diseases",
  "The Lancet. Infectious diseases",
  "The Lancet. Microbe",
  "Lancet (London, England)",
  "Antibiotics (Basel, Switzerland)",
];

describe("journal search", () => {
  it("matches the full ASHE name to both stored forms", () => {
    const hit = journalsForQuery(
      JOURNALS,
      "Antimicrobial Stewardship & Healthcare Epidemiology"
    );
    assert.deepEqual(hit?.slice().sort(), [
      "Antimicrobial Stewardship & Healthcare Epidemiology",
      "Antimicrobial stewardship & healthcare epidemiology : ASHE",
    ]);
  });

  it("matches the ASHE abbreviation on its own", () => {
    const hit = journalsForQuery(JOURNALS, "ashe");
    assert.equal(hit?.length, 2);
  });

  it("matches Clinical Infectious Diseases across the PubMed subtitle", () => {
    const hit = journalsForQuery(JOURNALS, "Clinical Infectious Diseases");
    assert.equal(hit?.length, 2);
    assert.ok(hit?.includes("Clinical Infectious Diseases"));
  });

  it("treats an ampersand and the word and as the same journal", () => {
    const hit = journalsForQuery(
      JOURNALS,
      "Infection Control & Hospital Epidemiology"
    );
    assert.equal(hit?.length, 2);
  });

  it("keeps The Lancet separate from Lancet Infectious Diseases", () => {
    const lancet = journalsForQuery(JOURNALS, "The Lancet");
    assert.deepEqual(lancet, ["Lancet (London, England)"]);

    const series = journalsForQuery(JOURNALS, "Lancet Infectious Diseases");
    assert.deepEqual(series, ["The Lancet. Infectious diseases"]);
  });

  it("does not take over a one-word search that is also a journal", () => {
    assert.equal(journalsForQuery(JOURNALS, "Antibiotics"), null);
    assert.equal(journalsForQuery(JOURNALS, "Lancet"), null);
  });

  it("does not treat a topic phrase as a journal", () => {
    assert.equal(
      journalsForQuery(JOURNALS, "empirical tuberculosis treatment"),
      null
    );
  });
});
