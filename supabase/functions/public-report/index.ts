import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type PublicReportRequest = {
  reportId?: string;
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = (await req.json().catch(() => ({}))) as PublicReportRequest;
    const reportId = String(body?.reportId ?? "").trim();

    console.log("public-report request", { hasReportId: !!reportId });

    if (!reportId) {
      return new Response(JSON.stringify({ ok: false, error: "missing_report_id" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Return only fields required for the static customer view.
    const { data, error } = await supabase
      .from("reports")
      .select(
        [
          "id",
          "technician_name",
          "customer_name",
          "address",
          "service_date",
          "findings",
          "notes",
          "services",
          "target_pests",
          "products_used",
          "equipment",
          "custom_map_url",
          "rendered_map_url",
          "map_data",
          "property_images",
          "customer_signature",
          "sent_to_customer_at",
          "report_title",
          "license_number",
          "recommendations",
          "next_steps",
        ].join(",")
      )
      .eq("id", reportId)
      .maybeSingle();

    if (error) {
      console.error("public-report fetch error", error);
      return new Response(JSON.stringify({ ok: false, error: "fetch_failed" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!data) {
      return new Response(JSON.stringify({ ok: false, error: "not_found" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true, report: data }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("public-report error", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ ok: false, error: "server_error", message }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
