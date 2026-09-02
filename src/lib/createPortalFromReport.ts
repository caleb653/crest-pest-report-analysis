import { supabase } from "@/integrations/supabase/client";

// Frequency (days) lookup keyed by serviceType used in Sales / Multi-Proposal reports.
// 0 = one-time service.
const SERVICE_FREQUENCY: Record<string, number> = {
  "Monthly Services": 30,
  "Bi-Monthly Services": 60,
  "Quarterly Services": 90,
  "Commercial General Pest": 30,
  "Commercial Rodent": 30,
  "Commercial Rodent and Pest": 30,
  "General Pest Control": 30,
  "Mosquito Service": 30,
  "Rodent Bait Boxes": 30,
  "Rodent Trapping": 0,
  "Rodent Exclusion": 0,
  "Rodent Trapping and Exclusion": 0,
  "Attic Services (see details below)": 0,
  "De-webbing": 0,
  "Rodent Sanitation": 0,
  "Rodent Clean Up": 0,
  "Bed Bug Treatment": 0,
  "Flea & Tick Treatment": 0,
  "German Cockroach Treatment": 0,
  "Drain Fly Treatment": 0,
};

function flattenServices(reportServices: any): Array<{
  serviceType: string;
  initialPrice?: string;
  recurringPrice?: string;
  frequency?: number;
  proposedServices?: string;
}> {
  if (!Array.isArray(reportServices)) return [];
  // Multi-proposal: array of { name, services: [...] } — flatten each proposal
  const first = reportServices[0];
  if (first && typeof first === "object" && "services" in first && Array.isArray((first as any).services)) {
    const flat: any[] = [];
    for (const proposal of reportServices) {
      const propName = (proposal as any).name || "Proposal";
      for (const s of (proposal as any).services || []) {
        flat.push({ ...s, _proposal: propName });
      }
    }
    return flat;
  }
  return reportServices as any[];
}

export type PortalPropertyType = "apartments" | "hoa" | "commercial";

export async function createPortalFromReport(
  reportId: string,
  propertyType: PortalPropertyType = "apartments",
): Promise<{
  clientId: string;
  propertyId: string;
  linkToken: string;
} | null> {
  // 1) Fetch the full report
  const { data: report, error: rErr } = await supabase
    .from("reports")
    .select("*")
    .eq("id", reportId)
    .maybeSingle();
  if (rErr || !report) throw rErr || new Error("Report not found");

  const customerName = (report.customer_name || "").trim() || "Unnamed Customer";
  const address = report.address || null;

  // 2) Find or create portal_client (match by exact customer name + email)
  let clientId: string | null = null;
  const { data: existingClients } = await supabase
    .from("portal_clients")
    .select("id, name, email")
    .eq("name", customerName)
    .limit(1);
  if (existingClients && existingClients.length > 0) {
    clientId = existingClients[0].id;
  } else {
    const { data: newClient, error: cErr } = await supabase
      .from("portal_clients")
      .insert({
        name: customerName,
        email: report.customer_email || null,
        phone: report.customer_phone || null,
      })
      .select("id")
      .single();
    if (cErr || !newClient) throw cErr || new Error("Failed to create client");
    clientId = newClient.id;
  }

  // 3) Build the proposed-services summary + determine the most frequent recurring cadence.
  //    For multi-proposal reports, use only the recommended proposal (or the first one
  //    if none is flagged). Single-proposal reports use all services.
  const rawServices = (report as any).services;
  let chosenServices: any[] = [];

  if (Array.isArray(rawServices) && rawServices.length > 0
      && typeof rawServices[0] === "object" && "services" in rawServices[0]) {
    // Multi-proposal: pick the recommended proposal, else the first.
    const recommended =
      rawServices.find((p: any) => p.recommended || p.isRecommended) ?? rawServices[0];
    chosenServices = Array.isArray(recommended?.services) ? recommended.services : [];
  } else {
    chosenServices = flattenServices(rawServices);
  }

  const serviceNames: string[] = [];
  let mostFrequentDays: number | null = null; // smallest positive frequency wins

  for (const s of chosenServices) {
    if (!s || !s.serviceType) continue;
    if (!serviceNames.includes(s.serviceType)) serviceNames.push(s.serviceType);
    const freq = s.frequency ?? SERVICE_FREQUENCY[s.serviceType] ?? null;
    if (freq && freq > 0) {
      if (mostFrequentDays === null || freq < mostFrequentDays) mostFrequentDays = freq;
    }
  }

  // If any chosen service references rodents, surface "Rodents" as a target pest
  // so the Pesticide Pre-Application Notice auto-checks it for this property.
  const includesRodents = serviceNames.some((n) => /rodent/i.test(n));
  const reportTargetPests: string[] = Array.isArray((report as any).target_pests)
    ? ((report as any).target_pests as string[])
    : [];
  const mergedTargetPests = Array.from(
    new Set<string>([
      ...reportTargetPests.map((p) => String(p)),
      ...(includesRodents ? ["Rodents"] : []),
    ])
  );

  // Prefer the FULL "Proposed Services" text written on the sales report
  // (stored in `findings[0]` as HTML). Fall back to a bullet list of service
  // names if no findings exist. The portal renders this in a plain Textarea,
  // so convert <br>, list-style HTML and tags into plain text.
  const findingsHtml: string | null = (() => {
    const f = (report as any).findings;
    if (Array.isArray(f) && f.length > 0 && typeof f[0] === "string" && f[0].trim().length > 0) {
      return f[0] as string;
    }
    return null;
  })();

  const htmlToPlainText = (html: string): string =>
    html
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n\n")
      .replace(/<\/li>/gi, "\n")
      .replace(/<li[^>]*>/gi, "• ")
      .replace(/<\/(h[1-6]|div)>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

  const propertyPlan = findingsHtml
    ? `Proposed Services:\n\n${htmlToPlainText(findingsHtml)}`
    : serviceNames.length > 0
      ? `Proposed Services:\n${serviceNames.map((n) => `• ${n}`).join("\n")}`
      : null;

  // Map the most-frequent recurring cadence (in days) to the PM portal's frequency key.
  // Defaults to bi-weekly when no recurring service exists.
  const frequencyKey: "weekly" | "bi-weekly" | "monthly" | "8-weekly" | "bi-monthly" | "12-weekly" | "quarterly" = (() => {
    if (mostFrequentDays === null) return "bi-weekly";
    if (mostFrequentDays <= 7) return "weekly";
    if (mostFrequentDays <= 14) return "bi-weekly";
    if (mostFrequentDays <= 30) return "monthly";
    if (mostFrequentDays <= 56) return "8-weekly";
    if (mostFrequentDays <= 60) return "bi-monthly";
    if (mostFrequentDays <= 84) return "12-weekly";
    return "quarterly";
  })();

  // 4) Create portal_property — populate address + map + plan summary; leave preferences empty
  // Property name should reflect the property (customer name like "Stonebrook Apartments"),
  // NOT the street address. Fall back to address only when no customer name exists.
  const propertyName = customerName !== "Unnamed Customer" ? customerName : (address || "Unnamed Property");
  // Prefer the original uploaded map plus saved annotations. The old pre-rendered
  // flat image can include failed static-map output (black tiles), so only use it
  // when there is no uploaded map available.
  const customMapUrl = (report as any).custom_map_url || null;
  const renderedMapUrl = (report as any).rendered_map_url || null;
  const reportMapData = (report as any).map_data || null;
  const mapImageUrl = customMapUrl || renderedMapUrl || (report as any).map_url || null;
  const portalMapData = customMapUrl ? reportMapData : null;
  const propertyImage =
    Array.isArray((report as any).property_images) && (report as any).property_images.length > 0
      ? (report as any).property_images[0]
      : null;

  const { data: newProperty, error: pErr } = await supabase
    .from("portal_properties")
    .insert({
      client_id: clientId,
      name: propertyName,
      address,
      image_url: propertyImage,
      map_image_url: mapImageUrl,
      map_data: portalMapData,
      notes: propertyPlan,
      // Only the service_frequency + property_type keys are set — no other customer preferences.
      // target_pests is included so the Pre-Application Notice auto-checks the right pests
      // (e.g. Rodents when the proposal includes rodent work).
      customer_preferences: {
        service_frequency: frequencyKey,
        property_type: propertyType,
        ...(mergedTargetPests.length > 0 ? { target_pests: mergedTargetPests } : {}),
      },
    })
    .select("id")
    .single();
  if (pErr || !newProperty) throw pErr || new Error("Failed to create property");
  const propertyId = newProperty.id;

  // NOTE: Intentionally do NOT create any portal_services rows here.
  // The Property Plan summarizes what was proposed; previous/upcoming services start blank.

  // 5) Create a PM (sub) link for this property
  const { data: link, error: lErr } = await supabase
    .from("portal_links")
    .insert({
      client_id: clientId,
      link_type: "sub",
      label: `${propertyName} — PM Link`,
      assigned_property_ids: [propertyId],
    })
    .select("token")
    .single();
  if (lErr || !link) throw lErr || new Error("Failed to create link");

  return { clientId, propertyId, linkToken: link.token };
}