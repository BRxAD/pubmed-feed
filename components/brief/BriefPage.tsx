"use client";

import type { BriefItem } from "@/lib/brief/items";
import type { TopPriorityItem } from "@/lib/brief/topPriority";
import type { BriefSettingFilter } from "@/lib/brief/settingFilter";
import Masthead from "@/components/brief/Masthead";
import SettingBar from "@/components/brief/SettingBar";
import {
  LeadStory,
  FeaturedStory,
  CompactStory,
} from "@/components/brief/ArticleCard";
import TopPriorityPanel from "@/components/brief/TopPriorityPanel";
import SaveStreak, { useBriefSaved } from "@/components/brief/SaveStreak";
import DigestSignup from "@/components/brief/DigestSignup";
import { brief } from "@/components/brief/briefTheme";

function formatToday(): string {
  return new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * Pack remaining stories into featured + two-compact groups (layout B).
 * Leftover 1–2 items render as featured / compact without forcing empty slots.
 */
function packStoryGroups(items: BriefItem[]): BriefItem[][] {
  const groups: BriefItem[][] = [];
  let i = 0;
  while (i < items.length) {
    const remaining = items.length - i;
    if (remaining >= 3) {
      groups.push(items.slice(i, i + 3));
      i += 3;
    } else if (remaining === 2) {
      groups.push(items.slice(i, i + 2));
      i += 2;
    } else {
      groups.push(items.slice(i, i + 1));
      i += 1;
    }
  }
  return groups;
}

export default function BriefPage({
  items,
  topPriority,
  setting,
}: {
  items: BriefItem[];
  topPriority: TopPriorityItem[];
  setting: BriefSettingFilter;
}) {
  const { saved, toggleSave } = useBriefSaved();
  const [lead, ...rest] = items;
  const groups = packStoryGroups(rest);

  return (
    <div className={`min-h-screen ${brief.bg} ${brief.ink}`}>
      <Masthead dateLabel={formatToday()} />

      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="lg:grid lg:grid-cols-[1fr_280px] lg:gap-12">
          <main>
            <SettingBar active={setting} />

            {items.length === 0 ? (
              <p
                className={`mt-8 ${brief.sans} text-base leading-[1.55] ${brief.muted}`}
              >
                No studies matched this filter in the last week. Try another
                setting or check the{" "}
                <a
                  href="/feed?source=pubmed"
                  className={`${brief.accent} underline`}
                >
                  PubMed feed
                </a>
                .
              </p>
            ) : (
              <>
                {lead && (
                  <div className="mt-6">
                    <LeadStory
                      item={lead}
                      saved={saved.has(lead.pmid)}
                      onToggleSave={toggleSave}
                    />
                  </div>
                )}

                {groups.length > 0 && (
                  <section aria-label="More stories">
                    <h2
                      className={`${brief.kicker} mb-2 pb-3 border-b ${brief.hairline}`}
                    >
                      Also in today&apos;s brief
                    </h2>

                    {groups.map((group) => {
                      const [featured, ...compacts] = group;
                      if (!featured) return null;

                      if (compacts.length === 0) {
                        return (
                          <FeaturedStory
                            key={featured.pmid}
                            item={featured}
                            saved={saved.has(featured.pmid)}
                            onToggleSave={toggleSave}
                          />
                        );
                      }

                      return (
                        <div
                          key={featured.pmid}
                          className="grid gap-0 lg:grid-cols-[1.35fr_1fr] lg:gap-8 border-b border-[#D8D4C8]"
                        >
                          <FeaturedStory
                            item={featured}
                            bare
                            saved={saved.has(featured.pmid)}
                            onToggleSave={toggleSave}
                          />
                          <div className="lg:border-l lg:border-[#D8D4C8] lg:pl-8 divide-y divide-[#D8D4C8]">
                            {compacts.map((item) => (
                              <CompactStory
                                key={item.pmid}
                                item={item}
                                bare
                                saved={saved.has(item.pmid)}
                                onToggleSave={toggleSave}
                              />
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </section>
                )}
              </>
            )}
          </main>

          <aside
            className={`mt-12 lg:mt-0 space-y-10 pt-2 border-t lg:border-t-0 ${brief.hairline}`}
          >
            <TopPriorityPanel items={topPriority} />
            <SaveStreak savedCount={saved.size} />
            <DigestSignup />
          </aside>
        </div>
      </div>
    </div>
  );
}
