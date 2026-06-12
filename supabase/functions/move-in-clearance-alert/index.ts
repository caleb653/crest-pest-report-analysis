// Daily digest: emails office@crestpestcontrol.com listing every unit that
// is within 7 days of its scheduled tenant move-in but does NOT yet have a
// recent "Inspected: Free and Clear" status on its most recent past
// portal_services unit_details entry.
//
// Triggered by pg_cron once per day (see scheduled SQL).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;

const OFFICE_EMAIL = "office@crestpestcontrol.com";
const WINDOW_DAYS = 7;
// "Free and Clear" is only considered valid if recorded within this many
// days of today — older clearances shouldn't count for a fresh move-in.
const FREE_CLEAR_LOOKBACK_DAYS = 45;
const FREE_CLEAR_STATUS = "Inspected: Free and Clear";

// owner_tech (stored on portal_properties) → Crest staff email. Mirrors
// src/lib/staffRoster.ts; kept inline so the edge function has no app deps.
const OWNER_TECH_EMAIL: Record<string, string> = {
  "Darrell Tanner": "dtanner@crestpestcontrol.com",
  "Jake Shubin": "jake@crestpestcontrol.com",
  "Caleb Whalen": "caleb@crestpestcontrol.com",
  "Jackson Latham": "jlatham@crestpestcontrol.com",
  "Dylan Gallegos": "dgallegos@crestpestcontrol.com",
  "Michael Muniz": "mmuniz@crestpestcontrol.com",
  "Carmen Lopez": "clopez@crestpestcontrol.com",
  "David Longoria": "dlongoria@crestpestcontrol.com",
};
const lookupOwnerEmail = (ownerTech: unknown): string | null => {
  const raw = String(ownerTech || "").trim();
  if (!raw) return null;
  if (OWNER_TECH_EMAIL[raw]) return OWNER_TECH_EMAIL[raw];
  // Tolerate stored usernames (e.g. "jake") in addition to full names.
  const lower = raw.toLowerCase();
  for (const [name, email] of Object.entries(OWNER_TECH_EMAIL)) {
    if (email.split("@")[0].toLowerCase() === lower || name.toLowerCase() === lower) {
      return email;
    }
  }
  return null;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const todayISO = () => new Date().toISOString().slice(0, 10);
const addDaysISO = (iso: string, days: number) => {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const today = todayISO();
    const windowEnd = addDaysISO(today, WINDOW_DAYS);
    const lookbackStart = addDaysISO(today, -FREE_CLEAR_LOOKBACK_DAYS);

    const { data: properties, error: propErr } = await supabase
      .from("portal_properties")
      .select("id, name, address, customer_preferences, owner_tech");
    if (propErr) throw propErr;

    type Flagged = {
      property: string;
      address: string;
      unit: string;
      move_in: string;
      days_until: number;
      last_service_date: string | null;
      last_status: string | null;
      owner_email: string | null;
    };
    const flagged: Flagged[] = [];

    for (const prop of properties || []) {
      const moveIns = ((prop as any)?.customer_preferences?.tenant_move_ins || {}) as Record<string, string>;
      const upcoming = Object.entries(moveIns)
        .map(([unit, date]) => ({ unit: String(unit).trim(), date: String(date || "").slice(0, 10) }))
        .filter((x) => x.unit && x.date && x.date >= today && x.date <= windowEnd);
      if (upcoming.length === 0) continue;
      const ownerEmail = lookupOwnerEmail((prop as any).owner_tech);

      // Pull recent services for this property and inspect unit_details.
      const { data: svcs, error: svcErr } = await supabase
        .from("portal_services")
        .select("id, service_date, unit_details, status")
        .eq("property_id", prop.id)
        .gte("service_date", lookbackStart)
        .lte("service_date", today)
        .order("service_date", { ascending: false });
      if (svcErr) throw svcErr;

      for (const { unit, date } of upcoming) {
        let cleared = false;
        let lastService: { date: string; status: string } | null = null;
        for (const svc of svcs || []) {
          const dets = Array.isArray((svc as any).unit_details) ? (svc as any).unit_details : [];
          const match = dets.find((d: any) => String(d?.unit_number || "").trim() === unit);
          if (!match) continue;
          if (!lastService) lastService = { date: (svc as any).service_date, status: String(match.status || "") };
          if (String(match.status || "") === FREE_CLEAR_STATUS) {
            cleared = true;
            break;
          }
        }
        if (cleared) continue;
        const daysUntil = Math.round(
          (new Date(date + "T00:00:00Z").getTime() - new Date(today + "T00:00:00Z").getTime()) / 86400000
        );
        flagged.push({
          property: (prop as any).name || "(unnamed property)",
          address: (prop as any).address || "",
          unit,
          move_in: date,
          days_until: daysUntil,
          last_service_date: lastService?.date || null,
          last_status: lastService?.status || null,
          owner_email: ownerEmail,
        });
      }
    }

    if (flagged.length === 0) {
      return new Response(JSON.stringify({ ok: true, flagged: 0, sent: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Sort by soonest move-in first.
    flagged.sort((a, b) => a.move_in.localeCompare(b.move_in) || a.property.localeCompare(b.property));

    const rows = flagged
      .map(
        (f) => `
          <tr>
            <td style="padding:8px 10px;border:1px solid #e2e2e2;font-weight:700;">${escape(f.property)}</td>
            <td style="padding:8px 10px;border:1px solid #e2e2e2;">${escape(f.address)}</td>
            <td style="padding:8px 10px;border:1px solid #e2e2e2;text-align:center;font-weight:700;">${escape(f.unit)}</td>
            <td style="padding:8px 10px;border:1px solid #e2e2e2;text-align:center;">${escape(f.move_in)}</td>
            <td style="padding:8px 10px;border:1px solid #e2e2e2;text-align:center;">${f.days_until}d</td>
            <td style="padding:8px 10px;border:1px solid #e2e2e2;">${escape(f.last_service_date || "—")}</td>
            <td style="padding:8px 10px;border:1px solid #e2e2e2;">${escape(f.last_status || "No prior unit record")}</td>
          </tr>`
      )
      .join("");

    const html = `
      <div style="font-family:Arial,sans-serif;color:#2A2A2A;max-width:760px;margin:auto;">
        <h2 style="color:#2A2A2A;margin:0 0 6px;">Move-In Clearance Alert</h2>
        <p style="margin:0 0 14px;font-size:14px;color:#555;">
          The following ${flagged.length} unit${flagged.length === 1 ? "" : "s"} ${flagged.length === 1 ? "is" : "are"}
          within ${WINDOW_DAYS} days of a tenant move-in and ${flagged.length === 1 ? "does" : "do"} not have a
          "Free and Clear" inspection on file in the last ${FREE_CLEAR_LOOKBACK_DAYS} days.
        </p>
        <table style="border-collapse:collapse;width:100%;font-size:13px;">
          <thead>
            <tr style="background:#C3D1C5;">
              <th style="padding:8px 10px;border:1px solid #e2e2e2;text-align:left;">Property</th>
              <th style="padding:8px 10px;border:1px solid #e2e2e2;text-align:left;">Address</th>
              <th style="padding:8px 10px;border:1px solid #e2e2e2;">Unit</th>
              <th style="padding:8px 10px;border:1px solid #e2e2e2;">Move-In</th>
              <th style="padding:8px 10px;border:1px solid #e2e2e2;">In</th>
              <th style="padding:8px 10px;border:1px solid #e2e2e2;text-align:left;">Last Service</th>
              <th style="padding:8px 10px;border:1px solid #e2e2e2;text-align:left;">Last Status</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
        <p style="margin-top:14px;font-size:12px;color:#888;">
          Daily digest sent automatically by Crest Portal.
        </p>
      </div>`;

    // Always send to the office; CC every distinct owner-tech tied to a
    // flagged unit so the property's account owner sees their items.
    const ownerCcs = Array.from(
      new Set(flagged.map((f) => f.owner_email).filter((x): x is string => !!x))
    );

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Crest Pest Control <reports@crestpestco.com>",
        to: [OFFICE_EMAIL],
        cc: ownerCcs,
        subject: `[Move-In Clearance] ${flagged.length} unit${flagged.length === 1 ? "" : "s"} need clearance within 7 days`,
        html,
      }),
    });
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`Resend ${res.status}: ${t}`);
    }

    return new Response(JSON.stringify({ ok: true, flagged: flagged.length, sent: true, cc: ownerCcs }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("move-in-clearance-alert error", err);
    return new Response(JSON.stringify({ ok: false, error: err?.message || String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function escape(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}