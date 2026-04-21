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

export async function createPortalFromReport(reportId: string): Promise<{
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

  // 3) Create portal_property — populate address + map data + property image
  const propertyName = address || customerName;
  const mapImageUrl =
    (report as any).rendered_map_url ||
    (report as any).custom_map_url ||
    (report as any).map_url ||
    null;
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
      map_data: (report as any).map_data || null,
      notes: `Created from report ${reportId}`,
    })
    .select("id")
    .single();
  if (pErr || !newProperty) throw pErr || new Error("Failed to create property");
  const propertyId = newProperty.id;

  // 4) Create portal_services from each proposed service
  const services = flattenServices((report as any).services);
  const targetPests = Array.isArray((report as any).target_pests)
    ? (report as any).target_pests.join(", ")
    : null;

  const serviceRows = services
    .filter((s) => s && s.serviceType)
    .map((s) => {
      const freq = s.frequency ?? SERVICE_FREQUENCY[s.serviceType] ?? null;
      const summaryParts: string[] = [];
      if ((s as any)._proposal) summaryParts.push(`Proposal: ${(s as any)._proposal}`);
      if (s.initialPrice) summaryParts.push(`Initial: $${s.initialPrice}`);
      if (s.recurringPrice) summaryParts.push(`Recurring: $${s.recurringPrice}`);
      if (freq && freq > 0) summaryParts.push(`Every ${freq} days`);
      else if (freq === 0) summaryParts.push("One-time");

      return {
        property_id: propertyId,
        service_type: s.serviceType,
        status: "scheduled",
        scheduling_status: "proposed",
        frequency_days: freq && freq > 0 ? freq : null,
        summary: summaryParts.join(" • ") || null,
        notes: targetPests ? `Target Pests: ${targetPests}` : null,
      };
    });

  if (serviceRows.length > 0) {
    const { error: sErr } = await supabase.from("portal_services").insert(serviceRows);
    if (sErr) throw sErr;
  }

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