// supabase/functions/scheduling-fill
// Schedule "Fill" planner. Given a future date window + a set of field techs,
// this:
//   1. pulls the "job pool" of recurring subscriptions that come DUE inside the
//      window (next_due = last completed service + frequency days), excluding
//      anything already booked in the window, on-hold, or one-time;
//   2. pulls the existing tech route-days in the window (with their geographic
//      centroid + current pending stop count) straight from BigQuery; and
//   3. proposes an assignment of each due customer to a (day, tech) using
//      geographic clustering with HARD rules:
//        - preferred_tech (subscription's preferred tech, if a field tech)
//        - special_scheduling day/time constraints (parsed from the free-text)
//        - per-day capacity cap
//      Customers flagged "call to schedule / don't auto-schedule" (or whose
//      constraints can't be met) are routed to a "manual" bucket instead of
//      being auto-placed.
//
// All scheduling data lives in BigQuery (project crest-data). This function
// reads it directly with a service-account JWT; nothing is written back here —
// the proposal is reviewed in the UI and queued through the normal
// fieldroutes-appointment-submit approval flow.
//
// Auth + audit model mirrors scheduling-find-slot: a PinGate staff name (or a
// valid admin session) is required, and every call is logged to
// public.scheduling_audit_log.
//
// Required Supabase secrets:
//   SUPABASE_URL              (auto)
//   SUPABASE_SERVICE_ROLE_KEY (auto)
//   GCP_SA_KEY                Service-account JSON (string) with BigQuery read
//   BIGQUERY_PROJECT          (optional) defaults to "crest-data"

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Mirrors src/lib/staffRoster.ts. Calls with any other staffName are rejected.
const KNOWN_STAFF = new Set([
  "Darrell Tanner", "Jake Shubin", "Caleb Whalen", "Jackson Latham",
  "Dylan Gallegos", "Michael Muniz", "Carmen Lopez", "David Longoria",
]);

// Authoritative field-tech roster (route names in BigQuery). These are the only
// techs whose recurring routes the Fill planner will pack.
const FIELD_TECHS = ["Darrell Tanner", "Dylan Gallegos", "Jackson Latham", "Mike Muniz"];

const DEFAULT_MAX_STOPS = 14;   // per tech-day, including existing pending stops
const DEFAULT_PROJECT = "crest-data";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });
}

// ── BigQuery via service-account JWT ─────────────────────────────────────────

function b64urlFromString(s: string): string {
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlFromBytes(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function pemToDer(pem: string): Uint8Array {
  const body = pem
    .replace(/-----BEGIN [^-]+-----/g, "")
    .replace(/-----END [^-]+-----/g, "")
    .replace(/\s+/g, "");
  const bin = atob(body);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function getAccessToken(sa: { client_email: string; private_key: string }): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = b64urlFromString(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64urlFromString(JSON.stringify({
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/bigquery.readonly",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  }));
  const unsigned = `${header}.${claim}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToDer(sa.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned),
  );
  const jwt = `${unsigned}.${b64urlFromBytes(new Uint8Array(sig))}`;

  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });
  const data = await resp.json();
  if (!data.access_token) throw new Error(`token_exchange_failed: ${JSON.stringify(data)}`);
  return data.access_token as string;
}

type Row = Record<string, string | null>;

async function bqQuery(token: string, project: string, sql: string): Promise<Row[]> {
  const resp = await fetch(
    `https://bigquery.googleapis.com/bigquery/v2/projects/${project}/queries`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: sql, useLegacySql: false, timeoutMs: 60000, maxResults: 5000 }),
    },
  );
  const data = await resp.json();
  if (data.error) throw new Error(`bq_error: ${JSON.stringify(data.error)}`);
  const fields: string[] = (data.schema?.fields ?? []).map((f: { name: string }) => f.name);
  const rows: Row[] = (data.rows ?? []).map((r: { f: { v: string | null }[] }) =>
    Object.fromEntries(r.f.map((c, i) => [fields[i], c.v])),
  );
  return rows;
}

// ── Geo + rule helpers ───────────────────────────────────────────────────────

function haversineMi(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 3958.8; // miles
  const dLat = (bLat - aLat) * Math.PI / 180;
  const dLng = (bLng - aLng) * Math.PI / 180;
  const la1 = aLat * Math.PI / 180, la2 = bLat * Math.PI / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

const DOW: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };

type Constraints = {
  manual: boolean;            // do-not-auto-schedule — route to manual bucket
  manualReason?: string;
  allowedDows?: number[];     // restrict to these weekdays
  windowHint?: "AM" | "PM" | null;
};

// Parse the free-text special_scheduling field for HARD constraints. Anything
// that reads like "call us first" becomes a manual flag; explicit day-of-week
// and AM/PM language becomes a soft filter we honor when placing.
function parseSpecial(text: string | null): Constraints {
  if (!text) return { manual: false };
  const t = text.toLowerCase();

  if (/call to schedule|call to confirm|do ?n['’]?t auto|do not auto|reach out|call ahead|call first|don['’]?t reschedule|confirm before/.test(t)) {
    return { manual: true, manualReason: text.trim() };
  }

  // Day-of-week restrictions (e.g. "Always Saturday", "Mon/Thurs/Fri AM")
  const dows: number[] = [];
  for (const [name, n] of Object.entries(DOW)) {
    const long = { sun: "sunday", mon: "monday", tue: "tuesday", wed: "wednesday", thu: "thursday", fri: "friday", sat: "saturday" }[name]!;
    if (new RegExp(`\\b${name}\\b|\\b${long}\\b`).test(t)) dows.push(n);
  }

  // AM/PM / time-of-day hints
  let windowHint: "AM" | "PM" | null = null;
  if (/\bam\b|morning|before 10|before noon|8-10|8-12|7-9|9-11/.test(t)) windowHint = "AM";
  else if (/\bpm\b|afternoon|1-5|3-5|2-4|12-2|10-2/.test(t)) windowHint = "PM";

  return {
    manual: false,
    allowedDows: dows.length ? dows : undefined,
    windowHint,
  };
}

function dowOf(isoDate: string): number {
  return new Date(`${isoDate}T12:00:00`).getDay();
}

// ── Types ─────────────────────────────────────────────────────────────────────

type RouteDay = {
  routeId: string;
  date: string;
  tech: string;
  cLat: number;
  cLng: number;
  load: number;      // running stop count (existing pending + assigned)
  baseLoad: number;  // existing pending stops
  assigned: AssignedStop[];
};

type PoolItem = {
  subscriptionId: string;
  customerId: string;
  serviceId: string;
  name: string;
  city: string;
  lat: number | null;
  lng: number | null;
  nextDue: string;
  frequency: number;
  serviceType: string;
  special: string | null;
  preferredTech: string | null;
  constraints: Constraints;
};

type AssignedStop = {
  subscription_id: string;
  customer_id: string;
  service_type_id: string;
  customer: string;
  city: string;
  service_type: string;
  next_due: string;
  distance_mi: number;
  window_hint: "AM" | "PM" | null;
  preferred_tech: string | null;
  special_scheduling: string | null;
  reasons: string[];
};

type ManualItem = {
  subscription_id: string;
  customer: string;
  city: string;
  service_type: string;
  next_due: string;
  preferred_tech: string | null;
  special_scheduling: string | null;
  reason: string;
};

// ── Handler ────────────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const ip = req.headers.get("x-forwarded-for") ?? req.headers.get("cf-connecting-ip");
  const ua = req.headers.get("user-agent");

  let staffName = "";
  let sessionToken = "";
  let startDate = "";
  let endDate = "";
  let techs: string[] = FIELD_TECHS;
  let maxStops = DEFAULT_MAX_STOPS;

  const logAttempt = async (success: boolean, error_code: string | null) => {
    await supabase.from("scheduling_audit_log").insert({
      function_name: "fill-schedule",
      staff_name: staffName || (sessionToken ? "admin_session" : null),
      payload: { start_date: startDate, end_date: endDate, techs, max_stops: maxStops },
      success,
      error_code,
      ip_address: ip,
      user_agent: ua,
    });
  };

  try {
    const body = await req.json().catch(() => ({}));
    staffName = String(body?.staffName ?? "").trim();
    sessionToken = String(body?.sessionToken ?? "").trim();
    startDate = String(body?.start_date ?? "").trim();
    endDate = String(body?.end_date ?? "").trim();
    if (Array.isArray(body?.techs)) {
      const cleaned = body.techs.map((t: unknown) => String(t).trim()).filter((t: string) => FIELD_TECHS.includes(t));
      if (cleaned.length) techs = cleaned;
    }
    if (Number.isFinite(body?.max_stops)) {
      maxStops = Math.min(30, Math.max(4, Math.trunc(Number(body.max_stops))));
    }

    // Auth: known staff name OR valid admin session.
    if (sessionToken) {
      const { data: session } = await supabase
        .from("admin_sessions").select("id")
        .eq("session_token", sessionToken).eq("is_valid", true)
        .gt("expires_at", new Date().toISOString()).maybeSingle();
      if (!session) { await logAttempt(false, "invalid_session"); return json({ ok: false, error: "invalid_session" }); }
    } else if (staffName) {
      if (!KNOWN_STAFF.has(staffName)) { await logAttempt(false, "unknown_staff"); return json({ ok: false, error: "unknown_staff" }); }
    } else {
      await logAttempt(false, "missing_staff"); return json({ ok: false, error: "missing_staff" });
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      await logAttempt(false, "bad_dates"); return json({ ok: false, error: "bad_dates", detail: "start_date and end_date must be YYYY-MM-DD" });
    }
    if (endDate < startDate) { await logAttempt(false, "bad_range"); return json({ ok: false, error: "bad_range" }); }

    const saRaw = Deno.env.get("GCP_SA_KEY");
    if (!saRaw) { await logAttempt(false, "bq_not_configured"); return json({ ok: false, error: "bq_not_configured" }); }
    const sa = JSON.parse(saRaw);
    const project = Deno.env.get("BIGQUERY_PROJECT") || DEFAULT_PROJECT;

    const token = await getAccessToken(sa);

    // SQL-safe: dates are regex-validated, tech names are validated against FIELD_TECHS.
    const techList = techs.map((t) => `"${t}"`).join(", ");

    // 1) Route-days in the window with geographic centroid + current load.
    const routeSql = `
      SELECT CAST(r.route_id AS STRING) route_id,
             CAST(DATE(r.route_date) AS STRING) d,
             r.assigned_tech_name tech,
             r.avg_latitude lat, r.avg_longitude lng,
             COUNT(a.appointment_id) pending_stops
      FROM \`${project}.fieldroutes_stg.routes\` r
      LEFT JOIN \`${project}.fieldroutes_stg.appointments_stg\` a
        ON CAST(a.route_id AS STRING) = CAST(r.route_id AS STRING) AND a.status_text = "Pending"
      WHERE DATE(r.route_date) BETWEEN "${startDate}" AND "${endDate}"
        AND r.assigned_tech_name IN (${techList})
      GROUP BY route_id, d, tech, lat, lng`;

    // 2) The due "job pool" inside the window.
    const poolSql = `
      WITH last_svc AS (
        SELECT subscription_id, MAX(DATE(appointment_date)) last_service
        FROM \`${project}.fieldroutes_stg.appointments_stg\`
        WHERE status_text = "Completed" AND subscription_id IS NOT NULL
        GROUP BY subscription_id
      ),
      already AS (
        SELECT DISTINCT subscription_id
        FROM \`${project}.fieldroutes_stg.appointments_stg\`
        WHERE status_text = "Pending"
          AND DATE(appointment_date) BETWEEN "${startDate}" AND "${endDate}"
      )
      SELECT
        CAST(s.subscription_id AS STRING) subscription_id,
        CAST(s.customer_id AS STRING) customer_id,
        CAST(s.service_id AS STRING) service_id,
        CAST(DATE_ADD(l.last_service, INTERVAL s.frequency DAY) AS STRING) next_due,
        CAST(s.frequency AS STRING) frequency,
        s.service_type,
        TRIM(CONCAT(COALESCE(c.first_name,""), " ", COALESCE(c.last_name,""))) cust_name,
        c.company_name, c.city,
        CAST(c.lat AS STRING) lat, CAST(c.lng AS STRING) lng,
        NULLIF(c.special_scheduling, "") special_scheduling,
        e.full_name preferred_tech_name
      FROM \`${project}.fieldroutes_stg.subscriptions\` s
      JOIN last_svc l USING(subscription_id)
      LEFT JOIN \`${project}.fieldroutes_stg.customers_stg\` c
        ON CAST(c.customer_id AS STRING) = CAST(s.customer_id AS STRING)
      LEFT JOIN \`${project}.fieldroutes_stg.employees\` e
        ON CAST(e.employee_id AS STRING) = CAST(s.preferred_tech AS STRING)
      WHERE s.active_text = "Active" AND NOT s.on_hold AND s.frequency > 0
        AND s.subscription_id NOT IN (SELECT subscription_id FROM already)
        AND DATE_ADD(l.last_service, INTERVAL s.frequency DAY) BETWEEN "${startDate}" AND "${endDate}"
      ORDER BY next_due`;

    const [routeRows, poolRows] = await Promise.all([
      bqQuery(token, project, routeSql),
      bqQuery(token, project, poolSql),
    ]);

    // Build route-day list (skip ones with no centroid — can't place geographically).
    const routeDays: RouteDay[] = routeRows
      .map((r) => ({
        routeId: r.route_id ?? "",
        date: r.d ?? "",
        tech: r.tech ?? "",
        cLat: r.lat != null ? Number(r.lat) : NaN,
        cLng: r.lng != null ? Number(r.lng) : NaN,
        baseLoad: Number(r.pending_stops ?? "0"),
        load: Number(r.pending_stops ?? "0"),
        assigned: [] as AssignedStop[],
      }))
      .filter((r) => r.date && r.tech && Number.isFinite(r.cLat) && Number.isFinite(r.cLng));

    const pool: PoolItem[] = poolRows.map((r) => {
      const name = (r.company_name && r.company_name.trim()) ? r.company_name.trim() : (r.cust_name?.trim() || `#${r.subscription_id}`);
      const pref = r.preferred_tech_name && FIELD_TECHS.includes(r.preferred_tech_name) ? r.preferred_tech_name : null;
      return {
        subscriptionId: r.subscription_id ?? "",
        customerId: r.customer_id ?? "",
        serviceId: r.service_id ?? "",
        name,
        city: r.city ?? "",
        lat: r.lat != null ? Number(r.lat) : null,
        lng: r.lng != null ? Number(r.lng) : null,
        nextDue: r.next_due ?? "",
        frequency: Number(r.frequency ?? "0"),
        serviceType: r.service_type ?? "",
        special: r.special_scheduling,
        preferredTech: pref,
        constraints: parseSpecial(r.special_scheduling),
      };
    });

    // ── Assignment: geographic clustering + hard rules ──────────────────────
    const manual: ManualItem[] = [];

    // Place customers nearest-to-due first, and within that, ones with a
    // preferred tech first (they're the most constrained).
    const ordered = [...pool].sort((a, b) => {
      if (a.nextDue !== b.nextDue) return a.nextDue.localeCompare(b.nextDue);
      return (b.preferredTech ? 1 : 0) - (a.preferredTech ? 1 : 0);
    });

    for (const p of ordered) {
      // Hard manual flags first.
      if (p.constraints.manual) {
        manual.push(manualOf(p, p.constraints.manualReason ?? "Flagged: call to schedule / don't auto-schedule"));
        continue;
      }
      if (p.lat == null || p.lng == null) {
        manual.push(manualOf(p, "No geocoded address on file — can't place geographically"));
        continue;
      }

      // Candidate route-days: honor preferred tech (hard) + day-of-week (hard).
      let candidates = routeDays.filter((rd) => rd.load < maxStops);
      if (p.preferredTech) candidates = candidates.filter((rd) => rd.tech === p.preferredTech);
      if (p.constraints.allowedDows) {
        candidates = candidates.filter((rd) => p.constraints.allowedDows!.includes(dowOf(rd.date)));
      }

      if (candidates.length === 0) {
        const why = p.preferredTech
          ? `Preferred tech ${p.preferredTech} has no open capacity${p.constraints.allowedDows ? " on the required day(s)" : ""} in this window`
          : p.constraints.allowedDows
            ? "No route on the required day(s) with open capacity in this window"
            : "All tech-days at capacity in this window";
        manual.push(manualOf(p, why));
        continue;
      }

      // Score = distance to the route centroid + a gentle penalty for landing
      // far from the due date (prefer scheduling near when it's actually due).
      let best: RouteDay | null = null;
      let bestScore = Infinity;
      let bestDist = 0;
      for (const rd of candidates) {
        const dist = haversineMi(p.lat, p.lng, rd.cLat, rd.cLng);
        const dueGap = Math.abs(daysBetween(rd.date, p.nextDue));
        const score = dist + dueGap * 0.75; // ~0.75 mi-equivalent per day off due
        if (score < bestScore) { bestScore = score; bestDist = dist; best = rd; }
      }
      if (!best) { manual.push(manualOf(p, "No feasible route-day")); continue; }

      const reasons: string[] = [];
      reasons.push(`${bestDist.toFixed(1)} mi from ${best.tech}'s ${best.date} cluster`);
      if (p.preferredTech) reasons.push(`Preferred tech: ${p.preferredTech}`);
      if (p.constraints.allowedDows) reasons.push("Honors day-of-week constraint");
      const dueGap = daysBetween(best.date, p.nextDue);
      reasons.push(dueGap === 0 ? "On its due date" : `${Math.abs(dueGap)} day(s) ${dueGap > 0 ? "before" : "after"} due`);

      const stop: AssignedStop = {
        subscription_id: p.subscriptionId,
        customer_id: p.customerId,
        service_type_id: p.serviceId,
        customer: p.name,
        city: p.city,
        service_type: p.serviceType,
        next_due: p.nextDue,
        distance_mi: Number(bestDist.toFixed(1)),
        window_hint: p.constraints.windowHint ?? null,
        preferred_tech: p.preferredTech,
        special_scheduling: p.special,
        reasons,
      };
      best.assigned.push(stop);
      best.load += 1;
      // Nudge the centroid toward the new stop so the cluster stays coherent.
      const n = best.load - best.baseLoad; // assigned count so far
      best.cLat = best.cLat + (p.lat - best.cLat) / (n + 1);
      best.cLng = best.cLng + (p.lng - best.cLng) / (n + 1);
    }

    // Shape the proposal: only route-days that received assignments, sorted.
    const proposed = routeDays
      .filter((rd) => rd.assigned.length > 0)
      .sort((a, b) => (a.date !== b.date ? a.date.localeCompare(b.date) : a.tech.localeCompare(b.tech)))
      .map((rd) => ({
        date: rd.date,
        tech: rd.tech,
        route_id: rd.routeId,
        existing_stops: rd.baseLoad,
        added_stops: rd.assigned.length,
        total_stops: rd.load,
        capacity: maxStops,
        stops: rd.assigned.sort((a, b) => a.distance_mi - b.distance_mi),
      }));

    const result = {
      start: startDate,
      end: endDate,
      techs,
      max_stops: maxStops,
      pool_size: pool.length,
      assigned_count: pool.length - manual.length,
      manual_count: manual.length,
      route_days_considered: routeDays.length,
      proposed,
      manual: manual.sort((a, b) => a.next_due.localeCompare(b.next_due)),
    };

    await logAttempt(true, null);
    return json({ ok: true, result });
  } catch (e) {
    console.error("scheduling-fill exception", e);
    await logAttempt(false, "exception").catch(() => {});
    return json({ ok: false, error: "exception", detail: String(e) });
  }
});

function manualOf(p: PoolItem, reason: string): ManualItem {
  return {
    subscription_id: p.subscriptionId,
    customer: p.name,
    city: p.city,
    service_type: p.serviceType,
    next_due: p.nextDue,
    preferred_tech: p.preferredTech,
    special_scheduling: p.special,
    reason,
  };
}

// Signed day difference: (date - ref) in whole days. Positive => date is before ref.
function daysBetween(date: string, ref: string): number {
  const d = new Date(`${date}T12:00:00`).getTime();
  const r = new Date(`${ref}T12:00:00`).getTime();
  return Math.round((r - d) / 86400000);
}
