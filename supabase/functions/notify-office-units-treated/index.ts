// supabase/functions/notify-office-units-treated
//
// Every time an APARTMENT visit is completed in the Crest portal, email the
// office a short, invoice-ready list: property name, date, every unit treated
// with its service, and the plan/overage math. Purpose: the office needs the
// exact units on every apartment invoice sent from FieldRoutes.
//
// Idempotent per service: stamps report_data.office_units_email_sent_at and
// skips if already present, so re-clicking Complete never double-sends.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const OFFICE_EMAIL = "office@crestpestcontrol.com";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type UnitLine = { unit_number: string; service: string; follow_up_needed?: boolean };
type Overage = {
  totalUnits: number;
  includedUnits: number;
  unitsOver: number;
  overageCost: number;
  billableCost: number;
  waived: boolean;
  perUnitPrice?: number | null;
  baseServicePrice?: number | null;
} | null;

type Body = {
  propertyId?: string;
  serviceId?: string;
  propertyName?: string;
  propertyAddress?: string;
  clientName?: string;
  serviceType?: string;
  serviceDate?: string; // YYYY-MM-DD
  technician?: string;
  units?: UnitLine[];
  overage?: Overage;
};

const json = (status: number, payload: unknown) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const esc = (s: unknown) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const money = (n: number) =>
  `$${(Number(n) || 0).toLocaleString("en-US", {
    minimumFractionDigits: n % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;

const fmtDate = (d?: string) => {
  if (!d) return "";
  const dt = new Date(`${d.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(dt.getTime())) return d;
  return dt.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { ok: false, error: "method_not_allowed" });

  try {
    const body = (await req.json().catch(() => ({}))) as Body;
    const serviceId = String(body.serviceId || "").trim();
    const propertyId = String(body.propertyId || "").trim();
    const units = (Array.isArray(body.units) ? body.units : [])
      .map((u) => ({
        unit_number: String(u?.unit_number || "").trim(),
        service: String(u?.service || "").trim(),
        follow_up_needed: u?.follow_up_needed === true,
      }))
      .filter((u) => u.unit_number);

    if (!serviceId || !propertyId) return json(400, { ok: false, error: "missing_service_or_property" });

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Fetch fresh so the dedupe stamp is merged into current report_data.
    const { data: svc, error: svcErr } = await supabase
      .from("portal_services")
      .select("id, report_data, service_date, service_type, technician")
      .eq("id", serviceId)
      .maybeSingle();
    if (svcErr) return json(500, { ok: false, error: svcErr.message });
    if (!svc) return json(404, { ok: false, error: "service_not_found" });

    const rd = ((svc as any).report_data && typeof (svc as any).report_data === "object")
      ? { ...((svc as any).report_data as Record<string, unknown>) }
      : {};
    if (rd.office_units_email_sent_at) {
      return json(200, { ok: true, skipped: "already_sent", sent_at: rd.office_units_email_sent_at });
    }

    const propertyName = body.propertyName || "Apartment property";
    const serviceDate = body.serviceDate || (svc as any).service_date || "";
    const serviceType = body.serviceType || (svc as any).service_type || "";
    const technician = body.technician || (svc as any).technician || "";
    const ov = body.overage && typeof body.overage === "object" ? body.overage : null;

    const subject = `Units treated — ${propertyName} — ${fmtDate(serviceDate)} (${units.length} unit${units.length === 1 ? "" : "s"})`;

    // Plain-text block first: this is what the office copies onto the invoice.
    const textLines = [
      `${propertyName}${body.propertyAddress ? ` — ${body.propertyAddress}` : ""}`,
      [serviceType, fmtDate(serviceDate), technician].filter(Boolean).join(" • "),
      "",
      ...units.map((u) => `Unit ${u.unit_number}${u.service ? ` — ${u.service}` : ""}`),
    ];
    if (ov && ov.includedUnits > 0) {
      textLines.push("");
      textLines.push(
        `${ov.totalUnits} unit${ov.totalUnits === 1 ? "" : "s"} treated • ${ov.includedUnits} included` +
          (ov.unitsOver > 0
            ? ` • ${ov.unitsOver} over → ${ov.waived ? `${money(ov.overageCost)} WAIVED (do not charge)` : `+${money(ov.overageCost)}`}`
            : " • no overage"),
      );
    }
    const text = textLines.join("\n");

    const unitRowsHtml = units
      .map(
        (u) => `
        <tr>
          <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;font-weight:700;white-space:nowrap;">Unit ${esc(u.unit_number)}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;color:#374151;">${esc(u.service || "")}${u.follow_up_needed ? ' <span style="color:#c2410c;font-weight:600;">• Follow-up needed</span>' : ""}</td>
        </tr>`,
      )
      .join("");

    const overageHtml = ov && ov.includedUnits > 0
      ? `<p style="margin:14px 0 0;padding:10px 12px;border-radius:8px;background:${ov.unitsOver > 0 && !ov.waived ? "#fef3c7" : "#f3f4f6"};font-size:14px;">
           <strong>${ov.totalUnits}</strong> unit${ov.totalUnits === 1 ? "" : "s"} treated • <strong>${ov.includedUnits}</strong> included in plan
           ${ov.unitsOver > 0
             ? ` • <strong>${ov.unitsOver} over</strong> → ${ov.waived
                 ? `<strong>${esc(money(ov.overageCost))} waived — do not charge</strong>`
                 : `<strong>+${esc(money(ov.overageCost))}</strong>${ov.perUnitPrice ? ` (${esc(money(ov.perUnitPrice))}/unit)` : ""}`}`
             : " • no overage"}
         </p>`
      : "";

    const html = `
      <div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:640px;margin:0 auto;color:#111827;">
        <h2 style="margin:0 0 4px;font-size:18px;">${esc(propertyName)}</h2>
        ${body.propertyAddress ? `<p style="margin:0 0 2px;color:#6b7280;font-size:13px;">${esc(body.propertyAddress)}</p>` : ""}
        <p style="margin:0 0 14px;color:#374151;font-size:14px;">${esc([serviceType, fmtDate(serviceDate), technician].filter(Boolean).join(" • "))}</p>
        <p style="margin:0 0 6px;font-size:12px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#4b5563;">Units treated (${units.length})</p>
        <table style="border-collapse:collapse;width:100%;font-size:14px;">${unitRowsHtml || `<tr><td style="padding:6px 10px;color:#6b7280;">No units recorded on this visit.</td></tr>`}</table>
        ${overageHtml}
        <p style="margin:16px 0 4px;font-size:12px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#4b5563;">Copy for the invoice</p>
        <pre style="margin:0;padding:10px 12px;border-radius:8px;background:#f9fafb;border:1px solid #e5e7eb;font-size:13px;white-space:pre-wrap;">${esc(text)}</pre>
        <p style="margin:16px 0 0;color:#9ca3af;font-size:11px;">Sent automatically by the Crest portal when this visit was marked complete.</p>
      </div>`;

    let emailSent = false;
    let emailError: string | null = null;
    if (RESEND_API_KEY) {
      try {
        const r = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_API_KEY}` },
          body: JSON.stringify({
            from: "Crest Pest Control <reports@crestpestco.com>",
            to: [OFFICE_EMAIL],
            subject,
            html,
            text,
          }),
        });
        if (r.ok) emailSent = true;
        else {
          emailError = await r.text();
          console.error("notify-office-units-treated email error:", emailError);
        }
      } catch (e) {
        emailError = String(e);
        console.error("notify-office-units-treated email throw:", e);
      }
    } else {
      emailError = "RESEND_API_KEY not set";
      console.warn("notify-office-units-treated: RESEND_API_KEY not set — skipping email");
    }

    // Only stamp on a real send so a transient Resend failure can be retried
    // by re-completing / re-invoking.
    if (emailSent) {
      const merged = {
        ...rd,
        office_units_email_sent_at: new Date().toISOString(),
        office_units_email_recipient: OFFICE_EMAIL,
        office_units_email_count: units.length,
      };
      const { error: upErr } = await supabase
        .from("portal_services")
        .update({ report_data: merged })
        .eq("id", serviceId);
      if (upErr) console.error("notify-office-units-treated stamp error:", upErr);
    }

    return json(emailSent ? 200 : 502, { ok: emailSent, recipient: OFFICE_EMAIL, units: units.length, error: emailError });
  } catch (e) {
    console.error("notify-office-units-treated fatal:", e);
    return json(500, { ok: false, error: String(e) });
  }
});
