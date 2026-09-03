/**
 * Unit-overage billing alert for APARTMENT portals.
 *
 * Whenever more units are scheduled for a property's next visit than the
 * plan's `included_units`, Carmen gets an email telling her exactly how many
 * units to charge for (replacing the old per-unit-added notification).
 *
 * The count is computed here with the SAME single-source-of-truth helper the
 * admin + PM portals render with (computeUpcomingUnits), then handed to the
 * `notify-unit-overage` edge function, which re-checks the plan config
 * server-side and dedupes via `report_data.overage_alert` on the service row
 * — so calling this repeatedly (or from multiple screens) never double-emails.
 */

import { supabase } from "@/integrations/supabase/client";
import { computeUpcomingUnits, buildMergedMostRecentPast } from "./upcomingUnits";
import { readUnitPlanConfig, isOverageWaived } from "./unitOverage";

const isAdHocService = (s: any): boolean => !!(s?.report_data && s.report_data.is_ad_hoc === true);

/**
 * Fire-and-forget: checks the property's FIRST real upcoming service and, if
 * the merged unit count exceeds the included allotment, asks the edge function
 * to email Carmen. Safe to call after any unit-adding action; no-ops for
 * HOA/commercial properties, unconfigured plans, or projected-only schedules.
 */
export async function maybeNotifyUnitOverage(args: {
  property: { id: string; customer_preferences?: any } | null | undefined;
  /** All services (this property's rows are filtered out by property_id). */
  services: any[] | null | undefined;
  /** Open (pending / in_progress) portal_requests for the property. */
  requests: any[] | null | undefined;
}): Promise<void> {
  const { property } = args;
  if (!property?.id) return;

  // Apartment portals only — apartments are the default when no type is set.
  const propType = property.customer_preferences?.property_type;
  if (propType === "hoa" || propType === "commercial") return;

  const cfg = readUnitPlanConfig(property.customer_preferences);
  if (!cfg.included_units) return;

  const propServices = (args.services || []).filter(
    (s: any) => !s.property_id || s.property_id === property.id
  );
  const pastServices = propServices
    .filter((s: any) => s.status === "completed")
    .sort((a: any, b: any) => {
      const dateCmp = (b.service_date || "").localeCompare(a.service_date || "");
      if (dateCmp !== 0) return dateCmp;
      return (b.updated_at || "").localeCompare(a.updated_at || "");
    });
  // Projected/synthetic visits have no row to anchor the alert (or its dedupe
  // marker) to — the admin dashboard re-checks once a real visit exists.
  const firstUpcoming = propServices
    .filter((s: any) => s.status !== "completed" && !isAdHocService(s))
    .sort((a: any, b: any) => (a.service_date || "").localeCompare(b.service_date || ""))[0];
  if (!firstUpcoming?.id || String(firstUpcoming.id).startsWith("projected")) return;
  // Admin waived the charge for this visit — nothing for Carmen to bill.
  if (isOverageWaived(firstUpcoming)) return;

  const merged = computeUpcomingUnits({
    service: firstUpcoming,
    isFirstUpcoming: true,
    requests: args.requests || [],
    mostRecentPast: buildMergedMostRecentPast(pastServices),
    allPastServices: pastServices,
  });
  if (merged.units.length <= Number(cfg.included_units)) return;

  try {
    await supabase.functions.invoke("notify-unit-overage", {
      body: {
        propertyId: property.id,
        serviceId: firstUpcoming.id,
        serviceDate: firstUpcoming.service_date || null,
        totalUnits: merged.units.length,
        unitNumbers: merged.units,
      },
    });
  } catch (e) {
    console.error("notify-unit-overage failed", e);
  }
}
