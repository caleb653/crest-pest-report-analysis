import jsPDF from "jspdf";
import {
  COMPANY, RTT_INTRO, RTT_RIGHT_TO_ENTER_ACK, RTT_SECTIONS, RTT_TERMS_ACK, RTT_TITLE,
  type RightToTreatFormData,
} from "@/lib/rightToTreatTerms";

export interface RightToTreatAgreementPdfInput extends Partial<RightToTreatFormData> {
  signatureDataUrl?: string | null;
  signedAt?: string | null;
}

/** Checkbox + wrapped label. Returns the height consumed. */
function checkbox(doc: jsPDF, x: number, y: number, label: string, width: number, checked: boolean): number {
  const size = 9;
  doc.setDrawColor(60);
  doc.setLineWidth(0.8);
  doc.rect(x, y - size + 2, size, size);
  if (checked) {
    doc.setLineWidth(1.2);
    doc.line(x + 2, y - size / 2 + 2, x + size / 2 - 0.5, y);
    doc.line(x + size / 2 - 0.5, y, x + size - 1.5, y - size + 4);
  }
  doc.setLineWidth(0.5);
  const lines: string[] = doc.splitTextToSize(label, width - size - 6);
  doc.text(lines, x + size + 6, y);
  return Math.max(size, lines.length * 10.5) + 6;
}

/**
 * Signed (or blank, when no signature/fields are given) generic Right to Treat
 * agreement. Blank fields print as lines to write on.
 */
export function buildRightToTreatAgreementPdf(input: RightToTreatAgreementPdfInput): jsPDF {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 42;
  const usable = W - M * 2;
  const blank = !input.signatureDataUrl;
  let y = 0;

  const footer = () => {
    const n = doc.getNumberOfPages();
    for (let i = 1; i <= n; i++) {
      doc.setPage(i);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(110);
      doc.text(`${COMPANY.name}  ·  ${COMPANY.license}  ·  ${COMPANY.phone}  ·  ${COMPANY.website}`, W / 2, H - 22, { align: "center" });
      doc.text(`Page ${i} of ${n}`, W - M, H - 22, { align: "right" });
      doc.setTextColor(0);
    }
  };
  const ensure = (need: number) => {
    if (y + need > H - M - 20) {
      doc.addPage();
      y = M;
    }
  };
  const para = (text: string, size = 8.3, lineH = 10, style: "normal" | "bold" | "italic" = "normal") => {
    doc.setFont("helvetica", style);
    doc.setFontSize(size);
    const lines: string[] = doc.splitTextToSize(text, usable);
    for (const ln of lines) {
      ensure(lineH);
      doc.text(ln, M, y);
      y += lineH;
    }
  };
  const field = (label: string, value: string | null | undefined, x: number, width: number, rowY: number) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(90);
    doc.text(label.toUpperCase(), x, rowY);
    doc.setTextColor(0);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    const v = (value || "").trim();
    if (v) {
      const lines: string[] = doc.splitTextToSize(v, width);
      doc.text(lines[0], x, rowY + 13);
    }
    doc.setDrawColor(150);
    doc.line(x, rowY + 17, x + width, rowY + 17);
  };

  // Header band
  doc.setFillColor(42, 42, 42);
  doc.rect(0, 0, W, 64, "F");
  doc.setTextColor(255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(RTT_TITLE, M, 28);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`${COMPANY.name}  ·  ${COMPANY.license}  ·  ${COMPANY.phone}  ·  ${COMPANY.website}`, M, 46);
  doc.setTextColor(0);
  y = 86;

  // Parties / premises
  const half = (usable - 16) / 2;
  field("Customer / Property Name", input.property_name, M, half, y);
  field("Date", input.form_date, M + half + 16, half, y);
  y += 30;
  field("Service Address (Premises)", input.service_address, M, usable, y);
  y += 30;
  field("Unit / Suite / Area", input.unit_or_area, M, half, y);
  field("Crest Representative", input.crest_representative, M + half + 16, half, y);
  y += 30;
  field("Authorizing Party (Printed Name)", input.signer_name, M, half, y);
  field("Relationship to Premises", input.signer_relationship, M + half + 16, half, y);
  y += 30;
  field("Email", input.signer_email, M, half, y);
  field("Phone", input.signer_phone, M + half + 16, half, y);
  y += 34;

  para(RTT_INTRO, 8.3, 10, "italic");
  y += 4;

  for (const s of RTT_SECTIONS) {
    ensure(26);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.2);
    doc.text(s.title, M, y);
    y += 11;
    for (const p of s.paragraphs) {
      para(p);
      y += 3;
    }
    y += 3;
  }

  // Acknowledgments
  ensure(70);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.text("Acknowledgments", M, y);
  y += 13;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.3);
  y += checkbox(doc, M, y, RTT_RIGHT_TO_ENTER_ACK, usable, !blank && !!input.right_to_enter);
  y += checkbox(doc, M, y, RTT_TERMS_ACK, usable, !blank && !!input.terms_agreed);
  y += 6;

  // Signature block
  ensure(120);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.text("Signature", M, y);
  y += 10;
  const sigW = 250;
  const sigH = 78;
  doc.setDrawColor(120);
  doc.rect(M, y, sigW, sigH);
  if (input.signatureDataUrl) {
    try { doc.addImage(input.signatureDataUrl, "PNG", M + 4, y + 4, sigW - 8, sigH - 8); } catch { /* ignore */ }
  }
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(110);
  doc.text("Signature of Authorizing Party", M, y + sigH + 11);
  doc.setTextColor(0);
  const rx = M + sigW + 24;
  const rw = usable - sigW - 24;
  field("Printed Name", input.signer_name, rx, rw, y + 8);
  field("Date Signed", input.signedAt ? new Date(input.signedAt).toLocaleString() : input.form_date, rx, rw, y + 44);
  y += sigH + 30;

  footer();
  return doc;
}

export function downloadRightToTreatAgreementPdf(input: RightToTreatAgreementPdfInput) {
  const doc = buildRightToTreatAgreementPdf(input);
  const base = (input.property_name || input.signer_name || "blank").replace(/[^a-z0-9-]+/gi, "_");
  const kind = input.signatureDataUrl ? "signed" : "blank";
  doc.save(`right-to-treat-${kind}-${base}.pdf`);
}
