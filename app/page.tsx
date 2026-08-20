import { getCachedHomepageReady } from "@/lib/brief/homepageCache";
import { getTopPriorityYearItems } from "@/lib/brief/topPriority";
import {
  matchesBriefSettingFilter,
  parseBriefSetting,
} from "@/lib/brief/settingFilter";
import { listApprovedNewsForBrief } from "@/lib/news/store";
import BriefPage from "@/components/brief/BriefPage";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ setting?: string }>;
}) {
  const { setting: settingRaw } = await searchParams;
  const setting = parseBriefSetting(settingRaw);

  try {
    // Ready payload caches All-pool + sticky lead + story images once;
    // setting tabs filter in memory so the same PMID keeps the same photo.
    const [ready, topPriority, newsItems] = await Promise.all([
      getCachedHomepageReady(),
      getTopPriorityYearItems(setting),
      listApprovedNewsForBrief(6),
    ]);
    const items = setting
      ? ready.items.filter((item) => matchesBriefSettingFilter(item, setting))
      : ready.items;

    return (
      <BriefPage
        items={items}
        topPriority={topPriority}
        setting={setting}
        images={ready.images}
        newsItems={newsItems}
      />
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 font-sans text-[#1C0B19]">
        <h1 className="font-serif text-2xl font-bold">The Stewardship Brief</h1>
        <p className="mt-4 text-red-800">Could not load the brief: {message}</p>
        <a
          href="/feed?source=pubmed"
          className="mt-6 inline-block text-[#2A79A7] underline"
        >
          Open PubMed feed →
        </a>
      </div>
    );
  }
}
