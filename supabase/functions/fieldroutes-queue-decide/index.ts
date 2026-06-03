// supabase/functions/fieldroutes-queue-decide
// Approve or reject ONE queued FieldRoutes write. This is the human gate: a
// write only reaches FieldRoutes when an admin approves its specific row here.
//
//   action: "reject"  → mark the row rejected; never sent.
//   action: "approve" → atomically claim the pending row, forward its payload to
//                        Cloud Run with dry_run:false, and record committed/failed.
//
// The row is claimed (pending → processing) with a conditional update before the
// Cloud Run call, so two admins clicking Approve at the same time can't double-write.
//
// Required Supabase secrets:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (auto)
//   SCHEDULING_API_URL  Cloud Run service URL
//   SCHEDULING_API_KEY  Shared secret for Cloud Run
//
// Request body: { sessionToken, id, action }

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });
}

// bytes -> base64, chunked so a large PDF doesn't blow the call stack.
function bytesToB64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
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
    const id = String(body?.id ?? "").trim();
    const action = String(body?.action ?? "").trim();

    // Expired local admin sessions are expected in the browser. Return a normal
    // JSON verdict so the UI can clear local storage without surfacing a hard
    // Edge Function runtime error.
    if (!sessionToken) return json({ ok: false, error: "missing_session" });
    const { data: session } = await supabase
      .from("admin_sessions")
      .select("id")
      .eq("session_token", sessionToken)
      .eq("is_valid", true)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();
    if (!session) return json({ ok: false, error: "invalid_session" });
    const decidedBy = "admin_session";

    if (!id) return json({ ok: false, error: "missing_id" }, 400);
    if (action !== "approve" && action !== "reject") {
      return json({ ok: false, error: "bad_action" }, 400);
    }

    const nowIso = new Date().toISOString();

    // ── Reject ────────────────────────────────────────────────────────────
    if (action === "reject") {
      const { data, error } = await supabase
        .from("fieldroutes_write_queue")
        .update({ status: "rejected", decided_by: decidedBy, decided_at: nowIso })
        .eq("id", id).eq("status", "pending")
        .select("id, status").maybeSingle();
      if (error) return json({ ok: false, error: "reject_failed", detail: error.message }, 500);
      if (!data) return json({ ok: false, error: "not_pending" }, 409); // already decided / gone
      return json({ ok: true, id, status: "rejected" });
    }

    // ── Approve ───────────────────────────────────────────────────────────
    // 1) Claim the row: pending → processing. The status filter makes this the
    //    atomic gate; if another request already claimed it, no row comes back.
    const { data: claimed, error: claimErr } = await supabase
      .from("fieldroutes_write_queue")
      .update({ status: "processing", decided_by: decidedBy, decided_at: nowIso })
      .eq("id", id).eq("status", "pending")
      .select("id, endpoint, payload").maybeSingle();
    if (claimErr) return json({ ok: false, error: "claim_failed", detail: claimErr.message }, 500);
    if (!claimed) return json({ ok: false, error: "not_pending" }, 409);

    const apiUrl = Deno.env.get("SCHEDULING_API_URL");
    const apiKey = Deno.env.get("SCHEDULING_API_KEY");
    if (!apiUrl || !apiKey) {
      await supabase.from("fieldroutes_write_queue")
        .update({ status: "failed", error: "api_not_configured" }).eq("id", id);
      return json({ ok: false, error: "api_not_configured" }, 500);
    }

    // 2) Commit to FieldRoutes via Cloud Run (dry_run:false = real write).
    let finalStatus = "failed";
    let result: unknown = null;
    let errText: string | null = null;

    // Document rows keep the PDF in Storage (not in the row). Resolve it now:
    // download the file, base64 it, and swap the storage_* refs for file_base64
    // so Cloud Run /api/fr/document gets the bytes. Other entities pass through.
    const sendPayload: Record<string, unknown> = { ...(claimed as { payload: Record<string, unknown> }).payload };
    const storageBucket = sendPayload.storage_bucket as string | undefined;
    const storagePath = sendPayload.storage_path as string | undefined;
    if (storagePath) {
      const { data: file, error: dlErr } = await supabase.storage
        .from(storageBucket ?? "fieldroutes-writes")
        .download(storagePath);
      if (dlErr || !file) {
        await supabase.from("fieldroutes_write_queue")
          .update({ status: "failed", error: `storage_download_failed: ${dlErr?.message ?? "missing"}` })
          .eq("id", id);
        return json({ ok: false, error: "storage_download_failed", detail: dlErr?.message }, 500);
      }
      sendPayload.file_base64 = bytesToB64(new Uint8Array(await file.arrayBuffer()));
      delete sendPayload.storage_bucket;
      delete sendPayload.storage_path;
      delete sendPayload.filename;
    }

    try {
      const upstream = await fetch(`${apiUrl.replace(/\/+$/, "")}${(claimed as { endpoint: string }).endpoint}`, {
        method: "POST",
        headers: { "X-API-Key": apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({ ...sendPayload, dry_run: false }),
      });
      const data = await upstream.json().catch(() => ({}));
      result = data;
      if (!upstream.ok) {
        errText = `upstream_${upstream.status}`;
      } else if (data?.forced_dry_run === true || data?.dry_run === true) {
        // Server kill switch (FR_WRITE_ENABLED) is off — the write did NOT happen.
        errText = "server_write_disabled";
      } else if (data?.ok === false) {
        errText = String(data?.error ?? "fieldroutes_error");
      } else {
        finalStatus = "committed";
      }
    } catch (e) {
      errText = `request_failed: ${String(e)}`;
    }

    const { data: updated } = await supabase
      .from("fieldroutes_write_queue")
      .update({ status: finalStatus, result, error: errText })
      .eq("id", id)
      .select("id, status, error, result").maybeSingle();

    return json({
      ok: finalStatus === "committed",
      id,
      status: finalStatus,
      error: errText,
      result,
      row: updated,
    });
  } catch (e) {
    console.error("fieldroutes-queue-decide exception", e);
    return json({ ok: false, error: "exception", detail: String(e) });
  }
});
