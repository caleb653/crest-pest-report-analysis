import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

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

    // Extract base URL from reportUrl for logo
    let logoUrl = '';
    if (baseUrl) {
      logoUrl = `${baseUrl}/images/crest-logo-email.svg`;
    } else if (reportUrl) {
      try {
        const url = new URL(reportUrl);
        logoUrl = `${url.origin}/images/crest-logo-email.svg`;
      } catch {
        logoUrl = '';
      }
    }

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
              ${logoUrl ? `
              <img src="${logoUrl}" alt="Crest Pest Control" class="logo-img" />
              ` : `
              <p class="logo-text">Crest</p>
              <p class="logo-subtext">Pest Control</p>
              `}
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

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "Crest Pest Control <reports@crestpestco.com>",
        to: [customerEmail],
        subject: finalSubject,
        html: emailHtml,
      }),
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
