// ScheduleReview — admin-only single-pane quick report.
// Defaults to 3 days starting today+2 (skips today and tomorrow). Surfaces
// the most actionable items in a big "Key Highlights" panel up top, then a
// per-tech-day grid below with inline indicators.

import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  ArrowLeft, AlertTriangle, Clock, MapPin, ShuffleIcon, ClipboardList, CalendarCheck, Car,
  Wand2, Phone, Users, CalendarPlus, CheckCircle2, X, Lock, BellRing, TrendingUp, TrendingDown, Minus,
  Send, ChevronDown, ChevronRight, Bot,
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
import WeekRouteMap, { type MapMoveGroup, dayColor, dotIcon, GMAPS_LIBRARIES } from "@/components/scheduling/WeekRouteMap";
import { GoogleMap, MarkerF, DrawingManagerF, useJsApiLoader } from "@react-google-maps/api";

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
              <Clock className="w-4 h-4" /> Write Queue
            </TabsTrigger>
            <TabsTrigger
              value="reschedule"
              className="gap-2 text-base font-semibold px-6 py-2.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md"
            >
              <Bot className="w-4 h-4" /> Reschedule Bot
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
            <PendingFieldRoutesWrites title="Writes awaiting approval (Slot Finder bookings + strays)" />
          </TabsContent>
          <TabsContent value="reschedule" className="mt-4 space-y-6">
            <RescheduleBotMode staff={staff} />
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
            Efficiency = inverse of the drive share (20% of the day driving = 80% efficient; only
            drive between stops counts) per tech, per week — 8 weeks of history through 8 weeks ahead.
            Same metric as Fill &amp; Review, estimated the same way for past and future so weeks
            compare directly. The <strong>bold</strong> column is this week.
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
                        {delta == null ? <Minus className="w-3.5 h-3.5 inline text-muted-foreground" />
                          : delta > 1 ? <span className="text-emerald-700 inline-flex items-center gap-0.5"><TrendingUp className="w-3.5 h-3.5" />+{delta}</span>
                          : delta < -1 ? <span className="text-red-600 inline-flex items-center gap-0.5"><TrendingDown className="w-3.5 h-3.5" />{delta}</span>
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
  pushed_to_fr?: boolean;        // grey — already written/queued to FieldRoutes (from the write queue; survives reloads)
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
  efficiency_pct: number;        // inverse drive share: 20% driving = 80% efficient; higher is better
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
  /** "date|tech" → FieldRoutes routeID for EVERY field tech (not just the
   *  proposed days) — powers reassigning a day onto another tech's route. */
  routes_all?: Record<string, string>;
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

// Color the efficiency score = inverse drive share (20% driving = 80%
// efficient; between-stop drive only) — HIGHER is better. A tight 12-stop
// pocket day (~5-min legs) is ~87%; 10-min legs pull it to ~77%; a
// scattered day runs below 70% — a third of the day behind the wheel.
function efficiencyTone(pct: number): string {
  if (pct >= 85) return "text-emerald-700";
  if (pct >= 70) return "text-amber-700";
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

  // Week-map bulk moves (select stops → day chip, or drag day-chip onto
  // day-chip). Items with reasons break a rule and need the are-you-sure
  // confirm; `noTarget` stops can't move at all (their tech has no proposed
  // route on the target date).
  type BulkItem = { fromKey: string; toKey: string; stopId: string; stop: FillStop; reasons: string[] };
  const [pendingBulk, setPendingBulk] = useState<{
    toDate: string; items: BulkItem[]; noTarget: { stop: FillStop; tech: string }[];
  } | null>(null);

  // Latest result for async flows (reroute calls run after state updates).
  const resultRef = useRef<FillResult | null>(null);
  useEffect(() => { resultRef.current = result; }, [result]);

  // ── Bulk push-to-FR (a tech's whole week, or every open route) ──────────
  // Enqueues all bookable stops as paced 'auto' writes in one bulk call (the
  // paced bot does the actual writing (40/min)); falls back to per-stop enqueues
  // if the deployed edge fn predates bulk mode.
  const [bulkQueued, setBulkQueued] = useState<Set<string>>(new Set());
  const [bulkPushing, setBulkPushing] = useState(false);
  const [pendingPushAll, setPendingPushAll] = useState<{
    label: string; items: { stop: FillStop; day: FillDay }[];
  } | null>(null);

  // route_id is REQUIRED to push: FieldRoutes accepts a routeless appointment
  // but it lands unassigned — on nobody's schedule (live incident 2026-07-31:
  // six 8/3 appts booked with no route). Stops without one are excluded here
  // and surfaced by the per-day push instead of silently vanishing.
  const bookableOf = (d: FillDay) => d.stops.filter((s) =>
    s.subscription_id && !s.already_scheduled && !s.locked && !s.notification_sent
    && !s.pushed_to_fr
    && (s.route_id || d.route_id)
    && !bulkQueued.has(s.subscription_id));

  const requestPushAll = (days: FillDay[], label: string) => {
    const items = days.flatMap((d) => bookableOf(d).map((stop) => ({ stop, day: d })));
    if (!items.length) {
      toast.error("Nothing left to push — everything is booked or already queued.");
      return;
    }
    setPendingPushAll({ label, items });
  };

  const runPushAll = async () => {
    const pending = pendingPushAll;
    if (!pending || !staff) return;
    setPendingPushAll(null);
    setBulkPushing(true);
    const toRow = ({ stop: s, day: d }: { stop: FillStop; day: FillDay }) => ({
      customer_id: Number(s.customer_id),
      customer_label: s.customer,
      service_type_id: Number(s.service_type_id) || 0,
      service_type_label: s.service_label,
      date: d.date,
      start: s.start,
      end: s.end,
      duration: s.duration || 30,
      subscription_id: Number(s.subscription_id),
      route_id: s.route_id ? Number(s.route_id) : undefined,
    });
    let okIds: string[] = [];
    try {
      const { data, error } = await supabase.functions.invoke("fieldroutes-appointment-submit", {
        body: { staffName: staff.fullName, bulk: pending.items.map(toRow) },
      });
      if (!error && data?.ok && typeof data?.queued_count === "number") {
        okIds = pending.items.map((i) => i.stop.subscription_id);
      }
    } catch { /* fall through to per-stop */ }
    if (!okIds.length) {
      // Older backend without bulk mode: enqueue one at a time (still paced).
      for (const it of pending.items) {
        try {
          const { data, error } = await supabase.functions.invoke("fieldroutes-appointment-submit", {
            body: { staffName: staff.fullName, commit: true, paced: true, ...toRow(it) },
          });
          if (!error && data?.ok && (data?.pushed === true || data?.paced === true)) {
            okIds.push(it.stop.subscription_id);
          }
        } catch { /* skip this one */ }
      }
    }
    setBulkPushing(false);
    if (okIds.length) {
      setBulkQueued((cur) => new Set([...cur, ...okIds]));
      supabase.functions.invoke("fieldroutes-queue-worker", { body: { kick: true } }).catch(() => {});
      toast.success(`Queued ${okIds.length} stops for FieldRoutes — the bot pushes them ~40/min `        + `(~${Math.max(1, Math.ceil(okIds.length / 40))} min)`);
    } else {
      toast.error("Could not queue those pushes — see console.");
    }
  };

  const TOL_BY_FREQ: Record<number, number> = { 30: 5, 60: 10, 90: 14 };
  const fillStopKey = (s: FillStop) => `${s.subscription_id || s.customer_id}-${s.order}`;
  const dayDiffFromDue = (targetIso: string, dueIso: string) =>
    Math.round((new Date(`${targetIso}T12:00:00`).getTime()
                - new Date(`${dueIso}T12:00:00`).getTime()) / 86400000);

  // Pure: apply a batch of stop moves to a FillResult (same semantics the
  // single-card drag always had — moved stops rebook on the TARGET day's
  // FieldRoutes route, since the route carries the date).
  const applyMoves = (prev: FillResult, moves: { fromKey: string; toKey: string; stopId: string }[]): FillResult => {
    const proposed = prev.proposed.map((d) => ({ ...d, stops: [...d.stops] }));
    for (const m of moves) {
      const src = proposed.find((d) => `${d.date}|${d.tech}` === m.fromKey);
      const dst = proposed.find((d) => `${d.date}|${d.tech}` === m.toKey);
      if (!src || !dst) continue;
      const idx = src.stops.findIndex((s) => fillStopKey(s) === m.stopId);
      if (idx < 0) continue;
      const [stop] = src.stops.splice(idx, 1);
      dst.stops.push({
        ...stop,
        order: dst.stops.length + 1,
        days_off_target: dayDiffFromDue(dst.date, stop.due_date),
        route_id: dst.route_id != null && dst.route_id !== "" ? String(dst.route_id) : undefined,
        eta: undefined,
        drive_from_prev_min: undefined,
        moved: true,
      });
      src.stops.forEach((s, i) => { s.order = i + 1; });
      src.stop_count = src.stops.length;
      dst.stop_count = dst.stops.length;
    }
    return { ...prev, proposed };
  };

  const executeMove = (fromKey: string, toKey: string, stopId: string) => {
    setResult((prev) => (prev ? applyMoves(prev, [{ fromKey, toKey, stopId }]) : prev));
    void rerouteKeys([fromKey, toKey]);
  };

  // After manual moves, ask the engine to re-order each touched day for drive
  // efficiency and re-project its ETAs, so the times shown stay honest.
  // Failures keep the manual order (times just show as re-computed pending).
  const rerouteKeys = async (keys: string[]) => {
    for (const key of [...new Set(keys)]) {
      const cur = resultRef.current;
      const day = cur?.proposed.find((d) => `${d.date}|${d.tech}` === key);
      if (!day || day.stops.length === 0) continue;
      try {
        const { data, error } = await supabase.functions.invoke("scheduling-fill", {
          body: { staffName: staff?.fullName, action: "reroute_day",
                  tech: day.tech, date: day.date, stops: day.stops },
        });
        const rr = data?.result;
        if (!error && data?.ok && rr?.ok && Array.isArray(rr.stops)) {
          setResult((prev) => (!prev ? prev : {
            ...prev,
            proposed: prev.proposed.map((d) => (`${d.date}|${d.tech}` === key
              ? { ...d, stops: rr.stops, stop_count: rr.stops.length, summary: rr.summary }
              : d)),
          }));
        }
      } catch { /* keep the manual order if the reroute call fails */ }
    }
  };

  // Validate one prospective move; returns the rule-break reasons ([] = clean).
  const moveReasons = (stop: FillStop, srcTech: string, dst: FillDay, extraLoad = 0): string[] => {
    const reasons: string[] = [];
    const diff = dayDiffFromDue(dst.date, stop.due_date);
    const tol = TOL_BY_FREQ[stop.frequency] ?? 0;
    if (Math.abs(diff) > tol) {
      const cadence = stop.frequency === 30 ? "monthly" : stop.frequency === 60 ? "bi-monthly"
        : stop.frequency === 90 ? "quarterly" : `${stop.frequency}-day`;
      reasons.push(`Puts them ${Math.abs(diff)} days ${diff > 0 ? "past" : "before"} their ideal date `
        + `(due ${stop.due_date}) — ${cadence} flexibility is ±${tol} days.`);
    }
    if (srcTech !== dst.tech) {
      reasons.push(`Moves them from ${srcTech} (their assigned tech) to ${dst.tech}.`);
    }
    if (dst.stop_count + extraLoad >= dst.capacity) {
      reasons.push(`${weekdayLabel(dst.date)} is already at capacity (${dst.stop_count}/${dst.capacity} stops).`);
    }
    if (stop.special_scheduling) {
      reasons.push(`Customer scheduling note: “${stop.special_scheduling.trim()}” — double-check ${weekdayLabel(dst.date)} works for it.`);
    }
    return reasons;
  };

  // Week-map: move the selected stops (each staying with its own tech) onto toDate.
  const handleMapMoves = (groups: MapMoveGroup[], toDate: string) => {
    const cur = resultRef.current;
    if (!cur) return;
    const items: BulkItem[] = [];
    const noTarget: { stop: FillStop; tech: string }[] = [];
    const headed: Record<string, number> = {};
    const created: Record<string, FillDay> = {};
    for (const g of groups) {
      const fromKey = `${g.fromDate}|${g.tech}`;
      const src = cur.proposed.find((d) => `${d.date}|${d.tech}` === fromKey);
      if (!src) continue;
      let dst = cur.proposed.find((d) => d.date === toDate && d.tech === g.tech)
        || created[`${toDate}|${g.tech}`];
      if (!dst) {
        // Empty target day: create it on the tech's real FieldRoutes route so
        // moving onto a 0-stop day works from the map too.
        const rid = cur.routes_all?.[`${toDate}|${g.tech}`];
        if (rid) {
          const wd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][new Date(`${toDate}T12:00:00`).getDay()];
          const dstDay: FillDay = { date: toDate, weekday: wd, tech: g.tech, zone: "",
                                    stop_count: 0, capacity: cur.max_stops || 12, stops: [], route_id: rid };
          dst = dstDay;
          created[`${toDate}|${g.tech}`] = dstDay;
          setResult((prev) => (prev ? { ...prev, proposed: [...prev.proposed, dstDay] } : prev));
        }
      }
      for (const k of g.stopKeys) {
        const stop = src.stops.find((s) => fillStopKey(s) === k);
        if (!stop || stop.already_scheduled || stop.locked || stop.notification_sent || stop.pushed_to_fr) continue;
        if (!dst) { noTarget.push({ stop, tech: g.tech }); continue; }
        const toKey = `${dst.date}|${dst.tech}`;
        items.push({ fromKey, toKey, stopId: k, stop,
                     reasons: moveReasons(stop, g.tech, dst, headed[toKey] ?? 0) });
        headed[toKey] = (headed[toKey] ?? 0) + 1;
      }
    }
    if (!items.length && !noTarget.length) return;
    const blocked = items.filter((i) => i.reasons.length);
    if (!blocked.length && !noTarget.length) {
      setResult((prev) => (prev ? applyMoves(prev, items) : prev));
      void rerouteKeys(items.flatMap((i) => [i.fromKey, i.toKey]));
      toast.success(`Moved ${items.length} stop${items.length === 1 ? "" : "s"} to ${weekdayLabel(toDate)} — re-routing…`);
    } else {
      setPendingBulk({ toDate, items, noTarget });
    }
  };

  // Week-map: drag one day chip onto another = combine those days (per tech).
  const handleMergeDays = (fromDate: string, toDate: string, techsShown: string[]) => {
    const cur = resultRef.current;
    if (!cur) return;
    const groups: MapMoveGroup[] = [];
    for (const t of techsShown) {
      const src = cur.proposed.find((d) => d.date === fromDate && d.tech === t);
      if (!src) continue;
      const keys = src.stops
        .filter((s) => !s.already_scheduled && !s.locked && !s.notification_sent && !s.pushed_to_fr)
        .map((s) => fillStopKey(s));
      if (keys.length) groups.push({ fromDate, tech: t, stopKeys: keys });
    }
    if (groups.length) handleMapMoves(groups, toDate);
    else toast.error("Nothing movable on that day — booked/locked appointments stay put.");
  };

  const executeBulk = (items: BulkItem[], toDate: string) => {
    if (!items.length) return;
    setResult((prev) => (prev ? applyMoves(prev, items) : prev));
    void rerouteKeys(items.flatMap((i) => [i.fromKey, i.toKey]));
    toast.success(`Moved ${items.length} stop${items.length === 1 ? "" : "s"} to ${weekdayLabel(toDate)} — re-routing…`);
  };

  // ── Drop a stop onto an EMPTY day (a date where the tech has a FieldRoutes
  // route but the plan gave them nothing): create the day on that route,
  // then run the normal single-stop move flow (rule dialog included). ──
  const requestMoveToDate = (fromKey: string, stopId: string, date: string, tech: string) => {
    const cur = resultRef.current;
    if (!cur) return;
    const toKey = `${date}|${tech}`;
    if (fromKey === toKey) return;
    let dst = cur.proposed.find((d) => d.date === date && d.tech === tech);
    if (!dst) {
      const rid = cur.routes_all?.[toKey];
      if (!rid) {
        toast.error(`${tech} has no FieldRoutes route on ${weekdayLabel(date)} — create it in FR first.`);
        return;
      }
      const wd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][new Date(`${date}T12:00:00`).getDay()];
      const dstDay: FillDay = { date, weekday: wd, tech, zone: "", stop_count: 0,
                                capacity: cur.max_stops || 12, stops: [], route_id: rid };
      dst = dstDay;
      setResult((prev) => (prev ? { ...prev, proposed: [...prev.proposed, dstDay] } : prev));
    }
    const src = cur.proposed.find((d) => `${d.date}|${d.tech}` === fromKey);
    const stop = src?.stops.find((s) => fillStopKey(s) === stopId);
    if (!src || !stop) return;
    if (stop.already_scheduled || stop.locked || stop.notification_sent || stop.pushed_to_fr) {
      toast.error("That appointment is already booked/locked in FieldRoutes — reschedule it there instead.");
      return;
    }
    const reasons = moveReasons(stop, src.tech, dst);
    if (reasons.length) {
      setPendingMove({ fromKey, toKey, stopId, stop, reasons });
    } else {
      executeMove(fromKey, toKey, stopId);
      toast.success(`Moved ${stop.customer} to ${weekdayLabel(date)}`);
    }
  };

  // ── Reassign a whole day to a DIFFERENT tech (Caleb: "assign a route on
  // Brock to Dylan"). Moves every movable stop onto the target tech's day for
  // the same date — creating that day (on the target tech's real FieldRoutes
  // route) when they don't have one in the plan yet — then re-routes both
  // days so the order/ETAs reflect the target tech's home base. ──
  const requestReassignDay = (day: FillDay, targetTech: string) => {
    const cur = resultRef.current;
    if (!cur || !targetTech || targetTech === day.tech) return;
    let dst = cur.proposed.find((d) => d.date === day.date && d.tech === targetTech);
    if (!dst) {
      const rid = cur.routes_all?.[`${day.date}|${targetTech}`];
      if (!rid) {
        toast.error(`${targetTech} has no FieldRoutes route on ${weekdayLabel(day.date)} — `
          + `create their route in FieldRoutes first, then re-run Fill.`);
        return;
      }
      dst = {
        date: day.date, weekday: day.weekday, tech: targetTech, zone: day.zone,
        stop_count: 0, capacity: day.capacity, stops: [], route_id: rid,
      };
      const dstDay = dst;
      setResult((prev) => (prev ? { ...prev, proposed: [...prev.proposed, dstDay] } : prev));
    }
    const dstForReasons = dst;
    const fromKey = `${day.date}|${day.tech}`;
    const toKey = `${day.date}|${targetTech}`;
    const movable = day.stops.filter((s) => !s.already_scheduled && !s.locked && !s.notification_sent && !s.pushed_to_fr);
    if (!movable.length) {
      toast.error("Nothing movable on that day — booked/locked stops stay with their tech.");
      return;
    }
    const items: BulkItem[] = movable.map((stop, i) => ({
      fromKey, toKey, stopId: fillStopKey(stop), stop,
      reasons: moveReasons(stop, day.tech, dstForReasons, i),
    }));
    setPendingBulk({ toDate: day.date, items, noTarget: [] });
  };

  const requestMove = (fromKey: string, stopId: string, toKey: string) => {
    if (!result || fromKey === toKey) return;
    const src = result.proposed.find((d) => `${d.date}|${d.tech}` === fromKey);
    const dst = result.proposed.find((d) => `${d.date}|${d.tech}` === toKey);
    if (!src || !dst) return;
    const stop = src.stops.find((s) => fillStopKey(s) === stopId);
    if (!stop) return;
    if (stop.already_scheduled || stop.locked || stop.notification_sent || stop.pushed_to_fr) {
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
      // Mark stops already written/queued to FieldRoutes (server reads the
      // write queue) so they render grey and can't be re-pushed — even after
      // a reload or a fresh run, before the FR data sync catches up.
      const res = data.result as FillResult;
      if (!Array.isArray(res?.proposed)) res.proposed = [];
      const pushedKeys = new Set(
        ((data.pushed ?? []) as Array<{ subscription_id?: unknown; date?: unknown }>)
          .map((p) => `${p.subscription_id}|${p.date}`));
      if (pushedKeys.size) {
        for (const d of res.proposed) {
          for (const s of d.stops) {
            if (!s.already_scheduled && pushedKeys.has(`${s.subscription_id}|${d.date}`)) {
              s.pushed_to_fr = true;
            }
          }
        }
      }
      setResult(res);
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
            on a single stop or "Push route to FR" for the whole day. Pushes
            queue instantly and the bot writes them to FieldRoutes at a safe pace
            (~40/min, under FieldRoutes' 60/min limit).
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
              <p className="text-[11px] text-muted-foreground leading-tight">Days below this get consolidated onto fuller days. 0 = engine default (6); set 1 to turn consolidation off.</p>
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
            <StatCard label="Due in window" value={result.schedulable} />
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
                    ["Avg efficiency", `${result.summary.avg_efficiency_pct}%`],
                  ] as [string, string][]).map(([label, value]) => (
                    <div key={label}>
                      <div className="text-muted-foreground text-xs">{label}</div>
                      <div className={`font-semibold text-base ${label === "Avg efficiency" ? efficiencyTone(result.summary!.avg_efficiency_pct) : ""}`}>
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
                            <span className={`font-semibold ${efficiencyTone(r.efficiency_pct)}`}>· {r.efficiency_pct}% efficient</span>
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
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="text-sm font-semibold">
                  Proposed days
                  <span className="ml-2 font-normal text-xs text-muted-foreground">
                    drag a stop onto another day card to move it
                  </span>
                </span>
                <div className="flex items-center gap-2 flex-wrap">
                  <Button size="lg" variant="outline" disabled={bulkPushing}
                          onClick={() => requestPushAll(result.proposed, "ALL open routes")}>
                    <Send className="w-4 h-4 mr-2" />
                    {bulkPushing ? "Queueing…"
                      : `Push ALL routes to FR (${result.proposed.reduce((n, d) => n + bookableOf(d).length, 0)})`}
                  </Button>
                  <Button size="lg" onClick={() => setWeekMapOpen(true)}>
                    <MapPin className="w-5 h-5 mr-2" /> Week map — all routes overlaid
                  </Button>
                </div>
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
                        // Empty shells (created by a cancelled/pending reassign)
                        // render via the empty-day placeholders below instead.
                        .filter((d) => d.tech === tech && d.stops.length > 0)
                        .sort((a, b) => a.date.localeCompare(b.date));
                      // Every date in the window where this tech has a
                      // FieldRoutes route but NO stops: rendered as a drop
                      // target so the office can seed a fresh day.
                      const emptyDates = (() => {
                        const have = new Set(days.map((d) => d.date));
                        const out: string[] = [];
                        const endD = new Date(`${result.end}T12:00:00`);
                        for (let cur = new Date(`${result.start}T12:00:00`); cur <= endD; cur.setDate(cur.getDate() + 1)) {
                          const iso = isoFromDate(cur);
                          if (cur.getDay() === 0 || have.has(iso)) continue;
                          if (!result.routes_all?.[`${iso}|${tech}`]) continue;
                          out.push(iso);
                        }
                        return out;
                      })();
                      const gridItems: Array<{ kind: "day"; d: FillDay } | { kind: "empty"; date: string }> = [
                        ...days.map((d) => ({ kind: "day" as const, d })),
                        ...emptyDates.map((date) => ({ kind: "empty" as const, date })),
                      ].sort((a, b) =>
                        (a.kind === "day" ? a.d.date : a.date).localeCompare(b.kind === "day" ? b.d.date : b.date));
                      const total = days.reduce((n, d) => n + d.stop_count, 0);
                      const techBookable = days.reduce((n, d) => n + bookableOf(d).length, 0);
                      return (
                        <div key={tech} className="space-y-2">
                          <div className="flex items-baseline justify-between gap-2 pt-2 border-b pb-1 flex-wrap">
                            <span className="flex items-baseline gap-2">
                              <span className="text-base font-semibold">{tech}</span>
                              <span className="text-xs text-muted-foreground">
                                {days.length} days · {total} stops
                              </span>
                            </span>
                            <Button size="sm" variant="outline" disabled={bulkPushing || techBookable === 0}
                                    onClick={() => requestPushAll(days, `${tech}'s ${days.length} days`)}>
                              <Send className="w-3 h-3 mr-1" />
                              Push {tech.split(" ")[0]}'s week to FR ({techBookable})
                            </Button>
                          </div>
                          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                            {gridItems.map((item) => (item.kind === "day" ? (
                              <FillDayCard key={`${item.d.date}|${item.d.tech}`} day={item.d} staff={staff}
                                           onMoveStop={requestMove} externQueued={bulkQueued}
                                           reassignTechs={FILL_TECHS} onReassign={requestReassignDay} />
                            ) : (
                              <EmptyFillDayCard key={`empty-${item.date}-${tech}`} date={item.date} tech={tech}
                                                onDropStop={requestMoveToDate} />
                            )))}
                          </div>
                        </div>
                      );
                    })}
                  </>
                );
              })()}
              <Dialog open={!!pendingPushAll} onOpenChange={(o) => { if (!o) setPendingPushAll(null); }}>
                <DialogContent className="max-w-md">
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                      <Send className="w-4 h-4" /> Push {pendingPushAll?.label} to FieldRoutes?
                    </DialogTitle>
                  </DialogHeader>
                  {pendingPushAll && (
                    <div className="space-y-3 text-sm">
                      <p>
                        <span className="font-semibold">{pendingPushAll.items.length} stops</span> will be
                        queued and booked into FieldRoutes automatically at a safe pace (~40/min)
                        (~{Math.max(1, Math.ceil(pendingPushAll.items.length / 40))} min total). Booked, locked, and
                        already-notified appointments are skipped. This books real appointments.
                      </p>
                      <div className="flex justify-end gap-2 pt-1">
                        <Button variant="outline" size="sm" onClick={() => setPendingPushAll(null)}>
                          Cancel
                        </Button>
                        <Button size="sm" onClick={() => { void runPushAll(); }}>
                          Push {pendingPushAll.items.length} stops
                        </Button>
                      </div>
                    </div>
                  )}
                </DialogContent>
              </Dialog>
              <Dialog open={weekMapOpen} onOpenChange={setWeekMapOpen}>
                <DialogContent className="max-w-[98vw] w-[98vw] h-[96vh] max-h-[96vh] flex flex-col">
                  <DialogHeader>
                    <DialogTitle>
                      Week map · {result.start} – {result.end} · one color per day
                    </DialogTitle>
                  </DialogHeader>
                  <div className="flex-1 min-h-0">
                    <WeekRouteMap days={result.proposed.filter((d) => d.stops.length > 0)}
                                  onMoveStops={handleMapMoves}
                                  onMergeDays={handleMergeDays}
                                  windowDates={(() => {
                                    const out: string[] = [];
                                    const endD = new Date(`${result.end}T12:00:00`);
                                    for (let cur = new Date(`${result.start}T12:00:00`); cur <= endD; cur.setDate(cur.getDate() + 1)) {
                                      if (cur.getDay() !== 0) out.push(isoFromDate(cur));
                                    }
                                    return out;
                                  })()} />
                  </div>
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
              <Dialog open={!!pendingBulk} onOpenChange={(o) => { if (!o) setPendingBulk(null); }}>
                <DialogContent className="max-w-lg">
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-600" />
                      Move stops to {pendingBulk ? weekdayLabel(pendingBulk.toDate) : ""}?
                    </DialogTitle>
                  </DialogHeader>
                  {pendingBulk && (() => {
                    const clean = pendingBulk.items.filter((i) => !i.reasons.length);
                    const blocked = pendingBulk.items.filter((i) => i.reasons.length);
                    return (
                      <div className="space-y-3 text-sm max-h-[60vh] overflow-y-auto">
                        {clean.length > 0 && (
                          <div>
                            <span className="font-semibold">{clean.length}</span> stop{clean.length === 1 ? "" : "s"} move cleanly
                            {" — "}{clean.map((i) => i.stop.customer).join(", ")}.
                          </div>
                        )}
                        {blocked.length > 0 && (
                          <div className="space-y-2">
                            <div className="font-semibold text-amber-700">
                              {blocked.length} break{blocked.length === 1 ? "s" : ""} the scheduling rules:
                            </div>
                            {blocked.map((i) => (
                              <div key={`${i.fromKey}-${i.stopId}`} className="pl-2 border-l-2 border-amber-300">
                                <div className="font-medium">{i.stop.customer}</div>
                                <ul className="list-disc pl-5">
                                  {i.reasons.map((r, ri) => (<li key={ri}>{r}</li>))}
                                </ul>
                              </div>
                            ))}
                          </div>
                        )}
                        {pendingBulk.noTarget.length > 0 && (
                          <div className="text-muted-foreground">
                            Staying put (no proposed route for their tech on {weekdayLabel(pendingBulk.toDate)}):{" "}
                            {pendingBulk.noTarget.map((n) => `${n.stop.customer} (${n.tech})`).join(", ")}.
                          </div>
                        )}
                        <div className="flex justify-end gap-2 pt-1 flex-wrap">
                          <Button variant="outline" size="sm" onClick={() => setPendingBulk(null)}>
                            Cancel
                          </Button>
                          {clean.length > 0 && blocked.length > 0 && (
                            <Button size="sm" variant="secondary"
                              onClick={() => { executeBulk(clean, pendingBulk.toDate); setPendingBulk(null); }}>
                              Move only the {clean.length} clean one{clean.length === 1 ? "" : "s"}
                            </Button>
                          )}
                          <Button size="sm"
                            onClick={() => { executeBulk(pendingBulk.items, pendingBulk.toDate); setPendingBulk(null); }}>
                            {blocked.length > 0
                              ? `Yes — move all ${pendingBulk.items.length} anyway`
                              : `Move ${pendingBulk.items.length} stop${pendingBulk.items.length === 1 ? "" : "s"}`}
                          </Button>
                        </div>
                      </div>
                    );
                  })()}
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

// ── Reschedule Bot ───────────────────────────────────────────────────────────
// Optimizes BOOKED appointments: proposes moving any appointment that is NOT
// locked and whose reminder has NOT been sent onto a better same-tech day
// (within its frequency tolerance, target day has room, clears the same
// geometric bars the fill rebalance uses). Accepted moves queue as paced
// appointment/update writes — the bot reschedules them in FieldRoutes.
type RescheduleMove = {
  appointment_id: string; customer: string; city: string; tech: string;
  from_date: string; to_date: string; start: string; end: string;
  duration: number; gain_mi: number; from_dist_mi: number; to_dist_mi: number;
  to_route_id: string; from_load: number; to_load: number;
  special_scheduling?: string | null;
};
type RescheduleResult = {
  ok: boolean; start: string; end: string; appointments: number;
  movable: number; locked: number; notified: number;
  moves: RescheduleMove[]; total_gain_mi: number;
};

// Map view of the bot's proposals: each movable stop is a dot in its TARGET
// day's color — click a dot (or a day chip) to bulk-toggle which moves get
// queued. The visual answer to "where do these go?".
function RescheduleMapDialog({ open, onOpenChange, moves, checked, onToggle, onToggleDate }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  moves: RescheduleMove[];
  checked: Set<string>;
  onToggle: (id: string) => void;
  onToggleDate: (date: string) => void;
}) {
  const [apiKey, setApiKey] = useState<string | null>(null);
  useEffect(() => {
    if (!open || apiKey) return;
    supabase.functions.invoke("get-maps-key").then(({ data }) => {
      const k = (data as { key?: string } | null)?.key || "";
      if (k) setApiKey(k);
    });
  }, [open, apiKey]);
  const geo = moves.filter((m) => typeof (m as any).lat === "number" && typeof (m as any).lng === "number");
  const dates = [...new Set(moves.map((m) => m.to_date))].sort();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[96vw] w-[96vw] h-[92vh] max-h-[92vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Proposed reschedules — dot color = the day it should move TO</DialogTitle>
        </DialogHeader>
        <div className="flex flex-wrap gap-1.5">
          {dates.map((date) => {
            const n = moves.filter((m) => m.to_date === date).length;
            const sel = moves.filter((m) => m.to_date === date && checked.has(m.appointment_id)).length;
            return (
              <button key={date} type="button" onClick={() => onToggleDate(date)}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium ${sel ? "" : "opacity-40"}`}
                      style={{ borderColor: dayColor(date) }}
                      title={`Toggle all moves to ${weekdayLabel(date)}`}>
                <span className="inline-block w-3 h-3 rounded-full border border-white shadow-sm" style={{ background: dayColor(date) }} />
                → {weekdayLabel(date)} · {sel}/{n}
              </button>
            );
          })}
          <span className="text-xs text-muted-foreground self-center">click a dot or chip to include/exclude moves</span>
        </div>
        <div className="flex-1 min-h-0">
          {apiKey ? (
            <RescheduleProposalMapInner apiKey={apiKey} geo={geo} checked={checked} onToggle={onToggle} />
          ) : (
            <div className="p-6 text-sm text-muted-foreground">Loading map…</div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Inner map body, mounted ONLY once the real Maps key exists. useJsApiLoader
// requires IDENTICAL options at every call site — initializing it with the
// old `apiKey || "x"` placeholder poisoned the shared loader for every other
// map in the session (they all hang at "Loading map…").
function RescheduleProposalMapInner({ apiKey, geo, checked, onToggle }: {
  apiKey: string; geo: RescheduleMove[]; checked: Set<string>; onToggle: (id: string) => void;
}) {
  const { isLoaded } = useJsApiLoader({ id: "route-map-script", googleMapsApiKey: apiKey, libraries: GMAPS_LIBRARIES });
  const [map, setMap] = useState<google.maps.Map | null>(null);
  useEffect(() => {
    if (!map || !geo.length) return;
    const b = new google.maps.LatLngBounds();
    geo.forEach((m) => b.extend({ lat: (m as any).lat, lng: (m as any).lng }));
    map.fitBounds(b, 48);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, geo.length]);
  if (!isLoaded) return <div className="p-6 text-sm text-muted-foreground">Loading map…</div>;
  return (
    <GoogleMap
      mapContainerStyle={{ width: "100%", height: "100%" }}
      onLoad={setMap}
      options={{ streetViewControl: false, mapTypeControl: false, fullscreenControl: false, gestureHandling: "greedy" }}
    >
      {geo.map((m) => (
        <MarkerF
          key={m.appointment_id}
          position={{ lat: (m as any).lat, lng: (m as any).lng }}
          icon={dotIcon(dayColor(m.to_date), checked.has(m.appointment_id))}
          opacity={checked.has(m.appointment_id) ? 1 : 0.35}
          onClick={() => onToggle(m.appointment_id)}
          title={`${m.customer} — ${weekdayLabel(m.from_date)} → ${weekdayLabel(m.to_date)} (saves ~${m.gain_mi} mi)`}
        />
      ))}
    </GoogleMap>
  );
}

// ── Manual map-move ──────────────────────────────────────────────────────────
// Caleb: "circle the existing stops, filter to just the quarterlies, move them
// all to a different day — I click the stops myself instead of the bot
// proposing." Every booked stop in the window is a dot in its CURRENT day's
// color. Click dots (or circle-select a cluster), optionally filter by service
// frequency, pick a target day, and the moves queue through the same paced
// FieldRoutes appointment/update writer the bot uses.
type BookedStop = {
  appointment_id: string; customer: string; city: string; tech: string;
  date: string; start: string; end: string; duration: number;
  time_window?: string | null; lat: number | null; lng: number | null;
  service_type: string; frequency_days: number; frequency: string;
  locked: boolean; notified: boolean; movable: boolean; special?: string;
};
type BookedRoute = { tech: string; date: string; route_id: string; stops: number };
type BookedResult = {
  ok: boolean; start: string; end: string; count: number; movable: number;
  stops: BookedStop[]; routes: BookedRoute[];
};

const FREQ_ORDER = ["Quarterly", "Bi-monthly", "Monthly", "Semi-annual", "Annual", "One-time"];

function metersBetween(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000, toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(bLat - aLat), dLng = toRad(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function ManualMoveMap({ staff, data }: { staff: { fullName: string } | null; data: BookedResult }) {
  const [apiKey, setApiKey] = useState<string | null>(null);
  useEffect(() => {
    supabase.functions.invoke("get-maps-key").then(({ data: d }) => {
      const k = (d as { key?: string } | null)?.key || "";
      if (k) setApiKey(k);
    });
  }, []);
  if (!apiKey) return <Card><CardContent className="py-6 text-sm text-muted-foreground">Loading map…</CardContent></Card>;
  return <ManualMoveMapInner staff={staff} data={data} apiKey={apiKey} />;
}

function ManualMoveMapInner({ staff, data, apiKey }: {
  staff: { fullName: string } | null; data: BookedResult; apiKey: string;
}) {
  const { isLoaded } = useJsApiLoader({ id: "route-map-script", googleMapsApiKey: apiKey, libraries: GMAPS_LIBRARIES });
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [freqFilter, setFreqFilter] = useState<Set<string>>(new Set());
  const [targetDate, setTargetDate] = useState<string>("");
  const [drawMode, setDrawMode] = useState(false);
  const [queueing, setQueueing] = useState(false);
  // appointment_id -> the date it was queued to (recolors the dot, blocks re-moves)
  const [movedTo, setMovedTo] = useState<Map<string, string>>(new Map());

  // Defensive defaults: a stale backend must degrade to an empty map, never
  // crash the page.
  const allStops = Array.isArray(data.stops) ? data.stops : [];
  const allRoutes = Array.isArray(data.routes) ? data.routes : [];
  const geo = allStops.filter((s) => typeof s.lat === "number" && typeof s.lng === "number");
  const displayDate = (s: BookedStop) => movedTo.get(s.appointment_id) ?? s.date;
  const freqs = [...new Set(allStops.map((s) => s.frequency))]
    .sort((a, b) => FREQ_ORDER.indexOf(a) - FREQ_ORDER.indexOf(b));
  const passesFreq = (s: BookedStop) => freqFilter.size === 0 || freqFilter.has(s.frequency);
  const visible = geo.filter(passesFreq);
  const dates = [...new Set(allStops.map((s) => displayDate(s)))].sort();
  const routeDates = [...new Set(allRoutes.map((r) => r.date))].sort();
  const routeFor = (tech: string, date: string) =>
    allRoutes.find((r) => r.tech === tech && r.date === date);

  useEffect(() => {
    if (!map || !geo.length) return;
    const b = new google.maps.LatLngBounds();
    geo.forEach((s) => b.extend({ lat: s.lat as number, lng: s.lng as number }));
    map.fitBounds(b, 48);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, allStops.length]);

  const toggleStop = (s: BookedStop) => {
    if (movedTo.has(s.appointment_id))
      return toast.error(`${s.customer} is already queued to ${weekdayLabel(movedTo.get(s.appointment_id)!)}.`);
    if (!s.movable)
      return toast.error(`${s.customer} can't move — ${s.locked ? "locked in FieldRoutes" : "the customer was already notified"}.`);
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(s.appointment_id)) next.delete(s.appointment_id); else next.add(s.appointment_id);
      return next;
    });
  };

  const toggleDay = (date: string) => {
    const ids = visible
      .filter((s) => s.movable && !movedTo.has(s.appointment_id) && displayDate(s) === date)
      .map((s) => s.appointment_id);
    if (!ids.length) return;
    setSelected((cur) => {
      const next = new Set(cur);
      const allIn = ids.every((id) => next.has(id));
      ids.forEach((id) => (allIn ? next.delete(id) : next.add(id)));
      return next;
    });
  };

  const onCircle = (circle: google.maps.Circle) => {
    const c = circle.getCenter();
    const r = circle.getRadius();
    circle.setMap(null);
    setDrawMode(false);
    if (!c) return;
    const ids = visible
      .filter((s) => s.movable && !movedTo.has(s.appointment_id))
      .filter((s) => metersBetween(c.lat(), c.lng(), s.lat as number, s.lng as number) <= r)
      .map((s) => s.appointment_id);
    if (!ids.length) return toast.error("No movable stops inside that circle (check the frequency filter).");
    setSelected((cur) => new Set([...cur, ...ids]));
    toast.success(`Circled ${ids.length} stop${ids.length === 1 ? "" : "s"}`);
  };

  const moveSelected = async () => {
    if (!staff) return toast.error("Please sign in again.");
    if (!targetDate) return toast.error("Pick a target day first.");
    const chosen = geo.filter((s) => selected.has(s.appointment_id) && s.movable && !movedTo.has(s.appointment_id));
    const noRoute: BookedStop[] = [];
    const items = chosen.filter((s) => s.date !== targetDate).filter((s) => {
      if (routeFor(s.tech, targetDate)) return true;
      noRoute.push(s);
      return false;
    });
    if (noRoute.length) {
      toast.error(`${[...new Set(noRoute.map((s) => s.tech))].join(", ")} has no FieldRoutes route on `
        + `${weekdayLabel(targetDate)} — ${noRoute.length} stop${noRoute.length === 1 ? "" : "s"} skipped. Create the route in FR first.`);
    }
    if (!items.length) {
      if (!noRoute.length) toast.error(`Everything selected is already on ${weekdayLabel(targetDate)}.`);
      return;
    }
    setQueueing(true);
    try {
      const { data: resp, error } = await supabase.functions.invoke("fieldroutes-appointment-submit", {
        body: {
          staffName: staff.fullName,
          reschedules: items.map((s) => ({
            appointment_id: Number(s.appointment_id),
            customer_label: s.customer,
            date: targetDate, start: s.start, end: s.end,
            duration: s.duration || 30,
            route_id: Number(routeFor(s.tech, targetDate)!.route_id) || undefined,
            from_date: s.date,
          })),
        },
      });
      if (!error && resp?.ok && resp?.paced === true) {
        setMovedTo((cur) => {
          const next = new Map(cur);
          items.forEach((s) => next.set(s.appointment_id, targetDate));
          return next;
        });
        setSelected(new Set());
        supabase.functions.invoke("fieldroutes-queue-worker", { body: { kick: true } }).catch(() => {});
        toast.success(`Queued ${items.length} move${items.length === 1 ? "" : "s"} to ${weekdayLabel(targetDate)} — `
          + `the paced bot reschedules them in FieldRoutes (~${Math.max(1, Math.ceil(items.length / 2))} min).`);
      } else {
        toast.error(resp?.error === "no_valid_items"
          ? "Backend rejected the moves — see console."
          : "Could not queue — is the new backend deployed?");
      }
    } catch (e) {
      console.error(e);
      toast.error("Could not queue moves — see console.");
    } finally {
      setQueueing(false);
    }
  };

  const chip = (active: boolean) =>
    `inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium ${active ? "" : "opacity-40"}`;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">
          {data.count} booked stops · {data.movable} movable — click dots or circle a cluster, pick a day, move them
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Show:</span>
          <button type="button" className={chip(freqFilter.size === 0)} onClick={() => setFreqFilter(new Set())}>
            All · {geo.length}
          </button>
          {freqs.map((f) => (
            <button key={f} type="button" className={chip(freqFilter.size === 0 || freqFilter.has(f))}
                    onClick={() => setFreqFilter((cur) => {
                      const next = new Set(cur);
                      if (next.has(f)) next.delete(f); else next.add(f);
                      return next;
                    })}>
              {f} · {geo.filter((s) => s.frequency === f).length}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {dates.map((date) => {
            const n = visible.filter((s) => displayDate(s) === date).length;
            const sel = visible.filter((s) => displayDate(s) === date && selected.has(s.appointment_id)).length;
            return (
              <button key={date} type="button" onClick={() => toggleDay(date)}
                      className={chip(sel > 0)} style={{ borderColor: dayColor(date) }}
                      title={`Toggle all visible movable stops on ${weekdayLabel(date)}`}>
                <span className="inline-block w-3 h-3 rounded-full border border-white shadow-sm" style={{ background: dayColor(date) }} />
                {weekdayLabel(date)} · {sel}/{n}
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant={drawMode ? "default" : "outline"} onClick={() => setDrawMode((d) => !d)}>
            <MapPin className="w-4 h-4 mr-1.5" />
            {drawMode ? "Drag on the map to draw the circle…" : "Circle-select"}
          </Button>
          <Button size="sm" variant="outline" onClick={() => setSelected(new Set())} disabled={selected.size === 0}>
            <X className="w-4 h-4 mr-1.5" /> Clear
          </Button>
          <span className="text-xs text-muted-foreground">
            {selected.size} selected · faded dots are locked/notified (can't move)
          </span>
        </div>
        <div className="h-[60vh] rounded-md overflow-hidden border">
          {isLoaded ? (
            <GoogleMap
              mapContainerStyle={{ width: "100%", height: "100%" }}
              onLoad={setMap}
              options={{ streetViewControl: false, mapTypeControl: false, fullscreenControl: false, gestureHandling: "greedy" }}
            >
              {visible.map((s) => {
                const queuedTo = movedTo.get(s.appointment_id);
                const isSel = selected.has(s.appointment_id);
                return (
                  <MarkerF
                    key={s.appointment_id}
                    position={{ lat: s.lat as number, lng: s.lng as number }}
                    icon={dotIcon(dayColor(displayDate(s)), isSel)}
                    opacity={queuedTo ? 0.9 : !s.movable ? 0.25 : isSel ? 1 : 0.75}
                    onClick={() => toggleStop(s)}
                    title={`${s.customer} · ${s.frequency} · ${weekdayLabel(displayDate(s))} ${s.start}`
                      + `${queuedTo ? " (queued)" : !s.movable ? (s.locked ? " (locked)" : " (notified)") : ""}`}
                  />
                );
              })}
              {drawMode && (
                <DrawingManagerF
                  drawingMode={google.maps.drawing.OverlayType.CIRCLE}
                  options={{
                    drawingControl: false,
                    circleOptions: {
                      fillColor: "#4f46e5", fillOpacity: 0.1,
                      strokeColor: "#4f46e5", strokeWeight: 2,
                      clickable: false, editable: false, zIndex: 10,
                    },
                  }}
                  onCircleComplete={onCircle}
                />
              )}
            </GoogleMap>
          ) : (
            <div className="p-6 text-sm text-muted-foreground">Loading map…</div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-medium">Move to:</span>
          {routeDates.map((date) => (
            <button key={date} type="button" onClick={() => setTargetDate((cur) => (cur === date ? "" : date))}
                    className={chip(targetDate === date)} style={{ borderColor: dayColor(date) }}>
              <span className="inline-block w-3 h-3 rounded-full border border-white shadow-sm" style={{ background: dayColor(date) }} />
              {weekdayLabel(date)}
            </button>
          ))}
          <Button size="sm" onClick={moveSelected} disabled={queueing || selected.size === 0 || !targetDate}>
            <Send className="w-4 h-4 mr-1.5" />
            {queueing ? "Queueing…" : `Move ${selected.size} → ${targetDate ? weekdayLabel(targetDate) : "pick a day"}`}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function RescheduleBotMode({ staff }: { staff: { fullName: string } | null }) {
  const [start, setStart] = useState(() => isoFromDate(new Date(Date.now() + 86400000)));
  const [end, setEnd] = useState(() => isoFromDate(new Date(Date.now() + 13 * 86400000)));
  const [loading, setLoading] = useState(false);
  const [queueing, setQueueing] = useState(false);
  const [result, setResult] = useState<RescheduleResult | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [queued, setQueued] = useState<Set<string>>(new Set());
  const [mapOpen, setMapOpen] = useState(false);
  const [booked, setBooked] = useState<BookedResult | null>(null);
  const [loadingBooked, setLoadingBooked] = useState(false);

  const loadBooked = async () => {
    if (!staff) return toast.error("Please sign in again.");
    setLoadingBooked(true);
    setBooked(null);
    try {
      const { data, error } = await supabase.functions.invoke("scheduling-fill", {
        body: { staffName: staff.fullName, action: "list_booked", start_date: start, end_date: end },
      });
      if (error) throw error;
      // Shape check, not just ok-check: an out-of-date edge function routes
      // unknown actions to the Fill handler, which also returns ok:true but
      // has no stops[] — trusting it blank-screened the whole page once.
      if (!data?.ok || !data?.result?.ok || !Array.isArray(data?.result?.stops)) {
        toast.error(Array.isArray(data?.result?.stops) === false && data?.result?.ok
          ? "The backend is still deploying the map-move update — try again in a couple minutes."
          : data?.detail?.detail || data?.error || "Could not load booked stops — is the backend deployed?");
        return;
      }
      setBooked(data.result as BookedResult);
    } catch (e) {
      console.error(e);
      toast.error("Could not load booked stops — see console.");
    } finally {
      setLoadingBooked(false);
    }
  };

  const toggleDateGroup = (date: string) => {
    if (!result) return;
    const ids = result.moves.filter((m) => m.to_date === date).map((m) => m.appointment_id);
    setChecked((cur) => {
      const next = new Set(cur);
      const allIn = ids.every((id) => next.has(id));
      ids.forEach((id) => (allIn ? next.delete(id) : next.add(id)));
      return next;
    });
  };

  const run = async () => {
    if (!staff) return toast.error("Please sign in again.");
    setLoading(true);
    setResult(null);
    setQueued(new Set());
    try {
      const { data, error } = await supabase.functions.invoke("scheduling-fill", {
        body: { staffName: staff.fullName, action: "reschedule_bot", start_date: start, end_date: end },
      });
      if (error) throw error;
      if (!data?.ok || !data?.result?.ok) {
        toast.error(data?.detail?.detail || data?.error || "Reschedule Bot failed — is the backend deployed?");
        return;
      }
      // Defensive: a stale backend routes unknown actions to the Fill handler,
      // which returns ok:true but no moves[] — that used to crash the page.
      const raw = data.result as RescheduleResult;
      const res: RescheduleResult = { ...raw, moves: Array.isArray(raw?.moves) ? raw.moves : [] };
      setResult(res);
      setChecked(new Set(res.moves.map((m) => m.appointment_id)));
    } catch (e) {
      console.error(e);
      toast.error("Reschedule Bot failed — see console.");
    } finally {
      setLoading(false);
    }
  };

  const toggle = (id: string) =>
    setChecked((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  const queueMoves = async () => {
    if (!staff || !result) return;
    const moves = result.moves.filter((m) => checked.has(m.appointment_id) && !queued.has(m.appointment_id));
    if (!moves.length) return toast.error("Nothing selected.");
    setQueueing(true);
    try {
      const { data, error } = await supabase.functions.invoke("fieldroutes-appointment-submit", {
        body: {
          staffName: staff.fullName,
          reschedules: moves.map((m) => ({
            appointment_id: Number(m.appointment_id),
            customer_label: m.customer,
            date: m.to_date, start: m.start, end: m.end,
            duration: m.duration || 30,
            route_id: m.to_route_id ? Number(m.to_route_id) : undefined,
            from_date: m.from_date,
          })),
        },
      });
      if (!error && data?.ok && data?.paced === true) {
        setQueued((cur) => new Set([...cur, ...moves.map((m) => m.appointment_id)]));
        supabase.functions.invoke("fieldroutes-queue-worker", { body: { kick: true } }).catch(() => {});
        toast.success(`Queued ${moves.length} reschedule${moves.length === 1 ? "" : "s"} — `
          + `the bot moves them in FieldRoutes (~${Math.max(1, Math.ceil(moves.length / 40))} min)`);
      } else {
        toast.error(data?.error === "no_valid_items"
          ? "Backend rejected the moves — see console."
          : "Could not queue — is the new backend deployed?");
      }
    } catch (e) {
      console.error(e);
      toast.error("Could not queue reschedules — see console.");
    } finally {
      setQueueing(false);
    }
  };

  const byTech = new Map<string, RescheduleMove[]>();
  for (const m of result?.moves ?? []) {
    if (!byTech.has(m.tech)) byTech.set(m.tech, []);
    byTech.get(m.tech)!.push(m);
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="w-5 h-5" /> Reschedule Bot
          </CardTitle>
          <CardDescription>
            <strong>Load the map</strong> to see every booked stop in the window — click dots or
            circle-select a cluster (filter to just the quarterlies if you want), pick a target day,
            and move them yourself. Or let the bot <strong>propose</strong> better days. Either way,
            only appointments that are <strong>not locked</strong> and whose
            <strong> notification hasn't been sent</strong> can move, and queued moves are
            rescheduled in FieldRoutes by the paced bot.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Window start</Label>
              <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Window end</Label>
              <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
            <div className="flex items-end gap-2 flex-wrap">
              <Button onClick={loadBooked} disabled={loadingBooked}>
                <MapPin className="w-4 h-4 mr-2" />
                {loadingBooked ? "Loading…" : "Load map — move stops myself"}
              </Button>
              <Button variant="outline" onClick={run} disabled={loading}>
                <Bot className="w-4 h-4 mr-2" />
                {loading ? "Analyzing…" : "Find better days (bot)"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {booked && <ManualMoveMap staff={staff} data={booked} />}

      {result && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <StatCard label="Booked appts" value={result.appointments} />
            <StatCard label="Movable" value={result.movable} />
            <StatCard label="Locked (stay)" value={result.locked} small />
            <StatCard label="Notified (stay)" value={result.notified} small />
            <StatCard label="Miles saved if all moved" value={`${result.total_gain_mi} mi`} tone={result.moves.length ? "ok" : "neutral"} />
          </div>

          {result.moves.length === 0 ? (
            <Card>
              <CardContent className="py-6 text-center text-sm text-muted-foreground">
                No worthwhile moves found — the movable appointments already sit on their best days.
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="text-sm font-semibold">
                  {result.moves.length} proposed move{result.moves.length === 1 ? "" : "s"}
                  <button type="button" className="ml-3 text-xs underline text-muted-foreground"
                          onClick={() => setChecked(new Set(result.moves.map((m) => m.appointment_id)))}>
                    select all
                  </button>
                  <button type="button" className="ml-2 text-xs underline text-muted-foreground"
                          onClick={() => setChecked(new Set())}>
                    none
                  </button>
                </span>
                <span className="flex items-center gap-2">
                  <Button variant="outline" onClick={() => setMapOpen(true)}>
                    <MapPin className="w-4 h-4 mr-2" /> Map view
                  </Button>
                  <Button onClick={queueMoves} disabled={queueing || checked.size === 0}>
                    <Send className="w-4 h-4 mr-2" />
                    {queueing ? "Queueing…" : `Queue ${[...checked].filter((id) => !queued.has(id)).length} reschedules`}
                  </Button>
                </span>
              </div>
              <RescheduleMapDialog
                open={mapOpen}
                onOpenChange={setMapOpen}
                moves={result.moves}
                checked={checked}
                onToggle={toggle}
                onToggleDate={toggleDateGroup}
              />
              {[...byTech.entries()].map(([tech, moves]) => (
                <Card key={tech}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">{tech} · {moves.length} move{moves.length === 1 ? "" : "s"}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-1.5">
                    {moves.map((m) => {
                      const isQueued = queued.has(m.appointment_id);
                      return (
                        <label key={m.appointment_id}
                               className={`flex items-start gap-2 rounded-md border p-2 text-xs cursor-pointer ${
                                 isQueued ? "bg-muted/60 text-muted-foreground" : "bg-background hover:bg-muted/30"}`}>
                          <Checkbox
                            checked={checked.has(m.appointment_id) || isQueued}
                            disabled={isQueued}
                            onCheckedChange={() => toggle(m.appointment_id)}
                            className="mt-0.5"
                          />
                          <span className="flex-1 min-w-0">
                            <span className="font-semibold text-sm">{m.customer}</span>
                            <span className="text-muted-foreground"> · {m.city}</span>
                            {isQueued && <Badge variant="outline" className="ml-2 text-[10px] h-4 text-muted-foreground">queued</Badge>}
                            <br />
                            {weekdayLabel(m.from_date)} → <span className="font-semibold">{weekdayLabel(m.to_date)}</span>
                            {" · "}<span className="font-bold text-emerald-700">saves ~{m.gain_mi} mi</span>
                            {" "}({m.from_dist_mi} → {m.to_dist_mi} mi from the day's route)
                            {" · "}loads {m.from_load}→{m.to_load}
                            {m.special_scheduling && (
                              <><br /><span className="text-amber-700">note: {m.special_scheduling}</span></>
                            )}
                          </span>
                        </label>
                      );
                    })}
                  </CardContent>
                </Card>
              ))}
            </>
          )}
        </>
      )}
    </>
  );
}

// A 0-stop day the tech COULD work (their FieldRoutes route exists for the
// date): a dashed drop target so the office can drag stops onto it and seed
// a fresh day — the plan's day materializes on first drop.
function EmptyFillDayCard({ date, tech, onDropStop }: {
  date: string;
  tech: string;
  onDropStop: (fromKey: string, stopId: string, date: string, tech: string) => void;
}) {
  const [over, setOver] = useState(false);
  return (
    <Card
      className={`border-2 border-dashed transition-colors ${over ? "border-primary bg-primary/5" : "border-muted-foreground/25 bg-muted/20"}`}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        try {
          const p = JSON.parse(e.dataTransfer.getData("text/plain"));
          if (p?.from && p?.id) onDropStop(p.from, p.id, date, tech);
        } catch { /* not a stop drag */ }
      }}
    >
      <CardContent className="py-6 text-center text-sm text-muted-foreground">
        <div className="font-medium text-foreground/70">{weekdayLabel(date)} · 0 stops</div>
        <div className="text-xs mt-1">drag a stop here to start this day</div>
      </CardContent>
    </Card>
  );
}

// A proposed-schedule day card with ONE-CLICK FieldRoutes pushes (Caleb,
// 2026-07-29: "1 button to push instead of 2"): a per-stop "Push stop to FR"
// button and a whole-day "Push route to FR" button. Each push books straight
// through fieldroutes-appointment-submit with commit:true — the write-queue
// row is kept only as the audit trail; there is no approval step. X a stop to
// keep it out of the day push.
function FillDayCard({ day, staff, onMoveStop, externQueued, reassignTechs, onReassign }: {
  day: FillDay;
  staff: { fullName: string } | null;
  onMoveStop?: (fromKey: string, stopId: string, toKey: string) => void;
  /** Subscriptions queued by a BULK push (tech week / all routes) — shown as
   *  queued here too so the card and the bulk buttons stay in sync. */
  externQueued?: Set<string>;
  /** Field techs this day can be reassigned to (whole-day move). */
  reassignTechs?: string[];
  onReassign?: (day: FillDay, targetTech: string) => void;
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
    !s.pushed_to_fr &&
    !excluded.has(stopKey(s)),
  );
  const remaining = bookable.filter((s) =>
    !queued.has(s.subscription_id) && !externQueued?.has(s.subscription_id));
  const allQueued = bookable.length > 0 && remaining.length === 0;

  const toggleExclude = (s: FillStop) => {
    setExcluded((cur) => {
      const next = new Set(cur);
      const k = stopKey(s);
      if (next.has(k)) next.delete(k); else next.add(k);
      return next;
    });
  };

  // Enqueue one booking as a PACED write (Caleb 2026-07-30: FieldRoutes
  // tolerates ~50 writes/min, so writes are queued and the
  // fieldroutes-queue-worker bot commits them at a safe pace (40/min) instead of
  // firing back-to-back). Enqueueing is instant; the bot does the writing.
  const pushOne = async (s: FillStop): Promise<boolean> => {
    try {
      const { data, error } = await supabase.functions.invoke("fieldroutes-appointment-submit", {
        body: {
          staffName: staff!.fullName,
          // BOTH flags on purpose: a backend that knows `paced` queues for the
          // paced bot; an older backend falls back to `commit` and pushes
          // instantly. Either way the write NEVER lands in the pending/approval
          // flow — no admin sign-in needed.
          commit: true,
          paced: true,
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
      // Only count it when the backend CONFIRMED a real outcome: pushed
      // (instant write landed) or paced (queued for the paced bot). A bare
      // ok:true from a stale backend once meant "filed as pending approval" —
      // that must never render as pushed again.
      return !error && data?.ok === true && (data?.pushed === true || data?.paced === true);
    } catch {
      return false;
    }
  };

  // Wake the drain bot so the first write goes out immediately (it also runs
  // on a 1-minute cron; pacing is enforced server-side either way).
  const kickWorker = () => {
    supabase.functions.invoke("fieldroutes-queue-worker", { body: { kick: true } }).catch(() => {});
  };

  const pushStop = async (s: FillStop) => {
    if (!staff) return toast.error("Please sign in again.");
    if (!s.route_id && !day.route_id) {
      return toast.error(`No FieldRoutes route exists for ${day.tech} on ${weekdayLabel(day.date)} — `
        + `create it in FieldRoutes first, or the appointment would book unassigned (invisible on schedules).`);
    }
    setStopPushing(stopKey(s));
    const ok = await pushOne(s);
    setStopPushing(null);
    if (ok) {
      setQueued((cur) => new Set(cur).add(s.subscription_id));
      kickWorker();
      toast.success(`Queued ${s.customer} — the bot writes it within seconds`);
    } else {
      toast.error(`Failed to queue ${s.customer} — see console.`);
    }
  };

  const pushDay = async () => {
    if (!staff) return toast.error("Please sign in again.");
    if (remaining.length === 0) return;
    if (!day.route_id && remaining.some((s) => !s.route_id)) {
      const n = remaining.filter((s) => !s.route_id).length;
      toast.error(`${n} stop${n === 1 ? "" : "s"} skipped — no FieldRoutes route for ${day.tech} on `
        + `${weekdayLabel(day.date)}. Create the route in FR first (a routeless appointment books unassigned).`);
    }
    setQueueing(true);
    const done = new Set(queued);
    let ok = 0, fail = 0;
    const pushable = remaining.filter((s) => s.route_id || day.route_id);
    for (const s of pushable) {
      if (await pushOne(s)) {
        ok++; done.add(s.subscription_id);
        setQueued(new Set(done));   // tick stops green as they queue
      } else fail++;
    }
    setQueueing(false);
    if (ok) {
      kickWorker();
      toast.success(`Queued ${ok} for FieldRoutes — paced ~40/min (~${Math.max(1, Math.ceil(ok / 40))} min)`
        + (fail ? ` · ${fail} failed to queue` : ""));
    } else toast.error("Failed to queue this day — see console.");
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
          <div className="flex items-center gap-2">
            {onReassign && reassignTechs && reassignTechs.filter((t) => t !== day.tech).length > 0 && (
              <select
                className="text-xs border rounded-md px-1.5 py-1 bg-background text-muted-foreground hover:text-foreground cursor-pointer"
                value=""
                title="Move this whole day's stops to another tech (books on THEIR FieldRoutes route)"
                onChange={(e) => {
                  const t = e.target.value;
                  e.target.value = "";
                  if (t) onReassign(day, t);
                }}
              >
                <option value="">Reassign day…</option>
                {reassignTechs.filter((t) => t !== day.tech).map((t) => (
                  <option key={t} value={t}>→ {t}</option>
                ))}
              </select>
            )}
            <div className="text-sm text-muted-foreground">
              <span className={over ? "font-bold text-red-600" : "font-semibold"}>{day.stop_count}</span>/{day.capacity} stops
            </div>
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
              · {day.summary.efficiency_pct}% efficient
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
          const isQueued = queued.has(s.subscription_id) || !!externQueued?.has(s.subscription_id)
            || !!s.pushed_to_fr;
          const key = stopKey(s);
          const isExcluded = excluded.has(key);
          // Color rules (per user request):
          //  - locked OR notification already sent → black (and locked-in)
          //  - already scheduled on this day        → green
          //  - pushed/queued to FieldRoutes         → GREY (it's an appointment
          //    now — persists across reloads via the write queue)
          //  - excluded by user                     → muted/struck
          //  - default                              → indigo (planner proposal)
          const isBlack = !!(s.locked || s.notification_sent);
          const isGreen = !isBlack && !!s.already_scheduled;
          const isPushed = !isBlack && !isGreen && isQueued;
          const rowClass =
            isBlack ? "bg-foreground/90 text-background"
            : isGreen ? "bg-emerald-100 text-emerald-900 border border-emerald-300"
            : isPushed ? "bg-muted/70 text-muted-foreground border border-muted-foreground/20"
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
                  {isPushed && <CheckCircle2 className="w-3.5 h-3.5 text-muted-foreground" />}
                  {isBlack && <Lock className="w-3.5 h-3.5" />}
                  {isGreen && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />}
                  <span className={isBlack ? "font-mono opacity-70" : "text-muted-foreground font-mono"}>#{s.order}</span> {s.customer}
                  {isPushed && (
                    <Badge variant="outline" className="text-muted-foreground border-muted-foreground/40 text-[10px] h-4">
                      pushed to FR
                    </Badge>
                  )}
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
              {day.summary ? ` · ${day.summary.efficiency_pct}% efficient` : ""}
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
