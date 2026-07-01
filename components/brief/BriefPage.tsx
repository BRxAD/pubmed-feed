"use client";

import { useEffect, useState } from "react";
import type { BriefItem } from "@/lib/brief/items";
import type { TrendingTerm } from "@/lib/brief/trending";
import type { BriefSettingFilter } from "@/lib/brief/settingFilter";
import Masthead from "@/components/brief/Masthead";
import SettingBar from "@/components/brief/SettingBar";
import BriefArticleCard, { LeadStory } from "@/components/brief/ArticleCard";
import TrendingPanel from "@/components/brief/TrendingPanel";
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

export default function BriefPage({
  items,
  newSinceYesterday,
  editorsNote,
  trending,
  setting,
}: {
  items: BriefItem[];
  newSinceYesterday: number;
  editorsNote: string;
  trending: TrendingTerm[];
  setting: BriefSettingFilter;
}) {
  const { saved, toggleSave } = useBriefSaved();
  const [lead, ...rest] = items;

  return (
    <div className={`min-h-screen ${brief.bg} ${brief.ink}`}>
      <Masthead
        dateLabel={formatToday()}
        editorsNote={editorsNote}
        newSinceYesterday={newSinceYesterday}
      />

      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="lg:grid lg:grid-cols-[1fr_280px] lg:gap-12">
          <main>
            <SettingBar active={setting} />

            {items.length === 0 ? (
              <p className={`mt-8 ${brief.sans} text-base leading-[1.55] ${brief.muted}`}>
                No studies matched this filter in the last week. Try another setting
                or check the{" "}
                <a href="/feed?source=pubmed" className={`${brief.accent} underline`}>
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
                {rest.length > 0 && (
                  <section aria-label="More stories">
                    {rest.map((item) => (
                      <BriefArticleCard
                        key={item.pmid}
                        item={item}
                        saved={saved.has(item.pmid)}
                        onToggleSave={toggleSave}
                      />
                    ))}
                  </section>
                )}
              </>
            )}
          </main>

          <aside className={`mt-12 lg:mt-0 space-y-10 pt-2 border-t lg:border-t-0 ${brief.hairline}`}>
            <TrendingPanel terms={trending} />
            <SaveStreak savedCount={saved.size} />
            <DigestSignup />
          </aside>
        </div>
      </div>
    </div>
  );
}
