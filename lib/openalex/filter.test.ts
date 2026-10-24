import assert from "node:assert/strict";
import test from "node:test";
import { passesClinicalInclusionFilter } from "./filter";
import type { PubMedRecord } from "@/lib/pubmed/efetch";

function record(partial: Partial<PubMedRecord>): PubMedRecord {
  return {
    pmid: "1",
    title: partial.title ?? "",
    abstract: partial.abstract ?? "",
    journal: partial.journal ?? "",
    pubDate: null,
    publicationTypes: partial.publicationTypes ?? ["Journal Article"],
    meshTerms: [],
    keywords: [],
    authors: [],
  };
}

test("Lancet Primary Care keeps antibiotic trials and drops other primary care", () => {
  assert.equal(
    passesClinicalInclusionFilter(
      record({
        journal: "The Lancet Primary Care",
        title:
          "Point-of-care testing strategy versus usual care to safely reduce antibiotic prescribing",
      }),
      true
    ),
    true
  );
  assert.equal(
    passesClinicalInclusionFilter(
      record({
        journal: "The Lancet Primary Care",
        title: "SMS text message reminders versus usual care for cervical screening",
      }),
      true
    ),
    false
  );
});
