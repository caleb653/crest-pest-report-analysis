import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const password = String(body?.password ?? "").trim();
    const reportId = String(body?.reportId ?? "").trim();

    if (!password || !reportId) {
      return new Response(
        JSON.stringify({ ok: false, error: "missing_fields" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
      );
    }

    const expectedPassword = Deno.env.get("DELETE_REPORT_PASSWORD");
    if (!expectedPassword || password !== expectedPassword) {
      return new Response(
        JSON.stringify({ ok: false, error: "invalid_password" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { error } = await supabase.from("reports").delete().eq("id", reportId);

    if (error) {
      console.error("delete-report error", error);
      return new Response(
        JSON.stringify({ ok: false, error: "delete_failed" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
      );
    }

    return new Response(
      JSON.stringify({ ok: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
    );
  } catch (error) {
    console.error("delete-report error", error);
    return new Response(
      JSON.stringify({ ok: false, error: "server_error" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
    );
  }
});
