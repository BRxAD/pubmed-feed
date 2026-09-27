import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ARTICLE_SETTING_ORDER,
  type ArticleSetting,
} from "@/lib/classifySetting";
import type { CatalogEntry } from "@/lib/brief/storyImageCatalog";
import { STORY_IMAGE_RECYCLE_DAYS } from "@/lib/brief/storyImageBudget";

export type StoredStoryImage = {
  pmid: string;
  url: string;
  label: string;
  tags: string[];
  settings: ArticleSetting[];
  createdAt: string;
};

const SETTING_SET = new Set<string>(ARTICLE_SETTING_ORDER);

export function storyImageRecycleMs(): number {
  return STORY_IMAGE_RECYCLE_DAYS * 24 * 60 * 60 * 1000;
}

export function isRecyclableStoryImage(createdAt: string, now = Date.now()): boolean {
  const t = Date.parse(createdAt);
  if (!Number.isFinite(t)) return false;
  return now - t >= storyImageRecycleMs();
}

export function storedStoryImageToCatalog(row: StoredStoryImage): CatalogEntry {
  return {
    id: `generated-${row.pmid}`,
    url: row.url,
    label: row.label || "generated story photo",
    source: "generated",
    tags: row.tags,
    settings: row.settings,
  };
}

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function asSettings(value: unknown): ArticleSetting[] {
  return asStringList(value).filter((item): item is ArticleSetting =>
    SETTING_SET.has(item)
  );
}

/** Slim rows only. Missing table returns [] so the Brief still renders. */
export async function loadStoredStoryImages(
  supabase: SupabaseClient
): Promise<StoredStoryImage[]> {
  const { data, error } = await supabase
    .from("story_images")
    .select("pmid, url, label, tags, settings, created_at")
    .order("created_at", { ascending: false })
    .limit(800);

  if (error) {
    console.warn("[storyImages] library read skipped:", error.message);
    return [];
  }

  const rows: StoredStoryImage[] = [];
  for (const row of data ?? []) {
    const pmid = typeof row.pmid === "string" ? row.pmid : "";
    const url = typeof row.url === "string" ? row.url : "";
    if (!pmid || !url) continue;
    rows.push({
      pmid,
      url,
      label: typeof row.label === "string" ? row.label : "",
      tags: asStringList(row.tags),
      settings: asSettings(row.settings),
      createdAt:
        typeof row.created_at === "string"
          ? row.created_at
          : new Date().toISOString(),
    });
  }
  return rows;
}
