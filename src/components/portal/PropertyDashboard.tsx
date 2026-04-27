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
import { Checkbox } from "@/components/ui/checkbox";
import {
  ChevronDown, Calendar, Plus, Edit, Trash2,
  CheckCircle, Wrench, Image, ExternalLink, MapPin, Bug,
  Copy, FileText, Send, X, Flag, ClipboardList, CalendarPlus, Link2, FileDown, FlaskConical, User,
  BarChart3, Phone, Mail, Repeat, Video, Upload, Eye, Download
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { ReadOnlyMapCanvas } from "@/components/ReadOnlyMapCanvas";
import { MapCanvas } from "@/components/MapCanvas";
import { ProductUsageEditor } from "@/components/portal/ProductUsageEditor";
import { ProductUsageSummary, ProductUsageTotalsCard } from "@/components/portal/ProductUsageSummary";
import { UnitProductPicker } from "@/components/portal/UnitProductPicker";
import { ProductUsage, normalizeUsageList, makeDefaultUsage } from "@/lib/productCatalog";
import { computeUpcomingUnits } from "@/lib/upcomingUnits";
import { DEFAULT_PEST_SURVEY_QUESTIONS, DEFAULT_SURVEY_INTRO, type SurveyQuestion } from "@/lib/surveyDefaults";
import { ServiceComments, type ServiceComment } from "@/components/portal/ServiceComments";
import { readUnitPlanConfig, computeOverage, formatOverageMoney } from "@/lib/unitOverage";
import { STAFF_NAMES } from "@/lib/staffRoster";

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

const ACTIVITY_OPTIONS = ["None", "Low", "Medium", "High", "Very High"];
// Status option sets are now context-aware: technicians only see the choices
// that make sense for the kind of visit they're filling out (treatment vs.
// inspection). The underlying canonical values are preserved so existing
// filtering / follow-up logic keeps working.
const TREATMENT_STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "To Be Treated",       label: "To Be Treated" },
  { value: "Treated - Complete",  label: "Completed" },
  { value: "Treated - Follow Up", label: "Treated - Follow Up Needed" },
  { value: "Not Treated",         label: "Not Treated" },
];
const INSPECTION_STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "To Be Treated",              label: "To Be Inspected" },
  { value: "Inspected: Free and Clear",  label: "Free and Clear" },
  { value: "Inspected: Activity Found",  label: "Activity Found - Follow Up Needed" },
  { value: "Not Treated",                label: "Not Inspected" },
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
  const [pastViewMode, setPastViewMode] = useState<"date" | "unit">("date");
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
    unit_number: "", pest_type: "", location_type: "", comments: "", preferred_date: "",
    request_type: "" as "" | "treatment" | "inspection",
    occupancy_status: "" as "" | "Occupied" | "Vacant",
    email_tenant: false, tenant_email: "", prep_sheet_id: "", right_to_treat: false,
    // HOA-mode customer contact (homeowner submitting the request).
    customer_name: "", customer_phone: "",
  });
  const [submittingWorkOrder, setSubmittingWorkOrder] = useState(false);
  const [activeTab, setActiveTab] = useState<string>("map");
  const [addingServiceDate, setAddingServiceDate] = useState("");
  const [addingServiceType, setAddingServiceType] = useState("Commercial General Pest Control");
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  // Inline add-unit state
  const [addingUnitToService, setAddingUnitToService] = useState<string | null>(null);
  const [newUnitData, setNewUnitData] = useState<any>({ unit_number: "", findings: "", pest_activity: "None", products_used: "", status: "Complete", notes: "", kind: "service" });
  // Inline add-unit for upcoming
  const [addingPlannedUnit, setAddingPlannedUnit] = useState<string | null>(null);
  const [newPlannedUnit, setNewPlannedUnit] = useState("");
  // Inline reschedule of the next upcoming service. Persists the new date and
  // projection of the following visits naturally rolls forward at the cadence.
  const [reschedulingId, setReschedulingId] = useState<string | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState<string>("");
  const [rescheduleSaving, setRescheduleSaving] = useState(false);
  // Inline completion form data
  const [completionData, setCompletionData] = useState<Record<string, {
    unitRows: { unit_number: string; target_pest: string; findings: string; pest_activity: string; products_used: ProductUsage[]; status: string; notes: string; source: string }[];
    summary: string; findings: string; notes: string; technician: string;
    time_in: string; time_out: string;
    photos: { url: string; uploading?: boolean }[];
    products: ProductUsage[];
  }>>({});
  const [uploadingPhotoFor, setUploadingPhotoFor] = useState<string | null>(null);
  // Tracks per-unit photo uploads:  `${serviceId}:${unitIndex}` while uploading
  const [uploadingUnitPhotoFor, setUploadingUnitPhotoFor] = useState<string | null>(null);
  // Tracks per-unit photo uploads in the in-progress completion form (rows aren't saved yet)
  const [uploadingCompletionUnitPhotoFor, setUploadingCompletionUnitPhotoFor] = useState<string | null>(null);
  const [pendingRequests, setPendingRequests] = useState<any[]>([]);
  const [prepSheets, setPrepSheets] = useState<{ id: string; title: string; description: string | null; treatment_type: string; file_url: string | null }[]>([]);
  const [expandedPrepSheet, setExpandedPrepSheet] = useState<string | null>(null);
  const [copyingPrepSheet, setCopyingPrepSheet] = useState<string | null>(null);
  // Per-prep-sheet "email this PDF" form state.
  const [prepEmailDraft, setPrepEmailDraft] = useState<Record<string, string>>({});
  const [prepEmailSending, setPrepEmailSending] = useState<string | null>(null);

  // Survey state — mirrors PMPortalView so admin has full survey workflow
  const [surveys, setSurveys] = useState<any[]>([]);

  // Quarterly Updates (videos + comments)
  const [quarterlyUpdates, setQuarterlyUpdates] = useState<any[]>([]);
  const [quTitle, setQuTitle] = useState("");
  const [quComment, setQuComment] = useState("");
  const [quUploadedBy, setQuUploadedBy] = useState("");
  const [quFile, setQuFile] = useState<File | null>(null);
  const [quUploading, setQuUploading] = useState(false);
  const [surveyResponses, setSurveyResponses] = useState<any[]>([]);
  const [surveyTitle, setSurveyTitle] = useState("Pest Activity Survey");
  const [surveyIntro, setSurveyIntro] = useState(DEFAULT_SURVEY_INTRO);
  const [surveyEmails, setSurveyEmails] = useState("");
  const [sendingSurvey, setSendingSurvey] = useState(false);
  const [expandedSurveyId, setExpandedSurveyId] = useState<string | null>(null);

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
    const loadPrepSheets = async () => {
      const { data } = await supabase.from("portal_prep_sheets")
        .select("*")
        .order("title");
      if (data) setPrepSheets(data);
    };
    loadRequests();
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

  // Load quarterly updates for this property
  const reloadQuarterlyUpdates = async () => {
    const { data: rows } = await (supabase as any)
      .from("portal_quarterly_updates")
      .select("*")
      .eq("property_id", property.id)
      .order("created_at", { ascending: false });
    if (Array.isArray(rows)) setQuarterlyUpdates(rows);
  };
  useEffect(() => { reloadQuarterlyUpdates(); /* eslint-disable-next-line */ }, [property.id]);

  const uploadQuarterlyUpdate = async () => {
    if (!quFile) {
      toast({ title: "Choose a video file first", variant: "destructive" });
      return;
    }
    setQuUploading(true);
    try {
      const ext = quFile.name.split(".").pop() || "mp4";
      const safeName = `${property.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("portal-videos")
        .upload(safeName, quFile, { contentType: quFile.type || "video/mp4", upsert: false });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("portal-videos").getPublicUrl(safeName);
      const { error: insErr } = await (supabase as any).from("portal_quarterly_updates").insert({
        property_id: property.id,
        title: quTitle.trim() || null,
        comment: quComment.trim() || null,
        video_url: pub.publicUrl,
        file_name: quFile.name,
        uploaded_by: quUploadedBy.trim() || null,
      });
      if (insErr) throw insErr;
      toast({ title: "Quarterly update uploaded" });
      setQuTitle(""); setQuComment(""); setQuUploadedBy(""); setQuFile(null);
      await reloadQuarterlyUpdates();
    } catch (e: any) {
      console.error(e);
      toast({ title: "Upload failed", description: e?.message || "Could not upload", variant: "destructive" });
    } finally {
      setQuUploading(false);
    }
  };

  const deleteQuarterlyUpdate = async (id: string, videoUrl: string | null) => {
    if (!confirm("Delete this quarterly update?")) return;
    try {
      if (videoUrl) {
        const marker = "/portal-videos/";
        const idx = videoUrl.indexOf(marker);
        if (idx !== -1) {
          const path = videoUrl.slice(idx + marker.length);
          await supabase.storage.from("portal-videos").remove([path]);
        }
      }
      await (supabase as any).from("portal_quarterly_updates").delete().eq("id", id);
      setQuarterlyUpdates(prev => prev.filter(q => q.id !== id));
      toast({ title: "Deleted" });
    } catch (e: any) {
      toast({ title: "Could not delete", description: e?.message, variant: "destructive" });
    }
  };

  const sendSurvey = async () => {
    const emails = surveyEmails
      .split(/[\s,;]+/)
      .map((e) => e.trim().toLowerCase())
      .filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
    if (emails.length === 0) {
      toast({ title: "Add at least one valid email", variant: "destructive" });
      return;
    }
    setSendingSurvey(true);
    try {
      const { data: created, error } = await (supabase as any)
        .from("portal_surveys")
        .insert({
          property_id: property.id,
          client_id: clientId || null,
          title: surveyTitle.trim() || "Pest Activity Survey",
          intro: surveyIntro.trim() || null,
          questions: DEFAULT_PEST_SURVEY_QUESTIONS,
          recipient_emails: emails,
        })
        .select("*")
        .single();
      if (error || !created) throw error;
      const { data: sendRes } = await supabase.functions.invoke("send-tenant-survey", {
        body: { surveyId: created.id, appBaseUrl: window.location.origin },
      });
      if ((sendRes as any)?.ok) {
        toast({ title: "Survey sent", description: `Sent to ${(sendRes as any).sent} tenant(s).` });
      } else {
        toast({ title: "Survey created", description: "Email send may have failed — check logs." });
      }
      setSurveyEmails("");
      const [{ data: svys }, { data: respRows }] = await Promise.all([
        (supabase as any).from("portal_surveys").select("*").eq("property_id", property.id).order("created_at", { ascending: false }),
        (supabase as any).from("portal_survey_responses").select("*").eq("property_id", property.id).order("created_at", { ascending: false }),
      ]);
      if (Array.isArray(svys)) setSurveys(svys);
      if (Array.isArray(respRows)) setSurveyResponses(respRows);
    } catch (e: any) {
      console.error("sendSurvey failed", e);
      toast({ title: "Send failed", description: e?.message || "Try again", variant: "destructive" });
    } finally {
      setSendingSurvey(false);
    }
  };

  const propServices = services.filter(s => s.property_id === property.id);
  const pastServices = propServices
    .filter(s => s.status === "completed")
    .sort((a, b) => (b.service_date || "").localeCompare(a.service_date || ""));
  const scheduledServices = propServices
    .filter(s => s.status !== "completed")
    .sort((a, b) => (a.service_date || "").localeCompare(b.service_date || ""));

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
  type FrequencyKey = "weekly" | "bi-weekly" | "monthly" | "bi-monthly" | "quarterly";
  const FREQUENCY_DAYS: Record<FrequencyKey, number> = {
    "weekly": 7,
    "bi-weekly": 14,
    "monthly": 30,
    "bi-monthly": 60,
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

    // Prefer the unified contexts from computeUpcomingUnits — guarantees the
    // admin's pre-fill (source / target pest / findings) matches EXACTLY what
    // the PM portal shows for the same upcoming service.
    const ctxByUnit = new Map<string, import("@/lib/upcomingUnits").UpcomingUnitContext>();
    (unitContexts || []).forEach(c => ctxByUnit.set(String(c.unit_number), c));

    const sourceFromCtx = (unit: string, s: string | undefined): string => {
      if (s === "work_order") return "new-work-order";
      if (pendingRequests.some(r => String(r.unit_number) === String(unit))) return "new-work-order";
      return "follow-up";
    };

    const rows = displayUnits.length > 0
      ? displayUnits.map(u => {
          const ctx = ctxByUnit.get(String(u));
          const fu = ctx?.follow_up;
          const lastDetail = ctx?.last_unit_detail;
          return {
            unit_number: u,
            target_pest: ctx?.target_pest || "",
            findings: ctx?.findings || "",
            pest_activity: fu?.pest_activity || lastDetail?.pest_activity || "None",
            products_used: [] as ProductUsage[],
            status: "To Be Treated",
            notes: ctx?.notes || "",
            source: sourceFromCtx(u, ctx?.source),
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

  const completeService = async (serviceId: string) => {
    const data = completionData[serviceId];
    const unitRows = (data?.unitRows?.filter(r => r.unit_number) || []).map((r: any) => ({
      ...r,
      // Persist any per-unit photos uploaded during completion (strip uploading flags)
      photos: Array.isArray(r.photos)
        ? r.photos.filter((p: any) => p?.url && !p?.uploading).map((p: any) => ({ url: p.url }))
        : undefined,
    }));
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
    if (!workOrder.unit_number && !workOrder.comments) return;
    setSubmittingWorkOrder(true);
    // Case-insensitive normalization against existing units for this property
    const typed = (workOrder.unit_number || "").trim();
    const canonical = typed
      ? (allUnits.find(u => u.toLowerCase() === typed.toLowerCase()) || typed)
      : "Facility";
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
      request_type: workOrder.request_type === "inspection" ? "Inspection Request" : "Service Request",
      description: `${customerHeader}[${workOrder.request_type === "inspection" ? "INSPECTION" : "TREATMENT"}] ${workOrder.pest_type || "General"}${workOrder.location_type ? ` - ${workOrder.location_type}` : ""}${workOrder.comments ? ` - ${workOrder.comments}` : ""}`,
      pest_type: workOrder.pest_type || null,
      location_type: workOrder.location_type || null,
      preferred_date: workOrder.preferred_date || null,
      occupancy_status: workOrder.occupancy_status || null,
      tenant_email: tenantEmailToSave,
      prep_sheet_id: workOrder.email_tenant && workOrder.prep_sheet_id ? workOrder.prep_sheet_id : null,
      right_to_treat_requested: workOrder.email_tenant ? workOrder.right_to_treat : false,
    } as any).select("id").maybeSingle();
    if (insertErr) {
      toast({ title: "Could not submit work order", description: insertErr.message, variant: "destructive" });
      setSubmittingWorkOrder(false);
      return;
    }
    toast({ title: workOrder.request_type === "inspection" ? "Inspection request submitted" : "Work order submitted" });
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
        toast({ title: "Tenant email failed", description: "Work order saved, but email could not be sent.", variant: "destructive" });
      }
    }
    setWorkOrder({
      unit_number: "", pest_type: "", location_type: "", comments: "", preferred_date: "",
      request_type: "", occupancy_status: "",
      email_tenant: false, tenant_email: "", prep_sheet_id: "", right_to_treat: false,
      customer_name: "", customer_phone: "",
    });
    // Refresh requests
    const { data: reqs } = await supabase.from("portal_requests").select("*").eq("property_id", property.id).in("status", ["pending", "in_progress"]).order("created_at", { ascending: false });
    if (reqs) setPendingRequests(reqs);
    setSubmittingWorkOrder(false);
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
    // For weekly/bi-weekly cadence, the precise weekday isn't meaningful — show
    // "Month W#" (e.g. "April W3"). For longer cadences, fall back to the full date.
    if (propertyFrequency === "weekly" || propertyFrequency === "bi-weekly") {
      const month = date.toLocaleDateString("en-US", { month: "long" });
      const week = Math.ceil(date.getDate() / 7);
      return `${month} W${week}`;
    }
    return date.toLocaleDateString("en-US", { weekday: "short", month: "long", day: "numeric" });
  };
  const formatShortDate = (d: string | null) => d ? new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "TBD";

  const propertyLink = links.find(l => l.link_type === "sub" && l.assigned_property_ids && (l.assigned_property_ids as string[]).includes(property.id));

  // ─── Render inline-editable unit table for past services ───
  const renderEditableUnitTable = (s: PortalService) => {
    const unitDetails = s.unit_details && Array.isArray(s.unit_details) ? s.unit_details as any[] : [];
    // Past-service status dropdowns mirror the upcoming-visit options so the
    // technician sees the same vocabulary regardless of which tab they're in.
    const SERVICE_STATUSES: { value: string; label: string }[] = [
      { value: "Complete",          label: "Completed" },
      { value: "Needs Follow Up",   label: "Treated - Follow Up Needed" },
      { value: "Not Serviced",      label: "Not Treated" },
    ];
    const INSPECTION_STATUSES: { value: string; label: string }[] = [
      { value: "Free and Clear",  label: "Free and Clear" },
      { value: "Activity Found",  label: "Activity Found - Follow Up Needed" },
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
            const isFollowUp = unit.status === "Needs Follow Up" || unit.status === "Activity Found"
              || unit.status === "Treated - Follow Up" || unit.status === "Activity Found - Follow Up";
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
                    <input type="file" accept="image/*" capture="environment" className="hidden"
                      disabled={uploadingUnitPhotoFor === `${s.id}:${j}`}
                      onChange={e => {
                        const f = e.target.files?.[0];
                        if (f) uploadUnitPhoto(s.id, j, f);
                        (e.target as HTMLInputElement).value = "";
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
                    ? ["Free and Clear", "Activity Found"]
                    : ["Complete", "Needs Follow Up", "Not Serviced"]
                  ).map(a => <option key={a} value={a}>{a}</option>)}
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
    const products: ProductUsage[] = normalizeUsageList(s.products_used);

    // Use the SAME merge helper the PM portal uses so admin + PM can never
    // disagree about which units will be treated on the next service.
    const merged = computeUpcomingUnits({
      service: s,
      isFirstUpcoming: isUpcoming && isFirstUpcoming,
      requests: pendingRequests,
      mostRecentPast: pastServices[0] || null,
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

    return (
      <div className="px-4 pb-4 space-y-3 border-t border-border pt-3">
        {/* HOA mode: surface the site map inline with each service so the
            common areas treated are the visual focus of the report. */}
        {isHOA && !isUpcoming && (mapUrl || property.map_data) && (
          <div className="rounded-lg border-2 border-emerald-300 bg-emerald-50/40 overflow-hidden">
            <div className="px-3 py-2 bg-emerald-100/60 border-b border-emerald-200 flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-emerald-700" />
              <p className="text-xs font-bold uppercase tracking-wide text-emerald-800">
                Common Areas Treated — Site Map
              </p>
            </div>
            <div className="bg-background" style={{ height: 280 }}>
              {property.map_data ? (
                <ReadOnlyMapCanvas mapUrl={mapUrl} mapData={property.map_data} />
              ) : mapUrl ? (
                <img src={mapUrl} alt="Site map" className="w-full h-full object-contain" />
              ) : null}
            </div>
            <p className="px-3 py-1.5 text-[11px] text-emerald-900/80 italic border-t border-emerald-200">
              Reference the map above for which community areas were serviced on this visit.
            </p>
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

        {/* Past service: inline-editable unit table */}
        {!isUpcoming && renderEditableUnitTable(s)}

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

        {s.follow_up_recommended && s.follow_up_notes && (
          <div className="bg-orange-50 border border-orange-200 rounded-lg p-2.5">
            <p className="text-sm font-medium text-orange-700">⚠️ Follow-up: {s.follow_up_notes}</p>
          </div>
        )}

        {s.special_notes && (
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

        {/* Service-level comment thread (Crest ↔ PM) — applies to entire service */}
        {!isProjected && (
          <div className="pt-2 border-t border-border grid grid-cols-1 md:grid-cols-2 gap-3">
            {(() => {
              const allComments = Array.isArray(((s as any).report_data || {}).comments)
                ? ((s as any).report_data.comments as ServiceComment[])
                : [];
              return (
                <>
                  <div className="rounded-lg border-2 border-primary/60 bg-primary/5 p-2.5">
                    <ServiceComments
                      serviceId={s.id}
                      reportData={(s as any).report_data}
                      comments={allComments}
                      sender="crest"
                      filterSender="crest"
                      title="Service Comments: Crest"
                      defaultAuthor={s.technician || ""}
                      onChange={onRefresh}
                    />
                  </div>
                  <div className="rounded-lg border-2 border-sky-500 bg-sky-50/60 p-2.5">
                    <ServiceComments
                      serviceId={s.id}
                      reportData={(s as any).report_data}
                      comments={allComments}
                      sender="pm"
                      filterSender="pm"
                      title="Service Comments: Property Manager"
                      onChange={onRefresh}
                    />
                  </div>
                </>
              );
            })()}
          </div>
        )}

        {/* Inline service report form for upcoming services — always visible (mirrors Previous Services format) */}
        {isUpcoming && !isProjected && (() => {
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
              uc.source === "work_order" ? "new-work-order" : "follow-up",
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
          const missingContexts = merged.unitContexts.filter(
            (uc) => !existingUnitSet.has(String(uc.unit_number).trim())
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
                      findings: ctx.findings || "",
                      pest_activity: fu?.pest_activity || lastDetail?.pest_activity || "None",
                      products_used: [] as ProductUsage[],
                      status: "To Be Treated",
                      notes: ctx.notes || "",
                      source: ctx.source === "work_order" ? "new-work-order" : "follow-up",
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
              [s.id]: { ...prev[s.id], unitRows: [...prev[s.id].unitRows, { unit_number: "", target_pest: "", findings: "", pest_activity: "None", products_used: [] as ProductUsage[], status: "To Be Treated", notes: "", source: "" }] },
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
                    <Button variant="outline" size="sm" className="h-6 text-xs px-2" onClick={addRow}>
                      <Plus className="w-3 h-3 mr-0.5" />Add Area
                    </Button>
                  </div>
                  <div className="space-y-6">
                    {cd.unitRows.map((row: any, idx: number) => {
                      const isFollowUp = row.source === "follow-up" || row.status === "Treated - Follow Up";
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
                      return (
                        <div
                          key={idx}
                          className={`rounded-xl border-2 bg-card shadow-md ring-1 ring-border overflow-hidden ${
                            isFollowUp
                              ? "border-orange-500"
                              : isWorkOrder
                                ? "border-primary/70"
                                : "border-primary/60"
                          }`}
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
                                    row.status === "Treated - Follow Up" || row.status === "Inspected: Activity Found"
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
                            {(() => {
                              const uc = merged.unitContexts.find(
                                (c) => String(c.unit_number) === String(row.unit_number)
                              );
                              if (!uc) return null;
                              return (
                                <>
                                  {/* Structured work-order pills intentionally omitted —
                                      the same fields are already surfaced inside the
                                      Treatment Request Context block below to avoid
                                      redundancy. */}
                                  {uc.context && (
                                    <div className="md:col-span-2 rounded-lg border-2 border-sky-500 bg-sky-50/60 p-3">
                                      <div className="flex items-center gap-1.5 mb-1.5">
                                        <ClipboardList className="w-3.5 h-3.5 text-sky-700" />
                                        <Label className="text-xs font-bold text-sky-900 uppercase tracking-wide">
                                          {isWorkOrder
                                            ? (isInspectionWO ? "Inspection Request Context" : "Treatment Request Context")
                                            : "Last Service Context"}
                                        </Label>
                                      </div>
                                      <p className="text-sm whitespace-pre-wrap leading-relaxed text-foreground">
                                        {uc.context}
                                      </p>
                                    </div>
                                  )}
                                  {uc.findings && (
                                    <div className="md:col-span-2 rounded-lg border-2 border-amber-400 bg-amber-50/40 p-3">
                                      <div className="flex items-center gap-1.5 mb-1.5">
                                        <ClipboardList className="w-3.5 h-3.5 text-amber-700" />
                                        <Label className="text-xs font-bold text-amber-900 uppercase tracking-wide">
                                          Findings (from last visit)
                                        </Label>
                                      </div>
                                      <p className="text-sm whitespace-pre-wrap leading-relaxed text-foreground">
                                        {uc.findings}
                                      </p>
                                    </div>
                                  )}
                                </>
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
                              <Textarea
                                className="text-sm w-full px-2.5 py-2 min-h-[5rem] leading-snug whitespace-normal bg-background border-amber-400 focus-visible:ring-amber-400"
                                placeholder="What did the technician observe in this area?"
                                value={row.findings}
                                onChange={e => updateRow(idx, "findings", e.target.value)}
                              />
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
                                <input type="file" accept="image/*" capture="environment" className="hidden"
                                  disabled={uploadingCompletionUnitPhotoFor === `${s.id}:${idx}`}
                                  onChange={e => {
                                    const f = e.target.files?.[0];
                                    if (f) uploadCompletionUnitPhoto(s.id, idx, f);
                                    (e.target as HTMLInputElement).value = "";
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

      </div>
    );
  };

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
      {/* Property-type mode banner — makes the active view obvious to admins. */}
      {(propertyType === "hoa" || propertyType === "apartments") && (
        <div className={`mb-3 rounded-lg border-2 px-3.5 py-2 flex items-center gap-2 text-xs font-semibold ${
          propertyType === "hoa"
            ? "bg-emerald-50 border-emerald-300 text-emerald-900"
            : "bg-sky-50 border-sky-300 text-sky-900"
        }`}>
          <span className="px-1.5 py-0.5 rounded bg-white/70 border border-current/30 text-[10px] uppercase tracking-wider">
            {propertyType === "hoa" ? "HOA Portal" : "Apartment Portal"}
          </span>
          <span className="font-normal">
            {propertyType === "hoa"
              ? "Community-focused view — common areas are the focal point of each service. Per-unit treatment details are minimized."
              : "Unit-focused view — each unit shows full treatment detail. Common areas are summarized."}
          </span>
        </div>
      )}
      <TabsList className="w-full h-auto p-1.5 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-1.5 bg-muted/50 border-2 border-primary/60 rounded-xl shadow-sm mb-5">
        <TabsTrigger value="map" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md font-semibold text-sm py-3 rounded-lg transition-all flex flex-col items-center gap-1">
          <MapPin className="w-5 h-5" />
          <span>Site Map and Plan</span>
        </TabsTrigger>
        <TabsTrigger value="past" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md font-semibold text-sm py-3 rounded-lg transition-all flex flex-col items-center gap-1">
          <Calendar className="w-5 h-5" />
          <span>Previous Services <Badge variant="secondary" className="ml-1 text-xs h-4">{pastServices.length}</Badge></span>
        </TabsTrigger>
        <TabsTrigger value="request" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md font-semibold text-sm py-3 rounded-lg transition-all flex flex-col items-center gap-1">
          <Bug className="w-5 h-5" />
          <span>Add work order</span>
        </TabsTrigger>
        <TabsTrigger value="upcoming" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md font-semibold text-sm py-3 rounded-lg transition-all flex flex-col items-center gap-1">
          <ClipboardList className="w-5 h-5" />
          <span>Upcoming Services <Badge variant="secondary" className="ml-1 text-xs h-4">{allUpcoming.length}</Badge></span>
        </TabsTrigger>
        <TabsTrigger value="prep" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md font-semibold text-sm py-3 rounded-lg transition-all flex flex-col items-center gap-1">
          <FileDown className="w-5 h-5" />
          <span>Prep Sheets <Badge variant="secondary" className="ml-1 text-xs h-4">{prepSheets.length}</Badge></span>
        </TabsTrigger>
        <TabsTrigger value="survey" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md font-semibold text-sm py-3 rounded-lg transition-all flex flex-col items-center gap-1">
          <BarChart3 className="w-5 h-5" />
          <span>Tenant Survey <Badge variant="secondary" className="ml-1 text-xs h-4">{surveys.length}</Badge></span>
        </TabsTrigger>
        <TabsTrigger value="quarterly" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md font-semibold text-sm py-3 rounded-lg transition-all flex flex-col items-center gap-1">
          <Video className="w-5 h-5" />
          <span>Quarterly Updates <Badge variant="secondary" className="ml-1 text-xs h-4">{quarterlyUpdates.length}</Badge></span>
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
                <div>
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
                </div>
                <div>
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
                </div>
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
                Each service is billed at the base price and includes the listed number of interior units. Any units treated beyond that are billed at the additional-unit price.
              </p>
              <Textarea
                placeholder="Enter the overall plan for this property — treatment strategy, special considerations, scheduling notes, etc."
                className="min-h-[360px] text-sm resize-y leading-relaxed"
                value={planDraft}
                onChange={(e) => setPlanDraft(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
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
              <p className="text-xs text-muted-foreground mt-2">
                Auto-saves a moment after you stop typing. Visible to technicians and property managers.
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Property Point of Contact */}
        <Card className="shadow-sm border-primary/20 bg-gradient-to-br from-primary/[0.03] to-transparent">
          <CardHeader className="pb-3 pt-4 border-b bg-primary/[0.06]">
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <User className="w-5 h-5 text-primary" />
              Property Point of Contact
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              The property manager / on-site contact for this location.
            </p>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">
                  PM / Contact Name
                </Label>
                <Input
                  placeholder="Full name"
                  value={pocName}
                  onChange={(e) => setPocName(e.target.value)}
                />
              </div>
              <div>
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">
                  PM Email
                </Label>
                <Input
                  type="email"
                  placeholder="email@example.com"
                  value={pocEmail}
                  onChange={(e) => setPocEmail(e.target.value)}
                />
              </div>
              <div>
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">
                  PM Phone
                </Label>
                <Input
                  type="tel"
                  inputMode="tel"
                  placeholder="(555) 123-4567"
                  value={pocPhone}
                  onChange={(e) => setPocPhone(e.target.value)}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-3">
              PM info auto-saves a moment after you stop typing.
            </p>
          </CardContent>
        </Card>

        {/* Crest Point of Contact — the Crest staff member the PM should contact */}
        <Card className="shadow-sm border-primary/20 bg-gradient-to-br from-primary/[0.03] to-transparent">
          <CardHeader className="pb-3 pt-4 border-b bg-primary/[0.06]">
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <User className="w-5 h-5 text-primary" />
              Crest Point of Contact
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              The Crest staff member that the property manager should reach out to. Visible in the PM portal.
            </p>
          </CardHeader>
          <CardContent className="pt-4 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">
                  Crest Contact Name
                </Label>
                <Input
                  placeholder="Full name"
                  value={crestName}
                  onChange={(e) => setCrestName(e.target.value)}
                />
              </div>
              <div>
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">
                  Crest Email
                </Label>
                <Input
                  type="email"
                  placeholder="email@crestpestcontrol.com"
                  value={crestEmail}
                  onChange={(e) => setCrestEmail(e.target.value)}
                />
              </div>
              <div>
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">
                  Crest Phone
                </Label>
                <Input
                  type="tel"
                  inputMode="tel"
                  placeholder="(555) 123-4567"
                  value={crestPhone}
                  onChange={(e) => setCrestPhone(e.target.value)}
                />
              </div>
            </div>
            <div className="pt-3 border-t border-border">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">
                Crest Client Owner (internal)
              </Label>
              <div className="max-w-xs">
                <Select value={ownerTechDraft || "__none__"} onValueChange={saveOwnerTech}>
                  <SelectTrigger>
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
              <p className="text-xs text-muted-foreground mt-2">
                The Client Owner is notified (alongside the office) any time a work order or message is submitted on this property. Internal — not shown in the PM portal.
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
                <div className={`grid grid-cols-1 sm:grid-cols-2 ${cycleLength === 4 ? "lg:grid-cols-4" : ""} gap-3`}>
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
        <div className="space-y-3 max-w-[1600px] mx-auto">
        <div className="flex items-center justify-between pb-2.5 border-b-2 border-primary/70">
          <h3 className="text-base font-bold flex items-center gap-2">
            <Calendar className="w-5 h-5 text-secondary" />Previous Services
            <Badge variant="secondary" className="text-xs ml-1">{pastServices.length}</Badge>
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
                          {isFirst && <Badge className="text-xs bg-primary text-primary-foreground">Most Recent</Badge>}
                          <p className={`font-semibold ${isFirst ? "text-sm" : "text-xs"}`}>{(s as any).appointment_service || s.service_type}</p>
                          <Badge variant="default" className="text-xs">Completed</Badge>
                          {s.follow_up_recommended && <Badge className="text-xs bg-orange-500 text-white">Follow-up</Badge>}
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
            <Accordion type="multiple" defaultValue={Array.from(servicesByUnit.keys()).slice(0, 1)}>
              {Array.from(servicesByUnit.entries())
                .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
                .map(([unitNum, entries]) => (
                  <AccordionItem key={unitNum} value={unitNum} className="border rounded-lg mb-2 px-0 shadow-sm">
                    <AccordionTrigger className="px-3 py-2.5 text-sm hover:no-underline bg-muted/20 rounded-t-lg">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{unitNum === "General" ? "General Treatment" : `Unit ${unitNum}`}</span>
                        <Badge variant="secondary" className="text-xs">{entries.length} services</Badge>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="px-3 pb-3 space-y-1.5 pt-2">
                      {entries.map(({ service, unitDetail }, j) => (
                        <div key={`${service.id}-${j}`} className="bg-muted/40 rounded-lg p-2.5 text-xs cursor-pointer hover:bg-muted/70 transition-colors border border-transparent hover:border-border"
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
                      className={`flex flex-col items-center gap-1 p-3 rounded-lg border-2 transition-all ${active ? "bg-primary text-primary-foreground border-primary shadow-md" : "bg-background border-border hover:border-primary/70 hover:bg-muted/50"}`}
                    >
                      <Icon className="w-5 h-5" />
                      <span className="text-sm font-semibold">{opt.label}</span>
                      <span className={`text-xs ${active ? "opacity-90" : "text-muted-foreground"}`}>{opt.desc}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Unit or Area — free-text with case-insensitive suggestion list */}
            <div>
              <Label className="text-sm">Unit, Property, or Area *</Label>
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

            {/* Occupancy */}
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

            {/* Tenant Notification — full PM-portal parity */}
            <div className={`rounded-lg border border-border bg-muted/30 p-3 space-y-3 ${isHOA ? "hidden" : ""}`}>
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
                !workOrder.unit_number ||
                submittingWorkOrder ||
                (isHOA && (!workOrder.customer_name.trim() || !workOrder.customer_phone.trim() || !workOrder.tenant_email.trim()))
              }
            >
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
                mostRecentPast: pastServices[0] || null,
              });
              const unitsPlanned = mergedHeader.units;
              const pmNotesMapHeader: Record<string, string> =
                ((property.customer_preferences as any)?.pm_upcoming_notes as Record<string, string>) || {};
              const hasPmNote = !!(s.service_date && pmNotesMapHeader[s.service_date]);

              return (
                <Card key={s.id} className={`transition-all shadow-sm ${isFirst ? "border-primary/50 shadow-md ring-1 ring-primary/20 bg-gradient-to-br from-primary/[0.08] to-transparent" : isExpanded ? "border-primary/20" : "hover:border-muted-foreground/30"} ${isProjected ? "border-dashed" : ""}`}>
                  <button className="w-full text-left p-3 flex items-center justify-between" onClick={() => !isFirst && setExpandedUpcomingId(isExpanded && !isFirst ? null : s.id)}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {isFirst && <Badge className="text-xs bg-secondary text-secondary-foreground">Next Service</Badge>}
                        <p className={`font-semibold ${isFirst ? "text-sm" : "text-xs"}`}>{(() => {
                          // First upcoming visit auto-aligns with Visit #1 of the Site Map
                          // cadence rotation (weekly / bi-weekly only). Keeps admin + PM views in sync.
                          if (isFirst && (propertyFrequency === "weekly" || propertyFrequency === "bi-weekly")) {
                            const firstVisitLabel = ((cadencePlanDraft[propertyFrequency] || [])[0] || "").trim();
                            if (firstVisitLabel) return firstVisitLabel;
                          }
                          return (s as any).appointment_service || s.service_type;
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
                          <span className="italic">No date set — click Reschedule to pick one</span>
                        ) : (
                          formatDate(s.service_date)
                        )}
                        {(s as any).technician && ` • ${(s as any).technician}`}
                        {unitsPlanned.length > 0 && ` • ${unitsPlanned.length} units`}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {isFirst && (
                        <Popover
                          open={reschedulingId === s.id}
                          onOpenChange={(open) => {
                            if (open) {
                              setReschedulingId(s.id);
                              setRescheduleDate(isProjected ? "" : (s.service_date || today));
                            } else {
                              setReschedulingId(null);
                            }
                          }}
                        >
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs gap-1"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Calendar className="w-3 h-3" />
                              Reschedule
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent
                            className="w-72 p-3 space-y-2"
                            align="end"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div>
                              <Label className="text-xs">New service date</Label>
                              <Input
                                type="date"
                                value={rescheduleDate}
                                onChange={(e) => setRescheduleDate(e.target.value)}
                                className="h-9 mt-1"
                              />
                              <p className="text-[11px] text-muted-foreground mt-1.5 leading-snug">
                                Following visits will roll forward at the {propertyFrequency.replace("-", " ")} cadence.
                              </p>
                            </div>
                            <div className="flex justify-end gap-2 pt-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 text-xs"
                                onClick={() => setReschedulingId(null)}
                                disabled={rescheduleSaving}
                              >
                                Cancel
                              </Button>
                              <Button
                                size="sm"
                                className="h-8 text-xs"
                                disabled={!rescheduleDate || rescheduleSaving}
                                onClick={async () => {
                                  if (!rescheduleDate) return;
                                  setRescheduleSaving(true);
                                  try {
                                    if (isProjected) {
                                      // No DB row yet — create a real scheduled service so
                                      // the projection anchors on this confirmed date.
                                      await supabase.from("portal_services").insert({
                                        property_id: property.id,
                                        service_type: s.service_type || "General Pest Control",
                                        service_date: rescheduleDate,
                                        technician: (s as any).technician || null,
                                        status: "scheduled",
                                        units_planned: Array.isArray(s.units_planned) ? s.units_planned : [],
                                        frequency_days: propertyFrequencyDays,
                                      } as any);
                                    } else {
                                      await supabase
                                        .from("portal_services")
                                        .update({ service_date: rescheduleDate })
                                        .eq("id", s.id);
                                    }
                                    toast({ title: "Service rescheduled", description: `Next visit set to ${formatDate(rescheduleDate)}` });
                                    setReschedulingId(null);
                                    onRefresh();
                                  } catch (err: any) {
                                    toast({ title: "Reschedule failed", description: err?.message || "Unknown error", variant: "destructive" });
                                  } finally {
                                    setRescheduleSaving(false);
                                  }
                                }}
                              >
                                {rescheduleSaving ? "Saving…" : "Save date"}
                              </Button>
                            </div>
                          </PopoverContent>
                        </Popover>
                      )}
                      {!isFirst && <ChevronDown className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform ${isExpanded ? "rotate-180" : ""}`} />}
                    </div>
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
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5" />
              Following {futureProjectedDates.length} visits ({propertyFrequency.replace("-", " ").replace(/\b\w/g, c => c.toUpperCase())})
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {futureProjectedDates.map((d, idx) => {
                const cycleLength = propertyFrequency === "weekly" ? 4 : propertyFrequency === "bi-weekly" ? 2 : 1;
                const planArr = (cadencePlanDraft[propertyFrequency] || []) as string[];
                // Visit-of-cycle index — the "next" visit (allUpcoming[0]) is index 0 of the rotation.
                const visitInCycle = ((idx + 1) % cycleLength) + 1;
                const note = cycleLength > 1 ? (planArr[visitInCycle - 1] || "").trim() : "";
                return (
                  <div
                    key={`future-${idx}`}
                    className="flex items-start gap-2 bg-muted/40 border border-border rounded-md px-3 py-2"
                  >
                    <span className="w-5 h-5 rounded-full bg-muted text-muted-foreground text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                      {idx + 2}
                    </span>
                    <div className="min-w-0 flex-1">
                      <span className="text-xs block">{formatDate(d)}</span>
                      {cycleLength > 1 && (
                        <span className="text-xs text-primary font-semibold uppercase tracking-wide">
                          Visit {visitInCycle} of {cycleLength}
                        </span>
                      )}
                      {note && (
                        <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{note}</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground italic mt-2">
              Projected dates only — service details are confirmed closer to each visit.
            </p>
          </div>
        )}
        </div>
      </TabsContent>

      {/* ══════════ TAB 5: PREP SHEETS ══════════ */}
      <TabsContent value="prep" className="mt-0">
        <div className="space-y-2 max-w-4xl mx-auto">
          <div className="border-b-2 border-primary/70 pb-3 mb-3">
            <h3 className="text-xl font-bold flex items-center gap-2">
              <FileDown className="w-6 h-6 text-secondary" />Prep Sheets
              <Badge variant="secondary" className="text-xs ml-1">{prepSheets.length}</Badge>
            </h3>
            <p className="text-xs text-muted-foreground mt-1">View, download, or copy a link to share with tenants.</p>
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
        </div>
      </TabsContent>

      {/* ══════════ TAB 6: TENANT SURVEY ══════════ */}
      <TabsContent value="survey" className="mt-0">
        <div className="max-w-4xl mx-auto space-y-5">
          <Card className="border-primary/60 shadow-md">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Send className="w-4 h-4 text-primary" />Send Tenant Pest Survey
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Tenants get a short 5-question form. Results aggregate below as they respond.
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
                <Label className="text-sm">Tenant Emails</Label>
                <Textarea
                  rows={4}
                  placeholder="Paste tenant emails — one per line, or comma-separated"
                  value={surveyEmails}
                  onChange={(e) => setSurveyEmails(e.target.value)}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Each tenant gets their own unique link so you can see who responded.
                </p>
              </div>
              <Button onClick={sendSurvey} disabled={sendingSurvey || !surveyEmails.trim()} className="w-full" size="lg">
                <Send className="w-4 h-4 mr-2" />
                {sendingSurvey ? "Sending..." : "Send Survey"}
              </Button>
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <ClipboardList className="w-4 h-4 text-primary" />Survey Questions Preview
                <Badge variant="secondary" className="ml-1 text-xs">{DEFAULT_PEST_SURVEY_QUESTIONS.length} questions</Badge>
              </CardTitle>
              <p className="text-xs text-muted-foreground">This is exactly what tenants will see.</p>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {DEFAULT_PEST_SURVEY_QUESTIONS.map((q: SurveyQuestion, idx) => (
                  <div key={q.id} className="border rounded-md p-3 bg-muted/30">
                    <p className="text-sm font-semibold mb-2">
                      <span className="text-muted-foreground mr-1">{idx + 1}.</span>{q.label.replace(/^\s*\d+\.\s*/, "")}
                    </p>
                    {q.type === "rating" && (
                      <div className="space-y-1">
                        <div className="flex gap-1.5">
                          {[1, 2, 3, 4, 5].map((n) => (
                            <div key={n} className="w-9 h-9 rounded border bg-background flex items-center justify-center text-xs font-semibold text-muted-foreground">
                              {n}
                            </div>
                          ))}
                        </div>
                        <div className="flex justify-between text-xs text-muted-foreground max-w-[230px] px-0.5">
                          <span>1 = Poor</span><span>5 = Excellent</span>
                        </div>
                      </div>
                    )}
                    {q.type === "text" && (
                      <div className="border rounded bg-background h-14 text-xs text-muted-foreground italic px-2 py-1.5">
                        Open-ended response…
                      </div>
                    )}
                    {(q.type === "single" || q.type === "multi") && (
                      <div className="space-y-1">
                        {(q.options || []).map((opt) => (
                          <div key={opt} className="flex items-center gap-2 text-xs">
                            <div className={`w-3.5 h-3.5 border ${q.type === "single" ? "rounded-full" : "rounded-sm"} bg-background`} />
                            <span>{opt}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-primary" />Aggregated Responses
                <Badge variant="secondary" className="ml-1 text-xs">
                  {surveyResponses.filter((r) => r.submitted_at).length} submitted
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {(() => {
                const submitted = surveyResponses.filter((r) => r.submitted_at);
                if (submitted.length === 0) {
                  return (
                    <p className="text-sm text-muted-foreground text-center py-6">
                      No responses yet. Once tenants submit, their answers will roll up here.
                    </p>
                  );
                }
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
        </div>
      </TabsContent>

      {/* ══════════ TAB 7: QUARTERLY UPDATES ══════════ */}
      <TabsContent value="quarterly" className="mt-0">
        <div className="max-w-4xl mx-auto space-y-5">
          <Card className="border-primary/60 shadow-md">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Upload className="w-4 h-4 text-primary" />Upload Quarterly Update
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Upload a video walkthrough or update for this property. The PM/HOA portal will see it.
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label className="text-sm">Title (optional)</Label>
                <Input value={quTitle} onChange={(e) => setQuTitle(e.target.value)} placeholder="e.g., Q1 2026 Property Walkthrough" />
              </div>
              <div>
                <Label className="text-sm">Comment</Label>
                <Textarea value={quComment} onChange={(e) => setQuComment(e.target.value)} placeholder="Notes about this update — what we covered, what to look for, recommendations…" rows={4} />
              </div>
              <div>
                <Label className="text-sm">Uploaded by (optional)</Label>
                <Input value={quUploadedBy} onChange={(e) => setQuUploadedBy(e.target.value)} placeholder="Your name" />
              </div>
              <div>
                <Label className="text-sm">Video file</Label>
                <Input type="file" accept="video/*" onChange={(e) => setQuFile(e.target.files?.[0] || null)} />
                {quFile && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {quFile.name} ({(quFile.size / (1024 * 1024)).toFixed(1)} MB)
                  </p>
                )}
              </div>
              <Button onClick={uploadQuarterlyUpdate} disabled={quUploading || !quFile} className="w-full">
                {quUploading ? "Uploading…" : (<><Upload className="w-4 h-4 mr-2" />Upload Update</>)}
              </Button>
            </CardContent>
          </Card>

          {quarterlyUpdates.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                <Video className="w-10 h-10 mx-auto mb-2 opacity-40" />
                No quarterly updates uploaded yet.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {quarterlyUpdates.map((q) => (
                <Card key={q.id} className="overflow-hidden">
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <CardTitle className="text-base flex items-center gap-2">
                          <Video className="w-4 h-4 text-primary" />
                          {q.title || "Quarterly Update"}
                        </CardTitle>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {new Date(q.created_at).toLocaleString("en-US", {
                            month: "short", day: "numeric", year: "numeric",
                            hour: "numeric", minute: "2-digit",
                          })}
                          {q.uploaded_by ? ` • ${q.uploaded_by}` : ""}
                        </p>
                      </div>
                      <Button variant="ghost" size="icon" onClick={() => deleteQuarterlyUpdate(q.id, q.video_url)} title="Delete">
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {q.video_url && (
                      <video src={q.video_url} controls className="w-full rounded-md bg-black" preload="metadata" />
                    )}
                    {q.comment && (
                      <p className="text-sm whitespace-pre-wrap leading-relaxed">{q.comment}</p>
                    )}
                    {q.video_url && (
                      <a href={q.video_url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary inline-flex items-center gap-1 hover:underline">
                        <ExternalLink className="w-3 h-3" />Open video in new tab
                      </a>
                    )}
                  </CardContent>
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
