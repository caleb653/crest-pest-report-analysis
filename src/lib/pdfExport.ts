import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import html2canvas from "html2canvas";

const TEMPLATE_PDF_URL = "/proposal-template.pdf";
const A4_LANDSCAPE_WIDTH_PX = 1123;
const A4_LANDSCAPE_HEIGHT_PX = 794;

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

/**
 * Capture a DOM element as a high-resolution JPEG data URL using print styles.
 */
async function captureElement(el: HTMLElement): Promise<string> {
  const pageId = el.dataset.pdfPage;
  const printCss = getPrintCssText();

  const canvas = await html2canvas(el, {
    scale: 2,
    useCORS: true,
    allowTaint: true,
    backgroundColor: "#ffffff",
    logging: false,
    width: A4_LANDSCAPE_WIDTH_PX,
    height: A4_LANDSCAPE_HEIGHT_PX,
    windowWidth: A4_LANDSCAPE_WIDTH_PX,
    windowHeight: A4_LANDSCAPE_HEIGHT_PX,
    onclone: (clonedDoc) => {
      const style = clonedDoc.createElement("style");
      style.textContent = `
        ${printCss}

        html, body {
          width: ${A4_LANDSCAPE_WIDTH_PX}px !important;
          min-width: ${A4_LANDSCAPE_WIDTH_PX}px !important;
          height: auto !important;
          margin: 0 !important;
          padding: 0 !important;
          overflow: visible !important;
          background: #ffffff !important;
        }

        body > * {
          margin: 0 !important;
        }

        .pdf-export-root {
          width: ${A4_LANDSCAPE_WIDTH_PX}px !important;
          min-width: ${A4_LANDSCAPE_WIDTH_PX}px !important;
          height: ${A4_LANDSCAPE_HEIGHT_PX}px !important;
          min-height: ${A4_LANDSCAPE_HEIGHT_PX}px !important;
          margin: 0 !important;
          padding: 0 !important;
          overflow: hidden !important;
          background: #ffffff !important;
          box-sizing: border-box !important;
        }

        .pdf-export-root [class*="max-w-"] {
          max-width: none !important;
          width: 100% !important;
        }

        .pdf-export-root [class*="mx-auto"] {
          margin-left: 0 !important;
          margin-right: 0 !important;
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
      `;
      clonedDoc.head.appendChild(style);

      if (!pageId) return;

      const clonedPage = clonedDoc.querySelector<HTMLElement>(`[data-pdf-page="${pageId}"]`);
      if (!clonedPage) return;

      clonedPage.classList.add("pdf-export-root");
      clonedPage.style.width = `${A4_LANDSCAPE_WIDTH_PX}px`;
      clonedPage.style.minHeight = `${A4_LANDSCAPE_HEIGHT_PX}px`;
      clonedPage.style.height = `${A4_LANDSCAPE_HEIGHT_PX}px`;
      clonedPage.style.margin = "0";
      clonedPage.style.padding = "0";
      clonedPage.style.overflow = "hidden";
    },
  });

  return canvas.toDataURL("image/jpeg", 0.92);
}

/**
 * Build a merged proposal PDF:
 *  - Template Page 1 (cover) with customer/tech info overlaid
 *  - App report pages captured from the DOM
 *  - Template Pages 2-4 (marketing)
 */
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
      x: 58,
      y: 340,
      size: 20,
      font: helveticaBold,
      color: rgb(1, 1, 1),
    });
  }

  if (address) {
    coverPage.drawText(address, {
      x: 58,
      y: 310,
      size: 14,
      font: helvetica,
      color: rgb(0.85, 0.85, 0.85),
    });
  }

  if (technicianName) {
    coverPage.drawText(technicianName, {
      x: 58,
      y: 138,
      size: 14,
      font: helveticaBold,
      color: rgb(0.2, 0.2, 0.2),
    });
  }

  outDoc.addPage(coverPage);

  for (const el of reportPages) {
    const dataUrl = await captureElement(el);
    const imgBytes = await fetch(dataUrl).then((r) => r.arrayBuffer());
    const img = await outDoc.embedJpg(imgBytes);

    const page = outDoc.addPage([pageW, pageH]);
    page.drawImage(img, { x: 0, y: 0, width: pageW, height: pageH });
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
