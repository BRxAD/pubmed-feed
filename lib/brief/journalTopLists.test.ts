import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  pickJournalTopLists,
  type JournalTopArticle,
  type JournalTopSummary,
} from "./journalTopLists";

const NOW = Date.parse("2026-11-13T12:00:00Z");

function article(
  pmid: string,
  date: string,
  citations: number | null,
  setting = "hospital"
): { article: JournalTopArticle; summary: JournalTopSummary } {
  return {
    article: {
      pmid,
      title: `Paper ${pmid}`,
      journal: "Antimicrobial Stewardship & Healthcare Epidemiology",
      pubDate: date,
      releaseDate: date,
      citedByCount: citations,
      source: "pubmed",
      doi: null,
      openalexId: null,
      landingUrl: null,
      jif: 3,
      sjr: null,
    },
    summary: {
      pmid,
      headline: `Headline ${pmid}`,
      adminPriority: null,
      mlPriority: 6,
      rankScore: 100,
      adminSetting: null,
      autoSettings: [setting],
      autoTopics: null,
      autoWhoRegions: null,
    },
  };
}

describe("journal top lists", () => {
  it("keeps the priority floor and ranks a human score above an equal machine score", () => {
    const high = article("2", "2026-10-01", 1);
    high.summary.mlPriority = 8;
    const human = article("1", "2026-09-01", 1);
    human.summary.adminPriority = 7;
    human.summary.mlPriority = 4;
    const machine = article("3", "2026-08-01", 1);
    machine.summary.mlPriority = 7;
    const low = article("4", "2026-07-01", 2);
    low.summary.mlPriority = 5;

    const lists = pickJournalTopLists({
      articles: [machine.article, high.article, human.article, low.article],
      summaries: [machine.summary, high.summary, human.summary, low.summary],
      nowMs: NOW,
      windowDays: 365,
      minPriority: 6,
    });

    assert.deepEqual(
      lists.priority.map((item) => item.pmid),
      ["2", "1", "3"]
    );
  });

  it("drops papers older than the year window from both lists", () => {
    const recent = article("9", "2026-06-01", 3);
    const old = article("8", "2024-01-01", 50);
    old.summary.mlPriority = 9;

    const lists = pickJournalTopLists({
      articles: [recent.article, old.article],
      summaries: [recent.summary, old.summary],
      nowMs: NOW,
      windowDays: 365,
      minPriority: 6,
    });

    assert.deepEqual(
      lists.priority.map((item) => item.pmid),
      ["9"]
    );
    assert.deepEqual(
      lists.cited.map((item) => item.pmid),
      ["9"]
    );
  });

  it("ranks citations per month, and can cite a paper below the priority floor", () => {
    const steady = article("4", "2026-01-13", 10);
    steady.summary.mlPriority = 5;
    const fresh = article("5", "2026-10-20", 4);
    fresh.summary.mlPriority = 7;

    const lists = pickJournalTopLists({
      articles: [steady.article, fresh.article],
      summaries: [steady.summary, fresh.summary],
      nowMs: NOW,
      windowDays: 365,
      minPriority: 6,
    });

    assert.deepEqual(
      lists.cited.map((item) => item.pmid),
      ["5", "4"]
    );
    assert.deepEqual(
      lists.priority.map((item) => item.pmid),
      ["5"]
    );
  });

  it("honors a setting filter", () => {
    const hospital = article("6", "2026-07-01", 2, "hospital");
    const community = article("7", "2026-07-02", 9, "community");
    community.summary.mlPriority = 9;

    const lists = pickJournalTopLists({
      articles: [hospital.article, community.article],
      summaries: [hospital.summary, community.summary],
      nowMs: NOW,
      windowDays: 365,
      minPriority: 6,
      setting: "hospital",
    });

    assert.deepEqual(
      lists.priority.map((item) => item.pmid),
      ["6"]
    );
    assert.deepEqual(
      lists.cited.map((item) => item.pmid),
      ["6"]
    );
  });
});
