# Lovable spec — Route Map preview (numbered markers)

Paste this into Lovable. Goal: on each Fill / Schedule-Review route card, add a
**"View map"** button that opens an interactive Google Map plotting that day's
stops as **numbered markers (1, 2, 3, …) in service order**, with the tech's
route drawn between them.

## Data is already there — no backend change needed

The Fill API (`/api/fill-schedule`, proxied by the `scheduling-fill` edge fn)
returns `proposed[]`, one object per tech-day. Each has a `stops[]` array already
ordered for the route. Per-stop fields you need:

| field | meaning |
|---|---|
| `order` | 1-based service position → the marker NUMBER |
| `lat`, `lng` | marker coordinates (numbers; may be `null` if a stop never geocoded — skip those) |
| `customer` | name for the marker popup |
| `address`, `city` | popup subtitle |
| `eta` | e.g. `"9:25 AM"` — show in popup |
| `window` | e.g. `"8-12"` or `"8:00–9:00"` |
| `service_label` | service description |
| `drive_from_prev_min` | drive minutes from the previous stop |
| `already_scheduled` | `true` = existing booked appt (color differently from proposed) |
| `locked` | `true` = locked appt (cannot move) |

Per-day fields on each `proposed[]` object: `date`, `weekday`, `tech`, `zone`,
`stop_count`, `route_id`, and `summary` (`efficiency_pct`, `drive_min`,
`est_start`, `est_finish`, `total_hours`, `production`). Schedule-Review routes
expose the same `stops[]` shape, so the component is reusable there.

## Implementation

1. **Add the Maps JS key.** Create a **browser** Google Maps JavaScript API key
   (restrict it by HTTP referrer to the Lovable/app domain — it's public-by-design,
   so referrer restriction is the protection). Add it as `VITE_GOOGLE_MAPS_KEY`
   in Lovable env. (Do NOT reuse the Cloud Run geocoding key — that one is
   server-side and must never ship to the browser.)

2. **Install** `@react-google-maps/api`.

3. **Build `<RouteMap stops={day.stops} />`** (new file, e.g.
   `src/components/scheduling/RouteMap.tsx`):
   - `useJsApiLoader({ googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_KEY })`.
   - Filter to `stops.filter(s => s.lat != null && s.lng != null)`.
   - Fit bounds to all stop coords (`new google.maps.LatLngBounds()` + `map.fitBounds`).
   - One `<MarkerF>` per stop with a **numbered label** = `String(s.order)`.
     Use `label: { text: String(s.order), color: "#fff", fontWeight: "700" }`.
     **Do NOT use the Static Maps API** — its marker labels allow only ONE
     character, so stop 10+ breaks. The interactive JS map labels handle any number.
   - Color markers by state: proposed = brand blue; `already_scheduled` = green;
     `locked` = dark/gray. (Matches the existing card legend in ScheduleReview.)
   - Draw the route line: a single `<PolylineF path={orderedLatLngs} />` connecting
     stops in `order`. Optionally start/end at nothing (home base isn't returned).
   - `<InfoWindowF>` on marker click showing: `#{order} {customer}` /
     `{address}, {city}` / `{eta} · {window}` / `{service_label}` /
     `+{drive_from_prev_min} min drive`.

4. **Wire the button.** On each route card in
   [src/pages/ScheduleReview.tsx](src/pages/ScheduleReview.tsx) (the Fill day card
   and the Schedule-Review route card), add a "View map" button that opens a
   dialog/sheet rendering `<RouteMap stops={day.stops} />`. Header: `{tech} ·
   {weekday} {date} · {stop_count} stops · {summary.efficiency_pct}% efficient`.

## Acceptance

- Markers numbered 1…N in service order, including past stop 9 (proves it's the JS
  map, not Static Maps).
- Proposed vs. existing vs. locked stops are visually distinct.
- Clicking a marker shows customer + ETA + window + drive time.
- Backtracks (a route that jumps across cities and comes back) are visually
  obvious — this is also our diagnostic for the routing-efficiency work.

## Notes

- Frontend + edge fns go live only when Lovable **builds/publishes** (git push
  alone won't deploy). Always `git fetch` + rebase before pushing.
- No new edge fn or Cloud Run change is required for this feature — it's pure
  frontend over data the Fill/Review APIs already return.
