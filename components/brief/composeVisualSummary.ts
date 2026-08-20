import type { BriefItem } from "@/lib/brief/items";
import type { StoryImageMatch } from "@/lib/brief/storyImageTypes";
import { formatPubmedCitation } from "@/lib/brief/citation";
import { decodeHtmlEntities } from "@/lib/decodeHtmlEntities";

const WIDTH = 1600;
const HEIGHT = 900;
const BRAND_URL = "StewardshipBrief.com";
const LOGO_SRC = "/stewardship-brief-logo.png";
/** Dark left shade over photo (classic graphic takeaway). */
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
  // Cover ~2/3 of the card so full headlines/bottom lines stay readable.
  const grad = ctx.createLinearGradient(0, 0, w * 0.78, 0);
  grad.addColorStop(0, hexAlpha(SHADE, 0.98));
  grad.addColorStop(0.42, hexAlpha(SHADE, 0.94));
  grad.addColorStop(0.62, hexAlpha(SHADE, 0.78));
  grad.addColorStop(0.82, hexAlpha(SHADE, 0.32));
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
  // ~2/3 of the card for copy; no ellipsis truncation on headline/bottom line.
  const textMax = WIDTH * (2 / 3) - padX;
  const brandLogoH = 36;
  const brandGap = 36;
  const bottomPad = 48;
  const citeLh = 25;
  const headline = decodeHtmlEntities(
    (item.headline || item.title || "").trim()
  );
  const bottom = decodeHtmlEntities(item.bottomLine?.trim() ?? "");
  const citation = formatPubmedCitation({
    authors: item.authors,
    title: item.title ? decodeHtmlEntities(item.title) : item.title,
    journal: item.journal,
    date: item.date,
    pmid: item.pmid,
  });

  // Shrink fonts only if needed so full text fits above the citation block.
  let headSize = 68;
  let bodySize = 34;
  let headLh = 80;
  let bodyLh = 48;
  let headLines: string[] = [];
  let bodyLines: string[] = [];
  let citeLines: string[] = [];
  for (let attempt = 0; attempt < 6; attempt++) {
    ctx.font = `700 ${headSize}px Newsreader, Georgia, 'Times New Roman', serif`;
    headLines = wrapLinesFull(ctx, headline, textMax);
    ctx.font = `400 ${bodySize}px Newsreader, Georgia, 'Times New Roman', serif`;
    bodyLines = bottom ? wrapLinesFull(ctx, bottom, textMax) : [];
    ctx.font = "400 19px 'Libre Franklin', system-ui, sans-serif";
    citeLines = wrapLinesFull(ctx, citation, textMax);
    const citeBlockH = citeLines.length * citeLh + brandGap + brandLogoH;
    const topY = 88;
    const gapBeforeBody = bottom ? 28 : 0;
    const copyH =
      headLines.length * headLh +
      gapBeforeBody +
      bodyLines.length * bodyLh;
    const available =
      HEIGHT - bottomPad - citeBlockH - topY - 20;
    if (copyH <= available || headSize <= 44) break;
    headSize -= 4;
    bodySize -= 2;
    headLh = Math.round(headSize * 1.18);
    bodyLh = Math.round(bodySize * 1.4);
  }

  let y = 88;
  ctx.fillStyle = "#FFFFFF";
  ctx.textBaseline = "top";
  ctx.font = `700 ${headSize}px Newsreader, Georgia, 'Times New Roman', serif`;
  for (const line of headLines) {
    ctx.fillText(line, padX, y);
    y += headLh;
  }

  if (bottom) {
    y += 28;
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.font = `400 ${bodySize}px Newsreader, Georgia, 'Times New Roman', serif`;
    for (const line of bodyLines) {
      ctx.fillText(line, padX, y);
      y += bodyLh;
    }
  }

  const citeBlockH = citeLines.length * citeLh + brandGap + brandLogoH;
  let citeY = Math.max(y + 24, HEIGHT - bottomPad - citeBlockH);

  ctx.fillStyle = "rgba(255,255,255,0.78)";
  ctx.font = "400 19px 'Libre Franklin', system-ui, sans-serif";
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
  if (!blob) throw new Error("Could not encode graphic takeaway");
  return blob;
}

/**
 * Compose a shareable graphic takeaway PNG matching the Stewardship Brief card style.
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
