# Commercial Portal Overhaul Plan

Big request — splitting into 6 workstreams. Each is independently shippable so you can review/approve them piecemeal. I'll do them in this order unless you say otherwise.

---

## 1. Layout cleanup (Commercial PM view)

Goal: less wall-of-info, easier scanning for Route Managers.

- Wrap each major section (Upcoming Services, Previous Services, Pest Sightings, Conditions, Trending, Safety Data Sheets) in a bordered card with a clear section header + count badge.
- Collapse Previous Services and Trending by default; Upcoming + Recent Sightings expanded.
- Sticky sub-nav strip at top with anchor links to each section.
- Tighten spacing — single column on mobile, 2-column where useful on desktop.

## 2. Upcoming + Previous Services → inline reports

- Remove the "Open Report" button. Render the report directly inside the Upcoming/Previous service card (expandable accordion if multiple).
- Reorder report sections to:
  1. Recent Pest Sightings (auto-pulled, see §4)
  2. Service Notes
  3. Target Pests
  4. Product Used
  5. Equipment Used
  6. Active Conditions (renamed from "Concerns Observed", see §3)
  7. Other Property Images
- Photos: change photo containers from wide-crop to `object-contain` on a 4:3 frame so nothing gets cut off. (Matches the "super wide cuts photo" complaint.)

## 3. Conditions system (renamed from Concerns)

- Rename "Concerns Observed" → "Active Conditions" everywhere (labels, headers, emails).
- Redesign the Add/Edit Condition form to match the Apartment Units card layout — same grid, same field rhythm, same chips.
- Require a photo to save a condition (form validation + clear error).
- New top-level **Conditions tab** with two sections: Active / Closed. Each row shows location, condition, severity, date identified, date closed, photos, and a Status toggle.
- Status flow: Active → Closed. Closing requires a "resolution photo" + optional note. Closed conditions stop appearing in the next service report's Active Conditions section but remain in the Conditions tab.
- New conditions auto-flow into the next service report's "Active Conditions" section.
- Email notification highlight when a new condition is added (uses existing send-portal-message infra).

Schema: extend `portal_requests` (or add `portal_conditions` table) with: `condition_type`, `location`, `severity`, `identified_at`, `closed_at`, `resolution_photo_url`, `resolution_note`, `status` enum (active/closed). Migration will follow once approved.

## 4. Pest Sightings workflow

- Customer submits sighting → already lands in **Open Requests**. Keep.
- When Crest replies (any message on the thread) → auto-move to **Closed Requests**, surfacing "Crest Response", reported date, closed date.
- Crest-side: add status field (Open / In Progress / Closed) + comment thread on each sighting.
- On the next Upcoming Service report, auto-populate a **Recent Pest Sightings** section at the top with all Open + In Progress sightings. Closed ones are excluded.
- Once a sighting is marked Closed it drops off future reports.

Schema: add `status` enum + `crest_comments` jsonb to `portal_requests` (or whichever table backs sightings). Migration follows.

## 5. FieldRoutes ↔ Crest connection

- Add a "Commercial Portal" flag per FieldRoutes account (stored on `portal_clients` or a mapping table).
- On the existing `fieldroutes-inspection-webhook` (or a new scheduled-appointment webhook), if the account is flagged, auto-create a draft Upcoming Service report tied to that appointment.
- Lower-priority: when Crest clicks "Send" on the report, call FieldRoutes appointment-complete endpoint via the existing `fieldroutes-appointment-submit` function. I'll wire it but gate behind a feature flag.

I'll need to confirm which FieldRoutes webhook fires on "appointment scheduled" — I'll inspect the existing webhook and report back before coding.

## 6. Trimming + misc

- Remove the broken "Download Logbook" button (unless you want a real logbook PDF — say the word and I'll spec it separately).
- Rename "Materials & Prep Sheets" → **Safety Data Sheets**, and filter the list to only show items tagged as SDS. Non-SDS docs move to a generic "Documents" area (or get hidden — your call).
- Trending tab: I'll add a short tooltip explaining the Device Trending graph (it counts device captures per visit over time). If the math is wrong I'll need a quick call-out on what it *should* show.

---

## Technical notes

- Files touched: `CommercialPMView.tsx`, `CommercialDashboardView.tsx`, `CommercialReportExtras.tsx`, `CommercialSpragueSections.tsx`, `CommercialApprovedMaterials.tsx`, `PMPortalView.tsx`, `PMPortal.tsx`, plus new `PortalConditionsTab.tsx` and `ConditionForm.tsx`.
- New/changed Supabase: `portal_conditions` table (or extend `portal_requests`), `portal_sightings` status fields, RLS + GRANTs per project rules. Migrations submitted per workstream for review.
- Edge function changes: `fieldroutes-inspection-webhook` (auto-create report), `send-portal-message` (notify on new condition).
- All photo containers use `object-cover` on fixed 4:3 frame per the existing map-rendering convention, but switched to `object-contain` for user-uploaded condition/property photos so they don't crop.

---

## Open questions before I start

1. Conditions: separate `portal_conditions` table, or extend `portal_requests`? I'd recommend a new table — cleaner queries, separate RLS.
2. "Download Logbook" — kill it, or replace with a real PDF export of all services + conditions + sightings for a date range?
3. Non-SDS docs currently on the Materials page — hide them entirely, or move to a new "Documents" section?
4. FieldRoutes auto-report: trigger on appointment **scheduled** or appointment **started/checked-in**?

Answer those four and I'll start with workstream 1 (layout) + 2 (inline reports) since they're the most visible wins, then move through 3 → 4 → 6 → 5.
