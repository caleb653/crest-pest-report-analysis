// Generates a "Pest Inspection Certification — Free and Clear" PDF for a
// single unit on a completed apartment / multi-unit appointment. Mirrors the
// physical template Crest currently distributes, prefilled with as much
// information as we have about the service.
//
// Two variants come out of the same template:
//   • "general" — the all-pests certificate (default).
//   • "bedbug"  — a bed-bug-specific certificate. Property managers routinely
//                 need a document that names bed bugs explicitly (move-ins,
//                 tenant disputes, habitability claims), so every unit that
//                 qualifies for the general certificate can also produce this
//                 one.
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

export type FreeAndClearVariant = "general" | "bedbug";

/** What a certificate can certify. Any combination may be issued at once. */
export type FreeAndClearPest = "general" | "german-roach" | "bedbug";

export const FREE_AND_CLEAR_PESTS: { value: FreeAndClearPest; label: string }[] = [
  { value: "general", label: "General Pest" },
  { value: "german-roach", label: "German Cockroach" },
  { value: "bedbug", label: "Bed Bug" },
];

interface PestSpec {
  /** Plural noun for headings: "Bed Bugs". */
  title: string;
  /** Slots into "no evidence of ___ was observed". */
  phrase: string;
  /** "bed bug activity" — slots into "that no ___ … was observed". */
  declActivity: string;
  /** "a bed bug infestation" — slots into "and no evidence of ___". */
  declInfestation: string;
  /** What was looked for and not found. */
  bullets: string[];
  /** Pest-specific liability paragraph, used when several pests are combined. */
  disclaimer: string;
  /** Filename fragment. */
  fileTag: string;
}

const PEST_SPECS: Record<FreeAndClearPest, PestSpec> = {
  general: {
    title: "General Pests",
    phrase: "general pest activity",
    declActivity: "pest activity",
    declInfestation: "a pest infestation",
    bullets: [
      "Live or dead insects (cockroaches, ants, fleas, bed bugs, or other crawling insects)",
      "Rodents (mice, rats) or signs thereof, including droppings, gnaw marks, or nesting materials",
      "Flying insects (stored product pests, drain flies, or similar)",
      "Any other pest conducive conditions or infestations",
    ],
    disclaimer:
      "Crest Pest Control expressly disclaims any and all liability for pest activity originating after the inspection date; conditions concealed behind walls, under flooring, or in areas inaccessible at the time of inspection; infestation migrating from neighboring units, common areas, or the building exterior; and re-infestation resulting from tenant activity or introduction of infested items.",
    fileTag: "General-Pest",
  },
  "german-roach": {
    title: "German Cockroaches",
    phrase: "German cockroach activity (Blattella germanica)",
    declActivity: "German cockroach activity",
    declInfestation: "a German cockroach infestation",
    bullets: [
      "Live or dead German cockroaches in any life stage (nymphs or adults)",
      "Egg capsules (oothecae), shed skins, or fecal spotting in cabinets, drawers, or appliance voids",
      "Harborage or conducive conditions in kitchen and bathroom cracks, crevices, hinges, and warm equipment",
      "Monitors or traps showing capture or evidence of recent activity",
    ],
    disclaimer:
      "German cockroaches harbor in cracks, voids, and equipment that cannot be fully accessed during a visual inspection, and are routinely reintroduced through infested groceries, packaging, appliances, and belongings. Crest Pest Control disclaims liability for German cockroach activity originating after the inspection date, concealed in inaccessible harborage, migrating from neighboring units or common areas, or reintroduced by tenant activity.",
    fileTag: "German-Cockroach",
  },
  bedbug: {
    title: "Bed Bugs",
    phrase: "bed bug activity (Cimex lectularius)",
    declActivity: "bed bug activity",
    declInfestation: "a bed bug infestation",
    bullets: [
      "Live or dead bed bugs in any life stage (eggs, nymphs, or adults)",
      "Eggs, egg casings, or shed skins (exuviae) in seams, tufts, folds, or joints",
      "Fecal staining or blood spotting on mattresses, box springs, linens, or furniture",
      "Active harborage or bed bug conducive conditions in furniture, frames, baseboards, or wall voids",
    ],
    disclaimer:
      "Bed bugs are cryptic insects that conceal themselves in inaccessible harborage and are frequently reintroduced by human activity. Crest Pest Control disclaims liability for bed bug activity originating after the inspection date; concealed behind walls, under flooring, inside furniture or belongings, or in areas inaccessible at the time of inspection; migrating from neighboring units, common areas, or the building exterior; or resulting from the introduction of infested luggage, secondhand furniture, or other items.",
    fileTag: "Bed-Bug",
  },
};

const PEST_ORDER: FreeAndClearPest[] = ["general", "german-roach", "bedbug"];

/** Normalize a requested selection: de-duped, in document order, never empty. */
const resolvePests = (ctx: FreeAndClearContext): FreeAndClearPest[] => {
  const requested = ctx.pests && ctx.pests.length
    ? ctx.pests
    : ctx.variant === "bedbug"
      ? (["bedbug"] as FreeAndClearPest[])
      : (["general"] as FreeAndClearPest[]);
  const picked = PEST_ORDER.filter((p) => requested.includes(p));
  return picked.length ? picked : ["general"];
};

/** "A", "A or B", "A, B, or C" */
const joinList = (items: string[]): string => {
  if (items.length <= 1) return items[0] || "";
  if (items.length === 2) return `${items[0]} or ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, or ${items[items.length - 1]}`;
};

const GENERAL_ONLY_DISCLAIMER =
  'This report documents the observable pest conditions present in the above-referenced unit at the date and time of inspection only. A "free and clear" designation is a professional opinion based on visual inspection conducted under accessible and observable conditions; it is not a guarantee, certification, or warranty of any kind. Crest Pest Control expressly disclaims any and all liability for: (1) pest activity originating after the inspection date; (2) conditions concealed behind walls, under flooring, or in areas inaccessible at the time of inspection; (3) infestation migrating from neighboring units, common areas, or the building exterior; and (4) re-infestation resulting from tenant activity or introduction of infested items. This report does not create a warranty of habitability and does not substitute for any representations made by the property owner or manager. All parties should be aware that pest control is an ongoing process, and no single inspection can guarantee a permanently pest-free environment.';

const BEDBUG_ONLY_DISCLAIMER =
  'This report documents the conditions observed in the above-referenced unit at the date and time of inspection only. The inspection described was a visual pest inspection performed under accessible and observable conditions. A "no bed bugs observed" designation is a professional opinion based on visual inspection conducted under accessible and observable conditions; it is not a guarantee, certification, or warranty of any kind. Bed bugs are cryptic insects that conceal themselves in inaccessible harborage and are frequently reintroduced by human activity. Crest Pest Control expressly disclaims any and all liability for: (1) bed bug activity originating after the inspection date; (2) bed bugs concealed behind walls, under flooring, inside furniture or belongings, or in areas inaccessible at the time of inspection; (3) bed bugs migrating from neighboring units, common areas, or the building exterior; and (4) re-infestation resulting from tenant activity or the introduction of infested luggage, secondhand furniture, or other items. This report does not create a warranty of habitability and does not substitute for any representations made by the property owner or manager. All parties should be aware that pest control is an ongoing process, and no single inspection can guarantee a permanently bed-bug-free environment.';

const DISCLAIMER_OPENING =
  'This report documents the conditions observed in the above-referenced unit at the date and time of inspection only. The inspection described was a visual pest inspection performed under accessible and observable conditions. A "free and clear" designation is a professional opinion; it is not a guarantee, certification, or warranty of any kind.';

const DISCLAIMER_CLOSING =
  "This report does not create a warranty of habitability and does not substitute for any representations made by the property owner or manager. All parties should be aware that pest control is an ongoing process, and no single inspection can guarantee a permanently pest-free environment.";

export interface FreeAndClearContext {
  /** Which pests this certificate covers. Defaults to ["general"]. */
  pests?: FreeAndClearPest[];
  /** Legacy shorthand, still honored: "bedbug" === pests: ["bedbug"]. */
  variant?: FreeAndClearVariant;
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

  // A certificate reports findings, not a different inspection: the same
  // areas are inspected, and the document states only which pests were not
  // observed during it.
  const pests = resolvePests(ctx);
  const specs = pests.map((p) => PEST_SPECS[p]);
  const generalOnly = pests.length === 1 && pests[0] === "general";
  const bedBugOnly = pests.length === 1 && pests[0] === "bedbug";
  const titles = specs.map((sp) => sp.title);
  const PH = pdf.internal.pageSize.getHeight();
  // Several pests means a longer body, so every block checks for room first.
  const ensure = (needed: number) => {
    if (y + needed > PH - 44) {
      pdf.addPage();
      y = margin;
    }
  };

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
  pdf.text(
    generalOnly ? "Free and Clear" : `Free and Clear — No ${joinList(titles)} Observed`,
    W - margin,
    58,
    { align: "right" },
  );
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
  const certHeading = generalOnly
    ? "CERTIFICATION OF NO PEST ACTIVITY"
    : `CERTIFICATION OF NO ${joinList(titles).toUpperCase()} OBSERVED`;
  const certHeadingLines: string[] = pdf.splitTextToSize(certHeading, W - margin * 2);
  pdf.text(certHeadingLines, margin, y);
  y += 16 + (certHeadingLines.length - 1) * 14;
  pdf.setFont("helvetica", "normal").setFontSize(10.5);
  const cert = generalOnly
    ? "This certifies that on the date indicated above, a licensed pest control professional conducted a thorough inspection of the above-referenced dwelling unit. Based on this inspection, no evidence of pest activity was observed, including but not limited to:"
    : `This certifies that on the date indicated above, a licensed pest control professional conducted a thorough inspection of the above-referenced dwelling unit. During that inspection, no evidence of ${joinList(specs.map((sp) => sp.phrase))} was observed, including but not limited to:`;
  const certLines = pdf.splitTextToSize(cert, W - margin * 2);
  pdf.text(certLines, margin, y);
  y += certLines.length * 13 + 6;

  specs.forEach((spec, specIndex) => {
    // With more than one pest selected, label each group so the reader can
    // see exactly what was checked for each.
    if (specs.length > 1) {
      ensure(15);
      pdf.setFont("helvetica", "bold").setFontSize(10.5);
      pdf.text(`${spec.title}:`, margin + 6, y);
      pdf.setFont("helvetica", "normal").setFontSize(10.5);
      y += 14;
    }
    spec.bullets.forEach((b) => {
      const lines = pdf.splitTextToSize(b, W - margin * 2 - 18);
      ensure(lines.length * 13);
      pdf.text("•", margin + 6, y);
      pdf.text(lines, margin + 18, y);
      y += lines.length * 13;
    });
    if (specs.length > 1 && specIndex < specs.length - 1) y += 4;
  });
  y += 8;

  ensure(14 + DEFAULT_AREAS.length * 14 + 28);
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
  const decl = generalOnly
    ? "I, the undersigned, am a licensed pest control professional in the State of California and hereby certify that the above unit was inspected in accordance with industry standards and that no active pest infestation or evidence of pest activity was identified at the time of inspection."
    : `I, the undersigned, am a licensed pest control professional in the State of California and hereby certify that the above unit was inspected in accordance with industry standards and that no ${joinList(specs.map((sp) => sp.declActivity))}, and no evidence of ${joinList(specs.map((sp) => sp.declInfestation))}, was observed at the time of inspection.`;
  pdf.setFont("helvetica", "normal").setFontSize(10.5);
  const declLines = pdf.splitTextToSize(decl, W - margin * 2);
  // Declaration through the signature line is one block — never split it.
  ensure(16 + declLines.length * 13 + 6 + 26 + 14 + 3 * 14 + 60);
  pdf.setFont("helvetica", "bold").setFontSize(12);
  pdf.text("INSPECTOR DECLARATION", margin, y);
  y += 16;
  pdf.setFont("helvetica", "normal").setFontSize(10.5);
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

  // Liability disclaimer. Measured before the page-break check so the block
  // never lands under the footer band (the bed bug wording runs longer).
  y += 36;
  pdf.setFont("helvetica", "italic").setFontSize(8);
  const disclaimer = generalOnly
    ? GENERAL_ONLY_DISCLAIMER
    : bedBugOnly
      ? BEDBUG_ONLY_DISCLAIMER
      : [DISCLAIMER_OPENING, ...specs.map((sp) => sp.disclaimer), DISCLAIMER_CLOSING].join(" ");
  const dLines = pdf.splitTextToSize(disclaimer, W - margin * 2);
  ensure(12 + dLines.length * 10);
  pdf.setFont("helvetica", "bold").setFontSize(9);
  pdf.setTextColor(...BRAND_BLACK);
  pdf.text("IMPORTANT DISCLAIMER", margin, y);
  y += 12;
  pdf.setFont("helvetica", "italic").setFontSize(8);
  pdf.text(dLines, margin, y);
  y += dLines.length * 10;

  // Footer band on every page (a long disclaimer can spill to page 2)
  const pageCount = pdf.getNumberOfPages();
  for (let page = 1; page <= pageCount; page++) {
    pdf.setPage(page);
    pdf.setFillColor(...BRAND_BLACK);
    pdf.rect(0, PH - 28, W, 28, "F");
    pdf.setFillColor(...BRAND_DARK_SAGE);
    pdf.rect(0, PH - 32, W, 4, "F");
    pdf.setTextColor(255, 255, 255);
    pdf.setFont("helvetica", "normal").setFontSize(9);
    pdf.text("Crest Pest Control  ·  CA License #9859  ·  949-424-5000", W / 2, PH - 11, { align: "center" });
  }

  const safeUnit = (ctx.unitNumber || "Unit").replace(/[^a-z0-9-]+/gi, "-");
  const safeProp = (ctx.propertyName || "Property").replace(/[^a-z0-9-]+/gi, "-");
  const prefix = generalOnly
    ? "Free-and-Clear"
    : `${specs.map((sp) => sp.fileTag).join("-")}-Free-and-Clear`;
  pdf.save(`${prefix}-${safeProp}-${safeUnit}.pdf`);
};

/**
 * Per-unit flag that suppresses the bed bug certificate. Stored on the unit
 * row in `unit_details` (and on the completion draft before that).
 */
export const BEDBUG_FREE_AND_CLEAR_FIELD = "bedbug_free_and_clear";

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

/**
 * True when a free-and-clear unit should also offer the bed-bug-specific
 * certificate. Opt-OUT, not opt-in: a unit marked free and clear gets it
 * automatically unless someone explicitly unchecked the box on the report,
 * so legacy rows (which have no flag at all) keep working.
 */
export const isBedBugFreeAndClear = (unit: unknown): boolean => {
  const u = (unit ?? {}) as Record<string, unknown>;
  return isFreeAndClearStatus(u.status) && u[BEDBUG_FREE_AND_CLEAR_FIELD] !== false;
};
