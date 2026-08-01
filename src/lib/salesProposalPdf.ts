// ─── Multi-proposal sales report PDF ────────────────────────────────────
// Generates the sales proposal PDF directly from the report's DATA — not a
// screenshot of the on-screen editor. Same philosophy as visitPdf.ts: the
// old html2canvas capture inherited every quirk of the web layout (fuzzy
// raster text, truncation, size-to-fit shrinking). Building from data gives
// crisp vector text, proper page flow, and a small file.
//
// Page size is A4 landscape (842×595pt) to match public/proposal-template.pdf,
// whose cover + marketing pages wrap the content in "full" mode.
import jsPDF from "jspdf";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import crestLogoUrl from "@/assets/crest-logo.png";
import crestBugUrl from "@/assets/crest-bug-black.png";

// ─── Public data model ──────────────────────────────────────────────────

export interface SalesPdfServiceRow {
  serviceType: string;
  /** Whole-dollar amounts (already parsed). */
  initial: number;
  recurring: number;
  frequencyLabel: string;
  /** Pre-formatted schedule chips ("Aug", "August W1", …); empty = one-time. */
  scheduleChips: string[];
}

export interface SalesPdfOption {
  name: string;
  recommended: boolean;
  recurringLabel: string;
  services: SalesPdfServiceRow[];
  /** Data URL or fetchable URL for this option's (annotated) property map. */
  mapImage?: string | null;
  /** Rich HTML for Proposed Services. */
  servicesHtml?: string;
  guaranteeBoxes: { title: string; html: string }[];
  targetPests: string[];
  additionalDetailsHtml?: string;
  setupMaterials: { name: string; quantity: string }[];
  exclusions: { label: string; text: string }[];
  invoiceNote?: string | null;
  /** Signature image data URL when this option has been signed. */
  signature?: string | null;
}

export interface SalesProposalPdfData {
  title: string;
  reportNumber?: string;
  customerName: string;
  address: string;
  fieldroutesId?: string | null;
  serviceDate: string;
  propertyType?: string;
  companyName?: string;
  technicianName: string;
  licenseNumber?: string;
  scheduling?: { day?: string; time?: string; contact?: string; phone?: string } | null;
  products: { name: string; chemical?: string }[];
  options: SalesPdfOption[];
  propertyImages: { image: string; caption?: string }[];
  /** Show the four-week billing-cycle footnote (weekly/bi-weekly/4-week plans). */
  fourWeekCycleNote?: boolean;
}

export interface SalesPdfBuildOptions {
  /** Wrap content in the proposal template (cover + marketing pages). */
  fullTemplate?: boolean;
  /** Smaller images for upload paths with strict size limits. */
  compact?: boolean;
}

// ─── Brand palette ──────────────────────────────────────────────────────

const C = {
  ink: [42, 42, 42] as const,
  soft: [85, 90, 85] as const,
  muted: [110, 116, 110] as const,
  faint: [150, 155, 150] as const,
  rule: [221, 226, 221] as const,
  sage: [195, 209, 197] as const,
  darkSage: [149, 161, 151] as const,
  sageTint: [242, 246, 242] as const,
  chip: [238, 241, 238] as const,
  bar: [64, 64, 64] as const,
  white: [255, 255, 255] as const,
  cream: [250, 250, 249] as const,
};

const PAGE_W = 842;
const PAGE_H = 595;
const MARGIN = 38;
const CONTENT_W = PAGE_W - MARGIN * 2;
const BOTTOM = PAGE_H - MARGIN - 10; // reserve footer strip

// ─── Legal / boilerplate text ───────────────────────────────────────────

const PESTICIDE_NOTICE =
  'State law requires that you be given the following information: CAUTION--PESTICIDES ARE TOXIC CHEMICALS. ' +
  'Structural Pest Control Companies are registered and regulated by the Structural Pest Control Board, and apply ' +
  'pesticides which are registered and approved for use by the California Department of Pesticide Regulation and ' +
  'the United States Environmental Protection Agency. Registration is granted when the state finds that, based on ' +
  'existing scientific evidence, there are no appreciable risks if proper use conditions are followed or that the ' +
  'risks are outweighed by the benefits. The degree of risk depends upon the degree of exposure, so exposure should ' +
  'be minimized." "If within 24 hours following application you experience symptoms similar to common seasonal ' +
  'illness comparable to the flu, contact your physician or poison control center (800-222-1222) and your pest ' +
  'control company immediately." This statement shall be modified to include any other symptoms of overexposure ' +
  'which are not typical of influenza.';

const PESTICIDE_CONTACTS =
  'For further information, contact any of the following: Crest Pest Control (949-424-5000); for Health ' +
  'Questions--the County Health Department (800-564-8448); for Application Information--the County Agricultural ' +
  'Commissioner (714-955-0100) and for Regulatory Information--the Structural Pest Control Board (800-737-8188, ' +
  '2005 Evergreen Street, Ste. 1500, Sacramento, CA 95815).';

const CREST_GUARANTEE =
  "If pests return, we will return at no charge. We don't lock you into a long-term contract. " +
  'We want our service quality to keep you as a customer, not a contract.';

const FOUR_WEEK_NOTE =
  '* Scheduling and billing run on four-week cycles to help ensure consistency (e.g., the same day and time for ' +
  'each visit). Invoices are sent upon completion of each service.';

const LIABILITY_NOTE =
  'Crest Pest Control is not liable for any structural or property damage caused by any pests or rodents.';

// ─── Rich HTML → paragraphs ─────────────────────────────────────────────
// The Proposed Services / Additional Details / Guarantee content is stored
// as simple rich HTML (<b>, <i>, <br>, <p>, <ul>/<li>, bullets typed as •).
// Parse into styled paragraph runs we can typeset with mixed fonts.

interface Seg { text: string; bold: boolean; italic: boolean }
interface Para { segs: Seg[]; bullet: boolean }

const ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  bull: "•", middot: "·", ndash: "–", mdash: "—", rsquo: "’",
  lsquo: "‘", rdquo: "”", ldquo: "“", hellip: "…", deg: "°",
};

function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&([a-z]+);/gi, (m, name) => ENTITIES[name.toLowerCase()] ?? m);
}

export function parseRichHtml(html: string): Para[] {
  if (!html || !html.trim()) return [];
  let s = html
    .replace(/\r/g, "")
    .replace(/<\s*br\s*\/?\s*>/gi, "\n")
    .replace(/<\/\s*(p|div|h[1-6]|tr)\s*>/gi, "\n")
    .replace(/<\s*(p|div|h[1-6])(\s[^>]*)?>/gi, "")
    .replace(/<\s*li(\s[^>]*)?>/gi, "\n• ")
    .replace(/<\/\s*li\s*>/gi, "\n")
    .replace(/<\/?\s*(ul|ol)(\s[^>]*)?>/gi, "\n");

  // Tokenize on style tags, tracking bold/italic depth.
  const paras: Para[] = [];
  let current: Seg[] = [];
  let boldDepth = 0;
  let italicDepth = 0;

  const flushLine = () => {
    const text = current.map((c) => c.text).join("");
    if (text.trim().length > 0) {
      // Merge, trim leading whitespace of first seg, detect bullets.
      let segs = current.filter((c) => c.text.length > 0);
      let bullet = false;
      const joined = text.replace(/^\s+/, "");
      if (/^[•▪‣-]\s?/.test(joined)) {
        bullet = true;
        // Strip the bullet char from the first non-empty seg.
        let stripped = false;
        segs = segs.map((seg) => {
          if (stripped) return seg;
          const t = seg.text.replace(/^\s*[•▪‣-]\s?/, () => { stripped = true; return ""; });
          return { ...seg, text: t };
        }).filter((seg) => seg.text.length > 0);
      }
      // Trim leading space on first seg / trailing on last.
      if (segs.length > 0) {
        segs[0] = { ...segs[0], text: segs[0].text.replace(/^\s+/, "") };
        const last = segs.length - 1;
        segs[last] = { ...segs[last], text: segs[last].text.replace(/\s+$/, "") };
      }
      if (segs.length > 0) paras.push({ segs, bullet });
    } else if (paras.length > 0 && paras[paras.length - 1].segs.length > 0) {
      paras.push({ segs: [], bullet: false }); // blank line → paragraph gap
    }
    current = [];
  };

  const tagRe = /<\/?\s*(b|strong|i|em|u|span|a|font)(\s[^>]*)?\/?\s*>|<[^>]*>/gi;
  let idx = 0;
  let m: RegExpExecArray | null;
  const pushText = (raw: string) => {
    const parts = raw.split("\n");
    parts.forEach((part, i) => {
      if (i > 0) flushLine();
      if (part.length > 0) {
        current.push({
          text: decodeEntities(part).replace(/\s+/g, " "),
          bold: boldDepth > 0,
          italic: italicDepth > 0,
        });
      }
    });
  };
  while ((m = tagRe.exec(s)) !== null) {
    pushText(s.slice(idx, m.index));
    idx = m.index + m[0].length;
    const tag = (m[1] || "").toLowerCase();
    const closing = m[0].startsWith("</");
    if (tag === "b" || tag === "strong") boldDepth = Math.max(0, boldDepth + (closing ? -1 : 1));
    if (tag === "i" || tag === "em") italicDepth = Math.max(0, italicDepth + (closing ? -1 : 1));
  }
  pushText(s.slice(idx));
  flushLine();

  // Drop trailing blank paras.
  while (paras.length > 0 && paras[paras.length - 1].segs.length === 0) paras.pop();
  while (paras.length > 0 && paras[0].segs.length === 0) paras.shift();
  return paras;
}

// ─── Image loading ──────────────────────────────────────────────────────

interface Loaded { img: HTMLImageElement; w: number; h: number; revoke?: () => void }

async function loadImage(src: string): Promise<Loaded | null> {
  if (!src) return null;
  try {
    if (src.startsWith("data:")) {
      const img = new Image();
      await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = rej; img.src = src; });
      return { img, w: img.naturalWidth, h: img.naturalHeight };
    }
    const resp = await fetch(src, { mode: "cors" });
    if (!resp.ok) throw new Error(String(resp.status));
    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);
    const img = new Image();
    await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = rej; img.src = url; });
    return { img, w: img.naturalWidth, h: img.naturalHeight, revoke: () => URL.revokeObjectURL(url) };
  } catch {
    // Last resort: crossOrigin image (works for same-origin/static assets).
    try {
      const img = new Image();
      img.crossOrigin = "anonymous";
      await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = rej; img.src = src; });
      return { img, w: img.naturalWidth, h: img.naturalHeight };
    } catch {
      return null;
    }
  }
}

/** Re-encode into a JPEG data URL sized for a boxW×boxH pt box. */
function jpegForBox(p: Loaded, boxW: number, boxH: number, mode: "cover" | "contain", quality: number, px = 2.4): string {
  const cw = Math.max(1, Math.round(boxW * px));
  const ch = Math.max(1, Math.round(boxH * px));
  const canvas = document.createElement("canvas");
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, cw, ch);
  const scale = mode === "cover" ? Math.max(cw / p.w, ch / p.h) : Math.min(cw / p.w, ch / p.h);
  const dw = p.w * scale;
  const dh = p.h * scale;
  ctx.drawImage(p.img, (cw - dw) / 2, (ch - dh) / 2, dw, dh);
  return canvas.toDataURL("image/jpeg", quality);
}

/** PNG data URL (alpha preserved) for logo art drawn over colored bands. */
function pngDataUrl(p: Loaded, maxPx = 480): string {
  const scale = Math.min(1, maxPx / Math.max(p.w, p.h));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(p.w * scale));
  canvas.height = Math.max(1, Math.round(p.h * scale));
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(p.img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/png");
}

/** Small filled five-point star (helvetica has no ★ glyph). */
function drawStar(pdf: jsPDF, cx: number, cy: number, r: number, color: readonly number[]) {
  pdf.setFillColor(color[0], color[1], color[2]);
  const pts: [number, number][] = [];
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? r : r * 0.42;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    pts.push([cx + rad * Math.cos(a), cy + rad * Math.sin(a)]);
  }
  const segs: [number, number][] = [];
  for (let i = 1; i < pts.length; i++) segs.push([pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]]);
  pdf.lines(segs, pts[0][0], pts[0][1], [1, 1], "F", true);
}

// ─── Main builder ───────────────────────────────────────────────────────

export async function buildSalesProposalPdf(
  data: SalesProposalPdfData,
  opts: SalesPdfBuildOptions = {},
): Promise<Uint8Array> {
  const quality = opts.compact ? 0.62 : 0.85;
  const px = opts.compact ? 1.6 : 2.4;

  // Preload artwork + photos up front.
  const [logo, bug] = await Promise.all([loadImage(crestLogoUrl), loadImage(crestBugUrl)]);
  const logoPng = logo ? pngDataUrl(logo, 560) : null;
  const logoAspect = logo ? logo.w / logo.h : 1.84;
  const bugPng = bug ? pngDataUrl(bug, 200) : null;
  const bugAspect = bug ? bug.w / bug.h : 0.85;

  const mapLoads = await Promise.all(data.options.map((o) => (o.mapImage ? loadImage(o.mapImage) : Promise.resolve(null))));
  const photoLoads = await Promise.all(data.propertyImages.map((p) => loadImage(p.image)));
  const sigLoads = await Promise.all(data.options.map((o) => (o.signature ? loadImage(o.signature) : Promise.resolve(null))));

  const pdf = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  let y = MARGIN;

  const setFont = (size: number, style: "normal" | "bold" | "italic" | "bolditalic" = "normal", color: readonly number[] = C.ink) => {
    pdf.setFont("helvetica", style);
    pdf.setFontSize(size);
    pdf.setTextColor(color[0], color[1], color[2]);
  };
  const fill = (c: readonly number[]) => pdf.setFillColor(c[0], c[1], c[2]);
  const stroke = (c: readonly number[]) => pdf.setDrawColor(c[0], c[1], c[2]);

  const newPage = () => {
    pdf.addPage();
    y = MARGIN;
  };
  const ensure = (h: number) => {
    if (y + h > BOTTOM) newPage();
  };

  // ── Typesetting helpers ──

  const drawLogo = (x: number, yTop: number, h: number) => {
    if (!logoPng) return 0;
    const w = h * logoAspect;
    pdf.addImage(logoPng, "PNG", x, yTop, w, h);
    return w;
  };

  /** Plain wrapped text; advances y. */
  const writeText = (
    text: string, x: number, width: number, size: number,
    o: { style?: "normal" | "bold" | "italic"; color?: readonly number[]; lineH?: number; align?: "left" | "center" } = {},
  ) => {
    const lineH = o.lineH ?? size * 1.4;
    setFont(size, o.style || "normal", o.color || C.ink);
    for (const para of String(text).split(/\n/)) {
      const lines: string[] = para.trim() === "" ? [" "] : pdf.splitTextToSize(para, width);
      for (const line of lines) {
        ensure(lineH);
        setFont(size, o.style || "normal", o.color || C.ink);
        if (o.align === "center") pdf.text(line, x + width / 2, y + size * 0.85, { align: "center" });
        else pdf.text(line, x, y + size * 0.85);
        y += lineH;
      }
    }
  };

  /** Rich paragraphs (mixed bold/italic, bullets); advances y. */
  const writeRich = (paras: Para[], x: number, width: number, size: number, o: { lineH?: number; color?: readonly number[] } = {}) => {
    const lineH = o.lineH ?? size * 1.42;
    const color = o.color || C.ink;
    const gap = size * 0.5;

    interface Word { text: string; bold: boolean; italic: boolean; w: number }
    const styleOf = (seg: Seg): "normal" | "bold" | "italic" | "bolditalic" =>
      seg.bold && seg.italic ? "bolditalic" : seg.bold ? "bold" : seg.italic ? "italic" : "normal";

    for (const para of paras) {
      if (para.segs.length === 0) { y += gap; continue; }
      const indent = para.bullet ? 11 : 0;
      const avail = width - indent;

      // Split into styled words.
      const words: Word[] = [];
      for (const seg of para.segs) {
        setFont(size, styleOf(seg), color);
        for (const token of seg.text.split(/(\s+)/)) {
          if (token === "") continue;
          if (/^\s+$/.test(token)) {
            if (words.length > 0) words[words.length - 1].text += " ";
            continue;
          }
          const isSpaceJoined = words.length > 0 && !words[words.length - 1].text.endsWith(" ");
          if (isSpaceJoined) {
            // No whitespace between segments — glue onto previous word (e.g. "$50" split across tags).
            const prev = words[words.length - 1];
            if (prev.bold === seg.bold && prev.italic === seg.italic) {
              prev.text += token;
              prev.w = pdf.getTextWidth(prev.text.trimEnd());
              continue;
            }
          }
          words.push({ text: token, bold: seg.bold, italic: seg.italic, w: pdf.getTextWidth(token) });
        }
      }

      // Greedy line-break.
      let line: Word[] = [];
      let lineW = 0;
      const spaceW = (() => { setFont(size, "normal", color); return pdf.getTextWidth(" "); })();
      const flush = (first: boolean) => {
        if (line.length === 0) return;
        ensure(lineH);
        let cx = x + indent;
        if (para.bullet && first) {
          setFont(size, "normal", color);
          pdf.text("•", x + 1.5, y + size * 0.85);
        }
        for (const w of line) {
          const st = w.bold && w.italic ? "bolditalic" : w.bold ? "bold" : w.italic ? "italic" : "normal";
          setFont(size, st as any, color);
          const display = w.text.trimEnd();
          pdf.text(display, cx, y + size * 0.85);
          cx += pdf.getTextWidth(display) + (w.text.endsWith(" ") ? spaceW : 0);
        }
        y += lineH;
        line = [];
        lineW = 0;
      };
      let firstLine = true;
      for (const w of words) {
        const wWidth = w.w + spaceW;
        if (lineW + wWidth > avail && line.length > 0) {
          flush(firstLine);
          firstLine = false;
        }
        line.push(w);
        lineW += wWidth;
      }
      flush(firstLine);
      y += size * 0.28; // small paragraph spacing
    }
  };

  /** Measure rich height without drawing (rough — mirrors writeRich flow). */
  const measureRich = (paras: Para[], width: number, size: number): number => {
    const lineH = size * 1.42;
    let h = 0;
    for (const para of paras) {
      if (para.segs.length === 0) { h += size * 0.5; continue; }
      const indent = para.bullet ? 11 : 0;
      setFont(size, "normal");
      const text = para.segs.map((sg) => sg.text).join("");
      const lines = pdf.splitTextToSize(text, width - indent).length;
      h += lines * lineH + size * 0.28;
    }
    return h;
  };

  /** Sage-accent section title (brand style shared with visit PDFs). */
  const sectionTitle = (title: string, x: number, o: { color?: readonly number[] } = {}) => {
    ensure(30);
    y += 4;
    fill(C.darkSage);
    pdf.rect(x, y + 1, 3, 10, "F");
    setFont(9.5, "bold", o.color || C.ink);
    pdf.text(title.toUpperCase(), x + 8, y + 9.5, { charSpace: 0.6 });
    y += 17;
  };

  const chipRow = (items: string[], x: number, width: number) => {
    setFont(8, "bold", C.ink);
    let cx = x;
    const chipH = 14;
    for (const item of items) {
      setFont(8, "bold", C.ink);
      const w = pdf.getTextWidth(item) + 12;
      if (cx + w > x + width) { cx = x; y += chipH + 4; }
      ensure(chipH + 2);
      stroke(C.rule);
      fill(C.cream);
      pdf.roundedRect(cx, y, w, chipH, 6.5, 6.5, "FD");
      setFont(8, "bold", C.ink);
      pdf.text(item, cx + 6, y + 9.7);
      cx += w + 5;
    }
    y += chipH + 5;
  };

  // ════════════════════════════════════════════════════════════════════
  // PAGE 1 — header band + pricing options
  // ════════════════════════════════════════════════════════════════════

  const fmtDate = (d: string): string => {
    const m = String(d || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return d || "—";
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
      .toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  };

  const headerBandH = 118;
  fill(C.sage);
  pdf.rect(0, 0, PAGE_W, headerBandH, "F");
  fill(C.darkSage);
  pdf.rect(0, headerBandH - 2.5, PAGE_W, 2.5, "F");

  const logoH = 44;
  const logoW = drawLogo(MARGIN, 16, logoH);
  const titleX = MARGIN + (logoW ? logoW + 16 : 0);
  setFont(23, "bold", C.ink);
  pdf.text(data.title || "Proposal", titleX, 40);
  setFont(8.5, "normal", C.soft);
  const subBits = [
    `Prepared ${fmtDate(data.serviceDate) !== "—" ? fmtDate(data.serviceDate) : new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}`,
    data.reportNumber || "",
  ].filter(Boolean);
  pdf.text(subBits.join("   •   "), titleX, 55);

  // Info columns inside the band.
  const colDefs: { title: string; rows: [string, string][] }[] = [
    {
      title: "Customer",
      rows: ([
        ["Name", data.customerName],
        ["Address", data.address],
        ["FR ID", data.fieldroutesId || ""],
      ] as [string, string][]).filter(([, v]) => !!v),
    },
    {
      title: "Property",
      rows: ([
        ["Date", fmtDate(data.serviceDate)],
        ["Type", data.propertyType || ""],
        ["Company", data.propertyType !== "Residential" ? data.companyName || "" : ""],
      ] as [string, string][]).filter(([, v]) => !!v && v !== "—"),
    },
    {
      title: "Technician",
      rows: ([
        ["Name", data.technicianName],
        ["License", data.licenseNumber || ""],
      ] as [string, string][]).filter(([, v]) => !!v),
    },
  ];
  const colW = (CONTENT_W - 40) / 3;
  colDefs.forEach((col, i) => {
    const x = MARGIN + i * (colW + 20);
    let cy = 74;
    setFont(7.5, "bold", C.soft);
    pdf.text(col.title.toUpperCase(), x, cy, { charSpace: 0.8 });
    cy += 4;
    fill(C.darkSage);
    pdf.rect(x, cy, colW, 0.75, "F");
    cy += 9;
    for (const [label, value] of col.rows) {
      setFont(7.5, "normal", C.soft);
      pdf.text(`${label}:`, x, cy);
      setFont(8.5, "bold", C.ink);
      const lines: string[] = pdf.splitTextToSize(String(value), colW - 42);
      lines.slice(0, 2).forEach((ln, li) => pdf.text(ln, x + 42, cy + li * 10));
      cy += Math.min(lines.length, 2) * 10;
    }
  });

  y = headerBandH + 16;

  // ── Pricing option cards ──

  const money = (n: number) => `$${Math.round(n).toLocaleString()}`;

  const drawOptionCard = (opt: SalesPdfOption) => {
    const services = opt.services.filter((s) => s.serviceType);
    const rows = services.length > 0 ? services : opt.services;

    // Column layout: Service | Initial | Recurring | Frequency | Schedule
    const cw = {
      service: CONTENT_W * 0.24,
      initial: CONTENT_W * 0.09,
      recurring: CONTENT_W * 0.10,
      freq: CONTENT_W * 0.12,
      schedule: CONTENT_W * 0.45,
    };
    const colX = {
      service: MARGIN + 10,
      initial: MARGIN + cw.service,
      recurring: MARGIN + cw.service + cw.initial,
      freq: MARGIN + cw.service + cw.initial + cw.recurring,
      schedule: MARGIN + cw.service + cw.initial + cw.recurring + cw.freq,
    };

    const chipH = 12;
    const rowHeights = rows.map((r) => {
      setFont(9, "bold");
      const nameLines = pdf.splitTextToSize(r.serviceType || "—", cw.service - 16).length;
      let chipRows = 1;
      if (r.scheduleChips.length > 0) {
        setFont(6.8, "bold");
        let cx = 0;
        chipRows = 1;
        for (const chip of r.scheduleChips) {
          const w = pdf.getTextWidth(chip) + 10;
          if (cx + w > cw.schedule - 14) { chipRows += 1; cx = 0; }
          cx += w + 4;
        }
      }
      return Math.max(nameLines * 11 + 11, chipRows * (chipH + 3) + 9, 22);
    });

    const barH = 22;
    const headH = 16;
    const totalH = 20;
    const cardH = barH + headH + rowHeights.reduce((a, b) => a + b, 0) + totalH;
    // Keep the whole card together when it fits on one page.
    if (cardH < BOTTOM - MARGIN && y + cardH > BOTTOM) newPage();

    const cardTop = y;

    // Option name bar.
    fill(C.bar);
    pdf.roundedRect(MARGIN, y, CONTENT_W, barH, 5, 5, "F");
    fill(C.bar);
    pdf.rect(MARGIN, y + barH - 6, CONTENT_W, 6, "F");
    let pillW = 0;
    if (opt.recommended) {
      const label = "RECOMMENDED";
      const cs = 0.7;
      setFont(7.5, "bold", C.ink);
      const textW = pdf.getTextWidth(label) + cs * (label.length - 1);
      const starR = 4.2;
      pillW = 7 + starR * 2 + 5 + textW + 8;
      const pillX = MARGIN + CONTENT_W - pillW - 8;
      fill(C.sage);
      pdf.roundedRect(pillX, y + 4.5, pillW, 13, 6.5, 6.5, "F");
      drawStar(pdf, pillX + 7 + starR, y + 11, starR, C.ink);
      setFont(7.5, "bold", C.ink);
      pdf.text(label, pillX + 7 + starR * 2 + 5, y + 13.6, { charSpace: cs });
    }
    setFont(11.5, "bold", C.white);
    const nameMax = CONTENT_W - 24 - (pillW ? pillW + 20 : 0);
    pdf.text(pdf.splitTextToSize(opt.name, nameMax)[0], MARGIN + 12, y + 15, { charSpace: 0.3 });
    y += barH;

    // Column headers.
    fill(C.sage);
    pdf.rect(MARGIN, y, CONTENT_W, headH, "F");
    setFont(7, "bold", C.ink);
    pdf.text("SERVICE", colX.service, y + 11, { charSpace: 0.7 });
    pdf.text("INITIAL", colX.initial + cw.initial / 2, y + 11, { align: "center", charSpace: 0.7 });
    pdf.text(opt.recurringLabel.toUpperCase(), colX.recurring + cw.recurring / 2, y + 11, { align: "center", charSpace: 0.7 });
    pdf.text("FREQUENCY", colX.freq + cw.freq / 2, y + 11, { align: "center", charSpace: 0.7 });
    pdf.text("SCHEDULE", colX.schedule + 4, y + 11, { charSpace: 0.7 });
    y += headH;

    // Rows.
    rows.forEach((r, i) => {
      const rh = rowHeights[i];
      if (y + rh > BOTTOM) {
        // Card taller than the page — continue on the next page.
        newPage();
      }
      if (i % 2 === 1) {
        fill(C.sageTint);
        pdf.rect(MARGIN, y, CONTENT_W, rh, "F");
      }
      const baseline = y + 14;
      setFont(9, "bold", C.ink);
      const nameLines: string[] = pdf.splitTextToSize(r.serviceType || "—", cw.service - 16);
      nameLines.forEach((ln, li) => pdf.text(ln, colX.service, baseline + li * 11));
      setFont(9.5, "bold", C.ink);
      pdf.text(money(r.initial), colX.initial + cw.initial / 2, baseline, { align: "center" });
      pdf.text(money(r.recurring), colX.recurring + cw.recurring / 2, baseline, { align: "center" });
      setFont(8.5, "normal", C.soft);
      pdf.text(r.frequencyLabel || "—", colX.freq + cw.freq / 2, baseline, { align: "center" });

      if (r.scheduleChips.length === 0) {
        setFont(8.5, "italic", C.muted);
        pdf.text("One-time", colX.schedule + 4, baseline);
      } else {
        let cx = colX.schedule + 4;
        let cy = y + 5;
        setFont(6.8, "bold");
        for (let ci = 0; ci < r.scheduleChips.length; ci++) {
          const chip = r.scheduleChips[ci];
          const w = pdf.getTextWidth(chip) + 10;
          if (cx + w > colX.schedule + cw.schedule - 10) { cx = colX.schedule + 4; cy += chipH + 3; }
          if (ci === 0) {
            fill(C.darkSage);
            pdf.roundedRect(cx, cy, w, chipH, 3, 3, "F");
            setFont(6.8, "bold", C.white);
          } else if (chip.includes("Follow-Up")) {
            // 30-day follow-up chip: sage outline so it reads as a planned
            // extra visit rather than a regular recurring service.
            fill(C.sage);
            pdf.roundedRect(cx, cy, w, chipH, 3, 3, "F");
            stroke(C.darkSage);
            pdf.setLineWidth(0.8);
            pdf.roundedRect(cx, cy, w, chipH, 3, 3, "S");
            setFont(6.8, "bold", C.ink);
          } else {
            fill(C.chip);
            pdf.roundedRect(cx, cy, w, chipH, 3, 3, "F");
            setFont(6.8, "bold", C.soft);
          }
          pdf.text(chip, cx + 5, cy + 8.6);
          cx += w + 4;
        }
      }
      y += rh;
      stroke(C.rule);
      pdf.setLineWidth(0.5);
      pdf.line(MARGIN, y, MARGIN + CONTENT_W, y);
    });

    // Totals.
    const ti = rows.reduce((a, r) => a + r.initial, 0);
    const tr = rows.reduce((a, r) => a + r.recurring, 0);
    stroke(C.ink);
    pdf.setLineWidth(1.2);
    pdf.line(MARGIN, y, MARGIN + CONTENT_W, y);
    pdf.setLineWidth(0.5);
    setFont(9, "bold", C.ink);
    pdf.text("Total:", colX.initial - 10, y + 13.5, { align: "right" });
    setFont(10, "bold", C.ink);
    pdf.text(money(ti), colX.initial + cw.initial / 2, y + 13.5, { align: "center" });
    pdf.text(money(tr), colX.recurring + cw.recurring / 2, y + 13.5, { align: "center" });
    y += totalH;

    // Card outline (only when the card didn't page-break).
    if (y - cardTop <= cardH + 1) {
      stroke(opt.recommended ? C.darkSage : C.rule);
      pdf.setLineWidth(opt.recommended ? 1.4 : 0.75);
      pdf.roundedRect(MARGIN, cardTop, CONTENT_W, y - cardTop, 5, 5, "S");
      pdf.setLineWidth(0.5);
    }
    y += 12;
  };

  data.options.forEach(drawOptionCard);

  // ── Scheduling / Products / Pesticide notice row + Crest Guarantee ──
  // The Crest Guarantee band should land on page 1 whenever possible. The
  // products list is usually the tallest column, so we pick a layout by
  // MEASURING: (A) the classic side-by-side row, shrinking product type down
  // to a 5.4pt floor; then (B) a stacked layout where scheduling collapses to
  // one inline row and products spread into three wider columns; and only if
  // neither fits does the band draw first, with the row after it.

  const sched = data.scheduling;
  const schedItems: [string, string][] = !sched
    ? []
    : ([
        ["Preferred Day", sched.day || ""],
        ["Preferred Time", sched.time || ""],
        ["Point of Contact", sched.contact || ""],
        ["Phone", sched.phone || ""],
      ] as [string, string][]).filter(([, v]) => v.trim() && v.trim() !== "-");
  const hasSched = schedItems.length > 0;

  ensure(120);
  let rowTop = y;
  const gutter = 14;

  const drawGuaranteeBand = () => {
    ensure(40 + (data.fourWeekCycleNote ? 22 : 0) + 22);
    const bandH = 40;
    stroke(C.rule);
    fill(C.sageTint);
    pdf.roundedRect(MARGIN, y, CONTENT_W, bandH, 6, 6, "FD");
    const bugH = 22;
    const bugW = bugH * bugAspect;
    if (bugPng) pdf.addImage(bugPng, "PNG", MARGIN + 14, y + (bandH - bugH) / 2, bugW, bugH);
    if (bugPng) pdf.addImage(bugPng, "PNG", MARGIN + CONTENT_W - 14 - bugW, y + (bandH - bugH) / 2, bugW, bugH);
    const gtextX = MARGIN + 14 + bugW + 12;
    const gtextW = CONTENT_W - 2 * (14 + bugW + 12);
    setFont(9, "bold", C.ink);
    const guaranteeIntro = "The Crest Guarantee:  ";
    const gLines: string[] = pdf.splitTextToSize(guaranteeIntro + CREST_GUARANTEE, gtextW);
    const gBlockH = gLines.length * 11;
    let gy = y + (bandH - gBlockH) / 2 + 8;
    gLines.forEach((ln, i) => {
      if (i === 0 && ln.startsWith(guaranteeIntro.trim())) {
        setFont(9, "bold", C.ink);
        pdf.text("The Crest Guarantee:", gtextX + gtextW / 2 - pdf.getTextWidth(ln) / 2, gy);
        setFont(9, "normal", C.ink);
        pdf.text(ln.slice("The Crest Guarantee:".length), gtextX + gtextW / 2 - pdf.getTextWidth(ln) / 2 + pdf.getTextWidth("The Crest Guarantee:") + 2, gy);
      } else {
        setFont(9, "normal", C.ink);
        pdf.text(ln, gtextX + gtextW / 2, gy, { align: "center" });
      }
      gy += 11;
    });
    y += bandH + 8;
    if (data.fourWeekCycleNote) {
      writeText(FOUR_WEEK_NOTE, MARGIN + 40, CONTENT_W - 80, 7.2, { style: "italic", color: C.muted, align: "center", lineH: 9 });
      y += 2;
    }
    writeText(LIABILITY_NOTE, MARGIN + 40, CONTENT_W - 80, 7.6, { style: "italic", color: C.muted, align: "center", lineH: 9.4 });
  };

  // Geometry for both layouts.
  const schedColW = hasSched ? CONTENT_W * 0.22 : 0;
  const prodColW = CONTENT_W * (hasSched ? 0.30 : 0.38);
  const prodWideW = CONTENT_W * 0.52 + (hasSched ? gutter : 0);
  const noticeWa = CONTENT_W - schedColW - prodColW - gutter * (hasSched ? 2 : 1);
  const noticeWb = CONTENT_W - prodWideW - gutter;

  const productLabel = (p: { name: string; chemical?: string }) =>
    p.chemical ? `${p.name} (${p.chemical})` : p.name;
  const productCols = (nCols: number) => {
    const per = Math.ceil(data.products.length / nCols);
    return Array.from({ length: nCols }, (_, i) => data.products.slice(i * per, (i + 1) * per));
  };
  const measureProducts = (size: number, step: number, nCols: number, regionW: number): number => {
    const colW = (regionW - (nCols - 1) * 10) / nCols;
    setFont(size, "normal", C.soft);
    return Math.max(
      0,
      ...productCols(nCols).map((col) =>
        col.reduce((a, p) => a + (pdf.splitTextToSize(productLabel(p), colW) as string[]).length * step + 1.2, 0),
      ),
    );
  };
  const measureNotice = (w: number): number => {
    setFont(6.4, "normal", C.muted);
    const n1 = (pdf.splitTextToSize(PESTICIDE_NOTICE, w) as string[]).length;
    setFont(6.4, "bold", C.soft);
    const n2 = (pdf.splitTextToSize(PESTICIDE_CONTACTS, w) as string[]).length;
    return 21 + n1 * 7.6 + 2 + n2 * 7.6;
  };

  const PRODUCT_SIZES: [number, number][] = [[6.6, 8], [6.2, 7.5], [5.8, 7], [5.4, 6.6]];
  const bandBlockH = 12 + 40 + 8 + (data.fourWeekCycleNote ? 20 : 0) + 12;
  const schedColH = hasSched ? 21 + schedItems.length * 13 : 0;
  // Stacked mode puts the sched label/value pairs ON the section-title row
  // (wrapping below it only when they run long) — measure that packing.
  const schedPairWidths = schedItems.map(([l, v]) => {
    setFont(7.5, "normal", C.muted);
    const lw = pdf.getTextWidth(`${l}: `);
    setFont(9, "bold", C.ink);
    return lw + pdf.getTextWidth(v);
  });
  setFont(9.5, "bold", C.ink);
  const schedTitleEnd = MARGIN + 8 + pdf.getTextWidth("SCHEDULING & COMMUNICATION") + 0.6 * 25 + 18;
  const packSchedLines = (): number => {
    let ix = schedTitleEnd;
    let lines = 0;
    for (const w of schedPairWidths) {
      if (ix + w > MARGIN + prodWideW && ix > (lines === 0 ? schedTitleEnd : MARGIN)) {
        lines++;
        ix = MARGIN;
      }
      ix += w + 20;
    }
    return lines;
  };
  const schedInlineH = hasSched ? 21 + packSchedLines() * 13 : 0;
  const noticeHa = measureNotice(noticeWa);
  const noticeHb = measureNotice(noticeWb);
  const roomBelowCards = BOTTOM - rowTop;

  interface RowPlan { mode: "side" | "stacked"; size: number; step: number; bandBelow: boolean }
  // Larger type beats layout: at each size, try the classic side-by-side row
  // first, then the stacked wide-products variant, before shrinking further.
  let plan: RowPlan | null = null;
  for (const [s, st] of PRODUCT_SIZES) {
    const sideH = Math.max(schedColH, 21 + measureProducts(s, st, 2, prodColW), noticeHa);
    if (sideH + bandBlockH <= roomBelowCards) { plan = { mode: "side", size: s, step: st, bandBelow: true }; break; }
    const stackedH = Math.max(schedInlineH + 21 + measureProducts(s, st, 3, prodWideW), noticeHb);
    if (stackedH + bandBlockH <= roomBelowCards) { plan = { mode: "stacked", size: s, step: st, bandBelow: true }; break; }
  }
  if (!plan) {
    // Nothing fits with the band below — keep the band on this page by
    // drawing it right after the pricing, then place the row after it at the
    // largest size that fits the remaining space (or a fresh page at 6.6).
    drawGuaranteeBand();
    y += 6;
    rowTop = y;
    for (const [s, st] of PRODUCT_SIZES) {
      const rowH = Math.max(schedInlineH + 21 + measureProducts(s, st, 3, prodWideW), noticeHb);
      if (rowTop + rowH <= BOTTOM) { plan = { mode: "stacked", size: s, step: st, bandBelow: false }; break; }
    }
    if (!plan) {
      plan = { mode: "stacked", size: 6.6, step: 8, bandBelow: false };
      newPage();
      rowTop = y;
    }
  }

  let maxColBottom = rowTop;
  const columnBlock = (x: number, title: string, body: () => void) => {
    y = rowTop;
    sectionTitle(title, x);
    body();
    maxColBottom = Math.max(maxColBottom, y);
  };

  const renderProductCols = (x: number, regionW: number, nCols: number, size: number, step: number) => {
    const colW = (regionW - (nCols - 1) * 10) / nCols;
    const startY = y;
    let bottomY = y;
    productCols(nCols).forEach((col, ci) => {
      y = startY;
      const cx = x + ci * (colW + 10);
      for (const p of col) {
        setFont(size, "normal", C.soft);
        const lines: string[] = pdf.splitTextToSize(productLabel(p), colW);
        lines.forEach((ln, li) => pdf.text(ln, cx, y + step * 0.78 + li * step));
        y += lines.length * step + 1.2;
      }
      bottomY = Math.max(bottomY, y);
    });
    y = bottomY;
  };

  const renderNotice = (x: number, w: number) => {
    setFont(6.4, "normal", C.muted);
    const lines: string[] = pdf.splitTextToSize(PESTICIDE_NOTICE, w);
    lines.forEach((ln) => { pdf.text(ln, x, y + 6); y += 7.6; });
    y += 2;
    setFont(6.4, "bold", C.soft);
    const lines2: string[] = pdf.splitTextToSize(PESTICIDE_CONTACTS, w);
    lines2.forEach((ln) => { pdf.text(ln, x, y + 6); y += 7.6; });
  };

  if (plan.mode === "side") {
    if (hasSched) {
      columnBlock(MARGIN, "Scheduling & Communication", () => {
        for (const [label, value] of schedItems) {
          setFont(7.5, "normal", C.muted);
          pdf.text(`${label}:`, MARGIN, y + 8);
          setFont(9, "bold", C.ink);
          pdf.text(value, MARGIN + 68, y + 8);
          y += 13;
        }
      });
    }
    const prodX = MARGIN + schedColW + (hasSched ? gutter : 0);
    columnBlock(prodX, "Products", () => renderProductCols(prodX, prodColW, 2, plan!.size, plan!.step));
    const noticeX = prodX + prodColW + gutter;
    columnBlock(noticeX, "Pesticide Notice", () => renderNotice(noticeX, noticeWa));
  } else {
    columnBlock(MARGIN, hasSched ? "Scheduling & Communication" : "Products", () => {
      if (hasSched) {
        // Label/value pairs share the section-title row to save height,
        // wrapping to lines below only when they run long.
        let ix = schedTitleEnd;
        let extraLines = 0;
        for (let i = 0; i < schedItems.length; i++) {
          const [label, value] = schedItems[i];
          if (ix + schedPairWidths[i] > MARGIN + prodWideW && ix > (extraLines === 0 ? schedTitleEnd : MARGIN)) {
            extraLines++;
            ix = MARGIN;
          }
          const by = y - 7.5 + extraLines * 13;
          setFont(7.5, "normal", C.muted);
          pdf.text(`${label}:`, ix, by);
          const lw = pdf.getTextWidth(`${label}: `);
          setFont(9, "bold", C.ink);
          pdf.text(value, ix + lw, by);
          ix += schedPairWidths[i] + 20;
        }
        y += extraLines * 13;
        sectionTitle("Products", MARGIN);
      }
      renderProductCols(MARGIN, prodWideW, 3, plan!.size, plan!.step);
    });
    const noticeX = MARGIN + prodWideW + gutter;
    columnBlock(noticeX, "Pesticide Notice", () => renderNotice(noticeX, noticeWb));
  }

  y = maxColBottom + 12;
  if (plan.bandBelow) drawGuaranteeBand();

  // ════════════════════════════════════════════════════════════════════
  // OPTION DETAIL PAGES — map + proposed services per option
  // ════════════════════════════════════════════════════════════════════

  data.options.forEach((opt, oi) => {
    pdf.addPage();
    y = MARGIN;

    // Header band.
    const obandH = 34;
    fill(C.sage);
    pdf.rect(0, 0, PAGE_W, obandH + 14, "F");
    fill(C.darkSage);
    pdf.rect(0, obandH + 14 - 2, PAGE_W, 2, "F");
    const oLogoH = 24;
    const oLogoW = drawLogo(MARGIN, 11, oLogoH);
    setFont(13.5, "bold", C.ink);
    const oTitleMax = CONTENT_W - oLogoW - 12 - 130;
    pdf.text(pdf.splitTextToSize(`Property Map & Details — ${opt.name}`, oTitleMax)[0], MARGIN + oLogoW + 12, 30);
    setFont(8.5, "normal", C.soft);
    pdf.text(data.customerName || "", PAGE_W - MARGIN, 30, { align: "right" });
    y = obandH + 14 + 14;

    const map = mapLoads[oi];
    const hasMap = !!map;
    const leftW = 252;
    const gap = 18;
    const colX = hasMap ? MARGIN + leftW + gap : MARGIN;
    const colW = hasMap ? CONTENT_W - leftW - gap : CONTENT_W;
    const colTop = y;

    if (map) {
      // 3:4 map with border, like the on-screen card.
      const mapH = Math.min(leftW * (4 / 3), BOTTOM - y - 4);
      const url = jpegForBox(map, leftW, mapH, "cover", quality, px);
      pdf.addImage(url, "JPEG", MARGIN, y, leftW, mapH);
      stroke(C.darkSage);
      pdf.setLineWidth(1.2);
      pdf.roundedRect(MARGIN, y, leftW, mapH, 4, 4, "S");
      pdf.setLineWidth(0.5);
      setFont(6.8, "normal", C.faint);
      pdf.text("Property map", MARGIN + 2, y + mapH + 8);
    }

    // Right column flow. When it outgrows the page, continue full-width.
    const optionFirstPage = pdf.getNumberOfPages();
    let flowX = colX;
    let flowW = colW;
    y = colTop;
    const colEnsure = (h: number) => {
      if (y + h > BOTTOM) {
        newPage();
        flowX = MARGIN;
        flowW = CONTENT_W;
      }
    };
    // Move a whole section to the next page when it would otherwise straddle
    // the break (capped at one full page so huge sections still flow).
    const keepTogether = (estH: number) => colEnsure(Math.min(estH, BOTTOM - MARGIN - 4));
    const colTitle = (t: string) => {
      colEnsure(30);
      y += 4;
      fill(C.darkSage);
      pdf.rect(flowX, y + 1, 3, 10, "F");
      setFont(9.5, "bold", C.ink);
      pdf.text(t.toUpperCase(), flowX + 8, y + 9.5, { charSpace: 0.6 });
      y += 17;
    };

    // Mini pricing summary.
    const services = opt.services.filter((s) => s.serviceType);
    if (services.length > 0) {
      colTitle(`Pricing — ${opt.name}`);
      const c1 = flowW * 0.42;
      const c2 = flowW * 0.17;
      const c3 = flowW * 0.20;
      colEnsure(15 + services.length * 14 + 16);
      fill(C.sage);
      pdf.rect(flowX, y, flowW, 13, "F");
      setFont(6.8, "bold", C.ink);
      pdf.text("SERVICE", flowX + 6, y + 9, { charSpace: 0.6 });
      pdf.text("INITIAL", flowX + c1 + c2 / 2, y + 9, { align: "center", charSpace: 0.6 });
      pdf.text(opt.recurringLabel.toUpperCase(), flowX + c1 + c2 + c3 / 2, y + 9, { align: "center", charSpace: 0.6 });
      pdf.text("FREQUENCY", flowX + c1 + c2 + c3 + (flowW - c1 - c2 - c3) / 2, y + 9, { align: "center", charSpace: 0.6 });
      y += 13;
      services.forEach((s, si) => {
        const rh = 14;
        colEnsure(rh);
        if (si % 2 === 1) { fill(C.sageTint); pdf.rect(flowX, y, flowW, rh, "F"); }
        setFont(8, "normal", C.ink);
        pdf.text(pdf.splitTextToSize(s.serviceType, c1 - 10)[0], flowX + 6, y + 9.6);
        setFont(8.5, "bold", C.ink);
        pdf.text(money(s.initial), flowX + c1 + c2 / 2, y + 9.6, { align: "center" });
        pdf.text(money(s.recurring), flowX + c1 + c2 + c3 / 2, y + 9.6, { align: "center" });
        setFont(7.6, "normal", C.soft);
        pdf.text(s.frequencyLabel || "One-time", flowX + c1 + c2 + c3 + (flowW - c1 - c2 - c3) / 2, y + 9.6, { align: "center" });
        y += rh;
        stroke(C.rule);
        pdf.line(flowX, y, flowX + flowW, y);
      });
      const ti = services.reduce((a, s) => a + s.initial, 0);
      const tr = services.reduce((a, s) => a + s.recurring, 0);
      colEnsure(16);
      stroke(C.ink);
      pdf.setLineWidth(1);
      pdf.line(flowX, y, flowX + flowW, y);
      pdf.setLineWidth(0.5);
      setFont(8, "bold", C.ink);
      pdf.text("Total:", flowX + c1 - 4, y + 11, { align: "right" });
      setFont(9, "bold", C.ink);
      pdf.text(money(ti), flowX + c1 + c2 / 2, y + 11, { align: "center" });
      pdf.text(money(tr), flowX + c1 + c2 + c3 / 2, y + 11, { align: "center" });
      y += 18;
    }

    // Proposed services.
    const servicesParas = parseRichHtml(opt.servicesHtml || "");
    if (servicesParas.length > 0) {
      keepTogether(21 + measureRich(servicesParas, flowW, 8.6));
      colTitle(`Proposed Services — ${opt.name}`);
      writeRich(servicesParas, flowX, flowW, 8.6);
      y += 4;
    }

    // Guarantee boxes.
    for (const box of opt.guaranteeBoxes) {
      const paras = parseRichHtml(box.html || "");
      if (paras.length === 0) continue;
      keepTogether(measureRich(paras, flowW - 20, 8.2) + 26);
      const boxTop = y;
      colTitle(box.title || "Guarantee & Warranty");
      const innerTop = y;
      writeRich(paras, flowX + 10, flowW - 20, 8.2, { color: C.soft });
      if (y > innerTop && boxTop < y) {
        stroke(C.darkSage);
        pdf.setLineWidth(1);
        pdf.line(flowX + 2, innerTop - 2, flowX + 2, Math.min(y - 2, BOTTOM));
        pdf.setLineWidth(0.5);
      }
      y += 4;
    }

    // Target pests.
    if (opt.targetPests.length > 0) {
      keepTogether(21 + 22 * Math.ceil(opt.targetPests.length / 6));
      colTitle(`Target Pests — ${opt.name}`);
      // chipRow uses global ensure; temporarily emulate with colEnsure via width
      const startX = flowX;
      let cx = startX;
      const chipH2 = 14;
      colEnsure(chipH2 + 4);
      for (const pest of opt.targetPests) {
        setFont(8, "bold", C.ink);
        const w = pdf.getTextWidth(pest) + 12;
        if (cx + w > flowX + flowW) { cx = flowX; y += chipH2 + 4; colEnsure(chipH2 + 2); }
        stroke(C.rule);
        fill(C.sageTint);
        pdf.roundedRect(cx, y, w, chipH2, 6.5, 6.5, "FD");
        setFont(8, "bold", C.ink);
        pdf.text(pest, cx + 6, y + 9.7);
        cx += w + 5;
      }
      y += chipH2 + 8;
    }

    // Additional details.
    const detailParas = parseRichHtml(opt.additionalDetailsHtml || "");
    if (detailParas.length > 0) {
      keepTogether(21 + measureRich(detailParas, flowW, 8.4));
      colTitle("Additional Details");
      writeRich(detailParas, flowX, flowW, 8.4, { color: C.soft });
      y += 4;
    }

    // Setup materials.
    if (opt.setupMaterials.length > 0) {
      keepTogether(21 + opt.setupMaterials.length * 12);
      colTitle("Setup Materials");
      for (const mat of opt.setupMaterials) {
        colEnsure(12);
        setFont(8.4, "normal", C.ink);
        pdf.text(`${mat.name}`, flowX + 2, y + 8);
        setFont(8.4, "bold", C.ink);
        pdf.text(`× ${mat.quantity}`, flowX + flowW - 2, y + 8, { align: "right" });
        y += 12;
      }
      y += 4;
    }

    // Limitations & exclusions.
    if (opt.exclusions.length > 0) {
      const exParas = opt.exclusions.map((ex) =>
        parseRichHtml(`<b>${ex.label}:</b> ${ex.text.replace(new RegExp(`^${ex.label}\\s*:\\s*`), "")}`),
      );
      keepTogether(21 + exParas.reduce((a, p) => a + measureRich(p, flowW, 7.6), 0));
      colTitle("Limitations & Exclusions");
      for (const paras of exParas) {
        keepTogether(measureRich(paras, flowW, 7.6));
        writeRich(paras, flowX, flowW, 7.6, { color: C.soft });
      }
      y += 2;
    }

    if (opt.invoiceNote) {
      colEnsure(16);
      writeText(opt.invoiceNote, flowX, flowW, 7.8, { style: "italic", color: C.muted });
      y += 2;
    }

    // Signature block — under the map when there's room, else in the flow.
    const sig = sigLoads[oi];
    const sigH = 58;
    const mapBottom = hasMap ? colTop + Math.min(leftW * (4 / 3), BOTTOM - colTop - 4) + 14 : 0;
    // Only anchor under the map while we're still on the option's first page —
    // if the flow spilled to a continuation page there is no map there.
    const underMapRoom = hasMap && pdf.getNumberOfPages() === optionFirstPage && mapBottom + sigH <= BOTTOM;
    const sigX = underMapRoom ? MARGIN : flowX;
    const sigW = underMapRoom ? leftW : Math.min(flowW, 300);
    let sy: number;
    if (underMapRoom) {
      sy = mapBottom;
    } else {
      colEnsure(sigH + 8);
      sy = y;
      y += sigH + 8;
    }
    stroke(C.rule);
    fill(C.cream);
    pdf.roundedRect(sigX, sy, sigW, sigH, 5, 5, "FD");
    setFont(7, "bold", C.soft);
    pdf.text(`ACCEPT ${String(opt.name || "").toUpperCase()}`, sigX + 8, sy + 12, { charSpace: 0.7 });
    if (sig) {
      const boxW2 = sigW - 16;
      const boxH2 = 26;
      pdf.addImage(jpegForBox(sig, boxW2, boxH2, "contain", 0.9, 3), "JPEG", sigX + 8, sy + 16, boxW2, boxH2);
    } else {
      stroke(C.faint);
      pdf.setLineWidth(0.75);
      pdf.line(sigX + 8, sy + 34, sigX + sigW - 8, sy + 34);
      pdf.setLineWidth(0.5);
      setFont(6.5, "normal", C.faint);
      pdf.text("Customer signature", sigX + 8, sy + 41);
    }
    setFont(7.4, "normal", C.soft);
    const printLine = `Print: ${data.customerName || "________________"}`;
    const dateLine = sig
      ? `Date: ${new Date().toLocaleDateString()}`
      : "Date: ______________";
    pdf.text(printLine, sigX + 8, sy + sigH - 7);
    pdf.text(dateLine, sigX + sigW - 8, sy + sigH - 7, { align: "right" });
  });

  // ════════════════════════════════════════════════════════════════════
  // PROPERTY IMAGES PAGE(S)
  // ════════════════════════════════════════════════════════════════════

  const goodPhotos = data.propertyImages
    .map((p, i) => ({ meta: p, img: photoLoads[i] }))
    .filter((p) => !!p.img) as { meta: { image: string; caption?: string }; img: Loaded }[];

  if (goodPhotos.length > 0) {
    pdf.addPage();
    y = MARGIN;
    const ibandH = 34;
    fill(C.sage);
    pdf.rect(0, 0, PAGE_W, ibandH + 14, "F");
    fill(C.darkSage);
    pdf.rect(0, ibandH + 14 - 2, PAGE_W, 2, "F");
    const iLogoW = drawLogo(MARGIN, 11, 24);
    setFont(13.5, "bold", C.ink);
    pdf.text("Property Images", MARGIN + iLogoW + 12, 30);
    setFont(8.5, "normal", C.soft);
    pdf.text(data.customerName || "", PAGE_W - MARGIN, 30, { align: "right" });
    y = ibandH + 14 + 16;

    const perRow = 4;
    const gap2 = 12;
    const cellW = (CONTENT_W - (perRow - 1) * gap2) / perRow;
    const cellH = cellW * 0.75;
    const capH = 16;

    for (let r = 0; r < goodPhotos.length; r += perRow) {
      const row = goodPhotos.slice(r, r + perRow);
      const hasCaption = row.some((p) => (p.meta.caption || "").trim());
      const blockH = cellH + (hasCaption ? capH : 4) + 8;
      if (y + blockH > BOTTOM) { newPage(); }
      let x = MARGIN;
      for (const p of row) {
        pdf.addImage(jpegForBox(p.img, cellW, cellH, "cover", quality, px), "JPEG", x, y, cellW, cellH);
        stroke(C.rule);
        pdf.roundedRect(x, y, cellW, cellH, 3, 3, "S");
        const cap = (p.meta.caption || "").trim();
        if (cap) {
          setFont(7.6, "normal", C.soft);
          const capLines: string[] = pdf.splitTextToSize(cap, cellW);
          pdf.text(capLines[0] + (capLines.length > 1 ? "…" : ""), x + 1, y + cellH + 10);
        }
        x += cellW + gap2;
      }
      y += blockH;
    }
  }

  // ── Footers ──
  const pageCount = pdf.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    pdf.setPage(i);
    setFont(7, "normal", C.faint);
    const footerLeft = [data.customerName, data.address].filter(Boolean).join("  •  ");
    pdf.text(footerLeft || "Crest Pest Control", MARGIN, PAGE_H - 16);
    pdf.text(`Page ${i} of ${pageCount}`, PAGE_W - MARGIN, PAGE_H - 16, { align: "right" });
  }

  // Free object URLs.
  [...mapLoads, ...photoLoads, ...sigLoads, logo, bug].forEach((p) => p?.revoke?.());

  const contentBytes = new Uint8Array(pdf.output("arraybuffer") as ArrayBuffer);
  if (!opts.fullTemplate) return contentBytes;
  return await wrapInProposalTemplate(contentBytes, data);
}

// ─── Full-proposal template merge (cover + marketing pages) ─────────────

const TEMPLATE_PDF_URL = "/proposal-template.pdf";

async function wrapInProposalTemplate(contentBytes: Uint8Array, data: SalesProposalPdfData): Promise<Uint8Array> {
  const templateBytes = await fetch(TEMPLATE_PDF_URL).then((r) => r.arrayBuffer());
  const templateDoc = await PDFDocument.load(templateBytes);
  const contentDoc = await PDFDocument.load(contentBytes);
  const outDoc = await PDFDocument.create();
  const helvetica = await outDoc.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await outDoc.embedFont(StandardFonts.HelveticaBold);

  const [coverPage] = await outDoc.copyPages(templateDoc, [0]);
  if (data.customerName)
    coverPage.drawText(data.customerName, { x: 42, y: 326, size: 24, font: helveticaBold, color: rgb(1, 1, 1) });
  if (data.address)
    coverPage.drawText(data.address, { x: 42, y: 298, size: 14, font: helvetica, color: rgb(0.85, 0.85, 0.85) });
  if (data.technicianName)
    coverPage.drawText(data.technicianName, { x: 42, y: 128, size: 14, font: helveticaBold, color: rgb(0.2, 0.2, 0.2) });
  outDoc.addPage(coverPage);

  const contentPages = await outDoc.copyPages(contentDoc, contentDoc.getPageIndices());
  contentPages.forEach((p) => outDoc.addPage(p));

  const marketingPages = await outDoc.copyPages(
    templateDoc,
    Array.from({ length: templateDoc.getPageCount() - 1 }, (_, i) => i + 1),
  );
  marketingPages.forEach((p) => outDoc.addPage(p));

  return outDoc.save();
}
