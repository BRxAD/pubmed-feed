import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { classifyArticleTopics, type ArticleTopic } from "./classifyTopic";
import { topicsWithEnoughArticles } from "./brief/topicFilter";
import type { BriefItem } from "./brief/items";

function topicItem(topic: ArticleTopic): BriefItem {
  return { topics: [topic] } as BriefItem;
}

describe("topicsWithEnoughArticles", () => {
  it("keeps a topic at 5 stories and hides one at 4", () => {
    const items = [
      ...Array.from({ length: 5 }, () => topicItem("urinary")),
      ...Array.from({ length: 4 }, () => topicItem("allergy")),
    ];
    const shown = topicsWithEnoughArticles(items);
    assert.ok(shown.includes("urinary"));
    assert.equal(shown.includes("allergy"), false);
  });
});

describe("classifyArticleTopics", () => {
  it("tags diagnostic stewardship from a phrase, not from a lone weak word", () => {
    assert.ok(
      classifyArticleTopics({
        title: "Diagnostic stewardship reduced unnecessary urine cultures",
      }).includes("diagnostic-stewardship")
    );
    assert.equal(
      classifyArticleTopics({ title: "Procalcitonin levels in sepsis" }).includes(
        "diagnostic-stewardship"
      ),
      false
    );
  });

  it("tags pediatrics from the title or MeSH, not an abstract aside", () => {
    assert.ok(
      classifyArticleTopics({
        title: "Antibiotic duration in children with pneumonia",
      }).includes("pediatrics")
    );
    assert.ok(
      classifyArticleTopics({
        title: "Shorter therapy for pneumonia",
        meshTerms: ["Child"],
      }).includes("pediatrics")
    );
    assert.equal(
      classifyArticleTopics({
        title: "Shorter therapy for pneumonia",
        abstract: "Results may not apply to children.",
      }).includes("pediatrics"),
      false
    );
  });

  it("tags allergy from a drug-allergy phrase, not the bare word", () => {
    assert.ok(
      classifyArticleTopics({
        title: "Penicillin allergy delabeling in the hospital",
      }).includes("allergy")
    );
    assert.equal(
      classifyArticleTopics({
        title: "Seasonal allergy and antibiotic use",
      }).includes("allergy"),
      false
    );
  });

  it("tags the other new capsules and skips bloodstream wording", () => {
    assert.ok(
      classifyArticleTopics({ title: "Clostridioides difficile recurrence" }).includes(
        "c-difficile"
      )
    );
    assert.ok(
      classifyArticleTopics({ title: "Invasive candidiasis treatment" }).includes(
        "antifungal"
      )
    );
    assert.equal(
      classifyArticleTopics({ title: "Candida colonization in the ICU" }).includes(
        "antifungal"
      ),
      false
    );
    assert.equal(
      classifyArticleTopics({
        title:
          "Cefiderocol versus standard care for Gram-negative bloodstream infection",
        abstract:
          "Infectious complications (multidrug-resistant bacteria colonization and/or candidemia) occurred in both arms.",
      }).includes("antifungal"),
      false
    );
    assert.ok(
      classifyArticleTopics({
        title: "Shorter therapy for bloodstream infection",
        abstract: "Patients with candidemia were treated with an echinocandin.",
      }).includes("antifungal")
    );
    assert.ok(
      classifyArticleTopics({ title: "Osteomyelitis after foot infection" }).includes(
        "bone-joint"
      )
    );
    assert.equal(
      classifyArticleTopics({ title: "Osteomyelitis after foot infection" }).includes(
        "skin-soft-tissue"
      ),
      false
    );
    assert.ok(
      classifyArticleTopics({
        title: "Antibiotic prophylaxis before hip surgery",
      }).includes("surgical-prophylaxis")
    );
    assert.equal(
      classifyArticleTopics({
        title: "Antibiotic prophylaxis for spontaneous bacterial peritonitis",
      }).includes("surgical-prophylaxis"),
      false
    );
  });
});
