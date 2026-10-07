// Client for the fieldroutes_login_links cache (customer_id -> portal loginLink).
//
// The FieldRoutes customer API never exposes the FieldPortals {{loginLink}}, so
// the customer-search results can't carry it. The cache table collects every
// link FieldRoutes has ever generated for us (Trigger webhooks, manual pastes)
// and these helpers let any lookup surface the portal link the moment a
// customer is selected.

import { supabase } from "@/integrations/supabase/client";

// The table is newer than the generated Database types — cast around the typed
// client until Lovable regenerates types.ts.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const linksTable = () => (supabase as any).from("fieldroutes_login_links");

/** Batch lookup: returns a customer_id -> login_link map for the ids found. */
export async function fetchLoginLinks(
  customerIds: Array<string | null | undefined>,
): Promise<Record<string, string>> {
  const ids = [...new Set(customerIds.filter((x): x is string => !!x))];
  if (ids.length === 0) return {};
  try {
    const { data, error } = await linksTable()
      .select("customer_id, login_link")
      .in("customer_id", ids);
    if (error || !data) return {};
    const map: Record<string, string> = {};
    for (const row of data as Array<{ customer_id: string; login_link: string }>) {
      if (row.login_link) map[row.customer_id] = row.login_link;
    }
    return map;
  } catch {
    return {};
  }
}

export async function fetchLoginLink(customerId: string | null | undefined): Promise<string | null> {
  if (!customerId) return null;
  const map = await fetchLoginLinks([customerId]);
  return map[customerId] ?? null;
}

/**
 * Fire-and-forget: teach the cache a link learned elsewhere (webhook payloads
 * write server-side; this covers manual pastes and any future upstream source).
 * Silently ignores anything that isn't an http(s) URL.
 */
export function saveLoginLink(
  customerId: string | null | undefined,
  loginLink: string | null | undefined,
  source: string,
): void {
  if (!customerId || !loginLink || !/^https?:\/\//i.test(loginLink)) return;
  void linksTable()
    .upsert({ customer_id: customerId, login_link: loginLink, source }, { onConflict: "customer_id" })
    .then(({ error }: { error: { message: string } | null }) => {
      if (error) console.warn("saveLoginLink failed:", error.message);
    });
}

// ─── Billing portals ─────────────────────────────────────────────────────
//
// Each property tile on a customer billing portal (/billing/<token>) can carry
// a "pay or add a card" button pointing at that property's FieldPortals
// account — one per property, since each apartment complex is its own
// FieldRoutes customer. The admin pastes the link; it lives in this same cache
// under a key made from the portal_properties id, because that table has no
// column for it and the schema only changes through Lovable. When the property
// is matched to a FieldRoutes customer the link is also stored under that
// customer id, so the rest of the app learns it too. Clearing writes "" (the
// table has no delete policy); every reader already treats an empty link as none.

export const billingPropertyLinkKey = (propertyId: string) => `billing-property:${propertyId}`;

export async function setBillingPropertyPaymentLink(
  propertyId: string,
  url: string | null | undefined,
  fieldroutesCustomerId?: string | null,
): Promise<string | null> {
  const clean = String(url ?? "").trim();
  if (clean && !/^https?:\/\//i.test(clean)) return "That doesn't look like a web link — it should start with https://";
  const rows = [{ customer_id: billingPropertyLinkKey(propertyId), login_link: clean, source: "billing-portal-admin" }];
  if (clean && fieldroutesCustomerId) {
    rows.push({ customer_id: String(fieldroutesCustomerId), login_link: clean, source: "billing-portal-admin" });
  }
  const { error } = await linksTable().upsert(rows, { onConflict: "customer_id" });
  return error ? (error as { message: string }).message : null;
}
