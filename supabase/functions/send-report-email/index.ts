import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

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
                <!-- Button -->
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-top: 32px;">
                  <tr>
                    <td style="text-align: center;">
                      <a href="${reportUrl}" style="display: inline-block; background-color: #2A2A2A; color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px;">${buttonText || "View Your Proposal"}</a>
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

    const requestBody: Record<string, unknown> = {
      from: "Crest Pest Control <reports@crestpestco.com>",
      reply_to: replyToAddress,
      to: [cleanCustomerEmail],
      ...(cleanCcEmails && cleanCcEmails.length > 0 ? { cc: cleanCcEmails } : {}),
      subject: finalSubject,
      html: emailHtml,
      ...(pdfBase64 ? {
        attachments: [{
          filename: pdfFilename || "Crest_Proposal.pdf",
          content: pdfBase64,
        }],
      } : {}),
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
