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
  surveyId: string;
  appBaseUrl?: string;
}

const isEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    if (!RESEND_API_KEY) {
      return new Response(JSON.stringify({ ok: false, error: "missing_resend_key" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = (await req.json().catch(() => ({}))) as Body;
    const { surveyId, appBaseUrl } = body;
    if (!surveyId) {
      return new Response(JSON.stringify({ ok: false, error: "missing_survey_id" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: survey, error: sErr } = await supabase
      .from("portal_surveys")
      .select("*")
      .eq("id", surveyId)
      .maybeSingle();

    if (sErr || !survey) {
      return new Response(JSON.stringify({ ok: false, error: "survey_not_found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const recipients = Array.isArray(survey.recipient_emails) ? (survey.recipient_emails as string[]) : [];
    const cleanRecipients = Array.from(new Set(
      recipients.map((e) => (e || "").trim().toLowerCase()).filter((e) => isEmail(e))
    )).slice(0, 500);

    if (cleanRecipients.length === 0) {
      return new Response(JSON.stringify({ ok: false, error: "no_valid_recipients" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: prop } = await supabase
      .from("portal_properties")
      .select("name, address")
      .eq("id", survey.property_id)
      .maybeSingle();

    const propertyName = prop?.name || "your property";
    const baseUrl = appBaseUrl || "https://crestpestco.com";

    let sent = 0;
    const errors: string[] = [];

    for (const email of cleanRecipients) {
      // One response row per recipient, with unique signing token
      const { data: respRow, error: rErr } = await supabase
        .from("portal_survey_responses")
        .insert({
          survey_id: survey.id,
          property_id: survey.property_id,
          recipient_email: email,
        })
        .select("token")
        .maybeSingle();

      if (rErr || !respRow?.token) {
        errors.push(`${email}: token_create_failed`);
        continue;
      }

      const surveyUrl = `${baseUrl}/survey/${respRow.token}`;

      const html = `
<!DOCTYPE html>
<html><head><meta charset="utf-8" /></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin:0; padding:20px; background:#f5f5f5;">
  <div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
    <div style="background:#2A2A2A;padding:20px;text-align:center;">
      <h1 style="color:#ffffff;margin:0;font-size:18px;">Quick Pest Activity Survey</h1>
      <p style="color:#cfd6d0;margin:6px 0 0;font-size:13px;">${propertyName}</p>
    </div>
    <div style="padding:24px;color:#333;">
      <p style="margin:0 0 14px;">Hi there,</p>
      <p style="margin:0 0 14px;">${(survey.intro as string) || "Crest Pest Control is checking in. Please take 30 seconds to answer a quick survey about pest activity in your unit. Your feedback helps us serve you better."}</p>
      <div style="text-align:center;margin:22px 0;">
        <a href="${surveyUrl}" style="display:inline-block;background:#95A197;color:#fff;padding:14px 24px;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px;">Take the Survey</a>
      </div>
      <p style="margin:14px 0 0;font-size:12px;color:#888;">This link is unique to you. Your responses go directly to property management and Crest Pest Control.</p>
      <p style="margin:14px 0 0;font-size:13px;color:#333;">— The Crest Pest Control Team</p>
    </div>
    <div style="background:#f9fafb;padding:14px;text-align:center;border-top:1px solid #e5e7eb;">
      <p style="margin:0;font-size:12px;color:#6b7280;">Crest Pest Control • (949) 424-5000</p>
    </div>
  </div>
</body></html>`;

      const subject = `Quick pest survey — ${propertyName}`;

      const emailRes = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_API_KEY}` },
        body: JSON.stringify({
          from: "Crest Pest Control <reports@crestpestco.com>",
          to: [email],
          subject,
          html,
        }),
      });

      if (emailRes.ok) {
        sent++;
      } else {
        const txt = await emailRes.text();
        console.error("Resend error for", email, txt);
        errors.push(`${email}: send_failed`);
      }
    }

    await supabase
      .from("portal_surveys")
      .update({ sent_count: sent, sent_at: new Date().toISOString() })
      .eq("id", surveyId);

    return new Response(JSON.stringify({ ok: true, sent, errors }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    console.error("send-tenant-survey error:", e);
    return new Response(JSON.stringify({ ok: false, error: "server_error", message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});