/**
 * Single source of truth for translating internal unit-status codes into
 * the friendly labels every customer-, PM-, and admin-facing surface
 * should display.
 *
 * Internal canonical values (stored in `unit_details[].status`) include:
 *   • "To Be Treated"
 *   • "Treated - Complete"
 *   • "Treated - Follow Up"
 *   • "Complete"
 *   • "Not Treated"
 *   • "Not Serviced"
 *   • "Inspected: Free and Clear"
 *   • "Inspected: Activity Found"
 *   • "Inspection: Not Performed"   ← new canonical value for an inspection
 *                                    that wasn't performed (no entry, etc.).
 *                                    Replaces the old shared "Not Treated"
 *                                    code which collided with the treatment
 *                                    "Not Treated" label and caused
 *                                    "Treated" rows to show as "Not Treated"
 *                                    on customer reports.
 *
 * Customer/PM-facing labels:
 *   • "Treated"
 *   • "Not Treated"
 *   • "No Activity Found"
 *   • "Activity Found"
 *   • "Not Inspected"
 *   • "To Be Treated" / "To Be Inspected"
 *
 * The helper accepts an optional `kind` ("service" | "inspection") so an
 * inspection row's "To Be Treated" renders as "To Be Inspected" without
 * forcing a data migration of every legacy row.
 */

export type UnitKind = "service" | "treatment" | "inspection" | undefined | null;

const TREATMENT_MAP: Record<string, string> = {
  "To Be Treated": "Treated",
  "Treated - Complete": "Treated",
  "Treated - Follow Up": "Treated",
  Complete: "Treated",
  "Not Treated": "Not Treated",
  "Not Serviced": "Not Treated",
  "Inspected: Free and Clear": "No Activity Found - Free and Clear",
  "Inspected: Activity Found": "Activity Found",
  "Inspection: Not Performed": "Not Inspected",
  "Free and Clear": "No Activity Found - Free and Clear",
};

const INSPECTION_MAP: Record<string, string> = {
  "To Be Treated": "To Be Inspected",
  "Treated - Complete": "Inspected",
  "Treated - Follow Up": "Inspected",
  Complete: "Inspected",
  // Legacy rows used "Not Treated" to mean "Not Inspected" on inspection
  // units. Keep that mapping here so existing data renders correctly.
  "Not Treated": "Not Inspected",
  "Not Serviced": "Not Inspected",
  "Inspection: Not Performed": "Not Inspected",
  "Inspected: Free and Clear": "No Activity Found - Free and Clear",
  "Inspected: Activity Found": "Activity Found",
  "Free and Clear": "No Activity Found - Free and Clear",
};

/**
 * Translate a stored unit status into the friendly label end users see.
 * Pass the row's `kind` so inspections never inherit treatment-only labels.
 */
export function friendlyUnitStatus(raw: unknown, kind: UnitKind = "service"): string {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  const isInspection = kind === "inspection";
  const map = isInspection ? INSPECTION_MAP : TREATMENT_MAP;
  return map[s] || s;
}

/**
 * Auto-promote a status entered on a completion form. A blank or
 * still-default "To Be Treated" value at completion time means the
 * technician finished the visit without explicitly downgrading the row,
 * so it should be promoted to its completed equivalent.
 */
export function promoteStatusOnCompletion(raw: unknown, kind: UnitKind = "service"): string {
  const s = String(raw ?? "").trim();
  const isInspection = kind === "inspection";
  if (s === "" || s === "To Be Treated") {
    return isInspection ? "Inspected: Free and Clear" : "Treated - Complete";
  }
  return s;
}
