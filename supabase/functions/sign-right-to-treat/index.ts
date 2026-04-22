import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    const url = new URL(req.url);

    if (req.method === "GET") {
      const token = url.searchParams.get("token");
      if (!token) {
        return new Response(JSON.stringify({ ok: false, error: "missing_token" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: reqRow } = await supabase
        .from("portal_requests")
        .select("id, unit_number, pest_type, location_type, description, preferred_date, property_id, right_to_treat_signature, right_to_treat_signed_at, right_to_treat_signer_name, tenant_email")
        .eq("right_to_treat_token", token)
        .maybeSingle();

      if (!reqRow) {
        return new Response(JSON.stringify({ ok: false, error: "not_found" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: prop } = await supabase
        .from("portal_properties")
        .select("name, address")
        .eq("id", reqRow.property_id)
        .maybeSingle();

      return new Response(JSON.stringify({
        ok: true,
        request: reqRow,
        property: prop || null,
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const { token, signature, signerName } = body as { token?: string; signature?: string; signerName?: string };

      if (!token || !signature) {
        return new Response(JSON.stringify({ ok: false, error: "missing_fields" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (signature.length > 500_000) {
        return new Response(JSON.stringify({ ok: false, error: "signature_too_large" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const cleanSigner = (signerName || "").trim().slice(0, 200);

      const { data: updated, error } = await supabase
        .from("portal_requests")
        .update({
          right_to_treat_signature: signature,
          right_to_treat_signer_name: cleanSigner || null,
          right_to_treat_signed_at: new Date().toISOString(),
        })
        .eq("right_to_treat_token", token)
        .select("id")
        .maybeSingle();

      if (error || !updated) {
        return new Response(JSON.stringify({ ok: false, error: "save_failed" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ ok: true }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: false, error: "method_not_allowed" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return new Response(JSON.stringify({ ok: false, error: "server_error", message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});