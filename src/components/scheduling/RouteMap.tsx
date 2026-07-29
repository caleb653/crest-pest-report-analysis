import { useEffect, useMemo, useState } from "react";
import { GoogleMap, MarkerF, PolylineF, InfoWindowF, useJsApiLoader } from "@react-google-maps/api";
import { supabase } from "@/integrations/supabase/client";

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
};

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

export default function RouteMap({ stops }: { stops: RouteMapStop[] }) {
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
  return <RouteMapInner stops={stops} apiKey={apiKey} />;
}

function RouteMapInner({ stops, apiKey }: { stops: RouteMapStop[]; apiKey: string }) {
  const { isLoaded, loadError } = useJsApiLoader({
    id: "route-map-script",
    googleMapsApiKey: apiKey,
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
  if (geocoded.length === 0) {
    return <div className="p-6 text-sm text-muted-foreground">No geocoded stops to map.</div>;
  }

  const path = geocoded.map((s) => ({ lat: s.lat as number, lng: s.lng as number }));
  const active = geocoded.find((s) => s.order === activeOrder) || null;

  const onLoad = (map: google.maps.Map) => {
    const bounds = new google.maps.LatLngBounds();
    path.forEach((p) => bounds.extend(p));
    map.fitBounds(bounds, 48);
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-full" style={{ background: "#4f46e5" }} /> proposed</span>
        <span className="inline-flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-full" style={{ background: "#059669" }} /> already scheduled</span>
        <span className="inline-flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-full" style={{ background: "#1f2937" }} /> locked</span>
        <span className="ml-auto">{geocoded.length} of {stops.length} stops mapped</span>
      </div>
      <GoogleMap mapContainerStyle={CONTAINER_STYLE} onLoad={onLoad} options={{ streetViewControl: false, mapTypeControl: false, fullscreenControl: false }}>
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
              {active.special_scheduling && (
                <div className="text-amber-700 font-medium">note: {active.special_scheduling}</div>
              )}
            </div>
          </InfoWindowF>
        )}
      </GoogleMap>
    </div>
  );
}