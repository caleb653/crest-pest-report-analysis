// Emails an invoice, the same way Crest reports are sent (Resend, same sender).
//
// Every send is a person clicking Send — nothing here is scheduled and nothing
// calls this on a timer.
//
// The client does NOT get to decide whether a send is real. This function
// re-reads `portal_billing_settings.send_mode` and, if the property is in test
// mode, rewrites the recipients to the internal test list and prefixes the
// subject with [TEST], whatever it was asked to do. A test send never touches
// the invoice status, so a property can be tested as often as you like.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const LOGO_URL = "https://i.imgur.com/e28LvN4.png";

// Where test sends go when a property hasn't named its own test recipients.
const DEFAULT_TEST_RECIPIENTS = ["office@crestpestcontrol.com", "caleb@crestpestco.com"];

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const money = (n: unknown) =>
  `$${(Number(n) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const dateLabel = (d: unknown) => {
  if (!d) return "";
  const dt = new Date(`${String(d).slice(0, 10)}T00:00:00`);
  return isNaN(dt.getTime())
    ? String(d)
    : dt.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
};

const clean = (list: unknown): string[] =>
  (Array.isArray(list) ? list : [])
    .map((e) => (typeof e === "string" ? e : (e as any)?.email))
    .map((e) => String(e || "").trim())
    .filter((e) => e.includes("@"));

interface Body {
  invoiceId: string;
  pdfBase64: string;
  pdfFilename?: string;
  /** Overrides the saved billing contact for this one send. */
  toOverride?: string;
  ccOverride?: string[];
  message?: string;
  actor?: string;
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body: Body = await req.json();
    const { invoiceId, pdfBase64, pdfFilename, toOverride, ccOverride, message, actor } = body;

    if (!invoiceId || !pdfBase64) throw new Error("invoiceId and pdfBase64 are required.");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // ── read the invoice fresh; never trust totals from the caller ──────────
    const { data: invoice, error: invErr } = await supabase
      .from("portal_invoices")
      .select("*, portal_properties(name, address, client_id)")
      .eq("id", invoiceId)
      .maybeSingle();
    if (invErr) throw invErr;
    if (!invoice) throw new Error("Invoice not found.");
    if (invoice.status === "void") throw new Error("This invoice is void and cannot be sent.");

    const { data: settings } = await supabase
      .from("portal_billing_settings")
      .select("*")
      .eq("property_id", invoice.property_id)
      .maybeSingle();

    const isTest = (settings?.send_mode ?? "test") !== "live";

    // ── recipients ─────────────────────────────────────────────────────────
    const realTo = clean([toOverride || settings?.billing_contact_email]);
    const realCc = [...clean(ccOverride ?? []), ...clean(settings?.invoice_cc), ...clean(settings?.crest_cc)];

    let to: string[];
    let cc: string[];

    if (isTest) {
      const testList = clean(settings?.test_recipients);
      to = testList.length ? testList : DEFAULT_TEST_RECIPIENTS;
      cc = []; // a test must never reach the customer, not even as a copy
    } else {
      to = realTo;
      cc = [...new Set(realCc)].filter((e) => !to.includes(e));
      if (!to.length) {
        throw new Error("No billing email set for this property. Add one before sending live.");
      }
      // The database also enforces this with a unique index; failing here gives
      // a readable message instead of a constraint error.
      const { data: priorLive } = await supabase
        .from("portal_invoice_sends")
        .select("id")
        .eq("invoice_id", invoiceId)
        .eq("mode", "live")
        .eq("ok", true)
        .maybeSingle();
      if (priorLive) {
        throw new Error(
          `${invoice.invoice_number} has already been sent to the customer. Unlock and re-issue it if it needs to go again.`
        );
      }
    }

    const property = (invoice as any).portal_properties ?? {};
    const propertyName = property.name ?? "Your property";
    const subject =
      `${isTest ? "[TEST] " : ""}Invoice ${invoice.invoice_number} — ${propertyName}` +
      (Number(invoice.balance) > 0 ? ` — ${money(invoice.balance)} due` : "");

    const period =
      invoice.period_start && invoice.period_end
        ? `${dateLabel(invoice.period_start)} – ${dateLabel(
            new Date(new Date(`${String(invoice.period_end).slice(0, 10)}T00:00:00`).getTime() - 86400000)
              .toISOString()
              .slice(0, 10)
          )}`
        : "";

    const refs: { label: string; value: string }[] = [
      ...(invoice.po_number ? [{ label: "PO #", value: String(invoice.po_number) }] : []),
      ...(Array.isArray(invoice.reference_numbers) ? invoice.reference_numbers : []),
    ];

    const row = (k: string, v: string) =>
      `<tr><td style="padding:4px 14px 4px 0;color:#6e746e;font-size:13px">${k}</td>
           <td style="padding:4px 0;color:#2a2a2a;font-size:13px;font-weight:600">${v}</td></tr>`;

    const html = `
<div style="font-family:Helvetica,Arial,sans-serif;max-width:620px;margin:0 auto;color:#2a2a2a">
  ${isTest ? `<div style="background:#fef3c7;border:2px solid #fbbf24;padding:12px 16px;border-radius:8px;margin-bottom:20px;font-size:13px;color:#78350f">
      <strong>TEST SEND.</strong> The customer has not received this. Switch this property to live in the Billing tab when the invoice looks right.
    </div>` : ""}

  <div style="text-align:center;padding:8px 0 20px"><img src="${LOGO_URL}" alt="Crest Pest Control" style="height:54px"></div>

  <div style="background:#f2f6f2;border-radius:10px;padding:22px 24px">
    <div style="font-size:12px;letter-spacing:.08em;color:#95a197;font-weight:700">INVOICE</div>
    <div style="font-size:24px;font-weight:700;margin:2px 0 4px">${invoice.invoice_number}</div>
    <div style="font-size:14px;color:#555a55">${propertyName}</div>
    ${property.address ? `<div style="font-size:13px;color:#6e746e">${property.address}</div>` : ""}
  </div>

  <table style="margin:20px 0 4px;border-collapse:collapse">
    ${row("Invoice date", dateLabel(invoice.issue_date))}
    ${invoice.due_date ? row("Due", dateLabel(invoice.due_date)) : ""}
    ${period ? row("Service period", period) : ""}
    ${refs.map((r) => row(r.label, r.value)).join("")}
  </table>

  <div style="border-top:2px solid #c3d1c5;margin:18px 0 0;padding-top:14px;display:flex;justify-content:space-between">
    <span style="font-size:16px;font-weight:700">${Number(invoice.balance) > 0 ? "Balance due" : "Total"}</span>
    <span style="font-size:20px;font-weight:700">${money(Number(invoice.balance) > 0 ? invoice.balance : invoice.total)}</span>
  </div>

  <p style="font-size:14px;line-height:1.6;color:#3a3a3a;margin:22px 0">
    ${message ? String(message).replace(/</g, "&lt;") : "The invoice is attached, with every unit we treated itemised so you can check it against your records."}
  </p>

  ${invoice.customer_note ? `<div style="background:#fafaf9;border-left:3px solid #c3d1c5;padding:12px 16px;font-size:13px;color:#555a55;white-space:pre-line">${String(invoice.customer_note).replace(/</g, "&lt;")}</div>` : ""}

  <p style="font-size:12px;color:#95a197;margin-top:28px;border-top:1px solid #dde2dd;padding-top:14px">
    Crest Pest Control · 949-424-5000 · office@crestpestcontrol.com
  </p>
</div>`.trim();

    // ── send ───────────────────────────────────────────────────────────────
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_API_KEY}` },
      body: JSON.stringify({
        from: "Crest Pest Control <reports@crestpestco.com>",
        reply_to: "office@crestpestcontrol.com",
        to,
        ...(cc.length ? { cc } : {}),
        subject,
        html,
        attachments: [{ filename: pdfFilename || `${invoice.invoice_number}.pdf`, content: pdfBase64 }],
      }),
    });

    const okSend = res.ok;
    const detail = okSend ? await res.json() : await res.text();

    await supabase.from("portal_invoice_sends").insert({
      invoice_id: invoiceId,
      mode: isTest ? "test" : "live",
      to_emails: to,
      cc_emails: cc,
      subject,
      ok: okSend,
      error: okSend ? null : String(detail).slice(0, 2000),
      actor: actor ?? null,
    });

    if (!okSend) {
      await supabase.from("portal_invoices").update({ send_error: String(detail).slice(0, 2000) }).eq("id", invoiceId);
      throw new Error(`Email failed: ${detail}`);
    }

    // Only a LIVE send marks the invoice sent and stamps its visits.
    if (!isTest) {
      await supabase.rpc("portal_invoice_mark_sent", {
        p_invoice: invoiceId,
        p_to: to,
        p_actor: actor ?? "admin",
      });
    }

    return new Response(JSON.stringify({ ok: true, mode: isTest ? "test" : "live", to, cc }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("send-invoice-email:", e);
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
