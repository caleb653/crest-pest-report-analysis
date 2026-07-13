// supabase/functions/fieldroutes-sync-inspections
// Auto-create draft Initial Pest Reports from scheduled FieldRoutes inspections.
//
// Pulls Pest/Rodent Inspection appointments (from Cloud Run /api/fr/new-inspections),
// skips any we've already turned into a report (reports.fieldroutes_appointment_id),
// and inserts a draft Initial Pest Report for each new one — pre-filled with the
// customer's name/email/phone/address and linked by fieldroutes_customer_id +
// fieldroutes_appointment_id. Idempotent: safe to run on a schedule.
//
// Auth (either):
//   - header  x-sync-key: <INSPECTION_SYNC_KEY>     (for the scheduler/cron)
//   - body    { sessionToken }  = valid admin session (for a manual "Sync now")
//   - body    { staffName }     = known PinGate staff login (for staff report list)
//
// Required Supabase secrets:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (auto)
//   SCHEDULING_API_URL, SCHEDULING_API_KEY
//   INSPECTION_SYNC_KEY (optional; needed for unattended/cron calls)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-sync-key",
};

const KNOWN_STAFF = new Set([
  "Darrell Tanner",
  "Jake Shubin",
  "Caleb Whalen",
  "Jackson Latham",
  "Dylan Gallegos",
  "Michael Muniz",
  "Carmen Lopez",
  "David Longoria",
  "Nick Stovall",
]);

// Whitelist of FieldRoutes service_type IDs that are true inspection appointments.
// Anything else (Initial Service, Monthly/Bi-Monthly/Quarterly recurring, Commercial,
// Rodent Bait Boxes, etc.) must NEVER auto-create a report, no matter what the
// upstream endpoint returns or how the service is named.
const INSPECTION_SERVICE_TYPE_IDS = new Set<string>(["149", "226", "227"]);
const EXACT_INSPECTION_SERVICE_NAMES = new Set(["pest inspection", "rodent inspection"]);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });
}

type Candidate = {
  appointment_id: string;
  service_type_id: string;
  service_name: string;
  appointment_date: string | null;
  customer_id: string | null;
  customer_name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  tech_name: string | null;
};

const TECHNICIANS = [
  { name: "Darrell Tanner", license: "FR 62523", aliases: ["darrell", "tanner", "d tanner", "darrell t"] },
  { name: "Jake Shubin", license: "FR 71068", aliases: ["jake", "shubin", "jake s", "jacob shubin"] },
  { name: "Caleb Whalen", license: "FR 71183", aliases: ["caleb", "whalen", "caleb w"] },
  { name: "Jackson Latham", license: "FR 68261", aliases: ["jackson", "latham", "jackson l", "jack latham"] },
  { name: "Dylan Gallegos", license: "RA 71068", aliases: ["dylan", "gallegos", "dylan g"] },
  { name: "Michael Muniz", license: "FR 54193", aliases: ["michael", "mike", "muniz", "munoz", "michael m", "mike muniz"] },
  { name: "David Longoria", license: "FR 71710", aliases: ["david", "longoria", "david l"] },
  { name: "Nick Stovall", license: "FR 69245", aliases: ["nick", "stovall", "nick s", "nicholas stovall"] },
];

function normalizeName(v: string): string {
  return v
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(fr|ra)\s*\d+\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizeServiceName(v: string): string {
  return String(v ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function similarity(a: string, b: string): number {
  if (a === b) return 1;
  if (!a || !b) return 0;
  const previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prevDiagonal = previous[0];
    previous[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const temp = previous[j];
      previous[j] = Math.min(
        previous[j] + 1,
        previous[j - 1] + 1,
        prevDiagonal + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      prevDiagonal = temp;
    }
  }
  return 1 - previous[b.length] / Math.max(a.length, b.length);
}

function tokenScore(input: string, candidate: string): number {
  const inputTokens = input.split(" ").filter(Boolean);
  const candidateTokens = candidate.split(" ").filter(Boolean);
  if (inputTokens.length === 0 || candidateTokens.length === 0) return 0;

  let total = 0;
  for (const token of inputTokens) {
    let best = 0;
    for (const candidateToken of candidateTokens) {
      if (token === candidateToken) best = Math.max(best, 1);
      else if (token.length === 1 && candidateToken.startsWith(token)) best = Math.max(best, 0.92);
      else if (candidateToken.length === 1 && token.startsWith(candidateToken)) best = Math.max(best, 0.92);
      else if ((token.length >= 3 || candidateToken.length >= 3) && (token.includes(candidateToken) || candidateToken.includes(token))) best = Math.max(best, 0.88);
      else best = Math.max(best, similarity(token, candidateToken));
    }
    total += best;
  }
  return total / inputTokens.length;
}

function resolveTechnician(rawName: string | null): { name: string; license: string; score: number } | null {
  try {
    if (!rawName) return null;
    const normalized = normalizeName(rawName);
    if (!normalized || normalized === "unassigned") return null;

    let best: { name: string; license: string; score: number } | null = null;
    for (const tech of TECHNICIANS) {
      const variants = [tech.name, ...tech.aliases].map(normalizeName);
      const score = Math.max(...variants.map((variant) => tokenScore(normalized, variant)));
      if (!best || score > best.score) best = { name: tech.name, license: tech.license, score };
    }

    // FieldRoutes names can be shortened/misspelled; choose the closest obvious match.
    return best && best.score >= 0.55 ? best : null;
  } catch (e) {
    console.error("fieldroutes-sync-inspections technician_match_failed", { rawName, error: String(e) });
    return null;
  }
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
    const staffName = String(body?.staffName ?? "").trim();
    const syncKey = req.headers.get("x-sync-key") ?? "";
    const daysAhead = Number.isFinite(body?.days_ahead) ? Math.trunc(Number(body.days_ahead)) : 90;

    // Auth: cron secret OR admin session OR known PinGate staff user.
    const expectedKey = Deno.env.get("INSPECTION_SYNC_KEY");
    let authed = false;
    if (expectedKey && syncKey && syncKey === expectedKey) {
      authed = true;
    }
    if (!authed && sessionToken) {
      const { data: session } = await supabase
        .from("admin_sessions").select("id")
        .eq("session_token", sessionToken).eq("is_valid", true)
        .gt("expires_at", new Date().toISOString()).maybeSingle();
      if (session) authed = true;
    }
    if (!authed && staffName && KNOWN_STAFF.has(staffName)) {
      authed = true;
    }
    if (!authed) return json({ ok: false, error: "unauthorized" }, 401);

    // Safety: this function used to run silently from the report list and could
    // create drafts whenever FieldRoutes returned scheduled appointments. Only an
    // explicit UI action is allowed to create reports now; scheduled/legacy calls
    // become no-ops instead of inserting noise.
    const createReports = body?.createReports === true && (!!sessionToken || KNOWN_STAFF.has(staffName));
    if (!createReports) {
      console.log("fieldroutes-sync-inspections create skipped: explicit createReports=true required");
      return json({ ok: true, created: 0, skipped: 0, total: 0, reason: "create_reports_not_requested" });
    }

    // 1) Candidates from Cloud Run.
    const apiUrl = Deno.env.get("SCHEDULING_API_URL");
    const apiKey = Deno.env.get("SCHEDULING_API_KEY");
    if (!apiUrl || !apiKey) return json({ ok: false, error: "api_not_configured" }, 500);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20_000);
    let upstream: Response;
    try {
      upstream = await fetch(`${apiUrl.replace(/\/+$/, "")}/api/fr/new-inspections`, {
        method: "POST",
        headers: { "X-API-Key": apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({ days_ahead: daysAhead }),
        signal: controller.signal,
      });
    } catch (e) {
      const detail = e instanceof DOMException && e.name === "AbortError" ? "upstream_timeout" : String(e);
      return json({ ok: false, error: "upstream_unreachable", detail }, 504);
    } finally {
      clearTimeout(timeoutId);
    }
    const upJson = await upstream.json().catch(() => ({}));
    if (!upstream.ok || !upJson?.ok) {
      return json({ ok: false, error: "upstream_failed", detail: upJson }, 502);
    }
    const candidates: Candidate[] = upJson.candidates ?? [];
    if (candidates.length === 0) return json({ ok: true, created: 0, skipped: 0, total: 0 });

    // 2) Dedup: which appointment ids already have a report?
    const apptIds = candidates.map((c) => c.appointment_id);
    const { data: existing, error: exErr } = await supabase
      .from("reports")
      .select("fieldroutes_appointment_id")
      .in("fieldroutes_appointment_id", apptIds);
    if (exErr) return json({ ok: false, error: "dedup_query_failed", detail: exErr.message }, 500);
    const seen = new Set((existing ?? []).map((r) => r.fieldroutes_appointment_id));

    // 3) Build draft rows for the new ones.
    const rows = candidates
      .filter((c) => !seen.has(c.appointment_id))
      .map((c) => ({ c, matchedTech: resolveTechnician(c.tech_name) }))
      // Guard: ONLY whitelisted inspection service_type IDs + exact inspection
      // names create reports. Subscription setups, recurring routes, ad hoc work,
      // and initial-service appointments must never auto-spawn. Also reject
      // unassigned/unknown techs so bad upstream batches cannot flood the list.
      .filter(({ c, matchedTech }) => {
        const ok =
          INSPECTION_SERVICE_TYPE_IDS.has(String(c.service_type_id ?? "").trim()) &&
          EXACT_INSPECTION_SERVICE_NAMES.has(normalizeServiceName(c.service_name)) &&
          !!matchedTech;
        if (!ok) {
          console.log("fieldroutes-sync-inspections skipped non-inspection", {
            service_type_id: c.service_type_id,
            service_name: c.service_name,
            appointment_id: c.appointment_id,
            tech_name: c.tech_name,
            matched_tech: matchedTech?.name ?? null,
          });
        }
        return ok;
      })
      .map(({ c, matchedTech }) => {
        const addr = [c.address, [c.city, c.state].filter(Boolean).join(", "), c.zip]
          .filter(Boolean).join(", ");
        const isRodent = c.service_name.toLowerCase().includes("rodent");
        return {
          id: crypto.randomUUID(),
          technician_name: matchedTech!.name,
          license_number: matchedTech!.license,
          customer_name: c.customer_name || null,
          customer_email: c.email || null,
          customer_phone: c.phone || null,
          address: addr || null,
          service_date: c.appointment_date || null,
          report_title: c.service_name,
          target_pests: isRodent ? ["Rodents"] : [],
          // Auto-created FR reports always use the NEW Sales (multi-proposal)
          // format. The legacy /report flow is archived.
          notes: JSON.stringify({ _reportFormat: "multi-proposal", _source: "fieldroutes-sync" }),
          customer_preferences: { reportFormat: "multi-proposal" },
          fieldroutes_customer_id: c.customer_id,
          fieldroutes_appointment_id: c.appointment_id,
        };
      });

    if (rows.length === 0) return json({ ok: true, created: 0, skipped: candidates.length, total: candidates.length });

    // 4) Insert. The unique partial index on fieldroutes_appointment_id is the
    //    final guard against a race; ignoreDuplicates makes a concurrent run a no-op.
    const { data: inserted, error: insErr } = await supabase
      .from("reports")
      .upsert(rows, { onConflict: "fieldroutes_appointment_id", ignoreDuplicates: true })
      .select("id");
    if (insErr) return json({ ok: false, error: "insert_failed", detail: insErr.message }, 500);

    const created = inserted?.length ?? 0;
    return json({
      ok: true,
      created,
      skipped: candidates.length - rows.length,
      total: candidates.length,
    });
  } catch (e) {
    console.error("fieldroutes-sync-inspections exception", e);
    return json({ ok: false, error: "exception", detail: String(e) });
  }
});
