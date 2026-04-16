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
import {
  ChevronDown, Calendar, Plus, Edit, Trash2,
  CheckCircle, Wrench, Image, ExternalLink,
  Copy, FileText, Send, X, Flag, ClipboardList, CalendarPlus, Link2
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { ReadOnlyMapCanvas } from "@/components/ReadOnlyMapCanvas";

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
const STATUS_OPTIONS = ["Treated", "Clear", "Needs Follow-up"];

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

// Generate dummy dates: start week of April 20, 2025, then every 2 weeks
const generateDummyDates = (count: number): string[] => {
  const dates: string[] = [];
  // Week of April 20 2025 — use April 21 (Monday)
  let d = new Date("2025-04-21T00:00:00");
  for (let i = 0; i < count; i++) {
    dates.push(d.toISOString().split("T")[0]);
    d = new Date(d.getTime() + 14 * 86400000); // 2 weeks
  }
  return dates;
};

const generateUpcomingDates = (lastDate: string, frequencyDays: number, count: number): string[] => {
  const dates: string[] = [];
  let d = new Date(lastDate + "T00:00:00");
  for (let i = 0; i < count; i++) {
    d = new Date(d.getTime() + frequencyDays * 86400000);
    dates.push(d.toISOString().split("T")[0]);
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
  const [workOrder, setWorkOrder] = useState({ unit_number: "", pest_type: "", location_type: "Interior", comments: "", preferred_date: "" });
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
    unitRows: { unit_number: string; findings: string; pest_activity: string; products_used: string; status: string; notes: string }[];
    summary: string; findings: string; notes: string; technician: string;
  }>>({});

  const propServices = services.filter(s => s.property_id === property.id);
  const pastServices = propServices
    .filter(s => s.status === "completed" || (s.service_date && s.service_date <= today))
    .sort((a, b) => (b.service_date || "").localeCompare(a.service_date || ""));
  const scheduledServices = propServices
    .filter(s => s.status === "scheduled" && (!s.service_date || s.service_date > today))
    .sort((a, b) => (a.service_date || "").localeCompare(b.service_date || ""));

  // Generate projected upcoming with dummy dates
  const projectedUpcoming = (() => {
    if (scheduledServices.length > 0) return [];
    const lastRecurring = pastServices.find(s => {
      const freq = (s as any).frequency_days || SERVICE_FREQUENCY_MAP[s.service_type];
      return freq && freq > 0;
    });
    if (!lastRecurring) {
      // No past recurring — generate dummy dates anyway
      const dates = generateDummyDates(5);
      return dates.map((d, i) => ({
        id: `projected-${i}`,
        isProjected: true,
        service_date: d,
        service_type: "General Pest Control",
        technician: null,
        status: "scheduled",
        units_planned: null,
        property_id: property.id,
      }));
    }
    const freq = (lastRecurring as any).frequency_days || SERVICE_FREQUENCY_MAP[lastRecurring.service_type] || 14;
    const dates = lastRecurring.service_date
      ? generateUpcomingDates(lastRecurring.service_date, freq, 5)
      : generateDummyDates(5);
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

  // Extract follow-up units from most recent past service
  const followUpFromPast = (() => {
    if (pastServices.length === 0) return [] as string[];
    const mostRecent = pastServices[0];
    const details = Array.isArray(mostRecent.unit_details) ? mostRecent.unit_details as any[] : [];
    return details
      .filter((u: any) => u.status === "Needs Follow-up" && u.unit_number)
      .map((u: any) => u.unit_number as string);
  })();

  // Also include all units from most recent service as default for next
  const unitsFromMostRecent = (() => {
    if (pastServices.length === 0) return [] as string[];
    const mostRecent = pastServices[0];
    const details = Array.isArray(mostRecent.unit_details) ? mostRecent.unit_details as any[] : [];
    return details.filter((u: any) => u.unit_number).map((u: any) => u.unit_number as string);
  })();

  const allUpcoming = [
    ...scheduledServices.map(s => ({ ...s, isProjected: false })),
    ...projectedUpcoming,
  ].sort((a, b) => (a.service_date || "").localeCompare(b.service_date || ""));

  useEffect(() => {
    if (pastServices.length > 0) setExpandedPastId(pastServices[0].id);
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
    const rows = displayUnits.length > 0
      ? displayUnits.map(u => ({
          unit_number: u,
          findings: followUpFromPast.includes(u) ? "Follow-up service" : "",
          pest_activity: "None",
          products_used: "",
          status: "Treated",
          notes: "",
        }))
      : [{ unit_number: "", findings: "", pest_activity: "None", products_used: "", status: "Treated", notes: "" }];
    setCompletionData(prev => ({
      ...prev,
      [serviceId]: { unitRows: rows, summary: "", findings: "", notes: "", technician: "" },
    }));
  };

  const completeService = async (serviceId: string) => {
    const data = completionData[serviceId];
    const unitRows = data?.unitRows?.filter(r => r.unit_number) || [];
    const flagged = unitRows.filter(r => r.status === "Needs Follow-up").map(r => r.unit_number);

    await supabase.from("portal_services").update({
      status: "completed",
      service_date: today,
      unit_details: unitRows,
      summary: data?.summary || null,
      findings: data?.findings || null,
      notes: data?.notes || null,
      technician: data?.technician || null,
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
    toast({ title: "Service completed" });
    onRefresh();
  };

  const submitWorkOrder = async () => {
    if (!workOrder.unit_number && !workOrder.comments) return;
    await supabase.from("portal_requests").insert({
      property_id: property.id,
      unit_number: workOrder.unit_number || "Facility",
      request_type: "Service Request",
      description: `${workOrder.pest_type || "General"} - ${workOrder.location_type}${workOrder.comments ? ` - ${workOrder.comments}` : ""}`,
      pest_type: workOrder.pest_type || null,
      location_type: workOrder.location_type,
      preferred_date: workOrder.preferred_date || null,
    } as any);
    toast({ title: "Work order submitted" });
    setWorkOrder({ unit_number: "", pest_type: "", location_type: "Interior", comments: "", preferred_date: "" });
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
  const equipment = Array.isArray(property.equipment) ? property.equipment as string[] : [];
  const formatDate = (d: string | null) => {
    if (!d) return "TBD";
    const date = new Date(d + "T00:00:00");
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };
  const formatWeekOf = (d: string | null) => {
    if (!d) return "TBD";
    const date = new Date(d + "T00:00:00");
    return `Week of ${date.toLocaleDateString("en-US", { month: "long", day: "numeric" })}`;
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
                <th className="text-left px-2 py-1.5 font-semibold text-foreground">Products</th>
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
                    <Input className="h-6 text-[11px] w-full border-transparent hover:border-border focus:border-primary bg-transparent px-1"
                      defaultValue={unit.products_used || ""}
                      onBlur={e => { if (e.target.value !== (unit.products_used || "")) updateUnitField(s.id, j, "products_used", e.target.value); }}
                    />
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
                    <Input className="h-6 text-[11px] w-full px-1" placeholder="Products" value={newUnitData.products_used}
                      onChange={e => setNewUnitData(d => ({ ...d, products_used: e.target.value }))} />
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
    const products = s.products_used && Array.isArray(s.products_used) ? s.products_used as string[] : [];

    // For the first upcoming service, merge in units from most recent past + follow-ups
    const mergedUnitsForNext = (() => {
      if (!isUpcoming || !isFirstUpcoming) return unitsPlanned;
      const all = new Set(unitsPlanned);
      unitsFromMostRecent.forEach(u => all.add(u));
      followUpFromPast.forEach(u => all.add(u));
      return Array.from(all).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    })();
    const displayUnits = isUpcoming && isFirstUpcoming ? mergedUnitsForNext : unitsPlanned;

    return (
      <div className="px-4 pb-4 space-y-3 border-t border-border/60 pt-3">
        {/* Past service: inline-editable unit table */}
        {!isUpcoming && renderEditableUnitTable(s)}

        {/* Upcoming service: editable planned units with inline add */}
        {isUpcoming && (
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-xs font-semibold text-muted-foreground">Units to be Treated</p>
              {!isProjected && (
                <Button variant="outline" size="sm" className="h-6 text-[10px] px-2" onClick={() => {
                  setAddingPlannedUnit(s.id);
                  setNewPlannedUnit("");
                }}>
                  <Plus className="w-3 h-3 mr-0.5" />Add Unit
                </Button>
              )}
            </div>
            {isFirstUpcoming && followUpFromPast.length > 0 && (
              <div className="bg-orange-50 border border-orange-200 rounded-lg p-2 mb-2">
                <p className="text-[11px] font-medium text-orange-700">
                  ⚠️ {followUpFromPast.length} unit{followUpFromPast.length > 1 ? "s" : ""} flagged for follow-up from last service
                </p>
              </div>
            )}
            {displayUnits.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-1.5">
                {displayUnits.map(u => {
                  const isFollowUp = followUpFromPast.includes(u) && isFirstUpcoming;
                  return (
                    <Badge key={u} variant={isFollowUp ? "default" : "secondary"}
                      className={`text-[10px] pr-1 flex items-center gap-0.5 ${isFollowUp ? "bg-orange-500 text-white" : ""}`}>
                      {isFollowUp && <Flag className="w-3 h-3 mr-0.5" />}
                      Unit {u}
                      {isFollowUp && <span className="ml-0.5 text-[9px] opacity-80">Follow-up</span>}
                      {!isProjected && (
                        <button className="ml-0.5 hover:text-destructive" onClick={async () => {
                          const updated = unitsPlanned.filter(x => x !== u);
                          await supabase.from("portal_services").update({ units_planned: updated }).eq("id", s.id);
                          onRefresh();
                        }}>
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </Badge>
                  );
                })}
              </div>
            )}
            {/* Inline add unit input */}
            {addingPlannedUnit === s.id ? (
              <div className="flex gap-1 items-center">
                <Input className="h-7 text-xs flex-1" placeholder="Unit # or name" value={newPlannedUnit}
                  onChange={e => setNewPlannedUnit(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && newPlannedUnit.trim()) addPlannedUnitToService(s.id); }}
                  autoFocus
                />
                <Button size="sm" className="h-7 text-xs px-2" onClick={() => addPlannedUnitToService(s.id)} disabled={!newPlannedUnit.trim()}>Add</Button>
                <Button variant="ghost" size="sm" className="h-7 text-xs px-1.5" onClick={() => setAddingPlannedUnit(null)}>
                  <X className="w-3 h-3" />
                </Button>
              </div>
            ) : !isProjected && (
              <button className="w-full py-1 text-[10px] text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded border border-dashed border-border/60 transition-colors flex items-center justify-center gap-1"
                onClick={() => { setAddingPlannedUnit(s.id); setNewPlannedUnit(""); }}>
                <Plus className="w-3 h-3" /> Add unit
              </button>
            )}
          </div>
        )}

        {s.summary && <div className="bg-muted/30 rounded-lg p-2.5"><p className="text-xs font-semibold text-muted-foreground mb-0.5">Summary</p><p className="text-xs">{s.summary}</p></div>}
        {s.findings && <div className="bg-muted/30 rounded-lg p-2.5"><p className="text-xs font-semibold text-muted-foreground mb-0.5">Findings</p><p className="text-xs">{s.findings}</p></div>}
        {s.notes && <div className="bg-muted/30 rounded-lg p-2.5"><p className="text-xs font-semibold text-muted-foreground mb-0.5">Notes</p><p className="text-xs">{s.notes}</p></div>}

        {products.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-muted-foreground mb-1">Products Used</p>
            <div className="flex flex-wrap gap-1">
              {products.map((p, j) => <Badge key={j} variant="outline" className="text-[10px]">{p}</Badge>)}
            </div>
          </div>
        )}

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

        {/* Actions */}
        {!isProjected && (
          <div className="flex gap-1.5 pt-1 border-t border-border/40 mt-2">
            <Button variant="outline" size="sm" className="h-7 text-xs flex-1" onClick={() => onOpenServiceReport(s)}>
              <FileText className="w-3 h-3 mr-1" />Full Report
            </Button>
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => onDeleteService(s.id)}><Trash2 className="w-3 h-3 text-destructive" /></Button>
          </div>
        )}

        {/* Inline completion form for upcoming services */}
        {isUpcoming && !isProjected && (
          <div className="space-y-3 pt-2 border-t border-border/40 mt-2">
            {completingServiceId === s.id && completionData[s.id] ? (() => {
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
                  [s.id]: { ...prev[s.id], unitRows: [...prev[s.id].unitRows, { unit_number: "", findings: "", pest_activity: "None", products_used: "", status: "Treated", notes: "" }] },
                }));
              };
              const removeRow = (idx: number) => {
                setCompletionData(prev => ({
                  ...prev,
                  [s.id]: { ...prev[s.id], unitRows: prev[s.id].unitRows.filter((_, i) => i !== idx) },
                }));
              };
              const flaggedCount = cd.unitRows.filter(r => r.status === "Needs Follow-up").length;

              return (
                <div className="bg-muted/30 rounded-lg p-3 space-y-3 border border-primary/20">
                  <p className="text-xs font-bold text-foreground flex items-center gap-1.5">
                    <CheckCircle className="w-4 h-4 text-green-600" />
                    Complete Service Report
                  </p>

                  {/* Technician */}
                  <div>
                    <Label className="text-[11px] font-semibold">Technician</Label>
                    <Input className="h-7 text-xs mt-0.5" placeholder="Technician name" value={cd.technician}
                      onChange={e => setCompletionData(prev => ({ ...prev, [s.id]: { ...prev[s.id], technician: e.target.value } }))} />
                  </div>

                  {/* Unit-by-unit table */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <Label className="text-[11px] font-semibold">Units Treated</Label>
                      <Button variant="outline" size="sm" className="h-5 text-[10px] px-2" onClick={addRow}>
                        <Plus className="w-3 h-3 mr-0.5" />Row
                      </Button>
                    </div>
                    <div className="border rounded-lg overflow-hidden">
                      <table className="w-full text-[11px]">
                        <thead className="bg-muted">
                          <tr>
                            <th className="text-left px-2 py-1 font-semibold w-[55px]">Unit</th>
                            <th className="text-left px-2 py-1 font-semibold">Findings</th>
                            <th className="text-left px-2 py-1 font-semibold w-[70px]">Activity</th>
                            <th className="text-left px-2 py-1 font-semibold">Products</th>
                            <th className="text-left px-2 py-1 font-semibold w-[90px]">Status</th>
                            <th className="w-[24px]"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {cd.unitRows.map((row, idx) => (
                            <tr key={idx} className={`border-t border-border/40 ${followUpFromPast.includes(row.unit_number) ? "bg-orange-50" : idx % 2 === 1 ? "bg-muted/20" : ""}`}>
                              <td className="px-1 py-0.5">
                                <Input className="h-6 text-[11px] px-1 border-transparent hover:border-border focus:border-primary bg-transparent"
                                  value={row.unit_number} onChange={e => updateRow(idx, "unit_number", e.target.value)} />
                              </td>
                              <td className="px-1 py-0.5">
                                <Input className="h-6 text-[11px] px-1 border-transparent hover:border-border focus:border-primary bg-transparent"
                                  value={row.findings} placeholder="Findings..." onChange={e => updateRow(idx, "findings", e.target.value)} />
                              </td>
                              <td className="px-1 py-0.5">
                                <select className="h-6 text-[11px] w-full bg-transparent border-0 outline-none"
                                  value={row.pest_activity} onChange={e => updateRow(idx, "pest_activity", e.target.value)}>
                                  {ACTIVITY_OPTIONS.map(a => <option key={a} value={a}>{a}</option>)}
                                </select>
                              </td>
                              <td className="px-1 py-0.5">
                                <Input className="h-6 text-[11px] px-1 border-transparent hover:border-border focus:border-primary bg-transparent"
                                  value={row.products_used} placeholder="Products..." onChange={e => updateRow(idx, "products_used", e.target.value)} />
                              </td>
                              <td className="px-1 py-0.5">
                                <select className={`h-6 text-[11px] w-full bg-transparent border-0 outline-none ${row.status === "Needs Follow-up" ? "text-orange-600 font-semibold" : ""}`}
                                  value={row.status} onChange={e => updateRow(idx, "status", e.target.value)}>
                                  {STATUS_OPTIONS.map(a => <option key={a} value={a}>{a}</option>)}
                                </select>
                              </td>
                              <td className="px-0.5 py-0.5">
                                <button onClick={() => removeRow(idx)} className="text-muted-foreground hover:text-destructive">
                                  <X className="w-3 h-3" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <button className="w-full mt-1 py-1 text-[10px] text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded border border-dashed border-border/60 transition-colors flex items-center justify-center gap-1"
                      onClick={addRow}>
                      <Plus className="w-3 h-3" /> Add unit row
                    </button>
                  </div>

                  {/* Summary & Notes */}
                  <div className="grid grid-cols-1 gap-2">
                    <div>
                      <Label className="text-[11px] font-semibold">Summary</Label>
                      <Textarea className="text-xs min-h-[35px] mt-0.5" placeholder="Service summary..." value={cd.summary}
                        onChange={e => setCompletionData(prev => ({ ...prev, [s.id]: { ...prev[s.id], summary: e.target.value } }))} />
                    </div>
                    <div>
                      <Label className="text-[11px] font-semibold">Notes</Label>
                      <Textarea className="text-xs min-h-[35px] mt-0.5" placeholder="Additional notes..." value={cd.notes}
                        onChange={e => setCompletionData(prev => ({ ...prev, [s.id]: { ...prev[s.id], notes: e.target.value } }))} />
                    </div>
                  </div>

                  {/* Follow-up warning */}
                  {flaggedCount > 0 && (
                    <div className="bg-orange-50 border border-orange-200 rounded-lg p-2">
                      <p className="text-[11px] font-medium text-orange-700">
                        ⚠️ {flaggedCount} unit{flaggedCount > 1 ? "s" : ""} marked "Needs Follow-up" — will auto-add to next service
                      </p>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex gap-2">
                    <Button size="sm" className="h-8 text-xs flex-1 bg-green-600 hover:bg-green-700 text-white" onClick={() => completeService(s.id)}>
                      <CheckCircle className="w-3.5 h-3.5 mr-1" />
                      {flaggedCount > 0 ? `Complete & Flag ${flaggedCount}` : "Complete Service"}
                    </Button>
                    <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => {
                      setCompletingServiceId(null);
                      setCompletionData(prev => { const n = { ...prev }; delete n[s.id]; return n; });
                    }}>Cancel</Button>
                  </div>
                </div>
              );
            })() : (
              <div className="flex gap-1.5">
                <Button size="sm" className="h-8 text-xs flex-1 bg-green-600 hover:bg-green-700 text-white" onClick={() => {
                  setCompletingServiceId(s.id);
                  initCompletionData(s.id, displayUnits);
                }}>
                  <CheckCircle className="w-3.5 h-3.5 mr-1" />Complete Service
                </Button>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => onDeleteService(s.id)}><Trash2 className="w-3.5 h-3.5 text-destructive" /></Button>
              </div>
            )}
          </div>
        )}

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
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
      {/* ══════════ LEFT COLUMN ══════════ */}
      <div className="lg:col-span-3 space-y-4">
        {/* Property Map */}
        <Card className="overflow-hidden shadow-sm">
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
            <label className="absolute bottom-2 right-2 bg-background/80 rounded px-2 py-1.5 cursor-pointer hover:bg-background text-xs flex items-center gap-1">
              <Image className="w-3.5 h-3.5" />
              {uploadingPropertyImage ? "Uploading..." : mapUrl ? "Change" : "Upload"}
              <input type="file" accept="image/*" className="hidden" disabled={uploadingPropertyImage}
                onChange={e => { const f = e.target.files?.[0]; if (f) onUpdatePropertyImage(property.id, f); }} />
            </label>
          </div>
        </Card>

        {/* Equipment */}
        <Card className="shadow-sm">
          <CardHeader className="pb-2 py-3 border-b bg-muted/30">
            <CardTitle className="text-sm flex items-center gap-1.5"><Wrench className="w-3.5 h-3.5" />Equipment</CardTitle>
          </CardHeader>
          <CardContent className="pt-3">
            <div className="space-y-1.5">
              {EQUIPMENT_OPTIONS.map(eq => {
                const isChecked = equipment.includes(eq);
                return (
                  <label key={eq} className="flex items-center gap-2 text-xs cursor-pointer hover:bg-muted/30 rounded px-1 py-0.5 transition-colors">
                    <input type="checkbox" checked={isChecked} onChange={async () => {
                      const updated = isChecked ? equipment.filter((e: string) => e !== eq) : [...equipment, eq];
                      await supabase.from("portal_properties").update({ equipment: updated }).eq("id", property.id);
                      onRefresh();
                    }} className="rounded" />
                    {eq}
                  </label>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Customer Preference */}
        <Card className="shadow-sm">
          <CardHeader className="pb-2 py-3 border-b bg-muted/30">
            <CardTitle className="text-sm">Customer Preference</CardTitle>
          </CardHeader>
          <CardContent className="pt-3 space-y-2">
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
          </CardContent>
        </Card>

        {/* Share Link */}
        {propertyLink && (
          <Card className="shadow-sm">
            <CardHeader className="pb-2 py-3 border-b bg-muted/30">
              <CardTitle className="text-sm flex items-center gap-1.5"><Link2 className="w-3.5 h-3.5" />PM Share Link</CardTitle>
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

      {/* ══════════ MIDDLE COLUMN: Past Services ══════════ */}
      <div className="lg:col-span-5 space-y-3">
        <div className="flex items-center justify-between pb-1 border-b border-border">
          <h3 className="text-sm font-bold flex items-center gap-1.5">
            <Calendar className="w-4 h-4" />Previous Services
            <Badge variant="secondary" className="text-[10px] ml-1">{pastServices.length}</Badge>
          </h3>
          <div className="flex items-center gap-0.5 bg-muted rounded-lg p-0.5">
            <button
              className={`px-2.5 py-1 text-xs rounded-md transition-all ${pastViewMode === "date" ? "bg-background shadow-sm font-semibold" : "text-muted-foreground hover:text-foreground"}`}
              onClick={() => setPastViewMode("date")}
            >By Date</button>
            <button
              className={`px-2.5 py-1 text-xs rounded-md transition-all ${pastViewMode === "unit" ? "bg-background shadow-sm font-semibold" : "text-muted-foreground hover:text-foreground"}`}
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
                const isExpanded = isFirst || expandedPastId === s.id;
                return (
                  <Card key={s.id} className={`transition-all shadow-sm ${isFirst ? "border-primary/40 shadow-md ring-1 ring-primary/10" : isExpanded ? "border-primary/20" : "hover:border-muted-foreground/30"}`}>
                    <button className="w-full text-left p-3 flex items-center justify-between" onClick={() => !isFirst && setExpandedPastId(isExpanded && !isFirst ? null : s.id)}>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          {isFirst && <Badge className="text-[10px] bg-primary">Most Recent</Badge>}
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
                      {!isFirst && <ChevronDown className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform ${isExpanded ? "rotate-180" : ""}`} />}
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

      {/* ══════════ RIGHT COLUMN ══════════ */}
      <div className="lg:col-span-4 space-y-4">
        {/* Work Order Form */}
        <Card className="shadow-md border-primary/30 bg-gradient-to-b from-primary/[0.03] to-transparent">
          <CardHeader className="pb-2 py-3 border-b border-primary/20">
            <CardTitle className="text-sm flex items-center gap-1.5">
              <ClipboardList className="w-4 h-4 text-primary" />
              Request Work Order
            </CardTitle>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Submit a service request for a specific unit or the entire facility.
            </p>
          </CardHeader>
          <CardContent className="space-y-2.5 pt-3">
            <div>
              <Label className="text-xs font-semibold">Unit or Area *</Label>
              <Select value={workOrder.unit_number} onValueChange={v => setWorkOrder(wo => ({ ...wo, unit_number: v }))}>
                <SelectTrigger className="h-8 text-xs mt-1"><SelectValue placeholder="Select unit or facility" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Facility">🏢 Entire Facility</SelectItem>
                  <SelectItem value="Common Areas">🚪 Common Areas</SelectItem>
                  <SelectItem value="Exterior">🌳 Exterior Only</SelectItem>
                  {allUnits.map(u => <SelectItem key={u} value={u}>Unit {u}</SelectItem>)}
                  <SelectItem value="__custom">Other...</SelectItem>
                </SelectContent>
              </Select>
              {workOrder.unit_number === "__custom" && (
                <Input className="h-8 text-xs mt-1" placeholder="Enter unit/area" onChange={e => setWorkOrder(wo => ({ ...wo, unit_number: e.target.value }))} />
              )}
            </div>
            <div>
              <Label className="text-xs font-semibold">Pest Type</Label>
              <Select value={workOrder.pest_type} onValueChange={v => setWorkOrder(wo => ({ ...wo, pest_type: v }))}>
                <SelectTrigger className="h-8 text-xs mt-1"><SelectValue placeholder="Select pest type" /></SelectTrigger>
                <SelectContent>
                  {PEST_TYPES.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs font-semibold">Location</Label>
              <div className="flex gap-1 mt-1">
                {["Interior", "Exterior", "Both"].map(loc => (
                  <button key={loc}
                    className={`px-3 py-1.5 rounded-md text-xs border transition-all font-medium ${workOrder.location_type === loc ? "bg-primary text-primary-foreground border-primary shadow-sm" : "bg-background hover:bg-muted border-border"}`}
                    onClick={() => setWorkOrder(wo => ({ ...wo, location_type: loc }))}
                  >{loc}</button>
                ))}
              </div>
            </div>
            <div>
              <Label className="text-xs font-semibold">Preferred Date</Label>
              <Input type="date" className="h-8 text-xs mt-1" value={workOrder.preferred_date}
                onChange={e => setWorkOrder(wo => ({ ...wo, preferred_date: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs font-semibold">Comments</Label>
              <Textarea className="text-xs min-h-[40px] mt-1" placeholder="Describe the issue..." value={workOrder.comments}
                onChange={e => setWorkOrder(wo => ({ ...wo, comments: e.target.value }))} />
            </div>
            <Button size="sm" className="w-full h-9 text-xs font-semibold" onClick={submitWorkOrder} disabled={!workOrder.unit_number}>
              <Send className="w-3.5 h-3.5 mr-1" />Submit Work Order
            </Button>
          </CardContent>
        </Card>

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
        <div className="border-b border-border pb-1">
          <h3 className="text-sm font-bold flex items-center gap-1.5">
            <ClipboardList className="w-4 h-4" />Upcoming Services
            <Badge variant="secondary" className="text-[10px] ml-1">{allUpcoming.length}</Badge>
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

              return (
                <Card key={s.id} className={`transition-all shadow-sm ${isFirst ? "border-green-500/40 shadow-md ring-1 ring-green-500/10" : isExpanded ? "border-primary/20" : "hover:border-muted-foreground/30"} ${isProjected ? "border-dashed" : ""}`}>
                  <button className="w-full text-left p-3 flex items-center justify-between" onClick={() => !isFirst && setExpandedUpcomingId(isExpanded && !isFirst ? null : s.id)}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {isFirst && <Badge className="text-[10px] bg-green-600 text-white">Next Service</Badge>}
                        <p className={`font-semibold ${isFirst ? "text-sm" : "text-xs"}`}>{s.service_type}</p>
                        {isProjected && <Badge variant="outline" className="text-[10px]">Projected</Badge>}
                        {!isProjected && !isFirst && <Badge variant="secondary" className="text-[10px]">{(s as any).scheduling_status || "confirmed"}</Badge>}
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
      </div>
    </div>
  );
};

export default PropertyDashboard;
