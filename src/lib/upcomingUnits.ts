/**
 * Single source of truth for "what units will be treated on the next service".
 *
 * BOTH the admin portal AND the PM portal MUST use this helper so the two
 * views can never disagree about which units are scheduled / requested for
 * an upcoming service date. If admin removes a unit, PM stops seeing it.
 * If PM submits a work order, admin sees the unit on the next service.
 */

export type RequestRow = {
  id?: string;
  unit_number?: string | null;
  status?: string | null;
  pest_type?: string | null;
  location_type?: string | null;
  description?: string | null;
  preferred_date?: string | null;
  created_at?: string | null;
  /** "Service Request" | "Inspection Request" — set on the work order itself. */
  request_type?: string | null;
  occupancy_status?: string | null;
  tenant_email?: string | null;
};

export type UnitDetailRow = {
  unit_number?: string | null;
  status?: string | null;
  pest_activity?: string | null;
  followUp?: string | null;
  findings?: string | null;
  target_pest?: string | null;
  products_used?: any;
  notes?: string | null;
};

export type ServiceRow = {
  id?: string;
  units_planned?: any;
  unit_details?: any;
  service_date?: string | null;
};

const sortNumeric = (arr: string[]) =>
  arr.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

/**
 * Normalize a unit number for set/dedupe purposes.
 * Ensures "5", " 5 ", "5 " all collapse to a single unique unit.
 * Returns "" for empty/nullish input so callers can filter it out.
 */
const normalizeUnit = (u: unknown): string => {
  if (u === null || u === undefined) return "";
  return String(u).trim();
};

/** Return the open (pending / in_progress) requests, deduped by unit (most-recent first). */
export function getOpenRequests(requests: RequestRow[] | null | undefined): RequestRow[] {
  const seen = new Set<string>();
  const result: RequestRow[] = [];
  (requests || [])
    .filter(r => {
      const status = (r?.status || "").toLowerCase();
      return status === "pending" || status === "in_progress";
    })
    // Most recent first so we pick the latest detail when a unit has multiple open requests.
    .sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""))
    .forEach(r => {
      const u = r?.unit_number ? String(r.unit_number) : "";
      if (!u || seen.has(u)) return;
      seen.add(u);
      result.push(r);
    });
  return result;
}

/** Open work-order units (pending or in-progress requests). */
export function getOpenRequestUnits(requests: RequestRow[] | null | undefined): Set<string> {
  return new Set(getOpenRequests(requests).map(r => String(r.unit_number)));
}

/** Follow-up unit DETAILS from the most recent past service (for badges + per-unit context). */
export function getFollowUpDetailsFromPast(
  mostRecentPast: ServiceRow | null | undefined
): UnitDetailRow[] {
  const details = Array.isArray(mostRecentPast?.unit_details)
    ? (mostRecentPast!.unit_details as UnitDetailRow[])
    : [];
  return details.filter(u => {
    if (!u?.unit_number) return false;
    const status = u.status || "";
    // ONLY flag a unit as needing a follow-up when the technician
    // EXPLICITLY chose a follow-up status. If they marked the unit as
    // "Completed" / "Complete" — even with High/Moderate activity noted —
    // we respect that choice and do NOT auto-roll it into the next service.
    return (
      status === "Treated - Follow Up" ||
      status === "Treated - Follow Up Needed" ||
      status === "Needs Follow-up" ||
      status === "Needs Follow Up" ||
      status === "Activity Found - Follow Up Needed" ||
      status === "Inspected: Activity Found" ||
      u.followUp === "Yes"
    );
  });
}

/** Units flagged for follow-up on the most recent past service. */
export function getFollowUpUnitsFromPast(mostRecentPast: ServiceRow | null | undefined): Set<string> {
  return new Set(getFollowUpDetailsFromPast(mostRecentPast).map(u => String(u.unit_number)));
}

/** All units that were treated on the most recent past service. */
export function getUnitsFromMostRecentPast(mostRecentPast: ServiceRow | null | undefined): string[] {
  const details = Array.isArray(mostRecentPast?.unit_details)
    ? (mostRecentPast!.unit_details as UnitDetailRow[])
    : [];
  return details.map(u => u?.unit_number).filter((u): u is string => Boolean(u));
}

export type UnitSource = "work_order" | "follow_up" | "planned" | "carried";

export interface UpcomingUnitContext {
  unit_number: string;
  source: UnitSource;
  /** Work-order details (when source === "work_order"). */
  request?: RequestRow;
  /** Follow-up details from the most recent past service. */
  follow_up?: UnitDetailRow;
  /** All-time most-recent unit detail for this unit (any past service) — fallback context. */
  last_unit_detail?: UnitDetailRow;
  /** Pre-filled target pest (for the technician). */
  target_pest?: string;
  /**
   * Work-Order / Last-Service CONTEXT (separate from findings).
   *  - Work order  → "<pest> activity reported (Interior): <description>"
   *  - Follow-up / carried → "Last service notes: …" from prior visit
   */
  context?: string;
  /**
   * Actual TECHNICIAN FINDINGS pre-filled from the most recent past service
   * (only populated for follow_up / carried — never synthesized from a work order).
   */
  findings?: string;
  /** Pre-filled notes text (for the technician — internal). */
  notes?: string;
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
 * Returns the merged unit list (sorted numerically) plus per-unit context
 * (source, work-order info, follow-up findings) so admin + PM render the
 * EXACT SAME breakdown.
 */
export function computeUpcomingUnits(args: {
  service: ServiceRow;
  isFirstUpcoming: boolean;
  requests: RequestRow[];
  mostRecentPast: ServiceRow | null;
  /** Optional: ALL past services, used to look up the most-recent detail per unit. */
  allPastServices?: ServiceRow[];
}) {
  const { service, isFirstUpcoming, requests, mostRecentPast, allPastServices } = args;
  // Normalize + dedupe planned units up front so "5" / " 5" / "5 " never count twice.
  const ownPlanned = Array.isArray(service?.units_planned)
    ? Array.from(
        new Set(
          (service.units_planned as unknown[])
            .map(normalizeUnit)
            .filter(Boolean)
        )
      )
    : [];
  const ownPlannedSet = new Set(ownPlanned);

  const openRequests = getOpenRequests(requests);
  const openRequestUnits = new Set(
    openRequests.map(r => normalizeUnit(r.unit_number)).filter(Boolean)
  );
  const followUpDetails = getFollowUpDetailsFromPast(mostRecentPast);
  const followUpUnits = new Set(
    followUpDetails.map(u => normalizeUnit(u.unit_number)).filter(Boolean)
  );
  const followUpByUnit = new Map<string, UnitDetailRow>();
  followUpDetails.forEach(u => {
    const k = normalizeUnit(u.unit_number);
    if (k) followUpByUnit.set(k, u);
  });
  const requestByUnit = new Map<string, RequestRow>();
  openRequests.forEach(r => {
    const k = normalizeUnit(r.unit_number);
    if (k) requestByUnit.set(k, r);
  });
  const lastPastUnits = getUnitsFromMostRecentPast(mostRecentPast)
    .map(normalizeUnit)
    .filter(Boolean);

  // For each unit, find the most-recent unit_detail from any past service (used as
  // a fallback to pre-fill findings/products/target_pest for the technician).
  const lastDetailByUnit = new Map<string, UnitDetailRow>();
  const pastsForLookup: ServiceRow[] =
    Array.isArray(allPastServices) && allPastServices.length > 0
      ? [...allPastServices].sort((a, b) =>
          (b.service_date || "").localeCompare(a.service_date || "")
        )
      : mostRecentPast
      ? [mostRecentPast]
      : [];
  pastsForLookup.forEach(svc => {
    const dets = Array.isArray(svc.unit_details) ? (svc.unit_details as UnitDetailRow[]) : [];
    dets.forEach(d => {
      const u = normalizeUnit(d?.unit_number);
      if (!u) return;
      if (!lastDetailByUnit.has(u)) lastDetailByUnit.set(u, d);
    });
  });

  const buildContext = (unit: string): UpcomingUnitContext => {
    const request = requestByUnit.get(unit);
    const followUp = followUpByUnit.get(unit);
    const lastDetail = lastDetailByUnit.get(unit);

    let source: UnitSource = "planned";
    if (isFirstUpcoming) {
      if (request) source = "work_order";
      else if (followUp) source = "follow_up";
      else if (!ownPlannedSet.has(unit) && lastPastUnits.includes(unit)) source = "carried";
    }

    // Pre-fill defaults so technician + PM never see blanks for an actionable unit.
    const target_pest =
      request?.pest_type ||
      followUp?.target_pest ||
      lastDetail?.target_pest ||
      "";
    // Two SEPARATE pieces of information:
    //   • context  → what triggered this unit being on the next service
    //                (work order details, OR a summary of the prior visit)
    //   • findings → actual technician findings from the most recent past
    //                service, only when this is a follow-up / carry-over
    const contextParts: string[] = [];
    if (request) {
      // Lead with the type of request (Inspection vs Treatment) so the
      // technician immediately knows what they're walking into.
      const kindLabel =
        (request.request_type || "").toLowerCase().includes("inspection")
          ? "Inspection Request"
          : "Treatment Request";
      contextParts.push(kindLabel);
      contextParts.push(
        `${request.pest_type || "Pest"} activity reported${
          request.location_type ? ` (${request.location_type})` : ""
        }${request.description ? `: ${request.description}` : ""}`
      );
      if (request.occupancy_status) {
        contextParts.push(`Unit status: ${request.occupancy_status}`);
      }
      if (request.tenant_email) {
        contextParts.push(`Tenant contact: ${request.tenant_email}`);
      }
      if (request.preferred_date) {
        contextParts.push(`Preferred date: ${request.preferred_date}`);
      }
    } else {
      const priorDetail = followUp || lastDetail;
      if (priorDetail?.pest_activity && priorDetail.pest_activity !== "None") {
        contextParts.push(`Last visit pest activity: ${priorDetail.pest_activity}`);
      }
      if (priorDetail?.notes) {
        contextParts.push(`Last service notes: ${priorDetail.notes}`);
      }
      if (priorDetail?.status) {
        contextParts.push(`Last status: ${priorDetail.status}`);
      }
    }
    const context = contextParts.filter(Boolean).join("\n");

    // Findings come ONLY from prior-service technician notes (never from a work order).
    const findings = !request
      ? (followUp?.findings || lastDetail?.findings || "")
      : "";

    const notes =
      (request?.preferred_date ? `Preferred: ${request.preferred_date}` : "") ||
      followUp?.notes ||
      "";

    return {
      unit_number: unit,
      source,
      request,
      follow_up: followUp,
      last_unit_detail: lastDetail,
      target_pest,
      context,
      findings,
      notes,
    };
  };

  if (!isFirstUpcoming) {
    const units = sortNumeric([...new Set(ownPlanned)]);
    const unitContexts = units.map(buildContext);
    return {
      units,
      unitContexts,
      openRequestUnits,
      followUpUnits,
      openRequests,
      followUpDetails,
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

  const units = sortNumeric(Array.from(merged));
  const unitContexts = units.map(buildContext);

  return {
    units,
    unitContexts,
    openRequestUnits,
    followUpUnits,
    openRequests,
    followUpDetails,
    usingFallback: ownPlanned.length === 0 && lastPastUnits.length > 0,
  };
}
