// ScheduleReview — admin-only single-pane quick report.
// Defaults to 3 days starting today+2 (skips today and tomorrow). Surfaces
// the most actionable items in a big "Key Highlights" panel up top, then a
// per-tech-day grid below with inline indicators.

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  ArrowLeft, AlertTriangle, Clock, MapPin, ShuffleIcon, ClipboardList, CalendarCheck, Car,
  Wand2, Phone, Users, CalendarPlus, CheckCircle2, X, Lock, BellRing,
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

// Authoritative field-tech roster (matches policy/tech-home-bases.yaml on the
// backend). Non-field-tech routes (Jake / Caleb / Carmen / David) are excluded
// from the review entirely — they're one-time appointments, not recurring
// schedule items.
const FIELD_TECHS = [
  "Darrell Tanner",
  "Dylan Gallegos",
  "Jackson Latham",
  "Mike Muniz",
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
type ReviewResult = {
  start: string; end: string;
  tech_filter: string | null;
  routes: { date: string; route_id: number; tech_name: string; stop_count: number; day_alert: string | null }[];
  compliance: ComplianceIssue[];
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
    return `Move ${bestMove.customer} (${bestMove.city}) to ${bestMove.suggested_date} ${bestMove.suggested_tech} — saves ${bestMove.improvement_mi.toFixed(1)} mi of detour.`;
  }
  if (order && order.savings_sec >= 5 * 60) {
    const top = order.moves?.[0];
    return `Reorder this route — saves ${fmtMinutes(order.savings_sec / 60)} of drive${top ? ` (e.g. move ${top.customer} from #${top.from_position} → #${top.to_position})` : ""}.`;
  }
  if (bestMove) {
    return `Consider moving ${bestMove.customer} (${bestMove.city}) to ${bestMove.suggested_date} ${bestMove.suggested_tech}.`;
  }
  return `No easy fix in this window — check if any stop can be rescheduled or paired with a nearby visit on another day.`;
}

function keyToRouteRef(result: ReviewResult, key: string) {
  const [d, ridStr] = key.split("|");
  const rid = parseInt(ridStr, 10);
  return result.routes.find((r) => r.date === d && r.route_id === rid);
}

const ScheduleReview = () => {
  const staff = useCurrentStaff();
  const navigate = useNavigate();
  useEffect(() => {
    const RESTRICTED = new Set(["Michael Muniz","Darrell Tanner","Dylan Gallegos","Jackson Latham"]);
    if (staff && RESTRICTED.has(staff.fullName)) navigate("/", { replace: true });
  }, [staff, navigate]);

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate("/")}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to home
          </Button>
        </div>

        <Tabs defaultValue="review">
          <TabsList className="grid w-full grid-cols-3 md:w-auto md:inline-grid h-auto p-1.5 bg-muted border-2 border-border shadow-sm">
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
          <TabsContent value="pending" className="mt-4 space-y-6">
            <PendingFieldRoutesWrites title="Pending FieldRoutes writes" />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────
// Review mode (the original quick-review report)
// ─────────────────────────────────────────────────────────────────────────

function ReviewMode({ staff }: { staff: { fullName: string } | null }) {
  const [days, setDays] = useState<number>(3);
  const [start, setStart] = useState<string>("");
  const [tech, setTech] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ReviewResult | null>(null);

  const run = async () => {
    if (!staff) {
      toast.error("Please sign in again.");
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("scheduling-review", {
        body: {
          staffName: staff.fullName,
          start_date: start || null,
          days,
          tech: tech.trim() || null,
        },
      });
      if (error) throw error;
      if (!data?.ok) {
        toast.error(data?.error || "Failed to run review.");
        return;
      }
      setResult(data.result as ReviewResult);
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
              Quick view of the next 2–4 days out. Today and tomorrow are
              skipped on purpose — those routes are too close to dispatch
              to act on cleanly.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label>Start date (blank = today + 2)</Label>
                <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Days</Label>
                <Input type="number" min={1} max={14} value={days}
                       onChange={(e) => setDays(parseInt(e.target.value, 10) || 3)} />
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
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Key Highlights</CardTitle>
        <CardDescription>
          The few items most worth acting on — cross-day moves and special-scheduling violations first.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {compliance.slice(0, 3).map((i, idx) => (
          <HighlightRow
            key={`c-${idx}`}
            icon={<AlertTriangle className="w-5 h-5 text-red-600" />}
            tone="danger"
            title={`${i.tech_name} (${i.date}) — ${i.kind.replace(/_/g, " ")}`}
            detail={
              <>
                {i.customer ? <strong>{i.customer}</strong> : null}
                {i.customer ? " — " : null}
                {i.detail}
              </>
            }
          />
        ))}
        {topCross.map((m, idx) => (
          <HighlightRow
            key={`x-${idx}`}
            icon={<ShuffleIcon className="w-5 h-5 text-indigo-600" />}
            tone="info"
            title={`Move ${m.customer} (${m.city}) to a better-fitting day`}
            detail={
              <>
                <strong>{m.current_date}</strong> {m.current_tech}'s route → <strong>{m.suggested_date}</strong> {m.suggested_tech}'s route
                {" · "}saves <strong>{m.improvement_mi.toFixed(1)} mi</strong> from {m.current_tech}'s day
              </>
            }
          />
        ))}
        {longDrives.slice(0, 3).map((ld, idx) => (
          <HighlightRow
            key={`ld-${idx}`}
            icon={<Car className="w-5 h-5 text-amber-600" />}
            tone="warn"
            title={`Long drive · ${ld.tech_name} (${ld.date}) — avg ${Math.round(ld.avg_leg_min)} min between stops`}
            detail={
              <>
                {ld.stops} stops · {fmtMinutes(ld.total_drive_min)} total drive.{" "}
                {suggestionForLongDrive(ld, routeOrderMap, crossSourceByKey)}
              </>
            }
          />
        ))}
        {topOrder.map(([key, s], idx) => {
          const [date] = key.split("|");
          return (
            <HighlightRow
              key={`ro-${idx}`}
              icon={<MapPin className="w-5 h-5 text-emerald-600" />}
              tone="ok"
              title={`Reorder ${date}'s route saves ${fmtMinutes(s.savings_sec / 60)}`}
              detail={
                s.moves && s.moves.length > 0 ? (
                  <span>
                    Top move: <strong>{s.moves[0].customer}</strong>{" "}
                    from #{s.moves[0].from_position} → #{s.moves[0].to_position}
                    {s.moves.length > 1 ? ` (+${s.moves.length - 1} other change${s.moves.length > 2 ? "s" : ""})` : ""}
                  </span>
                ) : (
                  <span>Multiple small shifts — see per-route detail below.</span>
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
  icon, tone, title, detail,
}: {
  icon: React.ReactNode;
  tone: "ok" | "warn" | "danger" | "info";
  title: string;
  detail: React.ReactNode;
}) {
  const toneBg = {
    ok:     "bg-emerald-50",
    warn:   "bg-amber-50",
    danger: "bg-red-50",
    info:   "bg-indigo-50",
  }[tone];
  return (
    <div className={`flex gap-3 items-start rounded-md p-3 ${toneBg}`}>
      <div className="mt-0.5">{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-sm">{title}</div>
        <div className="text-sm text-muted-foreground">{detail}</div>
      </div>
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
  const crossSourceByKey = new Map<string, CrossDayMove[]>();
  const crossTargetByKey = new Map<string, CrossDayMove[]>();
  crossDayMoves.forEach((m) => {
    const sk = `${m.current_date}|${m.current_tech}`;
    const tk = `${m.suggested_date}|${m.suggested_tech}`;
    const src = crossSourceByKey.get(sk) ?? []; src.push(m); crossSourceByKey.set(sk, src);
    const tgt = crossTargetByKey.get(tk) ?? []; tgt.push(m); crossTargetByKey.set(tk, tgt);
  });

  // Sort routes by date then tech
  const sortedRoutes = [...result.routes].sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return a.tech_name.localeCompare(b.tech_name);
  });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
      {sortedRoutes.map((r) => {
        const routeKey   = `${r.date}|${r.route_id}`;
        const techDayKey = `${r.date}|${r.tech_name}`;
        const snap = result.snapshot[routeKey];
        const order = orderByKey.get(routeKey);
        const misses = missByKey.get(routeKey) ?? [];
        const comp = compByKey.get(techDayKey) ?? [];
        const crossOut = crossSourceByKey.get(techDayKey) ?? [];
        const crossIn  = crossTargetByKey.get(techDayKey) ?? [];
        const longDrive = longDriveByKey.get(routeKey);

        const hasIssues = comp.length + misses.length + (longDrive ? 1 : 0) > 0;
        const hasOpps   = (order ? 1 : 0) + crossOut.length + crossIn.length > 0;

        const borderTone =
          comp.length > 0 ? "border-l-red-500"
          : (misses.length > 0 || longDrive) ? "border-l-amber-500"
          : hasOpps ? "border-l-indigo-500"
          : "border-l-emerald-500";

        return (
          <Card key={routeKey} className={`border-l-4 ${borderTone}`}>
            <CardHeader className="pb-2">
              <div className="flex items-baseline justify-between gap-2 flex-wrap">
                <CardTitle className="text-base">
                  {r.date} · {r.tech_name}
                </CardTitle>
                <div className="text-sm text-muted-foreground">
                  {r.stop_count} stops
                  {snap ? <> · {fmtMinutes(snap.total_drive_min)} drive · {snap.est_completion_h}h day</> : null}
                </div>
              </div>
              {r.day_alert ? (
                <Badge variant="destructive" className="w-fit">Alert: {r.day_alert}</Badge>
              ) : null}
            </CardHeader>
            <CardContent className="space-y-2 pt-0">
              {/* Compliance for this tech-day */}
              {comp.map((i, idx) => (
                <div key={`c-${idx}`} className="text-xs bg-red-50 rounded p-2">
                  <Badge variant="outline" className="mr-2 text-red-700 border-red-300">{i.kind}</Badge>
                  {i.customer ? <strong>{i.customer}: </strong> : null}{i.detail}
                </div>
              ))}
              {/* Miss-window for this route */}
              {misses.map((f, idx) => {
                const h = Math.floor(f.projected_arrival_min / 60);
                const m = f.projected_arrival_min % 60;
                return (
                  <div key={`m-${idx}`} className="text-xs bg-amber-50 rounded p-2">
                    <Badge variant="outline" className="mr-2 text-amber-700 border-amber-300">past window</Badge>
                    <strong>{f.customer}</strong> ({f.city}) — window <code>{f.window}</code>, projected{" "}
                    <code>{h.toString().padStart(2,"0")}:{m.toString().padStart(2,"0")}</code> ·{" "}
                    <span className="font-bold text-red-600">{f.late_by_min} min late</span>
                  </div>
                );
              })}
              {/* Long drive between stops */}
              {longDrive ? (
                <div className="text-xs bg-amber-50 rounded p-2">
                  <Badge variant="outline" className="mr-2 text-amber-700 border-amber-300">long drive</Badge>
                  Avg <strong>{Math.round(longDrive.avg_leg_min)} min</strong> between stops
                  {" · "}{suggestionForLongDrive(longDrive, orderByKey, crossSourceByKeyForGrid)}
                </div>
              ) : null}
              {/* Reorder */}
              {order ? (
                <Collapsible>
                  <CollapsibleTrigger className="w-full text-left text-xs bg-emerald-50 rounded p-2 hover:bg-emerald-100">
                    <Badge variant="outline" className="mr-2 text-emerald-700 border-emerald-300">reorder</Badge>
                    Save <strong>{fmtMinutes(order.savings_sec / 60)}</strong> of drive ({fmtMinutes(order.current_drive_sec / 60)} → {fmtMinutes(order.optimized_drive_sec / 60)})
                    <span className="text-muted-foreground"> · click for moves</span>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="px-2 pt-1 pb-2 text-xs space-y-1">
                    {(order.moves ?? []).map((mv, idx) => (
                      <div key={idx}>
                        Move <strong>{mv.customer}</strong>{mv.city ? <> ({mv.city})</> : null} from{" "}
                        <code>#{mv.from_position}</code> → <code>#{mv.to_position}</code>{" "}
                        <span className="text-muted-foreground">({mv.direction})</span>
                      </div>
                    ))}
                  </CollapsibleContent>
                </Collapsible>
              ) : null}
              {/* Cross-day OUT */}
              {crossOut.map((m, idx) => (
                <div key={`xo-${idx}`} className="text-xs bg-indigo-50 rounded p-2">
                  <Badge variant="outline" className="mr-2 text-indigo-700 border-indigo-300">move out</Badge>
                  <strong>{m.customer}</strong> → {m.suggested_date} {m.suggested_tech} ·{" "}
                  saves <strong>{m.improvement_mi.toFixed(1)} mi</strong>
                </div>
              ))}
              {/* Cross-day IN */}
              {crossIn.map((m, idx) => (
                <div key={`xi-${idx}`} className="text-xs bg-indigo-50 rounded p-2">
                  <Badge variant="outline" className="mr-2 text-indigo-700 border-indigo-300">move in</Badge>
                  Receive <strong>{m.customer}</strong> from {m.current_date} {m.current_tech}
                </div>
              ))}
              {!hasIssues && !hasOpps ? (
                <div className="text-xs text-muted-foreground italic">No issues, no opportunities — this route is clean.</div>
              ) : null}
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

const FILL_TECHS = ["Darrell Tanner", "Dylan Gallegos", "Jackson Latham", "Mike Muniz"];

type FillStop = {
  order: number;
  subscription_id: string;
  customer_id: string;
  service_type_id: string;
  customer: string;
  city: string;
  address: string;
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
};
type FillDay = {
  date: string;
  weekday: string;
  tech: string;
  zone: string;
  stop_count: number;
  capacity: number;
  stops: FillStop[];
};
type FillUnscheduled = {
  customer: string;
  city: string;
  service: string;
  due_date: string;
  tech: string | null;
  special_scheduling: string | null;
  reason: string;
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
};

// Default window: today → today + 30 days, in local time.
function isoToday(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function weekdayLabel(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, {
    weekday: "short", month: "short", day: "numeric",
  });
}

function FillMode({ staff }: { staff: { fullName: string } | null }) {
  const [start, setStart] = useState<string>(isoToday(0));
  const [end, setEnd] = useState<string>(isoToday(30));
  const [maxStops, setMaxStops] = useState<number>(14);
  const [techs, setTechs] = useState<string[]>(FILL_TECHS);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<FillResult | null>(null);

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
        body: { staffName: staff.fullName, start_date: start, end_date: end, techs, max_stops: maxStops },
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
            handling. Nothing is booked — review and queue through the normal
            approval flow.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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
            <StatCard label="Reassign" value={result.needs_reassignment_count} tone={result.needs_reassignment_count > 0 ? "warn" : "ok"} />
            <StatCard label="Unplaced" value={result.unplaced_count} tone={result.unplaced_count > 0 ? "info" : "ok"} />
          </div>

          {result.proposed.length === 0 && (
            <Card>
              <CardContent className="py-6 text-center text-sm text-muted-foreground">
                Nobody is due (within tolerance) between {result.start} and {result.end}.
              </CardContent>
            </Card>
          )}

          {result.proposed.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {result.proposed.map((d) => (
                <FillDayCard key={`${d.date}|${d.tech}`} day={d} staff={staff} />
              ))}
            </div>
          )}

          <UnscheduledBucket
            title="Needs manual scheduling"
            items={result.manual}
            blurb='Flagged "call to schedule / do not auto-schedule" — handle these by phone.'
          />
          <UnscheduledBucket
            title="Needs tech reassignment"
            items={result.needs_reassignment}
            blurb="Due in the window, but their preferred tech isn't a field tech — the office must reassign before scheduling."
          />
          <UnscheduledBucket
            title="Couldn't fit in the window"
            items={result.unplaced}
            blurb="Due within tolerance, but every eligible day was at capacity or constraints left no slot. Widen the window or raise max stops."
          />
        </>
      )}
    </>
  );
}

// A proposed-schedule day card with a single "queue this whole day for
// approval" action. Nothing books here — each stop is enqueued to the
// fieldroutes_write_queue and the office approves it later (same path as the
// Slot Finder's per-slot schedule button). The engine hands us a concrete
// start/end window per stop, so we queue those directly.
function FillDayCard({ day, staff }: { day: FillDay; staff: { fullName: string } | null }) {
  const [queueing, setQueueing] = useState(false);
  const [queued, setQueued] = useState<Set<string>>(new Set());
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

  const queueDay = async () => {
    if (!staff) return toast.error("Please sign in again.");
    if (remaining.length === 0) return;
    if (!window.confirm(
      `Queue ${remaining.length} appointment(s) on ${day.tech}'s ${day.date} route for office approval?\n\n` +
      `Nothing books in FieldRoutes until the office approves each one.`,
    )) return;

    setQueueing(true);
    const done = new Set(queued);
    let ok = 0, fail = 0;
    for (const s of remaining) {
      try {
        const { data, error } = await supabase.functions.invoke("fieldroutes-appointment-submit", {
          body: {
            staffName: staff.fullName,
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
        if (error || !data?.ok) { fail++; continue; }
        ok++; done.add(s.subscription_id);
      } catch { fail++; }
    }
    setQueued(done);
    setQueueing(false);
    if (ok) toast.success(`Queued ${ok} for approval${fail ? ` · ${fail} failed` : ""}`);
    else toast.error("Failed to queue this day — see console.");
  };

  return (
    <Card className="border-l-4 border-l-indigo-500">
      <CardHeader className="pb-2">
        <div className="flex items-baseline justify-between gap-2 flex-wrap">
          <CardTitle className="text-base">{weekdayLabel(day.date)} · {day.tech}</CardTitle>
          <div className="text-sm text-muted-foreground">
            <span className={over ? "font-bold text-red-600" : "font-semibold"}>{day.stop_count}</span>/{day.capacity} stops
          </div>
        </div>
        <Badge variant="outline" className="w-fit text-indigo-700 border-indigo-300">{day.zone}</Badge>
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
          return (
            <div key={key} className={`text-xs rounded p-2 ${rowClass}`}>
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
                    {s.window}
                  </Badge>
                  <span className={`font-mono ${isBlack ? "opacity-70" : "text-muted-foreground"}`}>
                    {s.days_off_target === 0 ? "on due date" : `${s.days_off_target > 0 ? "+" : ""}${s.days_off_target}d`}
                  </span>
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
                {s.city} · {s.service_label} · due {s.due_date}
              </div>
              <div className="mt-1 flex flex-wrap gap-1">
                {s.confirm && <Badge variant="outline" className="text-amber-700 border-amber-300">confirm first</Badge>}
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
          <Button size="sm" onClick={queueDay} disabled={queueing || allQueued || bookable.length === 0}>
            {allQueued ? <><CheckCircle2 className="w-3 h-3 mr-1" /> Day queued</>
              : <><CalendarPlus className="w-3 h-3 mr-1" /> {queueing ? "Queueing…" : `Queue this day (${remaining.length}) for approval`}</>}
          </Button>
        </div>
      </CardContent>
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

export default ScheduleReview;
