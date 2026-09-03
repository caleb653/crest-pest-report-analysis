import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

/**
 * send-appointment-reminder
 *
 * Relays a property-manager appointment reminder built by the app
 * (src/lib/appointmentReminderEmail.ts) through Resend. The client renders
 * the HTML so the in-app preview is byte-for-byte what the PM receives.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Body {
  to?: string;
  ccEmails?: string[];
  subject?: string;
  html?: string;
  propertyName?: string;
  serviceId?: string;
}

const isValidEmail = (s: unknown): s is string =>
  typeof s === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());

const json = (status: number, payload: Record<string, unknown>) =>
  new Response(JSON.stringify(payload), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = (await req.json().catch(() => ({}))) as Body;
    const to = body.to?.trim();
    const subject = (body.subject || "").trim();
    const html = body.html || "";

    if (!isValidEmail(to)) return json(400, { ok: false, error: "invalid_recipient" });
    if (!subject || subject.length > 300) return json(400, { ok: false, error: "invalid_subject" });
    // Guard rails: must be our template, and not absurdly large.
    if (!html.includes("Upcoming Service Reminder") || html.length > 200_000) {
      return json(400, { ok: false, error: "invalid_html" });
    }
    const cc = Array.isArray(body.ccEmails) ? body.ccEmails.filter(isValidEmail).map((c) => c.trim()) : [];

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) return json(500, { ok: false, error: "email_not_configured" });

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_API_KEY}` },
      body: JSON.stringify({
        from: "Crest Pest Control <reports@crestpestco.com>",
        reply_to: "office@crestpestcontrol.com",
        to: [to],
        ...(cc.length > 0 ? { cc } : {}),
        subject,
        html,
      }),
    });

    if (!res.ok) {
      const detail = await res.text();
      console.error("send-appointment-reminder Resend error:", detail);
      return json(502, { ok: false, error: "resend_error", detail });
    }

    console.log("send-appointment-reminder sent", { to, cc, propertyName: body.propertyName, serviceId: body.serviceId });
    return json(200, { ok: true, sent: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    console.error("send-appointment-reminder error:", e);
    return json(500, { ok: false, error: "server_error", message });
  }
});
