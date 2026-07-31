// supabase/functions/fieldroutes-queue-worker
// Drains the paced FieldRoutes write queue: commits ONE 'auto' row every
// WRITE_SPACING_MS (30s), at most two per invocation. Triggered every minute
// by pg_cron (see 20260731090000_fieldroutes_paced_queue.sql) and "kicked"
// once by the app right after enqueueing so the first write goes out
// immediately.
//
// Rate-safety is enforced FROM DATA, not from trigger cadence: before every
// commit the worker checks the most recent auto commit's decided_at and
// waits/exits until 30s have passed — so overlapping invocations, spammed
// kicks, or a misfiring cron can never exceed ~2 writes/minute (FieldRoutes
// tolerates ~50/min; we stay far under it).
//
// Failed rows stay 'failed' (visible in the audit trail) and are NOT retried
// automatically — an ambiguous failure retried blindly could double-book an
// appointment.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const WRITE_SPACING_MS = 30_000;
const MAX_COMMITS_PER_RUN = 2;
const WORKER_ID = "auto_worker";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const apiUrl = Deno.env.get("SCHEDULING_API_URL");
  const apiKey = Deno.env.get("SCHEDULING_API_KEY");
  if (!apiUrl || !apiKey) return json({ ok: false, error: "api_not_configured" }, 500);

  const committed: string[] = [];
  const failed: string[] = [];

  try {
    for (let i = 0; i < MAX_COMMITS_PER_RUN; i++) {
      // ── Pacing gate: 30s since the last auto commit OR claim ──────────────
      // 'processing' rows claimed by the worker count too, so two overlapping
      // invocations can't both slip through the gate.
      const { data: lastRows } = await supabase
        .from("fieldroutes_write_queue")
        .select("decided_at")
        .eq("decided_by", WORKER_ID)
        .in("status", ["committed", "processing", "failed"])
        .order("decided_at", { ascending: false })
        .limit(1);
      const lastAt = lastRows?.[0]?.decided_at ? new Date(lastRows[0].decided_at).getTime() : 0;
      const since = Date.now() - lastAt;
      if (since < WRITE_SPACING_MS) {
        const wait = WRITE_SPACING_MS - since;
        // Long waits are the next invocation's job (cron fires every minute).
        if (wait > 26_000) break;
        await sleep(wait);
      }

      // ── Claim the oldest 'auto' row (atomic via the status transition) ────
      const { data: candidates } = await supabase
        .from("fieldroutes_write_queue")
        .select("id")
        .eq("status", "auto")
        .order("requested_at", { ascending: true })
        .limit(1);
      const nextId = candidates?.[0]?.id;
      if (!nextId) break;
      const { data: claimed } = await supabase
        .from("fieldroutes_write_queue")
        .update({ status: "processing", decided_by: WORKER_ID, decided_at: new Date().toISOString() })
        .eq("id", nextId)
        .eq("status", "auto")
        .select("id, endpoint, payload")
        .single();
      if (!claimed) continue; // raced by another invocation — re-check the gate

      // ── Commit to FieldRoutes through Cloud Run ───────────────────────────
      let finalStatus = "failed";
      let result: unknown = null;
      let errText: string | null = null;
      try {
        const upstream = await fetch(`${apiUrl.replace(/\/+$/, "")}${claimed.endpoint}`, {
          method: "POST",
          headers: { "X-API-Key": apiKey, "Content-Type": "application/json" },
          body: JSON.stringify({ ...(claimed.payload as Record<string, unknown>), dry_run: false }),
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

      await supabase
        .from("fieldroutes_write_queue")
        .update({ status: finalStatus, result, error: errText, decided_at: new Date().toISOString() })
        .eq("id", claimed.id);
      (finalStatus === "committed" ? committed : failed).push(claimed.id);
      if (errText === "server_write_disabled") break; // kill switch — stop draining
    }

    const { count } = await supabase
      .from("fieldroutes_write_queue")
      .select("id", { count: "exact", head: true })
      .eq("status", "auto");
    return json({ ok: true, committed, failed, remaining: count ?? 0 });
  } catch (e) {
    console.error("fieldroutes-queue-worker exception", e);
    return json({ ok: false, error: "exception", detail: String(e) });
  }
});
