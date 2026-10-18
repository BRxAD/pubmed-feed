import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  citationsPerMonth,
  monthsSincePublication,
  parseCitedByCount,
} from "./citationRate";

const NOW = Date.parse("2026-10-18T12:00:00Z");

describe("parseCitedByCount", () => {
  it("keeps zero and drops junk", () => {
    assert.equal(parseCitedByCount(0), 0);
    assert.equal(parseCitedByCount("12"), 12);
    assert.equal(parseCitedByCount(null), null);
    assert.equal(parseCitedByCount(-1), null);
  });
});

describe("citationsPerMonth", () => {
  it("treats a paper under one month as one month old", () => {
    assert.equal(monthsSincePublication("2026-10-03", NOW), 1);
    assert.equal(citationsPerMonth(4, "2026-10-03", NOW), 4);
  });

  it("divides by months for an older paper", () => {
    const rate = citationsPerMonth(12, "2025-10-18", NOW);
    assert.ok(rate != null);
    assert.ok(Math.abs(rate - 1) < 0.02);
  });

  it("does not rank a missing or future date", () => {
    assert.equal(citationsPerMonth(5, null, NOW), null);
    assert.equal(citationsPerMonth(5, "2026-12-01", NOW), null);
  });
});
