// supabase/functions/scheduling-monthly
// Validates admin session, proxies to the Crest Scheduling API's
// /api/monthly-schedule endpoint. The upstream takes 2-3 minutes — frontend
// should show a loading state.

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

    const weeks = Number.isFinite(body?.weeks) ? Math.max(1, Math.min(13, Math.floor(body.weeks))) : 4;
    const writeToSheet = body?.write_to_sheet === true;

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

    const upstream = await fetch(`${apiUrl.replace(/\/+$/, "")}/api/monthly-schedule`, {
      method: "POST",
      headers: { "X-API-Key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ weeks, write_to_sheet: writeToSheet }),
    });
    const result = await upstream.json().catch(() => ({}));
    if (!upstream.ok) return json({ ok: false, error: "upstream_failed", status: upstream.status, detail: result });

    // Rewrite csv_file URLs so the frontend hits the edge function for download
    // instead of going direct to Cloud Run (which it can't auth against).
    const rewritten: Record<string, string> = {};
    if (result?.csv_files) {
      for (const [k, v] of Object.entries(result.csv_files)) {
        // server returns "/api/download/<file>"; we'll expose it via a separate
        // edge function (scheduling-download) which proxies the file.
        const filename = String(v).split("/").pop()!;
        rewritten[k] = filename;
      }
    }
    return json({ ok: true, result: { ...result, csv_files: rewritten } });
  } catch (e) {
    console.error("scheduling-monthly exception", e);
    return json({ ok: false, error: "exception", detail: String(e) });
  }
});
