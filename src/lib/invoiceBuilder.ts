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
export type BasePriceBasis = "per_visit" | "per_period";
export type LineType = "base" | "units" | "ad_hoc" | "credit" | "discount" | "custom";

export interface BillingSettings {
  property_id: string;
  billing_mode: BillingMode;
  cadence: Cadence | null;
  cadence_anchor: string | null;
  base_price_basis: BasePriceBasis;
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

export interface DraftInvoice {
  property_id: string;
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

  if (settings.cadence === "monthly") {
    const s = new Date(asOf.getFullYear(), asOf.getMonth(), 1);
    return { start: iso(s), end: iso(new Date(asOf.getFullYear(), asOf.getMonth() + 1, 1)) };
  }

  if (settings.cadence === "quarterly") {
    const q = Math.floor(asOf.getMonth() / 3) * 3;
    return { start: iso(new Date(asOf.getFullYear(), q, 1)), end: iso(new Date(asOf.getFullYear(), q + 3, 1)) };
  }

  // 4_weeks
  if (!settings.cadence_anchor) {
    throw new Error(
      "This property is billed every 4 weeks but has no first-period start date set. Set it in billing settings before invoicing."
    );
  }
  const anchor = new Date(`${settings.cadence_anchor}T00:00:00`);
  const dayMs = 86400000;
  const periods = Math.floor((asOf.getTime() - anchor.getTime()) / (28 * dayMs));
  const start = new Date(anchor.getTime() + periods * 28 * dayMs);
  return { start: iso(start), end: iso(new Date(start.getTime() + 28 * dayMs)) };
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
    payment_terms_days: 30,
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
        detail: `${span} · ${recurringVisits.length} visit${recurringVisits.length === 1 ? "" : "s"}`,
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
    const glance = glanceUnitsFromPast(unitRows);

    if (!ov.planConfigured || unitRows.length === 0) continue;

    if (ov.waived) {
      warnings.push(`${fmtDate(v.service_date)}: ${ov.unitsOver} unit(s) over, waived — shown at $0.`);
    }

    if (ov.unitsOver > 0) {
      push({
        line_type: "units",
        service_id: v.id,
        description: `Additional units treated — ${fmtDate(v.service_date)}`,
        detail:
          `${unitRows.length} units treated, ${ov.includedUnits} included` +
          (glance.length ? `\n${glanceUnitsToText(glance)}` : ""),
        service_date: v.service_date,
        quantity: ov.unitsOver,
        unit_price: ov.waived ? 0 : ov.pricePerUnit,
        taxable: false,
        // Frozen: editing the visit later can never change what this invoice claimed.
        units_snapshot: { units: glance, total: unitRows.length, included: ov.includedUnits, waived: ov.waived },
        fr_entry_required: null,
      });
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
        units_snapshot: l.units_snapshot,
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
