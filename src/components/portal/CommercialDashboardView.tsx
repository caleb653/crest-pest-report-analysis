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
  Bug, ShieldCheck, X,
} from "lucide-react";
import { ReadOnlyMapCanvas } from "@/components/ReadOnlyMapCanvas";
import { ProductUsageSummary } from "@/components/portal/ProductUsageSummary";
import { ProductUsageEditor } from "@/components/portal/ProductUsageEditor";
import { normalizeUsageList as _normUsage } from "@/lib/productCatalog";
import PlanRichEditor from "@/components/portal/PlanRichEditor";
import { normalizeUsageList } from "@/lib/productCatalog";
import CommercialApprovedMaterials from "@/components/portal/CommercialApprovedMaterials";
import {
  ConditionsReportSection, PestTrendingSection, DeviceTrendingSection,
  ServiceRecordsSection, MaterialUseLogSection, ServiceTeamSection,
  BusinessLicenseSection, HelpTutorialSection, DownloadLogbookButton,
  LogbookDateBadge, persistServiceReportData,
} from "@/components/portal/CommercialSpragueSections";
import {
  CommercialConcernsObserved,
  CommercialNonChemEquipment,
  COMMERCIAL_PEST_OPTIONS,
  normalizeConcerns,
  normalizeNonChemEquipment,
  type ConcernEntry,
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
  onOpenServiceReport: (s: ServiceData) => void;
  onEditService: (s: ServiceData) => void;
  onDeleteService: (id: string) => void;
  onCopyLink: (token: string) => void;
  onOpenPortal: (token: string) => void;
  onAddUpcomingService: () => void;
  onRefresh?: () => void;
  onUpdatePropertyImage?: (propId: string, file: File) => Promise<void> | void;
  uploadingPropertyImage?: boolean;
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

export default function CommercialDashboardView({
  property, services, links, onOpenServiceReport, onEditService,
  onDeleteService, onCopyLink, onOpenPortal, onAddUpcomingService,
  onRefresh, onUpdatePropertyImage, uploadingPropertyImage,
}: Props) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [tab, setTab] = useState<string>("map");
  const [requests, setRequests] = useState<any[]>([]);
  const [prepSheets, setPrepSheets] = useState<any[]>([]);
  const [docs, setDocs] = useState<any[]>([]);
  const [expandedPrep, setExpandedPrep] = useState<string | null>(null);
  const [responseDraft, setResponseDraft] = useState<Record<string, string>>({});
  const [propertyNotes, setPropertyNotes] = useState<string>(property.notes || "");
  const [savingProp, setSavingProp] = useState(false);
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
  };

  const today = todayISO();
  const past = services
    .filter(s => s.status === "completed" || (s.service_date && s.service_date <= today))
    .sort((a, b) => (b.service_date || "").localeCompare(a.service_date || ""));
  const upcoming = services
    .filter(s => s.status === "scheduled" && (!s.service_date || s.service_date > today))
    .sort((a, b) => (a.service_date || "").localeCompare(b.service_date || ""));
  const mapUrl = property.map_image_url || property.image_url || null;
  const followUpCount = past.filter(s => !!s.follow_up_recommended).length;
  const propertyFrequency: string =
    (property.customer_preferences as any)?.service_frequency || "monthly";

  // Re-hydrate only when the property changes — not on every notes prop change,
  // which can clobber characters mid-keystroke after a parent refresh.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setPropertyNotes(property.notes || ""); }, [property.id]);

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
    const { error } = await supabase.from("portal_services").insert({
      property_id: property.id,
      service_type: "Commercial General Pest",
      status,
      service_date: status === "completed" ? today : null,
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

  // Helpers for the inline editable report data (concerns / non-chem equipment)
  // stored on portal_services.report_data.
  const getReportData = (s: ServiceData): any => (s as any).report_data || {};
  const saveReportData = async (s: ServiceData, patch: Record<string, any>) => {
    const next = { ...getReportData(s), ...patch };
    await saveServiceField(s.id, { report_data: next });
  };

  // Recent pest sightings (open + last 30 days) — surfaced on every visit
  // card so the cofounder can see what to address.
  const recentSightings = requests
    .filter((r) => {
      const created = new Date(r.created_at).getTime();
      return Date.now() - created < 1000 * 60 * 60 * 24 * 45;
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
    const { error } = await supabase
      .from("portal_requests")
      .update({ response_notes: note, status: "in_progress", updated_at: new Date().toISOString() } as any)
      .eq("id", id);
    if (error) {
      toast({ title: "Couldn't save response", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Response saved" });
    setResponseDraft(d => ({ ...d, [id]: "" }));
    loadRequests();
  };

  const markRequestComplete = async (id: string) => {
    const { error } = await supabase
      .from("portal_requests")
      .update({ status: "completed", updated_at: new Date().toISOString() } as any)
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
              <p className="font-medium">{upcoming[0] ? fmtDate(upcoming[0].service_date) : "—"}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Sprague-style logbook header — date range + one-click download */}
      <Card>
        <CardContent className="p-3 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <LogbookDateBadge services={services as any} />
            <span className="text-xs text-muted-foreground">Online Logbook for {property.name}</span>
          </div>
          <DownloadLogbookButton propertyName={property.name} />
        </CardContent>
      </Card>

      {/* Portal links for this property */}
      {propertyLinks.length > 0 && (
        <Card>
          <CardContent className="p-4 space-y-2">
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Portal Links</p>
            <div className="space-y-1.5">
              {propertyLinks.map(l => (
                <div key={l.id} className="flex items-center gap-2 flex-wrap">
                  <Badge variant="secondary" className="text-[10px]">{l.label || l.link_type}</Badge>
                  <Button size="sm" variant="outline" onClick={() => onCopyLink(l.token)} className="h-7 text-xs gap-1">
                    <Copy className="w-3 h-3" /> Copy
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => onOpenPortal(l.token)} className="h-7 text-xs gap-1">
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
        <TabsList className="w-full h-auto p-1.5 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-1.5 bg-muted/50 border-2 border-primary/60 rounded-xl shadow-sm mb-5">
          <TabsTrigger value="map" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md font-semibold text-sm py-3 rounded-lg transition-all flex flex-col items-center gap-1">
            <MapPin className="w-5 h-5" />
            <span>Site Map, Plan &amp; Team</span>
          </TabsTrigger>
          <TabsTrigger value="past" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md font-semibold text-sm py-3 rounded-lg transition-all flex flex-col items-center gap-1">
            <Calendar className="w-5 h-5" />
            <span>
              Previous Services
              <Badge variant="secondary" className="ml-1 text-xs h-4">{past.length}</Badge>
              {followUpCount > 0 && (
                <Badge className="ml-1 text-xs h-4 bg-orange-500 hover:bg-orange-500 text-white">{followUpCount} follow-up</Badge>
              )}
            </span>
          </TabsTrigger>
          <TabsTrigger value="upcoming" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md font-semibold text-sm py-3 rounded-lg transition-all flex flex-col items-center gap-1">
            <ClipboardList className="w-5 h-5" />
            <span>Upcoming Services <Badge variant="secondary" className="ml-1 text-xs h-4">{upcoming.length}</Badge></span>
          </TabsTrigger>
          <TabsTrigger value="requests" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md font-semibold text-sm py-3 rounded-lg transition-all flex flex-col items-center gap-1">
            <Wrench className="w-5 h-5" />
            <span>Pest Sightings <Badge variant="secondary" className="ml-1 text-xs h-4">{openRequests.length}</Badge></span>
          </TabsTrigger>
          <TabsTrigger value="trending" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md font-semibold text-sm py-3 rounded-lg transition-all flex flex-col items-center gap-1">
            <FileText className="w-5 h-5" />
            <span>Trending &amp; Records</span>
          </TabsTrigger>
          <TabsTrigger value="materials" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md font-semibold text-sm py-3 rounded-lg transition-all flex flex-col items-center gap-1">
            <FlaskConical className="w-5 h-5" />
            <span>Materials &amp; Prep Sheets <Badge variant="secondary" className="ml-1 text-xs h-4">{prepSheets.length}</Badge></span>
          </TabsTrigger>
          <TabsTrigger value="help" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md font-semibold text-sm py-3 rounded-lg transition-all flex flex-col items-center gap-1">
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
                          className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
                            active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                          }`}
                          onClick={() => !active && setFrequency(opt.key)}
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
                  />
                  <p className="text-[11px] text-muted-foreground mt-1">
                    {savingProp ? "Saving…" : "Saves automatically when you tap away."}
                  </p>
                </div>
                <div className="flex flex-col gap-2 pt-1">
                  <Button size="sm" onClick={() => quickAddVisit("scheduled")} className="h-11 text-sm gap-1.5">
                    <Plus className="w-4 h-4" /> Add Upcoming Visit
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => quickAddVisit("completed")} className="h-11 text-sm gap-1.5">
                    <CheckCircle2 className="w-4 h-4" /> Log Past Visit
                  </Button>
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
                    {property.map_data ? (
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
                {onUpdatePropertyImage && (
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
        </TabsContent>

        {/* ════════ TAB 2: Previous Services ════════ */}
        <TabsContent value="past" className="mt-0">
          <div className="max-w-4xl mx-auto mb-3 flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Past Visits</p>
            <Button size="sm" variant="outline" onClick={() => quickAddVisit("completed")} className="h-9 text-xs gap-1">
              <Plus className="w-3.5 h-3.5" /> Log Past Visit
            </Button>
          </div>
          {past.length === 0 ? (
            <Card><CardContent className="p-6 text-sm text-muted-foreground text-center">
              No past visits yet.
            </CardContent></Card>
          ) : (
            <div className="space-y-2 max-w-4xl mx-auto">
              {past.map(s => {
                const isOpen = openId === s.id;
                const products = normalizeUsageList(s.products_used);
                const hasFollowUp = !!s.follow_up_recommended;
                const photos: any[] = Array.isArray(s.photos) ? s.photos : [];
                return (
                  <Card key={s.id} className={hasFollowUp ? "border-2 border-orange-400" : ""}>
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
                          <p className="text-xs text-muted-foreground">
                            {fmtDate(s.service_date)}{s.technician ? ` • ${s.technician}` : ""}
                          </p>
                        </div>
                        <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`} />
                      </button>
                      <div className="flex gap-1 shrink-0">
                        <Button size="sm" variant="outline" onClick={() => onOpenServiceReport(s)} className="h-8 gap-1 text-xs">
                          <FileText className="w-3 h-3" /> Report
                        </Button>
                        <Button size="icon" variant="outline" onClick={() => onDeleteService(s.id)} className="h-8 w-8 text-destructive">
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                    {isOpen && (
                      <div className="px-3 pb-3 pt-2 border-t border-border/60 space-y-3">
                        {/* Inline editable core fields — phone friendly */}
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <Label className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground mb-0.5 block">Date</Label>
                            <Input
                              type="date"
                              value={getField(s, "service_date") || ""}
                              onChange={e => setField(s.id, "service_date", e.target.value)}
                              onBlur={() => flushEdits(s.id)}
                              className="h-11 text-sm"
                            />
                          </div>
                          <div>
                            <Label className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground mb-0.5 block">Technician</Label>
                            <Input
                              value={getField(s, "technician") || ""}
                              onChange={e => setField(s.id, "technician", e.target.value)}
                              onBlur={() => flushEdits(s.id)}
                              placeholder="Tech name"
                              className="h-11 text-sm"
                            />
                          </div>
                          <div className="col-span-2">
                            <Label className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground mb-0.5 block">Service Type</Label>
                            <Select
                              value={getField(s, "service_type") || ""}
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
                          <Label className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground mb-0.5 block">Summary</Label>
                          <Textarea
                            value={getField(s, "summary") || ""}
                            onChange={e => setField(s.id, "summary", e.target.value)}
                            onBlur={() => flushEdits(s.id)}
                            placeholder="What was performed during this visit…"
                            rows={3}
                            className="text-sm"
                          />
                        </div>
                        <div>
                          <Label className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground mb-0.5 block">Findings</Label>
                          <Textarea
                            value={getField(s, "findings") || ""}
                            onChange={e => setField(s.id, "findings", e.target.value)}
                            onBlur={() => flushEdits(s.id)}
                            placeholder="Pest activity, conditions found, problem areas…"
                            rows={3}
                            className="text-sm"
                          />
                        </div>
                        <div>
                          <Label className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground mb-0.5 block">Internal Notes</Label>
                          <Textarea
                            value={getField(s, "notes") || ""}
                            onChange={e => setField(s.id, "notes", e.target.value)}
                            onBlur={() => flushEdits(s.id)}
                            placeholder="Office-only notes (not shown to client)…"
                            rows={2}
                            className="text-sm"
                          />
                        </div>
                        <div className="rounded-md border border-border p-2.5 space-y-2">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              className="w-4 h-4"
                              checked={!!getField(s, "follow_up_recommended")}
                              onChange={e => {
                                setField(s.id, "follow_up_recommended", e.target.checked);
                                saveServiceField(s.id, { follow_up_recommended: e.target.checked });
                              }}
                            />
                            <span className="text-sm font-semibold">Follow-up needed</span>
                          </label>
                          {getField(s, "follow_up_recommended") && (
                            <Textarea
                              value={getField(s, "follow_up_notes") || ""}
                              onChange={e => setField(s.id, "follow_up_notes", e.target.value)}
                              onBlur={() => flushEdits(s.id)}
                              placeholder="What needs to happen on the follow-up…"
                              rows={2}
                              className="text-sm"
                            />
                          )}
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          <Button size="sm" variant="outline" onClick={() => onEditService(s)} className="h-9 text-xs gap-1">
                            <Edit className="w-3 h-3" /> Full Editor (products / photos)
                          </Button>
                        </div>

                        {hasFollowUp && s.follow_up_notes && (
                          <div className="bg-orange-50 border border-orange-200 rounded-md p-2.5">
                            <p className="text-[11px] font-bold text-orange-800 uppercase tracking-wide mb-0.5">Follow-up Notes</p>
                            <p className="text-sm text-orange-900 whitespace-pre-wrap">{s.follow_up_notes}</p>
                          </div>
                        )}
                        {products.length > 0 && (
                          <div>
                            <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground mb-1 flex items-center gap-1">
                              <FlaskConical className="w-3 h-3" /> Products Used
                            </p>
                            <ProductUsageSummary entries={products} />
                          </div>
                        )}
                        {photos.length > 0 && (
                          <div>
                            <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground mb-1 flex items-center gap-1">
                              <Camera className="w-3 h-3" /> Photos
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                              {photos.map((p: any, i: number) => {
                                const url = typeof p === "string" ? p : p?.url;
                                if (!url) return null;
                                return (
                                  <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="block w-20 h-20 rounded-md border border-border overflow-hidden bg-muted">
                                    <img src={url} alt={`Photo ${i + 1}`} loading="lazy" className="w-full h-full object-cover" />
                                  </a>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
        </TabsContent>

        {/* ════════ TAB 3: Upcoming Services ════════ */}
        <TabsContent value="upcoming" className="mt-0">
          <div className="max-w-4xl mx-auto space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Upcoming Visits</p>
              <Button size="sm" variant="outline" onClick={onAddUpcomingService} className="h-8 text-xs gap-1">
                <Plus className="w-3 h-3" /> Add Visit
              </Button>
            </div>
            {upcoming.length === 0 ? (
              <Card><CardContent className="p-6 text-sm text-muted-foreground text-center">
                No upcoming visits scheduled.
              </CardContent></Card>
            ) : (
              <div className="space-y-2">
                {upcoming.map(s => {
                  const upProducts = _normUsage(getField(s, "products_used"));
                  const upPhotosRaw: any[] = Array.isArray(getField(s, "photos")) ? getField(s, "photos") : [];
                  return (
                  <Card key={s.id}>
                    <CardContent className="p-3 space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <div className="col-span-2">
                          <Label className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground mb-0.5 block">Service Type</Label>
                          <Select
                            value={getField(s, "service_type") || ""}
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
                          <Label className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground mb-0.5 block">Date</Label>
                          <Input
                            type="date"
                            value={getField(s, "service_date") || ""}
                            onChange={e => setField(s.id, "service_date", e.target.value)}
                            onBlur={() => flushEdits(s.id)}
                            className="h-11 text-sm"
                          />
                        </div>
                        <div>
                          <Label className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground mb-0.5 block">Time</Label>
                          <Input
                            value={getField(s, "service_time") || ""}
                            onChange={e => setField(s.id, "service_time", e.target.value)}
                            onBlur={() => flushEdits(s.id)}
                            placeholder="e.g. 9:00 AM"
                            className="h-11 text-sm"
                          />
                        </div>
                        <div className="col-span-2">
                          <Label className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground mb-0.5 block">Assigned Technician</Label>
                          <Input
                            value={getField(s, "technician") || ""}
                            onChange={e => setField(s.id, "technician", e.target.value)}
                            onBlur={() => flushEdits(s.id)}
                            placeholder="Tech name"
                            className="h-11 text-sm"
                          />
                        </div>
                        <div className="col-span-2">
                          <Label className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground mb-0.5 block">Prep / Notes for Tech</Label>
                          <Textarea
                            value={getField(s, "special_notes") || ""}
                            onChange={e => setField(s.id, "special_notes", e.target.value)}
                            onBlur={() => flushEdits(s.id)}
                            placeholder="Access info, prep, things to look for…"
                            rows={2}
                            className="text-sm"
                          />
                        </div>
                      </div>

                      {/* Products used (with amounts/dilution) — same editor as past visits */}
                      <div className="rounded-md border border-border bg-muted/30 p-2 space-y-1.5">
                        <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground flex items-center gap-1">
                          <FlaskConical className="w-3 h-3" /> Products Used
                        </p>
                        <ProductUsageEditor
                          value={upProducts}
                          onChange={(next) => { setField(s.id, "products_used", next); saveServiceField(s.id, { products_used: next }); }}
                          compact
                        />
                      </div>

                      {/* Photos — upload + thumbnails with remove */}
                      <div className="rounded-md border border-border bg-muted/30 p-2 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground flex items-center gap-1">
                            <Camera className="w-3 h-3" /> Photos
                            {upPhotosRaw.length > 0 && <Badge variant="secondary" className="ml-1 text-[10px] h-4">{upPhotosRaw.length}</Badge>}
                          </p>
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
                        </div>
                        {upPhotosRaw.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {upPhotosRaw.map((p: any, i: number) => {
                              const url = typeof p === "string" ? p : p?.url;
                              if (!url) return null;
                              return (
                                <div key={i} className="relative w-20 h-20 rounded-md border border-border overflow-hidden bg-muted group">
                                  <a href={url} target="_blank" rel="noopener noreferrer">
                                    <img src={url} alt={`Photo ${i + 1}`} loading="lazy" className="w-full h-full object-cover" />
                                  </a>
                                  <button
                                    type="button"
                                    onClick={() => removeServicePhoto(s.id, url)}
                                    className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                    aria-label="Remove photo"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      <div className="flex flex-wrap gap-1.5 pt-1">
                        <Button size="sm" variant="outline" onClick={() => onOpenServiceReport(s)} className="h-9 gap-1 text-xs">
                          <FileText className="w-3 h-3" /> Open Report
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => saveServiceField(s.id, { status: "completed", service_date: getField(s, "service_date") || today })} className="h-9 gap-1 text-xs">
                          <CheckCircle2 className="w-3 h-3" /> Mark Completed
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => onDeleteService(s.id)} className="h-9 gap-1 text-xs text-destructive">
                          <Trash2 className="w-3 h-3" /> Delete
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                  );
                })}
              </div>
            )}
          </div>
        </TabsContent>

        {/* ════════ TAB 4: Requests ════════ */}
        <TabsContent value="requests" className="mt-0">
          <div className="max-w-3xl mx-auto space-y-4">
            <Card className="border-2 border-primary/30 bg-primary/[0.03]">
              <CardContent className="p-3 space-y-2">
                <p className="text-xs font-bold uppercase tracking-wide text-primary">Add Request</p>
                <div className="grid grid-cols-2 gap-2">
                  <Input value={newReq.pest} onChange={e => setNewReq(r => ({ ...r, pest: e.target.value }))} placeholder="Pest (e.g. Ants)" className="h-11 text-sm" />
                  <Input value={newReq.location} onChange={e => setNewReq(r => ({ ...r, location: e.target.value }))} placeholder="Location (e.g. Kitchen)" className="h-11 text-sm" />
                </div>
                <Textarea value={newReq.description} onChange={e => setNewReq(r => ({ ...r, description: e.target.value }))} placeholder="Describe the issue or request…" rows={2} className="text-sm" />
                <Button size="sm" onClick={submitNewRequest} disabled={!newReq.description.trim()} className="h-11 text-sm gap-1.5 w-full">
                  <Plus className="w-4 h-4" /> Add Request
                </Button>
              </CardContent>
            </Card>
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
                <AlertTriangle className="w-3 h-3" /> Open Requests
                <Badge variant="secondary" className="ml-1 text-[10px]">{openRequests.length}</Badge>
              </p>
              {openRequests.length === 0 ? (
                <Card><CardContent className="p-5 text-sm text-muted-foreground text-center">
                  No open requests. Submissions from the commercial portal will appear here.
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
                          <Badge variant="secondary" className="text-[10px] capitalize shrink-0">{r.status}</Badge>
                        </div>
                        {r.description && (
                          <p className="text-sm whitespace-pre-wrap leading-relaxed">{r.description}</p>
                        )}
                        {r.response_notes && (
                          <div className="rounded-md border border-border bg-muted/40 p-2">
                            <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground mb-0.5">Last Response</p>
                            <p className="text-sm whitespace-pre-wrap">{r.response_notes}</p>
                          </div>
                        )}
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
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>

            {closedRequests.length > 0 && (
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3 h-3" /> Closed Requests
                  <Badge variant="secondary" className="ml-1 text-[10px]">{closedRequests.length}</Badge>
                </p>
                <div className="space-y-2">
                  {closedRequests.slice(0, 20).map(r => (
                    <Card key={r.id} className="opacity-80">
                      <CardContent className="p-3 space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-semibold text-sm truncate">
                            {r.pest_type || r.request_type}
                            {r.location_type ? ` — ${r.location_type}` : ""}
                          </p>
                          <Badge variant="outline" className="text-[10px] capitalize shrink-0">{r.status}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">{fmtDateTime(r.created_at)}</p>
                        {r.description && <p className="text-xs whitespace-pre-wrap">{r.description}</p>}
                        {r.response_notes && (
                          <p className="text-xs italic text-muted-foreground"><span className="font-semibold">Response:</span> {r.response_notes}</p>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}
          </div>
        </TabsContent>

        {/* ════════ TAB 5: Prep Sheets ════════ */}
        <TabsContent value="prep" className="mt-0 space-y-4">
          <Card>
            <CardHeader className="pb-3 pt-4 border-b bg-primary/[0.06]">
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <FileDown className="w-5 h-5 text-primary" /> Prep Sheets
                <Badge variant="secondary" className="ml-1 text-xs">{prepSheets.length}</Badge>
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                Treatment prep instructions you can view, download, or share with the customer.
              </p>
            </CardHeader>
            <CardContent className="p-4">
              {prepSheets.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No prep sheets uploaded yet.
                </p>
              ) : (
                <div className="space-y-2">
                  {prepSheets.map(ps => {
                    const open = expandedPrep === ps.id;
                    return (
                      <Card key={ps.id} className="border-border/60">
                        <button
                          type="button"
                          className="w-full text-left p-3 flex items-center justify-between"
                          onClick={() => setExpandedPrep(open ? null : ps.id)}
                        >
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold truncate">{ps.title}</p>
                            <p className="text-[11px] text-muted-foreground">{ps.treatment_type}</p>
                          </div>
                          <ChevronDown className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
                        </button>
                        {open && (
                          <div className="px-3 pb-3 border-t border-border pt-3 space-y-2">
                            {ps.description && (
                              <div className="bg-muted/30 rounded-lg p-3 max-h-[360px] overflow-y-auto">
                                <pre className="text-xs whitespace-pre-wrap font-sans leading-relaxed">{ps.description}</pre>
                              </div>
                            )}
                            <div className="flex flex-wrap gap-1.5">
                              {ps.file_url && (
                                <Button size="sm" variant="outline" className="h-9 text-xs"
                                  onClick={() => window.open(ps.file_url, "_blank", "noopener,noreferrer")}>
                                  <Eye className="w-3.5 h-3.5 mr-1" />View
                                </Button>
                              )}
                              {ps.file_url && (
                                <Button size="sm" variant="outline" className="h-9 text-xs"
                                  onClick={() => window.open(ps.file_url, "_blank")}>
                                  <Download className="w-3.5 h-3.5 mr-1" />Download
                                </Button>
                              )}
                              {ps.file_url && (
                                <Button size="sm" variant="outline" className="h-9 text-xs"
                                  onClick={async () => {
                                    await navigator.clipboard.writeText(ps.file_url);
                                    toast({ title: "Link copied" });
                                  }}>
                                  <Copy className="w-3.5 h-3.5 mr-1" />Copy Link
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
            </CardContent>
          </Card>
        </TabsContent>

        {/* ════════ TAB: Conditions ════════ */}
        <TabsContent value="conditions" className="mt-0">
          <div className="max-w-5xl mx-auto">
            <ConditionsReportSection
              services={services as any}
              onSaveServiceReportData={persistServiceReportData}
            />
          </div>
        </TabsContent>

        {/* ════════ TAB: Trending & Records ════════ */}
        <TabsContent value="trending" className="mt-0 space-y-6">
          <div className="max-w-5xl mx-auto space-y-6">
            <PestTrendingSection requests={requests as any} />
            <DeviceTrendingSection services={services as any} />
            <ServiceRecordsSection services={services as any} />
          </div>
        </TabsContent>

        {/* ════════ TAB: Materials ════════ */}
        <TabsContent value="materials" className="mt-0 space-y-6">
          <div className="max-w-5xl mx-auto space-y-6">
            <CommercialApprovedMaterials />
            <MaterialUseLogSection services={services as any} />
          </div>
        </TabsContent>

        {/* ════════ TAB: Team & Licensing ════════ */}
        <TabsContent value="team" className="mt-0 space-y-6">
          <div className="max-w-5xl mx-auto space-y-6">
            <ServiceTeamSection services={services as any} />
            <BusinessLicenseSection docs={docs as any} />
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