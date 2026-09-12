import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

// Where the most recently emailed proposal PDF is kept per report, so a remote
// customer signature can be pushed to FieldRoutes server-side
// (fieldroutes-signed-agreement-push stamps a signature page onto this file).
const FR_BUCKET = "fieldroutes-writes";
const storedProposalPath = (reportId: string) => `${reportId}/proposal-latest.pdf`;

function b64ToBytes(b64: string): Uint8Array {
  const clean = b64.includes(",") ? b64.slice(b64.indexOf(",") + 1) : b64;
  const bin = atob(clean);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// External logo URL for email
const LOGO_URL = "https://i.imgur.com/e28LvN4.png";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SendReportRequest {
  customerEmail: string;
  ccEmails?: string[];
  customerName: string;
  technicianName: string;
  address: string;
  reportUrl: string;
  emailSubject?: string;
  emailMessage?: string;
  baseUrl?: string;
  pdfBase64?: string;
  pdfFilename?: string;
  buttonText?: string;
  reportType?: "sales" | "multi-proposal" | "initial";
  /** FieldRoutes {loginlink} — direct URL to the customer's billing/wallet portal. */
  customerPortalUrl?: string;
  /** Additional file attachments fetched by URL (e.g. prep sheets). */
  extraAttachments?: Array<{ url: string; filename: string }>;
  /** reports.id — enables keeping the proposal PDF on file for signed-agreement pushes. */
  reportId?: string;
  /** Compact copy of the proposal PDF to keep on file (falls back to pdfBase64). */
  frPdfBase64?: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const {
      customerEmail,
      ccEmails,
      customerName,
      technicianName,
      address,
      reportUrl,
      emailSubject,
      emailMessage,
      baseUrl,
      pdfBase64,
      pdfFilename,
      buttonText,
      reportType,
      customerPortalUrl,
      extraAttachments,
      reportId,
      frPdfBase64,
    }: SendReportRequest = await req.json();

    const sanitizeEmail = (e: string) => e.trim().replace(/[.\s,;]+$/, "");
    const cleanCustomerEmail = customerEmail ? sanitizeEmail(customerEmail) : customerEmail;
    const cleanCcEmails = ccEmails?.map(sanitizeEmail).filter(Boolean);

    if (!cleanCustomerEmail) {
      return new Response(
        JSON.stringify({ error: "Customer email is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Convert custom message newlines to HTML breaks
    const formattedMessage = emailMessage ? emailMessage.replace(/\n/g, '<br>') : '';

    // Clean, professional email template
    const emailHtml = `
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
  </head>
  <body style="margin: 0; padding: 0; background-color: #f5f5f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f5f5f5;">
      <tr>
        <td style="padding: 40px 20px;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
            
            <!-- Header -->
            <tr>
              <td style="background-color: #1a1a1a; padding: 32px 40px; text-align: center;">
                <img src="${LOGO_URL}" alt="Crest Pest Control" width="160" style="display: block; margin: 0 auto; max-width: 160px; height: auto;" />
              </td>
            </tr>
            
            <!-- Content -->
            <tr>
              <td style="padding: 40px;">
                <!-- Message Box -->
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                  <tr>
                    <td style="background-color: #f9fafb; border-radius: 8px; padding: 24px; border-left: 4px solid #2A2A2A;">
                      <p style="margin: 0; font-size: 15px; line-height: 1.7; color: #374151;">
                        ${formattedMessage || `Dear ${customerName || "Valued Customer"},<br><br>Thank you for choosing Crest Pest Control. Your pest control proposal is ready for review.`}
                      </p>
                    </td>
                  </tr>
                </table>

                ${reportUrl ? `
                <!-- View Proposal Button (Sage Green, Squared) -->
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-top: 32px;">
                  <tr>
                    <td style="text-align: center;">
                      <a href="${reportUrl}" style="display: inline-block; background-color: #C3D1C5; color: #2A2A2A; padding: 22px 64px; text-decoration: none; border-radius: 0; font-weight: 700; font-size: 20px; letter-spacing: 0.02em; border: 1px solid #95A197;">${buttonText || "View Your Proposal"}</a>
                    </td>
                  </tr>
                  <tr>
                    <td style="text-align: center; padding-top: 16px;">
                      <p style="margin: 0; font-size: 13px; color: #6b7280; line-height: 1.5;">
                        Click the button above to view and sign your proposal.
                      </p>
                    </td>
                  </tr>
                </table>
                ` : ""}

                ${customerPortalUrl ? `
                <!-- Customer Portal Button (Black) -->
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-top: 24px;">
                  <tr>
                    <td style="text-align: center;">
                      <a href="${customerPortalUrl}" style="display: inline-block; background-color: #2A2A2A; color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px;">Open Customer Portal</a>
                    </td>
                  </tr>
                  <tr>
                    <td style="text-align: center; padding-top: 10px;">
                      <p style="margin: 0; font-size: 13px; color: #6b7280; line-height: 1.5;">
                        Add a payment method and review service notes.
                      </p>
                    </td>
                  </tr>
                </table>
                ` : ""}
                
                <!-- Divider -->
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-top: 32px;">
                  <tr>
                    <td style="border-top: 1px solid #e5e7eb; padding-top: 24px; text-align: center;">
                      <p style="margin: 0; font-size: 14px; color: #6b7280;">
                        Questions? We're here to help.
                      </p>
                      <p style="margin: 12px 0 0 0; font-size: 14px; color: #374151; font-weight: 700;">
                        (Please reply all, otherwise replies may be missed)
                      </p>
                    </td>
                  </tr>
                </table>
                
              </td>
            </tr>
            
            <!-- Footer -->
            <tr>
              <td style="background-color: #f9fafb; padding: 24px 40px; text-align: center; border-top: 1px solid #e5e7eb;">
                <p style="margin: 0; font-size: 13px; color: #6b7280;">Crest Pest Control</p>
                <p style="margin: 8px 0 0 0; font-size: 14px; color: #374151; font-weight: 600;">(949) 424-5000</p>
              </td>
            </tr>
            
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
    `;

    console.log("Sending email to:", cleanCustomerEmail);

    const finalSubject = emailSubject || `Crest Pest Control: Service Proposal`;

    // Route reply-to based on report type:
    //  - Sales / Multi-Proposal -> sales@crestpestco.com
    //  - Initial Pest Report    -> office@crestpestcontrol.com
    const replyToAddress =
      reportType === "initial"
        ? "office@crestpestcontrol.com"
        : reportType === "sales" || reportType === "multi-proposal"
        ? "sales@crestpestco.com"
        : "office@crestpestcontrol.com";

    // Fetch any extra attachments (prep sheets) and base64-encode them.
    const fetchedExtras: Array<{ filename: string; content: string }> = [];
    if (extraAttachments && extraAttachments.length > 0) {
      for (const a of extraAttachments) {
        try {
          const r = await fetch(a.url);
          if (!r.ok) {
            console.warn("Failed to fetch attachment", a.url, r.status);
            continue;
          }
          const buf = new Uint8Array(await r.arrayBuffer());
          let binary = "";
          const chunk = 0x8000;
          for (let i = 0; i < buf.length; i += chunk) {
            binary += String.fromCharCode.apply(
              null,
              Array.from(buf.subarray(i, i + chunk)) as unknown as number[],
            );
          }
          fetchedExtras.push({ filename: a.filename, content: btoa(binary) });
        } catch (e) {
          console.warn("Attachment fetch error", a.url, e);
        }
      }
    }

    const allAttachments: Array<{ filename: string; content: string }> = [
      ...(pdfBase64 ? [{ filename: pdfFilename || "Crest_Proposal.pdf", content: pdfBase64 }] : []),
      ...fetchedExtras,
    ];

    const requestBody: Record<string, unknown> = {
      from: "Crest Pest Control <reports@crestpestco.com>",
      reply_to: replyToAddress,
      to: [cleanCustomerEmail],
      ...(cleanCcEmails && cleanCcEmails.length > 0 ? { cc: cleanCcEmails } : {}),
      subject: finalSubject,
      html: emailHtml,
      ...(allAttachments.length > 0 ? { attachments: allAttachments } : {}),
    };

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!res.ok) {
      const errorData = await res.text();
      console.error("Resend API error:", errorData);
      throw new Error(`Failed to send email: ${errorData}`);
    }

    const emailResponse = await res.json();

    console.log("Email sent successfully:", emailResponse);

    // Keep the proposal PDF the customer just received on file (sales reports
    // only). Best-effort: a storage problem must never fail an email that sent.
    const storeBase64 = frPdfBase64 || pdfBase64;
    const validReportId = reportId && /^[0-9a-f-]{36}$/i.test(reportId) ? reportId : null;
    if (validReportId && storeBase64 && reportType !== "initial") {
      try {
        const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
        const { error: storeErr } = await supabase.storage
          .from(FR_BUCKET)
          .upload(storedProposalPath(validReportId), b64ToBytes(storeBase64), { contentType: "application/pdf", upsert: true });
        if (storeErr) console.warn("proposal PDF store failed:", storeErr.message);
        else console.log("proposal PDF stored for signed-agreement push:", validReportId);
      } catch (e) {
        console.warn("proposal PDF store error:", e);
      }
    }

    return new Response(JSON.stringify({ success: true, data: emailResponse }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Error in send-report-email function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
};

serve(handler);
