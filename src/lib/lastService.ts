// "last svc 8/12/26 (I)" — the customer's most recent COMPLETED visit, with
// "(I)" when that visit was the INITIAL. Office rule (Caleb 2026-08-30): a
// customer whose last visit was the initial is on a 30-day follow-up, so their
// next visit carries MONTHLY flexibility (±5 days) regardless of the
// subscription's cadence — the (I) is the cue. Backends send
// `last_completed` (ISO date) + `last_is_initial` on every row that carries a
// customer; both are optional so stale backends degrade to no label.

export type LastServiceFields = {
  last_completed?: string | null;
  last_is_initial?: boolean | null;
};

/** Short m/d/yy for an ISO date; "" when missing. */
export function lastServiceDate(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    return new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, {
      month: "numeric", day: "numeric", year: "2-digit",
    });
  } catch {
    return iso;
  }
}

/** "8/12/26 (I)" or "8/12/26"; null when the customer has no completed visit. */
export function lastServiceStamp(s: LastServiceFields | null | undefined): string | null {
  if (!s?.last_completed) return null;
  return `${lastServiceDate(s.last_completed)}${s.last_is_initial ? " (I)" : ""}`;
}

/** "last svc 8/12/26 (I)" — the inline label used across the scheduler pages. */
export function lastServiceLabel(s: LastServiceFields | null | undefined, prefix = "last svc"): string | null {
  const stamp = lastServiceStamp(s);
  return stamp ? `${prefix} ${stamp}` : null;
}
