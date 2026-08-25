// supabase/functions/fieldroutes-customer-search
// READ-ONLY: search synced FieldRoutes customers (BigQuery customers_stg) for the
// app's customer picker. Selecting an existing customer here is what lets us stamp
// the real FieldRoutes customer_id on a report — and what prevents duplicate
// customers when we later write back.
//
// Auth: same as the other read functions — a valid admin session OR a known
// staff name (PinGate). Read-only, so staff access is fine. Logged for audit.
//
// Required Supabase secrets:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (auto)
//   SCHEDULING_API_URL, SCHEDULING_API_KEY
//
// Request body: { q, staffName?, sessionToken?, limit?, activeOnly? }

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Mirrors src/lib/staffRoster.ts / the other scheduling functions.
const KNOWN_STAFF = new Set([
  "Darrell Tanner", "Jake Shubin", "Caleb Whalen", "Jackson Latham",
  "Dylan Gallegos", "Michael Muniz", "Carmen Lopez", "David Longoria", "Nick Stovall", "Cade Carnival", "Brock Lyttle", "Joseph Ibarbo",
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
  let q = "";

  try {
    const body = await req.json().catch(() => ({}));
    staffName = String(body?.staffName ?? "").trim();
    sessionToken = String(body?.sessionToken ?? "").trim();
    q = String(body?.q ?? "").trim();
    const limit = Number.isFinite(body?.limit) ? Math.min(50, Math.max(1, Math.trunc(Number(body.limit)))) : 25;
    const activeOnly = body?.activeOnly === true;

    const logAttempt = async (success: boolean, error_code: string | null) => {
      await supabase.from("scheduling_audit_log").insert({
        function_name: "customer-search",
        staff_name: staffName || (sessionToken ? "admin_session" : null),
        payload: { q, limit, activeOnly },
        success, error_code, ip_address: ip, user_agent: ua,
      });
    };

    if (q.length < 2) { await logAttempt(false, "query_too_short"); return json({ ok: false, error: "query_too_short" }, 400); }

    // Auth: admin session OR known staff (read-only).
    if (sessionToken) {
      const { data: session } = await supabase
        .from("admin_sessions").select("id")
        .eq("session_token", sessionToken).eq("is_valid", true)
        .gt("expires_at", new Date().toISOString()).maybeSingle();
      if (!session) { await logAttempt(false, "invalid_session"); return json({ ok: false, error: "invalid_session" }, 401); }
    } else if (staffName) {
      if (!KNOWN_STAFF.has(staffName)) { await logAttempt(false, "unknown_staff"); return json({ ok: false, error: "unknown_staff" }, 401); }
    } else {
      await logAttempt(false, "missing_staff"); return json({ ok: false, error: "missing_staff" }, 401);
    }

    const apiUrl = Deno.env.get("SCHEDULING_API_URL");
    const apiKey = Deno.env.get("SCHEDULING_API_KEY");
    if (!apiUrl || !apiKey) { await logAttempt(false, "api_not_configured"); return json({ ok: false, error: "api_not_configured" }, 500); }

    const upstream = await fetch(`${apiUrl.replace(/\/+$/, "")}/api/fr/customer-search`, {
      method: "POST",
      headers: { "X-API-Key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ q, limit, active_only: activeOnly }),
    });
    const result = await upstream.json().catch(() => ({}));
    if (!upstream.ok) { await logAttempt(false, `upstream_${upstream.status}`); return json({ ok: false, error: "upstream_failed", status: upstream.status, detail: result }); }

    await logAttempt(true, null);
    return json({ ok: true, ...result });
  } catch (e) {
    console.error("fieldroutes-customer-search exception", e);
    return json({ ok: false, error: "exception", detail: String(e) });
  }
});
