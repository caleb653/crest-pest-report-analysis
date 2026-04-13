import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const OFFICE_EMAIL = "office@crestpestcontrol.com";
const SALES_EMAIL = "sales@crestpestco.com";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SaveSignatureRequest {
  reportId: string;
  signatureData: string;
  notifyOffice?: boolean;
  proposalIndex?: number; // For per-proposal signatures
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = (await req.json().catch(() => ({}))) as SaveSignatureRequest;
    const { reportId, signatureData, notifyOffice, proposalIndex } = body;

    console.log("save-customer-signature request:", { 
      reportId, 
      hasSignature: !!signatureData, 
      signatureLength: signatureData?.length,
      notifyOffice,
      proposalIndex,
    });

    if (!reportId) {
      return new Response(
        JSON.stringify({ ok: false, error: "missing_report_id" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!signatureData) {
      return new Response(
        JSON.stringify({ ok: false, error: "missing_signature" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Build the signature value to store
    let signatureValue: string;

    if (proposalIndex !== undefined && proposalIndex !== null) {
      // Per-proposal signature: read existing, merge, save as JSON
      const { data: existing } = await supabase
        .from("reports")
        .select("customer_signature")
        .eq("id", reportId)
        .single();

      let sigMap: Record<string, string> = {};
      if (existing?.customer_signature) {
        try {
          const parsed = JSON.parse(existing.customer_signature);
          if (parsed && parsed._perProposal) {
            sigMap = parsed.signatures || {};
          }
        } catch {
          // Legacy single signature — keep it as index 0 if needed
        }
      }
      sigMap[String(proposalIndex)] = signatureData;
      signatureValue = JSON.stringify({ _perProposal: true, signatures: sigMap });
    } else {
      signatureValue = signatureData;
    }

    // Save the signature to the database
    const { data: updatedReport, error: updateError } = await supabase
      .from("reports")
      .update({ customer_signature: signatureValue })
      .eq("id", reportId)
      .select("id, customer_name, address, technician_name, report_title")
      .single();

    if (updateError) {
      console.error("Database update error:", updateError);
      return new Response(
        JSON.stringify({ ok: false, error: "update_failed", message: updateError.message }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Signature saved to database:", { reportId, customerName: updatedReport?.customer_name, proposalIndex });

    // Determine option label for notification
    const optionLabel = proposalIndex !== undefined ? `Option ${String.fromCharCode(65 + proposalIndex)}` : null;

    // Send notification email to office if requested
    if (notifyOffice && RESEND_API_KEY) {
      try {
        const reportUrl = `${supabaseUrl.replace('.supabase.co', '.lovableproject.com')}/view-report/${reportId}`;
        
        const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background-color: #f5f5f5;">
  <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
    <div style="background-color: #1a1a1a; padding: 24px; text-align: center;">
      <h1 style="color: #ffffff; margin: 0; font-size: 20px;">🎉 New Proposal Signed!${optionLabel ? ` (${optionLabel})` : ''}</h1>
    </div>
    <div style="padding: 24px;">
      <p style="margin: 0 0 16px; color: #333;">A customer has signed their proposal${optionLabel ? ` for <strong>${optionLabel}</strong>` : ''}:</p>
      
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
        <tr>
          <td style="padding: 8px 0; color: #666; width: 120px;">Customer:</td>
          <td style="padding: 8px 0; font-weight: 600; color: #333;">${updatedReport?.customer_name || "N/A"}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #666;">Address:</td>
          <td style="padding: 8px 0; font-weight: 600; color: #333;">${updatedReport?.address || "N/A"}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #666;">Technician:</td>
          <td style="padding: 8px 0; font-weight: 600; color: #333;">${updatedReport?.technician_name || "N/A"}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #666;">Report:</td>
          <td style="padding: 8px 0; font-weight: 600; color: #333;">${updatedReport?.report_title || "Pest Control Proposal"}</td>
        </tr>
      </table>
      
      <div style="margin-top: 16px; padding: 16px; background-color: #f9fafb; border-radius: 8px; border-left: 4px solid #22c55e;">
        <p style="margin: 0 0 8px; font-weight: 600; color: #333;">Customer Signature${optionLabel ? ` (${optionLabel})` : ''}:</p>
        <img src="${signatureData}" alt="Customer signature" style="max-height: 60px; background: white; padding: 8px; border-radius: 4px; border: 1px solid #e5e7eb;" />
      </div>
      
      <div style="text-align: center; margin-top: 24px;">
        <a href="${reportUrl}" style="display: inline-block; background-color: #2A2A2A; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600;">View Signed Report</a>
      </div>
    </div>
    <div style="background-color: #f9fafb; padding: 16px; text-align: center; border-top: 1px solid #e5e7eb;">
      <p style="margin: 0; font-size: 13px; color: #6b7280;">Crest Pest Control • (949) 424-5000</p>
    </div>
  </div>
</body>
</html>
        `;

        const emailRes = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${RESEND_API_KEY}`,
          },
          body: JSON.stringify({
            from: "Crest Pest Control <reports@crestpestco.com>",
            to: [OFFICE_EMAIL, SALES_EMAIL],
            subject: `✅ Proposal Signed${optionLabel ? ` (${optionLabel})` : ''}: ${updatedReport?.customer_name || "Customer"} - ${updatedReport?.address || ""}`,
            html: emailHtml,
          }),
        });

        if (emailRes.ok) {
          console.log("Office notification email sent successfully");
        } else {
          const emailError = await emailRes.text();
          console.error("Failed to send office notification:", emailError);
        }
      } catch (emailErr) {
        console.error("Error sending office notification:", emailErr);
      }
    }

    return new Response(
      JSON.stringify({ ok: true, reportId }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("save-customer-signature error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ ok: false, error: "server_error", message }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
