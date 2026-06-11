# Route metrics spec — Fill cards

All fields are already in the Fill API response. Wire them in verbatim.

## Per-route card (`proposed[].summary`)

- `paid_drive_min` → rename existing "drive" stat to **"Paid drive"** (between-stop drive — what we pay for). Note: `drive_min` currently holds the same value; do NOT show both.
- `total_miles` → new stat **"Total miles: X mi"** (includes drive to/from home — truck/gas cost).
- `commute_min` → optional muted text `+Xm commute (unpaid)`.
- `efficiency_pct`, `total_hours`, `total_min` → already shown; values changed (commute excluded), no UI change.

## Global summary (top-level `summary`)

- `total_paid_drive_min` → replaces `total_drive_min` in the totals bar, label **"Paid drive"**.
- `total_commute_min` → new stat **"Commute (unpaid)"**.
- `total_miles` → new stat **"Total miles"**.
- `avg_efficiency_pct` → unchanged.

## New section: `deferred[]` + `deferred_count`

Separate panel **"Held for a later week ({deferred_count})"** — NOT mixed with the unplaced / "couldn't fit" bucket (these aren't failures).

Each item:
- `customer`, `city`, `service`, `due_date`, `tech`, `reason`
- `best_day`: `{ date, weekday, in_zone, in_window, load }`

Suggested row: `{customer} · {city} · due {due_date} → best fit {best_day.weekday} {best_day.date}`.

Note: `best_day.date` can occasionally land inside the current window (nearest zone-day to the due date). It's a soft pointer; `reason` is the source of truth.