import { supabase } from "@/integrations/supabase/client";

/**
 * Auto-create a Rodent Exclusion Report (an InitialPestReport with
 * `customer_preferences.reportFormat = "rodent-exclusion"`) from a signed
 * sales report that contains Rodent Exclusion or Rodent Trapping & Exclusion.
 *
 * Idempotent: if a rodent-exclusion report already exists with the same
 * `sourceSalesReportId`, returns the existing id instead of inserting again.
 * Safe to call multiple times.
 */

type Maybe<T> = T | null | undefined;

const TRIGGER_SERVICES = new Set([
  "rodent exclusion",
  "rodent trapping & exclusion",
  "rodent trapping and exclusion",
]);

function flattenServiceTypes(services: unknown): string[] {
  if (!services) return [];
  const out: string[] = [];
  const walk = (v: any) => {
    if (!v) return;
    if (Array.isArray(v)) v.forEach(walk);
    else if (typeof v === "object") {
      if (typeof v.serviceType === "string") out.push(v.serviceType);
      if (Array.isArray(v.services)) v.services.forEach(walk);
    }
  };
  walk(services);
  return out;
}

export function salesReportHasRodentExclusion(services: unknown): boolean {
  return flattenServiceTypes(services).some((s) =>
    TRIGGER_SERVICES.has(s.trim().toLowerCase()),
  );
}

export interface SalesReportLike {
  id: string;
  technician_name?: Maybe<string>;
  customer_name?: Maybe<string>;
  customer_email?: Maybe<string>;
  customer_phone?: Maybe<string>;
  address?: Maybe<string>;
  service_date?: Maybe<string>;
  license_number?: Maybe<string>;
  map_url?: Maybe<string>;
  map_data?: unknown;
  custom_map_url?: Maybe<string>;
  rendered_map_url?: Maybe<string>;
  fieldroutes_customer_id?: Maybe<string>;
  customer_preferences?: Maybe<Record<string, unknown>>;
  services?: unknown;
  property_images?: Maybe<Array<{ image: string; caption?: string }>>;
}

export interface AutoCreateResult {
  reportId: string;
  created: boolean;
}

export async function ensureRodentExclusionReport(
  sales: SalesReportLike,
): Promise<AutoCreateResult | null> {
  if (!salesReportHasRodentExclusion(sales.services)) return null;

  // Idempotency check: query for any report already linked to this sales id.
  // We use a JSON containment filter on customer_preferences.
  const { data: existing } = await supabase
    .from("reports")
    .select("id")
    .contains("customer_preferences", {
      reportFormat: "rodent-exclusion",
      sourceSalesReportId: sales.id,
    } as any)
    .limit(1)
    .maybeSingle();

  if (existing?.id) return { reportId: existing.id, created: false };

  const newId = crypto.randomUUID();
  const prefs = (sales.customer_preferences || {}) as Record<string, unknown>;

  // Carry the sales-report property photos forward as "Before" photos so the
  // tech can show the property's pre-service state against the post-service
  // exclusion work. We keep them in customer_preferences.beforeAfter.before so
  // the InitialPestReport can render them as a read-only gallery, and
  // property_images on the new report is reserved for "After" uploads.
  const beforePhotos = Array.isArray(sales.property_images)
    ? sales.property_images
        .filter((p) => p && typeof p.image === "string" && p.image)
        .map((p) => ({ image: p.image, caption: p.caption || "" }))
    : [];

  const insertRow = {
    id: newId,
    technician_name: sales.technician_name || "",
    customer_name: sales.customer_name || null,
    customer_email: sales.customer_email || null,
    customer_phone: sales.customer_phone || null,
    address: sales.address || null,
    service_date: sales.service_date || new Date().toISOString().slice(0, 10),
    license_number: sales.license_number || null,
    target_pests: ["Rodents"],
    products_used: [],
    equipment: [],
    map_url: sales.map_url || null,
    map_data: sales.map_data ?? null,
    custom_map_url: sales.custom_map_url || null,
    rendered_map_url: sales.rendered_map_url || null,
    fieldroutes_customer_id: sales.fieldroutes_customer_id || null,
    property_images: [],
    report_title: "Rodent Exclusion Report",
    notes: null,
    customer_preferences: {
      ...prefs,
      reportFormat: "rodent-exclusion",
      sourceSalesReportId: sales.id,
      beforeAfter: { before: beforePhotos, after: [], pairs: [] },
    },
  };

  const { error } = await supabase.from("reports").insert([insertRow as any]);
  if (error) {
    console.error("ensureRodentExclusionReport insert failed:", error);
    return null;
  }
  return { reportId: newId, created: true };
}

/** Build the URL to open the auto-created rodent exclusion report. */
export function rodentExclusionUrl(reportId: string): string {
  return `/initial-pest-report/${reportId}`;
}