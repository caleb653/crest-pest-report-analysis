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
};

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
  route_id?: number;
  tech_name: string;
  insertion_kind?: string;
  detour_min?: number;
  detour_miles?: number;
  /** Assumed-schedule extras: "stop 3 → stop 4 of 9" + minutes the rest of
      the day gets pushed back by this insertion. */
  fits_between?: string | null;
  push_delay_min?: number | null;
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

const DAY_MAP_STYLE = { width: "100%", height: "60vh" } as const;

// One day, EVERY tech's route on the same map — one color per tech.
function DayRoutesMap({ routes, colorFor }: {
  routes: { route: DayRoute; stops: RouteMapStop[] }[];
  colorFor: (tech: string) => string;
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
  return <DayRoutesMapInner routes={routes} colorFor={colorFor} apiKey={apiKey} />;
}

function DayRoutesMapInner({ routes, colorFor, apiKey }: {
  routes: { route: DayRoute; stops: RouteMapStop[] }[];
  colorFor: (tech: string) => string;
  apiKey: string;
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
    if (n === 0) return;
    map.fitBounds(bounds, 48);
    // Clamp: a sparse day (one stop) would otherwise zoom to house level.
    google.maps.event.addListenerOnce(map, "idle", () => {
      if ((map.getZoom() ?? 0) > 13) map.setZoom(13);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, dateKey]);

  if (loadError) return <div className="p-6 text-sm text-red-600">Failed to load Google Maps: {String(loadError)}</div>;
  if (!isLoaded) return <div className="p-6 text-sm text-muted-foreground">Loading map…</div>;

  return (
    <GoogleMap
      key={fitKey === "" ? "empty" : "map"}
      mapContainerStyle={DAY_MAP_STYLE}
      onLoad={setMap}
      options={{ streetViewControl: false, mapTypeControl: false, fullscreenControl: false, gestureHandling: "greedy" }}
    >
      {routes.map((r) => (
        <PolylineF
          key={`line-${r.route.route_id}`}
          path={r.stops
            .filter((s) => typeof s.lat === "number" && typeof s.lng === "number")
            .map((s) => ({ lat: s.lat as number, lng: s.lng as number }))}
          options={{ strokeColor: colorFor(r.route.tech_name), strokeOpacity: 0.7, strokeWeight: 3, geodesic: false }}
        />
      ))}
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
function RoutesOverviewCard({ dayRoutes, dates, loading, lookupLoading, onLookupDay }: {
  dayRoutes: DayRoute[];
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
  const date = pickedDate && dates.includes(pickedDate) ? pickedDate : dates[0];
  const routesForDate = dayRoutes.filter((r) => r.date === date);
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
                  onClick={() => setPickedDate(d)}>
                  {isoDayLabel(d)}
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
                  </button>
                );
              })}
              {routesForDate.length === 0 && (
                <p className="text-sm italic text-muted-foreground">
                  {lookupLoading ? "Loading routes…" : "No routes this day."}
                </p>
              )}
            </div>
            {visible.length > 0
              ? <DayRoutesMap routes={visible} colorFor={colorFor} />
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
      if (first) setResult(first);
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
              <DayMultiSelect options={dayOptions} selected={selectedDates} onChange={setSelectedDates} />
              <p className="text-xs text-muted-foreground">Next 3 working days are selected by default.</p>
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

      {/* Upcoming routes map — always BELOW the proposed slots so the
          recommendations are the first thing the office sees after a search. */}
      <div className="mt-6">
        <RoutesOverviewCard
          dayRoutes={[...(defaultRoutes ?? []), ...extraRoutes]}
          dates={[...new Set([...defaultDates, ...extraDates])].sort()}
          loading={routesLoading}
          lookupLoading={lookupLoading}
          onLookupDay={lookupDay}
        />
      </div>
    </>
  );
}

// Renders one find-slot result: the scheduling-note banner, the ★ Best Fit /
// 2nd Best summary, then a card per day with its SlotCards. Used once for a
// single-visit search and twice (Visit 1 + follow-up) for a follow-up plan.
function FindResultsView({
  result, windowWidth, scheduleContext, scheduleHint, visitLabel, dayAction, dayBadge,
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
}) {
  const byDay = result.by_day ?? [];
  return (
    <div className="space-y-6">
      {result.scheduling_note && (
        <div className={`rounded-md border-2 p-3 ${result.note_manual ? "border-red-500 bg-red-500/10" : "border-amber-500 bg-amber-500/10"}`}>
          <p className="text-sm font-semibold">
            {result.note_manual
              ? "🛑 Call to schedule — this customer's note says not to auto-book"
              : "📌 Scheduling note on this customer — days it forbids are already hidden"}
          </p>
          <p className="text-sm mt-1 italic">“{result.scheduling_note}”</p>
          {(result.note_rules?.length ?? 0) > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {result.note_rules!.map((r) => (
                <Badge key={r} variant="outline" className="border-amber-600 text-amber-700 dark:text-amber-400">{r}</Badge>
              ))}
            </div>
          )}
          {(result.note_blocked_dates?.length ?? 0) > 0 && (
            <p className="text-xs text-muted-foreground mt-2">
              Hidden by the note:{" "}
              {result.note_blocked_dates!.map((b) => `${b.date} — ${b.reason}`).join(" · ")}
            </p>
          )}
        </div>
      )}
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
        return (
          <div className="space-y-2">
            {top.map((r, i) => {
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
                    {r.c.est_min != null && (
                      <span className="text-muted-foreground"> · arrive ~{fmtTime(r.c.est_min)}</span>
                    )}
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
      {scheduleHint && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
          {scheduleHint}
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
          {c.note_time_conflict && (
            <Badge className="bg-amber-500 hover:bg-amber-500 text-white font-semibold">
              ⚠ {c.note_time_rule ?? "outside the note's time window"}
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
        const recLabel = bookWindowLabel(c, widthHours);
        const beforeCount = recKey && snap?.stops_by_window
          ? (snap.stops_by_window[recKey as keyof WindowCounts] ?? 0)
          : 0;
        const isCrowded = beforeCount >= 4;
        const DAILY_MAX_STOPS = 13;
        const afterTotal = after?.stops_excluding_tasks ?? 0;
        const isDayFull = afterTotal >= DAILY_MAX_STOPS;
        // Parse "stop 1 → stop 2 of 6" (or similar) so we can render a bold,
        // scannable "Insert between Stop # and Stop # of N" pill next to
        // Book in. Falls back gracefully if the backend string changes.
        const fb = c.fits_between || "";
        const fbMatch = fb.match(/stop\s*(\d+)\s*[→\-\/]+\s*stop\s*(\d+)\s*(?:of\s*(\d+))?/i);
        const prevIdx = fbMatch?.[1];
        const nextIdx = fbMatch?.[2];
        const totalIdx = fbMatch?.[3];
        const lastName = (full?: string | null) => {
          const s = (full || "").trim();
          if (!s) return "";
          const parts = s.split(/\s+/);
          return parts[parts.length - 1];
        };
        const prevLast = lastName(c.prev_stop?.customer_name);
        const nextLast = lastName(c.next_stop?.customer_name);
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
            {prevIdx && nextIdx && (
              <div className="inline-flex flex-wrap items-center gap-2 rounded-md border-2 border-foreground/80 bg-background px-3 py-2 shadow-sm">
                <span className="text-sm font-extrabold uppercase tracking-wide">
                  Insert between Stop {prevIdx} and Stop {nextIdx}
                  {totalIdx ? ` of ${totalIdx}` : ""}
                </span>
                {(prevLast || nextLast) && (
                  <span className="text-sm font-bold text-foreground/80 border-l border-foreground/20 pl-2">
                    {prevLast || "—"} → {nextLast || "—"}
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
            {after?.stops_excluding_tasks != null && (
              <span className="text-xs text-muted-foreground">{after.stops_excluding_tasks} stops after</span>
            )}
          </div>
        );
      })()}

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
                      <DetourBadge c={c} />
                    </div>
                    <div className="mt-2 text-xs text-muted-foreground">
                      Between <span className="font-medium text-foreground">{c.prev_stop?.customer_name}</span> ({c.prev_stop?.city})
                      {" → "}
                      <span className="font-medium text-foreground">{c.next_stop?.customer_name}</span> ({c.next_stop?.city})
                    </div>
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
