import type { BriefItem } from "@/lib/brief/items";
import type { StoryImageMatch } from "@/lib/brief/storyImageTypes";
import { citationYear, formatLeadAuthorLine } from "@/lib/brief/citation";
import { formatJournalTitle } from "@/lib/brief/formatJournal";
import { decodeHtmlEntities } from "@/lib/decodeHtmlEntities";

const WIDTH = 1600;
const HEIGHT = 900;
const LOGO_SRC = "/stewardship-brief-logo.png";
const LOGO_LIGHT_SRC = "/stewardship-brief-logo-light.png";
const PLUM = "#1C0B19";
const SALMON = "#FFA69E";
const SKY = "#7BC1D4";
const SKY_LIGHT = "#D2F1F6";
const PAPER = "#F6F4EF";
const PAGE_PAD = 56;
const SUBHEAD_SIZE = 16; // 13px + 20%
const SUBHEAD_ICON = 23; // 19px + 20%

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

/** Lucide paths used on the dashboard preview (viewBox 0 0 24 24). */
const ICONS = {
  sparkles: [
    [
      "path",
      "M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z",
    ],
    ["path", "M20 2v4"],
    ["path", "M22 4h-4"],
    ["circle", "4 20 2"],
  ],
  users: [
    ["path", "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"],
    ["path", "M16 3.128a4 4 0 0 1 0 7.744"],
    ["path", "M22 21v-2a4 4 0 0 0-3-3.87"],
    ["circle", "9 7 4"],
  ],
  chart: [
    ["path", "M3 3v16a2 2 0 0 0 2 2h16"],
    ["path", "M18 17V9"],
    ["path", "M13 17V5"],
    ["path", "M8 17v-3"],
  ],
  scan: [
    ["path", "M3 7V5a2 2 0 0 1 2-2h2"],
    ["path", "M17 3h2a2 2 0 0 1 2 2v2"],
    ["path", "M21 17v2a2 2 0 0 1-2 2h-2"],
    ["path", "M7 21H5a2 2 0 0 1-2-2v-2"],
    ["path", "M7 12h10"],
  ],
  book: [
    ["path", "M12 5v16"],
    [
      "path",
      "M20.001 19A2 2 0 0022 17V5a2 2 0 00-1.999-2L16 3.002A5 5 0 0012 5a5 5 0 00-4-2H4a2 2 0 00-2 2v12a2 2 0 001.999 2H8a5 5 0 014 2 5 5 0 014-2z",
    ],
  ],
} as const;

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

function loadImage(src: string, timeoutMs = 10000): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    const absolute =
      src.startsWith("http://") ||
      src.startsWith("https://") ||
      src.startsWith("data:");
    if (absolute) img.crossOrigin = "anonymous";
    const timer = window.setTimeout(() => {
      img.onload = null;
      img.onerror = null;
      reject(new Error(`Timed out loading image: ${src}`));
    }, timeoutMs);
    img.onload = () => {
      window.clearTimeout(timer);
      resolve(img);
    };
    img.onerror = () => {
      window.clearTimeout(timer);
      reject(new Error(`Failed to load image: ${src}`));
    };
    img.src = src;
  });
}

function lucideDataUrl(
  nodes: readonly (readonly [string, string])[],
  color: string,
  size = 64
): string {
  const inner = nodes
    .map(([tag, data]) => {
      if (tag === "circle") {
        const [cx, cy, r] = data.split(" ");
        return `<circle cx="${cx}" cy="${cy}" r="${r}"/>`;
      }
      return `<path d="${data}"/>`;
    })
    .join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

async function loadIcon(
  nodes: readonly (readonly [string, string])[],
  color: string
): Promise<HTMLImageElement | null> {
  try {
    return await loadImage(lucideDataUrl(nodes, color));
  } catch {
    return null;
  }
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

function drawCoverImage(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  w: number,
  h: number
) {
  const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight);
  const dw = img.naturalWidth * scale;
  const dh = img.naturalHeight * scale;
  const dx = (w - dw) / 2;
  const dy = (h - dh) / 2;
  ctx.drawImage(img, dx, dy, dw, dh);
}

function hexAlpha(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

async function loadQrImage(url: string): Promise<HTMLImageElement | null> {
  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&margin=8&color=1C0B19&bgcolor=FFFFFF&data=${encodeURIComponent(url)}`;
  try {
    return await loadImage(qrSrc);
  } catch {
    return null;
  }
}

function clampRadii(
  w: number,
  h: number,
  r: number | [number, number, number, number]
): [number, number, number, number] {
  const cap = Math.max(0, Math.min(w, h) / 2);
  const list = typeof r === "number" ? [r, r, r, r] : r;
  return [
    Math.max(0, Math.min(list[0] ?? 0, cap)),
    Math.max(0, Math.min(list[1] ?? 0, cap)),
    Math.max(0, Math.min(list[2] ?? 0, cap)),
    Math.max(0, Math.min(list[3] ?? 0, cap)),
  ];
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number | [number, number, number, number]
) {
  const [tl, tr, br, bl] = clampRadii(w, h, r);
  ctx.beginPath();
  ctx.moveTo(x + tl, y);
  ctx.lineTo(x + w - tr, y);
  if (tr > 0) ctx.quadraticCurveTo(x + w, y, x + w, y + tr);
  else ctx.lineTo(x + w, y);
  ctx.lineTo(x + w, y + h - br);
  if (br > 0) ctx.quadraticCurveTo(x + w, y + h, x + w - br, y + h);
  else ctx.lineTo(x + w, y + h);
  ctx.lineTo(x + bl, y + h);
  if (bl > 0) ctx.quadraticCurveTo(x, y + h, x, y + h - bl);
  else ctx.lineTo(x, y + h);
  ctx.lineTo(x, y + tl);
  if (tl > 0) ctx.quadraticCurveTo(x, y, x + tl, y);
  else ctx.lineTo(x, y);
  ctx.closePath();
}

function drawIcon(
  ctx: CanvasRenderingContext2D,
  icon: HTMLImageElement | null,
  x: number,
  y: number,
  size: number
) {
  if (!icon) return;
  ctx.drawImage(icon, x, y, size, size);
}

function drawLabelWithIcon(
  ctx: CanvasRenderingContext2D,
  opts: {
    x: number;
    y: number;
    icon: HTMLImageElement | null;
    label: string;
    color: string;
    fontSize?: number;
    iconSize?: number;
  }
) {
  const iconSize = opts.iconSize ?? SUBHEAD_ICON;
  const fontSize = opts.fontSize ?? SUBHEAD_SIZE;
  if (opts.icon) {
    drawIcon(ctx, opts.icon, opts.x, opts.y, iconSize);
  }
  ctx.fillStyle = opts.color;
  ctx.font = `700 ${fontSize}px 'Libre Franklin', system-ui, sans-serif`;
  ctx.fillText(
    opts.label,
    opts.x + (opts.icon ? iconSize + 8 : 0),
    opts.y + 1
  );
}

function drawColumnBox(
  ctx: CanvasRenderingContext2D,
  opts: {
    x: number;
    y: number;
    width: number;
    height: number;
    icon: HTMLImageElement | null;
    label: string;
    lines: string[];
    fontSize: number;
    lineHeight: number;
  }
) {
  roundRect(ctx, opts.x, opts.y, opts.width, opts.height, 10);
  ctx.fillStyle = "rgba(246,244,239,0.44)";
  ctx.fill();
  drawLabelWithIcon(ctx, {
    x: opts.x + 20,
    y: opts.y + 14,
    icon: opts.icon,
    label: opts.label,
    color: SKY_LIGHT,
  });
  ctx.fillStyle = PAPER;
  ctx.font = `400 ${opts.fontSize}px 'Libre Franklin', system-ui, sans-serif`;
  let ly = opts.y + 48;
  for (const line of opts.lines) {
    ctx.fillText(line, opts.x + 20, ly);
    ly += opts.lineHeight;
  }
}

function drawFooterBar(
  ctx: CanvasRenderingContext2D,
  qr: HTMLImageElement | null,
  scanIcon: HTMLImageElement | null
): { y: number; height: number; qrReserve: number } {
  const qrSize = 72;
  const pad = 16;
  const gap = 14;
  const height = pad + qrSize + pad;
  const y = HEIGHT - height;

  ctx.save();
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillStyle = hexAlpha(PLUM, 0.72);
  ctx.fillRect(0, y, WIDTH, height);
  ctx.fillStyle = hexAlpha(SALMON, 0.42);
  ctx.fillRect(0, y, WIDTH, height);

  let qrReserve = PAGE_PAD;
  if (qr) {
    const qx = WIDTH - pad - qrSize;
    const qy = y + pad;
    roundRect(ctx, qx - 4, qy - 4, qrSize + 8, qrSize + 8, 6);
    ctx.fillStyle = PAPER;
    ctx.fill();
    ctx.drawImage(qr, qx, qy, qrSize, qrSize);

    ctx.font = `700 ${SUBHEAD_SIZE}px 'Libre Franklin', system-ui, sans-serif`;
    const label = "SCAN TO READ ARTICLE";
    const labelW = ctx.measureText(label).width;
    const iconW = scanIcon ? SUBHEAD_ICON + 8 : 0;
    const tx = qx - gap - iconW - labelW;
    drawLabelWithIcon(ctx, {
      x: tx,
      y: qy + (qrSize - SUBHEAD_ICON) / 2,
      icon: scanIcon,
      label,
      color: SALMON,
    });
    qrReserve = WIDTH - tx + 24;
  }
  ctx.restore();
  return { y, height, qrReserve };
}

async function loadBrandLogo(): Promise<{
  img: HTMLImageElement;
  invert: boolean;
} | null> {
  try {
    return { img: await loadImage(LOGO_LIGHT_SRC), invert: false };
  } catch {
    try {
      return { img: await loadImage(LOGO_SRC), invert: true };
    } catch {
      return null;
    }
  }
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

  ctx.fillStyle = PLUM;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  try {
    const photo = await loadImage(photoSrc);
    drawCoverImage(ctx, photo, WIDTH, HEIGHT);
  } catch {
    // Plum base remains.
  }

  const wash = ctx.createLinearGradient(0, 0, 0, HEIGHT);
  wash.addColorStop(0, hexAlpha(PLUM, 0.95));
  wash.addColorStop(0.2, hexAlpha(PLUM, 0.95));
  wash.addColorStop(1, hexAlpha(PLUM, 0.5));
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  const padX = PAGE_PAD;
  const contentRight = Math.round(WIDTH * 0.75);
  const contentW = contentRight - padX;
  const journal = formatJournalTitle(item.journal);
  const headline = decodeHtmlEntities(
    (item.headline || item.title || "").trim()
  );
  const fullTitle = decodeHtmlEntities((item.title || "").trim());
  const takeaway = decodeHtmlEntities(item.bottomLine?.trim() ?? "");
  const methods = decodeHtmlEntities(item.methods?.trim() ?? "");
  const findings = decodeHtmlEntities(item.results?.trim() ?? "");
  const leadAuthor = formatLeadAuthorLine(item.authors);
  const year = citationYear(item.date);
  const journalLine = [journal, year].filter(Boolean).join(". ");

  const [
    logoImg,
    sparklesIcon,
    usersIcon,
    chartIcon,
    scanIcon,
    bookIcon,
    qr,
  ] = await Promise.all([
    loadBrandLogo(),
    loadIcon(ICONS.sparkles, SALMON),
    loadIcon(ICONS.users, SKY_LIGHT),
    loadIcon(ICONS.chart, SKY_LIGHT),
    loadIcon(ICONS.scan, SALMON),
    loadIcon(ICONS.book, SKY),
    loadQrImage(item.pubmedUrl),
  ]);

  const logoH = 48;
  const logoY = 36;
  if (logoImg) {
    const logoW =
      (logoImg.img.naturalWidth / Math.max(1, logoImg.img.naturalHeight)) *
      logoH;
    const logoX = WIDTH - padX - logoW;
    if (logoImg.invert) {
      ctx.save();
      ctx.filter = "brightness(0) invert(1)";
      ctx.drawImage(logoImg.img, logoX, logoY, logoW, logoH);
      ctx.restore();
    } else {
      ctx.drawImage(logoImg.img, logoX, logoY, logoW, logoH);
    }
  } else {
    ctx.fillStyle = PAPER;
    ctx.font = "600 22px 'Libre Franklin', system-ui, sans-serif";
    ctx.textBaseline = "middle";
    ctx.fillText("The Stewardship Brief", WIDTH - padX - 240, logoY + logoH / 2);
  }

  ctx.textBaseline = "top";
  ctx.fillStyle = SKY;
  ctx.font = "600 18px 'Libre Franklin', system-ui, sans-serif";
  const journalIconSize = 22;
  const journalTextX = padX + (bookIcon ? journalIconSize + 8 : 0);
  const journalLabel = wrapLines(
    ctx,
    journal.toUpperCase(),
    contentW - (journalTextX - padX),
    1
  );
  if (bookIcon) {
    drawIcon(ctx, bookIcon, padX, 48, journalIconSize);
  }
  ctx.fillStyle = SKY;
  ctx.fillText(journalLabel[0] ?? "", journalTextX, 48);

  let headSize = 42;
  let headLh = 50;
  let takeSize = 24;
  let takeLh = 34;
  let colSize = 20;
  let colLh = 28;
  let headLines: string[] = [];
  let takeLines: string[] = [];
  let methodLines: string[] = [];
  let findingLines: string[] = [];

  const colGap = 20;
  const colW = (contentW - colGap) / 2;
  const footerH = 120;
  const topAfterLogo = 98;

  for (let attempt = 0; attempt < 8; attempt++) {
    ctx.font = `700 ${headSize}px Newsreader, Georgia, 'Times New Roman', serif`;
    headLines = wrapLines(ctx, headline, contentW, 3);
    ctx.font = `400 ${takeSize}px 'Libre Franklin', system-ui, sans-serif`;
    takeLines = takeaway ? wrapLines(ctx, takeaway, contentW - 48, 4) : [];
    ctx.font = `400 ${colSize}px 'Libre Franklin', system-ui, sans-serif`;
    methodLines = methods ? wrapLines(ctx, methods, colW - 40, 6) : [];
    findingLines = findings ? wrapLines(ctx, findings, colW - 40, 6) : [];

    const takeBoxH = takeaway ? 40 + takeLines.length * takeLh + 24 : 0;
    const colBoxH =
      42 +
      Math.max(methodLines.length, findingLines.length) * colLh +
      24;
    const used =
      topAfterLogo +
      headLines.length * headLh +
      20 +
      takeBoxH +
      18 +
      colBoxH;
    if (used <= HEIGHT - footerH - 16 || headSize <= 32) break;
    headSize -= 2;
    headLh = Math.round(headSize * 1.18);
    takeSize = Math.max(18, takeSize - 1);
    takeLh = Math.round(takeSize * 1.38);
    colSize = Math.max(16, colSize - 1);
    colLh = Math.round(colSize * 1.36);
  }

  let y = topAfterLogo;
  ctx.fillStyle = PAPER;
  ctx.font = `700 ${headSize}px Newsreader, Georgia, 'Times New Roman', serif`;
  for (const line of headLines) {
    ctx.fillText(line, padX, y);
    y += headLh;
  }

  y += 18;
  if (takeaway) {
    const takeBoxH = 40 + takeLines.length * takeLh + 22;
    roundRect(ctx, padX, y, contentW, takeBoxH, 10);
    ctx.fillStyle = hexAlpha(SALMON, 0.2);
    ctx.fill();
    ctx.fillStyle = SALMON;
    ctx.fillRect(padX, y, 6, takeBoxH);
    drawLabelWithIcon(ctx, {
      x: padX + 24,
      y: y + 14,
      icon: sparklesIcon,
      label: "KEY TAKEAWAY",
      color: SALMON,
    });
    ctx.fillStyle = PAPER;
    ctx.font = `400 ${takeSize}px 'Libre Franklin', system-ui, sans-serif`;
    let ty = y + 44;
    for (const line of takeLines) {
      ctx.fillText(line, padX + 24, ty);
      ty += takeLh;
    }
    y += takeBoxH + 18;
  }

  const colBoxH =
    42 +
    Math.max(methodLines.length, findingLines.length, 1) * colLh +
    22;

  if (methods || findings) {
    drawColumnBox(ctx, {
      x: padX,
      y,
      width: colW,
      height: colBoxH,
      icon: usersIcon,
      label: "METHODS",
      lines: methodLines,
      fontSize: colSize,
      lineHeight: colLh,
    });
    drawColumnBox(ctx, {
      x: padX + colW + colGap,
      y,
      width: colW,
      height: colBoxH,
      icon: chartIcon,
      label: "STUDY FINDINGS",
      lines: findingLines,
      fontSize: colSize,
      lineHeight: colLh,
    });
  }

  const footer = drawFooterBar(ctx, qr, scanIcon);

  ctx.textBaseline = "top";
  ctx.font = "400 16px 'Libre Franklin', system-ui, sans-serif";
  const citeMaxW = Math.max(240, WIDTH - PAGE_PAD - footer.qrReserve);
  const titleLines = fullTitle
    ? wrapLines(ctx, fullTitle.replace(/\.$/, ""), citeMaxW, 2)
    : [];
  const citeBlockH =
    (leadAuthor ? 26 : 0) +
    titleLines.length * 22 +
    (journalLine ? 26 : 0);
  let citeY = footer.y + Math.max(12, (footer.height - citeBlockH) / 2);

  if (leadAuthor) {
    ctx.fillStyle = PAPER;
    ctx.font = "600 20px 'Libre Franklin', system-ui, sans-serif";
    ctx.fillText(leadAuthor, padX, citeY);
    citeY += 26;
  }
  if (titleLines.length > 0) {
    ctx.fillStyle = hexAlpha(PAPER, 0.95);
    ctx.font = "400 16px 'Libre Franklin', system-ui, sans-serif";
    for (const line of titleLines) {
      const isLast = line === titleLines[titleLines.length - 1];
      ctx.fillText(`${line}${isLast ? "." : ""}`, padX, citeY);
      citeY += 22;
    }
  }
  if (journalLine) {
    ctx.fillStyle = PAPER;
    ctx.font = "500 17px 'Libre Franklin', system-ui, sans-serif";
    ctx.fillText(`${journalLine}.`, padX, citeY);
  }

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b), "image/png")
  );
  if (!blob) throw new Error("Could not encode graphic takeaway");
  return blob;
}

/**
 * Graphic takeaway 2.0: shareable 16:9 dashboard PNG.
 * 1.0 was the 4:5 navy photo card; restore from git if we offer it again.
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
