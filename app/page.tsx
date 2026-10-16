import type { Metadata } from "next";
import {
  BRIEF_FILTER_DISPLAY_MAX,
  getCachedBriefFilterPool,
  getCachedHomepageReady,
} from "@/lib/brief/homepageCache";
import {
  BRIEF_SHARE_DESCRIPTION,
  BRIEF_SHARE_TITLE,
  BRIEF_SITE_URL,
  sharePreviewImageUrl,
} from "@/lib/brief/shareAttribution";
import { getTopPriorityYearItems } from "@/lib/brief/topPriority";
import {
  matchesBriefSettingFilter,
  parseBriefSetting,
} from "@/lib/brief/settingFilter";
import {
  matchesBriefTopicFilter,
  parseBriefTopic,
  topicsWithEnoughArticles,
} from "@/lib/brief/topicFilter";
import {
  matchesBriefWhoRegionFilter,
  parseBriefWhoRegion,
} from "@/lib/brief/whoRegionFilter";
import { listApprovedNewsForBrief } from "@/lib/news/store";
import { searchBriefArticles } from "@/lib/brief/searchArticles";
import { getBriefItemsForSaved } from "@/lib/brief/savedBriefItems";
import { assignStoryImages } from "@/lib/brief/storyImages";
import type { BriefItem } from "@/lib/brief/items";
import BriefPage from "@/components/brief/BriefPage";

export async function generateMetadata(): Promise<Metadata> {
  let imageUrl = "/stewardship-brief-logo.png";
  let imageAlt = BRIEF_SHARE_TITLE;
  let sized = false;
  try {
    const ready = await getCachedHomepageReady();
    const lead = ready.items[0];
    const match =
      (lead && ready.images[lead.pmid]) ||
      ready.items
        .map((item) => ready.images[item.pmid])
        .find((image) => image?.url) ||
      null;
    if (match?.url) {
      imageUrl = sharePreviewImageUrl(match.url);
      imageAlt = match.label || BRIEF_SHARE_TITLE;
      sized = imageUrl !== match.url;
    }
  } catch {
    // Keep the logo if the brief cannot be loaded.
  }

  return {
    title: BRIEF_SHARE_TITLE,
    description: BRIEF_SHARE_DESCRIPTION,
    openGraph: {
      title: BRIEF_SHARE_TITLE,
      description: BRIEF_SHARE_DESCRIPTION,
      url: BRIEF_SITE_URL,
      siteName: BRIEF_SHARE_TITLE,
      type: "website",
      images: [
        {
          url: imageUrl,
          alt: imageAlt,
          ...(sized ? { width: 1200, height: 630 } : {}),
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: BRIEF_SHARE_TITLE,
      description: BRIEF_SHARE_DESCRIPTION,
      images: [imageUrl],
    },
  };
}

function applyBriefFilters(
  items: BriefItem[],
  setting: ReturnType<typeof parseBriefSetting>,
  topic: ReturnType<typeof parseBriefTopic>,
  region: ReturnType<typeof parseBriefWhoRegion>
): BriefItem[] {
  let next = items;
  if (setting) {
    next = next.filter((item) => matchesBriefSettingFilter(item, setting));
  }
  if (topic) {
    next = next.filter((item) => matchesBriefTopicFilter(item, topic));
  }
  if (region) {
    next = next.filter((item) => matchesBriefWhoRegionFilter(item, region));
  }
  return next;
}

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
    const [topPriority, newsItems, topicPool] = await Promise.all([
      getTopPriorityYearItems(setting, topic),
      listApprovedNewsForBrief(6),
      getCachedBriefFilterPool(),
    ]);
    const visibleTopics = topicsWithEnoughArticles(topicPool);

    if (q) {
      // Search is not limited to the last 28 days. Two columns, no photos.
      const searchHits = await searchBriefArticles(q, 40);
      const items = applyBriefFilters(searchHits, setting, topic, region);

      return (
        <BriefPage
          items={items}
          topPriority={topPriority}
          setting={setting}
          topic={topic}
          region={region}
          q={q}
          images={{}}
          newsItems={newsItems}
          googleEnabled={googleEnabled}
          visibleTopics={visibleTopics}
        />
      );
    }

    const hasFilter = Boolean(setting || topic || region);
    if (hasFilter) {
      // Filters may include the past year. Layout stays lead + columns.
      const pool = topicPool;
      const matched = applyBriefFilters(pool, setting, topic, region).slice(
        0,
        BRIEF_FILTER_DISPLAY_MAX
      );
      const items = await getBriefItemsForSaved(
        matched.map((item) => ({
          pmid: item.pmid,
          title: item.headline || item.title,
          pubmedUrl: item.pubmedUrl,
        }))
      );
      const images = await assignStoryImages(items);

      return (
        <BriefPage
          items={items}
          topPriority={topPriority}
          setting={setting}
          topic={topic}
          region={region}
          q=""
          images={images}
          newsItems={newsItems}
          googleEnabled={googleEnabled}
          visibleTopics={visibleTopics}
        />
      );
    }

    // Default Brief path: cached All-pool + sticky lead + story images (28 days)
    const ready = await getCachedHomepageReady();
    const items = ready.items;

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
        visibleTopics={visibleTopics}
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
