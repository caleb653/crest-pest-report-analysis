## Goal
Add a **Rodent Exclusion Report** that auto-spawns from a signed Sales report containing Rodent Exclusion or Rodent Trapping & Exclusion, with paired Before/After photos, arrow linking, and its own first-page PDF layout.

## 1. Data
Reuse the existing `reports` table (no schema change). New rows are tagged via `notes` JSON marker `_reportFormat: "rodent-exclusion"` (same pattern as Multi-Proposal) and carry:
- `source_sales_report_id` (in notes JSON)
- `before_photos[]`, `after_photos[]` (URLs in `notes` JSON; reuses `report-images` bucket)
- `photo_pairs[]` — array of `{ beforeId, afterId }`

## 2. Auto-conversion trigger
In `src/pages/Report.tsx` (Sales) signature-finalize path: when a signature is saved AND services include `Rodent Exclusion` or `Rodent Trapping & Exclusion`, call new helper `createRodentExclusionFromSales(salesReport)`:
- Inserts a new `reports` row pre-populated with customer info, address, technician, map data, target pests = `["Rodents"]`
- Sets `_reportFormat: "rodent-exclusion"` and `source_sales_report_id`
- Idempotent: skip if a rodent-exclusion report already references this sales id
- Show toast linking to the new report

## 3. New page & route
- `src/pages/RodentExclusionReport.tsx` — new page mirroring InitialPestReport structure
- Route `/rodent-exclusion/:id` in `src/App.tsx`
- Two upload sections: **Before Photos** and **After Photos**, each capped at **20** images (override the 12-cap memory rule for this report only)
- After-photo tiles are drag-reorderable (use `@dnd-kit/sortable` if installed, else simple HTML5 drag)
- Arrow linking: click a Before tile → it highlights; click an After tile → creates a pair entry. Click the small ✕ on the pair badge to remove.
- Map auto-renders from the inherited `map_data`

## 4. PDF layout
Update `src/lib/pdfExport.ts` (or a dedicated `rodentExclusionPdf.ts`) to:
- **Page 1**: Header + Paired Before/After rows, 2 cols (Before | arrow | After), 2 pairs per page, overflow → more pages
- **Following pages**: existing report flow (summary, map, services, signature)
- Single Before or single After (unpaired) renders at the end of the photo section

## 5. Email
`src/lib/...` send paths for rodent-exclusion type → subject `"Your Rodent Exclusion Report from Crest"`. Pass `reportType: "rodent-exclusion"` through to `send-report-email` (no edge change needed — it just forwards subject).

## 6. Created Reports list
`src/pages/SubmittedReports.tsx` — add "Rodent Exclusion" filter; detect via `_reportFormat` marker.

## 7. Files touched
- NEW: `src/pages/RodentExclusionReport.tsx`, `src/lib/rodentExclusion.ts` (createFromSales + pairing helpers)
- EDIT: `src/App.tsx`, `src/pages/Report.tsx` (post-sign hook), `src/lib/pdfExport.ts`, `src/pages/SubmittedReports.tsx`, `src/pages/Index.tsx` (optional dashboard tile)
- Memory update: image-management cap exception for this report type

## Technical notes
- Arrows in-app: SVG overlay using DOM `getBoundingClientRect()` of paired tiles; recompute on scroll/resize.
- Arrows in PDF: drawn as inline SVG between paired cells in the photo grid.
- Reuses existing `compressImage` + `report-images` Storage bucket — no new bucket.

## Out of scope (will not do unless asked)
- Editing the sales report itself
- Changing other report types' caps
- New auth/role rules