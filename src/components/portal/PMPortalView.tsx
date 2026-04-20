import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import {
  ClipboardList, Send, Wrench, Shield, MapPin, FileText, Download, Copy,
  Eye, Clock, CheckCircle, AlertCircle, Phone, Mail, ChevronDown, Calendar, FileDown, Image as ImageIcon, Bug,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { ReadOnlyMapCanvas } from "@/components/ReadOnlyMapCanvas";
import crestLogo from "@/assets/crest-logo.png";

const PEST_TYPES = [
  "Ants", "Spiders", "American Roaches", "German Cockroaches", "Crickets",
  "Earwigs", "Rodents", "Bed Bugs", "Fleas", "Mosquitoes", "Wasps",
  "Silverfish", "Drain Flies", "Pantry Pests", "Other",
];

interface PropertyData {
  id: string;
  client_id: string;
  name: string;
  address: string | null;
  image_url: string | null;
  map_data: any;
  map_image_url: string | null;
  equipment: any;
  customer_preferences: any;
  notes: string | null;
}

interface PrepSheet {
  id: string;
  title: string;
  description: string | null;
  treatment_type: string;
  file_url: string | null;
}

interface RequestData {
  id: string;
  request_type: string;
  description: string;
  status: string;
  response_notes: string | null;
  unit_number: string | null;
  created_at: string;
  pest_type?: string | null;
  location_type?: string | null;
  preferred_date?: string | null;
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
  scheduling_status: string | null;
  prep_required: boolean | null;
  prep_notes: string | null;
  units_planned: any;
  unit_details: any;
  special_notes: string | null;
}

interface PMPortalViewProps {
  propertyId: string;
  linkId: string;
  /** When true, hides the page chrome (header) — used inside admin preview. */
  embedded?: boolean;
}

const formatDate = (d: string | null) =>
  d ? new Date(d + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" }) : "";
const formatShortDate = (d: string | null) =>
  d ? new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "";

// Add `days` to YYYY-MM-DD using UTC to avoid TZ drift.
const addDaysISO = (isoDate: string, days: number): string => {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().split("T")[0];
};
const todayISO = () => new Date().toISOString().split("T")[0];

const PMPortalView = ({ propertyId, linkId, embedded = false }: PMPortalViewProps) => {
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<string>("map");
  const [property, setProperty] = useState<PropertyData | null>(null);
  const [services, setServices] = useState<ServiceData[]>([]);
  const [scopeOfWork, setScopeOfWork] = useState<string[]>([]);
  const [knownUnits, setKnownUnits] = useState<string[]>([]);
  const [prepSheets, setPrepSheets] = useState<PrepSheet[]>([]);
  const [requests, setRequests] = useState<RequestData[]>([]);

  const [expandedPastId, setExpandedPastId] = useState<string | null>(null);
  const [expandedUpcomingId, setExpandedUpcomingId] = useState<string | null>(null);
  const [expandedPrepSheet, setExpandedPrepSheet] = useState<string | null>(null);
  const [copyingPrepSheet, setCopyingPrepSheet] = useState<string | null>(null);
  const [pastViewMode, setPastViewMode] = useState<"date" | "unit">("date");

  // PM notes for upcoming services — keyed by service_date (YYYY-MM-DD).
  // Stored on portal_properties.customer_preferences.pm_upcoming_notes so admins can read them.
  const [pmNoteDraft, setPmNoteDraft] = useState<string>("");
  const [pmNoteSavedDate, setPmNoteSavedDate] = useState<string | null>(null);
  const [pmNoteSaving, setPmNoteSaving] = useState(false);

  // Work order form
  const [submitting, setSubmitting] = useState(false);
  const [unitNumber, setUnitNumber] = useState("");
  const [pestType, setPestType] = useState("");
  const [locationType, setLocationType] = useState("Interior");
  const [description, setDescription] = useState("");
  const [preferredDateChoice, setPreferredDateChoice] = useState<"next" | "few-weeks" | "other">("next");
  const [preferredDateCustom, setPreferredDateCustom] = useState("");

  useEffect(() => {
    loadAll();
  }, [propertyId, linkId]);

  const loadAll = async () => {
    setLoading(true);

    const [{ data: prop }, { data: svcs }, { data: sheets }, { data: reqs }] = await Promise.all([
      supabase.from("portal_properties").select("*").eq("id", propertyId).maybeSingle(),
      supabase.from("portal_services").select("*").eq("property_id", propertyId).order("service_date", { ascending: false }),
      supabase.from("portal_prep_sheets").select("*").order("title"),
      supabase.from("portal_requests").select("*").eq("link_id", linkId).order("created_at", { ascending: false }),
    ]);

    if (prop) setProperty(prop as PropertyData);

    if (Array.isArray(svcs)) {
      setServices(svcs as ServiceData[]);
      const types = new Set<string>();
      const units = new Set<string>();
      svcs.forEach((s: any) => {
        if (s.service_type) types.add(s.service_type);
        if (Array.isArray(s.unit_details)) {
          s.unit_details.forEach((u: any) => { if (u?.unit_number) units.add(String(u.unit_number)); });
        }
      });
      setScopeOfWork(Array.from(types));
      setKnownUnits(Array.from(units).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })));
    }

    if (Array.isArray(sheets)) setPrepSheets(sheets);
    if (Array.isArray(reqs)) setRequests(reqs);

    setLoading(false);
  };

  const computePreferredDate = (): string | null => {
    if (preferredDateChoice === "next") {
      const d = new Date();
      d.setDate(d.getDate() + 7);
      return d.toISOString().split("T")[0];
    }
    if (preferredDateChoice === "few-weeks") {
      const d = new Date();
      d.setDate(d.getDate() + 21);
      return d.toISOString().split("T")[0];
    }
    return preferredDateCustom || null;
  };

  const submitRequest = async () => {
    if (!unitNumber.trim() || !pestType) return;
    setSubmitting(true);

    const { error: err } = await supabase.from("portal_requests").insert({
      link_id: linkId,
      property_id: propertyId,
      unit_number: unitNumber.trim(),
      request_type: "Service Request",
      description: `${pestType} - ${locationType}${description ? ` - ${description}` : ""}`,
      pest_type: pestType,
      location_type: locationType,
      preferred_date: computePreferredDate(),
    } as any);

    if (!err) {
      toast({ title: "Work order submitted", description: "Crest will reach out shortly." });
      setUnitNumber("");
      setPestType("");
      setDescription("");
      setPreferredDateChoice("next");
      setPreferredDateCustom("");
      const { data: reqs } = await supabase
        .from("portal_requests")
        .select("*")
        .eq("link_id", linkId)
        .order("created_at", { ascending: false });
      if (reqs) setRequests(reqs);
    } else {
      toast({ title: "Error", description: "Could not submit work order.", variant: "destructive" });
    }
    setSubmitting(false);
  };

  const copyPrepLink = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: "Link copied" });
    } catch {
      toast({ title: "Couldn't copy link", variant: "destructive" });
    }
  };

  const downloadPrep = async (sheet: PrepSheet) => {
    if (!sheet.file_url) return;
    try {
      const a = document.createElement("a");
      a.href = sheet.file_url;
      a.download = `${sheet.title}.pdf`;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch {
      window.open(sheet.file_url, "_blank", "noopener,noreferrer");
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "pending": return <Clock className="w-4 h-4 text-yellow-500" />;
      case "in_progress": return <AlertCircle className="w-4 h-4 text-blue-500" />;
      case "resolved":
      case "completed": return <CheckCircle className="w-4 h-4 text-green-500" />;
      default: return <Clock className="w-4 h-4 text-muted-foreground" />;
    }
  };

  // ─── PM upcoming-notes: hooks must run before any conditional return ───
  // Compute the soonest scheduled service date OR the projected next date.
  // This must mirror the `nextService` derivation below but only depends on raw state.
  const _propertyForHook = property; // capture latest reference
  const _scheduled = services.filter(s => s.status !== "completed").sort((a, b) => (a.service_date || "").localeCompare(b.service_date || ""));
  const _past = services.filter(s => s.status === "completed").sort((a, b) => (b.service_date || "").localeCompare(a.service_date || ""));
  const _freqKey = ((_propertyForHook?.customer_preferences as any)?.service_frequency as "weekly" | "bi-weekly" | "monthly" | "bi-monthly") || "bi-weekly";
  const _freqDays = ({ "weekly": 7, "bi-weekly": 14, "monthly": 30, "bi-monthly": 60 } as const)[_freqKey] ?? 14;
  const _nextDateKey: string = (() => {
    if (_scheduled.length >= 1) return _scheduled[0].service_date || "";
    const anchor = _past[0]?.service_date || todayISO();
    return addDaysISO(anchor, _freqDays);
  })();
  const _pmNotesMap: Record<string, string> =
    ((_propertyForHook?.customer_preferences as any)?.pm_upcoming_notes as Record<string, string>) || {};

  // Sync draft when the next-service date changes (or property switches).
  useEffect(() => {
    setPmNoteDraft(_nextDateKey ? (_pmNotesMap[_nextDateKey] || "") : "");
    setPmNoteSavedDate(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [_nextDateKey, _propertyForHook?.id]);

  // Debounced save of PM note for the next-service date.
  useEffect(() => {
    if (!_nextDateKey || !_propertyForHook) return;
    const current = _pmNotesMap[_nextDateKey] || "";
    if (current === pmNoteDraft) return;
    const t = setTimeout(async () => {
      setPmNoteSaving(true);
      const updatedMap = { ..._pmNotesMap };
      if (pmNoteDraft.trim()) updatedMap[_nextDateKey] = pmNoteDraft;
      else delete updatedMap[_nextDateKey];
      const updatedPrefs = { ...(_propertyForHook.customer_preferences || {}), pm_upcoming_notes: updatedMap };
      const { error } = await supabase
        .from("portal_properties")
        .update({ customer_preferences: updatedPrefs })
        .eq("id", _propertyForHook.id);
      setPmNoteSaving(false);
      if (error) {
        toast({ title: "Failed to save note", variant: "destructive" });
      } else {
        (_propertyForHook as any).customer_preferences = updatedPrefs;
        setPmNoteSavedDate(_nextDateKey);
        toast({ title: "Note saved for upcoming service", duration: 1500 });
      }
    }, 800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pmNoteDraft, _nextDateKey]);

  if (loading) {
    return (
      <div className="min-h-[300px] flex items-center justify-center">
        <div className="text-center">
          <img src={crestLogo} alt="Crest Pest Control" className="h-12 mx-auto mb-3 animate-pulse" />
          <p className="text-muted-foreground text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  if (!property) {
    return (
      <div className="min-h-[200px] flex items-center justify-center">
        <p className="text-destructive text-sm">Property not found.</p>
      </div>
    );
  }

  const equipment: { name: string; count: number }[] = Array.isArray(property.equipment)
    ? (property.equipment as any[]).map((e) =>
        typeof e === "string" ? { name: e, count: 1 } : { name: e?.name ?? "", count: e?.count ?? 1 }
      )
    : [];
  const mapUrl = property.map_image_url || property.image_url;
  const customerPref = (property.customer_preferences as any)?.preference;
  const customerPrefNotes = (property.customer_preferences as any)?.notes;

  // Match admin portal logic exactly: past = completed, upcoming = everything else
  const pastServices = services
    .filter(s => s.status === "completed")
    .sort((a, b) => (b.service_date || "").localeCompare(a.service_date || ""));
  const scheduledServices = services
    .filter(s => s.status !== "completed")
    .sort((a, b) => (a.service_date || "").localeCompare(b.service_date || ""));

  // Property-level frequency toggle (managed by admin). Default bi-weekly.
  type FrequencyKey = "weekly" | "bi-weekly" | "monthly" | "bi-monthly";
  const FREQUENCY_DAYS: Record<FrequencyKey, number> = {
    "weekly": 7,
    "bi-weekly": 14,
    "monthly": 30,
    "bi-monthly": 60,
  };
  const FREQUENCY_LABELS: Record<FrequencyKey, string> = {
    "weekly": "Weekly",
    "bi-weekly": "Bi-Weekly",
    "monthly": "Monthly",
    "bi-monthly": "Bi-Monthly",
  };
  const propertyFrequency: FrequencyKey =
    ((property.customer_preferences as any)?.service_frequency as FrequencyKey) || "bi-weekly";
  const propertyFrequencyDays = FREQUENCY_DAYS[propertyFrequency] ?? 14;

  // Show ONE detailed "next service" + 5 future date-only projections.
  // Rule: take the soonest scheduled service as the next visit (ignore far-future scheduled rows
  // beyond #1). Then project the following 5 visits = next.date + N * frequency.
  // Projected visits show DATE ONLY — no notes, units, or other details.
  const FUTURE_PROJECTION_COUNT = 5;
  const nextService: ServiceData | null = (() => {
    if (scheduledServices.length >= 1) return scheduledServices[0];
    // No scheduled — project the next visit from most recent past (or today).
    const anchorDate = pastServices[0]?.service_date || todayISO();
    return {
      id: "projected-next",
      property_id: propertyId,
      service_date: addDaysISO(anchorDate, propertyFrequencyDays),
      service_time: null,
      service_type: pastServices[0]?.service_type || "General Pest Control",
      technician: pastServices[0]?.technician || null,
      status: "scheduled",
      summary: null,
      findings: null,
      notes: null,
      follow_up_recommended: null,
      follow_up_notes: null,
      scheduling_status: "projected",
      prep_required: null,
      prep_notes: null,
      units_planned: pastServices[0]?.units_planned || null,
      unit_details: [],
      special_notes: null,
    };
  })();
  const futureProjectedDates: string[] = (() => {
    if (!nextService?.service_date) return [];
    const dates: string[] = [];
    let cursor = nextService.service_date;
    for (let i = 0; i < FUTURE_PROJECTION_COUNT; i++) {
      cursor = addDaysISO(cursor, propertyFrequencyDays);
      dates.push(cursor);
    }
    return dates;
  })();
  const upcomingServices: ServiceData[] = nextService ? [nextService] : [];

  // PM upcoming-notes map (date -> note). The draft state + save effect are placed
  // above the early returns to satisfy Rules of Hooks. We resolve the key here for display.
  const pmNotesMap: Record<string, string> =
    ((property.customer_preferences as any)?.pm_upcoming_notes as Record<string, string>) || {};
  const nextServiceDateKey = nextService?.service_date || "";

  const openRequestUnits = new Set(
    requests
      .filter(r => r.status === "pending" || r.status === "in_progress")
      .map(r => r.unit_number)
      .filter(Boolean) as string[]
  );
  const followUpUnits = (() => {
    const set = new Set<string>();
    if (pastServices.length > 0) {
      const mostRecent = pastServices[0];
      const details = Array.isArray(mostRecent.unit_details) ? mostRecent.unit_details as any[] : [];
      details.forEach(u => {
        if (u?.unit_number && (
          u.status === "Needs Follow-up" ||
          u.followUp === "Yes" ||
          (u.pest_activity && ["High", "Moderate"].includes(u.pest_activity))
        )) {
          set.add(String(u.unit_number));
        }
      });
    }
    return set;
  })();

  const servicesByUnit = (() => {
    const map = new Map<string, { service: ServiceData; unitDetail: any }[]>();
    pastServices.forEach(s => {
      if (Array.isArray(s.unit_details) && (s.unit_details as any[]).length > 0) {
        (s.unit_details as any[]).forEach(u => {
          const key = u?.unit_number || "General";
          if (!map.has(key)) map.set(key, []);
          map.get(key)!.push({ service: s, unitDetail: u });
        });
      } else {
        if (!map.has("General")) map.set("General", []);
        map.get("General")!.push({ service: s, unitDetail: null });
      }
    });
    return map;
  })();

  const renderServiceDetailsRO = (s: ServiceData) => {
    const unitDetails = Array.isArray(s.unit_details) ? s.unit_details as any[] : [];
    const unitsPlanned = Array.isArray(s.units_planned) ? s.units_planned as string[] : [];
    const summaryCombined = [s.summary, s.findings, s.notes].filter(Boolean).join("\n\n");
    return (
      <div className="px-3 pb-3 border-t pt-3 space-y-2.5 text-xs">
        {summaryCombined && (
          <div>
            <p className="font-semibold text-muted-foreground uppercase text-[10px] tracking-wide mb-1">Summary</p>
            <p className="whitespace-pre-wrap">{summaryCombined}</p>
          </div>
        )}
        {unitDetails.length > 0 && (
          <div>
            <p className="font-semibold text-muted-foreground uppercase text-[10px] tracking-wide mb-1">Units Treated</p>
            <div className="space-y-1.5">
              {unitDetails.map((u: any, i: number) => (
                <div key={i} className="bg-muted/40 rounded-md p-2">
                  <p className="font-medium">Unit {u.unit_number || "—"}</p>
                  {u.findings && <p className="text-muted-foreground mt-0.5">Findings: {u.findings}</p>}
                  {u.pest_activity && <p className="text-muted-foreground">Activity: {u.pest_activity}</p>}
                  {u.products_used && <p className="text-muted-foreground">Products: {u.products_used}</p>}
                  {u.notes && <p className="text-muted-foreground">Notes: {u.notes}</p>}
                </div>
              ))}
            </div>
          </div>
        )}
        {unitsPlanned.length > 0 && unitDetails.length === 0 && (
          <div>
            <p className="font-semibold text-muted-foreground uppercase text-[10px] tracking-wide mb-1">Planned Units</p>
            <div className="flex flex-wrap gap-1">
              {unitsPlanned.map((u, i) => <Badge key={i} variant="outline" className="text-[10px]">{u}</Badge>)}
            </div>
          </div>
        )}
        {s.prep_required && s.prep_notes && (
          <div className="bg-amber-50 border border-amber-200 rounded-md p-2">
            <p className="font-semibold text-amber-900 mb-0.5">Prep Required</p>
            <p className="text-amber-800 whitespace-pre-wrap">{s.prep_notes}</p>
          </div>
        )}
        {s.special_notes && (
          <div>
            <p className="font-semibold text-muted-foreground uppercase text-[10px] tracking-wide mb-1">Special Notes</p>
            <p className="whitespace-pre-wrap">{s.special_notes}</p>
          </div>
        )}
        {s.follow_up_recommended && s.follow_up_notes && (
          <div className="bg-orange-50 border border-orange-200 rounded-md p-2">
            <p className="font-semibold text-orange-900 mb-0.5">Follow-up Recommended</p>
            <p className="text-orange-800 whitespace-pre-wrap">{s.follow_up_notes}</p>
          </div>
        )}
      </div>
    );
  };

  const content = (
    <div className="max-w-5xl mx-auto px-4 py-5">
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
            <span>Request Work Order</span>
          </TabsTrigger>
          <TabsTrigger value="upcoming" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md font-semibold text-sm py-3 rounded-lg transition-all flex flex-col items-center gap-1">
            <ClipboardList className="w-5 h-5" />
            <span>Upcoming Services <Badge variant="secondary" className="ml-1 text-[10px] h-4">{upcomingServices.length}</Badge></span>
          </TabsTrigger>
          <TabsTrigger value="prep" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md font-semibold text-sm py-3 rounded-lg transition-all flex flex-col items-center gap-1">
            <FileDown className="w-5 h-5" />
            <span>Prep Sheets <Badge variant="secondary" className="ml-1 text-[10px] h-4">{prepSheets.length}</Badge></span>
          </TabsTrigger>
        </TabsList>

        {/* ════════ TAB 1: PROPERTY / MAP ════════ */}
        <TabsContent value="map" className="mt-0 space-y-5">
          <Card>
            <CardContent className="p-4 flex items-start gap-3">
              {property.image_url && (
                <img src={property.image_url} alt={property.name} className="w-16 h-16 rounded-lg object-cover shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <h2 className="font-bold text-base truncate">{property.name}</h2>
                {property.address && <p className="text-xs text-muted-foreground truncate">{property.address}</p>}
              </div>
            </CardContent>
          </Card>

          {/* Property Plan + Customer Preference (top of page, read-only for PM) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <Card className="shadow-sm border-primary/20 bg-gradient-to-br from-primary/[0.03] to-transparent">
              <CardHeader className="pb-3 pt-4 border-b bg-primary/[0.06]">
                <CardTitle className="text-base font-bold flex items-center gap-2">
                  <ClipboardList className="w-5 h-5 text-primary" />
                  Property Plan
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4 space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                    Service Frequency:
                  </span>
                  <Badge variant="secondary" className="text-xs">
                    {FREQUENCY_LABELS[propertyFrequency]}
                  </Badge>
                </div>
                {property.notes ? (
                  <p className="text-sm whitespace-pre-wrap">{property.notes}</p>
                ) : (
                  <p className="text-xs text-muted-foreground italic">No property plan set yet.</p>
                )}
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
                {customerPref || customerPrefNotes ? (
                  <p className="text-sm whitespace-pre-wrap">
                    {[customerPref, customerPrefNotes].filter(Boolean).join("\n\n")}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground italic">No customer preferences set yet.</p>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div>
              {mapUrl ? (
                <Card className="overflow-hidden shadow-sm">
                  <div className="relative bg-muted max-w-[520px] mx-auto" style={{ aspectRatio: "3 / 4" }}>
                    {property.map_data ? (
                      <ReadOnlyMapCanvas mapUrl={mapUrl} mapData={property.map_data} />
                    ) : (
                      <img src={mapUrl} alt={property.name} className="w-full h-full object-cover" />
                    )}
                  </div>
                </Card>
              ) : (
                <Card><CardContent className="p-8 text-center text-muted-foreground text-sm">
                  <ImageIcon className="w-8 h-8 mx-auto mb-2 opacity-40" />No site map yet
                </CardContent></Card>
              )}
            </div>

            <div className="space-y-4">
              {equipment.length > 0 && (
                <Card>
                  <CardHeader className="pb-2 py-4"><CardTitle className="text-sm flex items-center gap-2">
                    <Wrench className="w-4 h-4 text-muted-foreground" />Equipment on Site
                  </CardTitle></CardHeader>
                  <CardContent className="pt-0">
                    <div className="space-y-1.5">
                      {equipment.map((eq, i) => (
                        <div key={`${eq.name}-${i}`} className="flex items-center gap-2.5">
                          <span className="w-5 h-5 rounded-full bg-muted text-muted-foreground text-xs font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                          <span className="text-sm">{eq.name}{eq.count > 1 ? ` ×${eq.count}` : ""}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </TabsContent>

        {/* ════════ TAB 2: PAST SERVICES (read-only) ════════ */}
        <TabsContent value="past" className="mt-0">
          <div className="space-y-3 max-w-5xl mx-auto">
            <div className="flex items-center justify-between gap-3 pb-2.5 border-b-2 border-primary/40 flex-wrap">
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
                        {isExpanded && renderServiceDetailsRO(s)}
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
                            <div key={`${service.id}-${j}`} className="bg-muted/40 rounded-lg p-2.5 text-xs border border-transparent">
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

        {/* ════════ TAB 3: REQUEST WORK ORDER ════════ */}
        <TabsContent value="request" className="mt-0">
          <div className="max-w-2xl mx-auto space-y-4">
            <Card className="border-primary/30 shadow-md">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <ClipboardList className="w-4 h-4 text-primary" />Submit a Work Order
                </CardTitle>
                <p className="text-xs text-muted-foreground">Tell us what's going on and we'll schedule service.</p>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Label className="text-sm">Unit or Area *</Label>
                  {knownUnits.length > 0 ? (
                    <div className="space-y-1">
                      <Select value={unitNumber} onValueChange={setUnitNumber}>
                        <SelectTrigger><SelectValue placeholder="Select or type unit / area" /></SelectTrigger>
                        <SelectContent>
                          {knownUnits.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                          <SelectItem value="__other">Other (type below)...</SelectItem>
                        </SelectContent>
                      </Select>
                      {unitNumber === "__other" && (
                        <Input placeholder="Type unit or area (e.g. Pool deck, Unit 204)" onChange={e => setUnitNumber(e.target.value)} />
                      )}
                    </div>
                  ) : (
                    <Input placeholder="Type unit or area (e.g. Unit 204, Lobby)" value={unitNumber} onChange={e => setUnitNumber(e.target.value)} />
                  )}
                </div>

                <div>
                  <Label className="text-sm">What are you dealing with? *</Label>
                  <Select value={pestType} onValueChange={setPestType}>
                    <SelectTrigger><SelectValue placeholder="Select pest type" /></SelectTrigger>
                    <SelectContent>
                      {PEST_TYPES.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-sm">Where is the issue?</Label>
                  <div className="flex gap-2 mt-1">
                    {["Interior", "Exterior", "Both"].map(loc => (
                      <button key={loc} type="button"
                        className={`px-4 py-2 rounded-lg text-sm border transition-colors flex-1 ${locationType === loc ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-muted border-border"}`}
                        onClick={() => setLocationType(loc)}>{loc}</button>
                    ))}
                  </div>
                </div>

                <div>
                  <Label className="text-sm">Preferred Day</Label>
                  <div className="grid grid-cols-3 gap-2 mt-1">
                    {([
                      { key: "next", label: "Next service" },
                      { key: "few-weeks", label: "Next few weeks" },
                      { key: "other", label: "Other" },
                    ] as const).map(opt => (
                      <button key={opt.key} type="button"
                        className={`px-3 py-2 rounded-lg text-xs border transition-colors ${preferredDateChoice === opt.key ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-muted border-border"}`}
                        onClick={() => setPreferredDateChoice(opt.key)}>{opt.label}</button>
                    ))}
                  </div>
                  {preferredDateChoice === "other" && (
                    <Input className="mt-2" placeholder="Tell us when works (e.g. Tuesday afternoon, after the 15th)"
                      value={preferredDateCustom} onChange={e => setPreferredDateCustom(e.target.value)} />
                  )}
                </div>

                <div>
                  <Label className="text-sm">Additional Details</Label>
                  <Textarea placeholder="Any extra context — where exactly you're seeing the issue, severity, etc."
                    value={description} onChange={e => setDescription(e.target.value)} rows={3} />
                </div>

                <Button className="w-full" size="lg" onClick={submitRequest}
                  disabled={!unitNumber.trim() || unitNumber === "__other" || !pestType || submitting}>
                  <Send className="w-4 h-4 mr-2" />Submit Work Order
                </Button>
              </CardContent>
            </Card>

            {requests.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold mb-2">Your Previous Work Orders</h3>
                <div className="space-y-2">
                  {requests.map(r => {
                    // Find any upcoming service that already has this unit planned
                    const matchedUpcoming = r.unit_number
                      ? upcomingServices.find(s => Array.isArray(s.units_planned) && (s.units_planned as string[]).includes(r.unit_number!))
                      : null;
                    return (
                      <Card key={r.id}>
                        <CardContent className="p-3">
                          <div className="flex items-center justify-between mb-1.5">
                            <div className="flex items-center gap-2">
                              {getStatusIcon(r.status)}
                              <Badge variant="outline" className="text-xs">
                                {r.status === "in_progress" ? "In Progress" : r.status.charAt(0).toUpperCase() + r.status.slice(1)}
                              </Badge>
                              {r.request_type && (
                                <Badge variant="secondary" className="text-[10px] capitalize">{r.request_type.replace(/_/g, " ")}</Badge>
                              )}
                            </div>
                            <span className="text-xs text-muted-foreground">
                              {new Date(r.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                            </span>
                          </div>
                          {r.unit_number && (
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <Badge variant="outline" className="text-[10px] py-0 px-1.5 font-medium">{r.unit_number}</Badge>
                              {r.location_type && <span className="text-[10px] text-muted-foreground">• {r.location_type}</span>}
                              {r.preferred_date && <span className="text-[10px] text-muted-foreground">• Wants: {r.preferred_date}</span>}
                            </div>
                          )}
                          <p className="text-sm mt-1">{r.description}</p>
                          {matchedUpcoming && (
                            <div className="mt-2 bg-primary/5 border border-primary/15 rounded-md p-2">
                              <p className="text-[10px] font-semibold text-primary uppercase tracking-wide mb-0.5">Scheduled for</p>
                              <p className="text-xs">{formatDate(matchedUpcoming.service_date)} — {matchedUpcoming.service_type}</p>
                            </div>
                          )}
                          {r.response_notes && (
                            <div className="mt-2 bg-muted rounded-md p-2">
                              <p className="text-xs font-medium text-muted-foreground mb-0.5">Response from Crest:</p>
                              <p className="text-sm">{r.response_notes}</p>
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

        {/* ════════ TAB 4: UPCOMING (read-only) ════════ */}
        <TabsContent value="upcoming" className="mt-0">
          <div className="space-y-4 max-w-5xl mx-auto">
            <div className="border-b-2 border-primary/40 pb-2.5">
              <h3 className="text-base font-bold flex items-center gap-2">
                <ClipboardList className="w-5 h-5 text-secondary" />Upcoming Services
                <Badge variant="secondary" className="text-[11px] ml-1">{upcomingServices.length}</Badge>
              </h3>
            </div>

            {upcomingServices.length === 0 ? (
              <Card className="shadow-sm"><CardContent className="p-8 text-center text-muted-foreground text-sm">No upcoming services scheduled</CardContent></Card>
            ) : (
              <div className="space-y-2">
                {upcomingServices.map((s, i) => {
                  const isFirst = i === 0;
                  const isExpanded = isFirst || expandedUpcomingId === s.id;
                  const ownPlanned = Array.isArray(s.units_planned) ? s.units_planned as string[] : [];
                  // Fall back to most recent past service's units when this upcoming has none planned yet
                  const lastPast = pastServices[0];
                  const lastPastUnits = lastPast && Array.isArray(lastPast.units_planned)
                    ? lastPast.units_planned as string[]
                    : [];
                  const unitsPlanned = ownPlanned.length > 0 ? ownPlanned : lastPastUnits;
                  const usingFallbackUnits = ownPlanned.length === 0 && lastPastUnits.length > 0;

                  // Carry-over notes from the most recent past service when this upcoming has none
                  const ownHasNotes = Boolean(s.summary || s.findings || s.notes || s.special_notes);
                  const carryNotes = !ownHasNotes && lastPast
                    ? [
                        lastPast.special_notes,
                        lastPast.follow_up_recommended ? lastPast.follow_up_notes : null,
                      ].filter(Boolean).join("\n\n")
                    : "";

                  return (
                    <Card key={s.id} className={`transition-all shadow-sm ${isFirst ? "border-primary/50 shadow-md ring-1 ring-primary/20 bg-gradient-to-br from-primary/[0.08] to-transparent" : isExpanded ? "border-primary/20" : "hover:border-muted-foreground/30"}`}>
                      <button className="w-full text-left p-3 flex items-center justify-between" onClick={() => !isFirst && setExpandedUpcomingId(isExpanded && !isFirst ? null : s.id)}>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            {isFirst && <Badge className="text-[10px] bg-secondary text-secondary-foreground">Next Service</Badge>}
                            <p className={`font-semibold ${isFirst ? "text-sm" : "text-xs"}`}>{s.service_type}</p>
                            {!isFirst && <Badge variant="secondary" className="text-[10px]">{s.scheduling_status || "confirmed"}</Badge>}
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {formatDate(s.service_date)}
                            {s.technician && ` • ${s.technician}`}
                            {unitsPlanned.length > 0 && ` • ${unitsPlanned.length} units planned`}
                          </p>

                          {/* Units to be Treated — falls back to most recent past service */}
                          {unitsPlanned.length > 0 && (
                            <div className="mt-1.5">
                              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                                Units to be Treated
                                {usingFallbackUnits && (
                                  <span className="ml-1 normal-case font-normal text-muted-foreground/80">
                                    (carried from last service)
                                  </span>
                                )}
                              </p>
                              <div className="flex flex-wrap gap-1">
                                {unitsPlanned.map((u, idx) => {
                                  const isWorkOrder = isFirst && openRequestUnits.has(u);
                                  const isFollowUp = followUpUnits.has(u);
                                  const flagged = isWorkOrder || isFollowUp;
                                  const label = isWorkOrder ? `${u} · Work order` : isFollowUp ? `${u} · Follow-up` : u;
                                  return (
                                    <Badge
                                      key={`${u}-${idx}`}
                                      variant={flagged ? "default" : "outline"}
                                      className={`text-[10px] py-0 px-1.5 font-medium ${flagged ? "bg-orange-100 text-orange-900 border border-orange-300 hover:bg-orange-100" : ""}`}
                                    >
                                      {label}
                                    </Badge>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {/* Carry-over notes from the previous service when this upcoming has none */}
                          {carryNotes && (
                            <div className="mt-2 bg-muted/40 border border-border rounded-md p-2">
                              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                                Notes carried from last service ({formatShortDate(lastPast?.service_date || null)})
                              </p>
                              <p className="text-xs whitespace-pre-wrap">{carryNotes}</p>
                            </div>
                          )}
                        </div>
                        {!isFirst && <ChevronDown className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform ${isExpanded ? "rotate-180" : ""}`} />}
                      </button>

                      {/* PM-editable notes for the next service. Visible to admins/technicians. */}
                      {isFirst && (
                        <div className="px-3 pb-3 -mt-1">
                          <div className="border-t border-border/60 pt-2.5">
                            <div className="flex items-center justify-between mb-1.5">
                              <Label htmlFor={`pm-notes-${s.id}`} className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                                Notes / Comments for the Technician
                              </Label>
                              <span className="text-[10px] text-muted-foreground italic">
                                {pmNoteSaving
                                  ? "Saving…"
                                  : pmNoteSavedDate === s.service_date
                                    ? "Saved"
                                    : "Auto-saves"}
                              </span>
                            </div>
                            <Textarea
                              id={`pm-notes-${s.id}`}
                              value={pmNoteDraft}
                              onChange={(e) => setPmNoteDraft(e.target.value)}
                              placeholder="Add notes for Crest about this upcoming visit (e.g., units to focus on, access codes, tenant concerns)…"
                              className="text-xs min-h-[70px] bg-background"
                            />
                          </div>
                        </div>
                      )}

                      {isExpanded && (ownHasNotes || s.prep_required || (Array.isArray(s.unit_details) && (s.unit_details as any[]).length > 0)) && renderServiceDetailsRO(s)}
                    </Card>
                  );
                })}
              </div>
            )}

            {/* Future projected visits — date only, no details */}
            {futureProjectedDates.length > 0 && (
              <div className="mt-5">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5" />
                  Following {futureProjectedDates.length} visits ({FREQUENCY_LABELS[propertyFrequency]})
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

        {/* ════════ TAB 5: PREP SHEETS (download/copy/view only) ════════ */}
        <TabsContent value="prep" className="mt-0">
          <div className="space-y-2 max-w-4xl mx-auto">
            <div className="border-b-2 border-primary/40 pb-3 mb-3">
              <h3 className="text-xl font-bold flex items-center gap-2">
                <FileDown className="w-6 h-6 text-secondary" />Prep Sheets
                <Badge variant="secondary" className="text-xs ml-1">{prepSheets.length}</Badge>
              </h3>
              <p className="text-xs text-muted-foreground mt-1">View, download, or copy a link to share with tenants.</p>
            </div>
            {prepSheets.length === 0 ? (
              <Card className="shadow-sm"><CardContent className="p-8 text-center text-muted-foreground text-sm">No prep sheets available yet</CardContent></Card>
            ) : (
              <div className="space-y-2">
                {prepSheets.map(ps => {
                  const isExpanded = expandedPrepSheet === ps.id;
                  return (
                    <Card key={ps.id} className="shadow-sm hover:border-primary/30 transition-all">
                      <button className="w-full text-left p-3 flex items-center justify-between" onClick={() => setExpandedPrepSheet(isExpanded ? null : ps.id)}>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold">{ps.title}</p>
                          <p className="text-xs text-muted-foreground">{ps.treatment_type}</p>
                        </div>
                        <ChevronDown className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                      </button>
                      {isExpanded && (
                        <div className="px-3 pb-3 border-t border-border/60 pt-3 space-y-3">
                          {ps.description && (
                            <div className="bg-muted/30 rounded-lg p-3 max-h-[400px] overflow-y-auto">
                              <pre className="text-xs whitespace-pre-wrap font-sans leading-relaxed">{ps.description}</pre>
                            </div>
                          )}
                          <div className="flex flex-wrap gap-1.5">
                            {ps.file_url && (
                              <Button size="sm" variant="outline" className="h-9 text-sm" asChild>
                                <a href={ps.file_url} target="_blank" rel="noopener noreferrer">
                                  <Eye className="w-3.5 h-3.5 mr-1" />View
                                </a>
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
                        </div>
                      )}
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );

  if (embedded) {
    return content;
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header — NO back/home button (PMs cannot navigate to other properties) */}
      <div className="bg-card border-b px-4 py-3 sticky top-0 z-20">
        <div className="max-w-5xl mx-auto flex items-center gap-3">
          <img src={crestLogo} alt="Crest Pest Control" className="h-9" />
          <div className="flex-1 min-w-0">
            <h1 className="font-bold text-base truncate">{property.name}</h1>
            <p className="text-xs text-muted-foreground">Property Manager Portal</p>
          </div>
        </div>
      </div>

      {content}

      <div className="border-t mt-8 py-4 text-center text-xs text-muted-foreground">
        <p className="flex items-center justify-center gap-3">
          <span className="flex items-center gap-1"><Phone className="w-3 h-3" />949-424-5000</span>
          <span className="flex items-center gap-1"><Mail className="w-3 h-3" />office@crestpestco.com</span>
        </p>
        <p className="mt-1">© {new Date().getFullYear()} Crest Pest Control</p>
      </div>
    </div>
  );
};

export default PMPortalView;
