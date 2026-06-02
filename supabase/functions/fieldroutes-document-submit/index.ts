// supabase/functions/fieldroutes-document-submit
// SUBMIT a "upload document" write to the FieldRoutes approval queue.
//
// Used to push a completed report's PDF (signed sales proposal / finished
// inspection report) back onto the customer in FieldRoutes. Like note-submit,
// this does NOT write to FieldRoutes — it stores the PDF in the private
// `fieldroutes-writes` storage bucket and inserts a PENDING row into
// public.fieldroutes_write_queue. The write only happens when an admin approves
// it via fieldroutes-queue-decide (which fetches the PDF and forwards it).
//
// The base64 PDF is kept OUT of the queue row (the approval UI renders the row
// payload as JSON) — only the storage path goes in the payload.
//
// Writes require a valid ADMIN SESSION TOKEN (no staff-name fallback).
//
// Request body:
//   { sessionToken, customerID, fileBase64, filename, description,
//     reportId?, showCustomer? }

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BUCKET = "fieldroutes-writes";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });
}

// base64 (no data: prefix) -> bytes.
function b64ToBytes(b64: string): Uint8Array {
  const clean = b64.includes(",") ? b64.slice(b64.indexOf(",") + 1) : b64;
  const bin = atob(clean);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function safeName(s: string): string {
  return (s || "report").replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const body = await req.json().catch(() => ({}));
    const sessionToken = String(body?.sessionToken ?? "").trim();
    const customerID = Number(body?.customerID ?? 0);
    const fileBase64 = String(body?.fileBase64 ?? "");
    const filenameRaw = String(body?.filename ?? "report.pdf").trim();
    const description = String(body?.description ?? "").trim();
    const reportId = body?.reportId ? String(body.reportId).trim() : null;
    const showCustomer = body?.showCustomer === true;

    // Auth: a valid, unexpired admin session is required to queue a write.
    if (!sessionToken) return json({ ok: false, error: "missing_session" }, 401);
    const { data: session } = await supabase
      .from("admin_sessions")
      .select("id")
      .eq("session_token", sessionToken)
      .eq("is_valid", true)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();
    if (!session) return json({ ok: false, error: "invalid_session" }, 401);
    const requestedBy = "admin_session";

    // Validation.
    if (!customerID || customerID <= 0) return json({ ok: false, error: "missing_customer_id" }, 400);
    if (fileBase64.length < 1) return json({ ok: false, error: "missing_file" }, 400);
    if (description.length < 1) return json({ ok: false, error: "missing_description" }, 400);

    // Idempotency: never queue the same report's PDF twice. If an active
    // (pending/processing/committed) document upload already exists for this
    // report, no-op. This makes the triggers (sign / complete, which can fire
    // more than once) safe — only a prior reject/fail lets it re-queue.
    if (reportId) {
      const { data: dupes } = await supabase
        .from("fieldroutes_write_queue")
        .select("id, status")
        .eq("entity", "document")
        .in("status", ["pending", "processing", "committed"])
        .filter("payload->>report_id", "eq", reportId);
      if (dupes && dupes.length > 0) {
        return json({ ok: true, deduped: true, existing: dupes[0] });
      }
    }

    // Decode + store the PDF in the private bucket. Path namespaced by report.
    let bytes: Uint8Array;
    try {
      bytes = b64ToBytes(fileBase64);
    } catch {
      return json({ ok: false, error: "bad_base64" }, 400);
    }
    if (bytes.byteLength < 100) return json({ ok: false, error: "file_too_small" }, 400);

    const filename = safeName(filenameRaw.endsWith(".pdf") ? filenameRaw : `${filenameRaw}.pdf`);
    const stamp = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
    const storagePath = `${reportId ?? "unlinked"}/${stamp}-${filename}`;

    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, bytes, { contentType: "application/pdf", upsert: false });
    if (upErr) {
      console.error("fieldroutes-document-submit upload error", upErr);
      return json({ ok: false, error: "storage_upload_failed", detail: upErr.message }, 500);
    }

    // Queue payload: NO base64 here. customer_id/description/show_customer match
    // the Cloud Run CreateDocumentRequest; queue-decide adds file_base64 from
    // storage at approve-time. storage_* fields tell it where to find the PDF.
    const payload = {
      customer_id: customerID,
      description,
      show_customer: showCustomer,
      storage_bucket: BUCKET,
      storage_path: storagePath,
      filename,
      report_id: reportId,
    };

    const summary = `Document → Customer ${customerID}: "${description}" (${(bytes.byteLength / 1024).toFixed(0)} KB)`;

    const { data: row, error } = await supabase
      .from("fieldroutes_write_queue")
      .insert({
        entity: "document",
        action: "create",
        endpoint: "/api/fr/document",
        payload,
        summary,
        status: "pending",
        requested_by: requestedBy,
      })
      .select("id, status, summary, requested_at")
      .single();

    if (error) {
      console.error("fieldroutes-document-submit insert error", error);
      // Best-effort cleanup so we don't orphan the file if the row failed.
      await supabase.storage.from(BUCKET).remove([storagePath]);
      return json({ ok: false, error: "enqueue_failed", detail: error.message }, 500);
    }

    return json({ ok: true, queued: row });
  } catch (e) {
    console.error("fieldroutes-document-submit exception", e);
    return json({ ok: false, error: "exception", detail: String(e) });
  }
});
