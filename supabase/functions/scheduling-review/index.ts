// supabase/functions/scheduling-review
// Proxies to the Crest Scheduling API's /api/review-schedule endpoint.
//
// Auth model: any caller past the PinGate (Supabase anon key + a known
// staff name in the body) can invoke this. The FieldRoutes API key stays
// server-side on Cloud Run. Every call is recorded in
// public.scheduling_audit_log so we can spot scraping.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Mirrors src/lib/staffRoster.ts on the frontend. Update both if the roster
// changes. Calls with any other staffName are rejected.
const KNOWN_STAFF = new Set([
  "Darrell Tanner",
  "Jake Shubin",
  "Caleb Whalen",
  "Jackson Latham",
  "Dylan Gallegos",
  "Michael Muniz",
  "Carmen Lopez",
  "David Longoria",
  "Nick Stovall",
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
  let startDate: string | null = null;
  let days = 3;
  let tech: string | null = null;

  try {
    const body = await req.json().catch(() => ({}));
    staffName = String(body?.staffName ?? "").trim();
    sessionToken = String(body?.sessionToken ?? "").trim();
    startDate = body?.start_date ? String(body.start_date) : null;
    days = Number.isFinite(body?.days) ? Math.max(1, Math.min(14, Math.floor(body.days))) : 3;
    tech = body?.tech ? String(body.tech) : null;

    const logAttempt = async (success: boolean, error_code: string | null) => {
      await supabase.from("scheduling_audit_log").insert({
        function_name: "review-schedule",
        staff_name: staffName || (sessionToken ? "admin_session" : null),
        payload: { start_date: startDate, days, tech },
        success,
        error_code,
        ip_address: ip,
        user_agent: ua,
      });
    };

    // Accept EITHER a valid admin session (legacy /admin/schedule-review page)
    // OR a known staff name (new PinGate-authed portal cube).
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
    } else if (staffName) {
      if (!KNOWN_STAFF.has(staffName)) {
        await logAttempt(false, "unknown_staff");
        return json({ ok: false, error: "unknown_staff" });
      }
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

    const upstream = await fetch(`${apiUrl.replace(/\/+$/, "")}/api/review-schedule`, {
      method: "POST",
      headers: { "X-API-Key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ start_date: startDate, days, tech }),
    });
    const result = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      await logAttempt(false, `upstream_${upstream.status}`);
      return json({ ok: false, error: "upstream_failed", status: upstream.status, detail: result });
    }
    await logAttempt(true, null);
    return json({ ok: true, result });
  } catch (e) {
    console.error("scheduling-review exception", e);
    await supabase.from("scheduling_audit_log").insert({
      function_name: "review-schedule",
      staff_name: staffName || (sessionToken ? "admin_session" : null),
      payload: { start_date: startDate, days, tech },
      success: false,
      error_code: "exception",
      ip_address: ip,
      user_agent: ua,
    });
    return json({ ok: false, error: "exception", detail: String(e) });
  }
});
