/**
 * Appointment-reminder email template (property-manager facing).
 *
 * Pure module (NO app imports) so the exact same HTML can be rendered for
 * the in-app preview, the `send-appointment-reminder` edge function relay,
 * and standalone test sends. Branding mirrors send-service-completed.
 *
 * The HTML output is ASCII-only: typographic punctuation goes through entities
 * (&ndash; &middot; ...) so the email renders identically in every client.
 */

export interface ScheduledWindow {
  /** "HH:MM" 24h */
  start: string;
  /** "HH:MM" 24h, optional; when absent the email says "around <start>" */
  end?: string | null;
}

export interface AppointmentReminderInput {
  contactName?: string | null;
  propertyName: string;
  propertyAddress?: string | null;
  /** ISO YYYY-MM-DD */
  serviceDate: string | null;
  window?: ScheduledWindow | null;
  serviceType?: string | null;
  /** Route Manager name (user-facing copy never says "tech"). */
  routeManager?: string | null;
  /** Apartment unit numbers / commercial areas planned for the visit. */
  unitNumbers?: string[] | null;
  propertyType?: "apartments" | "hoa" | "commercial" | string | null;
  /** Free-text note from the office (access instructions, etc.). */
  message?: string | null;
  portalUrl?: string | null;
}

const COMPANY = {
  name: "Crest Pest Control",
  address: "2709 Orange Ave Ste C, Santa Ana, CA 92707",
  license: "LIC# PR9859",
  phone: "(949) 424-5000",
  email: "office@crestpestcontrol.com",
};

const EN_DASH = "–";

export const escapeHtml = (s: unknown): string =>
  String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;")
    // Entity-encode typographic punctuation so the email renders identically
    // regardless of the client's charset handling.
    .replace(/–/g, "&ndash;").replace(/—/g, "&mdash;").replace(/·/g, "&middot;");

/** "09:30" -> "9:30 AM". Unparseable input is returned trimmed. */
export const to12h = (t: string | null | undefined): string => {
  if (!t) return "";
  const m = t.trim().match(/^(\d{1,2}):(\d{2})/);
  if (!m) return t.trim();
  let h = parseInt(m[1], 10);
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${m[2]} ${ampm}`;
};

/** Human sentence fragment for the arrival window, e.g. "9:00 AM – 11:00 AM". */
export const formatArrivalWindow = (w: ScheduledWindow | null | undefined): string => {
  if (!w?.start) return "";
  const a = to12h(w.start);
  const b = w.end ? to12h(w.end) : "";
  return b && b !== a ? `${a} ${EN_DASH} ${b}` : a;
};

export const prettyDate = (iso: string | null | undefined): string => {
  if (!iso) return "";
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
};

const shortDate = (iso: string | null | undefined): string => {
  if (!iso) return "";
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

export function buildAppointmentReminderEmail(input: AppointmentReminderInput): { subject: string; html: string } {
  const propertyName = (input.propertyName || "your property").trim();
  const dateLong = prettyDate(input.serviceDate);
  const arrival = formatArrivalWindow(input.window);
  const isRange = !!(input.window?.end && to12h(input.window.end) !== to12h(input.window.start));
  const units = (input.unitNumbers || []).map((u) => String(u).trim()).filter(Boolean);
  const isCommercial = input.propertyType === "commercial";
  const areaWord = isCommercial ? "area" : "unit";
  const rm = (input.routeManager || "").trim();
  const message = (input.message || "").trim();

  const arrivalSentence = arrival
    ? isRange
      ? `Our Route Manager plans to arrive <strong>between ${escapeHtml(arrival.replace(` ${EN_DASH} `, " and "))}</strong>.`
      : `Our Route Manager plans to arrive <strong>around ${escapeHtml(arrival)}</strong>.`
    : `We'll confirm an arrival time as the date gets closer.`;

  const prepItems: string[] = [];
  if (units.length > 0) {
    prepItems.push(
      `Please make sure we have access to the ${escapeHtml(areaWord)}${units.length === 1 ? "" : "s"} listed above${isCommercial ? "" : " and give residents notice of the visit"}.`,
    );
  } else if (!isCommercial) {
    prepItems.push("Please make sure we have access to the building and any units that need service.");
  } else {
    prepItems.push("Please make sure we have access to all service areas, including back-of-house and utility spaces.");
  }
  prepItems.push("If a gate code, lockbox, or on-site contact has changed, just reply to this email so our Route Manager isn't held up.");
  prepItems.push(`Need to reschedule? Reply to this email or call us at ${COMPANY.phone}.`);

  const detailRow = (label: string, value: string) =>
    `<tr><td style="padding:6px 0;color:#6b7280;width:150px;vertical-align:top;">${label}</td><td style="padding:6px 0;font-weight:600;color:#1f2937;">${value}</td></tr>`;

  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;max-width:640px;margin:0 auto;background:#ffffff;">
      <div style="background:#2A2A2A;color:#fff;padding:18px 24px;border-radius:8px 8px 0 0;">
        <h2 style="margin:0;font-size:18px;font-weight:700;">Upcoming Service Reminder</h2>
        <p style="margin:4px 0 0;font-size:13px;opacity:0.85;">${COMPANY.name} &middot; ${COMPANY.license}</p>
        <p style="margin:2px 0 0;font-size:11px;opacity:0.7;">${COMPANY.address} &middot; ${COMPANY.phone} &middot; ${COMPANY.email}</p>
      </div>
      <div style="border:1px solid #e5e7eb;border-top:none;padding:22px 24px;border-radius:0 0 8px 8px;">
        <p style="margin:0 0 12px;font-size:14px;color:#374151;">Hello${input.contactName ? ` ${escapeHtml(input.contactName)}` : ""},</p>
        <p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.55;">
          This is a friendly reminder that ${COMPANY.name} is scheduled to service <strong>${escapeHtml(propertyName)}</strong>${dateLong ? ` on <strong>${escapeHtml(dateLong)}</strong>` : ""}. ${arrivalSentence}
        </p>

        <div style="background:#f4f6f4;border:1px solid #d9e0da;border-radius:8px;padding:16px 18px;margin:0 0 18px;">
          <table style="width:100%;border-collapse:collapse;">
            <tr>
              <td style="vertical-align:top;padding-right:16px;">
                <p style="margin:0 0 2px;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;">Date</p>
                <p style="margin:0;font-size:17px;font-weight:700;color:#111827;">${escapeHtml(dateLong || "To be confirmed")}</p>
              </td>
              <td style="vertical-align:top;border-left:1px solid #d9e0da;padding-left:16px;">
                <p style="margin:0 0 2px;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;">Arrival Window</p>
                <p style="margin:0;font-size:17px;font-weight:700;color:#111827;">${escapeHtml(arrival || "To be confirmed")}</p>
              </td>
            </tr>
          </table>
        </div>

        <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:16px;">
          ${input.serviceType ? detailRow("Service", escapeHtml(input.serviceType)) : ""}
          ${input.propertyAddress ? detailRow("Service address", escapeHtml(input.propertyAddress)) : ""}
          ${rm ? detailRow("Route Manager", escapeHtml(rm)) : ""}
          ${units.length > 0
            ? detailRow(
                `${isCommercial ? "Areas" : "Units"} scheduled (${units.length})`,
                escapeHtml(units.join(", ")),
              )
            : ""}
        </table>

        ${message
          ? `<div style="background:#f9fafb;border-left:3px solid #95A197;border-radius:6px;padding:12px 14px;margin-bottom:16px;">
               <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.04em;">Note from our office</p>
               <p style="margin:0;font-size:13px;color:#374151;white-space:pre-wrap;line-height:1.55;">${escapeHtml(message)}</p>
             </div>`
          : ""}

        <p style="margin:18px 0 6px;font-size:13px;font-weight:700;color:#111827;">Before we arrive</p>
        <ul style="margin:0 0 18px;padding-left:20px;font-size:13px;color:#374151;line-height:1.6;">
          ${prepItems.map((p) => `<li style="margin:0 0 4px;">${p}</li>`).join("")}
        </ul>

        ${input.portalUrl
          ? `<div style="text-align:center;margin:22px 0 8px;">
               <a href="${escapeHtml(input.portalUrl)}" style="display:inline-block;background:#2A2A2A;color:#ffffff;text-decoration:none;padding:12px 26px;border-radius:6px;font-weight:600;font-size:14px;">Open Your Portal</a>
             </div>`
          : ""}

        <hr style="border:none;border-top:1px solid #e5e7eb;margin:22px 0 12px;" />
        <p style="margin:0;font-size:12px;color:#6b7280;text-align:center;">
          ${COMPANY.name} &middot; ${COMPANY.address} &middot; ${COMPANY.license}<br/>
          ${COMPANY.phone} &middot; ${COMPANY.email}<br/>
          Reply to this email with any questions.
        </p>
      </div>
    </div>`;

  const when = [shortDate(input.serviceDate), arrival].filter(Boolean).join(", ");
  const subject = `Service Reminder ${EN_DASH} ${propertyName}${when ? ` ${EN_DASH} ${when}` : ""}`;

  return { subject, html };
}
