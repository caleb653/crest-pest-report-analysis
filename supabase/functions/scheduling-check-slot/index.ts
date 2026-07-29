// supabase/functions/scheduling-check-slot
// Proxies to the Crest Scheduling API on Cloud Run (/api/check-slot).
//
// Mode B of the Slot Finder: given an address + a specific date + time, returns
// how out-of-the-way that slot is for the day's routes and whether it's
// feasible (feasible / tight / not_feasible). Same auth + audit model as
// scheduling-find-slot — the FieldRoutes API key stays server-side.
//
// Required Supabase secrets:
//   SUPABASE_URL              (auto)
//   SUPABASE_SERVICE_ROLE_KEY (auto)
//   SCHEDULING_API_URL        Cloud Run service URL
//   SCHEDULING_API_KEY        Shared secret matching the Cloud Run env var
//
// Request body:
//   { staffName | sessionToken, address, date, time, use_google? }

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Mirrors src/lib/staffRoster.ts on the frontend. Update both if the roster changes.
const KNOWN_STAFF = new Set([
  "Darrell Tanner",
  "Jake Shubin",
  "Caleb Whalen",
  "Jackson Latham",
  "Dylan Gallegos",
  "Michael Muniz",
  "Carmen Lopez",
  "David Longoria",
  "Nick Stovall", "Cade Carnival",
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
  const ip = req.headers.get("x-forwarded-for") ?? req.headers.get("cf-connecting-ip");
  const ua = req.headers.get("user-agent");

  let staffName = "";
  let sessionToken = "";
  let address = "";
  let date = "";
  let window = "";
  let useGoogle = true;

  try {
    const body = await req.json().catch(() => ({}));
    staffName = String(body?.staffName ?? "").trim();
    sessionToken = String(body?.sessionToken ?? "").trim();
    address = String(body?.address ?? "").trim();
    date = String(body?.date ?? "").trim();
    window = String(body?.window ?? "").trim();
    useGoogle = body?.use_google !== false;

    const logAttempt = async (success: boolean, error_code: string | null) => {
      await supabase.from("scheduling_audit_log").insert({
        function_name: "check-slot",
        staff_name: staffName || (sessionToken ? "admin_session" : null),
        payload: { address, date, window, use_google: useGoogle },
        success,
        error_code,
        ip_address: ip,
        user_agent: ua,
      });
    };

    if (address.length < 4) {
      await logAttempt(false, "missing_address");
      return json({ ok: false, error: "missing_address" });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      await logAttempt(false, "missing_date");
      return json({ ok: false, error: "missing_date" });
    }
    if (!/^(8-12|10-2|1-5|8-10|10-12|12-2|2-4|3-5|AM|PM)$/i.test(window)) {
      await logAttempt(false, "missing_window");
      return json({ ok: false, error: "missing_window" });
    }

    // Accept EITHER a valid admin session token OR a known PinGate staff name.
    let authedAs: string | null = null;
    if (sessionToken) {
      const { data: session } = await supabase
        .from("admin_sessions")
        .select("id")
        .eq("session_token", sessionToken)
        .eq("is_valid", true)
        .gt("expires_at", new Date().toISOString())
        .maybeSingle();
      if (!session) {
        await logAttempt(false, "invalid_session");
        return json({ ok: false, error: "invalid_session" });
      }
      authedAs = "admin_session";
    } else if (staffName) {
      if (!KNOWN_STAFF.has(staffName)) {
        await logAttempt(false, "unknown_staff");
        return json({ ok: false, error: "unknown_staff" });
      }
      authedAs = staffName;
    } else {
      await logAttempt(false, "missing_staff");
      return json({ ok: false, error: "missing_staff" });
    }

    const apiUrl = Deno.env.get("SCHEDULING_API_URL");
    const apiKey = Deno.env.get("SCHEDULING_API_KEY");
    if (!apiUrl || !apiKey) {
      await logAttempt(false, "api_not_configured");
      return json({ ok: false, error: "api_not_configured" });
    }

    const upstream = await fetch(`${apiUrl.replace(/\/+$/, "")}/api/check-slot`, {
      method: "POST",
      headers: { "X-API-Key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ address, date, window, use_google: useGoogle }),
    });

    const result = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      await logAttempt(false, `upstream_${upstream.status}`);
      return json({ ok: false, error: "upstream_failed", status: upstream.status, detail: result });
    }
    await logAttempt(true, null);
    return json({ ok: true, result });
  } catch (e) {
    console.error("scheduling-check-slot exception", e);
    await supabase.from("scheduling_audit_log").insert({
      function_name: "check-slot",
      staff_name: staffName || (sessionToken ? "admin_session" : null),
      payload: { address, date, window, use_google: useGoogle },
      success: false,
      error_code: "exception",
      ip_address: ip,
      user_agent: ua,
    });
    return json({ ok: false, error: "exception", detail: String(e) });
  }
});
