import { PDFDocument, PDFImage, PDFPage, PDFFont, rgb, StandardFonts } from "pdf-lib";

type ReportPhoto = { image: string; caption?: string };

export type InitialPestPdfOptions = {
  reportTitle: string;
  logoSrc?: string;
  customerName: string;
  address: string;
  serviceDate: string;
  technicianName: string;
  licenseNumber?: string;
  propertyType?: string;
  companyName?: string;
  targetPests: string[];
  productsUsed: string[];
  equipment: string[];
  serviceSummary: string;
  todaysFindings?: string;
  recommendationsHtml?: string;
  expectations?: string;
  mapImage?: string | null;
  isRodentExclusion?: boolean;
  beforePhotos?: ReportPhoto[];
  afterPhotos?: ReportPhoto[];
  pairLabels?: string[];
  customerKeyAreas?: string[];
  customerKeyAreasNotes?: string;
  customerPreference?: string;
  customerPreferenceNotes?: string;
};

const PAGE_W = 842;
const PAGE_H = 595;
const MARGIN = 24;
const BRAND_BLACK = rgb(0.165, 0.165, 0.165);
const BRAND_SAGE = rgb(0.765, 0.82, 0.773);
const BRAND_DARK_SAGE = rgb(0.584, 0.631, 0.592);
const BRAND_TINT = rgb(0.958, 0.974, 0.96);
const WHITE = rgb(1, 1, 1);
const BORDER = rgb(0.79, 0.84, 0.80);

type Fonts = { regular: PDFFont; bold: PDFFont };
type Cursor = { page: PDFPage; y: number; pageNumber: number };

function safePdfText(value: string) {
  return value
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/[^\x20-\x7E•]/g, "");
}

function cleanText(value?: string) {
  return safePdfText(value || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&rsquo;/g, "’")
    .replace(/&mdash;/g, "—")
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function toLines(value?: string) {
  const text = cleanText(value);
  if (!text) return ["-"];
  return text.split(/\n+/).map((line) => line.trim()).filter(Boolean);
}

function displayDate(value: string) {
  if (!value) return "-";
  const [y, m, d] = value.split("-");
  return y && m && d ? `${m}/${d}/${y}` : value;
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number) {
  const words = safePdfText(text).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  words.forEach((word) => {
    const test = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(test, size) <= maxWidth) {
      current = test;
      return;
    }
    if (current) lines.push(current);
    current = word;
  });

  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

function drawTopRect(page: PDFPage, x: number, top: number, width: number, height: number, color: ReturnType<typeof rgb>) {
  page.drawRectangle({ x, y: top - height, width, height, color });
}

function drawWrappedLine(
  page: PDFPage,
  text: string,
  x: number,
  top: number,
  width: number,
  font: PDFFont,
  size: number,
  lineHeight: number,
  color = BRAND_BLACK,
) {
  const lines = wrapText(text, font, size, width);
  lines.forEach((line, index) => {
    page.drawText(line, { x, y: top - size - index * lineHeight, size, font, color });
  });
  return lines.length * lineHeight;
}

function estimateTextHeight(lines: string[], width: number, fonts: Fonts, size: number, lineHeight: number) {
  return lines.reduce((total, raw) => {
    const isBullet = /^([•\-–])\s+/.test(raw);
    const text = raw.replace(/^([•\-–])\s+/, "");
    const textWidth = isBullet ? width - 26 : width;
    return total + Math.max(1, wrapText(text, fonts.regular, size, textWidth).length) * lineHeight + 4;
  }, 0);
}

function drawBodyLines(page: PDFPage, lines: string[], x: number, top: number, width: number, fonts: Fonts, size = 17) {
  const lineHeight = size + 6;
  let y = top;
  lines.forEach((raw) => {
    const bullet = /^([•\-–])\s+/.test(raw);
    const text = raw.replace(/^([•\-–])\s+/, "");
    if (bullet) {
      page.drawText("•", { x, y: y - size, size: size + 2, font: fonts.bold, color: BRAND_BLACK });
      y -= drawWrappedLine(page, text, x + 22, y, width - 22, fonts.regular, size, lineHeight);
    } else {
      y -= drawWrappedLine(page, text, x, y, width, fonts.regular, size, lineHeight);
    }
    y -= 4;
  });
  return top - y;
}

function drawHeader(page: PDFPage, fonts: Fonts, opts: InitialPestPdfOptions, pageNumber: number, logo?: PDFImage | null) {
  drawTopRect(page, 0, PAGE_H, PAGE_W, 92, BRAND_SAGE);
  page.drawRectangle({ x: 0, y: PAGE_H - 94, width: PAGE_W, height: 2, color: BRAND_DARK_SAGE });

  if (logo) {
    const ratio = logo.width / logo.height;
    page.drawImage(logo, { x: MARGIN, y: PAGE_H - 76, width: 54 * ratio, height: 54 });
  }

  const titleX = logo ? 116 : MARGIN;
  page.drawText(safePdfText(opts.reportTitle || "Initial Pest Report"), {
    x: titleX,
    y: PAGE_H - 40,
    size: 29,
    font: fonts.bold,
    color: BRAND_BLACK,
  });
  page.drawText(safePdfText(`${opts.customerName || "Customer"}  •  ${displayDate(opts.serviceDate)}`), {
    x: titleX,
    y: PAGE_H - 66,
    size: 16,
    font: fonts.bold,
    color: BRAND_BLACK,
  });
  page.drawText(`Page ${pageNumber}`, {
    x: PAGE_W - 78,
    y: PAGE_H - 38,
    size: 13,
    font: fonts.bold,
    color: BRAND_BLACK,
  });
}

async function imageToJpegBytes(src?: string | null, maxDim = 1500): Promise<{ bytes: ArrayBuffer; width: number; height: number } | null> {
  if (!src) return null;

  const load = (url: string, crossOrigin: boolean) => new Promise<HTMLImageElement | null>((resolve) => {
    const img = new Image();
    if (crossOrigin) img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });

  let img = await load(src, !src.startsWith("data:") && !src.startsWith("blob:"));
  let objectUrl: string | null = null;

  if (!img && !src.startsWith("data:")) {
    try {
      const blob = await fetch(src, { mode: "cors" }).then((r) => r.blob());
      objectUrl = URL.createObjectURL(blob);
      img = await load(objectUrl, false);
    } catch {
      img = null;
    }
  }

  if (!img) return null;
  const ratio = Math.min(1, maxDim / Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height));
  const width = Math.max(1, Math.round((img.naturalWidth || img.width) * ratio));
  const height = Math.max(1, Math.round((img.naturalHeight || img.height) * ratio));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);
  if (objectUrl) URL.revokeObjectURL(objectUrl);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.86));
  if (!blob) return null;
  return { bytes: await blob.arrayBuffer(), width, height };
}

async function embedJpeg(doc: PDFDocument, src?: string | null, maxDim?: number) {
  const image = await imageToJpegBytes(src, maxDim);
  if (!image) return null;
  return doc.embedJpg(image.bytes);
}

function drawImageContain(page: PDFPage, image: PDFImage, x: number, top: number, width: number, height: number) {
  const scale = Math.min(width / image.width, height / image.height);
  const drawW = image.width * scale;
  const drawH = image.height * scale;
  page.drawImage(image, { x: x + (width - drawW) / 2, y: top - height + (height - drawH) / 2, width: drawW, height: drawH });
}

function drawImageCover(page: PDFPage, image: PDFImage, x: number, top: number, width: number, height: number) {
  const scale = Math.min(width / image.width, height / image.height);
  const drawW = image.width * scale;
  const drawH = image.height * scale;
  page.drawImage(image, { x: x + (width - drawW) / 2, y: top - height + (height - drawH) / 2, width: drawW, height: drawH });
}

function estimateChipsHeight(items: string[], width: number, fonts: Fonts) {
  if (!items.length) return 28;
  let x = 0;
  let rows = 1;
  items.forEach((item) => {
    const chipW = Math.min(width, fonts.bold.widthOfTextAtSize(item, 14) + 30);
    if (x && x + chipW > width) {
      rows += 1;
      x = 0;
    }
    x += chipW + 8;
  });
  return rows * 32;
}

function drawChips(page: PDFPage, items: string[], x: number, top: number, width: number, fonts: Fonts) {
  if (!items.length) {
    page.drawText("-", { x, y: top - 18, size: 17, font: fonts.regular, color: BRAND_BLACK });
    return 28;
  }
  let cx = x;
  let cy = top;
  items.forEach((item) => {
    const chipW = Math.min(width, fonts.bold.widthOfTextAtSize(item, 14) + 30);
    if (cx > x && cx + chipW > x + width) {
      cx = x;
      cy -= 32;
    }
    page.drawRectangle({ x: cx, y: cy - 24, width: chipW, height: 24, color: BRAND_SAGE, borderColor: BRAND_DARK_SAGE, borderWidth: 1 });
  page.drawText(safePdfText(item), { x: cx + 14, y: cy - 17, size: 14, font: fonts.bold, color: BRAND_BLACK });
    cx += chipW + 8;
  });
  return top - cy + 32;
}

function drawSectionOnPage(page: PDFPage, title: string, lines: string[], x: number, top: number, width: number, fonts: Fonts, bodySize = 17) {
  const headerH = 32;
  const pad = 14;
  const bodyH = estimateTextHeight(lines, width - pad * 2, fonts, bodySize, bodySize + 6);
  const height = headerH + pad * 2 + bodyH;
  page.drawRectangle({ x, y: top - height, width, height, color: WHITE, borderColor: BORDER, borderWidth: 1.2 });
  page.drawRectangle({ x, y: top - headerH, width, height: headerH, color: BRAND_BLACK });
  page.drawText(safePdfText(title.toUpperCase()), { x: x + 14, y: top - 22, size: 17, font: fonts.bold, color: WHITE });
  drawBodyLines(page, lines, x + pad, top - headerH - pad, width - pad * 2, fonts, bodySize);
  return height;
}

function drawChipSectionOnPage(page: PDFPage, title: string, items: string[], x: number, top: number, width: number, fonts: Fonts) {
  const headerH = 32;
  const pad = 14;
  const chipsH = estimateChipsHeight(items, width - pad * 2, fonts);
  const height = headerH + pad * 2 + chipsH;
  page.drawRectangle({ x, y: top - height, width, height, color: WHITE, borderColor: BORDER, borderWidth: 1.2 });
  page.drawRectangle({ x, y: top - headerH, width, height: headerH, color: BRAND_BLACK });
  page.drawText(safePdfText(title.toUpperCase()), { x: x + 14, y: top - 22, size: 17, font: fonts.bold, color: WHITE });
  drawChips(page, items, x + pad, top - headerH - pad, width - pad * 2, fonts);
  return height;
}

function addPage(doc: PDFDocument, fonts: Fonts, opts: InitialPestPdfOptions, pageNumber: number, logo?: PDFImage | null): Cursor {
  const page = doc.addPage([PAGE_W, PAGE_H]);
  drawHeader(page, fonts, opts, pageNumber, logo);
  return { page, y: PAGE_H - 116, pageNumber };
}

function addFlowSection(doc: PDFDocument, cursor: Cursor, fonts: Fonts, opts: InitialPestPdfOptions, title: string, lines: string[], logo?: PDFImage | null, bodySize = 17) {
  const width = PAGE_W - MARGIN * 2;
  const estimated = 32 + 28 + estimateTextHeight(lines, width - 28, fonts, bodySize, bodySize + 6);
  if (cursor.y - estimated < MARGIN) {
    const next = addPage(doc, fonts, opts, cursor.pageNumber + 1, logo);
    cursor.page = next.page;
    cursor.y = next.y;
    cursor.pageNumber = next.pageNumber;
  }
  const used = drawSectionOnPage(cursor.page, title, lines, MARGIN, cursor.y, width, fonts, bodySize);
  cursor.y -= used + 14;
}

function addFlowChipSection(doc: PDFDocument, cursor: Cursor, fonts: Fonts, opts: InitialPestPdfOptions, title: string, items: string[], logo?: PDFImage | null) {
  const width = PAGE_W - MARGIN * 2;
  const estimated = 32 + 28 + estimateChipsHeight(items, width - 28, fonts);
  if (cursor.y - estimated < MARGIN) {
    const next = addPage(doc, fonts, opts, cursor.pageNumber + 1, logo);
    cursor.page = next.page;
    cursor.y = next.y;
    cursor.pageNumber = next.pageNumber;
  }
  const used = drawChipSectionOnPage(cursor.page, title, items, MARGIN, cursor.y, width, fonts);
  cursor.y -= used + 14;
}

async function drawPhotoPages(doc: PDFDocument, cursor: Cursor, fonts: Fonts, opts: InitialPestPdfOptions, logo?: PDFImage | null) {
  const before = opts.beforePhotos || [];
  const after = opts.afterPhotos || [];
  const pairCount = Math.max(before.length, after.length);
  const hasPairs = pairCount > 0 && Array.from({ length: pairCount }).some((_, i) => before[i]?.image || after[i]?.image);
  const nonRodentPhotos = !opts.isRodentExclusion ? after.filter((p) => p.image) : [];
  if (!hasPairs && nonRodentPhotos.length === 0) return cursor;

  let pageInfo = addPage(doc, fonts, opts, cursor.pageNumber + 1, logo);
  cursor.page = pageInfo.page;
  cursor.y = pageInfo.y;
  cursor.pageNumber = pageInfo.pageNumber;

  pageInfo.page.drawText(opts.isRodentExclusion ? "Entry Point Photos - Before & After" : "Property Images", {
    x: MARGIN,
    y: cursor.y - 22,
    size: 24,
    font: fonts.bold,
    color: BRAND_BLACK,
  });
  cursor.y -= 42;

  if (opts.isRodentExclusion) {
    const labels = opts.pairLabels || [];
    const cardGap = 14;
    const cardW = (PAGE_W - MARGIN * 2 - cardGap) / 2;
    const cardH = 214;
    let x = MARGIN;
    let y = cursor.y;

    for (let i = 0; i < pairCount; i += 1) {
      if (!before[i]?.image && !after[i]?.image) continue;
      if (y - cardH < MARGIN) {
        pageInfo = addPage(doc, fonts, opts, cursor.pageNumber + 1, logo);
        cursor.page = pageInfo.page;
        cursor.y = pageInfo.y;
        cursor.pageNumber = pageInfo.pageNumber;
        y = cursor.y;
        x = MARGIN;
      }
      cursor.page.drawRectangle({ x, y: y - cardH, width: cardW, height: cardH, color: WHITE, borderColor: BORDER, borderWidth: 1.2 });
      const label = labels[i] || `Entry Point #${i + 1}`;
      cursor.page.drawText(safePdfText(label), { x: x + 12, y: y - 24, size: 17, font: fonts.bold, color: BRAND_BLACK });
      const imageTop = y - 42;
      const imageW = (cardW - 34) / 2;
      const imageH = 126;
      const beforeImg = await embedJpeg(doc, before[i]?.image, 1200);
      const afterImg = await embedJpeg(doc, after[i]?.image, 1200);
      [["Before", beforeImg, x + 12], ["After", afterImg, x + 22 + imageW]]
        .forEach(([labelText, img, ix]) => {
          const imageX = ix as number;
          cursor.page.drawRectangle({ x: imageX, y: imageTop - 22, width: imageW, height: 20, color: labelText === "After" ? BRAND_BLACK : BRAND_SAGE });
          cursor.page.drawText(labelText as string, { x: imageX + 8, y: imageTop - 17, size: 12, font: fonts.bold, color: labelText === "After" ? WHITE : BRAND_BLACK });
          cursor.page.drawRectangle({ x: imageX, y: imageTop - 22 - imageH, width: imageW, height: imageH, color: BRAND_TINT, borderColor: BORDER, borderWidth: 1 });
          if (img) drawImageCover(cursor.page, img as PDFImage, imageX, imageTop - 22, imageW, imageH);
        });
      const caption = after[i]?.caption || before[i]?.caption || "";
      if (caption) drawWrappedLine(cursor.page, caption, x + 12, y - 190, cardW - 24, fonts.regular, 12, 15);

      x = x === MARGIN ? MARGIN + cardW + cardGap : MARGIN;
      if (x === MARGIN) y -= cardH + 14;
    }
  } else {
    const gap = 14;
    const cardW = (PAGE_W - MARGIN * 2 - gap) / 2;
    const cardH = 214;
    let x = MARGIN;
    let y = cursor.y;
    for (const [index, photo] of nonRodentPhotos.entries()) {
      if (y - cardH < MARGIN) {
        pageInfo = addPage(doc, fonts, opts, cursor.pageNumber + 1, logo);
        cursor.page = pageInfo.page;
        cursor.y = pageInfo.y;
        cursor.pageNumber = pageInfo.pageNumber;
        y = cursor.y;
        x = MARGIN;
      }
      const img = await embedJpeg(doc, photo.image, 1200);
      cursor.page.drawRectangle({ x, y: y - cardH, width: cardW, height: cardH, color: WHITE, borderColor: BORDER, borderWidth: 1.2 });
      cursor.page.drawText(`Property Image ${index + 1}`, { x: x + 12, y: y - 23, size: 17, font: fonts.bold, color: BRAND_BLACK });
      cursor.page.drawRectangle({ x: x + 12, y: y - 178, width: cardW - 24, height: 140, color: BRAND_TINT, borderColor: BORDER, borderWidth: 1 });
      if (img) drawImageContain(cursor.page, img, x + 12, y - 38, cardW - 24, 140);
      if (photo.caption) drawWrappedLine(cursor.page, photo.caption, x + 12, y - 190, cardW - 24, fonts.regular, 12, 15);
      x = x === MARGIN ? MARGIN + cardW + gap : MARGIN;
      if (x === MARGIN) y -= cardH + 14;
    }
  }

  return cursor;
}

export async function buildInitialPestReportPDF(opts: InitialPestPdfOptions): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const fonts: Fonts = {
    regular: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
  };
  const logo = await embedJpeg(doc, opts.logoSrc, 600);
  const map = await embedJpeg(doc, opts.mapImage, 1600);

  let cursor = addPage(doc, fonts, opts, 1, logo);

  const metaLines = [
    `Address: ${opts.address || "-"}`,
    `Technician: ${opts.technicianName || "-"}${opts.licenseNumber ? ` (${opts.licenseNumber})` : ""}`,
    `Property Type: ${opts.propertyType || "Residential"}${opts.companyName ? ` - ${opts.companyName}` : ""}`,
  ];
  drawSectionOnPage(cursor.page, "Report Details", metaLines, MARGIN, cursor.y, PAGE_W - MARGIN * 2, fonts, 16);
  cursor.y -= 124;

  const mapW = 274;
  const mapH = 364;
  const rightX = MARGIN + mapW + 18;
  const rightW = PAGE_W - rightX - MARGIN;
  const contentTop = cursor.y;

  cursor.page.drawRectangle({ x: MARGIN, y: contentTop - mapH, width: mapW, height: mapH, color: BRAND_TINT, borderColor: BORDER, borderWidth: 1.2 });
  cursor.page.drawRectangle({ x: MARGIN, y: contentTop - 32, width: mapW, height: 32, color: BRAND_BLACK });
  cursor.page.drawText("SERVICE MAP", { x: MARGIN + 14, y: contentTop - 22, size: 17, font: fonts.bold, color: WHITE });
  if (map) {
    drawImageCover(cursor.page, map, MARGIN + 10, contentTop - 44, mapW - 20, mapH - 56);
  } else {
    cursor.page.drawText("No map image added", { x: MARGIN + 54, y: contentTop - 190, size: 18, font: fonts.bold, color: BRAND_BLACK });
  }

  let rightY = contentTop;
  rightY -= drawChipSectionOnPage(cursor.page, "Target Pests", opts.targetPests, rightX, rightY, rightW, fonts) + 12;
  rightY -= drawChipSectionOnPage(cursor.page, opts.isRodentExclusion ? "Materials Used" : "Equipment Used", opts.equipment, rightX, rightY, rightW, fonts) + 12;
  const summaryLines = toLines(opts.serviceSummary);
  const availableSummaryHeight = Math.max(120, rightY - MARGIN);
  const summaryCapacity = Math.max(3, Math.floor((availableSummaryHeight - 62) / 23));
  const firstSummary = summaryLines.slice(0, summaryCapacity);
  rightY -= drawSectionOnPage(cursor.page, "Services Completed", firstSummary, rightX, rightY, rightW, fonts, 17);
  cursor.y = Math.min(contentTop - mapH, rightY) - 14;

  const remainingSummary = summaryLines.slice(firstSummary.length);
  if (remainingSummary.length) addFlowSection(doc, cursor, fonts, opts, "Services Completed Continued", remainingSummary, logo, 17);
  addFlowSection(doc, cursor, fonts, opts, "Today's Findings", toLines(opts.todaysFindings), logo, 17);
  addFlowChipSection(doc, cursor, fonts, opts, "Products Used", opts.productsUsed, logo);

  if (opts.customerKeyAreas?.length || opts.customerKeyAreasNotes) {
    addFlowSection(
      doc,
      cursor,
      fonts,
      opts,
      "Customer Key Areas",
      toLines([opts.customerKeyAreas?.join(", "), opts.customerKeyAreasNotes].filter(Boolean).join(" - ")),
      logo,
      17,
    );
  }
  if (opts.customerPreference || opts.customerPreferenceNotes) {
    addFlowSection(
      doc,
      cursor,
      fonts,
      opts,
      "Customer Preferences",
      toLines([opts.customerPreference, opts.customerPreferenceNotes].filter(Boolean).join(" - ")),
      logo,
      17,
    );
  }

  addFlowSection(doc, cursor, fonts, opts, "Recommendations", toLines(opts.recommendationsHtml), logo, 17);
  addFlowSection(doc, cursor, fonts, opts, "What to Expect", toLines(opts.expectations), logo, 17);

  if (opts.isRodentExclusion) {
    addFlowSection(
      doc,
      cursor,
      fonts,
      opts,
      "Scope & Disclaimer",
      [
        "We are a licensed pest control company, not a licensed contractor. Exclusion materials are installed to block potential rodent entry points.",
        "Our standard rodent exclusion guarantee covers previously sealed entry points for 6 months. Ongoing rodent control customers receive extended warranty coverage while service remains active.",
        "Crest Pest Control is not liable for structural or property damage caused by rodents.",
      ],
      logo,
      15,
    );
  }

  cursor = await drawPhotoPages(doc, cursor, fonts, opts, logo);
  return doc.save();
}