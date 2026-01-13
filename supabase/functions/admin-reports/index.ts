import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Action = "list" | "get" | "delete" | "update";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const sessionToken = String(body?.sessionToken ?? "").trim();
    const action = (body?.action as Action) ?? "list";
    const reportId = body?.reportId ? String(body.reportId) : undefined;
    const reportData = body?.reportData ?? null;

    console.log("admin-reports request", { action, hasSessionToken: !!sessionToken, hasReportId: !!reportId });

    if (!sessionToken) {
      return new Response(
        JSON.stringify({ ok: false, error: "missing_session" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
      );
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
      console.log("admin-reports invalid session", sessionError?.message);
      return new Response(
        JSON.stringify({ ok: false, error: "invalid_session" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
      );
    }

    if (action === "list") {
      const { data, error } = await supabase
        .from("reports")
        .select("id, technician_name, customer_name, address, created_at, next_steps")
        .order("created_at", { ascending: false });

      if (error) {
        console.error("admin-reports list error", error);
        return new Response(
          JSON.stringify({ ok: false, error: "list_failed" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
        );
      }

      const reports = (data ?? []).map((r: any) => {
        const isInitial = Array.isArray(r.next_steps) && r.next_steps.length > 0;
        return {
          id: r.id,
          technician_name: r.technician_name,
          customer_name: r.customer_name,
          address: r.address,
          created_at: r.created_at,
          report_type: isInitial ? "initial" : "sales",
        };
      });

      return new Response(
        JSON.stringify({ ok: true, reports }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
      );
    }

    if (action === "get") {
      if (!reportId) {
        return new Response(
          JSON.stringify({ ok: false, error: "missing_report_id" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
        );
      }

      const { data, error } = await supabase
        .from("reports")
        .select("*")
        .eq("id", reportId)
        .single();

      if (error) {
        console.error("admin-reports get error", error);
        return new Response(
          JSON.stringify({ ok: false, error: "get_failed" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
        );
      }

      return new Response(
        JSON.stringify({ ok: true, report: data }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
      );
    }

    if (action === "update") {
      if (!reportId) {
        return new Response(
          JSON.stringify({ ok: false, error: "missing_report_id" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
        );
      }

      if (!reportData || typeof reportData !== "object") {
        return new Response(
          JSON.stringify({ ok: false, error: "missing_report_data" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
        );
      }

      console.log("admin-reports update", { reportId, reportDataKeys: Object.keys(reportData) });

      const { data, error } = await supabase
        .from("reports")
        .update(reportData)
        .eq("id", reportId)
        .select()
        .single();

      if (error) {
        console.error("admin-reports update error", error);
        return new Response(
          JSON.stringify({ ok: false, error: "update_failed", message: error.message }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
        );
      }

      console.log("admin-reports update success", { reportId });
      return new Response(
        JSON.stringify({ ok: true, report: data }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
      );
    }

    if (action === "delete") {
      if (!reportId) {
        return new Response(
          JSON.stringify({ ok: false, error: "missing_report_id" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
        );
      }

      const { error } = await supabase
        .from("reports")
        .delete()
        .eq("id", reportId);

      if (error) {
        console.error("admin-reports delete error", error);
        return new Response(
          JSON.stringify({ ok: false, error: "delete_failed" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
        );
      }

      return new Response(
        JSON.stringify({ ok: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
      );
    }

    return new Response(
      JSON.stringify({ ok: false, error: "unknown_action" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
    );
  } catch (error) {
    console.error("admin-reports error", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ ok: false, error: "server_error", message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
    );
  }
});
