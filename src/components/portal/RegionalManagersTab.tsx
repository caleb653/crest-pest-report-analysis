import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, ChevronRight, ArrowLeft, Mail, Building2, Users } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ExternalLink, Pencil } from "lucide-react";

interface RegionalManager {
  id: string;
  name: string;
  email: string | null;
  property_ids: string[];
  notes: string | null;
}

interface PropertyLite {
  id: string;
  name: string;
  client_id: string;
  customer_preferences: any;
}
interface ServiceLite {
  id: string;
  property_id: string;
  service_type: string;
  status: string;
  service_date: string | null;
  unit_details: any;
}

const propertyType = (p: PropertyLite): "apartments" | "hoa" | "commercial" => {
  const t = (p.customer_preferences as any)?.property_type;
  if (t === "hoa" || t === "commercial" || t === "apartments") return t;
  return "apartments";
};

const parseMoney = (s: any): number | null => {
  if (s == null) return null;
  const n = parseFloat(String(s).replace(/[^0-9.]/g, ""));
  return isFinite(n) && n > 0 ? n : null;
};
const parseInt2 = (s: any): number | null => {
  if (s == null) return null;
  const n = parseInt(String(s).replace(/[^0-9]/g, ""), 10);
  return isFinite(n) && n > 0 ? n : null;
};

/** Days between two ISO date strings (YYYY-MM-DD). */
const daysBetween = (a: string, b: string): number => {
  const da = new Date(a).getTime();
  const db = new Date(b).getTime();
  if (!isFinite(da) || !isFinite(db)) return 0;
  return Math.round((db - da) / (1000 * 60 * 60 * 24));
};

const isFreeAndClear = (status: any): boolean =>
  /free\s*and\s*clear|free\s*&\s*clear|^clear$/i.test(String(status || ""));

export default function RegionalManagersTab() {
  const [managers, setManagers] = useState<RegionalManager[]>([]);
  const [properties, setProperties] = useState<PropertyLite[]>([]);
  const [services, setServices] = useState<ServiceLite[]>([]);
  const [surveys, setSurveys] = useState<any[]>([]);
  const [responses, setResponses] = useState<any[]>([]);
  const [links, setLinks] = useState<any[]>([]);
  const [selected, setSelected] = useState<RegionalManager | null>(null);

  const [showAdd, setShowAdd] = useState(false);
  const [draft, setDraft] = useState<{ name: string; email: string; property_ids: string[] }>({ name: "", email: "", property_ids: [] });

  const loadAll = async () => {
    const [{ data: rm }, { data: p }, { data: s }, { data: sv }, { data: rs }, { data: lk }] = await Promise.all([
      (supabase as any).from("regional_managers").select("*").order("name"),
      supabase.from("portal_properties").select("id,name,client_id,customer_preferences").order("name"),
      supabase.from("portal_services").select("id,property_id,service_type,status,service_date,unit_details"),
      (supabase as any).from("portal_surveys").select("id,property_id,questions"),
      (supabase as any).from("portal_survey_responses").select("survey_id,property_id,answers,submitted_at"),
      supabase.from("portal_links").select("id,token,link_type,assigned_property_ids,is_active"),
    ]);
    setManagers((rm || []).map((r: any) => ({ ...r, property_ids: Array.isArray(r.property_ids) ? r.property_ids : [] })));
    setProperties(p || []);
    setServices((s || []) as any);
    setSurveys(sv || []);
    setResponses(rs || []);
    setLinks(lk || []);
  };

  // Find a portal link for a given property — prefers a sub link assigned to that property
  const portalUrlForProperty = (propertyId: string): string | null => {
    const link = links.find((l: any) =>
      l.is_active !== false &&
      Array.isArray(l.assigned_property_ids) &&
      l.assigned_property_ids.includes(propertyId)
    );
    if (!link) return null;
    return `/portal/${link.token}`;
  };

  useEffect(() => { loadAll(); }, []);

  const saveManager = async () => {
    if (!draft.name.trim()) return;
    const { error } = await (supabase as any).from("regional_managers").insert({
      name: draft.name.trim(),
      email: draft.email.trim() || null,
      property_ids: draft.property_ids,
    });
    if (error) { toast({ title: "Save failed", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Regional manager added" });
    setShowAdd(false);
    setDraft({ name: "", email: "", property_ids: [] });
    loadAll();
  };

  const updateManagerProps = async (id: string, ids: string[]) => {
    const { error } = await (supabase as any).from("regional_managers").update({ property_ids: ids }).eq("id", id);
    if (!error) {
      setManagers((prev) => prev.map((m) => (m.id === id ? { ...m, property_ids: ids } : m)));
      if (selected?.id === id) setSelected({ ...selected, property_ids: ids });
    }
  };

  const deleteManager = async (id: string) => {
    if (!confirm("Delete this regional manager?")) return;
    await (supabase as any).from("regional_managers").delete().eq("id", id);
    if (selected?.id === id) setSelected(null);
    loadAll();
  };

  // ============= Onboarding answer lookup per property =============
  const onboardingByProperty = useMemo(() => {
    const onbSurveyIds = new Set(
      surveys.filter((s: any) => Array.isArray(s.questions) && s.questions.some((q: any) => typeof q?.id === "string" && q.id.startsWith("onb_"))).map((s: any) => s.id)
    );
    const map: Record<string, any> = {};
    responses
      .filter((r: any) => r.submitted_at && onbSurveyIds.has(r.survey_id))
      .forEach((r: any) => {
        const ans = r.answers || {};
        if (!map[r.property_id]) map[r.property_id] = ans;
        else {
          // merge — keep first non-empty value
          Object.keys(ans).forEach((k) => {
            if (map[r.property_id][k] == null || map[r.property_id][k] === "") map[r.property_id][k] = ans[k];
          });
        }
      });
    return map;
  }, [surveys, responses]);

  // ============= Per-property metrics =============
  const computeMetrics = (prop: PropertyLite) => {
    const onb = onboardingByProperty[prop.id] || {};
    const prefs = (prop.customer_preferences as any) || {};
    // Source of truth for property facts is the property record itself
    // (set on the Apartments tab). Onboarding survey is a fallback only.
    const totalUnits =
      parseInt2(prefs.total_units) ?? parseInt2(onb.onb_total_units);
    const rentalIncome =
      parseMoney(prefs.avg_monthly_rent) ?? parseMoney(onb.onb_rental_income);
    const freeAndClear = onb.onb_free_and_clear_time || null;

    // Only count visits that actually contain unit-level work
    const propServices = services.filter(
      (s) => s.property_id === prop.id && s.status === "completed" && Array.isArray(s.unit_details) && (s.unit_details as any[]).length > 0
    );
    // Group services by date — multiple rows on the same day = one visit
    const visitsByDate = new Map<string, any[]>();
    propServices.forEach((sv) => {
      const k = sv.service_date || sv.id;
      if (!visitsByDate.has(k)) visitsByDate.set(k, []);
      visitsByDate.get(k)!.push(sv);
    });
    const totalVisits = visitsByDate.size;
    const allUnitRows: any[] = [];
    propServices.forEach((sv) => {
      const rows = (sv.unit_details as any[]) || [];
      rows.forEach((u) => {
        const key = (u.unit_number || "").toString().trim();
        if (!key) return;
        allUnitRows.push({ ...u, _date: sv.service_date });
      });
    });
    const uniqueUnits = new Set(allUnitRows.map((u) => u.unit_number).filter(Boolean));
    const totalUnitsTreated = allUnitRows.length;
    // Simple: total units serviced (across all visits) / visits
    const avgUnitsPerVisit = totalVisits > 0 ? allUnitRows.length / totalVisits : 0;

    // Vacant/occupied breakdown across all unit rows
    const vacantRows = allUnitRows.filter((u) => /vacant/i.test(u.occupancy_status || u.status || ""));
    const occupiedRows = allUnitRows.filter((u) => /occupied/i.test(u.occupancy_status || u.status || ""));

    // Vacant Efficiency: previous month vs current month visits-to-vacant ratio
    const now = new Date();
    const cm = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const pm = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const pmKey = `${pm.getFullYear()}-${String(pm.getMonth() + 1).padStart(2, "0")}`;
    const vacantPrev = vacantRows.filter((u) => (u._date || "").startsWith(pmKey)).length;
    const vacantCurr = vacantRows.filter((u) => (u._date || "").startsWith(cm)).length;
    const vacantDiff = vacantPrev - vacantCurr; // fewer this month = improvement
    const gainedIncome = rentalIncome != null && vacantDiff > 0 ? vacantDiff * rentalIncome : 0;

    // Follow-ups
    const followUps = allUnitRows.filter((u) => u.follow_up_needed === true);
    const followUpsByUnit: Record<string, number> = {};
    followUps.forEach((u) => { if (u.unit_number) followUpsByUnit[u.unit_number] = (followUpsByUnit[u.unit_number] || 0) + 1; });
    const occupiedUnits = new Set(occupiedRows.map((u) => u.unit_number).filter(Boolean));
    const avgFollowUpsPerOccUnit = occupiedUnits.size > 0 ? followUps.length / occupiedUnits.size : 0;
    const threePlusCount = Object.values(followUpsByUnit).filter((c) => c >= 3).length;
    const threePlusPct = uniqueUnits.size > 0 ? (threePlusCount / uniqueUnits.size) * 100 : 0;

    // ---- NEW: weeks-to-free-and-clear (calculated from real service history)
    // For each unique unit that EVER reached "Free and Clear", measure the
    // number of days from its FIRST service to its FIRST free-and-clear
    // service, then convert to weeks. Average across all such units.
    const rowsByUnit = new Map<string, any[]>();
    allUnitRows.forEach((u) => {
      const k = (u.unit_number || "").toString().trim();
      if (!k) return;
      if (!rowsByUnit.has(k)) rowsByUnit.set(k, []);
      rowsByUnit.get(k)!.push(u);
    });
    const weeksSamples: number[] = [];
    const visitsToClearSamples: number[] = [];
    rowsByUnit.forEach((rows) => {
      const sorted = [...rows]
        .filter((r) => r._date)
        .sort((a, b) => (a._date || "").localeCompare(b._date || ""));
      if (sorted.length === 0) return;
      const firstDate = sorted[0]._date as string;
      const clearIdx = sorted.findIndex((r) => isFreeAndClear(r.status));
      if (clearIdx < 0) return;
      const clearDate = sorted[clearIdx]._date as string;
      weeksSamples.push(Math.max(0, daysBetween(firstDate, clearDate) / 7));
      visitsToClearSamples.push(clearIdx + 1);
    });
    const avgWeeksToClear =
      weeksSamples.length > 0 ? weeksSamples.reduce((a, b) => a + b, 0) / weeksSamples.length : 0;
    const avgVisitsToClear =
      visitsToClearSamples.length > 0
        ? visitsToClearSamples.reduce((a, b) => a + b, 0) / visitsToClearSamples.length
        : 0;

    // ---- NEW: average days to follow-up
    // For each unit, look at consecutive services where the EARLIER service
    // was flagged follow_up_needed=true; measure the gap (days) to the next
    // service. Average across all such gaps in the portfolio.
    const gapSamples: number[] = [];
    rowsByUnit.forEach((rows) => {
      const sorted = [...rows]
        .filter((r) => r._date)
        .sort((a, b) => (a._date || "").localeCompare(b._date || ""));
      for (let i = 0; i < sorted.length - 1; i++) {
        if (sorted[i].follow_up_needed === true) {
          gapSamples.push(daysBetween(sorted[i]._date, sorted[i + 1]._date));
        }
      }
    });
    const avgDaysToFollowUp =
      gapSamples.length > 0 ? gapSamples.reduce((a, b) => a + b, 0) / gapSamples.length : 0;

    return {
      totalUnits, rentalIncome, freeAndClear,
      totalVisits, uniqueUnits: uniqueUnits.size,
      totalUnitsTreated,
      vacantRows: vacantRows.length, occupiedRows: occupiedRows.length,
      avgUnitsPerVisit, vacantPrev, vacantCurr, vacantDiff, gainedIncome,
      avgFollowUpsPerOccUnit, threePlusCount, threePlusPct,
      avgWeeksToClear, avgVisitsToClear, avgDaysToFollowUp,
    };
  };

  // ============ MANAGER LIST ============
  if (!selected) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-base flex items-center gap-2"><Users className="w-4 h-4" />Regional Managers</CardTitle>
          <Dialog open={showAdd} onOpenChange={setShowAdd}>
            <DialogTrigger asChild><Button size="sm"><Plus className="w-4 h-4 mr-1" />Add Regional Manager</Button></DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader><DialogTitle>Add Regional Manager</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label>Name *</Label><Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></div>
                <div><Label>Email</Label><Input type="email" value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} /></div>
                <div>
                  <Label>Properties Managed</Label>
                  <div className="border rounded-md p-3 max-h-64 overflow-y-auto space-y-1.5 mt-1">
                    {properties.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No properties available.</p>
                    ) : properties.map((p) => {
                      const checked = draft.property_ids.includes(p.id);
                      return (
                        <label key={p.id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted/50 rounded px-1 py-0.5">
                          <Checkbox checked={checked} onCheckedChange={(v) => {
                            setDraft((d) => ({
                              ...d,
                              property_ids: v ? [...d.property_ids, p.id] : d.property_ids.filter((id) => id !== p.id),
                            }));
                          }} />
                          <span className="flex-1">{p.name}</span>
                          <Badge variant="outline" className="text-[10px] capitalize">{propertyType(p)}</Badge>
                        </label>
                      );
                    })}
                  </div>
                </div>
                <Button onClick={saveManager} disabled={!draft.name.trim()} className="w-full">Add Regional Manager</Button>
              </div>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {managers.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Users className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p className="font-medium">No regional managers yet</p>
              <p className="text-xs mt-1">Click "Add Regional Manager" to get started</p>
            </div>
          ) : (
            <div className="space-y-2">
              {managers.map((m) => (
                <div key={m.id} className="border rounded-lg p-4 hover:border-primary/40 hover:bg-muted/30 transition-colors group">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setSelected(m)}>
                      <p className="font-medium">{m.name}</p>
                      {m.email && <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5"><Mail className="w-3 h-3" />{m.email}</p>}
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5"><Building2 className="w-3 h-3" />{m.property_ids.length} properties</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" size="sm" onClick={(e) => e.stopPropagation()}>
                            <Pencil className="w-3.5 h-3.5 mr-1" />Edit Properties
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-80 p-3" onClick={(e) => e.stopPropagation()}>
                          <p className="text-xs font-medium mb-2">Assigned Properties (admin only)</p>
                          <div className="max-h-64 overflow-y-auto space-y-1.5">
                            {properties.map((p) => {
                              const checked = m.property_ids.includes(p.id);
                              return (
                                <label key={p.id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted/50 rounded px-1 py-0.5">
                                  <Checkbox checked={checked} onCheckedChange={(v) => {
                                    const next = v ? [...m.property_ids, p.id] : m.property_ids.filter((id) => id !== p.id);
                                    updateManagerProps(m.id, next);
                                  }} />
                                  <span className="flex-1">{p.name}</span>
                                  <Badge variant="outline" className="text-[10px] capitalize">{propertyType(p)}</Badge>
                                </label>
                              );
                            })}
                          </div>
                        </PopoverContent>
                      </Popover>
                      <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100" onClick={(e) => { e.stopPropagation(); deleteManager(m.id); }}>
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                      <ChevronRight className="w-5 h-5 text-muted-foreground cursor-pointer" onClick={() => setSelected(m)} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  // ============ DETAIL VIEW ============
  const managedProps = properties.filter((p) => selected.property_ids.includes(p.id));
  const apartmentProps = managedProps.filter((p) => propertyType(p) === "apartments");

  // Portfolio totals
  const totalUnitsSum = apartmentProps.reduce((acc, p) => {
    const prefs = (p.customer_preferences as any) || {};
    return acc + (parseInt2(prefs.total_units) ?? parseInt2(onboardingByProperty[p.id]?.onb_total_units) ?? 0);
  }, 0);
  const incomes = apartmentProps
    .map((p) => {
      const prefs = (p.customer_preferences as any) || {};
      return parseMoney(prefs.avg_monthly_rent) ?? parseMoney(onboardingByProperty[p.id]?.onb_rental_income);
    })
    .filter((v): v is number => v != null);
  const avgIncome = incomes.length > 0 ? incomes.reduce((a, b) => a + b, 0) / incomes.length : 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => setSelected(null)}><ArrowLeft className="w-4 h-4 mr-1" />Back</Button>
          <div className="flex-1">
            <CardTitle className="text-lg">{selected.name}</CardTitle>
            {selected.email && <p className="text-xs text-muted-foreground">{selected.email}</p>}
          </div>
          <Badge variant="secondary">{managedProps.length} properties</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Portfolio summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="border rounded-lg p-3">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Apartment Properties</p>
            <p className="text-2xl font-bold mt-1">{apartmentProps.length}</p>
          </div>
          <div className="border rounded-lg p-3">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Total Units</p>
            <p className="text-2xl font-bold mt-1">{totalUnitsSum || "—"}</p>
          </div>
          <div className="border rounded-lg p-3">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Avg Mo Rental Income</p>
            <p className="text-2xl font-bold mt-1">{avgIncome > 0 ? `$${Math.round(avgIncome).toLocaleString()}` : "—"}</p>
          </div>
          <div className="border rounded-lg p-3">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Properties (All Types)</p>
            <p className="text-2xl font-bold mt-1">{managedProps.length}</p>
          </div>
        </div>

        {/* Properties Managed list (read-only here; edit on main screen) */}
        <div>
          <Label className="text-sm">Properties Managed</Label>
          <div className="border rounded-md p-3 max-h-56 overflow-y-auto space-y-1.5 mt-1">
            {managedProps.length === 0 ? (
              <p className="text-xs text-muted-foreground">No properties assigned. Assign from the main Regional Managers screen.</p>
            ) : managedProps.map((p) => {
              const url = portalUrlForProperty(p.id);
              return (
                <div key={p.id} className="flex items-center gap-2 text-sm hover:bg-muted/50 rounded px-1 py-0.5">
                  {url ? (
                    <a href={url} target="_blank" rel="noopener noreferrer" className="flex-1 text-primary hover:underline flex items-center gap-1">
                      {p.name}<ExternalLink className="w-3 h-3" />
                    </a>
                  ) : (
                    <span className="flex-1">{p.name}</span>
                  )}
                  <Badge variant="outline" className="text-[10px] capitalize">{propertyType(p)}</Badge>
                </div>
              );
            })}
          </div>
        </div>

        {/* Per-property metrics */}
        <div>
          <p className="text-sm font-semibold mb-2">Property Metrics</p>
          <div className="border rounded-lg overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead rowSpan={2} className="align-bottom border-r">Property</TableHead>
                  <TableHead colSpan={2} className="text-center border-r bg-muted/30">General Property Info</TableHead>
                  <TableHead colSpan={3} className="text-center border-r bg-muted/30">General Treatment</TableHead>
                  <TableHead colSpan={4} className="text-center border-r bg-muted/30">Vacant Unit Efficiency</TableHead>
                  <TableHead colSpan={1} className="text-center border-r bg-muted/30">Occupied Eff.</TableHead>
                  <TableHead colSpan={2} className="text-center border-r bg-muted/30">3+ Follow-Ups</TableHead>
                  <TableHead colSpan={2} className="text-center border-r bg-muted/30">Time to Free &amp; Clear</TableHead>
                  <TableHead colSpan={1} className="text-center bg-muted/30">Follow-Up Cadence</TableHead>
                </TableRow>
                <TableRow>
                  <TableHead className="text-xs">Total Units</TableHead>
                  <TableHead className="text-xs border-r">Avg Mo Rent</TableHead>
                  <TableHead className="text-xs">Visits</TableHead>
                  <TableHead className="text-xs">Units Treated</TableHead>
                  <TableHead className="text-xs border-r">Avg/Visit</TableHead>
                  <TableHead className="text-xs">Prev</TableHead>
                  <TableHead className="text-xs">Curr</TableHead>
                  <TableHead className="text-xs">Diff</TableHead>
                  <TableHead className="text-xs border-r">Gained Income</TableHead>
                  <TableHead className="text-xs border-r">Avg FU/Unit</TableHead>
                  <TableHead className="text-xs">Count</TableHead>
                  <TableHead className="text-xs border-r">% of Total</TableHead>
                  <TableHead className="text-xs">Prev (survey)</TableHead>
                  <TableHead className="text-xs border-r">Crest (calc)</TableHead>
                  <TableHead className="text-xs">Avg Days</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {managedProps.length === 0 ? (
                  <TableRow><TableCell colSpan={15} className="text-center text-muted-foreground text-sm py-6">No properties assigned to this manager.</TableCell></TableRow>
                ) : managedProps.map((p) => {
                  const m = computeMetrics(p);
                  const url = portalUrlForProperty(p.id);
                  return (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium border-r">
                        {url ? (
                          <a href={url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">
                            {p.name}<ExternalLink className="w-3 h-3" />
                          </a>
                        ) : p.name}
                      </TableCell>
                      <TableCell>{m.totalUnits != null ? <>{m.totalUnits}<span className="text-[10px] text-muted-foreground ml-1">units</span></> : "—"}</TableCell>
                      <TableCell className="border-r">{m.rentalIncome != null ? <>${Math.round(m.rentalIncome).toLocaleString()}<span className="text-[10px] text-muted-foreground ml-1">/mo</span></> : "—"}</TableCell>
                      <TableCell>{m.totalVisits}<span className="text-[10px] text-muted-foreground ml-1">visits</span></TableCell>
                      <TableCell>{m.totalUnitsTreated}<span className="text-[10px] text-muted-foreground ml-1">units</span></TableCell>
                      <TableCell className="border-r">{m.avgUnitsPerVisit ? <>{m.avgUnitsPerVisit.toFixed(1)}<span className="text-[10px] text-muted-foreground ml-1">units</span></> : "—"}</TableCell>
                      <TableCell>{m.vacantPrev}<span className="text-[10px] text-muted-foreground ml-1">vac</span></TableCell>
                      <TableCell>{m.vacantCurr}<span className="text-[10px] text-muted-foreground ml-1">vac</span></TableCell>
                      <TableCell className={m.vacantDiff > 0 ? "text-emerald-600 font-medium" : m.vacantDiff < 0 ? "text-destructive font-medium" : ""}>
                        {m.vacantDiff > 0 ? `+${m.vacantDiff}` : m.vacantDiff}<span className="text-[10px] text-muted-foreground ml-1 font-normal">units</span>
                      </TableCell>
                      <TableCell className="border-r">{m.gainedIncome > 0 ? <>${Math.round(m.gainedIncome).toLocaleString()}<span className="text-[10px] text-muted-foreground ml-1">/mo</span></> : "—"}</TableCell>
                      <TableCell className="border-r">{m.avgFollowUpsPerOccUnit ? <>{m.avgFollowUpsPerOccUnit.toFixed(2)}<span className="text-[10px] text-muted-foreground ml-1">per unit</span></> : "—"}</TableCell>
                      <TableCell>{m.threePlusCount}<span className="text-[10px] text-muted-foreground ml-1">units</span></TableCell>
                      <TableCell className="border-r">{m.threePlusPct ? `${m.threePlusPct.toFixed(0)}%` : "—"}</TableCell>
                      <TableCell className="text-xs">{m.freeAndClear || "—"}</TableCell>
                      <TableCell className="text-xs border-r">
                        {m.avgWeeksToClear ? (
                          <>
                            {m.avgWeeksToClear.toFixed(1)}<span className="text-[10px] text-muted-foreground ml-1">wks</span>
                            <span className="text-[10px] text-muted-foreground ml-1">({m.avgVisitsToClear.toFixed(1)} visits)</span>
                          </>
                        ) : "—"}
                      </TableCell>
                      <TableCell className="text-xs">
                        {m.avgDaysToFollowUp ? <>{m.avgDaysToFollowUp.toFixed(0)}<span className="text-[10px] text-muted-foreground ml-1">days</span></> : "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <p className="text-[11px] text-muted-foreground mt-2">
            Total Units &amp; Avg Mo Rent come from the property settings on the Apartments tab (with onboarding-survey fallback). Visits, vacancy, follow-ups, Crest's time-to-free-&amp;-clear, and avg days-to-follow-up are all calculated live from completed service unit details. Gained Income = (Vacant Prev − Vacant Curr) × Avg Mo Rent.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}