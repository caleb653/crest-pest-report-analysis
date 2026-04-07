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

// ─── Shorthand: setProperty with !important ───────────────────────────────────
function sp(el: HTMLElement, prop: string, val: string) {
  el.style.setProperty(prop, val, "important");
}

// ─── Class-name patterns ───────────────────────────────────────────────────────
// These are checked against the LIVE DOM where CSS variables are resolved
// (more reliable than getComputedStyle in an html2canvas iframe clone).
const DARK_PATTERNS = [
  "bg-[#2",
  "bg-[#1",
  "bg-[#0", // arbitrary dark hex values
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

// ─── Pricing table complete remake ───────────────────────────────────────────
function remakePricingTable(root: HTMLElement) {
  const table = root.querySelector<HTMLTableElement>("table");
  if (!table) return;

  sp(table, "border-collapse", "collapse");
  sp(table, "width", "100%");

  // Header cells
  table.querySelectorAll<HTMLElement>("thead th, thead td").forEach((th) => {
    // Background/color are already handled by [data-crest-dark] CSS,
    // but we reinforce here for max specificity
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
      sp(c, "letter-spacing", "0.1em");
    });
  });

  // Body rows
  table.querySelectorAll<HTMLTableRowElement>("tbody tr").forEach((row, rowIdx) => {
    if (row.textContent?.match(/\btotal\b/i)) return; // handled below

    const cells = row.querySelectorAll<HTMLElement>("td");
    const isEven = rowIdx % 2 === 1;

    cells.forEach((cell, colIdx) => {
      sp(cell, "padding", "10px 14px");
      sp(cell, "vertical-align", "middle");
      sp(cell, "border-bottom", `1px solid ${BRAND.border}`);
      sp(cell, "background-color", isEven ? BRAND.sageTint : "#ffffff");

      if (colIdx === 0) {
        sp(cell, "font-size", "13px");
        sp(cell, "font-weight", "500");
        sp(cell, "color", BRAND.black);
      } else if (colIdx === 1 || colIdx === 2) {
        // Initial / Recurring — large and bold
        sp(cell, "font-size", "15px");
        sp(cell, "font-weight", "700");
        sp(cell, "color", BRAND.black);
      } else if (colIdx === 3) {
        sp(cell, "font-size", "12px");
        sp(cell, "color", "#555555");
      }
      // colIdx >= 4 (Schedule) — intentionally left unstyled so month chips
      // keep their own colours and the text remains visible
    });
  });

  // Total row — found by text content, not position
  let totalRow: HTMLElement | null = null;
  table.querySelectorAll<HTMLElement>("tfoot tr, tbody tr").forEach((row) => {
    if (row.textContent?.match(/\btotal\b/i)) totalRow = row;
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

  // ══════════════════════════════════════════════════════════════════════════
  // PRE-MARK dark and sage elements in the LIVE DOM before html2canvas clones
  // the document. Attributes are cloned too, so our CSS inside onclone can
  // target [data-crest-dark] / [data-crest-sage] with 100% reliability — no
  // getComputedStyle issues, no CSS-variable resolution problems.
  // ══════════════════════════════════════════════════════════════════════════
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

  // thead th/td get dark bg from CSS — they may not carry a dark bg class
  el.querySelectorAll<HTMLElement>("thead th, thead td, thead tr").forEach((th) => {
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

          /* Safe global rendering — NO colour or word-break overrides */
          * {
            hyphens: none !important; -webkit-hyphens: none !important;
            -webkit-font-smoothing: antialiased !important;
            text-rendering: optimizeLegibility !important;
          }

          .pdf-export-root {
            background: #ffffff !important; box-sizing: border-box !important;
            overflow: visible !important;
            /* Soft base — explicit Tailwind classes still override this */
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

          /* ═══════════════════════════════════════════════════════════════
             DARK SECTION HEADERS  (pre-marked with data-crest-dark)
             Works even when CSS variables aren't loaded in the iframe.
             ═══════════════════════════════════════════════════════════════ */
          [data-crest-dark="1"] {
            background-color: ${BRAND.black} !important;
            color:            ${BRAND.offWhite} !important;
          }
          /* ALL descendants must be off-white — no exceptions */
          [data-crest-dark="1"] * {
            color:          ${BRAND.offWhite} !important;
            letter-spacing: 0.07em !important;
          }

          /* ═══════════════════════════════════════════════════════════════
             SAGE ACCENT ELEMENTS  (pre-marked with data-crest-sage)
             ═══════════════════════════════════════════════════════════════ */
          [data-crest-sage="1"] {
            background-color: ${BRAND.sage} !important;
          }
          [data-crest-sage="1"] * {
            color: ${BRAND.black} !important;
          }

          /* ═══════════════════════════════════════════════════════════════
             HEADINGS — explicit sizes so page titles are always readable
             ═══════════════════════════════════════════════════════════════ */
          .pdf-export-root h1 { font-size: 22px !important; font-weight: 700 !important; line-height: 1.2 !important; }
          .pdf-export-root h2 { font-size: 18px !important; font-weight: 700 !important; line-height: 1.3 !important; }
          .pdf-export-root h3 { font-size: 15px !important; font-weight: 600 !important; line-height: 1.4 !important; }

          /* ═══════════════════════════════════════════════════════════════
             TEXT SIZE NORMALISATION
             Only text-sm / text-base → 13px.
             text-xs stays at its natural small size (it's often used for
             section header labels — we must NOT set colour here).
             text-lg and above: untouched so real headings stay large.
             ═══════════════════════════════════════════════════════════════ */
          .pdf-export-root [class*="text-sm"]   { font-size: 13px !important; line-height: 1.55 !important; }
          .pdf-export-root [class*="text-base"] { font-size: 13px !important; line-height: 1.55 !important; }

          /* Compact text — font-size ONLY, never colour (it kills section labels) */
          .pdf-export-root [class*="text-xs"]       { font-size: 11px !important; line-height: 1.5 !important; }
          .pdf-export-root [class*="text-\\[8px\\]"]  { font-size: 8px  !important; line-height: 1.55 !important; }
          .pdf-export-root [class*="text-\\[9px\\]"]  { font-size: 9px  !important; line-height: 1.55 !important; }
          .pdf-export-root [class*="text-\\[10px\\]"] { font-size: 10px !important; line-height: 1.55 !important; }
          .pdf-export-root [class*="text-\\[11px\\]"] { font-size: 11px !important; line-height: 1.55 !important; }

          /* Products two-column list */
          .pdf-export-root [class*="columns-2"] *  { font-size: 9.5px !important; line-height: 1.65 !important; }
          .pdf-export-root [class*="columns-2"] p,
          .pdf-export-root [class*="columns-2"] li { margin: 1px 0 !important; }

          /* ═══════════════════════════════════════════════════════════════
             TABLE — CSS layer (JS layer adds higher specificity on top)
             ═══════════════════════════════════════════════════════════════ */
          .pdf-export-root table {
            border-collapse: collapse !important; width: 100% !important;
            border: 1px solid ${BRAND.border} !important;
          }

          /* Header cells — also covered by [data-crest-dark] but reinforce */
          .pdf-export-root thead th,
          .pdf-export-root thead td {
            font-size:      10px !important;
            font-weight:    700 !important;
            letter-spacing: 0.1em !important;
            text-transform: uppercase !important;
            padding:        11px 14px !important;
            border:         none !important;
            white-space:    nowrap !important;
            vertical-align: middle !important;
          }

          /* Body cells */
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
          .pdf-export-root tfoot td, .pdf-export-root tfoot th {
            border-top:  2px solid ${BRAND.black} !important;
            font-weight: 700 !important;
            font-size:   14px !important;
            padding:     11px 14px !important;
          }

          /* ═══════════════════════════════════════════════════════════════
             BORDERS & POLISH
             ═══════════════════════════════════════════════════════════════ */
          .pdf-export-root [class*="border"]     { border-color: ${BRAND.border} !important; }
          .pdf-export-root [class*="rounded-lg"],
          .pdf-export-root [class*="rounded-md"] { border-radius: 5px !important; }
          .pdf-export-root [class*="border-t"]   {
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

        // ── Phase 2: JS — table DOM manipulation ─────────────────────────────
        // Adds inline-style !important on top of the CSS layer for max certainty
        remakePricingTable(clonedPage);

        // ── Phase 2b: Title — remove width constraints ──────────────────────
        clonedPage.querySelectorAll<HTMLElement>(".print-title").forEach((el) => {
          sp(el, "width", "auto");
          sp(el, "max-width", "none");
          sp(el, "min-width", "0");
          sp(el, "overflow", "visible");
          sp(el, "text-overflow", "unset");
          sp(el, "white-space", "normal");
          sp(el, "word-break", "break-word");
        });

        // ── Phase 2c: Pricing grid — show print elements, hide inputs ───────
        clonedPage.querySelectorAll<HTMLElement>(".print-pricing-display").forEach((el) => {
          sp(el, "display", "flex");
        });
        clonedPage.querySelectorAll<HTMLElement>(".print-pricing-table .no-print").forEach((el) => {
          sp(el, "display", "none");
        });
        // Force print-only-text spans visible
        clonedPage.querySelectorAll<HTMLElement>(".print-only-text").forEach((el) => {
          sp(el, "display", "inline");
        });

        // Style the pricing grid rows for clean export
        const pricingTable = clonedPage.querySelector<HTMLElement>(".print-pricing-table");
        if (pricingTable) {
          sp(pricingTable, "border", `1.5px solid ${BRAND.border}`);
          sp(pricingTable, "border-radius", "5px");
          sp(pricingTable, "overflow", "hidden");

          const rows = pricingTable.querySelectorAll<HTMLElement>(".grid");
          rows.forEach((row, idx) => {
            if (idx === 0) {
              // Header row
              sp(row, "background-color", BRAND.sage);
              sp(row, "padding", "1.5mm 2mm");
              sp(row, "border-bottom", `1.5px solid ${BRAND.border}`);
              row.querySelectorAll<HTMLElement>("span").forEach((s) => {
                sp(s, "font-size", "10px");
                sp(s, "font-weight", "700");
                sp(s, "text-transform", "uppercase");
                sp(s, "letter-spacing", "0.08em");
              });
            } else if (idx === rows.length - 1 && row.textContent?.match(/total/i)) {
              // Total row
              sp(row, "border-top", `2px solid ${BRAND.black}`);
              sp(row, "background-color", "#ffffff");
              row.querySelectorAll<HTMLElement>("span").forEach((s) => {
                sp(s, "font-weight", "700");
              });
            } else {
              // Alternating body rows
              sp(row, "background-color", idx % 2 === 0 ? BRAND.sageTint : "#ffffff");
              sp(row, "padding", "0.8mm 0");
            }
          });
        }

        // ── Phase 3: Layout — map + grid (UNTOUCHED) ─────────────────────────
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
    // Always clean up the data attributes from the live DOM
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
