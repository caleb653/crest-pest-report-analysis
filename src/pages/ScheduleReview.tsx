// ScheduleReview — admin-only single-pane quick report.
// Defaults to 3 days starting today+2 (skips today and tomorrow). Surfaces
// the most actionable items in a big "Key Highlights" panel up top, then a
// per-tech-day grid below with inline indicators.

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  ArrowLeft, AlertTriangle, Clock, MapPin, ShuffleIcon, ClipboardList, CalendarCheck, Car,
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
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate("/")}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to home
          </Button>
        </div>

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
      </div>
    </div>
  );
};

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
  result, orderEntries, missWindowList, crossDayMoves,
}: {
  result: ReviewResult;
  orderEntries: [string, RouteOrder][];
  missWindowList: (MissWindowEntry & { key: string })[];
  crossDayMoves: CrossDayMove[];
}) {
  // Group everything by (date, route_id) key
  const orderByKey   = new Map(orderEntries);
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

        const hasIssues = comp.length + misses.length > 0;
        const hasOpps   = (order ? 1 : 0) + crossOut.length + crossIn.length > 0;

        const borderTone =
          comp.length > 0 ? "border-l-red-500"
          : misses.length > 0 ? "border-l-amber-500"
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

export default ScheduleReview;
