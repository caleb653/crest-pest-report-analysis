import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import html2canvas from "html2canvas";

const TEMPLATE_PDF_URL = "/proposal-template.pdf";
const A4_LANDSCAPE_WIDTH_PX = 1123;

let cachedPrintCss = "";

function getContainedImageSize(
  imgWidth: number,
  imgHeight: number,
  maxWidth: number,
  maxHeight: number,
) {
  const scale = Math.min(maxWidth / imgWidth, maxHeight / imgHeight);

  return {
    width: imgWidth * scale,
    height: imgHeight * scale,
  };
}

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

        .pdf-export-root {
          background: #ffffff !important;
          box-sizing: border-box !important;
          overflow: visible !important;
        }

        .pdf-export-root [class*="max-w-"] {
          max-width: none !important;
        }

        .pdf-export-root [class*="bg-background"] {
          background: #ffffff !important;
        }

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
      clonedPage.querySelectorAll<HTMLElement>('[class*="print:scale-"]').forEach(el => {
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
        const mapImg = mapContainer.querySelector<HTMLImageElement>('img');
        mapContainer.style.aspectRatio = mapImg?.naturalWidth && mapImg?.naturalHeight
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

      // Make the map's parent flex column stretch to fill grid cell
      const mapParent = clonedPage.querySelector<HTMLElement>('.flex.flex-col.min-h-0');
      if (mapParent) {
        mapParent.style.flex = "1";
        mapParent.style.display = "flex";
        mapParent.style.flexDirection = "column";
        mapParent.style.justifyContent = "center";
      }

      // Auto-shrink additional details text to fit
      const detailsBody = clonedPage.querySelector<HTMLElement>('.additional-details-body .print-content-formatted');
      const detailsCard = clonedPage.querySelector<HTMLElement>('.additional-details-card');
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

  return canvas.toDataURL("image/jpeg", 0.92);
}

async function captureElementSimple(el: HTMLElement, captureWidth: number): Promise<string> {
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

        .pdf-export-root {
          background: #ffffff !important;
          box-sizing: border-box !important;
          overflow: visible !important;
        }

        .pdf-export-root [class*="max-w-"] {
          max-width: none !important;
        }

        .pdf-export-root [class*="bg-background"] {
          background: #ffffff !important;
        }

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

        /* ===== PAGE HEADER (capture 0) — bold, readable ===== */
        .pdf-export-root.print-header {
          padding: 6mm 8mm 4mm 8mm !important;
        }

        .pdf-export-root.print-header h1 {
          font-size: 32px !important;
          font-weight: 800 !important;
          letter-spacing: -0.02em !important;
          margin-bottom: 3mm !important;
        }

        .pdf-export-root.print-header .text-xs,
        .pdf-export-root.print-header span,
        .pdf-export-root.print-header input:not(.print-title) {
          font-size: 18px !important;
          line-height: 1.6 !important;
        }

        .pdf-export-root.print-header .text-muted-foreground {
          font-size: 18px !important;
          font-weight: 600 !important;
        }

        .pdf-export-root.print-header .text-\\[10px\\] {
          font-size: 13px !important;
        }

        .pdf-export-root.print-header img[alt="Crest Pest Control"] {
          height: 80px !important;
          width: auto !important;
        }

        /* Purpose text beneath header */
        .pdf-export-root.print-header p[class*="text-\\[10px\\]"] {
          font-size: 12px !important;
          line-height: 1.4 !important;
          margin-top: 3mm !important;
        }

        /* ===== RIGHT COLUMN SECTIONS (capture 1) ===== */

        /* Body text in sections */
        .pdf-export-root.print-layout > div:nth-child(2) .print-section > :not(.print-section-header),
        .pdf-export-root.print-layout > div:nth-child(2) .print-section > :not(.print-section-header) * {
          font-size: 14px !important;
          line-height: 1.35 !important;
          font-weight: 500 !important;
          overflow-wrap: break-word !important;
          word-break: break-word !important;
          white-space: normal !important;
          hyphens: auto !important;
        }

        /* Section inner padding */
        .pdf-export-root.print-layout > div:nth-child(2) .print-section > :not(.print-section-header) {
          padding: 1.5mm 3mm 2mm 3mm !important;
          margin: 0 !important;
        }

        /* Section headers — compact but clear */
        .pdf-export-root.print-layout > div:nth-child(2) .print-section-header,
        .pdf-export-root.print-layout > div:nth-child(2) .print-section-header *,
        .pdf-export-root.print-layout > div:nth-child(2) .print-section-header input {
          font-size: 15px !important;
          line-height: 1.1 !important;
          font-weight: 800 !important;
          letter-spacing: 0.03em !important;
        }

        /* Sub-headers (Findings, Actions) */
        .pdf-export-root.print-layout > div:nth-child(2) .print-section h3,
        .pdf-export-root.print-layout > div:nth-child(2) .print-section h3 * {
          font-size: 13px !important;
          line-height: 1.15 !important;
          font-weight: 700 !important;
        }

        /* Lists */
        .pdf-export-root.print-layout > div:nth-child(2) .print-section ul {
          margin: 0.5mm 0 !important;
          padding-left: 3.5mm !important;
        }

        .pdf-export-root.print-layout > div:nth-child(2) .print-section li {
          margin: 0 0 0.5mm 0 !important;
          padding: 0 !important;
        }

        /* Target pest tags */
        .pdf-export-root.print-layout > div:nth-child(2) .print-tags {
          gap: 0.25rem !important;
          padding: 2mm 3mm !important;
        }

        .pdf-export-root.print-layout > div:nth-child(2) .print-tag,
        .pdf-export-root.print-layout > div:nth-child(2) .print-tag * {
          font-size: 10px !important;
          line-height: 1.15 !important;
        }

        .pdf-export-root.print-layout > div:nth-child(2) .print-content-formatted {
          display: block !important;
        }

        /* Section cards — add breathing room between them */
        .pdf-export-root.print-layout > div:nth-child(2) .print-section {
          margin-bottom: 1.5mm !important;
          border-radius: 3px !important;
          overflow: hidden !important;
        }

        /* Vertical space distribution */
        .pdf-export-root.print-layout > div:nth-child(2) > div {
          display: flex !important;
          flex-direction: column !important;
          height: 100% !important;
          gap: 0 !important;
        }

        /* Target Pests (1st), Key Areas (2nd), Preferences (3rd) — compact */
        .pdf-export-root.print-layout > div:nth-child(2) > div > .print-section:nth-child(1),
        .pdf-export-root.print-layout > div:nth-child(2) > div > .print-section:nth-child(2),
        .pdf-export-root.print-layout > div:nth-child(2) > div > .print-section:nth-child(3) {
          flex: 0 0 auto !important;
        }

        /* Service Area (4th) — gets remaining space */
        .pdf-export-root.print-layout > div:nth-child(2) > div > .print-section:nth-child(4) {
          flex: 2 1 0 !important;
        }

        /* Recommendations (5th) — compact */
        .pdf-export-root.print-layout > div:nth-child(2) > div > .print-section:nth-child(5) {
          flex: 0 0 auto !important;
        }
      `;
      clonedDoc.head.appendChild(style);

      if (!captureKey) return;

      const clonedPage = clonedDoc.querySelector<HTMLElement>(`[data-pdf-capture="${captureKey}"]`);
      if (!clonedPage) return;

      clonedPage.classList.add("pdf-export-root");
      clonedPage.style.width = `${captureWidth}px`;
      clonedPage.style.minWidth = `${captureWidth}px`;
      clonedPage.style.background = "#ffffff";
      clonedPage.style.boxSizing = "border-box";
      clonedPage.style.overflow = "visible";
    },
  });

  return canvas.toDataURL("image/jpeg", 0.92);
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
export async function buildSimplePDF(options: {
  reportPages: HTMLElement[];
}): Promise<Uint8Array> {
  const { reportPages } = options;
  const SIMPLE_CAPTURE_WIDTH = 842; // Match A4 landscape page width for full-width capture

  const outDoc = await PDFDocument.create();
  // A4 landscape
  const pageW = 842;
  const pageH = 595;

  let pendingHeaderImg: Awaited<ReturnType<typeof outDoc.embedJpg>> | null = null;

  for (const el of reportPages) {
    const dataUrl = await captureElementSimple(el, SIMPLE_CAPTURE_WIDTH);
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
      const headerDrawW = pageW;
      const headerDrawH = pendingHeaderImg.height * headerScale;
      const headerDrawY = pageH - headerDrawH;
      page.drawImage(pendingHeaderImg, { x: 0, y: headerDrawY, width: headerDrawW, height: headerDrawH });

      const remainingHeight = Math.max(headerDrawY, 0);
      const { width: contentDrawW, height: contentDrawH } = getContainedImageSize(
        img.width, img.height, pageW, remainingHeight,
      );
      const contentDrawY = headerDrawY - contentDrawH;
      page.drawImage(img, {
        x: 0,
        y: Math.max(contentDrawY, 0),
        width: contentDrawW,
        height: contentDrawH,
      });
      pendingHeaderImg = null;
    } else {
      const { width: drawW, height: drawH } = getContainedImageSize(img.width, img.height, pageW, pageH);
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
