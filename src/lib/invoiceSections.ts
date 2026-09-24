/**
 * Invoice sections.
 *
 * Every invoice is read in four blocks so the customer (and the office) can
 * see at a glance what the regular service cost, what any one-off visit cost,
 * what the units over the plan cost, and what was taken off:
 *
 *   Scheduled visits · Ad hoc visits · Additional units · Discounts or waived services
 *
 * A section is derived from the line, never stored: line_type is the main
 * signal (base / ad_hoc / units / discount), and the two "no money" cases —
 * a waived unit overage, a no-charge or warranty visit — read as waived.
 * No supabase import here so the PDF builder can use it too.
 */

export type InvoiceSection = "scheduled" | "ad_hoc" | "units" | "discount";

export const SECTION_ORDER: InvoiceSection[] = ["scheduled", "ad_hoc", "units", "discount"];

export const SECTION_LABELS: Record<InvoiceSection, string> = {
  scheduled: "Scheduled visits",
  ad_hoc: "Ad hoc visits",
  units: "Additional units",
  discount: "Discounts or waived services",
};

/** The line_type that puts a line in each section when an admin moves it by hand. */
export const SECTION_LINE_TYPE: Record<InvoiceSection, string> = {
  scheduled: "base",
  ad_hoc: "ad_hoc",
  units: "units",
  discount: "discount",
};

export interface SectionableLine {
  line_type?: string | null;
  description?: string | null;
  detail?: string | null;
  quantity?: number | string | null;
  unit_price?: number | string | null;
  amount?: number | string | null;
  units_snapshot?: { waived?: boolean; units?: unknown[] } | null;
}

const amountOf = (l: SectionableLine): number => {
  const a = Number(l.amount);
  if (Number.isFinite(a) && l.amount !== null && l.amount !== undefined) return a;
  return (Number(l.quantity) || 0) * (Number(l.unit_price) || 0);
};

export function sectionOfLine(l: SectionableLine): InvoiceSection {
  const type = String(l.line_type ?? "custom");
  const amount = amountOf(l);
  const desc = String(l.description ?? "");

  if (type === "discount" || type === "credit") return "discount";
  if (amount < 0) return "discount";

  if (type === "base") return "scheduled";

  if (type === "units") {
    // The overage was waived: the units are still listed, at $0, as a courtesy.
    if (l.units_snapshot?.waived === true) return "discount";
    // The 'flat' style prices a whole day's visit on a units-typed line — a
    // visit, not an overage. It is told apart by its detail, which the builder
    // writes as exactly "N units treated" (the overage summary says "N units
    // treated, K included"; per-unit lines carry the unit's service instead),
    // so renaming the description never moves the line.
    const head = String(l.detail ?? "").split("\n")[0].trim();
    const flatDay = !!l.units_snapshot && /^\d+ units? treated$/i.test(head) && !/^Unit\s/i.test(desc);
    return flatDay ? "scheduled" : "units";
  }

  if (type === "ad_hoc") {
    if (amount === 0 && /\((no charge|warranty)\)/i.test(desc)) return "discount";
    return "ad_hoc";
  }

  // custom: a free-typed charge is a one-off; a free-typed credit is a discount.
  return amount < 0 ? "discount" : "ad_hoc";
}

export interface LineSectionGroup<T> {
  key: InvoiceSection;
  label: string;
  lines: T[];
  subtotal: number;
}

/** Lines in section order, empty sections left out, each with its own subtotal. */
export function groupLinesBySection<T extends SectionableLine>(lines: T[]): LineSectionGroup<T>[] {
  const buckets = new Map<InvoiceSection, T[]>();
  for (const l of lines) {
    const s = sectionOfLine(l);
    (buckets.get(s) ?? buckets.set(s, []).get(s)!).push(l);
  }
  return SECTION_ORDER.filter((k) => buckets.has(k)).map((k) => {
    const ls = buckets.get(k)!;
    return {
      key: k,
      label: SECTION_LABELS[k],
      lines: ls,
      subtotal: Math.round(ls.reduce((s, l) => s + amountOf(l), 0) * 100) / 100,
    };
  });
}
