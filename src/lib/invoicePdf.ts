// ─── Invoice PDF ────────────────────────────────────────────────────────
// Data-driven, like every other PDF in the portal (never html2canvas — see
// visitPdf.ts for why). Built to be handed to an apartment's AP department:
// the property name and address are on it, any reference numbers they asked
// for sit at the top, and every unit we treated is listed so the charge can
// be verified without phoning the office.
import jsPDF from "jspdf";
import { groupLinesBySection } from "./invoiceSections";

const C = {
  ink: [42, 42, 42] as const,
  soft: [85, 90, 85] as const,
  muted: [110, 116, 110] as const,
  faint: [150, 155, 150] as const,
  rule: [221, 226, 221] as const,
  sage: [195, 209, 197] as const,
  darkSage: [149, 161, 151] as const,
  sageTint: [242, 246, 242] as const,
  cream: [250, 250, 249] as const,
  white: [255, 255, 255] as const,
};

const PAGE_W = 612; // US Letter, portrait, points
const PAGE_H = 792;
const MARGIN = 48;
const CONTENT_W = PAGE_W - MARGIN * 2;

/** Internal scheduling notes never belong on a bill. Lines built before
 *  Sep 24 2026 carry the wording in their stored text, so it is scrubbed at
 *  render time as well as at build time. */
export function customerUnitText(s: string | null | undefined): string {
  return String(s ?? "").replace(/\s*•\s*Follow-up needed/gi, "");
}

export interface InvoicePdfLine {
  line_type: string;
  description: string;
  detail?: string | null;
  service_date?: string | null;
  quantity: number;
  unit_price: number;
  amount: number;
  /** Units frozen onto this line at build time. */
  units_snapshot?: { units?: { unit_number: string; service: string }[]; total?: number; included?: number; waived?: boolean } | null;
}

export interface InvoicePdfData {
  invoiceNumber: string;
  /** Optional name beside the number — "August invoice". */
  title?: string | null;
  issueDate: string;
  dueDate?: string | null;
  /** Payment terms in days (Net N). */
  termsDays?: number | null;
  periodStart?: string | null;
  periodEnd?: string | null;

  propertyName: string;
  propertyAddress?: string | null;
  clientName?: string | null;

  /** [{label:"PO #", value:"4471"}] — optional, printed only when present. */
  referenceNumbers?: { label: string; value: string }[];

  lines: InvoicePdfLine[];
  subtotal: number;
  taxAmount: number;
  total: number;
  amountPaid: number;
  balance: number;

  customerNote?: string | null;
  /** Watermark the page — used for test sends so a test can never pass for real. */
  watermark?: string | null;
}

const money = (n: number) =>
  `$${(Math.round((Number(n) || 0) * 100) / 100).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const dateLabel = (d?: string | null) => {
  if (!d) return "";
  const s = String(d).slice(0, 10);
  const dt = new Date(`${s}T00:00:00`);
  if (Number.isNaN(dt.getTime())) return s;
  return dt.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
};

const shortDate = (d?: string | null) => {
  if (!d) return "";
  const dt = new Date(`${String(d).slice(0, 10)}T00:00:00`);
  return Number.isNaN(dt.getTime()) ? String(d) : dt.toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

export function buildInvoicePdf(data: InvoicePdfData): jsPDF {
  const pdf = new jsPDF({ unit: "pt", format: "letter" });
  let y = 0;

  const setFill = (c: readonly number[]) => pdf.setFillColor(c[0], c[1], c[2]);
  const setText = (c: readonly number[]) => pdf.setTextColor(c[0], c[1], c[2]);
  const setDraw = (c: readonly number[]) => pdf.setDrawColor(c[0], c[1], c[2]);

  const pageBackground = () => {
    setFill(C.white);
    pdf.rect(0, 0, PAGE_W, PAGE_H, "F");
    if (data.watermark) {
      pdf.saveGraphicsState();
      // @ts-expect-error — jsPDF ships GState at runtime
      pdf.setGState(new pdf.GState({ opacity: 0.08 }));
      setText(C.ink);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(84);
      pdf.text(data.watermark, PAGE_W / 2, PAGE_H / 2, { align: "center", angle: 32 });
      pdf.restoreGraphicsState();
    }
  };

  const footer = () => {
    setDraw(C.rule);
    pdf.setLineWidth(0.5);
    pdf.line(MARGIN, PAGE_H - 46, PAGE_W - MARGIN, PAGE_H - 46);
    setText(C.faint);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(7.5);
    pdf.text("Crest Pest Control  ·  2709 S Orange Ave STE C, Santa Ana, CA 92707  ·  949-424-5000  ·  License #9859", MARGIN, PAGE_H - 32);
    pdf.text(data.invoiceNumber, PAGE_W - MARGIN, PAGE_H - 32, { align: "right" });
  };

  const newPage = () => {
    footer();
    pdf.addPage();
    pageBackground();
    y = MARGIN;
  };

  const room = (need: number) => {
    if (y + need > PAGE_H - 70) newPage();
  };

  pageBackground();

  // ─── masthead ─────────────────────────────────────────────────────────
  setFill(C.sageTint);
  pdf.rect(0, 0, PAGE_W, 112, "F");
  setFill(C.sage);
  pdf.rect(0, 108, PAGE_W, 4, "F");

  setText(C.ink);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(21);
  pdf.text("CREST PEST CONTROL", MARGIN, 46);

  setText(C.muted);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8.5);
  pdf.text("2709 S Orange Ave STE C  ·  Santa Ana, CA 92707", MARGIN, 62);
  pdf.text("949-424-5000  ·  office@crestpestcontrol.com  ·  License #9859", MARGIN, 75);

  setText(C.darkSage);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(28);
  pdf.text("INVOICE", PAGE_W - MARGIN, 46, { align: "right" });

  setText(C.soft);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(10);
  pdf.text(data.invoiceNumber, PAGE_W - MARGIN, 64, { align: "right" });
  if (data.title) {
    setText(C.muted);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9.5);
    pdf.text(pdf.splitTextToSize(data.title, CONTENT_W * 0.45)[0], PAGE_W - MARGIN, 80, { align: "right" });
  }

  y = 140;

  // ─── bill to / dates ──────────────────────────────────────────────────
  const colR = MARGIN + CONTENT_W * 0.58;

  setText(C.faint);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(7.5);
  pdf.text("BILL TO", MARGIN, y);

  setText(C.ink);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(13);
  pdf.text(data.propertyName, MARGIN, y + 17);

  let by = y + 17;
  if (data.propertyAddress) {
    setText(C.soft);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9.5);
    for (const l of pdf.splitTextToSize(data.propertyAddress, CONTENT_W * 0.5)) {
      by += 13;
      pdf.text(l, MARGIN, by);
    }
  }
  if (data.clientName && data.clientName !== data.propertyName) {
    setText(C.muted);
    pdf.setFontSize(9);
    by += 13;
    pdf.text(data.clientName, MARGIN, by);
  }

  // Due on or before the issue date reads as "upon receipt", never as a date.
  const dueUponReceipt =
    data.termsDays === 0 ||
    (!!data.dueDate && String(data.dueDate).slice(0, 10) <= String(data.issueDate).slice(0, 10));
  const dates: [string, string][] = [
    ["Invoice date", dateLabel(data.issueDate)],
    // One line says when it's due. Net terms ride on it ("October 24 · Net 30")
    // instead of a separate Terms row repeating "upon receipt".
    ...(data.dueDate
      ? ([[
          "Due",
          dueUponReceipt
            ? "Upon receipt"
            : `${dateLabel(data.dueDate)}${data.termsDays ? ` · Net ${data.termsDays}` : ""}`,
        ]] as [string, string][])
      : data.termsDays === 0
      ? ([["Due", "Upon receipt"]] as [string, string][])
      : []),
    ...(data.periodStart && data.periodEnd
      ? ([["Service period", `${shortDate(data.periodStart)} – ${shortDate(
          new Date(new Date(`${String(data.periodEnd).slice(0, 10)}T00:00:00`).getTime() - 86400000)
            .toISOString()
            .slice(0, 10)
        )}`]] as [string, string][])
      : []),
    ...(data.referenceNumbers ?? []).filter((r) => r.value).map((r) => [r.label, r.value] as [string, string]),
  ];

  let dy = y;
  for (const [k, v] of dates) {
    setText(C.faint);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(7.5);
    pdf.text(k.toUpperCase(), colR, dy);
    setText(C.ink);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9.5);
    pdf.text(v, PAGE_W - MARGIN, dy, { align: "right" });
    dy += 19;
  }

  y = Math.max(by, dy) + 24;

  // ─── line table ───────────────────────────────────────────────────────
  const xDate = MARGIN;
  const xDesc = MARGIN + 54;
  const xQty = MARGIN + CONTENT_W - 168;
  const xRate = MARGIN + CONTENT_W - 96;
  const xAmt = PAGE_W - MARGIN;

  const tableHead = () => {
    setFill(C.cream);
    pdf.rect(MARGIN, y - 12, CONTENT_W, 22, "F");
    setText(C.muted);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(7.5);
    pdf.text("DATE", xDate, y + 2);
    pdf.text("DESCRIPTION", xDesc, y + 2);
    pdf.text("QTY", xQty, y + 2, { align: "right" });
    pdf.text("RATE", xRate, y + 2, { align: "right" });
    pdf.text("AMOUNT", xAmt, y + 2, { align: "right" });
    y += 24;
  };

  room(80);
  tableHead();

  // Section band: "SCHEDULED VISITS", "AD HOC VISITS", ... so each kind of
  // charge is read on its own.
  const sectionHead = (label: string) => {
    if (y + 60 > PAGE_H - 140) {
      newPage();
      tableHead();
    }
    setFill(C.sageTint);
    pdf.rect(MARGIN, y - 11, CONTENT_W, 17, "F");
    setText(C.darkSage);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(7.5);
    pdf.text(label.toUpperCase(), MARGIN + 6, y + 1);
    y += 20;
  };

  const sections = groupLinesBySection(data.lines);

  for (const section of sections) {
  sectionHead(section.label);

  for (const line of section.lines) {
    const descW = xQty - xDesc - 18;
    const descLines = pdf.splitTextToSize(line.description, descW);
    const units = line.units_snapshot?.units ?? [];
    const detailLines = line.detail && !units.length ? pdf.splitTextToSize(customerUnitText(line.detail), descW) : [];
    const need = descLines.length * 13 + detailLines.length * 11 + units.length * 10 + 18;

    if (y + need > PAGE_H - 140) {
      newPage();
      tableHead();
    }

    setText(C.ink);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8.5);
    if (line.service_date) pdf.text(shortDate(line.service_date), xDate, y);

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(9.5);
    let ly = y;
    for (const l of descLines) {
      pdf.text(l, xDesc, ly);
      ly += 13;
    }

    setText(C.muted);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    for (const l of detailLines) {
      pdf.text(l, xDesc, ly);
      ly += 11;
    }

    // Units treated, itemised — the whole reason this invoice exists.
    if (units.length) {
      const snap = line.units_snapshot!;
      setText(C.muted);
      pdf.setFontSize(8);
      pdf.text(
        `${snap.total ?? units.length} units treated · ${snap.included ?? 0} included in the plan`,
        xDesc,
        ly
      );
      ly += 12;
      setText(C.soft);
      pdf.setFontSize(7.5);
      for (const u of units) {
        if (ly > PAGE_H - 110) {
          newPage();
          ly = y = MARGIN + 6;
        }
        pdf.text(`Unit ${u.unit_number} — ${customerUnitText(u.service)}`, xDesc + 10, ly);
        ly += 10;
      }
    }

    setText(C.ink);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9.5);
    pdf.text(String(line.quantity % 1 === 0 ? line.quantity : line.quantity.toFixed(2)), xQty, y, { align: "right" });
    pdf.text(money(line.unit_price), xRate, y, { align: "right" });
    pdf.setFont("helvetica", "bold");
    pdf.text(money(line.amount), xAmt, y, { align: "right" });

    y = Math.max(ly, y + 13) + 7;
    setDraw(C.rule);
    pdf.setLineWidth(0.4);
    pdf.line(MARGIN, y - 4, PAGE_W - MARGIN, y - 4);
    y += 10;
  }

  // One section's worth of money, so "what did the extra units cost" has a
  // number. Skipped when the whole invoice is one section — the subtotal
  // below already says it.
  if (sections.length > 1) {
    room(24);
    setText(C.muted);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.text(`${section.label} subtotal`, xRate, y - 2, { align: "right" });
    setText(C.soft);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(8.5);
    pdf.text(money(section.subtotal), xAmt, y - 2, { align: "right" });
    y += 14;
  }
  }

  // ─── totals ───────────────────────────────────────────────────────────
  room(130);
  const tx = MARGIN + CONTENT_W * 0.58;
  const totalsTop = y;
  const row = (label: string, value: string, bold = false, tone = C.ink) => {
    setText(bold ? tone : C.muted);
    pdf.setFont("helvetica", bold ? "bold" : "normal");
    pdf.setFontSize(bold ? 10.5 : 9.5);
    pdf.text(label, tx, y);
    setText(tone);
    pdf.text(value, PAGE_W - MARGIN, y, { align: "right" });
    y += bold ? 20 : 16;
  };

  y += 6;
  row("Subtotal", money(data.subtotal));
  if (data.taxAmount > 0) row("Tax", money(data.taxAmount));

  setDraw(C.sage);
  pdf.setLineWidth(1);
  pdf.line(tx, y - 6, PAGE_W - MARGIN, y - 6);
  y += 8;
  row("Total", money(data.total), true);

  if (data.amountPaid > 0) {
    row("Paid", `− ${money(data.amountPaid)}`);
    y += 2;
    setFill(C.sageTint);
    pdf.rect(tx - 12, y - 14, PAGE_W - MARGIN - tx + 12, 28, "F");
    row("Balance due", money(data.balance), true, C.ink);
  }

  // ─── remit to — on every invoice, beside the totals ──────────────────
  {
    let ry = totalsTop + 6;
    setText(C.faint);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(7.5);
    pdf.text("PLEASE REMIT PAYMENT TO", MARGIN, ry);
    ry += 14;
    setText(C.ink);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(9.5);
    pdf.text("Crest Pest Control", MARGIN, ry);
    ry += 13;
    setText(C.soft);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9.5);
    for (const l of ["2709 S Orange Ave STE C", "Santa Ana, CA 92707"]) {
      pdf.text(l, MARGIN, ry);
      ry += 13;
    }
    y = Math.max(y, ry);
  }

  // ─── note ─────────────────────────────────────────────────────────────
  if (data.customerNote) {
    room(70);
    y += 16;
    setText(C.faint);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(7.5);
    pdf.text("NOTES", MARGIN, y);
    y += 14;
    setText(C.soft);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    for (const l of pdf.splitTextToSize(data.customerNote, CONTENT_W)) {
      room(16);
      pdf.text(l, MARGIN, y);
      y += 13;
    }
  }

  footer();
  return pdf;
}

export const invoicePdfFilename = (data: Pick<InvoicePdfData, "invoiceNumber" | "propertyName">) =>
  `${data.invoiceNumber} — ${data.propertyName}`.replace(/[^\w\s—.-]/g, "").trim() + ".pdf";

/** Base64 (no data-URI prefix) — what the send function attaches to the email. */
export function invoicePdfBase64(data: InvoicePdfData): string {
  const uri = buildInvoicePdf(data).output("datauristring");
  return uri.slice(uri.indexOf(",") + 1);
}
