// supabase/functions/fieldroutes-backfill-techs
// Fill in technician_name on FieldRoutes inspection reports once the tech is
// actually assigned in FieldRoutes.
//
// Why: an inspection report is created when the appointment is SCHEDULED, but at
// that moment no tech is assigned yet (assigned_tech = 0), so it lands as
// "Unassigned". The tech gets assigned later; BigQuery picks that up on its next
// sync. This job looks up the now-assigned tech (Cloud Run /api/fr/appointment-techs,
// which resolves assigned_tech -> employee name) and updates the report.
//
// FORWARD-ONLY: only touches reports created on/after FORWARD_CUTOFF. It never
// rewrites historical reports, and never overwrites a tech name that's already
// set — it only fills in ones still "Unassigned".
//
// Auth (either):
//   - header  x-sync-key: <INSPECTION_SYNC_KEY>     (cron / on-login)
//   - body    { sessionToken }  = valid admin session (manual)
//
// Required Supabase secrets:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (auto)
//   SCHEDULING_API_URL, SCHEDULING_API_KEY
//   INSPECTION_SYNC_KEY (optional; needed for unattended/cron calls)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-sync-key",
};

// Go-forward only: reports created before this date are never touched, so no
// historical report is ever modified. (The day this backfill went live.)
const FORWARD_CUTOFF = "2026-06-02T00:00:00Z";

// Cap per run so a call stays fast and bounded.
const MAX_REPORTS = 300;

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
    const sessionToken = String(body?.sessionToken ?? "").trim();
    const syncKey = req.headers.get("x-sync-key") ?? "";

    // Auth: cron secret OR admin session.
    const expectedKey = Deno.env.get("INSPECTION_SYNC_KEY");
    let authed = false;
    if (expectedKey && syncKey && syncKey === expectedKey) {
      authed = true;
    } else if (sessionToken) {
      const { data: session } = await supabase
        .from("admin_sessions").select("id")
        .eq("session_token", sessionToken).eq("is_valid", true)
        .gt("expires_at", new Date().toISOString()).maybeSingle();
      if (session) authed = true;
    }
    if (!authed) return json({ ok: false, error: "unauthorized" }, 401);

    // 1) Forward-only inspection reports still missing a tech.
    const { data: pending, error: selErr } = await supabase
      .from("reports")
      .select("fieldroutes_appointment_id")
      .not("fieldroutes_appointment_id", "is", null)
      .eq("technician_name", "Unassigned")
      .gte("created_at", FORWARD_CUTOFF)
      .limit(MAX_REPORTS);
    if (selErr) return json({ ok: false, error: "select_failed", detail: selErr.message }, 500);

    const apptIds = [...new Set((pending ?? []).map((r) => String(r.fieldroutes_appointment_id)))];
    if (apptIds.length === 0) return json({ ok: true, scanned: 0, resolved: 0, updated: 0 });

    // 2) Resolve assigned techs from BigQuery via Cloud Run (only returns the
    //    ones that now have a real tech).
    const apiUrl = Deno.env.get("SCHEDULING_API_URL");
    const apiKey = Deno.env.get("SCHEDULING_API_KEY");
    if (!apiUrl || !apiKey) return json({ ok: false, error: "api_not_configured" }, 500);

    const upstream = await fetch(`${apiUrl.replace(/\/+$/, "")}/api/fr/appointment-techs`, {
      method: "POST",
      headers: { "X-API-Key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ appointment_ids: apptIds }),
    });
    const upJson = await upstream.json().catch(() => ({}));
    if (!upstream.ok || !upJson?.ok) {
      return json({ ok: false, error: "upstream_failed", detail: upJson }, 502);
    }
    const techs: Record<string, string> = upJson.techs ?? {};
    const resolvedIds = Object.keys(techs);
    if (resolvedIds.length === 0) return json({ ok: true, scanned: apptIds.length, resolved: 0, updated: 0 });

    // 3) Group by tech name -> one update per distinct tech. The
    //    technician_name = 'Unassigned' guard makes this idempotent and ensures
    //    we never clobber a name a human may have already set.
    const byTech: Record<string, string[]> = {};
    for (const [appt, tech] of Object.entries(techs)) {
      (byTech[tech] ??= []).push(appt);
    }

    let updated = 0;
    for (const [tech, ids] of Object.entries(byTech)) {
      const { data: rows, error: updErr } = await supabase
        .from("reports")
        .update({ technician_name: tech })
        .in("fieldroutes_appointment_id", ids)
        .eq("technician_name", "Unassigned")
        .gte("created_at", FORWARD_CUTOFF)
        .select("id");
      if (updErr) {
        console.error("backfill update failed for tech", tech, updErr.message);
        continue;
      }
      updated += rows?.length ?? 0;
    }

    return json({ ok: true, scanned: apptIds.length, resolved: resolvedIds.length, updated });
  } catch (e) {
    console.error("fieldroutes-backfill-techs exception", e);
    return json({ ok: false, error: "exception", detail: String(e) });
  }
});
