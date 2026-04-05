import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import html2canvas from "html2canvas";

interface CoverPageData {
  customerName: string;
  address: string;
  technicianName: string;
  licenseNumber: string;
}

/**
 * Captures a DOM element as a JPEG data URL using html2canvas.
 */
async function captureElementAsImage(el: HTMLElement): Promise<Uint8Array> {
  // Temporarily expand for capture
  const origOverflow = el.style.overflow;
  el.style.overflow = "visible";

  const canvas = await html2canvas(el, {
    scale: 2,
    useCORS: true,
    allowTaint: true,
    backgroundColor: "#ffffff",
    logging: false,
    // Remove no-print elements
    ignoreElements: (element) => {
      return element.classList.contains("no-print") || 
             element.classList.contains("no-pdf") ||
             element.tagName === "INPUT" ||
             element.tagName === "BUTTON";
    },
  });

  el.style.overflow = origOverflow;

  return new Promise((resolve) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          // fallback
          const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
          const binary = atob(dataUrl.split(",")[1]);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
          resolve(bytes);
          return;
        }
        blob.arrayBuffer().then((buf) => resolve(new Uint8Array(buf)));
      },
      "image/jpeg",
      0.92
    );
  });
}

/**
 * Overlays customer & technician info onto the template cover page.
 * Coordinates are in PDF points (1 point = 1/72 inch).
 * Page is landscape US Letter: 792 x 612.
 */
function drawCoverPageText(
  page: import("pdf-lib").PDFPage,
  font: import("pdf-lib").PDFFont,
  fontBold: import("pdf-lib").PDFFont,
  data: CoverPageData
) {
  const textColor = rgb(0.85, 0.85, 0.85); // Light grey to match template aesthetic
  const darkColor = rgb(0.2, 0.2, 0.2); // Dark for the bottom section

  // Customer name — below "PEST CONTROL PROPOSAL" title
  // The title is at roughly y=340, customer name goes below it on the blank lines
  if (data.customerName) {
    page.drawText(data.customerName, {
      x: 52,
      y: 283,
      size: 16,
      font: fontBold,
      color: textColor,
    });
  }

  // Address — below customer name
  if (data.address) {
    // Truncate very long addresses
    const addr = data.address.length > 60 ? data.address.substring(0, 57) + "..." : data.address;
    page.drawText(addr, {
      x: 52,
      y: 258,
      size: 13,
      font: font,
      color: textColor,
    });
  }

  // Technician name — below "PREPARED BY" in the bottom section
  if (data.technicianName) {
    page.drawText(data.technicianName, {
      x: 52,
      y: 118,
      size: 13,
      font: fontBold,
      color: darkColor,
    });
  }

  // License number
  if (data.licenseNumber) {
    page.drawText(`License: ${data.licenseNumber}`, {
      x: 52,
      y: 98,
      size: 11,
      font: font,
      color: darkColor,
    });
  }
}

/**
 * Generates a complete merged PDF:
 * 1. Template Page 1 (with customer/tech info overlay)
 * 2. App-generated report pages (captured from DOM)
 * 3. Template Pages 2-4 (static marketing pages)
 */
export async function generateMergedPDF(
  coverData: CoverPageData,
  reportPageElements: HTMLElement[]
): Promise<Uint8Array> {
  // Load template PDF
  const templateResponse = await fetch("/proposal-template.pdf");
  const templateBytes = await templateResponse.arrayBuffer();
  const templateDoc = await PDFDocument.load(templateBytes);

  // Create the final document
  const finalDoc = await PDFDocument.create();

  // Embed fonts
  const font = await finalDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await finalDoc.embedFont(StandardFonts.HelveticaBold);

  // 1. Copy template page 1 and add customer/tech info
  const [templatePage1] = await finalDoc.copyPages(templateDoc, [0]);
  finalDoc.addPage(templatePage1);
  drawCoverPageText(templatePage1, font, fontBold, coverData);

  // 2. Capture and insert report pages from DOM
  for (const el of reportPageElements) {
    const imageBytes = await captureElementAsImage(el);
    const image = await finalDoc.embedJpg(imageBytes);
    
    // Create a landscape A4 page (matching template: 841.89 x 595.28)
    const pageW = 841.89;
    const pageH = 595.28;
    const page = finalDoc.addPage([pageW, pageH]);
    
    // Scale image to fit the page with minimal margins
    const margin = 10;
    const maxW = pageW - margin * 2;
    const maxH = pageH - margin * 2;
    const scale = Math.min(maxW / image.width, maxH / image.height);
    const scaledW = image.width * scale;
    const scaledH = image.height * scale;
    
    // Center the image on the page
    const x = (792 - scaledW) / 2;
    const y = (612 - scaledH) / 2;

    page.drawImage(image, {
      x,
      y,
      width: scaledW,
      height: scaledH,
    });
  }

  // 3. Copy template pages 2-4 (marketing pages)
  const remainingPageIndices = [];
  for (let i = 1; i < templateDoc.getPageCount(); i++) {
    remainingPageIndices.push(i);
  }
  const remainingPages = await finalDoc.copyPages(templateDoc, remainingPageIndices);
  for (const page of remainingPages) {
    finalDoc.addPage(page);
  }

  return finalDoc.save();
}

/**
 * Triggers download of the merged PDF.
 */
export async function downloadMergedPDF(
  coverData: CoverPageData,
  reportPageElements: HTMLElement[],
  filename?: string
): Promise<void> {
  const pdfBytes = await generateMergedPDF(coverData, reportPageElements);
  const blob = new Blob([pdfBytes as unknown as ArrayBuffer], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename || `Crest_Proposal_${coverData.customerName.replace(/\s+/g, "_") || "Report"}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Generates the merged PDF and returns it as a Blob (for email upload).
 */
export async function generateMergedPDFBlob(
  coverData: CoverPageData,
  reportPageElements: HTMLElement[]
): Promise<Blob> {
  const pdfBytes = await generateMergedPDF(coverData, reportPageElements);
  return new Blob([pdfBytes as unknown as ArrayBuffer], { type: "application/pdf" });
}
