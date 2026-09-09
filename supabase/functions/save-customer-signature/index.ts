import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const OFFICE_EMAIL = "office@crestpestcontrol.com";
const SALES_EMAIL = "sales@crestpestco.com";
const SIGNED_CC_EMAIL = "caleb@crestpestco.com"; // copied on every signed proposal

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SaveSignatureRequest {
  reportId: string;
  signatureData: string;
  notifyOffice?: boolean;
  proposalIndex?: number; // For per-proposal signatures
  /** Fingerprint of the option AS THE CUSTOMER SAW IT. If the option changed on the
   *  server since the page loaded, the signature is refused (proposal_changed). */
  proposalFingerprint?: string;
  proposalName?: string;
  source?: string; // "customer" | "editor"
  appBaseUrl?: string; // Origin of the app the customer signed from (e.g. https://crest-app.web.app)
}

// ---------------------------------------------------------------------------
// Signature store helpers — mirror of src/lib/proposalSignatures.ts. Keep in sync.
// Every signature carries `meta` describing WHICH option was signed (name +
// fingerprint of its services/prices) so no screen can re-label it later.
// ---------------------------------------------------------------------------
interface SignatureMeta {
  proposalName: string;
  proposalIndex: number;
  fingerprint: string;
  signedAt: string;
  source?: string;
}
interface SignatureStore {
  signatures: Record<string, string>;
  meta: Record<string, SignatureMeta>;
  legacy: string | null;
}
interface ProposalLike {
  name?: string | null;
  services?: Array<{
    serviceType?: string | null;
    initialPrice?: string | number | null;
    recurringPrice?: string | number | null;
    frequency?: string | number | null;
  }> | null;
}

function parseSignatureStore(raw: string | null | undefined): SignatureStore {
  const store: SignatureStore = { signatures: {}, meta: {}, legacy: null };
  if (!raw) return store;
  if (!raw.trim().startsWith("{")) {
    store.legacy = raw;
    return store;
  }
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || !parsed._perProposal) {
      store.legacy = raw;
      return store;
    }
    const sigs = parsed.signatures && typeof parsed.signatures === "object" ? parsed.signatures : {};
    for (const [k, v] of Object.entries(sigs)) {
      if (typeof v === "string" && v) store.signatures[String(parseInt(k, 10))] = v;
    }
    const meta = parsed.meta && typeof parsed.meta === "object" ? parsed.meta : {};
    for (const [k, v] of Object.entries(meta)) {
      const m = v as Partial<SignatureMeta> | null;
      if (m && typeof m.fingerprint === "string") {
        store.meta[String(parseInt(k, 10))] = {
          proposalName: String(m.proposalName ?? ""),
          proposalIndex: Number(m.proposalIndex ?? parseInt(k, 10)),
          fingerprint: m.fingerprint,
          signedAt: String(m.signedAt ?? ""),
          source: m.source,
        };
      }
    }
    for (const k of Object.keys(store.meta)) if (!store.signatures[k]) delete store.meta[k];
    if (typeof parsed.legacy === "string" && parsed.legacy) store.legacy = parsed.legacy;
    return store;
  } catch {
    store.legacy = raw;
    return store;
  }
}

function serializeSignatureStore(store: SignatureStore): string | null {
  if (Object.keys(store.signatures).length === 0) return store.legacy || null;
  const meta: Record<string, SignatureMeta> = {};
  for (const k of Object.keys(store.signatures)) if (store.meta[k]) meta[k] = store.meta[k];
  const out: Record<string, unknown> = { _perProposal: true, signatures: { ...store.signatures }, meta };
  if (store.legacy) out.legacy = store.legacy;
  return JSON.stringify(out);
}

const normPrice = (v: unknown): string => {
  if (v === null || v === undefined) return "";
  const s = String(v).replace(/[$,\s]/g, "").trim();
  if (s === "") return "";
  const n = Number(s);
  return Number.isFinite(n) ? n.toFixed(2) : s.toLowerCase();
};

function proposalFingerprint(p: ProposalLike | null | undefined): string {
  if (!p) return "";
  const name = String(p.name ?? "").trim().toLowerCase();
  const lines = (p.services ?? [])
    .filter((s) => s && String(s.serviceType ?? "").trim() !== "")
    .map((s) =>
      [
        String(s.serviceType ?? "").trim().toLowerCase(),
        normPrice(s.initialPrice),
        normPrice(s.recurringPrice),
        String(Number(s.frequency) || 0),
      ].join("|"),
    );
  return `v1:${name}#${lines.join(";")}`;
}

/** Multi-proposal reports store `services` as [{ name, services: [...] }, ...]. */
function proposalsFromServices(services: unknown): ProposalLike[] | null {
  if (!Array.isArray(services) || services.length === 0) return null;
  const first = services[0];
  if (first && typeof first === "object" && "name" in first && "services" in first) {
    return services as ProposalLike[];
  }
  return null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = (await req.json().catch(() => ({}))) as SaveSignatureRequest;
    const { reportId, signatureData, notifyOffice, proposalIndex, proposalFingerprint: clientFingerprint, proposalName: clientProposalName, source, appBaseUrl } = body;

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

    // Read the CURRENT row so we merge into what is really stored (never
    // overwrite from a client's memory) and so we can record which option was
    // signed as it exists on the server right now.
    const { data: existing, error: readError } = await supabase
      .from("reports")
      .select("customer_signature, services")
      .eq("id", reportId)
      .single();
    if (readError || !existing) {
      return new Response(
        JSON.stringify({ ok: false, error: "report_not_found" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const store = parseSignatureStore(existing.customer_signature as string | null);
    let signatureValue: string | null;
    let signedOptionName: string | null = null;

    if (proposalIndex !== undefined && proposalIndex !== null) {
      const proposals = proposalsFromServices(existing.services);
      const idx = Number(proposalIndex);
      if (!proposals || !Number.isInteger(idx) || idx < 0 || idx >= proposals.length) {
        console.warn("save-customer-signature: proposalIndex does not exist on report", { reportId, proposalIndex, count: proposals?.length ?? 0 });
        return new Response(
          JSON.stringify({ ok: false, error: "invalid_proposal", message: "That option no longer exists on this proposal. Please reload the page." }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const proposal = proposals[idx];
      const serverFingerprint = proposalFingerprint(proposal);
      // The customer signed what they SAW. If the option changed since their page
      // loaded, refuse — otherwise the signature would attach to a different offer.
      if (clientFingerprint && clientFingerprint !== serverFingerprint) {
        console.warn("save-customer-signature: proposal changed since page load", { reportId, proposalIndex, clientFingerprint, serverFingerprint });
        return new Response(
          JSON.stringify({
            ok: false,
            error: "proposal_changed",
            message: "This option was updated after you opened the proposal. Please reload and review it before signing.",
            currentProposalName: String(proposal.name ?? ""),
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      signedOptionName = String(proposal.name ?? "").trim() || `Option ${String.fromCharCode(65 + idx)}`;
      if (clientProposalName && clientProposalName.trim() && clientProposalName.trim() !== signedOptionName) {
        console.warn("save-customer-signature: client option name differs from server", { reportId, clientProposalName, signedOptionName });
      }
      store.signatures[String(idx)] = signatureData;
      store.meta[String(idx)] = {
        proposalName: signedOptionName,
        proposalIndex: idx,
        fingerprint: serverFingerprint,
        signedAt: new Date().toISOString(),
        source: source || "customer",
      };
      signatureValue = serializeSignatureStore(store);
    } else {
      // Single (non per-option) signature. Never clobber per-option signatures
      // that already exist — keep it alongside them as the legacy slot.
      store.legacy = signatureData;
      signatureValue = serializeSignatureStore(store);
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
    const optionLabel = signedOptionName
      ? (signedOptionName === `Option ${String.fromCharCode(65 + Number(proposalIndex))}`
          ? signedOptionName
          : `${signedOptionName} (Option ${String.fromCharCode(65 + Number(proposalIndex))})`)
      : null;

    // Send notification email to office if requested
    if (notifyOffice && RESEND_API_KEY) {
      try {
        // Build a real, openable link to the signed report. Prefer the
        // origin the customer signed from; fall back to the public site.
        const sanitizedBase = (() => {
          const raw = (appBaseUrl || "").trim().replace(/\/$/, "");
          if (raw && /^https?:\/\//i.test(raw)) return raw;
          return "https://crestpestco.com";
        })();
        const reportUrl = `${sanitizedBase}/view-report/${reportId}`;
        
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
            to: [OFFICE_EMAIL, SALES_EMAIL, SIGNED_CC_EMAIL],
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
      JSON.stringify({ ok: true, reportId, customer_signature: signatureValue, signedOptionName }),
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
