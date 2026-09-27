import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fitAuthorsOneLine } from "./citation";

function measure(s: string): number {
  return s.length;
}

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
});
