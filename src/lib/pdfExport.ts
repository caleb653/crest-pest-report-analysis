import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import html2canvas from "html2canvas";

const TEMPLATE_PDF_URL = "/proposal-template.pdf";
const A4_LANDSCAPE_WIDTH_PX = 1123;

// ─── Brand palette ────────────────────────────────────────────────────────────
const BRAND = {
  black: "#2A2A2A",
  offWhite: "#F2F2F2",
  sage: "#C3D1C5",
  darkSage: "#95A197",
  sageTint: "#f3f6f3", // barely-there sage wash for zebra rows
  border: "#e0e4e0", // subtle greenish-grey border
  body: "#3a3a3a", // slightly softened body text
  muted: "#666666", // secondary labels, fine print
};

let cachedPrintCss = "";

function collectPrintRules(rules: CSSRuleList, output: string[]) {
  for (const rule of Array.from(rules)) {
    if (rule instanceof CSSMediaRule) {
      if (rule.media.mediaText.includes("print")) {
        output.push(...Array.from(rule.cssRules).map((r) => r.cssText));
      }
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
  const output: string[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      collectPrintRules(sheet.cssRules, output);
    } catch {
      /* noop */
    }
  }
  cachedPrintCss = output.join("\n");
  return cachedPrintCss;
}

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
      const style = clonedDoc.createElement("style");
      style.textContent = `
        ${printCss}

        /* ── Page reset ────────────────────────────────────────────── */
        html, body {
          margin: 0 !important;
          padding: 0 !important;
          background: #ffffff !important;
          overflow: visible !important;
        }

        /* ── Safe global rendering improvements ────────────────────
           NOTE: No overflow-wrap or word-break overrides here.
           Those cause mid-word line breaks in narrow columns.       */
        * {
          hyphens:                none !important;
          -webkit-hyphens:        none !important;
          -ms-hyphens:            none !important;
          -webkit-font-smoothing: antialiased !important;
          text-rendering:         optimizeLegibility !important;
        }

        /* ── Root export wrapper ───────────────────────────────────── */
        .pdf-export-root {
          background: #ffffff !important;
          box-sizing: border-box !important;
          overflow:   visible !important;
        }

        .pdf-export-root [class*="max-w-"]        { max-width: none !important; }
        .pdf-export-root [class*="bg-background"] { background: #ffffff !important; }

        /* ── Hide non-print noise ──────────────────────────────────── */
        .pdf-export-root .no-print,
        .pdf-export-root button:not(.print-keep),
        .pdf-export-root [role="status"],
        .pdf-export-root .sonner,
        .pdf-export-root [data-sonner-toaster]     { display: none !important; }

        .pdf-export-root .print-only-text                          { display: inline !important; }
        .pdf-export-root .hidden.print\\:block,
        .pdf-export-root [class*="hidden"][class*="print\\:block"] { display: block !important;  }
        .pdf-export-root .print-content-formatted                  { display: block !important;  }


        /* ════════════════════════════════════════════════════════════
           DARK SECTION HEADER BARS
           Two-step approach so header text is ALWAYS visible:
             1. Force brand-black background
             2. Force ALL children to off-white (higher specificity
                than any global body-text rule below)
           ════════════════════════════════════════════════════════════ */

        .pdf-export-root [class*="bg-black"],
        .pdf-export-root [class*="bg-gray-900"],
        .pdf-export-root [class*="bg-zinc-900"],
        .pdf-export-root [class*="bg-neutral-900"],
        .pdf-export-root [class*="bg-stone-900"] {
          background-color: ${BRAND.black} !important;
        }

        .pdf-export-root [class*="bg-black"]       *,
        .pdf-export-root [class*="bg-gray-900"]    *,
        .pdf-export-root [class*="bg-zinc-900"]    *,
        .pdf-export-root [class*="bg-neutral-900"] *,
        .pdf-export-root [class*="bg-stone-900"]   * {
          color:          ${BRAND.offWhite} !important;
          letter-spacing: 0.06em !important;
        }


        /* ════════════════════════════════════════════════════════════
           TABLE (service pricing)
           ════════════════════════════════════════════════════════════ */

        .pdf-export-root table {
          border-collapse: collapse !important;
          width:           100% !important;
        }

        /* Header row: brand black */
        .pdf-export-root thead th,
        .pdf-export-root thead td {
          background-color: ${BRAND.black} !important;
          color:            ${BRAND.offWhite} !important;
          font-size:        10.5px !important;
          font-weight:      700 !important;
          letter-spacing:   0.07em !important;
          padding:          9px 12px !important;
          border:           none !important;
        }

        /* Body rows */
        .pdf-export-root tbody td {
          padding:          9px 12px !important;
          vertical-align:   middle !important;
          line-height:      1.5 !important;
          font-size:        13px !important;
          color:            ${BRAND.body} !important;
          border-bottom:    1px solid ${BRAND.border} !important;
          background-color: transparent !important;
        }

        /* Zebra: barely-there sage wash */
        .pdf-export-root tbody tr:nth-child(even) td {
          background-color: ${BRAND.sageTint} !important;
        }

        /* Total row: strong top accent */
        .pdf-export-root tfoot td,
        .pdf-export-root tfoot th {
          border-top:    2.5px solid ${BRAND.black} !important;
          border-bottom: none !important;
          font-weight:   700 !important;
          font-size:     13px !important;
          padding:       9px 12px !important;
          color:         ${BRAND.black} !important;
        }


        /* ════════════════════════════════════════════════════════════
           SAGE ACCENT ELEMENTS
           (pest info banner, schedule chips, etc.)
           ════════════════════════════════════════════════════════════ */

        .pdf-export-root [class*="bg-green-"],
        .pdf-export-root [class*="bg-sage"],
        .pdf-export-root [class*="bg-emerald-"],
        .pdf-export-root [class*="bg-teal-"] {
          background-color: ${BRAND.sage} !important;
        }

        .pdf-export-root [class*="bg-green-"]   *,
        .pdf-export-root [class*="bg-sage"]     *,
        .pdf-export-root [class*="bg-emerald-"] *,
        .pdf-export-root [class*="bg-teal-"]    * {
          color: ${BRAND.black} !important;
        }


        /* ════════════════════════════════════════════════════════════
           TYPOGRAPHY
           Note: bold/semibold selectors exclude elements that are
           inside dark backgrounds (bg-*) or already text-white,
           so we don't accidentally kill white header text.
           ════════════════════════════════════════════════════════════ */

        .pdf-export-root p,
        .pdf-export-root li {
          color:       ${BRAND.body} !important;
          line-height: 1.6 !important;
        }

        .pdf-export-root [class*="text-sm"] {
          font-size:   12px !important;
          line-height: 1.6 !important;
        }

        /* Bold headings in light-BG areas only */
        .pdf-export-root [class*="font-semibold"]:not([class*="bg-"]):not([class*="text-white"]),
        .pdf-export-root [class*="font-bold"]:not([class*="bg-"]):not([class*="text-white"]) {
          color: ${BRAND.black} !important;
        }

        /* Products two-column list — compact but legible */
        .pdf-export-root [class*="columns-2"] p,
        .pdf-export-root [class*="columns-2"] li {
          font-size:   9.5px !important;
          line-height: 1.65 !important;
          margin:      1px 0 !important;
          color:       ${BRAND.body} !important;
        }

        /* Uppercase tracked labels */
        .pdf-export-root [class*="uppercase"][class*="tracking"],
        .pdf-export-root [class*="text-xs"][class*="uppercase"] {
          letter-spacing: 0.08em !important;
        }

        /* Bullet list breathing room */
        .pdf-export-root ul li,
        .pdf-export-root ol li {
          margin-bottom: 4px !important;
        }

        /* Fine print */
        .pdf-export-root [class*="text-\\[8px\\]"] {
          font-size:   8px !important;
          line-height: 1.55 !important;
          color:       ${BRAND.muted} !important;
        }
        .pdf-export-root [class*="text-\\[9px\\]"],
        .pdf-export-root [class*="text-\\[10px\\]"] {
          line-height: 1.55 !important;
          color:       ${BRAND.muted} !important;
        }


        /* ════════════════════════════════════════════════════════════
           BORDERS, CARDS & DIVIDERS
           ════════════════════════════════════════════════════════════ */

        .pdf-export-root [class*="border"] {
          border-color: ${BRAND.border} !important;
        }

        /* Guarantee bar: dark-sage top accent */
        .pdf-export-root [class*="border-t"] {
          border-top-color: ${BRAND.darkSage} !important;
          border-top-width: 2px !important;
        }

        .pdf-export-root [class*="rounded-lg"],
        .pdf-export-root [class*="rounded-md"] {
          border-radius: 5px !important;
        }

        /* Section card inner padding */
        .pdf-export-root [class*="p-3"]   { padding: 9px !important; }
        .pdf-export-root [class*="p-4"]   { padding: 12px !important; }
        .pdf-export-root [class*="gap-3"] { gap: 8px !important; }
        .pdf-export-root [class*="gap-4"] { gap: 12px !important; }
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

      // Remove scale transforms on map parent
      clonedPage.querySelectorAll<HTMLElement>('[class*="print:scale-"]').forEach((el) => {
        el.style.transform = "none";
      });

      // Force grid layout for map + details columns
      const gridContainer = clonedPage.querySelector<HTMLElement>('[class*="lg:grid-cols-"]');
      if (gridContainer) {
        gridContainer.style.display = "grid";
        gridContainer.style.gridTemplateColumns = "42% 58%";
        gridContainer.style.gap = "20px";
        gridContainer.style.alignItems = "stretch";
        gridContainer.style.padding = "0 16px";
        gridContainer.style.flex = "1";
      }

      // Page is a flex column so the grid stretches
      clonedPage.style.display = "flex";
      clonedPage.style.flexDirection = "column";

      // Map: lock to image's own aspect ratio so annotations stay pinned
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

      // Map parent — stretch to fill grid cell
      const mapParent = clonedPage.querySelector<HTMLElement>(".flex.flex-col.min-h-0");
      if (mapParent) {
        mapParent.style.flex = "1";
        mapParent.style.display = "flex";
        mapParent.style.flexDirection = "column";
        mapParent.style.justifyContent = "center";
      }

      // Auto-shrink additional-details text to fit its card
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

/* ─── buildMergedPDF ─────────────────────────────────────────────────────────
   Proposal PDF: cover from template + report pages + marketing tail pages.   */
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

  if (customerName) {
    coverPage.drawText(customerName, {
      x: 42,
      y: 326,
      size: 24,
      font: helveticaBold,
      color: rgb(1, 1, 1),
    });
  }
  if (address) {
    coverPage.drawText(address, {
      x: 42,
      y: 298,
      size: 14,
      font: helvetica,
      color: rgb(0.85, 0.85, 0.85),
    });
  }
  if (technicianName) {
    coverPage.drawText(technicianName, {
      x: 42,
      y: 128,
      size: 14,
      font: helveticaBold,
      color: rgb(0.2, 0.2, 0.2),
    });
  }

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
      const headerScale = pageW / pendingHeaderImg.width;
      const headerDrawH = pendingHeaderImg.height * headerScale;
      const headerDrawY = pageH - headerDrawH;
      page.drawImage(pendingHeaderImg, { x: 0, y: headerDrawY, width: pageW, height: headerDrawH });

      const contentScale = pageW / img.width;
      const contentDrawH = img.height * contentScale;
      const remaining = Math.max(headerDrawY, 0);
      const finalH = Math.min(contentDrawH, remaining);
      page.drawImage(img, {
        x: 0,
        y: Math.max(headerDrawY - finalH, 0),
        width: pageW,
        height: finalH,
      });
      pendingHeaderImg = null;
    } else {
      const scale = pageW / img.width;
      const drawH = Math.min(img.height * scale, pageH);
      page.drawImage(img, { x: 0, y: pageH - drawH, width: pageW, height: drawH });
    }
  }

  const marketingIndices = Array.from({ length: templateDoc.getPageCount() - 1 }, (_, i) => i + 1);
  const marketingPages = await outDoc.copyPages(templateDoc, marketingIndices);
  for (const mp of marketingPages) outDoc.addPage(mp);

  return outDoc.save();
}

/* ─── buildSimplePDF ─────────────────────────────────────────────────────────
   Initial Pest Report: captured pages only, no template wrapper.             */
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
      const headerScale = pageW / pendingHeaderImg.width;
      const headerDrawH = pendingHeaderImg.height * headerScale;
      const headerDrawY = pageH - headerDrawH;
      page.drawImage(pendingHeaderImg, { x: 0, y: headerDrawY, width: pageW, height: headerDrawH });

      const contentScale = pageW / img.width;
      const contentDrawH = img.height * contentScale;
      const remaining = Math.max(headerDrawY, 0);
      const finalH = Math.min(contentDrawH, remaining);
      page.drawImage(img, {
        x: 0,
        y: Math.max(headerDrawY - finalH, 0),
        width: pageW,
        height: finalH,
      });
      pendingHeaderImg = null;
    } else {
      const scale = pageW / img.width;
      const drawH = Math.min(img.height * scale, pageH);
      page.drawImage(img, { x: 0, y: pageH - drawH, width: pageW, height: drawH });
    }
  }

  return outDoc.save();
}

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
