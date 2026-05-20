// supabase/functions/scheduling-review
// Validates admin session, proxies to the Crest Scheduling API's /api/review-schedule endpoint.

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

    const startDate = body?.start_date ? String(body.start_date) : null;
    const days = Number.isFinite(body?.days) ? Math.max(1, Math.min(14, Math.floor(body.days))) : 3;
    const tech = body?.tech ? String(body.tech) : null;

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

    if (sessionError || !session) return json({ ok: false, error: "invalid_session" });

    const apiUrl = Deno.env.get("SCHEDULING_API_URL");
    const apiKey = Deno.env.get("SCHEDULING_API_KEY");
    if (!apiUrl || !apiKey) return json({ ok: false, error: "api_not_configured" });

    const upstream = await fetch(`${apiUrl.replace(/\/+$/, "")}/api/review-schedule`, {
      method: "POST",
      headers: { "X-API-Key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ start_date: startDate, days, tech }),
    });
    const result = await upstream.json().catch(() => ({}));
    if (!upstream.ok) return json({ ok: false, error: "upstream_failed", status: upstream.status, detail: result });
    return json({ ok: true, result });
  } catch (e) {
    return json({ ok: false, error: "exception", detail: String(e) });
  }
});