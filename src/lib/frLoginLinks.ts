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
