// supabase/functions/scheduling-download
// Validates admin session, then streams a CSV from the Crest Scheduling API.
// Frontend hits this with ?file=proposed-schedule-YYYY-MM-DD.csv&sessionToken=...
//
// We use GET so links/downloads work naturally from <a href=...>, but the
// session token is in a query parameter for that reason. Tighten if needed.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const sessionToken = (url.searchParams.get("sessionToken") ?? "").trim();
    const filename = (url.searchParams.get("file") ?? "").trim();

    if (!sessionToken) return new Response("missing_session", { status: 401, headers: corsHeaders });
    if (!filename.startsWith("proposed-") || !filename.endsWith(".csv")) {
      return new Response("invalid_filename", { status: 400, headers: corsHeaders });
    }

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
      return new Response("invalid_session", { status: 401, headers: corsHeaders });
    }

    const apiUrl = Deno.env.get("SCHEDULING_API_URL");
    const apiKey = Deno.env.get("SCHEDULING_API_KEY");
    if (!apiUrl || !apiKey) {
      return new Response("api_not_configured", { status: 500, headers: corsHeaders });
    }

    const upstream = await fetch(
      `${apiUrl.replace(/\/+$/, "")}/api/download/${encodeURIComponent(filename)}`,
      { headers: { "X-API-Key": apiKey } },
    );
    if (!upstream.ok) {
      return new Response(`upstream_${upstream.status}`, { status: upstream.status, headers: corsHeaders });
    }
    return new Response(upstream.body, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (e) {
    console.error("scheduling-download exception", e);
    return new Response("exception", { status: 500, headers: corsHeaders });
  }
});
