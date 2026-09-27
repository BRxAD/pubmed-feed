import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cleanAuthorList, fitAuthorsOneLine } from "./citation";

function measure(s: string): number {
  return s.length;
}

const PACCARB = [
  "Leila S Hojat",
  "Muhammad Dhanani",
  "Amy Y. Kang",
  "Salome O. Chitavi",
  "Robert A. Weinstein",
  "Edward A. Stenehjem",
];

describe("cleanAuthorList", () => {
  it("expands a single citation blob and drops et al.", () => {
    assert.deepEqual(
      cleanAuthorList("Leila S Hojat, Muhammad Dhanani, Amy Y. Kang, et al."),
      ["Leila S Hojat", "Muhammad Dhanani", "Amy Y. Kang"]
    );
  });

  it("keeps Last, First as one name when that is the only entry", () => {
    assert.deepEqual(cleanAuthorList(["Hojat, Leila S"]), ["Hojat, Leila S"]);
  });
});

describe("fitAuthorsOneLine", () => {
  it("returns null when there are no names", () => {
    assert.equal(fitAuthorsOneLine([], 40, measure), null);
  });

  it("includes every author when they fit on one row", () => {
    assert.equal(
      fitAuthorsOneLine(["Langford BJ", "Morris AM", "Daneman N"], 80, measure),
      "Langford BJ, Morris AM, Daneman N"
    );
  });

  it("stops at the first row and uses et al. for the rest", () => {
    const names = ["Ada", "Bea", "Cyd", "Dee"];
    assert.equal(
      fitAuthorsOneLine(names, "Ada, Bea, et al.".length, measure),
      "Ada, Bea, et al."
    );
  });

  it("does not wrap: never returns a string that exceeds the width", () => {
    const names = ["Langford BJ", "Morris AM", "Daneman N", "Patel S"];
    const line = fitAuthorsOneLine(names, 28, measure);
    assert.ok(line);
    assert.ok(line.length <= 28);
    assert.match(line, /et al\.$|Langford BJ$/);
  });

  it("packs several PACCARB authors instead of first + et al. on a wide row", () => {
    const leftover = 110;
    const line = fitAuthorsOneLine(PACCARB, leftover, measure);
    assert.ok(line);
    assert.ok(line.length <= leftover);
    assert.match(line, /Leila S Hojat, Muhammad Dhanani/);
    assert.notEqual(line, "Leila S Hojat, et al.");
  });
});
