// Auto-link a report to a FieldRoutes customer on save.
//
// Why: every report needs reports.fieldroutes_customer_id so a completed report's
// PDF can be uploaded back to the right customer in FieldRoutes. The CustomerPicker
// sets it when a salesperson picks someone, but that's optional — this fills the
// gap by matching silently on save when we're confident, leaving the picker as the
// manual override.
//
// Deliberately CONSERVATIVE: only a UNIQUE exact email match, or a UNIQUE exact
// street-address match, is accepted. Anything ambiguous returns null (no link),
// so we never mis-attribute a report to the wrong customer.
//
// Reuses the existing read-only fieldroutes-customer-search edge function.

import { supabase } from "@/integrations/supabase/client";
import { fetchLoginLink } from "@/lib/frLoginLinks";

type AutoMatchInput = {
  email?: string | null;
  name?: string | null;
  address?: string | null;
  staffName?: string | null;
};

export type AutoMatchResult =
  | { customerId: string; matchedOn: "email" | "address"; loginLink?: string | null }
  | null;

const norm = (s: unknown) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

async function search(q: string, staffName?: string | null): Promise<Array<Record<string, unknown>>> {
  try {
    const { data, error } = await supabase.functions.invoke("fieldroutes-customer-search", {
      body: { q, staffName, limit: 15 },
    });
    if (error || !data?.ok) return [];
    return (data.results ?? []) as Array<Record<string, unknown>>;
  } catch {
    return [];
  }
}

// The search results can't carry the portal loginLink (the FieldRoutes customer
// API never exposes it) — fall back to the fieldroutes_login_links cache so an
// auto-matched report still gets its "Open Customer Portal" button.
async function withCachedLoginLink(res: NonNullable<AutoMatchResult>): Promise<AutoMatchResult> {
  if (res.loginLink) return res;
  return { ...res, loginLink: await fetchLoginLink(res.customerId) };
}

export async function autoMatchCustomerId(input: AutoMatchInput): Promise<AutoMatchResult> {
  // 1) Email — the strongest signal. Accept only a single exact-email match.
  const email = (input.email ?? "").trim();
  if (email.includes("@")) {
    const results = await search(email, input.staffName);
    const exact = results.filter((r) => norm(r.email) === norm(email) && r.customer_id);
    if (exact.length === 1) {
      return withCachedLoginLink({
        customerId: String(exact[0].customer_id),
        matchedOn: "email",
        loginLink: (exact[0].loginLink as string | null | undefined) ?? null,
      });
    }
  }

  // 2) Street address — accept only a single match whose address equals (or begins
  //    with) the report's street line. Skips when ambiguous.
  const address = (input.address ?? "").trim();
  const street = address.split(",")[0].trim();
  if (street.length >= 4) {
    const results = await search(street, input.staffName);
    const ns = norm(street);
    const exact = results.filter((r) => {
      const ra = norm(r.address);
      return r.customer_id && ra.length > 0 && (ra === ns || ra.startsWith(ns));
    });
    if (exact.length === 1) {
      return withCachedLoginLink({
        customerId: String(exact[0].customer_id),
        matchedOn: "address",
        loginLink: (exact[0].loginLink as string | null | undefined) ?? null,
      });
    }
  }

  return null;
}
