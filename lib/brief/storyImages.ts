import type { ArticleSetting } from "@/lib/classifySetting";

/**
 * Curated Unsplash photos (royalty-free) for brief story art.
 * Assigned deterministically by setting + pmid so layouts stay stable.
 */
const IMAGES = {
  hospital: [
    "https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1579684385127-1ef15d508118?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1631217868264-e5b90bb7e133?auto=format&fit=crop&w=1200&q=80",
  ],
  community: [
    "https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1584820927498-cfe5211fd8bf?auto=format&fit=crop&w=1200&q=80",
  ],
  ltc: [
    "https://images.unsplash.com/photo-1559839734-2b71ea197ec2?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1576091160550-2173dba999ef?auto=format&fit=crop&w=1200&q=80",
  ],
  animal: [
    "https://images.unsplash.com/photo-1450778869180-41d0601e046e?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1548199973-03cce0bbc87b?auto=format&fit=crop&w=1200&q=80",
  ],
  environment: [
    "https://images.unsplash.com/photo-1532187863486-abf9dbad1b69?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1582719471384-894fbb16e074?auto=format&fit=crop&w=1200&q=80",
  ],
  general: [
    "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1587854692152-cbe660dbde88?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1576091160550-2173dba999ef?auto=format&fit=crop&w=1200&q=80",
  ],
} as const;

function hashPmid(pmid: string): number {
  let h = 0;
  for (let i = 0; i < pmid.length; i++) {
    h = (h * 31 + pmid.charCodeAt(i)) >>> 0;
  }
  return h;
}

function poolForSetting(setting: ArticleSetting | null): readonly string[] {
  switch (setting) {
    case "hospital":
      return IMAGES.hospital;
    case "community":
      return IMAGES.community;
    case "long-term care":
      return IMAGES.ltc;
    case "animal":
      return IMAGES.animal;
    case "environment":
      return IMAGES.environment;
    default:
      return IMAGES.general;
  }
}

/** Deterministic Unsplash URL for a brief story. */
export function briefStoryImageUrl(
  pmid: string,
  setting: ArticleSetting | null
): string {
  const pool = poolForSetting(setting);
  return pool[hashPmid(pmid) % pool.length]!;
}
