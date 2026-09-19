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

import { Fragment, useEffect, useMemo, useState } from "react";
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
import { lastServiceLabel } from "@/lib/lastService";
import PendingFieldRoutesWrites from "@/components/PendingFieldRoutesWrites";
import RouteMap, { type RouteMapStop } from "@/components/scheduling/RouteMap";
import { GMAPS_LIBRARIES } from "@/components/scheduling/WeekRouteMap";
import { GoogleMap, MarkerF, PolylineF, InfoWindowF, useJsApiLoader } from "@react-google-maps/api";
import { SERVICE_TYPES, findServiceType, type ServiceType } from "@/lib/serviceTypes";

// ── Shared types (mirror tools/slot_finder.py output) ───────────────────────

type Stop = {
  customer_name: string; city: string; start_time: string; end_time: string;
  lat?: number | null; lng?: number | null;
  /** Modeled clocks from the backend's assumed schedule (may be absent). */
  est_arrival_min?: number | null; est_depart_min?: number | null;
};

/** One booked stop of an existing route, in assumed drive order (from
    day_routes — free haversine simulation, no Google). */
type DayRouteStop = {
  order: number;
  appointment_id?: string | null;
  lat?: number | null; lng?: number | null;
  customer: string;
  address?: string | null; city?: string | null;
  window?: string; eta?: string | null;
  drive_from_prev_min?: number | null;
};

type DayRoute = {
  date: string; route_id: number; tech_name: string; locked: boolean;
  stop_count: number; stops: DayRouteStop[];
  /** 'google' when every modeled leg is a real Google road time. */
  drive_source?: string;
  off_day?: string | null;
};

/** One row of a slot's day plan: the tech's whole day with the NEW stop in
    place. Booked stops keep their map number; stops after the insert carry
    re-simulated ETAs (pushed_min / window_blown). */
type DayPlanRow = {
  order: number | null; is_new: boolean; customer: string; city?: string | null;
  window?: string | null; eta?: string | null; eta_min: number; depart_min: number;
  eta_before_min?: number | null; pushed_min: number; window_blown: boolean;
  drive_from_prev_min?: number | null; same_stop_as_prev?: boolean;
};

type WindowCounts = { "8-12"?: number; "10-2"?: number; "1-5"?: number };

type RouteSnapshot = {
  stops: number;
  stops_excluding_tasks: number;
  stops_by_window: WindowCounts;
  total_drive_min: number;
  job_drive_min?: number;
  home_base_min?: number;
  est_route_hours: number;
  first_start_min?: number | null;
  est_finish_min: number | null;
  has_home: boolean;
};

type AfterInsert = {
  stops: number;
  stops_excluding_tasks: number;
  stops_by_window: WindowCounts;
  est_route_hours: number;
  est_finish_min: number | null;
  /** Minutes the insert adds to the day (drive + on-site). */
  added_min?: number;
  new_stop_window: string | null;
  /** Later stops whose booked window the insert would break / max push. */
  windows_blown?: number;
  max_push_min?: number;
};

type SlotCandidate = {
  score_sec: number;
  extra_sec_haversine: number;
  extra_sec_gmaps?: number | null;
  extra_miles_haversine: number;
  est_min: number | null;
  route_date: string;
  route_id?: number;
  tech_name: string;
  insertion_kind?: string;
  detour_min?: number;
  detour_miles?: number;
  /** Assumed-schedule extras: "stop 3 → stop 4 of 9" + minutes the rest of
      the day gets pushed back by this insertion. */
  fits_between?: string | null;
  push_delay_min?: number | null;
  /** Google-refined legs (seconds) prev→NEW and NEW→next; absent on the
      free haversine pass. */
  drive_prev_to_new_sec?: number | null;
  drive_new_to_next_sec?: number | null;
  /** Structured position in the modeled day (matches the map numbers):
      mid-route = between prev_order and next_order; first stop = next_order 1;
      last stop = prev_order N. */
  prev_order?: number | null;
  next_order?: number | null;
  stops_total?: number | null;
  /** 'google' = detour/ETA/push built from real Google road times at this
      slot's clock; 'google_partial'; 'estimate' = calibrated model. */
  drive_source?: string;
  /** The Route Manager's day is already modeled to run past 7:30 PM — the
      slot is ranked last on purpose, not merely penalised. */
  day_unworkable?: boolean;
  day_plan?: DayPlanRow[];
  prev_stop: Stop;
  next_stop: Stop;
  route_snapshot?: RouteSnapshot;
  after_insert?: AfterInsert;
  justification?: string;
  // Mode B extras
  feasible?: "feasible" | "tight" | "not_feasible";
  reasons?: string[];
  off_by_min?: number | null;
  // Scheduling-note extras: the slot's ETA falls outside the clock band the
  // customer's note asks for (day itself is legal — office picks the window).
  note_time_conflict?: boolean;
  note_time_rule?: string;
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
  day_routes?: DayRoute[];
  /** Tech-days the engine refused because the Route Manager is off. */
  off_day_routes?: { date: string; tech_name: string; reason: string }[];
  drive_source?: string;
  maps_spend_usd?: number;
  error?: string;
  // Special-scheduling note on the customer at this address (backend filters
  // note-forbidden days out entirely; these fields exist so the office SEES why).
  scheduling_note?: string | null;
  note_rules?: string[];
  note_manual?: boolean;
  note_confirm?: boolean;
  note_blocked_dates?: { date: string; reason: string }[];
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
  scheduling_note?: string | null;
  note_rules?: string[];
  note_manual?: boolean;
  note_confirm?: boolean;
};

// ── Formatting helpers ──────────────────────────────────────────────────────

// Over-booked days model past midnight. Say so rather than silently wrapping
// a 1:01 AM finish into a reassuring-looking "1:01 PM".
function fmtTime(minSinceMidnight: number | null | undefined): string {
  if (minSinceMidnight === null || minSinceMidnight === undefined) return "?";
  const total = Math.floor(minSinceMidnight);
  const nextDay = total >= 24 * 60;
  const minOfDay = ((total % (24 * 60)) + 24 * 60) % (24 * 60);
  const h24 = Math.floor(minOfDay / 60);
  const m = minOfDay % 60;
  const h12 = h24 % 12 || 12;
  const ampm = h24 < 12 ? "AM" : "PM";
  return `${h12}:${m.toString().padStart(2, "0")} ${ampm}${nextDay ? " next day" : ""}`;
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

// Where the drive numbers on a card come from — the office must know when a
// slot is built on real Google road times vs the calibrated estimate.
function DriveSourceBadge({ source }: { source?: string | null }) {
  if (source === "google") {
    return (
      <span className="inline-flex items-center gap-1 rounded border border-emerald-300 bg-emerald-50 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-800" title="Detour, ETA and push-back use real Google road times at this slot's time of day">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />Google road times
      </span>
    );
  }
  if (source === "google_partial") {
    return (
      <span className="inline-flex items-center gap-1 rounded border border-emerald-300 bg-emerald-50 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-800" title="New legs are Google road times; the leg they replace is estimated">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />Google (partial)
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded border border-border bg-muted/40 px-1.5 py-0.5 text-[11px] font-semibold text-muted-foreground" title="Google was unavailable for this slot — drive numbers are the calibrated estimate">
      <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground" aria-hidden />Estimated drive
    </span>
  );
}

// The tech's whole day with the NEW stop dropped in. Booked stops keep their
// map numbers (#1..#N); every stop after the insert shows its re-simulated
// ETA, how far it got pushed, and whether its booked window breaks.
function DayPlanList({ plan, defaultOpen, techName }: { plan: DayPlanRow[]; defaultOpen: boolean; techName: string }) {
  const [open, setOpen] = useState(defaultOpen);
  const booked = plan.filter((r) => !r.is_new).length;
  const pushed = plan.filter((r) => !r.is_new && r.pushed_min > 0).length;
  const blown = plan.filter((r) => r.window_blown).length;
  return (
    <div className="mt-2 rounded-md border border-border bg-background">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-xs font-bold uppercase tracking-wide text-muted-foreground hover:bg-muted/40"
      >
        <span>{techName}'s day with this stop in it · {booked} booked + NEW</span>
        <span className="flex items-center gap-2 normal-case font-normal">
          {pushed > 0 && <span className="text-amber-700">{pushed} pushed</span>}
          {blown > 0 && <span className="font-semibold text-red-700">{blown} miss window</span>}
          <span className="font-semibold">{open ? "Hide" : "Show"}</span>
        </span>
      </button>
      {open && (
        <ol className="divide-y divide-border text-sm">
          {plan.map((r, i) => (
            <li
              key={`${r.is_new ? "new" : r.order}-${i}`}
              className={`grid grid-cols-[2.6rem_minmax(0,1fr)_auto] items-center gap-x-2 px-3 py-1 ${
                r.is_new ? "bg-red-600 font-semibold text-white"
                : r.window_blown ? "bg-red-50"
                : r.pushed_min > 0 ? "bg-amber-50/60" : ""}`}
            >
              <span className="font-mono text-xs">{r.is_new ? "NEW" : `#${r.order}`}</span>
              <span className="truncate">
                {r.customer}
                {r.city ? <span className={r.is_new ? "opacity-90" : "text-muted-foreground"}> ({r.city})</span> : null}
                {r.same_stop_as_prev && <span className="text-xs text-muted-foreground"> · 2nd service, same stop</span>}
                {r.window && !r.is_new && <span className="text-xs text-muted-foreground"> · {fmtRouteWindow(r.window)}</span>}
              </span>
              <span className="whitespace-nowrap text-right font-mono text-xs">
                {r.drive_from_prev_min != null && i > 0 && (
                  <span className={r.is_new ? "opacity-90" : "text-muted-foreground"}>{r.drive_from_prev_min} min → </span>
                )}
                {fmtTime(r.eta_min)}
                {r.pushed_min > 0 && <span className="text-amber-700"> (+{r.pushed_min})</span>}
                {r.window_blown && <span className="font-semibold text-red-700"> misses window</span>}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

// Per-window stop counts ("8-12: 3 · 10-2: 1 · 1-5: 6"); the window the new
// stop lands in is highlighted so the office sees the crowding at a glance.
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
            className={isHi ? "border-emerald-500 bg-emerald-100 text-emerald-900 font-semibold" : "text-muted-foreground"}
          >
            {w}: {n}
          </Badge>
        );
      })}
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

// ── Arrival-window width ─────────────────────────────────────────────────────
// The office can tighten the customer-facing arrival window from the default
// 4-hour FieldRoutes block down to 3 / 2 / 1 hours. Anything narrower than 4h
// is centered on the estimated arrival time (the algorithm's `est_min`) and
// slid to stay inside both the route's window and business hours. At 4h we
// return null so display + booking keep the exact behavior they have today.

const BUSINESS_LO = 7 * 60;   // 7:00 AM
const BUSINESS_HI = 17 * 60;  // 5:00 PM
const BUCKET_BOUNDS: Record<string, [number, number]> = {
  "8-12": [8 * 60, 12 * 60],
  "10-2": [10 * 60, 14 * 60],
  "1-5":  [13 * 60, 17 * 60],
};

function hhmmToMin(s?: string | null): number | null {
  if (!s) return null;
  const [h, m] = s.split(":");
  const hh = parseInt(h, 10);
  const mm = parseInt(m, 10);
  return Number.isNaN(hh) || Number.isNaN(mm) ? null : hh * 60 + mm;
}

function minToHHMMSS(m: number): string {
  const hh = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00`;
}

// The tightened booking window [lo, hi] in minutes for the chosen width, or null
// when no narrowing applies (width ≥ 4h, or we lack any time anchor).
function bookWindowMinutes(c: SlotCandidate, widthHours: number): { lo: number; hi: number } | null {
  if (!Number.isFinite(widthHours) || widthHours >= 4) return null;
  const W = Math.round(widthHours * 60);
  const recKey = (c.after_insert?.new_stop_window as string | null) ?? null;
  const bucket = recKey ? BUCKET_BOUNDS[recKey] : undefined;

  // Prefer the estimated arrival; fall back to the bucket / next-stop midpoint.
  let center = c.est_min ?? null;
  if (center == null && bucket) center = (bucket[0] + bucket[1]) / 2;
  if (center == null) {
    const s = hhmmToMin(c.next_stop?.start_time);
    const e = hhmmToMin(c.next_stop?.end_time);
    if (s == null || e == null) return null;
    center = (s + e) / 2;
  }

  let lo = Math.round(center - W / 2);
  let hi = lo + W;
  const slideInto = (bLo: number, bHi: number) => {
    if (bHi - bLo <= W) { lo = bLo; hi = bHi; return; }  // bounds narrower than width
    if (lo < bLo) { lo = bLo; hi = bLo + W; }
    if (hi > bHi) { hi = bHi; lo = bHi - W; }
  };
  if (bucket) slideInto(bucket[0], bucket[1]);  // keep the promise inside the route's window
  slideInto(BUSINESS_LO, BUSINESS_HI);
  return { lo, hi };
}

// Display label for the recommended booking window at the chosen width.
function bookWindowLabel(c: SlotCandidate, widthHours: number): string {
  const bw = bookWindowMinutes(c, widthHours);
  if (bw) return `${fmtTime(bw.lo)} – ${fmtTime(bw.hi)}`;
  const recKey = (c.after_insert?.new_stop_window as string | null) ?? null;
  return windowLabel(recKey) ?? fmtWindow(c.next_stop?.start_time, c.next_stop?.end_time);
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

// ── Follow-up plans ──────────────────────────────────────────────────────────
// "7 day follow up" / "14 day follow up": the office books Visit 1 in the next
// few days, then a second visit whose date must land inside a tolerance band
// counted from Visit 1 (7-day → 6–10 days later, 14-day → 12–16 days later).
type FollowUpPlan = "none" | "7" | "14";
const FOLLOW_UP_PLANS: Record<Exclude<FollowUpPlan, "none">, { lo: number; hi: number; label: string }> = {
  "7":  { lo: 6,  hi: 10, label: "7 day follow up" },
  "14": { lo: 12, hi: 16, label: "14 day follow up" },
};

function isoToDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map((x) => parseInt(x, 10));
  return new Date(y, m - 1, d, 12, 0, 0);
}
function dateToIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function daysBetweenIso(a: string, b: string): number {
  return Math.round((isoToDate(b).getTime() - isoToDate(a).getTime()) / 86_400_000);
}
// Business days (Mon–Fri) that fall lo..hi calendar days after `firstIso`.
function followUpDates(firstIso: string, plan: FollowUpPlan): string[] {
  if (plan === "none") return [];
  const { lo, hi } = FOLLOW_UP_PLANS[plan];
  const out: string[] = [];
  for (let n = lo; n <= hi; n++) {
    const d = isoToDate(firstIso);
    d.setDate(d.getDate() + n);
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) out.push(dateToIso(d));
  }
  return out;
}

// The date of the overall best-fit slot in a search result (same ranking the
// "★ Best Fit" banner uses), or null when nothing was found.
function bestFitSlot(result: FindResult | null): { date: string; weekday: string; c: SlotCandidate } | null {
  if (!result?.by_day) return null;
  let best: { date: string; weekday: string; c: SlotCandidate; s: number; m: number; mi: number } | null = null;
  for (const day of result.by_day) {
    for (const c of day.slots) {
      const s = c.score_sec ?? Infinity;
      const m = detourMinutes(c);
      const mi = parseFloat(detourMiles(c));
      if (!best || s < best.s || (s === best.s && (m < best.m || (m === best.m && mi < best.mi)))) {
        best = { date: day.date, weekday: day.weekday, c, s, m, mi };
      }
    }
  }
  return best ? { date: best.date, weekday: best.weekday, c: best.c } : null;
}
function bestFitDate(result: FindResult | null): string | null {
  return bestFitSlot(result)?.date ?? null;
}

// ── Route maps (free: data rides along with the search / sentinel fetch;
//    the map draws pins + straight lines only — no Directions calls) ─────────

// "08:00-12:00" → "8:00 AM – 12:00 PM"; "anytime" passes through.
function fmtRouteWindow(w?: string): string {
  if (!w || !w.includes("-")) return w ?? "";
  const [a, b] = w.split("-");
  return `${fmtHHMMSS(a)} – ${fmtHHMMSS(b)}`;
}

// "2026-08-10" → "Mon, Aug 10"
function isoDayLabel(iso: string): string {
  try {
    return new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, {
      weekday: "short", month: "short", day: "numeric",
    });
  } catch { return iso; }
}

function toMapStops(r: DayRoute): RouteMapStop[] {
  return r.stops.map((s) => ({
    order: s.order,
    lat: s.lat, lng: s.lng,
    customer: s.customer,
    address: s.address ?? undefined,
    city: s.city ?? undefined,
    eta: s.eta ? fmtHHMMSS(s.eta) : undefined,
    window: fmtRouteWindow(s.window),
    drive_from_prev_min: s.drive_from_prev_min ?? undefined,
    already_scheduled: true,
    locked: r.locked,
  }));
}

// Categorical per-tech palette (same CVD-validated hues as the week map's
// weekday palette). Assigned by sorted tech name so a tech keeps one color
// across all three days.
const TECH_PALETTE = ["#2a78d6", "#c44113", "#1baf7a", "#4a3aa7", "#eda100", "#e87ba4", "#52514e"];

// Compact numbered dot in the tech color — small enough that six routes can
// share one map, big enough to carry the stop order number.
function numberDot(color: string) {
  const size = 26;
  const c = size / 2;
  const svg = `<?xml version="1.0" encoding="UTF-8"?>` +
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">` +
    `<circle cx="${c}" cy="${c}" r="${c - 2}" fill="${color}" stroke="#ffffff" stroke-width="2"/>` +
    `</svg>`;
  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: typeof google !== "undefined" ? new google.maps.Size(size, size) : undefined,
    anchor: typeof google !== "undefined" ? new google.maps.Point(c, c) : undefined,
    labelOrigin: typeof google !== "undefined" ? new google.maps.Point(c, c) : undefined,
  } as google.maps.Icon;
}

// Bright red square marking WHERE the searched address is — the stop the
// Slot Finder is trying to place. Deliberately loud so it can't be confused
// with any tech's numbered dots.
function redSquare() {
  const size = 30;
  const svg = `<?xml version="1.0" encoding="UTF-8"?>` +
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">` +
    `<rect x="3" y="3" width="${size - 6}" height="${size - 6}" fill="#ff1a1a" stroke="#ffffff" stroke-width="3"/>` +
    `<rect x="1" y="1" width="${size - 2}" height="${size - 2}" fill="none" stroke="#b00000" stroke-width="1.5"/>` +
    `</svg>`;
  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: typeof google !== "undefined" ? new google.maps.Size(size, size) : undefined,
    anchor: typeof google !== "undefined" ? new google.maps.Point(size / 2, size / 2) : undefined,
  } as google.maps.Icon;
}

type LatLng = { lat: number; lng: number };

/** The route the Slot Finder recommends for the new stop on a given day, and
    where in that route the stop goes (after stop #afterOrder; null = end). */
type Recommendation = { date: string; route_id: number | null; tech_name: string; afterOrder: number | null };

// Build the map recommendation from a search's best-fit slot. Position comes
// from the backend's "stop 8 → stop 9 of 9" string; falls back to matching
// prev_stop's customer name inside the day's booked route.
function recommendationFor(result: FindResult | null): Recommendation | null {
  const best = bestFitSlot(result);
  if (!best) return null;
  const c = best.c;
  const m = (c.fits_between || "").match(/stop\s*(\d+)\s*[→\-\/]+\s*stop\s*(\d+)/i);
  let afterOrder: number | null = c.prev_order != null ? c.prev_order
    : c.insertion_kind === "first_stop" ? 0
    : m ? parseInt(m[1], 10) : null;
  const route = result?.day_routes?.find((r) =>
    r.date === best.date && (c.route_id != null ? r.route_id === c.route_id : r.tech_name === c.tech_name));
  if (afterOrder == null && route && c.prev_stop?.customer_name) {
    const hit = route.stops.find((st) => st.customer === c.prev_stop.customer_name);
    if (hit) afterOrder = hit.order;
  }
  return { date: best.date, route_id: route?.route_id ?? c.route_id ?? null, tech_name: c.tech_name, afterOrder };
}

const DAY_MAP_STYLE = { width: "100%", height: "60vh" } as const;

// One day, EVERY tech's route on the same map — one color per tech.
function DayRoutesMap({ routes, colorFor, target, recommended }: {
  routes: { route: DayRoute; stops: RouteMapStop[] }[];
  colorFor: (tech: string) => string;
  /** Searched address (after a search) — drawn as a bright red square. */
  target?: LatLng | null;
  /** Recommended route for this day — its line is routed THROUGH the target. */
  recommended?: Recommendation | null;
}) {
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [keyError, setKeyError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    supabase.functions.invoke("get-maps-key").then(({ data, error }) => {
      if (cancelled) return;
      if (error) { setKeyError(String(error.message || error)); return; }
      const k = (data as { key?: string } | null)?.key || "";
      if (!k) setKeyError("Maps key not configured.");
      else setApiKey(k);
    });
    return () => { cancelled = true; };
  }, []);
  if (keyError) return <div className="p-6 text-sm text-red-600">{keyError}</div>;
  if (!apiKey) return <div className="p-6 text-sm text-muted-foreground">Loading map…</div>;
  return <DayRoutesMapInner routes={routes} colorFor={colorFor} apiKey={apiKey} target={target} recommended={recommended} />;
}

function DayRoutesMapInner({ routes, colorFor, apiKey, target, recommended }: {
  routes: { route: DayRoute; stops: RouteMapStop[] }[];
  colorFor: (tech: string) => string;
  apiKey: string;
  target?: LatLng | null;
  recommended?: Recommendation | null;
}) {
  const { isLoaded, loadError } = useJsApiLoader({
    id: "route-map-script",
    googleMapsApiKey: apiKey,
    libraries: GMAPS_LIBRARIES,
  });
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const [active, setActive] = useState<{ tech: string; stop: RouteMapStop } | null>(null);

  // Fit to the union of ALL techs' stops. Refit only when the day's route set
  // changes identity (date switch), not on tech show/hide toggles.
  const fitKey = useMemo(
    () => routes.map((r) => `${r.route.date}|${r.route.route_id}`).sort().join(","),
    [routes],
  );
  const dateKey = routes[0]?.route.date ?? "";
  useEffect(() => {
    if (!map) return;
    const bounds = new google.maps.LatLngBounds();
    let n = 0;
    for (const r of routes) for (const s of r.stops) {
      if (typeof s.lat === "number" && typeof s.lng === "number") {
        bounds.extend({ lat: s.lat, lng: s.lng });
        n++;
      }
    }
    if (target) { bounds.extend(target); n++; }
    if (n === 0) return;
    map.fitBounds(bounds, 48);
    // Clamp: a sparse day (one stop) would otherwise zoom to house level.
    google.maps.event.addListenerOnce(map, "idle", () => {
      if ((map.getZoom() ?? 0) > 13) map.setZoom(13);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, dateKey, target?.lat, target?.lng]);

  if (loadError) return <div className="p-6 text-sm text-red-600">Failed to load Google Maps: {String(loadError)}</div>;
  if (!isLoaded) return <div className="p-6 text-sm text-muted-foreground">Loading map…</div>;

  return (
    <GoogleMap
      key={fitKey === "" ? "empty" : "map"}
      mapContainerStyle={DAY_MAP_STYLE}
      onLoad={setMap}
      options={{ streetViewControl: false, mapTypeControl: false, fullscreenControl: false, gestureHandling: "greedy" }}
    >
      {routes.map((r) => {
        const pts = r.stops
          .filter((s) => typeof s.lat === "number" && typeof s.lng === "number")
          .map((s) => ({ order: s.order, lat: s.lat as number, lng: s.lng as number }));
        const isRec = !!recommended && !!target && r.route.date === recommended.date
          && (recommended.route_id != null ? r.route.route_id === recommended.route_id : r.route.tech_name === recommended.tech_name);
        if (!isRec) {
          return (
            <PolylineF
              key={`line-${r.route.route_id}`}
              path={pts}
              options={{ strokeColor: colorFor(r.route.tech_name), strokeOpacity: 0.7, strokeWeight: 3, geodesic: false }}
            />
          );
        }
        // Recommended route: splice the new stop in after `afterOrder` (or at
        // the end), draw the full line thicker, and paint the two legs that
        // touch the new stop bright red so the detour is unmistakable.
        const pos = recommended!.afterOrder == null
          ? pts.length
          : pts.filter((p) => p.order <= (recommended!.afterOrder as number)).length;
        const t = { order: -1, lat: target!.lat, lng: target!.lng };
        const spliced = [...pts.slice(0, pos), t, ...pts.slice(pos)];
        const legs = [pts[pos - 1], t, pts[pos]].filter(Boolean);
        return (
          <Fragment key={`line-${r.route.route_id}`}>
            <PolylineF
              path={spliced}
              options={{ strokeColor: colorFor(r.route.tech_name), strokeOpacity: 0.9, strokeWeight: 5, geodesic: false, zIndex: 10 }}
            />
            <PolylineF
              path={legs}
              options={{ strokeColor: "#ff1a1a", strokeOpacity: 1, strokeWeight: 6, geodesic: false, zIndex: 11 }}
            />
          </Fragment>
        );
      })}
      {routes.map((r) =>
        r.stops
          .filter((s) => typeof s.lat === "number" && typeof s.lng === "number")
          .map((s) => (
            <MarkerF
              key={`${r.route.route_id}-${s.order}`}
              position={{ lat: s.lat as number, lng: s.lng as number }}
              icon={numberDot(colorFor(r.route.tech_name))}
              label={{ text: String(s.order), color: "#ffffff", fontWeight: "700", fontSize: "11px" }}
              onClick={() => setActive({ tech: r.route.tech_name, stop: s })}
              title={`${s.customer} — ${r.route.tech_name}`}
            />
          )),
      )}
      {target && (
        <MarkerF
          position={target}
          icon={redSquare()}
          zIndex={9999}
          title="New stop — the address you searched"
        />
      )}
      {active && (
        <InfoWindowF
          position={{ lat: active.stop.lat as number, lng: active.stop.lng as number }}
          onCloseClick={() => setActive(null)}
        >
          <div className="text-xs space-y-0.5 max-w-[240px]">
            <div className="font-semibold text-sm">#{active.stop.order} {active.stop.customer}</div>
            <div>
              <span className="inline-block w-2.5 h-2.5 rounded-full mr-1 align-middle" style={{ background: colorFor(active.tech) }} />
              {active.tech}
            </div>
            {(active.stop.address || active.stop.city) && (
              <div className="text-muted-foreground">{[active.stop.address, active.stop.city].filter(Boolean).join(", ")}</div>
            )}
            {(active.stop.eta || active.stop.window) && (
              <div>{active.stop.eta}{active.stop.eta && active.stop.window ? " · " : ""}{active.stop.window}</div>
            )}
            {typeof active.stop.drive_from_prev_min === "number" && active.stop.order > 1 && (
              <div className="text-muted-foreground">+{active.stop.drive_from_prev_min} min drive from previous</div>
            )}
          </div>
        </InfoWindowF>
      )}
    </GoogleMap>
  );
}

// Day pills → EVERY tech's route on one map (one color per tech; pills toggle
// techs on/off). Shows the next 3 working days by default, plus an "Any day"
// date picker that pulls any other day's routes on demand (same free
// sentinel fetch — BigQuery only).
function RoutesOverviewCard({ dayRoutes, dates, loading, lookupLoading, onLookupDay, target, preferredDate, recommendations }: {
  dayRoutes: DayRoute[];
  /** Searched address after a search — shown as a bright red square on the map. */
  target?: LatLng | null;
  /** Day the map should jump to after a search (the recommended Visit 1 day). */
  preferredDate?: string | null;
  /** Recommended route per day (Visit 1 and, in a follow-up plan, Visit 2). */
  recommendations?: Recommendation[];
  /** Ordered dates to offer as pills (defaults + any looked-up days). */
  dates: string[];
  loading: boolean;
  lookupLoading: boolean;
  /** Fetch routes for a day not already loaded (from the Any-day picker). */
  onLookupDay: (iso: string) => void;
}) {
  // Stable tech → color across all days.
  const colorFor = useMemo(() => {
    const techs = [...new Set(dayRoutes.map((r) => r.tech_name))].sort();
    const m = new Map(techs.map((t, i) => [t, TECH_PALETTE[i % TECH_PALETTE.length]]));
    return (t: string) => m.get(t) ?? TECH_PALETTE[TECH_PALETTE.length - 1];
  }, [dayRoutes]);
  const [pickedDate, setPickedDate] = useState<string | null>(null);
  // Jump to the recommended day whenever a search produces one.
  useEffect(() => {
    if (preferredDate) setPickedDate(preferredDate);
  }, [preferredDate]);
  const date = pickedDate && dates.includes(pickedDate) ? pickedDate : dates[0];
  const routesForDate = dayRoutes.filter((r) => r.date === date);
  const recForDate = recommendations?.find((r) => r.date === date) ?? null;
  const isRecRoute = (r: DayRoute) => !!recForDate
    && (recForDate.route_id != null ? r.route_id === recForDate.route_id : r.tech_name === recForDate.tech_name);
  const [hiddenTechs, setHiddenTechs] = useState<Set<string>>(new Set());
  const toggleTech = (t: string) =>
    setHiddenTechs((cur) => {
      const next = new Set(cur);
      if (next.has(t)) next.delete(t); else next.add(t);
      return next;
    });
  const visible = routesForDate
    .filter((r) => !hiddenTechs.has(r.tech_name))
    .map((r) => ({ route: r, stops: toMapStops(r) }));

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <MapPin className="w-4 h-4" /> Upcoming routes
        </CardTitle>
        <CardDescription>
          Every tech's booked route for the day, one color per tech (tap a name to
          hide/show). After a search, use the Map button on a slot to see exactly
          where the new stop lands.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading && <p className="text-sm text-muted-foreground">Loading routes…</p>}
        {!loading && dates.length > 0 && (
          <>
            <div className="flex flex-wrap items-center gap-2">
              {dates.map((d) => (
                <Button key={d} type="button" size="sm"
                  variant={d === date ? "default" : "outline"}
                  className={recommendations?.some((r) => r.date === d) ? "ring-2 ring-emerald-500 ring-offset-1" : ""}
                  onClick={() => setPickedDate(d)}>
                  {recommendations?.some((r) => r.date === d) ? "★ " : ""}{isoDayLabel(d)}
                </Button>
              ))}
              {/* Any-day lookup: picking a date fetches that day's routes and
                  adds it as a pill. Value stays empty so it reads as a button. */}
              <label className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-md border border-input bg-background px-3 text-sm font-medium hover:bg-muted"
                     title="Look up any other day's routes">
                <CalendarClock className="w-3.5 h-3.5" />
                Any day
                <input
                  type="date"
                  className="w-[7.5rem] bg-transparent outline-none text-sm"
                  value=""
                  onChange={(e) => {
                    const iso = e.target.value;
                    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return;
                    onLookupDay(iso);
                    setPickedDate(iso);
                  }}
                />
              </label>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {routesForDate.map((r) => {
                const off = hiddenTechs.has(r.tech_name);
                return (
                  <button
                    key={r.route_id}
                    type="button"
                    onClick={() => toggleTech(r.tech_name)}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium transition-all ${off ? "opacity-35" : ""}`}
                    style={{ borderColor: colorFor(r.tech_name) }}
                    title={off ? "Show this tech" : "Hide this tech"}
                  >
                    <span className="inline-block w-3 h-3 rounded-full border border-white shadow-sm" style={{ background: colorFor(r.tech_name) }} />
                    {r.tech_name} · {r.stop_count}{r.locked ? " · locked" : ""}
                    {isRecRoute(r) && <span className="ml-1 rounded bg-emerald-600 px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">★ recommended</span>}
                  </button>
                );
              })}
              {routesForDate.length === 0 && (
                <p className="text-sm italic text-muted-foreground">
                  {lookupLoading ? "Loading routes…" : "No routes this day."}
                </p>
              )}
            </div>
            {target && (
              <p className="text-xs font-semibold flex flex-wrap items-center gap-1.5">
                <span className="inline-block w-3.5 h-3.5 bg-[#ff1a1a] border-2 border-white shadow ring-1 ring-red-800" />
                Red square = the address you searched (new stop)
                {recForDate && (
                  <span className="text-muted-foreground font-normal">
                    · red legs = {recForDate.tech_name}'s route going to it
                    {recForDate.afterOrder != null ? ` after stop ${recForDate.afterOrder}` : ""}
                  </span>
                )}
              </p>
            )}
            {visible.length > 0
              ? <DayRoutesMap routes={visible} colorFor={colorFor} target={target} recommended={recForDate} />
              : routesForDate.length > 0 && (
                <p className="text-sm italic text-muted-foreground">All techs hidden — tap a name above to show a route.</p>
              )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

const SlotFinder = () => {
  const staff = useCurrentStaff();
  const navigate = useNavigate();
  useEffect(() => {
    const RESTRICTED = new Set(["Michael Muniz","Darrell Tanner","Dylan Gallegos","Jackson Latham","Nick Stovall","Brock Lyttle","Joseph Ibarbo"]);
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
              className="gap-1.5 md:gap-2 text-sm md:text-base font-semibold px-3 md:px-5 py-2.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md"
            >
              <MapPin className="w-4 h-4 shrink-0" /> Find open slots
            </TabsTrigger>
            <TabsTrigger
              value="check"
              className="gap-1.5 md:gap-2 text-sm md:text-base font-semibold px-3 md:px-5 py-2.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md"
            >
              <CalendarClock className="w-4 h-4 shrink-0" /> Check a day &amp; window
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
      <DropdownMenuContent className="w-[min(18rem,calc(100vw-2rem))] max-h-80 overflow-y-auto">
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

// ── Openings calendar ────────────────────────────────────────────────────────
// A calendar view across the days being searched: one column per day, each
// day's best openings drawn as colored blocks at the time we'd book them.
// Bright green = on route, yellow/orange/red = a real detour — so the office
// can see at a glance that Monday has a great spot at 9 AM while Tuesday only
// has one orange one at 3 PM. Columns follow the days selected in the search
// (next 3 working days by default).

const CAL_HOUR_PX = 46;     // pixels per hour of the grid
const CAL_DAY_MIN_PX = 132; // min column width before the strip scrolls

/** Where a slot sits on the calendar: the window we'd actually promise the
    customer (tightened when the office narrowed the width, else the route's
    own block), falling back to an hour either side of the estimated arrival. */
function slotBlockRange(c: SlotCandidate, widthHours: number): { lo: number; hi: number } {
  const bw = bookWindowMinutes(c, widthHours);
  if (bw) return bw;
  const key = (c.after_insert?.new_stop_window as string | null) ?? null;
  const bucket = key ? BUCKET_BOUNDS[key] : undefined;
  if (bucket) return { lo: bucket[0], hi: bucket[1] };
  const s = hhmmToMin(c.next_stop?.start_time);
  const e = hhmmToMin(c.next_stop?.end_time);
  if (s != null && e != null && e > s) return { lo: s, hi: e };
  const est = c.est_min ?? 12 * 60;
  return { lo: est - 60, hi: est + 60 };
}

// Same five-step scale as DetourBadge / tierBorder, as a solid block fill.
function tierBlockClasses(c: SlotCandidate): string {
  switch (driveTier(c)) {
    case "very_long": return "bg-red-600 text-white border-red-700";
    case "long":      return "bg-orange-500 text-white border-orange-600";
    case "edge":      return "bg-yellow-400 text-black border-yellow-500";
    case "near":      return "bg-green-500 text-white border-green-600";
    case "on_route":  return "bg-emerald-500 text-white border-emerald-600";
  }
}
function tierWord(c: SlotCandidate): string {
  switch (driveTier(c)) {
    case "very_long": return "Very long drive";
    case "long":      return "Long drive";
    case "edge":      return "Bit out of the way";
    case "near":      return "Near the route";
    case "on_route":  return "On route";
  }
}
// Rank used to pick the best slot of a day (lower = better).
const TIER_RANK: Record<DriveTier, number> = {
  on_route: 0, near: 1, edge: 2, long: 3, very_long: 4,
};

type CalBlock = { c: SlotCandidate; idx: number; lo: number; hi: number; lane: number; lanes: number };

// Greedy lane packing so two openings at the same hour sit side by side.
function layoutBlocks(slots: SlotCandidate[], widthHours: number): CalBlock[] {
  const raw = slots
    .map((c, idx) => ({ c, idx, ...slotBlockRange(c, widthHours) }))
    .sort((a, b) => a.lo - b.lo || a.hi - b.hi);
  const laneEnds: number[] = [];
  const placed = raw.map((b) => {
    let lane = laneEnds.findIndex((end) => end <= b.lo);
    if (lane === -1) { lane = laneEnds.length; laneEnds.push(b.hi); }
    else laneEnds[lane] = b.hi;
    return { ...b, lane, lanes: 1 };
  });
  const lanes = Math.max(1, laneEnds.length);
  return placed.map((b) => ({ ...b, lanes }));
}

function OpeningsCalendar({
  title, subtitle, dates, byDay, dayRoutes, windowWidth, loading, searched,
}: {
  title: string;
  subtitle?: string;
  /** Column set — the days the office asked about, in order. */
  dates: string[];
  /** Openings per day from the search (empty before a search has run). */
  byDay: DayGroup[];
  /** Booked routes for those days (free sentinel fetch) — used for the
      "N stops booked" line and to say when a day has no route at all. */
  dayRoutes: DayRoute[];
  windowWidth: number;
  loading?: boolean;
  /** A search has run — days with no blocks genuinely have no opening. */
  searched: boolean;
}) {
  const cols = useMemo(() => {
    const groups = new Map(byDay.map((d) => [d.date, d]));
    return dates.map((iso) => {
      const g = groups.get(iso);
      const slots = g?.slots ?? [];
      const blocks = layoutBlocks(slots, windowWidth);
      const routes = dayRoutes.filter((r) => r.date === iso);
      const best = slots.reduce<SlotCandidate | null>(
        (acc, c) => (!acc || TIER_RANK[driveTier(c)] < TIER_RANK[driveTier(acc)] ? c : acc), null);
      return {
        iso,
        weekday: g?.weekday ?? new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { weekday: "short" }),
        blocks,
        best,
        routeCount: routes.length,
        stopCount: routes.reduce((n, r) => n + (r.stop_count ?? 0), 0),
      };
    });
  }, [dates, byDay, dayRoutes, windowWidth]);

  // Grid bounds follow the blocks, clamped to a sane working day.
  const { startMin, endMin } = useMemo(() => {
    let lo = 8 * 60, hi = 17 * 60;
    for (const col of cols) for (const b of col.blocks) { lo = Math.min(lo, b.lo); hi = Math.max(hi, b.hi); }
    return {
      startMin: Math.max(6 * 60, Math.floor(lo / 60) * 60),
      endMin: Math.min(20 * 60, Math.ceil(hi / 60) * 60),
    };
  }, [cols]);
  const hours: number[] = [];
  for (let h = startMin; h <= endMin - 60; h += 60) hours.push(h);
  const gridPx = ((endMin - startMin) / 60) * CAL_HOUR_PX;

  const jumpToSlot = (iso: string, idx: number) => {
    const el = document.getElementById(`slot-${iso}-${idx}`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.add("ring-4", "ring-primary");
    globalThis.setTimeout(() => el.classList.remove("ring-4", "ring-primary"), 1800);
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <CalendarClock className="w-4 h-4" /> {title}
        </CardTitle>
        <CardDescription>
          {subtitle ?? "One column per day you're searching. Each block is an opening, at the time we'd book it — bright green is on route, orange and red mean a real detour."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {/* Legend */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-medium text-muted-foreground">
          {([
            ["bg-emerald-500", "On route (<5 min)"],
            ["bg-green-500", "Near (5–10)"],
            ["bg-yellow-400", "10–15"],
            ["bg-orange-500", "15–20"],
            ["bg-red-600", "20+ min out of the way"],
          ] as const).map(([bg, label]) => (
            <span key={label} className="inline-flex items-center gap-1">
              <span className={`inline-block h-2.5 w-2.5 rounded-sm ${bg}`} aria-hidden />{label}
            </span>
          ))}
        </div>

        <div className="overflow-x-auto">
          <div className="flex min-w-full gap-px">
            {/* Hour gutter */}
            <div className="shrink-0 pt-[3.4rem] pr-1 text-right" style={{ width: "3.6rem" }}>
              {hours.map((h) => (
                <div key={h} className="text-[10px] font-medium text-muted-foreground" style={{ height: CAL_HOUR_PX }}>
                  {fmtTime(h).replace(":00", "")}
                </div>
              ))}
            </div>

            {cols.map((col) => (
              <div key={col.iso} className="flex-1 min-w-0" style={{ minWidth: CAL_DAY_MIN_PX }}>
                {/* Day header */}
                <div className={`flex h-[3.4rem] flex-col justify-center rounded-t-md border border-b-0 px-2 py-1 text-center ${
                  col.best ? "border-border bg-muted/50" : "border-border bg-muted/20"}`}>
                  <div className="text-xs font-bold leading-tight">{col.weekday}</div>
                  <div className="text-[11px] text-muted-foreground leading-tight">
                    {new Date(`${col.iso}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                  </div>
                  <div className="mt-0.5 text-[10px] leading-tight">
                    {col.best ? (
                      <span className={`inline-block rounded px-1 py-px font-bold ${tierBlockClasses(col.best)}`}>
                        {tierWord(col.best)}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">
                        {searched
                          ? (col.routeCount === 0 ? "No routes" : "No opening")
                          : (col.routeCount > 0 ? `${col.stopCount} booked` : "—")}
                      </span>
                    )}
                  </div>
                </div>

                {/* Hour grid + blocks */}
                <div className="relative rounded-b-md border border-border bg-background" style={{ height: gridPx }}>
                  {hours.map((h, i) => (
                    <div key={h} className={`absolute inset-x-0 border-t ${i === 0 ? "border-transparent" : "border-border/60"}`}
                         style={{ top: i * CAL_HOUR_PX }} />
                  ))}
                  {!searched && (
                    <div className="absolute inset-0 flex items-center justify-center px-1 text-center text-[10px] italic text-muted-foreground">
                      {loading ? "Searching…" : "Run a search to fill this in"}
                    </div>
                  )}
                  {searched && col.blocks.length === 0 && (
                    <div className="absolute inset-0 flex items-center justify-center px-1 text-center text-[10px] italic text-muted-foreground">
                      {col.routeCount === 0 ? "No Route Manager working" : "Nothing workable"}
                    </div>
                  )}
                  {col.blocks.map((b) => {
                    const top = ((Math.max(b.lo, startMin) - startMin) / 60) * CAL_HOUR_PX;
                    const height = Math.max(34, ((Math.min(b.hi, endMin) - Math.max(b.lo, startMin)) / 60) * CAL_HOUR_PX);
                    const widthPct = 100 / b.lanes;
                    return (
                      <button
                        key={b.idx}
                        type="button"
                        onClick={() => jumpToSlot(col.iso, b.idx)}
                        title={`${b.c.tech_name} · ${fmtTime(b.lo)} – ${fmtTime(b.hi)} · +${detourMinutes(b.c)} min / +${detourMiles(b.c)} mi — ${tierWord(b.c)}`}
                        className={`absolute overflow-hidden rounded border px-1 py-0.5 text-left leading-tight shadow-sm transition-transform hover:z-10 hover:scale-[1.02] ${tierBlockClasses(b.c)}`}
                        style={{
                          top, height,
                          left: `calc(${b.lane * widthPct}% + 2px)`,
                          width: `calc(${widthPct}% - 4px)`,
                        }}
                      >
                        <div className="truncate text-[10px] font-bold">
                          {fmtTime(b.lo).replace(":00", "")} – {fmtTime(b.hi).replace(":00", "")}
                        </div>
                        <div className="truncate text-[10px] font-semibold opacity-95">
                          {b.c.tech_name.split(" ")[0]} · +{detourMinutes(b.c)}m
                        </div>
                        {b.c.est_min != null && height >= 50 && (
                          <div className="truncate text-[10px] opacity-90">~{fmtTime(b.c.est_min)}</div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
        {searched && (
          <p className="text-[11px] text-muted-foreground">
            Tap a block to jump to that opening's card.
          </p>
        )}
      </CardContent>
    </Card>
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
  const [windowWidth, setWindowWidth] = useState("4");   // hours: 4 (default) | 3 | 2 | 1
  const [selectedDates, setSelectedDates] = useState<string[]>(
    dayOptions.slice(0, 3).map((d) => d.iso), // default: next 3 working days
  );
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<FindResult | null>(null);
  // The form is the biggest thing on the page but the office only touches it
  // once per search, so it folds away as soon as there are slots to look at.
  const [formOpen, setFormOpen] = useState(true);

  // Follow-up plan: when set, a second search runs for the follow-up band
  // counted from the chosen Visit 1 date (defaults to the best-fit day).
  const [plan, setPlan] = useState<FollowUpPlan>("none");
  const [visit1Date, setVisit1Date] = useState<string | null>(null);
  const [followUp, setFollowUp] = useState<FindResult | null>(null);
  const [followUpLoading, setFollowUpLoading] = useState(false);

  // Default route maps: booked routes for the next 3 working days, fetched once
  // via the "@routes" sentinel — BigQuery-only on the backend (no geocoding,
  // no Distance Matrix), so this page-load fetch costs nothing.
  const [defaultRoutes, setDefaultRoutes] = useState<DayRoute[] | null>(null);
  const [routesLoading, setRoutesLoading] = useState(false);
  useEffect(() => {
    if (!staff || defaultRoutes !== null || routesLoading) return;
    let cancelled = false;
    setRoutesLoading(true);
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke("scheduling-find-slot", {
          body: {
            staffName: staff.fullName,
            address: "@routes",
            use_google: false,
            dates: dayOptions.slice(0, 3).map((d) => d.iso),
          },
        });
        if (cancelled) return;
        if (!error && data?.ok && Array.isArray(data.result?.day_routes)) {
          setDefaultRoutes(data.result.day_routes as DayRoute[]);
        } else {
          setDefaultRoutes([]);
        }
      } catch {
        if (!cancelled) setDefaultRoutes([]);
      } finally {
        if (!cancelled) setRoutesLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staff]);

  // "Any day" lookups: extra dates the office pulled beyond the default 3 —
  // same free sentinel fetch, one day at a time.
  const defaultDates = useMemo(() => dayOptions.slice(0, 3).map((d) => d.iso), [dayOptions]);
  const [extraDates, setExtraDates] = useState<string[]>([]);
  const [extraRoutes, setExtraRoutes] = useState<DayRoute[]>([]);
  const [lookupLoading, setLookupLoading] = useState(false);
  const lookupDay = async (iso: string) => {
    if (!staff || defaultDates.includes(iso) || extraDates.includes(iso)) return;
    setExtraDates((cur) => [...cur, iso]);
    setLookupLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("scheduling-find-slot", {
        body: { staffName: staff.fullName, address: "@routes", use_google: false, dates: [iso] },
      });
      if (!error && data?.ok && Array.isArray(data.result?.day_routes)) {
        setExtraRoutes((cur) => [...cur, ...(data.result.day_routes as DayRoute[])]);
      }
    } catch { /* pill stays; the day just reads "No routes this day." */ }
    finally { setLookupLoading(false); }
  };

  const serviceType = findServiceType(serviceTypeLabel);
  // Inspections (= "standalone") force subscription_id = -1 and hide the input.
  // Subscription services require a real subscription id (NEVER -1).
  const isStandalone = serviceType?.kind === "standalone";

  const selectCustomer = (c: FRCustomer) => {
    setCustomer(c);
    const full = [c.address, [c.city, c.state].filter(Boolean).join(", "), c.zip].filter(Boolean).join(", ");
    if (full && !address.trim()) setAddress(full);
  };

  // One find-slot search over an explicit list of days. Returns null (after
  // toasting) on failure so callers can bail without try/catch boilerplate.
  const searchDates = async (dates: string[]): Promise<FindResult | null> => {
    if (!staff) { toast.error("Please sign in again."); return null; }
    try {
      const { data, error } = await supabase.functions.invoke("scheduling-find-slot", {
        body: {
          staffName: staff.fullName,
          address: address.trim(),
          window: window === "none" ? null : window,
          use_google: true,
          dates,
          slots_per_day: 2,
        },
      });
      if (error) throw error;
      if (!data?.ok) { toast.error(data?.detail?.detail || data?.error || "Failed to find slots."); return null; }
      return data.result as FindResult;
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || "Unexpected error.");
      return null;
    }
  };

  // Search the follow-up band for a given Visit 1 date.
  const runFollowUp = async (firstIso: string, forPlan: FollowUpPlan) => {
    if (forPlan === "none") return;
    const dates = followUpDates(firstIso, forPlan);
    setVisit1Date(firstIso);
    setFollowUp(null);
    if (dates.length === 0) return;
    setFollowUpLoading(true);
    try {
      const r = await searchDates(dates);
      if (r) setFollowUp(r);
    } finally {
      setFollowUpLoading(false);
    }
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!staff) return toast.error("Please sign in again.");
    if (address.trim().length < 4) return toast.error("Please enter a full street address.");
    if (selectedDates.length === 0) return toast.error("Pick at least one day.");

    setLoading(true);
    setResult(null);
    setFollowUp(null);
    setVisit1Date(null);
    let first: FindResult | null = null;
    try {
      first = await searchDates(selectedDates);
      if (first) { setResult(first); setFormOpen(false); }
    } finally {
      setLoading(false);
    }
    // Follow-up: anchor on the best-fit Visit 1 day (the office can re-anchor
    // from any other day's card afterwards).
    if (first && plan !== "none") {
      const anchor = bestFitDate(first);
      if (anchor) await runFollowUp(anchor, plan);
    }
  };

  const planInfo = plan === "none" ? null : FOLLOW_UP_PLANS[plan];

  const canSchedule = !!customer && !!serviceType
    && (isStandalone || (subscriptionId.trim().length > 0 && subscriptionId.trim() !== "-1"));

  const scheduleContext = canSchedule ? {
    customer: customer!,
    serviceType: serviceType!,
    subscriptionId: isStandalone ? -1 : Number(subscriptionId.trim()),
    staffName: staff?.fullName ?? null,
  } : null;
  const scheduleHint = `Pick a customer${!serviceType ? " and a service type" : (!isStandalone && subscriptionId.trim() === "" ? " and a subscription id" : "")} above to enable the "Schedule" button on each slot.`;

  // The routes map. Rendered under the Best Fit card once a single-visit search
  // has results, and on its own at the bottom of the page otherwise.
  const mergedRoutes = useMemo(() => {
    const seen = new Set<string>();
    const merged: DayRoute[] = [];
    for (const r of [...(result?.day_routes ?? []), ...(followUp?.day_routes ?? []), ...(defaultRoutes ?? []), ...extraRoutes]) {
      const k = `${r.date}|${r.route_id}`;
      if (seen.has(k)) continue;
      seen.add(k); merged.push(r);
    }
    return merged;
  }, [result, followUp, defaultRoutes, extraRoutes]);

  const routesMapNode = (() => {
    const merged = mergedRoutes;
    const searchedDates = [
      ...(result?.by_day ?? []).map((d) => d.date),
      ...(followUp?.by_day ?? []).map((d) => d.date),
    ];
    const rec1 = recommendationFor(result);
    const rec2 = planInfo && !followUpLoading ? recommendationFor(followUp) : null;
    return (
      <RoutesOverviewCard
        dayRoutes={merged}
        dates={[...new Set([...defaultDates, ...extraDates, ...searchedDates])].sort()}
        loading={routesLoading}
        lookupLoading={lookupLoading}
        onLookupDay={lookupDay}
        target={result?.geocoded ?? null}
        preferredDate={rec1?.date ?? null}
        recommendations={[rec1, rec2].filter((r): r is Recommendation => !!r)}
      />
    );
  })();

  // Calendar columns follow the days picked in the search (next 3 working days
  // by default), so the strip grows as the office widens the search.
  const calendarDates = useMemo(() => [...selectedDates].sort(), [selectedDates]);

  return (
    <>
      <OpeningsCalendar
        title={planInfo ? "Visit 1 — best opening each day" : "Best opening each day"}
        dates={calendarDates}
        byDay={result?.by_day ?? []}
        dayRoutes={mergedRoutes}
        windowWidth={Number(windowWidth)}
        loading={loading}
        searched={!!result}
      />
      {planInfo && followUp && (
        <OpeningsCalendar
          title={`${planInfo.label} — best opening each day`}
          subtitle={`The follow-up band: ${planInfo.lo}–${planInfo.hi} days after Visit 1.`}
          dates={(followUp.by_day ?? []).map((d) => d.date)}
          byDay={followUp.by_day ?? []}
          dayRoutes={mergedRoutes}
          windowWidth={Number(windowWidth)}
          loading={followUpLoading}
          searched
        />
      )}
      <Card className="mt-6">
        <CardHeader className={formOpen ? undefined : "py-3"}>
          <button
            type="button"
            onClick={() => setFormOpen((v) => !v)}
            className="flex w-full items-center justify-between gap-3 text-left"
            aria-expanded={formOpen}
          >
            <CardTitle className="flex items-center gap-2">
              <MapPin className="w-5 h-5" /> Find open slots
            </CardTitle>
            <span className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
              {formOpen ? "Hide" : "Change search"}
              <ChevronDown className={`h-4 w-4 transition-transform ${formOpen ? "rotate-180" : ""}`} />
            </span>
          </button>
          {formOpen ? (
            <CardDescription>
              Pick the day(s) and an optional time window. Returns the 5 most
              efficient openings per day — each showing the Route Manager's
              resulting stops, per-window load, estimated route time, and why it
              works. Detours are traffic-aware via Google.
            </CardDescription>
          ) : (
            <CardDescription className="truncate">
              {address || "No address"}
              {selectedDates.length ? ` · ${selectedDates.length} day${selectedDates.length === 1 ? "" : "s"}` : ""}
              {window !== "none" ? ` · ${window}` : ""}
            </CardDescription>
          )}
        </CardHeader>
        <CardContent className={formOpen ? undefined : "hidden"}>
          <form onSubmit={onSubmit} className="space-y-4">
            {/* ── Visit plan boxes: single visit vs. 7 / 14 day follow-up ── */}
            <div className="space-y-2">
              <Label>Visit plan</Label>
              <div className="grid grid-cols-3 gap-2">
                {([
                  { key: "none" as FollowUpPlan, title: "Single visit", sub: "Just find one opening" },
                  { key: "7" as FollowUpPlan, title: "7 day follow up", sub: "2nd visit 6–10 days after" },
                  { key: "14" as FollowUpPlan, title: "14 day follow up", sub: "2nd visit 12–16 days after" },
                ]).map((opt) => {
                  const on = plan === opt.key;
                  return (
                    <button
                      key={opt.key}
                      type="button"
                      aria-pressed={on}
                      onClick={() => {
                        setPlan(opt.key);
                        // Re-plan the follow-up against the existing Visit 1 result
                        // (no need to re-run the first search).
                        if (result) {
                          if (opt.key === "none") { setFollowUp(null); setVisit1Date(null); }
                          else {
                            const anchor = visit1Date ?? bestFitDate(result);
                            if (anchor) void runFollowUp(anchor, opt.key);
                          }
                        }
                      }}
                      className={`rounded-md border-2 px-3 py-2.5 text-left transition-colors ${
                        on
                          ? "border-primary bg-primary text-primary-foreground shadow-md"
                          : "border-border bg-background hover:bg-muted"
                      }`}
                    >
                      <div className="text-sm font-bold leading-tight">{opt.title}</div>
                      <div className={`text-[11px] leading-tight mt-0.5 ${on ? "opacity-90" : "text-muted-foreground"}`}>{opt.sub}</div>
                    </button>
                  );
                })}
              </div>
              {planInfo && (
                <p className="text-xs text-muted-foreground">
                  Finds the best opening for Visit 1 in the days you pick below, then the best
                  opening for the follow-up {planInfo.lo}–{planInfo.hi} days after it.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Customer (FieldRoutes)</Label>
              <CustomerPicker
                staffName={staff?.fullName ?? undefined}
                linkedId={customer?.customer_id ?? null}
                linkedLabel={customer
                  ? [customer.name || customer.company_name || null, lastServiceLabel(customer)].filter(Boolean).join(" · ")
                  : null}
                linkedLoginLink={customer?.loginLink ?? null}
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
              <Label>{planInfo ? "Days to search for Visit 1" : "Days to search"}</Label>
              <div className="flex flex-wrap items-center gap-2">
                <DayMultiSelect options={dayOptions} selected={selectedDates} onChange={setSelectedDates} />
                {[3, 5, 10].map((n) => (
                  <Button
                    key={n}
                    type="button"
                    size="sm"
                    variant={selectedDates.length === n
                      && selectedDates.every((d, i) => d === dayOptions[i]?.iso) ? "default" : "outline"}
                    onClick={() => setSelectedDates(dayOptions.slice(0, n).map((o) => o.iso))}
                  >
                    Next {n} days
                  </Button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Next 3 working days are selected by default. The calendar at the top of the page
                shows one column per day you pick here.
              </p>
            </div>

            <div className="flex flex-wrap gap-4">
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
              <div className="space-y-2 md:w-64">
                <Label>Arrival window width</Label>
                <Select value={windowWidth} onValueChange={setWindowWidth}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="4">4-hour window (default)</SelectItem>
                    <SelectItem value="3">3-hour window</SelectItem>
                    <SelectItem value="2">2-hour window</SelectItem>
                    <SelectItem value="1">1-hour window</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Narrows the customer's arrival window around the estimated time.
                </p>
              </div>
            </div>

            <Button type="submit" disabled={loading || followUpLoading} className="w-full md:w-auto">
              {loading ? "Searching…" : planInfo ? "Find Visit 1 + follow-up slots" : "Find slots"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Single visit: one result block. */}
      {result && !planInfo && (
        <div className="mt-6">
          <FindResultsView
            result={result}
            windowWidth={Number(windowWidth)}
            scheduleContext={scheduleContext}
            scheduleHint={!canSchedule ? scheduleHint : null}
            mapSlot={routesMapNode}
          />
        </div>
      )}

      {/* Follow-up plan: Visit 1 and Visit 2 side by side. The block breaks
          out of the page's 5xl column on large screens so both sets of slot
          cards stay readable. */}
      {result && planInfo && (() => {
        const v1 = bestFitSlot(result);
        const v2 = followUpLoading ? null : bestFitSlot(followUp);
        const w = Number(windowWidth);
        return (
          <div className="mt-6 space-y-4 lg:relative lg:left-1/2 lg:-translate-x-1/2 lg:w-[min(96rem,calc(100vw-3rem))]">
            {/* Recommendation strip: the two days to offer the customer. */}
            <div className="rounded-lg border-2 border-emerald-600 bg-emerald-50/60 p-3">
              <div className="text-xs font-bold uppercase tracking-wide text-emerald-800 mb-2">Recommend</div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className="bg-primary text-primary-foreground font-bold uppercase tracking-wide">Visit 1</Badge>
                  {v1 ? (
                    <span className="text-sm">
                      <span className="font-bold">{v1.weekday}, {isoDayLabel(v1.date)}</span>
                      {" · "}<span className="font-semibold">{bookWindowLabel(v1.c, w)}</span>
                      {" · "}{v1.c.tech_name}
                    </span>
                  ) : <span className="text-sm italic text-muted-foreground">No opening found</span>}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className="bg-violet-600 hover:bg-violet-600 text-white font-bold uppercase tracking-wide">{planInfo.label}</Badge>
                  {followUpLoading ? (
                    <span className="text-sm italic text-muted-foreground">Searching…</span>
                  ) : v2 ? (
                    <span className="text-sm">
                      <span className="font-bold">{v2.weekday}, {isoDayLabel(v2.date)}</span>
                      {visit1Date && <span className="font-semibold text-violet-700"> (+{daysBetweenIso(visit1Date, v2.date)} days)</span>}
                      {" · "}<span className="font-semibold">{bookWindowLabel(v2.c, w)}</span>
                      {" · "}{v2.c.tech_name}
                    </span>
                  ) : <span className="text-sm italic text-muted-foreground">No opening found in the {planInfo.lo}–{planInfo.hi} day band</span>}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
              {/* ── Column 1: Visit 1 ── */}
              <div className="space-y-4 min-w-0">
                <div className="rounded-md border-2 border-primary/60 bg-primary/5 p-3 flex flex-wrap items-center gap-2">
                  <Badge className="bg-primary text-primary-foreground font-bold uppercase tracking-wide">Visit 1</Badge>
                  <span className="text-sm font-semibold">
                    {visit1Date ? `${isoDayLabel(visit1Date)} · ` : ""}best opening in the next few days
                  </span>
                  <span className="text-xs text-muted-foreground">
                    — use “Plan follow-up from this day” on any day to re-anchor Visit 2.
                  </span>
                </div>
                <FindResultsView
                  result={result}
                  windowWidth={w}
                  scheduleContext={scheduleContext}
                  scheduleHint={!canSchedule ? scheduleHint : null}
                  visitLabel="Visit 1"
                  dayAction={{
                    activeDate: visit1Date,
                    label: "Plan follow-up from this day",
                    activeLabel: "Follow-up planned from this day",
                    onPick: (iso) => { void runFollowUp(iso, plan); },
                  }}
                />
              </div>

              {/* ── Column 2: follow-up ── */}
              <div className="space-y-4 min-w-0">
                <div className="rounded-md border-2 border-violet-500/60 bg-violet-500/5 p-3 flex flex-wrap items-center gap-2">
                  <Badge className="bg-violet-600 hover:bg-violet-600 text-white font-bold uppercase tracking-wide">
                    Visit 2 · {planInfo.label}
                  </Badge>
                  <span className="text-sm font-semibold">
                    {visit1Date
                      ? `${planInfo.lo}–${planInfo.hi} days after ${isoDayLabel(visit1Date)}`
                      : `${planInfo.lo}–${planInfo.hi} days after Visit 1`}
                  </span>
                  {visit1Date && (
                    <span className="text-xs text-muted-foreground">
                      — {followUpDates(visit1Date, plan).map(isoDayLabel).join(", ") || "no working days in range"}
                    </span>
                  )}
                </div>
                {followUpLoading && <p className="text-sm text-muted-foreground">Searching follow-up days…</p>}
                {!followUpLoading && !followUp && (
                  <p className="text-sm italic text-muted-foreground">
                    {visit1Date ? "No follow-up results." : "Pick a Visit 1 day to plan the follow-up."}
                  </p>
                )}
                {!followUpLoading && followUp && (
                  <FindResultsView
                    result={followUp}
                    windowWidth={w}
                    scheduleContext={scheduleContext}
                    scheduleHint={!canSchedule ? scheduleHint : null}
                    visitLabel={planInfo.label}
                    dayBadge={(iso) => visit1Date ? `+${daysBetweenIso(visit1Date, iso)} days` : null}
                  />
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* With a result on screen the map is threaded INTO the results, directly
          under the Best Fit card (Caleb: best fit, then the map, then the other
          choices). With no search yet it stands alone here. */}
      <div className={result && !planInfo ? "hidden" : "mt-6"}>
        {routesMapNode}
      </div>
    </>
  );
}

// Renders one find-slot result: the scheduling-note banner, the ★ Best Fit /
// 2nd Best summary, then a card per day with its SlotCards. Used once for a
// single-visit search and twice (Visit 1 + follow-up) for a follow-up plan.
function FindResultsView({
  result, windowWidth, scheduleContext, scheduleHint, visitLabel, dayAction, dayBadge, mapSlot,
}: {
  result: FindResult;
  windowWidth: number;
  scheduleContext: ScheduleContext | null;
  /** Shown when click-to-schedule is disabled (missing customer / type / sub id). */
  scheduleHint?: string | null;
  /** Prefix for the Schedule confirm ("Visit 1", "7 day follow up"). */
  visitLabel?: string;
  /** Optional per-day action button (used to re-anchor the follow-up). */
  dayAction?: { activeDate: string | null; label: string; activeLabel: string; onPick: (iso: string) => void };
  /** Optional per-day badge text (e.g. "+8 days" on follow-up cards). */
  dayBadge?: (iso: string) => string | null;
  /** Route map, rendered directly under the Best Fit card. */
  mapSlot?: React.ReactNode;
}) {
  const byDay = result.by_day ?? [];
  return (
    <div className="space-y-6">
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
          // score_sec is the backend's quality-adjusted rank (detour +
          // crowded-window + late-finish penalties) — trust it first.
          const as = a.c.score_sec ?? Infinity;
          const bs = b.c.score_sec ?? Infinity;
          if (as !== bs) return as - bs;
          const am = detourMinutes(a.c);
          const bm = detourMinutes(b.c);
          if (am !== bm) return am - bm;
          return parseFloat(detourMiles(a.c)) - parseFloat(detourMiles(b.c));
        });
        const top = all.slice(0, 2);
        if (top.length === 0) return null;
        const DAILY_MAX_STOPS = 13;
        function renderTop(r: Ranked, i: number) {
              const recKey = (r.c.after_insert?.new_stop_window as string | null) ?? null;
              const recLabel = bookWindowLabel(r.c, windowWidth);
              const snap = r.c.route_snapshot;
              const after = r.c.after_insert;
              const beforeCount = recKey && snap?.stops_by_window
                ? (snap.stops_by_window[recKey as keyof WindowCounts] ?? 0)
                : 0;
              const isCrowded = beforeCount >= 4;
              const afterTotal = after?.stops_excluding_tasks ?? 0;
              const isDayFull = afterTotal >= DAILY_MAX_STOPS;
              const isPrimary = i === 0;
              const risks = [
                isCrowded ? `already ${beforeCount} stops in this window` : null,
                isDayFull ? `${r.c.tech_name.split(" ")[0]} ${afterTotal > DAILY_MAX_STOPS ? "over" : "at"} daily max (${afterTotal} stops)` : null,
                r.c.day_unworkable ? `${r.c.tech_name.split(" ")[0]}'s day already can't be finished as booked` : null,
              ].filter(Boolean) as string[];

              // THE recommendation. The office should be able to read what to
              // do from across the room, so the primary slot gets the day, the
              // window and the arrival time at heading size.
              if (isPrimary) {
                return (
                  <div
                    key={`${r.date}#${r.idx}`}
                    className="rounded-lg border-2 border-emerald-600 bg-emerald-50/70 dark:bg-emerald-950/30 p-4 shadow-sm"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white font-bold uppercase tracking-wide text-sm px-3 py-1">
                        ★ Book this one
                      </Badge>
                      <span className="ml-auto"><DetourBadge c={r.c} /></span>
                    </div>
                    <p className="mt-2 text-2xl font-extrabold leading-tight text-foreground">
                      {r.c.tech_name}
                      <span className="text-muted-foreground font-bold"> · </span>
                      {isoDayLabel(r.date)}
                    </p>
                    <p className="mt-1 text-lg font-bold text-foreground">
                      {recLabel}
                      {r.c.est_min != null && (
                        <span className="font-semibold text-muted-foreground"> · arrive ~{fmtTime(r.c.est_min)}</span>
                      )}
                    </p>
                    {r.c.fits_between && (
                      <p className="mt-1 text-sm font-medium text-muted-foreground">
                        Goes in at {r.c.fits_between}
                        {r.c.prev_stop?.customer_name ? `, after ${r.c.prev_stop.customer_name}` : ""}
                        {r.c.next_stop?.customer_name && r.c.insertion_kind !== "last_stop"
                          ? ` and before ${r.c.next_stop.customer_name}` : ""}
                      </p>
                    )}
                    {risks.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {risks.map((t) => (
                          <Badge key={t} className="bg-orange-500 hover:bg-orange-500 text-white font-semibold">
                            <AlertTriangle className="w-3 h-3 mr-1" />{t}
                          </Badge>
                        ))}
                      </div>
                    )}
                    <p className="mt-2 text-xs text-muted-foreground">
                      Full detail, day plan and the Schedule button are on this slot's card below.
                    </p>
                  </div>
                );
              }
              return (
                <div key={`${r.date}#${r.idx}`} className="rounded-md border border-border bg-background px-3 py-2 flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="font-semibold uppercase tracking-wide text-muted-foreground">
                    Backup
                  </Badge>
                  <span className="text-sm">
                    <span className="font-semibold">{r.c.tech_name}</span>
                    <span className="text-muted-foreground"> · {isoDayLabel(r.date)} · </span>
                    <span className="font-semibold">{recLabel}</span>
                    {r.c.est_min != null && (
                      <span className="text-muted-foreground"> · arrive ~{fmtTime(r.c.est_min)}</span>
                    )}
                  </span>
                  {risks.length > 0 && (
                    <span className="text-xs text-orange-700">({risks.join("; ")})</span>
                  )}
                  <span className="ml-auto"><DetourBadge c={r.c} /></span>
                </div>
              );
        }
        return (
          <div className="space-y-2">
            {top.map((r, i) => (
              <Fragment key={`wrap-${r.date}#${r.idx}`}>
                {i === 1 && mapSlot ? <div className="py-1">{mapSlot}</div> : null}
                {i === 1 ? (
                  <p className="pt-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    Other options
                  </p>
                ) : null}
                {renderTop(r, i)}
              </Fragment>
            ))}
            {top.length === 1 && mapSlot ? <div className="py-1">{mapSlot}</div> : null}
          </div>
        );
      })()}
      {scheduleHint && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
          {scheduleHint}
        </p>
      )}
      {result.scheduling_note && (
        <div className="rounded-md border border-border bg-muted/40 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Special scheduling notes
          </p>
          {result.note_manual && (
            <p className="mt-1 text-sm font-semibold text-amber-700">
              Call to schedule — this customer is not to be auto-booked.
            </p>
          )}
          <p className="mt-1 text-sm italic">“{result.scheduling_note}”</p>
          {(result.note_rules?.length ?? 0) > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {result.note_rules!.map((r) => (
                <Badge key={r} variant="outline" className="text-muted-foreground">{r}</Badge>
              ))}
            </div>
          )}
          {(result.note_blocked_dates?.length ?? 0) > 0 && (
            <p className="mt-2 text-xs text-muted-foreground">
              Days not shown:{" "}
              {result.note_blocked_dates!.map((b) => `${b.date} — ${b.reason}`).join(" · ")}
            </p>
          )}
        </div>
      )}
      <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer select-none">Search details</summary>
        <p className="mt-2">
          Scored {result.routes_scored} route-openings across{" "}
          {result.stops_in_horizon} stops. Geocoded to{" "}
          <code>{result.geocoded.lat.toFixed(4)}, {result.geocoded.lng.toFixed(4)}</code>.
          {result.drive_source === "google"
            ? " Every drive time below is a real Google road time."
            : result.drive_source === "partial"
              ? " Some drive times below are estimates (Google covered part of the search)."
              : result.drive_source === "estimate"
                ? " Drive times below are estimates — Google was unavailable for this search."
                : ""}
        </p>
        {(result.off_day_routes?.length ?? 0) > 0 && (
          <p className="mt-1">
            Not offered (Route Manager off):{" "}
            {result.off_day_routes!.map((o) => `${o.tech_name} ${isoDayLabel(o.date)} — ${o.reason}`).join(" · ")}
          </p>
        )}
      </details>
      {byDay.length === 0 && (
        <p className="text-sm italic text-muted-foreground">
          No field-tech routes on the selected day(s).
        </p>
      )}
      {(() => {
        // Recompute the same best-fit key so we can flag the matching SlotCard.
        let bestKey: string | null = null;
        let bestScore = Infinity;
        let bestMin = Infinity;
        let bestMiles = Infinity;
        byDay.forEach((day) => {
          day.slots.forEach((c, idx) => {
            const s = c.score_sec ?? Infinity;
            const m = detourMinutes(c);
            const mi = parseFloat(detourMiles(c));
            if (
              s < bestScore ||
              (s === bestScore && (m < bestMin || (m === bestMin && mi < bestMiles)))
            ) {
              bestScore = s;
              bestMin = m;
              bestMiles = mi;
              bestKey = `${day.date}#${idx}`;
            }
          });
        });
        return byDay.map((day) => (
        <Card key={day.date}>
          <CardHeader className="pb-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-base flex items-center gap-2">
                {day.weekday} · {day.date}
                {dayBadge?.(day.date) && (
                  <Badge variant="outline" className="border-violet-500 text-violet-700 dark:text-violet-300 font-semibold">
                    {dayBadge(day.date)}
                  </Badge>
                )}
              </CardTitle>
              {dayAction && day.slots.length > 0 && (
                dayAction.activeDate === day.date ? (
                  <Badge className="bg-primary text-primary-foreground font-semibold">
                    <CheckCircle2 className="w-3 h-3 mr-1" /> {dayAction.activeLabel}
                  </Badge>
                ) : (
                  <Button type="button" size="sm" variant="outline" onClick={() => dayAction.onPick(day.date)}>
                    <CalendarClock className="w-3.5 h-3.5 mr-1" /> {dayAction.label}
                  </Button>
                )
              )}
            </div>
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
                widthHours={windowWidth}
                visitLabel={visitLabel}
                route={result.day_routes?.find((r) => r.date === day.date && r.route_id === c.route_id) ?? null}
                target={result.geocoded}
              />
            ))}
          </CardContent>
        </Card>
        ));
      })()}
    </div>
  );
}

type ScheduleContext = {
  customer: FRCustomer;
  serviceType: ServiceType;
  subscriptionId: number;
  staffName: string | null;
};

function SlotCard({
  c, rank, date, scheduleContext, isBestFit, widthHours = 4, route, target, visitLabel,
}: {
  c: SlotCandidate;
  rank: number;
  date?: string;
  scheduleContext?: ScheduleContext | null;
  isBestFit?: boolean;
  widthHours?: number;
  /** Which visit of a follow-up plan this slot books ("Visit 1", "7 day follow up"). */
  visitLabel?: string;
  /** The tech-day's booked route (from day_routes) — enables the Map view. */
  route?: DayRoute | null;
  /** Geocoded location of the searched address — the "new stop" pin. */
  target?: { lat: number; lng: number } | null;
}) {
  const snap = c.route_snapshot;
  const after = c.after_insert;
  const [booking, setBooking] = useState(false);
  const [showMap, setShowMap] = useState(false);

  const onSchedule = async () => {
    if (!scheduleContext) return;
    // Book the tightened window when the office narrowed it; else the slot's
    // native (4-hour) window. minToHHMMSS keeps the "HH:MM:SS" shape FieldRoutes expects.
    const bw = bookWindowMinutes(c, widthHours);
    const start = bw ? minToHHMMSS(bw.lo) : c.next_stop?.start_time;
    const end = bw ? minToHHMMSS(bw.hi) : c.next_stop?.end_time;
    const useDate = date ?? c.route_date;
    if (!start || !end || !useDate) { toast.error("This slot is missing time data."); return; }
    const subLabel = scheduleContext.subscriptionId === -1 ? "standalone" : `subscription #${scheduleContext.subscriptionId}`;
    const lastSvc = lastServiceLabel(scheduleContext.customer, "Last service");
    if (!window.confirm(`Queue this appointment for office approval?\n\n${visitLabel ? `${visitLabel}: ` : ""}${scheduleContext.serviceType.label} for ${scheduleContext.customer.name || scheduleContext.customer.company_name}\n${useDate} ${start}–${end}\n${subLabel}${lastSvc ? `\n${lastSvc}${scheduleContext.customer.last_is_initial ? " — initial: 30-day follow-up, ±5 day flexibility" : ""}` : ""}`)) return;
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
    <div
      id={date ? `slot-${date}-${rank - 1}` : undefined}
      className={`scroll-mt-24 rounded-md p-3 transition-shadow ${tierBorder(c)} ${isBestFit ? "ring-2 ring-emerald-500 ring-offset-1" : ""}`}
    >
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
          {c.note_time_conflict && (
            <Badge className="bg-amber-500 hover:bg-amber-500 text-white font-semibold">
              ⚠ {c.note_time_rule ?? "outside the note's time window"}
            </Badge>
          )}
        </div>
        <span className="flex items-center gap-2">
          <DriveSourceBadge source={c.drive_source ?? (c.extra_sec_gmaps != null ? "google" : "estimate")} />
          <DetourBadge c={c} />
        </span>
      </div>

      {/* ── BIG recommendation pill — single source of truth for the window
          we're telling the office to book. Derived from `new_stop_window`
          (the algorithm's actual pick) and falls back to the next_stop
          window only when upstream didn't return one. ────────────────── */}
      {(() => {
        const recKey = (after?.new_stop_window as string | null) ?? null;
        const recLabel = bookWindowLabel(c, widthHours);
        const beforeCount = recKey && snap?.stops_by_window
          ? (snap.stops_by_window[recKey as keyof WindowCounts] ?? 0)
          : 0;
        const isCrowded = beforeCount >= 4;
        const DAILY_MAX_STOPS = 13;
        const afterTotal = after?.stops_excluding_tasks ?? 0;
        const isDayFull = afterTotal >= DAILY_MAX_STOPS;
        // EXACT position in the modeled day — the same numbers the map and
        // the day plan use. Structured fields first; the legacy "stop 1 →
        // stop 2 of 6" string is only a fallback for older responses.
        const fb = c.fits_between || "";
        const fbMatch = fb.match(/stop\s*(\d+)\s*[→\-\/]+\s*stop\s*(\d+)\s*(?:of\s*(\d+))?/i);
        const kind = c.insertion_kind ?? "mid_route";
        const prevIdx = c.prev_order ?? (fbMatch?.[1] ? parseInt(fbMatch[1], 10) : null);
        const nextIdx = c.next_order ?? (fbMatch?.[2] ? parseInt(fbMatch[2], 10) : null);
        const totalIdx = c.stops_total ?? (fbMatch?.[3] ? parseInt(fbMatch[3], 10) : null);
        const prevName = (c.prev_stop?.customer_name || "").trim();
        const nextName = (c.next_stop?.customer_name || "").trim();
        const positionLabel =
          kind === "first_stop" ? `New first stop · before Stop ${nextIdx ?? 1}${totalIdx ? ` of ${totalIdx}` : ""}`
          : kind === "last_stop" ? `New last stop · after Stop ${prevIdx ?? totalIdx ?? "?"}${totalIdx ? ` of ${totalIdx}` : ""}`
          : prevIdx != null && nextIdx != null ? `Insert between Stop ${prevIdx} and Stop ${nextIdx}${totalIdx ? ` of ${totalIdx}` : ""}`
          : null;
        const namesLabel =
          kind === "first_stop" ? (nextName ? `→ ${nextName}` : "")
          : kind === "last_stop" ? (prevName ? `${prevName} →` : "")
          : (prevName || nextName) ? `${prevName || "—"} → ${nextName || "—"}` : "";
        return (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <div className={`inline-flex flex-wrap items-center gap-2 rounded-md px-3 py-2 shadow-sm ${tierPillClasses(c)}`}>
              <Target className="w-4 h-4" />
              <span className="text-xs font-bold uppercase tracking-wide opacity-90">Book in</span>
              <span className="text-sm font-bold">{recLabel}</span>
              {c.est_min != null && (
                <span className="text-xs font-semibold opacity-90 border-l border-current/30 pl-2">
                  ETA ~{fmtTime(c.est_min)}
                </span>
              )}
            </div>
            {positionLabel && (
              <div className="inline-flex flex-wrap items-center gap-2 rounded-md border-2 border-foreground/80 bg-background px-3 py-2 shadow-sm">
                <span className="text-sm font-extrabold uppercase tracking-wide">{positionLabel}</span>
                {namesLabel && (
                  <span className="text-sm font-bold text-foreground/80 border-l border-foreground/20 pl-2">
                    {namesLabel}
                  </span>
                )}
              </div>
            )}
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
            {(c.push_delay_min ?? 0) >= 15 && (
              <Badge variant="outline" className="border-amber-500 text-amber-700 font-semibold">
                pushes day ~{c.push_delay_min} min
              </Badge>
            )}
            {c.day_unworkable && (
              <Badge className="bg-red-700 hover:bg-red-700 text-white font-bold uppercase tracking-wide">
                <AlertTriangle className="w-3 h-3 mr-1" />
                {c.tech_name.split(" ")[0]}'s day already can't be finished as booked
              </Badge>
            )}
            {(after?.windows_blown ?? 0) > 0 && (
              <Badge className="bg-red-600 hover:bg-red-600 text-white font-bold uppercase tracking-wide">
                <AlertTriangle className="w-3 h-3 mr-1" />
                {after!.windows_blown} later stop{after!.windows_blown === 1 ? "" : "s"} would miss their window
              </Badge>
            )}
          </div>
        );
      })()}

      {/* ── Where it lands: who it's between, the drive legs each side, and
          the modeled clocks (restored — the office needs this to talk the
          customer through the day). ─────────────────────────────────── */}
      {(() => {
        const p = c.prev_stop;
        const n = c.next_stop;
        const kind = c.insertion_kind ?? "mid_route";
        const legA = c.drive_prev_to_new_sec != null ? Math.round(c.drive_prev_to_new_sec / 60) : null;
        const legB = c.drive_new_to_next_sec != null ? Math.round(c.drive_new_to_next_sec / 60) : null;
        const Leg = ({ min }: { min: number | null }) => (
          <span className="inline-flex items-center gap-1 text-muted-foreground">
            <span aria-hidden>→</span>
            {min != null && <span className="font-mono text-[11px] rounded border px-1 bg-muted/40">{min} min drive</span>}
            <span aria-hidden>→</span>
          </span>
        );
        const StopName = ({ st, clock, clockLabel, order }: { st?: Stop; clock?: number | null; clockLabel: string; order?: number | null }) => (
          <span>
            {order != null && (
              <span className="mr-1 inline-flex items-center rounded bg-foreground px-1 font-mono text-[11px] font-bold text-background">#{order}</span>
            )}
            <span className="font-semibold text-foreground">{st?.customer_name ?? "?"}</span>
            {st?.city ? <span className="text-muted-foreground"> ({st.city}{clock != null ? `, ${clockLabel} ~${fmtTime(clock)}` : ""})</span> : null}
          </span>
        );
        const NewPill = () => (
          <span className="inline-flex items-center rounded bg-red-600 text-white text-[11px] font-bold uppercase tracking-wide px-1.5 py-0.5">
            New stop{c.est_min != null ? ` ~${fmtTime(c.est_min)}` : ""}
          </span>
        );
        return (
          <div className="mt-2 rounded-md border border-dashed border-border bg-muted/20 px-3 py-2 text-sm">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Where it lands</span>
              {kind === "first_stop" ? (
                <>
                  <span className="text-muted-foreground">Day's first stop (on site 8:00 AM)</span>
                  <NewPill />
                  <Leg min={legB} />
                  <StopName st={n} clock={n?.est_arrival_min} clockLabel="arrives" order={c.next_order} />
                </>
              ) : kind === "last_stop" ? (
                <>
                  <span className="text-muted-foreground">Day's last stop, after</span>
                  <StopName st={p} clock={p?.est_depart_min} clockLabel="done" order={c.prev_order} />
                  <Leg min={legA} />
                  <NewPill />
                  {legB != null && <span className="text-xs text-muted-foreground">· then {legB} min home</span>}
                </>
              ) : (
                <>
                  <span className="text-muted-foreground">after</span>
                  <StopName st={p} clock={p?.est_depart_min} clockLabel="done" order={c.prev_order} />
                  <Leg min={legA} />
                  <NewPill />
                  <Leg min={legB} />
                  <span className="text-muted-foreground">before</span>
                  <StopName st={n} clock={n?.est_arrival_min} clockLabel="arrives" order={c.next_order} />
                </>
              )}
              {(c.push_delay_min ?? 0) > 0 && (
                <span className="text-amber-700 font-medium">· pushes the rest of the day back ~{c.push_delay_min} min</span>
              )}
            </div>
          </div>
        );
      })()}

      {c.day_plan && c.day_plan.length > 0 && (
        <DayPlanList plan={c.day_plan} defaultOpen={!!isBestFit} techName={c.tech_name} />
      )}

      {/* ── Day load after the insert: total stops + expected hours worked ── */}
      {after && (() => {
        const LUNCH_HRS = 0.5;
        const isDayFull = (after.stops_excluding_tasks ?? 0) >= 13;
        const hrs = after.est_route_hours != null ? Math.max(0, after.est_route_hours - LUNCH_HRS) : null;
        const hrsCls = hrs == null ? "" : hrs >= 9 ? "border-red-500 bg-red-50 text-red-800"
          : hrs >= 8 ? "border-amber-500 bg-amber-50 text-amber-800"
          : "border-border bg-background";
        const stopsCls = isDayFull ? "border-red-500 bg-red-50 text-red-800" : "border-border bg-background";
        return (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <div className={`inline-flex items-baseline gap-1.5 rounded-md border-2 px-3 py-1.5 ${stopsCls}`}>
              <span className="text-xs font-bold uppercase tracking-wide opacity-80">Stops after</span>
              <span className="text-lg font-extrabold leading-none">{after.stops_excluding_tasks}</span>
              <span className="text-xs opacity-70">(+1 added)</span>
            </div>
            {hrs != null && (
              <div className={`inline-flex items-baseline gap-1.5 rounded-md border-2 px-3 py-1.5 ${hrsCls}`}>
                <span className="text-xs font-bold uppercase tracking-wide opacity-80">Expected hours</span>
                <span className="text-lg font-extrabold leading-none">~{hrs.toFixed(1)}h</span>
                {after.est_finish_min != null && (
                  <span className="text-xs opacity-70">· done ~{fmtTime(after.est_finish_min)}</span>
                )}
              </div>
            )}
          </div>
        );
      })()}

      {/* ── Before → after: window crowding, day timeline, drive load ──── */}
      {snap && after && (() => {
        const LUNCH_MIN = 30;
        const routeMin = after.est_route_hours != null ? Math.round(after.est_route_hours * 60) : null;
        const firstStart = snap.first_start_min ?? (after.est_finish_min != null && routeMin != null ? after.est_finish_min - routeMin : null);
        const workedHrs = after.est_route_hours != null ? Math.max(0, after.est_route_hours - LUNCH_MIN / 60) : null;
        const beforeHrs = snap.est_route_hours != null ? Math.max(0, snap.est_route_hours - LUNCH_MIN / 60) : null;
        return (
          <div className="mt-2 space-y-1 text-xs">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="flex items-center gap-1">
                <span className="font-semibold text-foreground">Before:</span>
                <WindowChips counts={snap.stops_by_window} />
                <span className="text-muted-foreground">({snap.stops_excluding_tasks} stops{beforeHrs != null ? `, ~${beforeHrs.toFixed(1)}h` : ""})</span>
              </span>
              <span className="text-muted-foreground">→</span>
              <span className="flex items-center gap-1">
                <span className="font-semibold text-foreground">After:</span>
                <WindowChips counts={after.stops_by_window} highlight={after.new_stop_window} />
                <span className="text-muted-foreground">({after.stops_excluding_tasks} stops{workedHrs != null ? `, ~${workedHrs.toFixed(1)}h` : ""})</span>
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground">
              {firstStart != null && after.est_finish_min != null ? (
                <span>
                  First stop <span className="font-medium text-foreground">{fmtTime(firstStart)}</span>
                  {" → last stop "}
                  <span className="font-medium text-foreground">{fmtTime(after.est_finish_min)}</span>
                  {snap.est_finish_min != null && snap.est_finish_min !== after.est_finish_min && (
                    <span> (was {fmtTime(snap.est_finish_min)})</span>
                  )}
                </span>
              ) : workedHrs != null ? (
                <span>~{workedHrs.toFixed(1)}h on the clock (after 30-min lunch)</span>
              ) : null}
              {workedHrs != null && firstStart != null && (
                <span>· <span className="font-medium text-foreground">~{workedHrs.toFixed(1)}h on the clock</span> (after 30-min lunch)</span>
              )}
              {after.added_min != null && <span>· +{after.added_min} min added to the day</span>}
              {snap.total_drive_min != null && (
                <span>· {snap.total_drive_min} min driving today{snap.job_drive_min != null ? ` (${snap.job_drive_min} between jobs)` : ""}</span>
              )}
              <span>
                · {snap.has_home
                  ? (snap.home_base_min ? `+${(snap.home_base_min / 60).toFixed(1)}h commute` : "commute included")
                  : "no home base on file"}
              </span>
            </div>
          </div>
        );
      })()}

      {c.justification && (
        <p className="mt-2 text-xs italic text-muted-foreground">{c.justification}</p>
      )}

      <div className="mt-3 flex flex-col sm:flex-row gap-2 sm:justify-end">
        {route && target && (
          <Button
            type="button"
            variant="outline"
            onClick={() => setShowMap((v) => !v)}
            className="w-full sm:w-auto h-10"
            title="Show this day's route with the new stop placed on it"
          >
            <MapPin className="h-3.5 w-3.5 mr-1" />
            {showMap ? "Hide map" : "Map"}
          </Button>
        )}
        <Button
          type="button"
          disabled={!scheduleContext || booking}
          onClick={onSchedule}
          className="w-full sm:w-auto h-10"
          title={scheduleContext ? "Queue this appointment for office approval" : "Pick a customer + service type above to enable"}
        >
          <CalendarPlus className="h-3.5 w-3.5 mr-1" />
          {booking ? "Queueing…" : "Schedule (queue for approval)"}
        </Button>
      </div>

      {showMap && route && target && (
        <div className="mt-3">
          <RouteMap
            stops={toMapStops(route)}
            candidate={{
              lat: target.lat,
              lng: target.lng,
              label: "NEW",
              caption: "New stop (searched address)",
              prev: c.prev_stop?.lat != null && c.prev_stop?.lng != null
                ? { lat: c.prev_stop.lat, lng: c.prev_stop.lng } : null,
              next: c.next_stop?.lat != null && c.next_stop?.lng != null
                ? { lat: c.next_stop.lat, lng: c.next_stop.lng } : null,
            }}
          />
        </div>
      )}
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
                  <SelectTrigger className="w-full sm:w-48"><SelectValue placeholder="Pick a day" /></SelectTrigger>
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
                  <SelectTrigger className="w-full sm:w-48"><SelectValue /></SelectTrigger>
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
                      <span className="flex items-center gap-2">
                        <DriveSourceBadge source={c.drive_source ?? (c.extra_sec_gmaps != null ? "google" : "estimate")} />
                        <DetourBadge c={c} />
                      </span>
                    </div>
                    <div className="mt-2 text-xs text-muted-foreground">
                      {(() => {
                        const kind = c.insertion_kind ?? "mid_route";
                        const tot = c.stops_total != null ? ` of ${c.stops_total}` : "";
                        if (kind === "first_stop") {
                          return <>New first stop (on site 8:00 AM) · before <span className="font-medium text-foreground">#{c.next_order ?? 1} {c.next_stop?.customer_name}</span> ({c.next_stop?.city}){tot}</>;
                        }
                        if (kind === "last_stop") {
                          return <>New last stop · after <span className="font-medium text-foreground">#{c.prev_order ?? c.stops_total ?? "?"} {c.prev_stop?.customer_name}</span> ({c.prev_stop?.city}){tot}{c.est_min != null ? ` · ETA ~${fmtTime(c.est_min)}` : ""}</>;
                        }
                        return <>Between <span className="font-medium text-foreground">{c.prev_order != null ? `#${c.prev_order} ` : ""}{c.prev_stop?.customer_name}</span> ({c.prev_stop?.city})
                          {" → "}
                          <span className="font-medium text-foreground">{c.next_order != null ? `#${c.next_order} ` : ""}{c.next_stop?.customer_name}</span> ({c.next_stop?.city}){tot}{c.est_min != null ? ` · ETA ~${fmtTime(c.est_min)}` : ""}</>;
                      })()}
                    </div>
                    {c.day_plan && c.day_plan.length > 0 && (
                      <DayPlanList plan={c.day_plan} defaultOpen={i === 0} techName={c.tech_name} />
                    )}
                    {c.after_insert && (
                      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                        {c.after_insert.est_finish_min != null && (
                          <span>Finishes ~<span className="font-medium">{fmtTime(c.after_insert.est_finish_min)}</span></span>
                        )}
                        <span>Total stops: <span className="font-semibold">{c.after_insert.stops}</span> (+1 added)</span>
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
        {result.scheduling_note && (
          <p className="mt-2 text-xs">
            {result.note_manual ? "🛑" : "📌"} Scheduling note: <span className="italic">“{result.scheduling_note}”</span>
            {(result.note_rules?.length ?? 0) > 0 && <> — {result.note_rules!.join(" · ")}</>}
          </p>
        )}
      </div>
    </div>
  );
}


export default SlotFinder;
