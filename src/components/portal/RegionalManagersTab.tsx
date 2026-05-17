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

/** Parse the onboarding answer for question #8 (free-and-clear time) into weeks. */
const parseSurveyWeeks = (s: any): number | null => {
  if (!s) return null;
  const str = String(s).toLowerCase();
  if (str.includes("less than 1")) return 0.5;
  if (str.includes("5+") || str.includes("5 +")) return 5;
  const m = str.match(/(\d+(?:\.\d+)?)/);
  return m ? parseFloat(m[1]) : null;
};

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
    // Cadence is the property's configured appointment frequency (set by admin
    // on the PM portal). Follow-ups always land on the next scheduled visit,
    // so every downstream "weeks" / "days-to-follow-up" metric uses this.
    const freqKey = String(prefs.service_frequency || "bi-weekly");
    const FREQ_DAYS: Record<string, number> = {
      weekly: 7,
      "bi-weekly": 14,
      monthly: 30,
      "8-weekly": 56,
      "bi-monthly": 60,
      "12-weekly": 84,
      quarterly: 90,
    };
    const cadenceDays = FREQ_DAYS[freqKey] ?? 14;
    const cadenceWeeks = cadenceDays / 7;
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

    // (Efficiency-to-clear values now derived below from survey + Crest calc.)

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
    const avgVisitsToClear =
      visitsToClearSamples.length > 0
        ? visitsToClearSamples.reduce((a, b) => a + b, 0) / visitsToClearSamples.length
        : 0;
    // Weeks-to-clear is grounded in real visit cadence: a unit cleared in
    // N visits cannot have cleared in less than N × cadence weeks (you
    // physically only see it on visit days). This replaces the old
    // arbitrary 1.1-wk floor that was producing nonsense rows.
    const avgWeeksToClearDisplay =
      avgVisitsToClear > 0 ? avgVisitsToClear * cadenceWeeks : 0;

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
    const avgDaysToFollowUpRaw =
      gapSamples.length > 0 ? gapSamples.reduce((a, b) => a + b, 0) / gapSamples.length : 0;
    // Follow-ups always happen on the next scheduled visit, so cadence here
    // must be exactly one visit interval — never a fractional in-between.
    const avgDaysToFollowUp = avgDaysToFollowUpRaw > 0 ? cadenceDays : 0;

    // ---- Vacant-unit clearance efficiency (Prev = survey, Curr = Crest calc)
    const prevWeeks = parseSurveyWeeks(onb.onb_free_and_clear_time);
    const currWeeks = avgWeeksToClearDisplay > 0 ? avgWeeksToClearDisplay : null;
    const weeksSaved =
      prevWeeks != null && currWeeks != null ? prevWeeks - currWeeks : null;
    // Diff $ = weeks saved × monthly rent / 4.1 (avg weeks per month)
    const effGainedIncome =
      weeksSaved != null && weeksSaved > 0 && rentalIncome != null
        ? (weeksSaved * rentalIncome) / 4.1
        : 0;

    return {
      totalUnits, rentalIncome, freeAndClear,
      totalVisits, uniqueUnits: uniqueUnits.size,
      totalUnitsTreated,
      vacantRows: vacantRows.length, occupiedRows: occupiedRows.length,
      avgUnitsPerVisit,
      prevWeeks, currWeeks, weeksSaved, effGainedIncome,
      avgFollowUpsPerOccUnit, threePlusCount, threePlusPct,
      avgWeeksToClear: avgWeeksToClearDisplay, avgVisitsToClear, avgDaysToFollowUp,
      cadenceDays,
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
          <div className="flex items-baseline justify-between mb-3 px-1">
            <p className="text-sm font-semibold tracking-tight">Property Metrics</p>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Live from service data</p>
          </div>
          <div className="border rounded-xl overflow-hidden bg-card shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-separate border-spacing-0 [&_th]:border-b [&_td]:border-b [&_th]:border-border [&_td]:border-border/60">
                <thead className="bg-muted/40">
                  <tr className="[&>th]:px-3 [&>th]:py-2 [&>th]:text-[10px] [&>th]:font-semibold [&>th]:uppercase [&>th]:tracking-wider [&>th]:text-muted-foreground [&>th]:text-center">
                    <th rowSpan={2} className="!text-left align-bottom !px-4 sticky left-0 z-10 bg-muted/40 border-r">Property</th>
                    <th colSpan={2} className="border-r">Property Info</th>
                    <th colSpan={3} className="border-r">General Treatment</th>
                    <th colSpan={4} className="border-r bg-emerald-50/60 dark:bg-emerald-950/20 !text-emerald-700 dark:!text-emerald-400">Efficiency to Clear Vacant Unit Pests</th>
                    <th className="border-r">Occupied Eff.</th>
                    <th colSpan={2} className="border-r">3+ Follow-Ups</th>
                    <th colSpan={2} className="border-r">Time to Free &amp; Clear</th>
                    <th>Follow-Up Cadence</th>
                  </tr>
                  <tr className="[&>th]:px-3 [&>th]:py-2 [&>th]:text-[10px] [&>th]:font-medium [&>th]:text-muted-foreground [&>th]:text-right [&>th]:normal-case">
                    <th>Total Units</th>
                    <th className="border-r">Avg Mo Rent</th>
                    <th>Visits</th>
                    <th>Units Treated</th>
                    <th className="border-r">Avg/Visit</th>
                    <th className="bg-emerald-50/40 dark:bg-emerald-950/10">Prev (wks)</th>
                    <th className="bg-emerald-50/40 dark:bg-emerald-950/10">Curr (wks)</th>
                    <th className="bg-emerald-50/40 dark:bg-emerald-950/10">Diff (wks)</th>
                    <th className="border-r bg-emerald-50/40 dark:bg-emerald-950/10 leading-tight">
                      Diff ($/unit)
                      <div className="text-[9px] font-normal text-muted-foreground/70 normal-case mt-0.5">
                        (Prev−Curr) × Rent ÷ 4.1
                      </div>
                    </th>
                    <th className="border-r">Avg FU/Unit</th>
                    <th>Count</th>
                    <th className="border-r">% of Total</th>
                    <th>Prev (survey)</th>
                    <th className="border-r">Crest (calc)</th>
                    <th>Avg Days</th>
                  </tr>
                </thead>
                <tbody>
                  {managedProps.length === 0 ? (
                    <tr><td colSpan={16} className="text-center text-muted-foreground text-sm py-8">No properties assigned to this manager.</td></tr>
                  ) : managedProps.map((p, idx) => {
                    const m = computeMetrics(p);
                    const url = portalUrlForProperty(p.id);
                    const zebra = idx % 2 === 1 ? "bg-muted/20" : "";
                    const num = "px-3 py-2.5 text-right tabular-nums whitespace-nowrap";
                    const sub = "text-[10px] text-muted-foreground ml-0.5 font-normal";
                    return (
                      <tr key={p.id} className={`${zebra} hover:bg-accent/40 transition-colors`}>
                        <td className={`px-4 py-2.5 font-medium border-r sticky left-0 z-10 ${zebra || "bg-card"}`}>
                          {url ? (
                            <a href={url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">
                              {p.name}<ExternalLink className="w-3 h-3" />
                            </a>
                          ) : p.name}
                        </td>
                        <td className={num}>{m.totalUnits != null ? <>{m.totalUnits}<span className={sub}>units</span></> : "—"}</td>
                        <td className={`${num} border-r`}>{m.rentalIncome != null ? <>${Math.round(m.rentalIncome).toLocaleString()}<span className={sub}>/mo</span></> : "—"}</td>
                        <td className={num}>{m.totalVisits}<span className={sub}>visits</span></td>
                        <td className={num}>{m.totalUnitsTreated}<span className={sub}>units</span></td>
                        <td className={`${num} border-r`}>{m.avgUnitsPerVisit ? <>{m.avgUnitsPerVisit.toFixed(1)}<span className={sub}>units</span></> : "—"}</td>
                        <td className={num}>{m.prevWeeks != null ? <>{m.prevWeeks}<span className={sub}>wks</span></> : "—"}</td>
                        <td className={num}>{m.currWeeks != null ? <>{m.currWeeks.toFixed(1)}<span className={sub}>wks</span></> : "—"}</td>
                        <td className={`${num} ${m.weeksSaved != null && m.weeksSaved > 0 ? "text-emerald-600 font-semibold" : ""}`}>
                          {m.weeksSaved != null ? <>{m.weeksSaved.toFixed(1)}<span className={`${sub} ${m.weeksSaved > 0 ? "text-emerald-600/70" : ""}`}>wks</span></> : "—"}
                        </td>
                        <td className={`${num} border-r ${m.effGainedIncome > 0 ? "text-emerald-600 font-semibold" : ""}`}>
                          {m.effGainedIncome > 0 ? <>${Math.round(m.effGainedIncome).toLocaleString()}<span className={`${sub} ${m.effGainedIncome > 0 ? "text-emerald-600/70" : ""}`}>/unit</span></> : "—"}
                        </td>
                        <td className={`${num} border-r`}>{m.avgFollowUpsPerOccUnit ? <>{m.avgFollowUpsPerOccUnit.toFixed(2)}<span className={sub}>/unit</span></> : "—"}</td>
                        <td className={num}>{m.threePlusCount}<span className={sub}>units</span></td>
                        <td className={`${num} border-r`}>{m.threePlusPct ? `${m.threePlusPct.toFixed(0)}%` : "—"}</td>
                        <td className={num}>{m.freeAndClear || "—"}</td>
                        <td className={`${num} border-r`}>
                          {m.avgWeeksToClear ? (
                            <>
                              {m.avgWeeksToClear.toFixed(1)}<span className={sub}>wks</span>
                              <div className="text-[10px] text-muted-foreground font-normal">({m.avgVisitsToClear.toFixed(1)} visits)</div>
                            </>
                          ) : "—"}
                        </td>
                        <td className={num}>
                          {m.avgDaysToFollowUp ? <>{m.avgDaysToFollowUp.toFixed(0)}<span className={sub}>days</span></> : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground mt-3 px-1 leading-relaxed">
            <b className="text-foreground">Total Units</b> &amp; <b className="text-foreground">Avg Mo Rent</b> come from the property settings on the Apartments tab (with onboarding-survey fallback). Visits, follow-ups, Crest's time-to-free-&amp;-clear, and avg days-to-follow-up are calculated live from completed service unit details.
            <span className="block mt-1"><b className="text-emerald-700 dark:text-emerald-400">Efficiency to Clear Vacant Unit Pests:</b> Prev = onboarding survey Q8 (weeks with previous provider). Curr = avg visits-to-clear × real visit cadence (weekly = 7d, bi-weekly = 14d) — units can only clear on a visit day. Diff $/unit = (Prev − Curr) × Avg Mo Rent ÷ 4.1 weeks/mo.</span>
            <span className="block mt-1"><b className="text-foreground">Follow-Up Cadence — Avg Days:</b> snapped to the property's actual visit interval (7 or 14 days). Follow-ups are always performed on the next scheduled visit, never in between.</span>
          </p>
        </div>
      </CardContent>
    </Card>
  );
}