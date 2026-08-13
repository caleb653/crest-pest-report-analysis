import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ─── Compliance data (kept inline — edge functions can't import from src/) ───

// Company identity block required on CA service notifications.
const COMPANY = {
  name: "Crest Pest Control",
  address: "2709 Orange Ave Ste C, Santa Ana, CA 92707",
  license: "LIC# PR9859",
  phone: "(949) 424-5000",
  email: "office@crestpestcontrol.com",
};

// Technician → CA structural pest control license. Mirrors the app's
// TECHNICIANS lists (src/lib/freeAndClearCertificate.ts).
const TECH_LICENSE: Record<string, string> = {
  "Darrell Tanner": "FR 62523",
  "Jake Shubin": "FR 71068",
  "Caleb Whalen": "FR 71183",
  "Jackson Latham": "FR 68261",
  "Dylan Gallegos": "RA 71068",
  "Michael Muniz": "FR 54193",
  "David Longoria": "FR 71710",
  "Nick Stovall": "FR 69245",
  "Brock Lyttle": "FR 62941",
};

// Product → active ingredient(s) + SDS path. Mirrors the app's knowledge base:
// APPROVED_COMMERCIAL_MATERIALS (src/components/portal/CommercialApprovedMaterials.tsx,
// authoritative for ingredients + hosted SDS PDFs) merged with the sales-report
// PRODUCT_OPTIONS chemicals for products not on the approved-commercial list.
// sds paths are app-relative (/public/sds) — made absolute against the app origin.
const PRODUCT_INFO: Record<string, { ai: string; sds?: string }> = {
  "Advion Ant Gel Bait": { ai: "Indoxacarb", sds: "/sds/Advion_Ant_Gel_SDS.pdf" },
  "Advion Microflow": { ai: "Indoxacarb", sds: "/sds/Advion_Microflow_SDS.pdf" },
  "Advion Cockroach Gel Bait": { ai: "Indoxacarb" },
  "Alpine WSG": { ai: "Dinotefuran", sds: "/sds/Alpine_WSG_SDS.pdf" },
  "Bedlam Plus": { ai: "Sumithrin, Permethrin, Pyriproxyfen, MGK-264", sds: "/sds/Bedlam_Plus_SDS.pdf" },
  "Bedlam": { ai: "Cyclopropanecarboxylate, Dicarboximide" },
  "Bifen I/T": { ai: "Bifenthrin", sds: "/sds/Bifen_IT_SDS.pdf" },
  "Bifen LP": { ai: "Bifenthrin" },
  "MasterLine / Bifen I/T": { ai: "Bifenthrin", sds: "/sds/Bifen_IT_SDS.pdf" },
  "Contrac": { ai: "Bromethalin", sds: "/sds/Contrac_CA_Blox_SDS.pdf" },
  "Crossfire Bedbug Concentrate": { ai: "Clothianidin, Metofluthrin, Piperonyl Butoxide" },
  "Delta Dust": { ai: "Deltamethrin", sds: "/sds/Delta_Dust_SDS.pdf" },
  "Essentria IC Pro": { ai: "Geraniol, Clove Oil, Cornmint Oil" },
  "ExciteR": { ai: "Pyrethrins, Piperonyl Butoxide" },
  "Gentrol IGR Concentrate": { ai: "(S)-Hydroprene", sds: "/sds/Gentrol_IGR_SDS.pdf" },
  "Gentrol Aerosol": { ai: "(S)-Hydroprene" },
  "Invade Hot Spot": { ai: "Citrus terpenes, microbes, surfactants", sds: "/sds/Invade_Hot_Spot_Plus_SDS.pdf" },
  "In2Care Mix": { ai: "Pyriproxyfen, Beauveria bassiana Strain GHA" },
  "Maxforce Quantum Ant Bait": { ai: "Imidacloprid", sds: "/sds/Maxforce_Quantum_SDS.pdf" },
  "Maxforce FC Ant Gel": { ai: "Fipronil" },
  "Niban": { ai: "Orthoboric Acid" },
  "Nyguard IGR Concentrate": { ai: "Pyriproxyfen", sds: "/sds/Nyguard_IGR_SDS.pdf" },
  "OneGuard": { ai: "Lambda-cyhalothrin, Prallethrin, Pyriproxyfen, Piperonyl Butoxide" },
  "Onslaught FastCap": { ai: "Esfenvalerate, Prallethrin, PBO", sds: "/sds/Onslaught_FC_SDS.pdf" },
  "Optigard": { ai: "Thiamethoxam", sds: "/sds/Optigard_Flex_SDS.pdf" },
  "Phantom": { ai: "Chlorfenapyr", sds: "/sds/Phantom_SDS.pdf" },
  "PT Alpine Flea & Bed Bug": { ai: "Dinotefuran, Pyriproxyfen, Prallethrin", sds: "/sds/PT_Alpine_Flea_Bed_Bug_SDS.pdf" },
  "PT Wasp Freeze": { ai: "Prallethrin", sds: "/sds/PT_Wasp_Freeze_SDS.pdf" },
  "Shockwave": { ai: "Cypermethrin, Imiprothrin, PBO", sds: "/sds/Shockwave_SDS.pdf" },
  "Temprid FX": { ai: "Imidacloprid, Beta-Cyfluthrin", sds: "/sds/Temprid_FX_SDS.pdf" },
  "Termidor SC": { ai: "Fipronil", sds: "/sds/Termidor_SC_SDS.pdf" },
  "Nibor-D Insecticide": { ai: "Disodium Octaborate" },
  "Nibor-D Foam + IGR": { ai: "Disodium Octaborate" },
  "Neogen SureKill SK100": { ai: "Pyrethrins, Piperonyl Butoxide, N-Octyl Bicycloheptene Dicarboximide" },
  "ProFoam Platinum": { ai: "Foaming Agent (no pesticide active ingredient)" },
  "Invade Bio Cleaner": { ai: "Citrus Oil, Microbes, Surfactants" },
  "Take Down II Soft Bait": { ai: "Bromethalin" },
};

// Loose name matcher: exact normalized hit, else longest key contained in the
// product name (or vice versa) — product names vary slightly across the app
// ("Delta Dust (Bayer)", "Invade Hot Spot +", "Contrac California").
const normName = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const PRODUCT_INFO_NORM = Object.entries(PRODUCT_INFO).map(([k, v]) => ({ key: normName(k), ...v }));
function productInfoFor(name: unknown): { ai: string; sds?: string } | null {
  const n = normName(String(name ?? ""));
  if (!n) return null;
  const exact = PRODUCT_INFO_NORM.find((p) => p.key === n);
  if (exact) return exact;
  const partial = PRODUCT_INFO_NORM
    .filter((p) => n.includes(p.key) || p.key.includes(n))
    .sort((a, b) => b.key.length - a.key.length);
  return partial[0] ?? null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const {
      to,
      ccEmails,
      propertyName,
      propertyAddress,
      clientName,
      serviceType,
      serviceDate,
      technician,
      summary,
      unitsCount,
      productsList,
      unitDetails,
      findings,
      notes,
      photos,
      timeIn,
      timeOut,
      portalUrl,
      activeConditions,
      resolvedConditions,
      openSightings,
      resolvedSightings,
    } = await req.json();

    if (!to) {
      return new Response(JSON.stringify({ error: "Missing recipient email" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) {
      return new Response(JSON.stringify({ error: "Email not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Absolute base for the hosted SDS PDFs — same origin the portal link
    // points at (the app serves /public/sds).
    const appOrigin = (() => {
      try { return portalUrl ? new URL(String(portalUrl)).origin : ""; } catch { return ""; }
    })();

    const safeProductsRows = Array.isArray(productsList) && productsList.length > 0
      ? productsList.map((p: any) => {
        const info = productInfoFor(p.name);
        const sdsLink = info?.sds && appOrigin
          ? `<br/><a href="${appOrigin}${info.sds}" style="font-size:10px;color:#2563eb;text-decoration:underline;font-weight:400;">Label / SDS</a>`
          : "";
        return `
        <tr>
          <td style="padding:6px 10px;border-bottom:1px solid #eee;font-weight:600;">${p.name || ""}${sdsLink}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #eee;font-size:11px;color:#374151;">${info?.ai || "—"}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #eee;font-family:monospace;font-size:11px;">${p.epa || "—"}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #eee;">${p.applied_amount != null ? `${p.applied_amount} ${p.applied_unit || ""}` : "—"}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #eee;color:#2A2A2A;">${p.undiluted_amount != null ? `${p.undiluted_amount} ${p.undiluted_unit || ""}` : "—"}</td>
        </tr>`;
      }).join("")
      : "";

    // Convert "HH:MM" (24h) or "H:MM AM/PM" to a friendly "h:MM AM/PM".
    const to12h = (v: any): string => {
      const s = String(v ?? "").trim();
      if (!s) return "";
      if (/am|pm/i.test(s)) return s.toUpperCase().replace(/\s+/g, " ");
      const m = s.match(/^(\d{1,2}):(\d{2})/);
      if (!m) return s;
      let h = parseInt(m[1], 10);
      const min = m[2];
      const suffix = h >= 12 ? "PM" : "AM";
      h = h % 12; if (h === 0) h = 12;
      return `${h}:${min} ${suffix}`;
    };

    // Format an ISO date (YYYY-MM-DD) to "Mon D, YYYY" without TZ shift.
    const fmtDate = (v: any): string => {
      const s = String(v ?? "").trim();
      const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (!m) return s;
      const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
      return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    };

    const esc = (v: any) => String(v ?? "")
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

    // Map raw stored status values to the friendly labels customers should see.
    // Mirrors src/lib/unitStatus.ts so emails always agree with what the
    // PM / customer sees in the portal.
    const friendlyStatus = (raw: string, kind?: string): string => {
      const s = String(raw || "").trim();
      if (!s) return "Treated";
      const isInspection = kind === "inspection";
      const TREATMENT: Record<string, string> = {
        "To Be Treated": "Treated",
        "Treated - Complete": "Treated",
        "Treated - Follow Up": "Treated",
        "Complete": "Treated",
        "Not Treated": "Not Treated",
        "Not Serviced": "Not Treated",
        "Inspected: Free and Clear": "No Activity Found",
        "Inspected: Activity Found": "Activity Found",
        "Inspection: Not Performed": "Not Inspected",
        "Free and Clear": "No Activity Found",
      };
      const INSPECTION: Record<string, string> = {
        "To Be Treated": "To Be Inspected",
        "Treated - Complete": "Inspected",
        "Treated - Follow Up": "Inspected",
        "Complete": "Inspected",
        "Not Treated": "Not Inspected",
        "Not Serviced": "Not Inspected",
        "Inspection: Not Performed": "Not Inspected",
        "Inspected: Free and Clear": "No Activity Found",
        "Inspected: Activity Found": "Activity Found",
        "Free and Clear": "No Activity Found",
      };
      const map = isInspection ? INSPECTION : TREATMENT;
      return map[s] || s;
    };

    // Per-unit detail cards — one block per area treated, with everything
    // the PM needs (status, target pest, findings, notes, products, photos)
    // so they never need to click into the portal.
    const unitCards = Array.isArray(unitDetails) && unitDetails.length > 0
      ? unitDetails.map((u: any, i: number) => {
          const rawStatus = String(u.status || "");
          const status = friendlyStatus(rawStatus, u.kind);
          const isFollowUp = u.follow_up_needed === true;
          const statusColor = isFollowUp ? "#c2410c" : "#166534";
          const statusBg = isFollowUp ? "#fff7ed" : "#f0fdf4";
          const statusBorder = isFollowUp ? "#fdba74" : "#bbf7d0";
          const unitProducts = Array.isArray(u.products_used) && u.products_used.length > 0
            ? `<p style="margin:8px 0 4px;font-size:11px;font-weight:700;color:#374151;text-transform:uppercase;letter-spacing:0.04em;">Products applied here</p>
               <ul style="margin:0 0 6px 18px;padding:0;font-size:12px;color:#1f2937;">
                 ${u.products_used.map((p: any) => `<li style="margin:0 0 2px;"><strong>${esc(p.name)}</strong>${p.applied_amount != null ? ` — ${esc(p.applied_amount)} ${esc(p.applied_unit || "")}` : ""}</li>`).join("")}
               </ul>`
            : "";
          const unitPhotos = Array.isArray(u.photos) && u.photos.length > 0
            ? `<div style="margin-top:8px;">
                 ${u.photos.map((p: any) => p?.url ? `<img src="${esc(p.url)}" alt="" style="max-width:160px;max-height:160px;border-radius:6px;margin:0 6px 6px 0;border:1px solid #e5e7eb;" />` : "").join("")}
               </div>`
            : "";
          return `
            <div style="border:1px solid #e5e7eb;border-radius:8px;padding:12px 14px;margin:0 0 10px;background:#ffffff;">
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
                <span style="display:inline-block;background:#2A2A2A;color:#fff;font-weight:700;font-size:12px;padding:2px 8px;border-radius:999px;">${i + 1}</span>
                <strong style="font-size:14px;color:#111827;">${esc(u.unit_number || "—")}</strong>
                <span style="margin-left:auto;font-size:11px;font-weight:700;text-transform:uppercase;color:${statusColor};background:${statusBg};border:1px solid ${statusBorder};padding:2px 8px;border-radius:999px;">${esc(status)}</span>
              </div>
              <table style="width:100%;font-size:12px;color:#374151;border-collapse:collapse;">
                ${u.target_pest ? `<tr><td style="padding:2px 0;color:#6b7280;width:120px;">Target pest</td><td style="padding:2px 0;font-weight:600;">${esc(u.target_pest)}</td></tr>` : ""}
                ${u.pest_activity && u.pest_activity !== "None" ? `<tr><td style="padding:2px 0;color:#6b7280;">Pest activity</td><td style="padding:2px 0;">${esc(u.pest_activity)}</td></tr>` : ""}
                ${u.findings ? `<tr><td style="padding:2px 0;color:#6b7280;vertical-align:top;">Findings</td><td style="padding:2px 0;white-space:pre-wrap;">${esc(u.findings)}</td></tr>` : ""}
                ${u.notes ? `<tr><td style="padding:2px 0;color:#6b7280;vertical-align:top;">Notes</td><td style="padding:2px 0;white-space:pre-wrap;">${esc(u.notes)}</td></tr>` : ""}
              </table>
              ${unitProducts}
              ${unitPhotos}
            </div>`;
        }).join("")
      : "";

    const servicePhotos = Array.isArray(photos) && photos.length > 0
      ? `<p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#111827;">Service photos</p>
         <div style="margin-bottom:16px;">
           ${photos.map((p: any) => p?.url ? `<img src="${esc(p.url)}" alt="" style="max-width:200px;max-height:200px;border-radius:6px;margin:0 8px 8px 0;border:1px solid #e5e7eb;" />` : "").join("")}
         </div>`
      : "";

    // ─── Conditions & Pest Sightings ───
    const renderCondBlock = (title: string, rows: any[], color: { bg: string; border: string; label: string; }) => {
      if (!Array.isArray(rows) || rows.length === 0) return "";
      return `
        <div style="border:2px solid ${color.border};background:${color.bg};border-radius:8px;padding:12px 14px;margin:0 0 14px;">
          <p style="margin:0 0 8px;font-size:12px;font-weight:800;color:${color.label};text-transform:uppercase;letter-spacing:0.06em;">${esc(title)} (${rows.length})</p>
          ${rows.map((c: any) => {
            const photos = Array.isArray(c.photos) ? c.photos.filter((u: any) => typeof u === "string") : [];
            return `
            <div style="background:#fff;border:1px solid ${color.border};border-radius:6px;padding:10px 12px;margin-bottom:8px;">
              <p style="margin:0;font-size:13px;font-weight:700;color:#111827;">${esc(c.title || c.description || c.pest || "Condition")}</p>
              ${c.severity ? `<p style="margin:2px 0 0;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.04em;">Severity: ${esc(c.severity)}</p>` : ""}
              ${c.location ? `<p style="margin:2px 0 0;font-size:12px;color:#374151;">Location: ${esc(c.location)}</p>` : ""}
              ${c.description && c.title ? `<p style="margin:4px 0 0;font-size:12px;color:#374151;white-space:pre-wrap;">${esc(c.description)}</p>` : ""}
              ${c.resolution_note ? `<p style="margin:4px 0 0;font-size:12px;color:#065f46;white-space:pre-wrap;"><strong>Resolution:</strong> ${esc(c.resolution_note)}</p>` : ""}
              ${c.response ? `<p style="margin:4px 0 0;font-size:12px;color:#374151;white-space:pre-wrap;"><strong>Response:</strong> ${esc(c.response)}</p>` : ""}
              ${photos.length > 0 ? `<div style="margin-top:6px;">${photos.map((u: string) => `<img src="${esc(u)}" alt="" style="max-width:140px;max-height:140px;border-radius:6px;margin:0 6px 6px 0;border:1px solid #e5e7eb;" />`).join("")}</div>` : ""}
            </div>`;
          }).join("")}
        </div>`;
    };
    const conditionsHtml =
      renderCondBlock("Active Conditions", activeConditions, { bg: "#fef2f2", border: "#fecaca", label: "#991b1b" }) +
      renderCondBlock("Conditions Resolved This Visit", resolvedConditions, { bg: "#f0fdf4", border: "#bbf7d0", label: "#166534" });
    const sightingsHtml =
      renderCondBlock("Active Pest Sightings", openSightings, { bg: "#fffbeb", border: "#fcd34d", label: "#92400e" }) +
      renderCondBlock("Pest Sightings Resolved This Visit", resolvedSightings, { bg: "#f0fdf4", border: "#bbf7d0", label: "#166534" });

    // ─── Prominent follow-up banner ───
    // When ANY unit was flagged as follow-up needed by the technician, surface
    // it at the very top of the email (above everything else) with the exact
    // unit numbers + each unit's notes — so PMs / customers can't miss it.
    const followUpUnits = Array.isArray(unitDetails)
      ? unitDetails.filter((u: any) => u && u.follow_up_needed === true)
      : [];
    const followUpBanner = followUpUnits.length > 0
      ? `
        <div style="background:#fff1f2;border:2px solid #dc2626;border-radius:10px;padding:16px 18px;margin:0 0 18px;">
          <p style="margin:0 0 8px;font-size:14px;font-weight:800;color:#991b1b;text-transform:uppercase;letter-spacing:0.06em;">
            ⚠ Follow-up Needed — ${followUpUnits.length} ${followUpUnits.length === 1 ? "unit" : "units"}
          </p>
          <p style="margin:0 0 10px;font-size:13px;color:#7f1d1d;line-height:1.55;">
            The technician flagged the following ${followUpUnits.length === 1 ? "unit" : "units"} for a return visit. Please review the notes below and coordinate access for the next service.
          </p>
          <table style="width:100%;border-collapse:collapse;font-size:13px;color:#1f2937;background:#ffffff;border-radius:6px;overflow:hidden;border:1px solid #fecaca;">
            <thead style="background:#fee2e2;">
              <tr>
                <th style="text-align:left;padding:8px 10px;font-weight:700;color:#7f1d1d;width:120px;">Unit</th>
                <th style="text-align:left;padding:8px 10px;font-weight:700;color:#7f1d1d;">Pest / Reason</th>
                <th style="text-align:left;padding:8px 10px;font-weight:700;color:#7f1d1d;">Tech Notes</th>
              </tr>
            </thead>
            <tbody>
              ${followUpUnits.map((u: any) => `
                <tr style="border-top:1px solid #fee2e2;">
                  <td style="padding:8px 10px;font-weight:700;color:#991b1b;vertical-align:top;">${esc(u.unit_number || "—")}</td>
                  <td style="padding:8px 10px;vertical-align:top;">${esc(u.target_pest || u.pest_activity || "—")}</td>
                  <td style="padding:8px 10px;vertical-align:top;white-space:pre-wrap;">${esc(u.findings || u.notes || "Return visit recommended.")}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>`
      : "";

    const tIn = to12h(timeIn);
    const tOut = to12h(timeOut);
    const timeRange = tIn && tOut ? `${tIn} - ${tOut}` : (tIn || tOut || "");
    const dateDisplay = fmtDate(serviceDate);

    const html = `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;max-width:640px;margin:0 auto;background:#ffffff;">
        <div style="background:#2A2A2A;color:#fff;padding:18px 24px;border-radius:8px 8px 0 0;">
          <h2 style="margin:0;font-size:18px;font-weight:700;">Service Completed</h2>
          <p style="margin:4px 0 0;font-size:13px;opacity:0.85;">${COMPANY.name} · ${COMPANY.license}</p>
          <p style="margin:2px 0 0;font-size:11px;opacity:0.7;">${COMPANY.address} · ${COMPANY.phone} · ${COMPANY.email}</p>
        </div>
        <div style="border:1px solid #e5e7eb;border-top:none;padding:22px 24px;border-radius:0 0 8px 8px;">
          <p style="margin:0 0 12px;font-size:14px;color:#374151;">Hello${clientName ? ` ${esc(clientName)}` : ""},</p>
          ${followUpBanner}
          <p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.55;">
            We've completed a service at <strong>${esc(propertyName || "your property")}</strong>. The full report is below — everything that was done is included in this email so you don't need to click through.
          </p>
          <table style="width:100%;border-collapse:collapse;font-size:13px;color:#1f2937;margin-bottom:16px;">
            ${serviceType ? `<tr><td style="padding:6px 0;color:#6b7280;width:140px;">Service</td><td style="padding:6px 0;font-weight:600;">${esc(serviceType)}</td></tr>` : ""}
            ${propertyAddress ? `<tr><td style="padding:6px 0;color:#6b7280;">Service address</td><td style="padding:6px 0;font-weight:600;">${esc(propertyAddress)}</td></tr>` : ""}
            ${dateDisplay ? `<tr><td style="padding:6px 0;color:#6b7280;">Date</td><td style="padding:6px 0;font-weight:600;">${esc(dateDisplay)}</td></tr>` : ""}
            ${technician ? `<tr><td style="padding:6px 0;color:#6b7280;">Technician</td><td style="padding:6px 0;font-weight:600;">${esc(technician)}${TECH_LICENSE[String(technician).trim()] ? ` <span style="font-weight:400;color:#6b7280;">· License ${esc(TECH_LICENSE[String(technician).trim()])}</span>` : ""}</td></tr>` : ""}
            ${timeRange ? `<tr><td style="padding:6px 0;color:#6b7280;">On site</td><td style="padding:6px 0;font-weight:600;">${esc(timeRange)}</td></tr>` : ""}
            ${unitsCount != null ? `<tr><td style="padding:6px 0;color:#6b7280;">Areas serviced</td><td style="padding:6px 0;font-weight:600;">${unitsCount}</td></tr>` : ""}
          </table>
          ${summary ? `<div style="background:#f9fafb;border-left:3px solid #2A2A2A;border-radius:6px;padding:12px 14px;margin-bottom:16px;"><p style="margin:0 0 4px;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.04em;">Summary</p><p style="margin:0;font-size:13px;color:#374151;white-space:pre-wrap;line-height:1.55;">${esc(summary)}</p></div>` : ""}
          ${findings ? `<div style="background:#f9fafb;border-left:3px solid #95A197;border-radius:6px;padding:12px 14px;margin-bottom:16px;"><p style="margin:0 0 4px;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.04em;">Technician Findings</p><p style="margin:0;font-size:13px;color:#374151;white-space:pre-wrap;line-height:1.55;">${esc(findings)}</p></div>` : ""}
          ${notes ? `<div style="background:#f9fafb;border-left:3px solid #95A197;border-radius:6px;padding:12px 14px;margin-bottom:16px;"><p style="margin:0 0 4px;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.04em;">Service Notes</p><p style="margin:0;font-size:13px;color:#374151;white-space:pre-wrap;line-height:1.55;">${esc(notes)}</p></div>` : ""}
          ${unitCards ? `<p style="margin:18px 0 8px;font-size:13px;font-weight:700;color:#111827;">Areas Treated</p>${unitCards}` : ""}
          ${safeProductsRows ? `
            <p style="margin:18px 0 6px;font-size:13px;font-weight:700;color:#111827;">Products used (EPA Reg #)</p>
            <table style="width:100%;border-collapse:collapse;font-size:12px;color:#1f2937;border:1px solid #eee;border-radius:6px;overflow:hidden;margin-bottom:16px;">
              <thead style="background:#f3f4f6;"><tr>
                <th style="text-align:left;padding:6px 10px;font-weight:700;">Product</th>
                <th style="text-align:left;padding:6px 10px;font-weight:700;">Active Ingredient(s)</th>
                <th style="text-align:left;padding:6px 10px;font-weight:700;">EPA #</th>
                <th style="text-align:left;padding:6px 10px;font-weight:700;">Diluted</th>
                <th style="text-align:left;padding:6px 10px;font-weight:700;">Concentrated</th>
              </tr></thead>
              <tbody>${safeProductsRows}</tbody>
            </table>` : ""}
          ${servicePhotos}
          ${sightingsHtml}
          ${conditionsHtml}
          ${portalUrl ? `
            <div style="text-align:center;margin:22px 0 8px;">
              <a href="${esc(portalUrl)}" style="display:inline-block;background:#2A2A2A;color:#ffffff;text-decoration:none;padding:12px 26px;border-radius:6px;font-weight:600;font-size:14px;">Open Portal</a>
            </div>
          ` : ""}
          <hr style="border:none;border-top:1px solid #e5e7eb;margin:22px 0 12px;" />
          <div style="background:#fffbeb;border:1px solid #fcd34d;border-radius:6px;padding:12px 14px;margin:0 0 14px;">
            <p style="margin:0 0 6px;font-size:12px;font-weight:700;color:#92400e;text-transform:uppercase;letter-spacing:0.04em;">⚠ Caution</p>
            <p style="margin:0 0 8px;font-size:11.5px;color:#3f2d05;line-height:1.55;">
              Crest Pest Control is committed to the safety of our customers and our environment. All materials used by Crest Pest Control have been registered by the Environmental Protection Agency. Please avoid unnecessary contact with materials and comply with all instructions and recommendations from our technicians. Thanks for your patronage! <strong>National Emergency Poison Control: (800) 222-1222</strong>
            </p>
            <p style="margin:0;font-size:10.5px;color:#3f2d05;line-height:1.55;font-style:italic;">
              "State law requires that you be given the following information: CAUTION—PESTICIDES ARE TOXIC CHEMICALS. Structural Pest Control Companies are registered and regulated by the Structural Pest Control Board, and apply pesticides which are registered and approved for use by the California Department of Pesticide Regulation and the United States Environmental Protection Agency. Registration is granted when the state finds that, based on existing scientific evidence, there are no appreciable risks if proper use conditions are followed or that the risks are outweighed by the benefits. The degree of risk depends upon the degree of exposure, so exposure should be minimized." "If within 24 hours following application you experience symptoms similar to common seasonal illness comparable to the flu, contact your physician or poison control center (800-222-1222) and your pest control company immediately." (This statement shall be modified to include any other symptoms of overexposure which are not typical of influenza.) "For further information, contact any of the following: Crest Pest Control (949-424-5000); for Health Questions—the County Health Department (800-564-8448); for Application Information—the County Agricultural Commissioner (714-955-0100) and for Regulatory Information—the Structural Pest Control Board (800-737-8188), 2005 Evergreen Street, Ste. 1500, Sacramento, CA 95815)."
            </p>
          </div>
          <p style="margin:0;font-size:12px;color:#6b7280;text-align:center;">
            ${COMPANY.name} · ${COMPANY.address} · ${COMPANY.license}<br/>
            ${COMPANY.phone} · ${COMPANY.email}<br/>
            Reply to this email with any questions.
          </p>
        </div>
      </div>`;

    const subject = followUpUnits.length > 0
      ? `⚠ Follow-up Needed (${followUpUnits.length} ${followUpUnits.length === 1 ? "unit" : "units"}) — ${propertyName || "Service Completed"}${dateDisplay ? ` (${dateDisplay})` : ""}`
      : `Service Completed${propertyName ? ` — ${propertyName}` : ""}${dateDisplay ? ` (${dateDisplay})` : ""}`;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "Crest Pest Control <reports@crestpestco.com>",
        reply_to: "office@crestpestcontrol.com",
        to: Array.isArray(to) ? to : [to],
        ...(Array.isArray(ccEmails) && ccEmails.length > 0 ? { cc: ccEmails } : {}),
        subject,
        html,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("Resend error:", errText);
      return new Response(JSON.stringify({ error: "Failed to send email", detail: errText }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await res.json();
    return new Response(JSON.stringify({ success: true, data }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("send-service-completed error:", e);
    return new Response(JSON.stringify({ error: e?.message || "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});