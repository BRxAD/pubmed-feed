import "server-only";
import OpenAI from "openai";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ArticleSetting } from "@/lib/classifySetting";
import {
  STORY_IMAGE_CALL_RESERVE_USD,
  STORY_IMAGE_MAX_PER_RUN,
  easternYearMonth,
  planStoryImageGenerations,
  storyImageMonthCapUsd,
} from "@/lib/brief/storyImageBudget";
import {
  isRecyclableStoryImage,
  loadStoredStoryImages,
  storedStoryImageToCatalog,
} from "@/lib/brief/storyImageLibrary";
import { bestStrictImagePlan } from "@/lib/brief/storyImages";

const BUDGET_START_KEY = "story_image_budget_start";
const BUCKET = "story-images";

/** gpt-image-2 token prices, USD per token. */
const TEXT_INPUT_USD = 5 / 1_000_000;
const IMAGE_INPUT_USD = 8 / 1_000_000;
const IMAGE_OUTPUT_USD = 30 / 1_000_000;

export type BriefPhotoCandidate = {
  pmid: string;
  title: string | null;
  headline: string | null;
  abstract: string | null;
  keywords: string[];
  meshTerms: string[];
  settings: ArticleSetting[];
};

type SpendLedger = {
  spentUsd: number;
  generatedCount: number;
  briefGradeCount: number;
};

function spendKey(now: Date): string {
  return `story_image_spend:${easternYearMonth(now)}`;
}

const GENERIC_TAG_WORDS = new Set([
  "antibiotic",
  "antibiotics",
  "antimicrobial",
  "antimicrobials",
  "resistance",
  "stewardship",
  "infection",
  "infections",
  "clinical",
  "medicine",
  "medical",
  "health",
  "public",
  "study",
  "review",
  "patient",
  "patients",
  "treatment",
  "therapy",
  "hospital",
  "community",
  "associated",
  "association",
  "effective",
  "effectiveness",
]);

function cleanTag(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function keepTag(tag: string): boolean {
  if (tag.length < 6) return false;
  if (/\b(archaeology|linguistics|theology|physics)\b/.test(tag)) return false;
  const words = tag.split(" ");
  if (words.every((word) => GENERIC_TAG_WORDS.has(word))) return false;
  if (words.length === 1 && GENERIC_TAG_WORDS.has(tag)) return false;
  return true;
}

/** Specific MeSH, keywords, and headline words so recycled photos stay on-topic. */
export function storyImageTags(
  keywords: string[],
  meshTerms: string[],
  headline: string | null
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (tag: string) => {
    if (!keepTag(tag) || seen.has(tag)) return;
    seen.add(tag);
    out.push(tag);
  };
  for (const raw of [...meshTerms, ...keywords]) push(cleanTag(raw));
  for (const word of cleanTag(headline ?? "").split(" ")) push(word);
  return out.slice(0, 16);
}

function buildPrompt(candidate: BriefPhotoCandidate): string {
  const subject = (candidate.headline || candidate.title || "antimicrobial stewardship study")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 220);
  return [
    "Photorealistic editorial photograph, landscape, soft natural light, shallow depth of field.",
    "Color grade in The Stewardship Brief palette: warm cream, olive green, deep plum, soft salmon pink, and steel blue. Muted and calm. No neon, no harsh cyan, no pure black background.",
    `A reusable everyday clinical or public-health scene for this topic, suitable to illustrate a similar paper in a later month: ${subject}.`,
    "Professional and respectful. Fully clothed adults in ordinary settings.",
    "No nudity, no sexual content, no children in distress, no graphic disease, wounds, blood, rashes, or lesions, no drug use, no weapons, no stereotypes, no political symbols.",
    "No text, no letters, no logos, no watermarks, no readable documents, no charts.",
  ].join(" ");
}

type ImageUsage = {
  input_tokens_details?: { image_tokens?: number; text_tokens?: number };
  output_tokens_details?: { image_tokens?: number; text_tokens?: number };
};

function costFromUsage(usage: ImageUsage | undefined): number {
  if (!usage) return STORY_IMAGE_CALL_RESERVE_USD;
  const textIn = usage.input_tokens_details?.text_tokens ?? 0;
  const imageIn = usage.input_tokens_details?.image_tokens ?? 0;
  const imageOut = usage.output_tokens_details?.image_tokens ?? 0;
  const cost = textIn * TEXT_INPUT_USD + imageIn * IMAGE_INPUT_USD + imageOut * IMAGE_OUTPUT_USD;
  if (!Number.isFinite(cost) || cost <= 0) return STORY_IMAGE_CALL_RESERVE_USD;
  return Math.round(cost * 10_000) / 10_000;
}

async function readSetting(supabase: SupabaseClient, key: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", key)
    .maybeSingle();
  if (error || data?.value == null) return null;
  return String(data.value);
}

async function writeSetting(supabase: SupabaseClient, key: string, value: string): Promise<void> {
  const { error } = await supabase.from("app_settings").upsert(
    { key, value, updated_at: new Date().toISOString() },
    { onConflict: "key" }
  );
  if (error) throw new Error(error.message);
}

function parseSpend(raw: string | null): SpendLedger {
  if (!raw) return { spentUsd: 0, generatedCount: 0, briefGradeCount: 0 };
  try {
    const parsed = JSON.parse(raw) as Partial<SpendLedger>;
    return {
      spentUsd: typeof parsed.spentUsd === "number" ? parsed.spentUsd : 0,
      generatedCount: typeof parsed.generatedCount === "number" ? parsed.generatedCount : 0,
      briefGradeCount:
        typeof parsed.briefGradeCount === "number" ? parsed.briefGradeCount : 0,
    };
  } catch {
    return { spentUsd: 0, generatedCount: 0, briefGradeCount: 0 };
  }
}

async function ensureBudgetStart(supabase: SupabaseClient, now: Date): Promise<Date> {
  const existing = await readSetting(supabase, BUDGET_START_KEY);
  if (existing) {
    const parsed = new Date(existing);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  await writeSetting(supabase, BUDGET_START_KEY, now.toISOString());
  return now;
}

/**
 * New Brief-grade stories only. Strong unique library matches keep the stock
 * photo. Weak matches, and high matches that would reuse generic stock, are
 * generated until the monthly dollar cap is hit. Failures do not throw.
 */
export async function generateBriefStoryImages(
  supabase: SupabaseClient,
  candidates: BriefPhotoCandidate[],
  opts?: { maxPerRun?: number; fillGaps?: boolean }
): Promise<{ generated: number; skipped: number }> {
  const unique = new Map<string, BriefPhotoCandidate>();
  for (const candidate of candidates) {
    if (!candidate.pmid || unique.has(candidate.pmid)) continue;
    unique.set(candidate.pmid, candidate);
  }
  const list = [...unique.values()];
  if (list.length === 0) return { generated: 0, skipped: 0 };

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    console.warn("[storyImages] skip generation: missing OPENAI_API_KEY");
    return { generated: 0, skipped: list.length };
  }

  const now = new Date();
  const startedAt = await ensureBudgetStart(supabase, now);
  const cap = storyImageMonthCapUsd(startedAt, now);
  const ledger = parseSpend(await readSetting(supabase, spendKey(now)));
  ledger.briefGradeCount += list.length;

  const stored = await loadStoredStoryImages(supabase);
  const already = new Set(stored.map((row) => row.pmid));
  const recycled = stored
    .filter((row) => isRecyclableStoryImage(row.createdAt, now.getTime()))
    .map(storedStoryImageToCatalog);

  const scores = list
    .filter((candidate) => !already.has(candidate.pmid))
    .map((candidate) => {
      const plan = bestStrictImagePlan(
        {
          pmid: candidate.pmid,
          headline: candidate.headline ?? "",
          title: candidate.title ?? "",
          bottomLine: null,
          keywords: candidate.keywords,
          setting: candidate.settings[0] ?? null,
          settings: candidate.settings,
          methods: null,
          results: null,
          studyLabel: null,
          meshTerms: candidate.meshTerms,
          abstractSnippet: candidate.abstract,
        },
        recycled
      );
      return {
        pmid: candidate.pmid,
        score: plan.score,
        preferGenerate: plan.preferGenerate,
      };
    });

  const perRun = opts?.maxPerRun ?? STORY_IMAGE_MAX_PER_RUN;
  const chosen = new Set(
    opts?.fillGaps
      ? scores
          .sort((a, b) => a.score - b.score || a.pmid.localeCompare(b.pmid))
          .slice(0, perRun)
          .map((row) => row.pmid)
      : planStoryImageGenerations(
          scores,
          ledger.briefGradeCount,
          ledger.generatedCount,
          perRun
        )
  );

  const client = new OpenAI({ apiKey });
  let generated = 0;

  for (const candidate of list) {
    if (!chosen.has(candidate.pmid)) continue;
    if (ledger.spentUsd + STORY_IMAGE_CALL_RESERVE_USD > cap) {
      console.warn(
        `[storyImages] monthly cap $${cap.toFixed(2)} reached (${ledger.spentUsd.toFixed(3)})`
      );
      break;
    }

    try {
      const result = await client.images.generate({
        model: "gpt-image-2",
        prompt: buildPrompt(candidate),
        size: "1536x1024",
        quality: "low",
        n: 1,
      });
      const b64 = result.data?.[0]?.b64_json;
      if (!b64) throw new Error("no image bytes");
      const bytes = Buffer.from(b64, "base64");
      const path = `${candidate.pmid}.png`;
      const upload = await supabase.storage.from(BUCKET).upload(path, bytes, {
        contentType: "image/png",
        upsert: false,
      });
      if (upload.error) throw new Error(upload.error.message);
      const url = supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
      const cost = costFromUsage(result.usage as ImageUsage | undefined);
      const label = (candidate.headline || candidate.title || "Story photo").slice(0, 140);
      const insert = await supabase.from("story_images").insert({
        pmid: candidate.pmid,
        url,
        storage_path: path,
        label,
        tags: storyImageTags(
          candidate.keywords,
          candidate.meshTerms,
          candidate.headline
        ),
        settings: candidate.settings,
        cost_usd: cost,
      });
      if (insert.error) throw new Error(insert.error.message);

      ledger.spentUsd = Math.round((ledger.spentUsd + cost) * 10_000) / 10_000;
      ledger.generatedCount += 1;
      generated += 1;
      console.log(
        `[storyImages] generated ${candidate.pmid} $${cost.toFixed(4)} month $${ledger.spentUsd.toFixed(3)}/${cap.toFixed(2)}`
      );
    } catch (err) {
      console.warn(
        `[storyImages] generate ${candidate.pmid}:`,
        err instanceof Error ? err.message : err
      );
    }
  }

  await writeSetting(supabase, spendKey(now), JSON.stringify(ledger)).catch((err) => {
    console.warn("[storyImages] spend ledger save failed:", err);
  });

  return { generated, skipped: list.length - generated };
}
