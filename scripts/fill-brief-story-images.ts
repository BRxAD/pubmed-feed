/**
 * Generate photos for current Brief homepage stories that have no stored
 * image and no strong catalog match. Uses the monthly dollar cap.
 *
 * Usage:
 *   npm run fill:story-images
 *   npm run fill:story-images -- --max=8
 */
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { getBriefItems } from "@/lib/brief/items";
import { BRIEF_ARTICLE_WINDOW_DAYS } from "@/lib/brief/priority";
import { applyStickyHomepageLead } from "@/lib/brief/leadStory";
import { assignStoryImages } from "@/lib/brief/storyImages";
import { STORY_IMAGE_POLICY } from "@/lib/brief/storyImagePolicy";
import {
  generateBriefStoryImages,
  type BriefPhotoCandidate,
} from "@/lib/brief/storyImageGenerate";

function parseMax(): number {
  const flag = process.argv.find((arg) => arg.startsWith("--max="));
  if (!flag) return 12;
  const n = Number(flag.slice("--max=".length));
  return Number.isFinite(n) && n > 0 ? Math.min(20, Math.floor(n)) : 12;
}

function parsePmid(): string | null {
  const flag = process.argv.find((arg) => arg.startsWith("--pmid="));
  const raw = flag?.slice("--pmid=".length).trim();
  return raw || null;
}

async function main() {
  const maxPerRun = parseMax();
  const onlyPmid = parsePmid();
  const supabase = getSupabaseServerClient();
  const brief = await getBriefItems({
    setting: "",
    daysBack: 90,
    maxLookbackDays: 90,
    maxItems: 50,
    articleDateWithinDays: BRIEF_ARTICLE_WINDOW_DAYS,
  });
  const items = await applyStickyHomepageLead(brief.items, "");
  const assigned = await assignStoryImages(items);
  const photoBand = items.slice(0, STORY_IMAGE_POLICY.photoTopCount);
  const candidates: BriefPhotoCandidate[] = photoBand
    .filter((item) => (onlyPmid ? item.pmid === onlyPmid : !assigned[item.pmid]))
    .map((item) => ({
      pmid: item.pmid,
      title: item.title,
      headline: item.headline,
      abstract: item.abstractSnippet ?? null,
      keywords: item.keywords ?? [],
      meshTerms: item.meshTerms ?? [],
      settings: item.settings ?? [],
    }));

  console.log(
    `[fill-story-images] brief=${items.length} photoBand=${photoBand.length} missing=${candidates.length} max=${maxPerRun}`
  );
  if (candidates.length === 0) {
    console.log("[fill-story-images] nothing to generate");
    return;
  }

  const result = await generateBriefStoryImages(supabase, candidates, {
    maxPerRun,
    fillGaps: true,
  });
  console.log("[fill-story-images]", result);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
