import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import html2canvas from "html2canvas";

const TEMPLATE_PDF_URL = "/proposal-template.pdf";
const A4_LANDSCAPE_WIDTH_PX = 1800;

// Optional capture overrides used by buildSimplePDF({ compact: true }) to
// produce a smaller PDF (used for the FieldRoutes auto-upload, where the
// middleware sometimes 502s on multi-MB files).
let __captureScaleOverride: number | null = null;
let __captureQualityOverride: number | null = null;

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
      sp(th, "font-size", "11px");
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
        sp(cell, "font-size", "14px");
        sp(cell, "font-weight", "500");
        sp(cell, "color", BRAND.black);
      } else if (colIdx === 1 || colIdx === 2) {
        sp(cell, "font-size", "16px");
        sp(cell, "font-weight", "700");
        sp(cell, "color", BRAND.black);
      } else if (colIdx === 3) {
        sp(cell, "font-size", "13px");
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
      sp(cell, "font-size", colIdx >= 1 && colIdx <= 2 ? "17px" : "15px");
    });
  }
}

async function captureElement(el: HTMLElement): Promise<string> {
  const captureKey = el.dataset.pdfCapture;
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
      scale: __captureScaleOverride ?? 2,
      useCORS: true,
      allowTaint: false,
      backgroundColor: "#ffffff",
      logging: false,
      onclone: (clonedDoc) => {
        const style = clonedDoc.createElement("style");
        style.textContent = `${getPrintCssText()}\n
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
            color: ${BRAND.black} !important;
          }

          .pdf-export-root [class*="max-w-"]        { max-width: none !important; }
          .pdf-export-root [class*="bg-background"] { background: #ffffff !important; }

          /* ═══════════════════════════════════════════════════════════
             PAGE 1 HEADER — preserve live sizing, only normalize colors
             ═══════════════════════════════════════════════════════════ */
          .pdf-export-root [class*="print-header"],
          .pdf-export-root.print-header {
            background-color: ${BRAND.sage} !important;
            border-bottom: 2px solid ${BRAND.darkSage} !important;
          }

          /* Header info grid — bigger text */
          .pdf-export-root.print-header .print-title,
          .pdf-export-root [class*="print-header"] .print-title {
            font-size: 28px !important;
            font-weight: 700 !important;
          }
          .pdf-export-root.print-header [class*="font-semibold"],
          .pdf-export-root [class*="print-header"] [class*="font-semibold"] {
            font-size: 16px !important;
          }
          .pdf-export-root.print-header [class*="text-base"],
          .pdf-export-root [class*="print-header"] [class*="text-base"],
          .pdf-export-root.print-header [class*="text-sm"],
          .pdf-export-root [class*="print-header"] [class*="text-sm"] {
            font-size: 15px !important;
            line-height: 1.5 !important;
          }
          .pdf-export-root.print-header [class*="text-muted-foreground"],
          .pdf-export-root [class*="print-header"] [class*="text-muted-foreground"] {
            font-size: 15px !important;
          }
          .pdf-export-root.print-header [class*="font-medium"],
          .pdf-export-root [class*="print-header"] [class*="font-medium"] {
            font-size: 15px !important;
          }

          /* Hide noise */
          .pdf-export-root .no-print,
          .pdf-export-root .no-pdf-export,
          .no-pdf-export,
          .pdf-export-root button:not(.print-keep),
          .pdf-export-root [role="status"],
          .pdf-export-root .sonner,
          .pdf-export-root [data-sonner-toaster]             { display: none !important; }
          .pdf-export-root .print-only-text                  { display: inline !important; }
          .pdf-export-root .hidden.print\\:flex,
          .pdf-export-root [class*="hidden"][class*="print\\:flex"] { display: flex !important; }
          .pdf-export-root .hidden.print\\:grid,
          .pdf-export-root [class*="hidden"][class*="print\\:grid"] { display: grid !important; }
          .pdf-export-root .hidden.print\\:block,
          .pdf-export-root [class*="hidden"][class*="print\\:block"] { display: block !important; }
          .pdf-export-root [class*="print\\:hidden"],
          .pdf-export-root .print\\:hidden                   { display: none !important; }
          .pdf-export-root .print-content-formatted,
          .pdf-export-root [data-pdf-content]                { display: block !important; }
          .pdf-export-root [class*="print\\:grid-cols-3"]    { grid-template-columns: 1fr 1fr 1fr !important; }

          /* ── Proposal text scale ────────────────────────────────── */
          .pdf-export-root p, .pdf-export-root li            { font-size: inherit !important; line-height: 1.45 !important; }
          .pdf-export-root [class*="text-xs"]                { font-size: 12px !important; line-height: 1.5 !important; }
          .pdf-export-root [class*="text-sm"]                { font-size: 13px !important; line-height: 1.55 !important; }
          .pdf-export-root [class*="text-base"]              { font-size: 13px !important; line-height: 1.55 !important; }
          .pdf-export-root [class*="text-lg"]                { font-size: 14px !important; line-height: 1.5 !important; }
          .pdf-export-root [class*="text-xl"]                { font-size: 16px !important; line-height: 1.4 !important; }
          .pdf-export-root [class*="text-2xl"]               { font-size: 20px !important; line-height: 1.3 !important; }
          .pdf-export-root [class*="text-\\[8px\\]"]         { font-size: 10px  !important; line-height: 1.55 !important; }
          .pdf-export-root [class*="text-\\[9px\\]"]         { font-size: 11px !important; line-height: 1.55 !important; }
          .pdf-export-root [class*="text-\\[10px\\]"]        { font-size: 12px !important; line-height: 1.55 !important; }
          .pdf-export-root [class*="text-\\[11px\\]"]        { font-size: 13px !important; line-height: 1.55 !important; }
          /* Products & Pesticide Notice — keep small */
          .pdf-export-root [class*="columns-2"] *            { font-size: 10.5px !important; line-height: 1.65 !important; }
          .pdf-export-root [class*="columns-2"] p,
          .pdf-export-root [class*="columns-2"] li           { margin: 1px 0 !important; }
          .pdf-export-root h1 { font-size: 21px !important; font-weight: 700 !important; overflow: visible !important; }
          .pdf-export-root h2 { font-size: 17px !important; font-weight: 700 !important; overflow: visible !important; }
          .pdf-export-root h3 { font-size: 14px !important; font-weight: 600 !important; overflow: visible !important; }
          .pdf-export-root ul li, .pdf-export-root ol li { margin-bottom: 3px !important; }
          /* Crest Guarantee — bigger */
          .pdf-export-root .crest-guarantee-text { font-size: 16px !important; line-height: 1.45 !important; }
          .pdf-export-root .crest-guarantee-text * { font-size: 16px !important; }

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
            font-size:        11px !important; font-weight: 700 !important;
            letter-spacing:   0.1em !important; text-transform: uppercase !important;
            border: none !important;
          }
          .pdf-export-root thead * { color: ${BRAND.black} !important; }
          .pdf-export-root tbody td {
            padding: 10px 14px !important; vertical-align: middle !important;
            font-size: 14px !important; border-bottom: 1px solid ${BRAND.border} !important;
          }
          .pdf-export-root tbody tr:nth-child(even) td { background-color: ${BRAND.sageTint} !important; }
          .pdf-export-root tfoot td, .pdf-export-root tfoot th {
            border-top: 2px solid ${BRAND.black} !important;
            font-weight: 700 !important; font-size: 15px !important; padding: 11px 14px !important;
          }

          /* ═══════════════════════════════════════════════════════════
             BORDERS & POLISH
             ═══════════════════════════════════════════════════════════ */
          .pdf-export-root [class*="border"]     { border-color: ${BRAND.border} !important; }
          .pdf-export-root [class*="rounded-lg"],
          .pdf-export-root [class*="rounded-xl"],
          .pdf-export-root [class*="rounded-md"] { border-radius: 8px !important; }
          .pdf-export-root [class*="border-t"]   {
            border-top-color: ${BRAND.darkSage} !important; border-top-width: 2px !important;
          }

          /* ═══════════════════════════════════════════════════════════
             PAGE 2+ MAP PAGES — consistent styling
             ═══════════════════════════════════════════════════════════ */
          /* Additional Details body text */
          .pdf-export-root .additional-details-body,
          .pdf-export-root .additional-details-body *,
          .pdf-export-root .additional-details-body .print-content-formatted,
          .pdf-export-root .additional-details-body .print-content-formatted * {
            font-size: 12px !important;
            line-height: 1.45 !important;
          }

          /* Page 2+ header bar */
          .pdf-export-root .page2-header {
            background-color: ${BRAND.sage} !important;
            padding: 8px 16px !important;
            border-radius: 8px !important;
            border-bottom: 2px solid ${BRAND.darkSage} !important;
            margin-bottom: 12px !important;
          }
          .pdf-export-root .page2-header h1 {
            font-size: 20px !important;
            font-weight: 700 !important;
            color: ${BRAND.black} !important;
          }
          .pdf-export-root .page2-header span {
            font-size: 13px !important;
            color: ${BRAND.black} !important;
          }

          /* Section headers (Proposed Services, Additional Details, Setup Materials) */
          .pdf-export-root .print-section-header {
            background-color: ${BRAND.black} !important;
            padding: 6px 12px !important;
            border-radius: 8px 8px 0 0 !important;
            display: flex !important;
            align-items: center !important;
            min-height: 28px !important;
          }
          .pdf-export-root .print-section-header span {
            font-size: 12px !important;
            font-weight: 700 !important;
            letter-spacing: 0.08em !important;
            color: #ffffff !important;
            line-height: 1.1 !important;
          }

          .pdf-export-root .print-content-formatted,
          .pdf-export-root .print-content-formatted *,
          .pdf-export-root .pdf-services-content,
          .pdf-export-root .pdf-services-content * {
            font-size: 12px !important;
            line-height: 1.42 !important;
            color: ${BRAND.black} !important;
          }
          .pdf-export-root .print-content-formatted b,
          .pdf-export-root .print-content-formatted strong,
          .pdf-export-root .pdf-services-content b,
          .pdf-export-root .pdf-services-content strong {
            font-size: 13px !important;
            font-weight: 700 !important;
          }

          .pdf-export-root .print-section {
            border: 1px solid ${BRAND.border} !important;
            border-radius: 8px !important;
            overflow: visible !important;
          }

          .pdf-export-root .print-section-content,
          .pdf-export-root .print-section-content * {
            line-height: 1.4 !important;
            vertical-align: top !important;
          }

          /* Page 1 proposed services — keep visible and close to desktop sizing */
          .pdf-export-root[data-pdf-capture="1"] .print-section-content,
          .pdf-export-root[data-pdf-capture="1"] .print-section-content * {
            line-height: 1.4 !important;
          }

           /* ═══════════════════════════════════════════════════════════
              MULTI-PROPOSAL PRICING — Option header + table
              ═══════════════════════════════════════════════════════════ */
           .pdf-export-root .print-pricing-wrapper {
             margin-bottom: 14px !important;
           }
           .pdf-export-root .proposal-option-header {
             display: flex !important;
             align-items: center !important;
             gap: 10px !important;
             margin-bottom: 4px !important;
           }
           .pdf-export-root .proposal-name-shell {
             display: flex !important;
             align-items: center !important;
             min-height: 34px !important;
             padding: 7px 16px !important;
             border: none !important;
             border-radius: 8px !important;
             background-color: #404040 !important;
             flex: 1 !important;
           }
           .pdf-export-root .proposal-name-text,
           .pdf-export-root .proposal-name-print {
             display: block !important;
             color: #ffffff !important;
             font-size: 16px !important;
             font-weight: 700 !important;
             line-height: 1.2 !important;
             letter-spacing: 0.04em !important;
           }
           .pdf-export-root .proposal-recommended-tag {
             display: inline-flex !important;
             align-items: center !important;
             background-color: ${BRAND.black} !important;
             color: #ffffff !important;
             padding: 6px 14px !important;
             border-radius: 8px !important;
             font-size: 12px !important;
             font-weight: 800 !important;
             letter-spacing: 0.15em !important;
             text-transform: uppercase !important;
             white-space: nowrap !important;
           }
           .pdf-export-root .print-pricing-table {
             border: 1px solid ${BRAND.border} !important;
             border-radius: 10px !important;
             overflow: hidden !important;
             margin-bottom: 0 !important;
             padding: 0 !important;
             background-color: #ffffff !important;
             box-shadow: none !important;
           }
           .pdf-export-root .print-pricing-table[data-recommended="true"] {
             border: 2px solid ${BRAND.darkSage} !important;
           }
           .pdf-export-root .proposal-recommended-badge { display: none !important; }

           /* ── Print-only proposal table ── */
           .pdf-export-root .proposal-print-table {
             display: table !important;
             width: 100% !important;
             border-collapse: separate !important;
             border-spacing: 0 !important;
             border: none !important;
             margin: 0 !important;
             font-family: inherit !important;
           }
           .pdf-export-root .proposal-print-table thead th {
             background-color: ${BRAND.sage} !important;
             color: ${BRAND.black} !important;
             font-size: 11px !important;
             font-weight: 700 !important;
             letter-spacing: 0.1em !important;
             text-transform: uppercase !important;
             padding: 10px 16px !important;
             border: none !important;
             border-bottom: 2px solid ${BRAND.darkSage} !important;
             white-space: nowrap !important;
           }
           .pdf-export-root .proposal-print-table tbody td {
             padding: 10px 16px !important;
             font-size: 13px !important;
             color: ${BRAND.black} !important;
             border-bottom: 1px solid #e8ebe8 !important;
             border-top: none !important;
             border-left: none !important;
             border-right: none !important;
             background-color: #ffffff !important;
             vertical-align: middle !important;
           }
           .pdf-export-root .proposal-print-table tbody tr:nth-child(even) td {
             background-color: ${BRAND.sageTint} !important;
           }
           .pdf-export-root .proposal-print-table tbody td:first-child {
             font-weight: 500 !important;
           }
           .pdf-export-root .proposal-print-table tfoot td {
             padding: 10px 16px !important;
             font-size: 14px !important;
             border-top: 2px solid ${BRAND.black} !important;
             border-bottom: none !important;
             border-left: none !important;
             border-right: none !important;
             background-color: #ffffff !important;
             color: ${BRAND.black} !important;
           }

           /* Schedule pills inside print table */
           .pdf-export-root .proposal-schedule-pills {
             display: inline-flex !important;
             flex-wrap: wrap !important;
             gap: 3px !important;
           }
           .pdf-export-root .schedule-pill {
             display: inline-block !important;
             padding: 2px 6px !important;
             border-radius: 4px !important;
             font-size: 10px !important;
             background-color: #eef1ee !important;
             color: #666 !important;
             white-space: nowrap !important;
           }
           .pdf-export-root .schedule-pill--first {
             background-color: ${BRAND.darkSage} !important;
             color: #ffffff !important;
             font-weight: 600 !important;
           }

           /* Hide the interactive grid in PDF — ONLY for multi-proposal cards
              (which have a sibling/descendant <table class="proposal-print-table">).
              The legacy single-sales pricing card has no inner <table> and must
              keep its .space-y-1 grid visible so prices render in the PDF. */
           .pdf-export-root .print-pricing-table:has(table.proposal-print-table) > .space-y-1 { display: none !important; }
           /* Ensure the name row doesn't add extra spacing (multi-proposal only) */
           .pdf-export-root .print-pricing-table:has(table.proposal-print-table) > .mb-1\\.5 {
             margin: 0 !important;
             padding: 0 !important;
           }
           .pdf-export-root .print-pricing-table:has(table.proposal-print-table) > .mb-1\\.5 > div > div {
             gap: 0 !important;
           }

          /* ═══════════════════════════════════════════════════════════
             PEST TAGS — inline pills
             ═══════════════════════════════════════════════════════════ */
          .pdf-export-root .print-tag {
            display: inline-flex !important;
            width: auto !important;
            white-space: nowrap !important;
            font-size: 13px !important;
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
        if (isPestReport) {
          // Initial Pest Report — larger, prettier PDF typography.
          // Overrides above 12-13px defaults so the downloaded PDF
          // doesn't feel barren. Scoped to the pest-report wrapper only.
          style.textContent += `
            .pdf-export-root[data-report-type="initial-pest"] .print-section-header,
            .pdf-export-root[data-report-type="initial-pest"] .print-section-header * {
              font-size: 24px !important;
              letter-spacing: 0.06em !important;
              min-height: 46px !important;
              padding-top: 11px !important;
              padding-bottom: 10px !important;
              line-height: 1.2 !important;
              color: #ffffff !important;
              font-weight: 800 !important;
              text-transform: uppercase !important;
            }
            /* Belt-and-suspenders: force the bar's first text node white
               even if a Tailwind text-* utility (e.g. text-dark-sage) was
               applied directly to the h2. */
            .pdf-export-root[data-report-type="initial-pest"] h2.print-section-header,
            .pdf-export-root[data-report-type="initial-pest"] .print-section-header > * {
              color: #ffffff !important;
            }
            .pdf-export-root[data-report-type="initial-pest"] .print-content-formatted,
            .pdf-export-root[data-report-type="initial-pest"] .print-content-formatted *,
            .pdf-export-root[data-report-type="initial-pest"] .pdf-services-content,
            .pdf-export-root[data-report-type="initial-pest"] .pdf-services-content * {
              font-size: 26px !important;
              line-height: 1.5 !important;
              font-weight: 500 !important;
              color: ${BRAND.black} !important;
              letter-spacing: 0.005em !important;
            }
            .pdf-export-root[data-report-type="initial-pest"] .print-content-formatted b,
            .pdf-export-root[data-report-type="initial-pest"] .print-content-formatted strong {
              font-size: 27px !important;
              font-weight: 800 !important;
              color: #111111 !important;
            }
            .pdf-export-root[data-report-type="initial-pest"] .print-content-formatted {
              padding: 18px 22px 20px 22px !important;
            }
            .pdf-export-root[data-report-type="initial-pest"] .print-section-content,
            .pdf-export-root[data-report-type="initial-pest"] .print-section-content * {
              font-size: 22px !important;
              line-height: 1.5 !important;
            }
            .pdf-export-root[data-report-type="initial-pest"] .print-section-content li {
              margin-bottom: 6px !important;
            }
            .pdf-export-root[data-report-type="initial-pest"] .print-tag,
            .pdf-export-root[data-report-type="initial-pest"] .print-tag * {
              font-size: 22px !important;
              padding: 8px 20px !important;
              border-radius: 999px !important;
            }
            .pdf-export-root[data-report-type="initial-pest"] .print-tags {
              gap: 10px !important;
              padding: 14px 18px !important;
            }
            .pdf-export-root[data-report-type="initial-pest"] .print-section {
              border-radius: 10px !important;
              border: 1px solid ${BRAND.border} !important;
              margin-bottom: 14px !important;
            }
          `;
        }
        clonedDoc.head.appendChild(style);

        if (!captureKey) return;

        const clonedPage = clonedDoc.querySelector<HTMLElement>(`[data-pdf-capture="${captureKey}"]`);
        if (!clonedPage) return;

        clonedPage.classList.add("pdf-export-root");
        clonedPage.style.width = `${A4_LANDSCAPE_WIDTH_PX}px`;
        clonedPage.style.minWidth = `${A4_LANDSCAPE_WIDTH_PX}px`;
        clonedPage.style.maxWidth = `${A4_LANDSCAPE_WIDTH_PX}px`;
        clonedPage.style.background = "#ffffff";
        clonedPage.style.boxSizing = "border-box";
        clonedPage.style.overflow = "visible";
        clonedPage.style.padding = "0";

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

        clonedPage.style.display = "flex";
        clonedPage.style.flexDirection = "column";

        if (captureKey === "1") {
          const headerRoot = clonedDoc.querySelector<HTMLElement>('[data-pdf-capture="0"]');
          if (headerRoot) {
            sp(headerRoot, "background-color", BRAND.sage);
            sp(headerRoot, "border-bottom", `2px solid ${BRAND.darkSage}`);
          }

          const proposedServices = clonedPage.querySelector<HTMLElement>('[data-pdf-content="proposed-services"]');
          const proposedHeader = clonedPage.querySelector<HTMLElement>('[data-pdf-section="proposed-services"] .print-section-header');
          if (proposedServices) {
            const targetSize = proposedHeader ? 12.5 : 12;
            sp(proposedServices, "font-size", `${targetSize}px`);
            sp(proposedServices, "line-height", "1.42");
            proposedServices.querySelectorAll<HTMLElement>("p, li, span, div, strong, b").forEach((node) => {
              sp(node, "font-size", `${targetSize}px`);
              sp(node, "line-height", "1.42");
            });
          }
          if (proposedHeader) {
            sp(proposedHeader, "font-size", "12px");
            sp(proposedHeader, "line-height", "1.2");
            proposedHeader.querySelectorAll<HTMLElement>("span, div").forEach((node) => {
              sp(node, "font-size", "12px");
              sp(node, "line-height", "1.2");
            });
          }
        }

        const isMapPage = !!clonedPage.querySelector('.page2-header');
        if (isMapPage) {
          clonedPage.querySelectorAll<HTMLElement>('.page2-header h1').forEach((node) => {
            sp(node, 'font-size', '24px');
            sp(node, 'line-height', '1.1');
          });
          clonedPage.querySelectorAll<HTMLElement>('.page2-header span, .page2-header p, .page2-header div').forEach((node) => {
            sp(node, 'font-size', '16px');
            sp(node, 'line-height', '1.15');
          });

          clonedPage.querySelectorAll<HTMLElement>('.print-section-header').forEach((node) => {
            sp(node, 'background-color', '#FFFFFF');
            sp(node, 'padding', '6px 12px');
            sp(node, 'display', 'flex');
            sp(node, 'align-items', 'center');
            node.querySelectorAll<HTMLElement>('span, div').forEach((child) => {
              sp(child, 'font-size', '14px');
              sp(child, 'font-weight', '700');
              sp(child, 'letter-spacing', '0.08em');
              sp(child, 'line-height', '1.1');
              sp(child, 'color', BRAND.black);
            });
          });

          clonedPage.querySelectorAll<HTMLElement>('.pdf-services-content, .print-content-formatted, [data-pdf-content="proposed-services"]').forEach((node) => {
            sp(node, 'font-size', '16px');
            sp(node, 'line-height', '1.4');
            node.querySelectorAll<HTMLElement>('p, li, span, div').forEach((child) => {
              sp(child, 'font-size', '16px');
              sp(child, 'line-height', '1.4');
              sp(child, 'margin-top', '0');
              sp(child, 'vertical-align', 'top');
            });
            node.querySelectorAll<HTMLElement>('b, strong').forEach((child) => {
              sp(child, 'font-size', '17px');
              sp(child, 'font-weight', '700');
            });
          });

          const DETAIL_FONT = 16;
          ['additional-details', 'limitations'].forEach((section) => {
            const card = clonedPage.querySelector<HTMLElement>(`[data-pdf-section="${section}"]`);
            if (!card) return;
            card.querySelectorAll<HTMLElement>('p, span, div, li, strong, b, label, textarea').forEach((node) => {
              if (node.closest('.print-section-header')) return;
              sp(node, 'font-size', `${DETAIL_FONT}px`);
              sp(node, 'line-height', '1.3');
              sp(node, 'margin-top', '0');
              sp(node, 'vertical-align', 'top');
            });
          });

          const PAGE2_META_FONT = 17;
          ['scheduling', 'setup-materials'].forEach((section) => {
            const card = clonedPage.querySelector<HTMLElement>(`[data-pdf-section="${section}"]`);
            if (!card) return;
            card.querySelectorAll<HTMLElement>('p, span, div, li, strong, b, label, textarea').forEach((node) => {
              if (node.closest('.print-section-header')) return;
              sp(node, 'font-size', `${PAGE2_META_FONT}px`);
              sp(node, 'line-height', '1.25');
              sp(node, 'margin-top', '0');
              sp(node, 'vertical-align', 'top');
            });
          });
        }
      },
    });

    return canvas.toDataURL("image/jpeg", __captureQualityOverride ?? 0.95);
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
      const availH = Math.max(headerDrawY, 0);
      const scaleW = pageW / img.width;
      const scaleH = availH / img.height;
      const scale = Math.min(scaleW, scaleH);
      const drawW = img.width * scale;
      const drawH = img.height * scale;
      const drawX = (pageW - drawW) / 2;
      page.drawImage(img, { x: drawX, y: Math.max(headerDrawY - drawH, 0), width: drawW, height: drawH });
      pendingHeaderImg = null;
    } else {
      const margin = 4;
      const contentW = pageW - margin * 2;
      const contentH = pageH - margin * 2;
      const scaleW = contentW / img.width;
      const scaleH = contentH / img.height;
      const scale = Math.min(scaleW, scaleH);
      const drawW = img.width * scale;
      const drawH = img.height * scale;
      const drawX = (pageW - drawW) / 2;
      const drawY = pageH - margin - drawH;
      page.drawImage(img, { x: drawX, y: Math.max(drawY, margin), width: drawW, height: drawH });
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
export async function buildSimplePDF(options: { reportPages: HTMLElement[]; compact?: boolean }): Promise<Uint8Array> {
  const { reportPages, compact } = options;
  if (compact) {
    __captureScaleOverride = 1.25;
    __captureQualityOverride = 0.6;
  }
  try {
  const outDoc = await PDFDocument.create();
  const pageW = 842;
  const pageH = 595;
      const MARGIN = 12;

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
      // Header + Page 1 combined
      const headerDrawH = pendingHeaderImg.height * (pageW / pendingHeaderImg.width);
      const headerDrawY = pageH - headerDrawH;
      page.drawImage(pendingHeaderImg, { x: 0, y: headerDrawY, width: pageW, height: headerDrawH });
      const availH = Math.max(headerDrawY - MARGIN, 0);
      const contentW = pageW - MARGIN * 2;
      const scaleW = contentW / img.width;
      const scaleH = availH / img.height;
      const scale = Math.min(scaleW, scaleH);
      const drawW = img.width * scale;
      const drawH = img.height * scale;
      const drawX = (pageW - drawW) / 2;
      page.drawImage(img, { x: drawX, y: Math.max(headerDrawY - drawH - MARGIN / 2, MARGIN), width: drawW, height: drawH });
      pendingHeaderImg = null;
    } else {
      // Scale to fit page while preserving aspect ratio
      const contentW = pageW - MARGIN * 2;
      const contentH = pageH - MARGIN * 2;
      const scaleW = contentW / img.width;
      const scaleH = contentH / img.height;
      const scale = Math.min(scaleW, scaleH);
      const drawW = img.width * scale;
      const drawH = img.height * scale;
      const drawX = (pageW - drawW) / 2;
      const drawY = pageH - MARGIN - drawH; // top-aligned with margin
      page.drawImage(img, { x: drawX, y: Math.max(drawY, MARGIN), width: drawW, height: drawH });
    }
  }

  return outDoc.save();
  } finally {
    if (compact) {
      __captureScaleOverride = null;
      __captureQualityOverride = null;
    }
  }
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

// ─── buildSignedReportPDF ────────────────────────────────────────────────────
// Captures a single root element (e.g., the customer-facing report view) as
// a tall canvas, then slices it into A4-landscape PDF pages. Used to email
// the signed proposal back to the customer after they sign.
export async function buildSignedReportPDF(root: HTMLElement): Promise<Uint8Array> {
  const canvas = await html2canvas(root, {
    scale: 2,
    useCORS: true,
    allowTaint: false,
    backgroundColor: "#ffffff",
    logging: false,
    windowWidth: Math.max(root.scrollWidth, 1100),
  });

  const outDoc = await PDFDocument.create();
  // A4 landscape in points
  const pageW = 842;
  const pageH = 595;
  const MARGIN = 16;
  const contentW = pageW - MARGIN * 2;
  const contentH = pageH - MARGIN * 2;

  const totalImgW = canvas.width;
  const totalImgH = canvas.height;
  // Scale so the image fits content width
  const scale = contentW / totalImgW;
  const sliceHeightPx = Math.floor(contentH / scale); // source-pixel height per page

  let y = 0;
  while (y < totalImgH) {
    const sliceH = Math.min(sliceHeightPx, totalImgH - y);
    const sliceCanvas = document.createElement("canvas");
    sliceCanvas.width = totalImgW;
    sliceCanvas.height = sliceH;
    const ctx = sliceCanvas.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height);
    ctx.drawImage(canvas, 0, y, totalImgW, sliceH, 0, 0, totalImgW, sliceH);
    const dataUrl = sliceCanvas.toDataURL("image/jpeg", 0.92);
    const imgBytes = await fetch(dataUrl).then((r) => r.arrayBuffer());
    const img = await outDoc.embedJpg(imgBytes);
    const page = outDoc.addPage([pageW, pageH]);
    const drawW = totalImgW * scale;
    const drawH = sliceH * scale;
    page.drawImage(img, {
      x: (pageW - drawW) / 2,
      y: pageH - MARGIN - drawH,
      width: drawW,
      height: drawH,
    });
    y += sliceH;
  }

  return outDoc.save();
}
