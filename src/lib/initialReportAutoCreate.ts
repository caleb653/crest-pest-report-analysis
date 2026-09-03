import { supabase } from "@/integrations/supabase/client";

/**
 * Create an Initial Pest Report (the lean, internal "site map + notes" report)
 * from a saved sales / multi-proposal report, carrying the SAME site map and
 * the customer / job info across. Mirrors rodentExclusionAutoCreate.ts.
 *
 * Idempotent: if an initial report already exists with the same
 * `sourceSalesReportId`, returns that id instead of inserting again.
 */

type Maybe<T> = T | null | undefined;

export interface SalesReportForInitial {
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
  fieldroutes_login_link?: Maybe<string>;
  target_pests?: Maybe<string[]>;
  property_type?: Maybe<string>;
  company_name?: Maybe<string>;
  property_images?: Maybe<Array<{ image: string; caption?: string }>>;
}

export interface InitialAutoCreateResult {
  reportId: string;
  created: boolean;
}

export async function ensureInitialReport(
  sales: SalesReportForInitial,
): Promise<InitialAutoCreateResult | null> {
  const { data: existing } = await supabase
    .from("reports")
    .select("id")
    .contains("customer_preferences", {
      reportFormat: "general",
      sourceSalesReportId: sales.id,
    } as any)
    .limit(1)
    .maybeSingle();
  if (existing?.id) return { reportId: existing.id, created: false };

  const newId = crypto.randomUUID();
  const propertyImages = Array.isArray(sales.property_images)
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
    target_pests: (sales.target_pests || []).filter(Boolean),
    products_used: [],
    equipment: [],
    findings: [],
    recommendations: [],
    next_steps: [],
    map_url: sales.map_url || null,
    map_data: sales.map_data ?? null,
    custom_map_url: sales.custom_map_url || null,
    rendered_map_url: sales.rendered_map_url || null,
    fieldroutes_customer_id: sales.fieldroutes_customer_id || null,
    property_images: propertyImages,
    report_title: "Initial Pest Report",
    notes: null,
    customer_preferences: {
      reportFormat: "general",
      sourceSalesReportId: sales.id,
      propertyType: sales.property_type || "Residential",
      ...(sales.company_name ? { companyName: sales.company_name } : {}),
      ...(sales.fieldroutes_login_link ? { fieldroutes_login_link: sales.fieldroutes_login_link } : {}),
    },
  };

  const { error } = await supabase.from("reports").insert([insertRow as any]);
  if (error) {
    console.error("ensureInitialReport insert failed:", error);
    return null;
  }
  return { reportId: newId, created: true };
}

export function initialReportUrl(reportId: string): string {
  return `/initial-pest-report/${reportId}`;
}
