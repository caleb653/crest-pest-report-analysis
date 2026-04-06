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

      // Fix page 2 map: force map container to fill its column
      const mapContainer = clonedPage.querySelector<HTMLElement>('[class*="w-[400px]"][class*="h-[533px]"]');
      if (mapContainer) {
        mapContainer.style.width = "100%";
        mapContainer.style.height = "auto";
        mapContainer.style.aspectRatio = "3 / 4";
      }

      // Remove scale transforms on map parent
      clonedPage.querySelectorAll<HTMLElement>('[class*="print:scale-"]').forEach(el => {
        el.style.transform = "none";
      });

      // Force grid layout for map + details columns
      const gridContainer = clonedPage.querySelector<HTMLElement>('[class*="lg:grid-cols-"]');
      if (gridContainer) {
        gridContainer.style.display = "grid";
        gridContainer.style.gridTemplateColumns = "48% 52%";
        gridContainer.style.gap = "20px";
        gridContainer.style.alignItems = "start";
        gridContainer.style.padding = "0 16px";
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

        /* Scale up page header (Initial Pest Report top bar) */
        .pdf-export-root.print-header h1 {
          font-size: 28px !important;
          font-weight: 800 !important;
        }

        .pdf-export-root.print-header .text-xs {
          font-size: 16px !important;
          line-height: 1.4 !important;
        }

        .pdf-export-root.print-header .text-\\[10px\\] {
          font-size: 12px !important;
        }

        .pdf-export-root.print-header .text-muted-foreground {
          font-size: 16px !important;
        }
        }

        /* Force smaller typography specifically in the Initial Pest Report right column */
        .pdf-export-root.print-layout > div:nth-child(2) .print-section > :not(.print-section-header),
        .pdf-export-root.print-layout > div:nth-child(2) .print-section > :not(.print-section-header) * {
          font-size: 14px !important;
          line-height: 1.25 !important;
          font-weight: 500 !important;
          overflow-wrap: break-word !important;
          word-break: break-word !important;
          white-space: normal !important;
          hyphens: auto !important;
        }

        .pdf-export-root.print-layout > div:nth-child(2) .print-section > :not(.print-section-header) {
          padding: 0.75mm 2mm 1mm 2mm !important;
          margin: 0 !important;
        }

        .pdf-export-root.print-layout > div:nth-child(2) .print-section-header,
        .pdf-export-root.print-layout > div:nth-child(2) .print-section-header *,
        .pdf-export-root.print-layout > div:nth-child(2) .print-section-header input {
          font-size: 15px !important;
          line-height: 1.05 !important;
          font-weight: 800 !important;
        }

        .pdf-export-root.print-layout > div:nth-child(2) .print-section h3,
        .pdf-export-root.print-layout > div:nth-child(2) .print-section h3 * {
          font-size: 13px !important;
          line-height: 1.1 !important;
          font-weight: 700 !important;
        }

        .pdf-export-root.print-layout > div:nth-child(2) .print-section ul {
          margin: 0 !important;
          padding-left: 2.75mm !important;
        }

        .pdf-export-root.print-layout > div:nth-child(2) .print-section li {
          margin: 0 0 0.4mm 0 !important;
          padding: 0 !important;
        }

        .pdf-export-root.print-layout > div:nth-child(2) .print-tags {
          gap: 0.2rem !important;
          padding: 1.5mm 2mm !important;
        }

        .pdf-export-root.print-layout > div:nth-child(2) .print-tag,
        .pdf-export-root.print-layout > div:nth-child(2) .print-tag * {
          font-size: 10px !important;
          line-height: 1.1 !important;
        }

        .pdf-export-root.print-layout > div:nth-child(2) .print-content-formatted {
          display: block !important;
        }

        /* Vertical space distribution: shrink Key Areas & Preferences, grow Service Area */
        .pdf-export-root.print-layout > div:nth-child(2) > div {
          display: flex !important;
          flex-direction: column !important;
          height: 100% !important;
        }

        /* Target Pests (1st), Key Areas (2nd), Preferences (3rd) — compact */
        .pdf-export-root.print-layout > div:nth-child(2) > div > .print-section:nth-child(1),
        .pdf-export-root.print-layout > div:nth-child(2) > div > .print-section:nth-child(2),
        .pdf-export-root.print-layout > div:nth-child(2) > div > .print-section:nth-child(3) {
          flex: 0 0 auto !important;
        }

        /* Service Area (4th) — gets more space but not all */
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

      const remainingHeight = Math.max(headerDrawY, 0);
      const { width: contentDrawW, height: contentDrawH } = getContainedImageSize(
        img.width,
        img.height,
        pageW,
        remainingHeight,
      );
      const contentDrawY = headerDrawY - contentDrawH;
      const contentDrawX = (pageW - contentDrawW) / 2;
      page.drawImage(img, {
        x: contentDrawX,
        y: Math.max(contentDrawY, 0),
        width: contentDrawW,
        height: contentDrawH,
      });

      pendingHeaderImg = null;
    } else {
      const { width: drawW, height: drawH } = getContainedImageSize(img.width, img.height, pageW, pageH);
      const drawX = (pageW - drawW) / 2;
      const drawY = pageH - drawH;
      page.drawImage(img, { x: drawX, y: drawY, width: drawW, height: drawH });
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
