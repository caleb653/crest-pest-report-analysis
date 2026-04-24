import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CALEB_EMAIL = "caleb@crestpestcontrol.com";
const CALEB_USERNAME = "caleb";
const CALEB_FULL_NAME = "Caleb Whalen";
const OFFICE_EMAIL = "office@crestpestcontrol.com";

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
   .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const documentId = body.documentId as string | undefined;
    if (!documentId) {
      return new Response(JSON.stringify({ ok: false, error: "missing_document_id" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: doc, error } = await supabase
      .from("team_documents").select("*").eq("id", documentId).maybeSingle();
    if (error || !doc) {
      return new Response(JSON.stringify({ ok: false, error: "not_found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const empName = doc.employee_name || "Unknown employee";
    const subject = `New Meal Period Waiver — ${empName}`;
    const summary = `${empName}${doc.job_title ? ` (${doc.job_title})` : ""}${doc.work_location ? ` • ${doc.work_location}` : ""}`;

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:600px;">
        <h2 style="color:#2A2A2A;margin:0 0 12px;">New Meal Period Waiver Submitted</h2>
        <table style="border-collapse:collapse;width:100%;font-size:14px;">
          <tr><td style="padding:6px 8px;font-weight:600;color:#555;">Employee:</td><td style="padding:6px 8px;">${escapeHtml(empName)}</td></tr>
          ${doc.job_title ? `<tr><td style="padding:6px 8px;font-weight:600;color:#555;">Job title:</td><td style="padding:6px 8px;">${escapeHtml(doc.job_title)}</td></tr>` : ""}
          ${doc.work_location ? `<tr><td style="padding:6px 8px;font-weight:600;color:#555;">Work location:</td><td style="padding:6px 8px;">${escapeHtml(doc.work_location)}</td></tr>` : ""}
          ${doc.form_date ? `<tr><td style="padding:6px 8px;font-weight:600;color:#555;">Form date:</td><td style="padding:6px 8px;">${escapeHtml(String(doc.form_date))}</td></tr>` : ""}
          ${doc.employee_signed_date ? `<tr><td style="padding:6px 8px;font-weight:600;color:#555;">Signed:</td><td style="padding:6px 8px;">${escapeHtml(String(doc.employee_signed_date))}</td></tr>` : ""}
        </table>
        <p style="margin-top:14px;font-size:12px;color:#888;">View it in the Crest App → Team Docs.</p>
      </div>
    `;

    if (RESEND_API_KEY) {
      try {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_API_KEY}` },
          body: JSON.stringify({
            from: "Crest Pest Control <reports@crestpestco.com>",
            to: [CALEB_EMAIL, OFFICE_EMAIL],
            subject,
            html,
          }),
        });
        if (!res.ok) console.error("notify-meal-waiver email error:", await res.text());
      } catch (e) {
        console.error("notify-meal-waiver email throw:", e);
      }
    }

    const { error: notifErr } = await supabase.from("notifications").insert({
      recipient_username: CALEB_USERNAME,
      recipient_name: CALEB_FULL_NAME,
      title: subject,
      body: summary,
      link: "/team-docs",
      notification_type: "meal_waiver",
    });
    if (notifErr) console.error("notification insert error:", notifErr);

    return new Response(JSON.stringify({ ok: true }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    console.error("notify-meal-waiver error:", e);
    return new Response(JSON.stringify({ ok: false, error: "server_error", message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});