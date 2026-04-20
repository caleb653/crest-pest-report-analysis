import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  ChevronDown, Calendar, Plus, Edit, Trash2,
  CheckCircle, Wrench, Image, ExternalLink, MapPin, Bug,
  Copy, FileText, Send, X, Flag, ClipboardList, CalendarPlus, Link2, FileDown, FlaskConical
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { ReadOnlyMapCanvas } from "@/components/ReadOnlyMapCanvas";
import { MapCanvas } from "@/components/MapCanvas";
import { ProductUsageEditor } from "@/components/portal/ProductUsageEditor";
import { ProductUsageSummary, ProductUsageTotalsCard } from "@/components/portal/ProductUsageSummary";
import { UnitProductPicker } from "@/components/portal/UnitProductPicker";
import { ProductUsage, normalizeUsageList } from "@/lib/productCatalog";

// ─── Types ───
interface PortalProperty {
  id: string; client_id: string; name: string; address: string | null; notes: string | null;
  image_url: string | null; map_data: any; map_image_url: string | null;
  equipment: any; customer_preferences: any;
}
interface PortalService {
  id: string; property_id: string; service_date: string | null; service_time: string | null;
  service_type: string; technician: string | null; status: string; summary: string | null;
  findings: string | null; notes: string | null; products_used: any; photos: any;
  follow_up_recommended: boolean | null; follow_up_notes: string | null;
  scheduling_status: string | null; prep_required: boolean | null; prep_notes: string | null;
  unit_details: any; special_notes: string | null; units_planned: any;
  frequency_days?: number | null;
}
interface PortalLink {
  id: string; client_id: string; token: string; link_type: string; label: string | null;
  assigned_property_ids: any; is_active: boolean; unit_number?: string | null;
}

// ─── Constants ───
const EQUIPMENT_OPTIONS = ["Rodent Bait Stations", "Rodent Traps", "Mosquito Buckets", "Fly Light", "Pest Monitors"];
const PREFERENCE_OPTIONS = ["Green / Eco-Friendly Products", "Standard Products", "No Preference", "Interior Treatment Only", "Exterior Treatment Only", "Other"];
const PEST_TYPES = ["Ants", "Spiders", "American Roaches", "German Cockroaches", "Crickets", "Earwigs", "Rodents", "Bed Bugs", "Fleas", "Mosquitoes", "Wasps", "Silverfish", "Other"];
const SERVICE_TYPES = [
  "Commercial General Pest Control", "General Pest Control", "Rodent Trapping",
  "Rodent Exclusion", "Rodent Trapping & Exclusion", "Rodent Bait Boxes",
  "Mosquito Service", "Attic Services", "Dewebbing",
];

const SERVICE_FREQUENCY_MAP: Record<string, number> = {
  "Commercial General Pest Control": 30,
  "General Pest Control": 30,
  "Mosquito Service": 30,
  "Rodent Bait Boxes": 30,
  "Dewebbing": 30,
};

const ACTIVITY_OPTIONS = ["None", "Low", "Moderate", "High"];
const STATUS_OPTIONS = ["Treated", "Inspected", "Not Treated", "Treated - Follow Up"];

const TECHNICIAN_OPTIONS = [
  "Darrell Tanner",
  "Jesse Angulo",
  "Jake Shubin",
  "Caleb Whalen",
  "Jackson Latham",
  "Dylan Gallegos",
  "Michael Muniz",
];

const PRODUCT_OPTIONS_LIST = [
  "Alpine WSG", "Bifen I/T", "Essentria IC Pro", "Temprid FX", "Termidor SC",
  "Phantom", "ExciteR", "Gentrol IGR Concentrate", "Nyguard IGR Concentrate",
  "PT Wasp Freeze", "PT Alpine Flea & Bed Bug", "PT Alpine Fly Bait",
  "Gentrol Aerosol", "Bedlam", "Invade Hot Spot +", "Niban", "Bifen LP",
  "Advion Ant Gel Bait", "Maxforce FC Ant Gel", "MasterLine B MaxxPro",
  "Advion Cockroach Gel Bait", "Contrac California", "Delta Dust (Bayer)",
  "In2Care Mix", "OneGuard", "Advion Microflow", "Optigard",
];

interface Props {
  property: PortalProperty;
  services: PortalService[];
  links: PortalLink[];
  clientName: string;
  clientId: string;
  onRefresh: () => void;
  onOpenServiceReport: (service: PortalService) => void;
  onEditService: (service: PortalService) => void;
  onDeleteService: (id: string) => void;
  onUpdatePropertyImage: (propId: string, file: File) => void;
  uploadingPropertyImage: boolean;
  onCopyLink?: (token: string, type: string) => void;
  onOpenPortal?: (token: string, type: string) => void;
  onAddUpcomingService?: () => void;
}

const today = new Date().toISOString().split("T")[0];

// Add `days` to an ISO date string (YYYY-MM-DD) using UTC to avoid TZ drift.
const addDaysISO = (isoDate: string, days: number): string => {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().split("T")[0];
};

// Generate upcoming dates spaced exactly `frequencyDays` apart starting after `lastDate`.
const generateUpcomingDates = (lastDate: string, frequencyDays: number, count: number): string[] => {
  const dates: string[] = [];
  let cur = lastDate;
  for (let i = 0; i < count; i++) {
    cur = addDaysISO(cur, frequencyDays);
    dates.push(cur);
  }
  return dates;
};

// Generate fallback dates starting from today, spaced `frequencyDays` apart.
const generateDummyDates = (count: number, frequencyDays: number = 14): string[] => {
  const dates: string[] = [];
  let cur = today;
  for (let i = 0; i < count; i++) {
    cur = addDaysISO(cur, frequencyDays);
    dates.push(cur);
  }
  return dates;
};

const PropertyDashboard = ({
  property, services, links, clientName, clientId,
  onRefresh, onOpenServiceReport, onEditService, onDeleteService,
  onUpdatePropertyImage, uploadingPropertyImage,
  onCopyLink, onOpenPortal, onAddUpcomingService,
}: Props) => {
  const [pastViewMode, setPastViewMode] = useState<"date" | "unit">("date");
  const [expandedPastId, setExpandedPastId] = useState<string | null>(null);
  const [expandedUpcomingId, setExpandedUpcomingId] = useState<string | null>(null);
  const [completingServiceId, setCompletingServiceId] = useState<string | null>(null);
  const [followUpUnits, setFollowUpUnits] = useState<string[]>([]);
  const [workOrder, setWorkOrder] = useState({ unit_number: "", pest_type: "", location_type: "Interior", comments: "", preferred_date: "", request_type: "treatment" as "treatment" | "inspection" });
  const [activeTab, setActiveTab] = useState<string>("map");
  const [addingServiceDate, setAddingServiceDate] = useState("");
  const [addingServiceType, setAddingServiceType] = useState("Commercial General Pest Control");
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  // Inline add-unit state
  const [addingUnitToService, setAddingUnitToService] = useState<string | null>(null);
  const [newUnitData, setNewUnitData] = useState({ unit_number: "", findings: "", pest_activity: "None", products_used: "", status: "Treated", notes: "" });
  // Inline add-unit for upcoming
  const [addingPlannedUnit, setAddingPlannedUnit] = useState<string | null>(null);
  const [newPlannedUnit, setNewPlannedUnit] = useState("");
  // Inline completion form data
  const [completionData, setCompletionData] = useState<Record<string, {
    unitRows: { unit_number: string; target_pest: string; findings: string; pest_activity: string; products_used: ProductUsage[]; status: string; notes: string; source: string }[];
    summary: string; findings: string; notes: string; technician: string;
    time_in: string; time_out: string;
    photos: { url: string; uploading?: boolean }[];
    products: ProductUsage[];
  }>>({});
  const [uploadingPhotoFor, setUploadingPhotoFor] = useState<string | null>(null);
  const [pendingRequests, setPendingRequests] = useState<any[]>([]);
  const [prepSheets, setPrepSheets] = useState<{ id: string; title: string; description: string | null; treatment_type: string }[]>([]);
  const [expandedPrepSheet, setExpandedPrepSheet] = useState<string | null>(null);
  const [copyingPrepSheet, setCopyingPrepSheet] = useState<string | null>(null);

  // Local Property Plan state — debounced save so typing isn't laggy or toast-spammy
  const [planDraft, setPlanDraft] = useState<string>(property.notes || "");
  useEffect(() => { setPlanDraft(property.notes || ""); }, [property.id, property.notes]);
  useEffect(() => {
    if ((property.notes || "") === planDraft) return;
    const t = setTimeout(async () => {
      const { error } = await supabase
        .from("portal_properties")
        .update({ notes: planDraft })
        .eq("id", property.id);
      if (error) {
        toast({ title: "Failed to save plan", variant: "destructive" });
      } else {
        toast({ title: "Property plan saved", duration: 1200 });
      }
    }, 800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planDraft]);

  // Local Customer Preference state — same debounced pattern as Property Plan
  const initialPrefNotes = (property.customer_preferences as any)?.notes || "";
  const [prefDraft, setPrefDraft] = useState<string>(initialPrefNotes);
  useEffect(() => {
    setPrefDraft((property.customer_preferences as any)?.notes || "");
  }, [property.id, property.customer_preferences]);
  useEffect(() => {
    const current = (property.customer_preferences as any)?.notes || "";
    if (current === prefDraft) return;
    const t = setTimeout(async () => {
      const updated = { ...(property.customer_preferences || {}), notes: prefDraft };
      const { error } = await supabase
        .from("portal_properties")
        .update({ customer_preferences: updated })
        .eq("id", property.id);
      if (error) {
        toast({ title: "Failed to save preferences", variant: "destructive" });
      } else {
        toast({ title: "Customer preferences saved", duration: 1200 });
      }
    }, 800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefDraft]);

  // Load pending requests and prep sheets for this property
  useEffect(() => {
    const loadRequests = async () => {
      const { data } = await supabase.from("portal_requests")
        .select("*")
        .eq("property_id", property.id)
        .in("status", ["pending", "in_progress"])
        .order("created_at", { ascending: false });
      if (data) setPendingRequests(data);
    };
    const loadPrepSheets = async () => {
      const { data } = await supabase.from("portal_prep_sheets")
        .select("*")
        .order("title");
      if (data) setPrepSheets(data);
    };
    loadRequests();
    loadPrepSheets();
  }, [property.id]);

  const propServices = services.filter(s => s.property_id === property.id);
  const pastServices = propServices
    .filter(s => s.status === "completed")
    .sort((a, b) => (b.service_date || "").localeCompare(a.service_date || ""));
  const scheduledServices = propServices
    .filter(s => s.status !== "completed")
    .sort((a, b) => (a.service_date || "").localeCompare(b.service_date || ""));

  // Property-level service frequency toggle (stored in customer_preferences JSON)
  // Values: "weekly" (7), "bi-weekly" (14), "monthly" (30), "bi-monthly" (60). Defaults to bi-weekly.
  type FrequencyKey = "weekly" | "bi-weekly" | "monthly" | "bi-monthly";
  const FREQUENCY_DAYS: Record<FrequencyKey, number> = {
    "weekly": 7,
    "bi-weekly": 14,
    "monthly": 30,
    "bi-monthly": 60,
  };
  const propertyFrequency: FrequencyKey =
    ((property.customer_preferences as any)?.service_frequency as FrequencyKey) || "bi-weekly";
  const propertyFrequencyDays = FREQUENCY_DAYS[propertyFrequency] ?? 14;

  // Generate projected upcoming dates using the property's frequency toggle.
  // Anchor: most recent past service date (if any), else today. Spacing: propertyFrequencyDays.
  const projectedUpcoming = (() => {
    if (scheduledServices.length > 0) return [];
    const mostRecent = pastServices[0];
    const anchorDate = mostRecent?.service_date || today;
    const dates = generateUpcomingDates(anchorDate, propertyFrequencyDays, 2);
    const fallbackType = mostRecent?.service_type || "General Pest Control";
    const fallbackTech = mostRecent?.technician || null;
    const fallbackUnits = mostRecent?.units_planned || null;
    return dates.map((d, i) => ({
      id: `projected-${i}`,
      isProjected: true,
      service_date: d,
      service_type: fallbackType,
      technician: fallbackTech,
      status: "scheduled",
      units_planned: fallbackUnits,
      property_id: property.id,
    }));
  })();

  // Extract follow-up units (with pest details) from most recent past service
  const followUpDetailsFromPast = (() => {
    if (pastServices.length === 0) return [] as Array<{ unit_number: string; pest_activity?: string; findings?: string; notes?: string; target_pest?: string }>;
    const mostRecent = pastServices[0];
    const details = Array.isArray(mostRecent.unit_details) ? mostRecent.unit_details as any[] : [];
    return details
      .filter((u: any) => u.status === "Treated - Follow Up" && u.unit_number)
      .map((u: any) => ({
        unit_number: String(u.unit_number),
        pest_activity: u.pest_activity || "",
        findings: u.findings || "",
        notes: u.notes || "",
        target_pest: u.target_pest || "",
      }));
  })();
  const followUpFromPast = followUpDetailsFromPast.map(u => u.unit_number);

  // Also include all units from most recent service as default for next
  const unitsFromMostRecent = (() => {
    if (pastServices.length === 0) return [] as string[];
    const mostRecent = pastServices[0];
    const details = Array.isArray(mostRecent.unit_details) ? mostRecent.unit_details as any[] : [];
    return details.filter((u: any) => u.unit_number).map((u: any) => u.unit_number as string);
  })();

  // Show ONE detailed "next service" + 5 future date-only projections.
  // - If 1+ scheduled: keep ONLY the soonest as the next visit (ignore far-future scheduled rows).
  // - If 0 scheduled: project the next visit from anchor (most recent past or today).
  // Following 5 visits = next.date + N * propertyFrequencyDays. Date only — no details shown.
  const FUTURE_PROJECTION_COUNT = 5;
  const allUpcoming = (() => {
    const scheduled = scheduledServices.map(s => ({ ...s, isProjected: false as const }));
    if (scheduled.length >= 1) return [scheduled[0]];
    // No scheduled: take the first projected as the next visit.
    return projectedUpcoming.slice(0, 1);
  })();
  const futureProjectedDates: string[] = (() => {
    const next = allUpcoming[0];
    if (!next?.service_date) return [];
    const dates: string[] = [];
    let cursor = next.service_date;
    for (let i = 0; i < FUTURE_PROJECTION_COUNT; i++) {
      cursor = addDaysISO(cursor, propertyFrequencyDays);
      dates.push(cursor);
    }
    return dates;
  })();

  useEffect(() => {
    // Past services: all collapsed by default
    setExpandedPastId(null);
    // Upcoming services: expand first by default
    if (allUpcoming.length > 0) setExpandedUpcomingId(allUpcoming[0].id);
  }, [property.id]);

  const allUnits = (() => {
    const units = new Set<string>();
    propServices.forEach(s => {
      if (Array.isArray(s.unit_details)) {
        (s.unit_details as any[]).forEach(u => { if (u.unit_number) units.add(u.unit_number); });
      }
      if (Array.isArray(s.units_planned)) {
        (s.units_planned as string[]).forEach(u => units.add(u));
      }
    });
    return Array.from(units).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  })();

  const servicesByUnit = (() => {
    const map = new Map<string, { service: PortalService; unitDetail: any }[]>();
    pastServices.forEach(s => {
      if (Array.isArray(s.unit_details)) {
        (s.unit_details as any[]).forEach(u => {
          const key = u.unit_number || "General";
          if (!map.has(key)) map.set(key, []);
          map.get(key)!.push({ service: s, unitDetail: u });
        });
      }
    });
    pastServices.filter(s => !s.unit_details || (Array.isArray(s.unit_details) && (s.unit_details as any[]).length === 0)).forEach(s => {
      if (!map.has("General")) map.set("General", []);
      map.get("General")!.push({ service: s, unitDetail: null });
    });
    return map;
  })();

  // ─── Inline unit editing for past services ───
  const updateUnitField = async (serviceId: string, unitIndex: number, field: string, value: string) => {
    const svc = propServices.find(s => s.id === serviceId);
    if (!svc) return;
    const details = Array.isArray(svc.unit_details) ? [...(svc.unit_details as any[])] : [];
    if (!details[unitIndex]) return;
    details[unitIndex] = { ...details[unitIndex], [field]: value };
    await supabase.from("portal_services").update({ unit_details: details }).eq("id", serviceId);
    onRefresh();
  };

  // Save service-level products_used (per service date — not per unit).
  // Debounced lightly via local state in the editor; this just persists what's passed in.
  const updateServiceProducts = async (serviceId: string, products: ProductUsage[]) => {
    await supabase.from("portal_services").update({ products_used: products as any }).eq("id", serviceId);
    onRefresh();
  };

  const addUnitToService = async (serviceId: string) => {
    const svc = propServices.find(s => s.id === serviceId);
    if (!svc) return;
    const details = Array.isArray(svc.unit_details) ? [...(svc.unit_details as any[])] : [];
    details.push({ ...newUnitData });
    await supabase.from("portal_services").update({ unit_details: details }).eq("id", serviceId);
    setNewUnitData({ unit_number: "", findings: "", pest_activity: "None", products_used: "", status: "Treated", notes: "" });
    setAddingUnitToService(null);
    toast({ title: "Unit added" });
    onRefresh();
  };

  const addPlannedUnitToService = async (serviceId: string) => {
    const svc = propServices.find(s => s.id === serviceId);
    if (!svc || !newPlannedUnit.trim()) return;
    const planned = Array.isArray(svc.units_planned) ? [...(svc.units_planned as string[])] : [];
    if (!planned.includes(newPlannedUnit.trim())) {
      planned.push(newPlannedUnit.trim());
    }
    await supabase.from("portal_services").update({ units_planned: planned }).eq("id", serviceId);
    setNewPlannedUnit("");
    setAddingPlannedUnit(null);
    toast({ title: "Unit added to plan" });
    onRefresh();
  };

  const initCompletionData = (serviceId: string, displayUnits: string[]) => {
    if (completionData[serviceId]) return; // already initialized
    // Build lookup from follow-up + work order context (only for the first upcoming service)
    const followUpMap = new Map<string, { pest_activity?: string; findings?: string; notes?: string; target_pest?: string }>();
    followUpDetailsFromPast.forEach(u => {
      followUpMap.set(String(u.unit_number), { pest_activity: u.pest_activity, findings: u.findings, notes: u.notes, target_pest: u.target_pest });
    });
    const workOrderMap = new Map<string, { pest_type?: string; description?: string; location_type?: string }>();
    pendingRequests.forEach(r => {
      if (r.unit_number) {
        workOrderMap.set(String(r.unit_number), { pest_type: r.pest_type, description: r.description, location_type: r.location_type });
      }
    });

    const rows = displayUnits.length > 0
      ? displayUnits.map(u => {
          const fu = followUpMap.get(u);
          const wo = workOrderMap.get(u);
          // Source: follow-up wins if present, otherwise default to new work order
          const source = fu ? "follow-up" : "new-work-order";
          // Target Pest: carry forward from prior service's recorded target_pest
          // for follow-ups; for new work orders use the requested pest_type.
          const targetPest = fu?.target_pest || wo?.pest_type || fu?.pest_activity || "";
          const contextParts: string[] = [];
          if (wo?.description) contextParts.push(wo.description);
          else if (fu?.findings) contextParts.push(fu.findings);
          if (fu?.notes && fu.notes !== fu.findings) contextParts.push(fu.notes);
          return {
            unit_number: u,
            target_pest: targetPest,
            findings: contextParts.join(" • "),
            pest_activity: fu?.pest_activity || "None",
            products_used: [] as ProductUsage[],
            status: "To be Treated",
            notes: "",
            source,
          };
        })
      : [{ unit_number: "", target_pest: "", findings: "", pest_activity: "None", products_used: [] as ProductUsage[], status: "To be Treated", notes: "", source: "new-work-order" }];
    setCompletionData(prev => ({
      ...prev,
      [serviceId]: {
        unitRows: rows,
        summary: "", findings: "", notes: "", technician: "",
        time_in: "", time_out: "", photos: [],
        products: normalizeUsageList((propServices.find(s => s.id === serviceId) as any)?.products_used) || [],
      },
    }));
  };

  const completeService = async (serviceId: string) => {
    const data = completionData[serviceId];
    const unitRows = data?.unitRows?.filter(r => r.unit_number) || [];
    const flagged = unitRows.filter(r => r.status === "Treated - Follow Up").map(r => r.unit_number);

    // Build service_time string from time_in / time_out if provided
    const serviceTime = data?.time_in && data?.time_out
      ? `${data.time_in} - ${data.time_out}`
      : data?.time_in || data?.time_out || null;

    // Service-level products (entered once per service date — not per unit)
    const aggregatedProducts = data?.products || [];

    // Persist photo URLs (strip uploading flags)
    const photosToSave = (data?.photos || []).filter(p => !p.uploading && p.url).map(p => ({ url: p.url }));

    await supabase.from("portal_services").update({
      status: "completed",
      service_date: today,
      service_time: serviceTime,
      unit_details: unitRows as any,
      summary: data?.summary || null,
      findings: data?.findings || null,
      notes: data?.notes || null,
      technician: data?.technician || null,
      products_used: aggregatedProducts as any,
      photos: photosToSave,
    }).eq("id", serviceId);

    // Auto-schedule follow-ups to next service
    if (flagged.length > 0) {
      const nextService = allUpcoming.find(s => s.id !== serviceId && !s.isProjected);
      if (nextService) {
        const existing = Array.isArray(nextService.units_planned) ? nextService.units_planned as string[] : [];
        const merged = Array.from(new Set([...existing, ...flagged]));
        await supabase.from("portal_services").update({ units_planned: merged }).eq("id", nextService.id);
      } else {
        const freq = SERVICE_FREQUENCY_MAP[propServices.find(s => s.id === serviceId)?.service_type || ""] || 30;
        const nextDate = new Date(Date.now() + freq * 86400000).toISOString().split("T")[0];
        const svc = propServices.find(s => s.id === serviceId);
        await supabase.from("portal_services").insert({
          property_id: property.id,
          service_type: svc?.service_type || "General Pest Control",
          service_date: nextDate, status: "scheduled",
          units_planned: flagged,
          special_notes: `Follow-up units from ${today}: ${flagged.join(", ")}`,
        });
      }
    }
    setCompletionData(prev => { const n = { ...prev }; delete n[serviceId]; return n; });
    setCompletingServiceId(null);
    setFollowUpUnits([]);
    toast({ title: "Service completed", description: "Moved to Previous Services." });
    setActiveTab("past");
    onRefresh();
  };

  // ─── Photo upload for completion form ───
  const uploadCompletionPhoto = async (serviceId: string, file: File) => {
    setUploadingPhotoFor(serviceId);
    try {
      const { compressImage, inferImageUploadMeta } = await import("@/lib/imageUpload");
      const { blob } = await compressImage(file, { maxWidth: 1600, maxHeight: 1600, quality: 0.8 });
      const meta = inferImageUploadMeta(file);
      const path = `service-photos/${serviceId}/${Date.now()}.${meta.ext}`;
      const { error } = await supabase.storage.from("report-images").upload(path, blob, {
        contentType: meta.contentType, upsert: false,
      });
      if (error) throw error;
      const { data: pub } = supabase.storage.from("report-images").getPublicUrl(path);
      setCompletionData(prev => ({
        ...prev,
        [serviceId]: {
          ...prev[serviceId],
          photos: [...(prev[serviceId]?.photos || []), { url: pub.publicUrl }],
        },
      }));
      toast({ title: "Photo uploaded", duration: 1500 });
    } catch (e: any) {
      toast({ title: "Upload failed", description: e?.message || "Try again", variant: "destructive" });
    } finally {
      setUploadingPhotoFor(null);
    }
  };

  const removeCompletionPhoto = (serviceId: string, idx: number) => {
    setCompletionData(prev => ({
      ...prev,
      [serviceId]: {
        ...prev[serviceId],
        photos: prev[serviceId].photos.filter((_, i) => i !== idx),
      },
    }));
  };

  const submitWorkOrder = async () => {
    if (!workOrder.unit_number && !workOrder.comments) return;
    // Case-insensitive normalization against existing units for this property
    const typed = (workOrder.unit_number || "").trim();
    const canonical = typed
      ? (allUnits.find(u => u.toLowerCase() === typed.toLowerCase()) || typed)
      : "Facility";
    await supabase.from("portal_requests").insert({
      property_id: property.id,
      unit_number: canonical,
      request_type: workOrder.request_type === "inspection" ? "Inspection Request" : "Service Request",
      description: `[${workOrder.request_type === "inspection" ? "INSPECTION" : "TREATMENT"}] ${workOrder.pest_type || "General"} - ${workOrder.location_type}${workOrder.comments ? ` - ${workOrder.comments}` : ""}`,
      pest_type: workOrder.pest_type || null,
      location_type: workOrder.location_type,
      preferred_date: workOrder.preferred_date || null,
    } as any);
    toast({ title: workOrder.request_type === "inspection" ? "Inspection request submitted" : "Work order submitted" });
    setWorkOrder({ unit_number: "", pest_type: "", location_type: "Interior", comments: "", preferred_date: "", request_type: "treatment" });
    // Refresh requests
    const { data: reqs } = await supabase.from("portal_requests").select("*").eq("property_id", property.id).in("status", ["pending", "in_progress"]).order("created_at", { ascending: false });
    if (reqs) setPendingRequests(reqs);
    onRefresh();
  };

  const quickAddService = async () => {
    if (!addingServiceDate) return;
    await supabase.from("portal_services").insert({
      property_id: property.id,
      service_type: addingServiceType,
      service_date: addingServiceDate,
      status: "scheduled",
      units_planned: allUnits,
      frequency_days: SERVICE_FREQUENCY_MAP[addingServiceType] || 30,
    });
    toast({ title: "Service added" });
    setShowQuickAdd(false);
    setAddingServiceDate("");
    onRefresh();
  };

  const mapUrl = property.map_image_url || property.image_url;
  const [isEditingMap, setIsEditingMap] = useState(false);
  const [savingMap, setSavingMap] = useState(false);
  const handleSaveMapData = async (canvasData: string) => {
    if (!canvasData) return;
    setSavingMap(true);
    try {
      const parsed = JSON.parse(canvasData);
      const { error } = await supabase
        .from("portal_properties")
        .update({ map_data: parsed })
        .eq("id", property.id);
      if (error) {
        toast({ title: "Failed to save map", description: error.message, variant: "destructive" });
      } else {
        toast({ title: "Site map saved", duration: 1500 });
      }
    } catch (e: any) {
      toast({ title: "Failed to save map", description: e?.message, variant: "destructive" });
    } finally {
      setSavingMap(false);
    }
  };
  // Equipment: local state for optimistic updates
  const parseEquipment = (eq: any): { name: string; count: number }[] => {
    if (!Array.isArray(eq)) return [];
    return (eq as any[]).map(e =>
      typeof e === "string" ? { name: e, count: 1 } : { name: e.name, count: e.count || 1 }
    );
  };
  const [equipmentItems, setEquipmentItems] = useState<{ name: string; count: number }[]>(() => parseEquipment(property.equipment));
  useEffect(() => { setEquipmentItems(parseEquipment(property.equipment)); }, [property.equipment]);
  const equipmentNames = equipmentItems.map(e => e.name);
  const saveEquipment = async (updated: { name: string; count: number }[]) => {
    setEquipmentItems(updated);
    await supabase.from("portal_properties").update({ equipment: updated }).eq("id", property.id);
  };
  const formatDate = (d: string | null) => {
    if (!d) return "TBD";
    const date = new Date(d + "T00:00:00");
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };
  const formatWeekOf = (d: string | null) => {
    if (!d) return "TBD";
    const date = new Date(d + "T00:00:00");
    return date.toLocaleDateString("en-US", { weekday: "short", month: "long", day: "numeric" });
  };
  const formatShortDate = (d: string | null) => d ? new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "TBD";

  const propertyLink = links.find(l => l.link_type === "sub" && l.assigned_property_ids && (l.assigned_property_ids as string[]).includes(property.id));

  // ─── Render inline-editable unit table for past services ───
  const renderEditableUnitTable = (s: PortalService) => {
    const unitDetails = s.unit_details && Array.isArray(s.unit_details) ? s.unit_details as any[] : [];

    return (
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <p className="text-xs font-semibold text-muted-foreground">Units Treated ({unitDetails.length})</p>
          <Button variant="outline" size="sm" className="h-6 text-[10px] px-2" onClick={() => {
            setAddingUnitToService(s.id);
            setNewUnitData({ unit_number: "", findings: "", pest_activity: "None", products_used: "", status: "Treated", notes: "" });
          }}>
            <Plus className="w-3 h-3 mr-0.5" />Add Unit
          </Button>
        </div>
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-muted">
              <tr>
                <th className="text-left px-2 py-1.5 font-semibold text-foreground w-[60px]">Unit</th>
                <th className="text-left px-2 py-1.5 font-semibold text-foreground">Findings</th>
                <th className="text-left px-2 py-1.5 font-semibold text-foreground w-[80px]">Activity</th>
                <th className="text-left px-2 py-1.5 font-semibold text-foreground w-[90px]">Status</th>
              </tr>
            </thead>
            <tbody>
              {unitDetails.map((unit: any, j: number) => (
                <tr key={j} className={`border-t border-border/40 ${j % 2 === 1 ? "bg-muted/30" : ""}`}>
                  <td className="px-2 py-1">
                    <Input className="h-6 text-[11px] w-full border-transparent hover:border-border focus:border-primary bg-transparent px-1"
                      defaultValue={unit.unit_number || ""}
                      onBlur={e => { if (e.target.value !== (unit.unit_number || "")) updateUnitField(s.id, j, "unit_number", e.target.value); }}
                    />
                  </td>
                  <td className="px-2 py-1">
                    <Input className="h-6 text-[11px] w-full border-transparent hover:border-border focus:border-primary bg-transparent px-1"
                      defaultValue={unit.findings || ""}
                      onBlur={e => { if (e.target.value !== (unit.findings || "")) updateUnitField(s.id, j, "findings", e.target.value); }}
                    />
                  </td>
                  <td className="px-2 py-1">
                    <select className="h-6 text-[11px] w-full bg-transparent border-0 outline-none cursor-pointer"
                      defaultValue={unit.pest_activity || "None"}
                      onChange={e => updateUnitField(s.id, j, "pest_activity", e.target.value)}
                    >
                      {ACTIVITY_OPTIONS.map(a => <option key={a} value={a}>{a}</option>)}
                    </select>
                  </td>
                  <td className="px-2 py-1">
                    <select className="h-6 text-[11px] w-full bg-transparent border-0 outline-none cursor-pointer"
                      defaultValue={unit.status || "Treated"}
                      onChange={e => updateUnitField(s.id, j, "status", e.target.value)}
                    >
                      {STATUS_OPTIONS.map(a => <option key={a} value={a}>{a}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
              {/* Inline add row */}
              {addingUnitToService === s.id && (
                <tr className="border-t border-primary/30 bg-primary/5">
                  <td className="px-2 py-1">
                    <Input className="h-6 text-[11px] w-full px-1" placeholder="#" value={newUnitData.unit_number}
                      onChange={e => setNewUnitData(d => ({ ...d, unit_number: e.target.value }))} />
                  </td>
                  <td className="px-2 py-1">
                    <Input className="h-6 text-[11px] w-full px-1" placeholder="Findings" value={newUnitData.findings}
                      onChange={e => setNewUnitData(d => ({ ...d, findings: e.target.value }))} />
                  </td>
                  <td className="px-2 py-1">
                    <select className="h-6 text-[11px] w-full" value={newUnitData.pest_activity}
                      onChange={e => setNewUnitData(d => ({ ...d, pest_activity: e.target.value }))}>
                      {ACTIVITY_OPTIONS.map(a => <option key={a} value={a}>{a}</option>)}
                    </select>
                  </td>
                  <td className="px-2 py-1">
                    <div className="flex gap-0.5">
                      <Button size="sm" className="h-5 text-[9px] px-1.5" onClick={() => addUnitToService(s.id)} disabled={!newUnitData.unit_number}>✓</Button>
                      <Button variant="ghost" size="sm" className="h-5 text-[9px] px-1" onClick={() => setAddingUnitToService(null)}>✕</Button>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {/* Quick add row if not already adding */}
        {addingUnitToService !== s.id && (
          <button className="w-full mt-1 py-1 text-[10px] text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded border border-dashed border-border/60 transition-colors flex items-center justify-center gap-1"
            onClick={() => {
              setAddingUnitToService(s.id);
              setNewUnitData({ unit_number: "", findings: "", pest_activity: "None", products_used: "", status: "Treated", notes: "" });
            }}>
            <Plus className="w-3 h-3" /> Add unit row
          </button>
        )}
      </div>
    );
  };

  // ─── Render service details ───
  const renderServiceDetails = (s: PortalService | any, isUpcoming: boolean, isProjected: boolean, isFirstUpcoming: boolean = false) => {
    const unitDetails = s.unit_details && Array.isArray(s.unit_details) ? s.unit_details as any[] : [];
    const unitsPlanned = Array.isArray(s.units_planned) ? s.units_planned as string[] : [];
    const products: ProductUsage[] = normalizeUsageList(s.products_used);

    // For the first upcoming service, merge in units from most recent past + follow-ups
    const mergedUnitsForNext = (() => {
      if (!isUpcoming || !isFirstUpcoming) return unitsPlanned;
      const all = new Set(unitsPlanned);
      unitsFromMostRecent.forEach(u => all.add(u));
      followUpFromPast.forEach(u => all.add(u));
      return Array.from(all).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    })();
    const displayUnits = isUpcoming && isFirstUpcoming ? mergedUnitsForNext : unitsPlanned;

    // PM-submitted note for this upcoming service date (if any).
    const pmNotesMap: Record<string, string> =
      ((property.customer_preferences as any)?.pm_upcoming_notes as Record<string, string>) || {};
    const pmNoteForThis = isUpcoming && s.service_date ? (pmNotesMap[s.service_date] || "") : "";

    return (
      <div className="px-4 pb-4 space-y-3 border-t border-border/60 pt-3">
        {/* PM-submitted note for the upcoming visit — high-visibility callout for the technician */}
        {pmNoteForThis && (
          <div className="bg-primary/10 border-2 border-primary/40 rounded-lg p-3">
            <p className="text-[10px] font-bold uppercase tracking-wide text-primary mb-1 flex items-center gap-1.5">
              <ClipboardList className="w-3 h-3" />
              From the Property Manager — for the Technician
            </p>
            <p className="text-xs whitespace-pre-wrap font-medium">{pmNoteForThis}</p>
          </div>
        )}

        {/* Past service: inline-editable unit table */}
        {!isUpcoming && renderEditableUnitTable(s)}

        {/* Upcoming service: prominent unique-units count (units listed in Service Report table below) */}
        {isUpcoming && isFirstUpcoming && (followUpDetailsFromPast.length > 0 || pendingRequests.length > 0) && (() => {
          const uniqueInteriorUnits = new Set<string>();
          followUpDetailsFromPast.forEach(u => { if (u.unit_number) uniqueInteriorUnits.add(String(u.unit_number)); });
          pendingRequests.forEach(r => { if (r.unit_number) uniqueInteriorUnits.add(String(r.unit_number)); });
          const total = uniqueInteriorUnits.size;
          const fuCount = followUpDetailsFromPast.length;
          const woCount = pendingRequests.length;
          return (
            <div className="bg-primary text-primary-foreground rounded-lg p-3 flex items-center justify-between shadow-sm">
              <div>
                <p className="text-[10px] uppercase tracking-wide font-semibold opacity-90">Interior Units to Treat</p>
                <p className="text-[11px] opacity-85 mt-0.5">
                  {fuCount > 0 && <span>{fuCount} follow-up{fuCount === 1 ? "" : "s"}</span>}
                  {fuCount > 0 && woCount > 0 && <span> + </span>}
                  {woCount > 0 && <span>{woCount} work order{woCount === 1 ? "" : "s"}</span>}
                  <span className="opacity-70"> · details in Service Report table below</span>
                </p>
              </div>
              <div className="text-right">
                <p className="text-3xl font-bold leading-none">{total}</p>
                <p className="text-[10px] mt-1 opacity-80">unique unit{total === 1 ? "" : "s"}</p>
              </div>
            </div>
          );
        })()}

        {(s.summary || s.findings || s.notes) && (
          <div className="bg-muted/30 rounded-lg p-3 border border-border/40">
            <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-0.5">Summary</p>
            <p className="text-xs whitespace-pre-wrap">{[s.summary, s.findings, s.notes].filter(Boolean).join("\n\n")}</p>
          </div>
        )}

        {/* Service-level products used (editable, per service date — not per unit) */}
        <div>
          <p className="text-xs font-semibold text-muted-foreground mb-1.5 flex items-center gap-1.5">
            <FlaskConical className="w-3.5 h-3.5" />
            Products Used (this service date)
          </p>
          <ProductUsageEditor
            value={products}
            onChange={(next) => updateServiceProducts(s.id, next)}
          />
        </div>

        {s.follow_up_recommended && s.follow_up_notes && (
          <div className="bg-orange-50 border border-orange-200 rounded-lg p-2.5">
            <p className="text-xs font-medium text-orange-700">⚠️ Follow-up: {s.follow_up_notes}</p>
          </div>
        )}

        {s.special_notes && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5">
            <p className="text-xs text-amber-700">{s.special_notes}</p>
          </div>
        )}

        {s.prep_required && s.prep_notes && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-2.5">
            <p className="text-xs font-medium text-blue-700">Prep Required</p>
            <p className="text-xs text-blue-600 mt-0.5">{s.prep_notes}</p>
          </div>
        )}

        {/* Photos */}
        {Array.isArray(s.photos) && s.photos.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-muted-foreground mb-1.5 flex items-center gap-1">
              <Image className="w-3.5 h-3.5" />Photos ({s.photos.length})
            </p>
            <div className="grid grid-cols-3 gap-1.5">
              {(s.photos as any[]).map((photo, idx) => {
                const url = typeof photo === "string" ? photo : photo?.url || photo?.src;
                if (!url) return null;
                return (
                  <a key={idx} href={url} target="_blank" rel="noopener noreferrer" className="block aspect-square rounded-md overflow-hidden border border-border/60 hover:border-primary/50 transition-all hover:shadow-md">
                    <img src={url} alt={`Service photo ${idx + 1}`} className="w-full h-full object-cover" loading="lazy" />
                  </a>
                );
              })}
            </div>
          </div>
        )}

        {/* Actions */}
        {!isProjected && (
          <div className="flex gap-1.5 pt-1 border-t border-border/40 mt-2">
            <Button variant="ghost" size="sm" className="h-7 text-xs ml-auto" onClick={() => onDeleteService(s.id)}>
              <Trash2 className="w-3 h-3 text-destructive" />
            </Button>
          </div>
        )}

        {/* Inline service report form for upcoming services — always visible (mirrors Previous Services format) */}
        {isUpcoming && !isProjected && (() => {
          // Auto-init completion data on first render for this expanded upcoming service
          if (!completionData[s.id]) {
            setTimeout(() => initCompletionData(s.id, displayUnits), 0);
            return (
              <div className="text-xs text-muted-foreground py-2 text-center">Loading service report form…</div>
            );
          }
          const cd = completionData[s.id];
          const updateRow = (idx: number, field: string, value: string) => {
            setCompletionData(prev => {
              const rows = [...prev[s.id].unitRows];
              rows[idx] = { ...rows[idx], [field]: value };
              return { ...prev, [s.id]: { ...prev[s.id], unitRows: rows } };
            });
          };
          const addRow = () => {
            setCompletionData(prev => ({
              ...prev,
              [s.id]: { ...prev[s.id], unitRows: [...prev[s.id].unitRows, { unit_number: "", target_pest: "", findings: "", pest_activity: "None", products_used: [] as ProductUsage[], status: "To be Treated", notes: "", source: "" }] },
            }));
          };
          const setRowProducts = (idx: number, next: ProductUsage[]) => {
            setCompletionData(prev => {
              const rows = [...prev[s.id].unitRows];
              rows[idx] = { ...rows[idx], products_used: next };
              return { ...prev, [s.id]: { ...prev[s.id], unitRows: rows } };
            });
          };
          const removeRow = (idx: number) => {
            setCompletionData(prev => ({
              ...prev,
              [s.id]: { ...prev[s.id], unitRows: prev[s.id].unitRows.filter((_, i) => i !== idx) },
            }));
          };
          const flaggedCount = cd.unitRows.filter(r => r.status === "Treated - Follow Up").length;

          return (
            <div className="space-y-3 pt-2 border-t border-border/40 mt-2">
              <div className="bg-gradient-to-br from-primary/[0.04] to-transparent rounded-lg p-3 space-y-3 border border-primary/20">
                <p className="text-xs font-bold text-foreground flex items-center gap-1.5">
                  <CheckCircle className="w-4 h-4 text-green-600" />
                  Service Report — fill out as you work
                </p>

                {/* Technician + Time In/Out */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div>
                    <Label className="text-[11px] font-semibold">Technician</Label>
                    <Select value={cd.technician || ""}
                      onValueChange={(v) => setCompletionData(prev => ({ ...prev, [s.id]: { ...prev[s.id], technician: v } }))}>
                      <SelectTrigger className="h-9 text-xs mt-0.5"><SelectValue placeholder="Select technician" /></SelectTrigger>
                      <SelectContent>
                        {TECHNICIAN_OPTIONS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-[11px] font-semibold">Time In</Label>
                    <Input type="time" className="h-7 text-xs mt-0.5" value={cd.time_in}
                      onChange={e => setCompletionData(prev => ({ ...prev, [s.id]: { ...prev[s.id], time_in: e.target.value } }))} />
                  </div>
                  <div>
                    <Label className="text-[11px] font-semibold">Time Out</Label>
                    <Input type="time" className="h-7 text-xs mt-0.5" value={cd.time_out}
                      onChange={e => setCompletionData(prev => ({ ...prev, [s.id]: { ...prev[s.id], time_out: e.target.value } }))} />
                  </div>
                </div>

                {/* Summary — single large box, above the units table */}
                <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
                  <Label className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Summary</Label>
                  <Textarea className="text-xs min-h-[120px] mt-1.5 bg-background resize-y" placeholder="Service summary..." value={cd.summary}
                    onChange={e => setCompletionData(prev => ({ ...prev, [s.id]: { ...prev[s.id], summary: e.target.value, findings: "", notes: "" } }))} />
                </div>

                {/* Unit-by-unit table — same format as Previous Services */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <Label className="text-[11px] font-semibold">Units Treated ({cd.unitRows.length})</Label>
                    <Button variant="outline" size="sm" className="h-6 text-[10px] px-2" onClick={addRow}>
                      <Plus className="w-3 h-3 mr-0.5" />Add Unit
                    </Button>
                  </div>
                  <div className="border rounded-lg overflow-hidden">
                    <table className="w-full text-[11px]">
                      <thead className="bg-muted">
                        <tr>
                          <th className="text-left px-2 py-1.5 font-semibold w-[60px]">Unit</th>
                          <th className="text-left px-2 py-1.5 font-semibold w-[130px]">Source</th>
                          <th className="text-left px-2 py-1.5 font-semibold w-[140px]">Target Pest</th>
                          <th className="text-left px-2 py-1.5 font-semibold">Findings / Context</th>
                          <th className="text-left px-2 py-1.5 font-semibold w-[90px]">Activity</th>
                          <th className="text-left px-2 py-1.5 font-semibold w-[130px]">Status</th>
                          <th className="w-[28px]"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {cd.unitRows.map((row: any, idx: number) => {
                          const isFollowUp = row.source === "follow-up";
                          const isWorkOrder = row.source === "new-work-order";
                          const products: ProductUsage[] = normalizeUsageList(row.products_used);
                          return (
                          <tr key={idx} className={`border-t border-border/40 ${isFollowUp ? "bg-orange-50/60" : isWorkOrder ? "bg-primary/[0.04]" : idx % 2 === 1 ? "bg-muted/20" : ""}`}>
                            <td className="px-2 py-1.5">
                              <Input className="h-8 text-xs px-1.5 border-transparent hover:border-border focus:border-primary bg-transparent font-semibold"
                                value={row.unit_number} onChange={e => updateRow(idx, "unit_number", e.target.value)} />
                            </td>
                            <td className="px-2 py-1.5">
                              <Select value={row.source || "new-work-order"}
                                onValueChange={(v) => updateRow(idx, "source", v)}>
                                <SelectTrigger className="h-8 text-xs px-2 border-transparent hover:border-border bg-transparent">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="new-work-order">New Work Order</SelectItem>
                                  <SelectItem value="follow-up">Follow-up</SelectItem>
                                  <SelectItem value="routine">Routine</SelectItem>
                                  <SelectItem value="other">Other</SelectItem>
                                </SelectContent>
                              </Select>
                            </td>
                            <td className="px-2 py-1.5">
                              <Select value={row.target_pest || "__none__"}
                                onValueChange={(v) => updateRow(idx, "target_pest", v === "__none__" ? "" : v)}>
                                <SelectTrigger className="h-8 text-xs px-2 border-transparent hover:border-border bg-transparent">
                                  <SelectValue placeholder="Select pest" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="__none__">— None —</SelectItem>
                                  {PEST_TYPES.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                                </SelectContent>
                              </Select>
                            </td>
                            <td className="px-2 py-1.5">
                              <Input className="h-8 text-xs px-1.5 border-transparent hover:border-border focus:border-primary bg-transparent"
                                value={row.findings} placeholder="Notes about this unit..." onChange={e => updateRow(idx, "findings", e.target.value)} />
                            </td>
                            <td className="px-2 py-1.5">
                              <Select value={row.pest_activity}
                                onValueChange={(v) => updateRow(idx, "pest_activity", v)}>
                                <SelectTrigger className="h-8 text-xs px-2 border-transparent hover:border-border bg-transparent">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {ACTIVITY_OPTIONS.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                                </SelectContent>
                              </Select>
                            </td>
                            <td className="px-2 py-1.5">
                              <Select value={row.status}
                                onValueChange={(v) => updateRow(idx, "status", v)}>
                                <SelectTrigger className={`h-8 text-xs px-2 border-transparent hover:border-border bg-transparent ${row.status === "Treated - Follow Up" ? "text-orange-600 font-semibold" : row.status === "Not Treated" ? "text-muted-foreground" : ""}`}>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {STATUS_OPTIONS.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                                </SelectContent>
                              </Select>
                            </td>
                            <td className="px-1 py-0.5">
                              <button onClick={() => removeRow(idx)} className="text-muted-foreground hover:text-destructive">
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <button className="w-full mt-1 py-1.5 text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded border border-dashed border-border/60 transition-colors flex items-center justify-center gap-1"
                    onClick={addRow}>
                    <Plus className="w-3.5 h-3.5" /> Add unit row
                  </button>
        </div>

                {/* Service-level products used (one entry per product per service date) */}
                <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
                  <Label className="text-[11px] font-semibold flex items-center gap-1.5 mb-2">
                    <FlaskConical className="w-3.5 h-3.5 text-primary" />
                    Products Used (this service date)
                  </Label>
                  <ProductUsageEditor
                    value={cd.products || []}
                    onChange={(next) => setCompletionData(prev => ({
                      ...prev,
                      [s.id]: { ...prev[s.id], products: next },
                    }))}
                  />
                </div>

                {/* Photos uploader */}
                <div>
                  <Label className="text-xs font-semibold flex items-center gap-1.5 mb-2">
                    <Image className="w-4 h-4" />
                    Service Photos {cd.photos.length > 0 && <span className="text-muted-foreground font-normal">({cd.photos.length})</span>}
                  </Label>
                  <label className="cursor-pointer block">
                    <div className={`w-full border-2 border-dashed rounded-xl py-6 px-4 flex flex-col items-center justify-center gap-2 transition-all ${uploadingPhotoFor === s.id ? "bg-muted border-primary/40" : "border-primary/30 bg-primary/[0.03] hover:bg-primary/[0.06] hover:border-primary/50"}`}>
                      <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                        {uploadingPhotoFor === s.id ? (
                          <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <Plus className="w-6 h-6 text-primary" />
                        )}
                      </div>
                      <div className="text-center">
                        <p className="text-sm font-bold text-foreground">
                          {uploadingPhotoFor === s.id ? "Uploading..." : "Add Photo"}
                        </p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">Tap to take a photo or upload from gallery</p>
                      </div>
                    </div>
                    <input type="file" accept="image/*" capture="environment" className="hidden"
                      disabled={uploadingPhotoFor === s.id}
                      onChange={e => {
                        const f = e.target.files?.[0];
                        if (f) uploadCompletionPhoto(s.id, f);
                        (e.target as HTMLInputElement).value = "";
                      }} />
                  </label>
                  {cd.photos.length > 0 && (
                    <div className="grid grid-cols-4 gap-2 mt-2">
                      {cd.photos.map((p, idx) => (
                        <div key={idx} className="relative aspect-square rounded-md overflow-hidden border border-border/60 group">
                          <img src={p.url} alt={`Service photo ${idx + 1}`} className="w-full h-full object-cover" />
                          <button type="button" onClick={() => removeCompletionPhoto(s.id, idx)}
                            className="absolute top-0.5 right-0.5 bg-background/90 rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive hover:text-destructive-foreground">
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Follow-up warning */}
                {flaggedCount > 0 && (
                  <div className="bg-orange-50 border border-orange-200 rounded-lg p-2">
                    <p className="text-[11px] font-medium text-orange-700">
                      ⚠️ {flaggedCount} unit{flaggedCount > 1 ? "s" : ""} marked "Treated - Follow Up" — will auto-add to next service
                    </p>
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-2">
                  <Button size="sm" className="h-9 text-xs flex-1 bg-green-600 hover:bg-green-700 text-white font-semibold" onClick={() => completeService(s.id)}>
                    <CheckCircle className="w-4 h-4 mr-1" />
                    {flaggedCount > 0 ? `Complete & Flag ${flaggedCount} Follow-up${flaggedCount > 1 ? "s" : ""}` : "Complete Service"}
                  </Button>
                  <Button variant="ghost" size="sm" className="h-9 w-9 p-0" onClick={() => onDeleteService(s.id)} title="Delete service">
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </div>
              </div>
            </div>
          );
        })()}

        {isProjected && (
          <Button variant="outline" size="sm" className="h-7 text-xs w-full" onClick={async () => {
            await supabase.from("portal_services").insert({
              property_id: property.id, service_type: s.service_type,
              service_date: s.service_date, status: "scheduled", units_planned: s.units_planned,
            });
            toast({ title: "Service scheduled" });
            onRefresh();
          }}>
            <Plus className="w-3 h-3 mr-1" />Schedule This Service
          </Button>
        )}
      </div>
    );
  };

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
      <TabsList className="w-full h-auto p-1.5 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-1.5 bg-muted/50 border-2 border-primary/30 rounded-xl shadow-sm mb-5">
        <TabsTrigger value="map" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md font-semibold text-sm py-3 rounded-lg transition-all flex flex-col items-center gap-1">
          <MapPin className="w-5 h-5" />
          <span>Site Map and Plan</span>
        </TabsTrigger>
        <TabsTrigger value="past" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md font-semibold text-sm py-3 rounded-lg transition-all flex flex-col items-center gap-1">
          <Calendar className="w-5 h-5" />
          <span>Previous Services <Badge variant="secondary" className="ml-1 text-[10px] h-4">{pastServices.length}</Badge></span>
        </TabsTrigger>
        <TabsTrigger value="request" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md font-semibold text-sm py-3 rounded-lg transition-all flex flex-col items-center gap-1">
          <Bug className="w-5 h-5" />
          <span>Add work order</span>
        </TabsTrigger>
        <TabsTrigger value="upcoming" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md font-semibold text-sm py-3 rounded-lg transition-all flex flex-col items-center gap-1">
          <ClipboardList className="w-5 h-5" />
          <span>Upcoming Services <Badge variant="secondary" className="ml-1 text-[10px] h-4">{allUpcoming.length}</Badge></span>
        </TabsTrigger>
        <TabsTrigger value="prep" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md font-semibold text-sm py-3 rounded-lg transition-all flex flex-col items-center gap-1">
          <FileDown className="w-5 h-5" />
          <span>Prep Sheets <Badge variant="secondary" className="ml-1 text-[10px] h-4">{prepSheets.length}</Badge></span>
        </TabsTrigger>
      </TabsList>

      {/* ══════════ TAB 1: MAP & PREFERENCES ══════════ */}
      <TabsContent value="map" className="mt-0 space-y-5">
        {/* Property Plan + Customer Preference (top of page) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <Card className="shadow-sm border-primary/20 bg-gradient-to-br from-primary/[0.03] to-transparent">
            <CardHeader className="pb-3 pt-4 border-b bg-primary/[0.06]">
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <ClipboardList className="w-5 h-5 text-primary" />
                Property Plan
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4 space-y-3">
              <div>
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">
                  Service Frequency
                </Label>
                <div className="inline-flex flex-wrap rounded-lg border border-border bg-muted p-1 gap-0.5">
                  {([
                    { key: "weekly", label: "Weekly" },
                    { key: "bi-weekly", label: "Bi-Weekly" },
                    { key: "monthly", label: "Monthly" },
                    { key: "bi-monthly", label: "Bi-Monthly" },
                  ] as const).map(opt => {
                    const active = propertyFrequency === opt.key;
                    return (
                      <button
                        key={opt.key}
                        type="button"
                        className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
                          active
                            ? "bg-background text-foreground shadow-sm"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                        onClick={async () => {
                          if (active) return;
                          // Optimistically update local property object so toggle + projections refresh instantly
                          const updated = {
                            ...(property.customer_preferences || {}),
                            service_frequency: opt.key,
                          };
                          (property as any).customer_preferences = updated;
                          const { error } = await supabase
                            .from("portal_properties")
                            .update({ customer_preferences: updated })
                            .eq("id", property.id);
                          if (error) {
                            toast({ title: "Failed to save frequency", variant: "destructive" });
                          } else {
                            toast({ title: `Frequency set to ${opt.label}`, duration: 1500 });
                            onRefresh();
                          }
                        }}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
                <p className="text-[11px] text-muted-foreground mt-1.5">
                  Used to project the next two upcoming services on this property.
                </p>
              </div>
              <Textarea
                placeholder="Enter the overall plan for this property — treatment strategy, special considerations, scheduling notes, etc."
                className="min-h-[120px] text-sm resize-y"
                value={planDraft}
                onChange={(e) => setPlanDraft(e.target.value)}
              />
              <p className="text-[11px] text-muted-foreground">
                Auto-saves a moment after you stop typing. Visible to technicians and property managers.
              </p>
            </CardContent>
          </Card>

          <Card className="shadow-sm border-primary/20 bg-gradient-to-br from-primary/[0.03] to-transparent">
            <CardHeader className="pb-3 pt-4 border-b bg-primary/[0.06]">
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <ClipboardList className="w-5 h-5 text-primary" />
                Customer Preference
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              <Textarea
                placeholder="Customer preferences — product choices, scheduling preferences, access notes, communication preferences, etc."
                className="min-h-[120px] text-sm resize-y"
                value={prefDraft}
                onChange={(e) => setPrefDraft(e.target.value)}
              />
              <p className="text-[11px] text-muted-foreground mt-2">
                Auto-saves a moment after you stop typing. Visible to technicians and property managers.
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="space-y-4">
            {/* Property Map - sized down with paste support */}
        <Card
          className="overflow-hidden shadow-sm"
          onPaste={async (e) => {
            const items = e.clipboardData?.items;
            if (!items) return;
            for (const item of Array.from(items)) {
              if (item.type.startsWith("image/")) {
                const file = item.getAsFile();
                if (file) {
                  const renamed = new File([file], `pasted-map-${Date.now()}.png`, { type: file.type });
                  onUpdatePropertyImage(property.id, renamed);
                  toast({ title: "Pasted image uploading...", duration: 1500 });
                  e.preventDefault();
                  break;
                }
              }
            }
          }}
          tabIndex={0}
        >
          <div
            className="relative bg-muted max-w-[520px] mx-auto"
            style={{ aspectRatio: "3 / 4" }}
            onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              const file = e.dataTransfer?.files?.[0];
              if (file && file.type.startsWith("image/")) {
                onUpdatePropertyImage(property.id, file);
                toast({ title: "Dropped image uploading...", duration: 1500 });
              }
            }}
          >
            {mapUrl ? (
              isEditingMap ? (
                <MapCanvas
                  mapUrl={mapUrl}
                  onSave={handleSaveMapData}
                  initialData={property.map_data ? (typeof property.map_data === 'string' ? property.map_data : JSON.stringify(property.map_data)) : undefined}
                />
              ) : property.map_data ? (
                <ReadOnlyMapCanvas mapUrl={mapUrl} mapData={property.map_data} />
              ) : (
                <img src={mapUrl} alt={property.name} className="w-full h-full object-cover" />
              )
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground gap-2 p-4 text-center">
                <Image className="w-8 h-8 opacity-40" />
                <p className="text-xs">No property image</p>
                <p className="text-[10px] opacity-70">Click Upload, drop a file, or paste (⌘V)</p>
              </div>
            )}
            {mapUrl && (
              <Button
                size="sm"
                variant={isEditingMap ? "default" : "secondary"}
                className="absolute top-2 right-2 h-7 px-2 text-xs shadow-sm"
                onClick={() => setIsEditingMap(v => !v)}
                disabled={savingMap}
              >
                <Edit className="w-3 h-3 mr-1" />
                {isEditingMap ? (savingMap ? "Saving…" : "Done") : "Edit Map"}
              </Button>
            )}
            <label className="absolute bottom-2 right-2 bg-background/90 rounded px-2 py-1.5 cursor-pointer hover:bg-background text-xs flex items-center gap-1 shadow-sm border">
              <Image className="w-3.5 h-3.5" />
              {uploadingPropertyImage ? "Uploading..." : mapUrl ? "Change" : "Upload"}
              <input type="file" accept="image/*" className="hidden" disabled={uploadingPropertyImage}
                onChange={e => { const f = e.target.files?.[0]; if (f) onUpdatePropertyImage(property.id, f); }} />
            </label>
          </div>
          <div className="px-3 py-2 border-t bg-muted/30 text-[10.5px] text-muted-foreground text-center">
            {isEditingMap ? "Add icons, draw, or erase. Changes save automatically." : "Tip: paste a screenshot (⌘/Ctrl + V) or drag & drop an image to replace the site map"}
          </div>
        </Card>
          </div>
          <div className="space-y-4">
        {/* Equipment */}
        <Card className="shadow-sm">
          <CardHeader className="pb-2 py-3.5 border-b bg-primary/[0.08]">
            <CardTitle className="text-base font-bold flex items-center gap-2"><Wrench className="w-4.5 h-4.5 text-secondary" />Equipment</CardTitle>
          </CardHeader>
          <CardContent className="pt-3">
            <div className="space-y-1">
              {EQUIPMENT_OPTIONS.map(eq => {
                const item = equipmentItems.find(e => e.name === eq);
                const isChecked = !!item;
                return (
                  <div key={eq} className={`flex items-center gap-2.5 text-xs rounded-md px-2 py-1.5 transition-all border ${isChecked ? "bg-primary/10 border-primary/30 font-medium" : "border-transparent hover:bg-muted/50 hover:border-border/50"}`}>
                    <label className="flex items-center gap-2.5 cursor-pointer flex-1">
                      <input type="checkbox" checked={isChecked} onChange={async () => {
                        const updated = isChecked
                          ? equipmentItems.filter(e => e.name !== eq)
                          : [...equipmentItems, { name: eq, count: 1 }];
                        await saveEquipment(updated);
                        toast({ title: isChecked ? `Removed ${eq}` : `Added ${eq}`, duration: 1500 });
                      }} className="rounded accent-[hsl(130,14%,65%)] w-3.5 h-3.5" />
                      {eq}
                    </label>
                    {isChecked && (
                      <Input
                        type="number"
                        min={1}
                        className="h-6 w-14 text-[11px] text-center border-border/50 px-1"
                        value={item?.count || 1}
                        onChange={(e) => {
                          const count = parseInt(e.target.value) || 1;
                          setEquipmentItems(prev => prev.map(ei => ei.name === eq ? { ...ei, count } : ei));
                        }}
                        onBlur={async (e) => {
                          const count = parseInt(e.target.value) || 1;
                          const updated = equipmentItems.map(ei => ei.name === eq ? { ...ei, count } : ei);
                          await saveEquipment(updated);
                        }}
                      />
                    )}
                  </div>
                );
              })}
              {/* Custom equipment items */}
              {equipmentItems.filter(e => !EQUIPMENT_OPTIONS.includes(e.name)).map(custom => (
                <div key={custom.name} className="flex items-center gap-2.5 text-xs rounded-md px-2 py-1.5 transition-all border bg-primary/10 border-primary/30 font-medium">
                  <label className="flex items-center gap-2.5 cursor-pointer flex-1">
                    <input type="checkbox" checked onChange={async () => {
                      const updated = equipmentItems.filter(e => e.name !== custom.name);
                      await saveEquipment(updated);
                      toast({ title: `Removed ${custom.name}`, duration: 1500 });
                    }} className="rounded accent-[hsl(130,14%,65%)] w-3.5 h-3.5" />
                    {custom.name}
                  </label>
                  <Input type="number" min={1} className="h-6 w-14 text-[11px] text-center border-border/50 px-1"
                    value={custom.count || 1}
                    onChange={(e) => {
                      const count = parseInt(e.target.value) || 1;
                      setEquipmentItems(prev => prev.map(ei => ei.name === custom.name ? { ...ei, count } : ei));
                    }}
                    onBlur={async (e) => {
                      const count = parseInt(e.target.value) || 1;
                      const updated = equipmentItems.map(ei => ei.name === custom.name ? { ...ei, count } : ei);
                      await saveEquipment(updated);
                    }}
                  />
                </div>
              ))}
              {/* Add custom equipment */}
              <div className="flex items-center gap-1.5 mt-1">
                <Input
                  className="h-7 text-xs flex-1 border-dashed"
                  placeholder="Other equipment..."
                  onKeyDown={async (e) => {
                    if (e.key === "Enter") {
                      const val = (e.target as HTMLInputElement).value.trim();
                      if (val && !equipmentItems.some(ei => ei.name === val)) {
                        const updated = [...equipmentItems, { name: val, count: 1 }];
                        await saveEquipment(updated);
                        (e.target as HTMLInputElement).value = "";
                        toast({ title: `Added ${val}`, duration: 1500 });
                      }
                    }
                  }}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Share Link */}
        {propertyLink && (
          <Card className="shadow-sm">
          <CardHeader className="pb-2 py-3.5 border-b bg-primary/[0.08]">
            <CardTitle className="text-base font-bold flex items-center gap-2"><Link2 className="w-4.5 h-4.5 text-secondary" />PM Share Link</CardTitle>
            </CardHeader>
            <CardContent className="pt-3">
              <div className="flex items-center gap-1.5">
                {onCopyLink && (
                  <Button variant="outline" size="sm" className="flex-1 h-7 text-xs" onClick={() => onCopyLink(propertyLink.token, "sub")}>
                    <Copy className="w-3 h-3 mr-1" />Copy Link
                  </Button>
                )}
                {onOpenPortal && (
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => onOpenPortal(propertyLink.token, "sub")}>
                    <ExternalLink className="w-3 h-3" />
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        )}
          </div>
        </div>
      </TabsContent>

      {/* ══════════ TAB 2: PREVIOUS SERVICES ══════════ */}
      <TabsContent value="past" className="mt-0">
        <div className="space-y-3 max-w-5xl mx-auto">
        <div className="flex items-center justify-between pb-2.5 border-b-2 border-primary/40">
          <h3 className="text-base font-bold flex items-center gap-2">
            <Calendar className="w-5 h-5 text-secondary" />Previous Services
            <Badge variant="secondary" className="text-[11px] ml-1">{pastServices.length}</Badge>
          </h3>
          <div className="flex items-center gap-1 bg-muted rounded-xl p-1 shadow-inner">
            <button
              className={`px-4 py-2 text-sm rounded-lg transition-all font-semibold ${pastViewMode === "date" ? "bg-background shadow-md text-foreground" : "text-muted-foreground hover:text-foreground"}`}
              onClick={() => setPastViewMode("date")}
            >By Date</button>
            <button
              className={`px-4 py-2 text-sm rounded-lg transition-all font-semibold ${pastViewMode === "unit" ? "bg-background shadow-md text-foreground" : "text-muted-foreground hover:text-foreground"}`}
              onClick={() => setPastViewMode("unit")}
            >By Unit</button>
          </div>
        </div>



        {pastViewMode === "date" ? (
          pastServices.length === 0 ? (
            <Card className="shadow-sm"><CardContent className="p-8 text-center text-muted-foreground text-sm">No past services yet</CardContent></Card>
          ) : (
            <div className="space-y-2">
              {pastServices.map((s, i) => {
                const isFirst = i === 0;
                const isExpanded = expandedPastId === s.id;
                return (
                  <Card key={s.id} className={`transition-all shadow-sm ${isExpanded ? "border-primary/20" : "hover:border-muted-foreground/30"}`}>
                    <button className="w-full text-left p-3 flex items-center justify-between" onClick={() => setExpandedPastId(isExpanded ? null : s.id)}>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          {isFirst && <Badge className="text-[10px] bg-primary text-primary-foreground">Most Recent</Badge>}
                          <p className={`font-semibold ${isFirst ? "text-sm" : "text-xs"}`}>{s.service_type}</p>
                          <Badge variant="default" className="text-[10px]">Completed</Badge>
                          {s.follow_up_recommended && <Badge className="text-[10px] bg-orange-500 text-white">Follow-up</Badge>}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                          <span>{formatDate(s.service_date)}</span>
                          {s.technician && <span>• {s.technician}</span>}
                          {Array.isArray(s.unit_details) && (s.unit_details as any[]).length > 0 && (
                            <span>• {(s.unit_details as any[]).length} units</span>
                          )}
                        </div>
                      </div>
                      <ChevronDown className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                    </button>
                    {isExpanded && renderServiceDetails(s, false, false)}
                  </Card>
                );
              })}
            </div>
          )
        ) : (
          servicesByUnit.size === 0 ? (
            <Card className="shadow-sm"><CardContent className="p-8 text-center text-muted-foreground text-sm">No service history</CardContent></Card>
          ) : (
            <Accordion type="multiple" defaultValue={Array.from(servicesByUnit.keys()).slice(0, 1)}>
              {Array.from(servicesByUnit.entries())
                .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
                .map(([unitNum, entries]) => (
                  <AccordionItem key={unitNum} value={unitNum} className="border rounded-lg mb-2 px-0 shadow-sm">
                    <AccordionTrigger className="px-3 py-2.5 text-sm hover:no-underline bg-muted/20 rounded-t-lg">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{unitNum === "General" ? "General Treatment" : `Unit ${unitNum}`}</span>
                        <Badge variant="secondary" className="text-[10px]">{entries.length} services</Badge>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="px-3 pb-3 space-y-1.5 pt-2">
                      {entries.map(({ service, unitDetail }, j) => (
                        <div key={`${service.id}-${j}`} className="bg-muted/40 rounded-lg p-2.5 text-xs cursor-pointer hover:bg-muted/70 transition-colors border border-transparent hover:border-border/40"
                          onClick={() => onOpenServiceReport(service)}>
                          <div className="flex items-center justify-between">
                            <span className="font-medium">{service.service_type}</span>
                            <span className="text-muted-foreground">{formatShortDate(service.service_date)}</span>
                          </div>
                          {unitDetail && (
                            <div className="mt-1 text-muted-foreground space-y-0.5">
                              {unitDetail.findings && <p>Findings: {unitDetail.findings}</p>}
                              {unitDetail.pest_activity && <p>Activity: {unitDetail.pest_activity}</p>}
                              {unitDetail.products_used && <p>Products: {unitDetail.products_used}</p>}
                              {unitDetail.notes && <p>Notes: {unitDetail.notes}</p>}
                            </div>
                          )}
                          {!unitDetail && service.summary && <p className="text-muted-foreground mt-1">{service.summary}</p>}
                        </div>
                      ))}
                    </AccordionContent>
                  </AccordionItem>
                ))}
            </Accordion>
          )
        )}
      </div>
      </TabsContent>

      {/* ══════════ TAB 3: REQUEST WORK ORDER ══════════ */}
      <TabsContent value="request" className="mt-0">
        <div className="max-w-2xl mx-auto space-y-4">
        {/* Work Order Form — mirrors PM portal layout */}
        <Card className="border-primary/30 shadow-md">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <ClipboardList className="w-4 h-4 text-primary" />Submit a Work Order
            </CardTitle>
            <p className="text-xs text-muted-foreground">Tell us what's going on and we'll schedule service.</p>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Request Type (admin-only enhancement, kept compact) */}
            <div>
              <Label className="text-sm">Request Type *</Label>
              <div className="grid grid-cols-2 gap-2 mt-1">
                {([
                  { v: "treatment", label: "Treatment", icon: Bug, desc: "Active pest treatment" },
                  { v: "inspection", label: "Inspection", icon: FileText, desc: "Assess & investigate" },
                ] as const).map(opt => {
                  const Icon = opt.icon;
                  const active = workOrder.request_type === opt.v;
                  return (
                    <button
                      key={opt.v}
                      type="button"
                      onClick={() => setWorkOrder(wo => ({ ...wo, request_type: opt.v }))}
                      className={`flex flex-col items-center gap-1 p-3 rounded-lg border-2 transition-all ${active ? "bg-primary text-primary-foreground border-primary shadow-md" : "bg-background border-border hover:border-primary/40 hover:bg-muted/50"}`}
                    >
                      <Icon className="w-5 h-5" />
                      <span className="text-sm font-semibold">{opt.label}</span>
                      <span className={`text-[10px] ${active ? "opacity-90" : "text-muted-foreground"}`}>{opt.desc}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Unit or Area — free-text with case-insensitive suggestion list */}
            <div>
              <Label className="text-sm">Unit or Area *</Label>
              <Input
                list="admin-wo-known-units"
                placeholder="Type unit or area (e.g. Unit 204, Lobby, Pool deck)"
                value={workOrder.unit_number}
                onChange={e => setWorkOrder(wo => ({ ...wo, unit_number: e.target.value }))}
                autoComplete="off"
              />
              {allUnits.length > 0 && (
                <datalist id="admin-wo-known-units">
                  {allUnits.map(u => <option key={u} value={u} />)}
                </datalist>
              )}
            </div>

            {/* Pest Type */}
            <div>
              <Label className="text-sm">What are you dealing with? *</Label>
              <Select value={workOrder.pest_type} onValueChange={v => setWorkOrder(wo => ({ ...wo, pest_type: v }))}>
                <SelectTrigger><SelectValue placeholder="Select pest type" /></SelectTrigger>
                <SelectContent>
                  {PEST_TYPES.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Location */}
            <div>
              <Label className="text-sm">Where is the issue?</Label>
              <div className="flex gap-2 mt-1">
                {["Interior", "Exterior", "Both"].map(loc => (
                  <button key={loc} type="button"
                    className={`px-4 py-2 rounded-lg text-sm border transition-colors flex-1 ${workOrder.location_type === loc ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-muted border-border"}`}
                    onClick={() => setWorkOrder(wo => ({ ...wo, location_type: loc }))}>{loc}</button>
                ))}
              </div>
            </div>

            {/* Preferred Day */}
            <div>
              <Label className="text-sm">Preferred Day</Label>
              <div className="grid grid-cols-3 gap-2 mt-1">
                {([
                  { key: "Next Service", label: "Next service" },
                  { key: "Next Few Weeks", label: "Next few weeks" },
                  { key: "__other", label: "Other" },
                ] as const).map(opt => {
                  const isPreset = ["Next Service", "Next Few Weeks"].includes(workOrder.preferred_date);
                  const active = opt.key === "__other" ? (workOrder.preferred_date !== "" && !isPreset) : workOrder.preferred_date === opt.key;
                  return (
                    <button key={opt.key} type="button"
                      className={`px-3 py-2 rounded-lg text-xs border transition-colors ${active ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-muted border-border"}`}
                      onClick={() => setWorkOrder(wo => ({ ...wo, preferred_date: opt.key === "__other" ? " " : opt.key }))}>{opt.label}</button>
                  );
                })}
              </div>
              {workOrder.preferred_date !== "" && !["Next Service", "Next Few Weeks"].includes(workOrder.preferred_date) && (
                <Input className="mt-2" placeholder="Tell us when works (e.g. Tuesday afternoon, after the 15th)"
                  value={workOrder.preferred_date.trim()}
                  onChange={e => setWorkOrder(wo => ({ ...wo, preferred_date: e.target.value || " " }))} />
              )}
            </div>

            {/* Additional Details */}
            <div>
              <Label className="text-sm">Additional Details</Label>
              <Textarea placeholder="Any extra context — where exactly you're seeing the issue, severity, etc."
                value={workOrder.comments} onChange={e => setWorkOrder(wo => ({ ...wo, comments: e.target.value }))} rows={3} />
            </div>

            <Button className="w-full" size="lg" onClick={submitWorkOrder} disabled={!workOrder.unit_number}>
              <Send className="w-4 h-4 mr-2" />Submit {workOrder.request_type === "inspection" ? "Inspection Request" : "Work Order"}
            </Button>
          </CardContent>
        </Card>

        {/* Tenant Service Request Link (admin-only) */}
        <Button className="w-full h-10 text-xs font-semibold bg-secondary text-secondary-foreground hover:bg-secondary/90 shadow-sm"
          onClick={() => {
            const link = propertyLink;
            if (link) {
              const url = `${window.location.origin}/tenant/${link.token}`;
              navigator.clipboard.writeText(url);
              toast({ title: "Link copied!", description: "Share this with the tenant so they can submit requests." });
            } else {
              toast({ title: "No portal link", description: "A share link will be auto-generated.", variant: "destructive" });
            }
          }}>
          <ExternalLink className="w-4 h-4 mr-1.5" />Copy Tenant Request Link
        </Button>
        </div>
      </TabsContent>

      {/* ══════════ TAB 4: UPCOMING SERVICES ══════════ */}
      <TabsContent value="upcoming" className="mt-0">
        <div className="space-y-4 max-w-7xl mx-auto">
        {/* Quick Add Service */}
        {!showQuickAdd ? (
          <div className="flex gap-1.5">
            <Button variant="outline" size="sm" className="flex-1 h-8 text-xs" onClick={() => setShowQuickAdd(true)}>
              <CalendarPlus className="w-3.5 h-3.5 mr-1" />Add Service to Date
            </Button>
            {onAddUpcomingService && (
              <Button variant="outline" size="sm" className="h-8 text-xs" onClick={onAddUpcomingService}>
                <Plus className="w-3.5 h-3.5" />
              </Button>
            )}
          </div>
        ) : (
          <Card className="shadow-sm">
            <CardContent className="p-3 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold">Quick Add Service</p>
                <button onClick={() => setShowQuickAdd(false)}><X className="w-3.5 h-3.5 text-muted-foreground" /></button>
              </div>
              <Select value={addingServiceType} onValueChange={setAddingServiceType}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SERVICE_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
              <Input type="date" className="h-8 text-xs" value={addingServiceDate} onChange={e => setAddingServiceDate(e.target.value)} />
              <Button size="sm" className="w-full h-7 text-xs" onClick={quickAddService} disabled={!addingServiceDate}>
                <Plus className="w-3 h-3 mr-1" />Add
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Upcoming Services */}
        <div className="border-b-2 border-primary/40 pb-2.5">
          <h3 className="text-base font-bold flex items-center gap-2">
            <ClipboardList className="w-5 h-5 text-secondary" />Upcoming Services
            <Badge variant="secondary" className="text-[11px] ml-1">{allUpcoming.length}</Badge>
          </h3>
        </div>

        {allUpcoming.length === 0 ? (
          <Card className="shadow-sm"><CardContent className="p-8 text-center text-muted-foreground text-sm">No upcoming services</CardContent></Card>
        ) : (
          <div className="space-y-2">
            {allUpcoming.map((s, i) => {
              const isFirst = i === 0;
              const isExpanded = isFirst || expandedUpcomingId === s.id;
              const isProjected = (s as any).isProjected;
              const unitsPlanned = Array.isArray(s.units_planned) ? s.units_planned as string[] : [];
              const pmNotesMapHeader: Record<string, string> =
                ((property.customer_preferences as any)?.pm_upcoming_notes as Record<string, string>) || {};
              const hasPmNote = !!(s.service_date && pmNotesMapHeader[s.service_date]);

              return (
                <Card key={s.id} className={`transition-all shadow-sm ${isFirst ? "border-primary/50 shadow-md ring-1 ring-primary/20 bg-gradient-to-br from-primary/[0.08] to-transparent" : isExpanded ? "border-primary/20" : "hover:border-muted-foreground/30"} ${isProjected ? "border-dashed" : ""}`}>
                  <button className="w-full text-left p-3 flex items-center justify-between" onClick={() => !isFirst && setExpandedUpcomingId(isExpanded && !isFirst ? null : s.id)}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {isFirst && <Badge className="text-[10px] bg-secondary text-secondary-foreground">Next Service</Badge>}
                        <p className={`font-semibold ${isFirst ? "text-sm" : "text-xs"}`}>{s.service_type}</p>
                        {isProjected && <Badge variant="outline" className="text-[10px]">Projected</Badge>}
                        {!isProjected && !isFirst && <Badge variant="secondary" className="text-[10px]">{(s as any).scheduling_status || "confirmed"}</Badge>}
                        {hasPmNote && <Badge className="text-[10px] bg-primary/15 text-primary border border-primary/30 hover:bg-primary/15"><ClipboardList className="w-3 h-3 mr-0.5" />PM Note</Badge>}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {isProjected ? formatWeekOf(s.service_date) : formatDate(s.service_date)}
                        {(s as any).technician && ` • ${(s as any).technician}`}
                        {unitsPlanned.length > 0 && ` • ${unitsPlanned.length} units`}
                      </p>
                    </div>
                    {!isFirst && <ChevronDown className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform ${isExpanded ? "rotate-180" : ""}`} />}
                  </button>
                  {isExpanded && renderServiceDetails(s, true, isProjected, isFirst)}
                </Card>
              );
            })}
          </div>
        )}

        {/* Future projected visits — date only, no details */}
        {futureProjectedDates.length > 0 && (
          <div className="mt-6">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5" />
              Following {futureProjectedDates.length} visits ({propertyFrequency.replace("-", " ").replace(/\b\w/g, c => c.toUpperCase())})
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {futureProjectedDates.map((d, idx) => (
                <div
                  key={`future-${idx}`}
                  className="flex items-center gap-2 bg-muted/40 border border-border rounded-md px-3 py-2"
                >
                  <span className="w-5 h-5 rounded-full bg-muted text-muted-foreground text-[10px] font-bold flex items-center justify-center shrink-0">
                    {idx + 2}
                  </span>
                  <span className="text-xs">{formatDate(d)}</span>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground italic mt-2">
              Projected dates only — service details are confirmed closer to each visit.
            </p>
          </div>
        )}
        </div>
      </TabsContent>

      {/* ══════════ TAB 5: PREP SHEETS ══════════ */}
      <TabsContent value="prep" className="mt-0">
        <div className="space-y-2 max-w-4xl mx-auto">
          <div className="border-b-2 border-primary/40 pb-3 mb-3">
            <h3 className="text-xl font-bold flex items-center gap-2">
              <FileDown className="w-6 h-6 text-secondary" />Prep Sheets
              <Badge variant="secondary" className="text-xs ml-1">{prepSheets.length}</Badge>
            </h3>
            <p className="text-xs text-muted-foreground mt-1">Easy-to-send instructions for customers before treatment.</p>
          </div>
          {prepSheets.length === 0 ? (
            <Card className="shadow-sm"><CardContent className="p-8 text-center text-muted-foreground text-sm">No prep sheets available</CardContent></Card>
          ) : (
          <div className="space-y-2">
            {prepSheets.map(ps => (
              <Card key={ps.id} className="shadow-sm hover:border-primary/30 transition-all">
                <button className="w-full text-left p-3 flex items-center justify-between" onClick={() => setExpandedPrepSheet(expandedPrepSheet === ps.id ? null : ps.id)}>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold">{ps.title}</p>
                    <p className="text-xs text-muted-foreground">{ps.treatment_type}</p>
                  </div>
                  <ChevronDown className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform ${expandedPrepSheet === ps.id ? "rotate-180" : ""}`} />
                </button>
                {expandedPrepSheet === ps.id && ps.description && (
                  <div className="px-3 pb-3 border-t border-border/60 pt-3 space-y-3">
                    <div className="bg-muted/30 rounded-lg p-3 max-h-[400px] overflow-y-auto">
                      <pre className="text-xs whitespace-pre-wrap font-sans leading-relaxed">{ps.description}</pre>
                    </div>
                    <div className="flex gap-1.5">
                      <Button
                        size="sm"
                        className="flex-1 h-9 text-sm"
                        onClick={async () => {
                          if (ps.description) {
                            await navigator.clipboard.writeText(ps.description);
                            setCopyingPrepSheet(ps.id);
                            toast({ title: "Prep sheet copied!", description: "Paste it into a text or email to send to the customer." });
                            setTimeout(() => setCopyingPrepSheet(null), 2000);
                          }
                        }}
                      >
                        {copyingPrepSheet === ps.id ? (
                          <><CheckCircle className="w-3.5 h-3.5 mr-1" />Copied!</>
                        ) : (
                          <><Copy className="w-3.5 h-3.5 mr-1" />Copy to Clipboard</>
                        )}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-9 text-sm"
                        onClick={() => {
                          if (ps.description) {
                            const subject = encodeURIComponent(ps.title);
                            const body = encodeURIComponent(ps.description);
                            window.open(`mailto:?subject=${subject}&body=${body}`, "_blank");
                          }
                        }}
                      >
                        <Send className="w-3.5 h-3.5 mr-1" />Email
                      </Button>
                    </div>
                  </div>
                )}
              </Card>
            ))}
          </div>
          )}
        </div>
      </TabsContent>
    </Tabs>
  );
};

export default PropertyDashboard;
