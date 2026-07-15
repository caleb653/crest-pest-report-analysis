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
    const { senderName, senderEmail, propertyName, subject, message } = await req.json();

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) {
      console.error("RESEND_API_KEY not configured");
      // Non-fatal: portal notifications are best-effort. Returning 200 keeps
      // the client UI from surfacing a runtime error when email isn't set up.
      return new Response(JSON.stringify({ skipped: true, reason: "email_not_configured" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const htmlBody = `
      <div style="font-family: Arial, sans-serif; max-width: 600px;">
        <h2 style="color: #333;">New Client Portal Message</h2>
        <table style="border-collapse: collapse; width: 100%;">
          <tr><td style="padding: 8px; font-weight: bold; color: #555;">From:</td><td style="padding: 8px;">${senderName}${senderEmail ? ` (${senderEmail})` : ''}</td></tr>
          ${propertyName ? `<tr><td style="padding: 8px; font-weight: bold; color: #555;">Property:</td><td style="padding: 8px;">${propertyName}</td></tr>` : ''}
          <tr><td style="padding: 8px; font-weight: bold; color: #555;">Subject:</td><td style="padding: 8px;">${subject}</td></tr>
        </table>
        <div style="margin-top: 16px; padding: 16px; background: #f5f5f5; border-radius: 8px;">
          <p style="margin: 0; white-space: pre-wrap;">${message}</p>
        </div>
        <p style="margin-top: 16px; font-size: 12px; color: #999;">This message was sent from the Crest Pest Control Client Portal.</p>
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
        subject: `Portal Message: ${subject}`,
        html: htmlBody,
        reply_to: senderEmail || undefined,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("Resend error:", errText);
      // Non-fatal: don't block portal actions (conditions, sightings, etc.)
      // when the email provider rejects the message.
      return new Response(JSON.stringify({ skipped: true, reason: "resend_error", detail: errText }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Error:", e);
    return new Response(JSON.stringify({ skipped: true, reason: "exception", detail: e.message }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
