import type { BriefItem } from "@/lib/brief/items";
import type { StoryImageMatch } from "@/lib/brief/storyImageTypes";
import { formatPubmedCitation } from "@/lib/brief/citation";

const WIDTH = 1600;
const HEIGHT = 900;
const BRAND_URL = "StewardshipBrief.com";
const LOGO_SRC = "/stewardship-brief-logo.png";
const SHADE = "#1C0B19";

const LOCAL_GENERICS = [
  "/brief-images/generic-01.png",
  "/brief-images/generic-02.png",
  "/brief-images/generic-03.png",
  "/brief-images/generic-04.png",
  "/brief-images/generic-05.png",
  "/brief-images/generic-06.png",
  "/brief-images/generic-07.png",
  "/brief-images/generic-08.png",
  "/brief-images/generic-09.png",
  "/brief-images/generic-10.png",
] as const;

export type VisualSummaryInput = {
  item: BriefItem;
  image?: StoryImageMatch | null;
};

function pickFallbackImage(pmid: string): string {
  let h = 0;
  for (let i = 0; i < pmid.length; i++) h = (h * 31 + pmid.charCodeAt(i)) >>> 0;
  return LOCAL_GENERICS[h % LOCAL_GENERICS.length]!;
}

/** Use the article's assigned story image; fall back only when none was selected. */
export function resolveVisualSummaryImageSrc(
  item: BriefItem,
  image?: StoryImageMatch | null
): string {
  if (image?.url) return image.url;
  return pickFallbackImage(item.pmid);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    const absolute =
      src.startsWith("http://") ||
      src.startsWith("https://") ||
      src.startsWith("data:");
    if (absolute) img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
    img.src = src;
  });
}

function wrapLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
  options?: { ellipsis?: boolean }
): string[] {
  const words = text.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  if (words.length === 0 || maxLines <= 0) return [];

  const useEllipsis = options?.ellipsis !== false;
  const lines: string[] = [];
  let current = "";

  for (let i = 0; i < words.length; i++) {
    const word = words[i]!;
    const next = current ? `${current} ${word}` : word;
    if (ctx.measureText(next).width <= maxWidth) {
      current = next;
      continue;
    }

    if (current) lines.push(current);
    current = word;

    if (useEllipsis && lines.length === maxLines - 1) {
      const rest = [current, ...words.slice(i + 1)].join(" ");
      let truncated = rest;
      const needsEllipsis =
        i + 1 < words.length || ctx.measureText(rest).width > maxWidth;
      if (needsEllipsis) {
        while (
          truncated.length > 1 &&
          ctx.measureText(`${truncated}…`).width > maxWidth
        ) {
          truncated = truncated.slice(0, -1).trimEnd();
        }
        lines.push(`${truncated}…`);
      } else {
        lines.push(rest);
      }
      return lines;
    }

    if (lines.length >= maxLines) break;
  }

  if (current && lines.length < maxLines) lines.push(current);
  return lines.slice(0, maxLines);
}

/** Wrap to full width with no truncation / ellipsis. */
function wrapLinesFull(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  return wrapLines(ctx, text, maxWidth, Number.MAX_SAFE_INTEGER, {
    ellipsis: false,
  });
}

function drawCoverImage(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  w: number,
  h: number
) {
  const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight);
  const dw = img.naturalWidth * scale;
  const dh = img.naturalHeight * scale;
  // Bias crop so subject leans right (matches sample composition).
  const dx = w - dw;
  const dy = (h - dh) / 2;
  ctx.drawImage(img, dx, dy, dw, dh);
}

function drawLeftShade(ctx: CanvasRenderingContext2D, w: number, h: number) {
  // Extend ~33% further right so white text stays on solid shade.
  const grad = ctx.createLinearGradient(0, 0, w * 0.96, 0);
  grad.addColorStop(0, hexAlpha(SHADE, 0.97));
  grad.addColorStop(0.28, hexAlpha(SHADE, 0.94));
  grad.addColorStop(0.52, hexAlpha(SHADE, 0.72));
  grad.addColorStop(0.74, hexAlpha(SHADE, 0.28));
  grad.addColorStop(1, hexAlpha(SHADE, 0));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
}

function hexAlpha(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

async function loadQrImage(url: string): Promise<HTMLImageElement | null> {
  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&margin=8&color=1C0B19&bgcolor=F6F4EF&data=${encodeURIComponent(url)}`;
  try {
    return await loadImage(qrSrc);
  } catch {
    return null;
  }
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

async function renderToBlob(
  item: BriefItem,
  photoSrc: string
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");

  ctx.fillStyle = "#E8E4DC";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  try {
    const photo = await loadImage(photoSrc);
    drawCoverImage(ctx, photo, WIDTH, HEIGHT);
  } catch {
    // Keep paper base.
  }

  drawLeftShade(ctx, WIDTH, HEIGHT);

  const padX = 72;
  const textMax = WIDTH * 0.48;
  let y = 88;

  ctx.fillStyle = "#FFFFFF";
  ctx.textBaseline = "top";
  // ~25% larger than prior 54 / 27 / 15 for share-card readability.
  ctx.font = "700 68px Newsreader, Georgia, 'Times New Roman', serif";
  const headline = (item.headline || item.title || "").trim();
  const headLines = wrapLines(ctx, headline, textMax, 5);
  const headLh = 80;
  for (const line of headLines) {
    ctx.fillText(line, padX, y);
    y += headLh;
  }

  if (item.bottomLine?.trim()) {
    y += 28;
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.font = "400 34px Newsreader, Georgia, 'Times New Roman', serif";
    const bodyLines = wrapLines(ctx, item.bottomLine.trim(), textMax, 5);
    const bodyLh = 48;
    for (const line of bodyLines) {
      ctx.fillText(line, padX, y);
      y += bodyLh;
    }
  }

  const citation = formatPubmedCitation({
    authors: item.authors,
    title: item.title,
    journal: item.journal,
    date: item.date,
    pmid: item.pmid,
  });
  ctx.fillStyle = "rgba(255,255,255,0.78)";
  ctx.font = "400 19px 'Libre Franklin', system-ui, sans-serif";
  const citeLines = wrapLinesFull(ctx, citation, textMax);
  const citeLh = 25;
  const brandLogoH = 36;
  // Extra gap between citation and logos so marks have breathing room.
  const brandGap = 36;
  const bottomPad = 48;
  const citeBlockH =
    citeLines.length * citeLh + brandGap + brandLogoH;
  let citeY = HEIGHT - bottomPad - citeBlockH;

  ctx.textBaseline = "top";
  for (const line of citeLines) {
    ctx.fillText(line, padX, citeY);
    citeY += citeLh;
  }

  // Logo + site below citation, inverted (white) for the dark shade.
  citeY += brandGap;
  ctx.font = "700 28px Newsreader, Georgia, 'Times New Roman', serif";
  ctx.fillStyle = "#FFFFFF";
  const brandGapX = 12;
  let brandX = padX;

  try {
    const logo = await loadImage(LOGO_SRC);
    const logoH = brandLogoH;
    const logoW = (logo.naturalWidth / Math.max(1, logo.naturalHeight)) * logoH;
    ctx.save();
    // Force light mark on dark background.
    ctx.filter = "brightness(0) invert(1)";
    ctx.drawImage(logo, brandX, citeY, logoW, logoH);
    ctx.restore();
    brandX += logoW + brandGapX;
  } catch {
    // Text-only fallback.
  }

  ctx.fillStyle = "#FFFFFF";
  ctx.textBaseline = "middle";
  ctx.font = "700 28px Newsreader, Georgia, 'Times New Roman', serif";
  ctx.fillText(BRAND_URL, brandX, citeY + brandLogoH / 2);

  // QR stays bottom-right on the photo.
  const qr = await loadQrImage(item.pubmedUrl);
  if (qr) {
    const qrSize = 108;
    const qx = WIDTH - 56 - qrSize;
    const qy = HEIGHT - 48 - qrSize;
    ctx.fillStyle = "rgba(246,244,239,0.95)";
    roundRect(ctx, qx - 8, qy - 8, qrSize + 16, qrSize + 16, 8);
    ctx.fill();
    ctx.drawImage(qr, qx, qy, qrSize, qrSize);
  }

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b), "image/png")
  );
  if (!blob) throw new Error("Could not encode visual summary");
  return blob;
}

/**
 * Compose a shareable visual summary PNG matching the Stewardship Brief card style.
 */
export async function composeVisualSummary(
  input: VisualSummaryInput
): Promise<Blob> {
  const { item } = input;
  const photoSrc = resolveVisualSummaryImageSrc(item, input.image);
  return renderToBlob(item, photoSrc);
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
