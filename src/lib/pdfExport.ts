import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import html2canvas from "html2canvas";

const TEMPLATE_PDF_URL = "/proposal-template.pdf";
const A4_LANDSCAPE_WIDTH_PX = 1123;

// Brand colors
const BRAND = {
  black: "#2A2A2A",
  white: "#F2F2F2",
  sage: "#C3D1C5",
  darkSage: "#95A197",
};

let cachedPrintCss = "";

function collectPrintRules(rules: CSSRuleList, output: string[]) {
  for (const rule of Array.from(rules)) {
    if (rule instanceof CSSMediaRule) {
      if (rule.media.mediaText.includes("print")) {
        output.push(...Array.from(rule.cssRules).map((nestedRule) => nestedRule.cssText));
      }
      continue;
    }

    if ("cssRules" in rule) {
      try {
        collectPrintRules((rule as CSSGroupingRule).cssRules, output);
      } catch {
        // Ignore inaccessible nested rules
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
      // Ignore cross-origin or inaccessible stylesheets
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

        html, body {
          margin: 0 !important;
          padding: 0 !important;
          background: #ffffff !important;
          overflow: visible !important;
        }

        /* ── Global text rendering fixes ──────────────────────────── */
        * {
          hyphens: none !important;
          -webkit-hyphens: none !important;
          -ms-hyphens: none !important;
          overflow-wrap: break-word !important;
          word-break: normal !important;
          -webkit-font-smoothing: antialiased !important;
          text-rendering: optimizeLegibility !important;
        }

        /* ── Root export container ────────────────────────────────── */
        .pdf-export-root {
          background: #ffffff !important;
          box-sizing: border-box !important;
          overflow: visible !important;
          color: ${BRAND.black} !important;
        }

        .pdf-export-root [class*="max-w-"] {
          max-width: none !important;
        }

        .pdf-export-root [class*="bg-background"] {
          background: #ffffff !important;
        }

        /* ── Hide non-print elements ──────────────────────────────── */
        .pdf-export-root .no-print,
        .pdf-export-root button:not(.print-keep),
        .pdf-export-root [role="status"],
        .pdf-export-root .sonner,
        .pdf-export-root [data-sonner-toaster] {
          display: none !important;
        }

        .pdf-export-root .print-only-text {
          display: inline !important;
        }

        .pdf-export-root .hidden.print\\:block,
        .pdf-export-root [class*="hidden"][class*="print\\:block"] {
          display: block !important;
        }

        .pdf-export-root .print-content-formatted {
          display: block !important;
        }

        /* ── Brand color: dark section header bars ────────────────── */
        .pdf-export-root [class*="bg-black"],
        .pdf-export-root [class*="bg-gray-900"],
        .pdf-export-root [class*="bg-zinc-900"],
        .pdf-export-root [class*="bg-neutral-900"],
        .pdf-export-root thead,
        .pdf-export-root th {
          background-color: ${BRAND.black} !important;
          color: ${BRAND.white} !important;
          letter-spacing: 0.04em !important;
        }

        /* ── Brand color: sage accent rows / highlights ───────────── */
        .pdf-export-root [class*="bg-green-"],
        .pdf-export-root [class*="bg-sage"],
        .pdf-export-root [class*="bg-emerald-"],
        .pdf-export-root [class*="bg-teal-"] {
          background-color: ${BRAND.sage} !important;
          color: ${BRAND.black} !important;
        }

        /* ── Typography improvements ──────────────────────────────── */
        .pdf-export-root h1,
        .pdf-export-root h2,
        .pdf-export-root h3 {
          color: ${BRAND.black} !important;
          letter-spacing: -0.01em !important;
        }

        /* Section header label text (e.g. "TARGET PEST(S)", "PRODUCTS") */
        .pdf-export-root [class*="uppercase"][class*="tracking"],
        .pdf-export-root [class*="text-xs"][class*="uppercase"] {
          letter-spacing: 0.08em !important;
          font-weight: 700 !important;
        }

        /* ── Table / grid polish ──────────────────────────────────── */
        .pdf-export-root table {
          border-collapse: collapse !important;
          width: 100% !important;
        }

        .pdf-export-root td,
        .pdf-export-root th {
          padding: 6px 10px !important;
          vertical-align: top !important;
          line-height: 1.45 !important;
        }

        /* Zebra stripe on service rows using light sage */
        .pdf-export-root tbody tr:nth-child(even) {
          background-color: #f4f7f4 !important;
        }

        /* ── Products list: tighten but keep legible ──────────────── */
        .pdf-export-root [class*="grid-cols-2"] p,
        .pdf-export-root [class*="grid-cols-2"] li,
        .pdf-export-root [class*="columns-2"] p,
        .pdf-export-root [class*="columns-2"] li {
          font-size: 9.5px !important;
          line-height: 1.55 !important;
          margin: 1px 0 !important;
        }

        /* ── Bullet list spacing ──────────────────────────────────── */
        .pdf-export-root ul li,
        .pdf-export-root ol li {
          margin-bottom: 3px !important;
          line-height: 1.5 !important;
        }

        /* ── Proposed services bold headings ──────────────────────── */
        .pdf-export-root [class*="font-bold"],
        .pdf-export-root strong,
        .pdf-export-root b {
          color: ${BRAND.black} !important;
        }

        /* ── Footer / guarantee bar ───────────────────────────────── */
        .pdf-export-root [class*="border-t"] p,
        .pdf-export-root footer p {
          font-size: 10px !important;
          line-height: 1.5 !important;
          color: #444 !important;
        }

        /* ── Pesticide notice small text ──────────────────────────── */
        .pdf-export-root [class*="text-\\[8px\\]"],
        .pdf-export-root [class*="text-\\[9px\\]"],
        .pdf-export-root [class*="text-\\[10px\\]"] {
          line-height: 1.55 !important;
          color: #333 !important;
        }

        /* ── Customer signature section ───────────────────────────── */
        .pdf-export-root [class*="border"] {
          border-color: #d0d0d0 !important;
        }

        /* ── Property images page ─────────────────────────────────── */
        .pdf-export-root img:not([data-map-image]) {
          border-radius: 6px !important;
          box-shadow: none !important;
        }

        /* ── Scheduling & communication / setup materials boxes ───── */
        .pdf-export-root [class*="grid-cols-2"] > div[class*="border"],
        .pdf-export-root [class*="grid-cols-2"] > div[class*="rounded"] {
          padding: 10px 12px !important;
        }

        /* ── General padding / margin cleanup ─────────────────────── */
        .pdf-export-root [class*="p-2"] { padding: 6px !important; }
        .pdf-export-root [class*="p-3"] { padding: 8px !important; }
        .pdf-export-root [class*="p-4"] { padding: 10px !important; }
        .pdf-export-root [class*="gap-2"] { gap: 5px !important; }
        .pdf-export-root [class*="gap-3"] { gap: 7px !important; }
        .pdf-export-root [class*="gap-4"] { gap: 10px !important; }
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

      // Force grid layout for map + details columns — stretch to fill page height
      const gridContainer = clonedPage.querySelector<HTMLElement>('[class*="lg:grid-cols-"]');
      if (gridContainer) {
        gridContainer.style.display = "grid";
        gridContainer.style.gridTemplateColumns = "42% 58%";
        gridContainer.style.gap = "20px";
        gridContainer.style.alignItems = "stretch";
        gridContainer.style.padding = "0 16px";
        gridContainer.style.flex = "1";
      }

      // Make the page a flex column so the grid stretches
      clonedPage.style.display = "flex";
      clonedPage.style.flexDirection = "column";

      // Fix page 2 map: use the baked image's own aspect ratio so annotations
      // stay locked to the exact same pixels as the web app at any size.
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

      // Make the map's parent flex column stretch to fill grid cell
      const mapParent = clonedPage.querySelector<HTMLElement>(".flex.flex-col.min-h-0");
      if (mapParent) {
        mapParent.style.flex = "1";
        mapParent.style.display = "flex";
        mapParent.style.flexDirection = "column";
        mapParent.style.justifyContent = "center";
      }

      // Auto-shrink additional details text to fit
      const detailsBody = clonedPage.querySelector<HTMLElement>(".additional-details-body .print-content-formatted");
      const detailsCard = clonedPage.querySelector<HTMLElement>(".additional-details-card");
      if (detailsBody && detailsCard) {
        let fontSize = parseFloat(detailsBody.style.fontSize) || 11;
        const minFont = 7;
        // Shrink until content fits or we hit minimum
        while (fontSize > minFont && detailsBody.scrollHeight > detailsCard.clientHeight + 2) {
          fontSize -= 0.5;
          detailsBody.style.fontSize = `${fontSize}px`;
        }
      }
    },
  });

  return canvas.toDataURL("image/jpeg", 0.95);
}

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

  // Group captures: combine header (capture "0") with content (capture "1") on the same page
  let pendingHeaderImg: Awaited<ReturnType<typeof outDoc.embedJpg>> | null = null;

  for (const el of reportPages) {
    const dataUrl = await captureElement(el);
    const imgBytes = await fetch(dataUrl).then((r) => r.arrayBuffer());
    const img = await outDoc.embedJpg(imgBytes);
    const captureId = el.dataset.pdfCapture ?? "";

    if (captureId === "0") {
      // This is the header — save it to draw on the same page as capture "1"
      pendingHeaderImg = img;
      continue;
    }

    const page = outDoc.addPage([pageW, pageH]);

    if (captureId === "1" && pendingHeaderImg) {
      // Draw header at top, then content below it
      const headerScale = pageW / pendingHeaderImg.width;
      const headerDrawW = pageW;
      const headerDrawH = pendingHeaderImg.height * headerScale;
      const headerDrawY = pageH - headerDrawH;
      page.drawImage(pendingHeaderImg, { x: 0, y: headerDrawY, width: headerDrawW, height: headerDrawH });

      // Always stretch content to full page width
      const contentScale = pageW / img.width;
      const contentDrawW = pageW;
      const contentDrawH = img.height * contentScale;
      const remainingHeight = Math.max(headerDrawY, 0);
      const finalH = Math.min(contentDrawH, remainingHeight);
      const contentDrawY = headerDrawY - finalH;
      page.drawImage(img, {
        x: 0,
        y: Math.max(contentDrawY, 0),
        width: contentDrawW,
        height: finalH,
      });

      pendingHeaderImg = null;
    } else {
      // Always stretch to full page width, cap height to page
      const scale = pageW / img.width;
      const drawW = pageW;
      const drawH = Math.min(img.height * scale, pageH);
      const drawY = pageH - drawH;
      page.drawImage(img, { x: 0, y: drawY, width: drawW, height: drawH });
    }
  }

  const marketingPageIndices = [];
  for (let i = 1; i < templateDoc.getPageCount(); i++) {
    marketingPageIndices.push(i);
  }
  const marketingPages = await outDoc.copyPages(templateDoc, marketingPageIndices);
  for (const mp of marketingPages) {
    outDoc.addPage(mp);
  }

  return outDoc.save();
}

/**
 * Builds a PDF containing only the app-captured report pages (no template
 * cover page or marketing pages). Used for Initial Pest Reports.
 */
export async function buildSimplePDF(options: { reportPages: HTMLElement[] }): Promise<Uint8Array> {
  const { reportPages } = options;

  const outDoc = await PDFDocument.create();
  // Use the same page size as the merged PDF template (letter landscape)
  const pageW = 842;
  const pageH = 595;

  let pendingHeaderImg: Awaited<ReturnType<typeof outDoc.embedJpg>> | null = null;

  for (const el of reportPages) {
    // Use the same captureElement function as the full proposal
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
      // Draw header at top, then content below — same as buildMergedPDF
      const headerScale = pageW / pendingHeaderImg.width;
      const headerDrawW = pageW;
      const headerDrawH = pendingHeaderImg.height * headerScale;
      const headerDrawY = pageH - headerDrawH;
      page.drawImage(pendingHeaderImg, { x: 0, y: headerDrawY, width: headerDrawW, height: headerDrawH });

      const contentScale = pageW / img.width;
      const contentDrawW = pageW;
      const contentDrawH = img.height * contentScale;
      const remainingHeight = Math.max(headerDrawY, 0);
      const finalH = Math.min(contentDrawH, remainingHeight);
      const contentDrawY = headerDrawY - finalH;
      page.drawImage(img, {
        x: 0,
        y: Math.max(contentDrawY, 0),
        width: contentDrawW,
        height: finalH,
      });
      pendingHeaderImg = null;
    } else {
      // Stretch to full page width, cap height — same as buildMergedPDF
      const scale = pageW / img.width;
      const drawW = pageW;
      const drawH = Math.min(img.height * scale, pageH);
      const drawY = pageH - drawH;
      page.drawImage(img, { x: 0, y: drawY, width: drawW, height: drawH });
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
