// supabase/functions/fieldroutes-signed-agreement-push
// Push a SIGNED sales proposal into FieldRoutes, automatically:
//   1. assign the "Signed Agreement" customer flag (genericFlagID 37, type CUST)
//   2. attach the signed PDF to the customer as a document titled "Signed Agreement"
//
// Both writes commit immediately (no approval click) and are recorded as
// fieldroutes_write_queue rows (status committed/failed, decided_by auto_signed)
// so they appear in Admin → FieldRoutes Writes like every other write.
//
// Authorization is the REPORT ITSELF: the row must carry a customer signature
// and be linked to a FieldRoutes customer. Every write is deduped — at most one
// document per report and one flag per customer — so repeat calls are no-ops,
// never duplicates. A caller-supplied PDF additionally needs a known staff name
// (the customer-facing page never supplies one; the server stamps the PDF).
//
// Callers / request body:
//   save-customer-signature (customer signed remotely):
//     { reportId, documentSource: "stored" }
//       → PDF = the proposal PDF saved at email-send time + an appended
//         signature page (pdf-lib). No stored PDF → flag only, document
//         reported as "no_pdf" (the editor backstop picks it up later).
//   the editor (staff device, in-person signature or a signed report opened):
//     { reportId, documentSource: "none", staffName }     → flag + "is a document still needed?"
//     { reportId, documentSource: "provided", fileBase64, filename, staffName }
//       → PDF rendered on the device with the signature inline.
//
// Response: { ok, customerId, flag: {status,...}, document: {status,...}, needsDocument }
//   ok = nothing that was attempted failed. Skipped/deduped steps are still ok.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BUCKET = "fieldroutes-writes";
/** Where send-report-email keeps the most recently emailed proposal PDF. */
const STORED_PROPOSAL_PATH = (reportId: string) => `${reportId}/proposal-latest.pdf`;
/** FieldRoutes generic flag "Signed Agreement" (verified live 2026-06-03). */
const SIGNED_AGREEMENT_FLAG_ID = 37;
const DOCUMENT_DESCRIPTION = "Signed Agreement";
const MAX_PDF_BYTES = 12 * 1024 * 1024;

// Mirrors src/lib/staffRoster.ts / fieldroutes-customer-search.
const KNOWN_STAFF = new Set([
  "Darrell Tanner", "Jake Shubin", "Caleb Whalen", "Jackson Latham",
  "Dylan Gallegos", "Michael Muniz", "David Longoria", "Nick Stovall", "Cade Carnival", "Brock Lyttle", "Joseph Ibarbo",
]);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });
}

function b64ToBytes(b64: string): Uint8Array {
  const clean = b64.includes(",") ? b64.slice(b64.indexOf(",") + 1) : b64;
  const bin = atob(clean);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToB64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

function safeName(s: string): string {
  return (s || "report").replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
}

// ── Signature store (mirror of src/lib/proposalSignatures.ts, read-only) ──────
interface SignatureMeta { proposalName: string; proposalIndex: number; fingerprint: string; signedAt: string; source?: string }
interface SignatureStore { signatures: Record<string, string>; meta: Record<string, SignatureMeta>; legacy: string | null }

function parseSignatureStore(raw: string | null | undefined): SignatureStore {
  const store: SignatureStore = { signatures: {}, meta: {}, legacy: null };
  if (!raw) return store;
  if (!raw.trim().startsWith("{")) { store.legacy = raw; return store; }
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || !parsed._perProposal) { store.legacy = raw; return store; }
    const sigs = parsed.signatures && typeof parsed.signatures === "object" ? parsed.signatures : {};
    for (const [k, v] of Object.entries(sigs)) if (typeof v === "string" && v) store.signatures[String(parseInt(k, 10))] = v;
    const meta = parsed.meta && typeof parsed.meta === "object" ? parsed.meta : {};
    for (const [k, v] of Object.entries(meta)) {
      const m = v as Partial<SignatureMeta> | null;
      if (m && typeof m.fingerprint === "string") {
        store.meta[String(parseInt(k, 10))] = {
          proposalName: String(m.proposalName ?? ""), proposalIndex: Number(m.proposalIndex ?? parseInt(k, 10)),
          fingerprint: m.fingerprint, signedAt: String(m.signedAt ?? ""), source: m.source,
        };
      }
    }
    for (const k of Object.keys(store.meta)) if (!store.signatures[k]) delete store.meta[k];
    if (typeof parsed.legacy === "string" && parsed.legacy) store.legacy = parsed.legacy;
    return store;
  } catch { store.legacy = raw; return store; }
}

/** Every signature on the report, labelled by the option it was for. */
function signedEntries(store: SignatureStore): Array<{ label: string; signedAt: string; dataUrl: string }> {
  const out: Array<{ label: string; signedAt: string; dataUrl: string }> = [];
  for (const [k, dataUrl] of Object.entries(store.signatures)) {
    const m = store.meta[k];
    const idx = m?.proposalIndex ?? parseInt(k, 10);
    const fallback = `Option ${String.fromCharCode(65 + (Number.isFinite(idx) ? idx : 0))}`;
    const name = (m?.proposalName ?? "").trim();
    out.push({ label: name && name !== fallback ? `${name} (${fallback})` : fallback, signedAt: m?.signedAt ?? "", dataUrl });
  }
  if (out.length === 0 && store.legacy) out.push({ label: "Proposal", signedAt: "", dataUrl: store.legacy });
  return out;
}

// ── Signature page (remote signings: the emailed PDF has no signature on it) ──
// WinAnsi-safe text for the standard Helvetica fonts.
const ascii = (s: string) => (s || "").replace(/[^\x20-\x7E]/g, "").trim();
const fmtDate = (iso: string) => {
  const d = iso ? new Date(iso) : new Date();
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "America/Los_Angeles" });
};

async function appendSignaturePage(
  pdfBytes: Uint8Array,
  info: { customerName: string; address: string; title: string; signed: Array<{ label: string; signedAt: string; dataUrl: string }> },
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  const [ref] = doc.getPages();
  const { width, height } = ref ? ref.getSize() : { width: 841.89, height: 595.28 };
  const page = doc.addPage([width, height]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(42 / 255, 42 / 255, 42 / 255);
  const muted = rgb(110 / 255, 116 / 255, 110 / 255);
  const sage = rgb(195 / 255, 209 / 255, 197 / 255);
  const margin = 48;
  let y = height - margin;

  page.drawRectangle({ x: 0, y: height - 10, width, height: 10, color: sage });
  page.drawText("Signed Agreement", { x: margin, y: y - 22, size: 22, font: bold, color: ink });
  y -= 44;
  page.drawText(ascii(info.title) || "Proposal", { x: margin, y, size: 12, font, color: muted });
  y -= 26;
  if (info.customerName) { page.drawText(`Customer: ${ascii(info.customerName)}`, { x: margin, y, size: 12, font: bold, color: ink }); y -= 18; }
  if (info.address) { page.drawText(`Property: ${ascii(info.address)}`, { x: margin, y, size: 12, font, color: ink }); y -= 18; }
  page.drawLine({ start: { x: margin, y: y - 6 }, end: { x: width - margin, y: y - 6 }, thickness: 1, color: sage });
  y -= 30;

  for (const s of info.signed) {
    if (y < margin + 120) break; // keep to one page — the signature images are what matters
    page.drawText(ascii(s.label), { x: margin, y, size: 13, font: bold, color: ink });
    const when = fmtDate(s.signedAt);
    if (when) page.drawText(`Signed ${when}`, { x: margin, y: y - 16, size: 10, font, color: muted });
    let embedded: Awaited<ReturnType<typeof doc.embedPng>> | null = null;
    try {
      const bytes = b64ToBytes(s.dataUrl);
      embedded = /^data:image\/jpe?g/i.test(s.dataUrl) ? await doc.embedJpg(bytes) : await doc.embedPng(bytes);
    } catch (e) {
      console.warn("signature image embed failed", e);
    }
    const boxW = 300, boxH = 96;
    const boxY = y - 30 - boxH;
    page.drawRectangle({ x: margin, y: boxY, width: boxW, height: boxH, color: rgb(1, 1, 1), borderColor: sage, borderWidth: 1 });
    if (embedded) {
      const img = embedded.size();
      const scale = Math.min((boxW - 16) / img.width, (boxH - 16) / img.height);
      const w = img.width * scale, h = img.height * scale;
      page.drawImage(embedded, { x: margin + 8 + (boxW - 16 - w) / 2, y: boxY + 8 + (boxH - 16 - h) / 2, width: w, height: h });
    } else {
      page.drawText("(signature on file)", { x: margin + 12, y: boxY + boxH / 2 - 4, size: 10, font, color: muted });
    }
    y = boxY - 28;
  }

  page.drawText("Signed electronically through the Crest Pest Control customer proposal link.", {
    x: margin, y: margin - 10, size: 9, font, color: muted,
  });
  return await doc.save();
}

// ── Cloud Run commit + audit row ─────────────────────────────────────────────
type Sb = ReturnType<typeof createClient>;
interface CommitOutcome { status: "committed" | "failed"; error: string | null; result: unknown; id: string }

async function commitWrite(
  supabase: Sb,
  row: { entity: string; endpoint: string; payload: Record<string, unknown>; summary: string; requested_by: string },
  sendPayload: Record<string, unknown>,
): Promise<CommitOutcome> {
  const nowIso = new Date().toISOString();
  const { data: inserted, error: insErr } = await supabase
    .from("fieldroutes_write_queue")
    .insert({
      entity: row.entity, action: "create", endpoint: row.endpoint, payload: row.payload, summary: row.summary,
      status: "processing", requested_by: row.requested_by, decided_by: "auto_signed", decided_at: nowIso,
    })
    .select("id").single();
  if (insErr || !inserted) return { status: "failed", error: `enqueue_failed: ${insErr?.message ?? "no row"}`, result: null, id: "" };

  const apiUrl = Deno.env.get("SCHEDULING_API_URL");
  const apiKey = Deno.env.get("SCHEDULING_API_KEY");
  let status: "committed" | "failed" = "failed";
  let result: unknown = null;
  let errText: string | null = null;
  if (!apiUrl || !apiKey) {
    errText = "api_not_configured";
  } else {
    try {
      const upstream = await fetch(`${apiUrl.replace(/\/+$/, "")}${row.endpoint}`, {
        method: "POST",
        headers: { "X-API-Key": apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({ ...sendPayload, dry_run: false }),
      });
      const data = await upstream.json().catch(() => ({}));
      result = data;
      if (!upstream.ok) errText = `upstream_${upstream.status}`;
      else if (data?.forced_dry_run === true || data?.dry_run === true) errText = "server_write_disabled";
      else if (data?.ok === false) errText = String(data?.error ?? "fieldroutes_error");
      else status = "committed";
    } catch (e) {
      errText = `request_failed: ${String(e)}`;
    }
  }
  await supabase.from("fieldroutes_write_queue").update({ status, result, error: errText }).eq("id", inserted.id);
  return { status, error: errText, result, id: inserted.id };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  try {
    const body = await req.json().catch(() => ({}));
    const reportId = String(body?.reportId ?? "").trim();
    const documentSource = String(body?.documentSource ?? "none") as "stored" | "provided" | "none";
    const fileBase64 = typeof body?.fileBase64 === "string" ? body.fileBase64 : "";
    const filenameRaw = String(body?.filename ?? "").trim();
    const staffName = String(body?.staffName ?? "").trim();
    const source = String(body?.source ?? (documentSource === "stored" ? "customer" : "editor")).trim();

    if (!reportId) return json({ ok: false, error: "missing_report_id" }, 400);
    if (!["stored", "provided", "none"].includes(documentSource)) return json({ ok: false, error: "bad_document_source" }, 400);
    if (documentSource === "provided") {
      if (!staffName || !KNOWN_STAFF.has(staffName)) return json({ ok: false, error: "unknown_staff" }, 401);
      if (!fileBase64) return json({ ok: false, error: "missing_file" }, 400);
    }

    // The report is the authorization: signed + linked, or nothing happens.
    const { data: report, error: rErr } = await supabase
      .from("reports")
      .select("id, customer_name, address, report_title, customer_signature, fieldroutes_customer_id")
      .eq("id", reportId)
      .maybeSingle();
    if (rErr || !report) return json({ ok: false, error: "report_not_found" }, 404);

    const store = parseSignatureStore(report.customer_signature as string | null);
    const signed = signedEntries(store);
    if (signed.length === 0) return json({ ok: false, error: "not_signed" });

    const customerId = Number(String(report.fieldroutes_customer_id ?? "").trim());
    if (!Number.isFinite(customerId) || customerId <= 0) return json({ ok: false, error: "no_customer", needsCustomerLink: true });

    const requestedBy = source === "customer" ? "customer_signature" : `auto_signed:${staffName || "staff"}`;
    const customerLabel = String(report.customer_name ?? "").trim() || `Customer ${customerId}`;

    // ── 1. "Signed Agreement" flag — once per customer ─────────────────────
    let flag: Record<string, unknown>;
    {
      const { data: existing } = await supabase
        .from("fieldroutes_write_queue")
        .select("id, status")
        .eq("entity", "customer_flag")
        .in("status", ["processing", "committed"])
        .filter("payload->>customer_id", "eq", String(customerId))
        .filter("payload->>generic_flag_id", "eq", String(SIGNED_AGREEMENT_FLAG_ID))
        .limit(1);
      if (existing && existing.length > 0) {
        flag = { status: "deduped", existing: existing[0].id };
      } else {
        const payload = { customer_id: customerId, generic_flag_id: SIGNED_AGREEMENT_FLAG_ID, flag_type: "CUST", assign: true, report_id: reportId };
        const { report_id: _omit, ...sendPayload } = payload;
        const out = await commitWrite(
          supabase,
          { entity: "customer_flag", endpoint: "/api/fr/customer-flag", payload, requested_by: requestedBy,
            summary: `Flag "Signed Agreement" → ${customerLabel} (#${customerId})` },
          sendPayload,
        );
        flag = { status: out.status, error: out.error, id: out.id };
      }
    }

    // ── 2. Signed PDF document — once per report ───────────────────────────
    let document: Record<string, unknown>;
    let needsDocument = false;
    {
      const { data: existing } = await supabase
        .from("fieldroutes_write_queue")
        .select("id, status")
        .eq("entity", "document")
        .in("status", ["pending", "processing", "committed"])
        .filter("payload->>report_id", "eq", reportId)
        .limit(1);
      if (existing && existing.length > 0) {
        document = { status: "deduped", existing: existing[0].id };
      } else if (documentSource === "none") {
        needsDocument = true;
        document = { status: "needed" };
      } else {
        let bytes: Uint8Array | null = null;
        let stamped = false;
        if (documentSource === "provided") {
          try { bytes = b64ToBytes(fileBase64); } catch { return json({ ok: false, error: "bad_base64" }, 400); }
        } else {
          const { data: file } = await supabase.storage.from(BUCKET).download(STORED_PROPOSAL_PATH(reportId));
          if (file) {
            const raw = new Uint8Array(await file.arrayBuffer());
            try {
              bytes = await appendSignaturePage(raw, {
                customerName: String(report.customer_name ?? ""), address: String(report.address ?? ""),
                title: String(report.report_title ?? "Pest Control Proposal"), signed,
              });
              stamped = true;
            } catch (e) {
              console.warn("signature page failed; uploading the emailed PDF as-is", e);
              bytes = raw;
            }
          }
        }

        if (!bytes || bytes.byteLength < 100) {
          needsDocument = true;
          document = { status: "no_pdf" };
        } else if (bytes.byteLength > MAX_PDF_BYTES) {
          document = { status: "failed", error: "file_too_large" };
        } else {
          const filename = safeName(
            (filenameRaw || `Crest_${String(report.customer_name ?? "Customer").replace(/\s+/g, "_")}_Signed_Agreement`).replace(/\.pdf$/i, "") + ".pdf",
          );
          const storagePath = `${reportId}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}-${filename}`;
          const { error: upErr } = await supabase.storage.from(BUCKET).upload(storagePath, bytes, { contentType: "application/pdf", upsert: false });
          if (upErr) {
            document = { status: "failed", error: `storage_upload_failed: ${upErr.message}` };
          } else {
            const payload = {
              customer_id: customerId, description: DOCUMENT_DESCRIPTION, show_customer: false,
              storage_bucket: BUCKET, storage_path: storagePath, filename, report_id: reportId,
              signature_page_appended: stamped,
            };
            const out = await commitWrite(
              supabase,
              { entity: "document", endpoint: "/api/fr/document", payload, requested_by: requestedBy,
                summary: `Document → ${customerLabel} (#${customerId}): "${DOCUMENT_DESCRIPTION}" (${(bytes.byteLength / 1024).toFixed(0)} KB)` },
              { customer_id: customerId, description: DOCUMENT_DESCRIPTION, show_customer: false, file_base64: bytesToB64(bytes) },
            );
            document = { status: out.status, error: out.error, id: out.id, signaturePageAppended: stamped };
          }
        }
      }
    }

    const failed = [flag, document].some((r) => r.status === "failed");
    return json({ ok: !failed, reportId, customerId, flag, document, needsDocument });
  } catch (e) {
    console.error("fieldroutes-signed-agreement-push exception", e);
    return json({ ok: false, error: "exception", detail: String(e) });
  }
});
