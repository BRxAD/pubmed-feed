import { getCachedHomepageReady } from "@/lib/brief/homepageCache";
import { getTopPriorityYearItems } from "@/lib/brief/topPriority";
import {
  matchesBriefSettingFilter,
  parseBriefSetting,
} from "@/lib/brief/settingFilter";
import {
  matchesBriefTopicFilter,
  parseBriefTopic,
} from "@/lib/brief/topicFilter";
import {
  matchesBriefWhoRegionFilter,
  parseBriefWhoRegion,
} from "@/lib/brief/whoRegionFilter";
import { listApprovedNewsForBrief } from "@/lib/news/store";
import { searchBriefArticles } from "@/lib/brief/searchArticles";
import { assignStoryImages } from "@/lib/brief/storyImages";
import BriefPage from "@/components/brief/BriefPage";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{
    setting?: string;
    topic?: string;
    region?: string;
    q?: string;
  }>;
}) {
  const {
    setting: settingRaw,
    topic: topicRaw,
    region: regionRaw,
    q: queryRaw,
  } = await searchParams;

  const setting = parseBriefSetting(settingRaw);
  const topic = parseBriefTopic(topicRaw);
  const region = parseBriefWhoRegion(regionRaw);
  const q = (queryRaw ?? "").trim();
  const googleEnabled = Boolean(
    process.env.GOOGLE_CLIENT_ID?.trim() &&
      process.env.GOOGLE_CLIENT_SECRET?.trim()
  );

  try {
    const [topPriority, newsItems] = await Promise.all([
      getTopPriorityYearItems(setting, topic),
      listApprovedNewsForBrief(6),
    ]);

    if (q) {
      // Full-text / ILIKE title & abstract search path
      const searchHits = await searchBriefArticles(q, 40);
      let items = searchHits;
      if (setting) {
        items = items.filter((item) =>
          matchesBriefSettingFilter(item, setting)
        );
      }
      if (topic) {
        items = items.filter((item) => matchesBriefTopicFilter(item, topic));
      }
      if (region) {
        items = items.filter((item) =>
          matchesBriefWhoRegionFilter(item, region)
        );
      }

      const images = await assignStoryImages(items);

      return (
        <BriefPage
          items={items}
          topPriority={topPriority}
          setting={setting}
          topic={topic}
          region={region}
          q={q}
          images={images}
          newsItems={newsItems}
          googleEnabled={googleEnabled}
        />
      );
    }

    // Default Brief path: cached All-pool + sticky lead + story images
    const ready = await getCachedHomepageReady();
    let items = ready.items;
    if (setting) {
      items = items.filter((item) => matchesBriefSettingFilter(item, setting));
    }
    if (topic) {
      items = items.filter((item) => matchesBriefTopicFilter(item, topic));
    }
    if (region) {
      items = items.filter((item) =>
        matchesBriefWhoRegionFilter(item, region)
      );
    }

    return (
      <BriefPage
        items={items}
        topPriority={topPriority}
        setting={setting}
        topic={topic}
        region={region}
        q=""
        images={ready.images}
        newsItems={newsItems}
        googleEnabled={googleEnabled}
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
