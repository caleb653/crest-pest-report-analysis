import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import html2canvas from "html2canvas";

const TEMPLATE_PDF_URL = "/proposal-template.pdf";
const A4_LANDSCAPE_WIDTH_PX = 1123;

const BRAND = {
  black: "#2A2A2A",
  offWhite: "#F2F2F2",
  sage: "#C3D1C5",
  darkSage: "#95A197",
  sageTint: "#f3f6f3",
  border: "#dde2dd",
  muted: "#5a5a5a",
};

let cachedPrintCss = "";

function collectPrintRules(rules: CSSRuleList, output: string[]) {
  for (const rule of Array.from(rules)) {
    if (rule instanceof CSSMediaRule) {
      if (rule.media.mediaText.includes("print")) output.push(...Array.from(rule.cssRules).map((r) => r.cssText));
      continue;
    }
    if ("cssRules" in rule) {
      try {
        collectPrintRules((rule as CSSGroupingRule).cssRules, output);
      } catch {
        /**/
      }
    }
  }
}

function getPrintCssText() {
  if (cachedPrintCss) return cachedPrintCss;
  const out: string[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      collectPrintRules(sheet.cssRules, out);
    } catch {
      /**/
    }
  }
  cachedPrintCss = out.join("\n");
  return cachedPrintCss;
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function sp(el: HTMLElement, prop: string, val: string) {
  el.style.setProperty(prop, val, "important");
}

function spChildren(el: HTMLElement, prop: string, val: string) {
  el.querySelectorAll<HTMLElement>("*").forEach((c) => sp(c, prop, val));
}

// ─── Dark section-header bars ────────────────────────────────────────────────
// WHY class names not getComputedStyle: the cloned iframe may not fully resolve
// CSS variables (e.g. bg-[#2A2A2A], bg-foreground), causing getComputedStyle
// to return transparent. Reading the raw class string is 100% reliable.
const DARK_BG_PATTERNS = [
  "bg-[#2",
  "bg-[#1",
  "bg-[#0", // arbitrary hex dark values
  "bg-black",
  "bg-foreground",
  "bg-gray-9",
  "bg-zinc-9",
  "bg-neutral-9",
  "bg-stone-9",
  "bg-slate-9",
  "bg-gray-8",
  "bg-zinc-8",
  "bg-neutral-8",
];

function fixDarkSectionHeaders(root: HTMLElement) {
  root.querySelectorAll<HTMLElement>("[class]").forEach((el) => {
    const cls = el.getAttribute("class") ?? "";
    if (!DARK_BG_PATTERNS.some((p) => cls.includes(p))) return;
    sp(el, "background-color", BRAND.black);
    sp(el, "color", BRAND.offWhite);
    // ALL descendants must be off-white — no exceptions
    el.querySelectorAll<HTMLElement>("*").forEach((child) => {
      sp(child, "color", BRAND.offWhite);
      sp(child, "letter-spacing", "0.07em");
    });
  });
}

// ─── Sage / green elements ────────────────────────────────────────────────────
const SAGE_BG_PATTERNS = [
  "bg-[#C3D1C5",
  "bg-[#c3d1c5",
  "bg-[#95A197",
  "bg-[#95a197",
  "bg-sage",
  "bg-primary",
  "bg-green-",
  "bg-emerald-",
  "bg-teal-",
];

function fixSageElements(root: HTMLElement) {
  root.querySelectorAll<HTMLElement>("[class]").forEach((el) => {
    const cls = el.getAttribute("class") ?? "";
    if (!SAGE_BG_PATTERNS.some((p) => cls.includes(p))) return;
    sp(el, "background-color", BRAND.sage);
    spChildren(el, "color", BRAND.black);
  });
}

// ─── Pricing table complete remake ───────────────────────────────────────────
function remakePricingTable(root: HTMLElement) {
  const table = root.querySelector<HTMLTableElement>("table");
  if (!table) return;

  sp(table, "border-collapse", "collapse");
  sp(table, "width", "100%");

  // ── Header row ──────────────────────────────────────────────────────────────
  table.querySelectorAll<HTMLElement>("thead th, thead td").forEach((th) => {
    sp(th, "background-color", BRAND.black);
    sp(th, "color", BRAND.offWhite);
    sp(th, "font-size", "10px");
    sp(th, "font-weight", "700");
    sp(th, "letter-spacing", "0.1em");
    sp(th, "text-transform", "uppercase");
    sp(th, "padding", "11px 14px");
    sp(th, "border", "none");
    sp(th, "white-space", "nowrap");
    sp(th, "vertical-align", "middle");
    // Force any inline elements (spans) inside header cells to also be white
    th.querySelectorAll<HTMLElement>("*").forEach((c) => {
      sp(c, "color", BRAND.offWhite);
      sp(c, "letter-spacing", "0.1em");
    });
  });

  // ── Body rows ────────────────────────────────────────────────────────────────
  table.querySelectorAll<HTMLTableRowElement>("tbody tr").forEach((row, rowIdx) => {
    // Skip if this row contains "Total" — handle separately below
    if (row.textContent?.match(/total/i)) return;

    const cells = row.querySelectorAll<HTMLElement>("td");
    const isEven = rowIdx % 2 === 1;

    cells.forEach((cell, colIdx) => {
      sp(cell, "padding", "10px 14px");
      sp(cell, "vertical-align", "middle");
      sp(cell, "border-bottom", `1px solid ${BRAND.border}`);
      sp(cell, "background-color", isEven ? BRAND.sageTint : "#ffffff");

      if (colIdx === 0) {
        // Service name
        sp(cell, "font-size", "13px");
        sp(cell, "font-weight", "500");
        sp(cell, "color", BRAND.black);
      } else if (colIdx === 1 || colIdx === 2) {
        // Initial / Recurring price — make these POP
        sp(cell, "font-size", "15px");
        sp(cell, "font-weight", "700");
        sp(cell, "color", BRAND.black);
      } else if (colIdx === 3) {
        // Frequency
        sp(cell, "font-size", "12px");
        sp(cell, "color", BRAND.muted);
      } else {
        // Schedule column
        sp(cell, "font-size", "11px");
        sp(cell, "color", BRAND.black);
      }
    });
  });

  // ── Total row — find by content, not position ────────────────────────────────
  let totalRow: HTMLElement | null = null;
  table.querySelectorAll<HTMLElement>("tfoot tr, tbody tr").forEach((row) => {
    if (row.textContent?.match(/total/i)) totalRow = row;
  });

  if (totalRow) {
    (totalRow as HTMLElement).querySelectorAll<HTMLElement>("td, th").forEach((cell, colIdx) => {
      sp(cell, "border-top", `2px solid ${BRAND.black}`);
      sp(cell, "border-bottom", "none");
      sp(cell, "background-color", "#ffffff");
      sp(cell, "color", BRAND.black);
      sp(cell, "padding", "11px 14px");
      sp(cell, "font-weight", "700");
      sp(cell, "font-size", colIdx >= 1 && colIdx <= 2 ? "16px" : "14px");
    });
  }
}

// ─── captureElement ──────────────────────────────────────────────────────────
async function captureElement(el: HTMLElement): Promise<string> {
  const captureKey = el.dataset.pdfCapture;
  const printCss = getPrintCssText();

  const canvas = await html2canvas(el, {
    scale: 2,
    useCORS: true,
    allowTaint: false,
    backgroundColor: "#ffffff",
    logging: false,
    onclone: (clonedDoc) => {
      // ── Phase 1: CSS injection ────────────────────────────────────────────
      const style = clonedDoc.createElement("style");
      style.textContent = `
        ${printCss}

        html, body {
          margin: 0 !important; padding: 0 !important;
          background: #ffffff !important; overflow: visible !important;
        }

        /* Rendering quality only — no word-break (causes mid-word breaks) */
        * {
          hyphens: none !important; -webkit-hyphens: none !important;
          -webkit-font-smoothing: antialiased !important;
          text-rendering: optimizeLegibility !important;
        }

        .pdf-export-root {
          background: #ffffff !important; box-sizing: border-box !important;
          overflow: visible !important;
          /* Base reading size — everything inherits this unless overridden */
          font-size: 13px; line-height: 1.55;
        }

        .pdf-export-root [class*="max-w-"]        { max-width: none !important; }
        .pdf-export-root [class*="bg-background"] { background: #ffffff !important; }

        /* Hide noise */
        .pdf-export-root .no-print,
        .pdf-export-root button:not(.print-keep),
        .pdf-export-root [role="status"],
        .pdf-export-root .sonner,
        .pdf-export-root [data-sonner-toaster]            { display: none !important; }
        .pdf-export-root .print-only-text                 { display: inline !important; }
        .pdf-export-root .hidden.print\\:block,
        .pdf-export-root [class*="hidden"][class*="print\\:block"] { display: block !important; }
        .pdf-export-root .print-content-formatted         { display: block !important; }

        /* ════════════════════════════════════════════════════════════
           TEXT SIZE NORMALIZATION
           Target Tailwind utility classes directly. Titles (text-xl+)
           are intentionally left at their natural larger sizes.
           ════════════════════════════════════════════════════════════ */

        /* Content body: normalise to 13 px */
        .pdf-export-root [class*="text-sm"]   { font-size: 13px !important; line-height: 1.55 !important; }
        .pdf-export-root [class*="text-base"] { font-size: 13px !important; line-height: 1.55 !important; }

        /* Sub-headings: 14 px */
        .pdf-export-root [class*="text-lg"]   { font-size: 14px !important; line-height: 1.5 !important; }

        /* Section header bar labels — stay small + tracked (JS will set color) */
        .pdf-export-root [class*="text-xs"] {
          font-size: 11px !important; line-height: 1.5 !important;
          letter-spacing: 0.06em !important;
        }

        /* ONLY things intentionally smaller */
        .pdf-export-root [class*="text-\\[8px\\]"]  { font-size: 8px  !important; line-height: 1.55 !important; color: ${BRAND.muted} !important; }
        .pdf-export-root [class*="text-\\[9px\\]"]  { font-size: 9px  !important; line-height: 1.55 !important; color: ${BRAND.muted} !important; }
        .pdf-export-root [class*="text-\\[10px\\]"] { font-size: 10px !important; line-height: 1.55 !important; color: ${BRAND.muted} !important; }

        /* Products two-column list: compact */
        .pdf-export-root [class*="columns-2"] *   { font-size: 9.5px !important; line-height: 1.65 !important; }
        .pdf-export-root [class*="columns-2"] p,
        .pdf-export-root [class*="columns-2"] li  { margin: 1px 0 !important; }

        /* Signature area: printed name smaller */
        .pdf-export-root [class*="signature"] [class*="text"],
        .pdf-export-root [class*="print"] [class*="name"] { font-size: 11px !important; }

        /* ════════════════════════════════════════════════════════════
           TABLE — CSS layer (JS layer adds additional specificity)
           ════════════════════════════════════════════════════════════ */

        .pdf-export-root table {
          border-collapse: collapse !important; width: 100% !important;
          border: 1px solid ${BRAND.border} !important;
        }

        /* Header: brand black — CSS layer */
        .pdf-export-root thead th,
        .pdf-export-root thead td {
          background-color: ${BRAND.black} !important;
          color:            ${BRAND.offWhite} !important;
          font-size:        10px !important;
          font-weight:      700 !important;
          letter-spacing:   0.1em !important;
          text-transform:   uppercase !important;
          padding:          11px 14px !important;
          border:           none !important;
          white-space:      nowrap !important;
          vertical-align:   middle !important;
        }
        /* Force all children in thead to inherit white */
        .pdf-export-root thead th *,
        .pdf-export-root thead td * {
          color:          ${BRAND.offWhite} !important;
          letter-spacing: 0.1em !important;
        }

        /* Body cells: CSS layer */
        .pdf-export-root tbody td {
          padding:        10px 14px !important;
          vertical-align: middle !important;
          font-size:      13px !important;
          border-bottom:  1px solid ${BRAND.border} !important;
        }

        /* Zebra stripe */
        .pdf-export-root tbody tr:nth-child(even) td {
          background-color: ${BRAND.sageTint} !important;
        }

        /* Total row */
        .pdf-export-root tfoot td,
        .pdf-export-root tfoot th {
          border-top:    2px solid ${BRAND.black} !important;
          font-weight:   700 !important;
          font-size:     14px !important;
          padding:       11px 14px !important;
        }

        /* ════════════════════════════════════════════════════════════
           BORDERS & POLISH
           ════════════════════════════════════════════════════════════ */

        .pdf-export-root [class*="border"]    { border-color: ${BRAND.border} !important; }
        .pdf-export-root [class*="rounded-lg"],
        .pdf-export-root [class*="rounded-md"] { border-radius: 5px !important; }

        /* Guarantee bar: dark-sage top accent */
        .pdf-export-root [class*="border-t"] {
          border-top-color: ${BRAND.darkSage} !important;
          border-top-width: 2px !important;
        }

        /* Bullet breathing room */
        .pdf-export-root ul li, .pdf-export-root ol li { margin-bottom: 3px !important; }
      `;
      clonedDoc.head.appendChild(style);

      if (!captureKey) return;

      const clonedPage = clonedDoc.querySelector<HTMLElement>(`[data-pdf-capture="${captureKey}"]`);
      if (!clonedPage) return;

      clonedPage.classList.add("pdf-export-root");
      clonedPage.style.width = `${A4_LANDSCAPE_WIDTH_PX}px`;
      clonedPage.style.minWidth = `${A4_LANDSCAPE_WIDTH_PX}px`;
      clonedPage.style.background = "#ffffff";
      clonedPage.style.boxSizing = "border-box";
      clonedPage.style.overflow = "visible";

      // ── Phase 2: JS — dark section-header labels (class-name detection) ──
      // This is more reliable than getComputedStyle because the cloned iframe
      // may not resolve CSS variables (e.g. bg-[#2A2A2A], bg-foreground).
      fixDarkSectionHeaders(clonedPage);

      // ── Phase 3: JS — sage elements ──────────────────────────────────────
      fixSageElements(clonedPage);

      // ── Phase 4: JS — pricing table (adds specificity on top of CSS) ─────
      remakePricingTable(clonedPage);

      // ── Phase 5: Layout — map + grid (UNTOUCHED) ─────────────────────────

      clonedPage.querySelectorAll<HTMLElement>('[class*="print:scale-"]').forEach((el) => {
        el.style.transform = "none";
      });

      const gridContainer = clonedPage.querySelector<HTMLElement>('[class*="lg:grid-cols-"]');
      if (gridContainer) {
        gridContainer.style.display = "grid";
        gridContainer.style.gridTemplateColumns = "42% 58%";
        gridContainer.style.gap = "20px";
        gridContainer.style.alignItems = "stretch";
        gridContainer.style.padding = "0 16px";
        gridContainer.style.flex = "1";
      }

      clonedPage.style.display = "flex";
      clonedPage.style.flexDirection = "column";

      const mapContainer = clonedPage.querySelector<HTMLElement>('[class*="w-[400px]"][class*="h-[533px]"]');
      if (mapContainer) {
        mapContainer.style.width = "100%";
        mapContainer.style.height = "100%";
        mapContainer.style.maxHeight = "100%";
        const mapImg = mapContainer.querySelector<HTMLImageElement>("img");
        mapContainer.style.aspectRatio =
          mapImg?.naturalWidth && mapImg?.naturalHeight ? `${mapImg.naturalWidth} / ${mapImg.naturalHeight}` : "3 / 4";
        mapContainer.style.display = "flex";
        mapContainer.style.alignItems = "stretch";
        if (mapImg) {
          mapImg.style.objectFit = "contain";
          mapImg.style.objectPosition = "center";
          mapImg.style.width = "100%";
          mapImg.style.height = "100%";
        }
      }

      const mapParent = clonedPage.querySelector<HTMLElement>(".flex.flex-col.min-h-0");
      if (mapParent) {
        mapParent.style.flex = "1";
        mapParent.style.display = "flex";
        mapParent.style.flexDirection = "column";
        mapParent.style.justifyContent = "center";
      }

      const detailsBody = clonedPage.querySelector<HTMLElement>(".additional-details-body .print-content-formatted");
      const detailsCard = clonedPage.querySelector<HTMLElement>(".additional-details-card");
      if (detailsBody && detailsCard) {
        let fontSize = parseFloat(detailsBody.style.fontSize) || 11;
        const minFont = 7;
        while (fontSize > minFont && detailsBody.scrollHeight > detailsCard.clientHeight + 2) {
          fontSize -= 0.5;
          detailsBody.style.fontSize = `${fontSize}px`;
        }
      }
    },
  });

  return canvas.toDataURL("image/jpeg", 0.95);
}

// ─── buildMergedPDF ───────────────────────────────────────────────────────────
export async function buildMergedPDF(options: {
  customerName: string;
  technicianName: string;
  address: string;
  reportPages: HTMLElement[];
}): Promise<Uint8Array> {
  const { customerName, technicianName, address, reportPages } = options;

  const templateBytes = await fetch(TEMPLATE_PDF_URL).then((r) => r.arrayBuffer());
  const templateDoc = await PDFDocument.load(templateBytes);
  const outDoc = await PDFDocument.create();
  const helvetica = await outDoc.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await outDoc.embedFont(StandardFonts.HelveticaBold);

  const [coverPage] = await outDoc.copyPages(templateDoc, [0]);
  const { width: pageW, height: pageH } = coverPage.getSize();

  if (customerName)
    coverPage.drawText(customerName, { x: 42, y: 326, size: 24, font: helveticaBold, color: rgb(1, 1, 1) });
  if (address) coverPage.drawText(address, { x: 42, y: 298, size: 14, font: helvetica, color: rgb(0.85, 0.85, 0.85) });
  if (technicianName)
    coverPage.drawText(technicianName, { x: 42, y: 128, size: 14, font: helveticaBold, color: rgb(0.2, 0.2, 0.2) });

  outDoc.addPage(coverPage);

  let pendingHeaderImg: Awaited<ReturnType<typeof outDoc.embedJpg>> | null = null;

  for (const el of reportPages) {
    const dataUrl = await captureElement(el);
    const imgBytes = await fetch(dataUrl).then((r) => r.arrayBuffer());
    const img = await outDoc.embedJpg(imgBytes);
    const captureId = el.dataset.pdfCapture ?? "";

    if (captureId === "0") {
      pendingHeaderImg = img;
      continue;
    }

    const page = outDoc.addPage([pageW, pageH]);

    if (captureId === "1" && pendingHeaderImg) {
      const headerDrawH = pendingHeaderImg.height * (pageW / pendingHeaderImg.width);
      const headerDrawY = pageH - headerDrawH;
      page.drawImage(pendingHeaderImg, { x: 0, y: headerDrawY, width: pageW, height: headerDrawH });
      const finalH = Math.min(img.height * (pageW / img.width), Math.max(headerDrawY, 0));
      page.drawImage(img, { x: 0, y: Math.max(headerDrawY - finalH, 0), width: pageW, height: finalH });
      pendingHeaderImg = null;
    } else {
      const drawH = Math.min(img.height * (pageW / img.width), pageH);
      page.drawImage(img, { x: 0, y: pageH - drawH, width: pageW, height: drawH });
    }
  }

  const marketingPages = await outDoc.copyPages(
    templateDoc,
    Array.from({ length: templateDoc.getPageCount() - 1 }, (_, i) => i + 1),
  );
  for (const mp of marketingPages) outDoc.addPage(mp);

  return outDoc.save();
}

// ─── buildSimplePDF ───────────────────────────────────────────────────────────
export async function buildSimplePDF(options: { reportPages: HTMLElement[] }): Promise<Uint8Array> {
  const { reportPages } = options;
  const outDoc = await PDFDocument.create();
  const pageW = 842;
  const pageH = 595;

  let pendingHeaderImg: Awaited<ReturnType<typeof outDoc.embedJpg>> | null = null;

  for (const el of reportPages) {
    const dataUrl = await captureElement(el);
    const imgBytes = await fetch(dataUrl).then((r) => r.arrayBuffer());
    const img = await outDoc.embedJpg(imgBytes);
    const captureId = el.dataset.pdfCapture ?? "";

    if (captureId === "0") {
      pendingHeaderImg = img;
      continue;
    }

    const page = outDoc.addPage([pageW, pageH]);

    if (captureId === "1" && pendingHeaderImg) {
      const headerDrawH = pendingHeaderImg.height * (pageW / pendingHeaderImg.width);
      const headerDrawY = pageH - headerDrawH;
      page.drawImage(pendingHeaderImg, { x: 0, y: headerDrawY, width: pageW, height: headerDrawH });
      const finalH = Math.min(img.height * (pageW / img.width), Math.max(headerDrawY, 0));
      page.drawImage(img, { x: 0, y: Math.max(headerDrawY - finalH, 0), width: pageW, height: finalH });
      pendingHeaderImg = null;
    } else {
      const drawH = Math.min(img.height * (pageW / img.width), pageH);
      page.drawImage(img, { x: 0, y: pageH - drawH, width: pageW, height: drawH });
    }
  }

  return outDoc.save();
}

// ─── downloadPDF ─────────────────────────────────────────────────────────────
export function downloadPDF(pdfBytes: Uint8Array, filename: string) {
  const blob = new Blob([new Uint8Array(pdfBytes)], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
