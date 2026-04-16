import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  ChevronDown, ChevronRight, Calendar, MapPin, Plus, Edit, Trash2,
  CheckCircle, AlertTriangle, Clock, Wrench, Image, ExternalLink,
  Copy, Users, FileText, Send, X, Flag, ClipboardList
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { ReadOnlyMapCanvas } from "@/components/ReadOnlyMapCanvas";
import { MapCanvas } from "@/components/MapCanvas";

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
const PREFERENCE_OPTIONS = ["Green / Eco-Friendly Products", "Standard Products", "No Preference", "Interior Treatment Only", "Exterior Treatment Only"];
const PEST_TYPES = ["Ants", "Spiders", "American Roaches", "German Cockroaches", "Crickets", "Earwigs", "Rodents", "Bed Bugs", "Fleas", "Mosquitoes", "Wasps", "Silverfish", "Other"];

const SERVICE_FREQUENCY_MAP: Record<string, number> = {
  "Commercial General Pest Control": 30,
  "General Pest Control": 30,
  "Mosquito Service": 30,
  "Rodent Bait Boxes": 30,
  "Dewebbing": 30,
};

interface Props {
  property: PortalProperty;
  services: PortalService[];
  links: PortalLink[];
  viewMode: "admin" | "pm" | "tenant";
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
  onDeleteLink?: (id: string) => void;
  onAddUpcomingService?: () => void;
  onCreateTenantLink?: () => void;
}

const today = new Date().toISOString().split("T")[0];

// ─── Helper: Generate upcoming dates from last service ───
const generateUpcomingDates = (lastDate: string, frequencyDays: number, count: number): string[] => {
  const dates: string[] = [];
  let d = new Date(lastDate + "T00:00:00");
  for (let i = 0; i < count; i++) {
    d = new Date(d.getTime() + frequencyDays * 86400000);
    dates.push(d.toISOString().split("T")[0]);
  }
  return dates;
};

// ─── Main Component ───
const PropertyDashboard = ({
  property, services, links, viewMode, clientName, clientId,
  onRefresh, onOpenServiceReport, onEditService, onDeleteService,
  onUpdatePropertyImage, uploadingPropertyImage,
  onCopyLink, onOpenPortal, onDeleteLink, onAddUpcomingService, onCreateTenantLink,
}: Props) => {
  const [pastViewMode, setPastViewMode] = useState<"date" | "unit">("date");
  const [expandedPastId, setExpandedPastId] = useState<string | null>(null);
  const [expandedUpcomingId, setExpandedUpcomingId] = useState<string | null>(null);
  const [completingServiceId, setCompletingServiceId] = useState<string | null>(null);
  const [followUpUnits, setFollowUpUnits] = useState<string[]>([]);
  const [showWorkOrder, setShowWorkOrder] = useState(false);
  const [workOrder, setWorkOrder] = useState({ unit_number: "", pest_type: "", location_type: "Interior", comments: "" });

  const propServices = services.filter(s => s.property_id === property.id);
  const pastServices = propServices
    .filter(s => s.status === "completed" || (s.service_date && s.service_date <= today))
    .sort((a, b) => (b.service_date || "").localeCompare(a.service_date || ""));
  const scheduledServices = propServices
    .filter(s => s.status === "scheduled" && (!s.service_date || s.service_date > today))
    .sort((a, b) => (a.service_date || "").localeCompare(b.service_date || ""));

  // Auto-populate upcoming: find most recent recurring service, generate future dates
  const projectedUpcoming = (() => {
    if (scheduledServices.length > 0) return []; // already have scheduled services
    const lastRecurring = pastServices.find(s => {
      const freq = (s as any).frequency_days || SERVICE_FREQUENCY_MAP[s.service_type];
      return freq && freq > 0;
    });
    if (!lastRecurring || !lastRecurring.service_date) return [];
    const freq = (lastRecurring as any).frequency_days || SERVICE_FREQUENCY_MAP[lastRecurring.service_type] || 30;
    const dates = generateUpcomingDates(lastRecurring.service_date, freq, 5);
    return dates.map((d, i) => ({
      id: `projected-${i}`,
      isProjected: true,
      service_date: d,
      service_type: lastRecurring.service_type,
      technician: lastRecurring.technician,
      status: "scheduled",
      units_planned: lastRecurring.units_planned,
      property_id: property.id,
    }));
  })();

  const allUpcoming = [
    ...scheduledServices.map(s => ({ ...s, isProjected: false })),
    ...projectedUpcoming,
  ].sort((a, b) => (a.service_date || "").localeCompare(b.service_date || ""));

  // Auto-expand first items
  useEffect(() => {
    if (pastServices.length > 0 && !expandedPastId) setExpandedPastId(pastServices[0].id);
    if (allUpcoming.length > 0 && !expandedUpcomingId) setExpandedUpcomingId(allUpcoming[0].id);
  }, [property.id]);

  // Get all unit numbers from past services
  const allUnits = (() => {
    const units = new Set<string>();
    pastServices.forEach(s => {
      if (Array.isArray(s.unit_details)) {
        (s.unit_details as any[]).forEach(u => { if (u.unit_number) units.add(u.unit_number); });
      }
    });
    // Also from units_planned
    propServices.forEach(s => {
      if (Array.isArray(s.units_planned)) {
        (s.units_planned as string[]).forEach(u => units.add(u));
      }
    });
    return Array.from(units).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  })();

  // Group past services by unit
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
    // Add services without unit details under "General"
    pastServices.filter(s => !s.unit_details || (Array.isArray(s.unit_details) && (s.unit_details as any[]).length === 0)).forEach(s => {
      if (!map.has("General")) map.set("General", []);
      map.get("General")!.push({ service: s, unitDetail: null });
    });
    return map;
  })();

  const completeService = async (serviceId: string) => {
    setCompletingServiceId(serviceId);
    await supabase.from("portal_services").update({
      status: "completed",
      service_date: today,
    }).eq("id", serviceId);

    // If follow-up units are flagged, add them to the next upcoming service
    if (followUpUnits.length > 0) {
      const nextService = allUpcoming.find(s => s.id !== serviceId && !s.isProjected);
      if (nextService) {
        const existing = Array.isArray(nextService.units_planned) ? nextService.units_planned as string[] : [];
        const merged = Array.from(new Set([...existing, ...followUpUnits]));
        await supabase.from("portal_services").update({ units_planned: merged }).eq("id", nextService.id);
      } else {
        // Create next service with follow-up units
        const freq = SERVICE_FREQUENCY_MAP[propServices.find(s => s.id === serviceId)?.service_type || ""] || 30;
        const nextDate = new Date(Date.now() + freq * 86400000).toISOString().split("T")[0];
        const svc = propServices.find(s => s.id === serviceId);
        await supabase.from("portal_services").insert({
          property_id: property.id,
          service_type: svc?.service_type || "General Pest Control",
          service_date: nextDate,
          status: "scheduled",
          units_planned: followUpUnits,
          special_notes: `Follow-up units from ${today}: ${followUpUnits.join(", ")}`,
        });
      }
    }

    setFollowUpUnits([]);
    setCompletingServiceId(null);
    toast({ title: "Service completed" });
    onRefresh();
  };

  const submitWorkOrder = async () => {
    if (!workOrder.unit_number || !workOrder.pest_type) return;

    // Find the tenant link for this property to use as link_id
    const tenantLink = links.find(l => l.link_type === "tenant" && l.assigned_property_ids && (l.assigned_property_ids as string[]).includes(property.id));

    await supabase.from("portal_requests").insert({
      property_id: property.id,
      link_id: tenantLink?.id || null,
      unit_number: workOrder.unit_number,
      request_type: "Service Request",
      description: `${workOrder.pest_type} - ${workOrder.location_type}${workOrder.comments ? ` - ${workOrder.comments}` : ""}`,
      pest_type: workOrder.pest_type,
      location_type: workOrder.location_type,
    } as any);

    toast({ title: "Work order submitted" });
    setWorkOrder({ unit_number: "", pest_type: "", location_type: "Interior", comments: "" });
    setShowWorkOrder(false);
    onRefresh();
  };

  const mapUrl = property.map_image_url || property.image_url;
  const equipment = Array.isArray(property.equipment) ? property.equipment as string[] : [];

  const formatDate = (d: string | null) => d ? new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "TBD";
  const formatShortDate = (d: string | null) => d ? new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "TBD";

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
      {/* ══════════ LEFT COLUMN: Map + Equipment + Preferences ══════════ */}
      <div className="lg:col-span-3 space-y-3">
        {/* Property Map */}
        <Card className="overflow-hidden">
          <div className="aspect-[3/4] relative bg-muted">
            {mapUrl ? (
              property.map_data ? (
                <ReadOnlyMapCanvas mapUrl={mapUrl} mapData={property.map_data} />
              ) : (
                <img src={mapUrl} alt={property.name} className="w-full h-full object-cover" />
              )
            ) : (
              <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <Image className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  <p className="text-xs">No property image</p>
                </div>
              </div>
            )}
            {viewMode === "admin" && (
              <label className="absolute bottom-2 right-2 bg-background/80 rounded px-2 py-1.5 cursor-pointer hover:bg-background text-xs flex items-center gap-1">
                <Image className="w-3.5 h-3.5" />
                {uploadingPropertyImage ? "Uploading..." : mapUrl ? "Change" : "Upload"}
                <input type="file" accept="image/*" className="hidden" disabled={uploadingPropertyImage}
                  onChange={e => { const f = e.target.files?.[0]; if (f) onUpdatePropertyImage(property.id, f); }} />
              </label>
            )}
          </div>
        </Card>

        {/* Equipment */}
        <Card>
          <CardHeader className="pb-2 py-3">
            <CardTitle className="text-sm flex items-center gap-1.5"><Wrench className="w-3.5 h-3.5" />Equipment</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {viewMode === "admin" ? (
              <div className="space-y-1">
                {EQUIPMENT_OPTIONS.map(eq => {
                  const isChecked = equipment.includes(eq);
                  return (
                    <label key={eq} className="flex items-center gap-2 text-xs cursor-pointer">
                      <input type="checkbox" checked={isChecked} onChange={async () => {
                        const updated = isChecked ? equipment.filter(e => e !== eq) : [...equipment, eq];
                        await supabase.from("portal_properties").update({ equipment: updated }).eq("id", property.id);
                        onRefresh();
                      }} className="rounded" />
                      {eq}
                    </label>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-wrap gap-1">
                {equipment.length > 0
                  ? equipment.map(eq => <Badge key={eq} variant="secondary" className="text-xs">{eq}</Badge>)
                  : <p className="text-xs text-muted-foreground">No equipment set</p>
                }
              </div>
            )}
          </CardContent>
        </Card>

        {/* Customer Preference */}
        <Card>
          <CardHeader className="pb-2 py-3">
            <CardTitle className="text-sm">Customer Preference</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {viewMode === "admin" ? (
              <div className="space-y-2">
                <Select
                  value={(property.customer_preferences as any)?.preference || ""}
                  onValueChange={async (val) => {
                    const updated = { ...(property.customer_preferences || {}), preference: val };
                    await supabase.from("portal_properties").update({ customer_preferences: updated }).eq("id", property.id);
                    onRefresh();
                  }}
                >
                  <SelectTrigger className="text-xs h-8"><SelectValue placeholder="Select preference" /></SelectTrigger>
                  <SelectContent>
                    {PREFERENCE_OPTIONS.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Textarea
                  placeholder="Additional notes..."
                  className="text-xs min-h-[50px]"
                  defaultValue={(property.customer_preferences as any)?.notes || ""}
                  onBlur={async (e) => {
                    const updated = { ...(property.customer_preferences || {}), notes: e.target.value };
                    await supabase.from("portal_properties").update({ customer_preferences: updated }).eq("id", property.id);
                  }}
                />
              </div>
            ) : (
              <div>
                {(property.customer_preferences as any)?.preference
                  ? <p className="text-xs font-medium">🌱 {(property.customer_preferences as any).preference}</p>
                  : <p className="text-xs text-muted-foreground">No preference set</p>
                }
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ══════════ MIDDLE COLUMN: Past Services ══════════ */}
      <div className="lg:col-span-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold flex items-center gap-1.5">
            <Calendar className="w-4 h-4" />Previous Services
            <span className="text-muted-foreground font-normal">({pastServices.length})</span>
          </h3>
          <div className="flex items-center gap-1 bg-muted rounded-md p-0.5">
            <button
              className={`px-2 py-1 text-xs rounded transition-colors ${pastViewMode === "date" ? "bg-background shadow-sm font-medium" : "text-muted-foreground hover:text-foreground"}`}
              onClick={() => setPastViewMode("date")}
            >By Date</button>
            <button
              className={`px-2 py-1 text-xs rounded transition-colors ${pastViewMode === "unit" ? "bg-background shadow-sm font-medium" : "text-muted-foreground hover:text-foreground"}`}
              onClick={() => setPastViewMode("unit")}
            >By Unit</button>
          </div>
        </div>

        {pastViewMode === "date" ? (
          /* ─── Date View ─── */
          pastServices.length === 0 ? (
            <Card><CardContent className="p-6 text-center text-muted-foreground text-sm">No past services</CardContent></Card>
          ) : (
            <div className="space-y-2">
              {pastServices.map((s, i) => {
                const isExpanded = expandedPastId === s.id || (i === 0 && !expandedPastId);
                const isFirst = i === 0;
                return (
                  <Card key={s.id} className={`transition-all ${isExpanded ? "border-primary/30 shadow-md" : "hover:border-muted-foreground/20"}`}>
                    <button className="w-full text-left p-3 flex items-center justify-between" onClick={() => setExpandedPastId(isExpanded ? null : s.id)}>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className={`font-semibold ${isFirst ? "text-sm" : "text-xs"}`}>{s.service_type}</p>
                          <Badge variant="default" className="text-[10px]">Completed</Badge>
                          {s.follow_up_recommended && <Badge className="text-[10px] bg-orange-500">Follow-up</Badge>}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                          <span>{formatDate(s.service_date)}</span>
                          {s.technician && <span>• {s.technician}</span>}
                        </div>
                      </div>
                      <ChevronDown className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                    </button>

                    {isExpanded && (
                      <div className={`px-3 pb-3 space-y-2 border-t pt-2 ${isFirst ? "" : ""}`}>
                        {/* Unit Details */}
                        {s.unit_details && Array.isArray(s.unit_details) && (s.unit_details as any[]).length > 0 && (
                          <div>
                            <p className="text-xs font-medium text-muted-foreground mb-1">Units Treated ({(s.unit_details as any[]).length})</p>
                            <div className="space-y-1.5">
                              {(s.unit_details as any[]).map((unit: any, j: number) => (
                                <div key={j} className="bg-muted/50 rounded-md p-2 text-xs">
                                  <p className="font-medium">Unit {unit.unit_number || j + 1}
                                    {unit.status && <Badge variant="outline" className="text-[10px] ml-1">{unit.status}</Badge>}
                                  </p>
                                  {unit.findings && <p className="text-muted-foreground mt-0.5">Findings: {unit.findings}</p>}
                                  {unit.pest_activity && <p className="text-muted-foreground">Activity: {unit.pest_activity}</p>}
                                  {unit.products_used && <p className="text-muted-foreground">Products: {unit.products_used}</p>}
                                  {unit.notes && <p className="text-muted-foreground">Notes: {unit.notes}</p>}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* General Treatment Details */}
                        {s.summary && <div><p className="text-xs font-medium text-muted-foreground">Summary</p><p className="text-xs">{s.summary}</p></div>}
                        {s.findings && <div><p className="text-xs font-medium text-muted-foreground">Findings</p><p className="text-xs">{s.findings}</p></div>}
                        {s.notes && <div><p className="text-xs font-medium text-muted-foreground">Notes</p><p className="text-xs">{s.notes}</p></div>}

                        {s.products_used && Array.isArray(s.products_used) && s.products_used.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {(s.products_used as string[]).map((p, j) => <Badge key={j} variant="outline" className="text-[10px]">{p}</Badge>)}
                          </div>
                        )}

                        {s.follow_up_recommended && s.follow_up_notes && (
                          <div className="bg-orange-50 border border-orange-200 rounded-md p-2">
                            <p className="text-xs font-medium text-orange-700">⚠️ Follow-up: {s.follow_up_notes}</p>
                          </div>
                        )}

                        {/* Actions */}
                        <div className="flex gap-1.5 pt-1">
                          <Button variant="outline" size="sm" className="h-7 text-xs flex-1" onClick={() => onOpenServiceReport(s)}>
                            <FileText className="w-3 h-3 mr-1" />Full Report
                          </Button>
                          {viewMode === "admin" && (
                            <>
                              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => onEditService(s)}><Edit className="w-3 h-3" /></Button>
                              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => onDeleteService(s.id)}><Trash2 className="w-3 h-3 text-destructive" /></Button>
                            </>
                          )}
                        </div>
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          )
        ) : (
          /* ─── Unit View ─── */
          servicesByUnit.size === 0 ? (
            <Card><CardContent className="p-6 text-center text-muted-foreground text-sm">No service history</CardContent></Card>
          ) : (
            <Accordion type="multiple" defaultValue={Array.from(servicesByUnit.keys()).slice(0, 1)}>
              {Array.from(servicesByUnit.entries())
                .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
                .map(([unitNum, entries]) => (
                  <AccordionItem key={unitNum} value={unitNum} className="border rounded-lg mb-2 px-0">
                    <AccordionTrigger className="px-3 py-2 text-sm hover:no-underline">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{unitNum === "General" ? "General Treatment" : `Unit ${unitNum}`}</span>
                        <Badge variant="secondary" className="text-[10px]">{entries.length} services</Badge>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="px-3 pb-3 space-y-1.5">
                      {entries.map(({ service, unitDetail }, j) => (
                        <div key={`${service.id}-${j}`} className="bg-muted/40 rounded-md p-2 text-xs cursor-pointer hover:bg-muted/70 transition-colors"
                          onClick={() => onOpenServiceReport(service)}>
                          <div className="flex items-center justify-between">
                            <span className="font-medium">{service.service_type}</span>
                            <span className="text-muted-foreground">{formatShortDate(service.service_date)}</span>
                          </div>
                          {unitDetail && (
                            <div className="mt-1 text-muted-foreground space-y-0.5">
                              {unitDetail.findings && <p>Findings: {unitDetail.findings}</p>}
                              {unitDetail.pest_activity && <p>Activity: {unitDetail.pest_activity}</p>}
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

      {/* ══════════ RIGHT COLUMN: Upcoming + Work Orders ══════════ */}
      <div className="lg:col-span-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold flex items-center gap-1.5">
            <ClipboardList className="w-4 h-4" />Upcoming Services
            <span className="text-muted-foreground font-normal">({allUpcoming.length})</span>
          </h3>
          {(viewMode === "admin" || viewMode === "pm") && (
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setShowWorkOrder(true)}>
              <Plus className="w-3 h-3 mr-1" />Work Order
            </Button>
          )}
        </div>

        {allUpcoming.length === 0 ? (
          <Card><CardContent className="p-6 text-center text-muted-foreground text-sm">No upcoming services</CardContent></Card>
        ) : (
          <div className="space-y-2">
            {allUpcoming.map((s, i) => {
              const isExpanded = expandedUpcomingId === s.id || (i === 0 && !expandedUpcomingId);
              const isProjected = (s as any).isProjected;
              const unitsPlanned = Array.isArray(s.units_planned) ? s.units_planned as string[] : [];

              return (
                <Card key={s.id} className={`transition-all ${isExpanded ? "border-primary/30 shadow-md" : "hover:border-muted-foreground/20"} ${isProjected ? "border-dashed" : ""}`}>
                  <button className="w-full text-left p-3 flex items-center justify-between" onClick={() => setExpandedUpcomingId(isExpanded ? null : s.id)}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-xs">{s.service_type}</p>
                        {isProjected && <Badge variant="outline" className="text-[10px]">Projected</Badge>}
                        {!isProjected && <Badge variant="secondary" className="text-[10px]">{(s as any).scheduling_status || "confirmed"}</Badge>}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {formatDate(s.service_date)}
                        {(s as any).technician && ` • ${(s as any).technician}`}
                      </p>
                    </div>
                    <ChevronDown className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                  </button>

                  {isExpanded && (
                    <div className="px-3 pb-3 space-y-2 border-t pt-2">
                      {/* Units planned */}
                      {unitsPlanned.length > 0 && (
                        <div>
                          <p className="text-xs font-medium text-muted-foreground mb-1">Units to be Treated</p>
                          <div className="flex flex-wrap gap-1">
                            {unitsPlanned.map(u => <Badge key={u} variant="secondary" className="text-[10px]">Unit {u}</Badge>)}
                          </div>
                        </div>
                      )}

                      {(s as any).special_notes && (
                        <div className="bg-amber-50 border border-amber-200 rounded-md p-2">
                          <p className="text-xs text-amber-700">{(s as any).special_notes}</p>
                        </div>
                      )}

                      {(s as any).prep_required && (s as any).prep_notes && (
                        <div className="bg-blue-50 border border-blue-200 rounded-md p-2">
                          <p className="text-xs font-medium text-blue-700">Prep Required</p>
                          <p className="text-xs text-blue-600 mt-0.5">{(s as any).prep_notes}</p>
                        </div>
                      )}

                      {/* Actions for real scheduled services */}
                      {!isProjected && (viewMode === "admin" || viewMode === "pm") && (
                        <div className="space-y-2 pt-1">
                          {/* Complete Service Flow */}
                          {completingServiceId === s.id ? (
                            <div className="bg-muted rounded-lg p-3 space-y-2">
                              <p className="text-xs font-semibold">Flag units needing follow-up:</p>
                              {allUnits.length > 0 ? (
                                <div className="flex flex-wrap gap-1.5">
                                  {allUnits.map(u => (
                                    <button key={u}
                                      className={`px-2 py-1 rounded text-xs border transition-colors ${followUpUnits.includes(u) ? "bg-orange-100 border-orange-300 text-orange-700 font-medium" : "bg-background border-border hover:border-orange-300"}`}
                                      onClick={() => setFollowUpUnits(prev => prev.includes(u) ? prev.filter(x => x !== u) : [...prev, u])}
                                    >
                                      <Flag className="w-3 h-3 inline mr-1" />Unit {u}
                                    </button>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-xs text-muted-foreground">No unit history — skip follow-up flagging</p>
                              )}
                              <div className="flex gap-2">
                                <Button size="sm" className="h-7 text-xs flex-1" onClick={() => completeService(s.id)}>
                                  <CheckCircle className="w-3 h-3 mr-1" />
                                  {followUpUnits.length > 0 ? `Complete & Flag ${followUpUnits.length} Units` : "Complete Service"}
                                </Button>
                                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => { setCompletingServiceId(null); setFollowUpUnits([]); }}>Cancel</Button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex gap-1.5">
                              <Button size="sm" className="h-7 text-xs flex-1 bg-green-600 hover:bg-green-700" onClick={() => setCompletingServiceId(s.id)}>
                                <CheckCircle className="w-3 h-3 mr-1" />Complete Service
                              </Button>
                              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => onOpenServiceReport(s as any)}>
                                <FileText className="w-3 h-3 mr-1" />Details
                              </Button>
                              {viewMode === "admin" && (
                                <>
                                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => onEditService(s as any)}><Edit className="w-3 h-3" /></Button>
                                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => onDeleteService(s.id)}><Trash2 className="w-3 h-3 text-destructive" /></Button>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Click into projected to create a real service */}
                      {isProjected && viewMode === "admin" && (
                        <Button variant="outline" size="sm" className="h-7 text-xs w-full" onClick={async () => {
                          const { error } = await supabase.from("portal_services").insert({
                            property_id: property.id,
                            service_type: s.service_type,
                            service_date: s.service_date,
                            status: "scheduled",
                            units_planned: s.units_planned,
                          });
                          if (!error) { toast({ title: "Service scheduled" }); onRefresh(); }
                        }}>
                          <Plus className="w-3 h-3 mr-1" />Schedule This Service
                        </Button>
                      )}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}

        {/* ─── Work Order Form ─── */}
        {showWorkOrder && (
          <Card className="border-primary/30">
            <CardHeader className="pb-2 py-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">Submit Work Order</CardTitle>
                <button onClick={() => setShowWorkOrder(false)}><X className="w-4 h-4 text-muted-foreground" /></button>
              </div>
            </CardHeader>
            <CardContent className="space-y-2 pt-0">
              <div>
                <Label className="text-xs">Unit Number *</Label>
                {allUnits.length > 0 ? (
                  <Select value={workOrder.unit_number} onValueChange={v => setWorkOrder(wo => ({ ...wo, unit_number: v }))}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select unit" /></SelectTrigger>
                    <SelectContent>
                      {allUnits.map(u => <SelectItem key={u} value={u}>Unit {u}</SelectItem>)}
                      <SelectItem value="__other">Other...</SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  <Input className="h-8 text-xs" placeholder="Unit number" value={workOrder.unit_number}
                    onChange={e => setWorkOrder(wo => ({ ...wo, unit_number: e.target.value }))} />
                )}
                {workOrder.unit_number === "__other" && (
                  <Input className="h-8 text-xs mt-1" placeholder="Enter unit number" onChange={e => setWorkOrder(wo => ({ ...wo, unit_number: e.target.value }))} />
                )}
              </div>
              <div>
                <Label className="text-xs">Pest Type *</Label>
                <Select value={workOrder.pest_type} onValueChange={v => setWorkOrder(wo => ({ ...wo, pest_type: v }))}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select pest" /></SelectTrigger>
                  <SelectContent>
                    {PEST_TYPES.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Location</Label>
                <div className="flex gap-1 mt-1">
                  <button
                    className={`px-3 py-1.5 rounded text-xs border transition-colors ${workOrder.location_type === "Interior" ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted"}`}
                    onClick={() => setWorkOrder(wo => ({ ...wo, location_type: "Interior" }))}
                  >Interior</button>
                  <button
                    className={`px-3 py-1.5 rounded text-xs border transition-colors ${workOrder.location_type === "Exterior" ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted"}`}
                    onClick={() => setWorkOrder(wo => ({ ...wo, location_type: "Exterior" }))}
                  >Exterior</button>
                  <button
                    className={`px-3 py-1.5 rounded text-xs border transition-colors ${workOrder.location_type === "Both" ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted"}`}
                    onClick={() => setWorkOrder(wo => ({ ...wo, location_type: "Both" }))}
                  >Both</button>
                </div>
              </div>
              <div>
                <Label className="text-xs">Comments</Label>
                <Textarea className="text-xs min-h-[50px]" placeholder="Additional details..." value={workOrder.comments}
                  onChange={e => setWorkOrder(wo => ({ ...wo, comments: e.target.value }))} />
              </div>
              <Button size="sm" className="w-full h-8 text-xs" onClick={submitWorkOrder} disabled={!workOrder.unit_number || !workOrder.pest_type}>
                <Send className="w-3 h-3 mr-1" />Submit Work Order
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default PropertyDashboard;
