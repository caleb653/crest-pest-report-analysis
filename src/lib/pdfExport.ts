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

function isInitialPestReport(el: HTMLElement): boolean {
  return !el.querySelector("table") && !!el.querySelector('[class*="lg:grid-cols-"]');
}

function remakePricingTable(root: HTMLElement) {
  const table = root.querySelector<HTMLTableElement>("table");
  if (!table) return;

  sp(table, "border-collapse", "collapse");
  sp(table, "width", "100%");
  sp(table, "border", `1px solid ${BRAND.border}`);

  const thead = table.querySelector<HTMLElement>("thead");
  if (thead) {
    sp(thead, "background-color", BRAND.sage);
    sp(thead, "color", BRAND.black);
    thead.querySelectorAll<HTMLElement>("tr").forEach((tr) => {
      sp(tr, "background-color", BRAND.sage);
      sp(tr, "color", BRAND.black);
    });
    thead.querySelectorAll<HTMLElement>("th, td").forEach((th) => {
      sp(th, "background-color", BRAND.sage);
      sp(th, "color", BRAND.black);
      sp(th, "font-size", "10px");
      sp(th, "font-weight", "700");
      sp(th, "letter-spacing", "0.1em");
      sp(th, "text-transform", "uppercase");
      sp(th, "padding", "11px 14px");
      sp(th, "border", "none");
      sp(th, "white-space", "nowrap");
      sp(th, "vertical-align", "middle");
      th.querySelectorAll<HTMLElement>("*").forEach((c) => {
        sp(c, "color", BRAND.black);
        sp(c, "background-color", "transparent");
        sp(c, "letter-spacing", "0.1em");
      });
    });
  }

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
    });
  });

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

async function captureElement(el: HTMLElement): Promise<string> {
  const captureKey = el.dataset.pdfCapture;
  const printCss = getPrintCssText();
  const isPestReport = isInitialPestReport(el);

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
        const style = clonedDoc.createElement("style");
        style.textContent = `
          ${printCss}

          html, body {
            margin: 0 !important; padding: 0 !important;
            background: #ffffff !important; overflow: visible !important;
          }

          * {
            hyphens: none !important; -webkit-hyphens: none !important;
            -webkit-font-smoothing: antialiased !important;
            text-rendering: optimizeLegibility !important;
          }

          .pdf-export-root {
            background: #ffffff !important; box-sizing: border-box !important;
            overflow: visible !important;
            font-size: 11px !important; line-height: 1.55 !important;
            color: ${BRAND.black} !important;
          }

          .pdf-export-root [class*="max-w-"]        { max-width: none !important; }
          .pdf-export-root [class*="bg-background"] { background: #ffffff !important; }

          /* ═══════════════════════════════════════════════════════════
             PAGE 1 HEADER — boosted font sizes
             ═══════════════════════════════════════════════════════════ */
          .pdf-export-root [class*="print-header"],
          .pdf-export-root.print-header {
            background-color: ${BRAND.sage} !important;
            border-bottom: 2px solid ${BRAND.darkSage} !important;
          }
          .pdf-export-root [class*="print-header"] h1,
          .pdf-export-root [class*="print-header"] h2 {
            font-size: 24px !important;
            font-weight: 700 !important;
          }
          .pdf-export-root [class*="print-header"] h3 {
            font-size: 17px !important;
            font-weight: 600 !important;
          }
          /* All non-heading text inside the page 1 header */
          .pdf-export-root [class*="print-header"] p,
          .pdf-export-root [class*="print-header"] span,
          .pdf-export-root [class*="print-header"] div,
          .pdf-export-root [class*="print-header"] li,
          .pdf-export-root [class*="print-header"] td,
          .pdf-export-root [class*="print-header"] th {
            font-size: 15px !important;
            line-height: 1.45 !important;
          }

          /* Hide noise */
          .pdf-export-root .no-print,
          .pdf-export-root button:not(.print-keep),
          .pdf-export-root [role="status"],
          .pdf-export-root .sonner,
          .pdf-export-root [data-sonner-toaster]             { display: none !important; }
          .pdf-export-root .print-only-text                  { display: inline !important; }
          .pdf-export-root .hidden.print\\:block,
          .pdf-export-root [class*="hidden"][class*="print\\:block"] { display: block !important; }
          .pdf-export-root [class*="print\\:hidden"],
          .pdf-export-root .print\\:hidden                   { display: none !important; }
          .pdf-export-root .print-content-formatted          { display: block !important; }
          .pdf-export-root [class*="print\\:grid-cols-3"]    { grid-template-columns: 1fr 1fr 1fr !important; }

          /* ── Proposal text scale ────────────────────────────────── */
          .pdf-export-root p, .pdf-export-root li            { font-size: inherit !important; line-height: 1.55 !important; }
          .pdf-export-root [class*="text-xs"]                { font-size: 10px !important; line-height: 1.5 !important; }
          .pdf-export-root [class*="text-sm"]                { font-size: 11px !important; line-height: 1.55 !important; }
          .pdf-export-root [class*="text-base"]              { font-size: 11px !important; line-height: 1.55 !important; }
          .pdf-export-root [class*="text-lg"]                { font-size: 12px !important; line-height: 1.5 !important; }
          .pdf-export-root [class*="text-xl"]                { font-size: 14px !important; line-height: 1.4 !important; }
          .pdf-export-root [class*="text-2xl"]               { font-size: 18px !important; line-height: 1.3 !important; }
          .pdf-export-root [class*="text-\\[8px\\]"]         { font-size: 8px  !important; line-height: 1.55 !important; }
          .pdf-export-root [class*="text-\\[9px\\]"]         { font-size: 9px  !important; line-height: 1.55 !important; }
          .pdf-export-root [class*="text-\\[10px\\]"]        { font-size: 10px !important; line-height: 1.55 !important; }
          .pdf-export-root [class*="text-\\[11px\\]"]        { font-size: 11px !important; line-height: 1.55 !important; }
          .pdf-export-root [class*="columns-2"] *            { font-size: 9.5px !important; line-height: 1.65 !important; }
          .pdf-export-root [class*="columns-2"] p,
          .pdf-export-root [class*="columns-2"] li           { margin: 1px 0 !important; }
          .pdf-export-root h1 { font-size: 20px !important; font-weight: 700 !important; overflow: visible !important; }
          .pdf-export-root h2 { font-size: 16px !important; font-weight: 700 !important; overflow: visible !important; }
          .pdf-export-root h3 { font-size: 13px !important; font-weight: 600 !important; overflow: visible !important; }
          .pdf-export-root ul li, .pdf-export-root ol li { margin-bottom: 3px !important; }

          /* ═══════════════════════════════════════════════════════════
             INITIAL PEST REPORT — compact scale
             ═══════════════════════════════════════════════════════════ */
          .pdf-export-root[data-report-type="initial-pest"] {
            font-size: 10.5px !important;
            line-height: 1.3 !important;
          }
          .pdf-export-root[data-report-type="pest-report"] {
            font-size: 8.5px !important;
            line-height: 1.3 !important;
          }
          .pdf-export-root[data-report-type="initial-pest"] p,
          .pdf-export-root[data-report-type="initial-pest"] li,
          .pdf-export-root[data-report-type="initial-pest"] span,
          .pdf-export-root[data-report-type="initial-pest"] div,
          .pdf-export-root[data-report-type="initial-pest"] b,
          .pdf-export-root[data-report-type="initial-pest"] strong {
            font-size: 10.5px !important;
            line-height: 1.3 !important;
          }
          .pdf-export-root[data-report-type="pest-report"] p,
          .pdf-export-root[data-report-type="pest-report"] li,
          .pdf-export-root[data-report-type="pest-report"] span,
          .pdf-export-root[data-report-type="pest-report"] div,
          .pdf-export-root[data-report-type="pest-report"] b,
          .pdf-export-root[data-report-type="pest-report"] strong {
            font-size: 8.5px !important;
            line-height: 1.3 !important;
          }
          .pdf-export-root[data-report-type="initial-pest"] .prose,
          .pdf-export-root[data-report-type="initial-pest"] .prose *,
          .pdf-export-root[data-report-type="initial-pest"] .ql-editor,
          .pdf-export-root[data-report-type="initial-pest"] .ql-editor *,
          .pdf-export-root[data-report-type="initial-pest"] [contenteditable] * {
            font-size: 10.5px !important;
            line-height: 1.3 !important;
          }
          .pdf-export-root[data-report-type="pest-report"] .prose,
          .pdf-export-root[data-report-type="pest-report"] .prose *,
          .pdf-export-root[data-report-type="pest-report"] .ql-editor,
          .pdf-export-root[data-report-type="pest-report"] .ql-editor *,
          .pdf-export-root[data-report-type="pest-report"] [contenteditable] * {
            font-size: 8.5px !important;
            line-height: 1.3 !important;
          }
          .pdf-export-root[data-report-type="initial-pest"] [class*="text-xs"],
          .pdf-export-root[data-report-type="initial-pest"] [class*="text-sm"],
          .pdf-export-root[data-report-type="initial-pest"] [class*="text-base"],
          .pdf-export-root[data-report-type="initial-pest"] [class*="text-lg"],
          .pdf-export-root[data-report-type="initial-pest"] [class*="text-xl"] { font-size: 10.5px !important; line-height: 1.3 !important; }
          .pdf-export-root[data-report-type="pest-report"] [class*="text-xs"],
          .pdf-export-root[data-report-type="pest-report"] [class*="text-sm"],
          .pdf-export-root[data-report-type="pest-report"] [class*="text-base"],
          .pdf-export-root[data-report-type="pest-report"] [class*="text-lg"],
          .pdf-export-root[data-report-type="pest-report"] [class*="text-xl"] { font-size: 8.5px !important; line-height: 1.3 !important; }
          .pdf-export-root[data-report-type="initial-pest"] [class*="text-2xl"],
          .pdf-export-root[data-report-type="pest-report"] [class*="text-2xl"]  { font-size: 20px !important; line-height: 1.3 !important; }
          .pdf-export-root[data-report-type="initial-pest"] h1,
          .pdf-export-root[data-report-type="pest-report"] h1 { font-size: 20px !important; font-weight: 700 !important; }
          .pdf-export-root[data-report-type="initial-pest"] h2 { font-size: 10.5px !important; font-weight: 700 !important; }
          .pdf-export-root[data-report-type="pest-report"] h2 { font-size: 8.5px !important; font-weight: 700 !important; }
          .pdf-export-root[data-report-type="initial-pest"] h3 { font-size: 10.5px !important; font-weight: 600 !important; }
          .pdf-export-root[data-report-type="pest-report"] h3 { font-size: 8.5px !important; font-weight: 600 !important; }
          .pdf-export-root[data-report-type="initial-pest"] ul li,
          .pdf-export-root[data-report-type="initial-pest"] ol li,
          .pdf-export-root[data-report-type="pest-report"] ul li,
          .pdf-export-root[data-report-type="pest-report"] ol li { margin-bottom: 0px !important; }
          .pdf-export-root[data-report-type="initial-pest"] [class*="p-3"],
          .pdf-export-root[data-report-type="pest-report"] [class*="p-3"] { padding: 4px 6px !important; }
          .pdf-export-root[data-report-type="initial-pest"] [class*="p-4"],
          .pdf-export-root[data-report-type="pest-report"] [class*="p-4"] { padding: 6px 8px !important; }
          .pdf-export-root[data-report-type="initial-pest"] [class*="gap-3"],
          .pdf-export-root[data-report-type="pest-report"] [class*="gap-3"] { gap: 3px !important; }
          .pdf-export-root[data-report-type="initial-pest"] [class*="gap-4"],
          .pdf-export-root[data-report-type="pest-report"] [class*="gap-4"] { gap: 5px !important; }
          .pdf-export-root[data-report-type="initial-pest"] [data-crest-dark="1"],
          .pdf-export-root[data-report-type="pest-report"] [data-crest-dark="1"] {
            padding-top: 5px !important; padding-bottom: 5px !important;
          }

          /* ═══════════════════════════════════════════════════════════
             DARK SECTION HEADERS
             ═══════════════════════════════════════════════════════════ */
          [data-crest-dark="1"] {
            background-color: ${BRAND.sage} !important;
            color:            ${BRAND.black} !important;
          }
          [data-crest-dark="1"] * {
            color:          ${BRAND.black} !important;
            letter-spacing: 0.07em !important;
          }

          /* ═══════════════════════════════════════════════════════════
             SAGE ACCENT ELEMENTS
             ═══════════════════════════════════════════════════════════ */
          [data-crest-sage="1"]   { background-color: ${BRAND.sage} !important; }
          [data-crest-sage="1"] * { color: ${BRAND.black} !important; }

          /* ═══════════════════════════════════════════════════════════
             TABLE
             ═══════════════════════════════════════════════════════════ */
          .pdf-export-root table {
            border-collapse: collapse !important; width: 100% !important;
            border: 1px solid ${BRAND.border} !important;
          }
          .pdf-export-root thead,
          .pdf-export-root thead tr,
          .pdf-export-root thead th,
          .pdf-export-root thead td {
            background-color: ${BRAND.sage} !important;
            color:            ${BRAND.black} !important;
            font-size:        10px !important; font-weight: 700 !important;
            letter-spacing:   0.1em !important; text-transform: uppercase !important;
            border: none !important;
          }
          .pdf-export-root thead * { color: ${BRAND.black} !important; }
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

          /* ═══════════════════════════════════════════════════════════
             PAGE 2 — Larger text everywhere
             ═══════════════════════════════════════════════════════════ */
          .pdf-export-root .additional-details-body,
          .pdf-export-root .additional-details-body *,
          .pdf-export-root .additional-details-body .print-content-formatted,
          .pdf-export-root .additional-details-body .print-content-formatted * {
            font-size: 15px !important;
            line-height: 1.55 !important;
          }

          /* Page 2 header bar */
          .pdf-export-root .page2-header {
            background-color: ${BRAND.sage} !important;
            padding: 8px 16px !important;
            border-radius: 4px !important;
            border-bottom: 2px solid ${BRAND.darkSage} !important;
            margin-bottom: 12px !important;
          }
          .pdf-export-root .page2-header h1 {
            font-size: 22px !important;
            font-weight: 700 !important;
            color: ${BRAND.black} !important;
          }
          .pdf-export-root .page2-header span {
            font-size: 15px !important;
            color: ${BRAND.black} !important;
          }

          /* Page 2+ section headers — applies to all map pages */
          .pdf-export-root .print-section-header {
            font-size: 13px !important;
            font-weight: 700 !important;
          }

          /* Page 2+ section content */
          .pdf-export-root .print-section-content,
          .pdf-export-root .print-section-content * {
            line-height: 1.55 !important;
          }

          /* Page 1 proposed services — leave layout alone, sizing handled inline */
          .pdf-export-root[data-pdf-capture="1"] .print-section-content,
          .pdf-export-root[data-pdf-capture="1"] .print-section-content * {
            line-height: 1.4 !important;
          }

          /* ═══════════════════════════════════════════════════════════
             MULTI-PROPOSAL GRID PRICING TABLES
             ═══════════════════════════════════════════════════════════ */
          .pdf-export-root .print-pricing-table {
            border: 1px solid ${BRAND.border} !important;
            border-radius: 5px !important;
            overflow: visible !important;
            margin-bottom: 6px !important;
            padding: 6px !important;
          }
          .pdf-export-root .print-pricing-display {
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            font-size: 12px !important;
            height: 24px !important;
          }
          .pdf-export-root .print-pricing-display--left {
            justify-content: flex-start !important;
          }
          .pdf-export-root .print-pricing-money {
            gap: 1px !important;
          }
          .pdf-export-root .print-pricing-money span {
            font-size: 13px !important;
            font-weight: 600 !important;
          }
          /* Force grid layout in proposal rows */
          .pdf-export-root .print-pricing-table [class*="grid-cols-[minmax"] {
            display: grid !important;
            grid-template-columns: minmax(120px, 1fr) 60px 60px 120px 24px !important;
            gap: 4px !important;
          }

          /* ═══════════════════════════════════════════════════════════
             PEST TAGS — inline pills
             ═══════════════════════════════════════════════════════════ */
          .pdf-export-root .print-tag {
            display: inline-flex !important;
            width: auto !important;
            white-space: nowrap !important;
            font-size: 12px !important;
            padding: 3px 10px !important;
            border-radius: 12px !important;
            background-color: hsl(130, 14%, 90%) !important;
            color: ${BRAND.black} !important;
            border: 1px solid hsl(130, 10%, 72%) !important;
            margin: 2px !important;
          }
          .pdf-export-root .print-tag * {
            color: ${BRAND.black} !important;
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

        if (isPestReport) {
          clonedPage.setAttribute("data-report-type", "pest-report");
        }

        remakePricingTable(clonedPage);

        clonedPage.querySelectorAll<HTMLElement>('[class*="truncate"], [class*="overflow-hidden"]').forEach((e) => {
          if (e.closest('[class*="w-[400px]"]') || e.closest('[class*="h-[533px]"]')) return;
          sp(e, "overflow", "visible");
          sp(e, "text-overflow", "clip");
        });

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

        if (captureKey === "1") {
          const headerRoot = document.querySelector<HTMLElement>('[data-pdf-capture="0"]');
          if (headerRoot) {
            sp(headerRoot, "background-color", BRAND.sage);
            sp(headerRoot, "border-bottom", `2px solid ${BRAND.darkSage}`);
            const title = headerRoot.querySelector<HTMLElement>(".print-title, h1");
            if (title) {
              sp(title, "font-size", "24px");
              sp(title, "line-height", "1.15");
            }
            headerRoot.querySelectorAll<HTMLElement>("h2, h3").forEach((node) => {
              sp(node, "font-size", "16px");
              sp(node, "line-height", "1.2");
            });
            headerRoot.querySelectorAll<HTMLElement>("p, span, div").forEach((node) => {
              if (node.closest(".no-print")) return;
              sp(node, "font-size", "14px");
              sp(node, "line-height", "1.35");
            });
          }

          const proposedServices = clonedPage.querySelector<HTMLElement>('[data-pdf-content="proposed-services"]');
          const proposedHeader = clonedPage.querySelector<HTMLElement>('[data-pdf-section="proposed-services"] .print-section-header');
          if (proposedServices) {
            const targetSize = proposedHeader ? 13 : 12.5;
            sp(proposedServices, "font-size", `${targetSize}px`);
            sp(proposedServices, "line-height", "1.38");
            proposedServices.querySelectorAll<HTMLElement>("p, li, span, div, strong, b").forEach((node) => {
              sp(node, "font-size", `${targetSize}px`);
              sp(node, "line-height", "1.38");
            });
          }
          if (proposedHeader) {
            sp(proposedHeader, "font-size", "13px");
            sp(proposedHeader, "line-height", "1.2");
            proposedHeader.querySelectorAll<HTMLElement>("span, div").forEach((node) => {
              sp(node, "font-size", "13px");
              sp(node, "line-height", "1.2");
            });
          }
        }

        const isMapPage = !!clonedPage.querySelector('.page2-header');
        if (isMapPage) {
          const applySectionFont = (selector: string, size: number, lineHeight = 1.45) => {
            clonedPage.querySelectorAll<HTMLElement>(selector).forEach((section) => {
              sp(section, "font-size", `${size}px`);
              sp(section, "line-height", `${lineHeight}`);
              section.querySelectorAll<HTMLElement>("p, li, span, div, strong, b, label").forEach((node) => {
                sp(node, "font-size", `${size}px`);
                sp(node, "line-height", `${lineHeight}`);
              });
            });
          };

          clonedPage.querySelectorAll<HTMLElement>('.page2-header h1').forEach((node) => {
            sp(node, 'font-size', '22px');
            sp(node, 'line-height', '1.15');
          });
          clonedPage.querySelectorAll<HTMLElement>('.page2-header span, .page2-header p, .page2-header div').forEach((node) => {
            sp(node, 'font-size', '15px');
            sp(node, 'line-height', '1.25');
          });

          clonedPage.querySelectorAll<HTMLElement>('[data-pdf-section="additional-details"] .print-section-header, [data-pdf-section="limitations"] .print-section-header, [data-pdf-section="scheduling"] .print-section-header, [data-pdf-section="setup-materials"] .print-section-header').forEach((node) => {
            sp(node, 'font-size', '13px');
            sp(node, 'line-height', '1.2');
            node.querySelectorAll<HTMLElement>('span, div').forEach((child) => {
              sp(child, 'font-size', '13px');
              sp(child, 'line-height', '1.2');
            });
          });

          // Blanket apply to ALL text nodes inside each page-2 section
          const PAGE2_FONT = 14;
          ['additional-details', 'limitations'].forEach((section) => {
            const card = clonedPage.querySelector<HTMLElement>(`[data-pdf-section="${section}"]`);
            if (!card) return;
            card.querySelectorAll<HTMLElement>('p, span, div, li, strong, b, label, textarea').forEach((node) => {
              if (node.closest('.print-section-header')) return;
              sp(node, 'font-size', `${PAGE2_FONT}px`);
              sp(node, 'line-height', '1.4');
            });
          });

          const PAGE2_META_FONT = 13;
          ['scheduling', 'setup-materials'].forEach((section) => {
            const card = clonedPage.querySelector<HTMLElement>(`[data-pdf-section="${section}"]`);
            if (!card) return;
            card.querySelectorAll<HTMLElement>('p, span, div, li, strong, b, label, textarea').forEach((node) => {
              if (node.closest('.print-section-header')) return;
              sp(node, 'font-size', `${PAGE2_META_FONT}px`);
              sp(node, 'line-height', '1.35');
            });
          });

          clonedPage.querySelectorAll<HTMLElement>('[data-pdf-section="scheduling"] .text-foreground, [data-pdf-section="scheduling"] .text-muted-foreground, [data-pdf-section="setup-materials"] .text-foreground, [data-pdf-section="setup-materials"] .font-semibold, [data-pdf-section="setup-materials"] p').forEach((node) => {
            if (node.closest('.print-section-header')) return;
            sp(node, 'font-size', '13px');
            sp(node, 'line-height', '1.3');
          });

          const detailsBody = clonedPage.querySelector<HTMLElement>('.additional-details-body .print-content-formatted');
          const detailsCard = clonedPage.querySelector<HTMLElement>('.additional-details-card');
          if (detailsBody && detailsCard) {
            let fontSize = 13;
            const minFont = 12;
            while (fontSize > minFont && detailsBody.scrollHeight > detailsCard.clientHeight + 2) {
              fontSize -= 0.25;
              sp(detailsBody, 'font-size', `${fontSize}px`);
              detailsBody.querySelectorAll<HTMLElement>('p, li, span, div, strong, b').forEach((node) => {
                sp(node, 'font-size', `${fontSize}px`);
              });
            }
          }
        }
      },
    });

    return canvas.toDataURL("image/jpeg", 0.95);
  } finally {
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
