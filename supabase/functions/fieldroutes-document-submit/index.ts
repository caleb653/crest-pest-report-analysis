// supabase/functions/fieldroutes-document-submit
// SUBMIT a "upload document" write to FieldRoutes.
//
// Default mode: stores the PDF and inserts a PENDING row in the approval queue.
// `autoApprove: true` mode: stores the PDF, forwards to Cloud Run immediately
//   (dry_run:false), and records the row as `committed`/`failed`. Used for
//   signed agreements which should reach FieldRoutes without admin approval.
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
    const autoApprove = body?.autoApprove === true;

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

    const initialStatus = autoApprove ? "processing" : "pending";
    const { data: row, error } = await supabase
      .from("fieldroutes_write_queue")
      .insert({
        entity: "document",
        action: "create",
        endpoint: "/api/fr/document",
        payload,
        summary,
        status: initialStatus,
        requested_by: requestedBy,
        decided_by: autoApprove ? "auto_signed" : null,
        decided_at: autoApprove ? new Date().toISOString() : null,
      })
      .select("id, status, summary, requested_at")
      .single();

    if (error) {
      console.error("fieldroutes-document-submit insert error", error);
      // Best-effort cleanup so we don't orphan the file if the row failed.
      await supabase.storage.from(BUCKET).remove([storagePath]);
      return json({ ok: false, error: "enqueue_failed", detail: error.message }, 500);
    }

    // Direct-commit path for signed agreements (no admin approval needed).
    if (autoApprove) {
      const apiUrl = Deno.env.get("SCHEDULING_API_URL");
      const apiKey = Deno.env.get("SCHEDULING_API_KEY");
      if (!apiUrl || !apiKey) {
        await supabase.from("fieldroutes_write_queue")
          .update({ status: "failed", error: "api_not_configured" }).eq("id", row.id);
        return json({ ok: false, error: "api_not_configured" }, 500);
      }
      // Convert stored bytes → base64 for Cloud Run.
      let bin = "";
      const chunk = 0x8000;
      for (let i = 0; i < bytes.length; i += chunk) {
        bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
      }
      const sendPayload = {
        customer_id: customerID,
        description,
        show_customer: showCustomer,
        file_base64: btoa(bin),
      };
      let finalStatus = "failed";
      let result: unknown = null;
      let errText: string | null = null;
      try {
        const upstream = await fetch(`${apiUrl.replace(/\/+$/, "")}/api/fr/document`, {
          method: "POST",
          headers: { "X-API-Key": apiKey, "Content-Type": "application/json" },
          body: JSON.stringify({ ...sendPayload, dry_run: false }),
        });
        const data = await upstream.json().catch(() => ({}));
        result = data;
        if (!upstream.ok) errText = `upstream_${upstream.status}`;
        else if (data?.forced_dry_run === true || data?.dry_run === true) errText = "server_write_disabled";
        else if (data?.ok === false) errText = String(data?.error ?? "fieldroutes_error");
        else finalStatus = "committed";
      } catch (e) {
        errText = `request_failed: ${String(e)}`;
      }
      await supabase.from("fieldroutes_write_queue")
        .update({ status: finalStatus, result, error: errText })
        .eq("id", row.id);
      return json({ ok: finalStatus === "committed", autoApproved: true, id: row.id, status: finalStatus, error: errText });
    }

    return json({ ok: true, queued: row });
  } catch (e) {
    console.error("fieldroutes-document-submit exception", e);
    return json({ ok: false, error: "exception", detail: String(e) });
  }
});
