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
  findings: string[];
  expectations: string[];
  targetPests: string[];
  productsUsed: string[];
  equipment: string[];
  reportUrl: string;
  emailSubject?: string;
  emailMessage?: string;
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
      findings,
      expectations,
      targetPests,
      productsUsed,
      equipment,
      reportUrl,
      emailSubject,
      emailMessage,
    }: SendReportRequest = await req.json();

    if (!customerEmail) {
      return new Response(
        JSON.stringify({ error: "Customer email is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const formatList = (items: string[]) => {
      if (!items || items.length === 0) return "<li>None specified</li>";
      return items.map(item => `<li>${item}</li>`).join("");
    };

    const formatFindings = (items: string[]) => {
      if (!items || items.length === 0) return "<p>No findings recorded.</p>";
      return items.map(item => `<p>${item}</p>`).join("");
    };

    // Convert custom message newlines to HTML breaks
    const formattedMessage = emailMessage ? emailMessage.replace(/\n/g, '<br>') : '';

    const emailHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; }
            .header { background: linear-gradient(135deg, #1a5f2a, #2d8a3e); padding: 20px; text-align: center; }
            .header h1 { color: white; margin: 0; font-size: 24px; }
            .content { padding: 20px; }
            .message { margin-bottom: 24px; padding: 16px; background: #f9f9f9; border-radius: 8px; }
            .section { margin-bottom: 20px; }
            .section h2 { color: #1a5f2a; font-size: 18px; border-bottom: 2px solid #1a5f2a; padding-bottom: 5px; }
            .info-row { display: flex; margin-bottom: 8px; }
            .info-label { font-weight: bold; width: 120px; }
            .tags { display: flex; flex-wrap: wrap; gap: 8px; }
            .tag { background: #1a5f2a; color: white; padding: 4px 12px; border-radius: 20px; font-size: 14px; }
            .button { display: inline-block; background: #1a5f2a; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 20px; }
            .footer { background: #f5f5f5; padding: 15px; text-align: center; font-size: 12px; color: #666; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>Pest Control Report</h1>
          </div>
          <div class="content">
            ${emailMessage ? `
            <div class="message">
              ${formattedMessage}
            </div>
            ` : `
            <p>Dear ${customerName || "Valued Customer"},</p>
            <p>Thank you for choosing Crest Pest Control. Below is a summary of your recent pest control service.</p>
            `}
            
            <div class="section">
              <h2>Service Details</h2>
              <div class="info-row"><span class="info-label">Address:</span> ${address || "Not specified"}</div>
              <div class="info-row"><span class="info-label">Technician:</span> ${technicianName}</div>
            </div>

            ${reportUrl ? `
            <div style="text-align: center; margin: 24px 0;">
              <a href="${reportUrl}" class="button">View Full Report</a>
            </div>
            ` : ""}

            ${targetPests && targetPests.length > 0 ? `
            <div class="section">
              <h2>Target Pests</h2>
              <div class="tags">
                ${targetPests.map(pest => `<span class="tag">${pest}</span>`).join("")}
              </div>
            </div>
            ` : ""}

            ${productsUsed && productsUsed.length > 0 ? `
            <div class="section">
              <h2>Products Used</h2>
              <div class="tags">
                ${productsUsed.map(product => `<span class="tag">${product}</span>`).join("")}
              </div>
            </div>
            ` : ""}

            ${equipment && equipment.length > 0 ? `
            <div class="section">
              <h2>Equipment</h2>
              <div class="tags">
                ${equipment.map(eq => `<span class="tag">${eq}</span>`).join("")}
              </div>
            </div>
            ` : ""}

            <p>If you have any questions about your service, please don't hesitate to contact us at <strong>949-424-5000</strong>.</p>
          </div>
          <div class="footer">
            <p>Crest Pest Control | Professional Pest Management Services</p>
            <p>This email was sent regarding your recent pest control service.</p>
          </div>
        </body>
      </html>
    `;

    console.log("Sending email to:", customerEmail);

    const finalSubject = emailSubject || `Your Pest Control Report - ${address || "Service Summary"}`;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "Crest Pest Control <onboarding@resend.dev>",
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
