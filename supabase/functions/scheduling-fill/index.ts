// supabase/functions/scheduling-fill
// Proxies to the Crest Scheduling API's /api/fill-schedule endpoint (Cloud Run).
//
// "Schedule Fill": given a future window + field techs, the upstream proposes a
// schedule from the due pool (last service + frequency, ±per-frequency tolerance),
// clustered by zone and honoring preferred tech / special-scheduling / capacity.
// It's READ-ONLY — the proposal is reviewed in-app and queued through the normal
// fieldroutes-appointment-submit approval flow.
//
// The fill logic runs on Cloud Run (keyless BigQuery via the service's attached
// service account) — NOT here. A Supabase edge function can't hit BigQuery
// directly: the org forbids service-account keys and edge functions run off-GCP.
//
// Auth + audit model mirrors scheduling-review: a PinGate staff name (or a valid
// admin session) is required, and every call is logged to scheduling_audit_log.
//
// Required Supabase secrets:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (auto)
//   SCHEDULING_API_URL   Cloud Run service URL
//   SCHEDULING_API_KEY   Shared secret matching the Cloud Run env var

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Mirrors src/lib/staffRoster.ts on the frontend.
const KNOWN_STAFF = new Set([
  "Darrell Tanner", "Jake Shubin", "Caleb Whalen", "Jackson Latham",
  "Dylan Gallegos", "Michael Muniz", "Carmen Lopez", "David Longoria", "Nick Stovall",
]);

// Field techs the planner packs (matches policy/tech-home-bases.yaml on the API).
const FIELD_TECHS = ["Darrell Tanner", "Dylan Gallegos", "Jackson Latham", "Mike Muniz"];

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
  const ip = req.headers.get("x-forwarded-for") ?? req.headers.get("cf-connecting-ip");
  const ua = req.headers.get("user-agent");

  let staffName = "";
  let sessionToken = "";
  let startDate = "";
  let endDate = "";
  let techs: string[] | null = null;
  let maxStops = 12;
  let minStops = 0;

  const logAttempt = async (success: boolean, error_code: string | null) => {
    await supabase.from("scheduling_audit_log").insert({
      function_name: "fill-schedule",
      staff_name: staffName || (sessionToken ? "admin_session" : null),
      payload: { start_date: startDate, end_date: endDate, techs, max_stops: maxStops, min_stops: minStops },
      success, error_code, ip_address: ip, user_agent: ua,
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
    if (Number.isFinite(body?.min_stops)) {
      minStops = Math.min(maxStops, Math.max(0, Math.trunc(Number(body.min_stops))));
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
      await logAttempt(false, "bad_dates");
      return json({ ok: false, error: "bad_dates", detail: "start_date and end_date must be YYYY-MM-DD" });
    }
    if (endDate < startDate) { await logAttempt(false, "bad_range"); return json({ ok: false, error: "bad_range" }); }

    const apiUrl = Deno.env.get("SCHEDULING_API_URL");
    const apiKey = Deno.env.get("SCHEDULING_API_KEY");
    if (!apiUrl || !apiKey) { await logAttempt(false, "api_not_configured"); return json({ ok: false, error: "api_not_configured" }); }

    const upstream = await fetch(`${apiUrl.replace(/\/+$/, "")}/api/fill-schedule`, {
      method: "POST",
      headers: { "X-API-Key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ start_date: startDate, end_date: endDate, techs, max_stops: maxStops, min_stops: minStops }),
    });
    const result = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      await logAttempt(false, `upstream_${upstream.status}`);
      return json({ ok: false, error: "upstream_failed", status: upstream.status, detail: result });
    }
    await logAttempt(true, null);
    return json({ ok: true, result });
  } catch (e) {
    console.error("scheduling-fill exception", e);
    await logAttempt(false, "exception").catch(() => {});
    return json({ ok: false, error: "exception", detail: String(e) });
  }
});
