import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Carmen handles billing — she is the sole recipient of overage alerts.
const CARMEN = {
  username: "clopez",
  fullName: "Carmen Lopez",
  email: "clopez@crestpestcontrol.com",
};

interface Body {
  /**
   * Omitted = normal "units over the cap" alert.
   * "waived"   = admin waived the charge for this visit → tell Carmen NOT to bill it.
   * "unwaived" = admin undid the waiver → charge is back on.
   * Both only email when a prior overage alert was sent for the service.
   */
  action?: "waived" | "unwaived";
  propertyId?: string;
  serviceId?: string;
  serviceDate?: string | null;
  /** Merged "units to be treated" count for the upcoming visit (client computes via upcomingUnits.ts). */
  totalUnits?: number;
  unitNumbers?: string[];
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
   .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const money = (n: number) =>
  `$${(Math.round(n * 100) / 100).toLocaleString(undefined, {
    minimumFractionDigits: n % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;

const prettyDate = (iso: string | null | undefined): string => {
  if (!iso) return "the next visit";
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
};

const json = (status: number, payload: Record<string, unknown>) =>
  new Response(JSON.stringify(payload), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = (await req.json().catch(() => ({}))) as Body;
    const propertyId = body.propertyId;
    const serviceId = body.serviceId;

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // ─── Waiver notice: admin waived / reinstated the charge for one visit ───
    if (body.action === "waived" || body.action === "unwaived") {
      if (!propertyId || !serviceId) return json(400, { ok: false, error: "missing_or_invalid_fields" });
      const [{ data: wProp }, { data: wSvc }] = await Promise.all([
        supabase.from("portal_properties").select("id, name, address").eq("id", propertyId).maybeSingle(),
        supabase.from("portal_services").select("id, property_id, service_date, report_data").eq("id", serviceId).maybeSingle(),
      ]);
      if (!wProp || !wSvc || wSvc.property_id !== propertyId) return json(404, { ok: false, error: "service_not_found" });
      const alert = (wSvc as any)?.report_data?.overage_alert;
      // Carmen was never told to charge for this visit → nothing to retract.
      if (!alert) return json(200, { ok: true, sent: false, reason: "no_prior_alert" });

      const waived = body.action === "waived";
      const name = wProp.name || "Unknown property";
      const visitDate = prettyDate((wSvc.service_date as string | null) || alert.service_date || null);
      const over = Number(alert.units_over) || 0;
      const cost = Number(alert.overage_cost) || 0;
      const unitsText = `${over} extra unit${over === 1 ? "" : "s"}`;
      const subject = waived
        ? `Overage WAIVED — ${name} — do NOT charge for ${unitsText}`
        : `Overage reinstated — ${name} — charge for ${unitsText}`;
      const lead = waived
        ? `The unit overage for ${name}'s visit on ${visitDate} has been waived in the Crest App. Please do <strong>not</strong> charge the ${unitsText}${cost > 0 ? ` (${money(cost)})` : ""} from the earlier alert.`
        : `The waiver on ${name}'s visit on ${visitDate} was undone. Please charge the ${unitsText}${cost > 0 ? ` (${money(cost)})` : ""} as in the original alert.`;
      const html = `
        <div style="font-family:Arial,sans-serif;max-width:600px;">
          <h2 style="color:#2A2A2A;margin:0 0 12px;">${waived ? "Unit Overage Waived" : "Unit Overage Reinstated"}</h2>
          <p style="font-size:14px;margin:0 0 12px;">${lead}</p>
          <p style="font-size:14px;margin:0 0 4px;"><strong>Property:</strong> ${escapeHtml(name)}${wProp.address ? ` — ${escapeHtml(wProp.address)}` : ""}</p>
          <p style="font-size:14px;margin:0 0 4px;"><strong>Visit date:</strong> ${escapeHtml(visitDate)}</p>
          <p style="margin-top:14px;font-size:12px;color:#888;">Changed in the Crest App → Portal Admin.</p>
        </div>`;
      let emailSent = false;
      if (RESEND_API_KEY) {
        try {
          const r = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_API_KEY}` },
            body: JSON.stringify({ from: "Crest Pest Control <reports@crestpestco.com>", to: [CARMEN.email], subject, html }),
          });
          if (r.ok) emailSent = true; else console.error("notify-unit-overage waiver email error:", await r.text());
        } catch (e) { console.error("notify-unit-overage waiver email throw:", e); }
      }
      await supabase.from("notifications").insert({
        recipient_username: CARMEN.username,
        recipient_name: CARMEN.fullName,
        title: subject,
        body: waived ? `Do not charge the ${unitsText} for ${visitDate}.` : `Charge the ${unitsText} for ${visitDate} after all.`,
        link: "/portal-admin",
        notification_type: "unit_overage",
        related_property_id: propertyId,
      });
      return json(200, { ok: true, sent: emailSent, action: body.action });
    }

    const totalUnits = Math.floor(Number(body.totalUnits));
    if (!propertyId || !serviceId || !Number.isFinite(totalUnits) || totalUnits <= 0) {
      return json(400, { ok: false, error: "missing_or_invalid_fields" });
    }

    const { data: prop, error: propErr } = await supabase
      .from("portal_properties")
      .select("id, name, address, customer_preferences")
      .eq("id", propertyId)
      .maybeSingle();
    if (propErr || !prop) return json(404, { ok: false, error: "property_not_found" });

    // Overage billing alerts are an APARTMENT-portal feature only.
    const propType = (prop as any)?.customer_preferences?.property_type;
    if (propType === "hoa" || propType === "commercial") {
      return json(200, { ok: true, sent: false, reason: "not_apartment" });
    }

    // Plan config lives on customer_preferences (same fields unitOverage.ts reads).
    const cp: any = (prop as any).customer_preferences || {};
    const includedUnits = Number(cp.included_units);
    const pricePerUnit = Number(cp.overage_price_per_unit);
    if (!Number.isFinite(includedUnits) || includedUnits <= 0) {
      return json(200, { ok: true, sent: false, reason: "no_plan_configured" });
    }

    const unitsOver = totalUnits - includedUnits;
    if (unitsOver <= 0) return json(200, { ok: true, sent: false, reason: "no_overage" });
    const overageCost = Number.isFinite(pricePerUnit) && pricePerUnit > 0
      ? unitsOver * pricePerUnit
      : 0;

    // The service row is both the validation anchor and the dedupe marker:
    // we only re-notify when the scheduled unit count GROWS past what Carmen
    // was last told, so adding a 3rd/4th/5th unit past the cap each sends an
    // updated email, but re-renders and page reloads never re-send the same one.
    const { data: svc, error: svcErr } = await supabase
      .from("portal_services")
      .select("id, property_id, service_date, report_data")
      .eq("id", serviceId)
      .maybeSingle();
    if (svcErr || !svc || svc.property_id !== propertyId) {
      return json(404, { ok: false, error: "service_not_found" });
    }
    // Admin waived the charge for this visit — don't tell Carmen to bill it.
    if ((svc as any)?.report_data?.overage_waived === true) {
      return json(200, { ok: true, sent: false, reason: "waived" });
    }
    const prevAlert = (svc as any)?.report_data?.overage_alert;
    if (prevAlert && Number(prevAlert.total_units) >= totalUnits) {
      return json(200, { ok: true, sent: false, reason: "already_notified" });
    }

    const propertyName = prop.name || "Unknown property";
    const serviceDate = (svc.service_date as string | null) || body.serviceDate || null;
    const visitDate = prettyDate(serviceDate);
    const unitList = Array.isArray(body.unitNumbers)
      ? body.unitNumbers.map((u) => String(u).trim()).filter(Boolean)
      : [];

    const chargeLine = overageCost > 0
      ? `Please charge them for the ${unitsOver} additional unit${unitsOver === 1 ? "" : "s"} at ${money(pricePerUnit)} per unit — ${money(overageCost)} total.`
      : `Please charge them for the ${unitsOver} additional unit${unitsOver === 1 ? "" : "s"} (no per-unit overage price is configured for this property — set one in Portal Admin).`;

    const subject = `Unit Overage — ${propertyName} — charge for ${unitsOver} extra unit${unitsOver === 1 ? "" : "s"}`;
    const row = (label: string, value: string, bold = false) =>
      `<tr><td style="padding:6px 8px;font-weight:600;color:#555;">${label}</td><td style="padding:6px 8px;${bold ? "font-weight:700;" : ""}">${value}</td></tr>`;
    const htmlBody = `
      <div style="font-family:Arial,sans-serif;max-width:600px;">
        <h2 style="color:#2A2A2A;margin:0 0 12px;">Unit Overage — Billing Action Needed</h2>
        <p style="font-size:14px;margin:0 0 12px;">
          ${escapeHtml(propertyName)} has more units scheduled for the upcoming visit than their plan includes for free.
          ${escapeHtml(chargeLine)}
        </p>
        <table style="border-collapse:collapse;width:100%;font-size:14px;">
          ${row("Property:", escapeHtml(propertyName))}
          ${prop.address ? row("Address:", escapeHtml(prop.address)) : ""}
          ${row("Visit date:", escapeHtml(visitDate))}
          ${row("Units scheduled:", `${totalUnits}${unitList.length ? ` (${escapeHtml(unitList.join(", "))})` : ""}`)}
          ${row("Included per visit:", String(includedUnits))}
          ${row("Units over:", String(unitsOver), true)}
          ${overageCost > 0 ? row("Price per extra unit:", money(pricePerUnit)) : ""}
          ${overageCost > 0 ? row("Amount to charge:", money(overageCost), true) : ""}
        </table>
        <p style="margin-top:14px;font-size:12px;color:#888;">
          You'll get an updated email if more units are added to this visit. View details in the Crest App → Portal Admin.
        </p>
      </div>
    `;

    let emailSent = false;
    if (RESEND_API_KEY) {
      try {
        const emailRes = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_API_KEY}` },
          body: JSON.stringify({
            from: "Crest Pest Control <reports@crestpestco.com>",
            to: [CARMEN.email],
            subject,
            html: htmlBody,
          }),
        });
        if (emailRes.ok) emailSent = true;
        else console.error("notify-unit-overage email error:", await emailRes.text());
      } catch (e) {
        console.error("notify-unit-overage email throw:", e);
      }
    } else {
      console.warn("notify-unit-overage: RESEND_API_KEY not set — skipping email");
    }

    // In-app notification so the alert also shows in Carmen's bell.
    const { error: notifErr } = await supabase.from("notifications").insert({
      recipient_username: CARMEN.username,
      recipient_name: CARMEN.fullName,
      title: subject,
      body: `${totalUnits} units scheduled (${includedUnits} included) — ${unitsOver} over${overageCost > 0 ? ` = ${money(overageCost)} to charge` : ""}`,
      link: "/portal-admin",
      notification_type: "unit_overage",
      related_property_id: propertyId,
    });
    if (notifErr) console.error("notify-unit-overage notification insert error:", notifErr);

    // Persist the dedupe marker (merged so we never clobber other report_data).
    const mergedReportData = {
      ...(((svc as any).report_data as Record<string, unknown>) || {}),
      overage_alert: {
        total_units: totalUnits,
        included_units: includedUnits,
        units_over: unitsOver,
        price_per_unit: Number.isFinite(pricePerUnit) && pricePerUnit > 0 ? pricePerUnit : 0,
        overage_cost: overageCost,
        service_date: serviceDate,
        notified_at: new Date().toISOString(),
      },
    };
    const { error: updErr } = await supabase
      .from("portal_services")
      .update({ report_data: mergedReportData })
      .eq("id", serviceId);
    if (updErr) console.error("notify-unit-overage marker update error:", updErr);

    return json(200, { ok: true, sent: emailSent, unitsOver, overageCost });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    console.error("notify-unit-overage error:", e);
    return json(500, { ok: false, error: "server_error", message });
  }
});
