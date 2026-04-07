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
  muted: "#666666",
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
        /* noop */
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
      /* noop */
    }
  }
  cachedPrintCss = out.join("\n");
  return cachedPrintCss;
}

// ─── Luminance helper ────────────────────────────────────────────────────────
function cssRgbLuminance(cssColor: string): number | null {
  const m = cssColor.match(/[\d.]+/g);
  if (!m || m.length < 3) return null;
  return (0.299 * +m[0] + 0.587 * +m[1] + 0.114 * +m[2]) / 255;
}

// ─── JS: fix ALL dark-background elements ───────────────────────────────────
// CSS class selectors (e.g. [class*="bg-black"]) miss arbitrary Tailwind values
// like bg-[#2A2A2A]. This reads the ACTUAL computed background color so it
// catches every dark element regardless of how it was styled.
function fixDarkBackgrounds(root: HTMLElement, dv: Window) {
  root.querySelectorAll<HTMLElement>("*").forEach((el) => {
    try {
      const bg = dv.getComputedStyle(el).backgroundColor;
      if (!bg || bg === "rgba(0, 0, 0, 0)" || bg === "transparent") return;
      const lum = cssRgbLuminance(bg);
      if (lum === null || lum >= 0.25) return;

      // Dark background confirmed — brand-black it and force all text white
      el.style.setProperty("background-color", BRAND.black, "important");
      el.style.setProperty("color", BRAND.offWhite, "important");
      el.querySelectorAll<HTMLElement>("*").forEach((child) => {
        child.style.setProperty("color", BRAND.offWhite, "important");
        child.style.setProperty("letter-spacing", "0.07em", "important");
      });
    } catch {
      /* noop */
    }
  });
}

// ─── JS: fix sage-tinted elements ───────────────────────────────────────────
// Same problem: bg-[#C3D1C5] won't match CSS [class*="bg-green-"] selectors.
function fixSageBackgrounds(root: HTMLElement, dv: Window) {
  root.querySelectorAll<HTMLElement>("*").forEach((el) => {
    try {
      const bg = dv.getComputedStyle(el).backgroundColor;
      if (!bg || bg === "rgba(0, 0, 0, 0)" || bg === "transparent") return;
      const m = bg.match(/[\d.]+/g);
      if (!m || m.length < 3) return;
      const r = +m[0],
        g = +m[1],
        b = +m[2];
      // Sage is greenish-grey — mid-luminance, green channel dominant
      const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      if (lum > 0.55 && lum < 0.85 && g > r && g > b) {
        el.style.setProperty("background-color", BRAND.sage, "important");
        el.querySelectorAll<HTMLElement>("*").forEach((child) => {
          child.style.setProperty("color", BRAND.black, "important");
        });
      }
    } catch {
      /* noop */
    }
  });
}

// ─── JS: completely remake the pricing table ─────────────────────────────────
function remakePricingTable(root: HTMLElement) {
  const table = root.querySelector<HTMLTableElement>("table");
  if (!table) return;

  // Wrapper: clean collapse, no extra borders
  table.style.setProperty("border-collapse", "collapse", "important");
  table.style.setProperty("width", "100%", "important");
  table.style.setProperty("border", "1px solid " + BRAND.border, "important");
  table.style.setProperty("border-radius", "6px", "important");
  table.style.setProperty("overflow", "hidden", "important");

  // ── Header row ─────────────────────────────────────────────────────────────
  table.querySelectorAll<HTMLElement>("thead th, thead td").forEach((th) => {
    th.style.setProperty("background-color", BRAND.black, "important");
    th.style.setProperty("color", BRAND.offWhite, "important");
    th.style.setProperty("font-size", "10px", "important");
    th.style.setProperty("font-weight", "700", "important");
    th.style.setProperty("letter-spacing", "0.09em", "important");
    th.style.setProperty("text-transform", "uppercase", "important");
    th.style.setProperty("padding", "10px 14px", "important");
    th.style.setProperty("border", "none", "important");
    th.style.setProperty("white-space", "nowrap", "important");
    th.style.setProperty("vertical-align", "middle", "important");
    // Force any child spans/divs inside the header to also be white
    th.querySelectorAll<HTMLElement>("*").forEach((c) => {
      c.style.setProperty("color", BRAND.offWhite, "important");
      c.style.setProperty("letter-spacing", "0.09em", "important");
    });
  });

  // ── Body rows ───────────────────────────────────────────────────────────────
  table.querySelectorAll<HTMLTableRowElement>("tbody tr").forEach((row, rowIdx) => {
    const cells = row.querySelectorAll<HTMLElement>("td");
    cells.forEach((cell, colIdx) => {
      const isEven = rowIdx % 2 === 1;
      cell.style.setProperty("padding", "10px 14px", "important");
      cell.style.setProperty("vertical-align", "middle", "important");
      cell.style.setProperty("border-bottom", "1px solid " + BRAND.border, "important");
      cell.style.setProperty("background-color", isEven ? BRAND.sageTint : "#ffffff", "important");

      if (colIdx === 0) {
        // Service name: clear and readable
        cell.style.setProperty("font-size", "13px", "important");
        cell.style.setProperty("font-weight", "500", "important");
        cell.style.setProperty("color", BRAND.black, "important");
      } else if (colIdx === 1 || colIdx === 2) {
        // Initial / Recurring prices: big and prominent
        cell.style.setProperty("font-size", "15px", "important");
        cell.style.setProperty("font-weight", "700", "important");
        cell.style.setProperty("color", BRAND.black, "important");
      } else if (colIdx === 3) {
        // Frequency
        cell.style.setProperty("font-size", "12px", "important");
        cell.style.setProperty("color", BRAND.muted, "important");
      } else {
        // Schedule
        cell.style.setProperty("font-size", "11px", "important");
        cell.style.setProperty("color", BRAND.black, "important");
      }
    });
  });

  // ── Total / footer row ──────────────────────────────────────────────────────
  // Try tfoot first, fall back to the last tbody row
  const totalRows = [
    ...Array.from(table.querySelectorAll<HTMLElement>("tfoot tr")),
    ...(table.querySelector("tfoot")
      ? []
      : ([table.querySelector<HTMLElement>("tbody tr:last-child")].filter(Boolean) as HTMLElement[])),
  ];
  totalRows.forEach((row) => {
    row.querySelectorAll<HTMLElement>("td, th").forEach((cell, colIdx) => {
      cell.style.setProperty("border-top", "2px solid " + BRAND.black, "important");
      cell.style.setProperty("border-bottom", "none", "important");
      cell.style.setProperty("background-color", "#ffffff", "important");
      cell.style.setProperty("color", BRAND.black, "important");
      cell.style.setProperty("padding", "11px 14px", "important");
      cell.style.setProperty("font-weight", "700", "important");
      cell.style.setProperty("font-size", colIdx >= 1 && colIdx <= 2 ? "16px" : "14px", "important");
    });
  });
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
      // ── 1. Inject base CSS (only truly safe global rules) ────────────────
      const style = clonedDoc.createElement("style");
      style.textContent = `
        ${printCss}

        html, body {
          margin: 0 !important; padding: 0 !important;
          background: #ffffff !important; overflow: visible !important;
        }

        /* Rendering quality — no word-break/overflow-wrap overrides (cause mid-word breaks) */
        * {
          hyphens: none !important; -webkit-hyphens: none !important;
          -webkit-font-smoothing: antialiased !important;
          text-rendering: optimizeLegibility !important;
        }

        .pdf-export-root {
          background: #ffffff !important; box-sizing: border-box !important;
          overflow: visible !important;
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

        /* Products two-column list: compact */
        .pdf-export-root [class*="columns-2"] p,
        .pdf-export-root [class*="columns-2"] li {
          font-size: 9.5px !important; line-height: 1.65 !important; margin: 1px 0 !important;
        }

        /* Bullet list breathing room */
        .pdf-export-root ul li, .pdf-export-root ol li { margin-bottom: 3px !important; }

        /* Fine print */
        .pdf-export-root [class*="text-\\[8px\\]"] {
          font-size: 8px !important; line-height: 1.55 !important; color: ${BRAND.muted} !important;
        }
        .pdf-export-root [class*="text-\\[9px\\]"],
        .pdf-export-root [class*="text-\\[10px\\]"] {
          line-height: 1.55 !important; color: ${BRAND.muted} !important;
        }

        /* Clean borders */
        .pdf-export-root [class*="border"]   { border-color: ${BRAND.border} !important; }
        .pdf-export-root [class*="rounded-lg"],
        .pdf-export-root [class*="rounded-md"] { border-radius: 5px !important; }

        /* Guarantee bar top accent */
        .pdf-export-root [class*="border-t"] {
          border-top-color: ${BRAND.darkSage} !important;
          border-top-width: 2px !important;
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

      const dv = clonedDoc.defaultView;

      // ── 2. JS: detect + fix dark backgrounds (catches bg-[#2A2A2A] etc.) ──
      if (dv) {
        fixDarkBackgrounds(clonedPage, dv);
        fixSageBackgrounds(clonedPage, dv);
      }

      // ── 3. JS: completely remake the pricing table ────────────────────────
      remakePricingTable(clonedPage);

      // ── 4. Layout: remove scale transforms on map parent ─────────────────
      clonedPage.querySelectorAll<HTMLElement>('[class*="print:scale-"]').forEach((el) => {
        el.style.transform = "none";
      });

      // ── 5. Layout: grid for map + details columns ─────────────────────────
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

      // ── 6. Map: preserve aspect ratio so annotations stay pinned ──────────
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

      // ── 7. Auto-shrink additional-details text to fit its card ────────────
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

      const contentDrawH = img.height * (pageW / img.width);
      const remaining = Math.max(headerDrawY, 0);
      const finalH = Math.min(contentDrawH, remaining);
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

      const contentDrawH = img.height * (pageW / img.width);
      const remaining = Math.max(headerDrawY, 0);
      const finalH = Math.min(contentDrawH, remaining);
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
