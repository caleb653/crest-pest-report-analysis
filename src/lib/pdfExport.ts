import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import html2canvas from "html2canvas";

const TEMPLATE_PDF_URL = "/proposal-template.pdf";

/**
 * Capture a DOM element as a high-resolution JPEG data URL.
 */
async function captureElement(el: HTMLElement): Promise<string> {
  // Temporarily force print-like styles
  el.style.overflow = "visible";

  const canvas = await html2canvas(el, {
    scale: 2,
    useCORS: true,
    allowTaint: true,
    backgroundColor: "#ffffff",
    logging: false,
    // Capture full scrollable content
    windowWidth: el.scrollWidth,
    windowHeight: el.scrollHeight,
  });

  el.style.overflow = "";

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

  // 1. Load the template PDF
  const templateBytes = await fetch(TEMPLATE_PDF_URL).then((r) => r.arrayBuffer());
  const templateDoc = await PDFDocument.load(templateBytes);

  // 2. Create the output PDF
  const outDoc = await PDFDocument.create();
  const helvetica = await outDoc.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await outDoc.embedFont(StandardFonts.HelveticaBold);

  // 3. Copy template page 1 (cover) and overlay text
  const [coverPage] = await outDoc.copyPages(templateDoc, [0]);
  const { width: pageW, height: pageH } = coverPage.getSize();
  // pageW ≈ 841.89, pageH ≈ 595.28

  // --- Overlay text on cover page ---
  // "Prepared for:" + customer name — below "PEST CONTROL PROPOSAL" heading
  // Based on the template layout, the lines are approximately:
  //   First line: x=58, y=350 from bottom (customer name)
  //   Second line: x=58, y=325 from bottom (address)
  // "PREPARED BY" section at bottom-left:
  //   Name line: x=58, y=138 from bottom

  if (customerName) {
    // Customer name on the first line under the heading
    coverPage.drawText(customerName, {
      x: 58,
      y: 340,
      size: 20,
      font: helveticaBold,
      color: rgb(1, 1, 1), // white text on dark background
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
    // Inspector name in the "PREPARED BY" section
    coverPage.drawText(technicianName, {
      x: 58,
      y: 138,
      size: 14,
      font: helveticaBold,
      color: rgb(0.2, 0.2, 0.2), // dark text on light background
    });
  }

  outDoc.addPage(coverPage);

  // 4. Capture and insert app report pages
  for (const el of reportPages) {
    const dataUrl = await captureElement(el);
    const imgBytes = await fetch(dataUrl).then((r) => r.arrayBuffer());
    const img = await outDoc.embedJpg(imgBytes);

    const page = outDoc.addPage([pageW, pageH]);

    // Scale image to fill the page while maintaining aspect ratio
    const imgAspect = img.width / img.height;
    const pageAspect = pageW / pageH;

    let drawW: number, drawH: number, drawX: number, drawY: number;

    if (imgAspect > pageAspect) {
      // Image is wider — fit to width
      drawW = pageW;
      drawH = pageW / imgAspect;
      drawX = 0;
      drawY = (pageH - drawH) / 2;
    } else {
      // Image is taller — fit to height
      drawH = pageH;
      drawW = pageH * imgAspect;
      drawX = (pageW - drawW) / 2;
      drawY = 0;
    }

    page.drawImage(img, { x: drawX, y: drawY, width: drawW, height: drawH });
  }

  // 5. Append template pages 2-4 (marketing pages)
  const marketingPageIndices = [];
  for (let i = 1; i < templateDoc.getPageCount(); i++) {
    marketingPageIndices.push(i);
  }
  const marketingPages = await outDoc.copyPages(templateDoc, marketingPageIndices);
  for (const mp of marketingPages) {
    outDoc.addPage(mp);
  }

  // 6. Save and return
  return outDoc.save();
}

/**
 * Trigger download of a PDF blob.
 */
export function downloadPDF(pdfBytes: Uint8Array, filename: string) {
  const blob = new Blob([pdfBytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
