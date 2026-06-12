// Generates a "Pest Inspection Certification — Free and Clear" PDF for a
// single unit on a completed apartment / multi-unit appointment. Mirrors the
// physical template Crest currently distributes, prefilled with as much
// information as we have about the service.
//
// Used wherever a unit's status renders as "Free and Clear" — admin
// PropertyDashboard, PMPortalView, and the customer-facing ClientPortal.

import { jsPDF } from "jspdf";

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

export const generateFreeAndClearCertificatePdf = (ctx: FreeAndClearContext) => {
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

  // Title
  pdf.setFont("helvetica", "bold").setFontSize(14);
  pdf.text("PEST INSPECTION CERTIFICATION — FREE AND CLEAR", margin, y);
  y += 22;

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
  pdf.setDrawColor(180).line(margin, y, W - margin, y);
  y += 18;

  // Section: Certification
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
  pdf.setDrawColor(180).line(margin, y, W - margin, y);
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
  pdf.setDrawColor(120).line(margin, y, margin + 240, y);
  pdf.setFont("helvetica", "bold").setFontSize(10);
  pdf.text("Inspector Signature", margin, y + 14);
  pdf.setDrawColor(120).line(W - margin - 200, y, W - margin, y);
  pdf.text("Date", W - margin - 200, y + 14);

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
