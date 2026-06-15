// SlotFinder — PinGate-staff page wrapping the scheduling-find-slot /
// scheduling-check-slot edge functions.
//
//   Mode A "Find open slots":  pick one or more days (+ optional window) and get
//      the most efficient openings per day, each annotated with the Route
//      Manager's resulting stop count, per-window load, estimated route time,
//      and a plain-English justification.
//
//   Mode B "Check a day & window":  enter a date + time window and find out how
//      out-of-the-way that slot is and whether it's feasible.

import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  ArrowLeft, MapPin, CalendarClock, CheckCircle2, AlertTriangle, XCircle, ChevronDown, CalendarPlus, Target,
} from "lucide-react";

import { useCurrentStaff } from "@/hooks/useCurrentStaff";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  SelectGroup, SelectLabel,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuCheckboxItem, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import CustomerPicker, { type FRCustomer } from "@/components/CustomerPicker";
import PendingFieldRoutesWrites from "@/components/PendingFieldRoutesWrites";
import { SERVICE_TYPES, findServiceType, type ServiceType } from "@/lib/serviceTypes";

// ── Shared types (mirror tools/slot_finder.py output) ───────────────────────

type Stop = { customer_name: string; city: string; start_time: string; end_time: string };

type WindowCounts = { "8-12"?: number; "10-2"?: number; "1-5"?: number };

type RouteSnapshot = {
  stops: number;
  stops_excluding_tasks: number;
  stops_by_window: WindowCounts;
  total_drive_min: number;
  home_base_min?: number;
  est_route_hours: number;
  est_finish_min: number | null;
  has_home: boolean;
};

type AfterInsert = {
  stops: number;
  stops_excluding_tasks: number;
  stops_by_window: WindowCounts;
  est_route_hours: number;
  est_finish_min: number | null;
  new_stop_window: string | null;
};

type SlotCandidate = {
  score_sec: number;
  extra_sec_haversine: number;
  extra_sec_gmaps?: number | null;
  extra_miles_haversine: number;
  est_min: number | null;
  route_date: string;
  tech_name: string;
  insertion_kind?: string;
  detour_min?: number;
  detour_miles?: number;
  prev_stop: Stop;
  next_stop: Stop;
  route_snapshot?: RouteSnapshot;
  after_insert?: AfterInsert;
  justification?: string;
  // Mode B extras
  feasible?: "feasible" | "tight" | "not_feasible";
  reasons?: string[];
  off_by_min?: number | null;
};

type DayGroup = { date: string; weekday: string; slots: SlotCandidate[] };

type FindResult = {
  address: string;
  geocoded: { lat: number; lng: number; formatted: string };
  mode: "by_day" | "horizon";
  by_day?: DayGroup[];
  horizon_24h?: SlotCandidate[];
  horizon_72h?: SlotCandidate[];
  routes_scored: number;
  stops_in_horizon: number;
  error?: string;
};

type CheckResult = {
  address: string;
  geocoded: { lat: number; lng: number; formatted: string };
  date: string;
  requested_window: string;
  verdict: "feasible" | "tight" | "not_feasible" | "no_route";
  summary: string;
  options: SlotCandidate[];
  routes_considered: number;
};

// ── Formatting helpers ──────────────────────────────────────────────────────

function fmtTime(minSinceMidnight: number | null | undefined): string {
  if (minSinceMidnight === null || minSinceMidnight === undefined) return "?";
  const h24 = Math.floor(minSinceMidnight / 60);
  const m = minSinceMidnight % 60;
  const h12 = h24 % 12 || 12;
  const ampm = h24 < 12 ? "AM" : "PM";
  return `${h12}:${m.toString().padStart(2, "0")} ${ampm}`;
}

function fmtHHMMSS(s: string | null | undefined): string {
  if (!s) return "?";
  const [hStr, mStr] = s.split(":");
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  if (Number.isNaN(h) || Number.isNaN(m)) return s;
  return fmtTime(h * 60 + m);
}

function fmtWindow(start?: string | null, end?: string | null): string {
  if (!start || !end) return "?";
  return `${fmtHHMMSS(start)} – ${fmtHHMMSS(end)}`;
}

function detourMinutes(c: SlotCandidate): number {
  if (c.detour_min != null) return c.detour_min;
  const sec = c.extra_sec_gmaps ?? c.extra_sec_haversine;
  return Math.round(sec / 60);
}

function detourMiles(c: SlotCandidate): string {
  return (c.detour_miles ?? c.extra_miles_haversine).toFixed(1);
}

type DriveTier = "on_route" | "near" | "edge" | "long" | "very_long";
function driveTier(c: SlotCandidate): DriveTier {
  const min = detourMinutes(c);
  if (min >= 20) return "very_long";
  if (min >= 15) return "long";
  if (min >= 10) return "edge";
  if (min >= 5) return "near";
  return "on_route";
}

function tierBorder(c: SlotCandidate): string {
  switch (driveTier(c)) {
    case "very_long": return "border-l-4 border-l-red-500 bg-red-50/40";
    case "long": return "border-l-4 border-l-amber-500 bg-amber-50/40";
    case "edge": return "border-l-4 border-l-yellow-400 bg-yellow-50/40";
    case "near": return "border-l-4 border-l-green-400 bg-green-50/30";
    case "on_route": return "border-l-4 border-l-emerald-500 bg-emerald-50/40";
  }
}

function DetourBadge({ c }: { c: SlotCandidate }) {
  const min = detourMinutes(c);
  const cls =
    min >= 20 ? "bg-red-600 text-white"
    : min >= 15 ? "bg-amber-500 text-white"
    : min >= 10 ? "bg-yellow-400 text-black"
    : min >= 5 ? "bg-green-500 text-white"
    : "bg-emerald-600 text-white";
  const label =
    min >= 20 ? "VERY LONG DRIVE"
    : min >= 15 ? "LONG DRIVE"
    : min < 5 ? "ON ROUTE"
    : "NEAR";
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap">
      <span className="font-mono text-xs">+{min} min / +{detourMiles(c)} mi</span>
      <Badge className={`${cls} font-semibold`}>{label}</Badge>
    </span>
  );
}

// Same color scale as DetourBadge — used to tint the "Book in" pill so the
// recommendation visually matches the slot's overall proximity.
function tierPillClasses(c: SlotCandidate): string {
  const min = detourMinutes(c);
  if (min >= 20) return "bg-red-600 hover:bg-red-600 text-white";
  if (min >= 15) return "bg-amber-500 hover:bg-amber-500 text-white";
  if (min >= 10) return "bg-yellow-400 hover:bg-yellow-400 text-black";
  if (min >= 5) return "bg-green-500 hover:bg-green-500 text-white";
  return "bg-emerald-600 hover:bg-emerald-600 text-white";
}

function WindowChips({ counts, highlight }: { counts?: WindowCounts; highlight?: string | null }) {
  if (!counts) return null;
  const order: (keyof WindowCounts)[] = ["8-12", "10-2", "1-5"];
  return (
    <span className="inline-flex flex-wrap gap-1">
      {order.map((w) => {
        const n = counts[w] ?? 0;
        const isHi = highlight === w;
        return (
          <Badge
            key={w}
            variant="outline"
            className={isHi ? "border-emerald-500 bg-emerald-100 text-emerald-900" : "text-muted-foreground"}
          >
            {w}: {n}
          </Badge>
        );
      })}
    </span>
  );
}

// Canonical pretty label for a window key ("8-12" → "8 AM – 12 PM").
function windowLabel(w?: string | null): string | null {
  if (!w) return null;
  switch (w) {
    case "8-12": return "8:00 AM – 12:00 PM";
    case "10-2": return "10:00 AM – 2:00 PM";
    case "1-5":  return "1:00 PM – 5:00 PM";
    default: return w;
  }
}

// Next `count` business days (incl. today) as {iso, label} using local time.
function upcomingBusinessDays(count: number): { iso: string; label: string }[] {
  const out: { iso: string; label: string }[] = [];
  const d = new Date();
  while (out.length < count) {
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) {
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const label = d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
      out.push({ iso, label });
    }
    d.setDate(d.getDate() + 1);
  }
  return out;
}

// ── Page ─────────────────────────────────────────────────────────────────────

const SlotFinder = () => {
  const staff = useCurrentStaff();
  const navigate = useNavigate();
  useEffect(() => {
    const RESTRICTED = new Set(["Michael Muniz","Darrell Tanner","Dylan Gallegos","Jackson Latham"]);
    if (staff && RESTRICTED.has(staff.fullName)) navigate("/", { replace: true });
  }, [staff, navigate]);
  const days = useMemo(() => upcomingBusinessDays(21), []);

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate("/")}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to home
          </Button>
        </div>

        <Tabs defaultValue="find">
          <TabsList className="grid w-full grid-cols-2 md:w-auto md:inline-grid h-auto p-1.5 bg-muted border-2 border-border shadow-sm">
            <TabsTrigger
              value="find"
              className="gap-2 text-base font-semibold px-5 py-2.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md"
            >
              <MapPin className="w-4 h-4" /> Find open slots
            </TabsTrigger>
            <TabsTrigger
              value="check"
              className="gap-2 text-base font-semibold px-5 py-2.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md"
            >
              <CalendarClock className="w-4 h-4" /> Check a day &amp; window
            </TabsTrigger>
          </TabsList>

          <TabsContent value="find" className="mt-4">
            <FindMode staff={staff} dayOptions={days} />
          </TabsContent>
          <TabsContent value="check" className="mt-4">
            <CheckMode staff={staff} dayOptions={days} />
          </TabsContent>
        </Tabs>

        <PendingFieldRoutesWrites entityFilter="appointment" title="Pending appointment writes" />
      </div>
    </div>
  );
};

// Multi-select dropdown of the next ~21 working days. Selecting an item keeps
// the menu open (onSelect preventDefault) so several days can be picked at once.
function DayMultiSelect({
  options, selected, onChange,
}: {
  options: { iso: string; label: string }[];
  selected: string[];
  onChange: (v: string[]) => void;
}) {
  const toggle = (iso: string) =>
    onChange(selected.includes(iso) ? selected.filter((d) => d !== iso) : [...selected, iso]);
  const text =
    selected.length === 0 ? "Select days"
    : selected.length === 1 ? (options.find((o) => o.iso === selected[0])?.label ?? "1 day")
    : `${selected.length} days selected`;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="w-full md:w-72 justify-between font-normal">
          <span className="truncate">{text}</span>
          <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-72 max-h-80 overflow-y-auto">
        <div className="flex items-center justify-between px-2 py-1.5 text-xs">
          <button type="button" className="underline hover:text-foreground"
            onClick={() => onChange(options.slice(0, 3).map((o) => o.iso))}>Next 3 days</button>
          <button type="button" className="underline hover:text-foreground"
            onClick={() => onChange([])}>Clear</button>
        </div>
        <DropdownMenuSeparator />
        {options.map((o) => (
          <DropdownMenuCheckboxItem
            key={o.iso}
            checked={selected.includes(o.iso)}
            onCheckedChange={() => toggle(o.iso)}
            onSelect={(e) => e.preventDefault()}
          >
            {o.label}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ── Mode A: Find open slots ───────────────────────────────────────────────────

function FindMode({
  staff,
  dayOptions,
}: {
  staff: { fullName: string } | null;
  dayOptions: { iso: string; label: string }[];
}) {
  const [customer, setCustomer] = useState<FRCustomer | null>(null);
  const [address, setAddress] = useState("");
  const [serviceTypeLabel, setServiceTypeLabel] = useState<string>("");
  const [subscriptionId, setSubscriptionId] = useState<string>("");
  const [window, setWindow] = useState("none");
  const [selectedDates, setSelectedDates] = useState<string[]>(
    dayOptions.slice(0, 3).map((d) => d.iso), // default: next 3 working days
  );
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<FindResult | null>(null);

  const serviceType = findServiceType(serviceTypeLabel);
  // Inspections (= "standalone") force subscription_id = -1 and hide the input.
  // Subscription services require a real subscription id (NEVER -1).
  const isStandalone = serviceType?.kind === "standalone";

  const selectCustomer = (c: FRCustomer) => {
    setCustomer(c);
    const full = [c.address, [c.city, c.state].filter(Boolean).join(", "), c.zip].filter(Boolean).join(", ");
    if (full && !address.trim()) setAddress(full);
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!staff) return toast.error("Please sign in again.");
    if (address.trim().length < 4) return toast.error("Please enter a full street address.");
    if (selectedDates.length === 0) return toast.error("Pick at least one day.");

    setLoading(true);
    setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("scheduling-find-slot", {
        body: {
          staffName: staff.fullName,
          address: address.trim(),
          window: window === "none" ? null : window,
          use_google: true,
          dates: selectedDates,
          slots_per_day: 2,
        },
      });
      if (error) throw error;
      if (!data?.ok) return toast.error(data?.detail?.detail || data?.error || "Failed to find slots.");
      setResult(data.result as FindResult);
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || "Unexpected error.");
    } finally {
      setLoading(false);
    }
  };

  const byDay = result?.by_day ?? [];

  const canSchedule = !!customer && !!serviceType
    && (isStandalone || (subscriptionId.trim().length > 0 && subscriptionId.trim() !== "-1"));

  const scheduleContext = canSchedule ? {
    customer: customer!,
    serviceType: serviceType!,
    subscriptionId: isStandalone ? -1 : Number(subscriptionId.trim()),
    staffName: staff?.fullName ?? null,
  } : null;

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="w-5 h-5" /> Find open slots
          </CardTitle>
          <CardDescription>
            Pick the day(s) and an optional time window. Returns the 5 most
            efficient openings per day — each showing the Route Manager's
            resulting stops, per-window load, estimated route time, and why it
            works. Detours are traffic-aware via Google.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Customer (FieldRoutes)</Label>
              <CustomerPicker
                staffName={staff?.fullName ?? undefined}
                linkedId={customer?.customer_id ?? null}
                linkedLabel={customer?.name ?? customer?.company_name ?? null}
                onSelect={selectCustomer}
                onClear={() => setCustomer(null)}
              />
              <p className="text-xs text-muted-foreground">
                Required to click-to-schedule. Selecting a customer also autofills the address below.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="address">Service address</Label>
              <Input
                id="address"
                placeholder="e.g. 9 Harrisburg, Irvine CA 92620"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Service type *</Label>
                <Select value={serviceTypeLabel} onValueChange={(v) => { setServiceTypeLabel(v); if (findServiceType(v)?.kind === "standalone") setSubscriptionId(""); }}>
                  <SelectTrigger><SelectValue placeholder="Pick a service type" /></SelectTrigger>
                  <SelectContent className="max-h-80">
                    <SelectGroup>
                      <SelectLabel>Subscription (needs subscription id)</SelectLabel>
                      {SERVICE_TYPES.filter((s) => s.kind === "subscription").map((s) => (
                        <SelectItem key={s.label} value={s.label}>{s.label}</SelectItem>
                      ))}
                    </SelectGroup>
                    <SelectGroup>
                      <SelectLabel>Standalone / inspection (subscription_id = -1)</SelectLabel>
                      {SERVICE_TYPES.filter((s) => s.kind === "standalone").map((s) => (
                        <SelectItem key={s.label} value={s.label}>{s.label}</SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
                {serviceType && (
                  <p className="text-xs text-muted-foreground">
                    {isStandalone ? "Standalone — books with subscription_id = -1." : "Subscription — enter the customer's subscription id."}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Subscription ID {isStandalone ? "(not needed)" : "*"}</Label>
                <Input
                  value={isStandalone ? "" : subscriptionId}
                  onChange={(e) => setSubscriptionId(e.target.value.replace(/[^0-9]/g, ""))}
                  placeholder={isStandalone ? "—" : "e.g. 48213"}
                  disabled={isStandalone || !serviceType}
                  inputMode="numeric"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Days to search</Label>
              <DayMultiSelect options={dayOptions} selected={selectedDates} onChange={setSelectedDates} />
              <p className="text-xs text-muted-foreground">Next 3 working days are selected by default.</p>
            </div>

            <div className="space-y-2 md:w-64">
              <Label>Preferred window (optional)</Label>
              <Select value={window} onValueChange={setWindow}>
                <SelectTrigger><SelectValue placeholder="Any time" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Any time</SelectItem>
                  <SelectItem value="AM">AM (8 AM – 12 PM)</SelectItem>
                  <SelectItem value="PM">PM (12 PM – 5 PM)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button type="submit" disabled={loading} className="w-full md:w-auto">
              {loading ? "Searching…" : "Find slots"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {result && (
        <div className="mt-6 space-y-6">
          <p className="text-xs text-muted-foreground">
            Scored {result.routes_scored} route-openings across{" "}
            {result.stops_in_horizon} stops. Geocoded to{" "}
            <code>{result.geocoded.lat.toFixed(4)}, {result.geocoded.lng.toFixed(4)}</code>.
          </p>
          {(() => {
            // Rank every slot across every day by smallest detour minutes,
            // then fewest extra miles, and surface the top 2 at the top.
            type Ranked = { date: string; weekday: string; idx: number; c: SlotCandidate };
            const all: Ranked[] = [];
            byDay.forEach((day) => {
              day.slots.forEach((c, idx) => {
                all.push({ date: day.date, weekday: day.weekday, idx, c });
              });
            });
            all.sort((a, b) => {
              const am = detourMinutes(a.c);
              const bm = detourMinutes(b.c);
              if (am !== bm) return am - bm;
              return parseFloat(detourMiles(a.c)) - parseFloat(detourMiles(b.c));
            });
            const top = all.slice(0, 2);
            if (top.length === 0) return null;
            const DAILY_MAX_STOPS = 13;
            return (
              <div className="space-y-2">
                {top.map((r, i) => {
                  const recKey = (r.c.after_insert?.new_stop_window as string | null) ?? null;
                  const recLabel = windowLabel(recKey)
                    ?? fmtWindow(r.c.next_stop?.start_time, r.c.next_stop?.end_time);
                  const snap = r.c.route_snapshot;
                  const after = r.c.after_insert;
                  const beforeCount = recKey && snap?.stops_by_window
                    ? (snap.stops_by_window[recKey as keyof WindowCounts] ?? 0)
                    : 0;
                  const isCrowded = beforeCount >= 4;
                  const afterTotal = after?.stops_excluding_tasks ?? 0;
                  const isDayFull = afterTotal >= DAILY_MAX_STOPS;
                  const isPrimary = i === 0;
                  return (
                    <div key={`${r.date}#${r.idx}`} className={`rounded-md p-3 border-2 ${tierBorder(r.c)} flex flex-wrap items-center gap-3`}>
                      <Badge className={`${isPrimary ? "bg-emerald-600 hover:bg-emerald-600" : "bg-emerald-500/80 hover:bg-emerald-500/80"} text-white font-bold uppercase tracking-wide`}>
                        {isPrimary ? "★ Best Fit" : "★ 2nd Best"}
                      </Badge>
                      <span className="text-sm">
                        <span className="font-semibold">{r.c.tech_name}</span>
                        {" · "}
                        <span className="font-semibold">{r.weekday}, {r.date}</span>
                        {" · "}
                        <span className="font-semibold">{recLabel}</span>
                      </span>
                      {isCrowded && (
                        <Badge className="bg-orange-500 hover:bg-orange-500 text-white font-bold uppercase tracking-wide">
                          <AlertTriangle className="w-3 h-3 mr-1" />
                          Risk — already {beforeCount} stops in this window
                        </Badge>
                      )}
                      {isDayFull && (
                        <Badge className="bg-orange-500 hover:bg-orange-500 text-white font-bold uppercase tracking-wide">
                          <AlertTriangle className="w-3 h-3 mr-1" />
                          Risk — tech {afterTotal > DAILY_MAX_STOPS ? "over" : "at"} daily max ({afterTotal} stops)
                        </Badge>
                      )}
                      <span className="ml-auto"><DetourBadge c={r.c} /></span>
                    </div>
                  );
                })}
              </div>
            );
          })()}
          {!canSchedule && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
              Pick a customer{!serviceType ? " and a service type" : (!isStandalone && subscriptionId.trim() === "" ? " and a subscription id" : "")} above to enable the "Schedule" button on each slot.
            </p>
          )}
          {byDay.length === 0 && (
            <p className="text-sm italic text-muted-foreground">
              No field-tech routes on the selected day(s).
            </p>
          )}
          {(() => {
            // Recompute the same best-fit key so we can flag the matching SlotCard.
            let bestKey: string | null = null;
            let bestMin = Infinity;
            let bestMiles = Infinity;
            byDay.forEach((day) => {
              day.slots.forEach((c, idx) => {
                const m = detourMinutes(c);
                const mi = parseFloat(detourMiles(c));
                if (m < bestMin || (m === bestMin && mi < bestMiles)) {
                  bestMin = m;
                  bestMiles = mi;
                  bestKey = `${day.date}#${idx}`;
                }
              });
            });
            return byDay.map((day) => (
            <Card key={day.date}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">
                  {day.weekday} · {day.date}
                </CardTitle>
                <CardDescription>{day.slots.length} best opening(s)</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {day.slots.length === 0 && (
                  <p className="text-sm italic text-muted-foreground">No workable openings this day.</p>
                )}
                {day.slots.map((c, i) => (
                  <SlotCard
                    key={i}
                    c={c}
                    rank={i + 1}
                    date={day.date}
                    scheduleContext={scheduleContext}
                    isBestFit={bestKey === `${day.date}#${i}`}
                  />
                ))}
              </CardContent>
            </Card>
            ));
          })()}
        </div>
      )}
    </>
  );
}

type ScheduleContext = {
  customer: FRCustomer;
  serviceType: ServiceType;
  subscriptionId: number;
  staffName: string | null;
};

function SlotCard({
  c, rank, date, scheduleContext, isBestFit,
}: {
  c: SlotCandidate;
  rank: number;
  date?: string;
  scheduleContext?: ScheduleContext | null;
  isBestFit?: boolean;
}) {
  const snap = c.route_snapshot;
  const after = c.after_insert;
  const [booking, setBooking] = useState(false);

  const onSchedule = async () => {
    if (!scheduleContext) return;
    const start = c.next_stop?.start_time;
    const end = c.next_stop?.end_time;
    const useDate = date ?? c.route_date;
    if (!start || !end || !useDate) { toast.error("This slot is missing time data."); return; }
    const subLabel = scheduleContext.subscriptionId === -1 ? "standalone" : `subscription #${scheduleContext.subscriptionId}`;
    if (!window.confirm(`Queue this appointment for office approval?\n\n${scheduleContext.serviceType.label} for ${scheduleContext.customer.name || scheduleContext.customer.company_name}\n${useDate} ${start}–${end}\n${subLabel}`)) return;
    setBooking(true);
    try {
      const { data, error } = await supabase.functions.invoke("fieldroutes-appointment-submit", {
        body: {
          staffName: scheduleContext.staffName,
          customer_id: Number(scheduleContext.customer.customer_id),
          customer_label: scheduleContext.customer.name || scheduleContext.customer.company_name || `#${scheduleContext.customer.customer_id}`,
          service_type_id: scheduleContext.serviceType.id,
          service_type_label: scheduleContext.serviceType.label,
          date: useDate,
          start, end,
          duration: 30,
          subscription_id: scheduleContext.subscriptionId,
        },
      });
      if (error) throw error;
      if (!data?.ok) { toast.error(data?.error ?? "Failed to queue appointment."); return; }
      toast.success("Queued for office approval ✓");
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to queue appointment.");
    } finally {
      setBooking(false);
    }
  };

  return (
    <div className={`rounded-md p-3 ${tierBorder(c)} ${isBestFit ? "ring-2 ring-emerald-500 ring-offset-1" : ""}`}>
      {/* ── Top row: rank + tech + drive tier ─────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Badge variant="secondary">#{rank}</Badge>
          <span className="font-semibold">{c.tech_name}</span>
          {isBestFit && (
            <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white font-bold uppercase tracking-wide">
              ★ Best Fit
            </Badge>
          )}
        </div>
        <DetourBadge c={c} />
      </div>

      {/* ── BIG recommendation pill — single source of truth for the window
          we're telling the office to book. Derived from `new_stop_window`
          (the algorithm's actual pick) and falls back to the next_stop
          window only when upstream didn't return one. ────────────────── */}
      {(() => {
        const recKey = (after?.new_stop_window as string | null) ?? null;
        const recLabel = windowLabel(recKey) ?? fmtWindow(c.next_stop?.start_time, c.next_stop?.end_time);
        const beforeCount = recKey && snap?.stops_by_window
          ? (snap.stops_by_window[recKey as keyof WindowCounts] ?? 0)
          : 0;
        const isCrowded = beforeCount >= 4;
        const DAILY_MAX_STOPS = 13;
        const afterTotal = after?.stops_excluding_tasks ?? 0;
        const isDayFull = afterTotal >= DAILY_MAX_STOPS;
        return (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <div className={`inline-flex items-center gap-2 rounded-md px-3 py-1.5 shadow-sm ${tierPillClasses(c)}`}>
              <Target className="w-4 h-4" />
              <span className="text-[11px] font-bold uppercase tracking-wide opacity-90">Book in</span>
              <span className="text-sm font-bold">{recLabel}</span>
            </div>
            {isCrowded && (
              <Badge className="bg-orange-500 hover:bg-orange-500 text-white font-bold uppercase tracking-wide">
                <AlertTriangle className="w-3 h-3 mr-1" />
                Risk — already {beforeCount} stops in this window
              </Badge>
            )}
            {isDayFull && (
              <Badge className="bg-orange-500 hover:bg-orange-500 text-white font-bold uppercase tracking-wide">
                <AlertTriangle className="w-3 h-3 mr-1" />
                Risk — tech {afterTotal > DAILY_MAX_STOPS ? "over" : "at"} daily max ({afterTotal} stops)
              </Badge>
            )}
          </div>
        );
      })()}

      <div className="mt-2 text-xs text-muted-foreground">
        Inserts between <span className="font-medium text-foreground">{c.prev_stop?.customer_name}</span> ({c.prev_stop?.city})
        {" → "}
        <span className="font-medium text-foreground">{c.next_stop?.customer_name}</span> ({c.next_stop?.city})
      </div>

      {snap && after && (
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
          <span>
            Stops: <span className="font-semibold">{snap.stops_excluding_tasks} → {after.stops_excluding_tasks}</span>
          </span>
          <span className="flex items-center gap-1">
            After: <WindowChips counts={after.stops_by_window} highlight={after.new_stop_window} />
          </span>
          {after.est_finish_min != null && after.est_route_hours != null ? (
            (() => {
              const LUNCH_MIN = 30;
              const workedHrs = Math.max(0, after.est_route_hours - LUNCH_MIN / 60);
              return (
                <span className="text-muted-foreground">
                  First stop <span className="font-medium">{fmtTime(after.est_finish_min - Math.round(after.est_route_hours * 60))}</span>
                  {" → last stop "}
                  <span className="font-medium">{fmtTime(after.est_finish_min)}</span>
                  {" · "}
                  <span className="font-medium">~{workedHrs.toFixed(1)}h on the clock</span>
                  {" (after 30-min lunch)"}
                  {snap.has_home
                    ? (snap.home_base_min ? ` · +${(snap.home_base_min / 60).toFixed(1)}h commute` : "")
                    : " · no home base on file"}
                </span>
              );
            })()
          ) : (
            <span className="text-muted-foreground">
              ~{Math.max(0, after.est_route_hours - 0.5).toFixed(1)}h on the clock (after 30-min lunch)
              {snap.has_home
                ? (snap.home_base_min ? ` · +${(snap.home_base_min / 60).toFixed(1)}h commute` : "")
                : " · no home base on file"}
            </span>
          )}
        </div>
      )}

      {c.justification && (
        <p className="mt-2 text-xs italic text-muted-foreground">{c.justification}</p>
      )}

      <div className="mt-3 flex justify-end">
        <Button
          type="button" size="sm"
          disabled={!scheduleContext || booking}
          onClick={onSchedule}
          title={scheduleContext ? "Queue this appointment for office approval" : "Pick a customer + service type above to enable"}
        >
          <CalendarPlus className="h-3 w-3 mr-1" />
          {booking ? "Queueing…" : "Schedule (queue for approval)"}
        </Button>
      </div>
    </div>
  );
}

// ── Mode B: Check a day & time ────────────────────────────────────────────────

function CheckMode({
  staff,
  dayOptions,
}: {
  staff: { fullName: string } | null;
  dayOptions: { iso: string; label: string }[];
}) {
  const [address, setAddress] = useState("");
  const [date, setDate] = useState(dayOptions[0]?.iso ?? "");
  const [window, setWindow] = useState("8-12");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CheckResult | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!staff) return toast.error("Please sign in again.");
    if (address.trim().length < 4) return toast.error("Please enter a full street address.");
    if (!date) return toast.error("Pick a date.");

    setLoading(true);
    setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("scheduling-check-slot", {
        body: {
          staffName: staff.fullName,
          address: address.trim(),
          date,
          window,
          use_google: true,
        },
      });
      if (error) throw error;
      if (!data?.ok) return toast.error(data?.detail?.detail || data?.error || "Failed to check slot.");
      setResult(data.result as CheckResult);
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || "Unexpected error.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarClock className="w-5 h-5" /> Check a specific day &amp; window
          </CardTitle>
          <CardDescription>
            For when a customer needs a particular day &amp; time window. Tells you how
            out-of-the-way that window is for that day's routes and whether it's
            feasible.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="check-address">Service address</Label>
              <Input
                id="check-address"
                placeholder="e.g. 9 Harrisburg, Irvine CA 92620"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
              />
            </div>
            <div className="flex flex-wrap gap-4">
              <div className="space-y-2">
                <Label>Day</Label>
                <Select value={date} onValueChange={setDate}>
                  <SelectTrigger className="w-48"><SelectValue placeholder="Pick a day" /></SelectTrigger>
                  <SelectContent>
                    {dayOptions.map((d) => (
                      <SelectItem key={d.iso} value={d.iso}>{d.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Time window</Label>
                <Select value={window} onValueChange={setWindow}>
                  <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectLabel>4-hour windows</SelectLabel>
                      <SelectItem value="8-12">8 AM – 12 PM</SelectItem>
                      <SelectItem value="10-2">10 AM – 2 PM</SelectItem>
                      <SelectItem value="1-5">1 PM – 5 PM</SelectItem>
                    </SelectGroup>
                    <SelectGroup>
                      <SelectLabel>2-hour windows</SelectLabel>
                      <SelectItem value="8-10">8 AM – 10 AM</SelectItem>
                      <SelectItem value="10-12">10 AM – 12 PM</SelectItem>
                      <SelectItem value="12-2">12 PM – 2 PM</SelectItem>
                      <SelectItem value="2-4">2 PM – 4 PM</SelectItem>
                      <SelectItem value="3-5">3 PM – 5 PM</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button type="submit" disabled={loading} className="w-full md:w-auto">
              {loading ? "Checking…" : "Check feasibility"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {result && (
        <div className="mt-6 space-y-4">
          <VerdictBanner result={result} />
          {result.options.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Closest openings</CardTitle>
                <CardDescription>{result.routes_considered} route(s) on {result.date}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {result.options.map((c, i) => (
                  <div key={i} className={`rounded-md p-3 ${tierBorder(c)}`}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <FeasibleBadge v={c.feasible} />
                        <span className="font-semibold">{c.tech_name}</span>
                        <span className="text-sm text-muted-foreground">{fmtWindow(c.next_stop?.start_time, c.next_stop?.end_time)} window</span>
                      </div>
                      <DetourBadge c={c} />
                    </div>
                    <div className="mt-2 text-xs text-muted-foreground">
                      Between <span className="font-medium text-foreground">{c.prev_stop?.customer_name}</span> ({c.prev_stop?.city})
                      {" → "}
                      <span className="font-medium text-foreground">{c.next_stop?.customer_name}</span> ({c.next_stop?.city})
                    </div>
                    {c.after_insert && (
                      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                        <span>Stops: <span className="font-semibold">{c.route_snapshot?.stops} → {c.after_insert.stops}</span></span>
                        {c.after_insert.est_finish_min != null && (
                          <span>Finishes ~<span className="font-medium">{fmtTime(c.after_insert.est_finish_min)}</span></span>
                        )}
                      </div>
                    )}
                    {c.reasons && c.reasons.length > 0 && (
                      <ul className="mt-2 list-disc pl-5 text-xs text-muted-foreground">
                        {c.reasons.map((r, j) => <li key={j}>{r}</li>)}
                      </ul>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </>
  );
}

function FeasibleBadge({ v }: { v?: SlotCandidate["feasible"] }) {
  if (v === "feasible") return <Badge className="bg-emerald-600 text-white">Feasible</Badge>;
  if (v === "tight") return <Badge className="bg-amber-500 text-white">Tight</Badge>;
  return <Badge className="bg-red-600 text-white">Not feasible</Badge>;
}

function VerdictBanner({ result }: { result: CheckResult }) {
  const v = result.verdict;
  const map = {
    feasible: { Icon: CheckCircle2, cls: "border-emerald-500 bg-emerald-50 text-emerald-900" },
    tight: { Icon: AlertTriangle, cls: "border-amber-500 bg-amber-50 text-amber-900" },
    not_feasible: { Icon: XCircle, cls: "border-red-500 bg-red-50 text-red-900" },
    no_route: { Icon: XCircle, cls: "border-gray-400 bg-gray-50 text-gray-800" },
  }[v];
  const { Icon, cls } = map;
  return (
    <div className={`flex items-start gap-3 rounded-md border-l-4 p-4 ${cls}`}>
      <Icon className="mt-0.5 h-5 w-5 shrink-0" />
      <div>
        <p className="font-medium">{result.summary}</p>
        <p className="mt-1 text-xs opacity-80">
          {result.address} · {result.date} · {result.requested_window} window
        </p>
      </div>
    </div>
  );
}


export default SlotFinder;
