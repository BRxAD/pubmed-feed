import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canonicalEmailInbox,
  easternCalendarDate,
  extractEmailAddresses,
  normalizeEmailAddress,
  uniqueRecipientsByInbox,
} from "./emailAddress";

describe("normalizeEmailAddress", () => {
  it("lowercases and trims", () => {
    assert.equal(normalizeEmailAddress("  AMKang@Gmail.COM "), "amkang@gmail.com");
  });

  it("pulls the address out of Name <email>", () => {
    assert.equal(
      normalizeEmailAddress("A Kang <amkang@emory.edu>"),
      "amkang@emory.edu"
    );
  });

  it("rejects junk", () => {
    assert.equal(normalizeEmailAddress("not-an-email"), null);
    assert.equal(normalizeEmailAddress(""), null);
  });
});

describe("canonicalEmailInbox", () => {
  it("treats Gmail dots, plus-tags, and googlemail as one inbox", () => {
    assert.equal(canonicalEmailInbox("amkang@gmail.com"), "amkang@gmail.com");
    assert.equal(canonicalEmailInbox("a.mkang@gmail.com"), "amkang@gmail.com");
    assert.equal(
      canonicalEmailInbox("amkang+brief@gmail.com"),
      "amkang@gmail.com"
    );
    assert.equal(
      canonicalEmailInbox("A.M.Kang+x@googlemail.com"),
      "amkang@gmail.com"
    );
  });

  it("does not strip dots on non-Gmail domains", () => {
    assert.equal(
      canonicalEmailInbox("a.mkang@emory.edu"),
      "a.mkang@emory.edu"
    );
  });
});

describe("uniqueRecipientsByInbox", () => {
  it("keeps one send address per Gmail inbox, first wins", () => {
    const unique = uniqueRecipientsByInbox([
      "amkang@gmail.com",
      "a.mkang@gmail.com",
      "amkang+alerts@gmail.com",
      "other@emory.edu",
    ]);
    assert.deepEqual(
      unique.map((r) => r.sendTo),
      ["amkang@gmail.com", "other@emory.edu"]
    );
  });

  it("dedupes an admin Name <email> against the same bare address", () => {
    const unique = uniqueRecipientsByInbox([
      "amkang@emory.edu",
      "A Kang <amkang@emory.edu>",
    ]);
    assert.equal(unique.length, 1);
    assert.equal(unique[0]?.sendTo, "amkang@emory.edu");
  });
});

describe("extractEmailAddresses", () => {
  it("parses mixed lists without splitting on spaces inside a name", () => {
    assert.deepEqual(
      extractEmailAddresses("A Kang <amkang@emory.edu>, other@emory.edu"),
      ["amkang@emory.edu", "other@emory.edu"]
    );
  });
});

describe("easternCalendarDate", () => {
  it("returns YYYY-MM-DD", () => {
    assert.match(easternCalendarDate(), /^\d{4}-\d{2}-\d{2}$/);
  });
});
