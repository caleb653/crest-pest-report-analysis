import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface BillingSettingsRow {
  property_id: string;
  billing_mode: string | null;
  cadence: string | null;
  cadence_anchor: string | null;
  base_price_basis: string | null;
  payment_terms_days: number | null;
  send_mode: string | null;
  default_po_number: string | null;
  tax_rate: number | null;
}

/**
 * The property's billing arrangement. Returns null while loading or when the
 * property has never been set up — callers fall back to a neutral label rather
 * than asserting a cycle the property may not be on.
 */
export function useBillingSettings(propertyId?: string | null) {
  const [settings, setSettings] = useState<BillingSettingsRow | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!propertyId) {
      setSettings(null);
      return;
    }
    supabase
      .from("portal_billing_settings")
      .select("*")
      .eq("property_id", propertyId)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setSettings((data as BillingSettingsRow) ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, [propertyId]);

  return settings;
}
