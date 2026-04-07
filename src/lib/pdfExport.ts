import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import html2canvas from "html2canvas";

const TEMPLATE_PDF_URL = "/proposal-template.pdf";
const A4_LANDSCAPE_WIDTH_PX = 1123;

const BRAND = {
  black: "#2A2A2A",
  offWhite: "#F2F2F2",
  sage: "#C3D1C5",
  darkSage: "#95A197",
  sageTint: "#f5f7f5",
  border: "#dde2dd",
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

function sp(el: HTMLElement, prop: string, val: string) {
  el.style.setProperty(prop, val, "important");
}

// ─── Dark/sage class-name detection patterns ──────────────────────────────────
// Checked against the LIVE DOM (reliable) not the cloned iframe.
// Do NOT include "bg-primary" — that maps to sage in this app's theme.
const DARK_PATTERNS = [
  "bg-[#2",
  "bg-[#1",
  "bg-[#0",
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

const SAGE_PATTERNS = [
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

// ─── Is this capture an Initial Pest Report? ─────────────────────────────────
// We detect by: no <table> element (proposals have one) + has the map grid layout.
function isInitialPestReport(el: HTMLElement): boolean {
  return !el.querySelector("table") && !!el.querySelector('[class*="lg:grid-cols-"]');
}

// ─── Pricing table complete remake ───────────────────────────────────────────
function remakePricingTable(root: HTMLElement) {
  const table = root.querySelector<HTMLTableElement>("table");
  if (!table) return;

  sp(table, "border-collapse", "collapse");
  sp(table, "width", "100%");
  sp(table, "border", `1px solid ${BRAND.border}`);

  // ── Thead: every level forced dark ──────────────────────────────────────────
  const thead = table.querySelector<HTMLElement>("thead");
  if (thead) {
    sp(thead, "background-color", BRAND.black);
    sp(thead, "color", BRAND.offWhite);
    thead.querySelectorAll<HTMLElement>("tr").forEach((tr) => {
      sp(tr, "background-color", BRAND.black);
      sp(tr, "color", BRAND.offWhite);
    });
    thead.querySelectorAll<HTMLElement>("th, td").forEach((th) => {
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
      th.querySelectorAll<HTMLElement>("*").forEach((c) => {
        sp(c, "color", BRAND.offWhite);
        sp(c, "background-color", "transparent");
        sp(c, "letter-spacing", "0.1em");
      });
    });
  }

  // ── Body rows ────────────────────────────────────────────────────────────────
  const bodyRows = Array.from(table.querySelectorAll<HTMLTableRowElement>("tbody tr")).filter(
    (row) => !row.textContent?.match(/\btotal\b/i),
  );

  bodyRows.forEach((row, rowIdx) => {
    const isEven = rowIdx % 2 === 1;
    row.querySelectorAll<HTMLElement>("td").forEach((cell, colIdx) => {
      sp(cell, "padding", "10px 14px");
      sp(cell, "vertical-align", "middle");
      sp(cell, "border-bottom", `1px solid ${BRAND.border}`);
      sp(cell, "background-color", isEven ? BRAND.sageTint : "#ffffff");

      if (colIdx === 0) {
        sp(cell, "font-size", "13px");
        sp(cell, "font-weight", "500");
        sp(cell, "color", BRAND.black);
      } else if (colIdx === 1 || colIdx === 2) {
        sp(cell, "font-size", "15px");
        sp(cell, "font-weight", "700");
        sp(cell, "color", BRAND.black);
      } else if (colIdx === 3) {
        sp(cell, "font-size", "12px");
        sp(cell, "color", "#555");
      }
      // Schedule column (colIdx >= 4): untouched — month chips keep own styles
    });
  });

  // ── Total row — found by content, not position ──────────────────────────────
  let totalRow: HTMLTableRowElement | null = null;
  table.querySelectorAll<HTMLTableRowElement>("tfoot tr, tbody tr").forEach((row) => {
    if (row.textContent?.match(/\btotal\b/i)) totalRow = row;
  });
  if (totalRow) {
    totalRow.querySelectorAll<HTMLElement>("td, th").forEach((cell, colIdx) => {
      sp(cell, "background-color", "#ffffff");
      sp(cell, "color", BRAND.black);
      sp(cell, "border-top", `2px solid ${BRAND.black}`);
      sp(cell, "border-bottom", "none");
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
  const isPestReport = isInitialPestReport(el);

  // ── Pre-mark dark/sage elements in the live DOM before clone ─────────────
  const marked: Array<[HTMLElement, string]> = [];

  el.querySelectorAll<HTMLElement>("[class]").forEach((elem) => {
    const cls = elem.getAttribute("class") ?? "";
    if (DARK_PATTERNS.some((p) => cls.includes(p))) {
      elem.setAttribute("data-crest-dark", "1");
      marked.push([elem, "data-crest-dark"]);
    } else if (SAGE_PATTERNS.some((p) => cls.includes(p))) {
      elem.setAttribute("data-crest-sage", "1");
      marked.push([elem, "data-crest-sage"]);
    }
  });

  // Thead rows always get dark treatment (may use bg-primary via CSS variable)
  el.querySelectorAll<HTMLElement>("thead, thead tr, thead th, thead td").forEach((th) => {
    if (!th.getAttribute("data-crest-dark")) {
      th.setAttribute("data-crest-dark", "1");
      marked.push([th, "data-crest-dark"]);
    }
  });

  try {
    const canvas = await html2canvas(el, {
      scale: 2,
      useCORS: true,
      allowTaint: false,
      backgroundColor: "#ffffff",
      logging: false,
      onclone: (clonedDoc) => {
        // ── Phase 1: CSS ─────────────────────────────────────────────────────
        const style = clonedDoc.createElement("style");
        style.textContent = `
          ${printCss}

          html, body {
            margin: 0 !important; padding: 0 !important;
            background: #ffffff !important; overflow: visible !important;
          }

          /* Safe globals only — no colour/word-break overrides */
          * {
            hyphens: none !important; -webkit-hyphens: none !important;
            -webkit-font-smoothing: antialiased !important;
            text-rendering: optimizeLegibility !important;
          }

          /* ═══════════════════════════════════════════════════════════
             ROOT BASE — 13 px for proposals; overridden to 11 px for
             Initial Pest Reports via [data-report-type] below.
             ═══════════════════════════════════════════════════════════ */
          .pdf-export-root {
            background: #ffffff !important; box-sizing: border-box !important;
            overflow: visible !important;
            font-size: 13px !important; line-height: 1.55 !important;
            color: ${BRAND.black} !important;
          }

          .pdf-export-root [class*="max-w-"]        { max-width: none !important; }
          .pdf-export-root [class*="bg-background"] { background: #ffffff !important; }

          /* Hide noise */
          .pdf-export-root .no-print,
          .pdf-export-root button:not(.print-keep),
          .pdf-export-root [role="status"],
          .pdf-export-root .sonner,
          .pdf-export-root [data-sonner-toaster]             { display: none !important; }
          .pdf-export-root .print-only-text                  { display: inline !important; }
          .pdf-export-root .hidden.print\\:block,
          .pdf-export-root [class*="hidden"][class*="print\\:block"] { display: block !important; }
          .pdf-export-root .print-content-formatted          { display: block !important; }

          /* ── Proposal text scale ────────────────────────────────── */
          .pdf-export-root p, .pdf-export-root li            { font-size: inherit !important; line-height: 1.55 !important; }
          .pdf-export-root [class*="text-xs"]                { font-size: 11px !important; line-height: 1.5 !important; }
          .pdf-export-root [class*="text-sm"]                { font-size: 13px !important; line-height: 1.55 !important; }
          .pdf-export-root [class*="text-base"]              { font-size: 13px !important; line-height: 1.55 !important; }
          .pdf-export-root [class*="text-lg"]                { font-size: 14px !important; line-height: 1.5 !important; }
          .pdf-export-root [class*="text-xl"]                { font-size: 16px !important; line-height: 1.4 !important; }
          .pdf-export-root [class*="text-2xl"]               { font-size: 20px !important; line-height: 1.3 !important; }
          /* Arbitrary sizes — font-size ONLY, never colour */
          .pdf-export-root [class*="text-\\[8px\\]"]         { font-size: 8px  !important; line-height: 1.55 !important; }
          .pdf-export-root [class*="text-\\[9px\\]"]         { font-size: 9px  !important; line-height: 1.55 !important; }
          .pdf-export-root [class*="text-\\[10px\\]"]        { font-size: 10px !important; line-height: 1.55 !important; }
          .pdf-export-root [class*="text-\\[11px\\]"]        { font-size: 11px !important; line-height: 1.55 !important; }
          /* Products list */
          .pdf-export-root [class*="columns-2"] *            { font-size: 9.5px !important; line-height: 1.65 !important; }
          .pdf-export-root [class*="columns-2"] p,
          .pdf-export-root [class*="columns-2"] li           { margin: 1px 0 !important; }
          /* Headings */
          .pdf-export-root h1 { font-size: 22px !important; font-weight: 700 !important; overflow: visible !important; }
          .pdf-export-root h2 { font-size: 18px !important; font-weight: 700 !important; overflow: visible !important; }
          .pdf-export-root h3 { font-size: 15px !important; font-weight: 600 !important; overflow: visible !important; }
          .pdf-export-root ul li, .pdf-export-root ol li { margin-bottom: 3px !important; }

          /* ═══════════════════════════════════════════════════════════
             INITIAL PEST REPORT — compact scale
             Applied when [data-report-type="pest-report"] is set on
             the root by JS below (only on pest report captures).
             ═══════════════════════════════════════════════════════════ */
          .pdf-export-root[data-report-type="pest-report"] {
            font-size: 11px !important;
            line-height: 1.45 !important;
          }
          .pdf-export-root[data-report-type="pest-report"] p,
          .pdf-export-root[data-report-type="pest-report"] li,
          .pdf-export-root[data-report-type="pest-report"] span,
          .pdf-export-root[data-report-type="pest-report"] div,
          .pdf-export-root[data-report-type="pest-report"] b,
          .pdf-export-root[data-report-type="pest-report"] strong {
            font-size: 9px !important;
            line-height: 1.35 !important;
          }
          /* Prose / rich text overrides */
          .pdf-export-root[data-report-type="pest-report"] .prose,
          .pdf-export-root[data-report-type="pest-report"] .prose *,
          .pdf-export-root[data-report-type="pest-report"] .ql-editor,
          .pdf-export-root[data-report-type="pest-report"] .ql-editor *,
          .pdf-export-root[data-report-type="pest-report"] [contenteditable] *,
          .pdf-export-root[data-report-type="pest-report"] [dangerouslysetinnerhtml] * {
            font-size: 9px !important;
            line-height: 1.35 !important;
          }
          /* Tailwind overrides inside pest report */
          .pdf-export-root[data-report-type="pest-report"] [class*="text-xs"],
          .pdf-export-root[data-report-type="pest-report"] [class*="text-sm"],
          .pdf-export-root[data-report-type="pest-report"] [class*="text-base"],
          .pdf-export-root[data-report-type="pest-report"] [class*="text-lg"],
          .pdf-export-root[data-report-type="pest-report"] [class*="text-xl"] { font-size: 9px !important; line-height: 1.35 !important; }
          .pdf-export-root[data-report-type="pest-report"] [class*="text-2xl"]  { font-size: 20px !important; line-height: 1.3 !important; }
          /* Headings inside pest report — same 9px as body, except the report title */
          .pdf-export-root[data-report-type="pest-report"] h1 { font-size: 20px !important; font-weight: 700 !important; }
          .pdf-export-root[data-report-type="pest-report"] h2 { font-size: 9px !important; font-weight: 700 !important; }
          .pdf-export-root[data-report-type="pest-report"] h3 { font-size: 9px !important; font-weight: 600 !important; }
          /* Tighter bullets */
          .pdf-export-root[data-report-type="pest-report"] ul li,
          .pdf-export-root[data-report-type="pest-report"] ol li { margin-bottom: 0px !important; }
          /* Tighter card padding */
          .pdf-export-root[data-report-type="pest-report"] [class*="p-3"] { padding: 4px 6px !important; }
          .pdf-export-root[data-report-type="pest-report"] [class*="p-4"] { padding: 6px 8px !important; }
          .pdf-export-root[data-report-type="pest-report"] [class*="gap-3"] { gap: 3px !important; }
          .pdf-export-root[data-report-type="pest-report"] [class*="gap-4"] { gap: 5px !important; }
          /* Section header bars in pest report: same visual, slightly shorter */
          .pdf-export-root[data-report-type="pest-report"] [data-crest-dark="1"] {
            padding-top: 5px !important; padding-bottom: 5px !important;
          }

          /* ═══════════════════════════════════════════════════════════
             DARK SECTION HEADERS  (pre-marked with data-crest-dark)
             ═══════════════════════════════════════════════════════════ */
          [data-crest-dark="1"] {
            background-color: ${BRAND.black} !important;
            color:            ${BRAND.offWhite} !important;
          }
          [data-crest-dark="1"] * {
            color:          ${BRAND.offWhite} !important;
            letter-spacing: 0.07em !important;
          }

          /* ═══════════════════════════════════════════════════════════
             SAGE ACCENT ELEMENTS  (pre-marked with data-crest-sage)
             ═══════════════════════════════════════════════════════════ */
          [data-crest-sage="1"]   { background-color: ${BRAND.sage} !important; }
          [data-crest-sage="1"] * { color: ${BRAND.black} !important; }

          /* ═══════════════════════════════════════════════════════════
             TABLE — CSS layer; JS remakePricingTable adds !important
             inline styles on top for absolute override certainty
             ═══════════════════════════════════════════════════════════ */
          .pdf-export-root table {
            border-collapse: collapse !important; width: 100% !important;
            border: 1px solid ${BRAND.border} !important;
          }
          .pdf-export-root thead,
          .pdf-export-root thead tr,
          .pdf-export-root thead th,
          .pdf-export-root thead td {
            background-color: ${BRAND.black} !important;
            color:            ${BRAND.offWhite} !important;
            font-size:        10px !important; font-weight: 700 !important;
            letter-spacing:   0.1em !important; text-transform: uppercase !important;
            border: none !important;
          }
          .pdf-export-root thead * { color: ${BRAND.offWhite} !important; }
          .pdf-export-root tbody td {
            padding: 10px 14px !important; vertical-align: middle !important;
            font-size: 13px !important; border-bottom: 1px solid ${BRAND.border} !important;
          }
          .pdf-export-root tbody tr:nth-child(even) td { background-color: ${BRAND.sageTint} !important; }
          .pdf-export-root tfoot td, .pdf-export-root tfoot th {
            border-top: 2px solid ${BRAND.black} !important;
            font-weight: 700 !important; font-size: 14px !important; padding: 11px 14px !important;
          }

          /* ═══════════════════════════════════════════════════════════
             BORDERS & POLISH
             ═══════════════════════════════════════════════════════════ */
          .pdf-export-root [class*="border"]     { border-color: ${BRAND.border} !important; }
          .pdf-export-root [class*="rounded-lg"],
          .pdf-export-root [class*="rounded-md"] { border-radius: 5px !important; }
          .pdf-export-root [class*="border-t"]   {
            border-top-color: ${BRAND.darkSage} !important; border-top-width: 2px !important;
          }
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

        // ── Phase 2: Tag pest reports so compact CSS fires ────────────────────
        // isInitialPestReport() was checked on the LIVE element before cloning.
        if (isPestReport) {
          clonedPage.setAttribute("data-report-type", "pest-report");
        }

        // ── Phase 3: Pricing table ────────────────────────────────────────────
        remakePricingTable(clonedPage);

        // ── Phase 4: Fix title clip (inputs have fixed width, truncate text) ──
        clonedPage.querySelectorAll<HTMLElement>('[class*="truncate"], [class*="overflow-hidden"]').forEach((e) => {
          // Never touch map elements
          if (e.closest('[class*="w-[400px]"]') || e.closest('[class*="h-[533px]"]')) return;
          sp(e, "overflow", "visible");
          sp(e, "text-overflow", "clip");
        });

        // ── Phase 5: Layout — map + grid (UNTOUCHED) ─────────────────────────
        clonedPage.querySelectorAll<HTMLElement>('[class*="print:scale-"]').forEach((e) => {
          e.style.transform = "none";
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

        // MAP — completely untouched
        const mapContainer = clonedPage.querySelector<HTMLElement>('[class*="w-[400px]"][class*="h-[533px]"]');
        if (mapContainer) {
          mapContainer.style.width = "100%";
          mapContainer.style.height = "100%";
          mapContainer.style.maxHeight = "100%";
          const mapImg = mapContainer.querySelector<HTMLImageElement>("img");
          mapContainer.style.aspectRatio =
            mapImg?.naturalWidth && mapImg?.naturalHeight
              ? `${mapImg.naturalWidth} / ${mapImg.naturalHeight}`
              : "3 / 4";
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
  } finally {
    // Always restore live DOM
    marked.forEach(([elem, attr]) => elem.removeAttribute(attr));
  }
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
