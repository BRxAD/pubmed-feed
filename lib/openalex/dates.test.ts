import assert from "node:assert/strict";
import test from "node:test";
import { resolvePublicationDates, toDateOnly } from "./dates";

test("PubMed month names become the journal date, not today", () => {
  assert.equal(toDateOnly("2026 Jul 1"), "2026-07-01");
  assert.equal(toDateOnly("2026 6 25"), "2026-06-25");
  assert.equal(toDateOnly("2025 1 16"), "2025-01-16");
  assert.equal(toDateOnly("2025 Jan 16"), "2025-01-16");
  assert.equal(toDateOnly("2025 Nov"), "2025-11-01");
  assert.equal(toDateOnly("2026 Jul-Aug"), "2026-07-01");
  assert.equal(toDateOnly("2026-02-01"), "2026-02-01");
  assert.equal(toDateOnly("2026"), "2026-01-01");
  assert.equal(toDateOnly("not a date"), null);
});

test("release date prefers the publication date over the indexing date", () => {
  const dates = resolvePublicationDates({
    pubDate: "2026 Jul 1",
    pubmedDate: "2026 Oct 23",
    today: "2026-10-23",
  });
  assert.equal(dates.pubDate, "2026-07-01");
  assert.equal(dates.releaseDate, "2026-07-01");
});

test("electronic publication date wins over the journal issue date", () => {
  const dates = resolvePublicationDates({
    pubDate: "2026 Jul 1",
    articleDate: "2026 6 25",
    today: "2026-10-23",
  });
  assert.equal(dates.articleDate, "2026-06-25");
  assert.equal(dates.pubDate, "2026-07-01");
  assert.equal(dates.releaseDate, "2026-06-25");
});

test("today is used only when PubMed gave no date", () => {
  const dates = resolvePublicationDates({ today: "2026-10-23" });
  assert.equal(dates.releaseDate, "2026-10-23");
});
