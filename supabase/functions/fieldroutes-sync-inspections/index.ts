// supabase/functions/fieldroutes-sync-inspections
// Auto-create draft Initial Pest Reports from scheduled FieldRoutes inspections.
//
// Pulls Pest/Rodent Inspection appointments (from Cloud Run /api/fr/new-inspections),
// skips any we've already turned into a report (reports.fieldroutes_appointment_id),
// and inserts a draft Initial Pest Report for each new one — pre-filled with the
// customer's name/email/phone/address and linked by fieldroutes_customer_id +
// fieldroutes_appointment_id. Idempotent: safe to run on a schedule.
//
// Auth (either):
//   - header  x-sync-key: <INSPECTION_SYNC_KEY>     (for the scheduler/cron)
//   - body    { sessionToken }  = valid admin session (for a manual "Sync now")
//
// Required Supabase secrets:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (auto)
//   SCHEDULING_API_URL, SCHEDULING_API_KEY
//   INSPECTION_SYNC_KEY (optional; needed for unattended/cron calls)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-sync-key",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });
}

type Candidate = {
  appointment_id: string;
  service_type_id: string;
  service_name: string;
  appointment_date: string | null;
  customer_id: string | null;
  customer_name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  tech_name: string | null;
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const body = await req.json().catch(() => ({}));
    const sessionToken = String(body?.sessionToken ?? "").trim();
    const syncKey = req.headers.get("x-sync-key") ?? "";
    const daysAhead = Number.isFinite(body?.days_ahead) ? Math.trunc(Number(body.days_ahead)) : 90;

    // Auth: cron secret OR admin session.
    const expectedKey = Deno.env.get("INSPECTION_SYNC_KEY");
    let authed = false;
    if (expectedKey && syncKey && syncKey === expectedKey) {
      authed = true;
    } else if (sessionToken) {
      const { data: session } = await supabase
        .from("admin_sessions").select("id")
        .eq("session_token", sessionToken).eq("is_valid", true)
        .gt("expires_at", new Date().toISOString()).maybeSingle();
      if (session) authed = true;
    }
    if (!authed) return json({ ok: false, error: "unauthorized" }, 401);

    // 1) Candidates from Cloud Run.
    const apiUrl = Deno.env.get("SCHEDULING_API_URL");
    const apiKey = Deno.env.get("SCHEDULING_API_KEY");
    if (!apiUrl || !apiKey) return json({ ok: false, error: "api_not_configured" }, 500);

    const upstream = await fetch(`${apiUrl.replace(/\/+$/, "")}/api/fr/new-inspections`, {
      method: "POST",
      headers: { "X-API-Key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ days_ahead: daysAhead }),
    });
    const upJson = await upstream.json().catch(() => ({}));
    if (!upstream.ok || !upJson?.ok) {
      return json({ ok: false, error: "upstream_failed", detail: upJson }, 502);
    }
    const candidates: Candidate[] = upJson.candidates ?? [];
    if (candidates.length === 0) return json({ ok: true, created: 0, skipped: 0, total: 0 });

    // 2) Dedup: which appointment ids already have a report?
    const apptIds = candidates.map((c) => c.appointment_id);
    const { data: existing, error: exErr } = await supabase
      .from("reports")
      .select("fieldroutes_appointment_id")
      .in("fieldroutes_appointment_id", apptIds);
    if (exErr) return json({ ok: false, error: "dedup_query_failed", detail: exErr.message }, 500);
    const seen = new Set((existing ?? []).map((r) => r.fieldroutes_appointment_id));

    // 3) Build draft rows for the new ones.
    const rows = candidates
      .filter((c) => !seen.has(c.appointment_id))
      .map((c) => {
        const addr = [c.address, [c.city, c.state].filter(Boolean).join(", "), c.zip]
          .filter(Boolean).join(", ");
        const isRodent = c.service_name.toLowerCase().includes("rodent");
        return {
          id: crypto.randomUUID(),
          technician_name: c.tech_name || "Unassigned",
          customer_name: c.customer_name || null,
          customer_email: c.email || null,
          customer_phone: c.phone || null,
          address: addr || null,
          service_date: c.appointment_date || null,
          report_title: c.service_name,
          target_pests: isRodent ? ["Rodents"] : [],
          notes: `Auto-created from FieldRoutes ${c.service_name} appointment `
               + `${c.appointment_id}${c.appointment_date ? ` on ${c.appointment_date}` : ""}.`,
          fieldroutes_customer_id: c.customer_id,
          fieldroutes_appointment_id: c.appointment_id,
        };
      });

    if (rows.length === 0) return json({ ok: true, created: 0, skipped: candidates.length, total: candidates.length });

    // 4) Insert. The unique partial index on fieldroutes_appointment_id is the
    //    final guard against a race; ignoreDuplicates makes a concurrent run a no-op.
    const { data: inserted, error: insErr } = await supabase
      .from("reports")
      .upsert(rows, { onConflict: "fieldroutes_appointment_id", ignoreDuplicates: true })
      .select("id");
    if (insErr) return json({ ok: false, error: "insert_failed", detail: insErr.message }, 500);

    const created = inserted?.length ?? 0;
    return json({
      ok: true,
      created,
      skipped: candidates.length - rows.length,
      total: candidates.length,
    });
  } catch (e) {
    console.error("fieldroutes-sync-inspections exception", e);
    return json({ ok: false, error: "exception", detail: String(e) });
  }
});
