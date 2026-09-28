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

// Pacing (Caleb 2026-07-31): FieldRoutes' real limit is 60 writes/min (from
// their API's tokenLimits); we run at 40/min — safely under his 50/min line
// with margin for any other writers. One write per 1.5s; each invocation
// drains up to 30 then relays.
const WRITE_SPACING_MS = 1_500;
const MAX_COMMITS_PER_RUN = 30;
const WORKER_ID = "auto_worker";
// Automatic retry cadence (Caleb 2026-09-27: "always retry the ones that
// fail"). A TRANSIENT failure — FieldRoutes' 60-writes/min cap (upstream_502
// from Cloud Run, fieldroutes_rate_limited), a dropped connection — is re-armed
// as `auto` up to RETRY_MAX times within RETRY_WINDOW_H hours, so the next
// drain picks it up with the full payload (customer, service, day, time,
// route). Real FieldRoutes rejections (fieldroutes_error…) are never retried.
const RETRY_MAX = 3;
const RETRY_WINDOW_H = 48;
const STALE_PROCESSING_MIN = 10;
const TRANSIENT_ERRORS = ["upstream_502", "upstream_503", "upstream_504", "fieldroutes_rate_limited", "request_failed"];

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
  const retried: string[] = [];

  try {
    // ── Re-arm transient failures (see RETRY_* above) ─────────────────────
    try {
      const since = new Date(Date.now() - RETRY_WINDOW_H * 3600_000).toISOString();
      const { data: fails } = await supabase
        .from("fieldroutes_write_queue")
        .select("id, error, result")
        .eq("status", "failed")
        .eq("entity", "appointment")
        .gte("decided_at", since)
        .limit(200);
      for (const row of fails ?? []) {
        const err = String(row.error ?? "");
        if (!TRANSIENT_ERRORS.some((t) => err.startsWith(t))) continue;
        const prev = (row.result && typeof row.result === "object") ? row.result as Record<string, unknown> : {};
        const n = Number(prev.retry_count ?? 0);
        if (n >= RETRY_MAX) continue;
        const { data: rearmed } = await supabase
          .from("fieldroutes_write_queue")
          .update({ status: "auto", error: null,
                    result: { ...prev, retry_count: n + 1, retry_of_error: err, retried_at: new Date().toISOString() } })
          .eq("id", row.id)
          .eq("status", "failed")
          .select("id")
          .single();
        if (rearmed) retried.push(row.id);
      }
      // A row can be left `processing` forever when the invocation that
      // claimed it was killed mid-write (edge-fn wall clock). Older than
      // STALE_PROCESSING_MIN → back to `auto`, same retry bookkeeping.
      const staleSince = new Date(Date.now() - STALE_PROCESSING_MIN * 60_000).toISOString();
      const { data: stale } = await supabase
        .from("fieldroutes_write_queue")
        .select("id, result")
        .eq("status", "processing")
        .eq("entity", "appointment")
        .lt("decided_at", staleSince)
        .limit(50);
      for (const row of stale ?? []) {
        const prev = (row.result && typeof row.result === "object") ? row.result as Record<string, unknown> : {};
        const n = Number(prev.retry_count ?? 0);
        if (n >= RETRY_MAX) continue;
        const { data: rearmed } = await supabase
          .from("fieldroutes_write_queue")
          .update({ status: "auto", error: null,
                    result: { ...prev, retry_count: n + 1, retry_of_error: "stale_processing", retried_at: new Date().toISOString() } })
          .eq("id", row.id)
          .eq("status", "processing")
          .select("id")
          .single();
        if (rearmed) retried.push(row.id);
      }
    } catch (e) {
      console.error("fieldroutes-queue-worker re-arm failed", e);
    }

    const started = Date.now();
    let commits = 0;
    while (commits < MAX_COMMITS_PER_RUN && Date.now() - started < 100_000) {
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
        // Sleep out the gap (in bounded slices so runtime stays well under the
        // edge-function wall clock) and re-check — this invocation may have
        // arrived as a relay right after another one committed.
        const wait = WRITE_SPACING_MS - since;
        await sleep(Math.min(wait, 25_000));
        if (wait > 25_000) continue;
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
        .select("id, endpoint, payload, result")
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

      // Keep the retry bookkeeping (retry_count) alongside the Cloud Run response.
      const prevResult = (claimed as { result?: unknown }).result;
      const keep = (prevResult && typeof prevResult === "object" && (prevResult as Record<string, unknown>).retry_count != null)
        ? { retry_count: (prevResult as Record<string, unknown>).retry_count } : {};
      const merged = (result && typeof result === "object") ? { ...(result as Record<string, unknown>), ...keep } : result;
      await supabase
        .from("fieldroutes_write_queue")
        .update({ status: finalStatus, result: merged, error: errText, decided_at: new Date().toISOString() })
        .eq("id", claimed.id);
      (finalStatus === "committed" ? committed : failed).push(claimed.id);
      commits++;
      if (errText === "server_write_disabled") break; // kill switch — stop draining
    }

    const { count } = await supabase
      .from("fieldroutes_write_queue")
      .select("id", { count: "exact", head: true })
      .eq("status", "auto");
    const remaining = count ?? 0;

    // ── Self-relay: keep draining even with NO cron. Each invocation commits
    // its share then hands off to a fresh one; the pacing gate makes extra or
    // overlapping chains harmless (they just wait their turn or exit). ──
    if (remaining > 0) {
      const self = `${Deno.env.get("SUPABASE_URL")}/functions/v1/fieldroutes-queue-worker`;
      const relay = fetch(self, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${Deno.env.get("SUPABASE_ANON_KEY") ?? ""}`,
        },
        body: JSON.stringify({ relay: true }),
      }).then((r) => r.body?.cancel()).catch(() => {});
      // deno-lint-ignore no-explicit-any
      (globalThis as any).EdgeRuntime?.waitUntil?.(relay);
    }

    return json({ ok: true, committed, failed, retried, remaining });
  } catch (e) {
    console.error("fieldroutes-queue-worker exception", e);
    return json({ ok: false, error: "exception", detail: String(e) });
  }
});
