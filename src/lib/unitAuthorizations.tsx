import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Per-unit Right-to-Treat authorizations for one property.
 *
 * One row per (property, unit). The whole property's rows are loaded once by
 * the provider (mounted around the admin dashboard and the PM portal) so the
 * chip beside every unit number can look its unit up synchronously, and a
 * signature captured on one card is reflected on every other card that shows
 * the same unit.
 */
export interface UnitAuthorization {
  id: string;
  property_id: string;
  unit_number: string;
  unit_key: string;
  signer_name: string | null;
  signer_email: string | null;
  signature: string | null;
  signed_at: string | null;
  signed_via: string | null;
  token: string | null;
  created_at: string;
  updated_at: string;
}

/** "Unit 12A " / "#12a" / "12A" all map to the same authorization. */
export function unitKeyOf(unit: unknown): string {
  return String(unit ?? "")
    .trim()
    .replace(/^(unit|apt|apartment|#)\s*/i, "")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

interface UnitAuthorizationsContextValue {
  propertyId: string;
  propertyName: string;
  propertyAddress: string | null;
  loading: boolean;
  byUnit: Map<string, UnitAuthorization>;
  all: UnitAuthorization[];
  get: (unit: unknown) => UnitAuthorization | undefined;
  /** Create the row for a unit if missing (gives it a share token) and return it. */
  ensure: (unit: string) => Promise<UnitAuthorization | null>;
  sign: (unit: string, input: { signerName: string; signerEmail?: string; signature: string; via: string }) => Promise<UnitAuthorization | null>;
  clear: (unit: string) => Promise<void>;
  reload: () => Promise<void>;
}

const Ctx = createContext<UnitAuthorizationsContextValue | null>(null);

export function UnitAuthorizationsProvider({
  propertyId,
  propertyName,
  propertyAddress,
  children,
}: {
  propertyId: string;
  propertyName: string;
  propertyAddress?: string | null;
  children: ReactNode;
}) {
  const [rows, setRows] = useState<UnitAuthorization[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!propertyId) return;
    const { data, error } = await supabase
      .from("portal_unit_authorizations" as any)
      .select("*")
      .eq("property_id", propertyId);
    if (!error && Array.isArray(data)) setRows(data as unknown as UnitAuthorization[]);
    setLoading(false);
  }, [propertyId]);

  useEffect(() => {
    setLoading(true);
    setRows([]);
    void reload();
  }, [reload]);

  const byUnit = useMemo(() => {
    const m = new Map<string, UnitAuthorization>();
    for (const r of rows) m.set(r.unit_key, r);
    return m;
  }, [rows]);

  const upsertLocal = useCallback((row: UnitAuthorization) => {
    setRows((prev) => {
      const i = prev.findIndex((r) => r.id === row.id || r.unit_key === row.unit_key);
      if (i === -1) return [...prev, row];
      const next = prev.slice();
      next[i] = row;
      return next;
    });
  }, []);

  const ensure = useCallback(async (unit: string): Promise<UnitAuthorization | null> => {
    const key = unitKeyOf(unit);
    if (!key) return null;
    const existing = byUnit.get(key);
    if (existing) return existing;
    const { data, error } = await supabase
      .from("portal_unit_authorizations" as any)
      .upsert(
        { property_id: propertyId, unit_number: String(unit).trim(), unit_key: key },
        { onConflict: "property_id,unit_key", ignoreDuplicates: false },
      )
      .select("*")
      .maybeSingle();
    if (error || !data) {
      // A concurrent insert from another card may have won; read it back.
      const { data: again } = await supabase
        .from("portal_unit_authorizations" as any)
        .select("*")
        .eq("property_id", propertyId)
        .eq("unit_key", key)
        .maybeSingle();
      if (again) { upsertLocal(again as unknown as UnitAuthorization); return again as unknown as UnitAuthorization; }
      return null;
    }
    upsertLocal(data as unknown as UnitAuthorization);
    return data as unknown as UnitAuthorization;
  }, [byUnit, propertyId, upsertLocal]);

  const sign = useCallback(async (unit: string, input: { signerName: string; signerEmail?: string; signature: string; via: string }) => {
    const key = unitKeyOf(unit);
    if (!key) return null;
    const payload = {
      property_id: propertyId,
      unit_number: String(unit).trim(),
      unit_key: key,
      signer_name: input.signerName.trim().slice(0, 200) || null,
      signer_email: (input.signerEmail || "").trim().slice(0, 200) || null,
      signature: input.signature,
      signed_at: new Date().toISOString(),
      signed_via: input.via,
    };
    const { data, error } = await supabase
      .from("portal_unit_authorizations" as any)
      .upsert(payload, { onConflict: "property_id,unit_key" })
      .select("*")
      .maybeSingle();
    if (error || !data) return null;
    upsertLocal(data as unknown as UnitAuthorization);
    return data as unknown as UnitAuthorization;
  }, [propertyId, upsertLocal]);

  const clear = useCallback(async (unit: string) => {
    const key = unitKeyOf(unit);
    const row = byUnit.get(key);
    if (!row) return;
    const { data } = await supabase
      .from("portal_unit_authorizations" as any)
      .update({ signature: null, signed_at: null, signer_name: null, signer_email: null, signed_via: null })
      .eq("id", row.id)
      .select("*")
      .maybeSingle();
    if (data) upsertLocal(data as unknown as UnitAuthorization);
  }, [byUnit, upsertLocal]);

  const value = useMemo<UnitAuthorizationsContextValue>(() => ({
    propertyId,
    propertyName,
    propertyAddress: propertyAddress ?? null,
    loading,
    byUnit,
    all: rows,
    get: (unit) => byUnit.get(unitKeyOf(unit)),
    ensure,
    sign,
    clear,
    reload,
  }), [propertyId, propertyName, propertyAddress, loading, byUnit, rows, ensure, sign, clear, reload]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Null when rendered outside a provider (the chip then renders nothing). */
export function useUnitAuthorizations(): UnitAuthorizationsContextValue | null {
  return useContext(Ctx);
}
