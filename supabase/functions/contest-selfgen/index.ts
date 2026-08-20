// supabase/functions/contest-selfgen
// Proxies to the Crest Scheduling API's /api/contest/self-gen (Cloud Run).
//
// "Self-Generated Sales" contest: 1x route-manager upsell (bait boxes /
// mosquito added to an existing recurring customer), 2x self-generated
// net-new residential, 3x self-generated commercial. Detection runs on
// BigQuery from the FieldRoutes "Self-Generated" customer source +
// subscription Sold By. READ-ONLY — computes nothing locally (BigQuery is keyless on
// Cloud Run via the service account; edge functions can't reach it).
//
// Auth mirrors scheduling-efficiency: a PinGate staff name OR a valid admin
// session.
//
// Required Supabase secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (auto),
//   SCHEDULING_API_URL, SCHEDULING_API_KEY.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const KNOWN_STAFF = new Set([
  "Darrell Tanner", "Jake Shubin", "Caleb Whalen", "Jackson Latham",
  "Dylan Gallegos", "Michael Muniz", "Carmen Lopez", "David Longoria", "Nick Stovall", "Cade Carnival", "Brock Lyttle",
]);

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

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
    const startDate = DATE_RE.test(String(body?.start_date ?? "")) ? String(body.start_date) : null;
    const endDate = DATE_RE.test(String(body?.end_date ?? "")) ? String(body.end_date) : null;

    // Auth: known staff name OR valid admin session.
    if (sessionToken) {
      const { data: session } = await supabase
        .from("admin_sessions").select("id")
        .eq("session_token", sessionToken).eq("is_valid", true)
        .gt("expires_at", new Date().toISOString()).maybeSingle();
      if (!session) return json({ ok: false, error: "invalid_session" });
    } else if (staffName) {
      if (!KNOWN_STAFF.has(staffName)) return json({ ok: false, error: "unknown_staff" });
    } else {
      return json({ ok: false, error: "missing_staff" });
    }

    const apiUrl = Deno.env.get("SCHEDULING_API_URL");
    const apiKey = Deno.env.get("SCHEDULING_API_KEY");
    if (!apiUrl || !apiKey) return json({ ok: false, error: "api_not_configured" });

    const upstream = await fetch(`${apiUrl.replace(/\/+$/, "")}/api/contest/self-gen`, {
      method: "POST",
      headers: { "X-API-Key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ start_date: startDate, end_date: endDate }),
    });
    const result = await upstream.json().catch(() => ({}));
    if (!upstream.ok) return json({ ok: false, error: "upstream_failed", status: upstream.status, detail: result });
    return json({ ok: true, result });
  } catch (e) {
    console.error("contest-selfgen exception", e);
    return json({ ok: false, error: "exception", detail: String(e) });
  }
});
