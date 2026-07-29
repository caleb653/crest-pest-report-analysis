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

const CONTAINER_STYLE = { width: "100%", height: "72vh" } as const;

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

function weekdayIdx(iso: string): number {
  return new Date(`${iso}T12:00:00`).getDay();
}
function dayColor(iso: string): string {
  return DAY_COLORS[weekdayIdx(iso)] || "#52514e";
}

// Small circle marker in the day color with a white ring — deliberately more
// compact than the single-day map's numbered pins, since a whole week of stops
// is on screen at once.
function dotIcon(color: string, highlight = false) {
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

export default function WeekRouteMap({ days }: { days: WeekRouteDay[] }) {
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
  return <WeekRouteMapInner days={days} apiKey={apiKey} />;
}

type ActiveStop = { routeKey: string; stop: RouteMapStop; day: WeekRouteDay };

function WeekRouteMapInner({ days, apiKey }: { days: WeekRouteDay[]; apiKey: string }) {
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

  const techDays = useMemo(
    () => days.filter((d) => (tech === "*" ? true : d.tech === tech)),
    [days, tech],
  );
  const dates = useMemo(
    () => [...new Set(techDays.map((d) => d.date))].sort(),
    [techDays],
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
    <div className="space-y-2">
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
              return (
                <button
                  key={date}
                  type="button"
                  onClick={() => toggleDate(date)}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium transition-opacity ${off ? "opacity-35" : ""}`}
                  style={{ borderColor: dayColor(date) }}
                  title={off ? "Show this day" : "Hide this day"}
                >
                  <span className="inline-block w-3 h-3 rounded-full border border-white shadow-sm" style={{ background: dayColor(date) }} />
                  {label} · {stopN}
                </button>
              );
            })}
          </div>
        );
      })}
      <div className="text-xs text-muted-foreground">
        {totalMapped} stops · {weeks.length > 1 ? "click a week to view it alone · " : ""}click a day to hide/show · click a dot for details
      </div>
      <GoogleMap
        mapContainerStyle={CONTAINER_STYLE}
        onLoad={setMap}
        options={{ streetViewControl: false, mapTypeControl: false, fullscreenControl: false }}
      >
        {routes.map((r) => (
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
                      icon: { path: "M 0,-1 0,1", strokeOpacity: 0.85, strokeWeight: 3, strokeColor: r.color },
                      offset: "0", repeat: "14px",
                    }],
                  }
                : { strokeOpacity: 0.75, strokeWeight: 3 }),
              geodesic: false,
            }}
          />
        ))}
        {routes.map((r) =>
          r.stops.map((s) => (
            <MarkerF
              key={`${r.key}-${s.order}`}
              position={{ lat: s.lat as number, lng: s.lng as number }}
              icon={dotIcon(r.color, active?.routeKey === r.key && active?.stop.order === s.order)}
              onClick={() => setActive({ routeKey: r.key, stop: s, day: r.day })}
              title={`${s.customer} — ${r.day.weekday} (${r.day.tech})`}
            />
          )),
        )}
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
            </div>
          </InfoWindowF>
        )}
      </GoogleMap>
    </div>
  );
}
