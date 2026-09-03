/**
 * Unit-overage helpers for property-level service plans.
 *
 * Each portal_property stores two values inside `customer_preferences`:
 *   - `included_units`: number of interior units covered per service.
 *   - `overage_price_per_unit`: $ charged for every unit beyond the included count.
 *
 * These helpers compute the per-service overage so admin & PM views show the
 * exact same totals — and so the value can be persisted on `report_data` of
 * each service for invoicing / reporting later.
 */

export interface UnitPlanConfig {
  /** Units included in the per-service price. 0 / undefined = no plan configured. */
  included_units?: number | null;
  /** Dollar amount charged per unit treated beyond the included count. */
  overage_price_per_unit?: number | null;
  /** Base price billed for each service visit (before overage). */
  base_service_price?: number | null;
}

export interface OverageResult {
  /** True when the property has a plan AND units treated > included. */
  hasOverage: boolean;
  /** True when the property has a plan configured (any included_units > 0). */
  planConfigured: boolean;
  totalUnits: number;
  includedUnits: number;
  unitsOver: number;
  pricePerUnit: number;
  overageCost: number;
  /** Admin waived the charge for this visit (report_data.overage_waived). */
  waived: boolean;
  /** What to actually bill: overageCost, or 0 when waived. */
  billableCost: number;
}

/** True when an admin waived the overage charge for this specific service row. */
export const isOverageWaived = (service: any): boolean =>
  !!(service?.report_data && service.report_data.overage_waived === true);

/**
 * Read the property-level plan config from a `customer_preferences` JSON blob.
 * Returns sane defaults if missing.
 */
export function readUnitPlanConfig(customer_preferences: any): UnitPlanConfig {
  const cp = customer_preferences || {};
  const included = Number(cp.included_units);
  const price = Number(cp.overage_price_per_unit);
  const base = Number(cp.base_service_price);
  return {
    included_units: Number.isFinite(included) && included > 0 ? included : 0,
    overage_price_per_unit: Number.isFinite(price) && price > 0 ? price : 0,
    base_service_price: Number.isFinite(base) && base > 0 ? base : 0,
  };
}

/**
 * Compute overage for a service given the unit count and the property's plan.
 */
export function computeOverage(
  totalUnits: number,
  cfg: UnitPlanConfig,
  /** Pass `isOverageWaived(service)` so billableCost reflects a per-visit waiver. */
  waived: boolean = false
): OverageResult {
  const includedUnits = Number(cfg.included_units || 0);
  const pricePerUnit = Number(cfg.overage_price_per_unit || 0);
  const planConfigured = includedUnits > 0;
  const safeTotal = Number.isFinite(totalUnits) && totalUnits > 0 ? totalUnits : 0;
  const unitsOver = planConfigured ? Math.max(0, safeTotal - includedUnits) : 0;
  const overageCost = unitsOver * pricePerUnit;
  return {
    hasOverage: planConfigured && unitsOver > 0,
    planConfigured,
    totalUnits: safeTotal,
    includedUnits,
    unitsOver,
    pricePerUnit,
    overageCost,
    waived: !!waived,
    billableCost: waived ? 0 : overageCost,
  };
}

export const formatOverageMoney = (n: number): string =>
  `$${(Math.round(n * 100) / 100).toLocaleString(undefined, {
    minimumFractionDigits: n % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;