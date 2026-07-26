// ─── Portal "Download visit as PDF" helper ─────────────────────────────
// Captures a fully-expanded past-visit card from the DOM and produces a
// paginated PDF that mirrors the on-screen layout. Shared by the apartment
// and commercial portals (both admin and customer views).
import jsPDF from "jspdf";
import html2canvas from "html2canvas";

export interface VisitPdfOptions {
  /** DOM id of the visit card element to capture. */
  cardId: string;
  /** File name (without extension) — defaults to "service-visit". */
  filename?: string;
  /** Optional header label rendered above the card (e.g. property name). */
  title?: string;
}

const wait = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

export async function downloadVisitPdf({ cardId, filename = "service-visit", title }: VisitPdfOptions) {
  const el = document.getElementById(cardId);
  if (!el) throw new Error(`Visit card #${cardId} not found`);

  // Let any lazily-expanded content settle (images loading, etc.).
  await wait(150);
  const imgs = Array.from(el.querySelectorAll("img"));
  await Promise.all(
    imgs.map(img =>
      img.complete
        ? Promise.resolve()
        : new Promise<void>(res => {
            img.addEventListener("load", () => res(), { once: true });
            img.addEventListener("error", () => res(), { once: true });
          }),
    ),
  );

  // Hide any buttons/interactive controls inside the card during capture.
  const hidden: Array<[HTMLElement, string]> = [];
  el.querySelectorAll<HTMLElement>("[data-visit-pdf-hide]").forEach(node => {
    hidden.push([node, node.style.display]);
    node.style.display = "none";
  });

  const canvas = await html2canvas(el, {
    scale: 2,
    useCORS: true,
    backgroundColor: "#ffffff",
    logging: false,
    windowWidth: Math.max(el.scrollWidth, 900),
  });

  hidden.forEach(([node, prev]) => { node.style.display = prev; });

  // Letter portrait, 0.5" margin.
  const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "letter" });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 24;
  const contentW = pageW - margin * 2;

  // Header
  let cursorY = margin;
  if (title) {
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(12);
    pdf.setTextColor(42, 42, 42);
    pdf.text(title, margin, cursorY + 12);
    cursorY += 22;
  }

  const scale = contentW / canvas.width;
  const scaledFullH = canvas.height * scale;
  const firstPageAvail = pageH - cursorY - margin;

  if (scaledFullH <= firstPageAvail) {
    pdf.addImage(canvas.toDataURL("image/jpeg", 0.92), "JPEG", margin, cursorY, contentW, scaledFullH);
  } else {
    // Slice canvas vertically so each slice fits a fresh page.
    const sliceHpx = Math.floor((pageH - margin * 2) / scale);
    let offsetY = 0;
    let first = true;
    while (offsetY < canvas.height) {
      const hpx = Math.min(sliceHpx, canvas.height - offsetY);
      const slice = document.createElement("canvas");
      slice.width = canvas.width;
      slice.height = hpx;
      const ctx = slice.getContext("2d")!;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, slice.width, slice.height);
      ctx.drawImage(canvas, 0, offsetY, canvas.width, hpx, 0, 0, canvas.width, hpx);
      const y = first && title ? cursorY : margin;
      if (!first) pdf.addPage();
      pdf.addImage(slice.toDataURL("image/jpeg", 0.92), "JPEG", margin, y, contentW, hpx * scale);
      offsetY += hpx;
      first = false;
    }
  }

  pdf.save(`${filename}.pdf`);
}
