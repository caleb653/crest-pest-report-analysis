// supabase/functions/scheduling-find-slot
// Proxies to the Crest Scheduling API on Cloud Run.
//
// Auth model: any caller past the PinGate (i.e. anyone with the Supabase
// anon key + a known staff name) can invoke this. The FieldRoutes API key
// stays server-side on Cloud Run; we never expose it to the browser. Every
// call is recorded in public.scheduling_audit_log so we can spot scraping.
//
// Required Supabase secrets:
//   SUPABASE_URL              (auto)
//   SUPABASE_SERVICE_ROLE_KEY (auto)
//   SCHEDULING_API_URL        Cloud Run service URL
//   SCHEDULING_API_KEY        Shared secret matching the Cloud Run env var
//
// Request body:
//   { staffName, address, window?, use_google? }

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
  "Nick Stovall", "Cade Carnival", "Brock Lyttle",
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
  let window: string | null = null;
  let useGoogle = true;
  let dates: string[] | null = null;
  let slotsPerDay = 5;

  try {
    const body = await req.json().catch(() => ({}));
    staffName = String(body?.staffName ?? "").trim();
    sessionToken = String(body?.sessionToken ?? "").trim();
    address = String(body?.address ?? "").trim();
    window = body?.window ? String(body.window) : null;
    useGoogle = body?.use_google !== false;
    // Mode A "select specific days": optional list of YYYY-MM-DD strings.
    if (Array.isArray(body?.dates)) {
      const cleaned = body.dates
        .map((d: unknown) => String(d).trim())
        .filter((d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d));
      dates = cleaned.length ? cleaned : null;
    }
    if (Number.isFinite(body?.slots_per_day)) {
      slotsPerDay = Math.min(10, Math.max(1, Math.trunc(Number(body.slots_per_day))));
    }

    const logAttempt = async (success: boolean, error_code: string | null) => {
      await supabase.from("scheduling_audit_log").insert({
        function_name: "find-slot",
        staff_name: staffName || (sessionToken ? "admin_session" : null),
        payload: { address, window, use_google: useGoogle, dates, slots_per_day: slotsPerDay },
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

    // Accept EITHER (a) a valid admin session token (legacy path used by the
    // production /admin/slot-finder page) OR (b) a known staff name from the
    // PinGate-authed portal cube. Allows backend to deploy independently of
    // the frontend rollout.
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

    const upstream = await fetch(`${apiUrl.replace(/\/+$/, "")}/api/find-slot`, {
      method: "POST",
      headers: { "X-API-Key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        address,
        window,
        use_google: useGoogle,
        dates,
        slots_per_day: slotsPerDay,
      }),
    });

    const result = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      await logAttempt(false, `upstream_${upstream.status}`);
      return json({ ok: false, error: "upstream_failed", status: upstream.status, detail: result });
    }
    await logAttempt(true, null);
    return json({ ok: true, result });
  } catch (e) {
    console.error("scheduling-find-slot exception", e);
    await supabase.from("scheduling_audit_log").insert({
      function_name: "find-slot",
      staff_name: staffName || (sessionToken ? "admin_session" : null),
      payload: { address, window, use_google: useGoogle, dates, slots_per_day: slotsPerDay },
      success: false,
      error_code: "exception",
      ip_address: ip,
      user_agent: ua,
    });
    return json({ ok: false, error: "exception", detail: String(e) });
  }
});
