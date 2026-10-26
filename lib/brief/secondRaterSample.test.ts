import assert from "node:assert/strict";
import test from "node:test";
import {
  mulberry32,
  pickSecondRaterQueue,
  SECOND_RATER_BOUNDARY_TARGET,
  SECOND_RATER_QUEUE_SIZE,
} from "./secondRaterSample";

function rows(
  counts: Record<number, number>
): { pmid: string; adminPriority: number; mlPriority: number | null }[] {
  const out = [];
  for (const [score, n] of Object.entries(counts)) {
    for (let i = 0; i < n; i++) {
      out.push({
        pmid: `${score}-${i}`,
        adminPriority: Number(score),
        mlPriority: 4,
      });
    }
  }
  return out;
}

test("keeps every 5 and fills the rest of the boundary from 4s", () => {
  const picked = pickSecondRaterQueue(
    rows({ 5: 452, 4: 742, 3: 400, 6: 100, 1: 50 }),
    mulberry32(7)
  );
  assert.equal(picked.length, SECOND_RATER_QUEUE_SIZE);
  const pmids = new Set(picked.map((row) => row.pmid));
  assert.equal(pmids.size, SECOND_RATER_QUEUE_SIZE);
  const fives = picked.filter((row) => row.pmid.startsWith("5-"));
  assert.equal(fives.length, 452);
  assert.ok(fives.every((row) => row.band === "boundary"));
  const boundary = picked.filter((row) => row.band === "boundary");
  assert.equal(boundary.length, SECOND_RATER_BOUNDARY_TARGET);
  assert.equal(
    picked.filter((row) => row.band === "check").length,
    SECOND_RATER_QUEUE_SIZE - SECOND_RATER_BOUNDARY_TARGET
  );
});

test("returns every already-rated paper when fewer than 1000 exist", () => {
  const picked = pickSecondRaterQueue(rows({ 5: 4, 4: 3, 2: 2 }), mulberry32(1));
  assert.equal(picked.length, 9);
  assert.deepEqual(
    picked.map((row) => row.position),
    [1, 2, 3, 4, 5, 6, 7, 8, 9]
  );
});
