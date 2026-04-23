import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Body {
  requestId: string;
  appBaseUrl?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    if (!RESEND_API_KEY) {
      return new Response(JSON.stringify({ ok: false, error: "missing_resend_key" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = (await req.json().catch(() => ({}))) as Body;
    const { requestId, appBaseUrl } = body;
    if (!requestId) {
      return new Response(JSON.stringify({ ok: false, error: "missing_request_id" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: reqRow, error: reqErr } = await supabase
      .from("portal_requests")
      .select("*")
      .eq("id", requestId)
      .maybeSingle();

    if (reqErr || !reqRow) {
      return new Response(JSON.stringify({ ok: false, error: "request_not_found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const tenantEmail = (reqRow as any).tenant_email as string | null;
    if (!tenantEmail) {
      return new Response(JSON.stringify({ ok: false, error: "missing_tenant_email" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const [{ data: prop }, prepRes] = await Promise.all([
      supabase.from("portal_properties").select("name, address").eq("id", reqRow.property_id).maybeSingle(),
      (reqRow as any).prep_sheet_id
        ? supabase.from("portal_prep_sheets").select("title, file_url, description").eq("id", (reqRow as any).prep_sheet_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    const prep = (prepRes as any).data as { title: string; file_url: string | null; description: string | null } | null;

    const propertyName = prop?.name || "your property";
    const unitLabel = reqRow.unit_number ? `Unit ${reqRow.unit_number}` : "your unit";
    const baseUrl = appBaseUrl || "https://crestpestco.com";
    const rttUrl = (reqRow as any).right_to_treat_token
      ? `${baseUrl}/right-to-treat/${(reqRow as any).right_to_treat_token}`
      : null;

    const showRtt = !!(reqRow as any).right_to_treat_requested && rttUrl;

    const escapeHtml = (s: string) =>
      s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
    const formatMultiline = (s: string) => escapeHtml(s).replace(/\r\n|\r|\n/g, "<br>");

    const html = `
<!DOCTYPE html>
<html><head><meta charset="utf-8" /></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin:0; padding:20px; background:#f5f5f5;">
  <div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
    <div style="background:#2A2A2A;padding:20px;text-align:center;">
      <h1 style="color:#ffffff;margin:0;font-size:18px;">Upcoming Pest Service — ${propertyName}</h1>
    </div>
    <div style="padding:24px;color:#333;">
      <p style="margin:0 0 14px;">Hi there,</p>
      <p style="margin:0 0 14px;">Crest Pest Control has been scheduled to service <strong>${unitLabel}</strong> at <strong>${propertyName}</strong>.</p>
      ${reqRow.pest_type ? `<p style="margin:0 0 14px;"><strong>Reason:</strong> ${reqRow.pest_type}${reqRow.location_type ? ` (${reqRow.location_type})` : ""}</p>` : ""}
      ${reqRow.preferred_date ? `<p style="margin:0 0 14px;"><strong>Preferred date:</strong> ${reqRow.preferred_date}</p>` : ""}

      ${prep ? `
      <div style="margin:18px 0;padding:14px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;">
        <p style="margin:0 0 6px;font-weight:600;">Prep Sheet: ${prep.title}</p>
        ${prep.description ? `<div style="margin:0 0 10px;font-size:13px;color:#555;line-height:1.55;white-space:pre-wrap;">${formatMultiline(prep.description)}</div>` : ""}
        ${prep.file_url ? `<a href="${prep.file_url}" style="display:inline-block;background:#95A197;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;font-weight:600;font-size:13px;">View Prep Sheet</a>` : ""}
      </div>` : ""}

      ${showRtt ? `
      <div style="margin:18px 0;padding:16px;background:#fff8e1;border:1px solid #f0c674;border-radius:8px;">
        <p style="margin:0 0 8px;font-weight:600;color:#5a4a00;">Authorize Treatment</p>
        <p style="margin:0 0 12px;font-size:13px;color:#5a4a00;">We need your permission to treat your unit. Please review and sign:</p>
        <a href="${rttUrl}" style="display:inline-block;background:#2A2A2A;color:#fff;padding:12px 18px;border-radius:6px;text-decoration:none;font-weight:600;">Sign Right to Treat</a>
      </div>` : ""}

      <p style="margin:14px 0 0;font-size:13px;color:#666;">Questions? Call us at (949) 424-5000.</p>
      <p style="margin:14px 0 0;font-size:13px;color:#333;">— The Crest Pest Control Team</p>
    </div>
    <div style="background:#f9fafb;padding:14px;text-align:center;border-top:1px solid #e5e7eb;">
      <p style="margin:0;font-size:12px;color:#6b7280;">Crest Pest Control • (949) 424-5000</p>
    </div>
  </div>
</body></html>`;

    const subject = `Upcoming Pest Service — ${propertyName}${reqRow.unit_number ? ` (Unit ${reqRow.unit_number})` : ""}`;

    const emailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_API_KEY}` },
      body: JSON.stringify({
        from: "Crest Pest Control <reports@crestpestco.com>",
        to: [tenantEmail],
        subject,
        html,
      }),
    });

    if (!emailRes.ok) {
      const txt = await emailRes.text();
      console.error("Resend error:", txt);
      return new Response(JSON.stringify({ ok: false, error: "send_failed", message: txt }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await supabase.from("portal_requests")
      .update({ tenant_email_sent_at: new Date().toISOString() })
      .eq("id", requestId);

    return new Response(JSON.stringify({ ok: true }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    console.error("send-tenant-work-order error:", e);
    return new Response(JSON.stringify({ ok: false, error: "server_error", message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});