import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const {
      propertyName,
      serviceDate,
      serviceType,
      technician,
      note,
      flaggedBy,
    } = await req.json();

    if (!note || typeof note !== "string" || note.trim().length === 0) {
      return new Response(JSON.stringify({ error: "Note is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) {
      return new Response(JSON.stringify({ error: "Email not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const escape = (s: any) =>
      String(s ?? "").replace(/[&<>"']/g, (c) =>
        ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!)
      );

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 640px;">
        <div style="background:#dc2626;color:#fff;padding:14px 18px;border-radius:8px 8px 0 0;">
          <h2 style="margin:0;font-size:18px;">🚩 Office Flag — Service Appointment</h2>
        </div>
        <div style="border:1px solid #e5e7eb;border-top:0;border-radius:0 0 8px 8px;padding:18px;">
          <table style="border-collapse: collapse; width: 100%; font-size:14px;">
            ${propertyName ? `<tr><td style="padding:6px 0;font-weight:bold;color:#555;width:140px;">Property:</td><td>${escape(propertyName)}</td></tr>` : ""}
            ${serviceDate ? `<tr><td style="padding:6px 0;font-weight:bold;color:#555;">Service Date:</td><td>${escape(serviceDate)}</td></tr>` : ""}
            ${serviceType ? `<tr><td style="padding:6px 0;font-weight:bold;color:#555;">Service:</td><td>${escape(serviceType)}</td></tr>` : ""}
            ${technician ? `<tr><td style="padding:6px 0;font-weight:bold;color:#555;">Technician:</td><td>${escape(technician)}</td></tr>` : ""}
            ${flaggedBy ? `<tr><td style="padding:6px 0;font-weight:bold;color:#555;">Flagged By:</td><td>${escape(flaggedBy)}</td></tr>` : ""}
          </table>
          <div style="margin-top:16px;padding:14px;background:#fef2f2;border-left:4px solid #dc2626;border-radius:4px;">
            <p style="margin:0 0 6px 0;font-weight:bold;color:#991b1b;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;">Office Notes</p>
            <p style="margin:0;white-space:pre-wrap;color:#111;line-height:1.5;">${escape(note)}</p>
          </div>
          <p style="margin-top:18px;font-size:12px;color:#888;">Flagged from the Crest Pest Control Client Portal admin.</p>
        </div>
      </div>
    `;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "Crest Pest Control Portal <onboarding@resend.dev>",
        to: ["office@crestpestcontrol.com"],
        subject: `🚩 Office Flag${propertyName ? ` — ${propertyName}` : ""}${serviceDate ? ` (${serviceDate})` : ""}`,
        html,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("Resend error:", errText);
      return new Response(JSON.stringify({ error: "Failed to send email", details: errText }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("flag-office-note error:", e);
    return new Response(JSON.stringify({ error: e?.message || "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});