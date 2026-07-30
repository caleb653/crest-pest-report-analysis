// ScheduleReview — admin-only single-pane quick report.
// Defaults to 3 days starting today+2 (skips today and tomorrow). Surfaces
// the most actionable items in a big "Key Highlights" panel up top, then a
// per-tech-day grid below with inline indicators.

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  ArrowLeft, AlertTriangle, Clock, MapPin, ShuffleIcon, ClipboardList, CalendarCheck, Car,
  Wand2, Phone, Users, CalendarPlus, CheckCircle2, X, Lock, BellRing, TrendingUp, TrendingDown, Minus,
  Send, ChevronDown, ChevronRight,
} from "lucide-react";

import { useCurrentStaff } from "@/hooks/useCurrentStaff";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import PendingFieldRoutesWrites from "@/components/PendingFieldRoutesWrites";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import RouteMap from "@/components/scheduling/RouteMap";
import WeekRouteMap from "@/components/scheduling/WeekRouteMap";

// Authoritative field-tech roster (matches policy/tech-home-bases.yaml on the
// backend). Non-field-tech routes (Jake / Caleb / Carmen / David) are excluded
// from the review entirely — they're one-time appointments, not recurring
// schedule items.
const FIELD_TECHS = [
  "Brock Lyttle",
  "Darrell Tanner",
  "Dylan Gallegos",
  "Jackson Latham",
  "Mike Muniz",
  "Nick Stovall",
];

type ComplianceIssue = {
  kind: string; date: string; tech_name: string;
  customer?: string; city?: string; detail: string;
};
type RouteMove = {
  customer: string; city: string;
  from_position: number; to_position: number;
  direction: "earlier" | "later";
};
type RouteOrder = {
  current_drive_sec: number;
  optimized_drive_sec: number;
  savings_sec: number;
  moves?: RouteMove[];
  current_sequence: string[];
  suggested_sequence: string[];
};
type MissWindowEntry = {
  customer: string; city: string; window: string;
  projected_arrival_min: number; late_by_min: number;
};
type Snapshot = {
  stops: number; total_miles: number; job_miles_first_to_last: number;
  total_drive_min: number; onsite_min: number; paperwork_min: number;
  est_completion_h: number; has_home: boolean;
};
type CrossDayMove = {
  appointment_id: string;
  customer: string; city: string;
  current_date: string; current_tech: string;
  suggested_date: string; suggested_tech: string;
  alt_route_stop_count: number;
  current_distance_from_route_mi: number;
  improvement_mi: number;
};
type EquipmentNote = {
  date: string; tech_name: string; appointment_id?: string;
  customer: string; city: string; service: string; detail: string;
};
type ReviewResult = {
  start: string; end: string;
  tech_filter: string | null;
  routes: { date: string; route_id: number; tech_name: string; stop_count: number; day_alert: string | null }[];
  compliance: ComplianceIssue[];
  equipment?: EquipmentNote[];
  route_order: Record<string, RouteOrder>;
  miss_window: Record<string, MissWindowEntry[]>;
  snapshot: Record<string, Snapshot>;
  cross_day_moves?: CrossDayMove[];
  empty?: boolean;
};

function fmtMinutes(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h > 0 ? `${h}h${m.toString().padStart(2, "0")}m` : `${m}m`;
}

// "08:00:00" → "8 AM", "08:30:00" → "8:30 AM", "8:00 AM-10:00 AM" → "8–10 AM",
// "08:00:00-10:00:00" → "8–10 AM". Strips seconds, adds am/pm.
function humanTime(s: string | null | undefined): string {
  if (!s) return "";
  const conv = (raw: string): string => {
    const t = raw.trim();
    // Already has am/pm — just drop seconds.
    const ampm = t.match(/^(\d{1,2})(?::(\d{2}))?(?::\d{2})?\s*([AaPp][Mm])$/);
    if (ampm) {
      const h = parseInt(ampm[1], 10);
      const m = ampm[2] ? parseInt(ampm[2], 10) : 0;
      const sfx = ampm[3].toUpperCase();
      return m === 0 ? `${h} ${sfx}` : `${h}:${String(m).padStart(2, "0")} ${sfx}`;
    }
    // 24h "HH:MM[:SS]"
    const h24 = t.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
    if (h24) {
      let h = parseInt(h24[1], 10);
      const m = parseInt(h24[2], 10);
      const sfx = h >= 12 ? "PM" : "AM";
      h = h % 12 || 12;
      return m === 0 ? `${h} ${sfx}` : `${h}:${String(m).padStart(2, "0")} ${sfx}`;
    }
    return t;
  };
  if (s.includes("-")) {
    const [a, b] = s.split("-").map((x) => conv(x));
    // Collapse same suffix: "8 AM–10 AM" → "8–10 AM"
    const ma = a.match(/^(.+)\s(AM|PM)$/);
    const mb = b.match(/^(.+)\s(AM|PM)$/);
    if (ma && mb && ma[2] === mb[2]) return `${ma[1]}–${mb[1]} ${mb[2]}`;
    return `${a}–${b}`;
  }
  return conv(s);
}

// First name only — friendlier than "Dylan G." in narrative sentences.
function firstName(full: string): string {
  return (full || "").split(" ")[0] || full;
}

// "2025-11-20" → "Thu Nov 20"
function shortDate(iso: string): string {
  if (!iso) return "";
  try {
    return new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, {
      weekday: "short", month: "short", day: "numeric",
    });
  } catch { return iso; }
}

// Heuristic: flag a route as having "long drives between stops" when the
// average leg (total drive time divided by number of legs) is over this
// threshold. We don't have per-leg distances on the client, so this is a
// proxy — but a high average almost always means at least one painful
// hop. Tuned for our market (OC/LA): ~22 min/leg is where techs start
// complaining.
const LONG_LEG_MIN_THRESHOLD = 22;

type LongDrive = {
  routeKey: string;     // `${date}|${route_id}`
  techDayKey: string;   // `${date}|${tech_name}`
  date: string;
  tech_name: string;
  stops: number;
  total_drive_min: number;
  avg_leg_min: number;
};

function computeLongDrives(result: ReviewResult): LongDrive[] {
  const out: LongDrive[] = [];
  for (const r of result.routes) {
    const key = `${r.date}|${r.route_id}`;
    const snap = result.snapshot[key];
    if (!snap || r.stop_count < 2) continue;
    const legs = Math.max(1, r.stop_count - 1);
    const avg = snap.total_drive_min / legs;
    if (avg >= LONG_LEG_MIN_THRESHOLD) {
      out.push({
        routeKey: key,
        techDayKey: `${r.date}|${r.tech_name}`,
        date: r.date,
        tech_name: r.tech_name,
        stops: r.stop_count,
        total_drive_min: snap.total_drive_min,
        avg_leg_min: avg,
      });
    }
  }
  // worst first
  return out.sort((a, b) => b.avg_leg_min - a.avg_leg_min);
}

function suggestionForLongDrive(
  ld: LongDrive,
  orderByKey: Map<string, RouteOrder>,
  crossSourceByKey: Map<string, CrossDayMove[]>,
): string {
  const order = orderByKey.get(ld.routeKey);
  const outMoves = crossSourceByKey.get(ld.techDayKey) ?? [];
  const bestMove = [...outMoves].sort((a, b) => b.improvement_mi - a.improvement_mi)[0];

  if (bestMove && (!order || bestMove.improvement_mi >= 5)) {
    return `Try moving ${bestMove.customer} to ${firstName(bestMove.suggested_tech)} on ${shortDate(bestMove.suggested_date)} — saves about ${bestMove.improvement_mi.toFixed(1)} mi of detour.`;
  }
  if (order && order.savings_sec >= 5 * 60) {
    const top = order.moves?.[0];
    return `Reorder the day to save ${fmtMinutes(order.savings_sec / 60)}${top ? ` — move ${top.customer} up from stop ${top.from_position} to ${top.to_position}` : ""}.`;
  }
  if (bestMove) {
    return `Consider moving ${bestMove.customer} to ${firstName(bestMove.suggested_tech)} on ${shortDate(bestMove.suggested_date)}.`;
  }
  return `No easy fix here — see if a stop can shift to another day or pair with a nearby visit.`;
}

function keyToRouteRef(result: ReviewResult, key: string) {
  const [d, ridStr] = key.split("|");
  const rid = parseInt(ridStr, 10);
  return result.routes.find((r) => r.date === d && r.route_id === rid);
}

// ─────────────────────────────────────────────────────────────────────────
// Review checklist — the 6 aspects the office checks off per reviewed day.
// Auto-status comes from the review data where we have it; Equipment is a
// manual eyeball check (no equipment data comes back from FieldRoutes).
// ─────────────────────────────────────────────────────────────────────────

const MAX_STOPS_PER_TECH = 12;

const REVIEW_ASPECTS = [
  { key: "time_slots",         label: "Time Slots",          note: "All routes have time slots" },
  { key: "special_scheduling", label: "Special Scheduling",  note: "No stops contradict special scheduling" },
  { key: "equipment",          label: "Equipment",           note: "Flag any stops that require special equipment" },
  { key: "map_efficiency",     label: "Map View Efficiency", note: "Quick glance — does the route make sense? Anything to adjust?" },
  { key: "stop_count",         label: "# of Stops",          note: `Max ${MAX_STOPS_PER_TECH} stops per tech` },
  { key: "time_frames",        label: "Time Frames",         note: "Can the tech reasonably make all stops in the time window?" },
] as const;

type AspectKey = (typeof REVIEW_ASPECTS)[number]["key"];
type AspectStatus = { tone: "pass" | "flag" | "manual"; summary: string; items: string[] };

const SPECIAL_KINDS = new Set([
  "special_tech_override", "special_blocked_day", "special_window_violation",
  "manual_scheduled", "preferred_tech_mismatch", "attic_position",
  "linked_account", "special_time_mismatch",
]);

function aspectStatusesForDate(date: string, result: ReviewResult): Record<AspectKey, AspectStatus> {
  const routes = result.routes.filter((r) => r.date === date);
  const comp = result.compliance.filter((c) => c.date === date);

  const missingSlots = comp.filter((c) => c.kind === "missing_start_time");
  const special = comp.filter((c) => SPECIAL_KINDS.has(c.kind));
  const overCap = routes.filter((r) => r.stop_count > MAX_STOPS_PER_TECH);
  const misses = Object.entries(result.miss_window)
    .filter(([k]) => k.startsWith(`${date}|`))
    .flatMap(([, v]) => v);
  const dayAlerts = routes.filter((r) => r.day_alert);
  const reorders = Object.entries(result.route_order).filter(([k]) => k.startsWith(`${date}|`));
  const moves = (result.cross_day_moves ?? []).filter((m) => m.current_date === date);
  const longD = computeLongDrives(result).filter((l) => l.date === date);

  const who = (c: ComplianceIssue) => `${c.customer || "?"} (${firstName(c.tech_name)})`;
  const plural = (n: number) => (n === 1 ? "" : "s");

  const mapItems = [
    ...longD.map((l) => `${firstName(l.tech_name)}: ~${Math.round(l.avg_leg_min)} min between stops`),
    ...moves.map((m) => `Move ${m.customer} to ${firstName(m.suggested_tech)} ${shortDate(m.suggested_date)} (saves ${m.improvement_mi.toFixed(1)} mi)`),
    ...reorders.map(([k, o]) => {
      const r = keyToRouteRef(result, k);
      return `Reorder ${r ? firstName(r.tech_name) : "route"} to save ${fmtMinutes(o.savings_sec / 60)}`;
    }),
  ];
  const frameItems = [
    ...misses.map((f) => `${f.customer} — ${humanTime(f.window)} window, ~${f.late_by_min} min late`),
    ...dayAlerts.map((r) => `${firstName(r.tech_name)}: ${r.day_alert}`),
  ];

  return {
    time_slots: missingSlots.length
      ? { tone: "flag", summary: `${missingSlots.length} stop${plural(missingSlots.length)} missing a time slot`, items: missingSlots.map(who) }
      : { tone: "pass", summary: "Every stop has a time slot", items: [] },
    special_scheduling: special.length
      ? { tone: "flag", summary: `${special.length} conflict${plural(special.length)} with special scheduling notes`, items: special.map((c) => `${who(c)} — ${c.detail || c.kind.replace(/_/g, " ")}`) }
      : { tone: "pass", summary: "No stops contradict special scheduling notes", items: [] },
    equipment: (() => {
      // Backend flags first visits of rodent/mosquito subscriptions — those
      // need traps / bait boxes / In2Care stations on the truck.
      const equip = (result.equipment ?? []).filter((e) => e.date === date);
      if (equip.length) {
        return {
          tone: "flag" as const,
          summary: `${equip.length} stop${plural(equip.length)} need${equip.length === 1 ? "s" : ""} equipment loaded`,
          items: equip.map((e) => `${e.customer} (${firstName(e.tech_name)}) — ${e.detail || `first ${e.service} visit`}`),
        };
      }
      if (result.equipment) {
        return { tone: "pass" as const, summary: "No first rodent/mosquito visits or trapping/exclusion jobs — no special equipment expected", items: [] };
      }
      // Older backend without equipment data — leave it a manual check.
      return { tone: "manual" as const, summary: "No equipment data — eyeball the stops for special-equipment needs", items: [] };
    })(),
    map_efficiency: mapItems.length
      ? { tone: "flag", summary: `${mapItems.length} possible routing improvement${plural(mapItems.length)}`, items: mapItems }
      : { tone: "pass", summary: "No obvious reorder, move, or long-drive issues", items: [] },
    stop_count: overCap.length
      ? { tone: "flag", summary: `${overCap.length} route${plural(overCap.length)} over ${MAX_STOPS_PER_TECH} stops`, items: overCap.map((r) => `${firstName(r.tech_name)}: ${r.stop_count} stops`) }
      : { tone: "pass", summary: `All routes at or under ${MAX_STOPS_PER_TECH} stops`, items: [] },
    time_frames: frameItems.length
      ? { tone: "flag", summary: `${frameItems.length} time-window risk${plural(frameItems.length)}`, items: frameItems }
      : { tone: "pass", summary: "Every stop projects to land inside its window", items: [] },
  };
}

function AspectBadge({ tone }: { tone: AspectStatus["tone"] }) {
  if (tone === "pass") return <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 border-emerald-200">Clear</Badge>;
  if (tone === "flag") return <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 border-amber-200">Flagged</Badge>;
  return <Badge variant="outline" className="text-muted-foreground">Manual</Badge>;
}

function DateChecklist({ date, result }: { date: string; result: ReviewResult }) {
  const storageKey = `schedule-review-checklist:${date}`;
  const [checked, setChecked] = useState<Record<string, boolean>>(() => {
    try { return JSON.parse(localStorage.getItem(storageKey) || "{}"); } catch { return {}; }
  });
  const toggle = (k: string, v: boolean) =>
    setChecked((cur) => {
      const next = { ...cur, [k]: v };
      try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* private mode */ }
      return next;
    });

  const statuses = aspectStatusesForDate(date, result);
  const done = REVIEW_ASPECTS.filter((a) => checked[a.key]).length;
  const complete = done === REVIEW_ASPECTS.length;

  return (
    <Card className={`border-l-4 ${complete ? "border-l-emerald-500" : "border-l-primary"}`}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            <ClipboardList className="w-4 h-4" /> Route checklist — {shortDate(date)}
          </span>
          <span className={`flex items-center gap-1 text-xs font-semibold ${complete ? "text-emerald-700" : "text-muted-foreground"}`}>
            {complete && <CheckCircle2 className="w-4 h-4" />}
            {done}/{REVIEW_ASPECTS.length} checked
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {REVIEW_ASPECTS.map((a) => {
          const s = statuses[a.key];
          return (
            <div key={a.key} className="flex items-start gap-3 py-2.5 border-b last:border-0">
              <Checkbox
                className="mt-0.5"
                checked={!!checked[a.key]}
                onCheckedChange={(v) => toggle(a.key, v === true)}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-sm font-medium ${checked[a.key] ? "line-through text-muted-foreground" : ""}`}>{a.label}</span>
                  <AspectBadge tone={s.tone} />
                </div>
                <div className="text-xs text-muted-foreground">{a.note}</div>
                <div className={`text-xs mt-0.5 ${s.tone === "flag" ? "text-amber-800" : "text-muted-foreground"}`}>
                  {s.summary}
                </div>
                {s.items.length > 0 && (
                  <ul className="text-xs mt-1 pl-4 list-disc marker:text-muted-foreground space-y-0.5">
                    {s.items.map((it, i) => <li key={i}>{it}</li>)}
                  </ul>
                )}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function ReviewChecklists({ result }: { result: ReviewResult }) {
  const dates = [...new Set(result.routes.map((r) => r.date))].sort();
  if (dates.length === 0) return null;
  return (
    <div className={`grid gap-4 ${dates.length > 1 ? "lg:grid-cols-2" : ""}`}>
      {dates.map((d) => <DateChecklist key={d} date={d} result={result} />)}
    </div>
  );
}

// Business-day helpers for the date-chip picker. Review skips weekends —
// there are no recurring routes on Sat/Sun.
function addBusinessDaysIso(n: number): string {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  let added = 0;
  while (added < n) {
    d.setDate(d.getDate() + 1);
    const wd = d.getDay();
    if (wd !== 0 && wd !== 6) added++;
  }
  return isoFromDate(d);
}

// Business days within the next 14 calendar days (14 = the edge function's
// max span, so any combination of chips stays requestable in one call).
function businessDayOptions(): string[] {
  const out: string[] = [];
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  for (let i = 0; i < 14; i++) {
    d.setDate(d.getDate() + 1);
    const wd = d.getDay();
    if (wd !== 0 && wd !== 6) out.push(isoFromDate(d));
  }
  return out;
}

// Trim a fetched review down to just the selected dates. The API is called
// once for the whole span; non-selected days in between get dropped here.
function filterResultToDates(r: ReviewResult, dates: string[]): ReviewResult {
  const keep = new Set(dates);
  const keyKeep = (k: string) => keep.has(k.split("|")[0]);
  const routes = r.routes.filter((rt) => keep.has(rt.date));
  return {
    ...r,
    start: dates[0],
    end: dates[dates.length - 1],
    routes,
    compliance: r.compliance.filter((c) => keep.has(c.date)),
    equipment: r.equipment ? r.equipment.filter((e) => keep.has(e.date)) : r.equipment,
    route_order: Object.fromEntries(Object.entries(r.route_order).filter(([k]) => keyKeep(k))),
    miss_window: Object.fromEntries(Object.entries(r.miss_window).filter(([k]) => keyKeep(k))),
    snapshot: Object.fromEntries(Object.entries(r.snapshot).filter(([k]) => keyKeep(k))),
    cross_day_moves: (r.cross_day_moves ?? []).filter((m) => keep.has(m.current_date)),
    empty: r.empty || routes.length === 0,
  };
}

const ScheduleReview = () => {
  const staff = useCurrentStaff();
  const navigate = useNavigate();
  useEffect(() => {
    const RESTRICTED = new Set(["Michael Muniz","Darrell Tanner","Dylan Gallegos","Jackson Latham","Nick Stovall","Brock Lyttle"]);
    if (staff && RESTRICTED.has(staff.fullName)) navigate("/", { replace: true });
  }, [staff, navigate]);

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate("/")}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to home
          </Button>
        </div>

        <Tabs defaultValue="review">
          <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4 md:w-auto md:inline-grid h-auto p-1.5 bg-muted border-2 border-border shadow-sm">
            <TabsTrigger
              value="review"
              className="gap-2 text-base font-semibold px-6 py-2.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md"
            >
              <ClipboardList className="w-4 h-4" /> Review
            </TabsTrigger>
            <TabsTrigger
              value="fill"
              className="gap-2 text-base font-semibold px-6 py-2.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md"
            >
              <Wand2 className="w-4 h-4" /> Fill
            </TabsTrigger>
            <TabsTrigger
              value="efficiency"
              className="gap-2 text-base font-semibold px-6 py-2.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md"
            >
              <TrendingUp className="w-4 h-4" /> Efficiency
            </TabsTrigger>
            <TabsTrigger
              value="pending"
              className="gap-2 text-base font-semibold px-6 py-2.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md"
            >
              <Clock className="w-4 h-4" /> Pending
            </TabsTrigger>
          </TabsList>
          <TabsContent value="review" className="mt-4 space-y-6">
            <ReviewMode staff={staff} />
          </TabsContent>
          <TabsContent value="fill" className="mt-4 space-y-6">
            <FillMode staff={staff} />
          </TabsContent>
          <TabsContent value="efficiency" className="mt-4 space-y-6">
            <EfficiencyMode staff={staff} />
          </TabsContent>
          <TabsContent value="pending" className="mt-4 space-y-6">
            <PendingFieldRoutesWrites title="Pending FieldRoutes writes" />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────
// Efficiency mode — avg wrench-time % by tech by week, history vs upcoming
// ─────────────────────────────────────────────────────────────────────────

type EffCell = { efficiency: number; routes: number; stops: number; production: number };
type EfficiencyResult = {
  weeks: string[];        // Monday ISO dates, oldest → newest
  techs: string[];
  this_week: string;      // Monday of the current week
  start: string; end: string;
  data: Record<string, Record<string, EffCell>>;
};

function weekShort(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { month: "numeric", day: "numeric" });
}
function avgOf(nums: number[]): number | null {
  return nums.length ? Math.round(nums.reduce((a, b) => a + b, 0) / nums.length) : null;
}

function EfficiencyMode({ staff }: { staff: { fullName: string } | null }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<EfficiencyResult | null>(null);
  const [monthly, setMonthly] = useState<EfficiencyResult | null>(null);
  const [loadingMonthly, setLoadingMonthly] = useState(false);

  const run = async () => {
    if (!staff) return toast.error("Please sign in again.");
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("scheduling-efficiency", {
        body: { staffName: staff.fullName, weeks_back: 8, weeks_forward: 8 },
      });
      if (error) throw error;
      if (!data?.ok) { toast.error(data?.error || "Failed to load efficiency."); return; }
      setResult(data.result as EfficiencyResult);
    } catch (e: any) {
      toast.error(e?.message || "Unexpected error.");
    } finally {
      setLoading(false);
    }
  };

  const runMonthly = async () => {
    if (!staff) return;
    setLoadingMonthly(true);
    try {
      const { data, error } = await supabase.functions.invoke("scheduling-efficiency", {
        body: { staffName: staff.fullName, weeks_back: 26, weeks_forward: 0 },
      });
      if (error) throw error;
      if (!data?.ok) return;
      setMonthly(data.result as EfficiencyResult);
    } catch { /* silent */ } finally {
      setLoadingMonthly(false);
    }
  };

  useEffect(() => { run(); runMonthly(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><TrendingUp className="w-5 h-5" /> Route Efficiency by Week</CardTitle>
          <CardDescription>
            Share of the working day spent driving (drive ÷ drive + on-site) per tech, per week —
            lower is better. 8 weeks of history through 8 weeks ahead. Same metric as Fill &amp; Review,
            estimated the same way for past and future so weeks compare directly. The <strong>bold</strong> column is this week.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={run} disabled={loading}>{loading ? "Loading…" : "Refresh"}</Button>
        </CardContent>
      </Card>

      {result && result.weeks.length > 0 && (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b">
                  <th className="sticky left-0 bg-background text-left font-semibold p-2 z-10">Tech</th>
                  {result.weeks.map((wk) => {
                    const future = wk > result.this_week;
                    const isThis = wk === result.this_week;
                    return (
                      <th key={wk} className={`p-2 text-center font-medium whitespace-nowrap ${isThis ? "font-bold text-primary border-x-2 border-primary/40" : future ? "text-muted-foreground" : ""}`}>
                        {weekShort(wk)}{future && !isThis ? "*" : ""}
                      </th>
                    );
                  })}
                  <th className="p-2 text-center font-semibold whitespace-nowrap">Trend</th>
                </tr>
              </thead>
              <tbody>
                {result.techs.map((tech) => {
                  const row = result.data[tech] || {};
                  const past = avgOf(result.weeks.filter((w) => w < result.this_week).map((w) => row[w]?.efficiency).filter((x): x is number => x != null));
                  const fut = avgOf(result.weeks.filter((w) => w >= result.this_week).map((w) => row[w]?.efficiency).filter((x): x is number => x != null));
                  const delta = past != null && fut != null ? fut - past : null;
                  return (
                    <tr key={tech} className="border-b hover:bg-muted/40">
                      <td className="sticky left-0 bg-background font-medium p-2 z-10 whitespace-nowrap">{tech}</td>
                      {result.weeks.map((wk) => {
                        const c = row[wk];
                        const isThis = wk === result.this_week;
                        return (
                          <td key={wk} className={`p-2 text-center ${isThis ? "border-x-2 border-primary/40" : ""}`}
                              title={c ? `${c.routes} route${c.routes === 1 ? "" : "s"} · ${c.stops} stops · $${c.production.toLocaleString()}` : "no routes"}>
                            {c ? <span className={`font-semibold ${efficiencyTone(c.efficiency)}`}>{c.efficiency}%</span> : <span className="text-muted-foreground">—</span>}
                          </td>
                        );
                      })}
                      <td className="p-2 text-center whitespace-nowrap">
                        {/* Efficiency = drive share, so a RISING number is bad. */}
                        {delta == null ? <Minus className="w-3.5 h-3.5 inline text-muted-foreground" />
                          : delta > 1 ? <span className="text-red-600 inline-flex items-center gap-0.5"><TrendingUp className="w-3.5 h-3.5" />+{delta}</span>
                          : delta < -1 ? <span className="text-emerald-700 inline-flex items-center gap-0.5"><TrendingDown className="w-3.5 h-3.5" />{delta}</span>
                          : <span className="text-muted-foreground inline-flex items-center gap-0.5"><Minus className="w-3.5 h-3.5" />0</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
      {result && result.weeks.length > 0 && (
        <p className="text-xs text-muted-foreground">
          * upcoming weeks (scheduled, not yet completed). Trend = avg upcoming − avg past. Hover a cell for routes / stops / production.
        </p>
      )}
      {result && result.weeks.length === 0 && (
        <Card><CardContent className="py-6 text-center text-sm text-muted-foreground">No routes found in this window.</CardContent></Card>
      )}

      <MonthlyEfficiencyTable result={monthly} loading={loadingMonthly} />
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Monthly rollup — aggregates the weekly cells into calendar months
// ─────────────────────────────────────────────────────────────────────────

function monthKey(iso: string): string {
  // iso is a Monday date; bucket by the calendar month of that Monday.
  return iso.slice(0, 7); // YYYY-MM
}
function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: "short", year: "2-digit" });
}

function MonthlyEfficiencyTable({ result, loading }: { result: EfficiencyResult | null; loading: boolean }) {
  if (loading && !result) {
    return <Card><CardContent className="py-6 text-center text-sm text-muted-foreground">Loading monthly history…</CardContent></Card>;
  }
  if (!result || result.weeks.length === 0) return null;

  const months = Array.from(new Set(result.weeks.map(monthKey))).sort();

  // tech → month → weighted-avg efficiency (weighted by stops so a 2-stop week
  // doesn't outweigh a 40-stop one).
  const cellFor = (tech: string, mo: string): { efficiency: number | null; stops: number; routes: number } => {
    const row = result.data[tech] || {};
    let num = 0, den = 0, stops = 0, routes = 0;
    for (const wk of result.weeks) {
      if (monthKey(wk) !== mo) continue;
      const c = row[wk];
      if (!c) continue;
      const w = Math.max(1, c.stops);
      num += c.efficiency * w;
      den += w;
      stops += c.stops;
      routes += c.routes;
    }
    return { efficiency: den ? Math.round(num / den) : null, stops, routes };
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <TrendingUp className="w-4 h-4" /> Route Efficiency by Month
        </CardTitle>
        <CardDescription className="text-xs">
          Same wrench-time metric, rolled up by calendar month — last ~6 months for the bigger picture.
          Weighted by stops so light weeks don't skew the average.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0 overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="border-b">
              <th className="sticky left-0 bg-background text-left font-semibold p-2 z-10">Tech</th>
              {months.map((mo) => (
                <th key={mo} className="p-2 text-center font-medium whitespace-nowrap">{monthLabel(mo)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {result.techs.map((tech) => (
              <tr key={tech} className="border-b hover:bg-muted/40">
                <td className="sticky left-0 bg-background font-medium p-2 z-10 whitespace-nowrap">{tech}</td>
                {months.map((mo) => {
                  const c = cellFor(tech, mo);
                  return (
                    <td key={mo} className="p-2 text-center" title={c.efficiency != null ? `${c.routes} routes · ${c.stops} stops` : "no routes"}>
                      {c.efficiency != null
                        ? <span className={`font-semibold ${efficiencyTone(c.efficiency)}`}>{c.efficiency}%</span>
                        : <span className="text-muted-foreground">—</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Review mode (the original quick-review report)
// ─────────────────────────────────────────────────────────────────────────

function ReviewMode({ staff }: { staff: { fullName: string } | null }) {
  const [dateOptions] = useState<string[]>(businessDayOptions);
  const [selectedDates, setSelectedDates] = useState<string[]>(() => [addBusinessDaysIso(2)]);
  const [tech, setTech] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ReviewResult | null>(null);

  const toggleDate = (d: string) =>
    setSelectedDates((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d].sort()));

  const run = async () => {
    if (!staff) {
      toast.error("Please sign in again.");
      return;
    }
    if (selectedDates.length === 0) {
      toast.error("Pick at least one date to review.");
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      // One call covers first → last selected date; days in between that
      // aren't selected get filtered out of the result below.
      const dates = [...selectedDates].sort();
      const spanDays =
        Math.round(
          (new Date(`${dates[dates.length - 1]}T12:00:00`).getTime() -
            new Date(`${dates[0]}T12:00:00`).getTime()) / 86400000,
        ) + 1;
      const { data, error } = await supabase.functions.invoke("scheduling-review", {
        body: {
          staffName: staff.fullName,
          start_date: dates[0],
          days: Math.min(14, spanDays),
          tech: tech.trim() || null,
        },
      });
      if (error) throw error;
      if (!data?.ok) {
        toast.error(data?.error || "Failed to run review.");
        return;
      }
      setResult(filterResultToDates(data.result as ReviewResult, dates));
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || "Unexpected error.");
    } finally {
      setLoading(false);
    }
  };

  // Derive collections
  const orderEntries = result ? Object.entries(result.route_order) : [];
  const missWindowList = result
    ? Object.entries(result.miss_window).flatMap(([k, fs]) => fs.map((f) => ({ key: k, ...f })))
    : [];
  const crossDayMoves = result?.cross_day_moves ?? [];
  const snapshotEntries = result ? Object.entries(result.snapshot) : [];
  const totalStops = snapshotEntries.reduce((acc, [, s]) => acc + s.stops, 0);
  const longDrives = result ? computeLongDrives(result) : [];

  return (
    <>
        {/* ── Controls ───────────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ClipboardList className="w-5 h-5" />
              Schedule Review
            </CardTitle>
            <CardDescription>
              Pick the exact day(s) to review — defaults to 2 business days
              out, far enough ahead that there's still time to fix what the
              review turns up. Each reviewed day gets a route checklist.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="space-y-2 md:col-span-2">
                <Label>Dates to review</Label>
                <div className="flex flex-wrap gap-1.5">
                  {dateOptions.map((d) => {
                    const on = selectedDates.includes(d);
                    return (
                      <Button
                        key={d}
                        type="button"
                        size="sm"
                        variant={on ? "default" : "outline"}
                        className="h-8 px-2.5 text-xs"
                        onClick={() => toggleDate(d)}
                      >
                        {shortDate(d)}
                      </Button>
                    );
                  })}
                </div>
                <p className="text-[11px] text-muted-foreground leading-tight">
                  Tap to select one or more days.
                </p>
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>Tech</Label>
                <Select value={tech || "all"} onValueChange={(v) => setTech(v === "all" ? "" : v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="All field techs" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All field techs</SelectItem>
                    {FIELD_TECHS.map((t) => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button onClick={run} disabled={loading} className="mt-4">
              {loading ? "Running…" : "Run review"}
            </Button>
          </CardContent>
        </Card>

        {result?.empty && (
          <Card>
            <CardContent className="py-6 text-center text-sm text-muted-foreground">
              No Pending appointments / routes between {result.start} and {result.end}.
            </CardContent>
          </Card>
        )}

        {result && !result.empty && (
          <>
            {/* ── Summary stat strip ──────────────────────────────────── */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <StatCard label="Window" value={`${result.start} – ${result.end}`} small />
              <StatCard label="Routes" value={result.routes.length} />
              <StatCard label="Stops" value={totalStops} />
              <StatCard
                label="Compliance"
                value={result.compliance.length}
                tone={result.compliance.length > 0 ? "danger" : "ok"}
              />
              <StatCard
                label="Risks + moves"
              value={missWindowList.length + crossDayMoves.length + orderEntries.length + longDrives.length}
                tone={
                  missWindowList.length > 0 ? "warn"
                : (crossDayMoves.length + orderEntries.length + longDrives.length) > 0 ? "info"
                  : "ok"
                }
              />
            </div>

            {/* ── Per-day route checklist ─────────────────────────────── */}
            <ReviewChecklists result={result} />

            {/* ── KEY HIGHLIGHTS (very prominent) ─────────────────────── */}
            <KeyHighlights
              compliance={result.compliance}
              missWindow={missWindowList}
              crossDayMoves={crossDayMoves}
              routeOrder={orderEntries}
            longDrives={longDrives}
            routeOrderMap={new Map(orderEntries)}
            crossSourceByKey={(() => {
              const m = new Map<string, CrossDayMove[]>();
              crossDayMoves.forEach((mv) => {
                const k = `${mv.current_date}|${mv.current_tech}`;
                const list = m.get(k) ?? [];
                list.push(mv);
                m.set(k, list);
              });
              return m;
            })()}
            />

            {/* ── Per-tech-day breakdown ──────────────────────────────── */}
            <PerRouteGrid
              result={result}
              orderEntries={orderEntries}
              missWindowList={missWindowList}
              crossDayMoves={crossDayMoves}
            longDrives={longDrives}
            />
          </>
        )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Subcomponents
// ─────────────────────────────────────────────────────────────────────────

function StatCard({
  label, value, small, tone = "neutral",
}: {
  label: string;
  value: string | number;
  small?: boolean;
  tone?: "neutral" | "ok" | "warn" | "danger" | "info";
}) {
  const toneClass = {
    neutral: "bg-card",
    ok:      "bg-emerald-50 border-emerald-200",
    warn:    "bg-amber-50 border-amber-200",
    danger:  "bg-red-50 border-red-200",
    info:    "bg-indigo-50 border-indigo-200",
  }[tone];
  return (
    <div className={`rounded-lg border p-3 ${toneClass}`}>
      <div className="text-xs text-muted-foreground uppercase tracking-wide">{label}</div>
      <div className={`font-bold ${small ? "text-sm" : "text-2xl"}`}>{value}</div>
    </div>
  );
}

function KeyHighlights({
  compliance, missWindow, crossDayMoves, routeOrder, longDrives, routeOrderMap, crossSourceByKey,
}: {
  compliance: ComplianceIssue[];
  missWindow: (MissWindowEntry & { key: string })[];
  crossDayMoves: CrossDayMove[];
  routeOrder: [string, RouteOrder][];
  longDrives: LongDrive[];
  routeOrderMap: Map<string, RouteOrder>;
  crossSourceByKey: Map<string, CrossDayMove[]>;
}) {
  const nothing =
    compliance.length === 0 &&
    missWindow.length === 0 &&
    crossDayMoves.length === 0 &&
    routeOrder.length === 0 &&
    longDrives.length === 0;

  if (nothing) {
    return (
      <Card className="border-l-4 border-l-emerald-500">
        <CardContent className="py-5 flex items-center gap-3">
          <CalendarCheck className="w-6 h-6 text-emerald-600" />
          <div>
            <div className="font-semibold text-emerald-700">Clean review.</div>
            <div className="text-sm text-muted-foreground">
              No compliance issues, no past-window risks, no reorder savings, no cross-day moves available.
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Lead with the most valuable thing: cross-day moves (top 3).
  const topCross = [...crossDayMoves]
    .sort((a, b) => b.improvement_mi - a.improvement_mi)
    .slice(0, 3);
  // Then reorder (top 1 only — usually one route stands out)
  const topOrder = [...routeOrder]
    .sort((a, b) => b[1].savings_sec - a[1].savings_sec)
    .slice(0, 1);

  return (
    <Card className="border-l-4 border-l-amber-500">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Key Highlights</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1.5">
        {compliance.slice(0, 3).map((i, idx) => (
          <HighlightRow
            key={`c-${idx}`}
            icon={<AlertTriangle className="w-3.5 h-3.5 text-red-600" />}
            tone="danger"
            title={
              <>
                <strong>{i.customer || firstName(i.tech_name)}</strong> on {shortDate(i.date)} — {i.kind.replace(/_/g, " ")}
              </>
            }
          />
        ))}
        {topCross.map((m, idx) => (
          <HighlightRow
            key={`x-${idx}`}
            icon={<ShuffleIcon className="w-3.5 h-3.5 text-indigo-600" />}
            tone="info"
            title={
              <>
                Move <strong>{m.customer}</strong> from {firstName(m.current_tech)} ({shortDate(m.current_date)}) to {firstName(m.suggested_tech)} ({shortDate(m.suggested_date)}) — saves <strong>{m.improvement_mi.toFixed(1)} mi</strong>
              </>
            }
          />
        ))}
        {longDrives.slice(0, 3).map((ld, idx) => (
          <HighlightRow
            key={`ld-${idx}`}
            icon={<Car className="w-3.5 h-3.5 text-amber-600" />}
            tone="warn"
            title={
              <>
                Tighten up <strong>{firstName(ld.tech_name)}</strong>'s {shortDate(ld.date)} — ~{Math.round(ld.avg_leg_min)} min between stops ({fmtMinutes(ld.total_drive_min)} driving)
              </>
            }
          />
        ))}
        {topOrder.map(([key, s], idx) => {
          const [date] = key.split("|");
          return (
            <HighlightRow
              key={`ro-${idx}`}
              icon={<MapPin className="w-3.5 h-3.5 text-emerald-600" />}
              tone="ok"
              title={
                s.moves && s.moves.length > 0 ? (
                  <>
                    Move <strong>{s.moves[0].customer}</strong> up on {shortDate(date)} to save {fmtMinutes(s.savings_sec / 60)} (stop {s.moves[0].from_position} → {s.moves[0].to_position}{s.moves.length > 1 ? `, +${s.moves.length - 1} more` : ""})
                  </>
                ) : (
                  <>Reorder {shortDate(date)} to save {fmtMinutes(s.savings_sec / 60)}</>
                )
              }
            />
          );
        })}
      </CardContent>
    </Card>
  );
}

function HighlightRow({
  icon, tone, title,
}: {
  icon: React.ReactNode;
  tone: "ok" | "warn" | "danger" | "info";
  title: React.ReactNode;
}) {
  const toneBg = {
    ok:     "bg-emerald-50",
    warn:   "bg-amber-50",
    danger: "bg-red-50",
    info:   "bg-indigo-50",
  }[tone];
  return (
    <div className={`flex gap-2 items-center rounded px-2 py-1 ${toneBg}`}>
      <div className="shrink-0">{icon}</div>
      <div className="flex-1 min-w-0 text-xs leading-snug truncate">{title}</div>
    </div>
  );
}

function PerRouteGrid({
  result, orderEntries, missWindowList, crossDayMoves, longDrives,
}: {
  result: ReviewResult;
  orderEntries: [string, RouteOrder][];
  missWindowList: (MissWindowEntry & { key: string })[];
  crossDayMoves: CrossDayMove[];
  longDrives: LongDrive[];
}) {
  // Group everything by (date, route_id) key
  const orderByKey   = new Map(orderEntries);
  const longDriveByKey = new Map(longDrives.map((l) => [l.routeKey, l]));
  const crossSourceByKeyForGrid = new Map<string, CrossDayMove[]>();
  crossDayMoves.forEach((m) => {
    const sk = `${m.current_date}|${m.current_tech}`;
    const list = crossSourceByKeyForGrid.get(sk) ?? [];
    list.push(m);
    crossSourceByKeyForGrid.set(sk, list);
  });
  const missByKey    = new Map<string, MissWindowEntry[]>();
  missWindowList.forEach((f) => {
    const list = missByKey.get(f.key) ?? [];
    list.push(f);
    missByKey.set(f.key, list);
  });
  const compByKey    = new Map<string, ComplianceIssue[]>();
  result.compliance.forEach((i) => {
    // compliance items don't have route_id directly; match by date+tech
    const k = `${i.date}|${i.tech_name}`;
    const list = compByKey.get(k) ?? [];
    list.push(i);
    compByKey.set(k, list);
  });
  const equipByKey   = new Map<string, EquipmentNote[]>();
  (result.equipment ?? []).forEach((e) => {
    const k = `${e.date}|${e.tech_name}`;
    const list = equipByKey.get(k) ?? [];
    list.push(e);
    equipByKey.set(k, list);
  });
  const crossSourceByKey = new Map<string, CrossDayMove[]>();
  const crossTargetByKey = new Map<string, CrossDayMove[]>();
  crossDayMoves.forEach((m) => {
    const sk = `${m.current_date}|${m.current_tech}`;
    const tk = `${m.suggested_date}|${m.suggested_tech}`;
    const src = crossSourceByKey.get(sk) ?? []; src.push(m); crossSourceByKey.set(sk, src);
    const tgt = crossTargetByKey.get(tk) ?? []; tgt.push(m); crossTargetByKey.set(tk, tgt);
  });

  // Group routes by date so the layout reads left-to-right like a calendar:
  // one column per day, techs stacked inside. Date is shown ONCE per column.
  const byDate = new Map<string, typeof result.routes>();
  for (const r of result.routes) {
    if (!byDate.has(r.date)) byDate.set(r.date, [] as any);
    byDate.get(r.date)!.push(r);
  }
  const days = [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, routes]) => ({
      date,
      routes: [...routes].sort((a, b) => a.tech_name.localeCompare(b.tech_name)),
    }));

  const weekday = (iso: string) =>
    new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, {
      weekday: "short", month: "short", day: "numeric",
    });

  // Compact short-name so each tech row stays one line in narrow columns.
  const shortTech = (full: string) => {
    const parts = full.split(" ");
    if (parts.length < 2) return full;
    return `${parts[0]} ${parts[parts.length - 1][0]}.`;
  };

  return (
    <div
      className="grid gap-3"
      style={{ gridTemplateColumns: `repeat(${days.length}, minmax(240px, 1fr))` }}
    >
      {days.map(({ date, routes }) => {
        const dayBorder = routes.some((r) => {
          const tk = `${r.date}|${r.tech_name}`;
          return (compByKey.get(tk) ?? []).length > 0;
        })
          ? "border-t-red-500"
          : routes.some((r) => {
              const rk = `${r.date}|${r.route_id}`;
              const tk = `${r.date}|${r.tech_name}`;
              return (missByKey.get(rk) ?? []).length > 0 || longDriveByKey.has(rk);
            })
          ? "border-t-amber-500"
          : "border-t-indigo-500";

        return (
          <Card key={date} className={`border-t-4 ${dayBorder}`}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">{weekday(date)}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 pt-0">
              {routes.map((r) => {
                const routeKey   = `${r.date}|${r.route_id}`;
                const techDayKey = `${r.date}|${r.tech_name}`;
                const snap = result.snapshot[routeKey];
                const order = orderByKey.get(routeKey);
                const misses = missByKey.get(routeKey) ?? [];
                const comp = compByKey.get(techDayKey) ?? [];
                const crossOut = crossSourceByKey.get(techDayKey) ?? [];
                const crossIn  = crossTargetByKey.get(techDayKey) ?? [];
                const equips = equipByKey.get(techDayKey) ?? [];
                const longDrive = longDriveByKey.get(routeKey);
                const clean =
                  comp.length + misses.length + crossOut.length + crossIn.length + equips.length === 0 &&
                  !order && !longDrive;

                const dot =
                  comp.length > 0 ? "bg-red-500"
                  : (misses.length > 0 || longDrive) ? "bg-amber-500"
                  : (order || crossOut.length || crossIn.length) ? "bg-indigo-500"
                  : "bg-emerald-500";

                return (
                  <div key={routeKey} className="text-xs">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`w-2 h-2 rounded-full ${dot}`} />
                      <span className="font-semibold">{shortTech(r.tech_name)}</span>
                      <span className="text-muted-foreground">
                        {r.stop_count}st
                        {snap ? ` · ${fmtMinutes(snap.total_drive_min)} drv · ${snap.est_completion_h}h` : ""}
                      </span>
                    </div>

                    {clean ? (
                      <div className="text-muted-foreground italic pl-4">clean</div>
                    ) : (
                      <ul className="pl-4 space-y-0.5 text-foreground/90 list-disc marker:text-muted-foreground">
                        {comp.map((i, idx) => (
                          <li key={`c-${idx}`}>
                            <span className="text-red-600 font-medium">{i.kind.replace(/_/g, " ")}:</span>{" "}
                            {i.customer ? <strong>{i.customer}</strong> : null}
                            {i.customer ? " — " : ""}{humanTime(i.detail) || i.detail}
                          </li>
                        ))}
                        {equips.map((e, idx) => (
                          <li key={`eq-${idx}`}>
                            <span className="text-sky-700 font-medium">Equipment:</span>{" "}
                            <strong>{e.customer}</strong> — first {e.service} visit, load equipment
                          </li>
                        ))}
                        {misses.map((f, idx) => (
                          <li key={`m-${idx}`}>
                            <span className="text-amber-700 font-medium">Running late:</span>{" "}
                            <strong>{f.customer}</strong> — {humanTime(f.window)} window, ~{f.late_by_min} min late
                          </li>
                        ))}
                        {longDrive ? (
                          <li>
                            <span className="text-amber-700 font-medium">Long drives</span> (~{Math.round(longDrive.avg_leg_min)} min between stops) — {suggestionForLongDrive(longDrive, orderByKey, crossSourceByKeyForGrid)}
                          </li>
                        ) : null}
                        {order ? (
                          <li>
                            <span className="text-emerald-700 font-medium">Reorder to save {fmtMinutes(order.savings_sec / 60)}</span>
                            {order.moves?.[0] ? <> — move <strong>{order.moves[0].customer}</strong> up from stop {order.moves[0].from_position} to {order.moves[0].to_position}</> : null}
                          </li>
                        ) : null}
                        {crossOut.map((m, idx) => (
                          <li key={`xo-${idx}`}>
                            <span className="text-indigo-700 font-medium">Move out:</span>{" "}
                            send <strong>{m.customer}</strong> to {firstName(m.suggested_tech)} on {shortDate(m.suggested_date)} (saves {m.improvement_mi.toFixed(1)} mi)
                          </li>
                        ))}
                        {crossIn.map((m, idx) => (
                          <li key={`xi-${idx}`}>
                            <span className="text-indigo-700 font-medium">Move in:</span>{" "}
                            pick up <strong>{m.customer}</strong> from {firstName(m.current_tech)}
                          </li>
                        ))}
                      </ul>
                    )}
                    {r.day_alert ? (
                      <div className="pl-4 text-red-600 font-medium">⚠ {r.day_alert}</div>
                    ) : null}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────
// Fill mode (schedule planner) — proposes a schedule from the due "job pool"
// ─────────────────────────────────────────────────────────────────────────

const FILL_TECHS = ["Brock Lyttle", "Darrell Tanner", "Dylan Gallegos", "Jackson Latham", "Mike Muniz", "Nick Stovall"];

type FillStop = {
  order: number;
  subscription_id: string;
  customer_id: string;
  service_type_id: string;
  customer: string;
  city: string;
  address: string;
  // Optional geocoded coordinates (added by the planner when available).
  // Stops with null/undefined lat-lng are skipped on the map.
  lat?: number | null;
  lng?: number | null;
  services: string[];
  service_label: string;
  frequency: number;
  duration: number;
  window: string;
  start: string;
  end: string;
  due_date: string;
  days_off_target: number;
  special_scheduling: string | null;
  confirm: boolean;
  off_zone_day: boolean;
  route_id?: string;             // FieldRoutes routeID for the tech-day (placement)
  // Optional flags supplied by upstream planner:
  already_scheduled?: boolean;   // green — already on the books for this day
  locked?: boolean;              // black — appointment locked
  notification_sent?: boolean;   // black — customer already notified
  // Route-aware fields (drive-optimized planner):
  production?: number;           // $ recurring charge this stop earns
  eta?: string;                  // projected arrival clock time, e.g. "9:25 AM"
  drive_from_prev_min?: number;  // estimated drive from the previous stop
  flag?: string | null;          // e.g. "⚠ Overdue — last service 191d ago…"
  moved?: boolean;               // dragged onto this day by the office
  far_from_route_min?: number | null;  // >20-min hop from the rest of this route
};
type FillRouteSummary = {
  stop_count: number;
  onsite_min: number;
  paperwork_min: number;
  drive_min: number;
  paid_drive_min?: number;
  commute_min?: number;
  avg_leg_min?: number;          // paid drive per between-stop hop
  total_miles?: number;
  total_min: number;
  total_hours: number;
  production: number;
  efficiency_pct: number;        // drive share of the day: drive ÷ (drive + on-site); lower is better
  est_start: string;
  est_finish: string;
};
type FillDay = {
  date: string;
  weekday: string;
  tech: string;
  zone: string;
  stop_count: number;
  capacity: number;
  summary?: FillRouteSummary;
  stops: FillStop[];
  route_id?: string | number | null;   // FieldRoutes route for this tech-day
};
type FillRouteRow = { date: string; tech: string } & FillRouteSummary;
type FillTopSummary = {
  route_count: number;
  total_stops: number;
  total_drive_min: number;
  total_paid_drive_min?: number;
  total_commute_min?: number;
  total_miles?: number;
  total_onsite_min: number;
  total_min: number;
  total_production: number;
  avg_efficiency_pct: number;
  routes: FillRouteRow[];
};

// Group the per-route summaries by day (soonest first), with that day's totals
// across every tech/route on it.
function groupRoutesByDay(routes: FillRouteRow[]) {
  const m = new Map<string, FillRouteRow[]>();
  for (const r of routes) {
    if (!m.has(r.date)) m.set(r.date, []);
    m.get(r.date)!.push(r);
  }
  return [...m.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, list]) => ({
      date,
      routes: [...list].sort((a, b) => a.tech.localeCompare(b.tech)),
      production: list.reduce((s, r) => s + (r.production || 0), 0),
      stops: list.reduce((s, r) => s + r.stop_count, 0),
      drive_min: list.reduce((s, r) => s + r.drive_min, 0),
      onsite_min: list.reduce((s, r) => s + r.onsite_min, 0),
    }));
}
type FillUnscheduled = {
  customer: string;
  city: string;
  service: string;
  due_date: string;
  tech: string | null;
  special_scheduling: string | null;
  reason: string;
};
type FillDeferredBestDay = {
  date: string;
  weekday: string;
  in_zone?: boolean;
  in_window?: boolean;
  load?: number;
};
type FillDeferred = {
  customer: string;
  city: string;
  service: string;
  due_date: string;
  tech: string | null;
  reason: string;
  best_day?: FillDeferredBestDay | null;
};
type FillResult = {
  start: string;
  end: string;
  techs: string[];
  max_stops: number;
  pool_size: number;
  schedulable: number;
  assigned_count: number;
  manual_count: number;
  needs_reassignment_count: number;
  unplaced_count: number;
  proposed: FillDay[];
  manual: FillUnscheduled[];
  needs_reassignment: FillUnscheduled[];
  unplaced: FillUnscheduled[];
  deferred?: FillDeferred[];
  deferred_count?: number;
  summary?: FillTopSummary;
};

function isoFromDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Default Fill window: the Mon–Fri work week that sits 4 weeks out from the
// current week. E.g. during the week of Mon Jun 1, this returns Mon Jun 29 –
// Fri Jul 3. Recomputed on each mount so it's always current.
function defaultFillWindow(): { start: string; end: string } {
  const d = new Date();
  d.setHours(12, 0, 0, 0);                         // noon — dodge DST / midnight rollover
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // back up to this week's Monday
  d.setDate(d.getDate() + 28);                     // 4 weeks out → target Monday (start)
  const start = isoFromDate(d);
  d.setDate(d.getDate() + 4);                      // + 4 days → that week's Friday (end)
  return { start, end: isoFromDate(d) };
}

function weekdayLabel(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, {
    weekday: "short", month: "short", day: "numeric",
  });
}

// Minutes → "2h 15m" / "45m".
function fmtHM(mins?: number): string {
  if (mins == null) return "—";
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return h ? `${h}h ${m}m` : `${m}m`;
}

// Color the efficiency score = share of the day spent DRIVING vs servicing
// (drive ÷ drive + on-site) — LOWER is better. A tight 12-stop pocket day
// (~5-min legs) is ~13%; 10-min legs pull it to ~23%; a scattered day runs
// 30%+ — half the day behind the wheel.
function efficiencyTone(pct: number): string {
  if (pct <= 15) return "text-emerald-700";
  if (pct <= 30) return "text-amber-700";
  return "text-red-600";
}

function FillMode({ staff }: { staff: { fullName: string } | null }) {
  const [defaultWindow] = useState(defaultFillWindow);
  const [start, setStart] = useState<string>(defaultWindow.start);
  const [end, setEnd] = useState<string>(defaultWindow.end);
  const [maxStops, setMaxStops] = useState<number>(12);
  const [minStops, setMinStops] = useState<number>(6);
  const [techs, setTechs] = useState<string[]>(FILL_TECHS);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<FillResult | null>(null);
  const [weekMapOpen, setWeekMapOpen] = useState(false);
  // Tech-by-tech layout (Caleb 2026-07-30): the plan reads one TECH at a time
  // down the page — never day-by-day with all techs interleaved. "*" = every
  // tech (still sectioned per tech); or focus a single tech.
  const [viewTech, setViewTech] = useState<string>("*");
  // Drag-to-reorganize (Caleb 2026-07-30): a stop dragged onto another day
  // card moves instantly when it's clean; when it breaks a rule the office
  // gets a popup that says WHY and offers an explicit override.
  const [pendingMove, setPendingMove] = useState<{
    fromKey: string; toKey: string; stopId: string; stop: FillStop; reasons: string[];
  } | null>(null);

  const [daySummaryOpen, setDaySummaryOpen] = useState(false);

  const TOL_BY_FREQ: Record<number, number> = { 30: 5, 60: 10, 90: 14 };
  const fillStopKey = (s: FillStop) => `${s.subscription_id || s.customer_id}-${s.order}`;
  const dayDiffFromDue = (targetIso: string, dueIso: string) =>
    Math.round((new Date(`${targetIso}T12:00:00`).getTime()
                - new Date(`${dueIso}T12:00:00`).getTime()) / 86400000);

  const executeMove = (fromKey: string, toKey: string, stopId: string) => {
    setResult((prev) => {
      if (!prev) return prev;
      const proposed = prev.proposed.map((d) => ({ ...d, stops: [...d.stops] }));
      const src = proposed.find((d) => `${d.date}|${d.tech}` === fromKey);
      const dst = proposed.find((d) => `${d.date}|${d.tech}` === toKey);
      if (!src || !dst) return prev;
      const idx = src.stops.findIndex((s) => fillStopKey(s) === stopId);
      if (idx < 0) return prev;
      const [stop] = src.stops.splice(idx, 1);
      dst.stops.push({
        ...stop,
        order: dst.stops.length + 1,
        days_off_target: dayDiffFromDue(dst.date, stop.due_date),
        // Book on the TARGET day's FieldRoutes route — the route carries the date.
        route_id: dst.route_id != null && dst.route_id !== "" ? String(dst.route_id) : undefined,
        eta: undefined,
        drive_from_prev_min: undefined,
        moved: true,
      });
      src.stops.forEach((s, i) => { s.order = i + 1; });
      src.stop_count = src.stops.length;
      dst.stop_count = dst.stops.length;
      return { ...prev, proposed };
    });
  };

  const requestMove = (fromKey: string, stopId: string, toKey: string) => {
    if (!result || fromKey === toKey) return;
    const src = result.proposed.find((d) => `${d.date}|${d.tech}` === fromKey);
    const dst = result.proposed.find((d) => `${d.date}|${d.tech}` === toKey);
    if (!src || !dst) return;
    const stop = src.stops.find((s) => fillStopKey(s) === stopId);
    if (!stop) return;
    if (stop.already_scheduled || stop.locked || stop.notification_sent) {
      toast.error("That appointment is already booked/locked in FieldRoutes — reschedule it there instead.");
      return;
    }
    const reasons: string[] = [];
    const diff = dayDiffFromDue(dst.date, stop.due_date);
    const tol = TOL_BY_FREQ[stop.frequency] ?? 0;
    if (Math.abs(diff) > tol) {
      const cadence = stop.frequency === 30 ? "monthly" : stop.frequency === 60 ? "bi-monthly"
        : stop.frequency === 90 ? "quarterly" : `${stop.frequency}-day`;
      reasons.push(`Puts them ${Math.abs(diff)} days ${diff > 0 ? "past" : "before"} their ideal date `
        + `(due ${stop.due_date}) — ${cadence} flexibility is ±${tol} days.`);
    }
    if (src.tech !== dst.tech) {
      reasons.push(`Moves them from ${src.tech} (their assigned tech) to ${dst.tech}.`);
    }
    if (dst.stop_count >= dst.capacity) {
      reasons.push(`${weekdayLabel(dst.date)} is already at capacity (${dst.stop_count}/${dst.capacity} stops).`);
    }
    if (stop.special_scheduling) {
      reasons.push(`Customer scheduling note: “${stop.special_scheduling.trim()}” — double-check ${weekdayLabel(dst.date)} works for it.`);
    }
    if (reasons.length) {
      setPendingMove({ fromKey, toKey, stopId, stop, reasons });
    } else {
      executeMove(fromKey, toKey, stopId);
      toast.success(`Moved ${stop.customer} to ${weekdayLabel(dst.date)}`);
    }
  };

  const toggleTech = (t: string) =>
    setTechs((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]));

  const run = async () => {
    if (!staff) return toast.error("Please sign in again.");
    if (!start || !end) return toast.error("Pick a start and end date.");
    if (end < start) return toast.error("End date must be on or after the start date.");
    if (techs.length === 0) return toast.error("Pick at least one tech.");
    setLoading(true);
    setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("scheduling-fill", {
        body: { staffName: staff.fullName, start_date: start, end_date: end, techs, max_stops: maxStops, min_stops: minStops },
      });
      if (error) throw error;
      if (!data?.ok) {
        toast.error(data?.detail || data?.error || "Failed to build the fill plan.");
        return;
      }
      setResult(data.result as FillResult);
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
            <Wand2 className="w-5 h-5" /> Schedule Fill
          </CardTitle>
          <CardDescription>
            Pick a future window and the planner pulls everyone coming{" "}
            <strong>due</strong> in that range (last service + service frequency),
            then proposes which day &amp; tech each one fits — clustering by
            location and honoring preferred tech, day/time notes, and per-day
            capacity. Anything marked "call to schedule" is set aside for manual
            handling. Nothing books until you push it — use "Push stop to FR"
            on a single stop or "Push route to FR" for the whole day.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div className="space-y-2">
              <Label>Window start</Label>
              <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Window end</Label>
              <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Max stops / tech-day</Label>
              <Input type="number" min={4} max={30} value={maxStops}
                     onChange={(e) => setMaxStops(parseInt(e.target.value, 10) || 14)} />
            </div>
            <div className="space-y-2">
              <Label>Min stops / tech-day</Label>
              <Input type="number" min={0} max={maxStops} value={minStops}
                     onChange={(e) => setMinStops(Math.max(0, parseInt(e.target.value, 10) || 0))} />
              <p className="text-[11px] text-muted-foreground leading-tight">0 = off. Days below this get consolidated onto fuller days.</p>
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-1"><Users className="w-3.5 h-3.5" /> Techs</Label>
              <div className="flex flex-col gap-1.5 pt-1">
                {FILL_TECHS.map((t) => (
                  <label key={t} className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox checked={techs.includes(t)} onCheckedChange={() => toggleTech(t)} />
                    {t}
                  </label>
                ))}
              </div>
            </div>
          </div>
          <Button onClick={run} disabled={loading} className="mt-4">
            <Wand2 className="w-4 h-4 mr-2" />
            {loading ? "Building plan…" : "Propose schedule"}
          </Button>
        </CardContent>
      </Card>

      {result && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
            <StatCard label="Window" value={`${result.start} – ${result.end}`} small />
            <StatCard label="Due pool" value={result.pool_size} />
            <StatCard label="Placed" value={result.assigned_count} tone={result.assigned_count > 0 ? "ok" : "neutral"} />
            <StatCard label="Manual" value={result.manual_count} tone={result.manual_count > 0 ? "warn" : "ok"} />
            <StatCard label="Other tech job pool" value={result.needs_reassignment_count} small />
            <StatCard label="Unplaced" value={result.unplaced_count} tone={result.unplaced_count > 0 ? "info" : "ok"} />
          </div>

          {result.summary && result.summary.route_count > 0 && (
            <>
              <Card className="border-l-4 border-l-emerald-500">
                <CardContent className="py-3 grid grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-3 text-sm">
                  {([
                    ["Routes", String(result.summary.route_count)],
                    ["Total stops", String(result.summary.total_stops)],
                    ["On-site", fmtHM(result.summary.total_onsite_min)],
                    ["Paid drive", fmtHM(result.summary.total_paid_drive_min ?? result.summary.total_drive_min)],
                    ["Commute (unpaid)", fmtHM(result.summary.total_commute_min ?? 0)],
                    ["Total miles", result.summary.total_miles != null ? `${Math.round(result.summary.total_miles)} mi` : "—"],
                    ["Production", `$${result.summary.total_production.toLocaleString()}`],
                    ["% of day driving", `${result.summary.avg_efficiency_pct}%`],
                  ] as [string, string][]).map(([label, value]) => (
                    <div key={label}>
                      <div className="text-muted-foreground text-xs">{label}</div>
                      <div className={`font-semibold text-base ${label === "% of day driving" ? efficiencyTone(result.summary!.avg_efficiency_pct) : ""}`}>
                        {value}
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2 cursor-pointer select-none" onClick={() => setDaySummaryOpen((o) => !o)}>
                  <CardTitle className="text-sm flex items-center gap-1.5">
                    {daySummaryOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    Summary by day
                    {!daySummaryOpen && <span className="text-muted-foreground font-normal text-xs">(click to expand)</span>}
                  </CardTitle>
                </CardHeader>
                {daySummaryOpen && <CardContent className="space-y-4">
                  {groupRoutesByDay(result.summary.routes ?? []).map((day) => (
                    <div key={day.date} className="space-y-1.5">
                      <div className="flex items-baseline justify-between gap-2 border-b pb-1">
                        <span className="font-semibold text-sm">{weekdayLabel(day.date)}</span>
                        <span className="text-sm flex items-baseline gap-2 flex-wrap justify-end">
                          <span className="text-muted-foreground text-xs">
                            {day.routes.length} {day.routes.length === 1 ? "route" : "routes"} · {day.stops} stops · {fmtHM(day.drive_min)} drive
                          </span>
                          <span className="font-bold text-emerald-700">${day.production.toLocaleString()}</span>
                        </span>
                      </div>
                      {day.routes.map((r) => (
                        <div key={r.tech} className="flex items-baseline justify-between gap-2 text-xs pl-1">
                          <span className="font-medium min-w-[7rem]">{r.tech}</span>
                          <span className="text-muted-foreground flex gap-2 flex-wrap justify-end items-baseline">
                            <span>{r.stop_count} stops</span>
                            <span>· {r.total_hours}h</span>
                            <span>· {fmtHM(r.paid_drive_min ?? r.drive_min)} paid drive</span>
                            {r.avg_leg_min != null && <span>· {r.avg_leg_min}m/leg</span>}
                            {r.total_miles != null && <span>· {Math.round(r.total_miles)} mi</span>}
                            {r.commute_min != null && r.commute_min > 0 && (
                              <span className="opacity-70">· +{Math.round(r.commute_min)}m commute</span>
                            )}
                            <span>· {r.est_start}–{r.est_finish}</span>
                            <span className="font-semibold text-foreground">· ${r.production.toLocaleString()}</span>
                            <span className={`font-semibold ${efficiencyTone(r.efficiency_pct)}`}>· {r.efficiency_pct}% driving</span>
                          </span>
                        </div>
                      ))}
                    </div>
                  ))}
                </CardContent>}
              </Card>
            </>
          )}

          {result.proposed.length === 0 && (
            <Card>
              <CardContent className="py-6 text-center text-sm text-muted-foreground">
                Nobody is due (within tolerance) between {result.start} and {result.end}.
              </CardContent>
            </Card>
          )}

          {result.proposed.length > 0 && (
            <>
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold">
                  Proposed days
                  <span className="ml-2 font-normal text-xs text-muted-foreground">
                    drag a stop onto another day card to move it
                  </span>
                </span>
                <Button size="sm" variant="outline" onClick={() => setWeekMapOpen(true)}>
                  <MapPin className="w-3 h-3 mr-1" /> Week map — all routes overlaid
                </Button>
              </div>
              {(() => {
                const techsInPlan = [...new Set(result.proposed.map((d) => d.tech))].sort();
                const shownTechs = viewTech === "*"
                  ? techsInPlan
                  : techsInPlan.filter((t) => t === viewTech);
                return (
                  <>
                    <div className="flex flex-wrap gap-1.5">
                      <Button size="sm" variant={viewTech === "*" ? "default" : "outline"}
                              onClick={() => setViewTech("*")}>
                        All techs
                      </Button>
                      {techsInPlan.map((t) => (
                        <Button key={t} size="sm" variant={viewTech === t ? "default" : "outline"}
                                onClick={() => setViewTech(t)}>
                          {t}
                        </Button>
                      ))}
                    </div>
                    {shownTechs.map((tech) => {
                      const days = result.proposed
                        .filter((d) => d.tech === tech)
                        .sort((a, b) => a.date.localeCompare(b.date));
                      const total = days.reduce((n, d) => n + d.stop_count, 0);
                      return (
                        <div key={tech} className="space-y-2">
                          <div className="flex items-baseline gap-2 pt-2 border-b pb-1">
                            <span className="text-base font-semibold">{tech}</span>
                            <span className="text-xs text-muted-foreground">
                              {days.length} days · {total} stops
                            </span>
                          </div>
                          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                            {days.map((d) => (
                              <FillDayCard key={`${d.date}|${d.tech}`} day={d} staff={staff}
                                           onMoveStop={requestMove} />
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </>
                );
              })()}
              <Dialog open={weekMapOpen} onOpenChange={setWeekMapOpen}>
                <DialogContent className="max-w-6xl w-[96vw]">
                  <DialogHeader>
                    <DialogTitle>
                      Week map · {result.start} – {result.end} · one color per day
                    </DialogTitle>
                  </DialogHeader>
                  <WeekRouteMap days={result.proposed} />
                </DialogContent>
              </Dialog>
              <Dialog open={!!pendingMove} onOpenChange={(o) => { if (!o) setPendingMove(null); }}>
                <DialogContent className="max-w-md">
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-600" /> This move breaks the scheduling rules
                    </DialogTitle>
                  </DialogHeader>
                  {pendingMove && (
                    <div className="space-y-3 text-sm">
                      <div>
                        <span className="font-semibold">{pendingMove.stop.customer}</span>
                        {" → "}{weekdayLabel(pendingMove.toKey.split("|")[0])} · {pendingMove.toKey.split("|")[1]}
                      </div>
                      <ul className="list-disc pl-5 space-y-1">
                        {pendingMove.reasons.map((r, i) => (<li key={i}>{r}</li>))}
                      </ul>
                      <div className="flex justify-end gap-2 pt-1">
                        <Button variant="outline" size="sm" onClick={() => setPendingMove(null)}>
                          Cancel
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => {
                            executeMove(pendingMove.fromKey, pendingMove.toKey, pendingMove.stopId);
                            toast.success(`Moved ${pendingMove.stop.customer} (override)`);
                            setPendingMove(null);
                          }}
                        >
                          Override & move anyway
                        </Button>
                      </div>
                    </div>
                  )}
                </DialogContent>
              </Dialog>
            </>
          )}

          <UnscheduledBucket
            title="Needs manual scheduling"
            items={result.manual}
            blurb='Flagged "call to schedule / do not auto-schedule" — handle these by phone.'
          />
          {/* "Other tech job pool" — customers whose preferred tech isn't a field
              tech. Shown only as the count stat above; the full list is noise. */}
          <UnscheduledBucket
            title="Couldn't fit in the window"
            items={result.unplaced}
            blurb="Due within tolerance, but every eligible day was at capacity or constraints left no slot. Widen the window or raise max stops."
          />
          <DeferredBucket items={result.deferred ?? []} count={result.deferred_count ?? (result.deferred?.length ?? 0)} />
        </>
      )}
    </>
  );
}

// A proposed-schedule day card with ONE-CLICK FieldRoutes pushes (Caleb,
// 2026-07-29: "1 button to push instead of 2"): a per-stop "Push stop to FR"
// button and a whole-day "Push route to FR" button. Each push books straight
// through fieldroutes-appointment-submit with commit:true — the write-queue
// row is kept only as the audit trail; there is no approval step. X a stop to
// keep it out of the day push.
function FillDayCard({ day, staff, onMoveStop }: {
  day: FillDay;
  staff: { fullName: string } | null;
  onMoveStop?: (fromKey: string, stopId: string, toKey: string) => void;
}) {
  const dayKey = `${day.date}|${day.tech}`;
  const [queueing, setQueueing] = useState(false);
  const [queued, setQueued] = useState<Set<string>>(new Set());
  const [stopPushing, setStopPushing] = useState<string | null>(null);
  const [mapOpen, setMapOpen] = useState(false);
  // Per-card exclusion set: when the user X's someone, we drop them from the
  // queueing list so they will NOT be sent to FieldRoutes for this day.
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const over = day.stop_count > day.capacity;
  const stopKey = (s: FillStop) => `${s.subscription_id || s.customer_id}-${s.order}`;
  // Bookable = has a subscription, isn't already on the books, isn't locked,
  // hasn't been notified, and hasn't been X'd out by the user.
  const bookable = day.stops.filter((s) =>
    s.subscription_id &&
    !s.already_scheduled &&
    !s.locked &&
    !s.notification_sent &&
    !excluded.has(stopKey(s)),
  );
  const remaining = bookable.filter((s) => !queued.has(s.subscription_id));
  const allQueued = bookable.length > 0 && remaining.length === 0;

  const toggleExclude = (s: FillStop) => {
    setExcluded((cur) => {
      const next = new Set(cur);
      const k = stopKey(s);
      if (next.has(k)) next.delete(k); else next.add(k);
      return next;
    });
  };

  // One booking straight to FieldRoutes (commit:true — no approval step).
  const pushOne = async (s: FillStop): Promise<boolean> => {
    try {
      const { data, error } = await supabase.functions.invoke("fieldroutes-appointment-submit", {
        body: {
          staffName: staff!.fullName,
          commit: true,
          customer_id: Number(s.customer_id),
          customer_label: s.customer,
          service_type_id: Number(s.service_type_id) || 0,
          service_type_label: s.service_label,
          date: day.date,
          start: s.start,
          end: s.end,
          duration: s.duration || 30,
          subscription_id: Number(s.subscription_id),
          route_id: s.route_id ? Number(s.route_id) : undefined,
        },
      });
      return !error && data?.ok === true;
    } catch {
      return false;
    }
  };

  const pushStop = async (s: FillStop) => {
    if (!staff) return toast.error("Please sign in again.");
    setStopPushing(stopKey(s));
    const ok = await pushOne(s);
    setStopPushing(null);
    if (ok) {
      setQueued((cur) => new Set(cur).add(s.subscription_id));
      toast.success(`Pushed ${s.customer} to FieldRoutes`);
    } else {
      toast.error(`Failed to push ${s.customer} — see console.`);
    }
  };

  const pushDay = async () => {
    if (!staff) return toast.error("Please sign in again.");
    if (remaining.length === 0) return;
    setQueueing(true);
    const done = new Set(queued);
    let ok = 0, fail = 0;
    for (const s of remaining) {
      if (await pushOne(s)) {
        ok++; done.add(s.subscription_id);
        setQueued(new Set(done));   // tick stops green as they land
      } else fail++;
    }
    setQueueing(false);
    if (ok) toast.success(`Pushed ${ok} to FieldRoutes${fail ? ` · ${fail} failed` : ""}`);
    else toast.error("Failed to push this day — see console.");
  };

  return (
    <Card
      className="border-l-4 border-l-indigo-500"
      onDragOver={(e) => { if (onMoveStop) e.preventDefault(); }}
      onDrop={(e) => {
        if (!onMoveStop) return;
        e.preventDefault();
        try {
          const p = JSON.parse(e.dataTransfer.getData("text/plain"));
          if (p?.from && p?.id) onMoveStop(p.from, p.id, dayKey);
        } catch { /* not a stop drag */ }
      }}
    >
      <CardHeader className="pb-2">
        <div className="flex items-baseline justify-between gap-2 flex-wrap">
          <CardTitle className="text-base">{weekdayLabel(day.date)} · {day.tech}</CardTitle>
          <div className="text-sm text-muted-foreground">
            <span className={over ? "font-bold text-red-600" : "font-semibold"}>{day.stop_count}</span>/{day.capacity} stops
          </div>
        </div>
        <Badge variant="outline" className="w-fit text-indigo-700 border-indigo-300">{day.zone}</Badge>
        {day.summary && (
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground pt-1">
            <span>{humanTime(day.summary.est_start)}–{humanTime(day.summary.est_finish)} ({day.summary.total_hours}h)</span>
            <span>· {fmtHM(day.summary.paid_drive_min ?? day.summary.drive_min)} paid drive</span>
            {day.summary.total_miles != null && (
              <span>· {Math.round(day.summary.total_miles)} mi total</span>
            )}
            {day.summary.commute_min != null && day.summary.commute_min > 0 && (
              <span className="opacity-70">· +{Math.round(day.summary.commute_min)}m commute (unpaid)</span>
            )}
            <span>· {fmtHM(day.summary.onsite_min)} on-site</span>
            {day.summary.avg_leg_min != null && <span>· {day.summary.avg_leg_min}m/leg</span>}
            <span>· ${day.summary.production.toLocaleString()} production</span>
            <span className={`font-semibold ${efficiencyTone(day.summary.efficiency_pct)}`}>
              · {day.summary.efficiency_pct}% driving
            </span>
          </div>
        )}
        <div className="pt-1">
          <Button type="button" size="sm" variant="outline" onClick={() => setMapOpen(true)}>
            <MapPin className="w-3.5 h-3.5 mr-1" /> View map
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-2 pt-0">
        {day.stops.map((s) => {
          const isQueued = queued.has(s.subscription_id);
          const key = stopKey(s);
          const isExcluded = excluded.has(key);
          // Color rules (per user request):
          //  - locked OR notification already sent → black (and locked-in)
          //  - already scheduled on this day        → green
          //  - excluded by user                     → muted/struck
          //  - default                              → indigo (planner proposal)
          const isBlack = !!(s.locked || s.notification_sent);
          const isGreen = !isBlack && !!s.already_scheduled;
          const rowClass =
            isBlack ? "bg-foreground/90 text-background"
            : isGreen ? "bg-emerald-100 text-emerald-900 border border-emerald-300"
            : isExcluded ? "bg-muted text-muted-foreground line-through opacity-60"
            : "bg-indigo-50";
          // Lock the X button when the row is system-locked.
          const canExclude = !isBlack && !isQueued;
          // Proposed, un-pushed stops can be dragged onto another day card.
          const canDrag = !!onMoveStop && !isBlack && !isGreen && !isQueued;
          return (
            <div
              key={key}
              className={`text-xs rounded p-2 ${rowClass}${canDrag ? " cursor-grab active:cursor-grabbing" : ""}`}
              draggable={canDrag}
              onDragStart={(e) => {
                e.dataTransfer.setData("text/plain", JSON.stringify({ from: dayKey, id: key }));
                e.dataTransfer.effectAllowed = "move";
              }}
            >
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="font-semibold text-sm flex items-center gap-1">
                  {isQueued && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />}
                  {isBlack && <Lock className="w-3.5 h-3.5" />}
                  {isGreen && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />}
                  <span className={isBlack ? "font-mono opacity-70" : "text-muted-foreground font-mono"}>#{s.order}</span> {s.customer}
                </span>
                <span className="inline-flex items-center gap-2">
                  <Badge
                    variant="outline"
                    className={
                      isBlack ? "text-background border-background/40"
                      : isGreen ? "text-emerald-800 border-emerald-400"
                      : "text-indigo-700 border-indigo-300"
                    }
                  >
                   {humanTime(s.window)}
                  </Badge>
                  <span className={`font-mono ${isBlack ? "opacity-70" : "text-muted-foreground"}`}>
                    {s.days_off_target === 0 ? "on due date" : `${s.days_off_target > 0 ? "+" : ""}${s.days_off_target}d`}
                  </span>
                  {!isQueued && !isBlack && !isGreen && !isExcluded && s.subscription_id && (
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6"
                      title="Push this stop to FieldRoutes now"
                      disabled={queueing || stopPushing !== null}
                      onClick={() => pushStop(s)}
                    >
                      {stopPushing === key
                        ? <Clock className="w-3.5 h-3.5 animate-pulse text-indigo-600" />
                        : <Send className="w-3.5 h-3.5 text-indigo-600" />}
                    </Button>
                  )}
                  {canExclude && (
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6"
                      title={isExcluded ? "Re-include in this day" : "Exclude from this day (won't send to FieldRoutes)"}
                      onClick={() => toggleExclude(s)}
                    >
                      <X className={`w-3.5 h-3.5 ${isExcluded ? "text-emerald-700" : "text-red-600"}`} />
                    </Button>
                  )}
                </span>
              </div>
              <div className={`mt-0.5 ${isBlack ? "opacity-80" : "text-muted-foreground"}`}>
                {s.eta && <span className="font-mono font-medium">{humanTime(s.eta)}</span>}
                {s.eta && " · "}
                {typeof s.drive_from_prev_min === "number" && s.order > 1 && s.drive_from_prev_min > 0 && (
                  <>+{s.drive_from_prev_min}m drive · </>
                )}
                {s.city} · {s.service_label} · due {s.due_date}
              </div>
              {s.flag && (
                <div className="mt-1 text-red-700 font-medium">
                  <Badge variant="outline" className="mr-1 text-red-700 border-red-300">overdue</Badge>
                  {s.flag.replace(/^⚠\s*/, "")}
                </div>
              )}
              <div className="mt-1 flex flex-wrap gap-1">
                {s.confirm && <Badge variant="outline" className="text-amber-700 border-amber-300">confirm first</Badge>}
                {s.moved && <Badge variant="outline" className="text-indigo-700 border-indigo-300">moved here manually</Badge>}
                {typeof s.far_from_route_min === "number" && s.far_from_route_min > 0 && (
                  <Badge variant="outline" className="text-amber-700 border-amber-300">
                    ~{s.far_from_route_min}m from the rest of this route — could this be another day?
                  </Badge>
                )}
                {s.off_zone_day && <Badge variant="outline" className="text-muted-foreground">off usual zone-day</Badge>}
                {s.locked && (
                  <Badge variant="outline" className="text-background border-background/40">
                    <Lock className="w-3 h-3 mr-1" /> locked
                  </Badge>
                )}
                {s.notification_sent && !s.locked && (
                  <Badge variant="outline" className="text-background border-background/40">
                    <BellRing className="w-3 h-3 mr-1" /> notified
                  </Badge>
                )}
                {isGreen && (
                  <Badge variant="outline" className="text-emerald-800 border-emerald-400">
                    already scheduled
                  </Badge>
                )}
                {isExcluded && (
                  <Badge variant="outline" className="text-red-700 border-red-300">
                    excluded — won't send to FR
                  </Badge>
                )}
              </div>
              {s.special_scheduling && (
                <div className="mt-1 text-amber-700">
                  <Badge variant="outline" className="mr-1 text-amber-700 border-amber-300">note</Badge>
                  {s.special_scheduling}
                </div>
              )}
            </div>
          );
        })}
        <div className="flex justify-end pt-1">
          <Button size="sm" onClick={pushDay} disabled={queueing || allQueued || bookable.length === 0}>
            {allQueued ? <><CheckCircle2 className="w-3 h-3 mr-1" /> Route pushed to FR</>
              : <><Send className="w-3 h-3 mr-1" /> {queueing ? "Pushing…" : `Push route to FR (${remaining.length})`}</>}
          </Button>
        </div>
      </CardContent>
      <Dialog open={mapOpen} onOpenChange={setMapOpen}>
        <DialogContent className="max-w-5xl w-[95vw]">
          <DialogHeader>
            <DialogTitle>
              {day.tech} · {weekdayLabel(day.date)} · {day.stop_count} stops
              {day.summary ? ` · ${day.summary.efficiency_pct}% driving` : ""}
            </DialogTitle>
          </DialogHeader>
          <RouteMap stops={day.stops} />
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// Read-only list of due customers the planner did NOT auto-place, with the reason.
function UnscheduledBucket({ title, items, blurb }: { title: string; items: FillUnscheduled[]; blurb: string }) {
  if (!items || items.length === 0) return null;
  return (
    <Card className="border-l-4 border-l-amber-500">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Phone className="w-4 h-4 text-amber-600" /> {title} ({items.length})
        </CardTitle>
        <CardDescription>{blurb}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {items.map((m, i) => (
          <div key={`${m.customer}-${m.due_date}-${i}`} className="text-xs bg-amber-50 rounded p-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="font-semibold text-sm">{m.customer}</span>
              <span className="text-muted-foreground">due {m.due_date}</span>
            </div>
            <div className="text-muted-foreground mt-0.5">
              {m.city} · {m.service}{m.tech ? <> · prefers {m.tech}</> : null}
            </div>
            <div className="text-amber-700 mt-0.5">{m.reason}</div>
            {m.special_scheduling && m.special_scheduling !== m.reason && (
              <div className="text-muted-foreground mt-0.5 italic">{m.special_scheduling}</div>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

// Customers the planner intentionally held for a later week — not failures.
// Shown separately so they don't get confused with the "couldn't fit" bucket.
function DeferredBucket({ items, count }: { items: FillDeferred[]; count: number }) {
  if (!items || items.length === 0) return null;
  return (
    <Card className="border-l-4 border-l-sky-500">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <CalendarPlus className="w-4 h-4 text-sky-600" /> Held for a later week ({count})
        </CardTitle>
        <CardDescription>
          Due soon but a better-fit week is coming up — the planner is waiting on
          purpose. Not failures. The <code>reason</code> is the source of truth;{" "}
          <em>best fit</em> is a soft pointer to the nearest matching zone-day.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {items.map((m, i) => (
          <div key={`${m.customer}-${m.due_date}-${i}`} className="text-xs bg-sky-50 rounded p-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="font-semibold text-sm">{m.customer}</span>
              <span className="text-muted-foreground">due {m.due_date}</span>
            </div>
            <div className="text-muted-foreground mt-0.5">
              {m.city} · {m.service}{m.tech ? <> · prefers {m.tech}</> : null}
            </div>
            {m.best_day && (
              <div className="text-sky-700 mt-0.5">
                best fit {m.best_day.weekday} {m.best_day.date}
                {m.best_day.in_zone === false && " · off-zone"}
                {m.best_day.in_window === false && " · outside current window"}
                {typeof m.best_day.load === "number" && ` · load ${m.best_day.load}`}
              </div>
            )}
            <div className="text-sky-800/80 mt-0.5 italic">{m.reason}</div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export default ScheduleReview;
