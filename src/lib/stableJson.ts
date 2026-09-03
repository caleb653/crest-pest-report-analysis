/**
 * Deterministic JSON for deep-equality checks. Postgres JSONB reorders object
 * keys on the way back from the DB, so `JSON.stringify(saved) === JSON.stringify(fetched)`
 * is false even when the content is identical. Sorting keys recursively fixes that.
 */
export function stableJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value as Record<string, unknown>).sort()) {
      out[k] = sortKeys((value as Record<string, unknown>)[k]);
    }
    return out;
  }
  return value;
}
