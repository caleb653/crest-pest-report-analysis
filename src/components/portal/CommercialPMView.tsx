/**
 * CommercialPMView — Client-side portal for commercial accounts (e.g.
 * restaurants). Mobile-first. Intentionally has NO units / sub-locations,
 * NO surveys, NO videos, NO unit pricing — but DOES include site map,
 * upcoming/past visits, scope-of-work descriptions, and a simple
 * Requests tab (no work-orders/units, just location-level requests).
 *
 * Sibling to PMPortalView — the apartment / HOA portals are untouched.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { COMMERCIAL_PEST_OPTIONS } from "@/components/portal/CommercialReportExtras";
import {
  Calendar, ClipboardList, MapPin, MessageSquare, Send, Phone, Clock,
  ChevronDown, FlaskConical, Camera, FileText, Plus, Wrench, Image as ImageIcon,
  Download, Eye, Copy, FileDown, Upload, X,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { ReadOnlyMapCanvas } from "@/components/ReadOnlyMapCanvas";
import { ProductUsageSummary } from "@/components/portal/ProductUsageSummary";
import { normalizeUsageList } from "@/lib/productCatalog";
import { PesticideNotice } from "@/components/portal/PesticideNotice";
import CommercialApprovedMaterials from "@/components/portal/CommercialApprovedMaterials";
import {
  ConditionsReportSection, ConditionCardsReadOnly, ServiceTeamSection,
  BusinessLicenseSection, HelpTutorialSection,
} from "@/components/portal/CommercialSpragueSections";
import crestLogo from "@/assets/crest-logo.png";
import { AlertTriangle, FlaskConical as FlaskIcon, ShieldCheck, HelpCircle } from "lucide-react";

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
  frequency_days?: number | null;
}

interface RequestData {
  id: string;
  request_type: string;
  description: string;
  status: string;
  response_notes: string | null;
  created_at: string;
  pest_type?: string | null;
  location_type?: string | null;
  sighting_status?: string | null;
  closed_at?: string | null;
  crest_comments?: any;
}

interface CommercialPMViewProps {
  propertyId: string;
  linkId: string;
}

// Commercial-specific scope-of-work descriptions. Used to render a "Services"
// tab so customers know what each visit type covers. Keys match the
// service_type strings used elsewhere in the app.
const COMMERCIAL_SERVICE_DESCRIPTIONS: Record<string, string[]> = {
  "Commercial General Pest": [
    "Inspect interior and exterior areas (kitchens, dining, restrooms, break rooms, storage) for pest activity",
    "Treat inspected areas, place and monitor insect monitors, and apply targeted interior and exterior treatments as needed",
    "Provide ongoing service with regular inspections, monitoring, treatments, and clear communication with management",
  ],
  "Rodent Bait Boxes": [
    "Install rodent bait boxes around the property to maintain consistent control of rodent populations",
    "Strategically move bait boxes depending on ongoing rodent activity",
  ],
  "Rodent Trapping": [
    "Eliminate active rodent populations through targeted trapping inside and around the property",
    "Strategically place traps in areas of highest activity to quickly reduce populations",
    "Monitor and adjust trap placement as needed to ensure effective control",
  ],
  "Rodent Exclusion": [
    "Seal gaps, vents, utility penetrations, and other vulnerabilities using industry-grade materials",
    "Customize every exclusion to the structure to prevent future rodent entry",
  ],
  "Mosquito Service": [
    "Set up mosquito buckets, which interrupt breeding cycles and neutralize future generations",
    "Target adult mosquitoes and larvae with long-lasting products",
  ],
  "De-webbing": [
    "Thoroughly de-web the entire exterior of the property including eaves and high-visibility areas",
  ],
};

const fmtDate = (iso: string | null) =>
  iso
    ? new Date(iso + "T00:00:00").toLocaleDateString("en-US", {
        weekday: "short", month: "short", day: "numeric", year: "numeric",
      })
    : "—";

const REQUEST_STATUS_VARIANT: Record<string, "default" | "secondary" | "outline"> = {
  pending: "secondary",
  scheduled: "default",
  completed: "outline",
};

export default function CommercialPMView({ propertyId, linkId }: CommercialPMViewProps) {
  const [property, setProperty] = useState<PropertyData | null>(null);
  const [services, setServices] = useState<ServiceData[]>([]);
  const [requests, setRequests] = useState<RequestData[]>([]);
  const [docs, setDocs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [openServiceId, setOpenServiceId] = useState<string | null>(null);

  // Message form state.
  const [msgSubject, setMsgSubject] = useState("");
  const [msgBody, setMsgBody] = useState("");
  const [msgFrom, setMsgFrom] = useState("");
  const [msgEmail, setMsgEmail] = useState("");
  const [msgPhone, setMsgPhone] = useState("");
  const [sending, setSending] = useState(false);

  // Request form state — location-level only, no units.
  const [reqDescription, setReqDescription] = useState("");
  const [reqPest, setReqPest] = useState("");
  const [reqLocation, setReqLocation] = useState("");
  const [reqPhotos, setReqPhotos] = useState<string[]>([]);
  const [uploadingReqPhoto, setUploadingReqPhoto] = useState(false);
  const [submittingRequest, setSubmittingRequest] = useState(false);

  const uploadRequestPhotos = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploadingReqPhoto(true);
    const urls: string[] = [];
    for (const file of Array.from(files)) {
      if (!file.type.startsWith("image/")) continue;
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
      const path = `pest-sightings/${propertyId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error: upErr } = await supabase.storage.from("report-images").upload(path, file, {
        contentType: file.type || "image/jpeg", upsert: false,
      });
      if (upErr) { toast({ title: "Upload failed", description: upErr.message, variant: "destructive" }); continue; }
      const { data: pub } = supabase.storage.from("report-images").getPublicUrl(path);
      if (pub?.publicUrl) urls.push(pub.publicUrl);
    }
    if (urls.length) setReqPhotos((p) => [...p, ...urls]);
    setUploadingReqPhoto(false);
  };

  const loadAll = async () => {
    const [{ data: prop }, { data: svcs }, { data: reqs }, { data: dx }] = await Promise.all([
      supabase.from("portal_properties").select("*").eq("id", propertyId).maybeSingle(),
      supabase.from("portal_services").select("*").eq("property_id", propertyId).order("service_date", { ascending: false }),
      supabase.from("portal_requests").select("*").eq("property_id", propertyId).order("created_at", { ascending: false }),
      supabase.from("portal_documents").select("*").eq("property_id", propertyId).order("created_at", { ascending: false }),
    ]);
    if (prop) setProperty(prop as any);
    if (Array.isArray(svcs)) setServices(svcs as any);
    if (Array.isArray(reqs)) setRequests(reqs as any);
    if (Array.isArray(dx)) setDocs(dx as any);
    setLoading(false);
  };

  useEffect(() => {
    loadAll();
    const channel = supabase
      .channel(`commercial-portal-${propertyId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "portal_services", filter: `property_id=eq.${propertyId}` }, () => loadAll())
      .on("postgres_changes", { event: "*", schema: "public", table: "portal_requests", filter: `property_id=eq.${propertyId}` }, () => loadAll())
      .on("postgres_changes", { event: "*", schema: "public", table: "portal_properties", filter: `id=eq.${propertyId}` }, () => loadAll())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyId]);

  // Classification is STATUS-ONLY (mirrors CommercialDashboardView). A
  // scheduled visit must never appear as a completed/past report just
  // because a service_date was typed in — only "Mark Serviced" moves it.
  // Cancelled visits stay visible under Past (badged) so their history
  // doesn't silently vanish from the customer's view.
  const past = services
    .filter(s => s.status === "completed" || s.status === "cancelled")
    .sort((a, b) => (b.service_date || "").localeCompare(a.service_date || ""));
  const upcoming = services
    .filter(s => s.status === "scheduled")
    .sort((a, b) => (a.service_date || "").localeCompare(b.service_date || ""));
  const mapUrl = property?.map_image_url || property?.image_url || null;

  // Recent Pest Sightings (Open + In-Progress) — surfaced at the top of
  // every visit so the Route Manager / customer sees what's outstanding.
  const recentSightings = requests.filter(r => {
    const status = ((r as any).sighting_status || r.status || "").toLowerCase();
    return status !== "closed" && status !== "completed" && status !== "cancelled";
  });

  // Carry-forward: every non-Closed condition across ALL services follows the
  // upcoming report until a Route Manager closes it. Closed conditions only
  // appear in the Conditions tab history.
  const activeConditionsAll = services.flatMap(s => {
    const rd: any = (s as any).report_data || {};
    const rows: any[] = Array.isArray(rd.conditions) ? rd.conditions : [];
    return rows.filter((c: any) => c && c.status !== "Closed");
  });

  // Build the scope of work — service types we've actually got on this
  // property, falling back to any commercial-specific defaults we know.
  const scopeTypes = Array.from(new Set(services.map(s => s.service_type).filter(Boolean)));

  const sendMessage = async () => {
    if (!msgSubject.trim() || !msgBody.trim()) {
      toast({ title: "Add a subject and message", variant: "destructive" });
      return;
    }
    setSending(true);
    try {
      const { error } = await supabase.from("portal_messages").insert({
        client_id: property?.client_id || null,
        link_id: linkId,
        sender_type: "client",
        sender_name: msgFrom.trim() || "Commercial Portal",
        sender_email: msgEmail.trim() || null,
        property_name: property?.name || null,
        subject: msgSubject.trim(),
        message: [
          msgBody.trim(),
          msgPhone.trim() ? `\nCallback: ${msgPhone.trim()}` : "",
        ].filter(Boolean).join(""),
      } as any);
      if (error) throw error;
      try {
        await supabase.functions.invoke("send-portal-message", {
          body: {
            propertyName: property?.name || "Commercial Portal",
            subject: msgSubject.trim(),
            message: msgBody.trim(),
            senderName: msgFrom.trim() || "Commercial Portal",
            senderEmail: msgEmail.trim() || null,
            senderPhone: msgPhone.trim() || null,
          },
        });
      } catch { /* non-fatal */ }
      toast({ title: "Message sent", description: "We'll be in touch shortly." });
      setMsgSubject(""); setMsgBody(""); setMsgPhone("");
    } catch (e: any) {
      toast({ title: "Couldn't send", description: e?.message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  const submitRequest = async () => {
    if (!reqDescription.trim()) {
      toast({ title: "Add a description", variant: "destructive" });
      return;
    }
    if (uploadingReqPhoto) {
      toast({ title: "Hang on — photos still uploading…" });
      return;
    }
    setSubmittingRequest(true);
    try {
      const { error } = await supabase.from("portal_requests").insert({
        property_id: propertyId,
        link_id: linkId,
        request_type: "Service Request",
        description: reqDescription.trim(),
        pest_type: reqPest.trim() || null,
        location_type: reqLocation.trim() || null,
        status: "pending",
        photos: reqPhotos,
      } as any);
      if (error) throw error;
      // Notify office (non-fatal).
      try {
        await supabase.functions.invoke("send-portal-message", {
          body: {
            propertyName: property?.name || "Commercial Portal",
            subject: `New Service Request — ${property?.name || "Commercial"}`,
            message: [
              reqDescription.trim(),
              reqPest.trim() ? `\nPest: ${reqPest.trim()}` : "",
              reqLocation.trim() ? `\nArea: ${reqLocation.trim()}` : "",
              reqPhotos.length ? `\nPhotos attached: ${reqPhotos.length}` : "",
            ].filter(Boolean).join(""),
            senderName: "Commercial Portal",
          },
        });
      } catch { /* non-fatal */ }
      toast({ title: "Request submitted", description: "Our team will follow up shortly." });
      setReqDescription(""); setReqPest(""); setReqLocation(""); setReqPhotos([]);
      loadAll();
    } catch (e: any) {
      toast({ title: "Couldn't submit", description: e?.message, variant: "destructive" });
    } finally {
      setSubmittingRequest(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="h-8 w-8 rounded-full border-2 border-muted border-t-foreground animate-spin" />
      </div>
    );
  }

  if (!property) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-center">
        <p className="text-sm text-muted-foreground">Location not found.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-16">
      <div className="sticky top-0 z-30 bg-card border-b border-border shadow-sm">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <img src={crestLogo} alt="Crest Pest Control" className="h-8 w-auto" />
          <div className="flex-1 min-w-0">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold leading-tight">
              Customer Portal
            </p>
            <h1 className="text-base font-bold leading-tight truncate">{property.name}</h1>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-4 space-y-4">
        {/* Location summary — branded stat chips */}
        <Card className="border-2 border-primary/30 shadow-md bg-gradient-to-br from-primary/[0.06] to-transparent">
          <CardContent className="p-4 grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
            <div className="flex items-start gap-2.5">
              <div className="shrink-0 w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center">
                <MapPin className="w-4 h-4 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Location</p>
                <p className="font-semibold truncate">{property.address || "—"}</p>
              </div>
            </div>
            <div className="flex items-start gap-2.5">
              <div className="shrink-0 w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center">
                <Calendar className="w-4 h-4 text-primary" />
              </div>
              <div>
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Last Visit</p>
                <p className="font-semibold">{past[0] ? fmtDate(past[0].service_date) : "—"}</p>
              </div>
            </div>
            <div className="flex items-start gap-2.5">
              <div className="shrink-0 w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center">
                <Clock className="w-4 h-4 text-primary" />
              </div>
              <div>
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Next Visit</p>
                <p className="font-semibold">{upcoming[0] ? fmtDate(upcoming[0].service_date) : "—"}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Tabs defaultValue="property" className="w-full">
          {/* IDENTICAL tab set + order + labels + STYLING as the Route Manager
              dashboard (CommercialDashboardView) so the two portals read as
              the same product. Change one, change the other. */}
          <TabsList className="sticky top-0 z-30 w-full h-auto p-1.5 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-1.5 bg-background/95 backdrop-blur border-2 border-primary/60 rounded-xl shadow-md">
            <TabsTrigger value="property" className="bg-muted/70 hover:bg-muted border border-border/70 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:border-primary data-[state=active]:shadow-md font-semibold text-xs lg:text-sm whitespace-normal text-center leading-tight px-2 py-3 rounded-lg transition-all flex flex-col items-center justify-center gap-1">
              <MapPin className="w-5 h-5" />
              <span>Site Map, Plan &amp; Team</span>
            </TabsTrigger>
            <TabsTrigger value="past" className="bg-muted/70 hover:bg-muted border border-border/70 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:border-primary data-[state=active]:shadow-md font-semibold text-xs lg:text-sm whitespace-normal text-center leading-tight px-2 py-3 rounded-lg transition-all flex flex-col items-center justify-center gap-1">
              <Calendar className="w-5 h-5" />
              <span>Previous Services <Badge variant="secondary" className="ml-1 text-xs h-4">{past.length}</Badge></span>
            </TabsTrigger>
            <TabsTrigger value="requests" className="bg-muted/70 hover:bg-muted border border-border/70 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:border-primary data-[state=active]:shadow-md font-semibold text-xs lg:text-sm whitespace-normal text-center leading-tight px-2 py-3 rounded-lg transition-all flex flex-col items-center justify-center gap-1">
              <ClipboardList className="w-5 h-5" />
              <span>Pest Sightings <Badge variant="secondary" className="ml-1 text-xs h-4">{recentSightings.length}</Badge></span>
            </TabsTrigger>
            <TabsTrigger value="upcoming" className="bg-muted/70 hover:bg-muted border border-border/70 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:border-primary data-[state=active]:shadow-md font-semibold text-xs lg:text-sm whitespace-normal text-center leading-tight px-2 py-3 rounded-lg transition-all flex flex-col items-center justify-center gap-1">
              <Clock className="w-5 h-5" />
              <span>Upcoming Services <Badge variant="secondary" className="ml-1 text-xs h-4">{upcoming.length}</Badge></span>
            </TabsTrigger>
            <TabsTrigger value="conditions" className="bg-muted/70 hover:bg-muted border border-border/70 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:border-primary data-[state=active]:shadow-md font-semibold text-xs lg:text-sm whitespace-normal text-center leading-tight px-2 py-3 rounded-lg transition-all flex flex-col items-center justify-center gap-1">
              <AlertTriangle className="w-5 h-5" />
              <span>
                Conditions
                {activeConditionsAll.length > 0 && (
                  <Badge variant="secondary" className="ml-1 text-xs h-4">{activeConditionsAll.length}</Badge>
                )}
              </span>
            </TabsTrigger>
            <TabsTrigger value="materials" className="bg-muted/70 hover:bg-muted border border-border/70 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:border-primary data-[state=active]:shadow-md font-semibold text-xs lg:text-sm whitespace-normal text-center leading-tight px-2 py-3 rounded-lg transition-all flex flex-col items-center justify-center gap-1">
              <FlaskIcon className="w-5 h-5" />
              <span>Safety Data Sheets</span>
            </TabsTrigger>
            <TabsTrigger value="help" className="bg-muted/70 hover:bg-muted border border-border/70 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:border-primary data-[state=active]:shadow-md font-semibold text-xs lg:text-sm whitespace-normal text-center leading-tight px-2 py-3 rounded-lg transition-all flex flex-col items-center justify-center gap-1">
              <HelpCircle className="w-5 h-5" />
              <span>Help</span>
            </TabsTrigger>
          </TabsList>

          {/* ─── UPCOMING SERVICES ─── */}
          <TabsContent value="upcoming" className="space-y-4 mt-3">
            {/* Upcoming */}
            <Card className="border-2 border-primary/30 bg-primary/[0.03]">
              <CardContent className="p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-primary flex items-center gap-1.5">
                    <Clock className="w-3 h-3" /> Upcoming Services
                  </p>
                  <Badge variant="secondary" className="text-[10px]">{upcoming.length}</Badge>
                </div>
                {upcoming.length === 0 ? (
                  <p className="p-3 text-center text-sm text-muted-foreground">
                    No upcoming visits scheduled.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {upcoming.slice(0, 12).map(s => {
                      const rd: any = (s as any).report_data || {};
                      const targetPests: string[] = Array.isArray(rd.target_pests) ? rd.target_pests : [];
                      const upProducts = normalizeUsageList(s.products_used);
                      const equipment: any[] = Array.isArray(rd.non_chem_equipment) ? rd.non_chem_equipment : [];
                      // Upcoming report carries EVERY open condition on the
                      // property forward, PLUS this visit's own legacy
                      // concerns (old data shape) so neither hides the other.
                      const legacyConcerns: any[] = Array.isArray(rd.concerns) ? rd.concerns : [];
                      const conditions: any[] = [...activeConditionsAll, ...legacyConcerns];
                      const photos: any[] = Array.isArray(s.photos) ? s.photos : [];
                      // Include any sighting resolved on this visit's date so the
                      // report where it got closed keeps a record of it.
                      const svcDate = (s.service_date || "").toString().slice(0, 10);
                      const closedOnThisDate = requests.filter((r: any) => {
                        const st = ((r as any).sighting_status || r.status || "").toLowerCase();
                        const isClosed = st === "closed" || st === "completed" || st === "cancelled";
                        if (!isClosed) return false;
                        if ((r as any).resolved_service_id) return (r as any).resolved_service_id === s.id;
                        const closedAt = (r.closed_at || r.updated_at || "").toString().slice(0, 10);
                        return svcDate && closedAt === svcDate;
                      });
                      const sightingsForService = [
                        ...recentSightings,
                        ...closedOnThisDate.filter((r: any) => !recentSightings.find((o: any) => o.id === r.id)),
                      ];
                      // Every report section renders only when it has content;
                      // when ALL are empty, say so instead of showing a bare card.
                      const hasReportContent =
                        sightingsForService.length > 0 || !!s.special_notes || !!s.summary ||
                        targetPests.length > 0 || upProducts.length > 0 ||
                        equipment.length > 0 || conditions.length > 0 || photos.length > 0;
                      return (
                        <Card key={s.id} className="border-border">
                          <CardContent className="p-3 space-y-3">
                            {/* Header */}
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="font-bold text-sm truncate">{s.service_type}</p>
                                <p className="text-xs text-muted-foreground">
                                  {fmtDate(s.service_date)}
                                  {s.service_time && ` • ${s.service_time}`}
                                  {s.technician && ` • ${s.technician}`}
                                </p>
                              </div>
                              <Badge variant="secondary" className="text-[10px] shrink-0">Scheduled</Badge>
                            </div>

                            {!hasReportContent && (
                              <p className="text-xs italic text-muted-foreground border border-dashed border-border rounded-md p-2.5">
                                Your service report will appear here as our team prepares this
                                visit — target pests, products, equipment, active conditions,
                                and photos all show up the moment they're added.
                              </p>
                            )}

                            {/* 2. Service Notes / Prep */}
                            {(s.special_notes || s.summary) && (
                              <div>
                                <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground mb-0.5">Service Notes</p>
                                {s.special_notes && <p className="text-sm whitespace-pre-wrap leading-relaxed">{s.special_notes}</p>}
                                {s.summary && <p className="text-sm whitespace-pre-wrap leading-relaxed">{s.summary}</p>}
                              </div>
                            )}

                            {/* 3. Target Pests */}
                            {targetPests.length > 0 && (
                              <div>
                                <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground mb-1">Target Pests</p>
                                <div className="flex flex-wrap gap-1.5">
                                  {targetPests.map((p, i) => (
                                    <Badge key={`${p}-${i}`} variant="secondary" className="text-[11px]">{p}</Badge>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* 4. Product Used */}
                            {upProducts.length > 0 && (
                              <div>
                                <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground mb-1 flex items-center gap-1">
                                  <FlaskConical className="w-3 h-3" /> Product Used
                                </p>
                                <ProductUsageSummary entries={upProducts} />
                              </div>
                            )}

                            {/* 5. Equipment Used */}
                            {equipment.length > 0 && (
                              <div>
                                <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground mb-1 flex items-center gap-1">
                                  <Wrench className="w-3 h-3" /> Equipment Used
                                </p>
                                <div className="flex flex-wrap gap-1.5">
                                  {equipment.map((e: any, i: number) => (
                                    <Badge key={i} variant="outline" className="text-[11px]">
                                      {e?.name || String(e)}{e?.qty ? ` × ${e.qty}` : ""}
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* 6. Active Conditions — SAME rich cards as the
                                Route Manager dashboard (badges, photos, dates),
                                carry-forward pool across all services. */}
                            {/* Active Pest Sightings — moved next to Active
                                Conditions so the customer sees both open items
                                together. Read-only: Crest resolves these. */}
                            {sightingsForService.length > 0 && (
                              <div>
                                <div className="mb-2 flex items-center gap-2 flex-wrap rounded-md bg-gradient-to-r from-amber-200 to-amber-100 border-l-4 border-amber-500 px-3 py-2 shadow-sm">
                                  <AlertTriangle className="w-4 h-4 text-amber-700" />
                                  <h4 className="text-sm font-black uppercase tracking-wider text-amber-950">Pest Sightings</h4>
                                  <Badge variant="outline" className="text-[10px] border-amber-500 text-amber-950 bg-white/70">
                                    {recentSightings.length} being resolved
                                  </Badge>
                                  {closedOnThisDate.length > 0 && (
                                    <Badge variant="outline" className="text-[10px] border-green-400 text-green-900 bg-green-50">
                                      {closedOnThisDate.length} resolved this visit
                                    </Badge>
                                  )}
                                </div>
                                <div className="rounded-md border-2 border-amber-300 bg-amber-50/60 p-2 space-y-1.5">
                                  <p className="text-[11px] italic text-amber-800">
                                    Crest is resolving these. They'll drop off once closed.
                                  </p>
                                  {sightingsForService.map((sg: any) => {
                                    const status = (((sg as any).sighting_status as string) || (sg.status === "in_progress" ? "in_progress" : sg.status === "completed" || sg.status === "cancelled" ? "closed" : "open"));
                                    const isResolved = status === "closed";
                                    const sgPhotos: string[] = Array.isArray(sg.photos)
                                      ? sg.photos.map((p: any) => (typeof p === "string" ? p : p?.url)).filter(Boolean)
                                      : [];
                                    return (
                                      <div key={sg.id} className={`rounded-md border p-2 ${isResolved ? "border-green-300 bg-green-50/50" : "border-amber-300 bg-background"}`}>
                                        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2">
                                          <div className="min-w-0">
                                            <div className="flex items-start justify-between gap-2">
                                              <p className="text-sm font-semibold text-foreground">
                                                {sg.pest_type || sg.request_type}
                                                {sg.location_type && <span className="text-xs font-normal text-muted-foreground"> · {sg.location_type}</span>}
                                              </p>
                                              {isResolved && (
                                                <Badge variant="outline" className="text-[10px] border-green-300 text-green-900 bg-green-50 shrink-0">
                                                  Resolved
                                                </Badge>
                                              )}
                                            </div>
                                            {sg.description && (
                                              <p className="text-xs text-muted-foreground leading-snug mt-0.5 whitespace-pre-wrap">{sg.description}</p>
                                            )}
                                            {isResolved && sg.response_notes && (
                                              <p className="text-xs text-green-900 leading-snug mt-1 whitespace-pre-wrap"><span className="font-semibold">Crest response:</span> {sg.response_notes}</p>
                                            )}
                                          </div>
                                          {sgPhotos.length > 0 && (
                                            <div className="sm:w-24 shrink-0 grid grid-cols-2 sm:grid-cols-1 gap-1">
                                              {sgPhotos.slice(0, 3).map((url, i) => (
                                                <a key={i} href={url} target="_blank" rel="noopener noreferrer"
                                                  className="block w-full aspect-square rounded border border-border overflow-hidden bg-muted/30">
                                                  <img src={url} alt={`Sighting ${i + 1}`} loading="lazy" className="w-full h-full object-cover" />
                                                </a>
                                              ))}
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                            {conditions.length > 0 && (
                              <div>
                                <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground mb-1 flex items-center gap-1">
                                  <AlertTriangle className="w-3 h-3" /> Active Conditions
                                </p>
                                <ConditionCardsReadOnly services={services as any} />
                                {legacyConcerns.length > 0 && (
                                  <ul className="space-y-1.5 mt-1.5">
                                    {legacyConcerns.map((c: any, i: number) => (
                                      <li key={i} className="text-sm bg-muted/40 rounded-md p-2 border border-border/60">
                                        <p className="font-semibold">{c.condition || c.name || c.area || "Condition"}</p>
                                        {c.detail && <p className="text-xs text-muted-foreground mt-0.5">{c.detail}</p>}
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </div>
                            )}

                            {/* 7. Other Property Images */}
                            {photos.length > 0 && (
                              <div>
                                <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground mb-1 flex items-center gap-1">
                                  <Camera className="w-3 h-3" /> Other Property Images
                                </p>
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                  {photos.map((p: any, i: number) => {
                                    const url = typeof p === "string" ? p : p?.url;
                                    if (!url) return null;
                                    return (
                                      <a key={i} href={url} target="_blank" rel="noopener noreferrer"
                                        className="block w-full aspect-[4/3] rounded-md border border-border overflow-hidden bg-muted/30">
                                        <img src={url} alt={`Photo ${i + 1}`} loading="lazy" className="w-full h-full object-contain" />
                                      </a>
                                    );
                                  })}
                                </div>
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

          </TabsContent>

          {/* ─── PREVIOUS SERVICES ─── */}
          <TabsContent value="past" className="space-y-4 mt-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                <ClipboardList className="w-3 h-3" /> Previous Services
              </p>
              {past.length === 0 ? (
                <Card><CardContent className="p-4 text-center text-sm text-muted-foreground">
                  No past visits yet.
                </CardContent></Card>
              ) : (
                <div className="space-y-2">
                  {past.slice(0, 30).map(s => {
                    const isOpen = openServiceId === s.id;
                    const products = normalizeUsageList(s.products_used);
                    const hasFollowUp = !!s.follow_up_recommended;
                    const photos: any[] = Array.isArray(s.photos) ? s.photos : [];
                    return (
                     <Card key={s.id}>
                        <CardContent className="p-0">
                          <button
                            type="button"
                            onClick={() => setOpenServiceId(isOpen ? null : s.id)}
                            className="w-full flex items-center justify-between gap-2 px-3 py-3 text-left hover:bg-muted/40 transition-colors"
                          >
                            <div className="min-w-0">
                              <p className="font-bold text-sm truncate">{s.service_type}</p>
                              <p className="text-xs text-muted-foreground">
                                {fmtDate(s.service_date)}{s.technician && ` • ${s.technician}`}
                              </p>
                            </div>
                            {s.status === "cancelled" && (
                              <Badge variant="outline" className="text-[10px] shrink-0 border-red-300 text-red-900 bg-red-50">
                                Cancelled
                              </Badge>
                            )}
                            <ChevronDown className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                          </button>
                          {isOpen && (() => {
                            const rd: any = (s as any).report_data || {};
                            const targetPests: string[] = Array.isArray(rd.target_pests) ? rd.target_pests : [];
                            const equipment: any[] = Array.isArray(rd.non_chem_equipment) ? rd.non_chem_equipment : [];
                            const conditions: any[] = Array.isArray(rd.conditions)
                              ? rd.conditions.filter((c: any) => c && c.status !== "Closed")
                              : (Array.isArray(rd.concerns) ? rd.concerns : []);
                            return (
                            <div className="px-3 pb-3 pt-1 space-y-3 border-t border-border/60">
                              {/* Conditions logged during THIS past visit — pinned at
                                  the top so the visit's most important record leads. */}
                              {(() => {
                                const ownedRows: any[] = Array.isArray(rd.conditions) ? rd.conditions : [];
                                const resolvedHere: any[] = services.flatMap((os: any) => {
                                  const rs = Array.isArray(os.report_data?.conditions) ? os.report_data.conditions : [];
                                  return rs.filter((c: any) => c && c.status === "Closed" && c.closed_on_service_id === s.id);
                                });
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
                                        <div key={c.id || i} className="text-xs text-red-950 leading-snug">
                                          <span className="font-semibold">{c.condition || c.name || c.area || "Condition"}</span>
                                          {c.area && c.condition && <span className="text-red-800"> · {c.area}</span>}
                                          {c.detail && <span> — {c.detail}</span>}
                                          {c.status && (
                                            <Badge variant="outline" className="ml-1 text-[9px] border-red-300 text-red-900 bg-white/60">{c.status}</Badge>
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
                                        <div key={c.id || i} className="text-xs text-green-950 leading-snug">
                                          <span className="font-semibold">{c.condition || c.name || c.area || "Condition"}</span>
                                          {c.area && c.condition && <span className="text-green-800"> · {c.area}</span>}
                                          {c.detail && <span> — {c.detail}</span>}
                                          <Badge variant="outline" className="ml-1 text-[9px] border-green-300 text-green-900 bg-white/70">Closed</Badge>
                                          {c.response_notes && (
                                            <div className="text-[11px] text-green-900 mt-0.5"><span className="font-semibold">Crest response:</span> {c.response_notes}</div>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                                </>
                                );
                              })()}

                              {/* Sightings resolved during THIS past visit. */}
                              {(() => {
                                const svcDate = (s.service_date || "").toString().slice(0, 10);
                                const resolvedHere = requests.filter((r: any) => {
                                  const st = ((r as any).sighting_status || r.status || "").toLowerCase();
                                  const isClosed = st === "closed" || st === "completed" || st === "cancelled";
                                  if (!isClosed) return false;
                                  if ((r as any).resolved_service_id) return (r as any).resolved_service_id === s.id;
                                  const closedAt = (r.closed_at || r.updated_at || "").toString().slice(0, 10);
                                  return svcDate && closedAt === svcDate;
                                });
                                if (resolvedHere.length === 0) return null;
                                return (
                                  <div className="rounded-md border-2 border-green-300 bg-green-50/60 p-2 space-y-1">
                                    <p className="text-[11px] font-bold uppercase tracking-wide text-green-900 flex items-center gap-1">
                                      <AlertTriangle className="w-3 h-3" /> Pest Sightings Resolved This Visit
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

                              {/* 2. Service Notes (summary + findings + notes) */}
                              {(s.summary || s.findings || s.notes) && (
                                <div>
                                  <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground mb-0.5">Service Notes</p>
                                  <div className="space-y-1.5">
                                    {s.summary && <p className="text-sm whitespace-pre-wrap leading-relaxed">{s.summary}</p>}
                                    {s.findings && <p className="text-sm whitespace-pre-wrap leading-relaxed">{s.findings}</p>}
                                    {s.notes && <p className="text-sm whitespace-pre-wrap leading-relaxed">{s.notes}</p>}
                                  </div>
                                </div>
                              )}

                              {/* 3. Target Pests */}
                              {targetPests.length > 0 && (
                                <div>
                                  <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground mb-1">Target Pests</p>
                                  <div className="flex flex-wrap gap-1.5">
                                    {targetPests.map((p, i) => (
                                      <Badge key={`${p}-${i}`} variant="secondary" className="text-[11px]">{p}</Badge>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {/* 4. Product Used */}
                              {products.length > 0 && (
                                <div>
                                  <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground mb-1 flex items-center gap-1">
                                    <FlaskConical className="w-3 h-3" /> Product Used
                                  </p>
                                  <ProductUsageSummary entries={products} />
                                </div>
                              )}

                              {/* 5. Equipment Used */}
                              {equipment.length > 0 && (
                                <div>
                                  <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground mb-1 flex items-center gap-1">
                                    <Wrench className="w-3 h-3" /> Equipment Used
                                  </p>
                                  <div className="flex flex-wrap gap-1.5">
                                    {equipment.map((e: any, i: number) => (
                                      <Badge key={i} variant="outline" className="text-[11px]">
                                        {e?.name || String(e)}{e?.qty ? ` × ${e.qty}` : ""}
                                      </Badge>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {/* Active Conditions intentionally omitted on
                                  Previous Services — see the dedicated
                                  Conditions tab for the single source of truth. */}

                              {/* 7. Other Property Images */}
                              {photos.length > 0 && (
                                <div>
                                  <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground mb-1 flex items-center gap-1">
                                    <Camera className="w-3 h-3" /> Other Property Images
                                  </p>
                                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                    {photos.map((p: any, i: number) => {
                                      const url = typeof p === "string" ? p : p?.url;
                                      if (!url) return null;
                                      return (
                                        <a key={i} href={url} target="_blank" rel="noopener noreferrer"
                                          className="block w-full aspect-[4/3] rounded-md border border-border overflow-hidden bg-muted/30">
                                          <img src={url} alt={`Photo ${i + 1}`} loading="lazy" className="w-full h-full object-contain" />
                                        </a>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}
                              <PesticideNotice />
                            </div>
                            );
                          })()}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>
          </TabsContent>

          {/* ─── SITE MAP ─── */}
          {/* ─── PROPERTY (site map + scope of work + team) — one tab, same
              grouping as the admin dashboard's "Site Map, Plan & Team" ─── */}
          <TabsContent value="property" className="space-y-3 mt-3">
            <Card>
              <CardContent className="p-3">
                {property.map_data || mapUrl ? (
                  <div className="w-full bg-background rounded-md overflow-hidden border border-border h-[45vh] min-h-[320px] md:h-[60vh] md:min-h-[380px]">
                    {property.map_data ? (
                      <ReadOnlyMapCanvas mapUrl={mapUrl || ""} mapData={property.map_data} imageFit="contain" />
                    ) : mapUrl ? (
                      <img src={mapUrl} alt="Site map" className="w-full h-full object-contain" />
                    ) : null}
                  </div>
                ) : (
                  <div className="text-center py-10 text-sm text-muted-foreground flex flex-col items-center gap-2">
                    <ImageIcon className="w-6 h-6 opacity-40" />
                    No site map uploaded yet.
                  </div>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 space-y-1">
                <p className="text-sm font-bold flex items-center gap-2"><Wrench className="w-4 h-4 text-primary" /> Scope of Work</p>
                <p className="text-xs text-muted-foreground">What's included on each visit at this location.</p>
              </CardContent>
            </Card>
            {scopeTypes.length === 0 ? (
              <Card><CardContent className="p-4 text-center text-sm text-muted-foreground">
                No services on file yet.
              </CardContent></Card>
            ) : (
              scopeTypes.map(type => {
                const bullets = COMMERCIAL_SERVICE_DESCRIPTIONS[type];
                return (
                  <Card key={type}>
                    <CardContent className="p-4 space-y-2">
                      <p className="font-bold text-sm">{type}</p>
                      {bullets ? (
                        <ul className="space-y-1.5 list-disc pl-5">
                          {bullets.map((b, i) => (
                            <li key={i} className="text-sm leading-relaxed text-muted-foreground">{b}</li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          Performed at this location on the regular service cadence. Reach out via the Help tab for details.
                        </p>
                      )}
                    </CardContent>
                  </Card>
                );
              })
            )}
            <BusinessLicenseSection docs={docs as any} />
          </TabsContent>

          {/* ─── REQUESTS ─── */}
          <TabsContent value="requests" className="space-y-3 mt-3">
            <Card className="border-2 border-amber-300/80 shadow-md overflow-hidden">
              <div className="bg-amber-100/70 border-b-2 border-amber-300/70 px-4 py-2.5 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-700" />
                <p className="text-sm font-bold text-amber-900">Report a Pest Sighting</p>
              </div>
              <CardContent className="p-4 space-y-3">
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Use this to report new pest activity or request an extra visit. Our team is
                  notified immediately and will follow up.
                </p>
                <div className="space-y-2">
                  <Select value={reqPest || ""} onValueChange={v => setReqPest(v === "__none__" ? "" : v)}>
                    <SelectTrigger className="h-11 text-base">
                      <SelectValue placeholder="Pest type (select)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">— Select pest —</SelectItem>
                      {COMMERCIAL_PEST_OPTIONS.map(p => (
                        <SelectItem key={p} value={p}>{p}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    placeholder="Area / location (e.g. kitchen, dish pit, patio)"
                    value={reqLocation}
                    onChange={e => setReqLocation(e.target.value)}
                    className="h-11 text-base"
                  />
                  <Textarea
                    placeholder="Describe what you're seeing…"
                    value={reqDescription}
                    onChange={e => setReqDescription(e.target.value)}
                    rows={4}
                    className="text-base"
                  />
                  <div className="rounded-md border border-dashed border-border bg-muted/30 p-2.5 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground flex items-center gap-1">
                        <Camera className="w-3 h-3" /> Photos
                        {reqPhotos.length > 0 && <Badge variant="secondary" className="ml-1 text-[10px] h-4">{reqPhotos.length}</Badge>}
                      </p>
                      <label className="inline-flex">
                        <input
                          type="file"
                          accept="image/*"
                          capture="environment"
                          multiple
                          className="hidden"
                          disabled={uploadingReqPhoto}
                          onChange={(e) => { uploadRequestPhotos(e.target.files); e.currentTarget.value = ""; }}
                        />
                        <span className="inline-flex items-center gap-1 h-9 px-3 rounded-md border border-border bg-background text-xs font-medium cursor-pointer hover:bg-muted">
                          <Upload className="w-3.5 h-3.5" />
                          {uploadingReqPhoto ? "Uploading…" : "Add Photo"}
                        </span>
                      </label>
                    </div>
                    {reqPhotos.length === 0 ? (
                      <p className="text-[11px] text-muted-foreground italic">
                        Optional — snap a photo of the pest or affected area to help us identify the issue.
                      </p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {reqPhotos.map((url, i) => (
                          <div key={url} className="relative w-24 aspect-[4/3] rounded-md border border-border overflow-hidden bg-muted group">
                            <img src={url} alt={`Photo ${i + 1}`} loading="lazy" className="w-full h-full object-contain" />
                            <button
                              type="button"
                              onClick={() => setReqPhotos(p => p.filter(u => u !== url))}
                              className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center"
                              aria-label="Remove photo"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <Button type="button" onClick={submitRequest} disabled={submittingRequest} className="w-full h-11 text-sm gap-2">
                  <Send className="w-4 h-4" />
                  {submittingRequest ? "Submitting…" : "Submit Request"}
                </Button>
              </CardContent>
            </Card>

            {(() => {
              // Closed if EITHER field says so — the dashboard historically
              // updated only `status` ("Mark Complete") while newer flows set
              // `sighting_status`; requiring just one keeps the two portals'
              // open/closed splits in agreement for legacy rows too.
              const isClosed = (r: RequestData) => {
                const ss = (r.sighting_status || "").toLowerCase();
                const st = (r.status || "").toLowerCase();
                return ss === "closed" || st === "completed" || st === "cancelled";
              };
              const openReqs = requests.filter(r => !isClosed(r));
              const closedReqs = requests.filter(isClosed);
              const responseFor = (r: RequestData) => {
                const comments: any[] = Array.isArray(r.crest_comments) ? r.crest_comments : [];
                const last = comments.length ? comments[comments.length - 1] : null;
                return last?.note || last?.text || r.response_notes || "";
              };
              const fmtShort = (iso: string) =>
                new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
              return (
                <>
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                      <FileText className="w-3 h-3" /> Active Pest Sightings
                      {openReqs.length > 0 && (
                        <Badge variant="outline" className="ml-1 text-[10px] border-amber-300 text-amber-900 bg-amber-50">
                          {openReqs.length}
                        </Badge>
                      )}
                    </p>
                    {openReqs.length === 0 ? (
                      <Card><CardContent className="p-4 text-center text-sm text-muted-foreground">
                        No open requests.
                      </CardContent></Card>
                    ) : (
                      <div className="space-y-2">
                        {openReqs.slice(0, 20).map(r => (
                          <Card key={r.id} className="border-amber-300/70 border-2">
                            <CardContent className="p-3 space-y-1.5">
                              <div className="flex items-center justify-between gap-2">
                                <p className="font-bold text-sm truncate">
                                  {r.pest_type || r.request_type}
                                  {r.location_type ? ` — ${r.location_type}` : ""}
                                </p>
                                <Badge
                                  variant={REQUEST_STATUS_VARIANT[r.status] || "secondary"}
                                  className="text-[10px] capitalize shrink-0"
                                >
                                  {(r.sighting_status || r.status || "").replace("_", " ") || "open"}
                                </Badge>
                              </div>
                              <p className="text-xs text-muted-foreground">Reported {fmtShort(r.created_at)}</p>
                              {r.description && (
                                <p className="text-sm whitespace-pre-wrap leading-relaxed">{r.description}</p>
                              )}
                              {responseFor(r) && (
                                <div className="mt-1 pt-1.5 border-t border-border/60">
                                  <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground mb-0.5">Response from Crest</p>
                                  <p className="text-sm whitespace-pre-wrap leading-relaxed">{responseFor(r)}</p>
                                </div>
                              )}
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    )}
                  </div>

                  {closedReqs.length > 0 && (
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                        <FileText className="w-3 h-3" /> Resolved Pest Sightings
                        <Badge variant="outline" className="ml-1 text-[10px] border-emerald-300 text-emerald-900 bg-emerald-50">
                          {closedReqs.length}
                        </Badge>
                      </p>
                      <div className="space-y-2">
                        {closedReqs.slice(0, 20).map(r => (
                          <Card key={r.id} className="opacity-80">
                            <CardContent className="p-3 space-y-1.5">
                              <div className="flex items-center justify-between gap-2">
                                <p className="font-bold text-sm truncate">
                                  {r.pest_type || r.request_type}
                                  {r.location_type ? ` — ${r.location_type}` : ""}
                                </p>
                                <Badge variant="outline" className="text-[10px] shrink-0 border-emerald-300 text-emerald-900 bg-emerald-50">
                                  Closed
                                </Badge>
                              </div>
                              <p className="text-xs text-muted-foreground">
                                Reported {fmtShort(r.created_at)}
                                {r.closed_at ? ` · Closed ${fmtShort(r.closed_at)}` : ""}
                              </p>
                              {r.description && (
                                <p className="text-sm whitespace-pre-wrap leading-relaxed">{r.description}</p>
                              )}
                              {responseFor(r) && (
                                <div className="rounded-md border border-emerald-300 bg-emerald-50/60 p-2">
                                  <p className="text-[11px] font-bold uppercase tracking-wide text-emerald-900 mb-0.5">Crest Response</p>
                                  <p className="text-sm text-emerald-950 whitespace-pre-wrap leading-relaxed">{responseFor(r)}</p>
                                </div>
                              )}
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              );
            })()}
          </TabsContent>

          {/* ─── CONDITIONS (read-only) ─── */}
          <TabsContent value="conditions" className="mt-3">
            <ConditionsReportSection services={services as any} readOnly />
          </TabsContent>

          {/* ─── SAFETY DATA SHEETS ─── */}
          <TabsContent value="materials" className="mt-3 space-y-6">
            <CommercialApprovedMaterials />
          </TabsContent>

          {/* ─── HELP (FAQ + contact form in one place) ─── */}
          <TabsContent value="help" className="space-y-3 mt-3">
            <HelpTutorialSection />
            <Card>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Phone className="w-4 h-4 text-primary" />
                  <p className="text-sm font-bold">Need something faster?</p>
                </div>
                <a href="tel:9494245000" className="block w-full bg-primary text-primary-foreground rounded-lg py-3 px-4 text-center font-semibold text-sm shadow-sm active:opacity-90">
                  Call Crest — (949) 424-5000
                </a>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-primary" />
                  <p className="text-sm font-bold">Send Crest a Message</p>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  For service questions, scheduling tweaks, or anything you'd like our office to know.
                </p>
                <div className="space-y-2">
                  <Input placeholder="Your name" value={msgFrom} onChange={e => setMsgFrom(e.target.value)} className="h-11 text-base" />
                  <Input type="email" placeholder="Your email (optional)" value={msgEmail} onChange={e => setMsgEmail(e.target.value)} className="h-11 text-base" autoComplete="email" inputMode="email" />
                  <Input type="tel" placeholder="Callback phone (optional)" value={msgPhone} onChange={e => setMsgPhone(e.target.value)} className="h-11 text-base" autoComplete="tel" inputMode="tel" />
                  <Input placeholder="Subject" value={msgSubject} onChange={e => setMsgSubject(e.target.value)} className="h-11 text-base" />
                  <Textarea placeholder="Your message" value={msgBody} onChange={e => setMsgBody(e.target.value)} rows={5} className="text-base" />
                </div>
                <Button type="button" onClick={sendMessage} disabled={sending} className="w-full h-11 text-sm gap-2">
                  <Send className="w-4 h-4" />
                  {sending ? "Sending…" : "Send Message"}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
