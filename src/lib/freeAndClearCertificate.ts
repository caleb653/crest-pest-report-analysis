// Generates a "Pest Inspection Certification — Free and Clear" PDF for a
// single unit on a completed apartment / multi-unit appointment. Mirrors the
// physical template Crest currently distributes, prefilled with as much
// information as we have about the service.
//
// Used wherever a unit's status renders as "Free and Clear" — admin
// PropertyDashboard, PMPortalView, and the customer-facing ClientPortal.

import { jsPDF } from "jspdf";
import crestLogo from "@/assets/crest-logo-black.png";

// Crest brand colors
const BRAND_BLACK: [number, number, number] = [42, 42, 42];      // #2A2A2A
const BRAND_DARK_SAGE: [number, number, number] = [149, 161, 151]; // #95A197
const BRAND_SAGE: [number, number, number] = [195, 209, 197];      // #C3D1C5

const loadImage = (src: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });

// Hardcoded technician → CA structural pest control license map, kept in
// sync with `TECHNICIANS` in AppointmentReport.tsx so the certificate can
// auto-fill the inspector license even when we only stored a name.
const TECH_LICENSE: Record<string, string> = {
  "Darrell Tanner": "FR 62523",
  "Jake Shubin": "FR 71068",
  "Caleb Whalen": "FR 71183",
  "Jackson Latham": "FR 68261",
  "Dylan Gallegos": "RA 71068",
  "Michael Muniz": "FR 54193",
  "David Longoria": "FR 71710",
  "Nick Stovall": "FR 69245",
  "Brock Lyttle": "FR 62941",
};

export interface FreeAndClearContext {
  propertyName?: string | null;
  propertyAddress?: string | null;
  unitNumber?: string | null;
  inspectionDate?: string | null;   // ISO yyyy-mm-dd
  inspectorName?: string | null;
  inspectorLicense?: string | null; // optional — looked up from name if blank
  areasInspected?: string[];        // any subset of the standard areas
  phoneContact?: string | null;
}

const DEFAULT_AREAS = [
  "Kitchen & Food Preparation Areas",
  "Bathrooms",
  "Bedrooms",
  "Living/Common Areas",
];

const formatDate = (iso?: string | null): string => {
  if (!iso) return "";
  // accept yyyy-mm-dd (most reports) and full ISO
  const safe = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso}T00:00:00` : iso;
  const d = new Date(safe);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
};

export const generateFreeAndClearCertificatePdf = async (ctx: FreeAndClearContext) => {
  const pdf = new jsPDF({ unit: "pt", format: "letter" });
  const W = pdf.internal.pageSize.getWidth();
  const margin = 54; // 0.75"
  let y = margin;

  const inspectorName = (ctx.inspectorName || "").trim();
  const inspectorLicense =
    (ctx.inspectorLicense || "").trim() || TECH_LICENSE[inspectorName] || "";
  const inspectionDate = formatDate(ctx.inspectionDate);
  const areas = ctx.areasInspected && ctx.areasInspected.length ? ctx.areasInspected : DEFAULT_AREAS;
  const fullAddress = [ctx.propertyName, ctx.propertyAddress].filter(Boolean).join(" — ");

  // Branded header band
  const headerH = 86;
  pdf.setFillColor(...BRAND_BLACK);
  pdf.rect(0, 0, W, headerH, "F");
  // Sage accent stripe under header
  pdf.setFillColor(...BRAND_DARK_SAGE);
  pdf.rect(0, headerH, W, 4, "F");

  // Logo
  try {
    const img = await loadImage(crestLogo);
    // Render logo on a small white plate so the black wordmark is legible on black header
    const logoH = 54;
    const logoW = logoH * (img.width / img.height);
    const plateW = logoW + 20;
    const plateH = logoH + 14;
    const plateX = margin;
    const plateY = (headerH - plateH) / 2;
    pdf.setFillColor(255, 255, 255);
    pdf.roundedRect(plateX, plateY, plateW, plateH, 6, 6, "F");
    pdf.addImage(img, "PNG", plateX + 10, plateY + 7, logoW, logoH);
  } catch {
    // ignore — header text still renders
  }

  // Header text (right aligned)
  pdf.setTextColor(255, 255, 255);
  pdf.setFont("helvetica", "bold").setFontSize(15);
  pdf.text("PEST INSPECTION CERTIFICATION", W - margin, 38, { align: "right" });
  pdf.setTextColor(...BRAND_SAGE);
  pdf.setFont("helvetica", "normal").setFontSize(11);
  pdf.text("Free and Clear", W - margin, 58, { align: "right" });
  pdf.setTextColor(...BRAND_BLACK);

  y = headerH + 28;

  // Field block
  pdf.setFontSize(11);
  const drawField = (label: string, value: string) => {
    pdf.setFont("helvetica", "bold");
    pdf.text(label, margin, y);
    const labelWidth = pdf.getTextWidth(label) + 6;
    pdf.setFont("helvetica", "normal");
    const valueText = value && value.trim() ? value : "________________________";
    const lines = pdf.splitTextToSize(valueText, W - margin * 2 - labelWidth);
    pdf.text(lines, margin + labelWidth, y);
    y += 14 * Math.max(1, lines.length);
  };
  drawField("Date of Inspection:", inspectionDate);
  drawField("Property Address:", fullAddress);
  drawField("Unit Number:", ctx.unitNumber || "");
  drawField("Inspector Name:", inspectorName);
  drawField("License Number:", inspectorLicense);

  y += 8;
  pdf.setDrawColor(...BRAND_DARK_SAGE).line(margin, y, W - margin, y);
  y += 18;

  // Section: Certification
  pdf.setTextColor(...BRAND_BLACK);
  pdf.setFont("helvetica", "bold").setFontSize(12);
  pdf.text("CERTIFICATION OF NO PEST ACTIVITY", margin, y);
  y += 16;
  pdf.setFont("helvetica", "normal").setFontSize(10.5);
  const cert =
    "This certifies that on the date indicated above, a licensed pest control professional conducted a thorough inspection of the above-referenced dwelling unit. Based on this inspection, no evidence of pest activity was observed, including but not limited to:";
  const certLines = pdf.splitTextToSize(cert, W - margin * 2);
  pdf.text(certLines, margin, y);
  y += certLines.length * 13 + 6;

  const bullets = [
    "Live or dead insects (cockroaches, ants, fleas, bed bugs, or other crawling insects)",
    "Rodents (mice, rats) or signs thereof, including droppings, gnaw marks, or nesting materials",
    "Flying insects (stored product pests, drain flies, or similar)",
    "Any other pest conducive conditions or infestations",
  ];
  bullets.forEach((b) => {
    pdf.text("•", margin + 6, y);
    const lines = pdf.splitTextToSize(b, W - margin * 2 - 18);
    pdf.text(lines, margin + 18, y);
    y += lines.length * 13;
  });
  y += 8;

  pdf.setFont("helvetica", "bold").setFontSize(11);
  pdf.text("Areas Inspected:", margin, y);
  y += 14;
  pdf.setFont("helvetica", "normal").setFontSize(10.5);
  DEFAULT_AREAS.forEach((a) => {
    const checked = areas.some((x) => x.toLowerCase().trim() === a.toLowerCase().trim());
    pdf.text(checked ? "[x]" : "[ ]", margin, y);
    pdf.text(a, margin + 22, y);
    y += 14;
  });

  y += 10;
  pdf.setDrawColor(...BRAND_DARK_SAGE).line(margin, y, W - margin, y);
  y += 18;

  // Inspector Declaration
  pdf.setFont("helvetica", "bold").setFontSize(12);
  pdf.text("INSPECTOR DECLARATION", margin, y);
  y += 16;
  pdf.setFont("helvetica", "normal").setFontSize(10.5);
  const decl =
    "I, the undersigned, am a licensed pest control professional in the State of California and hereby certify that the above unit was inspected in accordance with industry standards and that no active pest infestation or evidence of pest activity was identified at the time of inspection.";
  const declLines = pdf.splitTextToSize(decl, W - margin * 2);
  pdf.text(declLines, margin, y);
  y += declLines.length * 13 + 6;

  const valid =
    "This certification is valid for 30 days from the date of inspection, provided no changes in conditions occur. This document does not constitute a warranty or guarantee against future pest activity.";
  const validLines = pdf.splitTextToSize(valid, W - margin * 2);
  pdf.text(validLines, margin, y);
  y += validLines.length * 13 + 14;

  drawField("Company Name:", "Crest Pest Control");
  drawField("Company License #:", "9859");
  drawField("Phone/Contact:", ctx.phoneContact || "949-424-5000");

  y += 24;
  // Typed signature (cursive) above the signature line
  if (inspectorName) {
    pdf.setFont("times", "italic").setFontSize(18);
    pdf.setTextColor(...BRAND_BLACK);
    pdf.text(inspectorName, margin + 4, y - 4);
  }
  if (inspectionDate) {
    pdf.setFont("times", "italic").setFontSize(14);
    pdf.text(inspectionDate, W - margin - 196, y - 4);
  }
  pdf.setDrawColor(...BRAND_BLACK).line(margin, y, margin + 240, y);
  pdf.setFont("helvetica", "bold").setFontSize(10);
  pdf.text("Inspector Signature", margin, y + 14);
  pdf.setDrawColor(...BRAND_BLACK).line(W - margin - 200, y, W - margin, y);
  pdf.text("Date", W - margin - 200, y + 14);

  // Liability disclaimer
  y += 36;
  const PH_check = pdf.internal.pageSize.getHeight();
  if (y > PH_check - 110) {
    pdf.addPage();
    y = margin;
  }
  pdf.setFont("helvetica", "bold").setFontSize(9);
  pdf.setTextColor(...BRAND_BLACK);
  pdf.text("IMPORTANT DISCLAIMER", margin, y);
  y += 12;
  pdf.setFont("helvetica", "italic").setFontSize(8);
  const disclaimer =
    'This report documents the observable pest conditions present in the above-referenced unit at the date and time of inspection only. A "free and clear" designation is a professional opinion based on visual inspection conducted under accessible and observable conditions; it is not a guarantee, certification, or warranty of any kind. Crest Pest Control expressly disclaims any and all liability for: (1) pest activity originating after the inspection date; (2) conditions concealed behind walls, under flooring, or in areas inaccessible at the time of inspection; (3) infestation migrating from neighboring units, common areas, or the building exterior; and (4) re-infestation resulting from tenant activity or introduction of infested items. This report does not create a warranty of habitability and does not substitute for any representations made by the property owner or manager. All parties should be aware that pest control is an ongoing process, and no single inspection can guarantee a permanently pest-free environment.';
  const dLines = pdf.splitTextToSize(disclaimer, W - margin * 2);
  pdf.text(dLines, margin, y);
  y += dLines.length * 10;

  // Footer band
  const PH = pdf.internal.pageSize.getHeight();
  pdf.setFillColor(...BRAND_BLACK);
  pdf.rect(0, PH - 28, W, 28, "F");
  pdf.setFillColor(...BRAND_DARK_SAGE);
  pdf.rect(0, PH - 32, W, 4, "F");
  pdf.setTextColor(255, 255, 255);
  pdf.setFont("helvetica", "normal").setFontSize(9);
  pdf.text("Crest Pest Control  ·  CA License #9859  ·  949-424-5000", W / 2, PH - 11, { align: "center" });

  const safeUnit = (ctx.unitNumber || "Unit").replace(/[^a-z0-9-]+/gi, "-");
  const safeProp = (ctx.propertyName || "Property").replace(/[^a-z0-9-]+/gi, "-");
  pdf.save(`Free-and-Clear-${safeProp}-${safeUnit}.pdf`);
};

/**
 * True when a unit's stored status should be treated as "Free and Clear"
 * (independent of whether the unit is an inspection or service row).
 */
export const isFreeAndClearStatus = (raw: unknown): boolean => {
  const s = String(raw ?? "").trim().toLowerCase();
  return (
    s === "free and clear" ||
    s === "free and clear*" ||
    s === "inspected: free and clear" ||
    s === "no activity found - free and clear"
  );
};
