/**
 * Invoice builder — turns completed visits into invoice lines.
 *
 * The Crest app is where an invoice is BUILT and SENT. FieldRoutes is never
 * written to from here: the recurring subscription already bills itself, and
 * the office keys the extras in by hand off `portal_front_desk_billing_tasks`.
 *
 * Two rhythms that are easy to confuse and must stay separate:
 *   - how often we VISIT   — the FieldRoutes subscription frequency
 *   - how often we BILL    — `portal_billing_settings.cadence`
 * Stonebrook is serviced weekly and billed every 4 weeks; Huntington Cove is
 * serviced every 14 days and billed monthly. `base_price_basis` decides whether
 * the plan's base price is charged once per visit or once per invoice.
 *
 * Nothing here sends anything. It produces a DRAFT for a human to review.
 */

import { supabase } from "@/integrations/supabase/client";
import { readUnitPlanConfig, isOverageWaived, computeOverage } from "./unitOverage";
import { glanceUnitsFromPast, glanceUnitsToText } from "@/components/portal/VisitUnitsAtAGlance";

export type BillingMode = "per_service" | "cadence" | "manual";
export type Cadence = "4_weeks" | "monthly" | "quarterly";
/**
 * per_period — the recurring price covers the whole billing period, however
 * many visits fall in it. This is the only behaviour now selectable; a monthly
 * property visited fortnightly is charged once, not twice.
 * per_visit is honoured for old rows only.
 */
export type BasePriceBasis = "per_visit" | "per_period";
/** How treated units are priced on the invoice. */
export type UnitLineStyle = "summary" | "itemized" | "flat";
export type LineType = "base" | "units" | "ad_hoc" | "credit" | "discount" | "custom";

export interface BillingSettings {
  property_id: string;
  billing_mode: BillingMode;
  cadence: Cadence | null;
  cadence_anchor: string | null;
  base_price_basis: BasePriceBasis;
  unit_line_style: UnitLineStyle;
  payment_terms_days: number;
  tax_rate: number;
  default_po_number: string | null;
  send_mode: "test" | "live";
}

export interface DraftLine {
  sort_order: number;
  line_type: LineType;
  service_id: string | null;
  description: string;
  detail: string | null;
  service_date: string | null;
  quantity: number;
  unit_price: number;
  taxable: boolean;
  /** Frozen unit list behind this line — what the invoice claims, forever. */
  units_snapshot: unknown | null;
  /** null = use the default rule (everything except a recurring base line). */
  fr_entry_required: boolean | null;
  /** Computed for preview only; the database recomputes `amount` itself. */
  amount: number;
}

export type InvoiceKind = "cadence" | "one_time";

export interface DraftInvoice {
  property_id: string;
  /** cadence = this billing period; one_time = a standalone bill. */
  kind: InvoiceKind;
  period_start: string | null;
  period_end: string | null;
  po_number: string | null;
  tax_rate: number;
  lines: DraftLine[];
  /** Visits that will be marked invoiced when this is sent. */
  service_ids: string[];
  /** Things a human should look at before sending. Never silently ignored. */
  warnings: string[];
  subtotal: number;
}

const money = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

const fmtDate = (d: string | null) =>
  d ? new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "";

/**
 * The billing window a date falls in. Mirrors `portal_billing_period_bounds`
 * in SQL — a 4-week cadence with no anchor is an error, never a guess, because
 * guessing the window silently bills the wrong visits.
 */
export function billingPeriod(
  settings: Pick<BillingSettings, "billing_mode" | "cadence" | "cadence_anchor">,
  asOf: Date = new Date()
): { start: string; end: string } | null {
  if (settings.billing_mode !== "cadence" || !settings.cadence) return null;

  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const anchor = settings.cadence_anchor ? new Date(`${settings.cadence_anchor}T00:00:00`) : null;

  // 4-week cycles have no calendar meaning without a starting point.
  if (settings.cadence === "4_weeks") {
    if (!anchor) {
      throw new Error(
        "This property is billed every 4 weeks but the cycle has no start date. Set one in billing settings — it normally starts at the first completed service."
      );
    }
    const dayMs = 86400000;
    const periods = Math.floor((asOf.getTime() - anchor.getTime()) / (28 * dayMs));
    const start = new Date(anchor.getTime() + periods * 28 * dayMs);
    return { start: iso(start), end: iso(new Date(start.getTime() + 28 * dayMs)) };
  }

  const step = settings.cadence === "quarterly" ? 3 : 1;

  // Anchored: the cycle runs from the day the first service landed, so a
  // property that started mid-month is billed the 12th-to-the-12th rather than
  // getting a stub first invoice.
  if (anchor) {
    const months =
      (asOf.getFullYear() - anchor.getFullYear()) * 12 + (asOf.getMonth() - anchor.getMonth());
    let n = Math.floor(months / step);
    if (addMonths(anchor, n * step) > asOf) n -= 1;
    const start = addMonths(anchor, n * step);
    return { start: iso(start), end: iso(addMonths(anchor, (n + 1) * step)) };
  }

  // No anchor: plain calendar months / quarters.
  if (settings.cadence === "quarterly") {
    const q = Math.floor(asOf.getMonth() / 3) * 3;
    return { start: iso(new Date(asOf.getFullYear(), q, 1)), end: iso(new Date(asOf.getFullYear(), q + 3, 1)) };
  }
  return {
    start: iso(new Date(asOf.getFullYear(), asOf.getMonth(), 1)),
    end: iso(new Date(asOf.getFullYear(), asOf.getMonth() + 1, 1)),
  };
}

/** Add months keeping the day of the month, clamping short months (Jan 31 -> Feb 28). */
function addMonths(d: Date, n: number): Date {
  const day = d.getDate();
  const out = new Date(d.getFullYear(), d.getMonth() + n, 1);
  out.setDate(Math.min(day, new Date(out.getFullYear(), out.getMonth() + 1, 0).getDate()));
  return out;
}

/**
 * The day the billing cycle should start: the first completed service at this
 * property. Returns null when nothing has been serviced yet.
 */
export async function firstCompletedServiceDate(propertyId: string): Promise<string | null> {
  const { data } = await supabase
    .from("portal_services")
    .select("service_date")
    .eq("property_id", propertyId)
    .eq("status", "completed")
    .not("service_date", "is", null)
    .order("service_date", { ascending: true })
    .limit(1)
    .maybeSingle();
  return (data?.service_date as string | null) ?? null;
}


/**
 * Emit the invoice line(s) for one visit's units, in the property's chosen
 * style. The unit list is carried on every style — only whether money is
 * attached to each unit changes.
 */
function pushUnitLines(
  push: (l: Omit<DraftLine, "sort_order" | "amount">) => void,
  style: UnitLineStyle,
  visit: { id: string; service_type?: string | null; service_date: string | null },
  ov: ReturnType<typeof computeOverage>,
  glance: { unit_number: string; service: string }[],
  totalUnits: number,
  /** Used by 'flat': the hand-set price for the day. */
  flatAmount?: number
) {
  const snapshot = {
    units: glance,
    total: totalUnits,
    included: ov.includedUnits,
    waived: ov.waived,
  };

  if (style === "flat") {
    push({
      line_type: "units",
      service_id: visit.id,
      description: `${visit.service_type || "Service"} — ${fmtDate(visit.service_date)}`,
      detail:
        `${totalUnits} unit${totalUnits === 1 ? "" : "s"} treated` +
        (glance.length ? `\n${glanceUnitsToText(glance)}` : ""),
      service_date: visit.service_date,
      quantity: 1,
      unit_price: money(flatAmount ?? 0),
      taxable: false,
      units_snapshot: snapshot,
      fr_entry_required: null,
    });
    return;
  }

  if (style === "itemized") {
    // Only the units beyond the plan carry a charge; the rest are shown at $0
    // so the invoice still proves every unit we entered.
    const over = ov.unitsOver;
    glance.forEach((u, i) => {
      const chargeable = i >= glance.length - over;
      push({
        line_type: "units",
        service_id: visit.id,
        description: `Unit ${u.unit_number} — ${fmtDate(visit.service_date)}`,
        detail: u.service || null,
        service_date: visit.service_date,
        quantity: 1,
        unit_price: chargeable && !ov.waived ? ov.pricePerUnit : 0,
        taxable: false,
        units_snapshot: i === 0 ? snapshot : null,
        fr_entry_required: null,
      });
    });
    return;
  }

  // summary
  push({
    line_type: "units",
    service_id: visit.id,
    description: `Additional units treated — ${fmtDate(visit.service_date)}`,
    detail:
      `${totalUnits} units treated, ${ov.includedUnits} included` +
      (glance.length ? `\n${glanceUnitsToText(glance)}` : ""),
    service_date: visit.service_date,
    quantity: ov.unitsOver,
    unit_price: ov.waived ? 0 : ov.pricePerUnit,
    taxable: false,
    units_snapshot: snapshot,
    fr_entry_required: null,
  });
}

/**
 * Build a draft invoice for a property.
 *
 * Only COMPLETED visits that have never been invoiced are pulled in — the
 * `invoiced_at` stamp is what stops a visit being billed twice, and it is set
 * on send, not here.
 */
export async function buildDraftInvoice(
  propertyId: string,
  opts: { periodStart?: string; periodEnd?: string; asOf?: Date } = {}
): Promise<DraftInvoice> {
  const { data: property, error: pErr } = await supabase
    .from("portal_properties")
    .select("id, name, customer_preferences")
    .eq("id", propertyId)
    .maybeSingle();
  if (pErr) throw pErr;
  if (!property) throw new Error("Property not found.");

  const { data: settingsRow, error: sErr } = await supabase
    .from("portal_billing_settings")
    .select("*")
    .eq("property_id", propertyId)
    .maybeSingle();
  if (sErr) throw sErr;

  const settings: BillingSettings = (settingsRow as BillingSettings) ?? {
    property_id: propertyId,
    billing_mode: "per_service",
    cadence: null,
    cadence_anchor: null,
    base_price_basis: "per_period",
    unit_line_style: "summary",
    payment_terms_days: 7,
    tax_rate: 0,
    default_po_number: null,
    send_mode: "test",
  };

  const warnings: string[] = [];
  if (!settingsRow) warnings.push("This property has no billing settings yet — defaults were used.");

  // Period: explicit beats computed, computed beats "everything uninvoiced".
  let periodStart = opts.periodStart ?? null;
  let periodEnd = opts.periodEnd ?? null;
  if (!periodStart && !periodEnd) {
    const p = billingPeriod(settings, opts.asOf ?? new Date());
    if (p) {
      periodStart = p.start;
      periodEnd = p.end;
    }
  }

  let q = supabase
    .from("portal_services")
    .select(
      "id, service_type, service_date, status, unit_details, report_data, billing_type, billing_amount, po_number, invoiced_at, technician"
    )
    .eq("property_id", propertyId)
    .eq("status", "completed")
    .is("invoiced_at", null)
    .order("service_date", { ascending: true });

  if (periodStart) q = q.gte("service_date", periodStart);
  if (periodEnd) q = q.lt("service_date", periodEnd);

  const { data: services, error: svcErr } = await q;
  if (svcErr) throw svcErr;

  const visits = services ?? [];
  const planCfg = readUnitPlanConfig(property.customer_preferences);
  const lines: DraftLine[] = [];
  const serviceIds: string[] = [];
  let sort = 0;

  const push = (l: Omit<DraftLine, "sort_order" | "amount">) =>
    lines.push({ ...l, sort_order: sort++, amount: money(l.quantity * l.unit_price) });

  // ---- recurring base -----------------------------------------------------
  const basePrice = Number(planCfg.base_service_price || 0);
  const recurringVisits = visits.filter((v) => !v.billing_type || v.billing_type === "plan");

  if (basePrice > 0 && recurringVisits.length > 0) {
    if (settings.base_price_basis === "per_visit") {
      for (const v of recurringVisits) {
        push({
          line_type: "base",
          service_id: v.id,
          description: v.service_type || "Pest control service",
          detail: null,
          service_date: v.service_date,
          quantity: 1,
          unit_price: basePrice,
          taxable: false,
          units_snapshot: null,
          fr_entry_required: null,
        });
      }
    } else {
      const span =
        periodStart && periodEnd
          ? `${fmtDate(periodStart)} – ${fmtDate(
              new Date(new Date(`${periodEnd}T00:00:00`).getTime() - 86400000).toISOString().slice(0, 10)
            )}`
          : `${recurringVisits.length} visit${recurringVisits.length === 1 ? "" : "s"}`;
      push({
        line_type: "base",
        service_id: null,
        description: "Recurring pest control service",
        detail: `${span} · covers ${recurringVisits.length} visit${recurringVisits.length === 1 ? "" : "s"}`,
        service_date: recurringVisits[0]?.service_date ?? null,
        quantity: 1,
        unit_price: basePrice,
        taxable: false,
        units_snapshot: null,
        fr_entry_required: null,
      });
    }
  } else if (recurringVisits.length > 0 && basePrice <= 0) {
    warnings.push(
      `${recurringVisits.length} recurring visit${
        recurringVisits.length === 1 ? " has" : "s have"
      } no base price configured on this property — they will invoice at $0.`
    );
  }

  // ---- per-visit units overage -------------------------------------------
  for (const v of visits) {
    serviceIds.push(v.id);

    const unitRows = Array.isArray(v.unit_details) ? v.unit_details : [];
    const ov = computeOverage(unitRows.length, planCfg, isOverageWaived(v));
    const glance = glanceUnitsFromPast(unitRows, { forInvoice: true });

    if (!ov.planConfigured || unitRows.length === 0) continue;

    if (ov.waived) {
      warnings.push(`${fmtDate(v.service_date)}: ${ov.unitsOver} unit(s) over, waived — shown at $0.`);
    }

    const style = settings.unit_line_style ?? "summary";
    // 'flat' and 'itemized' print the unit list even when nothing is over the
    // plan; 'summary' has nothing to say unless there is an overage.
    if (ov.unitsOver > 0 || style === "itemized" || (style === "flat" && Number(v.billing_amount) > 0)) {
      pushUnitLines(push, style, v, ov, glance, unitRows.length, Number(v.billing_amount) || 0);
    }
  }

  // ---- one-off / ad-hoc work ---------------------------------------------
  for (const v of visits) {
    if (!v.billing_type || v.billing_type === "plan") continue;

    if (v.billing_type === "quoted") {
      warnings.push(
        `${fmtDate(v.service_date)} — ${v.service_type}: marked "quoted" with no price yet. Set a price or it invoices at $0.`
      );
    }

    const chargeable = v.billing_type === "billable";
    const amount = chargeable ? Number(v.billing_amount || 0) : 0;
    if (chargeable && amount <= 0) {
      warnings.push(`${fmtDate(v.service_date)} — ${v.service_type}: marked billable but has no amount.`);
    }

    const label: Record<string, string> = {
      billable: "",
      no_charge: " (no charge)",
      warranty: " (warranty)",
      quoted: " (awaiting price)",
    };

    push({
      line_type: "ad_hoc",
      service_id: v.id,
      description: `${v.service_type || "Service"}${label[v.billing_type] ?? ""} — ${fmtDate(v.service_date)}`,
      detail: v.po_number ? `PO ${v.po_number}` : null,
      service_date: v.service_date,
      quantity: 1,
      unit_price: money(amount),
      taxable: false,
      units_snapshot: null,
      fr_entry_required: null,
    });
  }

  // PO: a PM-entered PO on any visit in the period wins over the property default.
  const visitPo = visits.find((v) => v.po_number)?.po_number ?? null;

  if (visits.length === 0) {
    warnings.push("No completed, uninvoiced visits in this period — there is nothing to bill yet.");
  }

  return {
    property_id: propertyId,
    kind: "cadence",
    period_start: periodStart,
    period_end: periodEnd,
    po_number: visitPo || settings.default_po_number || null,
    tax_rate: Number(settings.tax_rate || 0),
    lines,
    service_ids: serviceIds,
    warnings,
    subtotal: money(lines.reduce((s, l) => s + l.amount, 0)),
  };
}

/**
 * Persist a draft. Creates the invoice row (the database assigns the number)
 * and its lines. Status stays `draft` — sending is a separate, manual step.
 */
export async function saveDraftInvoice(draft: DraftInvoice, actor?: string): Promise<string> {
  const { data: property } = await supabase
    .from("portal_properties")
    .select("client_id")
    .eq("id", draft.property_id)
    .maybeSingle();

  const { data: invoice, error } = await supabase
    .from("portal_invoices")
    .insert({
      property_id: draft.property_id,
      client_id: property?.client_id ?? null,
      kind: draft.kind,
      period_start: draft.period_start,
      period_end: draft.period_end,
      po_number: draft.po_number,
      tax_rate: draft.tax_rate,
      created_by: actor ?? null,
    })
    .select("id")
    .single();
  if (error) throw error;

  if (draft.lines.length) {
    const { error: lErr } = await supabase.from("portal_invoice_lines").insert(
      draft.lines.map((l) => ({
        invoice_id: invoice.id,
        sort_order: l.sort_order,
        line_type: l.line_type,
        service_id: l.service_id,
        description: l.description,
        detail: l.detail,
        service_date: l.service_date,
        quantity: l.quantity,
        unit_price: l.unit_price,
        taxable: l.taxable,
        units_snapshot: (l.units_snapshot ?? null) as never,
        fr_entry_required: l.fr_entry_required,
      }))
    );
    if (lErr) throw lErr;
  }

  await supabase.from("portal_invoice_events").insert({
    invoice_id: invoice.id,
    event: "created",
    actor: actor ?? null,
    detail: { lines: draft.lines.length, warnings: draft.warnings },
  });

  return invoice.id;
}


/** A visit that could go on a one-time bill. */
export interface BillableVisit {
  id: string;
  service_date: string | null;
  service_type: string;
  billing_type: string | null;
  suggested_amount: number;
  units_total: number;
  units_over: number;
}

/**
 * Completed visits at this property that have never been invoiced — the menu a
 * one-time bill is built from. Unlike the cadence builder this ignores billing
 * periods entirely: a one-off is billed because someone decided to bill it.
 */
export async function listBillableVisits(propertyId: string): Promise<BillableVisit[]> {
  const { data: property } = await supabase
    .from("portal_properties")
    .select("customer_preferences")
    .eq("id", propertyId)
    .maybeSingle();

  const { data, error } = await supabase
    .from("portal_services")
    .select("id, service_type, service_date, unit_details, report_data, billing_type, billing_amount")
    .eq("property_id", propertyId)
    .eq("status", "completed")
    .is("invoiced_at", null)
    .order("service_date", { ascending: false });
  if (error) throw error;

  const planCfg = readUnitPlanConfig(property?.customer_preferences);

  return (data ?? []).map((v) => {
    const unitRows = Array.isArray(v.unit_details) ? v.unit_details : [];
    const ov = computeOverage(unitRows.length, planCfg, isOverageWaived(v));
    return {
      id: v.id,
      service_date: v.service_date,
      service_type: v.service_type || "Service",
      billing_type: v.billing_type,
      // What we'd charge if this visit were billed on its own: its own price
      // when it is one-off work, otherwise just the units over the plan.
      suggested_amount:
        v.billing_type === "billable" ? Number(v.billing_amount || 0) : money(ov.billableCost),
      units_total: unitRows.length,
      units_over: ov.unitsOver,
    };
  });
}

export interface CustomLine {
  description: string;
  detail?: string;
  quantity: number;
  unit_price: number;
}

/**
 * Build a standalone bill from chosen visits and/or free-typed lines.
 *
 * No period, no cadence, no base-price line — a one-time bill charges exactly
 * what is put on it, so it can never quietly duplicate the recurring invoice.
 */
export async function buildOneTimeInvoice(
  propertyId: string,
  opts: {
    serviceIds?: string[];
    customLines?: CustomLine[];
    /** Per-visit price typed by hand, overriding whatever the plan implies. */
    amountOverrides?: Record<string, number>;
    /** Default true: a hand-priced visit is recorded as a paid service. */
    markAsPaidService?: boolean;
  } = {}
): Promise<DraftInvoice> {
  const { data: property, error: pErr } = await supabase
    .from("portal_properties")
    .select("id, customer_preferences")
    .eq("id", propertyId)
    .maybeSingle();
  if (pErr) throw pErr;
  if (!property) throw new Error("Property not found.");

  const { data: settingsRow } = await supabase
    .from("portal_billing_settings")
    .select("tax_rate, default_po_number, unit_line_style")
    .eq("property_id", propertyId)
    .maybeSingle();

  const style = (settingsRow?.unit_line_style ?? "summary") as UnitLineStyle;

  const planCfg = readUnitPlanConfig(property.customer_preferences);
  const warnings: string[] = [];
  const lines: DraftLine[] = [];
  const serviceIds: string[] = [];
  let sort = 0;

  const push = (l: Omit<DraftLine, "sort_order" | "amount">) =>
    lines.push({ ...l, sort_order: sort++, amount: money(l.quantity * l.unit_price) });

  if (opts.serviceIds?.length) {
    const { data: visits, error } = await supabase
      .from("portal_services")
      .select("id, service_type, service_date, unit_details, report_data, billing_type, billing_amount, po_number, invoiced_at")
      .in("id", opts.serviceIds)
      .order("service_date", { ascending: true });
    if (error) throw error;

    for (const v of visits ?? []) {
      if (v.invoiced_at) {
        warnings.push(`${fmtDate(v.service_date)} — ${v.service_type} has already been invoiced and was skipped.`);
        continue;
      }
      serviceIds.push(v.id);

      const unitRows = Array.isArray(v.unit_details) ? v.unit_details : [];
      const ov = computeOverage(unitRows.length, planCfg, isOverageWaived(v));
      const glance = glanceUnitsFromPast(unitRows, { forInvoice: true });

      const override = opts.amountOverrides?.[v.id];
      if (override !== undefined && override !== null) {
        // A hand-typed price wins over everything the plan would have said.
        // Charging a day as a whole is exactly the 'flat' shape, so it reuses
        // it — the unit list still prints, just without per-unit money.
        if (unitRows.length > 0) {
          pushUnitLines(push, style === "itemized" ? "itemized" : "flat", v, ov, glance, unitRows.length, override);
        } else {
          push({
            line_type: "ad_hoc",
            service_id: v.id,
            description: `${v.service_type} — ${fmtDate(v.service_date)}`,
            detail: v.po_number ? `PO ${v.po_number}` : null,
            service_date: v.service_date,
            quantity: 1,
            unit_price: money(override),
            taxable: false,
            units_snapshot: null,
            fr_entry_required: null,
          });
        }

        // Pricing a visit by hand makes it a PAID service for good, not just on
        // this one invoice — so it reads correctly everywhere afterwards.
        if (opts.markAsPaidService !== false) {
          await supabase
            .from("portal_services")
            .update({ billing_type: "billable", billing_amount: money(override) })
            .eq("id", v.id);
        }
      } else if (v.billing_type === "billable") {
        const amount = Number(v.billing_amount || 0);
        if (amount <= 0) warnings.push(`${fmtDate(v.service_date)} — ${v.service_type}: no amount set.`);
        push({
          line_type: "ad_hoc",
          service_id: v.id,
          description: `${v.service_type} — ${fmtDate(v.service_date)}`,
          detail: v.po_number ? `PO ${v.po_number}` : null,
          service_date: v.service_date,
          quantity: 1,
          unit_price: money(amount),
          taxable: false,
          units_snapshot: glance.length ? { units: glance, total: unitRows.length, included: ov.includedUnits } : null,
          fr_entry_required: null,
        });
      } else if (ov.unitsOver > 0) {
        pushUnitLines(push, style, v, ov, glance, unitRows.length);
      } else {
        warnings.push(
          `${fmtDate(v.service_date)} — ${v.service_type}: nothing chargeable (covered by the plan). Add a custom line if you meant to bill it.`
        );
      }
    }
  }

  for (const c of opts.customLines ?? []) {
    if (!c.description.trim()) continue;
    push({
      line_type: "custom",
      service_id: null,
      description: c.description.trim(),
      detail: c.detail?.trim() || null,
      service_date: null,
      quantity: Number(c.quantity) || 1,
      unit_price: money(Number(c.unit_price) || 0),
      taxable: false,
      units_snapshot: null,
      fr_entry_required: null,
    });
  }

  if (lines.length === 0) warnings.push("Nothing on this bill yet — pick a visit or add a line.");

  return {
    property_id: propertyId,
    kind: "one_time",
    period_start: null,
    period_end: null,
    po_number: settingsRow?.default_po_number ?? null,
    tax_rate: Number(settingsRow?.tax_rate || 0),
    lines,
    service_ids: serviceIds,
    warnings,
    subtotal: money(lines.reduce((s, l) => s + l.amount, 0)),
  };
}

/**
 * The last `count` billing periods, newest first — so a recurring bill can be
 * built for a period that has already closed, not just the current one.
 * Returns [] when the property isn't on a cycle (or a 4-week one has no anchor).
 */
export function recentPeriods(
  settings: Pick<BillingSettings, "billing_mode" | "cadence" | "cadence_anchor">,
  count = 12,
  asOf: Date = new Date()
): { start: string; end: string; label: string }[] {
  if (settings.billing_mode !== "cadence" || !settings.cadence) return [];

  const out: { start: string; end: string; label: string }[] = [];
  const anchored = !!settings.cadence_anchor;

  const label = (start: string, end: string) => {
    const s = new Date(`${start}T00:00:00`);
    const e = new Date(new Date(`${end}T00:00:00`).getTime() - 86400000);
    const thisYear = new Date().getFullYear();
    // A cycle that sits inside one calendar month reads best as just the month.
    if (!anchored && settings.cadence === "monthly") {
      return s.toLocaleDateString(undefined, {
        month: "long",
        ...(s.getFullYear() === thisYear ? {} : { year: "numeric" }),
      });
    }
    const o: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
    const yr = e.getFullYear() === thisYear ? "" : ` ${e.getFullYear()}`;
    return `${s.toLocaleDateString(undefined, o)} – ${e.toLocaleDateString(undefined, o)}${yr}`;
  };

  try {
    let cursor = asOf;
    for (let i = 0; i < count; i++) {
      const p = billingPeriod(settings, cursor);
      if (!p) break;
      if (settings.cadence_anchor && p.start < settings.cadence_anchor) break;
      if (!out.some((x) => x.start === p.start)) out.push({ ...p, label: label(p.start, p.end) });
      // Step back one day before this period began to land in the previous one.
      cursor = new Date(new Date(`${p.start}T00:00:00`).getTime() - 86400000);
      if (settings.cadence_anchor && cursor < new Date(`${settings.cadence_anchor}T00:00:00`)) break;
    }
  } catch {
    return [];
  }
  return out;
}

/** The calendar month a period belongs to — how the invoice list is grouped. */
export function periodMonthKey(d: string | null | undefined): string {
  if (!d) return "";
  return String(d).slice(0, 7);
}

export function monthLabel(key: string): string {
  if (!key) return "No period";
  const [y, m] = key.split("-").map(Number);
  const d = new Date(y, (m || 1) - 1, 1);
  return d.toLocaleDateString(undefined, {
    month: "long",
    ...(y === new Date().getFullYear() ? {} : { year: "numeric" }),
  });
}


// ─── Pricing a visit, and putting it on an invoice ──────────────────────
//
// Two separate jobs that used to be tangled together:
//   1. deciding what a visit is worth  — setVisitPrice
//   2. deciding which bill it lands on — addVisitsToInvoice
// Pricing sticks to the visit itself, so it survives whether or not you bill
// it today, and reads correctly everywhere else in the portal.

/**
 * Set (or clear) what a visit costs. Writes to the visit, not to an invoice.
 * `null` puts it back to being covered by the plan.
 */
export async function setVisitPrice(serviceId: string, amount: number | null): Promise<void> {
  const { error } = await supabase
    .from("portal_services")
    .update(
      amount === null
        ? { billing_type: "plan", billing_amount: null }
        : { billing_type: "billable", billing_amount: money(amount) }
    )
    .eq("id", serviceId);
  if (error) throw error;
}

export interface OpenInvoice {
  id: string;
  invoice_number: string;
  kind: string;
  status: string;
  period_start: string | null;
  period_end: string | null;
  total: number;
  label: string;
}

/**
 * Invoices a visit could be added to: anything still open, plus sent invoices
 * that are currently unlocked (the database refuses a locked one, so they are
 * left out rather than offered and then rejected).
 */
export async function listOpenInvoices(propertyId: string): Promise<OpenInvoice[]> {
  const { data, error } = await supabase
    .from("portal_invoices")
    .select("id, invoice_number, kind, status, period_start, period_end, total, edit_unlocked_until")
    .eq("property_id", propertyId)
    .in("status", ["draft", "ready", "sent", "partial"])
    .order("issue_date", { ascending: false });
  if (error) throw error;

  const fmt = (d: string | null) =>
    d ? new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "";

  return (data ?? [])
    .filter((i: any) => {
      const open = i.status === "draft" || i.status === "ready";
      const unlocked = i.edit_unlocked_until && new Date(i.edit_unlocked_until).getTime() > Date.now();
      return open || unlocked;
    })
    .map((i: any) => ({
      id: i.id,
      invoice_number: i.invoice_number,
      kind: i.kind,
      status: i.status,
      period_start: i.period_start,
      period_end: i.period_end,
      total: Number(i.total),
      label:
        (i.period_start
          ? `${fmt(i.period_start)} – ${fmt(
              new Date(new Date(`${i.period_end}T00:00:00`).getTime() - 86400000).toISOString().slice(0, 10)
            )}`
          : "One-time") + ` · ${i.invoice_number}${i.status === "sent" ? " (sent, unlocked)" : ""}`,
    }));
}

/**
 * Append visits to an invoice that already exists.
 *
 * Lines are built the same way the builders do it, so a visit added by hand is
 * indistinguishable from one swept up automatically. A visit already invoiced
 * is skipped rather than billed twice.
 */
export async function addVisitsToInvoice(
  invoiceId: string,
  serviceIds: string[],
  actor?: string
): Promise<{ added: number; skipped: string[] }> {
  if (!serviceIds.length) return { added: 0, skipped: [] };

  const { data: invoice, error: iErr } = await supabase
    .from("portal_invoices")
    .select("id, property_id, portal_properties(customer_preferences)")
    .eq("id", invoiceId)
    .maybeSingle();
  if (iErr) throw iErr;
  if (!invoice) throw new Error("Invoice not found.");

  const [{ data: settingsRow }, { data: existing }] = await Promise.all([
    supabase
      .from("portal_billing_settings")
      .select("unit_line_style")
      .eq("property_id", invoice.property_id)
      .maybeSingle(),
    supabase.from("portal_invoice_lines").select("sort_order").eq("invoice_id", invoiceId),
  ]);

  const style = (settingsRow?.unit_line_style ?? "summary") as UnitLineStyle;
  const planCfg = readUnitPlanConfig((invoice as any).portal_properties?.customer_preferences);

  const { data: visits, error: vErr } = await supabase
    .from("portal_services")
    .select("id, service_type, service_date, unit_details, report_data, billing_type, billing_amount, po_number, invoiced_at")
    .in("id", serviceIds)
    .order("service_date", { ascending: true });
  if (vErr) throw vErr;

  let sort = Math.max(0, ...(existing ?? []).map((l: any) => Number(l.sort_order) || 0)) + 1;
  const pending: Omit<DraftLine, "amount">[] = [];
  const skipped: string[] = [];

  const push = (l: Omit<DraftLine, "sort_order" | "amount">) => {
    pending.push({ ...l, sort_order: sort++ });
  };

  for (const v of visits ?? []) {
    if (v.invoiced_at) {
      skipped.push(`${fmtDate(v.service_date)} — already invoiced`);
      continue;
    }

    const unitRows = Array.isArray(v.unit_details) ? v.unit_details : [];
    const ov = computeOverage(unitRows.length, planCfg, isOverageWaived(v));
    const glance = glanceUnitsFromPast(unitRows, { forInvoice: true });
    const priced = Number(v.billing_amount) || 0;

    if (v.billing_type === "billable" && priced > 0) {
      if (unitRows.length > 0) {
        pushUnitLines(push, style === "itemized" ? "itemized" : "flat", v, ov, glance, unitRows.length, priced);
      } else {
        push({
          line_type: "ad_hoc",
          service_id: v.id,
          description: `${v.service_type || "Service"} — ${fmtDate(v.service_date)}`,
          detail: v.po_number ? `PO ${v.po_number}` : null,
          service_date: v.service_date,
          quantity: 1,
          unit_price: money(priced),
          taxable: false,
          units_snapshot: null,
          fr_entry_required: null,
        });
      }
    } else if (ov.unitsOver > 0 || style === "itemized") {
      pushUnitLines(push, style, v, ov, glance, unitRows.length);
    } else {
      skipped.push(`${fmtDate(v.service_date)} — covered by the plan, give it a price first`);
    }
  }

  if (pending.length) {
    const { error } = await supabase.from("portal_invoice_lines").insert(
      pending.map((l) => ({
        invoice_id: invoiceId,
        sort_order: l.sort_order,
        line_type: l.line_type,
        service_id: l.service_id,
        description: l.description,
        detail: l.detail,
        service_date: l.service_date,
        quantity: l.quantity,
        unit_price: l.unit_price,
        taxable: l.taxable,
        units_snapshot: (l.units_snapshot ?? null) as never,
        fr_entry_required: l.fr_entry_required,
      }))
    );
    if (error) throw error;

    await supabase.from("portal_invoice_events").insert({
      invoice_id: invoiceId,
      event: "lines_added",
      actor: actor ?? null,
      detail: { visits: serviceIds.length, lines: pending.length, skipped } as never,
    });
  }

  return { added: pending.length, skipped };
}

/**
 * Recompute a DRAFT's unit snapshots and overage from the property's current
 * plan.
 *
 * Lines are frozen on purpose so a sent invoice can never change under the
 * customer — but a draft that has gone nowhere should follow the plan. Change
 * included_units from 0 to 4 and the draft still claiming "0 included" is just
 * stale, not evidence of anything.
 *
 * Refuses anything already sent: those are corrected by unlocking and editing,
 * which leaves a revision behind.
 */
export async function refreshDraftFromPlan(invoiceId: string, actor?: string): Promise<number> {
  const { data: invoice, error: iErr } = await supabase
    .from("portal_invoices")
    .select(
      "id, status, property_id, edit_unlocked_until, portal_properties(customer_preferences)",
    )
    .eq("id", invoiceId)
    .maybeSingle();
  if (iErr) throw iErr;
  if (!invoice) throw new Error("Invoice not found.");
  const unlockedNow =
    !!(invoice as any).edit_unlocked_until &&
    new Date((invoice as any).edit_unlocked_until).getTime() > Date.now();
  if (!["draft", "ready"].includes(invoice.status) && !(unlockedNow && invoice.status !== "void")) {
    throw new Error("Unlock this invoice for editing first, then refresh it.");
  }

  const planCfg = readUnitPlanConfig((invoice as any).portal_properties?.customer_preferences);

  const { data: lines, error: lErr } = await supabase
    .from("portal_invoice_lines")
    .select("id, line_type, service_id, description, sort_order, quantity, unit_price, units_snapshot, detail")
    .eq("invoice_id", invoiceId);
  if (lErr) throw lErr;

  // Any line tied to a visit refreshes its unit facts — including the ad-hoc
  // / flat visit lines, which used to be skipped and went stale.
  const byService = new Map<string, any[]>();
  for (const l of lines ?? []) {
    if (!l.service_id) continue;
    if (l.line_type !== "units" && !(l as any).units_snapshot) continue;
    const list = byService.get(l.service_id) ?? [];
    list.push(l);
    byService.set(l.service_id, list);
  }

  let updated = 0;
  let maxSort = Math.max(0, ...(lines ?? []).map((l: any) => Number(l.sort_order) || 0));
  const itemizedUnitOf = (l: any) =>
    String(l.description ?? "").replace(/^Unit /, "").split(" — ")[0].trim();

  for (const [serviceId, svcLines] of byService) {
    const { data: v } = await supabase
      .from("portal_services")
      .select("id, service_type, service_date, unit_details, report_data, billing_type, billing_amount")
      .eq("id", serviceId)
      .maybeSingle();
    if (!v) continue;

    const unitRows = Array.isArray(v.unit_details) ? v.unit_details : [];
    const ov = computeOverage(unitRows.length, planCfg, isOverageWaived(v));
    const glance = glanceUnitsFromPast(unitRows, { forInvoice: true });
    const snapshot = { units: glance, total: unitRows.length, included: ov.includedUnits, waived: ov.waived };
    const handPriced = v.billing_type === "billable" && Number(v.billing_amount) > 0;

    // ── itemized style: one line per unit. A unit deleted from the visit
    // loses its line; a unit added to the visit gets one; the rest re-read
    // their text from the visit.
    const itemized = svcLines.filter(
      (l) => l.line_type === "units" && /^Unit .+ — /.test(String(l.description ?? "")),
    );
    if (itemized.length) {
      const keep = new Map<string, any>();
      for (const l of itemized) {
        const u = itemizedUnitOf(l);
        if (glance.some((g) => g.unit_number === u) && !keep.has(u)) {
          keep.set(u, l);
        } else {
          const { error } = await supabase.from("portal_invoice_lines").delete().eq("id", l.id);
          if (!error) updated++;
        }
      }
      const over = ov.unitsOver;
      for (let i = 0; i < glance.length; i++) {
        const u = glance[i];
        const chargeable = i >= glance.length - over;
        const price = chargeable && !ov.waived ? ov.pricePerUnit : 0;
        const text = {
          description: `Unit ${u.unit_number} — ${fmtDate(v.service_date)}`,
          detail: u.service || null,
          units_snapshot: (i === 0 ? snapshot : null) as never,
        };
        const existing = keep.get(u.unit_number);
        if (existing) {
          const { error } = await supabase
            .from("portal_invoice_lines")
            .update({ ...text, quantity: 1, unit_price: price })
            .eq("id", existing.id);
          if (!error) updated++;
        } else {
          const { error } = await supabase.from("portal_invoice_lines").insert({
            invoice_id: invoiceId,
            sort_order: ++maxSort,
            line_type: "units",
            service_id: serviceId,
            ...text,
            service_date: v.service_date,
            quantity: 1,
            unit_price: price,
            taxable: false,
            fr_entry_required: null,
          });
          if (!error) updated++;
        }
      }
      continue;
    }

    // ── summary / flat style: the unit list is printed inside `detail`.
    for (const l of svcLines) {
      const patch: Record<string, unknown> = { units_snapshot: snapshot as never };

      // Rebuild the printed list under whatever heading the line already had,
      // and fix the count in that heading, so the text matches the visit.
      const oldDetail = String((l as any).detail ?? "");
      const head = oldDetail.split("\n")[0];
      if (oldDetail.includes("Unit ") || /\bunits? treated\b/i.test(head)) {
        const total = unitRows.length;
        const nextHead = head.replace(/^\d+ units? treated/, `${total} unit${total === 1 ? "" : "s"} treated`);
        patch.detail = glance.length ? `${nextHead}\n${glanceUnitsToText(glance)}` : nextHead;
      }

      // A line priced by hand keeps its price — only the unit facts refresh.
      if (l.line_type === "units" && !handPriced) {
        patch.quantity = ov.unitsOver;
        patch.unit_price = ov.waived ? 0 : ov.pricePerUnit;
      }

      const { error } = await supabase.from("portal_invoice_lines").update(patch as never).eq("id", l.id);
      if (!error) updated++;
    }
  }

  if (updated) {
    await supabase.from("portal_invoice_events").insert({
      invoice_id: invoiceId,
      event: "refreshed_from_plan",
      actor: actor ?? null,
      detail: { lines: updated, included_units: planCfg.included_units } as never,
    });
  }

  return updated;
}

/**
 * A visit's units just changed — make every OPEN invoice that bills it say
 * exactly what the visit says now.
 *
 * Open = draft, ready, or a sent invoice an admin has unlocked. Anything the
 * customer is already holding stays frozen; unlock it and refresh to change it.
 */
export async function syncInvoiceLinesForService(serviceId: string, actor = "admin"): Promise<number> {
  const { data: lines } = await supabase
    .from("portal_invoice_lines")
    .select("invoice_id")
    .eq("service_id", serviceId);
  const ids = [...new Set((lines ?? []).map((l: any) => l.invoice_id as string).filter(Boolean))];
  if (!ids.length) return 0;

  const { data: invoices } = await supabase
    .from("portal_invoices")
    .select("id, status, edit_unlocked_until")
    .in("id", ids);

  let n = 0;
  for (const inv of invoices ?? []) {
    const unlocked =
      !!inv.edit_unlocked_until && new Date(inv.edit_unlocked_until).getTime() > Date.now();
    if (!["draft", "ready"].includes(inv.status) && !(unlocked && inv.status !== "void")) continue;
    try {
      n += await refreshDraftFromPlan(inv.id, actor);
    } catch {
      /* one bad invoice must not block the others */
    }
  }
  return n;
}

/**
 * Create the invoices that history implies but nobody ever built.
 *
 * Walks back through the property's billing periods and, for each one holding
 * completed visits that have never been invoiced, saves a draft. Properties
 * that aren't on a cycle get one bill per uninvoiced visit instead, which is
 * what "billed after each service" means.
 *
 * Everything lands as a DRAFT — history is reconstructed for review, never
 * sent, and every line stays editable.
 */
export async function backfillInvoices(
  propertyId: string,
  opts: { maxPeriods?: number; actor?: string } = {}
): Promise<{ created: number; periods: string[]; skipped: string[] }> {
  const { data: settingsRow } = await supabase
    .from("portal_billing_settings")
    .select("*")
    .eq("property_id", propertyId)
    .maybeSingle();

  const settings = (settingsRow ?? {
    billing_mode: "per_service",
    cadence: null,
    cadence_anchor: null,
  }) as BillingSettings;

  const created: string[] = [];
  const skipped: string[] = [];

  // Which periods already have an invoice, so a rerun doesn't duplicate them.
  const { data: existing } = await supabase
    .from("portal_invoices")
    .select("period_start, kind, status")
    .eq("property_id", propertyId);
  const taken = new Set(
    (existing ?? [])
      .filter((i: any) => i.kind !== "one_time" && i.period_start && i.status !== "void")
      .map((i: any) => String(i.period_start))
  );

  if (settings.billing_mode === "cadence") {
    const periods = recentPeriods(settings, opts.maxPeriods ?? 24);
    // Oldest first, so the reconstructed history reads in order.
    for (const p of [...periods].reverse()) {
      if (taken.has(p.start)) {
        skipped.push(`${p.label} — already has an invoice`);
        continue;
      }
      const draft = await buildDraftInvoice(propertyId, { periodStart: p.start, periodEnd: p.end });
      if (draft.lines.length === 0) {
        skipped.push(`${p.label} — nothing to bill`);
        continue;
      }
      await saveDraftInvoice(draft, opts.actor);
      created.push(p.label);
    }
    return { created: created.length, periods: created, skipped };
  }

  // Not on a cycle: one bill per visit that was never invoiced.
  const visits = await listBillableVisits(propertyId);
  for (const v of visits) {
    const draft = await buildOneTimeInvoice(propertyId, {
      serviceIds: [v.id],
      markAsPaidService: false,
    });
    if (draft.lines.length === 0) {
      skipped.push(`${v.service_date ?? "undated"} — nothing chargeable`);
      continue;
    }
    await saveDraftInvoice(draft, opts.actor);
    created.push(`${v.service_date ?? "undated"} — ${v.service_type}`);
  }

  return { created: created.length, periods: created, skipped };
}
