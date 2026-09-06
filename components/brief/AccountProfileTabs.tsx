"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { BriefItem } from "@/lib/brief/items";
import type { SavedBriefItem } from "@/lib/savedArticleTypes";
import { hydrateMySavedArticles } from "@/app/saved/actions";
import { useBriefSaved } from "@/components/brief/SaveStreak";
import { FeaturedStory } from "@/components/brief/ArticleCard";
import { brief } from "@/components/brief/briefTheme";
import EmailPreferencesDashboard from "@/components/brief/EmailPreferencesDashboard";
import type { UserPreferences } from "@/lib/userPreferences";

export type AccountTab = "email" | "saved";

function TabLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`${brief.sans} border-b-2 px-1 pb-2 text-sm font-medium tracking-wide transition-colors ${
        active
          ? "border-[#1C0B19] text-[#1C0B19]"
          : "border-transparent text-[#72705B] hover:text-[#1C0B19]"
      }`}
      aria-current={active ? "page" : undefined}
    >
      {children}
    </Link>
  );
}

function fallbackBriefItem(savedItem: SavedBriefItem): BriefItem {
  return {
    pmid: savedItem.pmid,
    source: "pubmed",
    headline: savedItem.title,
    title: savedItem.title,
    journal: null,
    jif: null,
    jifIsHigh: false,
    isQ1: false,
    sjrScimago: null,
    date: null,
    createdAt: new Date(0).toISOString(),
    fetchedAt: null,
    isNew: false,
    setting: null,
    settings: [],
    adminSetting: null,
    autoTopics: null,
    topics: [],
    autoWhoRegions: null,
    whoRegions: [],
    studyLabel: null,
    methods: null,
    results: null,
    bottomLine: null,
    relevancePercent: 0,
    predictedPriority: 5,
    adminPriority: null,
    effectivePriority: 5,
    prioritySource: "fallback",
    pubmedUrl: savedItem.pubmedUrl,
    authors: [],
    keywords: [],
    meshTerms: [],
    abstractSnippet: null,
  };
}

function SavedStories({
  initialItems,
  loadError,
}: {
  initialItems: BriefItem[];
  loadError?: string;
}) {
  const { saved, savedItems, toggleSave, ready, syncError } = useBriefSaved();
  const [hydrated, setHydrated] = useState<BriefItem[]>(initialItems);

  useEffect(() => {
    setHydrated(initialItems);
  }, [initialItems]);

  useEffect(() => {
    if (!ready || savedItems.length === 0) return;
    let cancelled = false;
    void (async () => {
      const result = await hydrateMySavedArticles(savedItems);
      if (cancelled || result.items.length === 0) return;
      setHydrated((prev) => {
        const map = new Map(prev.map((item) => [item.pmid, item]));
        for (const item of result.items) map.set(item.pmid, item);
        return [...map.values()];
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, savedItems]);

  const byPmid = useMemo(() => {
    const map = new Map<string, BriefItem>();
    for (const item of hydrated) map.set(item.pmid, item);
    for (const item of initialItems) {
      if (!map.has(item.pmid)) map.set(item.pmid, item);
    }
    return map;
  }, [hydrated, initialItems]);

  const stories = useMemo(() => {
    const source: SavedBriefItem[] = ready
      ? savedItems
      : initialItems.map((item) => ({
          pmid: item.pmid,
          title: item.headline || item.title,
          pubmedUrl: item.pubmedUrl,
        }));

    return source.map(
      (savedItem) => byPmid.get(savedItem.pmid) ?? fallbackBriefItem(savedItem)
    );
  }, [byPmid, initialItems, ready, savedItems]);

  const warning = syncError || loadError;

  if (ready && stories.length === 0) {
    return (
      <div className="space-y-3">
        {warning ? (
          <p className={`${brief.sans} text-sm text-red-800`} role="alert">
            {warning}
          </p>
        ) : null}
        <p className={`${brief.sans} text-sm ${brief.muted}`}>
          Nothing saved yet. On the daily brief, tap Save on a story.
        </p>
      </div>
    );
  }

  if (!ready && stories.length === 0) {
    return (
      <p className={`${brief.sans} text-sm ${brief.muted}`}>Loading saved…</p>
    );
  }

  return (
    <div>
      {warning ? (
        <p className={`mb-4 ${brief.sans} text-sm text-red-800`} role="alert">
          {warning}
        </p>
      ) : null}
      <p className={`mb-6 ${brief.sans} text-sm ${brief.muted}`}>
        Same story cards as the brief, without photos. Remove anytime with
        Unsave.
      </p>
      <div className="divide-y divide-[#D8D4C8] border-t border-[#D8D4C8]">
        {stories.map((item) => (
          <FeaturedStory
            key={item.pmid}
            item={item}
            bare
            headlineTier="secondary"
            saved={ready ? saved.has(item.pmid) : true}
            onToggleSave={toggleSave}
            image={null}
          />
        ))}
      </div>
    </div>
  );
}

export default function AccountProfileTabs({
  tab,
  email,
  preferences,
  prefsError,
  savedItems,
  savedError,
}: {
  tab: AccountTab;
  email: string | null;
  preferences: UserPreferences;
  prefsError?: string;
  savedItems: BriefItem[];
  savedError?: string;
}) {
  const { savedCount } = useBriefSaved();
  const tabCount = Math.max(savedItems.length, savedCount);

  return (
    <div className="space-y-8">
      <nav
        className="flex gap-6 border-b border-[#D8D4C8]"
        aria-label="Account sections"
      >
        <TabLink href="/settings?tab=email" active={tab === "email"}>
          Email preferences
        </TabLink>
        <TabLink href="/settings?tab=saved" active={tab === "saved"}>
          Saved articles
          {tabCount > 0 ? (
            <span className="ml-1.5 tabular-nums text-[#72705B]">
              ({tabCount})
            </span>
          ) : null}
        </TabLink>
      </nav>

      {tab === "email" ? (
        <div className="space-y-4">
          {prefsError ? (
            <p className={`${brief.sans} text-sm text-red-800`} role="alert">
              {prefsError}
            </p>
          ) : null}
          <EmailPreferencesDashboard
            email={email}
            initialPreferences={preferences}
            hideAccountChrome
          />
        </div>
      ) : (
        <SavedStories initialItems={savedItems} loadError={savedError} />
      )}
    </div>
  );
}
