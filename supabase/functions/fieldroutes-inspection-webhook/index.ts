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

const EXACT_INSPECTION_SERVICE_NAMES = new Set(["pest inspection", "rodent inspection"]);

const TECHNICIANS = [
  { name: "Darrell Tanner", license: "FR 62523", aliases: ["darrell", "tanner", "d tanner", "darrell t"] },
  { name: "Jake Shubin", license: "FR 71068", aliases: ["jake", "shubin", "jake s", "jacob shubin"] },
  { name: "Caleb Whalen", license: "FR 71183", aliases: ["caleb", "whalen", "caleb w"] },
  { name: "Jackson Latham", license: "FR 68261", aliases: ["jackson", "latham", "jackson l", "jack latham"] },
  { name: "Dylan Gallegos", license: "RA 71068", aliases: ["dylan", "gallegos", "dylan g"] },
  { name: "Michael Muniz", license: "FR 54193", aliases: ["michael", "mike", "muniz", "munoz", "michael m", "mike muniz"] },
  { name: "David Longoria", license: "FR 71710", aliases: ["david", "longoria", "david l"] },
  { name: "Nick Stovall", license: "FR 69245", aliases: ["nick", "stovall", "nick s", "nicholas stovall"] },
];

// FieldRoutes substitutes {{placeholders}} into the body as raw text. If a field
// is blank or the placeholder didn't resolve, we get "" or a literal "{{...}}".
// Treat both as null so a missing value never lands in the report as "{{fname}}".
function clean(v: unknown): string | null {
  const s = String(v ?? "").trim();
  if (!s || (s.startsWith("{{") && s.endsWith("}}"))) return null;
  return s;
}

function normalizeName(v: string): string {
  return v
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(fr|ra)\s*\d+\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizeServiceName(v: string): string {
  return String(v ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function similarity(a: string, b: string): number {
  if (a === b) return 1;
  if (!a || !b) return 0;
  const previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prevDiagonal = previous[0];
    previous[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const temp = previous[j];
      previous[j] = Math.min(
        previous[j] + 1,
        previous[j - 1] + 1,
        prevDiagonal + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      prevDiagonal = temp;
    }
  }
  return 1 - previous[b.length] / Math.max(a.length, b.length);
}

function tokenScore(input: string, candidate: string): number {
  const inputTokens = input.split(" ").filter(Boolean);
  const candidateTokens = candidate.split(" ").filter(Boolean);
  if (inputTokens.length === 0 || candidateTokens.length === 0) return 0;

  let total = 0;
  for (const token of inputTokens) {
    let best = 0;
    for (const candidateToken of candidateTokens) {
      if (token === candidateToken) best = Math.max(best, 1);
      else if (token.length === 1 && candidateToken.startsWith(token)) best = Math.max(best, 0.92);
      else if (candidateToken.length === 1 && token.startsWith(candidateToken)) best = Math.max(best, 0.92);
      else if ((token.length >= 3 || candidateToken.length >= 3) && (token.includes(candidateToken) || candidateToken.includes(token))) best = Math.max(best, 0.88);
      else best = Math.max(best, similarity(token, candidateToken));
    }
    total += best;
  }
  return total / inputTokens.length;
}

function resolveTechnician(rawName: string | null): { name: string; license: string; score: number } | null {
  try {
    if (!rawName) return null;
    const normalized = normalizeName(rawName);
    if (!normalized || normalized === "unassigned") return null;

    let best: { name: string; license: string; score: number } | null = null;
    for (const tech of TECHNICIANS) {
      const variants = [tech.name, ...tech.aliases].map(normalizeName);
      const score = Math.max(...variants.map((variant) => tokenScore(normalized, variant)));
      if (!best || score > best.score) best = { name: tech.name, license: tech.license, score };
    }

    // FieldRoutes names can be shortened/misspelled; choose the closest obvious match.
    return best && best.score >= 0.55 ? best : null;
  } catch (e) {
    console.error("fieldroutes-inspection-webhook technician_match_failed", { rawName, error: String(e) });
    return null;
  }
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

    // FieldRoutes per-customer auto-login link (FieldPortals {{loginLink}}). The
    // Trigger resolves this server-side, exactly like {{fname}}/{{email}}.
    // ONLY accept {{loginLink}} — never {{portalURL}}: portalURL is the generic
    // homepage (the bare login screen), and falling back to it drops customers on
    // a login page instead of auto-logging them in. If loginLink is empty, store
    // nothing and let the button hide rather than link to the generic page.
    const loginLink = clean(body.loginLink ?? body.login_link);

    // Cache the FieldRoutes-generated portal link by customer BEFORE any of the
    // guards below: even a payload that never creates a report (non-inspection
    // service, unknown tech, duplicate) still teaches us this customer's portal
    // link, so the app's customer lookups can pop it later. Best-effort — a
    // cache failure must never block report creation.
    if (customerId && loginLink && /^https?:\/\//i.test(loginLink)) {
      const { error: llErr } = await supabase
        .from("fieldroutes_login_links")
        .upsert(
          { customer_id: customerId, login_link: loginLink, source: "fieldroutes-webhook" },
          { onConflict: "customer_id" },
        );
      if (llErr) console.error("fieldroutes-inspection-webhook login_link_cache_failed", llErr.message);
    }

    const serviceDate = clean(body.serviceDate ?? body.service_date);
    // Tech assigned to the appointment in FieldRoutes. Different trigger templates
    // expose this under different placeholder names — accept all common variants,
    // and fall back to building "first last" from employee name fields.
    const techFirst = clean(body.techFname ?? body.tech_fname ?? body.employeeFname ?? body.assignedTechFname);
    const techLast = clean(body.techLname ?? body.tech_lname ?? body.employeeLname ?? body.assignedTechLname);
    const techName =
      clean(body.techName ?? body.tech_name ?? body.assignedTech ?? body.assignedTechName ?? body.employeeName ?? body.employee ?? body.tech) ??
      ([techFirst, techLast].filter(Boolean).join(" ") || null);
    const matchedTech = resolveTechnician(techName);
    console.log("fieldroutes-inspection-webhook technician", {
      raw: techName,
      resolved: matchedTech?.name ?? null,
      score: matchedTech?.score ?? null,
    });
    const isRodent = serviceName.toLowerCase().includes("rodent");

    // Guard: ONLY the whitelisted inspection service_type IDs + exact inspection
    // names create a report. New subscriptions (Monthly/Bi-Monthly/Quarterly/
    // Commercial/Initial Service/etc.) must NEVER auto-spawn a report even if the
    // FieldRoutes trigger fires here for every scheduled appointment.
    // Also require a known assigned technician; unassigned auto-created drafts are
    // almost always noise and should stay in FieldRoutes until a human creates one.
    const isInspection =
      INSPECTION_SERVICE_TYPES[serviceTypeId] !== undefined &&
      EXACT_INSPECTION_SERVICE_NAMES.has(normalizeServiceName(serviceName));
    if (!isInspection) {
      console.log("fieldroutes-inspection-webhook rejected non-inspection", {
        serviceTypeId, serviceName, appointmentId,
      });
      return json({ ok: true, created: false, reason: "not_inspection", service_type_id: serviceTypeId, service: serviceName });
    }

    if (!matchedTech) {
      console.log("fieldroutes-inspection-webhook rejected unknown technician", {
        serviceTypeId, serviceName, appointmentId, techName,
      });
      return json({ ok: true, created: false, reason: "unknown_technician", service_type_id: serviceTypeId, service: serviceName });
    }

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
      technician_name: matchedTech.name,
      license_number: matchedTech.license,
      customer_name: customerName,
      customer_email: clean(body.email),
      customer_phone: clean(body.phone1 ?? body.phone),
      address,
      service_date: serviceDate,
      report_title: serviceName,
      target_pests: isRodent ? ["Rodents"] : [],
      // Stamp the multi-proposal marker so the report opens in the NEW Sales
      // Report (MultiProposalReport) flow — the old single-service /report
      // route is archived and must never receive auto-created reports.
      notes: JSON.stringify({ _reportFormat: "multi-proposal", _source: "fieldroutes-webhook" }),
      customer_preferences: { reportFormat: "multi-proposal", fieldroutes_login_link: loginLink },
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
