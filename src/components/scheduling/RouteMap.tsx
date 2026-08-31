import { useEffect, useMemo, useState } from "react";
import { GoogleMap, MarkerF, PolylineF, InfoWindowF, useJsApiLoader } from "@react-google-maps/api";
import { lastServiceLabel, lastServiceDate } from "@/lib/lastService";
import { supabase } from "@/integrations/supabase/client";
import { GMAPS_LIBRARIES } from "./WeekRouteMap";

// Shape we need off each stop. Keeps this component reusable for the Fill
// day card AND the Schedule-Review route card — both expose `stops[]` with
// the same essential fields. Anything optional can be undefined.
export type RouteMapStop = {
  order: number;
  lat?: number | null;
  lng?: number | null;
  customer: string;
  address?: string;
  city?: string;
  eta?: string;
  window?: string;
  service_label?: string;
  drive_from_prev_min?: number;
  already_scheduled?: boolean;
  locked?: boolean;
  special_scheduling?: string | null;
  subscription_id?: string;
  notification_sent?: boolean;
  pushed_to_fr?: boolean;
  /** Cadence context for the info card (Caleb 2026-08-30: "show the last
   *  date of service and expected due date"): last COMPLETED visit — (I) when
   *  it was the initial — the engine's due date, and the ± flexibility. */
  due_date?: string | null;
  last_completed?: string | null;
  last_is_initial?: boolean | null;
  tolerance?: number | null;
  frequency?: number | null;
};

/** "last svc 8/12/26 (I) · due 9/23/26 (±5d)" — null when neither date is known. */
export function serviceDatesLine(s: RouteMapStop): string | null {
  const parts: string[] = [];
  const last = lastServiceLabel(s);
  if (last) parts.push(last);
  if (s.due_date) {
    parts.push(`due ${lastServiceDate(s.due_date)}${typeof s.tolerance === "number" ? ` (±${s.tolerance}d)` : ""}`);
  }
  return parts.length ? parts.join(" · ") : null;
}

// A stop the office can still act on from the map (push / remove): a planner
// proposal that isn't booked, locked, notified, or already queued.
export function isActionableStop(s: RouteMapStop, queuedIds?: Set<string>): boolean {
  return !!s.subscription_id && !s.locked && !s.already_scheduled
    && !s.notification_sent && !s.pushed_to_fr
    && !(queuedIds?.has(s.subscription_id));
}

const CONTAINER_STYLE = { width: "100%", height: "70vh" } as const;

function colorFor(s: RouteMapStop): string {
  if (s.locked) return "#1f2937";              // slate-800
  if (s.already_scheduled) return "#059669";   // emerald-600
  return "#4f46e5";                            // indigo-600 (proposed)
}

// Inline data-URL SVG pin so we can color it per stop and put the order
// number inside via a Marker `label`. Anchor at the pin tip.
function pinIcon(color: string) {
  const svg = `<?xml version="1.0" encoding="UTF-8"?>` +
    `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="48" viewBox="0 0 36 48">` +
    `<path fill="${color}" stroke="#ffffff" stroke-width="2" d="M18 1c-8.8 0-16 7-16 15.6 0 11.7 14.3 28.2 15 29 .5.6 1.5.6 2 0 .7-.8 15-17.3 15-29C34 8 26.8 1 18 1z"/>` +
    `<circle cx="18" cy="16" r="11" fill="${color}"/>` +
    `</svg>`;
  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: typeof google !== "undefined" ? new google.maps.Size(36, 48) : undefined,
    anchor: typeof google !== "undefined" ? new google.maps.Point(18, 46) : undefined,
    labelOrigin: typeof google !== "undefined" ? new google.maps.Point(18, 16) : undefined,
  } as google.maps.Icon;
}

type RouteMapActions = {
  /** Queue this stop's FieldRoutes write (same paced push as the card button). */
  onPushStop?: (s: RouteMapStop) => void;
  /** Remove this stop from the day — off the route AND this map. */
  onRemoveStop?: (s: RouteMapStop) => void;
  /** Subscriptions already queued this session (greys out the push button). */
  queuedIds?: Set<string>;
};

/** A prospective stop to overlay on the route (Slot Finder: "where would this
    land?"). Drawn as a distinct pin with dashed connectors to the stops it
    would slot between — pure client-side drawing, no API calls. */
export type CandidateOverlay = {
  lat: number;
  lng: number;
  /** Pin label, e.g. "NEW". */
  label?: string;
  /** Tooltip-ish caption under the pin when tapped. */
  caption?: string;
  prev?: { lat: number; lng: number } | null;
  next?: { lat: number; lng: number } | null;
};

export default function RouteMap({ stops, candidate, onPushStop, onRemoveStop, queuedIds }:
  { stops: RouteMapStop[]; candidate?: CandidateOverlay | null } & RouteMapActions) {
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
  return <RouteMapInner stops={stops} candidate={candidate} apiKey={apiKey} onPushStop={onPushStop}
                        onRemoveStop={onRemoveStop} queuedIds={queuedIds} />;
}

function RouteMapInner({ stops, candidate, apiKey, onPushStop, onRemoveStop, queuedIds }:
                       { stops: RouteMapStop[]; candidate?: CandidateOverlay | null; apiKey: string } & RouteMapActions) {
  const { isLoaded, loadError } = useJsApiLoader({
    id: "route-map-script",
    googleMapsApiKey: apiKey,
    libraries: GMAPS_LIBRARIES,
  });
  const [activeOrder, setActiveOrder] = useState<number | null>(null);

  const geocoded = useMemo(
    () =>
      [...stops]
        .filter((s) => typeof s.lat === "number" && typeof s.lng === "number")
        .sort((a, b) => a.order - b.order),
    [stops],
  );

  if (loadError) {
    return <div className="p-6 text-sm text-red-600">Failed to load Google Maps: {String(loadError)}</div>;
  }
  if (!isLoaded) {
    return <div className="p-6 text-sm text-muted-foreground">Loading map…</div>;
  }
  if (geocoded.length === 0 && !candidate) {
    return <div className="p-6 text-sm text-muted-foreground">No geocoded stops to map.</div>;
  }

  const path = geocoded.map((s) => ({ lat: s.lat as number, lng: s.lng as number }));
  const active = geocoded.find((s) => s.order === activeOrder) || null;

  const onLoad = (map: google.maps.Map) => {
    const bounds = new google.maps.LatLngBounds();
    path.forEach((p) => bounds.extend(p));
    if (candidate) bounds.extend({ lat: candidate.lat, lng: candidate.lng });
    map.fitBounds(bounds, 48);
    // A 1-stop route (or tight cluster) makes fitBounds dive to house level —
    // clamp the initial zoom to a neighborhood view. User can still zoom in.
    google.maps.event.addListenerOnce(map, "idle", () => {
      if ((map.getZoom() ?? 0) > 13) map.setZoom(13);
    });
  };

  // Dashed connector legs prev → candidate → next ("the detour"). Drawn with
  // Maps' dash-symbol trick: an invisible stroke that repeats a short line icon.
  const DASH: google.maps.PolylineOptions = {
    strokeOpacity: 0,
    icons: [{
      icon: { path: "M 0,-1 0,1", strokeOpacity: 0.9, strokeColor: "#e11d48", strokeWeight: 3, scale: 3 } as google.maps.Symbol,
      offset: "0", repeat: "14px",
    }],
  };
  const candidateLegs: { lat: number; lng: number }[][] = [];
  if (candidate) {
    if (candidate.prev) candidateLegs.push([{ lat: candidate.prev.lat, lng: candidate.prev.lng }, { lat: candidate.lat, lng: candidate.lng }]);
    if (candidate.next) candidateLegs.push([{ lat: candidate.lat, lng: candidate.lng }, { lat: candidate.next.lat, lng: candidate.next.lng }]);
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-full" style={{ background: "#4f46e5" }} /> proposed</span>
        <span className="inline-flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-full" style={{ background: "#059669" }} /> already scheduled</span>
        <span className="inline-flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-full" style={{ background: "#1f2937" }} /> locked</span>
        {candidate && (
          <span className="inline-flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-full" style={{ background: "#e11d48" }} /> new stop</span>
        )}
        <span className="ml-auto">{geocoded.length} of {stops.length} stops mapped</span>
      </div>
      <GoogleMap mapContainerStyle={CONTAINER_STYLE} onLoad={onLoad} options={{ streetViewControl: false, mapTypeControl: false, fullscreenControl: false, gestureHandling: "greedy" }}>
        <PolylineF
          path={path}
          options={{ strokeColor: "#4f46e5", strokeOpacity: 0.7, strokeWeight: 3, geodesic: false }}
        />
        {geocoded.map((s) => (
          <MarkerF
            key={s.order}
            position={{ lat: s.lat as number, lng: s.lng as number }}
            icon={pinIcon(colorFor(s))}
            // String label supports multi-character — Static Maps does NOT.
            label={{ text: String(s.order), color: "#ffffff", fontWeight: "700", fontSize: "12px" }}
            onClick={() => setActiveOrder(s.order)}
            zIndex={s.order}
          />
        ))}
        {candidateLegs.map((leg, i) => (
          <PolylineF key={`cand-leg-${i}`} path={leg} options={DASH} />
        ))}
        {candidate && (
          <MarkerF
            position={{ lat: candidate.lat, lng: candidate.lng }}
            icon={pinIcon("#e11d48")}
            label={{ text: candidate.label || "NEW", color: "#ffffff", fontWeight: "700", fontSize: "10px" }}
            zIndex={9999}
            title={candidate.caption || "New stop"}
          />
        )}
        {active && (
          <InfoWindowF
            position={{ lat: active.lat as number, lng: active.lng as number }}
            onCloseClick={() => setActiveOrder(null)}
          >
            <div className="text-xs space-y-0.5 max-w-[240px]">
              <div className="font-semibold text-sm">#{active.order} {active.customer}</div>
              {(active.address || active.city) && (
                <div className="text-muted-foreground">{[active.address, active.city].filter(Boolean).join(", ")}</div>
              )}
              {(active.eta || active.window) && (
                <div>{active.eta}{active.eta && active.window ? " · " : ""}{active.window}</div>
              )}
              {active.service_label && <div className="text-muted-foreground">{active.service_label}</div>}
              {typeof active.drive_from_prev_min === "number" && active.order > 1 && (
                <div className="text-muted-foreground">+{active.drive_from_prev_min} min drive from previous</div>
              )}
              {serviceDatesLine(active) && (
                <div className="text-muted-foreground" title="Last completed visit — (I) = it was the initial — and the engine's due date with its ± flexibility">
                  {serviceDatesLine(active)}
                </div>
              )}
              {active.special_scheduling && (
                <div className="text-amber-700 font-medium">note: {active.special_scheduling}</div>
              )}
              {active.pushed_to_fr || (active.subscription_id && queuedIds?.has(active.subscription_id)) ? (
                <div className="text-muted-foreground italic">pushed to FieldRoutes</div>
              ) : isActionableStop(active, queuedIds) ? (
                <div className="flex gap-1 mt-1">
                  {onPushStop && (
                    <button
                      type="button"
                      className="flex-1 rounded border border-indigo-400 bg-indigo-50 px-2 py-1 font-medium text-indigo-700 hover:bg-indigo-100"
                      onClick={() => onPushStop(active)}
                    >
                      Push to FR
                    </button>
                  )}
                  {onRemoveStop && (
                    <button
                      type="button"
                      className="flex-1 rounded border border-red-300 bg-red-50 px-2 py-1 font-medium text-red-700 hover:bg-red-100"
                      onClick={() => { setActiveOrder(null); onRemoveStop(active); }}
                    >
                      Remove from route
                    </button>
                  )}
                </div>
              ) : null}
            </div>
          </InfoWindowF>
        )}
      </GoogleMap>
    </div>
  );
}