// supabase/functions/fieldroutes-appointment-submit
// QUEUE a FieldRoutes appointment-book write — or, with commit:true, push it
// straight to FieldRoutes in one step.
//
// Default (no commit flag): enqueue only; fieldroutes-queue-decide commits to
// Cloud Run on approve (adds dry_run:false there). Endpoint is /api/fr/appointment.
//
// commit:true (Caleb, 2026-07-29: "1 button to push to FieldRoutes instead of
// 2"): the row is still written to fieldroutes_write_queue for the audit
// trail, but committed to Cloud Run immediately — no approval step. Used by
// the Schedule Fill "Push stop/route to FR" buttons.
//
// subscription_id rule lives in the client: inspection types → -1 (standalone);
// subscription types → the customer's real subscription id (never -1). We just
// accept whatever the caller sends and pass it through.
//
// Auth: a PinGate staff name OR a valid admin session (mirrors find-slot,
// since techs/dispatch initiate the request; office approves later).
//
// Request body:
//   { staffName?, sessionToken?, customer_id, service_type_id, service_type_label,
//     date, start, end, duration, subscription_id, employee_id?, customer_label? }

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const KNOWN_STAFF = new Set([
  "Darrell Tanner", "Jake Shubin", "Caleb Whalen", "Jackson Latham",
  "Dylan Gallegos", "Michael Muniz", "Carmen Lopez", "David Longoria", "Nick Stovall", "Cade Carnival",
]);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const body = await req.json().catch(() => ({}));
    const staffName = String(body?.staffName ?? "").trim();
    const sessionToken = String(body?.sessionToken ?? "").trim();

    let requestedBy: string | null = null;
    if (sessionToken) {
      const { data: session } = await supabase
        .from("admin_sessions").select("id")
        .eq("session_token", sessionToken).eq("is_valid", true)
        .gt("expires_at", new Date().toISOString()).maybeSingle();
      if (!session) return json({ ok: false, error: "invalid_session" }, 401);
      requestedBy = "admin_session";
    } else if (staffName) {
      if (!KNOWN_STAFF.has(staffName)) return json({ ok: false, error: "unknown_staff" }, 401);
      requestedBy = staffName;
    } else {
      return json({ ok: false, error: "missing_auth" }, 401);
    }

    // ── RESCHEDULES (Reschedule Bot): queue paced appointment/update writes
    // that MOVE existing booked appointments to better days. ──
    const reschedules = Array.isArray(body?.reschedules) ? body.reschedules : null;
    if (reschedules) {
      if (reschedules.length === 0 || reschedules.length > 300) {
        return json({ ok: false, error: "bad_reschedule_size" }, 400);
      }
      const rows: Record<string, unknown>[] = [];
      let rejected = 0;
      for (const it of reschedules) {
        const apptId = Number(it?.appointment_id ?? 0);
        const rDate = String(it?.date ?? "").trim();
        const rStart = String(it?.start ?? "").trim();
        const rEnd = String(it?.end ?? "").trim();
        if (!apptId || apptId <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(rDate)
            || !/^\d{2}:\d{2}(:\d{2})?$/.test(rStart) || !/^\d{2}:\d{2}(:\d{2})?$/.test(rEnd)) {
          rejected++;
          continue;
        }
        const label = String(it?.customer_label ?? "").trim();
        rows.push({
          entity: "appointment",
          action: "update",
          endpoint: "/api/fr/appointment-update",
          payload: {
            appointment_id: apptId,
            date: rDate,
            start: rStart.length === 5 ? `${rStart}:00` : rStart,
            end: rEnd.length === 5 ? `${rEnd}:00` : rEnd,
            duration: it?.duration == null ? null : Number(it.duration),
            route_id: it?.route_id == null || it?.route_id === "" ? null : Number(it.route_id),
            _label: { customer: label, requested_by: requestedBy,
                      moved_from: String(it?.from_date ?? "") },
          },
          summary: `Reschedule ${label || `appointment ${apptId}`} `
            + `${it?.from_date ? `from ${it.from_date} ` : ""}to ${rDate} ${rStart}–${rEnd}`,
          status: "auto",
          requested_by: requestedBy,
        });
      }
      if (!rows.length) return json({ ok: false, error: "no_valid_items", rejected }, 400);
      const { data: ins, error: insErr } = await supabase
        .from("fieldroutes_write_queue").insert(rows).select("id");
      if (insErr) return json({ ok: false, error: "enqueue_failed", detail: insErr.message }, 500);
      return json({ ok: true, paced: true, queued_count: ins?.length ?? rows.length, rejected });
    }

    // ── BULK enqueue (push a tech's whole week / ALL open routes): validate
    // each item and insert them all as pre-approved paced 'auto' rows in ONE
    // statement; the fieldroutes-queue-worker drains them 30s apart. ──
    const bulk = Array.isArray(body?.bulk) ? body.bulk : null;
    if (bulk) {
      if (bulk.length === 0 || bulk.length > 500) return json({ ok: false, error: "bad_bulk_size" }, 400);
      const rows: Record<string, unknown>[] = [];
      let rejected = 0;
      for (const it of bulk) {
        const bCustomer = Number(it?.customer_id ?? 0);
        const bDate = String(it?.date ?? "").trim();
        const bStart = String(it?.start ?? "").trim();
        const bEnd = String(it?.end ?? "").trim();
        if (!bCustomer || bCustomer <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(bDate)
            || !/^\d{2}:\d{2}(:\d{2})?$/.test(bStart) || !/^\d{2}:\d{2}(:\d{2})?$/.test(bEnd)) {
          rejected++;
          continue;
        }
        const bTypeLabel = String(it?.service_type_label ?? "").trim();
        const bCustLabel = String(it?.customer_label ?? "").trim();
        rows.push({
          entity: "appointment",
          action: "create",
          endpoint: "/api/fr/appointment",
          payload: {
            customer_id: bCustomer,
            service_type_id: Number(it?.service_type_id ?? 0),
            date: bDate,
            start: bStart.length === 5 ? `${bStart}:00` : bStart,
            end: bEnd.length === 5 ? `${bEnd}:00` : bEnd,
            duration: Number(it?.duration ?? 30),
            subscription_id: it?.subscription_id == null ? -1 : Number(it.subscription_id),
            employee_id: it?.employee_id == null ? null : Number(it.employee_id),
            route_id: it?.route_id == null || it?.route_id === "" ? null : Number(it.route_id),
            spot_id: null,
            _label: { service_type: bTypeLabel, customer: bCustLabel, requested_by: requestedBy },
          },
          summary: `Book ${bTypeLabel || "appointment"} for ${bCustLabel || `customer ${bCustomer}`} on ${bDate} ${bStart}–${bEnd}`,
          status: "auto",
          requested_by: requestedBy,
        });
      }
      if (!rows.length) return json({ ok: false, error: "no_valid_items", rejected }, 400);
      const { data: ins, error: insErr } = await supabase
        .from("fieldroutes_write_queue").insert(rows).select("id");
      if (insErr) return json({ ok: false, error: "enqueue_failed", detail: insErr.message }, 500);
      return json({ ok: true, paced: true, queued_count: ins?.length ?? rows.length, rejected });
    }

    const customer_id = Number(body?.customer_id ?? 0);
    const service_type_id = Number(body?.service_type_id ?? 0);
    const service_type_label = String(body?.service_type_label ?? "").trim();
    const date = String(body?.date ?? "").trim();
    const start = String(body?.start ?? "").trim();
    const end = String(body?.end ?? "").trim();
    const duration = Number(body?.duration ?? 30);
    const subscription_id = body?.subscription_id == null ? -1 : Number(body.subscription_id);
    const employee_id = body?.employee_id == null ? null : Number(body.employee_id);
    // routeID places the appointment ON a route (the route carries the date) —
    // without it FieldRoutes creates an unplaced appointment that never shows.
    const route_id = body?.route_id == null || body?.route_id === "" ? null : Number(body.route_id);
    const spot_id = body?.spot_id == null || body?.spot_id === "" ? null : Number(body.spot_id);
    const customer_label = String(body?.customer_label ?? "").trim();

    if (!customer_id || customer_id <= 0) return json({ ok: false, error: "missing_customer_id" }, 400);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return json({ ok: false, error: "bad_date" }, 400);
    if (!/^\d{2}:\d{2}(:\d{2})?$/.test(start) || !/^\d{2}:\d{2}(:\d{2})?$/.test(end)) {
      return json({ ok: false, error: "bad_time" }, 400);
    }

    const payload = {
      customer_id,
      service_type_id,
      date,
      start: start.length === 5 ? `${start}:00` : start,
      end: end.length === 5 ? `${end}:00` : end,
      duration,
      subscription_id,
      employee_id,
      route_id,
      spot_id,
      // Display-only context for the approval UI (not sent to Cloud Run):
      _label: {
        service_type: service_type_label,
        customer: customer_label,
        requested_by: requestedBy,
      },
    };

    const summary = `Book ${service_type_label || "appointment"} for ${customer_label || `customer ${customer_id}`} on ${date} ${start}–${end}`;
    const commit = body?.commit === true;
    // paced:true (Caleb 2026-07-30): pre-approved like commit, but drained by
    // fieldroutes-queue-worker ONE write per 30s instead of firing instantly —
    // FieldRoutes tolerates ~50 writes/min and route pushes were back-to-back.
    const paced = body?.paced === true;

    const { data: row, error } = await supabase
      .from("fieldroutes_write_queue")
      .insert({
        entity: "appointment",
        action: "create",
        endpoint: "/api/fr/appointment",
        payload,
        summary,
        // Direct pushes are claimed at insert so the approval UI never shows
        // them as actionable; the row exists purely as the audit trail.
        // 'auto' rows are invisible to the approval UI too — the worker owns
        // them. paced WINS over commit: the app sends BOTH flags so a stale
        // (pre-paced) deployment of this fn still pushes instantly instead of
        // stranding the row in the pending/approval flow.
        status: paced ? "auto" : commit ? "processing" : "pending",
        requested_by: requestedBy,
        ...(commit ? { decided_by: requestedBy, decided_at: new Date().toISOString() } : {}),
      })
      .select("id, status, summary, requested_at")
      .single();

    if (error) return json({ ok: false, error: "enqueue_failed", detail: error.message }, 500);
    if (paced) return json({ ok: true, paced: true, queued: row });
    if (!commit) return json({ ok: true, queued: row });

    // ── One-step push: commit to FieldRoutes via Cloud Run right now ──────
    const apiUrl = Deno.env.get("SCHEDULING_API_URL");
    const apiKey = Deno.env.get("SCHEDULING_API_KEY");
    if (!apiUrl || !apiKey) {
      await supabase.from("fieldroutes_write_queue")
        .update({ status: "failed", error: "api_not_configured" }).eq("id", row.id);
      return json({ ok: false, error: "api_not_configured" }, 500);
    }

    let finalStatus = "failed";
    let result: unknown = null;
    let errText: string | null = null;
    try {
      const upstream = await fetch(`${apiUrl.replace(/\/+$/, "")}/api/fr/appointment`, {
        method: "POST",
        headers: { "X-API-Key": apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, dry_run: false }),
      });
      const data = await upstream.json().catch(() => ({}));
      result = data;
      if (!upstream.ok) {
        errText = `upstream_${upstream.status}`;
      } else if (data?.forced_dry_run === true || data?.dry_run === true) {
        // Server kill switch (FR_WRITE_ENABLED) is off — the write did NOT happen.
        errText = "server_write_disabled";
      } else if (data?.ok === false) {
        errText = String(data?.error ?? "fieldroutes_error");
      } else {
        finalStatus = "committed";
      }
    } catch (e) {
      errText = `request_failed: ${String(e)}`;
    }

    await supabase.from("fieldroutes_write_queue")
      .update({ status: finalStatus, result, error: errText })
      .eq("id", row.id);

    return json({
      ok: finalStatus === "committed",
      pushed: finalStatus === "committed",
      id: row.id,
      status: finalStatus,
      error: errText,
      result,
    });
  } catch (e) {
    console.error("fieldroutes-appointment-submit exception", e);
    return json({ ok: false, error: "exception", detail: String(e) });
  }
});