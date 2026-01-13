import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

// Hardcoded base64-encoded Crest logo PNG for inline email embedding
// This is the crest-logo.png file encoded as base64
const INLINE_LOGO_CONTENT_ID = "crest-logo";
const INLINE_LOGO_BASE64 = "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";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SendReportRequest {
  customerEmail: string;
  customerName: string;
  technicianName: string;
  address: string;
  reportUrl: string;
  emailSubject?: string;
  emailMessage?: string;
  baseUrl?: string; // For logo URL
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const {
      customerEmail,
      customerName,
      technicianName,
      address,
      reportUrl,
      emailSubject,
      emailMessage,
      baseUrl,
    }: SendReportRequest = await req.json();

    // We embed the logo as an inline attachment (CID) to avoid email-client issues
    // with remote images and SVG rendering.
    const hasInlineLogo = Boolean(INLINE_LOGO_BASE64);

    if (!customerEmail) {
      return new Response(
        JSON.stringify({ error: "Customer email is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Convert custom message newlines to HTML breaks
    const formattedMessage = emailMessage ? emailMessage.replace(/\n/g, '<br>') : '';

    // Clean, minimal branded email with better typography
    const emailHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body { 
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; 
              line-height: 1.6; 
              color: #333; 
              margin: 0; 
              padding: 0;
              background-color: #f5f5f5;
              -webkit-font-smoothing: antialiased;
            }
            .wrapper {
              max-width: 600px; 
              margin: 0 auto; 
              background: #ffffff;
            }
            .header { 
              background: #2A2A2A; 
              padding: 32px 40px;
              text-align: center;
            }
            .logo-img {
              max-width: 180px;
              height: auto;
            }
            .logo-text {
              font-family: Georgia, 'Times New Roman', serif;
              font-size: 36px;
              font-weight: bold;
              color: #ffffff;
              font-style: italic;
              letter-spacing: 1px;
              margin: 0;
              line-height: 1.2;
            }
            .logo-subtext {
              font-size: 11px;
              font-weight: 600;
              color: #C3D1C5;
              letter-spacing: 3px;
              text-transform: uppercase;
              margin-top: 6px;
              line-height: 1.4;
            }
            .content { 
              padding: 40px; 
              background: #ffffff;
            }
            .message-box { 
              background: #f9fafb; 
              border-radius: 8px; 
              padding: 24px;
              margin-bottom: 32px;
              border-left: 4px solid #2A2A2A;
            }
            .message-text {
              font-size: 15px;
              color: #374151;
              margin: 0;
              line-height: 1.7;
            }
            .button-container {
              text-align: center;
              margin: 32px 0;
            }
            .button { 
              display: inline-block; 
              background: #2A2A2A; 
              color: #ffffff !important; 
              padding: 14px 32px; 
              text-decoration: none; 
              border-radius: 6px; 
              font-weight: 600;
              font-size: 16px;
              letter-spacing: 0.3px;
            }
            .divider {
              height: 1px;
              background: #e5e7eb;
              margin: 32px 0;
            }
            .footer { 
              background: #f9fafb; 
              padding: 24px 40px; 
              text-align: center; 
            }
            .footer-text {
              font-size: 13px; 
              color: #6b7280;
              margin: 0;
              line-height: 1.5;
            }
            .footer-phone {
              font-size: 14px;
              color: #374151;
              font-weight: 600;
              margin-top: 8px;
              line-height: 1.5;
            }
            p {
              margin: 0 0 16px 0;
            }
          </style>
        </head>
        <body>
            <div class="wrapper">
              <div class="header">
                ${hasInlineLogo ? `
                <img src="cid:${INLINE_LOGO_CONTENT_ID}" alt="Crest Pest Control" class="logo-img" />
                ` : `
                <p class="logo-text">Crest</p>
                <p class="logo-subtext">Pest Control</p>
                `}
              </div>
            </div>
            <div class="content">
              <div class="message-box">
                <p class="message-text">${formattedMessage || `Dear ${customerName || "Valued Customer"},<br><br>Thank you for choosing Crest Pest Control. Your pest control proposal is ready for review.`}</p>
              </div>
              
              ${reportUrl ? `
              <div class="button-container">
                <a href="${reportUrl}" class="button">View Your Proposal</a>
              </div>
              <p style="text-align: center; font-size: 13px; color: #6b7280; margin-top: 16px; line-height: 1.5;">
                Click the button above to view and sign your proposal.
              </p>
              ` : ""}
              
              <div class="divider"></div>
              
              <p style="font-size: 14px; color: #6b7280; text-align: center; margin: 0; line-height: 1.5;">
                Questions? We're here to help.
              </p>
            </div>
            <div class="footer">
              <p class="footer-text">Crest Pest Control</p>
              <p class="footer-phone">(949) 424-5000</p>
            </div>
          </div>
        </body>
      </html>
    `;

    console.log("Sending email to:", customerEmail);

    const finalSubject = emailSubject || `Your Pest Control Proposal from Crest`;

    const requestBody: Record<string, unknown> = {
      from: "Crest Pest Control <reports@crestpestco.com>",
      to: [customerEmail],
      subject: finalSubject,
      html: emailHtml,
    };

    if (INLINE_LOGO_BASE64) {
      requestBody.attachments = [
        {
          content: INLINE_LOGO_BASE64,
          filename: "crest-logo.png",
          contentType: "image/png",
          contentId: INLINE_LOGO_CONTENT_ID,
        },
      ];
    }

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
