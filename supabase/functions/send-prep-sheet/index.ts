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
  prepSheetId: string;
  email: string;
}

const isValidEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    if (!RESEND_API_KEY) {
      return new Response(JSON.stringify({ ok: false, error: "missing_resend_key" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = (await req.json().catch(() => ({}))) as Body;
    const { prepSheetId, email } = body;
    if (!prepSheetId || !email || !isValidEmail(email)) {
      return new Response(JSON.stringify({ ok: false, error: "invalid_input" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: prep, error: prepErr } = await supabase
      .from("portal_prep_sheets")
      .select("title, description, file_url, treatment_type")
      .eq("id", prepSheetId)
      .maybeSingle();

    if (prepErr || !prep) {
      return new Response(JSON.stringify({ ok: false, error: "prep_not_found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Per request: subject is just the prep sheet's name.
    const subject = prep.title;

    const escapeHtml = (s: string) =>
      s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
       .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
    const formatMultiline = (s: string) => escapeHtml(s).replace(/\r\n|\r|\n/g, "<br>");

    const html = `
<!DOCTYPE html>
<html><head><meta charset="utf-8" /></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin:0; padding:20px; background:#f5f5f5;">
  <div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
    <div style="background:#2A2A2A;padding:20px;text-align:center;">
      <h1 style="color:#ffffff;margin:0;font-size:18px;">${escapeHtml(prep.title)}</h1>
    </div>
    <div style="padding:24px;color:#333;">
      <p style="margin:0 0 14px;">Hi there,</p>
      <p style="margin:0 0 14px;">Please find the prep sheet <strong>${escapeHtml(prep.title)}</strong> attached as a PDF.</p>
      ${prep.description ? `
      <div style="margin:18px 0;padding:14px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;font-size:13px;color:#555;line-height:1.55;white-space:pre-wrap;">
        ${formatMultiline(prep.description)}
      </div>` : ""}
      <p style="margin:14px 0 0;font-size:13px;color:#666;">Questions? Call us at (949) 424-5000.</p>
      <p style="margin:14px 0 0;font-size:13px;color:#333;">— The Crest Pest Control Team</p>
    </div>
    <div style="background:#f9fafb;padding:14px;text-align:center;border-top:1px solid #e5e7eb;">
      <p style="margin:0;font-size:12px;color:#6b7280;">Crest Pest Control • (949) 424-5000</p>
    </div>
  </div>
</body></html>`;

    // Build attachment from file_url if available.
    const attachments: { filename: string; content: string }[] = [];
    if (prep.file_url) {
      try {
        const fileRes = await fetch(prep.file_url);
        if (fileRes.ok) {
          const buf = new Uint8Array(await fileRes.arrayBuffer());
          // Base64-encode in chunks so large PDFs don't blow the call stack.
          let binary = "";
          const chunkSize = 0x8000;
          for (let i = 0; i < buf.length; i += chunkSize) {
            binary += String.fromCharCode.apply(
              null,
              Array.from(buf.subarray(i, i + chunkSize)),
            );
          }
          const base64 = btoa(binary);
          const safeTitle = prep.title.replace(/[^\w\-. ]+/g, "_").trim() || "prep-sheet";
          attachments.push({ filename: `${safeTitle}.pdf`, content: base64 });
        } else {
          console.error("prep file fetch failed:", fileRes.status);
        }
      } catch (e) {
        console.error("prep file fetch threw:", e);
      }
    }

    const emailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_API_KEY}` },
      body: JSON.stringify({
        from: "Crest Pest Control <reports@crestpestco.com>",
        to: [email],
        subject,
        html,
        attachments,
      }),
    });

    if (!emailRes.ok) {
      const txt = await emailRes.text();
      console.error("Resend error:", txt);
      return new Response(JSON.stringify({ ok: false, error: "send_failed", message: txt }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true, attached: attachments.length > 0 }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    console.error("send-prep-sheet error:", e);
    return new Response(JSON.stringify({ ok: false, error: "server_error", message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});