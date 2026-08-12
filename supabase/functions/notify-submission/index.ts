import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const OFFICE_EMAIL = "office@crestpestcontrol.com";
const CARMEN_FULL_NAME = "Carmen Lopez";

/** Mirror of src/lib/staffRoster.ts so we can resolve owner email server-side. */
const STAFF: { username: string; fullName: string; email: string }[] = [
  { username: "dtanner",   fullName: "Darrell Tanner",  email: "dtanner@crestpestcontrol.com" },
  { username: "jake",      fullName: "Jake Shubin",     email: "jake@crestpestcontrol.com" },
  { username: "caleb",     fullName: "Caleb Whalen",    email: "caleb@crestpestcontrol.com" },
  { username: "jlatham",   fullName: "Jackson Latham",  email: "jlatham@crestpestcontrol.com" },
  { username: "dgallegos", fullName: "Dylan Gallegos",  email: "dgallegos@crestpestcontrol.com" },
  { username: "mmuniz",    fullName: "Michael Muniz",   email: "mmuniz@crestpestcontrol.com" },
  { username: "clopez",    fullName: "Carmen Lopez",    email: "clopez@crestpestcontrol.com" },
  { username: "dlongoria", fullName: "David Longoria",  email: "dlongoria@crestpestcontrol.com" },
  { username: "nstovall", fullName: "Nick Stovall",    email: "nstovall@crestpestcontrol.com" },
  { username: "ccarnival", fullName: "Cade Carnival",  email: "ccarnival@crestpestcontrol.com" },
  { username: "blyttle",   fullName: "Brock Lyttle",   email: "blyttle@crestpestcontrol.com" },
];
const findStaffByName = (n?: string | null) => STAFF.find(s => s.fullName === n) || null;

interface Body {
  kind: "work_order" | "message";
  requestId?: string;        // for kind=work_order
  messageId?: string;        // for kind=message
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
   .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = (await req.json().catch(() => ({}))) as Body;
    if (!body.kind) {
      return new Response(JSON.stringify({ ok: false, error: "missing_kind" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    let subject = "";
    let htmlBody = "";
    let plainSummary = "";
    let propertyId: string | null = null;
    let propertyName = "Unknown property";
    let ownerTech: string | null = null;
    let relatedRequestId: string | null = null;
    let relatedMessageId: string | null = null;
    // Property Point of Contact email — when set, gets CC'd on work order
    // notifications so the PM is always in the loop.
    let pmPocEmail: string | null = null;
    // APARTMENT portals no longer ping Carmen for every unit added — she only
    // receives the dedicated unit-overage billing email (notify-unit-overage).
    // HOA/commercial submissions, general (no-unit) requests, and client
    // messages still include her.
    let skipCarmen = false;

    if (body.kind === "work_order") {
      if (!body.requestId) {
        return new Response(JSON.stringify({ ok: false, error: "missing_request_id" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: reqRow, error: reqErr } = await supabase
        .from("portal_requests").select("*").eq("id", body.requestId).maybeSingle();
      if (reqErr || !reqRow) {
        return new Response(JSON.stringify({ ok: false, error: "request_not_found" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      propertyId = reqRow.property_id;
      relatedRequestId = reqRow.id;

      const { data: prop } = await supabase
        .from("portal_properties").select("name, owner_tech, address, customer_preferences")
        .eq("id", reqRow.property_id).maybeSingle();
      if (prop) {
        propertyName = prop.name || propertyName;
        ownerTech = (prop as any).owner_tech || null;
      }

      // Capture the property's Point of Contact email so we can CC the PM
      // any time a tenant (or PM) submits a work order. The office still
      // receives every notification — this just keeps the PM in the loop.
      const pocEmail = (prop as any)?.customer_preferences?.point_of_contact?.email as string | undefined;
      if (pocEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(pocEmail)) {
        pmPocEmail = pocEmail.trim();
      }

      // Apartments are the default property type when none is set (mirrors
      // getPropertyType in src/pages/PortalAdmin.tsx).
      const propType = (prop as any)?.customer_preferences?.property_type;
      const isApartment = propType !== "hoa" && propType !== "commercial";
      const isGeneralReq =
        !reqRow.unit_number ||
        String(reqRow.request_type || "").toLowerCase().includes("general");
      skipCarmen = isApartment && !isGeneralReq;

      subject = `New Work Order — ${propertyName}${reqRow.unit_number ? ` (Unit ${reqRow.unit_number})` : ""}`;
      plainSummary = `${reqRow.request_type} — ${reqRow.pest_type || "General"} • Unit ${reqRow.unit_number || "—"}`;

      htmlBody = `
        <div style="font-family:Arial,sans-serif;max-width:600px;">
          <h2 style="color:#2A2A2A;margin:0 0 12px;">New Work Order Submitted</h2>
          <table style="border-collapse:collapse;width:100%;font-size:14px;">
            <tr><td style="padding:6px 8px;font-weight:600;color:#555;">Property:</td><td style="padding:6px 8px;">${escapeHtml(propertyName)}</td></tr>
            ${prop?.address ? `<tr><td style="padding:6px 8px;font-weight:600;color:#555;">Address:</td><td style="padding:6px 8px;">${escapeHtml(prop.address)}</td></tr>` : ""}
            <tr><td style="padding:6px 8px;font-weight:600;color:#555;">Unit / Area:</td><td style="padding:6px 8px;">${escapeHtml(reqRow.unit_number || "—")}</td></tr>
            <tr><td style="padding:6px 8px;font-weight:600;color:#555;">Type:</td><td style="padding:6px 8px;">${escapeHtml(reqRow.request_type)}</td></tr>
            ${reqRow.pest_type ? `<tr><td style="padding:6px 8px;font-weight:600;color:#555;">Pest:</td><td style="padding:6px 8px;">${escapeHtml(reqRow.pest_type)}${reqRow.location_type ? ` (${escapeHtml(reqRow.location_type)})` : ""}</td></tr>` : ""}
            ${reqRow.tenant_email ? `<tr><td style="padding:6px 8px;font-weight:600;color:#555;">Contact email:</td><td style="padding:6px 8px;">${escapeHtml(reqRow.tenant_email)}</td></tr>` : ""}
            ${ownerTech ? `<tr><td style="padding:6px 8px;font-weight:600;color:#555;">Client owner:</td><td style="padding:6px 8px;">${escapeHtml(ownerTech)}</td></tr>` : ""}
          </table>
          <div style="margin-top:14px;padding:12px;background:#f5f5f5;border-radius:6px;font-size:13px;white-space:pre-wrap;">
            ${escapeHtml(reqRow.description || "")}
          </div>
          <p style="margin-top:14px;font-size:12px;color:#888;">View it in the Crest App → Portal Admin.</p>
        </div>
      `;
    } else if (body.kind === "message") {
      if (!body.messageId) {
        return new Response(JSON.stringify({ ok: false, error: "missing_message_id" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: msg, error: msgErr } = await supabase
        .from("portal_messages").select("*").eq("id", body.messageId).maybeSingle();
      if (msgErr || !msg) {
        return new Response(JSON.stringify({ ok: false, error: "message_not_found" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      relatedMessageId = msg.id;
      // Try to find an associated property via the client_id
      if (msg.client_id) {
        const { data: props } = await supabase
          .from("portal_properties").select("id, name, owner_tech")
          .eq("client_id", msg.client_id);
        if (props && props.length > 0) {
          // Use the first property with an owner_tech, otherwise the first property
          const withOwner = props.find((p: any) => p.owner_tech) || props[0];
          propertyId = withOwner.id;
          propertyName = withOwner.name || msg.property_name || propertyName;
          ownerTech = (withOwner as any).owner_tech || null;
        }
      }
      if (!propertyName || propertyName === "Unknown property") {
        propertyName = msg.property_name || "Unknown property";
      }

      subject = `New Message — ${msg.sender_name}`;
      plainSummary = `${msg.subject}: ${(msg.message || "").slice(0, 120)}`;
      htmlBody = `
        <div style="font-family:Arial,sans-serif;max-width:600px;">
          <h2 style="color:#2A2A2A;margin:0 0 12px;">New Client Message</h2>
          <table style="border-collapse:collapse;width:100%;font-size:14px;">
            <tr><td style="padding:6px 8px;font-weight:600;color:#555;">From:</td><td style="padding:6px 8px;">${escapeHtml(msg.sender_name)}${msg.sender_email ? ` (${escapeHtml(msg.sender_email)})` : ""}</td></tr>
            ${propertyName ? `<tr><td style="padding:6px 8px;font-weight:600;color:#555;">Property:</td><td style="padding:6px 8px;">${escapeHtml(propertyName)}</td></tr>` : ""}
            <tr><td style="padding:6px 8px;font-weight:600;color:#555;">Subject:</td><td style="padding:6px 8px;">${escapeHtml(msg.subject)}</td></tr>
            ${ownerTech ? `<tr><td style="padding:6px 8px;font-weight:600;color:#555;">Client owner:</td><td style="padding:6px 8px;">${escapeHtml(ownerTech)}</td></tr>` : ""}
          </table>
          <div style="margin-top:14px;padding:12px;background:#f5f5f5;border-radius:6px;font-size:13px;white-space:pre-wrap;">
            ${escapeHtml(msg.message || "")}
          </div>
        </div>
      `;
    } else {
      return new Response(JSON.stringify({ ok: false, error: "unknown_kind" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Resolve recipient list ──
    const ownerStaff = findStaffByName(ownerTech);
    const carmenStaff = findStaffByName(CARMEN_FULL_NAME);
    const recipients = new Set<string>([OFFICE_EMAIL]);
    if (carmenStaff?.email && !skipCarmen) recipients.add(carmenStaff.email);
    if (ownerStaff?.email) recipients.add(ownerStaff.email);
    // CC the property's Point of Contact (PM) on work order emails so the PM
    // always sees what tenants submit, alongside the office.
    if (pmPocEmail) recipients.add(pmPocEmail);

    // ── Send email ──
    if (RESEND_API_KEY) {
      try {
        const emailRes = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_API_KEY}` },
          body: JSON.stringify({
            from: "Crest Pest Control <reports@crestpestco.com>",
            to: Array.from(recipients),
            subject,
            html: htmlBody,
          }),
        });
        if (!emailRes.ok) {
          const txt = await emailRes.text();
          console.error("notify-submission email error:", txt);
        }
      } catch (e) {
        console.error("notify-submission email throw:", e);
      }
    } else {
      console.warn("notify-submission: RESEND_API_KEY not set — skipping email");
    }

    // ── Insert in-app notifications ──
    const notifRows: any[] = [];
    const link = "/portal-admin";
    const notifType = body.kind;

    // Notify Carmen (except apartment unit work orders — she only gets the
    // unit-overage billing email for those)
    if (carmenStaff && !skipCarmen) {
      notifRows.push({
        recipient_username: carmenStaff.username,
        recipient_name: carmenStaff.fullName,
        title: subject,
        body: plainSummary,
        link,
        notification_type: notifType,
        related_property_id: propertyId,
        related_request_id: relatedRequestId,
        related_message_id: relatedMessageId,
      });
    }
    // Notify owner if different from Carmen
    if (ownerStaff && ownerStaff.username !== carmenStaff?.username) {
      notifRows.push({
        recipient_username: ownerStaff.username,
        recipient_name: ownerStaff.fullName,
        title: subject,
        body: plainSummary,
        link,
        notification_type: notifType,
        related_property_id: propertyId,
        related_request_id: relatedRequestId,
        related_message_id: relatedMessageId,
      });
    }

    if (notifRows.length > 0) {
      const { error: notifErr } = await supabase.from("notifications").insert(notifRows);
      if (notifErr) console.error("notification insert error:", notifErr);
    }

    return new Response(JSON.stringify({ ok: true, recipients: Array.from(recipients) }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    console.error("notify-submission error:", e);
    return new Response(JSON.stringify({ ok: false, error: "server_error", message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});