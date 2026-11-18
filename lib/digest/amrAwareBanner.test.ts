import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isCanadianEmailAddress,
  shouldShowAmrAwareBanner,
} from "./amrAwareBanner";
import { buildBriefDigestEmail } from "./briefEmailFormat";

describe("AMR Aware banner", () => {
  it("treats a .ca domain as Canadian", () => {
    assert.equal(isCanadianEmailAddress("nurse@hospital.on.ca"), true);
    assert.equal(isCanadianEmailAddress("Name <editor@amr.ca>"), true);
    assert.equal(isCanadianEmailAddress("reader@gmail.com"), false);
    assert.equal(isCanadianEmailAddress("reader@example.ca.com"), false);
    assert.equal(isCanadianEmailAddress("ca.reader@gmail.com"), false);
  });

  it("is on only for Eastern dates November 18 through 24, 2026", () => {
    const ca = "nurse@hospital.on.ca";
    assert.equal(
      shouldShowAmrAwareBanner(ca, new Date("2026-11-18T04:59:00Z")),
      false
    );
    assert.equal(
      shouldShowAmrAwareBanner(ca, new Date("2026-11-18T05:00:00Z")),
      true
    );
    assert.equal(
      shouldShowAmrAwareBanner(ca, new Date("2026-11-25T04:59:00Z")),
      true
    );
    assert.equal(
      shouldShowAmrAwareBanner(ca, new Date("2026-11-25T05:00:00Z")),
      false
    );
    assert.equal(
      shouldShowAmrAwareBanner("reader@gmail.com", new Date("2026-11-20T15:00:00Z")),
      false
    );
  });

  it("places the linked graphic under the announcement for a .ca address", () => {
    const built = buildBriefDigestEmail({
      items: [],
      briefUrl: "https://www.stewardshipbrief.com",
      dateLabel: "Wednesday, November 18, 2026",
      announcement: {
        title: "World AMR Awareness Week",
        body: "Join the campaign.",
        active: true,
      },
      recipientEmail: "nurse@hospital.on.ca",
      now: new Date("2026-11-18T15:00:00Z"),
    });

    const announcementAt = built.html.indexOf("Announcement");
    const imageAt = built.html.indexOf(
      "https://www.stewardshipbrief.com/amr-aware-canada.jpg"
    );
    const linkAt = built.html.indexOf('href="https://www.amraware.ca"');
    assert.ok(announcementAt >= 0);
    assert.ok(imageAt > announcementAt);
    assert.ok(linkAt > announcementAt && linkAt < imageAt);
    assert.match(built.text, /AMR Aware Canada: https:\/\/www\.amraware\.ca/);
  });

  it("omits the graphic outside the week and for other addresses", () => {
    const outside = buildBriefDigestEmail({
      items: [],
      briefUrl: "https://www.stewardshipbrief.com",
      dateLabel: "Tuesday, November 17, 2026",
      recipientEmail: "nurse@hospital.on.ca",
      now: new Date("2026-11-17T15:00:00Z"),
    });
    const other = buildBriefDigestEmail({
      items: [],
      briefUrl: "https://www.stewardshipbrief.com",
      dateLabel: "Wednesday, November 18, 2026",
      recipientEmail: "reader@gmail.com",
      now: new Date("2026-11-18T15:00:00Z"),
    });
    assert.equal(outside.html.includes("amr-aware-canada.jpg"), false);
    assert.equal(other.html.includes("amraware.ca"), false);
  });
});
