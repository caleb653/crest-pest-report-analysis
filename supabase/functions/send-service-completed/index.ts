import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const {
      to,
      ccEmails,
      propertyName,
      clientName,
      serviceType,
      serviceDate,
      technician,
      summary,
      unitsCount,
      productsList,
      portalUrl,
    } = await req.json();

    if (!to) {
      return new Response(JSON.stringify({ error: "Missing recipient email" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) {
      return new Response(JSON.stringify({ error: "Email not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const safeProductsRows = Array.isArray(productsList) && productsList.length > 0
      ? productsList.map((p: any) => `
        <tr>
          <td style="padding:6px 10px;border-bottom:1px solid #eee;font-weight:600;">${p.name || ""}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #eee;font-family:monospace;font-size:11px;">${p.epa || "—"}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #eee;">${p.applied_amount != null ? `${p.applied_amount} ${p.applied_unit || ""}` : "—"}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #eee;color:#2A2A2A;">${p.undiluted_amount != null ? `${p.undiluted_amount} ${p.undiluted_unit || ""}` : "—"}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #eee;">${p.dilution_rate_pct != null ? `${Number(p.dilution_rate_pct).toFixed(2)}%` : "—"}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #eee;">${p.mix_ratio_per_gal != null && p.mix_ratio_unit ? `${p.mix_ratio_per_gal} ${p.mix_ratio_unit} / 1 gal` : "—"}</td>
        </tr>`).join("")
      : "";

    const html = `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;max-width:640px;margin:0 auto;background:#ffffff;">
        <div style="background:#2A2A2A;color:#fff;padding:18px 24px;border-radius:8px 8px 0 0;">
          <h2 style="margin:0;font-size:18px;font-weight:700;">Service Completed</h2>
          <p style="margin:4px 0 0;font-size:13px;opacity:0.85;">Crest Pest Control</p>
        </div>
        <div style="border:1px solid #e5e7eb;border-top:none;padding:22px 24px;border-radius:0 0 8px 8px;">
          <p style="margin:0 0 12px;font-size:14px;color:#374151;">Hello${clientName ? ` ${clientName}` : ""},</p>
          <p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.55;">
            We've completed a service at <strong>${propertyName || "your property"}</strong>. A summary is below.
          </p>
          <table style="width:100%;border-collapse:collapse;font-size:13px;color:#1f2937;margin-bottom:16px;">
            ${serviceType ? `<tr><td style="padding:6px 0;color:#6b7280;width:140px;">Service</td><td style="padding:6px 0;font-weight:600;">${serviceType}</td></tr>` : ""}
            ${serviceDate ? `<tr><td style="padding:6px 0;color:#6b7280;">Date</td><td style="padding:6px 0;font-weight:600;">${serviceDate}</td></tr>` : ""}
            ${technician ? `<tr><td style="padding:6px 0;color:#6b7280;">Technician</td><td style="padding:6px 0;font-weight:600;">${technician}</td></tr>` : ""}
            ${unitsCount != null ? `<tr><td style="padding:6px 0;color:#6b7280;">Areas serviced</td><td style="padding:6px 0;font-weight:600;">${unitsCount}</td></tr>` : ""}
          </table>
          ${summary ? `<div style="background:#f9fafb;border-left:3px solid #2A2A2A;border-radius:6px;padding:12px 14px;margin-bottom:16px;"><p style="margin:0;font-size:13px;color:#374151;white-space:pre-wrap;line-height:1.55;">${summary}</p></div>` : ""}
          ${safeProductsRows ? `
            <p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#111827;">Products used (with EPA Reg # &amp; dilution detail)</p>
            <table style="width:100%;border-collapse:collapse;font-size:12px;color:#1f2937;border:1px solid #eee;border-radius:6px;overflow:hidden;margin-bottom:16px;">
              <thead style="background:#f3f4f6;"><tr>
                <th style="text-align:left;padding:6px 10px;font-weight:700;">Product</th>
                <th style="text-align:left;padding:6px 10px;font-weight:700;">EPA #</th>
                <th style="text-align:left;padding:6px 10px;font-weight:700;">Diluted</th>
                <th style="text-align:left;padding:6px 10px;font-weight:700;">Concentrated</th>
                <th style="text-align:left;padding:6px 10px;font-weight:700;">Dilution Rate</th>
                <th style="text-align:left;padding:6px 10px;font-weight:700;">Mix Ratio</th>
              </tr></thead>
              <tbody>${safeProductsRows}</tbody>
            </table>` : ""}
          ${portalUrl ? `
            <div style="text-align:center;margin:22px 0 8px;">
              <a href="${portalUrl}" style="display:inline-block;background:#2A2A2A;color:#ffffff;text-decoration:none;padding:12px 26px;border-radius:6px;font-weight:600;font-size:14px;">View Full Report</a>
            </div>
            <p style="text-align:center;margin:0;font-size:12px;color:#6b7280;">Or open: <a href="${portalUrl}" style="color:#2A2A2A;">${portalUrl}</a></p>
          ` : ""}
          <hr style="border:none;border-top:1px solid #e5e7eb;margin:22px 0 12px;" />
          <div style="background:#fffbeb;border:1px solid #fcd34d;border-radius:6px;padding:12px 14px;margin:0 0 14px;">
            <p style="margin:0 0 6px;font-size:12px;font-weight:700;color:#92400e;text-transform:uppercase;letter-spacing:0.04em;">⚠ Caution</p>
            <p style="margin:0 0 8px;font-size:11.5px;color:#3f2d05;line-height:1.55;">
              Crest Pest Control is committed to the safety of our customers and our environment. All materials used by Crest Pest Control have been registered by the Environmental Protection Agency. Please avoid unnecessary contact with materials and comply with all instructions and recommendations from our technicians. Thanks for your patronage! <strong>National Emergency Poison Control: (800) 222-1222</strong>
            </p>
            <p style="margin:0;font-size:10.5px;color:#3f2d05;line-height:1.55;font-style:italic;">
              "State law requires that you be given the following information: CAUTION—PESTICIDES ARE TOXIC CHEMICALS. Structural Pest Control Companies are registered and regulated by the Structural Pest Control Board, and apply pesticides which are registered and approved for use by the California Department of Pesticide Regulation and the United States Environmental Protection Agency. Registration is granted when the state finds that, based on existing scientific evidence, there are no appreciable risks if proper use conditions are followed or that the risks are outweighed by the benefits. The degree of risk depends upon the degree of exposure, so exposure should be minimized." "If within 24 hours following application you experience symptoms similar to common seasonal illness comparable to the flu, contact your physician or poison control center (800-222-1222) and your pest control company immediately." (This statement shall be modified to include any other symptoms of overexposure which are not typical of influenza.) "For further information, contact any of the following: Crest Pest Control (949-424-5000); for Health Questions—the County Health Department (800-564-8448); for Application Information—the County Agricultural Commissioner (714-955-0100) and for Regulatory Information—the Structural Pest Control Board (800-737-8188), 2005 Evergreen Street, Ste. 1500, Sacramento, CA 95815)."
            </p>
          </div>
          <p style="margin:0;font-size:12px;color:#6b7280;text-align:center;">
            Crest Pest Control · (949) 424-5000<br/>
            Reply to this email with any questions.
          </p>
        </div>
      </div>`;

    const subject = `Service Completed${propertyName ? ` — ${propertyName}` : ""}${serviceDate ? ` (${serviceDate})` : ""}`;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "Crest Pest Control <reports@crestpestco.com>",
        reply_to: "office@crestpestcontrol.com",
        to: Array.isArray(to) ? to : [to],
        ...(Array.isArray(ccEmails) && ccEmails.length > 0 ? { cc: ccEmails } : {}),
        subject,
        html,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("Resend error:", errText);
      return new Response(JSON.stringify({ error: "Failed to send email", detail: errText }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await res.json();
    return new Response(JSON.stringify({ success: true, data }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("send-service-completed error:", e);
    return new Response(JSON.stringify({ error: e?.message || "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});