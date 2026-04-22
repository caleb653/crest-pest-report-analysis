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
      const { data: resp } = await supabase
        .from("portal_survey_responses")
        .select("id, survey_id, property_id, answers, submitted_at, respondent_name, unit_number, recipient_email")
        .eq("token", token)
        .maybeSingle();

      if (!resp) {
        return new Response(JSON.stringify({ ok: false, error: "not_found" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: survey } = await supabase
        .from("portal_surveys")
        .select("title, intro, questions")
        .eq("id", resp.survey_id)
        .maybeSingle();

      const { data: prop } = await supabase
        .from("portal_properties")
        .select("name, address")
        .eq("id", resp.property_id)
        .maybeSingle();

      return new Response(JSON.stringify({
        ok: true,
        response: resp,
        survey: survey || null,
        property: prop || null,
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const { token, answers, respondentName, unitNumber } = body as {
        token?: string;
        answers?: Record<string, unknown>;
        respondentName?: string;
        unitNumber?: string;
      };

      if (!token || !answers || typeof answers !== "object") {
        return new Response(JSON.stringify({ ok: false, error: "missing_fields" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Cap response size to prevent abuse
      const serialized = JSON.stringify(answers);
      if (serialized.length > 50_000) {
        return new Response(JSON.stringify({ ok: false, error: "answers_too_large" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const cleanName = (respondentName || "").trim().slice(0, 200);
      const cleanUnit = (unitNumber || "").trim().slice(0, 50);

      const { data: updated, error } = await supabase
        .from("portal_survey_responses")
        .update({
          answers,
          respondent_name: cleanName || null,
          unit_number: cleanUnit || null,
          submitted_at: new Date().toISOString(),
        })
        .eq("token", token)
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