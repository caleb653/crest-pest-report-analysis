// One-shot backfill: for every report that has a fieldroutes_customer_id but no
// per-customer FieldPortals loginLink stored, look the customer up through the
// scheduling API (same proxy CustomerPicker uses) and stamp the real loginLink
// onto customer_preferences.fieldroutes_login_link.
//
// Safe to re-run: skips reports that already have a link, only writes when the
// upstream result's customer_id matches what's already on the report.
//
// Auth: shared admin password (header x-admin-password) — same gate used for
// other destructive admin operations in this project.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-admin-password",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });
}

async function frSearch(apiUrl: string, apiKey: string, q: string) {
  if (!q || q.length < 2) return [] as Array<Record<string, unknown>>;
  try {
    const res = await fetch(`${apiUrl.replace(/\/+$/, "")}/api/fr/customer-search`, {
      method: "POST",
      headers: { "X-API-Key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ q, limit: 25, active_only: false }),
    });
    if (!res.ok) return [];
    const body = await res.json().catch(() => ({}));
    return (body?.results ?? []) as Array<Record<string, unknown>>;
  } catch {
    return [];
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const adminPw = Deno.env.get("ADMIN_PASSWORD");
  const provided = req.headers.get("x-admin-password") ?? "";
  if (!adminPw || provided !== adminPw) return json({ ok: false, error: "unauthorized" }, 401);

  const apiUrl = Deno.env.get("SCHEDULING_API_URL");
  const apiKey = Deno.env.get("SCHEDULING_API_KEY");
  if (!apiUrl || !apiKey) return json({ ok: false, error: "scheduling_api_not_configured" }, 500);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const dryRun = body?.dryRun === true;
  const overwrite = body?.overwrite === true; // re-stamp even if a link already exists
  const limit = Number.isFinite(body?.limit as number) ? Math.max(1, Math.trunc(body?.limit as number)) : 1000;

  const { data: reports, error } = await supabase
    .from("reports")
    .select("id, customer_name, customer_email, address, fieldroutes_customer_id, customer_preferences")
    .not("fieldroutes_customer_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) return json({ ok: false, error: "query_failed", detail: error.message }, 500);

  const results = {
    scanned: 0,
    skipped_has_link: 0,
    updated: 0,
    not_found: 0,
    errors: 0,
    samples: [] as Array<Record<string, unknown>>,
  };

  // Cache lookups by customer_id within this run.
  const linkByCustomerId = new Map<string, string | null>();

  for (const r of reports ?? []) {
    results.scanned++;
    const prefs = (r.customer_preferences ?? {}) as Record<string, unknown>;
    const existing = String(prefs.fieldroutes_login_link ?? "").trim();
    if (existing && !overwrite) { results.skipped_has_link++; continue; }

    const targetId = String(r.fieldroutes_customer_id);
    let link: string | null | undefined = linkByCustomerId.get(targetId);

    if (link === undefined) {
      // Try email, then name, then street — accept only a result whose
      // customer_id matches the one already on the report.
      const queries: string[] = [];
      if (r.customer_email) queries.push(String(r.customer_email).trim());
      if (r.customer_name) queries.push(String(r.customer_name).trim());
      const street = String(r.address ?? "").split(",")[0].trim();
      if (street.length >= 4) queries.push(street);

      let found: string | null = null;
      for (const q of queries) {
        const rows = await frSearch(apiUrl, apiKey, q);
        const hit = rows.find((row) => String(row.customer_id ?? "") === targetId);
        if (hit) {
          const ll = (hit.loginLink as string | null | undefined) ?? null;
          found = ll && String(ll).trim() ? String(ll).trim() : null;
          break;
        }
      }
      link = found;
      linkByCustomerId.set(targetId, link);
    }

    if (!link) { results.not_found++; continue; }

    if (dryRun) {
      results.updated++;
      if (results.samples.length < 5) results.samples.push({ id: r.id, link });
      continue;
    }

    const nextPrefs = { ...prefs, fieldroutes_login_link: link };
    const { error: upErr } = await supabase
      .from("reports")
      .update({ customer_preferences: nextPrefs })
      .eq("id", r.id);
    if (upErr) {
      results.errors++;
      console.error("backfill update failed", { id: r.id, error: upErr.message });
      continue;
    }
    results.updated++;
    if (results.samples.length < 5) results.samples.push({ id: r.id, link });
  }

  return json({ ok: true, dryRun, overwrite, ...results });
});