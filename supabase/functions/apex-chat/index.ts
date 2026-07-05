// supabase/functions/apex-chat
// Proxies to the Crest Scheduling API on Cloud Run (/api/apex-chat).
//
// "Ask Me Anything" — read-only natural-language Q&A over the fieldroutes_stg
// dataset (customers, appointments, subscriptions, service history, …). The
// upstream enforces in code that generated SQL is SELECT-only and touches only
// fieldroutes_stg — never other datasets, never writes. Same auth + audit model
// as the other scheduling functions; the API key stays server-side.
//
// Request body:
//   { staffName | sessionToken, messages: [{role, content}, ...] }

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const KNOWN_STAFF = new Set([
  "Darrell Tanner",
  "Jake Shubin",
  "Caleb Whalen",
  "Jackson Latham",
  "Dylan Gallegos",
  "Michael Muniz",
  "Carmen Lopez",
  "David Longoria",
  "Nick Stovall",
]);

const MAX_MESSAGES = 40;
const MAX_CONTENT = 4000;

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
  const ip = req.headers.get("x-forwarded-for") ?? req.headers.get("cf-connecting-ip");
  const ua = req.headers.get("user-agent");

  let staffName = "";
  let sessionToken = "";
  let messages: Array<{ role: string; content: string }> = [];

  try {
    const body = await req.json().catch(() => ({}));
    staffName = String(body?.staffName ?? "").trim();
    sessionToken = String(body?.sessionToken ?? "").trim();

    if (Array.isArray(body?.messages)) {
      messages = body.messages
        .slice(-MAX_MESSAGES)
        .map((m: any) => ({
          role: m?.role === "assistant" ? "assistant" : "user",
          content: String(m?.content ?? "").slice(0, MAX_CONTENT),
        }))
        .filter((m: any) => m.content.length > 0);
    }

    const lastUserText = messages.length ? messages[messages.length - 1].content : "";
    const logAttempt = async (success: boolean, error_code: string | null) => {
      await supabase.from("scheduling_audit_log").insert({
        function_name: "apex-chat",
        staff_name: staffName || (sessionToken ? "admin_session" : null),
        payload: { question: lastUserText, turns: messages.length },
        success,
        error_code,
        ip_address: ip,
        user_agent: ua,
      });
    };

    if (!messages.length || messages[messages.length - 1].role !== "user") {
      await logAttempt(false, "no_question");
      return json({ ok: false, error: "no_question" });
    }

    let authedAs: string | null = null;
    if (sessionToken) {
      const { data: session } = await supabase
        .from("admin_sessions")
        .select("id")
        .eq("session_token", sessionToken)
        .eq("is_valid", true)
        .gt("expires_at", new Date().toISOString())
        .maybeSingle();
      if (!session) {
        await logAttempt(false, "invalid_session");
        return json({ ok: false, error: "invalid_session" });
      }
      authedAs = "admin_session";
    } else if (staffName) {
      if (!KNOWN_STAFF.has(staffName)) {
        await logAttempt(false, "unknown_staff");
        return json({ ok: false, error: "unknown_staff" });
      }
      authedAs = staffName;
    } else {
      await logAttempt(false, "missing_staff");
      return json({ ok: false, error: "missing_staff" });
    }

    const credentials = [
      { label: "apex", apiUrl: Deno.env.get("APEX_API_URL"), apiKey: Deno.env.get("APEX_API_KEY") },
      { label: "scheduling", apiUrl: Deno.env.get("SCHEDULING_API_URL"), apiKey: Deno.env.get("SCHEDULING_API_KEY") },
    ].filter((credential) => credential.apiUrl && credential.apiKey);

    if (!credentials.length) {
      await logAttempt(false, "api_not_configured");
      return json({ ok: false, error: "api_not_configured" });
    }

    let lastFailure: { status: number; detail: unknown } | null = null;
    for (const credential of credentials) {
      const upstream = await fetch(`${credential.apiUrl!.replace(/\/+$/, "")}/api/apex-chat`, {
        method: "POST",
        headers: { "X-API-Key": credential.apiKey!, "Content-Type": "application/json" },
        body: JSON.stringify({ messages }),
      });

      const result = await upstream.json().catch(() => ({}));
      if (upstream.ok) {
        await logAttempt(true, null);
        return json({ ok: true, result });
      }

      lastFailure = { status: upstream.status, detail: result };
      if (upstream.status !== 401 && upstream.status !== 403) break;
    }

    await logAttempt(false, `upstream_${lastFailure?.status ?? "failed"}`);
    return json({ ok: false, error: "upstream_failed", status: lastFailure?.status, detail: lastFailure?.detail });
  } catch (e) {
    console.error("apex-chat exception", e);
    await supabase.from("scheduling_audit_log").insert({
      function_name: "apex-chat",
      staff_name: staffName || (sessionToken ? "admin_session" : null),
      payload: { turns: messages.length },
      success: false,
      error_code: "exception",
      ip_address: ip,
      user_agent: ua,
    });
    return json({ ok: false, error: "exception", detail: String(e) });
  }
});
