// supabase/functions/scheduling-find-slot
// Validates the admin session token, then proxies to the Crest Scheduling API
// on Cloud Run. Mirrors the auth pattern used by admin-reports.
//
// Required Supabase secrets (set with `supabase secrets set ...`):
//   SUPABASE_URL              (auto)
//   SUPABASE_SERVICE_ROLE_KEY (auto)
//   SCHEDULING_API_URL        Cloud Run service URL (e.g. https://crest-scheduling-api-xxx.run.app)
//   SCHEDULING_API_KEY        Shared secret matching the Cloud Run env var
//
// Request body:
//   { sessionToken, address, window?, use_google? }

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const sessionToken = String(body?.sessionToken ?? "").trim();
    if (!sessionToken) return json({ ok: false, error: "missing_session" });

    const address = String(body?.address ?? "").trim();
    if (address.length < 4) return json({ ok: false, error: "missing_address" });
    const window = body?.window ? String(body.window) : null;
    const useGoogle = body?.use_google !== false;

    // Validate admin session
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { data: session, error: sessionError } = await supabase
      .from("admin_sessions")
      .select("id")
      .eq("session_token", sessionToken)
      .eq("is_valid", true)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();

    if (sessionError || !session) {
      console.log("scheduling-find-slot invalid session", sessionError?.message);
      return json({ ok: false, error: "invalid_session" });
    }

    // Call Cloud Run
    const apiUrl = Deno.env.get("SCHEDULING_API_URL");
    const apiKey = Deno.env.get("SCHEDULING_API_KEY");
    if (!apiUrl || !apiKey) {
      return json({ ok: false, error: "api_not_configured" });
    }

    const upstream = await fetch(`${apiUrl.replace(/\/+$/, "")}/api/find-slot`, {
      method: "POST",
      headers: { "X-API-Key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ address, window, use_google: useGoogle }),
    });

    const result = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      console.log("scheduling-find-slot upstream error", upstream.status, result);
      return json({ ok: false, error: "upstream_failed", status: upstream.status, detail: result });
    }
    return json({ ok: true, result });
  } catch (e) {
    console.error("scheduling-find-slot exception", e);
    return json({ ok: false, error: "exception", detail: String(e) });
  }
});
