import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BRIEF_INGEST_PERIOD_MS, compareBriefDisplay, type BriefOrderItem } from "./briefOrder";

const NOW = Date.parse("2026-10-15T20:00:00.000Z");

function item(
  partial: Partial<BriefOrderItem> & Pick<BriefOrderItem, "effectivePriority" | "fetchedAt">
): BriefOrderItem {
  return {
    relevancePercent: 0,
    createdAt: partial.fetchedAt ?? NOW.toString(),
    date: "2026-10-01",
    ...partial,
  };
}

describe("brief order", () => {
  it("leads with the highest priority story ingested in the last 24 hours", () => {
    const olderSix = item({
      effectivePriority: 6,
      relevancePercent: 90,
      fetchedAt: new Date(NOW - BRIEF_INGEST_PERIOD_MS - 60_000).toISOString(),
    });
    const recentFive = item({
      effectivePriority: 5,
      relevancePercent: 10,
      fetchedAt: new Date(NOW - 2 * 60 * 60 * 1000).toISOString(),
    });
    const recentSix = item({
      effectivePriority: 6,
      relevancePercent: 40,
      fetchedAt: new Date(NOW - 60 * 60 * 1000).toISOString(),
    });
    const recentSixMoreRelevant = item({
      effectivePriority: 6,
      relevancePercent: 70,
      fetchedAt: new Date(NOW - 3 * 60 * 60 * 1000).toISOString(),
    });
    const ordered = [olderSix, recentFive, recentSix, recentSixMoreRelevant].sort((a, b) =>
      compareBriefDisplay(a, b, NOW)
    );
    assert.equal(ordered[0], recentSixMoreRelevant);
    assert.equal(ordered[1], recentSix);
    assert.equal(ordered[2], recentFive);
    assert.equal(ordered[3], olderSix);
  });
});
