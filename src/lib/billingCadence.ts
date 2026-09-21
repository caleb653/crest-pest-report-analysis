/**
 * How a property is BILLED, in words.
 *
 * Kept apart from how often we VISIT on purpose: Stonebrook is serviced weekly
 * and billed every 4 weeks; Huntington Cove is serviced every 14 days and billed
 * monthly. The portal used to print "Base Price / Every 4 Weeks" for everyone,
 * which was wrong for most properties and is what this replaces.
 */
export type Cadence = "4_weeks" | "monthly" | "quarterly";
export type BillingMode = "per_service" | "cadence" | "manual";

export const CADENCE_LABEL: Record<Cadence, string> = {
  monthly: "Monthly",
  "4_weeks": "Every 4 Weeks",
  quarterly: "Quarterly",
};

/** Label for the base-price tile, e.g. "Base Price / Monthly". */
export function basePriceLabel(settings?: { billing_mode?: string | null; cadence?: string | null } | null): string {
  if (!settings || settings.billing_mode === "manual") return "Base Price";
  if (settings.billing_mode === "per_service") return "Base Price / Per Service";
  const c = settings.cadence as Cadence | undefined | null;
  return c ? `Base Price / ${CADENCE_LABEL[c]}` : "Base Price";
}

/** One-line plain-English summary of the billing arrangement. */
export function billingSummary(settings?: { billing_mode?: string | null; cadence?: string | null } | null): string {
  if (!settings) return "Billing not set up yet.";
  if (settings.billing_mode === "manual") return "Invoiced manually.";
  if (settings.billing_mode === "per_service") return "Invoiced after each service.";
  const c = settings.cadence as Cadence | undefined | null;
  return c ? `Invoiced ${CADENCE_LABEL[c].toLowerCase()}.` : "Invoiced on a cycle — cycle not set.";
}
