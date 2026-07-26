/**
 * CommercialDashboardView — Admin-side dashboard for commercial accounts
 * (e.g. restaurants). Sibling to PropertyDashboard; PortalAdmin delegates
 * to this when property_type === "commercial".
 *
 * Tabbed layout matching the look-and-feel of the HOA / apartment admin
 * (`PropertyDashboard`) but scaled for a SINGLE-LOCATION property. There
 * are no units, no sub-locations, no per-unit pricing, no work orders, no
 * surveys, no quarterly video tab. Tabs:
 *   1. Site Map        — property plan + map + service frequency
 *   2. Past Visits     — completed services with summary / findings /
 *                        products / photos (expandable)
 *   3. Upcoming Visits — scheduled services with quick actions
 *   4. Requests        — location-level service requests submitted from
 *                        the commercial PM portal, with admin response /
 *                        mark-complete / delete controls
 *
 * NOTE: We deliberately do not import or reuse PropertyDashboard so the
 * apartment + HOA flows stay completely untouched.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Calendar, ClipboardList, MapPin, Edit, Trash2, FileText, Wrench,
  Plus, Copy, ExternalLink, ChevronDown, FlaskConical, Camera, Image as ImageIcon,
  CheckCircle2, AlertTriangle, Send, Upload, Save, FileDown, Eye, Download,
  Bug, X,
} from "lucide-react";
import { ReadOnlyMapCanvas } from "@/components/ReadOnlyMapCanvas";
import { MapCanvas } from "@/components/MapCanvas";
import { ProductUsageSummary } from "@/components/portal/ProductUsageSummary";
import { ProductUsageEditor } from "@/components/portal/ProductUsageEditor";
import { normalizeUsageList as _normUsage } from "@/lib/productCatalog";
import PlanRichEditor from "@/components/portal/PlanRichEditor";
import { normalizeUsageList } from "@/lib/productCatalog";
// Commercial portal preset notes (distinct from apartment workflow).
const PRESET_NOTES = [
  { id: "liquid-restaurant-german", label: "Liquid Restaurant German Roach Service", text: "Applied liquid residual to baseboards and harborage areas in kitchen, dining areas, and bathroom areas. Placed gel bait in cracks, crevices, and high-activity zones, dusted wall voids and outlets, and used aerosol to flush out harborage areas. Monitors placed to track ongoing activity.\n\nPlease do not re-enter the space for at least 4 hours." },
  { id: "fogging-restaurant-german", label: "Fogging Restaurant German Roach Service", text: "Conducted a fogging service to deeply penetrate all areas throughout the kitchen, dining areas, and bathroom areas. Applied a liquid residual around the baseboards. Monitors placed to track ongoing activity.\n\nPlease do not re-enter the space for at least 4 hours. Please wipe down all accessible food surfaces before food prep." },
  { id: "standard-restaurant", label: "Standard Restaurant Service", text: "Applied liquid residual to baseboards and high-traffic areas in kitchen, dining, and service areas. Monitors placed to track ongoing activity.\n\nPlease stay away from treated areas until the product has dried." },
  { id: "interior-commercial", label: "Interior Commercial Service", text: "Applied liquid residual to baseboards, entry points, and high-traffic areas throughout the interior. Monitors placed to track ongoing activity.\n\nPlease stay away from treated areas until the product has dried." },
  { id: "exterior-commercial", label: "Exterior Commercial Service", text: "Applied liquid residual to exterior perimeter, entry points, and door thresholds. Treated harborage areas and inspected for pest activity." },
  { id: "commercial-rodent", label: "Commercial Rodent Service", text: "Inspected all exterior bait stations, refilled bait as needed, and documented activity levels. Stations secured and in good working condition." },
  { id: "sanitation-deficiency", label: "Sanitation Deficiency", text: "Sanitation issue – see attached photo. The active pest problem is unlikely to be resolved until this is addressed. We strongly recommend this be remediated as soon as possible." },
];

// Same roster as the Initial Pest Report technician dropdown.
const TECHNICIAN_NAMES = [
  "Darrell Tanner", "Jake Shubin", "Caleb Whalen", "Jackson Latham",
  "Dylan Gallegos", "Michael Muniz", "David Longoria", "Nick Stovall",
];
import CommercialApprovedMaterials from "@/components/portal/CommercialApprovedMaterials";
import { VisitPdfButton } from "@/components/portal/VisitPdfButton";
import {
  ConditionsReportSection, ServiceTeamSection,
  BusinessLicenseSection, HelpTutorialSection,
  persistServiceReportData, ConditionUnitPills,
} from "@/components/portal/CommercialSpragueSections";
import {
  CommercialNonChemEquipment,
  COMMERCIAL_PEST_OPTIONS,
  normalizeNonChemEquipment,
  type NonChemEquipmentEntry,
} from "@/components/portal/CommercialReportExtras";
import { supabase as supa } from "@/integrations/supabase/client";

interface PropertyData {
  id: string;
  name: string;
  address: string | null;
  image_url: string | null;
  map_data: any;
  map_image_url: string | null;
  customer_preferences: any;
  notes: string | null;
  equipment?: any;
}

interface ServiceData {
  id: string;
  property_id: string;
  service_date: string | null;
  service_time: string | null;
  service_type: string;
  technician: string | null;
  status: string;
  summary: string | null;
  findings: string | null;
  notes: string | null;
  follow_up_recommended: boolean | null;
  follow_up_notes: string | null;
  products_used: any;
  photos: any;
  special_notes: string | null;
  office_notes?: string | null;
  report_data?: any;
}

interface PortalLink {
  id: string; client_id: string; token: string; link_type: string;
  label: string | null; assigned_property_ids: any; is_active: boolean;
}

interface Props {
  property: PropertyData;
  services: ServiceData[];
  links: PortalLink[];
  clientName: string;
  onEditService?: (s: ServiceData) => void;
  onDeleteService?: (id: string) => void;
  onCopyLink?: (token: string) => void;
  onOpenPortal?: (token: string) => void;
  onRefresh?: () => void;
  onUpdatePropertyImage?: (propId: string, file: File) => Promise<void> | void;
  uploadingPropertyImage?: boolean;
  onUpdatePropertyMapData?: (propId: string, mapData: string) => Promise<void> | void;
  /** When true, hide ALL edit/save/delete/upload affordances —
   * customer-facing read-only mirror of the admin view. */
  readOnly?: boolean;
}

const todayISO = () => new Date().toISOString().split("T")[0];
const fmtDate = (iso: string | null) =>
  iso ? new Date(iso + "T00:00:00").toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  }) : "—";
const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit",
  });

// Convert "HH:mm" (or "HH:mm - HH:mm") 24h strings to friendly 12h AM/PM.
// Falls back to the raw value when it can't parse.
const to12h = (t: string) => {
  const m = t.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return t.trim();
  let h = parseInt(m[1], 10);
  const mm = m[2];
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${mm} ${ampm}`;
};
const fmtTime = (raw: string | null | undefined) => {
  if (!raw) return "";
  const parts = raw.split(/\s*[-–]\s*/);
  return parts.map(to12h).join(" – ");
};

const FREQUENCY_OPTIONS = [
  { key: "weekly",     label: "Weekly" },
  { key: "bi-weekly",  label: "Bi-Weekly" },
  { key: "monthly",    label: "Monthly" },
  { key: "bi-monthly", label: "Bi-Monthly" },
  { key: "quarterly",  label: "Quarterly" },
  { key: "one-time",   label: "One-Time" },
] as const;

const COMMERCIAL_SERVICE_TYPES = [
  "Commercial General Pest",
  "General Pest Control",
  "Mosquito Service",
  "Rodent Trapping",
  "Rodent Exclusion",
  "Rodent Trapping & Exclusion",
  "Rodent Bait Boxes",
  "Dewebbing",
  "Other",
];

const STATUS_OPTIONS = [
  { value: "scheduled", label: "Scheduled" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

// Target Pests chip editor — toggle badges saved to report_data.target_pests.
// This is the only place the field is writable now that the separate
// appointment-report editor is gone for commercial properties.
function TargetPestsEditor({
  value, onChange, readOnly,
}: {
  value: string[];
  onChange?: (next: string[]) => void;
  readOnly?: boolean;
}) {
  const toggle = (p: string) => {
    if (readOnly || !onChange) return;
    onChange(value.includes(p) ? value.filter(x => x !== p) : [...value, p]);
  };
  return (
    <div className="rounded-md border border-primary/30 bg-primary/5 p-2 space-y-1.5">
      <p className="text-[11px] font-bold uppercase tracking-wide text-foreground/70 flex items-center gap-1">
        <AlertTriangle className="w-3 h-3 text-primary" /> Target Pests
      </p>
      {readOnly && value.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">None recorded.</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {(readOnly ? value : [...COMMERCIAL_PEST_OPTIONS]).map(p => {
            const active = value.includes(p);
            return (
              <Badge
                key={p}
                variant={active ? "default" : "outline"}
                className={`text-[11px] h-7 px-2.5 ${readOnly ? "" : "cursor-pointer"}`}
                onClick={() => toggle(p)}
              >
                {p}
              </Badge>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Equipment options — kept in sync with the sales report, AppointmentReport,
// and HOA/apartment PropertyDashboard so the lists "jive" across the app.
const EQUIPMENT_OPTIONS = [
  "Rodent Bait Stations",
  "Rodent Traps",
  "Mosquito Buckets",
  "Fly Light",
  "Pest Monitors",
] as const;

type EquipItem = { name: string; count: number };

const normalizeEquipment = (raw: any): EquipItem[] => {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((e: any) => {
      if (typeof e === "string") return { name: e, count: 1 };
      if (e && typeof e === "object" && e.name) {
        const n = Number(e.count);
        return { name: String(e.name), count: Number.isFinite(n) && n > 0 ? n : 1 };
      }
      return null;
    })
    .filter(Boolean) as EquipItem[];
};

function PropertyEquipmentCard({
  propertyId,
  initial,
  onSaved,
  readOnly,
}: { propertyId: string; initial: any; onSaved?: () => void; readOnly?: boolean }) {
  const [items, setItems] = useState<EquipItem[]>(normalizeEquipment(initial));
  useEffect(() => { setItems(normalizeEquipment(initial)); }, [propertyId]); // eslint-disable-line
  const save = async (next: EquipItem[]) => {
    if (readOnly) return;
    setItems(next);
    const { error } = await supabase
      .from("portal_properties")
      .update({ equipment: next as any })
      .eq("id", propertyId);
    if (error) {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
      return;
    }
    onSaved?.();
  };
  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-3 pt-4 border-b bg-primary/[0.06]">
        <CardTitle className="text-base font-bold flex items-center gap-2">
          <Wrench className="w-5 h-5 text-primary" /> Equipment On-Site
        </CardTitle>
        <p className="text-xs text-muted-foreground mt-0.5">
          Monitoring devices and equipment installed at this property. Synced
          with the rest of Crest (sales reports, appointment reports).
        </p>
      </CardHeader>
      <CardContent className="pt-3 space-y-1">
        {EQUIPMENT_OPTIONS.map((eq) => {
          const item = items.find((i) => i.name === eq);
          const isChecked = !!item;
          return (
            <div
              key={eq}
              className={`flex items-center gap-2.5 text-sm rounded-md px-2 py-2 border transition-all ${
                isChecked ? "bg-primary/10 border-primary/60 font-medium" : "border-transparent hover:bg-muted/50 hover:border-border/50"
              }`}
            >
              <label className={`flex items-center gap-2.5 flex-1 ${readOnly ? "cursor-default" : "cursor-pointer"}`}>
                <input
                  type="checkbox"
                  checked={isChecked}
                  disabled={readOnly}
                  onChange={async () => {
                    const next = isChecked
                      ? items.filter((e) => e.name !== eq)
                      : [...items, { name: eq, count: 1 }];
                    await save(next);
                  }}
                  className="rounded w-4 h-4"
                />
                {eq}
              </label>
              {isChecked && (
                <Input
                  type="number"
                  min={1}
                  className="h-8 w-16 text-xs text-center"
                  value={item?.count || 1}
                  readOnly={readOnly}
                  disabled={readOnly}
                  onChange={(e) => {
                    const count = parseInt(e.target.value) || 1;
                    setItems((prev) => prev.map((ei) => (ei.name === eq ? { ...ei, count } : ei)));
                  }}
                  onBlur={async (e) => {
                    const count = parseInt(e.target.value) || 1;
                    await save(items.map((ei) => (ei.name === eq ? { ...ei, count } : ei)));
                  }}
                />
              )}
            </div>
          );
        })}
        {items.filter((e) => !(EQUIPMENT_OPTIONS as readonly string[]).includes(e.name)).map((custom) => (
          <div key={custom.name} className="flex items-center gap-2.5 text-sm rounded-md px-2 py-2 border bg-primary/10 border-primary/60 font-medium">
            <label className={`flex items-center gap-2.5 flex-1 ${readOnly ? "cursor-default" : "cursor-pointer"}`}>
              <input
                type="checkbox"
                checked
                disabled={readOnly}
                onChange={async () => { await save(items.filter((e) => e.name !== custom.name)); }}
                className="rounded w-4 h-4"
              />
              {custom.name}
            </label>
            <Input
              type="number"
              min={1}
              className="h-8 w-16 text-xs text-center"
              value={custom.count || 1}
              readOnly={readOnly}
              disabled={readOnly}
              onChange={(e) => {
                const count = parseInt(e.target.value) || 1;
                setItems((prev) => prev.map((ei) => (ei.name === custom.name ? { ...ei, count } : ei)));
              }}
              onBlur={async () => { await save(items); }}
            />
          </div>
        ))}
        {!readOnly && (
        <div className="pt-1.5">
          <Input
            className="h-9 text-xs border-dashed"
            placeholder="Add custom equipment and press Enter…"
            onKeyDown={async (e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                const val = (e.target as HTMLInputElement).value.trim();
                if (val && !items.some((ei) => ei.name === val)) {
                  await save([...items, { name: val, count: 1 }]);
                  (e.target as HTMLInputElement).value = "";
                }
              }
            }}
          />
        </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function CommercialDashboardView({
  property, services, links, onEditService,
  onDeleteService, onCopyLink, onOpenPortal,
  onRefresh, onUpdatePropertyImage, uploadingPropertyImage, readOnly,
  onUpdatePropertyMapData,
}: Props) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [tab, setTab] = useState<string>("map");
  const [requests, setRequests] = useState<any[]>([]);
  const [prepSheets, setPrepSheets] = useState<any[]>([]);
  const [docs, setDocs] = useState<any[]>([]);
  const [expandedPrep, setExpandedPrep] = useState<string | null>(null);
  const [expandedConditions, setExpandedConditions] = useState<Record<string, boolean>>({});
  const [responseDraft, setResponseDraft] = useState<Record<string, string>>({});
  // IDs of sightings the user just closed from an upcoming-visit card in
  // this session. We keep them visible on the current card as "Resolved"
  // instead of yanking them the second the status flips.
  const [stickyClosedSightings, setStickyClosedSightings] = useState<Set<string>>(new Set());
  const [propertyNotes, setPropertyNotes] = useState<string>(property.notes || "");
  const [savingProp, setSavingProp] = useState(false);
  const [officeNotes, setOfficeNotes] = useState<string>(
    (property.customer_preferences as any)?.office_notes || ""
  );
  const [newReq, setNewReq] = useState({ pest: "", location: "", description: "" });
  const [newReqPhotos, setNewReqPhotos] = useState<string[]>([]);
  const [uploadingReqPhoto, setUploadingReqPhoto] = useState(false);
  // Per-upcoming-service photo uploading state
  const [uploadingPhotoFor, setUploadingPhotoFor] = useState<string | null>(null);
  // Per-service local edit state (so inputs don't lose focus on rerenders)
  const [edits, setEdits] = useState<Record<string, Partial<ServiceData>>>({});
  const getField = <K extends keyof ServiceData>(s: ServiceData, k: K): any =>
    edits[s.id]?.[k] !== undefined ? edits[s.id]![k] : (s[k] as any) ?? "";
  const setField = (id: string, k: keyof ServiceData, v: any) =>
    setEdits(e => ({ ...e, [id]: { ...(e[id] || {}), [k]: v } }));

  const saveServiceField = async (id: string, patch: Record<string, any>) => {
    const { error } = await supabase.from("portal_services").update(patch).eq("id", id);
    if (error) {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
      return;
    }
    onRefresh?.();
  };

  const flushEdits = async (id: string) => {
    const patch = edits[id];
    if (!patch || Object.keys(patch).length === 0) return;
    // Normalize empty strings to null for nullable columns
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(patch)) {
      out[k] = v === "" ? null : v;
    }
    await saveServiceField(id, out);
    setEdits(e => { const n = { ...e }; delete n[id]; return n; });
    // Quiet confirmation so the RM knows the blur-autosave landed.
    toast({ title: "Saved", duration: 1200 });
  };

  // Conditions persister: save, then refresh immediately so the new/edited
  // condition renders right away instead of waiting on the realtime debounce.
  const saveConditionsPatch = async (serviceId: string, patch: any) => {
    await persistServiceReportData(serviceId, patch);
    onRefresh?.();
  };

  const today = todayISO();
  // Past vs Upcoming is driven by STATUS only. We deliberately do NOT
  // re-classify a scheduled visit as "past" just because its service_date
  // is on or before today — that made the editor look like it was
  // auto-submitting a report the moment the route manager typed a date.
  const past = services
    .filter(s => s.status === "completed")
    .sort((a, b) => (b.service_date || "").localeCompare(a.service_date || ""));
  const upcoming = services
    .filter(s => s.status === "scheduled")
    .sort((a, b) => (a.service_date || "").localeCompare(b.service_date || ""));
  const mapUrl = property.map_image_url || property.image_url || null;
  const followUpCount = past.filter(s => !!s.follow_up_recommended).length;
  // Active (non-Closed) conditions across every service — Conditions tab badge.
  const activeConditionsCount = services.reduce((n, s) => {
    const rows: any[] = Array.isArray((s as any).report_data?.conditions)
      ? (s as any).report_data.conditions : [];
    return n + rows.filter((r: any) => r && r.status !== "Closed").length;
  }, 0);
  const propertyFrequency: string =
    (property.customer_preferences as any)?.service_frequency || "monthly";

  // Days-per-cadence lookup used when auto-creating the next commercial visit
  // after a service is marked serviced.
  const FREQUENCY_DAYS_MAP: Record<string, number> = {
    "weekly": 7,
    "bi-weekly": 14,
    "monthly": 30,
    "8-weekly": 56,
    "bi-monthly": 60,
    "12-weekly": 84,
    "quarterly": 90,
  };
  const propertyFrequencyDays = FREQUENCY_DAYS_MAP[propertyFrequency] ?? 30;
  const addDaysISO = (iso: string, days: number): string => {
    const d = new Date(iso + "T00:00:00");
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  };
  const addMonthsISO = (iso: string, months: number): string => {
    const [year, month, day] = iso.split("-").map(Number);
    const d = new Date(year, month - 1 + months, 1);
    const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(day, lastDay));
    return d.toISOString().slice(0, 10);
  };
  const addFrequencyISO = (iso: string): string => {
    if (propertyFrequency === "monthly") return addMonthsISO(iso, 1);
    if (propertyFrequency === "bi-monthly") return addMonthsISO(iso, 2);
    if (propertyFrequency === "quarterly") return addMonthsISO(iso, 3);
    return addDaysISO(iso, propertyFrequencyDays);
  };
  const latestScheduledServiceDate = services
    .filter(s => !!s.service_date && (s.status === "scheduled" || s.status === "completed"))
    .sort((a, b) => (b.service_date || "").localeCompare(a.service_date || ""))[0]?.service_date || null;
  const defaultNextServiceDate = (fromDate?: string | null) =>
    addFrequencyISO(fromDate || latestScheduledServiceDate || today);

  // Re-hydrate only when the property changes — not on every notes prop change,
  // which can clobber characters mid-keystroke after a parent refresh.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setPropertyNotes(property.notes || ""); }, [property.id]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    setOfficeNotes((property.customer_preferences as any)?.office_notes || "");
  }, [property.id]);

  // Debounced auto-save for property-level office notes (stored in
  // customer_preferences JSON so no migration is needed).
  useEffect(() => {
    const current = (property.customer_preferences as any)?.office_notes || "";
    if (current === officeNotes) return;
    const t = setTimeout(async () => {
      const next = { ...(property.customer_preferences || {}), office_notes: officeNotes || null };
      const { error } = await supabase.from("portal_properties")
        .update({ customer_preferences: next }).eq("id", property.id);
      if (error) {
        toast({ title: "Save failed", description: error.message, variant: "destructive" });
        return;
      }
      (property as any).customer_preferences = next;
      onRefresh?.();
    }, 800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [officeNotes]);

  // Upcoming visits intentionally leave `service_date` NULL in the database —
  // the card displays TODAY() as the default (see the date <Input> below), and
  // a real date is only persisted when the tech edits it or marks the visit
  // completed. This keeps "Next Visit" fluid instead of locking to a projected
  // future date the office may not honor.

  // Debounced auto-save for property notes (rich text editor doesn't fire onBlur naturally)
  useEffect(() => {
    if ((property.notes || "") === propertyNotes) return;
    const t = setTimeout(() => { savePropertyNotes(); }, 800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyNotes]);

  const savePropertyNotes = async () => {
    if ((property.notes || "") === propertyNotes) return;
    setSavingProp(true);
    const { error } = await supabase.from("portal_properties")
      .update({ notes: propertyNotes || null }).eq("id", property.id);
    setSavingProp(false);
    if (error) {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
      return;
    }
    (property as any).notes = propertyNotes;
    toast({ title: "Notes saved", duration: 1200 });
    onRefresh?.();
  };

  const quickAddVisit = async (status: "scheduled" | "completed") => {
    if (status === "scheduled" && upcoming.length > 0) {
      toast({
        title: "Upcoming visit already scheduled",
        description: "Only one upcoming visit can exist at a time. Complete or delete the current one first.",
        variant: "destructive",
      });
      return;
    }
    const { error } = await supabase.from("portal_services").insert({
      property_id: property.id,
      service_type: "Commercial General Pest",
      status,
      // Scheduled visits leave service_date NULL — the card defaults display to
      // TODAY and only persists a date on edit or on completion.
      service_date: status === "completed" ? today : null,
      frequency_days: status === "scheduled" ? propertyFrequencyDays : null,
    } as any);
    if (error) {
      toast({ title: "Couldn't add visit", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: status === "completed" ? "Past visit added" : "Upcoming visit added" });
    onRefresh?.();
  };

  const submitNewRequest = async () => {
    if (!newReq.description.trim()) return;
    const { error } = await supabase.from("portal_requests").insert({
      property_id: property.id,
      request_type: "Pest Sighting",
      pest_type: newReq.pest || null,
      location_type: newReq.location || null,
      description: newReq.description.trim(),
      photos: newReqPhotos,
    } as any);
    if (error) {
      toast({ title: "Couldn't add sighting", description: error.message, variant: "destructive" });
      return;
    }
    setNewReq({ pest: "", location: "", description: "" });
    setNewReqPhotos([]);
    toast({ title: "Pest sighting added" });
    loadRequests();
  };

  const uploadSightingPhoto = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploadingReqPhoto(true);
    const urls: string[] = [];
    for (const file of Array.from(files)) {
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
      const path = `pest-sightings/${property.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error: upErr } = await supa.storage.from("report-images").upload(path, file, {
        contentType: file.type || "image/jpeg", upsert: false,
      });
      if (upErr) continue;
      const { data: pub } = supa.storage.from("report-images").getPublicUrl(path);
      urls.push(pub.publicUrl);
    }
    setNewReqPhotos((p) => [...p, ...urls]);
    setUploadingReqPhoto(false);
  };

  // Upload photos directly onto an upcoming service (mirrors PM portal pattern)
  const uploadServicePhotos = async (serviceId: string, files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploadingPhotoFor(serviceId);
    const urls: string[] = [];
    for (const file of Array.from(files)) {
      if (!file.type.startsWith("image/")) continue;
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
      const path = `upcoming-service-photos/${property.id}/${serviceId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error: upErr } = await supa.storage.from("report-images").upload(path, file, {
        contentType: file.type || "image/jpeg", upsert: false,
      });
      if (upErr) { toast({ title: "Upload failed", description: upErr.message, variant: "destructive" }); continue; }
      const { data: pub } = supa.storage.from("report-images").getPublicUrl(path);
      if (pub?.publicUrl) urls.push(pub.publicUrl);
    }
    if (urls.length) {
      const current = services.find(s => s.id === serviceId);
      const existing: any[] = Array.isArray(current?.photos) ? (current!.photos as any[]) : [];
      await saveServiceField(serviceId, { photos: [...existing, ...urls] });
      toast({ title: `Added ${urls.length} photo${urls.length === 1 ? "" : "s"}` });
    }
    setUploadingPhotoFor(null);
  };

  const removeServicePhoto = async (serviceId: string, url: string) => {
    const current = services.find(s => s.id === serviceId);
    const existing: any[] = Array.isArray(current?.photos) ? (current!.photos as any[]) : [];
    const next = existing.filter((p: any) => (typeof p === "string" ? p : p?.url) !== url);
    await saveServiceField(serviceId, { photos: next });
  };

  // Helpers for the inline editable report data (target pests / non-chem
  // equipment / conditions) stored on portal_services.report_data.
  const getReportData = (s: ServiceData): any => (s as any).report_data || {};
  const saveReportData = async (s: ServiceData, patch: Record<string, any>) => {
    // Fetch the LATEST report_data before merging — sibling editors (the
    // conditions card saves via persistServiceReportData without refreshing
    // our `services` prop) may have written since this prop loaded; merging
    // over the stale copy would silently delete their work.
    const { data } = await supabase
      .from("portal_services")
      .select("report_data")
      .eq("id", s.id)
      .maybeSingle();
    const fresh = (data?.report_data as any) || getReportData(s);
    await saveServiceField(s.id, { report_data: { ...fresh, ...patch } });
  };

  // Recent pest sightings (Open + In Progress) — surfaced inline on every
  // visit card so the Route Manager sees what's still outstanding without
  // bouncing to the Sightings tab.
  const recentSightings = requests
    .filter((r: any) => {
      const sStatus = (r.sighting_status || r.status || "").toLowerCase();
      return sStatus !== "closed" && sStatus !== "completed" && sStatus !== "cancelled";
    })
    .slice(0, 6);

  // Only show portal links that are actually targeted at this property.
  const propertyLinks = links.filter(l => {
    const ids: any = l.assigned_property_ids;
    if (!Array.isArray(ids)) return false;
    return ids.includes(property.id);
  });

  const loadRequests = async () => {
    const { data } = await supabase
      .from("portal_requests")
      .select("*")
      .eq("property_id", property.id)
      .order("created_at", { ascending: false });
    setRequests(Array.isArray(data) ? data : []);
  };

  useEffect(() => {
    loadRequests();
    supabase.from("portal_prep_sheets").select("*").order("title").then(({ data }) => {
      if (Array.isArray(data)) setPrepSheets(data);
    });
    supabase.from("portal_documents").select("*").eq("property_id", property.id).order("created_at", { ascending: false }).then(({ data }) => {
      if (Array.isArray(data)) setDocs(data);
    });
    const channel = supabase
      .channel(`commercial-admin-${property.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "portal_requests", filter: `property_id=eq.${property.id}` }, () => loadRequests())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [property.id]);

  const openRequests = requests.filter(r => r.status === "pending" || r.status === "in_progress");
  const closedRequests = requests.filter(r => r.status === "completed" || r.status === "cancelled");

  const setFrequency = async (key: string) => {
    const next = { ...(property.customer_preferences || {}), service_frequency: key };
    const { error } = await supabase
      .from("portal_properties")
      .update({ customer_preferences: next })
      .eq("id", property.id);
    if (error) {
      toast({ title: "Failed to save frequency", description: error.message, variant: "destructive" });
      return;
    }
    (property as any).customer_preferences = next;
    toast({ title: `Frequency set to ${key}`, duration: 1500 });
  };

  const sendResponse = async (id: string) => {
    const note = (responseDraft[id] || "").trim();
    if (!note) return;
    // Crest reply auto-closes the sighting + stamps closed_at and appends
    // to the new crest_comments column (kept alongside legacy response_notes
    // for backward compatibility with older portal builds).
    const now = new Date().toISOString();
    const existing = requests.find(r => r.id === id) as any;
    const priorComments = Array.isArray(existing?.crest_comments) ? existing.crest_comments : [];
    const nextComments = [...priorComments, { ts: now, note }];
    const { error } = await supabase
      .from("portal_requests")
      .update({
        response_notes: note,
        status: "completed",
        sighting_status: "closed",
        crest_comments: nextComments,
        closed_at: now,
        updated_at: now,
      } as any)
      .eq("id", id);
    if (error) {
      toast({ title: "Couldn't save response", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Response sent · sighting closed" });
    setResponseDraft(d => ({ ...d, [id]: "" }));
    loadRequests();
  };

  const setSightingStatus = async (id: string, next: "open" | "in_progress" | "closed", serviceId?: string) => {
    const now = new Date().toISOString();
    const patch: any = {
      sighting_status: next,
      updated_at: now,
      status: next === "closed" ? "completed" : (next === "in_progress" ? "in_progress" : "pending"),
    };
    if (next === "closed") {
      patch.closed_at = now;
      // Pin the resolved sighting to the specific visit it was closed on so
      // it stays on THAT report and drops off future ones.
      if (serviceId) patch.resolved_service_id = serviceId;
    } else {
      // Re-opening clears the resolution link.
      patch.resolved_service_id = null;
    }
    const { error } = await supabase.from("portal_requests").update(patch).eq("id", id);
    if (error) {
      toast({ title: "Couldn't update status", description: error.message, variant: "destructive" });
      return;
    }
    if (next === "closed") {
      // Only use the sticky set when we couldn't pin the sighting to a
      // specific service (Sightings tab has no service context). If we did
      // pin it, resolved_service_id handles carry-forward permanently.
      if (!serviceId) {
        setStickyClosedSightings(prev => { const n = new Set(prev); n.add(id); return n; });
      }
    }
    loadRequests();
  };

  const markRequestComplete = async (id: string) => {
    // Set BOTH status and sighting_status — the customer portal classifies by
    // sighting_status first, so leaving it 'in_progress' would keep the
    // request under Open Requests there forever.
    const { error } = await supabase
      .from("portal_requests")
      .update({
        status: "completed",
        sighting_status: "closed",
        closed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as any)
      .eq("id", id);
    if (error) {
      toast({ title: "Couldn't update", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Request marked complete" });
    loadRequests();
  };

  const deleteRequest = async (id: string) => {
    if (!window.confirm("Delete this request? This cannot be undone.")) return;
    const { error } = await supabase.from("portal_requests").delete().eq("id", id);
    if (error) {
      toast({ title: "Delete failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Request deleted" });
    loadRequests();
  };

  return (
    <div className="space-y-4">
      {/* Top tag — mirrors HOA / apartment portal badge */}
      <div className="rounded-lg border-2 px-3.5 py-2 flex items-center gap-2 text-xs font-semibold bg-amber-50 border-amber-300 text-amber-900">
        <span className="px-1.5 py-0.5 rounded bg-white/70 border border-current/30 text-[10px] uppercase tracking-wider">
          Commercial Portal
        </span>
        <span className="text-amber-800/80">Single-location account · no units / sub-locations</span>
      </div>

      {/* Property-level Office-Only Notes — applies to the account, not a single visit */}
      {!readOnly && (
      <Card className="border-dashed">
        <CardContent className="p-3 space-y-1.5">
          <div className="flex items-center gap-2">
            <p className="text-sm font-black uppercase tracking-wider text-foreground border-l-4 border-primary pl-2">Office-Only Notes</p>
            <Badge variant="outline" className="text-[9px] h-4 px-1">Hidden from customer</Badge>
          </div>
          <Textarea
            value={officeNotes}
            onChange={e => setOfficeNotes(e.target.value)}
            placeholder="Internal notes about this account — never shown to the client…"
            rows={2}
            className="text-sm"
          />
        </CardContent>
      </Card>
      )}

      {/* Location summary */}
      <Card>
        <CardContent className="p-4 grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
          <div className="flex items-start gap-2">
            <MapPin className="w-4 h-4 text-primary mt-0.5 shrink-0" />
            <div>
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">Location</p>
              <p className="font-medium">{property.address || "—"}</p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <Calendar className="w-4 h-4 text-primary mt-0.5 shrink-0" />
            <div>
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">Last Visit</p>
              <p className="font-medium">{past[0] ? fmtDate(past[0].service_date) : "—"}</p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <ClipboardList className="w-4 h-4 text-primary mt-0.5 shrink-0" />
            <div>
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">Next Visit</p>
              <p className="font-medium">{upcoming[0] ? fmtDate(upcoming[0].service_date || today) : "—"}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Portal links for this property */}
      {!readOnly && propertyLinks.length > 0 && (
        <Card>
          <CardContent className="p-4 space-y-2">
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Portal Links</p>
            <div className="space-y-1.5">
              {propertyLinks.map(l => (
                <div key={l.id} className="flex items-center gap-2 flex-wrap">
                  <Badge variant="secondary" className="text-[10px]">{l.label || l.link_type}</Badge>
                  <Button size="sm" variant="outline" onClick={() => onCopyLink?.(l.token)} className="h-7 text-xs gap-1">
                    <Copy className="w-3 h-3" /> Copy
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => onOpenPortal?.(l.token)} className="h-7 text-xs gap-1">
                    <ExternalLink className="w-3 h-3" /> Open
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ─── Tabs (mirrors HOA admin layout, scaled for one location) ─── */}
      <Tabs value={tab} onValueChange={setTab} className="w-full">
        <TabsList className="sticky top-0 z-30 w-full h-auto p-1.5 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-1.5 bg-background/95 backdrop-blur border-2 border-primary/60 rounded-xl shadow-md mb-5">
          <TabsTrigger value="map" className="bg-muted/70 hover:bg-muted border border-border/70 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:border-primary data-[state=active]:shadow-md font-semibold text-xs lg:text-sm whitespace-normal text-center leading-tight px-2 py-3 rounded-lg transition-all flex flex-col items-center justify-center gap-1">
            <MapPin className="w-5 h-5" />
            <span>Site Map, Plan &amp; Team</span>
          </TabsTrigger>
          <TabsTrigger value="past" className="bg-muted/70 hover:bg-muted border border-border/70 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:border-primary data-[state=active]:shadow-md font-semibold text-xs lg:text-sm whitespace-normal text-center leading-tight px-2 py-3 rounded-lg transition-all flex flex-col items-center justify-center gap-1">
            <Calendar className="w-5 h-5" />
            <span>
              Previous Services
              <Badge variant="secondary" className="ml-1 text-xs h-4">{past.length}</Badge>
              {followUpCount > 0 && (
                <Badge className="ml-1 text-xs h-4 bg-orange-500 hover:bg-orange-500 text-white">{followUpCount} follow-up</Badge>
              )}
            </span>
          </TabsTrigger>
          <TabsTrigger value="requests" className="bg-muted/70 hover:bg-muted border border-border/70 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:border-primary data-[state=active]:shadow-md font-semibold text-xs lg:text-sm whitespace-normal text-center leading-tight px-2 py-3 rounded-lg transition-all flex flex-col items-center justify-center gap-1">
            <Wrench className="w-5 h-5" />
            <span>Pest Sightings <Badge variant="secondary" className="ml-1 text-xs h-4">{openRequests.length}</Badge></span>
          </TabsTrigger>
          <TabsTrigger value="upcoming" className="bg-muted/70 hover:bg-muted border border-border/70 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:border-primary data-[state=active]:shadow-md font-semibold text-xs lg:text-sm whitespace-normal text-center leading-tight px-2 py-3 rounded-lg transition-all flex flex-col items-center justify-center gap-1">
            <ClipboardList className="w-5 h-5" />
            <span>Upcoming Services <Badge variant="secondary" className="ml-1 text-xs h-4">{upcoming.length}</Badge></span>
          </TabsTrigger>
          <TabsTrigger value="conditions" className="bg-muted/70 hover:bg-muted border border-border/70 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:border-primary data-[state=active]:shadow-md font-semibold text-xs lg:text-sm whitespace-normal text-center leading-tight px-2 py-3 rounded-lg transition-all flex flex-col items-center justify-center gap-1">
            <AlertTriangle className="w-5 h-5" />
            <span>
              Conditions
              {activeConditionsCount > 0 && (
                <Badge variant="secondary" className="ml-1 text-xs h-4">{activeConditionsCount}</Badge>
              )}
            </span>
          </TabsTrigger>
          <TabsTrigger value="materials" className="bg-muted/70 hover:bg-muted border border-border/70 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:border-primary data-[state=active]:shadow-md font-semibold text-xs lg:text-sm whitespace-normal text-center leading-tight px-2 py-3 rounded-lg transition-all flex flex-col items-center justify-center gap-1">
            <FlaskConical className="w-5 h-5" />
            <span>Safety Data Sheets</span>
          </TabsTrigger>
          <TabsTrigger value="help" className="bg-muted/70 hover:bg-muted border border-border/70 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:border-primary data-[state=active]:shadow-md font-semibold text-xs lg:text-sm whitespace-normal text-center leading-tight px-2 py-3 rounded-lg transition-all flex flex-col items-center justify-center gap-1">
            <FileText className="w-5 h-5" />
            <span>Help</span>
          </TabsTrigger>
        </TabsList>

        {/* ════════ TAB 1: Site Map + Property Plan ════════ */}
        <TabsContent value="map" className="mt-0 space-y-5">
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
                    {FREQUENCY_OPTIONS.map(opt => {
                      const active = propertyFrequency === opt.key;
                      return (
                        <button
                          key={opt.key}
                          type="button"
                          disabled={readOnly}
                          className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
                            active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                          } ${readOnly ? "cursor-default opacity-80" : ""}`}
                          onClick={() => !readOnly && !active && setFrequency(opt.key)}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1.5">
                    How often this location is serviced.
                  </p>
                </div>
                <div>
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1 block">
                    Property Notes
                  </Label>
                  <PlanRichEditor
                    value={propertyNotes}
                    onChange={(html) => setPropertyNotes(html)}
                    placeholder="Account notes, gate codes, manager contact, access instructions, hot spots…"
                    minHeight={120}
                    readOnly={readOnly}
                  />
                  {!readOnly && (
                    <p className="text-[11px] text-muted-foreground mt-1">
                      {savingProp ? "Saving…" : "Saves automatically when you tap away."}
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardHeader className="pb-3 pt-4 border-b">
                <CardTitle className="text-base font-bold flex items-center gap-2">
                  <ImageIcon className="w-5 h-5 text-primary" />
                  Site Map
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3">
                {(property.map_data || mapUrl) ? (
                  <div className="w-full bg-background rounded-md overflow-hidden border border-border" style={{ height: "55vh", minHeight: 360 }}>
                    {mapUrl && !readOnly && onUpdatePropertyMapData ? (
                      <MapCanvas
                        key={`site-map-${property.id}-${mapUrl}`}
                        mapUrl={mapUrl}
                        initialData={property.map_data ? (typeof property.map_data === "string" ? property.map_data : JSON.stringify(property.map_data)) : null}
                        onSave={(data) => onUpdatePropertyMapData(property.id, data)}
                      />
                    ) : property.map_data ? (
                      <ReadOnlyMapCanvas mapUrl={mapUrl || ""} mapData={property.map_data} />
                    ) : mapUrl ? (
                      <img src={mapUrl} alt="Site map" className="w-full h-full object-contain" />
                    ) : null}
                  </div>
                ) : (
                  <div className="text-center py-12 text-sm text-muted-foreground flex flex-col items-center gap-2">
                    <ImageIcon className="w-6 h-6 opacity-40" />
                    No site map uploaded yet.
                  </div>
                )}
                {onUpdatePropertyImage && !readOnly && (
                  <div className="mt-3">
                    <label className="block">
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={async (e) => {
                          const f = e.target.files?.[0];
                          if (!f) return;
                          await onUpdatePropertyImage(property.id, f);
                          e.currentTarget.value = "";
                        }}
                      />
                      <span className="inline-flex items-center justify-center gap-1.5 h-11 w-full rounded-md border border-input bg-background px-4 text-sm font-medium hover:bg-accent cursor-pointer">
                        <Upload className="w-4 h-4" />
                        {uploadingPropertyImage ? "Uploading…" : (mapUrl ? "Replace Site Map" : "Upload Site Map")}
                      </span>
                    </label>
                    <p className="text-[11px] text-muted-foreground mt-1 text-center">
                      Upload a floor plan or property photo. JPG / PNG.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
          <div className="space-y-6">
            <BusinessLicenseSection docs={docs as any} />
            <PropertyEquipmentCard
              propertyId={property.id}
              initial={property.equipment}
              onSaved={onRefresh}
              readOnly={readOnly}
            />
          </div>
        </TabsContent>

        {/* ════════ TAB 2: Previous Services ════════ */}
        <TabsContent value="past" className="mt-0">
          <div className="max-w-4xl mx-auto">
          <Card className="rounded-xl border-2 border-border shadow-md overflow-hidden">
          <div className="flex items-center justify-between gap-2 px-4 py-3 bg-muted/40 border-b-2 border-border">
            <p className="text-sm font-bold uppercase tracking-wide flex items-center gap-1.5">
              <Calendar className="w-4 h-4 text-primary" /> Previous Services
              {past.length > 0 && (
                <Badge variant="secondary" className="ml-1 text-[10px]">{past.length}</Badge>
              )}
            </p>
            {!readOnly && (
              <Button size="sm" variant="outline" onClick={() => quickAddVisit("completed")} className="h-9 text-xs gap-1">
                <Plus className="w-3.5 h-3.5" /> Log Past Visit
              </Button>
            )}
          </div>
          <CardContent className="p-3">
          {past.length === 0 ? (
            <Card><CardContent className="p-6 text-sm text-muted-foreground text-center">
              No past visits yet.
            </CardContent></Card>
          ) : (
            <div className="space-y-2">
              {past.map(s => {
                const isOpen = openId === s.id;
                const products = normalizeUsageList(s.products_used);
                const hasFollowUp = !!s.follow_up_recommended;
                const photos: any[] = Array.isArray(s.photos) ? s.photos : [];
                return (
                  <Card key={s.id} id={`visit-pdf-${s.id}`} className={hasFollowUp ? "border-2 border-orange-400" : ""}>
                  <CardContent className="p-0">
                    {hasFollowUp && (
                      <div className="bg-orange-500 text-white px-3 py-1.5 rounded-t-lg flex items-center gap-2">
                        <span className="text-sm leading-none">⚠️</span>
                        <p className="font-bold text-[11px] uppercase tracking-wide">Follow-up Needed</p>
                      </div>
                    )}
                    <div className="flex items-center gap-2 px-3 py-2.5">
                      <button
                        type="button"
                        onClick={() => setOpenId(isOpen ? null : s.id)}
                        className="flex-1 min-w-0 text-left flex items-center gap-2"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="font-bold text-sm truncate">{s.service_type}</p>
                          <p className="text-sm font-semibold text-foreground">
                            {fmtDate(s.service_date)}
                            {s.service_time && <span className="text-muted-foreground font-normal"> • {fmtTime(s.service_time)}</span>}
                            {s.technician && <span className="text-muted-foreground font-normal"> • {s.technician}</span>}
                          </p>
                        </div>
                        <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`} />
                      </button>
                       <div className="flex gap-1 shrink-0" data-visit-pdf-hide>
                         <VisitPdfButton
                           cardId={`visit-pdf-${s.id}`}
                           filename={`service-${(s.service_date || "visit").toString().slice(0,10)}`}
                           title={`Service Visit — ${fmtDate(s.service_date)}${s.service_type ? " · " + s.service_type : ""}`}
                           onBeforeCapture={() => setOpenId(s.id)}
                         />
                         {!readOnly && (
                           <Button size="icon" variant="outline" onClick={() => onDeleteService?.(s.id)} className="h-8 w-8 text-destructive">
                             <Trash2 className="w-3.5 h-3.5" />
                           </Button>
                         )}
                       </div>
                    </div>
                    {isOpen && (
                      <div className="px-3 pb-3 pt-2 border-t border-border/60 space-y-3">
                        {/* Sightings resolved during THIS specific past visit. */}
                        {(() => {
                          const svcDate = (s.service_date || "").toString().slice(0, 10);
                          const resolvedHere = requests.filter((r: any) => {
                            const st = (r.sighting_status || r.status || "").toLowerCase();
                            const isClosed = st === "closed" || st === "completed" || st === "cancelled";
                            if (!isClosed) return false;
                            if (r.resolved_service_id) return r.resolved_service_id === s.id;
                            const closedAt = (r.closed_at || r.updated_at || "").toString().slice(0, 10);
                            return svcDate && closedAt === svcDate;
                          });
                          if (resolvedHere.length === 0) return null;
                          return (
                            <div className="rounded-md border-2 border-green-300 bg-green-50/60 p-2 space-y-1.5">
                              <p className="text-[11px] font-bold uppercase tracking-wide text-green-900 flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3" /> Pest Sightings Resolved This Visit
                                <Badge variant="outline" className="ml-auto text-[10px] border-green-300 text-green-900 bg-green-50">
                                  {resolvedHere.length}
                                </Badge>
                              </p>
                              <div className="space-y-1">
                                {resolvedHere.map((sg: any) => (
                                  <div key={sg.id} className="text-xs text-green-950 leading-snug">
                                    <span className="font-semibold">{sg.pest_type || sg.request_type}</span>
                                    {sg.location_type ? ` · ${sg.location_type}` : ""}
                                    {sg.description ? ` — ${sg.description}` : ""}
                                    {sg.response_notes && (
                                      <div className="text-[11px] text-green-900 mt-0.5"><span className="font-semibold">Crest response:</span> {sg.response_notes}</div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        })()}

                        {/* Conditions logged during THIS past visit — pinned at
                            the top so the visit's most important record is
                            immediately visible. */}
                        {(() => {
                          const ownedRows: any[] = Array.isArray(getReportData(s).conditions) ? getReportData(s).conditions : [];
                          // Conditions resolved on THIS visit — may live on any
                          // service (they were logged earlier, closed here).
                          const resolvedHere: any[] = services.flatMap((os: any) => {
                            const rs = Array.isArray(os.report_data?.conditions) ? os.report_data.conditions : [];
                            return rs
                              .filter((c: any) => c && c.status === "Closed" && c.closed_on_service_id === s.id)
                              .map((c: any) => ({ ...c, __originDate: os.service_date }));
                          });
                          // Added on this visit but not resolved here.
                          const addedRows = ownedRows.filter((c: any) => !(c && c.status === "Closed" && c.closed_on_service_id === s.id));
                          return (
                          <>
                          {addedRows.length > 0 && (
                            <div className="rounded-md border-2 border-red-400 bg-red-50/70 p-2 space-y-1.5">
                              <p className="text-[11px] font-bold uppercase tracking-wide text-red-900 flex items-center gap-1">
                                <ClipboardList className="w-3 h-3" /> Conditions Added This Visit
                                <Badge variant="outline" className="ml-auto text-[10px] border-red-400 text-red-900 bg-white/70">
                                  {addedRows.length}
                                </Badge>
                              </p>
                              <div className="space-y-1">
                                {addedRows.map((c: any, i: number) => (
                                  <div key={c.id || i} className="text-xs text-red-950 leading-snug flex items-start gap-2">
                                    <div className="flex-1 min-w-0">
                                      <span className="font-semibold">{c.condition || c.name || c.area || "Condition"}</span>
                                      {c.area && c.condition && <span className="text-red-800"> · {c.area}</span>}
                                      {c.detail && <span> — {c.detail}</span>}
                                      {c.status && (
                                        <Badge variant="outline" className="ml-1 text-[9px] border-red-300 text-red-900 bg-white/60">{c.status}</Badge>
                                      )}
                                    </div>
                                    {Array.isArray(c.photos) && c.photos.length > 0 && (
                                      <div className="flex gap-1 shrink-0">
                                        {c.photos.slice(0, 3).map((u: string, pi: number) => (
                                          <a key={pi} href={u} target="_blank" rel="noreferrer">
                                            <img src={u} alt="" className="w-32 h-32 object-cover rounded border border-red-300" />
                                          </a>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          {resolvedHere.length > 0 && (
                            <div className="rounded-md border-2 border-green-300 bg-green-50/60 p-2 space-y-1.5">
                              <p className="text-[11px] font-bold uppercase tracking-wide text-green-900 flex items-center gap-1">
                                <ClipboardList className="w-3 h-3" /> Conditions Resolved This Visit
                                <Badge variant="outline" className="ml-auto text-[10px] border-green-300 text-green-900 bg-green-50">
                                  {resolvedHere.length}
                                </Badge>
                              </p>
                              <div className="space-y-1">
                                {resolvedHere.map((c: any, i: number) => (
                                  <div key={c.id || i} className="text-xs text-green-950 leading-snug flex items-start gap-2">
                                    <div className="flex-1 min-w-0">
                                      <span className="font-semibold">{c.condition || c.name || c.area || "Condition"}</span>
                                      {c.area && c.condition && <span className="text-green-800"> · {c.area}</span>}
                                      {c.detail && <span> — {c.detail}</span>}
                                      <Badge variant="outline" className="ml-1 text-[9px] border-green-300 text-green-900 bg-white/70">Closed</Badge>
                                        {c.__originDate && (
                                          <div className="text-[10px] text-green-800 italic mt-0.5">Originally added {fmtDate(c.__originDate)}</div>
                                        )}
                                      {c.response_notes && (
                                        <div className="text-[11px] text-green-900 mt-0.5"><span className="font-semibold">Crest response:</span> {c.response_notes}</div>
                                      )}
                                      {c.resolution_note && (
                                        <div className="text-[11px] text-emerald-900 italic mt-0.5">"{c.resolution_note}"</div>
                                      )}
                                    </div>
                                    {(() => {
                                      const pics: string[] = [
                                        ...(Array.isArray(c.resolution_photos) ? c.resolution_photos : []),
                                        ...(Array.isArray(c.photos) ? c.photos : []),
                                      ];
                                      if (pics.length === 0) return null;
                                      return (
                                        <div className="flex gap-1 shrink-0">
                                          {pics.slice(0, 3).map((u: string, pi: number) => (
                                            <a key={pi} href={u} target="_blank" rel="noreferrer">
                                              <img src={u} alt="" className="w-32 h-32 object-cover rounded border border-green-400" />
                                            </a>
                                          ))}
                                        </div>
                                      );
                                    })()}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          </>
                          );
                        })()}

                        {/* Inline editable core fields — phone friendly */}
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <Label className="text-sm font-black uppercase tracking-wider text-foreground border-l-4 border-primary pl-2 mb-0.5 block">Date</Label>
                            <Input
                              type="date"
                              value={getField(s, "service_date") || ""}
                              readOnly={readOnly}
                              disabled={readOnly}
                              onChange={e => setField(s.id, "service_date", e.target.value)}
                              onBlur={() => flushEdits(s.id)}
                              className="h-11 text-sm"
                            />
                          </div>
                          <div>
                            <Label className="text-sm font-black uppercase tracking-wider text-foreground border-l-4 border-primary pl-2 mb-0.5 block">Technician</Label>
                            <Input
                              value={getField(s, "technician") || ""}
                              readOnly={readOnly}
                              disabled={readOnly}
                              onChange={e => setField(s.id, "technician", e.target.value)}
                              onBlur={() => flushEdits(s.id)}
                              placeholder="Tech name"
                              className="h-11 text-sm"
                            />
                          </div>
                          <div className="col-span-2">
                            <Label className="text-sm font-black uppercase tracking-wider text-foreground border-l-4 border-primary pl-2 mb-0.5 block">Service Type</Label>
                            <Select
                              value={getField(s, "service_type") || ""}
                              disabled={readOnly}
                              onValueChange={v => { setField(s.id, "service_type", v); saveServiceField(s.id, { service_type: v }); }}
                            >
                              <SelectTrigger className="h-11 text-sm"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {COMMERCIAL_SERVICE_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                                {!COMMERCIAL_SERVICE_TYPES.includes(getField(s, "service_type")) && getField(s, "service_type") && (
                                  <SelectItem value={getField(s, "service_type")}>{getField(s, "service_type")}</SelectItem>
                                )}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                         <div>
                           <Label className="text-sm font-black uppercase tracking-wider text-foreground border-l-4 border-primary pl-2 mb-0.5 block">Summary</Label>
                           {!readOnly && (
                             <div className="mb-1.5">
                               <select
                                 className="h-7 text-[11px] px-2 rounded border border-primary/40 bg-background cursor-pointer"
                                 value=""
                                 onChange={(e) => {
                                   const preset = PRESET_NOTES.find(p => p.id === e.target.value);
                                   if (!preset) return;
                                   const existing = (getField(s, "summary") || "").trim();
                                   const next = existing ? `${existing}\n\n${preset.text}` : preset.text;
                                   setField(s.id, "summary", next);
                                   setTimeout(() => flushEdits(s.id), 0);
                                   e.target.value = "";
                                 }}
                               >
                                 <option value="">+ Insert preset note…</option>
                                 {PRESET_NOTES.map(p => (
                                   <option key={p.id} value={p.id}>{p.label}</option>
                                 ))}
                               </select>
                             </div>
                           )}
                           <Textarea
                            value={getField(s, "summary") || ""}
                            readOnly={readOnly}
                            disabled={readOnly}
                            onChange={e => setField(s.id, "summary", e.target.value)}
                            onBlur={() => flushEdits(s.id)}
                            placeholder="What was performed during this visit…"
                            rows={5}
                            className="text-sm"
                          />
                        </div>
                        {/* Target Pests removed per product spec — the target-pest chip
                            list added noise without meaningfully guiding the reader,
                            so both past & upcoming cards omit it. */}
                        {products.length > 0 && (
                          <div>
                            <p className="text-sm font-black uppercase tracking-wider text-foreground border-l-4 border-primary pl-2 mb-1 flex items-center gap-1">
                              <FlaskConical className="w-3 h-3" /> Products Used
                            </p>
                            <ProductUsageSummary entries={products} />
                          </div>
                        )}
                        {/* Equipment Used — editable inline now that the separate report editor is gone */}
                        <div className="rounded-md border border-primary/30 bg-primary/5 p-2 space-y-1.5">
                          <CommercialNonChemEquipment
                            value={normalizeNonChemEquipment(getReportData(s).non_chem_equipment)}
                            onChange={(next) => saveReportData(s, { non_chem_equipment: next })}
                            dropdown
                            readOnly={readOnly}
                          />
                        </div>
                        {/* Active conditions intentionally omitted here — the
                            dedicated "Conditions" tab is the single source of
                            truth so past-visit cards stay uncluttered. */}
                        {(photos.length > 0 || !readOnly) && (
                          <div className="rounded-md border border-sky-500/30 bg-sky-50/60 dark:bg-sky-500/5 p-2 space-y-1.5">
                            <div className="flex items-center justify-between">
                              <p className="text-[11px] font-bold uppercase tracking-wide text-sky-700 dark:text-sky-400 flex items-center gap-1">
                                <Camera className="w-3 h-3" /> Other Property Images
                                {photos.length > 0 && <Badge variant="secondary" className="ml-1 text-[10px] h-4">{photos.length}</Badge>}
                              </p>
                              {!readOnly && (
                                <label className="inline-flex">
                                  <input
                                    type="file"
                                    accept="image/*"
                                    multiple
                                    className="hidden"
                                    disabled={uploadingPhotoFor === s.id}
                                    onChange={(e) => { uploadServicePhotos(s.id, e.target.files); e.currentTarget.value = ""; }}
                                  />
                                  <span className="inline-flex items-center gap-1 h-8 px-2 rounded-md border border-border bg-background text-xs cursor-pointer hover:bg-muted">
                                    <Upload className="w-3 h-3" />
                                    {uploadingPhotoFor === s.id ? "Uploading…" : "Add Photos"}
                                  </span>
                                </label>
                              )}
                            </div>
                            {photos.length > 0 && (
                              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                {photos.map((p: any, i: number) => {
                                  const url = typeof p === "string" ? p : p?.url;
                                  if (!url) return null;
                                  return (
                                    <div key={i} className="relative w-full aspect-[4/3] rounded-md border border-border overflow-hidden bg-muted/30 group">
                                      <a href={url} target="_blank" rel="noopener noreferrer">
                                        <img src={url} alt={`Photo ${i + 1}`} loading="lazy" className="w-full h-full object-contain" />
                                      </a>
                                      {!readOnly && (
                                        <button
                                          type="button"
                                          onClick={() => removeServicePhoto(s.id, url)}
                                          className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                          aria-label="Remove photo"
                                        >
                                          <X className="w-3 h-3" />
                                        </button>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                           </div>
                         )}
                         {/* Conditions PRESENT at this visit but not added or resolved here — carryovers still open at the time of the visit. */}
                         {(() => {
                           const svcDate = (s.service_date || "").toString().slice(0, 10);
                           if (!svcDate) return null;
                           const svcById: Record<string, any> = Object.fromEntries(services.map((x: any) => [x.id, x]));
                           const rows: any[] = [];
                           services.forEach((os: any) => {
                             if (os.id === s.id) return; // added here handled elsewhere
                             const osDate = (os.service_date || "").toString().slice(0, 10);
                             if (!osDate || osDate > svcDate) return; // logged after this visit
                             const list = Array.isArray(os.report_data?.conditions) ? os.report_data.conditions : [];
                             list.forEach((c: any) => {
                               if (!c) return;
                               if (c.status === "Closed") {
                                 const closedSvc = c.closed_on_service_id ? svcById[c.closed_on_service_id] : null;
                                 const closedDate = closedSvc
                                   ? (closedSvc.service_date || "").toString().slice(0, 10)
                                   : (c.closed_at || "").toString().slice(0, 10);
                                 if (closedDate && closedDate <= svcDate) return; // already closed by this visit
                               }
                              rows.push({ ...c, __originDate: os.service_date });
                             });
                           });
                           if (rows.length === 0) return null;
                           return (
                             <div className="rounded-md border-2 border-red-400 bg-red-50/70 p-2 space-y-1.5">
                               <p className="text-[11px] font-bold uppercase tracking-wide text-red-900 flex items-center gap-1">
                                 <ClipboardList className="w-3 h-3" /> Conditions Present
                                 <Badge variant="outline" className="ml-auto text-[10px] border-red-400 text-red-900 bg-white/70">
                                   {rows.length}
                                 </Badge>
                               </p>
                               <div className="space-y-1">
                                 {rows.map((c: any, i: number) => (
                                   <div key={c.id || i} className="text-xs text-red-950 leading-snug flex items-start gap-2">
                                     <div className="flex-1 min-w-0">
                                       <span className="font-semibold">{c.condition || c.name || c.area || "Condition"}</span>
                                       {c.area && c.condition && <span className="text-red-800"> · {c.area}</span>}
                                       {c.detail && <span> — {c.detail}</span>}
                                       <Badge variant="outline" className="ml-1 text-[9px] border-red-300 text-red-900 bg-white/60">Open</Badge>
                                        {c.__originDate && (
                                          <div className="text-[10px] text-red-800 italic mt-0.5">Originally added {fmtDate(c.__originDate)}</div>
                                        )}
                                     </div>
                                     {Array.isArray(c.photos) && c.photos.length > 0 && (
                                       <div className="flex gap-1 shrink-0">
                                         {c.photos.slice(0, 3).map((u: string, pi: number) => (
                                           <a key={pi} href={u} target="_blank" rel="noreferrer">
                                             <img src={u} alt="" className="w-32 h-32 object-cover rounded border border-red-300" />
                                           </a>
                                         ))}
                                       </div>
                                     )}
                                   </div>
                                 ))}
                               </div>
                             </div>
                           );
                         })()}
                       </div>
                     )}
                   </CardContent>
                 </Card>
               );
             })}
          </div>
        )}
          </CardContent>
          </Card>
          </div>
        </TabsContent>

        {/* ════════ TAB 3: Upcoming Services ════════ */}
        <TabsContent value="upcoming" className="mt-0">
          <div className="max-w-4xl mx-auto">
            {/* One prominent box around the whole Upcoming Services report so
                Route Managers can orient at a glance (cofounder feedback). */}
            <Card className="rounded-xl border-2 border-primary/50 shadow-md overflow-hidden">
            <div className="flex items-center justify-between gap-2 px-4 py-3 bg-primary/5 border-b-2 border-primary/30">
              <p className="text-sm font-bold uppercase tracking-wide flex items-center gap-1.5">
                <ClipboardList className="w-4 h-4 text-primary" /> Upcoming Services
                {upcoming.length > 0 && (
                  <Badge variant="secondary" className="ml-1 text-[10px]">{upcoming.length}</Badge>
                )}
              </p>
              {!readOnly && (
                <Button size="sm" onClick={() => quickAddVisit("scheduled")} className="h-9 text-xs gap-1">
                  <Plus className="w-3.5 h-3.5" /> Add Upcoming Visit
                </Button>
              )}
            </div>
            <CardContent className="p-3 space-y-3">
            {upcoming.length === 0 ? (
              <Card><CardContent className="p-6 text-sm text-muted-foreground text-center">
                No upcoming visits scheduled.
              </CardContent></Card>
            ) : (
              <div className="space-y-2">
                {upcoming.map(s => {
                  const upProducts = _normUsage(getField(s, "products_used"));
                  const upPhotosRaw: any[] = Array.isArray(getField(s, "photos")) ? getField(s, "photos") : [];
                  // Sightings on THIS visit's report:
                  //   • every still-open sighting (carry-forward), PLUS
                  //   • any sighting whose closed_at falls on this service's date,
                  //     so the report where it got resolved keeps a record of it.
                  const svcDate = (getField(s, "service_date") || "").toString().slice(0, 10);
                  // A closed sighting belongs on this upcoming card only if:
                  //   (a) it was explicitly resolved on this service, OR
                  //   (b) the user just clicked Close on it in this session
                  //       (sticky, until save/refresh reassigns it).
                  // Legacy sightings without resolved_service_id fall back to
                  // matching closed_at === service_date so old data still renders
                  // somewhere sensible.
                  const closedOnThisDate = requests.filter((r: any) => {
                    const st = (r.sighting_status || r.status || "").toLowerCase();
                    const isClosed = st === "closed" || st === "completed" || st === "cancelled";
                    if (!isClosed) return false;
                    if (r.resolved_service_id) return r.resolved_service_id === s.id;
                    if (stickyClosedSightings.has(r.id)) return true;
                    const closedAt = (r.closed_at || r.updated_at || "").toString().slice(0, 10);
                    return svcDate && closedAt === svcDate;
                  });
                  const sightingsForService = [
                    ...recentSightings,
                    ...closedOnThisDate.filter((r: any) => !recentSightings.find((o: any) => o.id === r.id)),
                  ];
                  return (
                  <Card key={s.id}>
                    <CardContent className="p-3 space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <div className="col-span-2">
                          <Label className="text-sm font-black uppercase tracking-wider text-foreground border-l-4 border-primary pl-2 mb-0.5 block">Service Type</Label>
                          <Select
                            value={getField(s, "service_type") || ""}
                            disabled={readOnly}
                            onValueChange={v => { setField(s.id, "service_type", v); saveServiceField(s.id, { service_type: v }); }}
                          >
                            <SelectTrigger className="h-11 text-sm"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {COMMERCIAL_SERVICE_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                              {!COMMERCIAL_SERVICE_TYPES.includes(getField(s, "service_type")) && getField(s, "service_type") && (
                                <SelectItem value={getField(s, "service_type")}>{getField(s, "service_type")}</SelectItem>
                              )}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label className="text-sm font-black uppercase tracking-wider text-foreground border-l-4 border-primary pl-2 mb-0.5 block">Date</Label>
                          <Input
                            type="date"
                            value={getField(s, "service_date") || today}
                            readOnly={readOnly}
                            disabled={readOnly}
                            onChange={e => setField(s.id, "service_date", e.target.value)}
                            onBlur={() => flushEdits(s.id)}
                            className="h-11 text-sm"
                          />
                        </div>
                         <div>
                           <Label className="text-sm font-black uppercase tracking-wider text-foreground border-l-4 border-primary pl-2 mb-0.5 block">Time In / Time Out</Label>
                           {(() => {
                             const raw = (getField(s, "service_time") || "").toString();
                             const parts = raw.split(/\s*[-–]\s*/);
                             const timeIn = parts[0] || "";
                             const timeOut = parts[1] || "";
                             const commit = (nextIn: string, nextOut: string) => {
                               const combined = nextIn && nextOut ? `${nextIn} - ${nextOut}` : (nextIn || nextOut || "");
                               setField(s.id, "service_time", combined);
                             };
                             return (
                               <div className="flex items-center gap-1">
                                 <Input
                                   type="time"
                                   value={timeIn}
                                   readOnly={readOnly}
                                   disabled={readOnly}
                                   onChange={e => commit(e.target.value, timeOut)}
                                   onBlur={() => flushEdits(s.id)}
                                   className="h-11 text-sm flex-1"
                                 />
                                 <span className="text-xs text-muted-foreground">→</span>
                                 <Input
                                   type="time"
                                   value={timeOut}
                                   readOnly={readOnly}
                                   disabled={readOnly}
                                   onChange={e => commit(timeIn, e.target.value)}
                                   onBlur={() => flushEdits(s.id)}
                                   className="h-11 text-sm flex-1"
                                 />
                               </div>
                             );
                           })()}
                         </div>
                        <div className="col-span-2">
                          <Label className="text-sm font-black uppercase tracking-wider text-foreground border-l-4 border-primary pl-2 mb-0.5 block">Assigned Technician</Label>
                          <Select
                            value={getField(s, "technician") || ""}
                            disabled={readOnly}
                            onValueChange={v => { setField(s.id, "technician", v); saveServiceField(s.id, { technician: v }); }}
                          >
                            <SelectTrigger className="h-11 text-sm"><SelectValue placeholder="Select technician" /></SelectTrigger>
                            <SelectContent>
                              {TECHNICIAN_NAMES.map(n => <SelectItem key={n} value={n}>{n}</SelectItem>)}
                              {getField(s, "technician") && !TECHNICIAN_NAMES.includes(getField(s, "technician")) && (
                                <SelectItem value={getField(s, "technician")}>{getField(s, "technician")}</SelectItem>
                              )}
                            </SelectContent>
                          </Select>
                        </div>
                         <div className="col-span-2">
                           <Label className="text-sm font-black uppercase tracking-wider text-foreground border-l-4 border-primary pl-2 mb-0.5 block">Summary</Label>
                           {!readOnly && (
                             <div className="mb-1.5">
                               <select
                                 className="h-7 text-[11px] px-2 rounded border border-primary/40 bg-background cursor-pointer"
                                 value=""
                                 onChange={(e) => {
                                   const preset = PRESET_NOTES.find(p => p.id === e.target.value);
                                   if (!preset) return;
                                   const existing = (getField(s, "summary") || "").trim();
                                   const next = existing ? `${existing}\n\n${preset.text}` : preset.text;
                                   setField(s.id, "summary", next);
                                   setTimeout(() => flushEdits(s.id), 0);
                                   e.target.value = "";
                                 }}
                               >
                                 <option value="">+ Insert preset note…</option>
                                 {PRESET_NOTES.map(p => (
                                   <option key={p.id} value={p.id}>{p.label}</option>
                                 ))}
                               </select>
                             </div>
                           )}
                           <Textarea
                            value={getField(s, "summary") || ""}
                            readOnly={readOnly}
                            disabled={readOnly}
                            onChange={e => setField(s.id, "summary", e.target.value)}
                            onBlur={() => flushEdits(s.id)}
                            placeholder="What was performed during this visit…"
                            rows={5}
                            className="text-sm"
                          />
                        </div>
                      </div>

                      {/* Target Pests intentionally removed — see past-visit note above. */}

                      {/* Products + Equipment — side-by-side on the upcoming card */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        <div className="rounded-md border border-primary/30 bg-primary/5 p-2 space-y-1.5">
                          <p className="text-[11px] font-bold uppercase tracking-wide text-foreground/70 flex items-center gap-1">
                            <FlaskConical className="w-3 h-3 text-primary" /> Products Used
                          </p>
                          <ProductUsageEditor
                            value={upProducts}
                            onChange={(next) => { setField(s.id, "products_used", next); saveServiceField(s.id, { products_used: next }); }}
                            compact
                            readOnly={readOnly}
                          />
                        </div>
                        <div className="rounded-md border border-primary/30 bg-primary/5 p-2 space-y-1.5">
                          <CommercialNonChemEquipment
                            value={normalizeNonChemEquipment(getReportData(s).non_chem_equipment)}
                            onChange={(next) => saveReportData(s, { non_chem_equipment: next })}
                            dropdown
                            readOnly={readOnly}
                          />
                        </div>
                      </div>

                      {/* Active Pest Sightings — Crest resolves inline. Each
                          sighting has a big comment box + status dropdown, mirroring
                          the Conditions flow. Closed sightings drop off next report. */}
                      {sightingsForService.length > 0 && (
                        <div>
                           <div className="mb-2 flex items-center gap-2 flex-wrap rounded-md bg-gradient-to-r from-amber-200 to-amber-100 border-l-4 border-amber-500 px-3 py-2 shadow-sm">
                             <AlertTriangle className="w-4 h-4 text-amber-700" />
                             <h4 className="text-sm font-black uppercase tracking-wider text-amber-950">Pest Sightings</h4>
                             <Badge variant="outline" className="text-[10px] border-amber-500 text-amber-950 bg-white/70">
                              {recentSightings.length} to resolve
                            </Badge>
                            {closedOnThisDate.length > 0 && (
                              <Badge variant="outline" className="text-[10px] border-green-400 text-green-900 bg-green-50">
                                {closedOnThisDate.length} resolved this visit
                              </Badge>
                            )}
                          </div>
                          <div className="rounded-md border-2 border-amber-300 bg-amber-50/60 p-2 space-y-2">
                            <p className="text-[11px] italic text-amber-800">
                              Crest resolves these. Add a response and set status to <span className="font-semibold">Closed</span> — it will drop off the next report.
                            </p>
                            {sightingsForService.map((sg: any) => {
                              const currentStatus = (((sg as any).sighting_status as string) || (sg.status === "in_progress" ? "in_progress" : "open"));
                              const isResolved = currentStatus === "closed";
                              const sgPhotos: string[] = Array.isArray(sg.photos)
                                ? sg.photos.map((p: any) => (typeof p === "string" ? p : p?.url)).filter(Boolean)
                                : [];
                              return (
                                <div key={sg.id} className={`rounded-md border p-2 ${isResolved ? "border-green-300 bg-green-50/50" : "border-amber-300 bg-background"}`}>
                                  <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2">
                                    <div className="min-w-0 space-y-1.5">
                                      <div className="flex items-start justify-between gap-2">
                                        <div className="min-w-0">
                                          <p className="text-sm font-semibold text-foreground">
                                            {sg.pest_type || sg.request_type}
                                            {sg.location_type && <span className="text-xs font-normal text-muted-foreground"> · {sg.location_type}</span>}
                                          </p>
                                          {sg.description && (
                                            <p className="text-xs text-muted-foreground leading-snug whitespace-pre-wrap">{sg.description}</p>
                                          )}
                                          {isResolved && sg.response_notes && readOnly && (
                                            <p className="text-xs text-green-900 leading-snug mt-1 whitespace-pre-wrap"><span className="font-semibold">Crest response:</span> {sg.response_notes}</p>
                                          )}
                                        </div>
                                        {isResolved ? (
                                          <Badge variant="outline" className="text-[10px] border-green-300 text-green-900 bg-green-50 shrink-0">
                                            <CheckCircle2 className="w-3 h-3 mr-1" /> Resolved
                                          </Badge>
                                        ) : !readOnly && (
                                          <Select value={currentStatus} onValueChange={(v) => setSightingStatus(sg.id, v as any, s.id)}>
                                            <SelectTrigger className="h-7 w-[120px] text-xs shrink-0"><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                              <SelectItem value="open">Open</SelectItem>
                                              <SelectItem value="in_progress">In Progress</SelectItem>
                                              <SelectItem value="closed">Closed</SelectItem>
                                            </SelectContent>
                                          </Select>
                                        )}
                                      </div>
                                      {!readOnly && (
                                        <Textarea
                                          value={responseDraft[sg.id] ?? sg.response_notes ?? ""}
                                          onChange={(e) => setResponseDraft(d => ({ ...d, [sg.id]: e.target.value }))}
                                          onBlur={() => {
                                            const note = (responseDraft[sg.id] ?? sg.response_notes ?? "").trim();
                                            if (!note) return;
                                            if (note === (sg.response_notes || "").trim()) return;
                                            const prior = Array.isArray((sg as any).crest_comments) ? (sg as any).crest_comments : [];
                                            const last = prior[prior.length - 1];
                                            if (last && last.note === note) return;
                                            supabase.from("portal_requests").update({
                                              response_notes: note,
                                              crest_comments: [...prior, { ts: new Date().toISOString(), note }],
                                              updated_at: new Date().toISOString(),
                                            } as any).eq("id", sg.id).then(() => loadRequests());
                                          }}
                                          placeholder="Crest response…"
                                          rows={2}
                                          className="text-xs"
                                        />
                                      )}
                                    </div>
                                    {sgPhotos.length > 0 && (
                                      <div className="sm:w-28 shrink-0">
                                        <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-1">Photos</p>
                                        <div className="grid grid-cols-2 sm:grid-cols-1 gap-1">
                                          {sgPhotos.slice(0, 3).map((url, i) => (
                                            <a key={i} href={url} target="_blank" rel="noopener noreferrer"
                                              className="block w-full aspect-square rounded border border-border overflow-hidden bg-muted/30">
                                              <img src={url} alt={`Sighting ${i + 1}`} loading="lazy" className="w-full h-full object-cover" />
                                            </a>
                                          ))}
                                          {sgPhotos.length > 3 && (
                                            <p className="text-[10px] text-muted-foreground">+{sgPhotos.length - 3} more</p>
                                          )}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      <ConditionsReportSection
                        services={services as any}
                        currentServiceId={s.id}
                        onSaveServiceReportData={saveConditionsPatch}
                        propertyName={property?.name}
                        readOnly={readOnly}
                      />

                      {/* Photos — moved to the bottom, below Active Conditions */}
                      <div className="rounded-md border border-sky-500/30 bg-sky-50/60 dark:bg-sky-500/5 p-2 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <p className="text-[11px] font-bold uppercase tracking-wide text-sky-700 dark:text-sky-400 flex items-center gap-1">
                            <Camera className="w-3 h-3" /> Other Property Images
                            {upPhotosRaw.length > 0 && <Badge variant="secondary" className="ml-1 text-[10px] h-4">{upPhotosRaw.length}</Badge>}
                          </p>
                          {!readOnly && (
                            <label className="inline-flex">
                              <input
                                type="file"
                                accept="image/*"
                                multiple
                                className="hidden"
                                disabled={uploadingPhotoFor === s.id}
                                onChange={(e) => { uploadServicePhotos(s.id, e.target.files); e.currentTarget.value = ""; }}
                              />
                              <span className="inline-flex items-center gap-1 h-8 px-2 rounded-md border border-border bg-background text-xs cursor-pointer hover:bg-muted">
                                <Upload className="w-3 h-3" />
                                {uploadingPhotoFor === s.id ? "Uploading…" : "Add Photos"}
                              </span>
                            </label>
                          )}
                        </div>
                        {upPhotosRaw.length > 0 && (
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                            {upPhotosRaw.map((p: any, i: number) => {
                              const url = typeof p === "string" ? p : p?.url;
                              if (!url) return null;
                              return (
                                <div key={i} className="relative w-full aspect-[4/3] rounded-md border border-border overflow-hidden bg-muted/30 group">
                                  <a href={url} target="_blank" rel="noopener noreferrer">
                                    <img src={url} alt={`Photo ${i + 1}`} loading="lazy" className="w-full h-full object-contain" />
                                  </a>
                                  {!readOnly && (
                                    <button
                                      type="button"
                                      onClick={() => removeServicePhoto(s.id, url)}
                                      className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                      aria-label="Remove photo"
                                    >
                                      <X className="w-3 h-3" />
                                    </button>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {/* Action row — prominent green "Mark Serviced" sits at the bottom */}
                      {!readOnly && (
                        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border">
                          <Button
                            size="lg"
                            onClick={async () => {
                              // Capture the date BEFORE flushing (flush clears local edit
                              // state and the prop won't have refreshed yet), flush any
                              // un-blurred edits so nothing typed is lost, then complete.
                              const dateVal = getField(s, "service_date") || today;
                              await flushEdits(s.id);
                              await saveServiceField(s.id, { status: "completed", service_date: dateVal });
                              // Auto-schedule the next visit based on the property's
                              // service frequency (e.g. monthly = same day next month).
                              // Only creates one if there isn't already
                              // an upcoming scheduled visit.
                              const hasUpcoming = services.some(
                                (x) => x.id !== s.id && x.status === "scheduled"
                              );
                              if (!hasUpcoming && propertyFrequencyDays > 0) {
                                const nextDate = defaultNextServiceDate(dateVal);
                                await supabase.from("portal_services").insert({
                                  property_id: property.id,
                                  service_type: getField(s, "service_type") || "Commercial General Pest",
                                  status: "scheduled",
                                  service_date: nextDate,
                                  frequency_days: propertyFrequencyDays,
                                } as any);
                                onRefresh?.();
                              }
                              toast({
                                title: "Visit marked serviced ✓",
                                description: hasUpcoming
                                  ? "Moved to Previous Services."
                                  : "Next visit scheduled from this service date.",
                              });
                            }}
                            className="flex-1 h-12 gap-2 text-sm font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-md"
                          >
                            <CheckCircle2 className="w-5 h-5" /> Mark Serviced
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => onDeleteService?.(s.id)} className="h-12 gap-1 text-xs text-destructive">
                            <Trash2 className="w-3.5 h-3.5" /> Delete
                          </Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                  );
                })}
              </div>
            )}
            </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ════════ TAB 4: Requests ════════ */}
        <TabsContent value="requests" className="mt-0">
          <div className="max-w-3xl mx-auto space-y-4">
            <Card className="border-2 border-primary/30 bg-primary/[0.03]">
              <CardContent className="p-3 space-y-2">
                <p className="text-xs font-bold uppercase tracking-wide text-primary">Add Sighting</p>
                <div className="grid grid-cols-2 gap-2">
                  <Select value={newReq.pest || ""} onValueChange={v => setNewReq(r => ({ ...r, pest: v === "__none__" ? "" : v }))}>
                    <SelectTrigger className="h-11 text-sm"><SelectValue placeholder="Pest (select)" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">— Select pest —</SelectItem>
                      {COMMERCIAL_PEST_OPTIONS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Input value={newReq.location} onChange={e => setNewReq(r => ({ ...r, location: e.target.value }))} placeholder="Location (e.g. Kitchen)" className="h-11 text-sm" />
                </div>
                <Textarea value={newReq.description} onChange={e => setNewReq(r => ({ ...r, description: e.target.value }))} placeholder="Describe the issue or request…" rows={2} className="text-sm" />
                <div className="rounded-md border border-dashed border-border p-2 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-black uppercase tracking-wider text-foreground border-l-4 border-primary pl-2 flex items-center gap-1"><Camera className="w-3 h-3" /> Photos</p>
                    <label className="cursor-pointer">
                      <input type="file" accept="image/*" multiple className="hidden" onChange={e => { uploadSightingPhoto(e.target.files); e.currentTarget.value = ""; }} />
                      <span className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-xs hover:bg-muted">
                        <Upload className="w-3 h-3" /> {uploadingReqPhoto ? "Uploading…" : "Add Photo"}
                      </span>
                    </label>
                  </div>
                  {newReqPhotos.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {newReqPhotos.map((url, i) => (
                        <div key={i} className="relative w-24 aspect-[4/3] rounded-md overflow-hidden border border-border bg-muted">
                          <img src={url} alt="" loading="lazy" className="w-full h-full object-contain" />
                          <button type="button" onClick={() => setNewReqPhotos(p => p.filter((_, idx) => idx !== i))} className="absolute top-0.5 right-0.5 bg-background/90 rounded-full p-0.5 border border-border">
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <Button size="sm" onClick={submitNewRequest} disabled={!newReq.description.trim()} className="h-11 text-sm gap-1.5 w-full">
                  <Plus className="w-4 h-4" /> Add Sighting
                </Button>
              </CardContent>
            </Card>
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
                <AlertTriangle className="w-3 h-3" /> Active Pest Sightings
                <Badge variant="secondary" className="ml-1 text-[10px]">{openRequests.length}</Badge>
              </p>
              {openRequests.length === 0 ? (
                <Card><CardContent className="p-5 text-sm text-muted-foreground text-center">
                  No active pest sightings. Submissions from the commercial portal will appear here.
                </CardContent></Card>
              ) : (
                <div className="space-y-2">
                  {openRequests.map(r => (
                    <Card key={r.id} className="border-2 border-amber-300">
                      <CardContent className="p-3 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-bold text-sm truncate">
                              {r.pest_type || r.request_type}
                              {r.location_type ? ` — ${r.location_type}` : ""}
                            </p>
                            <p className="text-xs text-muted-foreground">{fmtDateTime(r.created_at)}</p>
                          </div>
                          {readOnly ? (
                            <Badge variant="outline" className="text-[10px] capitalize shrink-0">
                              {(((r as any).sighting_status as string) || (r.status === "in_progress" ? "in progress" : "open")).replace("_", " ")}
                            </Badge>
                          ) : (
                            <Select
                              value={(((r as any).sighting_status as string) || (r.status === "in_progress" ? "in_progress" : "open"))}
                              onValueChange={(v: any) => setSightingStatus(r.id, v)}
                            >
                              <SelectTrigger className="h-7 text-[10px] w-[120px] shrink-0"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="open">Open</SelectItem>
                                <SelectItem value="in_progress">In Progress</SelectItem>
                                <SelectItem value="closed">Closed</SelectItem>
                              </SelectContent>
                            </Select>
                          )}
                        </div>
                        {r.description && (
                          <p className="text-sm whitespace-pre-wrap leading-relaxed">{r.description}</p>
                        )}
                        {r.response_notes && (
                          <div className="rounded-md border border-border bg-muted/40 p-2">
                            <p className="text-sm font-black uppercase tracking-wider text-foreground border-l-4 border-primary pl-2 mb-0.5">Last Response</p>
                            <p className="text-sm whitespace-pre-wrap">{r.response_notes}</p>
                          </div>
                        )}
                        {!readOnly && (
                        <div className="space-y-2 pt-1">
                          <Textarea
                            placeholder="Reply to this request (saved on the request, visible to client)…"
                            rows={2}
                            value={responseDraft[r.id] || ""}
                            onChange={e => setResponseDraft(d => ({ ...d, [r.id]: e.target.value }))}
                          />
                          <div className="flex flex-wrap gap-1.5">
                            <Button size="sm" className="h-8 text-xs gap-1" onClick={() => sendResponse(r.id)} disabled={!(responseDraft[r.id] || "").trim()}>
                              <Send className="w-3 h-3" /> Save Response
                            </Button>
                            <Button size="sm" variant="outline" className="h-8 text-xs gap-1" onClick={() => markRequestComplete(r.id)}>
                              <CheckCircle2 className="w-3 h-3" /> Mark Complete
                            </Button>
                            <Button size="sm" variant="outline" className="h-8 text-xs gap-1 text-destructive" onClick={() => deleteRequest(r.id)}>
                              <Trash2 className="w-3 h-3" /> Delete
                            </Button>
                          </div>
                        </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>

            {closedRequests.length > 0 && (
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3 h-3" /> Resolved Pest Sightings
                  <Badge variant="secondary" className="ml-1 text-[10px]">{closedRequests.length}</Badge>
                </p>
                <div className="space-y-2">
                  {closedRequests.slice(0, 20).map(r => {
                    const comments: any[] = Array.isArray(r.crest_comments) ? r.crest_comments : [];
                    const lastComment = comments.length ? comments[comments.length - 1] : null;
                    const responseText = lastComment?.note || lastComment?.text || r.response_notes || "";
                    return (
                    <Card key={r.id} className="opacity-80">
                      <CardContent className="p-3 space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-semibold text-sm truncate">
                            {r.pest_type || r.request_type}
                            {r.location_type ? ` — ${r.location_type}` : ""}
                          </p>
                          <Badge variant="outline" className="text-[10px] shrink-0 border-emerald-300 text-emerald-900 bg-emerald-50">
                            Closed
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Reported {fmtDateTime(r.created_at)}
                          {r.closed_at ? ` · Closed ${fmtDateTime(r.closed_at)}` : ""}
                        </p>
                        {r.description && <p className="text-xs whitespace-pre-wrap">{r.description}</p>}
                        {responseText && (
                          <div className="rounded-md border border-emerald-300 bg-emerald-50/60 p-2">
                            <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-900 mb-0.5">Crest Response</p>
                            <p className="text-xs text-emerald-950 whitespace-pre-wrap">{responseText}</p>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </TabsContent>

        {/* ════════ TAB: Conditions (same tab the customer portal has) ════════ */}
        <TabsContent value="conditions" className="mt-0">
          <div className="max-w-4xl mx-auto">
            <ConditionsReportSection
              services={services as any}
              includeUndated
              onSaveServiceReportData={saveConditionsPatch}
              propertyName={property?.name}
              readOnly={readOnly}
            />
          </div>
        </TabsContent>

        {/* ════════ TAB: Safety Data Sheets ════════ */}
        <TabsContent value="materials" className="mt-0 space-y-6">
          <div className="max-w-5xl mx-auto space-y-6">
            <CommercialApprovedMaterials />
          </div>
        </TabsContent>

        {/* ════════ TAB: Help ════════ */}
        <TabsContent value="help" className="mt-0">
          <div className="max-w-3xl mx-auto">
            <HelpTutorialSection />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}