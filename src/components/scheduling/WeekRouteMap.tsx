import { useEffect, useMemo, useState } from "react";
import { GoogleMap, MarkerF, PolylineF, InfoWindowF, useJsApiLoader } from "@react-google-maps/api";
import { supabase } from "@/integrations/supabase/client";
import type { RouteMapStop } from "./RouteMap";

// Week-overview map: EVERY proposed route overlaid on one map, one color per
// weekday, so cross-day clustering is auditable at a glance — if two neighbors
// wear different colors, they're on different days and the plan deserves a
// second look. Complements RouteMap (single day, numbered stop order).
export type WeekRouteDay = {
  date: string;      // ISO yyyy-mm-dd
  weekday: string;   // "Mon" … "Sat"
  tech: string;
  stops: RouteMapStop[];
};

// Fills whatever height the parent gives it (the near-fullscreen week-map
// dialog); the flex-1 wrapper below provides the bounded box.
const CONTAINER_STYLE = { width: "100%", height: "100%" } as const;

// Categorical weekday palette — validated (CVD + normal-vision, all pairs)
// against a light map surface. Fixed weekday→hue assignment, never cycled, so
// Monday is the same blue on every run. Saturday is rare and additionally gets
// a dashed polyline as its secondary encoding.
const DAY_COLORS: Record<number, string> = {
  1: "#2a78d6", // Mon  blue
  2: "#c44113", // Tue  burnt orange
  3: "#1baf7a", // Wed  teal-green
  4: "#4a3aa7", // Thu  violet
  5: "#eda100", // Fri  yellow
  6: "#e87ba4", // Sat  magenta (dashed line)
};

export function weekdayIdx(iso: string): number {
  return new Date(`${iso}T12:00:00`).getDay();
}
export function dayColor(iso: string): string {
  return DAY_COLORS[weekdayIdx(iso)] || "#52514e";
}

// Small circle marker in the day color with a white ring — deliberately more
// compact than the single-day map's numbered pins, since a whole week of stops
// is on screen at once.
export function dotIcon(color: string, highlight = false) {
  const r = highlight ? 9 : 7;
  const size = r * 2 + 4;
  const c = size / 2;
  const svg = `<?xml version="1.0" encoding="UTF-8"?>` +
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">` +
    `<circle cx="${c}" cy="${c}" r="${r}" fill="${color}" stroke="#ffffff" stroke-width="2.5"/>` +
    `</svg>`;
  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: typeof google !== "undefined" ? new google.maps.Size(size, size) : undefined,
    anchor: typeof google !== "undefined" ? new google.maps.Point(c, c) : undefined,
  } as google.maps.Icon;
}

// One batch of map-initiated moves: stops (grouped by their source day) headed
// to `toDate`. The parent owns rule validation + the are-you-sure dialog.
export type MapMoveGroup = { fromDate: string; tech: string; stopKeys: string[] };

type WeekRouteMapProps = {
  days: WeekRouteDay[];
  /** Move the selected stops onto toDate (same tech per stop). */
  onMoveStops?: (moves: MapMoveGroup[], toDate: string) => void;
  /** Merge every shown tech's fromDate day into toDate (chip drag-and-drop). */
  onMergeDays?: (fromDate: string, toDate: string, techsShown: string[]) => void;
  /** ALL dates in the plan window — 0-stop days render as chips too, so a
   *  selection can be moved onto a day nobody visits yet. */
  windowDates?: string[];
};

export default function WeekRouteMap({ days, onMoveStops, onMergeDays, windowDates }: WeekRouteMapProps) {
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
  return <WeekRouteMapInner days={days} apiKey={apiKey} onMoveStops={onMoveStops}
                            onMergeDays={onMergeDays} windowDates={windowDates} />;
}

type ActiveStop = { routeKey: string; stop: RouteMapStop; day: WeekRouteDay };

// Identity for a stop inside its day — MUST match ScheduleReview's fillStopKey.
const mapStopKey = (s: RouteMapStop) =>
  `${(s as any).subscription_id || (s as any).customer_id}-${s.order}`;

const isMovableStop = (s: RouteMapStop) =>
  !s.locked && !s.already_scheduled && !(s as any).notification_sent
  && !(s as any).pushed_to_fr;

// Keep in sync with the engine's TOLERANCE_BY_FREQ (and ScheduleReview's
// TOL_BY_FREQ): how many days a visit may slip from its due date.
const TOL_BY_FREQ: Record<number, number> = { 30: 5, 60: 10, 90: 14 };

const milesBetween = (lat1: number, lng1: number, lat2: number, lng2: number) => {
  const r = Math.PI / 180;
  const a = Math.sin(((lat2 - lat1) * r) / 2) ** 2
    + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(((lng2 - lng1) * r) / 2) ** 2;
  return 2 * 3958.8 * Math.asin(Math.sqrt(a));
};

function WeekRouteMapInner({ days, apiKey, onMoveStops, onMergeDays, windowDates }: WeekRouteMapProps & { apiKey: string }) {
  const { isLoaded, loadError } = useJsApiLoader({
    id: "route-map-script",
    googleMapsApiKey: apiKey,
  });

  const techs = useMemo(
    () => [...new Set(days.map((d) => d.tech))].sort(),
    [days],
  );
  // One tech at a time by default: each tech has their own territory, and the
  // question this map answers — "are the closest people on the same day?" —
  // is per-tech. "All" stays available for the fleet-wide view.
  const [tech, setTech] = useState<string>(techs.length === 1 ? techs[0] : techs[0] ?? "");
  const [hiddenDates, setHiddenDates] = useState<Set<string>>(new Set());
  const [active, setActive] = useState<ActiveStop | null>(null);
  const [map, setMap] = useState<google.maps.Map | null>(null);
  // Stops the office has picked to re-arrange: `${routeKey}#${stopKey}` →
  // enough identity to hand the parent a move request per source day.
  const [selected, setSelected] = useState<Map<string, ActiveStop>>(new Map());
  const [dragDate, setDragDate] = useState<string | null>(null);
  const [dragOverDate, setDragOverDate] = useState<string | null>(null);
  // Hovering a day chip while exploring a single selected stop previews that
  // day's route at full strength on the faded map.
  const [previewDate, setPreviewDate] = useState<string | null>(null);

  const techDays = useMemo(
    () => days.filter((d) => (tech === "*" ? true : d.tech === tech)),
    [days, tech],
  );
  const dates = useMemo(
    () => [...new Set([...techDays.map((d) => d.date), ...(windowDates ?? [])])].sort(),
    [techDays, windowDates],
  );
  // Group dates into Mon-Sun weeks, keyed by each week's Monday.
  const weeks = useMemo(() => {
    const byMonday = new Map<string, string[]>();
    for (const date of dates) {
      const d = new Date(`${date}T12:00:00`);
      d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
      const monday = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      if (!byMonday.has(monday)) byMonday.set(monday, []);
      byMonday.get(monday)!.push(date);
    }
    return [...byMonday.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([monday, weekDates]) => ({ monday, weekDates }));
  }, [dates]);
  const visibleDays = techDays.filter((d) => !hiddenDates.has(d.date));

  type Route = { key: string; day: WeekRouteDay; stops: RouteMapStop[]; color: string };
  const routes: Route[] = useMemo(
    () =>
      visibleDays.map((d) => ({
        key: `${d.date}|${d.tech}`,
        day: d,
        stops: [...d.stops]
          .filter((s) => typeof s.lat === "number" && typeof s.lng === "number")
          .sort((a, b) => a.order - b.order),
        color: dayColor(d.date),
      })),
    [visibleDays],
  );

  // Fit once per tech switch (not on day toggles — refitting on every legend
  // click makes the map jump around while you're comparing days).
  useEffect(() => {
    if (!map) return;
    const bounds = new google.maps.LatLngBounds();
    let n = 0;
    for (const r of routes) for (const s of r.stops) {
      bounds.extend({ lat: s.lat as number, lng: s.lng as number });
      n++;
    }
    if (n > 0) map.fitBounds(bounds, 48);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, tech]);

  // A tech switch invalidates the selection (it references the old routes).
  useEffect(() => { setSelected(new Map()); setActive(null); setPreviewDate(null); }, [tech]);

  // ── "Where else could this stop go?" explorer ─────────────────────────────
  // Active when EXACTLY ONE stop is selected: for every day chip we compute
  // (a) is the day inside the stop's due-date tolerance, and (b) the distance
  // to the nearest stop already riding that day for the SAME tech — the
  // human-readable answer to "which other day has something really close?".
  const explore = useMemo(() => {
    if (selected.size !== 1) return null;
    const a = [...selected.values()][0];
    const s = a.stop as any;
    if (typeof s.lat !== "number" || typeof s.lng !== "number") return null;
    const due = s.due_date ? new Date(`${s.due_date}T12:00:00`).getTime() : null;
    const tol = TOL_BY_FREQ[s.frequency] ?? 14;
    const byDate = new Map<string, { legal: boolean; minMi: number | null }>();
    for (const date of dates) {
      let legal = true;
      if (due != null) {
        const off = Math.round((new Date(`${date}T12:00:00`).getTime() - due) / 86400000);
        legal = Math.abs(off) <= tol;
      }
      let minMi: number | null = null;
      for (const d of techDays) {
        if (d.date !== date || d.tech !== a.day.tech) continue;
        for (const x of d.stops) {
          if (typeof x.lat !== "number" || typeof x.lng !== "number") continue;
          if (d.date === a.day.date && x.order === a.stop.order) continue; // itself
          const mi = milesBetween(s.lat, s.lng, x.lat as number, x.lng as number);
          if (minMi == null || mi < minMi) minMi = mi;
        }
      }
      byDate.set(date, { legal, minMi });
    }
    return { anchor: a, tol, byDate };
  }, [selected, dates, techDays]);

  if (loadError) {
    return <div className="p-6 text-sm text-red-600">Failed to load Google Maps: {String(loadError)}</div>;
  }
  if (!isLoaded) {
    return <div className="p-6 text-sm text-muted-foreground">Loading map…</div>;
  }

  const toggleDate = (date: string) =>
    setHiddenDates((cur) => {
      const next = new Set(cur);
      if (next.has(date)) next.delete(date); else next.add(date);
      return next;
    });

  const toggleSelect = (a: ActiveStop) =>
    setSelected((cur) => {
      const next = new Map(cur);
      const k = `${a.routeKey}#${mapStopKey(a.stop)}`;
      if (next.has(k)) next.delete(k); else next.set(k, a);
      return next;
    });

  // Hand the selection to the parent as per-source-day groups; the parent
  // validates the scheduling rules and runs the are-you-sure dialog.
  const moveSelectionTo = (toDate: string) => {
    if (!onMoveStops || selected.size === 0) return;
    const groups = new Map<string, MapMoveGroup>();
    for (const a of selected.values()) {
      if (a.day.date === toDate) continue;
      const gk = `${a.day.date}|${a.day.tech}`;
      if (!groups.has(gk)) groups.set(gk, { fromDate: a.day.date, tech: a.day.tech, stopKeys: [] });
      groups.get(gk)!.stopKeys.push(mapStopKey(a.stop));
    }
    if (groups.size) onMoveStops([...groups.values()], toDate);
    setSelected(new Map());
    setActive(null);
    setPreviewDate(null);
  };

  // A multi-week run stacks every week's routes over the same territory —
  // even a perfect month reads as spaghetti. Week rows let you judge the plan
  // the way it's driven: one week at a time.
  const isolateWeek = (weekDates: string[], currentlyIsolated: boolean) =>
    setHiddenDates(currentlyIsolated
      ? new Set()
      : new Set(dates.filter((d) => !weekDates.includes(d))));

  const totalMapped = routes.reduce((s, r) => s + r.stops.length, 0);
  const chip = (selected: boolean) =>
    `px-2.5 py-1 rounded-full border text-xs font-medium transition-colors ${
      selected ? "bg-foreground text-background border-foreground"
               : "bg-background text-foreground border-border hover:bg-muted"}`;

  return (
    <div className="flex flex-col gap-2 h-full min-h-[72vh]">
      {techs.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {techs.map((t) => (
            <button key={t} type="button" className={chip(tech === t)} onClick={() => setTech(t)}>
              {t}
            </button>
          ))}
          <button type="button" className={chip(tech === "*")} onClick={() => setTech("*")}>
            All techs
          </button>
        </div>
      )}
      {weeks.map(({ monday, weekDates }) => {
        const isolated = dates.every((d) => weekDates.includes(d) !== hiddenDates.has(d));
        const weekLabel = new Date(`${monday}T12:00:00`).toLocaleDateString(undefined, {
          month: "numeric", day: "numeric",
        });
        return (
          <div key={monday} className="flex flex-wrap items-center gap-1.5">
            {weeks.length > 1 && (
              <button
                type="button"
                onClick={() => isolateWeek(weekDates, isolated)}
                className={chip(isolated)}
                title={isolated ? "Show all weeks" : "Show only this week"}
              >
                Wk {weekLabel}
              </button>
            )}
            {weekDates.map((date) => {
              const off = hiddenDates.has(date);
              const stopN = techDays.filter((d) => d.date === date)
                .reduce((s, d) => s + d.stops.length, 0);
              const label = new Date(`${date}T12:00:00`).toLocaleDateString(undefined, {
                weekday: "short", month: "numeric", day: "numeric",
              });
              const moveTarget = selected.size > 0;
              const dropTarget = dragOverDate === date && dragDate && dragDate !== date;
              // Explorer verdict for this chip (single stop selected).
              const exp = explore?.byDate.get(date);
              const isOwnDay = explore != null && explore.anchor.day.date === date;
              const mi = exp?.minMi;
              const miTone = mi == null ? "" : mi < 1.5 ? "text-emerald-700 font-bold"
                : mi < 4 ? "text-amber-700 font-semibold" : "text-muted-foreground";
              const expClass = explore == null ? ""
                : isOwnDay ? "ring-2 ring-foreground/60"
                : exp?.legal ? "ring-2 ring-primary shadow-sm"
                : "opacity-25";
              return (
                <button
                  key={date}
                  type="button"
                  draggable={!!onMergeDays}
                  onDragStart={(e) => { setDragDate(date); e.dataTransfer.effectAllowed = "move"; }}
                  onDragEnd={() => { setDragDate(null); setDragOverDate(null); }}
                  onDragOver={(e) => { if (dragDate && dragDate !== date) { e.preventDefault(); setDragOverDate(date); } }}
                  onDragLeave={() => setDragOverDate((cur) => (cur === date ? null : cur))}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (onMergeDays && dragDate && dragDate !== date) {
                      onMergeDays(dragDate, date, tech === "*" ? techs : [tech]);
                    }
                    setDragDate(null); setDragOverDate(null);
                  }}
                  onMouseEnter={() => { if (explore) setPreviewDate(date); }}
                  onMouseLeave={() => setPreviewDate((cur) => (cur === date ? null : cur))}
                  onClick={() => (moveTarget ? moveSelectionTo(date) : toggleDate(date))}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium transition-all ${off && !moveTarget ? "opacity-35" : ""} ${dropTarget ? "ring-2 ring-primary" : ""} ${explore == null && moveTarget ? "ring-1 ring-primary/50" : ""} ${expClass}`}
                  style={{ borderColor: dayColor(date) }}
                  title={explore
                    ? (isOwnDay ? "Current day for the selected stop"
                      : exp?.legal
                        ? `Move here${mi != null ? ` — nearest stop ${mi.toFixed(1)} mi away` : " — day is empty"} (hover to preview)`
                        : `Outside the ±${explore.tol}-day window for this customer — moving here needs an override`)
                    : moveTarget
                      ? `Move ${selected.size} selected stop${selected.size === 1 ? "" : "s"} to ${label}`
                      : onMergeDays
                        ? (off ? "Show this day · drag onto another day to combine" : "Hide this day · drag onto another day to combine")
                        : (off ? "Show this day" : "Hide this day")}
                >
                  <span className="inline-block w-3 h-3 rounded-full border border-white shadow-sm" style={{ background: dayColor(date) }} />
                  {label} · {stopN}
                  {explore != null && !isOwnDay && exp?.legal && (
                    <span className={miTone}>{mi != null ? `${mi.toFixed(1)}mi` : "empty"}</span>
                  )}
                </button>
              );
            })}
          </div>
        );
      })}
      {selected.size > 0 ? (
        <div className="flex items-center gap-2 text-xs font-medium bg-primary/10 border border-primary/30 rounded-md px-2.5 py-1.5 flex-wrap">
          {explore ? (
            <span>
              <span className="font-semibold">{(explore.anchor.stop as any).customer}</span> selected —
              highlighted chips are days it can legally join (with distance to that day's nearest stop);
              hover a chip to preview the route, click to move. Dimmed days are outside its ±{explore.tol}-day window.
            </span>
          ) : (
            <span>{selected.size} stops selected — click a day chip to move them there</span>
          )}
          <button type="button" className="underline text-muted-foreground hover:text-foreground"
                  onClick={() => { setSelected(new Map()); setPreviewDate(null); }}>
            Clear
          </button>
        </div>
      ) : (
        <div className="text-xs text-muted-foreground">
          {totalMapped} stops · {weeks.length > 1 ? "click a week to view it alone · " : ""}click a day to hide/show · click a dot for details
          {onMoveStops ? " or to select it for a move" : ""}{onMergeDays ? " · drag one day chip onto another to combine those days" : ""}
        </div>
      )}
      <div className="flex-1 min-h-0">
      <GoogleMap
        mapContainerStyle={CONTAINER_STYLE}
        onLoad={setMap}
        options={{ streetViewControl: false, mapTypeControl: false, fullscreenControl: false,
                   gestureHandling: "greedy" }}
      >
        {routes.map((r) => {
          // Explorer fading: the hovered candidate day pops to full strength,
          // legal candidates stay readable, everything else fades to a ghost.
          const emphasis = !explore ? 1
            : previewDate === r.day.date ? 1
            : r.key === explore.anchor.routeKey ? 0.55
            : explore.byDate.get(r.day.date)?.legal ? 0.3
            : 0.07;
          return (
          <PolylineF
            key={`line-${r.key}`}
            path={r.stops.map((s) => ({ lat: s.lat as number, lng: s.lng as number }))}
            options={{
              strokeColor: r.color,
              // Saturday's secondary encoding: dashed instead of solid.
              ...(weekdayIdx(r.day.date) === 6
                ? {
                    strokeOpacity: 0,
                    icons: [{
                      icon: { path: "M 0,-1 0,1", strokeOpacity: 0.85 * emphasis, strokeWeight: 3, strokeColor: r.color },
                      offset: "0", repeat: "14px",
                    }],
                  }
                : { strokeOpacity: 0.75 * emphasis,
                    strokeWeight: explore && previewDate === r.day.date ? 5 : 3 }),
              geodesic: false,
            }}
          />
          );
        })}
        {routes.map((r) => {
          const emphasis = !explore ? 1
            : previewDate === r.day.date ? 1
            : r.key === explore.anchor.routeKey ? 0.55
            : explore.byDate.get(r.day.date)?.legal ? 0.35
            : 0.1;
          return r.stops.map((s) => {
            const isSel = selected.has(`${r.key}#${mapStopKey(s)}`);
            return (
            <MarkerF
              key={`${r.key}-${s.order}`}
              position={{ lat: s.lat as number, lng: s.lng as number }}
              icon={dotIcon(r.color,
                (active?.routeKey === r.key && active?.stop.order === s.order) || isSel)}
              opacity={isSel ? 1 : emphasis}
              onClick={() => setActive({ routeKey: r.key, stop: s, day: r.day })}
              title={`${s.customer} — ${r.day.weekday} (${r.day.tech})`}
            />
            );
          });
        })}
        {active && (
          <InfoWindowF
            position={{ lat: active.stop.lat as number, lng: active.stop.lng as number }}
            onCloseClick={() => setActive(null)}
          >
            <div className="text-xs space-y-0.5 max-w-[240px]">
              <div className="font-semibold text-sm">{active.stop.customer}</div>
              <div>
                <span className="inline-block w-2.5 h-2.5 rounded-full mr-1 align-middle" style={{ background: dayColor(active.day.date) }} />
                {new Date(`${active.day.date}T12:00:00`).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}
                {" · "}stop #{active.stop.order}
                {tech === "*" ? <> · {active.day.tech}</> : null}
              </div>
              {active.stop.service_label && (
                <div className="font-medium">{active.stop.service_label}</div>
              )}
              {(active.stop.address || active.stop.city) && (
                <div className="text-muted-foreground">
                  {[active.stop.address, active.stop.city].filter(Boolean).join(", ")}
                </div>
              )}
              {(active.stop.eta || active.stop.window) && (
                <div>{active.stop.eta}{active.stop.eta && active.stop.window ? " · " : ""}{active.stop.window}</div>
              )}
              {active.stop.special_scheduling && (
                <div className="text-amber-700 font-medium">note: {active.stop.special_scheduling}</div>
              )}
              {active.stop.locked ? <div className="text-muted-foreground">locked appointment</div>
                : active.stop.already_scheduled ? <div className="text-muted-foreground">already scheduled</div>
                : null}
              {onMoveStops && (isMovableStop(active.stop) ? (
                <button
                  type="button"
                  className="mt-1 w-full rounded border border-primary/50 bg-primary/10 px-2 py-1 font-medium hover:bg-primary/20"
                  onClick={() => { toggleSelect(active); }}
                >
                  {selected.has(`${active.routeKey}#${mapStopKey(active.stop)}`)
                    ? "Unselect"
                    : "Select to move — then click a day chip"}
                </button>
              ) : (
                <div className="text-muted-foreground italic">booked in FieldRoutes — can't be moved here</div>
              ))}
            </div>
          </InfoWindowF>
        )}
      </GoogleMap>
      </div>
    </div>
  );
}
