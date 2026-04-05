import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import html2canvas from "html2canvas";

const TEMPLATE_PDF_URL = "/proposal-template.pdf";
// A4 landscape at 96dpi
const A4_W = 1123;
const A4_H = 794;

/**
 * Capture a DOM element as a high-resolution JPEG data URL.
 * Uses html2canvas onclone to apply print styles in an isolated clone.
 */
async function captureElement(el: HTMLElement): Promise<string> {
  const pageId = el.dataset.pdfPage;

  const canvas = await html2canvas(el, {
    scale: 2,
    useCORS: true,
    allowTaint: true,
    backgroundColor: "#ffffff",
    logging: false,
    windowWidth: A4_W,
    onclone: (clonedDoc) => {
      // Inject print-mode overrides into the clone
      const style = clonedDoc.createElement("style");
      style.textContent = `
        /* Force print-like layout */
        .no-print,
        button:not(.print-keep),
        [role="status"],
        .sonner,
        [data-sonner-toaster] {
          display: none !important;
        }

        .print-only-text {
          display: inline !important;
        }

        /* Print-only block elements (like select replacements) */
        .hidden.print\\:block,
        [class*="hidden"][class*="print\\:block"] {
          display: block !important;
        }

        html, body {
          width: ${A4_W}px !important;
          margin: 0 !important;
          padding: 0 !important;
          overflow: visible !important;
          background: #ffffff !important;
        }

        [class*="max-w-"] {
          max-width: none !important;
        }

        [class*="mx-auto"] {
          margin-left: 0 !important;
          margin-right: 0 !important;
        }
      `;
      clonedDoc.head.appendChild(style);

      if (!pageId) return;

      const clonedPage = clonedDoc.querySelector<HTMLElement>(`[data-pdf-page="${pageId}"]`);
      if (!clonedPage) return;

      // Let the page render at natural height — do NOT constrain height
      clonedPage.style.width = `${A4_W}px`;
      clonedPage.style.margin = "0";
      clonedPage.style.padding = "4px 8px";
      clonedPage.style.boxSizing = "border-box";
    },
  });

  return canvas.toDataURL("image/jpeg", 0.92);
}

/**
 * Build a merged proposal PDF:
 *  - Template Page 1 (cover) with customer/tech info overlaid
 *  - App report pages captured from the DOM (scaled to fit A4 landscape)
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
      x: 58, y: 340, size: 20,
      font: helveticaBold, color: rgb(1, 1, 1),
    });
  }

  if (address) {
    coverPage.drawText(address, {
      x: 58, y: 310, size: 14,
      font: helvetica, color: rgb(0.85, 0.85, 0.85),
    });
  }

  if (technicianName) {
    coverPage.drawText(technicianName, {
      x: 58, y: 138, size: 14,
      font: helveticaBold, color: rgb(0.2, 0.2, 0.2),
    });
  }

  outDoc.addPage(coverPage);

  // Capture and insert app report pages
  for (const el of reportPages) {
    const dataUrl = await captureElement(el);
    const imgBytes = await fetch(dataUrl).then((r) => r.arrayBuffer());
    const img = await outDoc.embedJpg(imgBytes);

    const page = outDoc.addPage([pageW, pageH]);

    // Scale to fit page while preserving aspect ratio
    const imgAspect = img.width / img.height;
    const pageAspect = pageW / pageH;

    let drawW: number, drawH: number, drawX: number, drawY: number;

    if (imgAspect > pageAspect) {
      // Wider than page — fit to width, center vertically
      drawW = pageW;
      drawH = pageW / imgAspect;
      drawX = 0;
      drawY = pageH - drawH; // Anchor to top
    } else {
      // Taller than page — fit to height, center horizontally
      drawH = pageH;
      drawW = pageH * imgAspect;
      drawX = (pageW - drawW) / 2;
      drawY = 0;
    }

    page.drawImage(img, { x: drawX, y: drawY, width: drawW, height: drawH });
  }

  // Append template marketing pages
  const marketingIndices = [];
  for (let i = 1; i < templateDoc.getPageCount(); i++) {
    marketingIndices.push(i);
  }
  const marketingPages = await outDoc.copyPages(templateDoc, marketingIndices);
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
