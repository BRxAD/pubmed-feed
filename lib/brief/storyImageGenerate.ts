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

/** Rotates the shot so stories do not all become two people talking. */
const STORY_IMAGE_COMPOSITIONS = [
  "Photojournalistic still life. No people. Objects only, on a table or shelf, natural window light.",
  "Photojournalistic view of an empty place: a corridor, lab bench, pharmacy shelf, or clinic room. No faces.",
  "Tight photojournalistic detail of hands or equipment only. Do not show a face.",
  "Wide environmental photograph of the care setting. If a person appears, they are small, turned away, or out of focus. Not a portrait.",
] as const;

function compositionForPmid(pmid: string): string {
  let hash = 0;
  for (const char of pmid) hash = (hash * 33 + char.charCodeAt(0)) >>> 0;
  return STORY_IMAGE_COMPOSITIONS[hash % STORY_IMAGE_COMPOSITIONS.length]!;
}

function sceneMotif(text: string): string | null {
  const t = text.toLowerCase();
  const dental = /\b(dental|dentist|dentistry|odontogenic|periodont|endodontic)\b/.test(t);
  const bacteremia = /\b(bacteremi[aa]|bloodstream|blood culture)\b|\bbsi\b/.test(t);
  const oralSwitch =
    /\b(oral step-?down|transition to oral|switch to oral|iv to oral|intravenous to oral|early oral)\b/.test(
      t
    ) || (/\boral antibiotic/.test(t) && !dental);
  const education = /\b(nurse|nurses|nursing|education|teaching|knowledge gap)\b/.test(t);
  const urine = /\b(urine|urinary|kidney|cystitis|bacteriuria|pyelonephritis)\b/.test(t);
  const lung = /\b(pneumonia|lung|respiratory|ventilat)\b/.test(t);
  const infusion = /\b(opat|parenteral|infusion|intravenous)\b|\biv\b/.test(t);
  const surgery = /\b(surgery|surgical|operative|incision)\b/.test(t);
  const child = /\b(child|children|pediatric|infant|newborn)\b/.test(t);
  const policy = /\b(policy|guideline|surveillance|advisory)\b/.test(t);
  const micro = /\b(microbiology|petri|culture plate|antibiogram|susceptibility testing)\b/.test(t);

  if (dental) {
    return "dental instruments and a mouth mirror on a tray, chair empty";
  }
  if (oralSwitch && bacteremia) {
    return "blood culture bottles beside an IV bag and a blister pack of antibiotic capsules. No dental chair. No petri dishes.";
  }
  if (bacteremia) {
    return "blood culture bottles on a lab bench. No dental chair. No petri dishes.";
  }
  if (oralSwitch && infusion) {
    return "an IV bag next to a blister pack of oral antibiotic capsules. No dental chair.";
  }
  if (oralSwitch) {
    return "an IV bag next to a blister pack of oral antibiotic capsules. No dental chair. No petri dishes.";
  }
  if (education) {
    return "a nurses' station with a medication cart and a closed binder. No petri dishes, no microscope, no dental chair.";
  }
  if (urine) return "a urine specimen cup and a simple lab tray. No dental chair.";
  if (lung) return "oxygen tubing and a blank chest-imaging lightbox, no patient. No dental chair.";
  if (infusion) return "an IV bag and pump in a quiet room. No dental chair. No petri dishes.";
  if (surgery) return "a surgical instrument tray, no patient and no incision. No dental chair.";
  if (child) return "a pediatric clinic room with a scale and a closed bottle, no child. No dental chair.";
  if (policy) return "a quiet briefing table with a closed folder and an unlabeled map. No flags. No petri dishes.";
  if (micro) return "culture plates and a microscope on a bench. No dental chair.";
  if (/\b(hospital|icu|ward|inpatient)\b/.test(t)) {
    return "an empty hospital bay with a monitor and folded linens. No dental chair. No petri dishes.";
  }
  return null;
}

const DEFAULT_MOTIF =
  "medicine bottles and blister packs on a counter. No dental chair. No petri dishes. No microscope.";

export function buildStoryImagePrompt(candidate: BriefPhotoCandidate): string {
  const headline = (candidate.headline ?? "").replace(/\s+/g, " ").trim();
  const title = (candidate.title ?? "").replace(/\s+/g, " ").trim();
  const subject = (headline || title || "antimicrobial stewardship").slice(0, 180);
  const motif =
    sceneMotif(headline) ??
    sceneMotif(`${headline} ${title}`) ??
    DEFAULT_MOTIF;
  return [
    "Photorealistic newspaper photojournalism, landscape, natural light, shallow depth of field. Sharp and specific, not an illustration.",
    "Color grade: warm cream, olive green, deep plum, soft salmon, and steel blue. Muted. No neon, no pure black background.",
    compositionForPmid(candidate.pmid),
    `Show only this, and nothing from another specialty: ${motif}.`,
    "Do not depict a dental chair, mouth mirror, petri dishes, or microscope unless that sentence names them.",
    `Context, do not invent extra objects from it: ${subject}.`,
    "Do not show two people sitting or talking. Do not make a doctor-patient consultation portrait. Prefer no faces.",
    "Professional and respectful. No nudity, no sexual content, no children in distress, no graphic disease, wounds, blood, rashes, or lesions, no drug use, no weapons, no stereotypes, no political symbols.",
    "No text, no letters, no logos, no flags, no watermarks, no readable documents, no charts.",
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
        prompt: buildStoryImagePrompt(candidate),
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
