// supabase/functions/fieldroutes-note-submit
// SUBMIT a "create note" write to the FieldRoutes approval queue.
//
// This does NOT write to FieldRoutes. It validates the input and inserts a
// PENDING row into public.fieldroutes_write_queue. The write only happens later
// when an admin individually approves it via fieldroutes-queue-decide.
//
// Writes require a valid ADMIN SESSION TOKEN (no staff-name fallback).
//
// Required Supabase secrets:
//   SUPABASE_URL              (auto)
//   SUPABASE_SERVICE_ROLE_KEY (auto)
//
// Request body:
//   { sessionToken, customerID, notes, contactType,
//     date?, showOnInvoice?, employeeID?, showTech?, showCustomer?, referenceID? }

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

  try {
    const body = await req.json().catch(() => ({}));
    const sessionToken = String(body?.sessionToken ?? "").trim();
    const customerID = Number(body?.customerID ?? 0);
    const notes = String(body?.notes ?? "").trim();
    const contactType = Number.isFinite(body?.contactType) ? Math.trunc(Number(body.contactType)) : -1;
    const date = body?.date ? String(body.date).trim() : null;
    const showOnInvoice = body?.showOnInvoice === true;
    const employeeID = Number.isFinite(body?.employeeID) ? Math.trunc(Number(body.employeeID)) : null;
    const showTech = typeof body?.showTech === "boolean" ? body.showTech : null;
    const showCustomer = typeof body?.showCustomer === "boolean" ? body.showCustomer : null;
    const referenceID = Number.isFinite(body?.referenceID) ? Math.trunc(Number(body.referenceID)) : null;

    // Auth: a valid, unexpired admin session is required to queue a write.
    if (!sessionToken) return json({ ok: false, error: "missing_session" }, 401);
    const { data: session } = await supabase
      .from("admin_sessions")
      .select("id")
      .eq("session_token", sessionToken)
      .eq("is_valid", true)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();
    if (!session) return json({ ok: false, error: "invalid_session" }, 401);
    const requestedBy = "admin_session";

    // Validation (mirrors the Cloud Run CreateNoteRequest). contactType 0
    // ("Notes") is valid, so only a negative value counts as missing.
    if (!customerID || customerID <= 0) return json({ ok: false, error: "missing_customer_id" }, 400);
    if (notes.length < 1) return json({ ok: false, error: "missing_note_text" }, 400);
    if (contactType < 0) return json({ ok: false, error: "missing_contact_type" }, 400);

    // The exact body that fieldroutes-queue-decide will forward to Cloud Run on
    // approval. dry_run is intentionally omitted here — the approve step sets it.
    const payload = {
      customer_id: customerID,
      notes,
      contact_type: contactType,
      date,
      show_on_invoice: showOnInvoice,
      employee_id: employeeID,
      show_tech: showTech,
      show_customer: showCustomer,
      reference_id: referenceID,
    };

    const preview = notes.length > 60 ? `${notes.slice(0, 57)}…` : notes;
    const summary = `Note → Customer ${customerID}: "${preview}"`;

    const { data: row, error } = await supabase
      .from("fieldroutes_write_queue")
      .insert({
        entity: "note",
        action: "create",
        endpoint: "/api/fr/note",
        payload,
        summary,
        status: "pending",
        requested_by: requestedBy,
      })
      .select("id, status, summary, requested_at")
      .single();

    if (error) {
      console.error("fieldroutes-note-submit insert error", error);
      return json({ ok: false, error: "enqueue_failed", detail: error.message }, 500);
    }

    return json({ ok: true, queued: row });
  } catch (e) {
    console.error("fieldroutes-note-submit exception", e);
    return json({ ok: false, error: "exception", detail: String(e) });
  }
});
