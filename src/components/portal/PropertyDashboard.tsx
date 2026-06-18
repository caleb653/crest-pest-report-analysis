import { useState, useEffect, useRef } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
import {
  ChevronDown, Calendar, Plus, Edit, Trash2,
  CheckCircle, Wrench, Image, ExternalLink, MapPin, Bug,
  Copy, FileText, Send, X, Flag, ClipboardList, CalendarPlus, Link2, FileDown, FlaskConical, User,
  BarChart3, Phone, Mail, Repeat, Video, Upload, Eye, Download, Shield, Search, Clock, AlertTriangle,
  GripVertical
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { ReadOnlyMapCanvas } from "@/components/ReadOnlyMapCanvas";
import { MapCanvas } from "@/components/MapCanvas";
import { QuarterlyVideoTab } from "@/components/portal/QuarterlyVideoTab";
import { ProductUsageEditor } from "@/components/portal/ProductUsageEditor";
import { ProductUsageSummary, ProductUsageTotalsCard } from "@/components/portal/ProductUsageSummary";
import PlanRichEditor from "@/components/portal/PlanRichEditor";
import { UnitProductPicker } from "@/components/portal/UnitProductPicker";
import { ProductUsage, normalizeUsageList, makeDefaultUsage, collectServiceProductUsage, aggregateUsage } from "@/lib/productCatalog";
import { PRESET_NOTES } from "@/lib/presetNotes";
import { computeUpcomingUnits, getOpenGeneralRequests, getCadenceVisitLabel, buildMergedMostRecentPast } from "@/lib/upcomingUnits";
import { friendlyUnitStatus, promoteStatusOnCompletion } from "@/lib/unitStatus";
import { generateFreeAndClearCertificatePdf, isFreeAndClearStatus } from "@/lib/freeAndClearCertificate";
import {
  DEFAULT_PEST_SURVEY_QUESTIONS,
  DEFAULT_SURVEY_INTRO,
  DEFAULT_ONBOARDING_SURVEY_QUESTIONS,
  DEFAULT_ONBOARDING_SURVEY_TITLE,
  DEFAULT_ONBOARDING_SURVEY_INTRO,
  type SurveyQuestion,
} from "@/lib/surveyDefaults";
import { ServiceComments, type ServiceComment } from "@/components/portal/ServiceComments";
import { SurveyQuestionsPreview } from "@/components/portal/SurveyQuestionsPreview";
import { PropertyDocuments } from "@/components/portal/PropertyDocuments";
import { downloadBlankRightToTreatPdf } from "@/lib/rightToTreatPdf";
import { readUnitPlanConfig, computeOverage, formatOverageMoney } from "@/lib/unitOverage";
import { STAFF_NAMES } from "@/lib/staffRoster";
import { PesticideNotice } from "@/components/portal/PesticideNotice";
import ApartmentInspectionDisclaimer from "@/components/portal/ApartmentInspectionDisclaimer";
import { HOAServiceView, type HOAUnitItem } from "@/components/portal/HOAServiceView";
import { PreApplicationNoticeCard } from "@/components/portal/PreApplicationNoticeCard";
import { ResidentContactCard } from "@/components/portal/ResidentContactCard";
import { parseResidentContact } from "@/lib/residentContact";

// ─── Types ───
interface PortalProperty {
  id: string; client_id: string; name: string; address: string | null; notes: string | null;
  image_url: string | null; map_data: any; map_image_url: string | null;
  equipment: any; customer_preferences: any;
  owner_tech?: string | null;
}
interface PortalService {
  id: string; property_id: string; service_date: string | null; service_time: string | null;
  service_type: string; technician: string | null; status: string; summary: string | null;
  findings: string | null; notes: string | null; products_used: any; photos: any;
  follow_up_recommended: boolean | null; follow_up_notes: string | null;
  scheduling_status: string | null; prep_required: boolean | null; prep_notes: string | null;
  unit_details: any; special_notes: string | null; units_planned: any;
  frequency_days?: number | null;
  report_data?: any;
}
interface PortalLink {
  id: string; client_id: string; token: string; link_type: string; label: string | null;
  assigned_property_ids: any; is_active: boolean; unit_number?: string | null;
}

// ─── Constants ───
const EQUIPMENT_OPTIONS = ["Rodent Bait Stations", "Rodent Traps", "Mosquito Buckets", "Fly Light", "Pest Monitors"];
const PEST_TYPES = ["General Pests", "Ants", "Spiders", "American Roaches", "German Cockroaches", "Crickets", "Earwigs", "Rodents", "Bed Bugs", "Fleas", "Mosquitoes", "Wasps", "Silverfish", "Other"];
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

/**
 * An "Ad Hoc Visit" is a one-off appointment that sits in its own bubble.
 * It MUST NOT impact the cadence rotation, follow-up roll-forward, or the
 * "next service" selection. We tag it on `report_data.is_ad_hoc = true`
 * and filter it out of pastServices / scheduledServices used by all the
 * cadence + follow-up logic.
 */
const isAdHocService = (s: any): boolean =>
  !!(s && s.report_data && (s.report_data as any).is_ad_hoc === true);

type RequestSnapshotRow = {
  id?: string;
  created_at?: string;
  pest_type?: string | null;
  location_type?: string | null;
  description?: string | null;
  unit_number?: string | null;
  request_type?: string | null;
  photos?: unknown;
};

const isCommunityPestSighting = (r: RequestSnapshotRow | null | undefined) =>
  r?.request_type === "Community Pest Sighting" ||
  /^\[COMMUNITY SIGHTING\]/i.test(String(r?.description || ""));

const toAddressedRequestSnapshot = (r: RequestSnapshotRow) => ({
  id: r.id,
  created_at: r.created_at,
  pest_type: r.pest_type,
  location_type: r.location_type,
  description: r.description,
  unit_number: r.unit_number,
  request_type: r.request_type,
  photos: Array.isArray(r.photos) ? r.photos : [],
});

const ACTIVITY_OPTIONS = ["None", "Low", "Medium", "High", "Very High"];
// Status option sets are now context-aware: technicians only see the choices
// that make sense for the kind of visit they're filling out (treatment vs.
// inspection). The underlying canonical values are preserved so existing
// filtering / follow-up logic keeps working.
const TREATMENT_STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "To Be Treated",       label: "To Be Treated" },
  { value: "Treated - Complete",  label: "Treated" },
  { value: "Not Treated",         label: "Not Treated" },
];
const INSPECTION_STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "To Be Treated",              label: "To Be Inspected" },
  { value: "Inspected: Free and Clear",  label: "No Activity Found - Free and Clear" },
  { value: "Inspected: Activity Found",  label: "Activity Found" },
  // Use a distinct canonical value so an inspection that wasn't performed
  // never collides with a treatment row's "Not Treated" status (which would
  // make a treated row render as "Not Treated" on customer reports/email).
  { value: "Inspection: Not Performed",  label: "Not Inspected" },
];

const TECHNICIAN_OPTIONS = [
  "Darrell Tanner",
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
  /**
   * Property classification — drives the HOA-vs-Apartment view differences.
   * HOA mode shifts emphasis to common areas, hides per-unit treatment details,
   * and swaps the work-order tenant block for a homeowner contact block.
   */
  propertyType?: "apartments" | "hoa" | "commercial";
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
  propertyType = "apartments",
}: Props) => {
  const isHOA = propertyType === "hoa";
  // For apartments: "date" / "unit" toggle. HOA shows only "date".
  const [pastViewMode, setPastViewMode] = useState<"date" | "unit">("date");
  const [byUnitSearch, setByUnitSearch] = useState("");
  const residentTerm = isHOA ? "resident" : "tenant";
  const ResidentTerm = isHOA ? "Resident" : "Tenant";
  const [expandedPastId, setExpandedPastId] = useState<string | null>(null);
  const [expandedUpcomingId, setExpandedUpcomingId] = useState<string | null>(null);
  // Per-unit-card expansion (rich cards inside an opened service). Default: all collapsed.
  const [expandedUnitKeys, setExpandedUnitKeys] = useState<Set<string>>(new Set());
  const toggleUnitKey = (key: string) =>
    setExpandedUnitKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const [completingServiceId, setCompletingServiceId] = useState<string | null>(null);
  const [followUpUnits, setFollowUpUnits] = useState<string[]>([]);
  const [workOrder, setWorkOrder] = useState({
    unit_number: "", pest_type: "", location_type: "", comments: "",
    request_type: "" as "" | "treatment" | "inspection" | "general",
    occupancy_status: "" as "" | "Occupied" | "Vacant",
    email_tenant: false, tenant_email: "", prep_sheet_id: "", right_to_treat: false,
    // HOA-mode customer contact (homeowner submitting the request).
    customer_name: "", customer_phone: "",
    // Optional new-tenant move-in date (YYYY-MM-DD). When set on submit,
    // the date is saved into property.customer_preferences.tenant_move_ins
    // keyed by the unit number so the 🏠 New Tenant tag appears on this
    // unit until the date passes.
    tenant_move_in_date: "",
  });
  const [submittingWorkOrder, setSubmittingWorkOrder] = useState(false);
  // Photos attached to the new work order (any number, all optional).
  // Stored as an array of public URLs from the `report-images` bucket and
  // persisted into portal_requests.photos on submit.
  const [workOrderPhotos, setWorkOrderPhotos] = useState<string[]>([]);
  const [uploadingWorkOrderPhotos, setUploadingWorkOrderPhotos] = useState(false);
  // ─── HOA work-order form (mirrors PM portal exactly) ───
  // The HOA admin form is a simpler 2-button picker (Community Pest Sighting
  // vs Service Request) with its own field set, identical to the PM HOA UI.
  // Lives next to the apartment workOrder state so admin and PM stay in sync.
  const [hoaRequestKind, setHoaRequestKind] = useState<"" | "community" | "service">("");
  const [hoaAddress, setHoaAddress] = useState("");
  const [hoaLocation, setHoaLocation] = useState("");
  const [hoaPests, setHoaPests] = useState("");
  const [hoaDetails, setHoaDetails] = useState("");
  // Resident contact for HOA Service Requests — mirrors the PM portal so the
  // homeowner's name/phone/email are always captured with the work order.
  const [hoaResidentName, setHoaResidentName] = useState("");
  const [hoaResidentPhone, setHoaResidentPhone] = useState("");
  const [hoaResidentEmail, setHoaResidentEmail] = useState("");
  const [submittingHoaRequest, setSubmittingHoaRequest] = useState(false);
  const submitHoaRequest = async () => {
    if (!hoaRequestKind) return;
    const isCommunity = hoaRequestKind === "community";
    if (isCommunity) {
      if (!hoaLocation.trim() || !hoaPests.trim()) return;
    } else {
      if (
        !hoaAddress.trim() ||
        !hoaLocation.trim() ||
        !hoaPests.trim() ||
        !hoaResidentName.trim() ||
        !hoaResidentEmail.trim() ||
        !hoaResidentPhone.trim()
      ) return;
    }
    setSubmittingHoaRequest(true);
    const requestType = isCommunity ? "Community Pest Sighting" : "Service Request";
    const tag = isCommunity ? "[COMMUNITY SIGHTING]" : "[HOA SERVICE REQUEST]";
    const descParts = [
      !isCommunity ? `Resident: ${hoaResidentName.trim()}` : null,
      !isCommunity ? `Phone: ${hoaResidentPhone.trim()}` : null,
      !isCommunity ? `Email: ${hoaResidentEmail.trim()}` : null,
      `Pests: ${hoaPests.trim()}`,
      `Location: ${hoaLocation.trim()}`,
      hoaDetails.trim() ? `Details: ${hoaDetails.trim()}` : null,
    ].filter(Boolean).join(" — ");
    const { data: inserted, error: err } = await supabase.from("portal_requests").insert({
      property_id: property.id,
      unit_number: isCommunity ? null : hoaAddress.trim().toUpperCase(),
      request_type: requestType,
      description: `${tag} ${descParts}`,
      pest_type: hoaPests.trim(),
      location_type: hoaLocation.trim(),
      photos: workOrderPhotos,
      tenant_email: !isCommunity ? hoaResidentEmail.trim() : null,
    } as any).select("id").maybeSingle();
    if (err) {
      toast({ title: "Could not submit request", description: err.message, variant: "destructive" });
      setSubmittingHoaRequest(false);
      return;
    }
    toast({
      title: isCommunity ? "Sighting submitted" : "Service request submitted",
      description: isCommunity
        ? "Thank you for the heads up. We will be sure to incorporate this into our next community treatment."
        : "Thank you. We will be calling you shortly to walk through treatment options and pricing.",
    });
    if (inserted?.id) {
      try {
        await supabase.functions.invoke("notify-submission", {
          body: { kind: "work_order", requestId: inserted.id },
        });
      } catch (e) { console.error("notify-submission failed", e); }
    }
    setHoaRequestKind("");
    setHoaAddress("");
    setHoaLocation("");
    setHoaPests("");
    setHoaDetails("");
    setHoaResidentName("");
    setHoaResidentPhone("");
    setHoaResidentEmail("");
    setWorkOrderPhotos([]);
    const { data: reqs } = await supabase
      .from("portal_requests")
      .select("*")
      .eq("property_id", property.id)
      .in("status", ["pending", "in_progress"])
      .order("created_at", { ascending: false });
    if (reqs) setPendingRequests(reqs);
    setSubmittingHoaRequest(false);
    onRefresh();
  };
  const handleWorkOrderPhotoUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploadingWorkOrderPhotos(true);
    const urls: string[] = [];
    try {
      for (const file of Array.from(files)) {
        if (!file.type.startsWith("image/")) continue;
        const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
        const path = `work-order-photos/${property.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("report-images")
          .upload(path, file, { contentType: file.type || "image/jpeg", upsert: false });
        if (upErr) {
          toast({ title: "Photo upload failed", description: upErr.message, variant: "destructive" });
          continue;
        }
        const { data: pub } = supabase.storage.from("report-images").getPublicUrl(path);
        if (pub?.publicUrl) urls.push(pub.publicUrl);
      }
      if (urls.length) setWorkOrderPhotos(prev => [...prev, ...urls]);
    } finally {
      setUploadingWorkOrderPhotos(false);
    }
  };
  const [activeTab, setActiveTab] = useState<string>("map");
  const [addingServiceDate, setAddingServiceDate] = useState("");
  const [addingServiceType, setAddingServiceType] = useState("Commercial General Pest Control");
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  // Ad Hoc (one-off) visit add form — completely separate from regular service.
  const [showAdHocAdd, setShowAdHocAdd] = useState(false);
  const [adHocDate, setAdHocDate] = useState("");
  const [adHocType, setAdHocType] = useState("General Pest Control");
  const [adHocNote, setAdHocNote] = useState("");
  // Drag-and-drop: move a unit from an upcoming service into an existing
  // ad-hoc visit. The dragged unit is dismissed from the source upcoming
  // service (so it disappears from admin + customer "Next Service" lists)
  // and added to the target ad-hoc visit's units_planned + unit_details.
  const [dragUnit, setDragUnit] = useState<
    | { sourceServiceId: string; unit: string; row?: any }
    | null
  >(null);
  const [dragOverAdHocId, setDragOverAdHocId] = useState<string | null>(null);
  // Inline add-unit state
  const [addingUnitToService, setAddingUnitToService] = useState<string | null>(null);
  const [newUnitData, setNewUnitData] = useState<any>({ unit_number: "", findings: "", pest_activity: "None", products_used: "", status: "Complete", notes: "", kind: "service" });
  // Past services are READ-ONLY by default — admins must explicitly opt in to
  // editing a specific past service to prevent accidental edits (e.g. clicking
  // a status dropdown auto-promoting a unit to "Needs Follow Up").
  const [editingPastIds, setEditingPastIds] = useState<Set<string>>(new Set());
  const isPastEditing = (id: string) => editingPastIds.has(id);
  const togglePastEditing = (id: string) => {
    setEditingPastIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  // Inline add-unit for upcoming
  const [addingPlannedUnit, setAddingPlannedUnit] = useState<string | null>(null);
  const [newPlannedUnit, setNewPlannedUnit] = useState("");
  // Inline reschedule of the next upcoming service. Persists the new date and
  // projection of the following visits naturally rolls forward at the cadence.
  const [reschedulingId, setReschedulingId] = useState<string | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState<string>("");
  const [rescheduleSaving, setRescheduleSaving] = useState(false);
  // Inline completion form data
  type CompletionDraft = {
    unitRows: { unit_number: string; target_pest: string; findings: string; pest_activity: string; products_used: ProductUsage[]; status: string; notes: string; source: string; request_id?: string; follow_up_needed?: boolean; sanitization_concern?: boolean; photos?: { url: string; uploading?: boolean }[]; kind?: string }[];
    summary: string; findings: string; notes: string; technician: string;
    time_in: string; time_out: string;
    photos: { url: string; uploading?: boolean }[];
    products: ProductUsage[];
  };
  const [completionData, setCompletionData] = useState<Record<string, CompletionDraft>>({});
  const completionDataRef = useRef<Record<string, CompletionDraft>>({});
  useEffect(() => { completionDataRef.current = completionData; }, [completionData]);
  const [uploadingPhotoFor, setUploadingPhotoFor] = useState<string | null>(null);
  // Tracks per-unit photo uploads:  `${serviceId}:${unitIndex}` while uploading
  const [uploadingUnitPhotoFor, setUploadingUnitPhotoFor] = useState<string | null>(null);
  // Tracks per-unit photo uploads in the in-progress completion form (rows aren't saved yet)
  const [uploadingCompletionUnitPhotoFor, setUploadingCompletionUnitPhotoFor] = useState<string | null>(null);
  const [pendingRequests, setPendingRequests] = useState<any[]>([]);
  // Full request history (including resolved/closed) — used by the unit
  // history view to surface each unit's original "Initial Work Order".
  const [allRequests, setAllRequests] = useState<any[]>([]);
  const [signedAuthorizations, setSignedAuthorizations] = useState<any[]>([]);
  // Per-service local set of units the admin just removed, applied immediately
  // so the auto-merge effect doesn't re-add the unit between the local state
  // update and the DB refresh that picks up the persisted dismissal.
  const [recentlyDismissedUnits, setRecentlyDismissedUnits] = useState<Record<string, Set<string>>>({});
  const [prepSheets, setPrepSheets] = useState<{ id: string; title: string; description: string | null; treatment_type: string; file_url: string | null }[]>([]);
  const [expandedPrepSheet, setExpandedPrepSheet] = useState<string | null>(null);
  const [copyingPrepSheet, setCopyingPrepSheet] = useState<string | null>(null);
  // Per-prep-sheet "email this PDF" form state.
  const [prepEmailDraft, setPrepEmailDraft] = useState<Record<string, string>>({});
  const [prepEmailSending, setPrepEmailSending] = useState<string | null>(null);

  // ── Autosave the in-progress completion form into
  //    `portal_services.report_data.completion_draft` so any products,
  //    findings, or per-unit notes typed on an UPCOMING service survive a
  //    page refresh / nav-away. Debounced 800ms per service. The draft is
  //    cleared on completeService() so it never bleeds into past records. ──
  const completionDraftTimers = useRef<Record<string, any>>({});
  const completionDraftLast = useRef<Record<string, string>>({});
  useEffect(() => {
    Object.entries(completionData).forEach(([serviceId, data]) => {
      if (!data) return;
      const svc = services.find(s => s.id === serviceId);
      // Only autosave for real, not-yet-completed services. Projected
      // (synthetic) rows have no DB id; completed services should never
      // mutate their stored draft.
      if (!svc || svc.status === "completed") return;
      const serialized = JSON.stringify(data);
      if (completionDraftLast.current[serviceId] === serialized) return;
      completionDraftLast.current[serviceId] = serialized;
      if (completionDraftTimers.current[serviceId]) {
        clearTimeout(completionDraftTimers.current[serviceId]);
      }
      completionDraftTimers.current[serviceId] = setTimeout(async () => {
        try {
          // Strip transient upload flags before persisting.
          let cleanRows = (data.unitRows || []).map((r: any) => ({
            ...r,
            photos: Array.isArray(r.photos)
              ? r.photos.filter((p: any) => p?.url && !p?.uploading).map((p: any) => ({ url: p.url }))
              : [],
          }));
          const cleanPhotos = (data.photos || []).filter((p: any) => p?.url && !p?.uploading).map((p: any) => ({ url: p.url }));
          const existing = (svc as any).report_data && typeof (svc as any).report_data === "object"
            ? (svc as any).report_data
            : {};
          const { data: latest } = await supabase
            .from("portal_services")
            .select("report_data")
            .eq("id", serviceId)
            .maybeSingle();
          const latestReportData = (latest as any)?.report_data && typeof (latest as any).report_data === "object"
            ? (latest as any).report_data
            : existing;
          const dismissed = new Set<string>();
          const dismissedRaw = Array.isArray((latestReportData as any).dismissed_units)
            ? (latestReportData as any).dismissed_units as any[]
            : [];
          dismissedRaw.forEach((entry) => {
            const label = String((typeof entry === "string" ? entry : entry?.unit) || "").trim();
            if (label) dismissed.add(label);
          });
          if (dismissed.size > 0) {
            cleanRows = cleanRows.filter((r: any) => !dismissed.has(String(r?.unit_number || "").trim()));
          }
          const next = {
            ...latestReportData,
            completion_draft: {
              ...data,
              unitRows: cleanRows,
              photos: cleanPhotos,
              _saved_at: new Date().toISOString(),
            },
          };
          await supabase.from("portal_services").update({ report_data: next }).eq("id", serviceId);
          (svc as any).report_data = next;
        } catch (e) {
          console.warn("completion draft autosave failed", e);
        }
      }, 800);
    });
    return () => {
      // Don't clear timers on unmount — they're fine to fire after unmount
      // since they only hit the DB.
    };
  }, [completionData, services]);

  // Survey state — mirrors PMPortalView so admin has full survey workflow
  const [surveys, setSurveys] = useState<any[]>([]);

  const [surveyResponses, setSurveyResponses] = useState<any[]>([]);
  const [surveyTitle, setSurveyTitle] = useState("Pest Activity Survey");
  const [surveyIntro, setSurveyIntro] = useState(DEFAULT_SURVEY_INTRO);
  const [surveyEmails, setSurveyEmails] = useState("");
  const [sendingSurvey, setSendingSurvey] = useState(false);
  const [expandedSurveyId, setExpandedSurveyId] = useState<string | null>(null);

  // Onboarding survey state (separate inner tab) — mirrors PMPortalView
  const [onbTitle, setOnbTitle] = useState(DEFAULT_ONBOARDING_SURVEY_TITLE);
  const [onbIntro, setOnbIntro] = useState(DEFAULT_ONBOARDING_SURVEY_INTRO);
  const [onbEmails, setOnbEmails] = useState("");
  const [sendingOnb, setSendingOnb] = useState(false);
  const [innerSurveyTab, setInnerSurveyTab] = useState<"tenant" | "onboarding">("tenant");
  const [generatingLink, setGeneratingLink] = useState<"tenant" | "onboarding" | null>(null);

  // Local Property Plan state — debounced save so typing isn't laggy or toast-spammy
  const [planDraft, setPlanDraft] = useState<string>(property.notes || "");
  // Only re-hydrate from props when the SELECTED PROPERTY changes. Re-hydrating on
  // every `property.notes` change caused characters to disappear while typing —
  // a parent refresh would overwrite the in-flight draft mid-keystroke.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setPlanDraft(property.notes || ""); }, [property.id]);
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

  // Property Point of Contact — name + email + phone, stored in customer_preferences.point_of_contact
  const initialPocName = (property.customer_preferences as any)?.point_of_contact?.name || "";
  const initialPocEmail = (property.customer_preferences as any)?.point_of_contact?.email || "";
  const initialPocPhone = (property.customer_preferences as any)?.point_of_contact?.phone || "";
  const [pocName, setPocName] = useState<string>(initialPocName);
  const [pocEmail, setPocEmail] = useState<string>(initialPocEmail);
  const [pocPhone, setPocPhone] = useState<string>(initialPocPhone);
  useEffect(() => {
    setPocName((property.customer_preferences as any)?.point_of_contact?.name || "");
    setPocEmail((property.customer_preferences as any)?.point_of_contact?.email || "");
    setPocPhone((property.customer_preferences as any)?.point_of_contact?.phone || "");
  }, [property.id, property.customer_preferences]);
  useEffect(() => {
    const currentName = (property.customer_preferences as any)?.point_of_contact?.name || "";
    const currentEmail = (property.customer_preferences as any)?.point_of_contact?.email || "";
    const currentPhone = (property.customer_preferences as any)?.point_of_contact?.phone || "";
    if (currentName === pocName && currentEmail === pocEmail && currentPhone === pocPhone) return;
    const t = setTimeout(async () => {
      const updated = {
        ...(property.customer_preferences || {}),
        point_of_contact: { name: pocName, email: pocEmail, phone: pocPhone },
      };
      const { error } = await supabase
        .from("portal_properties")
        .update({ customer_preferences: updated })
        .eq("id", property.id);
      if (error) {
        toast({ title: "Failed to save point of contact", variant: "destructive" });
      } else {
        (property as any).customer_preferences = updated;
      }
    }, 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pocName, pocEmail, pocPhone]);

  // ─── Required Time per Treatment (visible to PM + Admin) ───
  // Stored on customer_preferences.required_treatment_time as a free-form string
  // (e.g. "45 minutes", "1.5 hours") so techs/PMs can plan around it.
  const initialRequiredTime = (property.customer_preferences as any)?.required_treatment_time || "";
  const [requiredTimeDraft, setRequiredTimeDraft] = useState<string>(initialRequiredTime);
  useEffect(() => {
    setRequiredTimeDraft((property.customer_preferences as any)?.required_treatment_time || "");
  }, [property.id, property.customer_preferences]);
  useEffect(() => {
    const current = (property.customer_preferences as any)?.required_treatment_time || "";
    if (current === requiredTimeDraft) return;
    const t = setTimeout(async () => {
      const updated = { ...(property.customer_preferences || {}), required_treatment_time: requiredTimeDraft };
      const { error } = await supabase
        .from("portal_properties")
        .update({ customer_preferences: updated })
        .eq("id", property.id);
      if (!error) {
        (property as any).customer_preferences = updated;
      }
    }, 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requiredTimeDraft]);

  // ─── RED NOTES (ADMIN-ONLY — NEVER shown in PM portal) ───
  // Confidential admin-only notes. Stored on customer_preferences.red_notes.
  // PMPortalView.tsx must NEVER read this field.
  const initialRedNotes = (property.customer_preferences as any)?.red_notes || "";
  const [redNotesDraft, setRedNotesDraft] = useState<string>(initialRedNotes);
  useEffect(() => {
    setRedNotesDraft((property.customer_preferences as any)?.red_notes || "");
  }, [property.id, property.customer_preferences]);
  useEffect(() => {
    const current = (property.customer_preferences as any)?.red_notes || "";
    if (current === redNotesDraft) return;
    const t = setTimeout(async () => {
      const updated = { ...(property.customer_preferences || {}), red_notes: redNotesDraft };
      const { error } = await supabase
        .from("portal_properties")
        .update({ customer_preferences: updated })
        .eq("id", property.id);
      if (!error) {
        (property as any).customer_preferences = updated;
      }
    }, 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [redNotesDraft]);
  const redNotesValue = (property.customer_preferences as any)?.red_notes || "";

  // Crest Client Owner — which staff member owns this property
  const [ownerTechDraft, setOwnerTechDraft] = useState<string>(property.owner_tech || "");
  useEffect(() => {
    setOwnerTechDraft(property.owner_tech || "");
  }, [property.id, property.owner_tech]);
  const saveOwnerTech = async (value: string) => {
    const next = value === "__none__" ? null : value;
    setOwnerTechDraft(next || "");
    const { error } = await supabase
      .from("portal_properties")
      .update({ owner_tech: next })
      .eq("id", property.id);
    if (error) {
      toast({ title: "Failed to save client owner", variant: "destructive" });
    } else {
      (property as any).owner_tech = next;
      toast({ title: "Client owner updated", duration: 1500 });
      onRefresh();
    }
  };

  // Crest Point of Contact — name + email + phone for the Crest staff member
  // that the PM should reach out to. Stored in customer_preferences.crest_point_of_contact.
  const initialCrestName = (property.customer_preferences as any)?.crest_point_of_contact?.name || "";
  const initialCrestEmail = (property.customer_preferences as any)?.crest_point_of_contact?.email || "";
  const initialCrestPhone = (property.customer_preferences as any)?.crest_point_of_contact?.phone || "";
  const [crestName, setCrestName] = useState<string>(initialCrestName);
  const [crestEmail, setCrestEmail] = useState<string>(initialCrestEmail);
  const [crestPhone, setCrestPhone] = useState<string>(initialCrestPhone);
  useEffect(() => {
    setCrestName((property.customer_preferences as any)?.crest_point_of_contact?.name || "");
    setCrestEmail((property.customer_preferences as any)?.crest_point_of_contact?.email || "");
    setCrestPhone((property.customer_preferences as any)?.crest_point_of_contact?.phone || "");
  }, [property.id, property.customer_preferences]);
  useEffect(() => {
    const cur = (property.customer_preferences as any)?.crest_point_of_contact || {};
    if ((cur.name || "") === crestName && (cur.email || "") === crestEmail && (cur.phone || "") === crestPhone) return;
    const t = setTimeout(async () => {
      const updated = {
        ...(property.customer_preferences || {}),
        crest_point_of_contact: { name: crestName, email: crestEmail, phone: crestPhone },
      };
      const { error } = await supabase
        .from("portal_properties")
        .update({ customer_preferences: updated })
        .eq("id", property.id);
      if (error) {
        toast({ title: "Failed to save Crest contact", variant: "destructive" });
      } else {
        (property as any).customer_preferences = updated;
      }
    }, 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [crestName, crestEmail, crestPhone]);

  // ─── Unit Plan: included units per service + price per unit overage ───
  // Stored on customer_preferences so PM/admin/tech all see the same plan terms.
  const initialPlanCfg = readUnitPlanConfig(property.customer_preferences);
  const [includedUnitsDraft, setIncludedUnitsDraft] = useState<string>(
    initialPlanCfg.included_units ? String(initialPlanCfg.included_units) : ""
  );
  const [overagePriceDraft, setOveragePriceDraft] = useState<string>(
    initialPlanCfg.overage_price_per_unit ? String(initialPlanCfg.overage_price_per_unit) : ""
  );
  const [basePriceDraft, setBasePriceDraft] = useState<string>(
    initialPlanCfg.base_service_price ? String(initialPlanCfg.base_service_price) : ""
  );
  useEffect(() => {
    const cfg = readUnitPlanConfig(property.customer_preferences);
    setIncludedUnitsDraft(cfg.included_units ? String(cfg.included_units) : "");
    setOveragePriceDraft(cfg.overage_price_per_unit ? String(cfg.overage_price_per_unit) : "");
    setBasePriceDraft(cfg.base_service_price ? String(cfg.base_service_price) : "");
  }, [property.id, property.customer_preferences]);
  useEffect(() => {
    const current = readUnitPlanConfig(property.customer_preferences);
    const draftIncluded = Number(includedUnitsDraft) || 0;
    const draftPrice = Number(overagePriceDraft) || 0;
    const draftBase = Number(basePriceDraft) || 0;
    if (
      (current.included_units || 0) === draftIncluded &&
      (current.overage_price_per_unit || 0) === draftPrice &&
      (current.base_service_price || 0) === draftBase
    ) return;
    const t = setTimeout(async () => {
      const updated = {
        ...(property.customer_preferences || {}),
        included_units: draftIncluded,
        overage_price_per_unit: draftPrice,
        base_service_price: draftBase,
      };
      const { error } = await supabase
        .from("portal_properties")
        .update({ customer_preferences: updated })
        .eq("id", property.id);
      if (error) {
        toast({ title: "Failed to save unit plan", variant: "destructive" });
      } else {
        (property as any).customer_preferences = updated;
        toast({ title: "Unit plan saved", duration: 1200 });
      }
    }, 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [includedUnitsDraft, overagePriceDraft, basePriceDraft]);

  // ─── Cadence Visit Plan ───
  // For weekly and bi-weekly schedules, technicians rotate what they focus on
  // each visit (e.g. visit 1 = full exterior, visit 2 = spot-treat hotspots).
  // Stored at customer_preferences.cadence_visit_plan as { weekly: string[4], "bi-weekly": string[2] }.
  // Length matches the cycle so each upcoming visit can show its planned focus.
  // Default rotation pre-filled for weekly clients so techs see a starting plan
  // instead of empty boxes. They can overwrite anytime.
  const WEEKLY_DEFAULT_PLAN: string[] = [
    "1st Weekly Visit (Focus on Zone #A)",
    "2nd Weekly Visit (Focus on Zone #B)",
    "3rd Weekly Visit (Focus on Zone #C)",
    "4th Weekly Visit (Focus on Rodent Bait Stations)",
  ];
  const initialCadencePlan: Record<string, string[]> =
    ((property.customer_preferences as any)?.cadence_visit_plan as Record<string, string[]>) || {};
  const [cadencePlanDraft, setCadencePlanDraft] = useState<Record<string, string[]>>(initialCadencePlan);
  useEffect(() => {
    setCadencePlanDraft(((property.customer_preferences as any)?.cadence_visit_plan as Record<string, string[]>) || {});
  }, [property.id, property.customer_preferences]);

  // Auto-seed the weekly default plan if the property is on weekly cadence
  // and no plan (or all-blank entries) has been saved yet.
  useEffect(() => {
    const freq = ((property.customer_preferences as any)?.service_frequency as string) || "bi-weekly";
    if (freq !== "weekly") return;
    const existing = cadencePlanDraft.weekly || [];
    const hasAnyContent = existing.slice(0, 4).some(v => (v || "").trim().length > 0);
    if (hasAnyContent) return;
    setCadencePlanDraft(prev => ({ ...prev, weekly: [...WEEKLY_DEFAULT_PLAN] }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [property.id, property.customer_preferences]);

  useEffect(() => {
    const current = JSON.stringify(((property.customer_preferences as any)?.cadence_visit_plan as Record<string, string[]>) || {});
    if (current === JSON.stringify(cadencePlanDraft)) return;
    const t = setTimeout(async () => {
      const updated = {
        ...(property.customer_preferences || {}),
        cadence_visit_plan: cadencePlanDraft,
      };
      const { error } = await supabase
        .from("portal_properties")
        .update({ customer_preferences: updated })
        .eq("id", property.id);
      if (error) {
        toast({ title: "Failed to save cadence plan", variant: "destructive" });
      } else {
        (property as any).customer_preferences = updated;
      }
    }, 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cadencePlanDraft]);

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
    const loadAllRequests = async () => {
      const { data } = await supabase.from("portal_requests")
        .select("*")
        .eq("property_id", property.id)
        .order("created_at", { ascending: true });
      if (data) setAllRequests(data);
    };
    const loadSignedAuthorizations = async () => {
      const { data } = await supabase.from("portal_requests")
        .select("*")
        .eq("property_id", property.id)
        .not("right_to_treat_signature", "is", null)
        .order("right_to_treat_signed_at", { ascending: false });
      if (data) setSignedAuthorizations(data);
    };
    const loadPrepSheets = async () => {
      const { data } = await supabase.from("portal_prep_sheets")
        .select("*")
        .order("title");
      if (data) {
        // Client-facing portal: only Apartment prep sheets
        // (hide Commercial / Standard variants).
        setPrepSheets(data.filter((s: any) => /^apartment\b/i.test(s.title || "")));
      }
    };
    loadRequests();
    loadAllRequests();
    loadSignedAuthorizations();
    loadPrepSheets();
  }, [property.id]);

  // Prep sheet helpers — mirror PMPortalView so admin gets the exact same
  // View / Download PDF / Copy Link experience.
  const downloadPrep = async (sheet: { title: string; file_url: string | null }) => {
    if (!sheet.file_url) return;
    try {
      const res = await fetch(sheet.file_url);
      if (!res.ok) throw new Error(`status ${res.status}`);
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = `${sheet.title}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch (err) {
      console.error("Download failed", err);
      window.open(sheet.file_url, "_blank", "noopener,noreferrer");
    }
  };
  const copyPrepLink = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: "Link copied!", description: "Share it with the customer." });
    } catch {
      toast({ title: "Could not copy link", variant: "destructive" });
    }
  };

  // Load surveys + responses for this property
  useEffect(() => {
    const loadSurveys = async () => {
      const [{ data: svys }, { data: respRows }] = await Promise.all([
        (supabase as any).from("portal_surveys").select("*").eq("property_id", property.id).order("created_at", { ascending: false }),
        (supabase as any).from("portal_survey_responses").select("*").eq("property_id", property.id).order("created_at", { ascending: false }),
      ]);
      if (Array.isArray(svys)) setSurveys(svys);
      if (Array.isArray(respRows)) setSurveyResponses(respRows);
    };
    loadSurveys();
  }, [property.id]);

  const reloadSurveys = async () => {
    const [{ data: svys }, { data: respRows }] = await Promise.all([
      (supabase as any).from("portal_surveys").select("*").eq("property_id", property.id).order("created_at", { ascending: false }),
      (supabase as any).from("portal_survey_responses").select("*").eq("property_id", property.id).order("created_at", { ascending: false }),
    ]);
    if (Array.isArray(svys)) setSurveys(svys);
    if (Array.isArray(respRows)) setSurveyResponses(respRows);
  };

  const sendSurveyGeneric = async (kind: "tenant" | "onboarding") => {
    const isOnb = kind === "onboarding";
    const raw = isOnb ? onbEmails : surveyEmails;
    const titleVal = isOnb ? onbTitle : surveyTitle;
    const introVal = isOnb ? onbIntro : surveyIntro;
    const questions = isOnb ? DEFAULT_ONBOARDING_SURVEY_QUESTIONS : DEFAULT_PEST_SURVEY_QUESTIONS;
    const defaultTitle = isOnb ? DEFAULT_ONBOARDING_SURVEY_TITLE : "Pest Activity Survey";
    const emails = raw
      .split(/[\s,;]+/)
      .map((e) => e.trim().toLowerCase())
      .filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
    if (emails.length === 0) {
      toast({ title: "Add at least one valid email", variant: "destructive" });
      return;
    }
    if (isOnb) setSendingOnb(true); else setSendingSurvey(true);
    try {
      const { data: created, error } = await (supabase as any)
        .from("portal_surveys")
        .insert({
          property_id: property.id,
          client_id: clientId || null,
          title: titleVal.trim() || defaultTitle,
          intro: introVal.trim() || null,
          questions,
          recipient_emails: emails,
        })
        .select("*")
        .single();
      if (error || !created) throw error;
      const { data: sendRes } = await supabase.functions.invoke("send-tenant-survey", {
        body: { surveyId: created.id, appBaseUrl: window.location.origin },
      });
      if ((sendRes as any)?.ok) {
        toast({ title: "Survey sent", description: `Sent to ${(sendRes as any).sent} recipient(s).` });
      } else {
        toast({ title: "Survey created", description: "Email send may have failed — check logs." });
      }
      if (isOnb) setOnbEmails(""); else setSurveyEmails("");
      await reloadSurveys();
    } catch (e: any) {
      console.error("sendSurvey failed", e);
      toast({ title: "Send failed", description: e?.message || "Try again", variant: "destructive" });
    } finally {
      if (isOnb) setSendingOnb(false); else setSendingSurvey(false);
    }
  };

  const sendSurvey = () => sendSurveyGeneric("tenant");

  const createShareableLink = async (kind: "tenant" | "onboarding") => {
    const isOnb = kind === "onboarding";
    const titleVal = isOnb ? onbTitle : surveyTitle;
    const introVal = isOnb ? onbIntro : surveyIntro;
    const questions = isOnb ? DEFAULT_ONBOARDING_SURVEY_QUESTIONS : DEFAULT_PEST_SURVEY_QUESTIONS;
    const defaultTitle = isOnb ? DEFAULT_ONBOARDING_SURVEY_TITLE : "Pest Activity Survey";
    setGeneratingLink(kind);
    try {
      const { data: created, error } = await (supabase as any)
        .from("portal_surveys")
        .insert({
          property_id: property.id,
          client_id: clientId || null,
          title: titleVal.trim() || defaultTitle,
          intro: introVal.trim() || null,
          questions,
          recipient_emails: [],
        })
        .select("id")
        .maybeSingle();
      if (error || !created?.id) throw new Error("create_failed");
      const { data: resp, error: rErr } = await (supabase as any)
        .from("portal_survey_responses")
        .insert({
          survey_id: created.id,
          property_id: property.id,
          recipient_email: null,
        })
        .select("token")
        .maybeSingle();
      if (rErr || !resp?.token) throw new Error("token_failed");
      const url = `${window.location.origin}/survey/${resp.token}`;
      try {
        await navigator.clipboard.writeText(url);
        toast({ title: "Link copied", description: url });
      } catch {
        toast({ title: "Link generated", description: url });
      }
      await reloadSurveys();
    } catch {
      toast({ title: "Could not generate link", variant: "destructive" });
    } finally {
      setGeneratingLink(null);
    }
  };

  const propServices = services.filter(s => s.property_id === property.id);
  const pastServices = propServices
    .filter(s => s.status === "completed" && !isAdHocService(s))
    .sort((a, b) => {
      // Primary: most recent service date first.
      const dateCmp = (b.service_date || "").localeCompare(a.service_date || "");
      if (dateCmp !== 0) return dateCmp;
      // Tiebreaker: most recently completed/updated first (when several
      // visits share the same date, the one finished latest is "most recent").
      return ((b as any).updated_at || "").localeCompare((a as any).updated_at || "");
    });
  const scheduledServices = propServices
    .filter(s => s.status !== "completed" && !isAdHocService(s))
    .sort((a, b) => (a.service_date || "").localeCompare(b.service_date || ""));

  // Ad-hoc / one-off visits live in their own bubble. They never roll
  // forward follow-ups, never advance the cadence rotation, and never
  // count as the "next service".
  const adHocServices = propServices
    .filter(isAdHocService)
    .sort((a, b) => (a.service_date || "").localeCompare(b.service_date || ""));

  // Display-only list used by the "Previous Services" tab. Includes completed
  // ad-hoc visits so techs/PMs can see them in the past-services timeline.
  // Cadence/follow-up math still uses the pure `pastServices` above so ad-hoc
  // visits never advance the rotation.
  const pastServicesForDisplay = [
    ...pastServices,
    ...adHocServices.filter(s => s.status === "completed"),
  ].sort((a, b) => {
    const dateCmp = (b.service_date || "").localeCompare(a.service_date || "");
    if (dateCmp !== 0) return dateCmp;
    return ((b as any).updated_at || "").localeCompare((a as any).updated_at || "");
  });

  // Move a unit from a source upcoming service into an existing ad-hoc visit.
  // Mirrors the unit-row dismissal logic so the unit drops off the upcoming
  // visit on both admin + customer views, and then APPENDs it (with any
  // draft row data) onto the target ad-hoc service's units_planned +
  // unit_details.
  const moveUnitToAdHocService = async (
    adHocId: string,
    sourceService: any,
    unitLabel: string,
    rowSnapshot?: any,
  ) => {
    const label = String(unitLabel || "").trim();
    if (!label || !adHocId || !sourceService) return;
    const target = propServices.find((p) => p.id === adHocId);
    if (!target) {
      toast({ title: "Ad-hoc visit not found", variant: "destructive" });
      return;
    }
    try {
      // 1) Append unit to the AD-HOC target.
      const existingPlanned = Array.isArray(target.units_planned)
        ? (target.units_planned as string[]).map((u) => String(u).trim()).filter(Boolean)
        : [];
      const nextPlanned = existingPlanned.includes(label)
        ? existingPlanned
        : [...existingPlanned, label];
      const existingDetails = Array.isArray(target.unit_details)
        ? (target.unit_details as any[])
        : [];
      const detailsWithoutLabel = existingDetails.filter(
        (d: any) => String(d?.unit_number || "").trim() !== label,
      );
      const srcDetails = Array.isArray(sourceService.unit_details)
        ? (sourceService.unit_details as any[])
        : [];
      // Preserve the "follow-up" identity when carrying the unit over so the
      // ad-hoc visit still shows the orange Follow-up styling everywhere.
      const wasFollowUp =
        (rowSnapshot && (rowSnapshot.source === "follow-up" || rowSnapshot.follow_up_needed === true)) ||
        false;
      const carriedDetail = rowSnapshot
        ? {
            ...rowSnapshot,
            unit_number: label,
            follow_up_needed: wasFollowUp ? true : rowSnapshot.follow_up_needed === true,
          }
        : (() => {
            const found = srcDetails.find(
              (d: any) => String(d?.unit_number || "").trim() === label,
            );
            return found
              ? { ...found, unit_number: label }
              : { unit_number: label };
          })();
      const nextDetails = [...detailsWithoutLabel, carriedDetail];
      const { error: addErr } = await supabase
        .from("portal_services")
        .update({ units_planned: nextPlanned, unit_details: nextDetails })
        .eq("id", adHocId);
      if (addErr) throw addErr;

      // 2) Dismiss the unit on the SOURCE upcoming service.
      setCompletionData((prev) => {
        const draft = prev[sourceService.id];
        if (!draft || !Array.isArray(draft.unitRows)) return prev;
        return {
          ...prev,
          [sourceService.id]: {
            ...draft,
            unitRows: draft.unitRows.filter(
              (r: any) => String(r?.unit_number || "").trim() !== label,
            ),
          },
        };
      });
      setRecentlyDismissedUnits((prev) => {
        const next = new Set(prev[sourceService.id] || []);
        next.add(label);
        return { ...prev, [sourceService.id]: next };
      });

      if (sourceService.isProjected || !sourceService.id || String(sourceService.id).startsWith("projected-")) {
        const mostRecent = pastServices[0];
        if (mostRecent?.id) {
          const existingRD =
            (mostRecent as any).report_data && typeof (mostRecent as any).report_data === "object"
              ? { ...((mostRecent as any).report_data as any) }
              : {};
          const rawFollow = Array.isArray(existingRD.dismissed_follow_ups)
            ? (existingRD.dismissed_follow_ups as any[])
            : [];
          const norm = rawFollow
            .map((e) =>
              typeof e === "string"
                ? { unit: String(e).trim(), at: "" }
                : e && typeof e === "object"
                  ? { unit: String((e as any).unit || "").trim(), at: String((e as any).at || "") }
                  : null,
            )
            .filter(Boolean) as { unit: string; at: string }[];
          const kept = norm.filter((e) => e.unit !== label);
          await supabase
            .from("portal_services")
            .update({
              report_data: {
                ...existingRD,
                dismissed_follow_ups: [...kept, { unit: label, at: new Date().toISOString() }],
              },
            })
            .eq("id", mostRecent.id);
        }
      } else {
        const existingReportData =
          (sourceService as any).report_data && typeof (sourceService as any).report_data === "object"
            ? { ...((sourceService as any).report_data as any) }
            : {};
        const rawDis = Array.isArray(existingReportData.dismissed_units)
          ? (existingReportData.dismissed_units as any[])
          : [];
        const norm = rawDis
          .map((entry) =>
            typeof entry === "string"
              ? { unit: String(entry).trim(), at: "" }
              : entry && typeof entry === "object"
                ? { unit: String((entry as any).unit || "").trim(), at: String((entry as any).at || "") }
                : null,
          )
          .filter(Boolean) as { unit: string; at: string }[];
        const kept = norm.filter((e) => e.unit !== label);
        const nextDismissed = [...kept, { unit: label, at: new Date().toISOString() }];
        const srcPlanned = Array.isArray(sourceService.units_planned)
          ? (sourceService.units_planned as string[]).map((u: string) => String(u).trim()).filter(Boolean)
          : [];
        await supabase
          .from("portal_services")
          .update({
            units_planned: srcPlanned.filter((u) => u !== label),
            unit_details: srcDetails.filter(
              (d: any) => String(d?.unit_number || "").trim() !== label,
            ),
            report_data: { ...existingReportData, dismissed_units: nextDismissed },
          })
          .eq("id", sourceService.id);
      }

      toast({
        title: `Moved ${label} to ad-hoc visit`,
        description: `Scheduled for ${target.service_date || "ad-hoc"}`,
      });
      onRefresh();
    } catch (err: any) {
      toast({
        title: "Could not move unit",
        description: err?.message || "Unknown error",
        variant: "destructive",
      });
    }
  };

  // Plan config (included units + overage $) — single read used everywhere below.
  const planCfg = readUnitPlanConfig(property.customer_preferences);

  // Sync calculated overage onto each service's report_data so it can be used
  // for invoicing / reporting later. Runs whenever the plan config or services
  // change. Only writes when the stored snapshot differs from the live calc,
  // and only for services that actually belong to this property.
  useEffect(() => {
    if (!planCfg.included_units) return;
    const tasks: Promise<any>[] = [];
    propServices.forEach(svc => {
      const isCompleted = svc.status === "completed";
      const totalUnits = isCompleted
        ? (Array.isArray(svc.unit_details) ? (svc.unit_details as any[]).length : 0)
        : (Array.isArray(svc.units_planned) ? (svc.units_planned as string[]).length : 0);
      const ov = computeOverage(totalUnits, planCfg);
      const stored = (svc as any).report_data?.overage || null;
      const snapshot = {
        included_units: ov.includedUnits,
        price_per_unit: ov.pricePerUnit,
        total_units: ov.totalUnits,
        units_over: ov.unitsOver,
        overage_cost: ov.overageCost,
      };
      const same =
        stored &&
        stored.included_units === snapshot.included_units &&
        stored.price_per_unit === snapshot.price_per_unit &&
        stored.total_units === snapshot.total_units &&
        stored.units_over === snapshot.units_over &&
        stored.overage_cost === snapshot.overage_cost;
      if (same) return;
      const merged = { ...((svc as any).report_data || {}), overage: snapshot };
      tasks.push(
        Promise.resolve(
          supabase.from("portal_services").update({ report_data: merged }).eq("id", svc.id)
        )
      );
    });
    // Fire-and-forget: no toast, no refresh — invoicing reads via report_data later.
    if (tasks.length > 0) Promise.allSettled(tasks);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planCfg.included_units, planCfg.overage_price_per_unit, propServices.length, property.id]);

  // Property-level service frequency toggle (stored in customer_preferences JSON)
  // Values: "weekly" (7), "bi-weekly" (14), "monthly" (30), "bi-monthly" (60). Defaults to bi-weekly.
  type FrequencyKey = "weekly" | "bi-weekly" | "monthly" | "8-weekly" | "bi-monthly" | "12-weekly" | "quarterly";
  const FREQUENCY_DAYS: Record<FrequencyKey, number> = {
    "weekly": 7,
    "bi-weekly": 14,
    "monthly": 30,
    "8-weekly": 56,
    "bi-monthly": 60,
    "12-weekly": 84,
    "quarterly": 90,
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
      // ONLY units the technician explicitly checked "Follow Up Needed" on.
      // Status alone never qualifies — the explicit checkbox must be set.
      .filter((u: any) => u.follow_up_needed === true && u.unit_number)
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

  // Back-fill `appointment_service` on legacy past services that were
  // completed before we started persisting the cadence visit label, so the
  // correct title is stored in the DB (and shows up in emails, exports, etc).
  // Runs once whenever the past list / cadence plan changes — safe to no-op.
  useEffect(() => {
    const cycleLen = propertyFrequency === "weekly" ? 4 : propertyFrequency === "bi-weekly" ? 2 : 1;
    if (cycleLen <= 1) return;
    const planArr = (cadencePlanDraft[propertyFrequency] || []) as string[];
    if (!planArr.some(p => (p || "").trim())) return;
    const updates: Array<{ id: string; appointment_service: string }> = [];
    pastServices.forEach((s, i) => {
      if ((s as any).appointment_service) return;
      const rotIdx = (pastServices.length - 1 - i) % cycleLen;
      const label = (planArr[rotIdx] || "").trim();
      if (label) updates.push({ id: s.id, appointment_service: label });
    });
    if (updates.length === 0) return;
    (async () => {
      try {
        await Promise.all(
          updates.map(u =>
            supabase.from("portal_services").update({ appointment_service: u.appointment_service }).eq("id", u.id)
          )
        );
      } catch (e) { console.warn("backfill appointment_service failed", e); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pastServices.length, propertyFrequency, JSON.stringify(cadencePlanDraft[propertyFrequency] || [])]);

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
    // Include ad-hoc completed visits so techs/PMs see them in the
    // "By Unit" timeline alongside regular cadence services.
    pastServicesForDisplay.forEach(s => {
      if (Array.isArray(s.unit_details)) {
        (s.unit_details as any[]).forEach(u => {
          const key = u.unit_number || "General";
          if (!map.has(key)) map.set(key, []);
          map.get(key)!.push({ service: s, unitDetail: u });
        });
      }
    });
    pastServicesForDisplay.filter(s => !s.unit_details || (Array.isArray(s.unit_details) && (s.unit_details as any[]).length === 0)).forEach(s => {
      if (!map.has("General")) map.set("General", []);
      map.get("General")!.push({ service: s, unitDetail: null });
    });
    return map;
  })();

  // ─── Inline unit editing for past services ───
  const updateUnitField = async (serviceId: string, unitIndex: number, field: string, value: any) => {
    const svc = propServices.find(s => s.id === serviceId);
    if (!svc) return;
    const details = Array.isArray(svc.unit_details) ? [...(svc.unit_details as any[])] : [];
    if (!details[unitIndex]) return;
    details[unitIndex] = { ...details[unitIndex], [field]: value };
    await supabase.from("portal_services").update({ unit_details: details }).eq("id", serviceId);
    onRefresh();
  };

  // Save service-level products_used (per service date — not per unit).
  // Debounced — every keystroke in the ProductUsageEditor calls this, so we
  // batch DB writes (~600ms) and skip onRefresh() between strokes (which
  // would otherwise race with typing and reset half-typed amounts). The
  // local override map keeps the editor reflecting the user's input
  // immediately, even before the parent's `services` prop has reloaded.
  const productsSaveTimers = useRef<Record<string, any>>({});
  const [productsOverride, setProductsOverride] = useState<Record<string, ProductUsage[]>>({});
  const updateServiceProducts = (serviceId: string, products: ProductUsage[]) => {
    setProductsOverride(prev => ({ ...prev, [serviceId]: products }));
    if (productsSaveTimers.current[serviceId]) clearTimeout(productsSaveTimers.current[serviceId]);
    productsSaveTimers.current[serviceId] = setTimeout(async () => {
      await supabase.from("portal_services").update({ products_used: products as any }).eq("id", serviceId);
      // Update the in-memory row so the UI reads the saved value on next
      // render without triggering a full refetch (which re-renders the
      // entire dashboard and can wipe in-flight keystrokes).
      const svc = (propServices as any[]).find(s => s.id === serviceId);
      if (svc) svc.products_used = products as any;
      // Only clear the override if it still matches the value we just
      // saved. If the user has typed MORE since this save fired, leave
      // the override alone — otherwise we'd snap the editor back to the
      // older saved value, which feels like a phantom backspace.
      setTimeout(() => {
        setProductsOverride(prev => {
          const cur = prev[serviceId];
          if (!cur) return prev;
          if (JSON.stringify(cur) !== JSON.stringify(products)) return prev;
          const next = { ...prev };
          delete next[serviceId];
          return next;
        });
      }, 200);
    }, 600);
  };

  // Save HOA "Visit Notes / Findings" — single combined editable field in the
  // HOA layout. We persist into `summary` and clear `findings` + `notes` so
  // the read-back (`s.summary || s.findings || s.notes`) shows exactly what
  // the admin typed without duplication.
  const updateServiceFindings = async (serviceId: string, value: string) => {
    const { error } = await supabase
      .from("portal_services")
      .update({ summary: value, findings: null, notes: null })
      .eq("id", serviceId);
    if (error) {
      toast({ title: "Technician findings did not save", description: error.message, variant: "destructive" });
      return;
    }
    const svc = (propServices as any[]).find(s => s.id === serviceId);
    if (svc) {
      svc.summary = value;
      svc.findings = null;
      svc.notes = null;
    }
  };

  const addUnitToService = async (serviceId: string) => {
    const svc = propServices.find(s => s.id === serviceId);
    if (!svc) return;
    // Guard against accidentally appending a blank/whitespace-only row.
    const unitLabel = String(newUnitData?.unit_number || "").trim();
    if (!unitLabel) {
      toast({ title: "Enter a unit / area name", variant: "destructive" });
      return;
    }
    const details = Array.isArray(svc.unit_details) ? [...(svc.unit_details as any[])] : [];
    details.push({ ...newUnitData, unit_number: unitLabel });
    await supabase.from("portal_services").update({ unit_details: details }).eq("id", serviceId);
    setNewUnitData({ unit_number: "", findings: "", pest_activity: "None", products_used: "", status: "Complete", notes: "", kind: "service" });
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

  const initCompletionData = (
    serviceId: string,
    displayUnits: string[],
    unitContexts?: import("@/lib/upcomingUnits").UpcomingUnitContext[],
  ) => {
    if (completionData[serviceId]) return; // already initialized

    // ── Hydrate from a previously-saved draft (so products, findings,
    //    and per-unit notes typed on an upcoming service survive a page
    //    refresh / navigation away and come back). The draft lives in
    //    `portal_services.report_data.completion_draft` and is updated
    //    automatically while the admin types. It's wiped on completion. ──
    const svcRow = propServices.find(s => s.id === serviceId) as any;
    const draft = svcRow?.report_data?.completion_draft;
    // Map of unit → context so we can detect (and strip) findings that were
    // carried over from the LAST visit by an old autosaved draft. Technician
    // findings must NEVER be prefilled on an upcoming service.
    const ctxFindingsByUnit = new Map<string, string>();
    (unitContexts || []).forEach(c => {
      const carried = String((c as any)?.findings || (c as any)?.last_unit_detail?.findings || "").trim();
      if (carried) ctxFindingsByUnit.set(String(c.unit_number || "").trim(), carried);
    });
    const scrubFindings = (unit: string, f: string): string => {
      const val = String(f || "").trim();
      if (!val) return "";
      const carried = ctxFindingsByUnit.get(String(unit || "").trim());
      return carried && val === carried ? "" : f;
    };
      if (draft && Array.isArray(draft.unitRows)) {
        const dismissed = new Set<string>();
        const dismissedRaw = Array.isArray((svcRow as any)?.report_data?.dismissed_units)
          ? (svcRow as any).report_data.dismissed_units as any[]
          : [];
        dismissedRaw.forEach((entry) => {
          const u = typeof entry === "string" ? entry : entry?.unit;
          const label = String(u || "").trim();
          if (label) dismissed.add(label);
        });
        const liveUnits = new Set((unitContexts || []).map(c => String(c.unit_number || "").trim()).filter(Boolean));
      setCompletionData(prev => ({
        ...prev,
        [serviceId]: {
          unitRows: draft.unitRows
            .filter((r: any) => {
              const label = String(r?.unit_number || "").trim();
              if (!label) return false;
              if (dismissed.has(label)) return false;
              return liveUnits.size === 0 || liveUnits.has(label);
            })
            .map((r: any) => ({
              unit_number: r.unit_number || "",
              target_pest: r.target_pest || "",
              findings: scrubFindings(r.unit_number || "", r.findings || ""),
              pest_activity: r.pest_activity || "None",
              products_used: normalizeUsageList(r.products_used) || [],
              status: r.status || "To Be Treated",
              notes: r.notes || "",
              source: r.source || "planned",
              request_id: r.request_id || r.request?.id || undefined,
              follow_up_needed: r.follow_up_needed === true,
              sanitization_concern: r.sanitization_concern === true,
              photos: Array.isArray(r.photos) ? r.photos : [],
            })),
          summary: draft.summary || "",
          findings: draft.findings || "",
          notes: draft.notes || "",
          technician: draft.technician || "",
          time_in: draft.time_in || "",
          time_out: draft.time_out || "",
          photos: Array.isArray(draft.photos) ? draft.photos : [],
          products: normalizeUsageList(draft.products) || [],
        },
      }));
      return;
    }

    // Prefer the unified contexts from computeUpcomingUnits — guarantees the
    // admin's pre-fill (source / target pest / findings) matches EXACTLY what
    // the PM portal shows for the same upcoming service.
    const ctxByUnit = new Map<string, import("@/lib/upcomingUnits").UpcomingUnitContext>();
    (unitContexts || []).forEach(c => ctxByUnit.set(String(c.unit_number), c));

    const sourceFromCtx = (unit: string, s: string | undefined): string => {
      if (s === "work_order") return "new-work-order";
      if (pendingRequests.some(r => String(r.unit_number) === String(unit))) return "new-work-order";
      // Only mark as follow-up if computeUpcomingUnits says the unit came
      // from an explicitly checked follow_up_needed flag. Planned / carried
      // units must NEVER be relabeled as follow-ups.
      if (s === "follow_up") return "follow-up";
      return "planned";
    };

    const rows = displayUnits.length > 0
      ? displayUnits.map(u => {
          const ctx = ctxByUnit.get(String(u));
          const fu = ctx?.follow_up;
          const lastDetail = ctx?.last_unit_detail;
          return {
            unit_number: u,
            target_pest: ctx?.target_pest || "",
            // Never prefill technician findings on an upcoming service — the
            // tech must enter fresh notes. Last-visit notes still show in the
            // read-only "Findings (from last visit)" block.
            findings: "",
            pest_activity: fu?.pest_activity || lastDetail?.pest_activity || "None",
            products_used: [] as ProductUsage[],
            status: "To Be Treated",
            notes: ctx?.notes || "",
            source: sourceFromCtx(u, ctx?.source),
            request_id: ctx?.request?.id,
          };
        })
      : [{ unit_number: "", target_pest: "", findings: "", pest_activity: "None", products_used: [] as ProductUsage[], status: "To Be Treated", notes: "", source: "new-work-order" }];
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

  const ensureCompletionDraft = (
    service: PortalService | any,
    unitContexts: import("@/lib/upcomingUnits").UpcomingUnitContext[] = [],
  ): CompletionDraft => {
    const existing = completionDataRef.current[service.id];
    if (existing) return existing;
    const units = unitContexts.map(c => String(c.unit_number || "").trim()).filter(Boolean);
    const rows = units.length > 0
      ? units.map((u) => {
          const ctx = unitContexts.find(c => String(c.unit_number || "").trim() === u);
          return {
            unit_number: u,
            target_pest: ctx?.target_pest || "",
            findings: "",
            pest_activity: ctx?.follow_up?.pest_activity || ctx?.last_unit_detail?.pest_activity || "None",
            products_used: [] as ProductUsage[],
            status: "To Be Treated",
            notes: ctx?.notes || "",
            source: ctx?.source === "work_order" ? "new-work-order" : ctx?.source === "follow_up" ? "follow-up" : "planned",
            request_id: ctx?.request?.id,
          };
        })
      : [{ unit_number: "", target_pest: "", findings: "", pest_activity: "None", products_used: [] as ProductUsage[], status: "To Be Treated", notes: "", source: "planned" }];
    const draft = {
      unitRows: rows,
      summary: service.summary || "",
      // Never prefill technician findings/notes on an upcoming service.
      findings: "",
      notes: "",
      technician: service.technician || "",
      time_in: "",
      time_out: "",
      photos: [],
      products: normalizeUsageList(service.products_used) || [],
    };
    completionDataRef.current = { ...completionDataRef.current, [service.id]: draft };
    setCompletionData(prev => ({ ...prev, [service.id]: draft }));
    return draft;
  };

  const patchCompletionDraft = (serviceId: string, patch: Partial<CompletionDraft>) => {
    const current = completionDataRef.current[serviceId];
    if (!current) return;
    const next = { ...current, ...patch };
    completionDataRef.current = { ...completionDataRef.current, [serviceId]: next };
    setCompletionData(prev => ({ ...prev, [serviceId]: { ...(prev[serviceId] || current), ...patch } }));
  };

  const completeService = async (
    serviceId: string,
    service?: PortalService | any,
    unitContexts: import("@/lib/upcomingUnits").UpcomingUnitContext[] = [],
  ) => {
    const serviceForDraft = service || propServices.find(p => p.id === serviceId);
    const data = completionDataRef.current[serviceId] || (serviceForDraft ? ensureCompletionDraft(serviceForDraft, unitContexts) : undefined);
    const unitRows = (data?.unitRows?.filter(r => r.unit_number) || []).map((r: any) => {
      // When a tech completes a visit, any unit still flagged "To Be Treated"
      // should be promoted to its completed equivalent so the customer-facing
      // report and email don't show "To Be Treated" / "Not Treated" badges
      // for work that was actually performed.
      const kind = (r.kind || "service");
      const status = promoteStatusOnCompletion(r.status, kind);
      return {
        ...r,
        status,
        // Explicitly coerce the two follow-up booleans so they NEVER drop out
        // of the persisted payload due to type-stripping or undefined values.
        follow_up_needed: r.follow_up_needed === true,
        sanitization_concern: r.sanitization_concern === true,
        // Persist any per-unit photos uploaded during completion (strip uploading flags)
        photos: Array.isArray(r.photos)
          ? r.photos.filter((p: any) => p?.url && !p?.uploading).map((p: any) => ({ url: p.url }))
          : undefined,
      };
    });
    // ONLY auto-add a follow-up when the technician explicitly checked
    // "Follow Up Needed" on the unit. Status alone (e.g. "Activity Found")
    // is NOT enough — the user must check the box.
    const flagged = unitRows.filter((r: any) => r.follow_up_needed === true).map((r: any) => r.unit_number);
    const followUpNotes = flagged.length > 0
      ? `Follow-up units from ${today}: ${flagged.join(", ")}`
      : null;

    // Build service_time string from time_in / time_out if provided
    const serviceTime = data?.time_in && data?.time_out
      ? `${data.time_in} - ${data.time_out}`
      : data?.time_in || data?.time_out || null;

    // Service-level products (entered once per service date — not per unit)
    const aggregatedProducts = data?.products || [];

    // Persist photo URLs (strip uploading flags)
    const photosToSave = (data?.photos || []).filter(p => !p.uploading && p.url).map(p => ({ url: p.url }));

    // Compute the cadence-rotation visit label for this completion so the
    // past service preserves the correct title (e.g. "1st Weekly Visit
    // (Focus on Zone #A)") instead of falling back to the generic
    // "General Pest Service". Falls back to whatever was already saved on
    // the row, then to the rotation, then to nothing.
    const svcRow = propServices.find(p => p.id === serviceId);
    let appointmentLabel: string | null = (svcRow as any)?.appointment_service || null;
    if (!appointmentLabel && (propertyFrequency === "weekly" || propertyFrequency === "bi-weekly")) {
      // pastServices already excludes this service (status was scheduled),
      // so its length is the correct rotation index for THIS completion.
      const label = getCadenceVisitLabel(pastServices.length, cadencePlanDraft[propertyFrequency]);
      if (label) appointmentLabel = label;
    }

    // Strip the autosaved completion_draft now that the real fields are
    // being persisted — it has served its purpose.
    const svcRowForDraft = propServices.find(p => p.id === serviceId) as any;
    const existingReport =
      svcRowForDraft?.report_data && typeof svcRowForDraft.report_data === "object"
        ? { ...svcRowForDraft.report_data }
        : {};
    delete (existingReport as any).completion_draft;

    // ─── Snapshot every open submission (Community Pest Sightings AND
    //     Service Requests) onto THIS completed visit so they stay attached
    //     to the past service that addressed them. Re-query here instead of
    //     trusting component state so a sighting submitted moments before
    //     completion cannot be missed by stale `pendingRequests`. ───
    let addressedCommunitySightings: any[] = [];
    let addressedServiceRequests: any[] = [];
    try {
      const { data: latestRequests } = await supabase
        .from("portal_requests")
        .select("*")
        .eq("property_id", property.id)
        .in("status", ["pending", "in_progress"])
        .order("created_at", { ascending: false });
      const openRequests = ((latestRequests || pendingRequests) as any[]).filter((r) => {
        if (!r) return false;
        return r.status !== "resolved" && r.status !== "completed";
      });
      const completedUnitRequestIds = new Set(
        unitRows
          .map((r: any) => r.request_id || r.request?.id)
          .filter(Boolean)
      );
      addressedCommunitySightings = openRequests.filter(isCommunityPestSighting).map(toAddressedRequestSnapshot);
      addressedServiceRequests = openRequests
        .filter((r) => !isCommunityPestSighting(r))
        .filter((r) => {
          if (completedUnitRequestIds.has(r.id)) return true;
          const requestUnit = String(r.unit_number || "").trim();
          if (!requestUnit) return true;
          return unitRows.some((u: any) => String(u.unit_number || "").trim() === requestUnit);
        })
        .map(toAddressedRequestSnapshot);
      (existingReport as any).community_sightings_addressed = addressedCommunitySightings;
      (existingReport as any).service_requests_addressed = addressedServiceRequests;
    } catch (e) {
      console.warn("snapshot open requests failed", e);
    }

    const { error: completeErr } = await supabase.from("portal_services").update({
      status: "completed",
      // Preserve any existing service_date the tech set; only fall back to
      // today when the row truly has no date yet. Completing a service must
      // NEVER overwrite a date that's already on the record.
      service_date: (svcRow as any)?.service_date || today,
      service_time: serviceTime,
      unit_details: unitRows as any,
      summary: data?.summary || null,
      findings: data?.findings || null,
      notes: data?.notes || null,
      technician: data?.technician || null,
      products_used: aggregatedProducts as any,
      photos: photosToSave,
      follow_up_recommended: flagged.length > 0,
      follow_up_notes: followUpNotes,
      appointment_service: appointmentLabel,
      report_data: existingReport,
    }).eq("id", serviceId);
    if (completeErr) {
      toast({ title: "Could not complete service", description: completeErr.message, variant: "destructive" });
      setCompletingServiceId(null);
      return;
    }
    // Forget the local "last serialized" snapshot so a re-open of this
    // service id (rare) doesn't think there's nothing to save.
    delete completionDraftLast.current[serviceId];

    // ─── Close any open work-order requests for the units we just treated ───
    // Without this, a pending request keeps bleeding into the NEXT upcoming
    // service via computeUpcomingUnits, which is why a unit can appear on
    // both the just-completed service AND the next upcoming one.
    try {
      const treatedUnits = Array.from(
        new Set(unitRows.map((r: any) => String(r.unit_number || "").trim()).filter(Boolean))
      );
      if (treatedUnits.length > 0) {
        const { data: openUnitRequests } = await supabase
          .from("portal_requests")
          .select("id, unit_number")
          .eq("property_id", property.id)
          .in("status", ["pending", "in_progress"]);
        const treatedSet = new Set(treatedUnits.map(u => u.toLowerCase()));
        const requestIds = (openUnitRequests || [])
          .filter((r: any) => treatedSet.has(String(r.unit_number || "").trim().toLowerCase()))
          .map((r: any) => r.id)
          .filter(Boolean);
        if (requestIds.length > 0) {
          await supabase
            .from("portal_requests")
            .update({ status: "completed", updated_at: new Date().toISOString() } as any)
            .in("id", requestIds);
        }
      }
      // Also auto-close any open GENERAL requests (work orders without a
      // unit_number, e.g. "front gate is broken"). Without this they would
      // bleed into EVERY following upcoming service forever, which is what
      // makes general requests appear on multiple services in a row.
      // A general request shown on a completed visit is considered handled.
      // Match the same predicate as isGeneralRequest(): request_type contains
      // "general" OR (no unit_number AND description tagged [GENERAL]).
      await supabase
        .from("portal_requests")
        .update({ status: "completed", updated_at: new Date().toISOString() } as any)
        .eq("property_id", property.id)
        .in("status", ["pending", "in_progress"])
        .or("request_type.ilike.%general%,description.ilike.%[GENERAL]%");
    } catch (e) {
      console.warn("auto-resolve work orders failed", e);
    }

    // ─── If an ad-hoc/follow-up visit cleared a unit, remove that unit from
    //     any future scheduled visit and suppress the old follow-up flag so it
    //     cannot keep reappearing as "Upcoming" after a Free and Clear. ───
    try {
      const settledUnits = Array.from(new Set(
        unitRows
          .filter((r: any) => {
            const status = String(r.status || "").trim();
            if (r.follow_up_needed === true) return false;
            if (!String(r.unit_number || "").trim()) return false;
            return !["To Be Treated", "Not Treated", "Inspection: Not Performed", "Not Serviced"].includes(status);
          })
          .map((r: any) => String(r.unit_number || "").trim())
      ));
      if (settledUnits.length > 0) {
        const settledLower = new Set(settledUnits.map(u => u.toLowerCase()));
        const stamp = new Date().toISOString();
        const futureRows = propServices.filter((svc: any) =>
          svc.id !== serviceId &&
          svc.status !== "completed" &&
          !isAdHocService(svc) &&
          Array.isArray(svc.units_planned) &&
          (svc.units_planned as any[]).some(u => settledLower.has(String(u || "").trim().toLowerCase()))
        );
        await Promise.all(futureRows.map(async (svc: any) => {
          const nextPlanned = (svc.units_planned as any[])
            .map(u => String(u || "").trim())
            .filter(u => u && !settledLower.has(u.toLowerCase()));
          const rd = svc.report_data && typeof svc.report_data === "object" ? { ...svc.report_data } : {};
          const existingDismissed = Array.isArray(rd.dismissed_units) ? rd.dismissed_units : [];
          const normalized = existingDismissed
            .map((entry: any) => {
              const unit = String((typeof entry === "string" ? entry : entry?.unit) || "").trim();
              return unit ? { unit, at: String(typeof entry === "string" ? "" : entry?.at || "") } : null;
            })
            .filter(Boolean) as { unit: string; at: string }[];
          const kept = normalized.filter(e => !settledLower.has(e.unit.toLowerCase()));
          rd.dismissed_units = [...kept, ...settledUnits.map(unit => ({ unit, at: stamp }))];
          if (rd.completion_draft && Array.isArray(rd.completion_draft.unitRows)) {
            rd.completion_draft = {
              ...rd.completion_draft,
              unitRows: rd.completion_draft.unitRows.filter((r: any) =>
                !settledLower.has(String(r?.unit_number || "").trim().toLowerCase())
              ),
            };
          }
          return supabase.from("portal_services").update({ units_planned: nextPlanned, report_data: rd }).eq("id", svc.id);
        }));

        const priorFollowUpRows = pastServices.filter((svc: any) =>
          svc.id !== serviceId &&
          Array.isArray(svc.unit_details) &&
          (svc.unit_details as any[]).some((u: any) =>
            u?.follow_up_needed === true && settledLower.has(String(u?.unit_number || "").trim().toLowerCase())
          )
        );
        await Promise.all(priorFollowUpRows.map(async (svc: any) => {
          const rd = svc.report_data && typeof svc.report_data === "object" ? { ...svc.report_data } : {};
          const existingDismissed = Array.isArray(rd.dismissed_follow_ups) ? rd.dismissed_follow_ups : [];
          const normalized = existingDismissed
            .map((entry: any) => {
              const unit = String((typeof entry === "string" ? entry : entry?.unit) || "").trim();
              return unit ? { unit, at: String(typeof entry === "string" ? "" : entry?.at || "") } : null;
            })
            .filter(Boolean) as { unit: string; at: string }[];
          const kept = normalized.filter(e => !settledLower.has(e.unit.toLowerCase()));
          rd.dismissed_follow_ups = [...kept, ...settledUnits.map(unit => ({ unit, at: stamp }))];
          return supabase.from("portal_services").update({ report_data: rd }).eq("id", svc.id);
        }));
      }
    } catch (e) {
      console.warn("clear settled units from future services failed", e);
    }

    // ─── Resolve every open submission we just snapshotted (community +
    //     service requests) so they stop bleeding into the next upcoming
    //     visit. They live on the past service from now on. ───
    try {
      // Build the set of units that still need follow-up after this visit.
      // Any work order tied to one of those units must STAY open — the unit
      // isn't actually free & clear yet. Only resolve when a completed visit
      // leaves the unit with no follow_up_needed flag.
      const stillFollowingUp = new Set(
        (flagged || [])
          .map((u: any) => String(u || "").trim().toLowerCase())
          .filter(Boolean)
      );
      const keepOpenForFollowUp = (req: any) => {
        const unit = String(req?.unit_number || "").trim().toLowerCase();
        return unit && stillFollowingUp.has(unit);
      };
      const allIds = [
        ...addressedCommunitySightings
          .filter((s) => !keepOpenForFollowUp(s))
          .map((s) => s.id),
        ...addressedServiceRequests
          .filter((s) => !keepOpenForFollowUp(s))
          .map((s) => s.id),
      ].filter(Boolean);
      if (allIds.length > 0) {
        await supabase
          .from("portal_requests")
          .update({ status: "resolved", updated_at: new Date().toISOString() } as any)
          .in("id", allIds);
        setPendingRequests(prev => prev.filter((r: any) => !allIds.includes(r.id)));
      }
    } catch (e) {
      console.warn("resolve open requests failed", e);
    }

    // ─── Dedupe: delete any OTHER scheduled service rows for this property
    //     dated today (or earlier) so the just-completed visit can never
    //     keep showing up in the Upcoming Services list. Without this,
    //     duplicate "scheduled" rows (created via Quick Add, projection
    //     hydration, or earlier auto-creates) survive completion and the
    //     finished visit appears in BOTH Past + Upcoming. ────────────────
    try {
      // Only dedupe sibling scheduled rows for the SAME date as the just-
      // completed visit. Older logic deleted everything <= today which would
      // wipe out manually-added appointments dated for earlier today. We also
      // skip any row tagged `manually_added` so admin-entered visits always
      // survive.
      const { data: sameDay } = await supabase
        .from("portal_services")
        .select("id, report_data")
        .eq("property_id", property.id)
        .eq("status", "scheduled")
        .eq("service_date", today)
        .neq("id", serviceId);
      const idsToDelete = (sameDay || [])
        .filter((r: any) => !(r?.report_data && r.report_data.manually_added === true))
        .map((r: any) => r.id);
      if (idsToDelete.length > 0) {
        await supabase.from("portal_services").delete().in("id", idsToDelete);
      }
    } catch (e) {
      console.warn("dedupe scheduled services failed", e);
    }

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
          special_notes: followUpNotes,
        });
      }
    }
    setCompletionData(prev => { const n = { ...prev }; delete n[serviceId]; return n; });
    setCompletingServiceId(null);
    setFollowUpUnits([]);
    toast({ title: "Service completed", description: "Moved to Previous Services." });
    setActiveTab("past");
    // Refresh parent state immediately so the just-completed service drops
    // out of the Upcoming Services list without waiting for the realtime
    // subscription to round-trip.
    onRefresh();

    // ─── Email the property manager / client contact a completion summary ───
    // Best-effort: failures here must not block the completion itself.
    try {
      const { data: client } = await supabase
        .from("portal_clients")
        .select("name, email")
        .eq("id", clientId)
        .maybeSingle();
      // PRIMARY recipient is the PROPERTY-LEVEL Point of Contact email
      // (set on the property profile). Only fall back to the client-level
      // email if no property POC has been configured. This prevents
      // completion notes from blasting out to the wrong person when one
      // client owns multiple properties with different on-site contacts.
      const pocEmailRaw = (property.customer_preferences as any)?.point_of_contact?.email;
      const pocEmail = typeof pocEmailRaw === "string" && pocEmailRaw.trim().includes("@")
        ? pocEmailRaw.trim()
        : null;
      const recipient = pocEmail || (client as any)?.email || null;
      // Guard against duplicate sends — if we've already emailed the PM for
      // this exact service, skip the send (but still let the user know).
      const svcRow = propServices.find(s => s.id === serviceId);
      const alreadySentAt = (svcRow as any)?.report_data?.pm_email_sent_at as string | undefined;
      if (recipient && alreadySentAt) {
        toast({
          title: "PM already emailed",
          description: `Skipped duplicate send (originally sent ${new Date(alreadySentAt).toLocaleString()}).`,
        });
      } else if (recipient) {
        // Prefer the property-scoped PM link; fall back to any active link.
        const propertyLink =
          links.find(l => l.link_type === "sub" && Array.isArray(l.assigned_property_ids) && (l.assigned_property_ids as string[]).includes(property.id))
          || links.find(l => l.is_active);
        const portalUrl = propertyLink
          ? `${window.location.origin}/pm/${propertyLink.token}`
          : window.location.origin;

        const svc = propServices.find(s => s.id === serviceId);
        const unitsCount = Array.isArray(unitRows) ? unitRows.length : 0;
        const summary = [data?.summary, data?.findings, data?.notes].filter(Boolean).join("\n\n");

        // Enrich each product with EPA # and dilution math for liability documentation
        const { findEpaNumber, computeDilution } = await import("@/lib/productCatalog");
        const enrichedProducts = (aggregatedProducts as any[]).map((p: any) => {
          const dil = computeDilution(p);
          return {
            ...p,
            epa: findEpaNumber(p.name) || null,
            dilution_rate_pct: dil.ratePct ?? null,
            mix_ratio_per_gal: dil.mixRatioPerGal ?? null,
            mix_ratio_unit: dil.mixRatioUnit ?? null,
          };
        });

        await supabase.functions.invoke("send-service-completed", {
          body: {
            to: recipient,
            propertyName: property.name,
            clientName: (client as any)?.name || clientName || "",
            serviceType: svc?.service_type || "",
            serviceDate: today,
            technician: data?.technician || svc?.technician || "",
            summary,
            unitsCount,
            productsList: enrichedProducts,
            // Full per-unit details so the PM never needs to click into the
            // portal — the email itself contains everything that happened.
            unitDetails: unitRows,
            // Service-level technician findings/notes (kept separate from
            // the summary so the email can render them as their own blocks).
            findings: data?.findings || "",
            notes: data?.notes || "",
            // Service-level photos uploaded during completion.
            photos: photosToSave,
            timeIn: data?.time_in || null,
            timeOut: data?.time_out || null,
            portalUrl,
          },
        });
        // Stamp the service so we don't email the PM again if Complete is
        // re-clicked. Stored inside report_data (JSON) to avoid a migration.
        try {
          const mergedRd = {
            ...((svcRow as any)?.report_data || {}),
            pm_email_sent_at: new Date().toISOString(),
            pm_email_recipient: recipient,
          };
          await supabase
            .from("portal_services")
            .update({ report_data: mergedRd })
            .eq("id", serviceId);
        } catch (err) {
          console.warn("could not stamp pm_email_sent_at", err);
        }
        toast({ title: "Completion email sent", description: `Sent to ${recipient}` });
      }
    } catch (e) {
      console.warn("send-service-completed failed", e);
    }

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

  // ─── Per-unit photo upload (saved unit_details rows) ───
  const uploadUnitPhoto = async (serviceId: string, unitIndex: number, file: File) => {
    const key = `${serviceId}:${unitIndex}`;
    setUploadingUnitPhotoFor(key);
    try {
      const { compressImage, inferImageUploadMeta } = await import("@/lib/imageUpload");
      const { blob } = await compressImage(file, { maxWidth: 1600, maxHeight: 1600, quality: 0.8 });
      const meta = inferImageUploadMeta(file);
      const path = `service-photos/${serviceId}/unit-${unitIndex}-${Date.now()}.${meta.ext}`;
      const { error } = await supabase.storage.from("report-images").upload(path, blob, {
        contentType: meta.contentType, upsert: false,
      });
      if (error) throw error;
      const { data: pub } = supabase.storage.from("report-images").getPublicUrl(path);
      const svc = propServices.find(s => s.id === serviceId);
      const details = Array.isArray(svc?.unit_details) ? [...(svc!.unit_details as any[])] : [];
      if (details[unitIndex]) {
        const existing = Array.isArray(details[unitIndex].photos) ? details[unitIndex].photos : [];
        details[unitIndex] = { ...details[unitIndex], photos: [...existing, { url: pub.publicUrl }] };
        await supabase.from("portal_services").update({ unit_details: details }).eq("id", serviceId);
        onRefresh();
      }
      toast({ title: "Photo added to unit", duration: 1500 });
    } catch (e: any) {
      toast({ title: "Upload failed", description: e?.message || "Try again", variant: "destructive" });
    } finally {
      setUploadingUnitPhotoFor(null);
    }
  };

  const removeUnitPhoto = async (serviceId: string, unitIndex: number, photoIdx: number) => {
    const svc = propServices.find(s => s.id === serviceId);
    const details = Array.isArray(svc?.unit_details) ? [...(svc!.unit_details as any[])] : [];
    if (!details[unitIndex]) return;
    const photos = Array.isArray(details[unitIndex].photos) ? [...details[unitIndex].photos] : [];
    photos.splice(photoIdx, 1);
    details[unitIndex] = { ...details[unitIndex], photos };
    await supabase.from("portal_services").update({ unit_details: details }).eq("id", serviceId);
    onRefresh();
  };

  // ─── Per-unit photo upload (in-progress completion form rows) ───
  const uploadCompletionUnitPhoto = async (serviceId: string, rowIdx: number, file: File) => {
    const key = `${serviceId}:${rowIdx}`;
    setUploadingCompletionUnitPhotoFor(key);
    try {
      const { compressImage, inferImageUploadMeta } = await import("@/lib/imageUpload");
      const { blob } = await compressImage(file, { maxWidth: 1600, maxHeight: 1600, quality: 0.8 });
      const meta = inferImageUploadMeta(file);
      const path = `service-photos/${serviceId}/unit-row-${rowIdx}-${Date.now()}.${meta.ext}`;
      const { error } = await supabase.storage.from("report-images").upload(path, blob, {
        contentType: meta.contentType, upsert: false,
      });
      if (error) throw error;
      const { data: pub } = supabase.storage.from("report-images").getPublicUrl(path);
      setCompletionData(prev => {
        const cur = prev[serviceId];
        if (!cur) return prev;
        const rows = [...cur.unitRows];
        const existing = Array.isArray((rows[rowIdx] as any).photos) ? (rows[rowIdx] as any).photos : [];
        rows[rowIdx] = { ...(rows[rowIdx] as any), photos: [...existing, { url: pub.publicUrl }] } as any;
        return { ...prev, [serviceId]: { ...cur, unitRows: rows } };
      });
      toast({ title: "Photo added", duration: 1200 });
    } catch (e: any) {
      toast({ title: "Upload failed", description: e?.message || "Try again", variant: "destructive" });
    } finally {
      setUploadingCompletionUnitPhotoFor(null);
    }
  };

  const removeCompletionUnitPhoto = (serviceId: string, rowIdx: number, photoIdx: number) => {
    setCompletionData(prev => {
      const cur = prev[serviceId];
      if (!cur) return prev;
      const rows = [...cur.unitRows];
      const photos = Array.isArray((rows[rowIdx] as any).photos) ? [...(rows[rowIdx] as any).photos] : [];
      photos.splice(photoIdx, 1);
      rows[rowIdx] = { ...(rows[rowIdx] as any), photos } as any;
      return { ...prev, [serviceId]: { ...cur, unitRows: rows } };
    });
  };

  const submitWorkOrder = async () => {
    const isGeneral = workOrder.request_type === "general";
    if (isGeneral) {
      if (!workOrder.comments.trim()) return;
    } else if (!workOrder.unit_number && !workOrder.comments) return;
    setSubmittingWorkOrder(true);
    // Strip leading "Unit " / "Apt " / "#" prefixes so we don't end up with
    // "Unit Unit 5" when the user types "Unit 5" in a portal that already
    // prepends the word "Unit" everywhere it displays the number.
    const stripUnitPrefix = (s: string) =>
      s.replace(/^\s*(unit|apt\.?|apartment|#)\s+/i, "").trim();
    const typed = stripUnitPrefix((workOrder.unit_number || "").trim());
    const canonical = isGeneral
      ? null
      : (typed
      ? (allUnits.find(u => u.toLowerCase() === typed.toLowerCase()) || typed)
      : "Facility");
    // HOA mode: prepend the homeowner contact info to the description so it's
    // visible everywhere the work order is rendered (no schema change needed).
    const customerHeader = isHOA && (workOrder.customer_name.trim() || workOrder.customer_phone.trim() || workOrder.tenant_email.trim())
      ? `Customer: ${[
          workOrder.customer_name.trim() || "—",
          workOrder.customer_phone.trim() ? `📞 ${workOrder.customer_phone.trim()}` : null,
          workOrder.tenant_email.trim() ? `✉ ${workOrder.tenant_email.trim()}` : null,
        ].filter(Boolean).join(" • ")}\n`
      : "";
    // HOA mode: tenant_email is the homeowner's email (always saved when present),
    // not gated behind the legacy "email tenant?" checkbox.
    const tenantEmailToSave = isHOA
      ? (workOrder.tenant_email.trim() || null)
      : (workOrder.email_tenant ? (workOrder.tenant_email.trim() || null) : null);
    const { data: inserted, error: insertErr } = await supabase.from("portal_requests").insert({
      property_id: property.id,
      unit_number: canonical,
      request_type: isGeneral
        ? "General Request"
        : workOrder.request_type === "inspection" ? "Inspection Request" : "Service Request",
      description: isGeneral
        ? `${customerHeader}[GENERAL] ${workOrder.comments.trim()}`
        : `${customerHeader}[${workOrder.request_type === "inspection" ? "INSPECTION" : "TREATMENT"}] ${workOrder.pest_type || "General"}${workOrder.location_type ? ` - ${workOrder.location_type}` : ""}${workOrder.comments ? ` - ${workOrder.comments}` : ""}`,
      pest_type: isGeneral ? null : (workOrder.pest_type || null),
      location_type: isGeneral ? null : (workOrder.location_type || null),
      occupancy_status: isGeneral ? null : (workOrder.occupancy_status || null),
      tenant_email: tenantEmailToSave,
      prep_sheet_id: workOrder.email_tenant && workOrder.prep_sheet_id ? workOrder.prep_sheet_id : null,
      right_to_treat_requested: workOrder.email_tenant ? workOrder.right_to_treat : false,
      photos: workOrderPhotos,
    } as any).select("id").maybeSingle();
    if (insertErr) {
      toast({ title: "Could not submit work order", description: insertErr.message, variant: "destructive" });
      setSubmittingWorkOrder(false);
      return;
    }
    // Persist the optional move-in date onto the property's tenant_move_ins
    // map so the 🏠 New Tenant tag shows up on this unit everywhere.
    if (!isGeneral && canonical && workOrder.tenant_move_in_date) {
      try {
        const prefs: any = property.customer_preferences || {};
        const map = { ...(prefs.tenant_move_ins || {}) };
        map[String(canonical).trim()] = workOrder.tenant_move_in_date;
        const updatedPrefs = { ...prefs, tenant_move_ins: map };
        await supabase
          .from("portal_properties")
          .update({ customer_preferences: updatedPrefs })
          .eq("id", property.id);
        (property as any).customer_preferences = updatedPrefs;
      } catch (e) {
        console.error("save tenant_move_in failed", e);
      }
    }
    // Mirror the work order's Occupied/Vacant pick into the property's
    // unit_occupancy map so the per-unit toggle on Areas Treated stays in
    // lock-step with the work order. Clearing the field on the WO clears the
    // unit's badge here too.
    if (!isGeneral && canonical) {
      try {
        const prefs: any = property.customer_preferences || {};
        const occMap = { ...((prefs.unit_occupancy || {}) as Record<string, string>) };
        const key = String(canonical).trim();
        if (workOrder.occupancy_status) occMap[key] = workOrder.occupancy_status;
        else delete occMap[key];
        const updatedPrefs = { ...prefs, unit_occupancy: occMap };
        await supabase
          .from("portal_properties")
          .update({ customer_preferences: updatedPrefs })
          .eq("id", property.id);
        (property as any).customer_preferences = updatedPrefs;
      } catch (e) {
        console.error("save unit_occupancy failed", e);
      }
    }
    toast({ title: isGeneral
      ? "General request submitted"
      : workOrder.request_type === "inspection" ? "Inspection request submitted" : "Work order submitted" });
    // Fire-and-forget staff notification (office + Carmen + client owner)
    if (inserted?.id) {
      try {
        await supabase.functions.invoke("notify-submission", {
          body: { kind: "work_order", requestId: inserted.id },
        });
      } catch (e) { console.error("notify-submission failed", e); }
    }
    // Fire-and-forget tenant email
    if (workOrder.email_tenant && workOrder.tenant_email.trim() && inserted?.id) {
      try {
        await supabase.functions.invoke("send-tenant-work-order", {
          body: { requestId: inserted.id, appBaseUrl: window.location.origin },
        });
        toast({ title: "Tenant notified", description: `Email sent to ${workOrder.tenant_email.trim()}` });
      } catch (e) {
        console.error("send-tenant-work-order failed", e);
        toast({ title: `${ResidentTerm} email failed`, description: "Work order saved, but email could not be sent.", variant: "destructive" });
      }
    }
    setWorkOrder({
      unit_number: "", pest_type: "", location_type: "", comments: "",
      request_type: "", occupancy_status: "",
      email_tenant: false, tenant_email: "", prep_sheet_id: "", right_to_treat: false,
      customer_name: "", customer_phone: "",
      tenant_move_in_date: "",
    });
    setWorkOrderPhotos([]);
    // Refresh requests
    const { data: reqs } = await supabase.from("portal_requests").select("*").eq("property_id", property.id).in("status", ["pending", "in_progress"]).order("created_at", { ascending: false });
    if (reqs) setPendingRequests(reqs);
    setSubmittingWorkOrder(false);
    onRefresh();
  };

  const quickAddService = async () => {
    if (!addingServiceDate) return;
    // Persist the manually added appointment as its OWN standalone row.
    // We tag it `manually_added: true` in report_data so the dedupe pass in
    // completeService never wipes it out — manual entries are first-class
    // and must survive any nearby completions.
    const { data: inserted, error } = await supabase
      .from("portal_services")
      .insert({
        property_id: property.id,
        service_type: addingServiceType,
        service_date: addingServiceDate,
        status: "scheduled",
        units_planned: allUnits,
        frequency_days: SERVICE_FREQUENCY_MAP[addingServiceType] || 30,
        report_data: { manually_added: true } as any,
      } as any)
      .select("id")
      .single();
    if (error) {
      toast({ title: "Failed to add service", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Service added", description: `Saved for ${formatDate(addingServiceDate)}` });
    setShowQuickAdd(false);
    setAddingServiceDate("");
    onRefresh();
  };

  /**
   * Insert a STANDALONE ad-hoc visit. Tagged `is_ad_hoc:true` so it lives in
   * its own bubble — never advances cadence, never inherits follow-ups, and
   * never appears as the property's "next service". units_planned is left
   * empty so the visit doesn't pull units forward from prior services.
   */
  const addAdHocVisit = async () => {
    if (!adHocDate) return;
    const { error } = await supabase
      .from("portal_services")
      .insert({
        property_id: property.id,
        service_type: adHocType,
        service_date: adHocDate,
        status: "scheduled",
        units_planned: [],
        frequency_days: null,
        notes: adHocNote || null,
        report_data: { is_ad_hoc: true, manually_added: true } as any,
      } as any);
    if (error) {
      toast({ title: "Failed to add ad-hoc visit", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Ad-hoc visit added", description: `Scheduled for ${formatDate(adHocDate)}` });
    setShowAdHocAdd(false);
    setAdHocDate("");
    setAdHocNote("");
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
        // Mutate local prop so ReadOnlyMapCanvas reflects the new emblems
        // immediately when the user clicks Done — without this, the saved
        // data only appears after a full parent refresh.
        (property as any).map_data = parsed;
      }
    } catch (e: any) {
      toast({ title: "Failed to save map", description: e?.message, variant: "destructive" });
    } finally {
      setSavingMap(false);
    }
  };

  /**
   * HOA per-service map persistence.
   *
   * The PERMANENT site map (with emblems shared across every visit) lives on
   * `portal_properties.map_data` and is edited from the Site Map / Plan page.
   * Per-service drawings/edits live on `portal_services.report_data.service_map_data`
   * — they show up ONLY for that one service and never bleed into the next visit.
   */
  /**
   * Convert an in-memory "projected-N" service into a real DB row using the
   * projected service_date already shown on screen. Returns the new id, or
   * null on failure. Lets the user save photos / map edits / office notes
   * BEFORE explicitly clicking "Schedule" — we just lock in the projection's
   * date so the row exists in the database.
   */
  const materializeProjected = async (serviceId: string): Promise<string | null> => {
    const svc = (allUpcoming as any[]).find((s) => s.id === serviceId)
      || (propServices as any[]).find((s) => s.id === serviceId);
    if (!svc) return null;
    if (!svc.service_date) {
      toast({
        title: "Couldn't auto-schedule this visit",
        description: "Pick a date and try again.",
        variant: "destructive",
      });
      return null;
    }
    try {
      const inProgress = completionDataRef.current?.[serviceId];
      const carriedUnitDetails = Array.isArray(inProgress?.unitRows)
        ? inProgress!.unitRows
            .filter((r: any) => String(r?.unit_number || "").trim())
            .map((r: any) => ({ ...r }))
        : (Array.isArray(svc.unit_details) ? svc.unit_details : []);
      const carriedProducts = Array.isArray(inProgress?.products) && inProgress!.products.length > 0
        ? inProgress!.products
        : (Array.isArray(svc.products_used) ? svc.products_used : []);
      const { data: inserted, error } = await supabase.from("portal_services").insert({
        property_id: property.id,
        service_type: svc.service_type || "General Pest Control",
        service_date: svc.service_date,
        technician: inProgress?.technician || svc.technician || null,
        status: "scheduled",
        units_planned: Array.isArray(svc.units_planned) ? svc.units_planned : [],
        unit_details: carriedUnitDetails,
        products_used: carriedProducts,
        summary: inProgress?.summary || null,
        findings: inProgress?.findings || null,
        notes: inProgress?.notes || null,
        frequency_days: propertyFrequencyDays,
      } as any).select("id").single();
      if (error || !inserted?.id) {
        toast({ title: "Couldn't save", description: error?.message || "Unknown error", variant: "destructive" });
        return null;
      }
      const newId = inserted.id as string;
      // Mutate the in-memory projected row so subsequent saves in this same
      // render reuse the real id without waiting for onRefresh.
      (svc as any).id = newId;
      (svc as any).isProjected = false;
      // Migrate any in-progress completion buffer keyed by the projected id.
      if (inProgress) {
        setCompletionData((prev) => {
          const next = { ...prev };
          next[newId] = inProgress;
          delete next[serviceId];
          return next;
        });
      }
      // Refresh in the background so the rest of the tree picks up the row.
      onRefresh?.();
      return newId;
    } catch (e: any) {
      toast({ title: "Couldn't save", description: e?.message || "Unknown error", variant: "destructive" });
      return null;
    }
  };

  const saveServiceMapData = async (serviceId: string, canvasData: string) => {
    if (!serviceId || !canvasData) return;
    let realId = serviceId;
    if (serviceId.startsWith("projected-")) {
      const newId = await materializeProjected(serviceId);
      if (!newId) return;
      realId = newId;
    }
    try {
      const parsed = JSON.parse(canvasData);
      const svc = (propServices as any[]).find((s) => s.id === realId);
      const existing = (svc?.report_data && typeof svc.report_data === "object") ? svc.report_data : {};
      const merged = { ...existing, service_map_data: parsed };
      const { error } = await supabase
        .from("portal_services")
        .update({ report_data: merged })
        .eq("id", realId);
      if (error) {
        toast({ title: "Failed to save map", description: error.message, variant: "destructive" });
      } else {
        // Silent autosave — keep the in-memory service in sync so the editor
        // doesn't remount or lose state mid-edit. We mutate the cached row
        // instead of triggering onRefresh() on every emblem add.
        if (svc) {
          (svc as any).report_data = merged;
        }
      }
    } catch (e: any) {
      toast({ title: "Failed to save map", description: e?.message, variant: "destructive" });
    }
  };

  const resetServiceMapData = async (serviceId: string) => {
    if (!serviceId) return;
    if (serviceId.startsWith("projected-")) {
      // Nothing persisted yet — just refresh local view.
      await onRefresh?.();
      return;
    }
    try {
      const svc = (propServices as any[]).find((s) => s.id === serviceId);
      const existing = (svc?.report_data && typeof svc.report_data === "object") ? svc.report_data : {};
      const { service_map_data: _drop, ...rest } = existing;
      const { error } = await supabase
        .from("portal_services")
        .update({ report_data: rest })
        .eq("id", serviceId);
      if (error) {
        toast({ title: "Failed to revert map", description: error.message, variant: "destructive" });
      } else {
        toast({ title: "Reverted to permanent site map", duration: 1500 });
        onRefresh();
      }
    } catch (e: any) {
      toast({ title: "Failed to revert map", description: e?.message, variant: "destructive" });
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
    // For weekly/bi-weekly cadence, the precise weekday isn't meaningful — show
    // "Month W#" (e.g. "April W3"). For longer cadences, fall back to the full date.
    if (propertyFrequency === "weekly" || propertyFrequency === "bi-weekly") {
      const month = date.toLocaleDateString("en-US", { month: "long" });
      const week = Math.ceil(date.getDate() / 7);
      return `${month} W${week}`;
    }
    return date.toLocaleDateString("en-US", { weekday: "short", month: "long", day: "numeric" });
  };
  const formatShortDate = (d: string | null) => d ? new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "TBD";

  const propertyLink = links.find(l => l.link_type === "sub" && l.assigned_property_ids && (l.assigned_property_ids as string[]).includes(property.id));

  // ─── Render inline-editable unit table for past services ───
  const renderEditableUnitTable = (s: PortalService, editable: boolean = true) => {
    const rawUnitDetails = s.unit_details && Array.isArray(s.unit_details) ? s.unit_details as any[] : [];
    // Always display units in numeric order so 21, 41, 86, 100 read top-to-bottom
    // instead of being shuffled by save order. Non-numeric labels (e.g. "Clubhouse")
    // fall to the bottom alphabetically; empty labels go last.
    const unitDetails = (() => {
      const list = [...rawUnitDetails];
      const keyOf = (r: any) => String(r?.unit_number || "").trim();
      const numOf = (k: string) => {
        const m = k.match(/-?\d+(?:\.\d+)?/);
        return m ? parseFloat(m[0]) : NaN;
      };
      list.sort((a, b) => {
        const ka = keyOf(a), kb = keyOf(b);
        if (!ka && !kb) return 0;
        if (!ka) return 1;
        if (!kb) return -1;
        const na = numOf(ka), nb = numOf(kb);
        const aNum = !Number.isNaN(na), bNum = !Number.isNaN(nb);
        if (aNum && bNum && na !== nb) return na - nb;
        if (aNum && !bNum) return -1;
        if (!aNum && bNum) return 1;
        return ka.localeCompare(kb, undefined, { numeric: true, sensitivity: "base" });
      });
      return list;
    })();
    // ── READ-ONLY VIEW ──
    // Past services are locked unless the admin clicks "Edit". When locked,
    // we render a compact summary so accidental clicks can never mutate
    // status / findings / products. Mirrors what PMs see in the PM portal.
    if (!editable) {
      if (unitDetails.length === 0) {
        return (
          <div className="text-xs text-muted-foreground italic px-2 py-3">
            No areas / units recorded for this service.
          </div>
        );
      }
      return (
        <div>
          <p className="text-xs font-semibold text-muted-foreground mb-2">
            {isHOA ? `Common Areas & Units Serviced (${unitDetails.length})` : `Areas Treated (${unitDetails.length})`}
          </p>
          <div className="space-y-3">
            {unitDetails.map((unit: any, j: number) => {
              const kind = unit.kind || "service";
              const isInspection = kind === "inspection";
              const isFollowUp = unit.follow_up_needed === true;
              const productsText = Array.isArray(unit.products_used)
                ? (unit.products_used as any[]).map((p: any) => typeof p === "string" ? p : p?.name).filter(Boolean).join(", ")
                : (unit.products_used || "");
              return (
                <div
                  key={j}
                  className={`rounded-lg border-2 bg-card overflow-hidden ${isFollowUp ? "border-orange-500" : "border-primary/40"}`}
                >
                  <div className={`px-3 py-2 flex items-center justify-between gap-2 flex-wrap ${
                    isFollowUp ? "bg-orange-100 border-b-2 border-orange-500" : "bg-primary/10 border-b-2 border-primary/40"
                  }`}>
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${isFollowUp ? "bg-orange-500 text-white" : "bg-primary text-primary-foreground"}`}>
                        {j + 1}
                      </div>
                      <span className="text-sm font-bold">{unit.unit_number || "—"}</span>
                      <span className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded border ${
                        isInspection ? "bg-background border-sky-400 text-sky-700" : "bg-background border-primary/70 text-primary"
                      }`}>{isInspection ? "Inspection" : "Service"}</span>
                      {unit.target_pest && (
                        <span className="text-[10px] font-semibold uppercase tracking-wide bg-background border border-border px-2 py-0.5 rounded">
                          {unit.target_pest}
                        </span>
                      )}
                    </div>
                    {unit.status && (
                      <Badge variant="outline" className={`text-[11px] font-semibold ${isFollowUp ? "border-orange-500 text-orange-700 bg-orange-50" : "border-primary/70 bg-background"}`}>
                        {friendlyUnitStatus(unit.status, (unit as any).kind)}
                      </Badge>
                    )}
                    {isFreeAndClearStatus(unit.status) && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 text-[10px] px-2"
                        onClick={(e) => {
                          e.stopPropagation();
                          generateFreeAndClearCertificatePdf({
                            propertyName: property.name,
                            propertyAddress: property.address,
                            unitNumber: unit.unit_number,
                            inspectionDate: s.service_date,
                            inspectorName: s.technician,
                          });
                        }}
                      >
                        <Download className="w-3 h-3 mr-1" /> Free & Clear PDF
                      </Button>
                    )}
                  </div>
                  <div className="p-3 grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                    <div className="md:col-span-2 space-y-2">
                      {unit.pest_activity && unit.pest_activity !== "None" && (
                        <div>
                          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Activity Level</p>
                          <p>{unit.pest_activity}</p>
                        </div>
                      )}
                      {productsText && (
                        <div>
                          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Products</p>
                          <p className="whitespace-pre-wrap">{productsText}</p>
                        </div>
                      )}
                      {unit.findings && (
                        <div className="rounded-md border border-amber-400 bg-amber-50/60 p-2.5">
                          <p className="text-[10px] font-bold text-amber-900 uppercase tracking-wide mb-1">Technician Findings</p>
                          <p className="text-sm whitespace-pre-wrap leading-relaxed">{unit.findings}</p>
                        </div>
                      )}
                      {(unit.follow_up_needed || unit.sanitization_concern) && (
                        <div className="flex flex-wrap gap-2">
                          {unit.follow_up_needed && (
                            <Badge className="text-[11px] bg-orange-500 text-white">Follow Up Needed</Badge>
                          )}
                          {unit.sanitization_concern && (
                            <Badge className="text-[11px] bg-amber-600 text-white">Sanitization Concern</Badge>
                          )}
                        </div>
                      )}
                      {unit.notes && (
                        <div>
                          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Notes</p>
                          <p className="whitespace-pre-wrap leading-relaxed">{unit.notes}</p>
                        </div>
                      )}
                    </div>
                    {Array.isArray(unit.photos) && unit.photos.length > 0 && (
                      <div className="md:col-span-1">
                        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
                          Photos ({unit.photos.length})
                        </p>
                        <div className="grid grid-cols-2 gap-1.5">
                          {(unit.photos as any[]).map((p: any, pIdx: number) => {
                            const url = typeof p === "string" ? p : p?.url;
                            if (!url) return null;
                            return (
                              <a key={pIdx} href={url} target="_blank" rel="noopener noreferrer" className="block aspect-square rounded-md overflow-hidden border border-border">
                                <img src={url} alt={`Unit photo ${pIdx + 1}`} className="w-full h-full object-cover" loading="lazy" />
                              </a>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      );
    }
    // Past-service status dropdowns mirror the upcoming-visit options so the
    // technician sees the same vocabulary regardless of which tab they're in.
    const SERVICE_STATUSES: { value: string; label: string }[] = [
      { value: "Complete",          label: "Treated" },
      { value: "Not Serviced",      label: "Not Treated" },
    ];
    const INSPECTION_STATUSES: { value: string; label: string }[] = [
      { value: "Free and Clear",  label: "No Activity Found - Free and Clear" },
      { value: "Activity Found",  label: "Activity Found" },
      { value: "Not Serviced",    label: "Not Inspected" },
    ];
    const isInspectionUnit = (u: any) => (u?.kind || "service") === "inspection";
    const statusOptionsFor = (u: any) => isInspectionUnit(u) ? INSPECTION_STATUSES : SERVICE_STATUSES;
    const defaultStatusFor = (kind: string) => kind === "inspection" ? "Free and Clear" : "Complete";

    return (
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <p className="text-xs font-semibold text-muted-foreground">
            {isHOA ? `Common Areas & Units Serviced (${unitDetails.length})` : `Areas Treated (${unitDetails.length})`}
          </p>
          <Button variant="outline" size="sm" className="h-7 text-xs px-2.5" onClick={() => {
            setAddingUnitToService(s.id);
            setNewUnitData({ unit_number: "", findings: "", pest_activity: "None", products_used: "", status: "Complete", notes: "", kind: "service" } as any);
          }}>
            <Plus className="w-3 h-3 mr-0.5" />{isHOA ? "Add Area / Unit" : "Add Area"}
          </Button>
        </div>
        {/* Mini per-unit service report cards (replaces wide horizontal table) */}
        <div className="space-y-6">
          {unitDetails.map((unit: any, j: number) => {
            const kind = unit.kind || "service";
            const isInspection = kind === "inspection";
            const isFollowUp = unit.follow_up_needed === true;
            const allComments: ServiceComment[] = Array.isArray(unit.comments) ? (unit.comments as ServiceComment[]) : [];
            const unitKey = `pd-past:${s.id}:${j}`;
            const isUnitOpen = expandedUnitKeys.has(unitKey);
            return (
              <div
                key={j}
                className={`rounded-xl border-2 bg-card shadow-md ring-1 ring-border overflow-hidden ${
                  isFollowUp ? "border-orange-500" : "border-primary/60"
                }`}
              >
                {/* Bold colored header bar — makes each unit obviously distinct */}
                <div
                  role="button"
                  tabIndex={0}
                  onClick={(e) => {
                    // Don't toggle when interacting with form controls inside the header
                    const t = e.target as HTMLElement;
                    if (t.closest("input, select, button, textarea, [data-no-toggle]")) return;
                    toggleUnitKey(unitKey);
                  }}
                  onKeyDown={(e) => {
                    if ((e.key === "Enter" || e.key === " ") && (e.target as HTMLElement) === e.currentTarget) {
                      e.preventDefault();
                      toggleUnitKey(unitKey);
                    }
                  }}
                  aria-expanded={isUnitOpen}
                  className={`flex items-center justify-between gap-3 px-4 py-3 cursor-pointer select-none transition-colors ${
                    isFollowUp ? "bg-orange-100 hover:bg-orange-200/60 border-b-2 border-orange-500" : "bg-primary/10 hover:bg-primary/15 border-b-2 border-primary/60"
                  } ${isUnitOpen ? "" : "border-b-0"}`}
                >
                  <div className="flex items-center gap-3 flex-wrap">
                    <div className={`shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shadow-sm ${
                      isFollowUp ? "bg-orange-500 text-white" : "bg-primary text-primary-foreground"
                    }`}>
                      {j + 1}
                    </div>
                    <Input
                      className="h-9 text-lg font-bold w-40 px-2 bg-background"
                      placeholder="Area / Unit / Room"
                      defaultValue={unit.unit_number || ""}
                      onBlur={e => { if (e.target.value !== (unit.unit_number || "")) updateUnitField(s.id, j, "unit_number", e.target.value); }}
                    />
                    {/* Service / Inspection toggle (in-header) */}
                    <div data-no-toggle className="inline-flex rounded-md border border-border bg-background p-0.5">
                      {(["service", "inspection"] as const).map(k => {
                        const active = kind === k;
                        return (
                          <button
                            key={k}
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              updateUnitField(s.id, j, "kind", k);
                              updateUnitField(s.id, j, "status", defaultStatusFor(k));
                            }}
                            className={`px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide rounded transition-colors ${
                              active
                                ? (k === "inspection" ? "bg-sky-500 text-white shadow-sm" : "bg-primary text-primary-foreground shadow-sm")
                                : "text-muted-foreground hover:text-foreground"
                            }`}
                          >
                            {k === "service" ? "Service" : "Inspection"}
                          </button>
                        );
                      })}
                    </div>
                    {/* Target Pest (in-header) — hidden in HOA mode (no treatment detail) */}
                    {!isHOA && (<select
                      data-no-toggle
                      onClick={(e) => e.stopPropagation()}
                      className="h-9 text-xs font-semibold bg-background border border-border rounded-md px-2 cursor-pointer min-w-[140px]"
                      value={unit.target_pest || ""}
                      onChange={e => updateUnitField(s.id, j, "target_pest", e.target.value)}
                    >
                      <option value="">Target Pest…</option>
                      {PEST_TYPES.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>)}
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      className={`h-9 text-sm bg-background border-2 rounded-md px-2.5 cursor-pointer font-semibold ${
                        isFollowUp ? "border-orange-500 text-orange-700" : "border-primary/70 text-foreground"
                      }`}
                      value={unit.status || defaultStatusFor(kind)}
                      onChange={e => updateUnitField(s.id, j, "status", e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {statusOptionsFor(unit).map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
                    </select>
                    {!isHOA && <ChevronDown className={`w-5 h-5 text-muted-foreground transition-transform ${isUnitOpen ? "rotate-180" : ""}`} />}
                  </div>
                </div>
                {/* HOA mode: hide ALL per-unit treatment details — show only the area name + service type + status. */}
                {/* In HOA mode we still want past services to show what was treated in
                    each common area (products, findings) so the report doesn't look
                    blank after the tech hits Complete. We only hide the body for HOA
                    on UPCOMING work. Past services always render the full body. */}
                {isUnitOpen && (<>
                {/* Card body — left 2/3 fields, right 1/3 unit photos */}
                <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="md:col-span-2">
                    <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Activity Level</Label>
                    <select
                      className="h-9 text-sm w-full bg-background border border-input rounded-md px-2 cursor-pointer mt-1"
                      value={unit.pest_activity || "None"}
                      onChange={e => updateUnitField(s.id, j, "pest_activity", e.target.value)}
                    >
                      {ACTIVITY_OPTIONS.map(a => <option key={a} value={a}>{a}</option>)}
                    </select>
                  </div>
                  <div className="md:col-span-2">
                    <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Products Used</Label>
                    <div className="mt-1">
                      <UnitProductPicker
                        value={unit.products_used || ""}
                        onChange={(next) => updateUnitField(s.id, j, "products_used", next)}
                      />
                    </div>
                  </div>
                  {/* FINDINGS — its own visually distinct box */}
                  <div className="md:col-span-2 rounded-lg border-2 border-amber-500 bg-amber-50/60 p-3">
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <ClipboardList className="w-3.5 h-3.5 text-amber-700" />
                      <Label className="text-xs font-bold text-amber-900 uppercase tracking-wide">
                        Technician Findings (visible to customer)
                      </Label>
                    </div>
                    <Textarea
                      className="text-sm w-full px-2.5 py-2 min-h-[5rem] leading-snug whitespace-normal bg-background border-amber-400 focus-visible:ring-amber-400"
                      placeholder="What did the technician observe in this area?"
                      defaultValue={unit.findings || ""}
                      onBlur={e => { if (e.target.value !== (unit.findings || "")) updateUnitField(s.id, j, "findings", e.target.value); }}
                    />
                  </div>
                  {/* Follow-up + Sanitization checkboxes — must be CHECKED to flag for next service */}
                  <div className="md:col-span-2 rounded-lg border-2 border-orange-400 bg-orange-50/50 p-3 flex flex-col sm:flex-row gap-3 sm:gap-6">
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <Checkbox
                        checked={!!unit.follow_up_needed}
                        onCheckedChange={(v) => updateUnitField(s.id, j, "follow_up_needed", !!v)}
                      />
                      <span className="text-sm font-semibold text-orange-900">Follow Up Needed</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <Checkbox
                        checked={!!unit.sanitization_concern}
                        onCheckedChange={(v) => updateUnitField(s.id, j, "sanitization_concern", !!v)}
                      />
                      <span className="text-sm font-semibold text-orange-900">Sanitization Concern</span>
                    </label>
                  </div>
                  </div>
                  {/* UNIT PHOTOS — right 1/3 column */}
                  <div className="md:col-span-1 rounded-lg border-2 border-primary/40 bg-primary/[0.04] p-3 self-start">
                  <div className="flex items-center gap-1.5 mb-2">
                    <Image className="w-3.5 h-3.5 text-primary" />
                    <Label className="text-xs font-bold text-foreground uppercase tracking-wide">
                      Unit Photos {Array.isArray(unit.photos) && unit.photos.length > 0 && (
                        <span className="text-muted-foreground font-normal normal-case">({unit.photos.length})</span>
                      )}
                    </Label>
                  </div>
                  <label className="cursor-pointer block">
                    <div className={`w-full border-2 border-dashed rounded-lg py-3 px-3 flex items-center justify-center gap-2 transition-all ${uploadingUnitPhotoFor === `${s.id}:${j}` ? "bg-muted border-primary/70" : "border-primary/50 bg-background hover:bg-primary/[0.06] hover:border-primary/70"}`}>
                      {uploadingUnitPhotoFor === `${s.id}:${j}` ? (
                        <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <Plus className="w-4 h-4 text-primary" />
                      )}
                      <span className="text-xs font-semibold text-foreground">
                        {uploadingUnitPhotoFor === `${s.id}:${j}` ? "Uploading…" : "Add photo to this unit"}
                      </span>
                    </div>
                    <input type="file" accept="image/*" multiple className="hidden"
                      disabled={uploadingUnitPhotoFor === `${s.id}:${j}`}
                      onChange={async e => {
                        const files = Array.from(e.target.files || []);
                        (e.target as HTMLInputElement).value = "";
                        for (const f of files) {
                          await uploadUnitPhoto(s.id, j, f);
                        }
                      }} />
                  </label>
                  {Array.isArray(unit.photos) && unit.photos.length > 0 && (
                    <div className="grid grid-cols-2 gap-2 mt-2">
                      {(unit.photos as any[]).map((p: any, pIdx: number) => {
                        const url = typeof p === "string" ? p : p?.url;
                        if (!url) return null;
                        return (
                          <div key={pIdx} className="relative aspect-square rounded-md overflow-hidden border border-border group">
                            <a href={url} target="_blank" rel="noopener noreferrer">
                              <img src={url} alt={`Unit photo ${pIdx + 1}`} className="w-full h-full object-cover" loading="lazy" />
                            </a>
                            <button type="button" onClick={() => removeUnitPhoto(s.id, j, pIdx)}
                              className="absolute top-0.5 right-0.5 bg-background/90 rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive hover:text-destructive-foreground">
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
                </div>
                </>)}
              </div>
            );
          })}

          {/* Inline add-unit card */}
          {addingUnitToService === s.id && (
            <div className="rounded-lg border-2 border-primary/70 bg-primary/5 p-3.5">
              <div className="flex items-center justify-between gap-3 pb-2.5 mb-2.5 border-b border-primary/60">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-muted-foreground uppercase tracking-wide">New Area</span>
                  <Input className="h-9 text-base font-bold w-40 px-2" placeholder="Area / Unit / Room"
                    value={newUnitData.unit_number}
                    onChange={e => setNewUnitData(d => ({ ...d, unit_number: e.target.value }))}
                  />
                </div>
                <select className="h-9 text-sm bg-background border border-input rounded-md px-2.5"
                  value={newUnitData.status || (((newUnitData as any).kind === "inspection") ? "Free and Clear" : "Complete")}
                  onChange={e => setNewUnitData(d => ({ ...d, status: e.target.value }))}
                >
                  {(((newUnitData as any).kind === "inspection")
                    ? [{ v: "Free and Clear", l: "No Activity Found - Free and Clear" }, { v: "Activity Found", l: "Activity Found" }]
                    : [{ v: "Complete", l: "Complete" }, { v: "Not Serviced", l: "Not Serviced" }]
                  ).map(a => <option key={a.v} value={a.v}>{a.l}</option>)}
                </select>
              </div>
              {/* Service / Inspection toggle for the new area */}
              <div className="mb-3">
                <div className="inline-flex rounded-lg border-2 border-border bg-muted/40 p-0.5">
                  {(["service", "inspection"] as const).map(k => {
                    const active = ((newUnitData as any).kind || "service") === k;
                    return (
                      <button
                        key={k}
                        type="button"
                        onClick={() => setNewUnitData(d => ({
                          ...d,
                          kind: k,
                          status: k === "inspection" ? "Free and Clear" : "Complete",
                        } as any))}
                        className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${
                          active ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {k === "service" ? "Service" : "Inspection"}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Target Pest</Label>
                  <select className="h-9 text-sm w-full bg-background border border-input rounded-md px-2 mt-1"
                    value={(newUnitData as any).target_pest || ""}
                    onChange={e => setNewUnitData(d => ({ ...d, target_pest: e.target.value } as any))}
                  >
                    <option value="">—</option>
                    {PEST_TYPES.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div>
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Activity Level</Label>
                  <select className="h-9 text-sm w-full bg-background border border-input rounded-md px-2 mt-1"
                    value={newUnitData.pest_activity || "None"}
                    onChange={e => setNewUnitData(d => ({ ...d, pest_activity: e.target.value }))}
                  >
                    {ACTIVITY_OPTIONS.map(a => <option key={a} value={a}>{a}</option>)}
                  </select>
                </div>
                <div className="md:col-span-2">
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Findings / Notes</Label>
                  <Textarea className="text-sm w-full px-2.5 py-2 min-h-[5rem] leading-snug mt-1" placeholder="What was found / what was treated…"
                    value={newUnitData.findings}
                    onChange={e => setNewUnitData(d => ({ ...d, findings: e.target.value }))}
                  />
                </div>
                <div className="md:col-span-2">
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Products Used</Label>
                  <div className="mt-1">
                    <UnitProductPicker
                      value={newUnitData.products_used}
                      onChange={(next) => setNewUnitData(d => ({ ...d, products_used: next }))}
                    />
                  </div>
                </div>
              </div>
              <div className="flex gap-2 mt-3">
                <Button size="sm" className="flex-1" onClick={() => addUnitToService(s.id)} disabled={!newUnitData.unit_number}>Save Unit</Button>
                <Button variant="ghost" size="sm" onClick={() => setAddingUnitToService(null)}>Cancel</Button>
              </div>
            </div>
          )}
        </div>
        {/* Quick add row if not already adding */}
        {addingUnitToService !== s.id && (
          <button className="w-full mt-1 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded border border-dashed border-border transition-colors flex items-center justify-center gap-1"
            onClick={() => {
              setAddingUnitToService(s.id);
              setNewUnitData({ unit_number: "", findings: "", pest_activity: "None", products_used: "", status: "Complete", notes: "", kind: "service" });
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
    const products: ProductUsage[] = productsOverride[s.id]
      ? productsOverride[s.id]
      : normalizeUsageList(s.products_used);

    // Use the SAME merge helper the PM portal uses so admin + PM can never
    // disagree about which units will be treated on the next service.
    const merged = computeUpcomingUnits({
      service: s,
      isFirstUpcoming: isUpcoming && isFirstUpcoming,
      requests: pendingRequests,
      // Roll forward follow_up_needed flags from EVERY past visit (regular +
      // ad-hoc). buildMergedMostRecentPast collapses the latest entry per
      // unit across all past services so a flag from any prior visit
      // surfaces until a newer visit for that unit clears it.
      mostRecentPast: buildMergedMostRecentPast(pastServicesForDisplay),
      // Include ad-hoc completed visits in the lookup so per-unit notes
      // from an ad-hoc visit carry forward to the next scheduled visit's
      // pre-fill (cadence/follow-up math still uses pastServices only).
      allPastServices: pastServicesForDisplay,
      // Surface the original work order on follow-up / carried units even
      // after the request itself has been closed.
      allRequests: allRequests,
      tenantMoveIns:
        (property.customer_preferences as any)?.tenant_move_ins || null,
    });
    const displayUnits = isUpcoming ? merged.units : unitsPlanned;

    // PM-submitted note for this upcoming service date (if any).
    const pmNotesMap: Record<string, string> =
      ((property.customer_preferences as any)?.pm_upcoming_notes as Record<string, string>) || {};
    const pmNoteForThis = isUpcoming && s.service_date ? (pmNotesMap[s.service_date] || "") : "";

    // Overage calculation — uses merged unit count for upcoming, treated unit count for past.
    const overageUnitCount = isUpcoming
      ? merged.units.length
      : (Array.isArray(s.unit_details) ? (s.unit_details as any[]).length : 0);
    const overage = computeOverage(overageUnitCount, planCfg);

    // ─── HOA dedicated layout ───
    // Boards (and the techs working on HOAs) get a totally different view
    // than apartments: big editable site map on the left, findings on the
    // right, and small chips of homes scheduled / treated at the bottom.
    // Used for BOTH past and upcoming HOA services so PM + admin views
    // stay in sync (admin = editable, PM = read-only via HOAServiceView).
    if (isHOA) {
      const hoaUnits: HOAUnitItem[] = (isUpcoming
        ? merged.unitContexts.map((uc) => ({
            unit_number: String(uc.unit_number || "").trim(),
            status: (completionData[s.id]?.unitRows || []).find((r: any) => String(r.unit_number || "").trim() === String(uc.unit_number || "").trim())?.status || "To Be Treated",
            follow_up_needed: uc.source === "follow_up",
            target_pest: uc.target_pest || (uc as any)?.request?.pest_type || "",
          }))
        : (Array.isArray(s.unit_details) ? (s.unit_details as any[]) : []).map((u: any) => ({
            unit_number: String(u.unit_number || "").trim(),
            status: u.status || undefined,
            follow_up_needed: !!u.follow_up_needed,
            target_pest: u.target_pest || "",
          }))
      ).filter((u) => u.unit_number);
      const findingsCombined = [s.summary, s.findings, s.notes].filter(Boolean).join("\n\n");
      // Roll up products from BOTH the service-level field and each
      // unit_details[].products_used so HOA boards see the full chemical
      // total even when techs logged products per home.
      const hoaProducts: ProductUsage[] = aggregateUsage(collectServiceProductUsage(s)).map((row) => ({
        name: row.name,
        applied_amount: row.appliedTotal || null,
        applied_unit: row.appliedUnit,
        undiluted_amount: row.undilutedTotal || null,
        undiluted_unit: row.undilutedUnit,
      })) as any;
      return (
        <div className="px-4 pb-4 space-y-3 border-t border-border pt-3">
          {redNotesValue && (
            <div className="rounded-lg border-2 border-red-500 bg-red-50 p-3 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-wide text-red-800 mb-1 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5" />
                RED NOTES — Admin Only (not shown to PM)
              </p>
              <p className="text-sm whitespace-pre-wrap font-medium text-red-900">{redNotesValue}</p>
            </div>
          )}
          {pmNoteForThis && (
            <div className="bg-primary/10 border-2 border-primary/70 rounded-lg p-3">
              <p className="text-xs font-bold uppercase tracking-wide text-primary mb-1 flex items-center gap-1.5">
                <ClipboardList className="w-3 h-3" />
                From the Property Manager — for the Technician
              </p>
              <p className="text-xs whitespace-pre-wrap font-medium">{pmNoteForThis}</p>
            </div>
          )}
          <HOAServiceView
            mode="admin"
            isUpcoming={isUpcoming}
            mapUrl={mapUrl}
            mapData={property.map_data}
            serviceMapData={(s as any)?.report_data?.service_map_data ?? null}
            onSaveServiceMapData={(canvasData) => saveServiceMapData(s.id, canvasData)}
            onResetServiceMapData={() => resetServiceMapData(s.id)}
            onUploadMapImage={(file) => onUpdatePropertyImage(property.id, file)}
            uploadingMap={uploadingPropertyImage}
            findings={findingsCombined}
            technician={s.technician}
            // Editor (admin) needs the raw service-level products list so
            // edits round-trip cleanly to portal_services.products_used.
            // The rolled-up `hoaProducts` (service + per-unit) is only for
            // the PM read-only display, passed separately below.
            products={products}
            displayProducts={hoaProducts.length > 0 ? hoaProducts : products}
            units={hoaUnits}
            onChangeUnitStatus={(unitNumber, status) => {
              const draft = completionDataRef.current[s.id] || ensureCompletionDraft(s, merged.unitContexts);
              const normalized = String(unitNumber || "").trim();
              const hasRow = draft.unitRows.some((r: any) => String(r.unit_number || "").trim() === normalized);
              const nextRows = hasRow
                ? draft.unitRows.map((r: any) => String(r.unit_number || "").trim() === normalized ? { ...r, status } : r)
                : [...draft.unitRows, { unit_number: normalized, target_pest: "", findings: "", pest_activity: "None", products_used: [], status, notes: "", source: "planned" }];
              completionDataRef.current = { ...completionDataRef.current, [s.id]: { ...draft, unitRows: nextRows } };
              setCompletionData(prev => ({ ...prev, [s.id]: { ...(prev[s.id] || draft), unitRows: nextRows } }));
            }}
            onChangeFindings={(next) => updateServiceFindings(s.id, next)}
            onChangeProducts={(next) => updateServiceProducts(s.id, next)}
            attachments={Array.isArray((s as any).attachments) ? (s as any).attachments : []}
            attachmentsPathPrefix={`portal-services/${property.id}/${s.id}`}
            onChangeAttachments={async (next) => {
              let targetId = s.id;
              if (String(s.id).startsWith("projected-")) {
                const newId = await materializeProjected(s.id);
                if (!newId) return;
                targetId = newId;
              }
              await supabase.from("portal_services").update({ attachments: next as any }).eq("id", targetId);
              (s as any).attachments = next;
              await onRefresh?.();
            }}
            officeNotes={(s as any).office_notes || ""}
            onChangeOfficeNotes={async (next) => {
              let targetId = s.id;
              if (String(s.id).startsWith("projected-")) {
                const newId = await materializeProjected(s.id);
                if (!newId) return;
                targetId = newId;
              }
              await supabase.from("portal_services").update({ office_notes: next } as any).eq("id", targetId);
              (s as any).office_notes = next;
            }}
            onFlagOffice={async () => {
              await supabase.functions.invoke("flag-office-note", {
                body: {
                  propertyName: property.name,
                  serviceDate: s.service_date,
                  serviceType: (s as any).appointment_service || s.service_type,
                  technician: s.technician,
                  note: (s as any).office_notes || "",
                },
              });
            }}
            onDraftChange={(draft) => {
              if (!completionDataRef.current[s.id]) ensureCompletionDraft(s, merged.unitContexts);
              patchCompletionDraft(s.id, {
                ...(draft.findings !== undefined ? { summary: draft.findings, findings: "", notes: "" } : {}),
                ...(draft.products !== undefined ? { products: draft.products } : {}),
              });
            }}
            communityFeedback={(() => {
              // Past visits: render the snapshot of sightings that were
              // addressed on THIS visit (captured at completion time).
              if (!isUpcoming) {
                const snap = (s as any)?.report_data?.community_sightings_addressed;
                return Array.isArray(snap) ? snap : [];
              }
              // Upcoming first visit: show every open community sighting so
              // the tech is briefed. They get cleared at completion time.
              if (isFirstUpcoming) {
                return (pendingRequests as any[])
                  .filter((r) => {
                    if (r.status === "resolved" || r.status === "completed") return false;
                    const isCommunity = r.request_type === "Community Pest Sighting" ||
                      /^\[COMMUNITY SIGHTING\]/i.test(String(r.description || ""));
                    return isCommunity;
                  })
                  .map((r) => ({
                    id: r.id,
                    created_at: r.created_at,
                    pest_type: r.pest_type,
                    location_type: r.location_type,
                    description: r.description,
                    photos: Array.isArray(r.photos) ? r.photos : [],
                  }));
              }
              return [];
            })()}
            serviceRequests={(() => {
              if (!isUpcoming) {
                const snap = (s as any)?.report_data?.service_requests_addressed;
                return Array.isArray(snap) ? snap : [];
              }
              if (isFirstUpcoming) {
                return (pendingRequests as any[])
                  .filter((r) => {
                    if (r.status === "resolved" || r.status === "completed") return false;
                    const isCommunity = r.request_type === "Community Pest Sighting" ||
                      /^\[COMMUNITY SIGHTING\]/i.test(String(r.description || ""));
                    return !isCommunity;
                  })
                  .map((r) => ({
                    id: r.id,
                    created_at: r.created_at,
                    pest_type: r.pest_type,
                    location_type: r.location_type,
                    description: r.description,
                    unit_number: r.unit_number,
                    request_type: r.request_type,
                    photos: Array.isArray(r.photos) ? r.photos : [],
                  }));
              }
              return [];
            })()}
          />
          {/* HOA upcoming: full-width Complete Service action.
              Flips status -> "completed", auto-rolls flagged units into a
              follow-up, and dedupes other scheduled rows for today so the
              visit immediately moves into Previous Services. */}
          {isUpcoming && (
            <Button
              size="sm"
              className="w-full h-10 text-sm bg-green-600 hover:bg-green-700 text-white font-semibold disabled:opacity-60"
              onClick={() => completeService(s.id, s, merged.unitContexts)}
              disabled={isProjected}
              title={isProjected ? "Schedule a date first to complete this service" : undefined}
            >
              <CheckCircle className="w-4 h-4 mr-1.5" />
              {isProjected ? "Schedule a date to complete" : "Complete Service"}
            </Button>
          )}
          {!isProjected && (
            <div className="flex gap-1.5 pt-1 border-t border-border mt-2">
              <Button variant="ghost" size="sm" className="h-7 text-xs ml-auto" onClick={() => onDeleteService(s.id)}>
                <Trash2 className="w-3 h-3 text-destructive" />
              </Button>
            </div>
          )}
        </div>
      );
    }

    return (
      <div className="px-4 pb-4 space-y-3 border-t border-border pt-3">
        {/* Read-only / Edit toggle for past services (admin-only).
            Pinned at the very top of the appointment so admins can flip
            into edit mode without scrolling past the report body. */}
        {!isUpcoming && !isProjected && (
          <div className="flex items-center justify-between rounded-lg border bg-muted/40 px-3 py-2">
            <div className="text-[11px] uppercase tracking-wide font-semibold text-muted-foreground">
              {isPastEditing(s.id) ? "Editing this past service" : "Past service — read-only"}
            </div>
            <div className="flex items-center gap-2">
              {isPastEditing(s.id) && (
                <label className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
                  <Calendar className="w-3.5 h-3.5" />
                  Visit date
                  <input
                    type="date"
                    className="h-7 rounded border border-input bg-background px-2 text-xs"
                    defaultValue={(s.service_date || "").slice(0, 10)}
                    onChange={async (e) => {
                      const newDate = e.target.value;
                      if (!newDate || newDate === (s.service_date || "").slice(0, 10)) return;
                      const { error } = await supabase
                        .from("portal_services")
                        .update({ service_date: newDate })
                        .eq("id", s.id);
                      if (error) {
                        toast({ title: "Couldn't update visit date", description: error.message, variant: "destructive" });
                      } else {
                        toast({ title: "Visit date updated", description: formatDate(newDate), duration: 1500 });
                        onRefresh();
                      }
                    }}
                  />
                </label>
              )}
              <Button
                variant={isPastEditing(s.id) ? "default" : "outline"}
                size="sm"
                className="h-7 text-xs"
                onClick={() => togglePastEditing(s.id)}
              >
                {isPastEditing(s.id) ? "Done editing" : "Edit Previous Service"}
              </Button>
            </div>
          </div>
        )}
        {redNotesValue && (
          <div className="rounded-lg border-2 border-red-500 bg-red-50 p-3 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-wide text-red-800 mb-1 flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5" />
              RED NOTES — Admin Only (not shown to PM)
            </p>
            <p className="text-sm whitespace-pre-wrap font-medium text-red-900">{redNotesValue}</p>
          </div>
        )}
        {/* Past-service follow-up banner moved to the BOTTOM of the body as
            a single-sentence note (see below). */}
        {/* HOA mode (past service): MAP + SUMMARY are ~90% of the report.
            Everything else (per-unit/area table, products) is collapsed into
            a tiny "Visit Details" twirl-down underneath the narrative. */}
        {isHOA && !isUpcoming && (mapUrl || property.map_data) && (
          <div className="rounded-xl border-2 border-emerald-400 bg-emerald-50/40 overflow-hidden shadow-md">
            <div className="px-3 py-2 bg-emerald-100/70 border-b-2 border-emerald-300 flex items-center gap-1.5">
              <MapPin className="w-5 h-5 text-emerald-700" />
              <p className="text-sm font-bold uppercase tracking-wide text-emerald-800">
                Community Site Map — Areas Treated
              </p>
            </div>
            <div className="bg-background mx-auto" style={{ aspectRatio: "3 / 4", height: 720, width: "auto", maxWidth: "100%" }}>
              {property.map_data ? (
                <ReadOnlyMapCanvas mapUrl={mapUrl} mapData={property.map_data} imageFit="contain" />
              ) : mapUrl ? (
                <img src={mapUrl} alt="Site map" className="w-full h-full object-contain" />
              ) : null}
            </div>
          </div>
        )}

        {/* PM-submitted note for the upcoming visit — high-visibility callout for the technician */}
        {pmNoteForThis && (
          <div className="bg-primary/10 border-2 border-primary/70 rounded-lg p-3">
            <p className="text-xs font-bold uppercase tracking-wide text-primary mb-1 flex items-center gap-1.5">
              <ClipboardList className="w-3 h-3" />
              From the Property Manager — for the Technician
            </p>
            <p className="text-xs whitespace-pre-wrap font-medium">{pmNoteForThis}</p>
          </div>
        )}

        {/* General Requests — work orders submitted without a specific unit
            (e.g. "the front gate is broken"). NEVER counted toward the unit
            total, but ALWAYS shown so they're not lost. Only on the next
            upcoming service. */}
        {isUpcoming && isFirstUpcoming && (() => {
          const generalReqs = getOpenGeneralRequests(pendingRequests);
          if (generalReqs.length === 0) return null;
          return (
            <div className="rounded-lg border-2 border-sky-500 bg-sky-50/60 p-3">
              <div className="flex items-center gap-1.5 mb-2">
                <ClipboardList className="w-3.5 h-3.5 text-sky-700" />
                <p className="text-xs font-bold text-sky-900 uppercase tracking-wide">
                  General Request{generalReqs.length === 1 ? "" : "s"} ({generalReqs.length})
                </p>
              </div>
              <ul className="space-y-1.5">
                {generalReqs.map((r) => {
                  const contact = parseResidentContact(r as any);
                  const text = contact.cleanedDescription.replace(/^Customer:.*?\n/, "").trim();
                  const photos: string[] = Array.isArray((r as any).photos) ? (r as any).photos : [];
                  return (
                    <li key={r.id} className="text-sm leading-snug">
                      <div className="flex gap-2">
                        <span className="text-xs font-bold text-sky-700 uppercase tracking-wide shrink-0 mt-0.5">General Request:</span>
                        <span className="whitespace-pre-wrap">{text || "(no details)"}</span>
                      </div>
                      {contact.hasAny && <ResidentContactCard contact={contact} className="mt-1.5 ml-1" />}
                      {photos.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-1.5 ml-1">
                          {photos.map((url, i) => (
                            <a key={url} href={url} target="_blank" rel="noopener noreferrer" className="block w-14 h-14 rounded border overflow-hidden bg-muted">
                              <img src={url} alt={`Photo ${i + 1}`} className="w-full h-full object-cover" loading="lazy" />
                            </a>
                          ))}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })()}

        {!isUpcoming && !isHOA && (() => {
          const addressed = [
            ...(((s as any)?.report_data?.community_sightings_addressed || []) as any[]),
            ...(((s as any)?.report_data?.service_requests_addressed || []) as any[]),
          ];
          if (addressed.length === 0) return null;
          return (
            <div className="rounded-lg border-2 border-sky-500 bg-sky-50/60 p-3">
              <div className="flex items-center gap-1.5 mb-2">
                <ClipboardList className="w-3.5 h-3.5 text-sky-700" />
                <p className="text-xs font-bold text-sky-900 uppercase tracking-wide">
                  Requests Addressed On This Service ({addressed.length})
                </p>
              </div>
              <ul className="space-y-2">
                {addressed.map((r: any) => {
                  const photos = Array.isArray(r.photos) ? r.photos : [];
                  return (
                    <li key={r.id} className="rounded-md border border-sky-300/70 bg-background/80 p-2 text-sm leading-snug">
                      <div className="font-semibold text-foreground">
                        {r.unit_number || r.request_type || "Request"}
                        {r.pest_type ? <span className="font-normal text-muted-foreground"> — {r.pest_type}</span> : null}
                        {r.location_type ? <span className="font-normal text-muted-foreground"> · {r.location_type}</span> : null}
                      </div>
                      {r.description && <p className="text-xs text-muted-foreground whitespace-pre-wrap mt-0.5">{String(r.description).replace(/^\[[^\]]+\]\s*/i, "")}</p>}
                      {photos.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-1.5">
                          {photos.map((url: any, i: number) => {
                            const src = typeof url === "string" ? url : url?.url;
                            if (!src) return null;
                            return <a key={`${src}-${i}`} href={src} target="_blank" rel="noopener noreferrer" className="block w-14 h-14 rounded border overflow-hidden bg-muted"><img src={src} alt={`Request photo ${i + 1}`} className="w-full h-full object-cover" loading="lazy" /></a>;
                          })}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })()}

        {/* Overage banner — only shows when this service exceeds the property's included-unit allowance */}
        {overage.hasOverage && (
          <div className="border-2 border-amber-500/70 bg-amber-50 dark:bg-amber-950/30 rounded-lg p-3">
            <p className="text-xs font-bold uppercase tracking-wide text-amber-700 dark:text-amber-400 mb-1 flex items-center gap-1.5">
              <Flag className="w-3.5 h-3.5" />
              Overage on this service
            </p>
            <p className="text-sm font-semibold text-amber-900 dark:text-amber-100">
              {overage.totalUnits} units {isUpcoming ? "scheduled" : "treated"} — {overage.includedUnits} included • {overage.unitsOver} over the plan
            </p>
            <p className="text-xs text-amber-800 dark:text-amber-200 mt-0.5">
              {overage.unitsOver} × {formatOverageMoney(overage.pricePerUnit)} = <span className="font-bold">{formatOverageMoney(overage.overageCost)}</span> additional charge for this visit.
            </p>
          </div>
        )}

        {/* Past service body — for HOA, the narrative (findings + products)
            comes FIRST and the per-unit editable table is demoted into a
            small collapsible "Specific Homes Treated" section underneath.
            Apartment / commercial views render the editable table inline as
            before so per-unit data entry stays primary. */}

        {/* ─── NEW ORDER for past services ───
            1) Summary (Technician Findings)
            2) Products
            3) Unit Summary (per-unit cards — read-only by default)
            4) Pesticide Notice (rendered later in the function)
            Crest/PM service-level comment thread is removed. */}
        {!isUpcoming && !isHOA && (
          <>
            {/* Follow-up note — at the top */}
            {(() => {
              const fuUnits = unitDetails.filter((u: any) => u?.follow_up_needed === true);
              if (fuUnits.length === 0 && !s.follow_up_recommended) return null;
              const list = fuUnits.map((u: any) => u.unit_number).filter(Boolean).join(", ");
              return (
                <p className="text-xs text-orange-800 bg-orange-50 border border-orange-300 rounded-md px-2.5 py-1.5">
                  <span className="font-bold uppercase tracking-wide">Follow-up needed:</span>{" "}
                  {fuUnits.length > 0
                    ? <>{fuUnits.length} {fuUnits.length === 1 ? "unit" : "units"}{list ? ` (${list})` : ""} will auto-roll into the next scheduled service.</>
                    : (s.follow_up_notes || "Flagged for a return visit on the next scheduled service.")}
                </p>
              );
            })()}
            {/* 1) Summary */}
            {(s.summary || s.findings || s.notes) && (
              <div className="rounded-lg border-2 border-primary/70 bg-gradient-to-br from-primary/[0.06] to-transparent p-3.5 shadow-sm">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <ClipboardList className="w-3.5 h-3.5 text-primary" />
                  <p className="text-xs font-bold uppercase tracking-wide text-primary">
                    Technician Findings{s.technician ? ` — ${s.technician}` : ""}
                  </p>
                </div>
                <p className="text-sm whitespace-pre-wrap leading-relaxed font-medium text-foreground">
                  {[s.summary, s.findings, s.notes].filter(Boolean).join("\n\n")}
                </p>
              </div>
            )}
            {/* 2) Unit Summary — editable only when admin opted in */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Unit Summary</p>
              {renderEditableUnitTable(s, isPastEditing(s.id))}
            </div>
            {/* 4) Products — moved to the very bottom */}
            {products.length > 0 && (
              <div className="mt-2">
                <p className="text-xs font-semibold text-muted-foreground mb-1.5 flex items-center gap-1.5">
                  <FlaskConical className="w-3.5 h-3.5 text-primary" />
                  Products Used (this service date)
                </p>
                <ProductUsageSummary entries={products} />
              </div>
            )}
          </>
        )}

        {!isUpcoming && isHOA && (
          <>
            {(() => {
              const fuUnits = unitDetails.filter((u: any) => u?.follow_up_needed === true);
              if (fuUnits.length === 0 && !s.follow_up_recommended) return null;
              const list = fuUnits.map((u: any) => u.unit_number).filter(Boolean).join(", ");
              return (
                <p className="text-xs text-orange-800 bg-orange-50 border border-orange-300 rounded-md px-2.5 py-1.5">
                  <span className="font-bold uppercase tracking-wide">Follow-up needed:</span>{" "}
                  {fuUnits.length > 0
                    ? <>{fuUnits.length} {fuUnits.length === 1 ? "home" : "homes"}{list ? ` (${list})` : ""} will auto-roll into the next scheduled service.</>
                    : (s.follow_up_notes || "Flagged for a return visit on the next scheduled service.")}
                </p>
              );
            })()}
            {/* Technician Report — large, prominent narrative (the "summary"
                half of the 90/10 split with the map). */}
            {(s.summary || s.findings || s.notes) && (
              <div className="rounded-xl border-2 border-primary/70 bg-gradient-to-br from-primary/[0.08] to-transparent p-6 shadow-md">
                <div className="flex items-center gap-2 mb-3">
                  <ClipboardList className="w-5 h-5 text-primary" />
                  <p className="text-sm font-bold uppercase tracking-wide text-primary">
                    Technician Report{s.technician ? ` — ${s.technician}` : ""}
                  </p>
                </div>
                <p className="text-base whitespace-pre-wrap leading-relaxed font-medium text-foreground">
                  {[s.summary, s.findings, s.notes].filter(Boolean).join("\n\n")}
                </p>
              </div>
            )}
            {/* Visit Details — collapsed by default. Holds products + the
                editable per-unit table so techs can still enter data, but
                visually it's an afterthought. */}
            <details className="rounded-lg border border-border bg-muted/30 px-3 py-2 group">
              <summary className="cursor-pointer text-[11px] font-semibold text-muted-foreground hover:text-foreground select-none flex items-center justify-between">
                <span>
                  Visit Details
                  {products.length > 0 && ` · ${products.length} product${products.length === 1 ? "" : "s"}`}
                  {Array.isArray(s.unit_details) && (s.unit_details as any[]).length > 0 && ` · ${(s.unit_details as any[]).length} home${(s.unit_details as any[]).length === 1 ? "" : "s"}`}
                </span>
                <ChevronDown className="w-3.5 h-3.5 transition-transform group-open:rotate-180" />
              </summary>
              <div className="mt-3 space-y-3">
                {products.length > 0 && (
                  <div>
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
                      <FlaskConical className="w-3 h-3 text-primary" />
                      Products Used
                    </p>
                    <ProductUsageSummary entries={products} />
                  </div>
                )}
                <div>
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide mb-1.5">Specific Homes Treated</p>
                  {renderEditableUnitTable(s, isPastEditing(s.id))}
                </div>
              </div>
            </details>
          </>
        )}

        {/* Upcoming service: prominent unique-units count (units listed in Service Report table below) */}
        {isUpcoming && isFirstUpcoming && merged.units.length > 0 && (() => {
          // Use the SAME merged unit list as the overage banner so the two
          // numbers can never disagree (planned + work orders + follow-ups,
          // all deduped to truly unique unit numbers).
          const total = merged.units.length;
          const fuCount = merged.followUpUnits.size;
          const woCount = merged.openRequestUnits.size;
          return (
            <div className="bg-primary text-primary-foreground rounded-lg p-3 flex items-center justify-between shadow-sm">
              <div>
                <p className="text-xs uppercase tracking-wide font-semibold opacity-90">Interior Units to Treat</p>
                <p className="text-xs opacity-85 mt-0.5">
                  {fuCount > 0 && <span>{fuCount} follow-up{fuCount === 1 ? "" : "s"}</span>}
                  {fuCount > 0 && woCount > 0 && <span> + </span>}
                  {woCount > 0 && <span>{woCount} work order{woCount === 1 ? "" : "s"}</span>}
                  <span className="opacity-70"> · details in Service Report table below</span>
                </p>
              </div>
              <div className="text-right">
                <p className="text-3xl font-bold leading-none">{total}</p>
                <p className="text-xs mt-1 opacity-80">unique unit{total === 1 ? "" : "s"}</p>
              </div>
            </div>
          );
        })()}

        {/* Findings block for UPCOMING services only — past-service findings
            are rendered above (in the new ordered block) so we skip them here
            to avoid duplication. */}
        {isUpcoming && (s.summary || s.findings || s.notes) && (
          <div className="rounded-lg border-2 border-primary/70 bg-gradient-to-br from-primary/[0.06] to-transparent p-3.5 shadow-sm">
            <div className="flex items-center gap-1.5 mb-1.5">
              <ClipboardList className="w-3.5 h-3.5 text-primary" />
              <p className="text-xs font-bold uppercase tracking-wide text-primary">
                {isAdHocService(s) ? "Appointment Summary" : "Technician Findings"}{s.technician ? ` — ${s.technician}` : ""}
              </p>
            </div>
            <p className="text-sm whitespace-pre-wrap leading-relaxed font-medium text-foreground">
              {[s.summary, s.findings, s.notes].filter(Boolean).join("\n\n")}
            </p>
          </div>
        )}

        {/* Follow-up callout removed — surfaced in the top banner already. */}

        {s.special_notes && !/^\s*Follow-up units from/i.test(s.special_notes) && (
          <div className="bg-amber-50 border border-amber-400 rounded-lg p-2.5">
            <p className="text-sm text-amber-700">{s.special_notes}</p>
          </div>
        )}

        {s.prep_required && s.prep_notes && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-2.5">
            <p className="text-sm font-medium text-blue-700">Prep Required</p>
            <p className="text-sm text-blue-600 mt-0.5">{s.prep_notes}</p>
          </div>
        )}

        {/* Photos */}
        {Array.isArray(s.photos) && s.photos.length > 0 && (
          <div>
            <p className="text-sm font-semibold text-muted-foreground mb-1.5 flex items-center gap-1">
              <Image className="w-3.5 h-3.5" />Photos ({s.photos.length})
            </p>
            <div className="grid grid-cols-3 gap-1.5">
              {(s.photos as any[]).map((photo, idx) => {
                const url = typeof photo === "string" ? photo : photo?.url || photo?.src;
                if (!url) return null;
                return (
                  <a key={idx} href={url} target="_blank" rel="noopener noreferrer" className="block aspect-square rounded-md overflow-hidden border border-border hover:border-primary/50 transition-all hover:shadow-md">
                    <img src={url} alt={`Service photo ${idx + 1}`} className="w-full h-full object-cover" loading="lazy" />
                  </a>
                );
              })}
            </div>
          </div>
        )}

        {/* Actions */}
        {!isProjected && (
          <div className="flex gap-1.5 pt-1 border-t border-border mt-2">
            <Button variant="ghost" size="sm" className="h-7 text-xs ml-auto" onClick={() => onDeleteService(s.id)}>
              <Trash2 className="w-3 h-3 text-destructive" />
            </Button>
          </div>
        )}

        {/* Inline service report form for upcoming services — always visible (mirrors Previous Services format).
            Also shown for PROJECTED services (no date scheduled yet) so the
            technician / admin can preview the merged "Units to be Treated"
            and pre-fill notes before a date is locked in. Completion is
            blocked until a real date is saved. */}
        {isUpcoming && (() => {
          // Auto-init completion data on first render for this expanded upcoming service
          if (!completionData[s.id]) {
            setTimeout(() => initCompletionData(s.id, displayUnits, merged.unitContexts), 0);
            return (
              <div className="text-xs text-muted-foreground py-2 text-center">Loading service report form…</div>
            );
          }
          const cd = completionData[s.id];
          const latestSourceByUnit = new Map(
            merged.unitContexts.map((uc) => [
              String(uc.unit_number),
              uc.source === "work_order"
                ? "new-work-order"
                : uc.source === "follow_up"
                  ? "follow-up"
                  : uc.source,
            ])
          );
          const hasSourceDrift = cd.unitRows.some((row: any) => {
            const latest = latestSourceByUnit.get(String(row.unit_number));
            return latest && row.source !== latest;
          });
          if (hasSourceDrift) {
            setTimeout(() => {
              setCompletionData(prev => {
                const current = prev[s.id];
                if (!current) return prev;
                return {
                  ...prev,
                  [s.id]: {
                    ...current,
                    unitRows: current.unitRows.map((row: any) => {
                      const latest = latestSourceByUnit.get(String(row.unit_number));
                      return latest ? { ...row, source: latest } : row;
                    }),
                  },
                };
              });
            }, 0);
          }
          // Detect units that are in the merged set (open work orders, follow-ups,
          // newly-planned units) but NOT yet in the editor — append them so the
          // "Areas Treated" count always matches the "unique units" badge above.
          const existingUnitSet = new Set(
            cd.unitRows.map((r: any) => String(r.unit_number || "").trim()).filter(Boolean)
          );
          // Also exclude any unit the admin JUST removed (before the DB refresh
          // has propagated dismissed_units back through `merged.unitContexts`).
          const localDismissed = recentlyDismissedUnits[s.id] || new Set<string>();
          const missingContexts = merged.unitContexts.filter(
            (uc) => {
              const u = String(uc.unit_number).trim();
              return !existingUnitSet.has(u) && !localDismissed.has(u);
            }
          );
          if (missingContexts.length > 0) {
            setTimeout(() => {
              setCompletionData(prev => {
                const current = prev[s.id];
                if (!current) return prev;
                const have = new Set(
                  current.unitRows.map((r: any) => String(r.unit_number || "").trim()).filter(Boolean)
                );
                const additions = missingContexts
                  .filter((uc) => !have.has(String(uc.unit_number).trim()))
                  .map((ctx) => {
                    const fu = ctx.follow_up;
                    const lastDetail = ctx.last_unit_detail;
                    return {
                      unit_number: ctx.unit_number,
                      target_pest: ctx.target_pest || "",
                      findings: "",
                      pest_activity: fu?.pest_activity || lastDetail?.pest_activity || "None",
                      products_used: [] as ProductUsage[],
                      status: "To Be Treated",
                      notes: ctx.notes || "",
                      source: ctx.source === "work_order"
                        ? "new-work-order"
                        : ctx.source === "follow_up"
                          ? "follow-up"
                          : ctx.source,
                      request_id: ctx.request?.id,
                    };
                  });
                if (additions.length === 0) return prev;
                return {
                  ...prev,
                  [s.id]: { ...current, unitRows: [...current.unitRows, ...additions] },
                };
              });
            }, 0);
          }
          const updateRow = (idx: number, field: string, value: any) => {
            setCompletionData(prev => {
              const rows = [...prev[s.id].unitRows];
              rows[idx] = { ...rows[idx], [field]: value };
              return { ...prev, [s.id]: { ...prev[s.id], unitRows: rows } };
            });
          };
          const addRow = () => {
            setCompletionData(prev => ({
              ...prev,
              [s.id]: { ...prev[s.id], unitRows: [...prev[s.id].unitRows, { unit_number: "", target_pest: "", findings: "", pest_activity: "None", products_used: [] as ProductUsage[], status: "To Be Treated", notes: "", source: "" }] },
            }));
          };
          // Sort the Areas Treated list numerically by unit number. Pure
          // numerics first (ascending), then anything non-numeric falls to
          // the bottom alphabetically. Empty rows stay at the end so the
          // tech can keep filling them in without them jumping around.
          const sortRowsNumerically = () => {
            setCompletionData(prev => {
              const cur = prev[s.id];
              if (!cur || !Array.isArray(cur.unitRows)) return prev;
              const rows = [...cur.unitRows];
              const keyOf = (r: any) => String(r?.unit_number || "").trim();
              const numOf = (k: string) => {
                const m = k.match(/-?\d+(?:\.\d+)?/);
                return m ? parseFloat(m[0]) : NaN;
              };
              rows.sort((a, b) => {
                const ka = keyOf(a), kb = keyOf(b);
                if (!ka && !kb) return 0;
                if (!ka) return 1;
                if (!kb) return -1;
                const na = numOf(ka), nb = numOf(kb);
                const aNum = !Number.isNaN(na), bNum = !Number.isNaN(nb);
                if (aNum && bNum && na !== nb) return na - nb;
                if (aNum && !bNum) return -1;
                if (!aNum && bNum) return 1;
                return ka.localeCompare(kb, undefined, { numeric: true, sensitivity: "base" });
              });
              return { ...prev, [s.id]: { ...cur, unitRows: rows } };
            });
          };
          const setRowProducts = (idx: number, next: ProductUsage[]) => {
            setCompletionData(prev => {
              const rows = [...prev[s.id].unitRows];
              rows[idx] = { ...rows[idx], products_used: next };
              return { ...prev, [s.id]: { ...prev[s.id], unitRows: rows } };
            });
          };
          const removeRow = async (idx: number) => {
            const row = cd.unitRows[idx];
            const unitLabel = String(row?.unit_number || "").trim();
            const ok = window.confirm(
              unitLabel
                ? `Remove ${unitLabel} from this upcoming service? This won't delete past records — it just takes the unit off the list of areas to be treated on this visit.`
                : "Remove this area from the upcoming service?"
            );
            if (!ok) return;

            // Drop the row from the on-screen editor immediately.
            setCompletionData(prev => ({
              ...prev,
              [s.id]: { ...prev[s.id], unitRows: prev[s.id].unitRows.filter((_, i) => i !== idx) },
            }));

            // Seed the local-dismissed set so the auto-merge effect doesn't
            // re-add this unit before the DB refresh propagates the persisted
            // dismissed_units list. This is what was causing the unit to
            // "disappear for a second then come back".
            if (unitLabel) {
              setRecentlyDismissedUnits(prev => {
                const next = new Set(prev[s.id] || []);
                next.add(unitLabel);
                return { ...prev, [s.id]: next };
              });
            }

            // For real (non-projected) services, persist the deletion so the
            // unit doesn't reappear from the work-order / follow-up auto-merge.
            // We do this by:
            //   (a) adding the unit_number to report_data.dismissed_units, and
            //   (b) stripping it from units_planned if present.
            // For PROJECTED (not-yet-materialized) services, there's no row to
            // persist on — so we instead record the dismissal on the most
            // recent past service's `report_data.dismissed_follow_ups` so the
            // follow-up never rolls forward again. A NEW work order for that
            // same unit still surfaces (work orders use their own filter).
            if (!unitLabel) return;
            if ((s as any).isProjected || !s.id || String(s.id).startsWith("projected-")) {
              try {
                const mostRecent = pastServices[0];
                if (!mostRecent?.id) return;
                const existingRD =
                  (mostRecent as any).report_data && typeof (mostRecent as any).report_data === "object"
                    ? { ...((mostRecent as any).report_data as any) }
                    : {};
                const existingDismissed = Array.isArray(existingRD.dismissed_follow_ups)
                  ? (existingRD.dismissed_follow_ups as any[])
                  : [];
                const normalized = existingDismissed
                  .map((e) => {
                    if (typeof e === "string") {
                      const u = String(e).trim();
                      return u ? { unit: u, at: "" } : null;
                    }
                    if (e && typeof e === "object") {
                      const u = String((e as any).unit || "").trim();
                      if (!u) return null;
                      return { unit: u, at: String((e as any).at || "") };
                    }
                    return null;
                  })
                  .filter(Boolean) as { unit: string; at: string }[];
                const filtered = normalized.filter((e) => e.unit !== unitLabel);
                const nextRD = {
                  ...existingRD,
                  dismissed_follow_ups: [
                    ...filtered,
                    { unit: unitLabel, at: new Date().toISOString() },
                  ],
                };
                const { error } = await supabase
                  .from("portal_services")
                  .update({ report_data: nextRD })
                  .eq("id", mostRecent.id);
                if (error) throw error;
                toast({ title: `Removed ${unitLabel} — won't roll forward again` });
                onRefresh();
              } catch (err: any) {
                toast({
                  title: "Could not save removal",
                  description: err?.message || "Unknown error",
                  variant: "destructive",
                });
              }
              return;
            }
            try {
              const existingReportData =
                (s as any).report_data && typeof (s as any).report_data === "object"
                  ? { ...((s as any).report_data as any) }
                  : {};
              const existingDismissed = Array.isArray(existingReportData.dismissed_units)
                ? (existingReportData.dismissed_units as any[])
                : [];
              // Normalize legacy string entries → object form, then append the
              // new dismissal with a timestamp so future work orders for the
              // same unit will still surface on this service.
              const normalizedExisting = existingDismissed
                .map((entry) => {
                  if (typeof entry === "string") {
                    const u = String(entry).trim();
                    return u ? { unit: u, at: "" } : null;
                  }
                  if (entry && typeof entry === "object") {
                    const u = String((entry as any).unit || "").trim();
                    if (!u) return null;
                    return { unit: u, at: String((entry as any).at || "") };
                  }
                  return null;
                })
                .filter(Boolean) as { unit: string; at: string }[];
              // Replace any prior entry for this unit with the latest timestamp.
              const filtered = normalizedExisting.filter(e => e.unit !== unitLabel);
              const nextDismissed = [
                ...filtered,
                { unit: unitLabel, at: new Date().toISOString() },
              ];
              const nextReportData = { ...existingReportData, dismissed_units: nextDismissed };

              const existingPlanned = Array.isArray(s.units_planned)
                ? (s.units_planned as string[]).map(u => String(u).trim()).filter(Boolean)
                : [];
              const nextPlanned = existingPlanned.filter(u => u !== unitLabel);

              const { error } = await supabase
                .from("portal_services")
                .update({
                  units_planned: nextPlanned,
                  report_data: nextReportData,
                })
                .eq("id", s.id);
              if (error) throw error;
              toast({ title: `Removed ${unitLabel} from this service` });
              onRefresh();
            } catch (err: any) {
              toast({
                title: "Could not save removal",
                description: err?.message || "Unknown error",
                variant: "destructive",
              });
            }
          };
          const flaggedCount = cd.unitRows.filter((r: any) => r.follow_up_needed === true).length;

          return (
            <div className="space-y-3 pt-2 border-t border-border mt-2">
              <div className="bg-gradient-to-br from-primary/[0.04] to-transparent rounded-lg p-3 space-y-3 border border-primary/20">
                <p className="text-xs font-bold text-foreground flex items-center gap-1.5">
                  <CheckCircle className="w-4 h-4 text-green-600" />
                  Service Report — fill out as you work
                </p>

                {/* Technician + Time In/Out */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div>
                    <Label className="text-xs font-semibold">Technician</Label>
                    <Select value={cd.technician || ""}
                      onValueChange={(v) => setCompletionData(prev => ({ ...prev, [s.id]: { ...prev[s.id], technician: v } }))}>
                      <SelectTrigger className="h-9 text-xs mt-0.5"><SelectValue placeholder="Select technician" /></SelectTrigger>
                      <SelectContent>
                        {TECHNICIAN_OPTIONS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs font-semibold">Time In</Label>
                    <Input type="time" className="h-7 text-xs mt-0.5" value={cd.time_in}
                      onChange={e => setCompletionData(prev => ({ ...prev, [s.id]: { ...prev[s.id], time_in: e.target.value } }))} />
                  </div>
                  <div>
                    <Label className="text-xs font-semibold">Time Out</Label>
                    <Input type="time" className="h-7 text-xs mt-0.5" value={cd.time_out}
                      onChange={e => setCompletionData(prev => ({ ...prev, [s.id]: { ...prev[s.id], time_out: e.target.value } }))} />
                  </div>
                </div>

                {/* Summary — single large box, above the units table */}
                <div className="rounded-lg border border-border bg-muted/20 p-3">
                  <Label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Summary</Label>
                  <Textarea className="text-xs min-h-[120px] mt-1.5 bg-background resize-y" placeholder="Service summary..." value={cd.summary}
                    onChange={e => setCompletionData(prev => ({ ...prev, [s.id]: { ...prev[s.id], summary: e.target.value, findings: "", notes: "" } }))} />
                </div>

                {/* Unit-by-unit table — same format as Previous Services */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <Label className="text-xs font-semibold">Areas Treated ({cd.unitRows.length})</Label>
                    <div className="flex items-center gap-1.5">
                      <Button variant="outline" size="sm" className="h-6 text-xs px-2" onClick={sortRowsNumerically} title="Sort areas by unit number">
                        Sort #
                      </Button>
                      <Button variant="outline" size="sm" className="h-6 text-xs px-2" onClick={addRow}>
                        <Plus className="w-3 h-3 mr-0.5" />Add Area
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-6">
                    {cd.unitRows.map((row: any, idx: number) => {
                      const isFollowUp = row.source === "follow-up";
                      const isWorkOrder = row.source === "new-work-order";
                      // Look up the work-order kind (Inspection vs Treatment) so the
                      // header badge + context label match what was actually requested.
                      const ucForRow = merged.unitContexts.find(
                        (c) => String(c.unit_number) === String(row.unit_number)
                      );
                      const reqTypeLower = (ucForRow?.request?.request_type || "").toLowerCase();
                      const isInspectionWO = isWorkOrder && reqTypeLower.includes("inspection");
                      // Allow the technician to flip the visit kind (Treatment <->
                      // Inspection) per row. Falls back to whatever the work order
                      // requested, otherwise defaults to "treatment".
                      const rowKind: "treatment" | "inspection" =
                        row.kind === "treatment" || row.kind === "inspection"
                          ? row.kind
                          : (isInspectionWO ? "inspection" : "treatment");
                      const isInspection = rowKind === "inspection";
                      const woLabel = isInspection ? "Inspection" : "Treatment";
                      const unitKey = `pd-up:${s.id}:${idx}`;
                      const isUnitOpen = expandedUnitKeys.has(unitKey);
                      const pendingAdHocCount = adHocServices.filter(
                        (a) => a.status !== "completed" && a.id !== s.id
                      ).length;
                      const canDragToAdHoc =
                        isUpcoming && pendingAdHocCount > 0 && !!String(row.unit_number || "").trim();
                      return (
                        <div
                          key={idx}
                          draggable={canDragToAdHoc}
                          onDragStart={(e) => {
                            if (!canDragToAdHoc) return;
                            const label = String(row.unit_number || "").trim();
                            if (!label) return;
                            setDragUnit({ sourceServiceId: s.id, unit: label, row });
                            try {
                              e.dataTransfer.effectAllowed = "move";
                              e.dataTransfer.setData("text/plain", `unit:${label}`);
                            } catch {}
                          }}
                          onDragEnd={() => {
                            setDragUnit(null);
                            setDragOverAdHocId(null);
                          }}
                          className={`rounded-xl border-2 bg-card shadow-md ring-1 ring-border overflow-hidden ${
                            isFollowUp
                              ? "border-orange-500"
                              : isWorkOrder
                                ? "border-primary/70"
                                : "border-primary/60"
                          } ${canDragToAdHoc ? "cursor-grab active:cursor-grabbing" : ""}`}
                        >
                          {/* Bold colored header bar — visually separates each area */}
                          <div
                            role="button"
                            tabIndex={0}
                            onClick={(e) => {
                              const t = e.target as HTMLElement;
                              if (t.closest("input, select, button, textarea, [data-no-toggle], [role='combobox'], [data-radix-collection-item]")) return;
                              toggleUnitKey(unitKey);
                            }}
                            onKeyDown={(e) => {
                              if ((e.key === "Enter" || e.key === " ") && (e.target as HTMLElement) === e.currentTarget) {
                                e.preventDefault();
                                toggleUnitKey(unitKey);
                              }
                            }}
                            aria-expanded={isUnitOpen}
                            className={`flex items-center justify-between gap-3 px-4 py-3 cursor-pointer select-none transition-colors ${
                              isFollowUp
                                ? "bg-orange-100 hover:bg-orange-200/60 border-b-2 border-orange-500"
                                : isWorkOrder
                                  ? "bg-primary/10 hover:bg-primary/15 border-b-2 border-primary/60"
                                  : "bg-muted/40 hover:bg-muted/60 border-b-2 border-border"
                            } ${isUnitOpen ? "" : "border-b-0"}`}
                          >
                            <div className="flex items-center gap-3 flex-wrap">
                              <div className={`shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shadow-sm ${
                                isFollowUp ? "bg-orange-500 text-white" : "bg-primary text-primary-foreground"
                              }`}>
                                {idx + 1}
                              </div>
                              <Input
                                className="h-9 text-lg font-bold w-40 px-2 bg-background"
                                placeholder="Area / Unit / Room"
                                value={row.unit_number}
                                onChange={e => updateRow(idx, "unit_number", e.target.value)}
                              />
                              {/* Visit kind toggle — click to flip Treatment <-> Inspection.
                                  Always shown so any area can be reclassified, not just
                                  rows that came from a work order. */}
                              <button
                                type="button"
                                data-no-toggle
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const next = isInspection ? "treatment" : "inspection";
                                  updateRow(idx, "kind", next);
                                  // Reset the status so it lines up with the new option set.
                                  updateRow(idx, "status", "To Be Treated");
                                }}
                                title="Click to switch between Treatment and Inspection"
                                className={`text-xs font-bold uppercase tracking-wide px-2.5 py-1 rounded border-2 transition-colors ${
                                  isInspection
                                    ? "text-sky-900 bg-sky-100 border-sky-600 hover:bg-sky-200"
                                    : "text-primary-foreground bg-primary border-primary hover:bg-primary/90"
                                }`}
                              >
                                {woLabel}
                              </button>
                              {isFollowUp && (
                                <span className="text-xs font-semibold uppercase tracking-wide text-orange-700 bg-background border border-orange-500 px-2 py-0.5 rounded">Follow-up</span>
                              )}
                              {(() => {
                                // Per-unit occupancy editor. Shows on EVERY
                                // unit row so the tech can mark Vacant /
                                // Occupied at a glance. Falls back to the
                                // occupancy from the most recent work order
                                // when nothing has been set on this property
                                // yet. Persists to
                                // property.customer_preferences.unit_occupancy.
                                const key = String(row.unit_number || "").trim();
                                const prefs: any = property.customer_preferences || {};
                                const occMap = (prefs.unit_occupancy || {}) as Record<string, "Occupied" | "Vacant">;
                                const ctx = merged.unitContexts.find(
                                  (u) => String(u.unit_number).trim() === key
                                );
                                const current = (key && occMap[key]) || ctx?.occupancy_status || "";
                                const setOcc = async (next: "Occupied" | "Vacant" | "") => {
                                  if (!key) return;
                                  const nextMap = { ...occMap };
                                  if (next) nextMap[key] = next;
                                  else delete nextMap[key];
                                  const updatedPrefs = { ...prefs, unit_occupancy: nextMap };
                                  const { error } = await supabase
                                    .from("portal_properties")
                                    .update({ customer_preferences: updatedPrefs })
                                    .eq("id", property.id);
                                  if (error) {
                                    toast({ title: "Couldn't save occupancy", description: error.message, variant: "destructive" });
                                    return;
                                  } else {
                                    (property as any).customer_preferences = updatedPrefs;
                                  }
                                  // Keep the open work order(s) for this unit
                                  // in sync so the WO record always reflects
                                  // the latest Occupied/Vacant call.
                                  try {
                                    await supabase
                                      .from("portal_requests")
                                      .update({ occupancy_status: next || null, updated_at: new Date().toISOString() } as any)
                                      .eq("property_id", property.id)
                                      .eq("unit_number", key)
                                      .in("status", ["pending", "in_progress"]);
                                  } catch (e) {
                                    console.warn("sync work order occupancy failed", e);
                                  }
                                };
                                // Show ONLY the unit's current occupancy
                                // (whichever was filled out on the work order).
                                // When nothing has been set, default to Vacant.
                                // Click the badge to flip to the other state.
                                const effective: "Occupied" | "Vacant" =
                                  current === "Occupied" ? "Occupied" : "Vacant";
                                const cls = effective === "Occupied"
                                  ? "text-emerald-800 bg-emerald-50 border-emerald-400"
                                  : "text-slate-800 bg-slate-100 border-slate-400";
                                return (
                                  <div className="flex items-center" data-no-toggle onClick={(e) => e.stopPropagation()}>
                                    <button
                                      type="button"
                                      data-no-toggle
                                      disabled={!key}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setOcc(effective === "Occupied" ? "Vacant" : "Occupied");
                                      }}
                                      className={`text-[11px] font-bold uppercase tracking-wide px-2 py-0.5 rounded border transition-colors ${cls} ${!key ? "opacity-50 cursor-not-allowed" : ""}`}
                                      title="Click to switch occupancy"
                                    >
                                      {effective}
                                    </button>
                                  </div>
                                );
                              })()}
                              {(() => {
                                const todayStr = new Date().toISOString().slice(0, 10);
                                const moveIns = ((property.customer_preferences as any)?.tenant_move_ins || {}) as Record<string, string>;
                                const moveDate = moveIns[String(row.unit_number || "").trim()];
                                if (!moveDate || moveDate.slice(0, 10) < todayStr) return null;
                                // Don't show the new-tenant move-in tag when the unit is occupied.
                                const ctx = merged.unitContexts.find(
                                  (u) => String(u.unit_number).trim() === String(row.unit_number || "").trim()
                                );
                                if (ctx?.occupancy_status === "Occupied") return null;
                                const isFollowUp = row.source === "follow-up" || row.kind === "follow-up";
                                const badgeCls = isFollowUp
                                  ? "text-orange-900 bg-orange-100 border border-orange-400"
                                  : "text-rose-900 bg-rose-100 border border-rose-400";
                                return (
                                  <span
                                    className={`text-xs font-bold uppercase tracking-wide ${badgeCls} px-2 py-0.5 rounded shadow-sm`}
                                    title="New tenant move-in date — keep this unit pristine"
                                  >
                                    🏠 New Tenant · {moveDate.slice(5, 10).replace("-", "/")}
                                  </span>
                                );
                              })()}
                              {/* Target Pest (in-header) */}
                              <div data-no-toggle onClick={(e) => e.stopPropagation()}>
                                <Select value={row.target_pest || "__none__"} onValueChange={(v) => updateRow(idx, "target_pest", v === "__none__" ? "" : v)}>
                                  <SelectTrigger className="h-9 text-xs font-semibold w-[160px] bg-background">
                                    <SelectValue placeholder="Target Pest…" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="__none__">— None —</SelectItem>
                                    {PEST_TYPES.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <div data-no-toggle onClick={(e) => e.stopPropagation()}>
                                <Select value={row.status} onValueChange={(v) => updateRow(idx, "status", v)}>
                                  <SelectTrigger className={`h-9 text-sm w-[230px] font-semibold border-2 ${
                                    row.status === "Inspected: Activity Found"
                                      ? "text-orange-700 border-orange-500 bg-orange-50"
                                      : row.status === "To Be Treated"
                                        ? "text-primary-foreground border-primary bg-primary"
                                        : row.status === "Not Treated"
                                          ? "text-muted-foreground border-border bg-background"
                                          : "text-foreground border-primary/70 bg-background"
                                  }`}>
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {(isInspection ? INSPECTION_STATUS_OPTIONS : TREATMENT_STATUS_OPTIONS).map(a => (
                                      <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); removeRow(idx); }}
                                className="text-muted-foreground hover:text-destructive p-1"
                                title="Remove area"
                              >
                                <X className="w-4 h-4" />
                              </button>
                              <ChevronDown className={`w-5 h-5 text-muted-foreground transition-transform ${isUnitOpen ? "rotate-180" : ""}`} />
                            </div>
                          </div>
                          {/* Card body — left 2/3 fields, right 1/3 unit photos */}
                          {isUnitOpen && (
                          <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-3">
                            {/* ── New-tenant move-in date editor (mission-critical) ──
                                Hidden when the unit is currently Occupied — the move-in
                                date is only meaningful for vacant/turnover units. */}
                            {(() => {
                              const uc = merged.unitContexts.find(
                                (c) => String(c.unit_number).trim() === String(row.unit_number || "").trim()
                              );
                              if (uc?.occupancy_status === "Occupied") return null;
                              return (
                            <div className="md:col-span-2 rounded-lg border-2 border-rose-300 bg-rose-50/60 p-3 flex flex-wrap items-center gap-2">
                              <span className="text-[11px] font-bold text-rose-900 uppercase tracking-wide">
                                🏠 New Tenant Move-In
                              </span>
                              {(() => {
                                const prefs: any = property.customer_preferences || {};
                                const map = (prefs.tenant_move_ins || {}) as Record<string, string>;
                                const key = String(row.unit_number || "").trim();
                                const current = key ? (map[key] || "") : "";
                                return (
                                  <>
                                    <input
                                      type="date"
                                      className="h-8 rounded border border-rose-300 bg-background px-2 text-sm"
                                      value={current}
                                      min={new Date().toISOString().slice(0, 10)}
                                      disabled={!key}
                                      onChange={async (e) => {
                                        if (!key) return;
                                        const dateVal = e.target.value || null;
                                        const nextMap = { ...map };
                                        if (dateVal) nextMap[key] = dateVal;
                                        else delete nextMap[key];
                                        const updatedPrefs = { ...prefs, tenant_move_ins: nextMap };
                                        const { error } = await supabase
                                          .from("portal_properties")
                                          .update({ customer_preferences: updatedPrefs })
                                          .eq("id", property.id);
                                        if (error) {
                                          toast({ title: "Couldn't save move-in date", description: error.message, variant: "destructive" });
                                        } else {
                                          (property as any).customer_preferences = updatedPrefs;
                                          toast({ title: dateVal ? "Move-in date saved" : "Move-in date cleared", duration: 1500 });
                                        }
                                      }}
                                    />
                                    <span className="text-[11px] text-rose-900/80">
                                      {key
                                        ? "Tag stays on this unit through every follow-up until the date passes, then auto-clears."
                                        : "Enter a unit number above to set a move-in date."}
                                    </span>
                                  </>
                                );
                              })()}
                            </div>
                              );
                            })()}
                            {(() => {
                              const uc = merged.unitContexts.find(
                                (c) => String(c.unit_number) === String(row.unit_number)
                              );
                              if (!uc) return null;
                              const orig = !isWorkOrder ? (uc.original_request as any) : null;
                              const origSummary = orig
                                ? [
                                    `${orig.pest_type || "Pest"} activity reported${orig.location_type ? ` (${orig.location_type})` : ""}${orig.description ? `: ${orig.description}` : ""}`,
                                    orig.occupancy_status ? `Unit status: ${orig.occupancy_status}` : null,
                                  ].filter(Boolean).join("\n")
                                : "";
                              const origIsInspection = orig
                                ? String(orig.request_type || "").toLowerCase().includes("inspection")
                                : false;
                              const origOpened = orig?.created_at
                                ? new Date(orig.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                                : null;
                              if (!uc.context && !uc.findings && !orig) return null;
                              return (
                                <div className="md:col-span-2 rounded-lg border-2 border-sky-500 bg-sky-50/60 p-3 space-y-2.5">
                                  {uc.context && (
                                    <div>
                                      <div className="flex items-center gap-1.5 mb-1">
                                        <ClipboardList className="w-3.5 h-3.5 text-sky-700" />
                                        <Label className="text-xs font-bold text-sky-900 uppercase tracking-wide">
                                          {isWorkOrder
                                            ? (isInspectionWO ? "Inspection Request Context" : "Treatment Request Context")
                                            : "Last Service Context"}
                                        </Label>
                                      </div>
                                      <p className="text-sm whitespace-pre-wrap leading-snug text-foreground">
                                        {uc.context}
                                      </p>
                                    </div>
                                  )}
                                  {uc.findings && (
                                    <div className={uc.context ? "pt-2 border-t border-sky-200" : ""}>
                                      <div className="flex items-center gap-1.5 mb-1">
                                        <ClipboardList className="w-3.5 h-3.5 text-amber-700" />
                                        <Label className="text-xs font-bold text-amber-900 uppercase tracking-wide">
                                          Findings (from last visit)
                                        </Label>
                                      </div>
                                      <p className="text-sm whitespace-pre-wrap leading-snug text-foreground">
                                        {uc.findings}
                                      </p>
                                    </div>
                                  )}
                                  {orig && (
                                    <div className={(uc.context || uc.findings) ? "pt-2 border-t border-sky-200" : ""}>
                                      <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                                        <ClipboardList className="w-3.5 h-3.5 text-indigo-700" />
                                        <Label className="text-xs font-bold text-indigo-900 uppercase tracking-wide">
                                          Original {origIsInspection ? "Inspection" : "Work"} Order
                                        </Label>
                                        {origOpened && (
                                          <span className="text-[11px] text-indigo-900/70">opened {origOpened}</span>
                                        )}
                                      </div>
                                      <p className="text-sm whitespace-pre-wrap leading-snug text-foreground">
                                        {origSummary}
                                      </p>
                                    </div>
                                  )}
                                </div>
                              );
                            })()}
                            <div className="md:col-span-2">
                              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Activity Level</Label>
                              <select
                                className="h-9 text-sm w-full bg-background border border-input rounded-md px-2 cursor-pointer mt-1"
                                value={row.pest_activity || "None"}
                                onChange={e => updateRow(idx, "pest_activity", e.target.value)}
                              >
                                {ACTIVITY_OPTIONS.map(a => <option key={a} value={a}>{a}</option>)}
                              </select>
                            </div>
                            <div className="md:col-span-2">
                              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Products Used</Label>
                              <div className="mt-1">
                                <UnitProductPicker
                                  value={Array.isArray(row.products_used)
                                    ? (row.products_used as any[]).map((p: any) => typeof p === "string" ? p : p?.name).filter(Boolean)
                                    : (row.products_used || "")}
                                  onChange={(next) => updateRow(idx, "products_used", next as any)}
                                  previousValue={idx > 0 ? (() => {
                                    const prev = cd.unitRows[idx - 1] as any;
                                    const pv = prev?.products_used;
                                    if (Array.isArray(pv)) return pv.map((p: any) => typeof p === "string" ? p : p?.name).filter(Boolean);
                                    return pv || "";
                                  })() : undefined}
                                />
                              </div>
                            </div>
                            {/* FINDINGS — highlighted amber box (visible to customer) */}
                            <div className="md:col-span-2 rounded-lg border-2 border-amber-500 bg-amber-50/60 p-3">
                              <div className="flex items-center gap-1.5 mb-1.5">
                                <ClipboardList className="w-3.5 h-3.5 text-amber-700" />
                                <Label className="text-xs font-bold text-amber-900 uppercase tracking-wide">
                                  Technician Findings (visible to customer)
                                </Label>
                              </div>
                              <div className="mb-2">
                                <select
                                  className="h-7 text-[11px] px-2 rounded border border-amber-300 bg-background w-full sm:w-auto cursor-pointer"
                                  value=""
                                  onChange={(e) => {
                                    const preset = PRESET_NOTES.find(p => p.id === e.target.value);
                                    if (!preset) return;
                                    const existing = (row.findings || "").trim();
                                    const next = existing ? `${existing}\n\n${preset.text}` : preset.text;
                                    updateRow(idx, "findings", next);
                                    e.target.value = "";
                                  }}
                                >
                                  <option value="">+ Insert preset note…</option>
                                  {PRESET_NOTES.map(p => (
                                    <option key={p.id} value={p.id}>{p.label}</option>
                                  ))}
                                </select>
                              </div>
                              <Textarea
                                className="text-sm w-full px-2.5 py-2 min-h-[5rem] leading-snug whitespace-normal bg-background border-amber-400 focus-visible:ring-amber-400"
                                placeholder="What did the technician observe in this area?"
                                value={row.findings}
                                onChange={e => updateRow(idx, "findings", e.target.value)}
                              />
                            </div>
                            {/* Follow-up + Sanitization checkboxes — must be CHECKED to auto-add to next service */}
                            <div className="md:col-span-2 rounded-lg border-2 border-orange-400 bg-orange-50/50 p-3 flex flex-col sm:flex-row gap-3 sm:gap-6">
                              <label className="flex items-center gap-2 cursor-pointer select-none">
                                <Checkbox
                                  checked={!!row.follow_up_needed}
                                  onCheckedChange={(v) => updateRow(idx, "follow_up_needed" as any, !!v)}
                                />
                                <span className="text-sm font-semibold text-orange-900">Follow Up Needed</span>
                                <span className="text-[11px] text-muted-foreground">(auto-adds to next service)</span>
                              </label>
                              <label className="flex items-center gap-2 cursor-pointer select-none">
                                <Checkbox
                                  checked={!!row.sanitization_concern}
                                  onCheckedChange={(v) => updateRow(idx, "sanitization_concern" as any, !!v)}
                                />
                                <span className="text-sm font-semibold text-orange-900">Sanitization Concern</span>
                              </label>
                            </div>
                            </div>
                            {/* Per-unit photos — right 1/3 */}
                            <div className="md:col-span-1 rounded-lg border-2 border-primary/40 bg-primary/[0.04] p-3 self-start">
                              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                                <Image className="w-3.5 h-3.5" />
                                Unit Photos {Array.isArray((row as any).photos) && (row as any).photos.length > 0 && (
                                  <span className="text-muted-foreground font-normal normal-case">({(row as any).photos.length})</span>
                                )}
                              </Label>
                              <label className="cursor-pointer block mt-1">
                                <div className={`w-full border-2 border-dashed rounded-lg py-3 px-3 flex items-center justify-center gap-2 transition-all ${uploadingCompletionUnitPhotoFor === `${s.id}:${idx}` ? "bg-muted border-primary/70" : "border-primary/40 bg-primary/[0.03] hover:bg-primary/[0.06] hover:border-primary/60"}`}>
                                  {uploadingCompletionUnitPhotoFor === `${s.id}:${idx}` ? (
                                    <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                                  ) : (
                                    <Plus className="w-4 h-4 text-primary" />
                                  )}
                                  <span className="text-xs font-semibold text-foreground">
                                    {uploadingCompletionUnitPhotoFor === `${s.id}:${idx}` ? "Uploading…" : "Add photo to this unit"}
                                  </span>
                                </div>
                                <input type="file" accept="image/*" multiple className="hidden"
                                  disabled={uploadingCompletionUnitPhotoFor === `${s.id}:${idx}`}
                                  onChange={async e => {
                                    const files = Array.from(e.target.files || []);
                                    (e.target as HTMLInputElement).value = "";
                                    for (const f of files) {
                                      await uploadCompletionUnitPhoto(s.id, idx, f);
                                    }
                                  }} />
                              </label>
                              {Array.isArray((row as any).photos) && (row as any).photos.length > 0 && (
                                <div className="grid grid-cols-2 gap-2 mt-2">
                                  {((row as any).photos as any[]).map((p: any, pIdx: number) => (
                                    <div key={pIdx} className="relative aspect-square rounded-md overflow-hidden border border-border group">
                                      <img src={p.url} alt={`Unit photo ${pIdx + 1}`} className="w-full h-full object-cover" />
                                      <button type="button" onClick={() => removeCompletionUnitPhoto(s.id, idx, pIdx)}
                                        className="absolute top-0.5 right-0.5 bg-background/90 rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive hover:text-destructive-foreground">
                                        <X className="w-3 h-3" />
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <button className="w-full mt-1 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded border border-dashed border-border transition-colors flex items-center justify-center gap-1"
                    onClick={addRow}>
                    <Plus className="w-3.5 h-3.5" /> Add area
                  </button>
        </div>

                {/* Service-level products used (one entry per product per service date) */}
                {(() => {
                  // Auto-merge any product names listed in the unit rows into the service-level list.
                  const unitProductNames = new Set<string>();
                  for (const r of cd.unitRows) {
                    const raw: any = (r as any).products_used;
                    if (Array.isArray(raw)) {
                      for (const p of raw) {
                        const n = typeof p === "string" ? p : (p as any)?.name;
                        if (n) unitProductNames.add(String(n).trim());
                      }
                    } else if (typeof raw === "string" && raw.trim()) {
                      raw.split(",").map((x: string) => x.trim()).filter(Boolean).forEach((n: string) => unitProductNames.add(n));
                    }
                  }
                  const existingNames = new Set((cd.products || []).map(p => p.name.toLowerCase()));
                  const missing = Array.from(unitProductNames).filter(n => !existingNames.has(n.toLowerCase()));
                  if (missing.length > 0) {
                    setTimeout(() => {
                      setCompletionData(prev => {
                        const current = prev[s.id]?.products || [];
                        const have = new Set(current.map(p => p.name.toLowerCase()));
                        const additions = missing
                          .filter(n => !have.has(n.toLowerCase()))
                          .map(n => makeDefaultUsage(n));
                        if (additions.length === 0) return prev;
                        return { ...prev, [s.id]: { ...prev[s.id], products: [...current, ...additions] } };
                      });
                    }, 0);
                  }
                  return null;
                })()}
                <div className="rounded-lg border border-border bg-muted/20 p-3">
                  <Label className="text-xs font-semibold flex items-center gap-1.5 mb-2">
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
                    <div className={`w-full border-2 border-dashed rounded-xl py-6 px-4 flex flex-col items-center justify-center gap-2 transition-all ${uploadingPhotoFor === s.id ? "bg-muted border-primary/70" : "border-primary/60 bg-primary/[0.03] hover:bg-primary/[0.06] hover:border-primary/50"}`}>
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
                        <p className="text-xs text-muted-foreground mt-0.5">Tap to take a photo or upload from gallery</p>
                      </div>
                    </div>
                    <input type="file" accept="image/*" className="hidden"
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
                        <div key={idx} className="relative aspect-square rounded-md overflow-hidden border border-border group">
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
                    <p className="text-xs font-medium text-orange-700">
                      ⚠️ {flaggedCount} unit{flaggedCount > 1 ? "s" : ""} marked "Follow Up Needed" — will auto-add to next service
                    </p>
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    className="h-9 text-xs flex-1 bg-green-600 hover:bg-green-700 text-white font-semibold disabled:opacity-60"
                    onClick={() => completeService(s.id)}
                    disabled={isProjected}
                    title={isProjected ? "Schedule a date first to complete this service" : undefined}
                  >
                    <CheckCircle className="w-4 h-4 mr-1" />
                    {isProjected
                      ? "Schedule a date to complete"
                      : flaggedCount > 0
                        ? `Complete & Flag ${flaggedCount} Follow-up${flaggedCount > 1 ? "s" : ""}`
                        : "Complete Service"}
                  </Button>
                  {!isProjected && (
                  <Button variant="ghost" size="sm" className="h-9 w-9 p-0" onClick={() => onDeleteService(s.id)} title="Delete service">
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                  )}
                </div>
              </div>
            </div>
          );
        })()}

        {/* Required pesticide notice — shown at the bottom of every completed service report */}
        {!isUpcoming && !isProjected && <PesticideNotice />}
        {/* Apartment-specific inspection disclaimer */}
        {!isUpcoming && !isProjected && propertyType === "apartments" && <ApartmentInspectionDisclaimer />}

      </div>
    );
  };

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
      {(propertyType === "hoa" || propertyType === "apartments") && (
        <div className={`mb-3 rounded-lg border-2 px-3.5 py-2 flex items-center gap-2 text-xs font-semibold ${
          propertyType === "hoa"
            ? "bg-emerald-50 border-emerald-300 text-emerald-900"
            : "bg-sky-50 border-sky-300 text-sky-900"
        }`}>
          <span className="px-1.5 py-0.5 rounded bg-white/70 border border-current/30 text-[10px] uppercase tracking-wider">
            {propertyType === "hoa" ? "HOA Portal" : "Apartment Portal"}
          </span>
        </div>
      )}
      <TabsList className={`w-full h-auto p-1.5 grid grid-cols-2 sm:grid-cols-3 ${isHOA ? "lg:grid-cols-6" : "lg:grid-cols-6"} gap-1.5 bg-muted/50 border-2 border-primary/60 rounded-xl shadow-sm mb-5`}>
        <TabsTrigger value="map" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md font-semibold text-sm py-3 rounded-lg transition-all flex flex-col items-center gap-1">
          <MapPin className="w-5 h-5" />
          <span>Site Map and Plan</span>
        </TabsTrigger>
        <TabsTrigger value="past" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md font-semibold text-sm py-3 rounded-lg transition-all flex flex-col items-center gap-1">
          <Calendar className="w-5 h-5" />
          <span>Previous Services <Badge variant="secondary" className="ml-1 text-xs h-4">{pastServicesForDisplay.length}</Badge></span>
        </TabsTrigger>
        <TabsTrigger value="request" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md font-semibold text-sm py-3 rounded-lg transition-all flex flex-col items-center gap-1">
          <Bug className="w-5 h-5" />
          <span>Add work order</span>
        </TabsTrigger>
        <TabsTrigger value="upcoming" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md font-semibold text-sm py-3 rounded-lg transition-all flex flex-col items-center gap-1">
          <ClipboardList className="w-5 h-5" />
          <span>Upcoming Services <Badge variant="secondary" className="ml-1 text-xs h-4">{allUpcoming.length}</Badge></span>
        </TabsTrigger>
        {!isHOA && (
          <TabsTrigger value="prep" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md font-semibold text-sm py-3 rounded-lg transition-all flex flex-col items-center gap-1">
            <FileDown className="w-5 h-5" />
            <span>Prep / Auth / Docs <Badge variant="secondary" className="ml-1 text-xs h-4">{prepSheets.length}</Badge></span>
          </TabsTrigger>
        )}
        <TabsTrigger value="survey" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md font-semibold text-sm py-3 rounded-lg transition-all flex flex-col items-center gap-1">
          <BarChart3 className="w-5 h-5" />
          <span>Survey <Badge variant="secondary" className="ml-1 text-xs h-4">{surveys.length}</Badge></span>
        </TabsTrigger>
        {isHOA && (
          <TabsTrigger value="quarterly" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md font-semibold text-sm py-3 rounded-lg transition-all flex flex-col items-center gap-1">
            <Video className="w-5 h-5" />
            <span>Video Reviews</span>
          </TabsTrigger>
        )}
      </TabsList>

      {/* ══════════ TAB 1: MAP & PREFERENCES ══════════ */}
      <TabsContent value="map" className="mt-0 space-y-5">
        {/* Top row: Property Plan (left) + Property Map (right) */}
        <PreApplicationNoticeCard propertyId={property.id} />
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
                    { key: "8-weekly", label: "Every 8 Weeks" },
                    { key: "bi-monthly", label: "Bi-Monthly" },
                    { key: "12-weekly", label: "Every 12 Weeks" },
                    { key: "quarterly", label: "Quarterly" },
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
                <p className="text-xs text-muted-foreground mt-1.5">
                  Used to project the next two upcoming services on this property.
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                {!isHOA && (<div>
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">
                    Included Interior Units / Service
                  </Label>
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    placeholder="e.g. 10"
                    value={includedUnitsDraft}
                    onChange={(e) => setIncludedUnitsDraft(e.target.value)}
                  />
                </div>)}
                {!isHOA && (<div>
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">
                    Price per Additional Unit
                  </Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">$</span>
                    <Input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      step="1"
                      placeholder="0"
                      className="pl-7 text-right"
                      value={overagePriceDraft}
                      onChange={(e) => setOveragePriceDraft(e.target.value.replace(/[^\d]/g, ""))}
                    />
                  </div>
                </div>)}
                <div>
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">
                    Base Price / Every 4 Weeks
                  </Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">$</span>
                    <Input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      step="1"
                      placeholder="0"
                      className="pl-7 text-right"
                      value={basePriceDraft}
                      onChange={(e) => setBasePriceDraft(e.target.value.replace(/[^\d]/g, ""))}
                    />
                  </div>
                </div>
              </div>
              <p className="text-xs text-muted-foreground -mt-1">
                Each service is billed at the base price and includes the listed number of treatments or inspections. Any treatments or inspections beyond that are billed at the additional-unit price.
              </p>
              <p className="text-[11px] font-semibold text-amber-700 italic -mt-2">
                * Pricing reflects the units serviced on the day of a scheduled service.
              </p>
              {propertyType === "commercial" && (<div className="rounded-lg border-2 border-amber-400 bg-amber-50/60 p-3">
                <Label className="text-xs font-bold uppercase tracking-wide text-amber-800 mb-1.5 block flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" />
                  Required Time per Treatment
                </Label>
                <Input
                  className="h-9 text-sm bg-background"
                  placeholder='e.g. "45 minutes", "1.5 hours", "2-3 hours per visit"'
                  value={requiredTimeDraft}
                  onChange={(e) => setRequiredTimeDraft(e.target.value)}
                />
                <p className="text-[11px] text-amber-900/80 mt-1.5">
                  Visible to the property manager and Crest admin so visits can be scheduled with enough time on-site.
                </p>
              </div>)}
              <PlanRichEditor
                placeholder="Enter the overall plan for this property — treatment strategy, special considerations, scheduling notes, etc."
                value={planDraft}
                onChange={(html) => setPlanDraft(html)}
                minHeight={640}
              />
              <p className="text-xs text-muted-foreground">
                Auto-saves a moment after you stop typing. Visible to technicians and property managers.
              </p>
            </CardContent>
          </Card>

          {/* Right column: Property Map — sized down with paste support */}
          <div className="space-y-4">
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
                className={`relative bg-muted mx-auto ${isHOA ? "max-w-[600px]" : "max-w-[520px]"}`}
                style={{ aspectRatio: isHOA ? "3 / 4.4" : "3 / 4" }}
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
                      imageFit="contain"
                    />
                  ) : property.map_data ? (
                    <ReadOnlyMapCanvas mapUrl={mapUrl} mapData={property.map_data} imageFit="contain" />
                  ) : (
                    <img src={mapUrl} alt={property.name} className="w-full h-full object-contain" />
                  )
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground gap-2 p-4 text-center">
                    <Image className="w-8 h-8 opacity-40" />
                    <p className="text-xs">No property image</p>
                    <p className="text-xs opacity-70">Click Upload, drop a file, or paste (⌘V)</p>
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
        </div>

        {/* Below top row: POCs + Cadence Plan + Equipment */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
          <div className="space-y-5">
            {/* Property Point of Contact */}
            <Card className="shadow-sm border-primary/20 bg-gradient-to-br from-primary/[0.03] to-transparent">
          <CardHeader className="pb-2 pt-3 border-b bg-primary/[0.06]">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <User className="w-5 h-5 text-primary" />
              Property Point of Contact
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-3 pb-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1 block">
                  PM / Contact Name
                </Label>
                <Input
                  className="h-8 text-sm"
                  placeholder="Full name"
                  value={pocName}
                  onChange={(e) => setPocName(e.target.value)}
                />
              </div>
              <div>
                <Label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1 block">
                  PM Phone
                </Label>
                <Input
                  className="h-8 text-sm"
                  type="tel"
                  inputMode="tel"
                  placeholder="(555) 123-4567"
                  value={pocPhone}
                  onChange={(e) => setPocPhone(e.target.value)}
                />
              </div>
              <div className="col-span-2">
                <Label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1 block">
                  PM Email
                </Label>
                <Input
                  className="h-8 text-sm"
                  type="email"
                  placeholder="email@example.com"
                  value={pocEmail}
                  onChange={(e) => setPocEmail(e.target.value)}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Crest Point of Contact — the Crest staff member the PM should contact */}
        <Card className="shadow-sm border-primary/20 bg-gradient-to-br from-primary/[0.03] to-transparent">
          <CardHeader className="pb-2 pt-3 border-b bg-primary/[0.06]">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <User className="w-5 h-5 text-primary" />
              Crest Point of Contact
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-3 pb-3 space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1 block">
                  Crest Contact Name
                </Label>
                <Input
                  className="h-8 text-sm"
                  placeholder="Full name"
                  value={crestName}
                  onChange={(e) => setCrestName(e.target.value)}
                />
              </div>
              <div>
                <Label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1 block">
                  Crest Phone
                </Label>
                <Input
                  className="h-8 text-sm"
                  type="tel"
                  inputMode="tel"
                  placeholder="(555) 123-4567"
                  value={crestPhone}
                  onChange={(e) => setCrestPhone(e.target.value)}
                />
              </div>
              <div className="col-span-2">
                <Label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1 block">
                  Crest Email
                </Label>
                <Input
                  className="h-8 text-sm"
                  type="email"
                  placeholder="email@crestpestcontrol.com"
                  value={crestEmail}
                  onChange={(e) => setCrestEmail(e.target.value)}
                />
              </div>
            </div>
            <div className="pt-2 border-t border-border">
              <Label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1 block">
                Crest Client Owner (internal)
              </Label>
              <div>
                <Select value={ownerTechDraft || "__none__"} onValueChange={saveOwnerTech}>
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue placeholder="Assign Crest staff…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Unassigned</SelectItem>
                    {STAFF_NAMES.map((n) => (
                      <SelectItem key={n} value={n}>{n}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <p className="text-[10px] text-muted-foreground mt-1.5">
                Notified (alongside the office) on any work order or message. Internal — not shown in the PM portal.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Cadence Visit Plan — explains what each visit in the rotation will cover.
            Only meaningful for weekly (4 visits / cycle) and bi-weekly (2 visits / cycle).
            For monthly / bi-monthly there is no rotation, so the card is hidden. */}
        {(propertyFrequency === "weekly" || propertyFrequency === "bi-weekly") && (() => {
          const cycleLength = propertyFrequency === "weekly" ? 4 : 2;
          const planArr = (cadencePlanDraft[propertyFrequency] || []).slice(0, cycleLength);
          while (planArr.length < cycleLength) planArr.push("");
          return (
            <Card className="shadow-sm border-primary/20 bg-gradient-to-br from-primary/[0.03] to-transparent">
              <CardHeader className="pb-3 pt-4 border-b bg-primary/[0.06]">
                <CardTitle className="text-base font-bold flex items-center gap-2">
                  <Repeat className="w-5 h-5 text-primary" />
                  Cadence Plan — {propertyFrequency === "weekly" ? "Weekly (4-visit rotation)" : "Bi-Weekly (2-visit rotation)"}
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4 space-y-3">
                <p className="text-xs text-muted-foreground">
                  Describe what the {cycleLength === 4 ? "1st, 2nd, 3rd, and 4th" : "1st and 2nd"} visit of the cycle will cover.
                  Future projected services on this property will display the matching focus.
                </p>
                <div className={`grid grid-cols-1 sm:grid-cols-2 gap-3`}>
                  {Array.from({ length: cycleLength }).map((_, idx) => (
                    <div key={idx} className="space-y-1.5">
                      <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                        <span className="inline-flex w-5 h-5 rounded-full bg-primary text-primary-foreground text-xs font-bold items-center justify-center">{idx + 1}</span>
                        Visit {idx + 1}
                      </Label>
                      <Textarea
                        rows={3}
                        className="text-xs resize-y"
                        placeholder={
                          idx === 0 ? "e.g. Full perimeter dewebbing + exterior power-spray"
                            : idx === 1 ? "e.g. Spot-treat hotspots, refill bait stations"
                            : idx === 2 ? "e.g. Interior common areas + restroom monitoring"
                            : "e.g. Trash room flush + structural exclusion check"
                        }
                        value={planArr[idx]}
                        onChange={(e) => {
                          const next = { ...cadencePlanDraft };
                          const arr = (next[propertyFrequency] || []).slice();
                          while (arr.length < cycleLength) arr.push("");
                          arr[idx] = e.target.value;
                          next[propertyFrequency] = arr;
                          setCadencePlanDraft(next);
                        }}
                      />
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Auto-saves a moment after you stop typing.
                </p>
              </CardContent>
            </Card>
          );
        })()}
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
                  <div key={eq} className={`flex items-center gap-2.5 text-xs rounded-md px-2 py-1.5 transition-all border ${isChecked ? "bg-primary/10 border-primary/60 font-medium" : "border-transparent hover:bg-muted/50 hover:border-border/50"}`}>
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
                        className="h-6 w-14 text-xs text-center border-border/50 px-1"
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
                <div key={custom.name} className="flex items-center gap-2.5 text-xs rounded-md px-2 py-1.5 transition-all border bg-primary/10 border-primary/60 font-medium">
                  <label className="flex items-center gap-2.5 cursor-pointer flex-1">
                    <input type="checkbox" checked onChange={async () => {
                      const updated = equipmentItems.filter(e => e.name !== custom.name);
                      await saveEquipment(updated);
                      toast({ title: `Removed ${custom.name}`, duration: 1500 });
                    }} className="rounded accent-[hsl(130,14%,65%)] w-3.5 h-3.5" />
                    {custom.name}
                  </label>
                  <Input type="number" min={1} className="h-6 w-14 text-xs text-center border-border/50 px-1"
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

          </div>
        </div>

        {/* ⚠️ RED NOTES — ADMIN-ONLY, compact, at the very bottom of the tab. NEVER expose in PM portal. */}
        <Card className="shadow-sm border border-red-400 bg-red-50/50 mt-4">
          <CardContent className="p-3">
            <div className="flex items-center gap-1.5 mb-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-red-700" />
              <p className="text-[11px] font-bold uppercase tracking-wide text-red-800">
                Red Notes — Admin Only (never shown to PM)
              </p>
            </div>
            <Textarea
              placeholder="Internal admin-only notes — shown at the top of every appointment in the admin portal."
              className="min-h-[70px] text-xs resize-y leading-snug bg-background border-red-300 focus-visible:ring-red-400"
              value={redNotesDraft}
              onChange={(e) => setRedNotesDraft(e.target.value)}
            />
          </CardContent>
        </Card>
      </TabsContent>

      {/* ══════════ TAB 2: PREVIOUS SERVICES ══════════ */}
      <TabsContent value="past" className="mt-0">
        <div className="space-y-3 max-w-[1600px] mx-auto">
        <div className="flex items-center justify-between pb-2.5 border-b-2 border-primary/70">
          <h3 className="text-base font-bold flex items-center gap-2">
            <Calendar className="w-5 h-5 text-secondary" />Previous Services
            <Badge variant="secondary" className="text-xs ml-1">{pastServicesForDisplay.length}</Badge>
          </h3>
          {isHOA ? (
            null
          ) : (
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
          )}
        </div>



        {pastViewMode === "date" ? (
          pastServicesForDisplay.length === 0 ? (
            <Card className="shadow-sm"><CardContent className="p-8 text-center text-muted-foreground text-sm">No past services yet</CardContent></Card>
          ) : (
            <div className="space-y-2">
              {pastServicesForDisplay.map((s, i) => {
                const isFirst = i === 0;
                const isExpanded = expandedPastId === s.id;
                const isAdHoc = isAdHocService(s);
                // Back-fill the cadence visit label for legacy past services that
                // were completed before appointment_service was being persisted.
                // pastServices is ordered most-recent first → rotation index for
                // entry i is (pastServices.length - 1 - i) % cycleLength.
                const cycleLen = propertyFrequency === "weekly" ? 4 : propertyFrequency === "bi-weekly" ? 2 : 1;
                const rotIdx = cycleLen > 1 ? (pastServices.length - 1 - i) % cycleLen : -1;
                const planArr = (cadencePlanDraft[propertyFrequency] || []) as string[];
                const cadenceLabel =
                  rotIdx >= 0 ? ((planArr[rotIdx] || "").trim()) : "";
                const displayTitle = isAdHoc
                  ? "Ad-Hoc Visit"
                  : ((s as any).appointment_service || cadenceLabel || s.service_type);
                return (
                  <Card key={s.id} className={`transition-all shadow-sm ${isExpanded ? "border-primary/20" : "hover:border-muted-foreground/30"}`}>
                    <button className="w-full text-left p-3 flex items-center justify-between" onClick={() => setExpandedPastId(isExpanded ? null : s.id)}>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          {isFirst && <Badge className="text-xs bg-primary text-primary-foreground">Most Recent</Badge>}
                          <p className={`font-semibold ${isFirst ? "text-sm" : "text-xs"}`}>{displayTitle}</p>
                          <Badge variant="default" className="text-xs">Completed</Badge>
                          {isAdHoc && <Badge className="text-xs bg-purple-600 text-white border-transparent hover:bg-purple-600">Ad-Hoc</Badge>}
                          {s.follow_up_recommended && <Badge className="text-xs bg-orange-500 text-white">Follow-up</Badge>}
                          {(() => {
                            const sentAt = (s as any)?.report_data?.pm_email_sent_at as string | undefined;
                            if (!sentAt) return null;
                            const when = (() => { try { return new Date(sentAt).toLocaleString(); } catch { return sentAt; } })();
                            const who = (s as any)?.report_data?.pm_email_recipient || "PM";
                            return (
                              <Badge
                                title={`Completion email sent to ${who} on ${when}`}
                                className="text-xs bg-emerald-600 text-white border-transparent hover:bg-emerald-600"
                              >
                                ✓ PM Emailed
                              </Badge>
                            );
                          })()}
                          {(() => {
                            const total = Array.isArray(s.unit_details) ? (s.unit_details as any[]).length : 0;
                            const ov = computeOverage(total, planCfg);
                            if (!ov.hasOverage) return null;
                            return (
                              <Badge
                                title={`${ov.totalUnits} units treated • ${ov.includedUnits} included • ${ov.unitsOver} over → +${formatOverageMoney(ov.overageCost)}`}
                                className="text-xs bg-amber-500 text-white border-transparent hover:bg-amber-500"
                              >
                                +{ov.unitsOver} over • {formatOverageMoney(ov.overageCost)}
                              </Badge>
                            );
                          })()}
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
            <>
              {/* Search across unit numbers, technician, products, findings, notes, summary */}
              <div className="relative mb-2">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="h-8 text-xs pl-8 pr-8"
                  placeholder="Search by unit, tech, product, findings…"
                  value={byUnitSearch}
                  onChange={(e) => setByUnitSearch(e.target.value)}
                />
                {byUnitSearch && (
                  <button
                    type="button"
                    onClick={() => setByUnitSearch("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    aria-label="Clear search"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              {(() => {
                const q = byUnitSearch.trim().toLowerCase();
                const filteredEntries = Array.from(servicesByUnit.entries())
                  .map(([unitNum, entries]) => {
                    if (!q) return [unitNum, entries] as const;
                    const matchUnit = unitNum.toLowerCase().includes(q);
                    const filtered = entries.filter(({ service, unitDetail }) => {
                      if (matchUnit) return true;
                      const haystack = [
                        unitNum,
                        service.technician,
                        service.summary,
                        service.findings,
                        service.notes,
                        (service as any).appointment_service,
                        service.service_type,
                        unitDetail?.findings,
                        unitDetail?.pest_activity,
                        unitDetail?.products_used,
                        unitDetail?.notes,
                        Array.isArray(service.products_used)
                          ? (service.products_used as any[]).map((p: any) => p?.name || p?.product || "").join(" ")
                          : "",
                      ]
                        .filter(Boolean)
                        .join(" ")
                        .toLowerCase();
                      return haystack.includes(q);
                    });
                    return [unitNum, filtered] as const;
                  })
                  .filter(([, entries]) => entries.length > 0)
                  .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }));
                if (filteredEntries.length === 0) {
                  return (
                    <Card className="shadow-sm"><CardContent className="p-6 text-center text-muted-foreground text-xs">No results for “{byUnitSearch}”</CardContent></Card>
                  );
                }
                const defaultOpen = q
                  ? filteredEntries.map(([k]) => k)
                  : filteredEntries.slice(0, 1).map(([k]) => k);
                return (
                  <Accordion type="multiple" defaultValue={defaultOpen} key={q || "all"}>
                    {filteredEntries.map(([unitNum, entries]) => (
                  <AccordionItem key={unitNum} value={unitNum} className="border rounded-lg mb-2 px-0 shadow-sm">
                    <AccordionTrigger className="px-3 py-2.5 text-sm hover:no-underline bg-muted/20 rounded-t-lg">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{unitNum === "General" ? "General Treatment" : `Unit ${unitNum}`}</span>
                        <Badge variant="secondary" className="text-xs">{entries.length} services</Badge>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="px-3 pb-3 space-y-1.5 pt-2">
                      {(() => {
                        // ─── Combined chronological timeline ───
                        // Work orders + treatments, MOST RECENT AT TOP,
                        // oldest (typically the original work order) at the bottom.
                        const unitReqs = unitNum === "General" ? [] : (allRequests as any[])
                          .filter(r => String(r.unit_number || "").trim() === unitNum);
                        type TimelineItem =
                          | { kind: "request"; date: string; req: any; isInitial: boolean }
                          | { kind: "service"; date: string; service: any; unitDetail: any; j: number };
                        const items: TimelineItem[] = [
                          ...unitReqs.map((req, i) => ({
                            kind: "request" as const,
                            date: String(req.created_at || "").slice(0, 10),
                            req,
                            isInitial: false,
                          })),
                          ...entries.map(({ service, unitDetail }, j) => ({
                            kind: "service" as const,
                            date: String(service.service_date || "").slice(0, 10),
                            service,
                            unitDetail,
                            j,
                          })),
                        ];
                        // Mark the EARLIEST request as the Initial Work Order.
                        const sortedReqIdx = [...unitReqs].sort((a, b) =>
                          String(a.created_at || "").localeCompare(String(b.created_at || ""))
                        );
                        const initialId = sortedReqIdx[0]?.id;
                        // Newest first → oldest at the bottom.
                        items.sort((a, b) => b.date.localeCompare(a.date));
                        return items.map((item, idx) => {
                          if (item.kind === "request") {
                            const contact = parseResidentContact(item.req);
                            const desc = contact.cleanedDescription || item.req.description || "";
                            const isInit = item.req.id ? item.req.id === initialId : idx === items.length - 1;
                            return (
                              <div key={`req-${item.req.id || idx}`} className="rounded-lg border-2 border-primary/40 bg-primary/[0.04] p-2.5 text-xs shadow-sm">
                                <div className="pb-2 mb-2 border-b border-primary/20">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <p className="font-bold text-sm leading-tight">
                                      {new Date(item.req.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                                    </p>
                                    <Badge className="text-[10px] bg-primary text-primary-foreground">
                                      {isInit ? "Initial Work Order" : "Work Order"}
                                    </Badge>
                                    {item.req.location_type && (
                                      <span className="text-[10px] text-muted-foreground">• {item.req.location_type}</span>
                                    )}
                                  </div>
                                </div>
                                {desc && (
                                  <p className="text-xs whitespace-pre-wrap leading-relaxed text-foreground/90">{desc}</p>
                                )}
                              </div>
                            );
                          }
                          const { service, unitDetail, j } = item;
                          return (
                        <div key={`${service.id}-${j}`} className="bg-muted/40 rounded-lg p-2.5 text-xs cursor-pointer hover:bg-muted/70 transition-colors border border-transparent hover:border-border"
                          onClick={() => onOpenServiceReport(service)}>
                          {/* Date is now the primary header; service name moved underneath. */}
                          <div>
                            <div className="flex items-center gap-1.5">
                              <p className="font-bold text-sm leading-tight">{formatShortDate(service.service_date)}</p>
                              <Badge className="text-[10px] bg-primary text-primary-foreground">Treatment</Badge>
                            </div>
                            <p className="text-muted-foreground text-[11px] mt-0.5">{(() => {
                              if ((service as any).appointment_service) return (service as any).appointment_service;
                              const cycleLen = propertyFrequency === "weekly" ? 4 : propertyFrequency === "bi-weekly" ? 2 : 1;
                              if (cycleLen <= 1) return service.service_type;
                              const idx = pastServices.findIndex(p => p.id === service.id);
                              if (idx < 0) return service.service_type;
                              const rotIdx = (pastServices.length - 1 - idx) % cycleLen;
                              const planArr = (cadencePlanDraft[propertyFrequency] || []) as string[];
                              return (planArr[rotIdx] || "").trim() || service.service_type;
                            })()}</p>
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
                          {(() => {
                            const unitPhotos = Array.isArray((unitDetail as any)?.photos) ? (unitDetail as any).photos : [];
                            const svcPhotos = Array.isArray((service as any)?.photos) ? (service as any).photos : [];
                            const photos = (unitPhotos.length ? unitPhotos : svcPhotos)
                              .map((p: any) => (typeof p === "string" ? p : p?.url || p?.src))
                              .filter(Boolean);
                            if (photos.length === 0) return null;
                            return (
                              <div className="mt-2 grid grid-cols-4 gap-1.5" onClick={(e) => e.stopPropagation()}>
                                {photos.map((url: string, k: number) => (
                                  <a
                                    key={k}
                                    href={url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="block aspect-square rounded-md overflow-hidden border border-border hover:border-primary/50"
                                  >
                                    <img src={url} alt={`Photo ${k + 1}`} className="w-full h-full object-cover" loading="lazy" />
                                  </a>
                                ))}
                              </div>
                            );
                          })()}
                        </div>
                          );
                        });
                      })()}
                    </AccordionContent>
                  </AccordionItem>
                    ))}
                  </Accordion>
                );
              })()}
            </>
          )
        )}
      </div>
      </TabsContent>

      {/* ══════════ TAB 3: REQUEST WORK ORDER ══════════ */}
      <TabsContent value="request" className="mt-0">
        <div className="max-w-2xl mx-auto space-y-4">
        {/* Work Order Form — mirrors PM portal layout exactly. HOA properties
            get the same 2-button "Community Pest Sighting / Service Request"
            picker as the PM HOA portal so admin and PM views stay 1:1. */}
        {isHOA ? (
        <Card className="border-primary/60 shadow-md">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <ClipboardList className="w-4 h-4 text-primary" />
              Community Pest Sighting or Service Request?
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Are you reporting a community pest sighting or submitting a service request for your unit?
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {([
                { v: "community", label: "Community Pest Sighting", desc: "Report activity in the community" },
                { v: "service",   label: "Service Request",         desc: "Request service for my unit" },
              ] as const).map(opt => {
                const active = hoaRequestKind === opt.v;
                return (
                  <button
                    key={opt.v}
                    type="button"
                    onClick={() => setHoaRequestKind(opt.v)}
                    className={`flex flex-col items-center gap-1 p-4 rounded-lg border-2 transition-all ${active ? "bg-primary text-primary-foreground border-primary shadow-md" : "bg-background border-border hover:border-primary/70 hover:bg-muted/50"}`}
                  >
                    <span className="text-sm font-semibold text-center">{opt.label}</span>
                    <span className={`text-xs text-center ${active ? "opacity-90" : "text-muted-foreground"}`}>{opt.desc}</span>
                  </button>
                );
              })}
            </div>

            {hoaRequestKind && (
              <div className="space-y-3 pt-2 border-t">
                {hoaRequestKind === "service" && (
                  <div className="rounded-lg border-2 border-primary/60 bg-primary/[0.05] p-3 space-y-3">
                    <p className="text-xs font-bold uppercase tracking-wide text-primary flex items-center gap-1.5">
                      <ClipboardList className="w-3.5 h-3.5" />Resident Contact
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <Label className="text-xs">Name *</Label>
                        <Input
                          placeholder="Resident full name"
                          value={hoaResidentName}
                          onChange={e => setHoaResidentName(e.target.value)}
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Phone *</Label>
                        <Input
                          type="tel"
                          placeholder="(555) 123-4567"
                          value={hoaResidentPhone}
                          onChange={e => setHoaResidentPhone(e.target.value)}
                        />
                      </div>
                      <div className="md:col-span-2">
                        <Label className="text-xs">Email *</Label>
                        <Input
                          type="email"
                          placeholder="resident@example.com"
                          value={hoaResidentEmail}
                          onChange={e => setHoaResidentEmail(e.target.value)}
                        />
                      </div>
                      <div className="md:col-span-2">
                        <Label className="text-xs">Home Address *</Label>
                        <Input
                          placeholder="1234 Main St"
                          value={hoaAddress}
                          onChange={e => setHoaAddress(e.target.value)}
                        />
                      </div>
                    </div>
                  </div>
                )}

                {false && hoaRequestKind === "service" && (
                  <div>
                    <Label className="text-sm">What is your address? *</Label>
                    <Input
                      placeholder="1234 Main St"
                      value={hoaAddress}
                      onChange={e => setHoaAddress(e.target.value)}
                      className="mt-1"
                    />
                  </div>
                )}

                <div>
                  <Label className="text-sm">Where are you seeing activity? *</Label>
                  <Input
                    placeholder={hoaRequestKind === "community" ? "e.g. clubhouse, pool area, mailboxes" : "e.g. kitchen, garage, backyard"}
                    value={hoaLocation}
                    onChange={e => setHoaLocation(e.target.value)}
                    className="mt-1"
                  />
                </div>

                <div>
                  <Label className="text-sm">What pests are you seeing? *</Label>
                  <Input
                    placeholder="e.g. Ants, Spiders, Rodents"
                    value={hoaPests}
                    onChange={e => setHoaPests(e.target.value)}
                    className="mt-1"
                  />
                </div>

                <div>
                  <Label className="text-sm">Additional details</Label>
                  <Textarea
                    placeholder="Any extra context — severity, when you noticed it, etc."
                    value={hoaDetails}
                    onChange={e => setHoaDetails(e.target.value)}
                    rows={3}
                  />
                </div>

                {/* Photo attachments — shared workOrderPhotos state */}
                <div>
                  <Label className="text-sm">Photos (optional)</Label>
                  <div className="mt-1 flex flex-wrap gap-2">
                    {workOrderPhotos.map((url, idx) => (
                      <div key={url} className="relative w-20 h-20 rounded-lg overflow-hidden border bg-muted">
                        <img src={url} alt={`Photo ${idx + 1}`} className="w-full h-full object-cover" loading="lazy" />
                        <button
                          type="button"
                          onClick={() => setWorkOrderPhotos(prev => prev.filter(u => u !== url))}
                          className="absolute top-0.5 right-0.5 bg-background/90 rounded-full p-0.5 shadow border hover:bg-background"
                          aria-label="Remove photo"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                    <label className="w-20 h-20 rounded-lg border-2 border-dashed flex flex-col items-center justify-center gap-1 cursor-pointer hover:bg-muted text-muted-foreground text-[10px]">
                      <Image className="w-4 h-4" />
                      {uploadingWorkOrderPhotos ? "Uploading..." : "Add Photo"}
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        disabled={uploadingWorkOrderPhotos}
                        onChange={(e) => { handleWorkOrderPhotoUpload(e.target.files); e.target.value = ""; }}
                      />
                    </label>
                  </div>
                </div>

                <Button
                  className="w-full"
                  size="lg"
                  onClick={submitHoaRequest}
                  disabled={
                    submittingHoaRequest ||
                    !hoaLocation.trim() ||
                    !hoaPests.trim() ||
                    (hoaRequestKind === "service" && (
                      !hoaAddress.trim() ||
                      !hoaResidentName.trim() ||
                      !hoaResidentEmail.trim() ||
                      !hoaResidentPhone.trim()
                    ))
                  }
                >
                  <Send className="w-4 h-4 mr-2" />
                  Submit {hoaRequestKind === "community" ? "Pest Sighting" : "Service Request"}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
        ) : (
        <Card className="border-primary/60 shadow-md">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <ClipboardList className="w-4 h-4 text-primary" />
              {isHOA ? "Submit a Homeowner Work Order" : "Submit a Work Order"}
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              {isHOA
                ? "Capture the homeowner's contact info and the issue — we'll schedule service."
                : "Tell us what's going on and we'll schedule service."}
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* HOA-only: Homeowner contact block (different from PM-only block in apartment mode). */}
            {isHOA && (
              <div className="rounded-lg border-2 border-primary/60 bg-primary/[0.05] p-3 space-y-3">
                <p className="text-xs font-bold uppercase tracking-wide text-primary flex items-center gap-1.5">
                  <ClipboardList className="w-3.5 h-3.5" />Homeowner Contact
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Name *</Label>
                    <Input
                      placeholder="Homeowner full name"
                      value={workOrder.customer_name}
                      onChange={e => setWorkOrder(wo => ({ ...wo, customer_name: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Phone *</Label>
                    <Input
                      type="tel"
                      placeholder="(555) 123-4567"
                      value={workOrder.customer_phone}
                      onChange={e => setWorkOrder(wo => ({ ...wo, customer_phone: e.target.value }))}
                    />
                  </div>
                  <div className="md:col-span-2">
                    <Label className="text-xs">Email *</Label>
                    <Input
                      type="email"
                      placeholder="homeowner@example.com"
                      value={workOrder.tenant_email}
                      onChange={e => setWorkOrder(wo => ({ ...wo, tenant_email: e.target.value }))}
                    />
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground leading-snug">
                  This is the homeowner submitting the issue — different from the property manager. Their contact info is saved with the work order.
                </p>
              </div>
            )}
            {/* Request Type (admin-only enhancement, kept compact) */}
            <div>
              <Label className="text-sm">Request Type *</Label>
              <div className="grid grid-cols-3 gap-2 mt-1">
                 {([
                   { v: "treatment", label: "Treatment\n(units)", icon: Bug, desc: "Active pest treatment" },
                   { v: "inspection", label: "Inspections\n(units)", icon: FileText, desc: "Assess & investigate" },
                   { v: "general", label: "General\nRequest", icon: ClipboardList, desc: "Just leave a comment" },
                 ] as const).map(opt => {
                  const Icon = opt.icon;
                  const active = workOrder.request_type === opt.v;
                  return (
                    <button
                      key={opt.v}
                      type="button"
                      onClick={() => setWorkOrder(wo => ({ ...wo, request_type: opt.v }))}
                      className={`flex flex-col items-center gap-1 p-3 rounded-lg border-2 transition-all ${active ? "bg-primary text-primary-foreground border-primary shadow-md" : "bg-background border-border hover:border-primary/70 hover:bg-muted/50"}`}
                    >
                       <Icon className="w-5 h-5" />
                       <span className="text-sm font-semibold text-center whitespace-pre-line leading-tight">{opt.label}</span>
                       <span className={`text-xs text-center ${active ? "opacity-90" : "text-muted-foreground"}`}>{opt.desc}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Unit or Area — hidden for "General Request" */}
            {workOrder.request_type !== "general" && (
            <div>
              <div className="flex items-center gap-3">
                 <Label className="text-sm whitespace-nowrap shrink-0">Property *</Label>
                <Input
                  list="admin-wo-known-units"
                  placeholder="UNIT 204, 1234 MAIN ST"
                  value={workOrder.unit_number}
                  onChange={e => setWorkOrder(wo => ({ ...wo, unit_number: e.target.value.toUpperCase() }))}
                  autoComplete="off"
                  className="flex-1 uppercase"
                />
              </div>
              {allUnits.length > 0 && (
                <datalist id="admin-wo-known-units">
                  {allUnits.map(u => <option key={u} value={u} />)}
                </datalist>
              )}
            </div>
            )}

            {/* Pest Type — hidden for "General Request" */}
            {workOrder.request_type !== "general" && (
            <div>
              <Label className="text-sm">What are you dealing with? *</Label>
              <Select value={workOrder.pest_type} onValueChange={v => setWorkOrder(wo => ({ ...wo, pest_type: v }))}>
                <SelectTrigger><SelectValue placeholder="Select pest type" /></SelectTrigger>
                <SelectContent>
                  {PEST_TYPES.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            )}

            {/* Location — hidden for "General Request" */}
            {workOrder.request_type !== "general" && (
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
            )}

            {/* Additional Details */}
            <div>
              <Label className="text-sm">{workOrder.request_type === "general" ? "Your Comment *" : "Additional Details"}</Label>
              <Textarea
                placeholder={workOrder.request_type === "general"
                  ? "Share anything for the Crest team — questions, scheduling notes, follow-ups, etc."
                  : "Any extra context — where exactly you're seeing the issue, severity, etc."}
                value={workOrder.comments}
                onChange={e => setWorkOrder(wo => ({ ...wo, comments: e.target.value }))}
                rows={workOrder.request_type === "general" ? 5 : 3} />
            </div>

            {/* Photo attachments — available on every work order type */}
            <div>
              <Label className="text-sm">Photos (optional)</Label>
              <div className="mt-1 flex flex-wrap gap-2">
                {workOrderPhotos.map((url, idx) => (
                  <div key={url} className="relative w-20 h-20 rounded-lg overflow-hidden border bg-muted group">
                    <img src={url} alt={`Work order photo ${idx + 1}`} className="w-full h-full object-cover" loading="lazy" />
                    <button
                      type="button"
                      onClick={() => setWorkOrderPhotos(prev => prev.filter(u => u !== url))}
                      className="absolute top-0.5 right-0.5 bg-background/90 rounded-full p-0.5 shadow border hover:bg-background"
                      aria-label="Remove photo"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
                <label className="w-20 h-20 rounded-lg border-2 border-dashed flex flex-col items-center justify-center gap-1 cursor-pointer hover:bg-muted text-muted-foreground text-[10px]">
                  <Image className="w-4 h-4" />
                  {uploadingWorkOrderPhotos ? "Uploading..." : "Add Photo"}
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    disabled={uploadingWorkOrderPhotos}
                    onChange={(e) => { handleWorkOrderPhotoUpload(e.target.files); e.target.value = ""; }}
                  />
                </label>
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">Attach any number of photos to give context for the technician.</p>
            </div>

            {/* Occupancy — hidden for "General Request" */}
            {workOrder.request_type !== "general" && !isHOA && (
            <div>
              <Label className="text-sm">Vacant or Occupied Unit</Label>
              <div className="flex gap-2 mt-1">
                {(["Occupied", "Vacant"] as const).map(opt => (
                  <button key={opt} type="button"
                    className={`px-4 py-2 rounded-lg text-sm border transition-colors flex-1 ${workOrder.occupancy_status === opt ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-muted border-border"}`}
                    onClick={() => setWorkOrder(wo => ({ ...wo, occupancy_status: wo.occupancy_status === opt ? "" : opt }))}>{opt}</button>
                ))}
              </div>
            </div>
            )}

            {/* Optional new-tenant move-in date — flags this unit until the date passes. */}
            {workOrder.request_type !== "general" && !isHOA && (
              <div className="flex flex-wrap items-center gap-2">
                <Label className="text-xs text-muted-foreground font-normal">
                  New tenant move-in <span className="opacity-70">(optional)</span>
                </Label>
                <input
                  type="date"
                  className="h-8 rounded border border-input bg-background px-2 text-sm text-muted-foreground"
                  value={workOrder.tenant_move_in_date}
                  min={new Date().toISOString().slice(0, 10)}
                  onChange={e => setWorkOrder(wo => ({ ...wo, tenant_move_in_date: e.target.value }))}
                />
                {workOrder.tenant_move_in_date && (
                  <button
                    type="button"
                    className="text-xs underline text-muted-foreground hover:text-foreground"
                    onClick={() => setWorkOrder(wo => ({ ...wo, tenant_move_in_date: "" }))}
                  >
                    Clear
                  </button>
                )}
              </div>
            )}

            {/* Tenant Notification — full PM-portal parity */}
            <div className={`rounded-lg border border-border bg-muted/30 p-3 space-y-3 ${isHOA || workOrder.request_type === "general" ? "hidden" : ""}`}>
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox checked={workOrder.email_tenant} onCheckedChange={(v) => setWorkOrder(wo => ({ ...wo, email_tenant: !!v }))} />
                <span className="text-sm font-medium">Email tenant?</span>
              </label>
              <div className={`space-y-3 transition-opacity ${workOrder.email_tenant ? "opacity-100" : "opacity-40 pointer-events-none"}`}>
                <div>
                  <Label className="text-xs">Tenant Email</Label>
                  <Input
                    type="email"
                    placeholder="tenant@example.com"
                    value={workOrder.tenant_email}
                    onChange={e => setWorkOrder(wo => ({ ...wo, tenant_email: e.target.value }))}
                    disabled={!workOrder.email_tenant}
                  />
                </div>
                <div>
                  <Label className="text-xs">Prep Sheet to Send (optional)</Label>
                  <Select
                    value={workOrder.prep_sheet_id || "__none"}
                    onValueChange={(v) => setWorkOrder(wo => ({ ...wo, prep_sheet_id: v === "__none" ? "" : v }))}
                    disabled={!workOrder.email_tenant}
                  >
                    <SelectTrigger><SelectValue placeholder="No prep sheet" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">No prep sheet</SelectItem>
                      {prepSheets.map(ps => (
                        <SelectItem key={ps.id} value={ps.id}>{ps.title}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <label className="flex items-start gap-2 cursor-pointer">
                  <Checkbox
                    checked={workOrder.right_to_treat}
                    onCheckedChange={(v) => setWorkOrder(wo => ({ ...wo, right_to_treat: !!v }))}
                    disabled={!workOrder.email_tenant}
                  />
                  <span className="text-xs leading-snug">
                    Send <strong>"Right to Treat"</strong> signature page<br />
                    <span className="text-muted-foreground">Includes a small signable link in the email so the tenant can authorize entry & treatment of their unit.</span>
                  </span>
                </label>
              </div>
            </div>

            <Button
              className="w-full"
              size="lg"
              onClick={submitWorkOrder}
              disabled={
                (workOrder.request_type === "general"
                  ? !workOrder.comments.trim()
                  : !workOrder.unit_number) ||
                submittingWorkOrder ||
                (isHOA && (!workOrder.customer_name.trim() || !workOrder.customer_phone.trim() || !workOrder.tenant_email.trim()))
              }
            >
              <Send className="w-4 h-4 mr-2" />Submit {workOrder.request_type === "general"
                ? "General Request"
                : workOrder.request_type === "inspection" ? "Inspection Request" : "Work Order"}
            </Button>
          </CardContent>
        </Card>
        )}

        {/* Tenant Service Request Link (admin-only) */}
        <Button className="w-full h-10 text-xs font-semibold bg-secondary text-secondary-foreground hover:bg-secondary/90 shadow-sm"
          onClick={() => {
            const link = propertyLink;
            if (link) {
              const url = `${window.location.origin}/tenant/${link.token}`;
              navigator.clipboard.writeText(url);
              toast({ title: "Link copied!", description: `Share this with the ${residentTerm} so they can submit requests.` });
            } else {
              toast({ title: "No portal link", description: "A share link will be auto-generated.", variant: "destructive" });
            }
          }}>
          <ExternalLink className="w-4 h-4 mr-1.5" />Copy {ResidentTerm} Request Link
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

        {/* BIG Ad Hoc Visit CTA — one-off visit, fully detached from cadence */}
        {!showAdHocAdd && (
          <Button
            onClick={() => setShowAdHocAdd(true)}
            className="w-full h-16 text-base font-bold gap-2 bg-secondary text-secondary-foreground hover:bg-secondary/90 shadow-md border-2 border-dashed border-secondary-foreground/40"
          >
            <CalendarPlus className="w-5 h-5" />
            <span className="flex flex-col items-center leading-tight">
              <span>Add Ad Hoc Visit</span>
              <span className="text-[11px] font-normal opacity-80">One-off · doesn't affect cadence, next service, or follow-ups</span>
            </span>
          </Button>
        )}

        {/* Ad Hoc Visit add form — stands alone, doesn't influence cadence */}
        {showAdHocAdd && (
          <Card className="shadow-sm border-dashed border-secondary/60">
            <CardContent className="p-3 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold">Add Ad Hoc Visit</p>
                <button onClick={() => setShowAdHocAdd(false)}><X className="w-3.5 h-3.5 text-muted-foreground" /></button>
              </div>
              <p className="text-[11px] text-muted-foreground leading-snug">
                One-off visit on its own date. Does <strong>not</strong> follow the cadence,
                does <strong>not</strong> pull in follow-ups or work orders, and does
                <strong> not</strong> count toward the rotation.
              </p>
              <Select value={adHocType} onValueChange={setAdHocType}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SERVICE_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
              <Input
                type="date"
                className="h-8 text-xs"
                value={adHocDate}
                onChange={e => setAdHocDate(e.target.value)}
              />
              <Textarea
                className="text-xs min-h-[60px]"
                placeholder="Reason / notes (optional)"
                value={adHocNote}
                onChange={e => setAdHocNote(e.target.value)}
              />
              <Button size="sm" className="w-full h-7 text-xs" onClick={addAdHocVisit} disabled={!adHocDate}>
                <Plus className="w-3 h-3 mr-1" />Add Ad Hoc Visit
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Ad Hoc Visits — separate bubble with full visit editor (same as upcoming).
            Only show ad-hocs that are NOT yet completed. Once completed, the
            ad-hoc moves into Previous Services so it isn't listed in two places. */}
        {(() => {
          const pendingAdHoc = adHocServices.filter((s) => s.status !== "completed");
          if (pendingAdHoc.length === 0) return null;
          return (
          <div className="space-y-2">
            <div className="border-b-2 border-secondary/70 pb-2.5 flex items-center gap-2">
              <h3 className="text-base font-bold flex items-center gap-2">
                <CalendarPlus className="w-5 h-5 text-secondary" />Ad Hoc Visits
                <Badge variant="secondary" className="text-xs ml-1">{pendingAdHoc.length}</Badge>
              </h3>
              <span className="text-[11px] text-muted-foreground">One-off · separate from cadence</span>
            </div>
            <div className="space-y-2">
              {pendingAdHoc.map((s) => {
                const isCompleted = s.status === "completed";
                const isDropActive =
                  !!dragUnit &&
                  dragUnit.sourceServiceId !== s.id;
                const isDropHover = isDropActive && dragOverAdHocId === s.id;
                return (
                  <Card
                    key={s.id}
                    onDragOver={(e) => {
                      if (!isDropActive) return;
                      e.preventDefault();
                      try { e.dataTransfer.dropEffect = "move"; } catch {}
                      if (dragOverAdHocId !== s.id) setDragOverAdHocId(s.id);
                    }}
                    onDragLeave={(e) => {
                      if (!isDropActive) return;
                      // Only clear when leaving the card itself, not children.
                      if (e.currentTarget.contains(e.relatedTarget as Node)) return;
                      if (dragOverAdHocId === s.id) setDragOverAdHocId(null);
                    }}
                    onDrop={async (e) => {
                      if (!isDropActive || !dragUnit) return;
                      e.preventDefault();
                      const payload = dragUnit;
                      setDragOverAdHocId(null);
                      setDragUnit(null);
                      const sourceService = propServices.find(
                        (p) => p.id === payload.sourceServiceId,
                      );
                      if (!sourceService) {
                        toast({ title: "Source service not found", variant: "destructive" });
                        return;
                      }
                      await moveUnitToAdHocService(s.id, sourceService, payload.unit, payload.row);
                    }}
                    className={`shadow-sm border-2 border-dashed border-secondary/50 bg-gradient-to-br from-secondary/[0.08] to-transparent transition-all ${
                      isDropHover ? "border-secondary ring-2 ring-secondary/60 bg-secondary/15" : isDropActive ? "border-secondary/80" : ""
                    }`}
                  >
                    {isDropActive && (
                      <div className="px-3 pt-2 -mb-1 text-[11px] font-semibold text-secondary-foreground/80">
                        Drop here to move {dragUnit?.unit} into this ad-hoc visit
                      </div>
                    )}
                    <div className="p-3 flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge className="text-xs bg-secondary text-secondary-foreground">Ad Hoc</Badge>
                          <p className="font-semibold text-sm">{(s as any).appointment_service || s.service_type}</p>
                          <Badge variant={isCompleted ? "default" : "secondary"} className="text-xs">{s.status}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {formatDate(s.service_date)}
                          {(s as any).technician && ` • ${(s as any).technician}`}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                        <Input
                          type="date"
                          value={s.service_date || ""}
                          onChange={async (e) => {
                            const next = e.target.value;
                            if (!next) return;
                            await supabase.from("portal_services").update({ service_date: next }).eq("id", s.id);
                            onRefresh();
                          }}
                          className="h-9 text-sm w-[160px]"
                        />
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-9 w-9 p-0 text-destructive"
                          onClick={() => {
                            if (confirm("Delete this ad-hoc visit? This cannot be undone.")) {
                              onDeleteService(s.id);
                            }
                          }}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                    {/* Full visit editor — same bells & whistles as upcoming, but
                        isFirstUpcoming=false so it NEVER pulls in follow-ups / work orders. */}
                    {renderServiceDetails(s, true, false, false)}
                  </Card>
                );
              })}
            </div>
          </div>
          );
        })()}

        {/* Upcoming Services */}
        <div className="border-b-2 border-primary/70 pb-2.5">
          <h3 className="text-base font-bold flex items-center gap-2">
            <ClipboardList className="w-5 h-5 text-secondary" />Upcoming Services
            <Badge variant="secondary" className="text-xs ml-1">{allUpcoming.length}</Badge>
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
              // SAME merge as the PM portal — single source of truth.
              const mergedHeader = computeUpcomingUnits({
                service: s,
                isFirstUpcoming: isFirst,
                requests: pendingRequests,
                // Merge follow_up_needed flags across ALL past visits so
                // every unit still needing a follow-up surfaces as orange.
                mostRecentPast: buildMergedMostRecentPast(pastServicesForDisplay),
                allPastServices: pastServicesForDisplay,
                allRequests: allRequests,
                tenantMoveIns:
                  (property.customer_preferences as any)?.tenant_move_ins || null,
              });
              const unitsPlanned = mergedHeader.units;
              const pmNotesMapHeader: Record<string, string> =
                ((property.customer_preferences as any)?.pm_upcoming_notes as Record<string, string>) || {};
              const hasPmNote = !!(s.service_date && pmNotesMapHeader[s.service_date]);

              return (
                <Card key={s.id} className={`transition-all shadow-sm ${isFirst ? "border-primary/50 shadow-md ring-1 ring-primary/20 bg-gradient-to-br from-primary/[0.08] to-transparent" : isExpanded ? "border-primary/20" : "hover:border-muted-foreground/30"} ${isProjected ? "border-dashed" : ""}`}>
                  <button className="w-full text-left p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2" onClick={() => !isFirst && setExpandedUpcomingId(isExpanded && !isFirst ? null : s.id)}>
                    <div className="flex-1 min-w-0 w-full">
                      <div className="flex items-center gap-2 flex-wrap">
                        {isFirst && <Badge className="text-xs bg-secondary text-secondary-foreground">Next Service</Badge>}
                        <p className={`font-semibold ${isFirst ? "text-sm" : "text-xs"}`}>{(() => {
                          // If a label was already saved on the row (e.g. via completion or
                          // manual edit), prefer it so the displayed title is stable.
                          const savedLabel = (s as any).appointment_service;
                          if (savedLabel) return savedLabel;
                          // First upcoming visit auto-rotates through the Site Map cadence
                          // plan (weekly = 4-visit rotation, bi-weekly = 2-visit rotation).
                          // Past-visit count is the index into the rotation, so once the 1st
                          // visit completes the next upcoming becomes the 2nd visit, etc.
                          if (isFirst && (propertyFrequency === "weekly" || propertyFrequency === "bi-weekly")) {
                            const label = getCadenceVisitLabel(pastServices.length, cadencePlanDraft[propertyFrequency]);
                            if (label) return label;
                          }
                          return s.service_type;
                        })()}</p>
                        {isProjected && <Badge variant="outline" className="text-xs">Projected</Badge>}
                        {!isProjected && !isFirst && <Badge variant="secondary" className="text-xs">{(s as any).scheduling_status || "confirmed"}</Badge>}
                        {hasPmNote && <Badge className="text-xs bg-primary/15 text-primary border border-primary/60 hover:bg-primary/15"><ClipboardList className="w-3 h-3 mr-0.5" />PM Note</Badge>}
                        {(() => {
                          const ov = computeOverage(unitsPlanned.length, planCfg);
                          if (!ov.hasOverage) return null;
                          return (
                            <Badge
                              title={`${ov.totalUnits} units to treat • ${ov.includedUnits} included • ${ov.unitsOver} over → +${formatOverageMoney(ov.overageCost)}`}
                              className="text-xs bg-amber-500 text-white border-transparent hover:bg-amber-500"
                            >
                              +{ov.unitsOver} over • {formatOverageMoney(ov.overageCost)}
                            </Badge>
                          );
                        })()}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {isProjected ? (
                          <span className="italic">No date set — pick one to schedule this visit</span>
                        ) : (
                          formatDate(s.service_date)
                        )}
                        {(s as any).technician && ` • ${(s as any).technician}`}
                        {unitsPlanned.length > 0 && ` • ${unitsPlanned.length} units`}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0 flex-wrap w-full sm:w-auto sm:justify-end">
                      {isFirst && (
                        (() => {
                          const editing = reschedulingId === s.id;
                          const dateValue = editing ? rescheduleDate : (s.service_date || "");
                          const canSave =
                            !!dateValue &&
                            !rescheduleSaving &&
                            (isProjected || dateValue !== (s.service_date || ""));
                          const doSave = async () => {
                            if (!dateValue) return;
                            setRescheduleSaving(true);
                            // Make sure the active save uses dateValue regardless of which row was last focused
                            const rescheduleDateLocal = dateValue;
                            try {
                                     // CRITICAL: a projected card may have been silently
                                     // materialized into a real DB row already (by an
                                     // earlier photo upload, map edit, or office note).
                                     // In that case `s.id` will be a real UUID even
                                     // though the closure-captured `isProjected` flag is
                                     // still `true`. We MUST detect that and UPDATE the
                                     // existing row instead of INSERTing a new one —
                                     // otherwise the photos/map/notes already saved get
                                     // stranded on the original row and the schedule
                                     // creates a duplicate empty row.
                                     const idIsRealRow = !!s.id && !String(s.id).startsWith("projected-");
                                     if (isProjected && !idIsRealRow) {
                                       // No DB row yet — create a real scheduled service so
                                       // the projection anchors on this confirmed date.
                                       // CRITICAL: carry over any in-progress edits the user
                                       // already typed into the projected card (unit rows,
                                       // products, technician, summary, etc.) so scheduling a
                                       // date NEVER wipes data the admin already filled out.
                                       const inProgress = completionData[s.id];
                                      const carriedUnitDetails = Array.isArray(inProgress?.unitRows)
                                        ? inProgress!.unitRows
                                            .filter((r: any) => String(r?.unit_number || "").trim())
                                            .map((r: any) => ({ ...r }))
                                        : (Array.isArray((s as any).unit_details) ? (s as any).unit_details : []);
                                      const carriedProducts = Array.isArray(inProgress?.products) && inProgress!.products.length > 0
                                        ? inProgress!.products
                                        : (Array.isArray((s as any).products_used) ? (s as any).products_used : []);
                                      const inserted = await supabase.from("portal_services").insert({
                                        property_id: property.id,
                                        service_type: s.service_type || "General Pest Control",
                                        service_date: rescheduleDateLocal,
                                        technician: inProgress?.technician || (s as any).technician || null,
                                        status: "scheduled",
                                        units_planned: Array.isArray(s.units_planned) ? s.units_planned : [],
                                        unit_details: carriedUnitDetails,
                                        products_used: carriedProducts,
                                        summary: inProgress?.summary || null,
                                        findings: inProgress?.findings || null,
                                        notes: inProgress?.notes || null,
                                        frequency_days: propertyFrequencyDays,
                                      } as any).select("id").single();

                                      // Migrate the in-progress completion buffer from the
                                      // projected key to the new real service id so the form
                                      // doesn't appear "empty" after refresh.
                                      const newId = (inserted as any)?.data?.id;
                                      if (newId && inProgress) {
                                        setCompletionData(prev => {
                                          const next = { ...prev };
                                          next[newId] = inProgress;
                                          delete next[s.id];
                                          return next;
                                        });
                                      }
                                     } else {
                                       // Either a normally-scheduled row OR a projected
                                       // card that was already materialized. Update its
                                       // date in-place so attachments/map_data/office
                                       // notes/etc. all stay attached to the same row.
                                       await supabase
                                         .from("portal_services")
                                         .update({ service_date: rescheduleDateLocal })
                                         .eq("id", s.id);
                                     }
                                    toast({ title: isProjected ? "Visit scheduled" : "Service rescheduled", description: `Next visit set to ${formatDate(rescheduleDateLocal)}` });
                                    setReschedulingId(null);
                                    onRefresh();
                                  } catch (err: any) {
                                    toast({ title: "Reschedule failed", description: err?.message || "Unknown error", variant: "destructive" });
                                  } finally {
                                    setRescheduleSaving(false);
                                  }
                                };
                          return (
                            <div
                              className={`flex items-center gap-2 ${isProjected ? "p-2 -my-1 rounded-lg bg-primary/10 ring-2 ring-primary/60 shadow-md" : ""}`}
                              onClick={(e) => e.stopPropagation()}
                            >
                              {isProjected && (
                                <span className="text-[11px] font-bold uppercase tracking-wide text-primary hidden sm:inline">
                                  Pick a date →
                                </span>
                              )}
                              <Input
                                type="date"
                                value={dateValue}
                                onFocus={() => {
                                  setReschedulingId(s.id);
                                  setRescheduleDate(s.service_date || "");
                                }}
                                onChange={(e) => {
                                  if (!editing) setReschedulingId(s.id);
                                  setRescheduleDate(e.target.value);
                                }}
                                className={`h-10 text-sm font-semibold w-[170px] ${
                                  isProjected ? "border-primary text-primary bg-background" : ""
                                }`}
                              />
                              <Button
                                size="sm"
                                className={`h-10 px-3 text-sm font-semibold gap-1.5 ${
                                  isProjected
                                    ? "bg-primary text-primary-foreground shadow-lg shadow-primary/40 hover:bg-primary/90"
                                    : ""
                                }`}
                                variant={isProjected ? "default" : "outline"}
                                disabled={!canSave}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  doSave();
                                }}
                              >
                                <Calendar className="w-4 h-4" />
                                {rescheduleSaving
                                  ? "Saving…"
                                  : isProjected
                                    ? "Schedule"
                                    : "Update"}
                              </Button>
                            </div>
                          );
                        })()
                      )}
                      {!isFirst && <ChevronDown className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform ${isExpanded ? "rotate-180" : ""}`} />}
                      {!isProjected && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 px-2 text-xs gap-1 text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/40"
                          title="Delete this upcoming service"
                          onClick={async (e) => {
                            e.stopPropagation();
                            const dateLabel = s.service_date ? formatDate(s.service_date) : "this service";
                            const ok = window.confirm(
                              `Are you sure you want to delete this upcoming service${s.service_date ? ` on ${dateLabel}` : ""}? This cannot be undone.`
                            );
                            if (!ok) return;
                            try {
                              const { error } = await supabase
                                .from("portal_services")
                                .delete()
                                .eq("id", s.id);
                              if (error) throw error;
                              // Apartments only: also remove any open work orders /
                              // inspection / general requests that were scheduled to
                              // be addressed on this upcoming visit. These requests
                              // merge onto the FIRST upcoming service via
                              // computeUpcomingUnits, so when the admin deletes that
                              // service the requests must go with it (otherwise they
                              // silently roll onto the next visit).
                              let cascaded = 0;
                              if (propertyType === "apartments" && isFirst) {
                                const { data: del } = await supabase
                                  .from("portal_requests")
                                  .delete()
                                  .eq("property_id", property.id)
                                  .in("status", ["pending", "in_progress"])
                                  .select("id");
                                cascaded = Array.isArray(del) ? del.length : 0;
                              }
                              // Apartments only: ALSO clear the `follow_up_needed`
                              // flags on the most-recent past service's unit_details.
                              // Otherwise `getFollowUpDetailsFromPast` keeps surfacing
                              // those units as orange "Follow-up" rows on the very
                              // next upcoming visit — so the admin "deletes" the
                              // auto-spawned follow-up service and watches the same
                              // units immediately reappear on whatever comes next.
                              let clearedFollowUps = 0;
                              if (propertyType === "apartments") {
                                const mostRecentPast = pastServices[0];
                                if (mostRecentPast && Array.isArray(mostRecentPast.unit_details)) {
                                  const cleared = (mostRecentPast.unit_details as any[]).map((u) => {
                                    if (u && u.follow_up_needed === true) {
                                      clearedFollowUps += 1;
                                      return { ...u, follow_up_needed: false };
                                    }
                                    return u;
                                  });
                                  if (clearedFollowUps > 0) {
                                    await supabase
                                      .from("portal_services")
                                      .update({
                                        unit_details: cleared,
                                        follow_up_recommended: false,
                                      })
                                      .eq("id", mostRecentPast.id);
                                  }
                                }
                              }
                              toast({
                                title: "Upcoming service deleted",
                                description:
                                  [
                                    cascaded > 0
                                      ? `Removed ${cascaded} open request${cascaded === 1 ? "" : "s"} tied to this date.`
                                      : null,
                                    clearedFollowUps > 0
                                      ? `Cleared ${clearedFollowUps} follow-up flag${clearedFollowUps === 1 ? "" : "s"} from the last visit so they won't reappear.`
                                      : null,
                                  ]
                                    .filter(Boolean)
                                    .join(" ") || undefined,
                              });
                              if (expandedUpcomingId === s.id) setExpandedUpcomingId(null);
                              onRefresh();
                              // Reload local pending-requests cache so the
                              // deleted general/work/inspection requests
                              // disappear from the next-service breakdown
                              // immediately (it's keyed off `property.id`
                              // which didn't change).
                              try {
                                const { data: freshReqs } = await supabase
                                  .from("portal_requests")
                                  .select("*")
                                  .eq("property_id", property.id)
                                  .in("status", ["pending", "in_progress"])
                                  .order("created_at", { ascending: false });
                                setPendingRequests(freshReqs || []);
                              } catch {}
                            } catch (err: any) {
                              toast({
                                title: "Delete failed",
                                description: err?.message || "Unknown error",
                                variant: "destructive",
                              });
                            }
                          }}
                        >
                          <Trash2 className="w-3 h-3" />
                          Delete
                        </Button>
                      )}
                    </div>
                  </button>
                  {isExpanded && renderServiceDetails(s, true, isProjected, isFirst)}
                </Card>
              );
            })}
          </div>
        )}

        {/* Future projected visits intentionally hidden — only the very next
            visit is shown above. */}
        </div>
      </TabsContent>

      {/* ══════════ TAB 5: PREP SHEETS ══════════ */}
      <TabsContent value="prep" className="mt-0">
        <div className="space-y-2 max-w-4xl mx-auto">
          <div className="border-b-2 border-primary/70 pb-3 mb-3">
            <h3 className="text-xl font-bold flex items-center gap-2">
              <FileDown className="w-6 h-6 text-secondary" />Prep Sheets & Signed Authorizations
              <Badge variant="secondary" className="text-xs ml-1">{prepSheets.length}</Badge>
            </h3>
            <p className="text-xs text-muted-foreground mt-1">View, download, or copy a link to share with {residentTerm}s.</p>
          </div>
          {prepSheets.length === 0 ? (
            <Card className="shadow-sm"><CardContent className="p-8 text-center text-muted-foreground text-sm">No prep sheets available</CardContent></Card>
          ) : (
          <div className="space-y-2">
            {prepSheets.map(ps => (
              <Card key={ps.id} className="shadow-sm hover:border-primary/60 transition-all">
                <button className="w-full text-left p-3 flex items-center justify-between" onClick={() => setExpandedPrepSheet(expandedPrepSheet === ps.id ? null : ps.id)}>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold">{ps.title}</p>
                    <p className="text-xs text-muted-foreground">{ps.treatment_type}</p>
                  </div>
                  <ChevronDown className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform ${expandedPrepSheet === ps.id ? "rotate-180" : ""}`} />
                </button>
                {expandedPrepSheet === ps.id && ps.description && (
                  <div className="px-3 pb-3 border-t border-border pt-3 space-y-3">
                    <div className="bg-muted/30 rounded-lg p-3 max-h-[400px] overflow-y-auto">
                      <pre className="text-xs whitespace-pre-wrap font-sans leading-relaxed">{ps.description}</pre>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {ps.file_url && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-9 text-sm"
                          onClick={() => window.open(ps.file_url!, "_blank", "noopener,noreferrer")}
                        >
                          <Eye className="w-3.5 h-3.5 mr-1" />View
                        </Button>
                      )}
                      {ps.file_url && (
                        <Button size="sm" variant="outline" className="h-9 text-sm" onClick={() => downloadPrep(ps)}>
                          <Download className="w-3.5 h-3.5 mr-1" />Download PDF
                        </Button>
                      )}
                      {ps.file_url && (
                        <Button size="sm" variant="outline" className="h-9 text-sm" onClick={() => copyPrepLink(ps.file_url!)}>
                          <Copy className="w-3.5 h-3.5 mr-1" />Copy Link
                        </Button>
                      )}
                      {ps.description && (
                        <Button
                          size="sm"
                          className="h-9 text-sm"
                          onClick={async () => {
                            if (ps.description) {
                              await navigator.clipboard.writeText(ps.description);
                              setCopyingPrepSheet(ps.id);
                              toast({ title: "Prep sheet copied!" });
                              setTimeout(() => setCopyingPrepSheet(null), 2000);
                            }
                          }}
                        >
                          {copyingPrepSheet === ps.id ? (
                            <><CheckCircle className="w-3.5 h-3.5 mr-1" />Copied!</>
                          ) : (
                            <><Copy className="w-3.5 h-3.5 mr-1" />Copy Text</>
                          )}
                        </Button>
                      )}
                    </div>
                    {/* Email this prep sheet as a PDF to any address */}
                    {ps.file_url && (
                      <div className="rounded-lg border-2 border-primary/30 bg-primary/5 p-3 mt-1">
                        <Label className="text-xs font-semibold flex items-center gap-1.5 mb-1.5">
                          <Mail className="w-3.5 h-3.5 text-primary" />Email this prep sheet (PDF)
                        </Label>
                        <div className="flex flex-wrap gap-2">
                          <Input
                            type="email"
                            placeholder="recipient@email.com"
                            value={prepEmailDraft[ps.id] || ""}
                            onChange={(e) => setPrepEmailDraft(d => ({ ...d, [ps.id]: e.target.value }))}
                            className="h-9 text-sm flex-1 min-w-[220px]"
                          />
                          <Button
                            size="sm"
                            className="h-9 text-sm"
                            disabled={
                              prepEmailSending === ps.id ||
                              !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((prepEmailDraft[ps.id] || "").trim())
                            }
                            onClick={async () => {
                              const to = (prepEmailDraft[ps.id] || "").trim();
                              setPrepEmailSending(ps.id);
                              try {
                                const { data, error } = await supabase.functions.invoke("send-prep-sheet", {
                                  body: { prepSheetId: ps.id, email: to },
                                });
                                if (error || !(data as any)?.ok) {
                                  throw new Error((data as any)?.message || error?.message || "send_failed");
                                }
                                toast({ title: "Prep sheet emailed", description: `Sent "${ps.title}" to ${to}` });
                                setPrepEmailDraft(d => ({ ...d, [ps.id]: "" }));
                              } catch (err) {
                                toast({
                                  title: "Email failed",
                                  description: err instanceof Error ? err.message : "Could not send email.",
                                  variant: "destructive",
                                });
                              } finally {
                                setPrepEmailSending(null);
                              }
                            }}
                          >
                            <Send className="w-3.5 h-3.5 mr-1" />
                            {prepEmailSending === ps.id ? "Sending…" : "Send PDF"}
                          </Button>
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-1">
                          Subject will be: <span className="font-semibold">{ps.title}</span>
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </Card>
            ))}
          </div>
          )}

          {/* Signed Right-to-Treat Authorizations — full archive for this property */}
          <div className="mt-8">
            <div className="border-b-2 border-primary/70 pb-3 mb-3">
              <h3 className="text-xl font-bold flex items-center gap-2">
                <Shield className="w-6 h-6 text-secondary" />Signed Right-to-Treat Authorizations
                <Badge variant="secondary" className="text-xs ml-1">{signedAuthorizations.length}</Badge>
              </h3>
              <p className="text-xs text-muted-foreground mt-1">Every signed {residentTerm} authorization recorded for this property.</p>
            </div>
            {signedAuthorizations.length === 0 ? (
              <Card className="shadow-sm"><CardContent className="p-8 text-center text-muted-foreground text-sm">No signed authorizations yet</CardContent></Card>
            ) : (
              <div className="space-y-2">
                {signedAuthorizations.map((r) => (
                  <details key={r.id} className="rounded-lg border bg-card shadow-sm group">
                    <summary className="flex items-center justify-between gap-3 cursor-pointer p-3 list-none">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold truncate">{r.right_to_treat_signer_name || r.tenant_email || "—"}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {r.unit_number ? <>Unit <span className="font-medium text-foreground">{r.unit_number}</span> · </> : null}
                          Signed {r.right_to_treat_signed_at ? new Date(r.right_to_treat_signed_at).toLocaleDateString() : "—"}
                        </p>
                      </div>
                      <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0 transition-transform group-open:rotate-180" />
                    </summary>
                    <div className="px-3 pb-3 border-t pt-3 flex items-start gap-3">
                      {r.right_to_treat_signature && (
                        <img src={r.right_to_treat_signature} alt="Signature" className="w-28 h-16 rounded border bg-white object-contain shrink-0" />
                      )}
                      <div className="flex-1 min-w-0 text-xs space-y-0.5">
                        <p className="text-muted-foreground">
                          {r.pest_type || r.request_type || "Service"}
                          {r.location_type ? ` (${r.location_type})` : ""}
                        </p>
                        {r.tenant_email && <p className="text-muted-foreground truncate">{r.tenant_email}</p>}
                        <p className="text-muted-foreground">
                          Signed {r.right_to_treat_signed_at ? new Date(r.right_to_treat_signed_at).toLocaleString() : "—"}
                        </p>
                      </div>
                    </div>
                  </details>
                ))}
              </div>
            )}
          </div>

          {/* Property document uploads — admin / PM only, lives inside the
              Prep / Auth / Docs tab so it doesn't leak across every tab. */}
          <div className="mt-8">
            <div className="flex justify-end mb-3">
              <Button
                size="sm"
                variant="outline"
                onClick={() => downloadBlankRightToTreatPdf(property.name)}
              >
                <Download className="w-4 h-4 mr-1.5" />Download Blank Right-to-Treat Agreement
              </Button>
            </div>
            <PropertyDocuments
              propertyId={property.id}
              uploadedBy="Admin"
              heading="Property Documents"
              helperText="Upload PDFs, notices, agreements, or other files. Visible to anyone with the property link (admin, PMs, and clients)."
            />
          </div>
        </div>
      </TabsContent>

      {/* ══════════ TAB 6: TENANT SURVEY ══════════ */}
      <TabsContent value="survey" className="mt-0">
        <div className="max-w-4xl mx-auto space-y-5">
          <Tabs value={innerSurveyTab} onValueChange={(v) => setInnerSurveyTab(v as "tenant" | "onboarding")}>
            <TabsList className="grid w-full grid-cols-2 mb-4">
              <TabsTrigger value="tenant">{isHOA ? "Resident Survey" : "Tenant Survey"}</TabsTrigger>
              <TabsTrigger value="onboarding">Onboarding Survey</TabsTrigger>
            </TabsList>
            <TabsContent value="tenant" className="mt-0 space-y-5">
          <Card className="border-primary/60 shadow-md">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Send className="w-4 h-4 text-primary" />Send {ResidentTerm} Pest Survey
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                {isHOA
                  ? "Residents get a short 5-question form so the board can spot community-wide pest trends. Results aggregate below."
                  : "Tenants get a short 5-question form. Results aggregate below as they respond."}
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label className="text-sm">Survey Title</Label>
                <Input value={surveyTitle} onChange={(e) => setSurveyTitle(e.target.value)} />
              </div>
              <div>
                <Label className="text-sm">Intro Message</Label>
                <Textarea rows={3} value={surveyIntro} onChange={(e) => setSurveyIntro(e.target.value)} />
              </div>
              <div>
                <Label className="text-sm">{ResidentTerm} Emails</Label>
                <Textarea
                  rows={4}
                  placeholder={`Paste ${residentTerm} emails — one per line, or comma-separated`}
                  value={surveyEmails}
                  onChange={(e) => setSurveyEmails(e.target.value)}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Each {residentTerm} gets their own unique link so you can see who responded.
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <Button onClick={sendSurvey} disabled={sendingSurvey || !surveyEmails.trim()} className="flex-1" size="lg">
                  <Send className="w-4 h-4 mr-2" />
                  {sendingSurvey ? "Sending..." : "Send Survey"}
                </Button>
                <Button
                  onClick={() => createShareableLink("tenant")}
                  disabled={generatingLink === "tenant"}
                  variant="outline"
                  className="flex-1"
                  size="lg"
                >
                  <Copy className="w-4 h-4 mr-2" />
                  {generatingLink === "tenant" ? "Generating..." : "Copy Shareable Link"}
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Use the shareable link to post in Slack, text, or signage — no email required.
              </p>
            </CardContent>
          </Card>

          {/* HOA: Group past surveys into "Survey — Month YYYY" collapsible summaries */}
          {isHOA && surveys.length > 0 && (
            <Card className="shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-primary" />Past Survey Summaries
                  <Badge variant="secondary" className="ml-1 text-xs">{surveys.length}</Badge>
                </CardTitle>
                <p className="text-xs text-muted-foreground">Each entry rolls up everything sent in that month.</p>
              </CardHeader>
              <CardContent>
                {(() => {
                  // Group surveys by Month YYYY of created_at
                  const groups = new Map<string, { label: string; date: Date; surveys: any[] }>();
                  surveys.forEach((s: any) => {
                    const d = new Date(s.created_at);
                    const key = `${d.getFullYear()}-${d.getMonth()}`;
                    const label = `Survey — ${d.toLocaleString("en-US", { month: "long", year: "numeric" })}`;
                    if (!groups.has(key)) groups.set(key, { label, date: new Date(d.getFullYear(), d.getMonth(), 1), surveys: [] });
                    groups.get(key)!.surveys.push(s);
                  });
                  const ordered = Array.from(groups.values()).sort((a, b) => b.date.getTime() - a.date.getTime());
                  return (
                    <div className="space-y-2">
                      {ordered.map((g) => {
                        const ids = new Set(g.surveys.map((s: any) => s.id));
                        const responses = surveyResponses.filter((r: any) => ids.has(r.survey_id));
                        const submitted = responses.filter((r: any) => r.submitted_at).length;
                        const recipientsTotal = g.surveys.reduce(
                          (acc: number, s: any) => acc + (Array.isArray(s.recipient_emails) ? s.recipient_emails.length : 0),
                          0
                        );
                        return (
                          <details key={g.label} className="rounded-lg border bg-muted/20 group">
                            <summary className="flex items-center justify-between gap-3 cursor-pointer p-3 list-none">
                              <div className="min-w-0">
                                <p className="text-sm font-semibold truncate">{g.label}</p>
                                <p className="text-xs text-muted-foreground">
                                  {g.surveys.length} send{g.surveys.length === 1 ? "" : "s"} • {submitted}/{recipientsTotal} responded
                                </p>
                              </div>
                              <ChevronDown className="w-4 h-4 text-muted-foreground transition-transform group-open:rotate-180" />
                            </summary>
                            <div className="px-3 pb-3 border-t pt-2 space-y-2">
                              {g.surveys.map((s: any) => {
                                const resps = surveyResponses.filter((r: any) => r.survey_id === s.id);
                                const sub = resps.filter((r: any) => r.submitted_at).length;
                                const rec = Array.isArray(s.recipient_emails) ? s.recipient_emails.length : 0;
                                return (
                                  <div key={s.id} className="text-xs flex items-center justify-between gap-2 bg-background rounded p-2 border">
                                    <span className="truncate">
                                      <span className="font-semibold">{s.title || "Pest Activity Survey"}</span>{" "}
                                      <span className="text-muted-foreground">— {new Date(s.created_at).toLocaleDateString()}</span>
                                    </span>
                                    <Badge variant="outline" className="text-[10px]">{sub}/{rec}</Badge>
                                  </div>
                                );
                              })}
                            </div>
                          </details>
                        );
                      })}
                    </div>
                  );
                })()}
              </CardContent>
            </Card>
          )}

          <SurveyQuestionsPreview residentTerm={residentTerm} />

          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-primary" />Aggregated Responses by Send Date
                <Badge variant="secondary" className="ml-1 text-xs">
                  {surveyResponses.filter((r) => r.submitted_at).length} submitted
                </Badge>
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Each section below is a cohort of responses from one survey send date.
              </p>
            </CardHeader>
            <CardContent>
              {(() => {
                const allSubmitted = surveyResponses.filter((r) => r.submitted_at);
                if (allSubmitted.length === 0) {
                  return (
                    <p className="text-sm text-muted-foreground text-center py-6">
                      No responses yet. Once {residentTerm}s submit, their answers will roll up here.
                    </p>
                  );
                }

                // Reusable renderer — produces the full aggregated breakdown
                // for a given subset of submitted responses.
                const renderAggregate = (submitted: any[]) => {
                  const tally: Record<string, Record<string, number>> = {};
                const openText: Record<string, string[]> = {};
                const ratingSums: Record<string, { sum: number; count: number }> = {};
                submitted.forEach((r) => {
                  const ans = (r.answers || {}) as Record<string, any>;
                  DEFAULT_PEST_SURVEY_QUESTIONS.forEach((q: SurveyQuestion) => {
                    const v = ans[q.id];
                    if (v === undefined || v === null || v === "") return;
                    if (q.type === "text") {
                      if (!openText[q.id]) openText[q.id] = [];
                      openText[q.id].push(String(v));
                    } else if (q.type === "rating") {
                      const num = Number(v);
                      if (!Number.isFinite(num)) return;
                      if (!ratingSums[q.id]) ratingSums[q.id] = { sum: 0, count: 0 };
                      ratingSums[q.id].sum += num;
                      ratingSums[q.id].count += 1;
                    } else {
                      if (!tally[q.id]) tally[q.id] = {};
                      const values = Array.isArray(v) ? v : [v];
                      values.forEach((val: any) => {
                        const key = String(val);
                        tally[q.id][key] = (tally[q.id][key] || 0) + 1;
                      });
                    }
                  });
                });
                const ratingQs = DEFAULT_PEST_SURVEY_QUESTIONS.filter((q) => q.type === "rating");
                const overallTotals = ratingQs.reduce(
                  (acc, q) => {
                    const r = ratingSums[q.id];
                    if (r) { acc.sum += r.sum; acc.count += r.count; }
                    return acc;
                  },
                  { sum: 0, count: 0 }
                );
                const overallAvg = overallTotals.count > 0 ? overallTotals.sum / overallTotals.count : null;
                return (
                  <div className="space-y-5">
                    {overallAvg !== null && (
                      <div className="rounded-lg border-2 border-primary/60 bg-primary/5 p-4 flex items-center justify-between">
                        <div>
                          <p className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">Overall Average</p>
                          <p className="text-xs text-muted-foreground">Across all rating questions • 5 = good</p>
                        </div>
                        <div className="text-right">
                          <p className="text-3xl font-bold text-primary tabular-nums">{overallAvg.toFixed(2)}<span className="text-base text-muted-foreground font-normal"> / 5</span></p>
                        </div>
                      </div>
                    )}
                    {DEFAULT_PEST_SURVEY_QUESTIONS.map((q: SurveyQuestion) => {
                      if (q.type === "text") {
                        const responses = openText[q.id] || [];
                        return (
                          <div key={q.id} className="border-l-2 border-primary/70 pl-3">
                            <p className="text-sm font-semibold mb-1.5">{q.label}</p>
                            {responses.length === 0 ? (
                              <p className="text-xs text-muted-foreground italic">No comments</p>
                            ) : (
                              <ul className="space-y-1.5">
                                {responses.map((c, i) => (
                                  <li key={i} className="text-xs bg-muted/40 rounded px-2 py-1.5">"{c}"</li>
                                ))}
                              </ul>
                            )}
                          </div>
                        );
                      }
                      if (q.type === "rating") {
                        const r = ratingSums[q.id];
                        const avg = r && r.count > 0 ? r.sum / r.count : null;
                        const pct = avg !== null ? (avg / 5) * 100 : 0;
                        return (
                          <div key={q.id} className="border-l-2 border-primary/70 pl-3">
                            <div className="flex items-baseline justify-between mb-1.5 gap-2">
                              <p className="text-sm font-semibold">{q.label}</p>
                              <p className="text-sm font-bold tabular-nums whitespace-nowrap">
                                {avg !== null ? `${avg.toFixed(2)} / 5` : "—"}
                                <span className="text-xs text-muted-foreground font-normal ml-1">({r?.count || 0})</span>
                              </p>
                            </div>
                            <div className="h-2 bg-muted rounded overflow-hidden">
                              <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        );
                      }
                      const counts = tally[q.id] || {};
                      const total = Object.values(counts).reduce((a, b) => a + b, 0);
                      const opts = q.options || Object.keys(counts);
                      return (
                        <div key={q.id} className="border-l-2 border-primary/70 pl-3">
                          <p className="text-sm font-semibold mb-2">{q.label}</p>
                          <div className="space-y-1.5">
                            {opts.map((opt) => {
                              const c = counts[opt] || 0;
                              const pct = total ? Math.round((c / total) * 100) : 0;
                              return (
                                <div key={opt} className="space-y-0.5">
                                  <div className="flex justify-between text-xs">
                                    <span>{opt}</span>
                                    <span className="text-muted-foreground tabular-nums">
                                      {c} ({pct}%)
                                    </span>
                                  </div>
                                  <div className="h-2 bg-muted rounded overflow-hidden">
                                    <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
                };

                // Cohort responses by the parent survey's send date.
                // Each cohort = all responses tied to surveys sent on the same calendar day.
                const surveyById = new Map<string, any>();
                surveys.forEach((s: any) => surveyById.set(s.id, s));
                const cohorts = new Map<string, { label: string; date: Date; responses: any[]; recipients: number; surveyIds: Set<string> }>();
                allSubmitted.forEach((r: any) => {
                  const parent = surveyById.get(r.survey_id);
                  if (!parent) return;
                  const sentRaw = parent.sent_at || parent.created_at;
                  const d = new Date(sentRaw);
                  if (!Number.isFinite(d.getTime())) return;
                  const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
                  if (!cohorts.has(key)) {
                    cohorts.set(key, {
                      label: d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }),
                      date: new Date(d.getFullYear(), d.getMonth(), d.getDate()),
                      responses: [],
                      recipients: 0,
                      surveyIds: new Set<string>(),
                    });
                  }
                  const c = cohorts.get(key)!;
                  c.responses.push(r);
                  c.surveyIds.add(parent.id);
                });
                // Add recipient totals per cohort
                cohorts.forEach((c) => {
                  c.recipients = Array.from(c.surveyIds).reduce((acc, id) => {
                    const s = surveyById.get(id);
                    return acc + (Array.isArray(s?.recipient_emails) ? s.recipient_emails.length : 0);
                  }, 0);
                });
                const ordered = Array.from(cohorts.values()).sort((a, b) => b.date.getTime() - a.date.getTime());
                if (ordered.length === 0) return renderAggregate(allSubmitted);

                return (
                  <div className="space-y-2">
                    {ordered.map((c, i) => (
                      <details key={c.label} className="rounded-lg border-2 border-primary/40 bg-background group" open={i === 0}>
                        <summary className="flex items-center justify-between gap-3 cursor-pointer list-none p-3 bg-primary/[0.06] rounded-t-lg">
                          <div className="min-w-0 flex items-center gap-2">
                            <Calendar className="w-4 h-4 text-primary shrink-0" />
                            <div>
                              <p className="text-sm font-bold">Sent {c.label}</p>
                              <p className="text-[11px] text-muted-foreground">
                                {c.responses.length}/{c.recipients} responded • {c.surveyIds.size} send{c.surveyIds.size === 1 ? "" : "s"}
                              </p>
                            </div>
                          </div>
                          <ChevronDown className="w-4 h-4 text-muted-foreground transition-transform group-open:rotate-180" />
                        </summary>
                        <div className="p-4 border-t">
                          {renderAggregate(c.responses)}
                        </div>
                      </details>
                    ))}
                  </div>
                );
              })()}
            </CardContent>
          </Card>

          {surveys.length > 0 && (
            <Card className="shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Send History</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {surveys.map((s) => {
                    const responses = surveyResponses.filter((r) => r.survey_id === s.id);
                    const submittedCount = responses.filter((r) => r.submitted_at).length;
                    const recipients = Array.isArray(s.recipient_emails) ? s.recipient_emails.length : 0;
                    const isExpanded = expandedSurveyId === s.id;
                    return (
                      <div key={s.id} className="border rounded-lg">
                        <button
                          className="w-full text-left p-3 flex items-center justify-between"
                          onClick={() => setExpandedSurveyId(isExpanded ? null : s.id)}
                        >
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold truncate">{s.title}</p>
                            <p className="text-xs text-muted-foreground">
                              Sent {new Date(s.created_at).toLocaleDateString()} • {submittedCount}/{recipients} responded
                            </p>
                          </div>
                          <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                        </button>
                        {isExpanded && (
                          <div className="px-3 pb-3 border-t pt-3">
                            {responses.length === 0 ? (
                              <p className="text-xs text-muted-foreground">No recipients yet.</p>
                            ) : (
                              <ul className="space-y-1">
                                {responses.map((r) => (
                                  <li key={r.id} className="flex items-center justify-between text-xs">
                                    <span className="truncate">{r.recipient_email || "Unknown"}</span>
                                    <Badge variant={r.submitted_at ? "default" : "outline"} className="text-xs">
                                      {r.submitted_at ? "Submitted" : "Pending"}
                                    </Badge>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}
            </TabsContent>

            <TabsContent value="onboarding" className="mt-0 space-y-5">
              <Card className="border-primary/60 shadow-md">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Send className="w-4 h-4 text-primary" />Send Property Onboarding Survey
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">
                    Sent once to property management to capture scheduling preferences,
                    points of contact, and benchmark data so we can tailor service from day one.
                  </p>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <Label className="text-sm">Survey Title</Label>
                    <Input value={onbTitle} onChange={(e) => setOnbTitle(e.target.value)} />
                  </div>
                  <div>
                    <Label className="text-sm">Intro Message</Label>
                    <Textarea rows={3} value={onbIntro} onChange={(e) => setOnbIntro(e.target.value)} />
                  </div>
                  <div>
                    <Label className="text-sm">Recipient Emails</Label>
                    <Textarea
                      rows={3}
                      placeholder="Paste property manager emails — one per line, or comma-separated"
                      value={onbEmails}
                      onChange={(e) => setOnbEmails(e.target.value)}
                    />
                    <p className="text-[11px] text-muted-foreground mt-1">
                      Each recipient gets a unique link so you can track who has responded.
                    </p>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <Button
                      onClick={() => sendSurveyGeneric("onboarding")}
                      disabled={sendingOnb || !onbEmails.trim()}
                      className="flex-1"
                      size="lg"
                    >
                      <Send className="w-4 h-4 mr-2" />
                      {sendingOnb ? "Sending..." : "Send Onboarding Survey"}
                    </Button>
                    <Button
                      onClick={() => createShareableLink("onboarding")}
                      disabled={generatingLink === "onboarding"}
                      variant="outline"
                      className="flex-1"
                      size="lg"
                    >
                      <Copy className="w-4 h-4 mr-2" />
                      {generatingLink === "onboarding" ? "Generating..." : "Copy Shareable Link"}
                    </Button>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Use the shareable link when emailing isn't ideal — it works the same way as a sent survey.
                  </p>
                </CardContent>
              </Card>

              <SurveyQuestionsPreview
                residentTerm="property manager"
                questions={DEFAULT_ONBOARDING_SURVEY_QUESTIONS}
              />

              {/* Onboarding survey responses — aggregated + per-recipient */}
              {(() => {
                const onbSurveyIds = new Set(
                  surveys
                    .filter((s: any) => {
                      const qs = Array.isArray(s.questions) ? s.questions : [];
                      return qs.some((q: any) => typeof q?.id === "string" && q.id.startsWith("onb_"));
                    })
                    .map((s: any) => s.id)
                );
                const onbResponses = surveyResponses.filter((r: any) => onbSurveyIds.has(r.survey_id));
                const submitted = onbResponses.filter((r: any) => r.submitted_at);

                return (
                  <>
                    <Card className="shadow-sm">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base flex items-center gap-2">
                          <BarChart3 className="w-4 h-4 text-primary" />Onboarding Responses
                          <Badge variant="secondary" className="ml-1 text-xs">
                            {submitted.length} submitted
                          </Badge>
                        </CardTitle>
                        <p className="text-xs text-muted-foreground">
                          Aggregated answers from property managers who completed the onboarding survey.
                        </p>
                      </CardHeader>
                      <CardContent>
                        {submitted.length === 0 ? (
                          <p className="text-sm text-muted-foreground text-center py-6">
                            No onboarding responses yet. Once property managers submit, their answers will roll up here.
                          </p>
                        ) : (() => {
                          const tally: Record<string, Record<string, number>> = {};
                          const openText: Record<string, string[]> = {};
                          submitted.forEach((r: any) => {
                            const ans = (r.answers || {}) as Record<string, any>;
                            DEFAULT_ONBOARDING_SURVEY_QUESTIONS.forEach((q) => {
                              const v = ans[q.id];
                              if (v === undefined || v === null || v === "") return;
                              if (q.type === "text") {
                                if (!openText[q.id]) openText[q.id] = [];
                                openText[q.id].push(String(v));
                              } else {
                                if (!tally[q.id]) tally[q.id] = {};
                                const values = Array.isArray(v) ? v : [v];
                                values.forEach((val: any) => {
                                  const key = String(val);
                                  tally[q.id][key] = (tally[q.id][key] || 0) + 1;
                                });
                              }
                            });
                          });
                          return (
                            <div className="space-y-5">
                              {DEFAULT_ONBOARDING_SURVEY_QUESTIONS.map((q) => {
                                if (q.type === "text") {
                                  const responses = openText[q.id] || [];
                                  return (
                                    <div key={q.id} className="border-l-2 border-primary/70 pl-3">
                                      <p className="text-sm font-semibold mb-1.5">{q.label}</p>
                                      {responses.length === 0 ? (
                                        <p className="text-xs text-muted-foreground italic">No answers</p>
                                      ) : (
                                        <ul className="space-y-1.5">
                                          {responses.map((c, i) => (
                                            <li key={i} className="text-xs bg-muted/40 rounded px-2 py-1.5">"{c}"</li>
                                          ))}
                                        </ul>
                                      )}
                                    </div>
                                  );
                                }
                                const counts = tally[q.id] || {};
                                const total = Object.values(counts).reduce((a, b) => a + b, 0);
                                const opts = q.options || Object.keys(counts);
                                return (
                                  <div key={q.id} className="border-l-2 border-primary/70 pl-3">
                                    <p className="text-sm font-semibold mb-2">{q.label}</p>
                                    {total === 0 ? (
                                      <p className="text-xs text-muted-foreground italic">No answers</p>
                                    ) : (
                                      <div className="space-y-1.5">
                                        {opts.map((opt) => {
                                          const c = counts[opt] || 0;
                                          const pct = total ? Math.round((c / total) * 100) : 0;
                                          return (
                                            <div key={opt} className="space-y-0.5">
                                              <div className="flex justify-between text-xs">
                                                <span>{opt}</span>
                                                <span className="text-muted-foreground tabular-nums">
                                                  {c} ({pct}%)
                                                </span>
                                              </div>
                                              <div className="h-2 bg-muted rounded overflow-hidden">
                                                <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                                              </div>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          );
                        })()}
                      </CardContent>
                    </Card>

                    {submitted.length > 0 && (
                      <Card className="shadow-sm">
                        <CardHeader className="pb-3">
                          <CardTitle className="text-base">Individual Responses</CardTitle>
                          <p className="text-xs text-muted-foreground">Click a respondent to see their full answers.</p>
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-2">
                            {submitted.map((r: any) => {
                              const isExpanded = expandedSurveyId === `onb-${r.id}`;
                              const ans = (r.answers || {}) as Record<string, any>;
                              return (
                                <div key={r.id} className="border rounded-lg">
                                  <button
                                    className="w-full text-left p-3 flex items-center justify-between"
                                    onClick={() => setExpandedSurveyId(isExpanded ? null : `onb-${r.id}`)}
                                  >
                                    <div className="flex-1 min-w-0">
                                      <p className="text-sm font-semibold truncate">
                                        {r.respondent_name || r.recipient_email || "Anonymous"}
                                      </p>
                                      <p className="text-xs text-muted-foreground">
                                        Submitted {r.submitted_at ? new Date(r.submitted_at).toLocaleString() : "—"}
                                      </p>
                                    </div>
                                    <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                                  </button>
                                  {isExpanded && (
                                    <div className="px-3 pb-3 border-t pt-3 space-y-2">
                                      {DEFAULT_ONBOARDING_SURVEY_QUESTIONS.map((q) => {
                                        const v = ans[q.id];
                                        const display = Array.isArray(v) ? v.join(", ") : (v ?? "");
                                        return (
                                          <div key={q.id} className="text-xs">
                                            <p className="font-semibold">{q.label}</p>
                                            <p className="text-muted-foreground whitespace-pre-wrap">
                                              {display === "" ? "—" : String(display)}
                                            </p>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </CardContent>
                      </Card>
                    )}
                  </>
                );
              })()}
            </TabsContent>
          </Tabs>
        </div>
      </TabsContent>

      {isHOA && (
        <TabsContent value="quarterly" className="mt-0">
          <QuarterlyVideoTab propertyId={property.id} mode="admin" uploaderName="Crest Admin" />
        </TabsContent>
      )}

    </Tabs>
  );
};

export default PropertyDashboard;
