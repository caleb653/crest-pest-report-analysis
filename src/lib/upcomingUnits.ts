/**
 * Single source of truth for "what units will be treated on the next service".
 *
 * BOTH the admin portal AND the PM portal MUST use this helper so the two
 * views can never disagree about which units are scheduled / requested for
 * an upcoming service date. If admin removes a unit, PM stops seeing it.
 * If PM submits a work order, admin sees the unit on the next service.
 */

export type RequestRow = {
  unit_number?: string | null;
  status?: string | null;
};

export type UnitDetailRow = {
  unit_number?: string | null;
  status?: string | null;
  pest_activity?: string | null;
  followUp?: string | null;
};

export type ServiceRow = {
  id?: string;
  units_planned?: any;
  unit_details?: any;
  service_date?: string | null;
};

const sortNumeric = (arr: string[]) =>
  arr.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

/** Open work-order units (pending or in-progress requests). */
export function getOpenRequestUnits(requests: RequestRow[] | null | undefined): Set<string> {
  const set = new Set<string>();
  (requests || []).forEach(r => {
    if (!r?.unit_number) return;
    const status = (r.status || "").toLowerCase();
    if (status === "pending" || status === "in_progress") {
      set.add(String(r.unit_number));
    }
  });
  return set;
}

/** Units flagged for follow-up on the most recent past service. */
export function getFollowUpUnitsFromPast(mostRecentPast: ServiceRow | null | undefined): Set<string> {
  const set = new Set<string>();
  const details = Array.isArray(mostRecentPast?.unit_details)
    ? (mostRecentPast!.unit_details as UnitDetailRow[])
    : [];
  details.forEach(u => {
    if (!u?.unit_number) return;
    const status = u.status || "";
    if (
      status === "Treated - Follow Up" ||
      status === "Needs Follow-up" ||
      u.followUp === "Yes" ||
      (u.pest_activity && ["High", "Moderate"].includes(u.pest_activity))
    ) {
      set.add(String(u.unit_number));
    }
  });
  return set;
}

/** All units that were treated on the most recent past service. */
export function getUnitsFromMostRecentPast(mostRecentPast: ServiceRow | null | undefined): string[] {
  const details = Array.isArray(mostRecentPast?.unit_details)
    ? (mostRecentPast!.unit_details as UnitDetailRow[])
    : [];
  return details.map(u => u?.unit_number).filter((u): u is string => Boolean(u));
}

/**
 * Compute the canonical "Units to be Treated" list for an upcoming service.
 *
 * Rules (identical for admin + PM):
 *   • Always includes everything in `units_planned` on the service row.
 *   • For the FIRST upcoming service only, also merges in:
 *       - units from open work orders (pending / in_progress requests)
 *       - units flagged for follow-up on the most recent past service
 *       - if `units_planned` is empty, fall back to all units treated on
 *         the most recent past service so admins/PMs never see "0 units".
 *
 * Returns the merged unit list (sorted numerically) plus the breakdown sets
 * so callers can render badges (Work order / Follow-up / Carried).
 */
export function computeUpcomingUnits(args: {
  service: ServiceRow;
  isFirstUpcoming: boolean;
  requests: RequestRow[];
  mostRecentPast: ServiceRow | null;
}) {
  const { service, isFirstUpcoming, requests, mostRecentPast } = args;
  const ownPlanned = Array.isArray(service?.units_planned)
    ? (service.units_planned as string[]).filter(Boolean).map(String)
    : [];

  const openRequestUnits = getOpenRequestUnits(requests);
  const followUpUnits = getFollowUpUnitsFromPast(mostRecentPast);
  const lastPastUnits = getUnitsFromMostRecentPast(mostRecentPast);

  if (!isFirstUpcoming) {
    return {
      units: sortNumeric([...new Set(ownPlanned)]),
      openRequestUnits,
      followUpUnits,
      usingFallback: false,
    };
  }

  // First upcoming service: merge planned + work orders + follow-ups,
  // falling back to last past's units when nothing is planned yet.
  const merged = new Set<string>();
  const baseUnits = ownPlanned.length > 0 ? ownPlanned : lastPastUnits;
  baseUnits.forEach(u => merged.add(u));
  openRequestUnits.forEach(u => merged.add(u));
  followUpUnits.forEach(u => merged.add(u));

  return {
    units: sortNumeric(Array.from(merged)),
    openRequestUnits,
    followUpUnits,
    usingFallback: ownPlanned.length === 0 && lastPastUnits.length > 0,
  };
}
