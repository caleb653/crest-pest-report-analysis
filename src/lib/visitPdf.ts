// ─── Portal "Download visit as PDF" ────────────────────────────────────
// Generates a clean, print-style service report directly from the visit's
// DATA (not a screenshot of the on-screen card). Shared by the apartment
// and commercial portals, both admin and customer views.
//
// Why data-driven: the earlier html2canvas approach inherited every quirk
// of the web layout (scroll clipping, truncation, canvas size limits on
// long apartment visits) and cut content at page boundaries. Building the
// PDF from data gives a simple, reliable report where nothing is hidden.
import jsPDF from "jspdf";
import {
  normalizeUsageList,
  collectServiceProductUsage,
  aggregateUsage,
} from "@/lib/productCatalog";
import { friendlyUnitStatus } from "@/lib/unitStatus";

// ─── Public data model ──────────────────────────────────────────────────

export interface ProductRow { name: string; applied: string; undiluted: string }
export interface ItemRow {
  heading: string;
  detail?: string;
  badge?: string;
  notes?: string[];
  photos?: string[];
}
export interface UnitBlock {
  title: string;
  status?: string;
  badges: string[];
  fields: [string, string][];
  findings?: string;
  followUp?: boolean;
  photos?: string[];
}
export type VisitSection =
  | { type: "text"; title: string; paragraphs: string[] }
  | { type: "badges"; title: string; items: string[] }
  | { type: "products"; title: string; rows: ProductRow[] }
  | { type: "items"; title: string; tone: "red" | "green"; rows: ItemRow[] }
  | { type: "photos"; title: string; urls: string[] }
  | { type: "units"; title: string; units: UnitBlock[] };

export interface VisitPdfData {
  title: string;
  subtitle?: string;
  meta: [string, string][];
  /** Prominent callouts, e.g. "Follow-up recommended". */
  flags?: string[];
  sections: VisitSection[];
  /** Append the CA pesticide notice at the end. */
  pesticideNotice?: boolean;
  /** Append the apartment inspection disclaimer at the end. */
  apartmentDisclaimer?: boolean;
}

// ─── Shared formatting helpers (timezone-safe) ──────────────────────────

export function fmtVisitDate(d: unknown): string {
  const s = String(d || "").slice(0, 10);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return String(d || "");
  const dt = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return dt.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

export function fmtVisitTime(t: unknown): string {
  const m = String(t || "").match(/^(\d{1,2}):(\d{2})/);
  if (!m) return "";
  let h = Number(m[1]);
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${m[2]} ${ampm}`;
}

const amt = (a: unknown, u: unknown): string =>
  a != null && a !== "" && Number(a) !== 0 ? `${a} ${u || ""}`.trim() : "—";

// ─── Section builders — mirror what each portal's visit card shows ──────

/** Past-visit report data for the commercial portal (admin + customer). */
export function buildCommercialVisitPdfData(opts: {
  service: any;
  services: any[];
  requests: any[];
  propertyName?: string;
}): VisitPdfData {
  const { service: s, services, requests, propertyName } = opts;
  const rd: any = s.report_data || {};
  const sections: VisitSection[] = [];
  const svcDate = (s.service_date || "").toString().slice(0, 10);

  const condRow = (c: any, badge: string, extraNotes: string[] = [], photos?: string[]): ItemRow => ({
    heading: c.condition || c.name || c.area || "Condition",
    detail: [c.area && c.condition ? c.area : null, c.detail].filter(Boolean).join(" — "),
    badge,
    notes: extraNotes.filter(Boolean),
    photos: (photos || (Array.isArray(c.photos) ? c.photos : [])).slice(0, 3),
  });

  // Conditions added this visit (minus ones closed on this same visit).
  const ownRows: any[] = Array.isArray(rd.conditions) ? rd.conditions : (Array.isArray(rd.concerns) ? rd.concerns : []);
  const addedRows = ownRows.filter((c: any) => c && !(c.status === "Closed" && c.closed_on_service_id === s.id));
  if (addedRows.length > 0) {
    sections.push({
      type: "items", title: `Conditions Added This Visit (${addedRows.length})`, tone: "red",
      rows: addedRows.map((c: any) => condRow(c, c.status || "Open")),
    });
  }

  // Conditions resolved on this visit (may have been added on an earlier one).
  const resolvedHere: any[] = services.flatMap((os: any) => {
    const rows = Array.isArray(os.report_data?.conditions) ? os.report_data.conditions : [];
    return rows
      .filter((c: any) => c && c.status === "Closed" && c.closed_on_service_id === s.id)
      .map((c: any) => ({ ...c, __originDate: os.service_date }));
  });
  if (resolvedHere.length > 0) {
    sections.push({
      type: "items", title: `Conditions Resolved This Visit (${resolvedHere.length})`, tone: "green",
      rows: resolvedHere.map((c: any) => condRow(
        c, "Closed",
        [
          c.__originDate ? `Originally added ${fmtVisitDate(c.__originDate)}` : "",
          c.response_notes ? `Crest response: ${c.response_notes}` : "",
          c.resolution_note ? `"${c.resolution_note}"` : "",
        ],
        [
          ...(Array.isArray(c.resolution_photos) ? c.resolution_photos : []),
          ...(Array.isArray(c.photos) ? c.photos : []),
        ],
      )),
    });
  }

  // Pest sightings resolved on this visit.
  const sightingsResolved = (requests || []).filter((r: any) => {
    const st = (r.sighting_status || r.status || "").toLowerCase();
    const isClosed = st === "closed" || st === "completed" || st === "cancelled";
    if (!isClosed) return false;
    if (r.resolved_service_id) return r.resolved_service_id === s.id;
    const closedAt = (r.closed_at || r.updated_at || "").toString().slice(0, 10);
    return !!svcDate && closedAt === svcDate;
  });
  if (sightingsResolved.length > 0) {
    sections.push({
      type: "items", title: `Pest Sightings Resolved This Visit (${sightingsResolved.length})`, tone: "green",
      rows: sightingsResolved.map((sg: any) => ({
        heading: sg.pest_type || sg.request_type || "Sighting",
        detail: [sg.location_type, sg.description].filter(Boolean).join(" — "),
        badge: "Resolved",
        notes: sg.response_notes ? [`Crest response: ${sg.response_notes}`] : [],
      })),
    });
  }

  // Service notes.
  const notes = [s.summary, s.findings, s.notes].filter(Boolean).map(String);
  if (notes.length > 0) sections.push({ type: "text", title: "Service Notes", paragraphs: notes });

  // Products used.
  const products = normalizeUsageList(s.products_used);
  if (products.length > 0) {
    sections.push({
      type: "products", title: "Product Used",
      rows: products.map(p => ({
        name: p.name,
        applied: amt(p.applied_amount, p.applied_unit),
        undiluted: amt(p.undiluted_amount, p.undiluted_unit),
      })),
    });
  }

  // Equipment used.
  const equipment: any[] = Array.isArray(rd.non_chem_equipment) ? rd.non_chem_equipment : [];
  if (equipment.length > 0) {
    sections.push({
      type: "badges", title: "Equipment Used",
      items: equipment.map((e: any) => `${e?.name || String(e)}${e?.qty ? ` × ${e.qty}` : ""}`),
    });
  }

  // Property photos.
  const photos = (Array.isArray(s.photos) ? s.photos : [])
    .map((p: any) => (typeof p === "string" ? p : p?.url))
    .filter(Boolean);
  if (photos.length > 0) sections.push({ type: "photos", title: "Property Images", urls: photos });

  // Conditions still present at this visit (added earlier, not yet resolved).
  if (svcDate) {
    const svcById: Record<string, any> = Object.fromEntries(services.map((x: any) => [x.id, x]));
    const present: any[] = [];
    services.forEach((os: any) => {
      if (os.id === s.id) return;
      const osDate = (os.service_date || "").toString().slice(0, 10);
      if (!osDate || osDate > svcDate) return;
      const list = Array.isArray(os.report_data?.conditions) ? os.report_data.conditions : [];
      list.forEach((c: any) => {
        if (!c) return;
        if (c.status === "Closed") {
          const closedSvc = c.closed_on_service_id ? svcById[c.closed_on_service_id] : null;
          const closedDate = closedSvc
            ? (closedSvc.service_date || "").toString().slice(0, 10)
            : (c.closed_at || "").toString().slice(0, 10);
          if (closedDate && closedDate <= svcDate) return;
        }
        present.push({ ...c, __originDate: os.service_date });
      });
    });
    if (present.length > 0) {
      sections.push({
        type: "items", title: `Conditions Present (${present.length})`, tone: "red",
        rows: present.map((c: any) => condRow(c, "Open", [
          c.__originDate ? `Originally added ${fmtVisitDate(c.__originDate)}` : "",
        ])),
      });
    }
  }

  const meta: [string, string][] = [
    ["Date", fmtVisitDate(s.service_date)],
    ["Time", fmtVisitTime(s.service_time)],
    ["Technician", s.technician || ""],
    ["Service", s.service_type || ""],
  ].filter(([, v]) => !!v) as [string, string][];

  const flags: string[] = [];
  if (s.follow_up_recommended) flags.push("Follow-up recommended");
  if (s.status === "cancelled") flags.push("Cancelled");

  return {
    title: "Service Report",
    subtitle: propertyName,
    meta,
    flags,
    sections,
    pesticideNotice: s.status !== "cancelled",
  };
}

/** Past-visit report data for the apartment / HOA portal (admin + customer). */
export function buildApartmentVisitPdfData(opts: {
  service: any;
  propertyName?: string;
  isHOA?: boolean;
}): VisitPdfData {
  const { service: s, propertyName, isHOA } = opts;
  const sections: VisitSection[] = [];

  // Summary / findings / notes.
  const summary = [s.summary, s.findings, s.notes].filter(Boolean).map(String);
  if (summary.length > 0) {
    sections.push({
      type: "text",
      title: s.technician ? `Technician Findings — ${s.technician}` : "Technician Findings",
      paragraphs: summary,
    });
  }

  // Service-level photos.
  const svcPhotos = (Array.isArray(s.photos) ? s.photos : [])
    .map((p: any) => (typeof p === "string" ? p : p?.url))
    .filter(Boolean);
  if (svcPhotos.length > 0) sections.push({ type: "photos", title: "Service Photos", urls: svcPhotos });

  // Products — aggregate service-level + per-unit usage.
  const aggregated = aggregateUsage(collectServiceProductUsage(s));
  if (aggregated.length > 0) {
    sections.push({
      type: "products", title: "Products Used",
      rows: aggregated.map(r => ({
        name: r.name,
        applied: r.appliedTotal > 0 ? `${+r.appliedTotal.toFixed(3)} ${r.appliedUnit}` : "—",
        undiluted: r.undilutedTotal > 0 ? `${+r.undilutedTotal.toFixed(3)} ${r.undilutedUnit}` : "—",
      })),
    });
  }

  // Per-unit reports, sorted numerically by unit number like the portal.
  const unitDetails: any[] = Array.isArray(s.unit_details) ? [...s.unit_details] : [];
  unitDetails.sort((a, b) => {
    const ka = String(a?.unit_number || "").trim();
    const kb = String(b?.unit_number || "").trim();
    if (!ka && !kb) return 0;
    if (!ka) return 1;
    if (!kb) return -1;
    return ka.localeCompare(kb, undefined, { numeric: true, sensitivity: "base" });
  });
  if (unitDetails.length > 0) {
    sections.push({
      type: "units",
      title: isHOA ? `Common Areas & Units Serviced (${unitDetails.length})` : `Unit Summary (${unitDetails.length})`,
      units: unitDetails.map((u: any) => {
        const kind = u.kind === "inspection" ? "inspection" : "service";
        const productsText = Array.isArray(u.products_used)
          ? (u.products_used as any[]).map((p: any) => (typeof p === "string" ? p : p?.name)).filter(Boolean).join(", ")
          : (u.products_used ? String(u.products_used) : "");
        const fields: [string, string][] = [];
        if (u.target_pest) fields.push(["Target Pest", String(u.target_pest)]);
        if (u.pest_activity && u.pest_activity !== "None") fields.push(["Activity Level", String(u.pest_activity)]);
        if (productsText) fields.push(["Products", productsText]);
        if (u.notes) fields.push(["Notes", String(u.notes)]);
        const badges = [kind === "inspection" ? "Inspection" : "Service"];
        if (u.sanitization_concern) badges.push("Sanitization Concern");
        return {
          title: String(u.unit_number || "—"),
          status: u.status ? friendlyUnitStatus(u.status, kind as any) : undefined,
          badges,
          fields,
          findings: u.findings ? String(u.findings) : undefined,
          followUp: u.follow_up_needed === true,
          photos: (Array.isArray(u.photos) ? u.photos : [])
            .map((p: any) => (typeof p === "string" ? p : p?.url))
            .filter(Boolean),
        } as UnitBlock;
      }),
    });
  }

  // Planned units (only when no per-unit reports exist).
  const unitsPlanned: string[] = Array.isArray(s.units_planned) ? s.units_planned : [];
  if (unitsPlanned.length > 0 && unitDetails.length === 0) {
    sections.push({ type: "badges", title: "Planned Units", items: unitsPlanned.map(String) });
  }

  if (s.prep_required && s.prep_notes) {
    sections.push({ type: "text", title: "Prep Required", paragraphs: [String(s.prep_notes)] });
  }
  if (s.special_notes && !/^\s*Follow-up units from/i.test(s.special_notes)) {
    sections.push({ type: "text", title: "Special Notes", paragraphs: [String(s.special_notes)] });
  }

  const meta: [string, string][] = [
    ["Date", fmtVisitDate(s.service_date)],
    ["Time", fmtVisitTime(s.service_time)],
    ["Technician", s.technician || ""],
    ["Service", s.service_type || ""],
  ].filter(([, v]) => !!v) as [string, string][];

  const flags: string[] = [];
  const fuUnits = unitDetails.filter((u: any) => u?.follow_up_needed === true);
  if (s.follow_up_recommended || fuUnits.length > 0) {
    const list = fuUnits.map((u: any) => u.unit_number).filter(Boolean).join(", ");
    flags.push(list ? `Follow-up needed: ${list}` : "Follow-up recommended");
  }

  return {
    title: "Service Report",
    subtitle: propertyName,
    meta,
    flags,
    sections,
    pesticideNotice: true,
    apartmentDisclaimer: !isHOA,
  };
}

// ─── Legal texts ────────────────────────────────────────────────────────

const PESTICIDE_NOTICE_INTRO =
  "Crest Pest Control is committed to the safety of our customers and our environment. All materials used by " +
  "Crest Pest Control have been registered by the Environmental Protection Agency. Please avoid unnecessary " +
  "contact with materials and comply with all instructions and recommendations from our technicians. Thanks for " +
  "your patronage! National Emergency Poison Control: (800) 222-1222";

const PESTICIDE_NOTICE_LEGAL =
  "“State law requires that you be given the following information: CAUTION—PESTICIDES ARE TOXIC CHEMICALS. " +
  "Structural Pest Control Companies are registered and regulated by the Structural Pest Control Board, and apply " +
  "pesticides which are registered and approved for use by the California Department of Pesticide Regulation and " +
  "the United States Environmental Protection Agency. Registration is granted when the state finds that, based on " +
  "existing scientific evidence, there are no appreciable risks if proper use conditions are followed or that the " +
  "risks are outweighed by the benefits. The degree of risk depends upon the degree of exposure, so exposure should " +
  "be minimized.” “If within 24 hours following application you experience symptoms similar to common seasonal " +
  "illness comparable to the flu, contact your physician or poison control center (800-222-1222) and your pest " +
  "control company immediately.” (This statement shall be modified to include any other symptoms of overexposure " +
  "which are not typical of influenza.) “For further information, contact any of the following: Crest Pest Control " +
  "(949-424-5000); for Health Questions—the County Health Department (800-564-8448); for Application " +
  "Information—the County Agricultural Commissioner (714-955-0100) and for Regulatory Information—the Structural " +
  "Pest Control Board (800-737-8188), 2005 Evergreen Street, Ste. 1500, Sacramento, CA 95815).”";

const APARTMENT_DISCLAIMER =
  "IMPORTANT DISCLAIMER: This report documents the observable pest conditions present in the above-referenced " +
  "unit at the date and time of inspection only. A “free and clear” designation is a professional opinion based on " +
  "visual inspection conducted under accessible and observable conditions; it is not a guarantee, certification, " +
  "or warranty of any kind. Crest Pest Control expressly disclaims any and all liability for: (1) pest activity " +
  "originating after the inspection date; (2) conditions concealed behind walls, under flooring, or in areas " +
  "inaccessible at the time of inspection; (3) infestation migrating from neighboring units, common areas, or the " +
  "building exterior; and (4) re-infestation resulting from tenant activity or introduction of infested items. " +
  "This report does not create a warranty of habitability and does not substitute for any representations made by " +
  "the property owner or manager. All parties should be aware that pest control is an ongoing process, and no " +
  "single inspection can guarantee a permanently pest-free environment.";

// ─── Photo loading ──────────────────────────────────────────────────────

interface LoadedPhoto { img: HTMLImageElement; w: number; h: number; objectUrl: string }

async function loadPhoto(url: string): Promise<LoadedPhoto | null> {
  try {
    const res = await fetch(url, { mode: "cors" });
    if (!res.ok) return null;
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("decode failed"));
      img.src = objectUrl;
    });
    return { img, w: img.naturalWidth, h: img.naturalHeight, objectUrl };
  } catch {
    return null;
  }
}

async function loadPhotos(urls: string[]): Promise<Map<string, LoadedPhoto>> {
  const unique = Array.from(new Set(urls.filter(Boolean)));
  const out = new Map<string, LoadedPhoto>();
  const CONCURRENCY = 5;
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, unique.length) }, async () => {
      while (i < unique.length) {
        const url = unique[i++];
        const loaded = await loadPhoto(url);
        if (loaded) out.set(url, loaded);
      }
    }),
  );
  return out;
}

/** Render a photo into a JPEG data-URL box (cover-crop or contain-fit). */
function photoDataUrl(p: LoadedPhoto, boxW: number, boxH: number, mode: "cover" | "contain") {
  const PX = 3; // render at 3x the pt size for crispness
  const cw = Math.round(boxW * PX);
  const ch = Math.round(boxH * PX);
  const canvas = document.createElement("canvas");
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#f4f4f4";
  ctx.fillRect(0, 0, cw, ch);
  const scale = mode === "cover" ? Math.max(cw / p.w, ch / p.h) : Math.min(cw / p.w, ch / p.h);
  const dw = p.w * scale;
  const dh = p.h * scale;
  ctx.drawImage(p.img, (cw - dw) / 2, (ch - dh) / 2, dw, dh);
  return canvas.toDataURL("image/jpeg", 0.82);
}

// ─── PDF rendering ──────────────────────────────────────────────────────

const COLORS = {
  ink: [42, 42, 42] as const,
  muted: [110, 116, 110] as const,
  faint: [150, 155, 150] as const,
  rule: [222, 226, 222] as const,
  sage: [149, 161, 151] as const,
  sageTint: [238, 242, 238] as const,
  red: [170, 40, 40] as const,
  green: [30, 120, 60] as const,
  amber: [165, 105, 20] as const,
  orange: [200, 105, 30] as const,
};

export async function downloadVisitPdf(data: VisitPdfData & { filename?: string }) {
  // Preload every photo referenced anywhere in the report.
  const allUrls: string[] = [];
  for (const sec of data.sections) {
    if (sec.type === "photos") allUrls.push(...sec.urls);
    if (sec.type === "items") sec.rows.forEach(r => allUrls.push(...(r.photos || [])));
    if (sec.type === "units") sec.units.forEach(u => allUrls.push(...(u.photos || [])));
  }
  const photoMap = await loadPhotos(allUrls);

  const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "letter" });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 46;
  const contentW = pageW - margin * 2;
  const bottom = pageH - margin - 14; // room for footer
  let y = margin;

  const setFont = (size: number, style: "normal" | "bold" | "italic" = "normal", color: readonly number[] = COLORS.ink) => {
    pdf.setFont("helvetica", style === "italic" ? "italic" : style);
    pdf.setFontSize(size);
    pdf.setTextColor(color[0], color[1], color[2]);
  };

  const ensure = (h: number) => {
    if (y + h > bottom) {
      pdf.addPage();
      y = margin;
    }
  };

  /** Write wrapped text, breaking across pages line-by-line. Returns nothing; advances y. */
  const writeText = (
    text: string, x: number, width: number, size: number,
    opts: { style?: "normal" | "bold" | "italic"; color?: readonly number[]; lineH?: number } = {},
  ) => {
    const lineH = opts.lineH ?? size * 1.38;
    setFont(size, opts.style || "normal", opts.color || COLORS.ink);
    for (const para of String(text).split(/\n/)) {
      const lines: string[] = para.trim() === "" ? [" "] : pdf.splitTextToSize(para, width);
      for (const line of lines) {
        ensure(lineH);
        // splitTextToSize can be re-measured after a page break reset fonts
        setFont(size, opts.style || "normal", opts.color || COLORS.ink);
        pdf.text(line, x, y + size * 0.85);
        y += lineH;
      }
    }
  };

  const sectionTitle = (title: string, color: readonly number[] = COLORS.ink) => {
    ensure(34); // keep the title with at least a first content line
    y += 6;
    pdf.setFillColor(COLORS.sage[0], COLORS.sage[1], COLORS.sage[2]);
    pdf.rect(margin, y + 1, 3, 10, "F");
    setFont(10, "bold", color);
    pdf.text(title.toUpperCase(), margin + 8, y + 9.5);
    y += 17;
  };

  const chipRow = (items: string[]) => {
    setFont(8.5, "bold", COLORS.ink);
    let x = margin;
    const chipH = 15;
    for (const item of items) {
      const w = pdf.getTextWidth(item) + 12;
      if (x + w > margin + contentW) {
        x = margin;
        y += chipH + 4;
      }
      ensure(chipH + 2);
      pdf.setDrawColor(COLORS.rule[0], COLORS.rule[1], COLORS.rule[2]);
      pdf.setFillColor(250, 250, 249);
      pdf.roundedRect(x, y, w, chipH, 3, 3, "FD");
      setFont(8.5, "bold", COLORS.ink);
      pdf.text(item, x + 6, y + 10.5);
      x += w + 5;
    }
    y += chipH + 6;
  };

  const photoGrid = (urls: string[], cellW: number, cellH: number, mode: "cover" | "contain", perRow: number) => {
    const gap = 6;
    let drawn = 0;
    let missing = 0;
    for (let r = 0; r < urls.length; r += perRow) {
      const row = urls.slice(r, r + perRow);
      const loadedRow = row.map(u => photoMap.get(u) || null);
      if (loadedRow.every(p => !p)) { missing += row.length; continue; }
      ensure(cellH + gap);
      let x = margin;
      for (const p of loadedRow) {
        if (p) {
          pdf.addImage(photoDataUrl(p, cellW, cellH, mode), "JPEG", x, y, cellW, cellH);
          pdf.setDrawColor(COLORS.rule[0], COLORS.rule[1], COLORS.rule[2]);
          pdf.rect(x, y, cellW, cellH, "S");
          drawn++;
        } else {
          missing++;
        }
        x += cellW + gap;
      }
      y += cellH + gap;
    }
    if (missing > 0 && drawn === 0) {
      writeText("Photos could not be embedded — view them in the online portal.", margin, contentW, 8.5, { style: "italic", color: COLORS.muted });
    }
    y += 2;
  };

  // ── Header ──
  setFont(15, "bold");
  pdf.text("Crest Pest Control", margin, y + 12);
  setFont(8.5, "normal", COLORS.faint);
  const generated = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  pdf.text(`Generated ${generated}`, margin + contentW, y + 12, { align: "right" });
  y += 24;
  setFont(12.5, "bold");
  pdf.text(data.title, margin, y + 10);
  y += 18;
  if (data.subtitle) {
    setFont(10, "normal", COLORS.muted);
    pdf.text(pdf.splitTextToSize(data.subtitle, contentW)[0], margin, y + 8);
    y += 15;
  }
  if (data.meta.length > 0) {
    let x = margin;
    const metaY = y + 8;
    for (const [label, value] of data.meta) {
      setFont(7.5, "bold", COLORS.faint);
      const labelText = label.toUpperCase();
      setFont(9.5, "bold", COLORS.ink);
      const valueW = pdf.getTextWidth(value);
      setFont(7.5, "bold", COLORS.faint);
      const labelW = pdf.getTextWidth(labelText);
      const w = Math.max(valueW, labelW);
      if (x + w > margin + contentW) break; // meta overflow — extremely unlikely
      pdf.text(labelText, x, metaY);
      setFont(9.5, "bold", COLORS.ink);
      pdf.text(value, x, metaY + 11);
      x += w + 18;
    }
    y += 28;
  }
  if (data.flags && data.flags.length > 0) {
    for (const flag of data.flags) {
      setFont(8.5, "bold", COLORS.orange);
      const w = pdf.getTextWidth(flag) + 14;
      pdf.setDrawColor(230, 160, 90);
      pdf.setFillColor(255, 246, 235);
      pdf.roundedRect(margin, y, Math.min(w, contentW), 16, 3, 3, "FD");
      pdf.text(flag, margin + 7, y + 11);
      y += 21;
    }
  }
  pdf.setDrawColor(COLORS.sage[0], COLORS.sage[1], COLORS.sage[2]);
  pdf.setLineWidth(1.4);
  pdf.line(margin, y + 4, margin + contentW, y + 4);
  pdf.setLineWidth(0.5);
  y += 14;

  // ── Sections ──
  for (const sec of data.sections) {
    if (sec.type === "text") {
      sectionTitle(sec.title);
      sec.paragraphs.forEach((p, i) => {
        writeText(p, margin, contentW, 9.5);
        if (i < sec.paragraphs.length - 1) y += 4;
      });
      y += 8;
    }

    if (sec.type === "badges") {
      sectionTitle(sec.title);
      chipRow(sec.items);
      y += 4;
    }

    if (sec.type === "products") {
      sectionTitle(sec.title);
      const cols = [0.44, 0.28, 0.28].map(f => f * contentW);
      const headers = ["Product", "Applied (diluted)", "Undiluted (concentrate)"];
      const drawHead = () => {
        ensure(18);
        pdf.setFillColor(COLORS.sageTint[0], COLORS.sageTint[1], COLORS.sageTint[2]);
        pdf.rect(margin, y, contentW, 15, "F");
        setFont(8, "bold", COLORS.ink);
        let hx = margin;
        headers.forEach((h, i) => { pdf.text(h, hx + 5, y + 10.5); hx += cols[i]; });
        y += 15;
      };
      drawHead();
      for (const row of sec.rows) {
        setFont(9, "normal");
        const nameLines: string[] = pdf.splitTextToSize(row.name, cols[0] - 10);
        const rowH = Math.max(15, nameLines.length * 11 + 6);
        if (y + rowH > bottom) { pdf.addPage(); y = margin; drawHead(); }
        setFont(9, "bold", COLORS.ink);
        nameLines.forEach((l, i) => pdf.text(l, margin + 5, y + 11 + i * 11));
        setFont(9, "normal", COLORS.muted);
        pdf.text(row.applied, margin + cols[0] + 5, y + 11);
        pdf.text(row.undiluted, margin + cols[0] + cols[1] + 5, y + 11);
        y += rowH;
        pdf.setDrawColor(COLORS.rule[0], COLORS.rule[1], COLORS.rule[2]);
        pdf.line(margin, y, margin + contentW, y);
      }
      y += 12;
    }

    if (sec.type === "items") {
      const tone = sec.tone === "red" ? COLORS.red : COLORS.green;
      sectionTitle(sec.title, tone);
      for (const row of sec.rows) {
        ensure(24);
        const blockTop = y;
        const textX = margin + 9;
        const textW = contentW - 9;
        // Heading + badge on one line, detail wrapped after.
        setFont(9.5, "bold", COLORS.ink);
        const badge = row.badge ? `  [${row.badge}]` : "";
        writeText(`${row.heading}${badge}${row.detail ? ` — ${row.detail}` : ""}`, textX, textW, 9.5);
        for (const note of row.notes || []) {
          writeText(note, textX, textW, 8.5, { style: "italic", color: COLORS.muted });
        }
        if (row.photos && row.photos.length > 0) {
          y += 2;
          const cell = 76;
          let x = textX;
          const loaded = row.photos.map(u => photoMap.get(u)).filter(Boolean) as LoadedPhoto[];
          if (loaded.length > 0) {
            ensure(cell + 4);
            for (const p of loaded.slice(0, 3)) {
              pdf.addImage(photoDataUrl(p, cell, cell, "cover"), "JPEG", x, y, cell, cell);
              pdf.setDrawColor(COLORS.rule[0], COLORS.rule[1], COLORS.rule[2]);
              pdf.rect(x, y, cell, cell, "S");
              x += cell + 6;
            }
            y += cell + 4;
          }
        }
        // Tone bar alongside the block (only when it didn't page-break).
        if (y > blockTop && y - blockTop < bottom - margin) {
          pdf.setFillColor(tone[0], tone[1], tone[2]);
          pdf.rect(margin, blockTop + 1, 2.5, Math.min(y - blockTop - 2, bottom - blockTop), "F");
        }
        y += 7;
      }
      y += 5;
    }

    if (sec.type === "photos") {
      sectionTitle(sec.title);
      const perRow = 3;
      const cellW = (contentW - (perRow - 1) * 6) / perRow;
      photoGrid(sec.urls, cellW, cellW * 0.75, "contain", perRow);
      y += 6;
    }

    if (sec.type === "units") {
      sectionTitle(sec.title);
      sec.units.forEach((u, idx) => {
        ensure(64); // keep the unit header + first field row together
        // Header band
        const bandH = 20;
        if (u.followUp) pdf.setFillColor(255, 237, 213);
        else pdf.setFillColor(COLORS.sageTint[0], COLORS.sageTint[1], COLORS.sageTint[2]);
        pdf.rect(margin, y, contentW, bandH, "F");
        const numColor = u.followUp ? COLORS.orange : COLORS.sage;
        pdf.setFillColor(numColor[0], numColor[1], numColor[2]);
        pdf.circle(margin + 11, y + bandH / 2, 6.5, "F");
        setFont(8.5, "bold", [255, 255, 255]);
        pdf.text(String(idx + 1), margin + 11, y + bandH / 2 + 3, { align: "center" });
        setFont(10, "bold", COLORS.ink);
        pdf.text(u.title, margin + 23, y + 13.5);
        let bx = margin + 23 + pdf.getTextWidth(u.title) + 8;
        setFont(7.5, "bold", COLORS.muted);
        for (const b of [...u.badges, ...(u.followUp ? ["Follow-up"] : [])]) {
          pdf.text(b.toUpperCase(), bx, y + 13);
          bx += pdf.getTextWidth(b.toUpperCase()) + 8;
        }
        if (u.status) {
          const st = u.status;
          const stColor = u.followUp ? COLORS.orange : COLORS.green;
          setFont(8.5, "bold", stColor);
          pdf.text(st, margin + contentW - 6, y + 13, { align: "right" });
        }
        y += bandH + 7;

        // Fields
        for (const [label, value] of u.fields) {
          ensure(20);
          setFont(7.5, "bold", COLORS.faint);
          pdf.text(label.toUpperCase(), margin + 4, y + 7);
          y += 10;
          writeText(value, margin + 4, contentW - 8, 9.5);
          y += 2;
        }

        // Findings
        if (u.findings) {
          ensure(24);
          setFont(7.5, "bold", COLORS.amber);
          pdf.text("TECHNICIAN FINDINGS", margin + 4, y + 7);
          y += 10;
          writeText(u.findings, margin + 4, contentW - 8, 9.5);
          y += 2;
        }

        // Photos
        if (u.photos && u.photos.length > 0) {
          const perRow = 4;
          const cell = (contentW - 8 - (perRow - 1) * 6) / perRow;
          const urls = u.photos;
          let r = 0;
          while (r < urls.length) {
            const row = urls.slice(r, r + perRow).map(un => photoMap.get(un)).filter(Boolean) as LoadedPhoto[];
            if (row.length > 0) {
              ensure(cell + 6);
              let x = margin + 4;
              for (const p of row) {
                pdf.addImage(photoDataUrl(p, cell, cell, "cover"), "JPEG", x, y, cell, cell);
                pdf.setDrawColor(COLORS.rule[0], COLORS.rule[1], COLORS.rule[2]);
                pdf.rect(x, y, cell, cell, "S");
                x += cell + 6;
              }
              y += cell + 6;
            }
            r += perRow;
          }
        }

        // Divider between units
        if (idx < sec.units.length - 1) {
          ensure(10);
          pdf.setDrawColor(COLORS.rule[0], COLORS.rule[1], COLORS.rule[2]);
          pdf.line(margin, y + 2, margin + contentW, y + 2);
          y += 10;
        }
      });
      y += 8;
    }
  }

  // ── Legal notices ──
  if (data.pesticideNotice || data.apartmentDisclaimer) {
    ensure(30);
    pdf.setDrawColor(COLORS.rule[0], COLORS.rule[1], COLORS.rule[2]);
    pdf.line(margin, y, margin + contentW, y);
    y += 8;
  }
  if (data.pesticideNotice) {
    setFont(8, "bold", COLORS.amber);
    ensure(14);
    pdf.text("CAUTION", margin, y + 8);
    y += 13;
    writeText(PESTICIDE_NOTICE_INTRO, margin, contentW, 7.6, { color: COLORS.muted, lineH: 9.8 });
    y += 4;
    writeText(PESTICIDE_NOTICE_LEGAL, margin, contentW, 7.2, { style: "italic", color: COLORS.faint, lineH: 9.4 });
    y += 6;
  }
  if (data.apartmentDisclaimer) {
    writeText(APARTMENT_DISCLAIMER, margin, contentW, 7.2, { style: "italic", color: COLORS.faint, lineH: 9.4 });
  }

  // ── Footers ──
  const pageCount = pdf.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    pdf.setPage(i);
    setFont(7.5, "normal", COLORS.faint);
    pdf.text(data.subtitle || "Crest Pest Control", margin, pageH - margin / 2);
    pdf.text(`Page ${i} of ${pageCount}`, margin + contentW, pageH - margin / 2, { align: "right" });
  }

  // Free object URLs.
  photoMap.forEach(p => URL.revokeObjectURL(p.objectUrl));

  pdf.save(`${data.filename || "service-visit"}.pdf`);
}
