// supabase/functions/fieldroutes-inspection-webhook
// Real-time: a FieldRoutes "Appointment Status -> Scheduled" Trigger (filtered to
// Pest/Rodent Inspection service types) POSTs here the moment an inspection is
// booked, and we create a draft Initial Pest Report immediately — no BigQuery,
// no polling. The trigger's Request Body carries the customer + appointment +
// tech fields via FieldRoutes placeholders, so this needs no callback.
//
// Companion to fieldroutes-sync-inspections (the BigQuery-backed batch path):
// same dedup + draft mapping, but driven by a single live webhook payload.
// Idempotent via the unique partial index on reports.fieldroutes_appointment_id,
// so a retry / a later batch sync of the same appointment is a no-op.
//
// PUBLIC function (verify_jwt = false) — FieldRoutes can't send a Supabase JWT.
// Auth is a shared secret the trigger sends in the `x-webhook-secret` header
// (also accepted in the JSON body as `secret`), checked against FR_WEBHOOK_SECRET.
//
// Required Supabase secrets:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (auto)
//   FR_WEBHOOK_SECRET  — must match the secret configured on the FieldRoutes trigger

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-webhook-secret",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });
}

// service_type_id -> readable name (mirrors fr_inspections.py).
const INSPECTION_SERVICE_TYPES: Record<string, string> = {
  "149": "Pest Inspection",
  "226": "Pest Inspection",
  "227": "Rodent Inspection",
};

// FieldRoutes substitutes {{placeholders}} into the body as raw text. If a field
// is blank or the placeholder didn't resolve, we get "" or a literal "{{...}}".
// Treat both as null so a missing value never lands in the report as "{{fname}}".
function clean(v: unknown): string | null {
  const s = String(v ?? "").trim();
  if (!s || (s.startsWith("{{") && s.endsWith("}}"))) return null;
  return s;
}

// Parse either JSON or url-encoded form bodies — we don't control the Content-Type
// FieldRoutes sends, so accept both.
async function parseBody(req: Request): Promise<Record<string, unknown>> {
  const raw = await req.text();
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    try {
      const out: Record<string, unknown> = {};
      new URLSearchParams(raw).forEach((val, key) => { out[key] = val; });
      return out;
    } catch {
      return {};
    }
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const body = await parseBody(req);

    // Auth: shared secret (header preferred, body fallback).
    const expected = Deno.env.get("FR_WEBHOOK_SECRET");
    const provided = (req.headers.get("x-webhook-secret") ?? clean(body.secret) ?? "").trim();
    if (!expected || !provided || provided !== expected) {
      return json({ ok: false, error: "unauthorized" }, 401);
    }

    const appointmentId = clean(body.appointmentID ?? body.appointment_id);
    if (!appointmentId) {
      console.error("fieldroutes-inspection-webhook missing_appointment_id. Body keys:", Object.keys(body), "Body sample:", JSON.stringify(body).slice(0, 2000));
      return json({ ok: false, error: "missing_appointment_id", received_keys: Object.keys(body), hint: "FieldRoutes trigger body must include {{appointmentID}} (case-sensitive)." }, 400);
    }

    const customerId = clean(body.customerID ?? body.customer_id);
    const serviceTypeId = clean(body.serviceType ?? body.service_type_id) ?? "";
    // Prefer FieldRoutes' readable description; fall back to the id->name map.
    const serviceName =
      clean(body.description) ??
      INSPECTION_SERVICE_TYPES[serviceTypeId] ??
      "Inspection";

    // Customer name: first+last, else company.
    const fname = clean(body.fname);
    const lname = clean(body.lname);
    const company = clean(body.companyName ?? body.company_name);
    const customerName = [fname, lname].filter(Boolean).join(" ") || company || null;

    const address = [
      clean(body.address),
      [clean(body.city), clean(body.state)].filter(Boolean).join(", "),
      clean(body.zip),
    ].filter(Boolean).join(", ") || null;

    const serviceDate = clean(body.serviceDate ?? body.service_date);
    // Tech assigned to the appointment in FieldRoutes. Different trigger templates
    // expose this under different placeholder names — accept all common variants,
    // and fall back to building "first last" from employee name fields.
    const techFirst = clean(body.techFname ?? body.tech_fname ?? body.employeeFname ?? body.assignedTechFname);
    const techLast = clean(body.techLname ?? body.tech_lname ?? body.employeeLname ?? body.assignedTechLname);
    const techName =
      clean(body.techName ?? body.tech_name ?? body.assignedTech ?? body.assignedTechName ?? body.employeeName ?? body.employee ?? body.tech) ??
      ([techFirst, techLast].filter(Boolean).join(" ") || null);
    const isRodent = serviceName.toLowerCase().includes("rodent");

    // Idempotency: bail early if this appointment already has a report.
    const { data: existing, error: exErr } = await supabase
      .from("reports")
      .select("id")
      .eq("fieldroutes_appointment_id", appointmentId)
      .maybeSingle();
    if (exErr) return json({ ok: false, error: "dedup_query_failed", detail: exErr.message }, 500);
    if (existing) return json({ ok: true, created: false, reason: "already_exists", report_id: existing.id });

    const row = {
      id: crypto.randomUUID(),
      technician_name: techName || "Unassigned", // NOT NULL
      customer_name: customerName,
      customer_email: clean(body.email),
      customer_phone: clean(body.phone1 ?? body.phone),
      address,
      service_date: serviceDate,
      report_title: serviceName,
      target_pests: isRodent ? ["Rodents"] : [],
      notes: `Auto-created from FieldRoutes ${serviceName} appointment ${appointmentId}`
           + `${serviceDate ? ` on ${serviceDate}` : ""} (real-time webhook).`,
      fieldroutes_customer_id: customerId,
      fieldroutes_appointment_id: appointmentId,
    };

    // Upsert with ignoreDuplicates: the unique partial index on
    // fieldroutes_appointment_id is the final guard against a race with the
    // batch sync or a webhook retry.
    const { data: inserted, error: insErr } = await supabase
      .from("reports")
      .upsert(row, { onConflict: "fieldroutes_appointment_id", ignoreDuplicates: true })
      .select("id");
    if (insErr) return json({ ok: false, error: "insert_failed", detail: insErr.message }, 500);

    if (!inserted || inserted.length === 0) {
      return json({ ok: true, created: false, reason: "already_exists" });
    }
    return json({ ok: true, created: true, report_id: inserted[0].id, appointment_id: appointmentId });
  } catch (e) {
    console.error("fieldroutes-inspection-webhook exception", e);
    return json({ ok: false, error: "exception", detail: String(e) });
  }
});
