/**
 * Parse the resident contact info that the HOA Service Request form embeds
 * inside `portal_requests.description`. The submitter writes lines like:
 *   "[HOA SERVICE REQUEST] Resident: Jane Doe — Phone: (555) 123-4567 — Email: jane@x.com — Pests: Ants — Location: kitchen — Details: …"
 * The home address is stored separately in `portal_requests.unit_number`.
 *
 * This util pulls those fields back out so PM + Admin views can render them
 * in a clean dedicated block instead of leaving the data buried in a wall
 * of "—" separated text.
 */
export interface ResidentContact {
  name: string;
  phone: string;
  email: string;
  address: string;
  /** True when at least one resident field is populated (worth rendering). */
  hasAny: boolean;
  /** The original description with resident metadata + tag stripped out. */
  cleanedDescription: string;
}

const FIELD_RE = (label: string) =>
  new RegExp(`(?:^|[—\\-]\\s*)${label}\\s*:\\s*([^—\\n\\r]+?)(?=\\s*[—\\n\\r]|$)`, "i");

function pick(desc: string, label: string): string {
  const m = desc.match(FIELD_RE(label));
  return m ? m[1].trim() : "";
}

export function parseResidentContact(
  request: { description?: string | null; unit_number?: string | null; tenant_email?: string | null } | null | undefined
): ResidentContact {
  const desc = String(request?.description || "");
  const name = pick(desc, "Resident");
  const phone = pick(desc, "Phone");
  const emailFromDesc = pick(desc, "Email");
  const email = emailFromDesc || String(request?.tenant_email || "").trim();
  const address = String(request?.unit_number || "").trim();

  // Strip the leading tag + the resident/phone/email metadata so the
  // remaining description is just the actual request narrative.
  let cleaned = desc
    .replace(/^\s*\[(HOA SERVICE REQUEST|COMMUNITY SIGHTING|GENERAL|TREATMENT|INSPECTION)\]\s*/i, "")
    .replace(FIELD_RE("Resident"), "")
    .replace(FIELD_RE("Phone"), "")
    .replace(FIELD_RE("Email"), "")
    .replace(/\s*—\s*—\s*/g, " — ")
    .replace(/^\s*—\s*/, "")
    .replace(/\s*—\s*$/, "")
    .trim();

  return {
    name,
    phone,
    email,
    address,
    hasAny: Boolean(name || phone || email || address),
    cleanedDescription: cleaned,
  };
}