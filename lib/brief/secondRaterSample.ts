/**
 * Fixed queue for a second rater. Mostly papers the first rater scored 4 or 5
 * (the include / exclude line). A smaller slice is drawn from the other scores
 * so agreement on obvious papers can be checked too.
 */

export const SECOND_RATER_QUEUE_SIZE = 1000;
export const SECOND_RATER_BOUNDARY_TARGET = 800;

export type SecondRaterCandidate = {
  pmid: string;
  adminPriority: number;
  mlPriority: number | null;
};

export type SecondRaterPick = {
  pmid: string;
  position: number;
  band: "boundary" | "check";
  mlPriority: number | null;
  adminPriority: number;
};

function shuffle<T>(items: T[], rng: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function pickSecondRaterQueue(
  rows: SecondRaterCandidate[],
  rng: () => number = Math.random
): SecondRaterPick[] {
  const byPmid = new Map<string, SecondRaterCandidate>();
  for (const row of rows) {
    const pmid = row.pmid.trim();
    if (!pmid || !Number.isInteger(row.adminPriority)) continue;
    if (row.adminPriority < 1 || row.adminPriority > 10) continue;
    if (!byPmid.has(pmid)) byPmid.set(pmid, { ...row, pmid });
  }

  const all = [...byPmid.values()];
  const fives = shuffle(
    all.filter((row) => row.adminPriority === 5),
    rng
  );
  const fours = shuffle(
    all.filter((row) => row.adminPriority === 4),
    rng
  );
  const other = shuffle(
    all.filter((row) => row.adminPriority !== 4 && row.adminPriority !== 5),
    rng
  );

  const chosen: { row: SecondRaterCandidate; band: "boundary" | "check" }[] =
    [];
  const used = new Set<string>();

  const take = (
    list: SecondRaterCandidate[],
    limit: number,
    band: "boundary" | "check"
  ) => {
    for (const row of list) {
      if (chosen.length >= limit) return;
      if (used.has(row.pmid)) continue;
      used.add(row.pmid);
      chosen.push({ row, band });
    }
  };

  take(fives, SECOND_RATER_BOUNDARY_TARGET, "boundary");
  take(fours, SECOND_RATER_BOUNDARY_TARGET, "boundary");
  take(other, SECOND_RATER_QUEUE_SIZE, "check");
  take(fours, SECOND_RATER_QUEUE_SIZE, "boundary");
  take(fives, SECOND_RATER_QUEUE_SIZE, "boundary");

  return shuffle(chosen, rng)
    .slice(0, SECOND_RATER_QUEUE_SIZE)
    .map((item, index) => ({
      pmid: item.row.pmid,
      position: index + 1,
      band: item.band,
      mlPriority: item.row.mlPriority,
      adminPriority: item.row.adminPriority,
    }));
}

/** Deterministic generator so the queue does not change between builds. */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
