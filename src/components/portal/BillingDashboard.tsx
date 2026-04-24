import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, List, DollarSign, AlertTriangle, Building2 } from "lucide-react";
import { readUnitPlanConfig, computeOverage, formatOverageMoney } from "@/lib/unitOverage";

interface PortalProperty {
  id: string;
  client_id: string;
  name: string;
  customer_preferences: any;
}
interface PortalClient { id: string; name: string; company: string | null; }
interface PortalService {
  id: string;
  property_id: string;
  service_date: string | null;
  service_type: string;
  technician: string | null;
  status: string;
  unit_details: any;
  units_planned: any;
}

interface Props {
  clients: PortalClient[];
  properties: PortalProperty[];
  services: PortalService[];
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const ymdToDate = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};
const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const formatMoney = (n: number) => formatOverageMoney(n);

export default function BillingDashboard({ clients, properties, services }: Props) {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth()); // 0-indexed
  const [propertyFilter, setPropertyFilter] = useState<string>("all");
  const [view, setView] = useState<"calendar" | "list" | "rollup">("calendar");

  const propertyById = useMemo(() => {
    const m = new Map<string, PortalProperty>();
    properties.forEach(p => m.set(p.id, p));
    return m;
  }, [properties]);
  const clientById = useMemo(() => {
    const m = new Map<string, PortalClient>();
    clients.forEach(c => m.set(c.id, c));
    return m;
  }, [clients]);

  // Decorate services with computed billing info
  const decoratedServices = useMemo(() => {
    return services
      .filter(s => s.service_date)
      .map(s => {
        const prop = propertyById.get(s.property_id);
        const cfg = readUnitPlanConfig(prop?.customer_preferences);
        const isCompleted = s.status === "completed";
        const totalUnits = isCompleted
          ? (Array.isArray(s.unit_details) ? (s.unit_details as any[]).length : 0)
          : (Array.isArray(s.units_planned) ? (s.units_planned as string[]).length : 0);
        const overage = computeOverage(totalUnits, cfg);
        const basePrice = Number(cfg.base_service_price || 0);
        const totalRevenue = basePrice + overage.overageCost;
        return {
          service: s,
          property: prop,
          client: prop ? clientById.get(prop.client_id) : undefined,
          basePrice,
          overage,
          totalRevenue,
        };
      });
  }, [services, propertyById, clientById]);

  // Apply property filter
  const filteredServices = useMemo(
    () =>
      propertyFilter === "all"
        ? decoratedServices
        : decoratedServices.filter(d => d.service.property_id === propertyFilter),
    [decoratedServices, propertyFilter]
  );

  // Services in the selected month
  const monthServices = useMemo(() => {
    return filteredServices.filter(d => {
      if (!d.service.service_date) return false;
      const dt = ymdToDate(d.service.service_date);
      return dt.getFullYear() === year && dt.getMonth() === month;
    });
  }, [filteredServices, year, month]);

  // Group month services by date for the calendar
  const servicesByDay = useMemo(() => {
    const m = new Map<string, typeof monthServices>();
    monthServices.forEach(d => {
      const key = d.service.service_date!;
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(d);
    });
    return m;
  }, [monthServices]);

  // Month totals
  const monthTotals = useMemo(() => {
    const totalServices = monthServices.length;
    const totalRevenue = monthServices.reduce((sum, d) => sum + d.totalRevenue, 0);
    const totalOverageUnits = monthServices.reduce((sum, d) => sum + d.overage.unitsOver, 0);
    const totalOverage = monthServices.reduce((sum, d) => sum + d.overage.overageCost, 0);
    return { totalServices, totalRevenue, totalOverageUnits, totalOverage };
  }, [monthServices]);

  // YTD per property roll-up (always all properties for the rollup view)
  const propertyRollup = useMemo(() => {
    const map = new Map<string, {
      property: PortalProperty | undefined;
      client: PortalClient | undefined;
      monthServices: number;
      monthRevenue: number;
      monthOverageUnits: number;
      monthOverage: number;
      ytdServices: number;
      ytdRevenue: number;
      ytdOverageUnits: number;
      ytdOverage: number;
    }>();
    decoratedServices.forEach(d => {
      if (!d.service.service_date) return;
      const dt = ymdToDate(d.service.service_date);
      if (dt.getFullYear() !== year) return;
      const key = d.service.property_id;
      if (!map.has(key)) {
        map.set(key, {
          property: d.property,
          client: d.client,
          monthServices: 0,
          monthRevenue: 0,
          monthOverageUnits: 0,
          monthOverage: 0,
          ytdServices: 0,
          ytdRevenue: 0,
          ytdOverageUnits: 0,
          ytdOverage: 0,
        });
      }
      const row = map.get(key)!;
      row.ytdServices += 1;
      row.ytdRevenue += d.totalRevenue;
      row.ytdOverageUnits += d.overage.unitsOver;
      row.ytdOverage += d.overage.overageCost;
      if (dt.getMonth() === month) {
        row.monthServices += 1;
        row.monthRevenue += d.totalRevenue;
        row.monthOverageUnits += d.overage.unitsOver;
        row.monthOverage += d.overage.overageCost;
      }
    });
    return Array.from(map.values()).sort((a, b) => b.ytdRevenue - a.ytdRevenue);
  }, [decoratedServices, year, month]);

  // Calendar grid: weeks rows × 7 cols, starts Sunday
  const calendarCells = useMemo(() => {
    const firstOfMonth = new Date(year, month, 1);
    const startOffset = firstOfMonth.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells: { date: Date | null; key: string }[] = [];
    for (let i = 0; i < startOffset; i++) cells.push({ date: null, key: `pad-${i}` });
    for (let d = 1; d <= daysInMonth; d++) {
      const dt = new Date(year, month, d);
      cells.push({ date: dt, key: ymd(dt) });
    }
    while (cells.length % 7 !== 0) cells.push({ date: null, key: `tail-${cells.length}` });
    return cells;
  }, [year, month]);

  const stepMonth = (delta: number) => {
    let nm = month + delta;
    let ny = year;
    if (nm < 0) { nm = 11; ny -= 1; }
    if (nm > 11) { nm = 0; ny += 1; }
    setMonth(nm);
    setYear(ny);
  };

  const todayKey = ymd(today);

  return (
    <div className="space-y-4">
      {/* Header / Filters */}
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => stepMonth(-1)}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <div className="min-w-[180px] text-center">
            <p className="text-lg font-bold leading-tight">{MONTH_NAMES[month]} {year}</p>
            <p className="text-xs text-muted-foreground">
              {monthTotals.totalServices} services • {formatMoney(monthTotals.totalRevenue)} projected
            </p>
          </div>
          <Button variant="outline" size="icon" onClick={() => stepMonth(1)}>
            <ChevronRight className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setMonth(today.getMonth()); setYear(today.getFullYear()); }}
          >
            Today
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Select value={propertyFilter} onValueChange={setPropertyFilter}>
            <SelectTrigger className="w-[220px]">
              <SelectValue placeholder="All properties" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All properties</SelectItem>
              {properties.map(p => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Month KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="Services this month" value={String(monthTotals.totalServices)} icon={CalendarIcon} />
        <KpiCard label="Projected revenue" value={formatMoney(monthTotals.totalRevenue)} icon={DollarSign} />
        <KpiCard label="Overage units" value={String(monthTotals.totalOverageUnits)} icon={AlertTriangle} accent="amber" />
        <KpiCard label="Overage $" value={formatMoney(monthTotals.totalOverage)} icon={DollarSign} accent="amber" />
      </div>

      <Tabs value={view} onValueChange={(v) => setView(v as any)}>
        <TabsList>
          <TabsTrigger value="calendar"><CalendarIcon className="w-4 h-4 mr-1" />Calendar</TabsTrigger>
          <TabsTrigger value="list"><List className="w-4 h-4 mr-1" />List</TabsTrigger>
          <TabsTrigger value="rollup"><Building2 className="w-4 h-4 mr-1" />Per-property</TabsTrigger>
        </TabsList>

        {/* Calendar */}
        <TabsContent value="calendar" className="mt-3">
          <Card>
            <CardContent className="p-3">
              <div className="grid grid-cols-7 text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(d => (
                  <div key={d} className="text-center py-1">{d}</div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {calendarCells.map(cell => {
                  if (!cell.date) {
                    return <div key={cell.key} className="min-h-[110px] rounded-md bg-muted/30" />;
                  }
                  const key = ymd(cell.date);
                  const dayServices = servicesByDay.get(key) || [];
                  const dayRevenue = dayServices.reduce((s, d) => s + d.totalRevenue, 0);
                  const isToday = key === todayKey;
                  return (
                    <div
                      key={cell.key}
                      className={`min-h-[110px] rounded-md border p-1.5 flex flex-col gap-1 ${
                        isToday ? "border-primary/70 bg-primary/[0.04]" : "border-border bg-background"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className={`text-xs font-semibold ${isToday ? "text-primary" : "text-foreground"}`}>
                          {cell.date.getDate()}
                        </span>
                        {dayRevenue > 0 && (
                          <span className="text-[10px] font-semibold text-muted-foreground">
                            {formatMoney(dayRevenue)}
                          </span>
                        )}
                      </div>
                      <div className="flex-1 space-y-1 overflow-hidden">
                        {dayServices.slice(0, 3).map(d => (
                          <div
                            key={d.service.id}
                            className={`text-[10px] leading-tight rounded px-1 py-0.5 truncate ${
                              d.overage.hasOverage
                                ? "bg-amber-100 text-amber-900 border border-amber-300"
                                : d.service.status === "completed"
                                ? "bg-primary/10 text-primary border border-primary/30"
                                : "bg-muted text-foreground border border-border"
                            }`}
                            title={`${d.property?.name || "Property"} • ${d.service.service_type} • ${formatMoney(d.totalRevenue)}`}
                          >
                            <span className="font-semibold">{d.property?.name || "—"}</span>
                            {d.overage.hasOverage && (
                              <span className="ml-1">+{d.overage.unitsOver}</span>
                            )}
                          </div>
                        ))}
                        {dayServices.length > 3 && (
                          <p className="text-[10px] text-muted-foreground">+{dayServices.length - 3} more</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* List */}
        <TabsContent value="list" className="mt-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{MONTH_NAMES[month]} {year} — Services</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {monthServices.length === 0 ? (
                <p className="p-6 text-center text-sm text-muted-foreground">No services this month.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                      <tr>
                        <th className="text-left px-3 py-2">Date</th>
                        <th className="text-left px-3 py-2">Property</th>
                        <th className="text-left px-3 py-2">Service</th>
                        <th className="text-left px-3 py-2">Tech</th>
                        <th className="text-right px-3 py-2">Units</th>
                        <th className="text-right px-3 py-2">Base</th>
                        <th className="text-right px-3 py-2">Overage</th>
                        <th className="text-right px-3 py-2">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {monthServices
                        .slice()
                        .sort((a, b) => (a.service.service_date || "").localeCompare(b.service.service_date || ""))
                        .map(d => (
                          <tr key={d.service.id} className="border-t hover:bg-muted/20">
                            <td className="px-3 py-2 whitespace-nowrap">{d.service.service_date}</td>
                            <td className="px-3 py-2">
                              <p className="font-semibold">{d.property?.name || "—"}</p>
                              <p className="text-xs text-muted-foreground">{d.client?.company || d.client?.name || ""}</p>
                            </td>
                            <td className="px-3 py-2">
                              <Badge variant="outline" className="text-xs">{d.service.service_type}</Badge>
                              {d.service.status === "completed" && (
                                <Badge className="ml-1 text-xs bg-primary text-primary-foreground">Completed</Badge>
                              )}
                            </td>
                            <td className="px-3 py-2">{d.service.technician || "—"}</td>
                            <td className="px-3 py-2 text-right">
                              {d.overage.totalUnits}
                              {d.overage.hasOverage && (
                                <span className="text-amber-700 font-semibold"> (+{d.overage.unitsOver})</span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-right">{formatMoney(d.basePrice)}</td>
                            <td className={`px-3 py-2 text-right ${d.overage.hasOverage ? "text-amber-700 font-semibold" : "text-muted-foreground"}`}>
                              {d.overage.overageCost > 0 ? formatMoney(d.overage.overageCost) : "—"}
                            </td>
                            <td className="px-3 py-2 text-right font-bold">{formatMoney(d.totalRevenue)}</td>
                          </tr>
                        ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 bg-muted/30 font-semibold">
                        <td className="px-3 py-2" colSpan={4}>Month total</td>
                        <td className="px-3 py-2 text-right">{monthTotals.totalOverageUnits} over</td>
                        <td className="px-3 py-2"></td>
                        <td className="px-3 py-2 text-right text-amber-700">{formatMoney(monthTotals.totalOverage)}</td>
                        <td className="px-3 py-2 text-right">{formatMoney(monthTotals.totalRevenue)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Per-property roll-up */}
        <TabsContent value="rollup" className="mt-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Per-property — {MONTH_NAMES[month]} {year} & YTD</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {propertyRollup.length === 0 ? (
                <p className="p-6 text-center text-sm text-muted-foreground">No services in {year} yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                      <tr>
                        <th className="text-left px-3 py-2">Property</th>
                        <th className="text-right px-3 py-2"># Services (mo)</th>
                        <th className="text-right px-3 py-2">Overage units (mo)</th>
                        <th className="text-right px-3 py-2">Overage $ (mo)</th>
                        <th className="text-right px-3 py-2">Revenue (mo)</th>
                        <th className="text-right px-3 py-2">YTD services</th>
                        <th className="text-right px-3 py-2">YTD overage $</th>
                        <th className="text-right px-3 py-2">YTD revenue</th>
                      </tr>
                    </thead>
                    <tbody>
                      {propertyRollup.map(row => (
                        <tr key={row.property?.id || Math.random()} className="border-t hover:bg-muted/20">
                          <td className="px-3 py-2">
                            <p className="font-semibold">{row.property?.name || "—"}</p>
                            <p className="text-xs text-muted-foreground">{row.client?.company || row.client?.name || ""}</p>
                          </td>
                          <td className="px-3 py-2 text-right">{row.monthServices}</td>
                          <td className={`px-3 py-2 text-right ${row.monthOverageUnits > 0 ? "text-amber-700 font-semibold" : ""}`}>
                            {row.monthOverageUnits}
                          </td>
                          <td className={`px-3 py-2 text-right ${row.monthOverage > 0 ? "text-amber-700 font-semibold" : "text-muted-foreground"}`}>
                            {row.monthOverage > 0 ? formatMoney(row.monthOverage) : "—"}
                          </td>
                          <td className="px-3 py-2 text-right font-bold">{formatMoney(row.monthRevenue)}</td>
                          <td className="px-3 py-2 text-right">{row.ytdServices}</td>
                          <td className={`px-3 py-2 text-right ${row.ytdOverage > 0 ? "text-amber-700" : "text-muted-foreground"}`}>
                            {row.ytdOverage > 0 ? formatMoney(row.ytdOverage) : "—"}
                          </td>
                          <td className="px-3 py-2 text-right font-bold">{formatMoney(row.ytdRevenue)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function KpiCard({
  label,
  value,
  icon: Icon,
  accent = "default",
}: {
  label: string;
  value: string;
  icon: any;
  accent?: "default" | "amber";
}) {
  const accentClasses =
    accent === "amber"
      ? "border-amber-300 bg-amber-50/60 text-amber-900"
      : "border-primary/30 bg-primary/[0.04] text-foreground";
  return (
    <div className={`rounded-lg border-2 p-3 ${accentClasses}`}>
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide opacity-80">
        <Icon className="w-4 h-4" />
        {label}
      </div>
      <p className="text-2xl font-bold mt-1">{value}</p>
    </div>
  );
}