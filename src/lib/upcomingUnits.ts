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
  /** Explicit "Follow Up Needed" checkbox set by the technician. */
  follow_up_needed?: boolean | null;
  /** Explicit "Sanitization Concern" checkbox. */
  sanitization_concern?: boolean | null;
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
  /**
   * Optional: when set, contains `report_data.dismissed_units` — unit numbers
   * that an admin explicitly removed from this upcoming visit. These units
   * are filtered out of the merged "Units to be Treated" list so a deleted
   * unit cannot reappear via the work-order / follow-up auto-merge.
   */
  report_data?: any;
};

const sortNumeric = (arr: string[]) =>
  arr.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

/**
 * Detect a "General Request" — a work order submitted without a specific
 * unit (e.g. "the front gate is broken", "spider webs around the pool").
 * General requests must NEVER be merged into the unit list (they have no
 * unit number) but MUST be surfaced as their own line item on the next
 * upcoming service so they don't get lost.
 */
export const isGeneralRequest = (r: RequestRow | null | undefined): boolean => {
  if (!r) return false;
  const type = (r.request_type || "").toLowerCase();
  if (type.includes("general")) return true;
  // Legacy fallback: missing unit_number AND description tagged [GENERAL]
  const unit = (r.unit_number || "").toString().trim();
  if (!unit && (r.description || "").toUpperCase().includes("[GENERAL]")) return true;
  return false;
};

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
      if (status !== "pending" && status !== "in_progress") return false;
      // General requests are surfaced separately (see getOpenGeneralRequests)
      // — they never count as a unit and must never enter the merged unit list.
      if (isGeneralRequest(r)) return false;
      return true;
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

/**
 * Open GENERAL requests — work orders without a specific unit. Each one
 * is shown as its own line on the next upcoming service so the technician
 * + PM see the request, but they are NEVER merged into the unit list and
 * NEVER added to the "units to treat" count.
 * Most-recent first.
 */
export function getOpenGeneralRequests(
  requests: RequestRow[] | null | undefined
): RequestRow[] {
  return (requests || [])
    .filter(r => {
      const status = (r?.status || "").toLowerCase();
      if (status !== "pending" && status !== "in_progress") return false;
      return isGeneralRequest(r);
    })
    .sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
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
  // Units the admin explicitly dismissed from the upcoming visit are stored
  // on the past service as `report_data.dismissed_follow_ups`. Once dismissed,
  // they MUST NOT roll forward as a follow-up again unless a new work order
  // for that unit is created (work orders are handled separately by
  // computeUpcomingUnits and are not affected by this list).
  const dismissedRaw = Array.isArray((mostRecentPast as any)?.report_data?.dismissed_follow_ups)
    ? ((mostRecentPast as any).report_data.dismissed_follow_ups as unknown[])
    : [];
  const dismissed = new Set<string>();
  dismissedRaw.forEach((entry) => {
    if (typeof entry === "string") dismissed.add(String(entry).trim());
    else if (entry && typeof entry === "object") {
      const u = String((entry as any).unit || "").trim();
      if (u) dismissed.add(u);
    }
  });
  return details.filter(u => {
    if (!u?.unit_number) return false;
    if (dismissed.has(String(u.unit_number).trim())) return false;
    // ONLY flag a unit as needing a follow-up when the technician explicitly
    // CHECKED the "Follow Up Needed" checkbox on the unit. Status alone (even
    // "Activity Found" or "Treated - Follow Up") is NOT enough — the explicit
    // checkbox must be set. If the box isn't checked, do not roll the unit
    // forward to the next service under any circumstances.
    return u.follow_up_needed === true;
  });
}

/**
 * Build a SYNTHETIC "most recent past" service whose unit_details collapse
 * the latest entry per unit across every past visit (including ad-hoc).
 * This guarantees that a follow_up_needed flag set on ANY past visit
 * (regular OR ad-hoc) rolls forward — until a newer visit for that unit
 * clears it. Dismissed-follow-up entries are unioned across all visits.
 */
export function buildMergedMostRecentPast(
  allPastServices: ServiceRow[] | null | undefined
): ServiceRow | null {
  const list = Array.isArray(allPastServices) ? allPastServices : [];
  if (list.length === 0) return null;
  const isAdHocService = (svc: ServiceRow | null | undefined): boolean =>
    !!((svc as any)?.report_data && (svc as any).report_data.is_ad_hoc === true);
  // Sort newest first so the first time we see a unit is its latest detail.
  const sorted = [...list].sort((a, b) =>
    (b.service_date || "").localeCompare(a.service_date || "")
  );
  const latestByUnit = new Map<string, UnitDetailRow>();
  const dismissed: any[] = [];
  sorted.forEach((svc) => {
    const dets = Array.isArray(svc.unit_details) ? (svc.unit_details as UnitDetailRow[]) : [];
    dets.forEach((d) => {
      const u = String(d?.unit_number || "").trim();
      if (!u) return;
      // Ad-hoc spot visits are informational in-between visits. A cleared
      // ad-hoc row must NOT erase a follow-up that was already scheduled for
      // the normal cadence visit; only an ad-hoc row that is itself flagged
      // follow_up_needed should become the latest follow-up state.
      if (isAdHocService(svc) && d?.follow_up_needed !== true) return;
      if (!latestByUnit.has(u)) latestByUnit.set(u, d);
    });
    const dRaw = (svc as any)?.report_data?.dismissed_follow_ups;
    if (Array.isArray(dRaw)) dismissed.push(...dRaw);
  });
  return {
    ...sorted[0],
    unit_details: Array.from(latestByUnit.values()),
    report_data: {
      ...((sorted[0] as any)?.report_data || {}),
      dismissed_follow_ups: dismissed,
    },
  } as ServiceRow;
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

/**
 * Pick the next visit label from a cadence rotation plan based on how many
 * past services the property already has on the books. Visits roll forward
 * automatically: visit 1 → visit 2 → visit 3 → visit 4 → back to visit 1.
 *
 * `pastCount` is the count of COMPLETED past services (used as the index).
 * `cyclePlan`  is the ordered visit-label rotation (e.g. weekly = 4 entries).
 *
 * Returns the label for the NEXT upcoming visit, or "" if no plan is set.
 */
export function getCadenceVisitLabel(
  pastCount: number,
  cyclePlan: string[] | null | undefined
): string {
  const plan = (cyclePlan || []).map(s => (s || "").trim()).filter(Boolean);
  if (plan.length === 0) return "";
  const safeCount = Math.max(0, Math.floor(pastCount));
  return plan[safeCount % plan.length] || "";
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
  /**
   * The ORIGINAL (most-recent historical) work order that opened a thread on
   * this unit. Surfaced on follow-up / carried units so the technician can
   * always see the request — and tenant contact info — that started the
   * recurring visits, even after the request itself has been closed.
   *
   * For `source === "work_order"`, this is intentionally undefined because
   * the active open request is already surfaced via `request`.
   */
  original_request?: RequestRow;
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
  /**
   * NEW-TENANT MOVE-IN DATE (YYYY-MM-DD). Populated when the property's
   * customer_preferences.tenant_move_ins map has an entry for this unit
   * whose date is in the future. Auto-disappears once the date passes
   * (filter happens inside computeUpcomingUnits — past dates never reach
   * the UI). Surfaced as a mission-critical badge so techs and PMs know
   * to prioritize this unit until move-in day.
   */
  tenant_move_in_date?: string;
  /**
   * Occupancy snapshot for this unit on the upcoming visit. Auto-populated
   * from the most recent work order (request.occupancy_status) and falls
   * back to the most recent past unit detail when no work order exists.
   * Normalized to "Occupied" | "Vacant" (or undefined when unknown).
   */
  occupancy_status?: "Occupied" | "Vacant";
}

/**
 * Compute the canonical "Units to be Treated" list for an upcoming service.
 *
 * Rules (identical for admin + PM):
 *   • Always includes everything in `units_planned` on the service row.
 *   • For the FIRST upcoming service only, also merges in:
 *       - units from open work orders (pending / in_progress requests)
 *       - units flagged for follow-up on the most recent past service
 *   • NEVER fall back to all units treated on the last visit. A unit may only
 *     roll forward as follow-up when `follow_up_needed === true`.
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
  /**
   * Optional: ALL portal_requests (open + closed) for the property. Used to
   * surface the ORIGINAL work order on follow-up / carried units. When omitted
   * we fall back to `requests` (typically only open ones), which means
   * follow-ups for already-closed work orders won't show their origin.
   */
  allRequests?: RequestRow[];
  /**
   * Optional: unit_number → move-in-date (YYYY-MM-DD) map sourced from
   * `portal_properties.customer_preferences.tenant_move_ins`. Only entries
   * whose date is today-or-later are attached to the returned contexts so
   * stale move-ins auto-drop off appointments.
   */
  tenantMoveIns?: Record<string, string> | null;
}) {
  const { service, isFirstUpcoming, requests, mostRecentPast, allPastServices, allRequests, tenantMoveIns } = args;
  // Build a normalized-unit → future-move-in-date map. Past dates are
  // dropped here so the badge disappears the moment the date passes.
  const todayISO = new Date().toISOString().slice(0, 10);
  const moveInByUnit = new Map<string, string>();
  if (tenantMoveIns && typeof tenantMoveIns === "object") {
    for (const [rawUnit, rawDate] of Object.entries(tenantMoveIns)) {
      const u = normalizeUnit(rawUnit);
      const d = typeof rawDate === "string" ? rawDate.slice(0, 10) : "";
      if (!u || !d) continue;
      if (d >= todayISO) moveInByUnit.set(u, d);
    }
  }
  // Units the admin explicitly removed from THIS upcoming service. We keep
  // them in `report_data.dismissed_units` so they survive page refreshes
  // and never re-enter the merged set from work orders / follow-ups that
  // were already known at the time of dismissal.
  //
  // Each entry is either a string (legacy) or `{ unit, at }` where `at` is
  // the dismissal ISO timestamp. A NEW work order created AFTER the
  // dismissal will still surface — only existing-at-dismissal-time items
  // are suppressed for that unit.
  const dismissedRaw = Array.isArray((service?.report_data as any)?.dismissed_units)
    ? ((service!.report_data as any).dismissed_units as unknown[])
    : [];
  const dismissedAtByUnit = new Map<string, string>();
  dismissedRaw.forEach((entry) => {
    if (typeof entry === "string") {
      const u = normalizeUnit(entry);
      if (u && !dismissedAtByUnit.has(u)) dismissedAtByUnit.set(u, "");
    } else if (entry && typeof entry === "object") {
      const u = normalizeUnit((entry as any).unit);
      const at = String((entry as any).at || "");
      if (u && !dismissedAtByUnit.has(u)) dismissedAtByUnit.set(u, at);
    }
  });
  const isDismissedForPlanned = (u: string) => dismissedAtByUnit.has(u);
  const isDismissedForRequest = (u: string, createdAt?: string | null) => {
    if (!dismissedAtByUnit.has(u)) return false;
    const at = dismissedAtByUnit.get(u) || "";
    if (!at) return true; // legacy: no timestamp → suppress
    if (!createdAt) return true;
    // Suppress only requests that existed BEFORE the dismissal.
    return new Date(createdAt).getTime() <= new Date(at).getTime();
  };
  // Normalize + dedupe planned units up front so "5" / " 5" / "5 " never count twice.
  // Include saved upcoming unit_details too: inline "Add Area" autosaves the
  // in-progress service report there, and the customer portal must reflect it
  // before the visit is completed.
  const ownPlannedRaw = [
    ...(Array.isArray(service?.units_planned) ? (service.units_planned as unknown[]) : []),
    ...(Array.isArray(service?.unit_details)
      ? (service.unit_details as UnitDetailRow[]).map((d) => d?.unit_number)
      : []),
  ];
  const ownPlanned = Array.from(
    new Set(
      ownPlannedRaw
        .map(normalizeUnit)
        .filter((u) => Boolean(u) && !isDismissedForPlanned(u))
    )
  );
  const ownPlannedSet = new Set(ownPlanned);

  const openRequests = getOpenRequests(requests);
  const rawOpenRequestUnits = new Set(
    openRequests
      .filter(r => {
        const u = normalizeUnit(r.unit_number);
        return Boolean(u) && !isDismissedForRequest(u, r.created_at || null);
      })
      .map(r => normalizeUnit(r.unit_number))
  );
  const followUpDetails = getFollowUpDetailsFromPast(mostRecentPast);
  const followUpUnits = new Set(
    followUpDetails
      .map(u => normalizeUnit(u.unit_number))
      .filter((u) => Boolean(u) && !isDismissedForPlanned(u))
  );
  const openRequestUnits = new Set(
    Array.from(rawOpenRequestUnits).filter((u) => !followUpUnits.has(u))
  );
  const followUpByUnit = new Map<string, UnitDetailRow>();
  followUpDetails.forEach(u => {
    const k = normalizeUnit(u.unit_number);
    if (k && !isDismissedForPlanned(k)) followUpByUnit.set(k, u);
  });
  const requestByUnit = new Map<string, RequestRow>();
  openRequests.forEach(r => {
    const k = normalizeUnit(r.unit_number);
    if (k && !isDismissedForRequest(k, r.created_at || null)) requestByUnit.set(k, r);
  });
  const lastPastUnits = getUnitsFromMostRecentPast(mostRecentPast)
    .map(normalizeUnit)
    .filter((u) => Boolean(u) && !isDismissedForPlanned(u));

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

  // For each unit, find the most-recent request of any status (open OR closed).
  // This becomes `original_request` on follow-up / carried contexts so the
  // technician can always trace a follow-up back to the work order that
  // started the thread.
  const originalRequestByUnit = new Map<string, RequestRow>();
  const requestPool: RequestRow[] = Array.isArray(allRequests) && allRequests.length > 0
    ? allRequests
    : requests;
  [...(requestPool || [])]
    .filter(r => !isGeneralRequest(r))
    .sort((a, b) => String(b?.created_at || "").localeCompare(String(a?.created_at || "")))
    .forEach(r => {
      const u = normalizeUnit(r?.unit_number);
      if (!u) return;
      if (!originalRequestByUnit.has(u)) originalRequestByUnit.set(u, r);
    });

  const buildContext = (unit: string): UpcomingUnitContext => {
    const request = requestByUnit.get(unit);
    const followUp = followUpByUnit.get(unit);
    const lastDetail = lastDetailByUnit.get(unit);

    let source: UnitSource = "planned";
    if (isFirstUpcoming) {
      if (followUp) source = "follow_up";
      else if (request) source = "work_order";
      else if (!ownPlannedSet.has(unit) && lastPastUnits.includes(unit)) source = "carried";
    }
    // Ad-hoc visits aren't the "first upcoming" but they still need to keep
    // the follow-up identity of any unit that was dragged into them. The
    // marker rides along on the service's own unit_details row.
    if (source === "planned") {
      const ownDets = Array.isArray((service as any)?.unit_details)
        ? ((service as any).unit_details as UnitDetailRow[])
        : [];
      const ownDet = ownDets.find(
        (d) => normalizeUnit((d as any)?.unit_number) === unit,
      );
      if (ownDet && (ownDet as any).follow_up_needed === true) {
        source = "follow_up";
      }
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
      followUp?.notes ||
      lastDetail?.notes ||
      "";

    // Normalize occupancy from the work order (preferred) or the most recent
    // unit detail. Anything not matching Occupied/Vacant is dropped so the UI
    // can rely on a clean union type.
    const rawOccupancy = String(
      request?.occupancy_status ||
        (followUp as any)?.occupancy_status ||
        (lastDetail as any)?.occupancy_status ||
        ""
    ).toLowerCase();
    const occupancy_status: "Occupied" | "Vacant" | undefined = rawOccupancy.includes(
      "occupied"
    )
      ? "Occupied"
      : rawOccupancy.includes("vacant")
        ? "Vacant"
        : undefined;
    // If the unit is occupied, the new-tenant move-in date is irrelevant —
    // suppress it so it never displays alongside an Occupied badge.
    const moveIn = occupancy_status === "Occupied" ? undefined : moveInByUnit.get(unit);

    return {
      unit_number: unit,
      source,
      request,
      follow_up: followUp,
      last_unit_detail: lastDetail,
      // Don't duplicate the active open request as "original" when source is
      // already "work_order" — the dedicated request block handles that case.
      original_request: source === "work_order" ? undefined : originalRequestByUnit.get(unit),
      target_pest,
      context,
      findings,
      notes,
      tenant_move_in_date: moveIn,
      occupancy_status,
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

  // First upcoming service: merge planned + work orders + explicit follow-ups.
  // Do NOT carry all last-visit units forward — that would create accidental
  // follow-up work when the checkbox was not explicitly selected.
  const merged = new Set<string>();
  ownPlanned.forEach(u => merged.add(u));
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
    usingFallback: false,
  };
}
