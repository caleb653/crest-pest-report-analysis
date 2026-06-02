// supabase/functions/scheduling-write-note
// WRITE: append a note to a FieldRoutes customer, via the Crest Scheduling API
// on Cloud Run (which holds the FieldRoutes write credentials).
//
// This is the FIRST write-capable edge function. Unlike the read functions
// (find-slot, check-slot, review), writes require a valid ADMIN SESSION TOKEN —
// a known staff name alone is NOT enough to write to the live CRM. Every call
// (including dry-runs) is recorded in public.scheduling_audit_log.
//
// Required Supabase secrets:
//   SUPABASE_URL              (auto)
//   SUPABASE_SERVICE_ROLE_KEY (auto)
//   SCHEDULING_API_URL        Cloud Run service URL
//   SCHEDULING_API_KEY        Shared secret matching the Cloud Run env var
//
// Request body:
//   { sessionToken, customerID, notes, contactType,
//     date?, showOnInvoice?, employeeID?, showTech?, showCustomer?,
//     referenceID?, dryRun? }   // dryRun defaults to true

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

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const ip = req.headers.get("x-forwarded-for") ?? req.headers.get("cf-connecting-ip");
  const ua = req.headers.get("user-agent");

  let sessionToken = "";
  let customerID = 0;
  let notes = "";
  let contactType = -1; // -1 = not provided; 0 ("Notes") is a valid type
  let date: string | null = null;
  let showOnInvoice = false;
  let employeeID: number | null = null;
  let showTech: boolean | null = null;
  let showCustomer: boolean | null = null;
  let referenceID: number | null = null;
  let dryRun = true;

  const logAttempt = async (success: boolean, error_code: string | null) => {
    await supabase.from("scheduling_audit_log").insert({
      function_name: "write-note",
      staff_name: sessionToken ? "admin_session" : null,
      payload: { customerID, contactType, date, showOnInvoice, referenceID, dryRun, notes_len: notes.length },
      success,
      error_code,
      ip_address: ip,
      user_agent: ua,
    });
  };

  try {
    const body = await req.json().catch(() => ({}));
    sessionToken = String(body?.sessionToken ?? "").trim();
    customerID = Number(body?.customerID ?? 0);
    notes = String(body?.notes ?? "").trim();
    contactType = Number.isFinite(body?.contactType) ? Math.trunc(Number(body.contactType)) : -1;
    date = body?.date ? String(body.date).trim() : null;
    showOnInvoice = body?.showOnInvoice === true;
    employeeID = Number.isFinite(body?.employeeID) ? Math.trunc(Number(body.employeeID)) : null;
    showTech = typeof body?.showTech === "boolean" ? body.showTech : null;
    showCustomer = typeof body?.showCustomer === "boolean" ? body.showCustomer : null;
    referenceID = Number.isFinite(body?.referenceID) ? Math.trunc(Number(body.referenceID)) : null;
    // Writes are opt-in: only an explicit dryRun:false commits to FieldRoutes.
    dryRun = body?.dryRun !== false;

    // Writes ALWAYS require a valid admin session — no staff-name fallback.
    if (!sessionToken) {
      await logAttempt(false, "missing_session");
      return json({ ok: false, error: "missing_session" }, 401);
    }
    const { data: session } = await supabase
      .from("admin_sessions")
      .select("id")
      .eq("session_token", sessionToken)
      .eq("is_valid", true)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();
    if (!session) {
      await logAttempt(false, "invalid_session");
      return json({ ok: false, error: "invalid_session" }, 401);
    }

    if (!customerID || customerID <= 0) {
      await logAttempt(false, "missing_customer_id");
      return json({ ok: false, error: "missing_customer_id" }, 400);
    }
    if (notes.length < 1) {
      await logAttempt(false, "missing_note_text");
      return json({ ok: false, error: "missing_note_text" }, 400);
    }
    if (contactType < 0) {
      await logAttempt(false, "missing_contact_type");
      return json({ ok: false, error: "missing_contact_type" }, 400);
    }

    const apiUrl = Deno.env.get("SCHEDULING_API_URL");
    const apiKey = Deno.env.get("SCHEDULING_API_KEY");
    if (!apiUrl || !apiKey) {
      await logAttempt(false, "api_not_configured");
      return json({ ok: false, error: "api_not_configured" }, 500);
    }

    const upstream = await fetch(`${apiUrl.replace(/\/+$/, "")}/api/fr/note`, {
      method: "POST",
      headers: { "X-API-Key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        customer_id: customerID,
        notes,
        contact_type: contactType,
        date,
        show_on_invoice: showOnInvoice,
        employee_id: employeeID,
        show_tech: showTech,
        show_customer: showCustomer,
        reference_id: referenceID,
        dry_run: dryRun,
      }),
    });

    const result = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      await logAttempt(false, `upstream_${upstream.status}`);
      return json({ ok: false, error: "upstream_failed", status: upstream.status, detail: result });
    }
    await logAttempt(true, dryRun ? "dry_run" : null);
    return json({ ok: true, result });
  } catch (e) {
    console.error("scheduling-write-note exception", e);
    await logAttempt(false, "exception");
    return json({ ok: false, error: "exception", detail: String(e) });
  }
});
