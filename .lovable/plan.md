# Commercial Portal Overhaul Plan

The commercial portal (`CommercialDashboardView` / `CommercialPMView`) needs to match the admin portal (`PropertyDashboard`) look-and-feel, plus a long list of feedback items. This is large — ~10K lines of relevant code — so I want to confirm scope and sequence before writing.

## 1. Visual parity with Admin Portal
- Reuse the same shells, headers, card styles, spacing, and tab layout from `PropertyDashboard` for the commercial view.
- Wrap **Upcoming Services** (and other dense sections) in bordered cards so Route Managers can scan quickly.

## 2. Upcoming Services tab
- Remove the separate **Open Report** button — render the report inline.
- Reorder report sections to:
  1. Recent Pest Sightings
  2. Service Notes
  3. Target Pests
  4. Product Used
  5. Equipment Used
  6. Active Conditions (renamed from "Concerns Observed")
  7. Other Property Images
- "Active Conditions" inline editor laid out like the Units grid in the Apartment app.
- **Require a photo** to save a new Condition.

## 3. Previous Services tab
- Same treatment: remove the separate Report button, show the report inline.

## 4. Photos
- Fix wide-photo cropping (use `object-contain` or aspect-aware container instead of fixed wide crop).

## 5. Pest Sightings workflow
- Customer submits sighting → **Open Requests** (already works).
- When Crest replies → moves to **Closed Requests**, shows "Crest Response", reported & closed dates.
- On Upcoming Service report, auto-populate a **Recent Pest Sightings** section listing Open / In-Progress sightings.
- Crest can comment and change status (Open / In Progress / Closed).
- Closed sightings drop off the next report.

## 6. Conditions workflow
- Route Manager adds Condition (with required photo) on a service report.
- Auto-flows into **Active Conditions** of next report.
- Status togglable Active → Closed with proof photo.
- New **Conditions tab** with two sections: Active, Closed. Show location, condition, severity, date identified, date closed, photos.
- Email highlight when a new Condition is logged (template flag).

## 7. FieldRoutes integration
- Account-level flag → auto-create commercial portal.
- Scheduled visit → auto-generate empty report.
- Sending a report in Crest App → completes the appointment in FieldRoutes (lower priority — can stub the webhook now, wire later).

## 8. Cleanups
- Remove broken **Download Logbook** button entirely.
- **Materials & Prep Sheets** → rename to **Safety Data Sheets**, remove non-SDS items.
- Investigate / document the **Device Trending** graph (likely needs rebuild; flag for follow-up unless you want it rebuilt now).

## Technical notes
- New/changed tables:
  - `portal_conditions` already exists — add `photo_required` enforcement client-side, `closed_at`, `closed_photo_url`, `closed_by` columns if missing.
  - `portal_requests` already has status — add `crest_response`, `closed_at` if missing.
  - `portal_properties` — add `auto_create_reports` boolean.
- New helper: `getRecentSightings(propertyId)` filtered by status ≠ Closed.
- Refactor `CommercialDashboardView` into smaller section components mirroring `PropertyDashboard` building blocks.
- Edge function: `fieldroutes-webhook` already exists — add `appointmentCreated` → insert draft report; add `reportSent` → call FieldRoutes complete-appointment.

## Suggested phasing (each is its own delivery)
1. **Phase 1 — Visual parity + inline reports + section reorder + rename Active Conditions + photo fix + remove Logbook + SDS rename.** (UI only, no schema.)
2. **Phase 2 — Conditions workflow + new Conditions tab + required photo + carry-forward to next report.** (Small migration.)
3. **Phase 3 — Pest Sightings workflow polish + Recent Sightings auto-section + carry-forward rules.** (Small migration.)
4. **Phase 4 — FieldRoutes auto-create report + report-send→complete-appointment.** (Edge function + flag.)

## Questions before I start
1. Should I do all 4 phases in one go, or ship Phase 1 first so you can review the visual parity before I touch workflows?
2. For the "auto-generate a report on scheduled visit" — should it create a fully blank report, or pre-fill from the previous report's Active Conditions + Open Sightings?
3. Rebuild the **Device Trending** graph now, or just remove/hide it for now?
4. Confirm I can drop everything that isn't a PDF safety data sheet from Materials & Prep Sheets (no soft-delete, just hide them in the UI).
