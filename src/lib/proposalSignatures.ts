/**
 * Proposal signature store — the ONE way every screen reads and writes
 * `reports.customer_signature`.
 *
 * Why this exists: signatures used to be stored as `{ "1": <png> }`, keyed only
 * by the proposal's array position, and every screen re-derived "Option B" from
 * that index at render time. Nothing recorded WHAT was signed, so removing an
 * option, a stale editor tab re-saving from memory, or a legacy single-string
 * signature being mapped to index 0 could all flip which option looked signed.
 *
 * Now each signature carries a `meta` record naming the option (name + a
 * fingerprint of its services/prices) at the moment of signing. Readers resolve
 * a signature to an option by fingerprint first and refuse to show a signature
 * under an option that no longer matches what was signed.
 *
 * Storage format (backward compatible — old readers still find `signatures`):
 *   { _perProposal: true,
 *     signatures: { "<index>": "<data-url>" },
 *     meta:       { "<index>": { proposalName, proposalIndex, fingerprint, signedAt, source } },
 *     legacy:     "<data-url>" | undefined }   // pre-per-option single signature
 * A report with ONLY a legacy signature is still stored as the plain data-url
 * string so single-proposal readers keep working unchanged.
 */

export interface SignatureMeta {
  proposalName: string;
  proposalIndex: number;
  fingerprint: string;
  signedAt: string;
  source?: "customer" | "editor" | string;
}

export interface SignatureStore {
  /** index → signature image (data URL) */
  signatures: Record<string, string>;
  /** index → what that signature was for */
  meta: Record<string, SignatureMeta>;
  /** Single (non per-option) signature from before per-option signing existed. */
  legacy: string | null;
}

export interface ProposalLike {
  name?: string | null;
  services?: Array<{
    serviceType?: string | null;
    initialPrice?: string | number | null;
    recurringPrice?: string | number | null;
    frequency?: string | number | null;
  }> | null;
}

export type ResolvedSignature =
  | { status: "signed"; data: string; meta: SignatureMeta | null; verified: boolean; key: string }
  | { status: "mismatch"; meta: SignatureMeta; key: string }
  | { status: "unsigned" };

/** Copied on every SIGNED report email (not on ordinary report sends). */
export const SIGNED_REPORT_CC = "caleb@crestpestco.com";

/** Thrown by an editor save when the server holds a signature this tab never loaded. */
export class SignedElsewhereError extends Error {
  constructor(message?: string) {
    super(
      message ??
        "The customer signed this proposal while you were editing. The report is now locked — reload to see the signed version. Your unsaved edits were not applied.",
    );
    this.name = "SignedElsewhereError";
  }
}

export const emptySignatureStore = (): SignatureStore => ({ signatures: {}, meta: {}, legacy: null });

const isDataUrlLike = (v: unknown): v is string => typeof v === "string" && v.length > 0 && !v.trim().startsWith("{");

export function parseSignatureStore(raw: string | null | undefined): SignatureStore {
  const store = emptySignatureStore();
  if (!raw) return store;
  if (isDataUrlLike(raw)) {
    store.legacy = raw;
    return store;
  }
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || !parsed._perProposal) {
      // Unknown JSON shape — treat the whole thing as opaque legacy so it is never lost.
      store.legacy = raw;
      return store;
    }
    const sigs = parsed.signatures && typeof parsed.signatures === "object" ? parsed.signatures : {};
    for (const [k, v] of Object.entries(sigs)) {
      if (typeof v === "string" && v) store.signatures[String(parseInt(k, 10))] = v;
    }
    const meta = parsed.meta && typeof parsed.meta === "object" ? parsed.meta : {};
    for (const [k, v] of Object.entries(meta)) {
      const m = v as Partial<SignatureMeta> | null;
      if (m && typeof m.fingerprint === "string") {
        store.meta[String(parseInt(k, 10))] = {
          proposalName: String(m.proposalName ?? ""),
          proposalIndex: Number(m.proposalIndex ?? parseInt(k, 10)),
          fingerprint: m.fingerprint,
          signedAt: String(m.signedAt ?? ""),
          source: m.source,
        };
      }
    }
    // Only keep meta for keys that still have a signature.
    for (const k of Object.keys(store.meta)) if (!store.signatures[k]) delete store.meta[k];
    if (typeof parsed.legacy === "string" && parsed.legacy) store.legacy = parsed.legacy;
    return store;
  } catch {
    store.legacy = raw;
    return store;
  }
}

export function hasPerOptionSignatures(store: SignatureStore): boolean {
  return Object.keys(store.signatures).length > 0;
}

export function storeHasAnySignature(store: SignatureStore): boolean {
  return hasPerOptionSignatures(store) || !!store.legacy;
}

/** Keys (indexes) + "legacy" that carry a signature — used to detect signatures added elsewhere. */
export function signatureKeys(store: SignatureStore): string[] {
  const keys = Object.keys(store.signatures).sort();
  if (store.legacy) keys.push("legacy");
  return keys;
}

export function serializeSignatureStore(store: SignatureStore): string | null {
  if (!hasPerOptionSignatures(store)) return store.legacy || null;
  const out: Record<string, unknown> = { _perProposal: true, signatures: { ...store.signatures } };
  const meta: Record<string, SignatureMeta> = {};
  for (const k of Object.keys(store.signatures)) if (store.meta[k]) meta[k] = store.meta[k];
  out.meta = meta;
  if (store.legacy) out.legacy = store.legacy;
  return JSON.stringify(out);
}

const normPrice = (v: unknown): string => {
  if (v === null || v === undefined) return "";
  const s = String(v).replace(/[$,\s]/g, "").trim();
  if (s === "") return "";
  const n = Number(s);
  return Number.isFinite(n) ? n.toFixed(2) : s.toLowerCase();
};

/**
 * Stable description of an option: its name plus every service line with its
 * prices and cadence. Two proposals with the same fingerprint are the same offer.
 */
export function proposalFingerprint(p: ProposalLike | null | undefined): string {
  if (!p) return "";
  const name = String(p.name ?? "").trim().toLowerCase();
  const lines = (p.services ?? [])
    .filter((s) => s && String(s.serviceType ?? "").trim() !== "")
    .map((s) =>
      [
        String(s.serviceType ?? "").trim().toLowerCase(),
        normPrice(s.initialPrice),
        normPrice(s.recurringPrice),
        String(Number(s.frequency) || 0),
      ].join("|"),
    );
  return `v1:${name}#${lines.join(";")}`;
}

export function makeSignatureMeta(
  proposal: ProposalLike | null | undefined,
  index: number,
  source: SignatureMeta["source"],
): SignatureMeta {
  return {
    proposalName: String(proposal?.name ?? "").trim() || `Option ${String.fromCharCode(65 + index)}`,
    proposalIndex: index,
    fingerprint: proposalFingerprint(proposal),
    signedAt: new Date().toISOString(),
    source,
  };
}

export function setProposalSignature(
  store: SignatureStore,
  index: number,
  data: string,
  proposal: ProposalLike | null | undefined,
  source: SignatureMeta["source"],
): SignatureStore {
  const k = String(index);
  return {
    signatures: { ...store.signatures, [k]: data },
    meta: { ...store.meta, [k]: makeSignatureMeta(proposal, index, source) },
    legacy: store.legacy,
  };
}

/**
 * Remove one option's signature. `index === -1` clears the legacy signature.
 * On a single-option report the legacy signature IS option 0, so clearing 0 clears it too.
 */
export function clearProposalSignature(store: SignatureStore, index: number, proposalCount: number): SignatureStore {
  const next: SignatureStore = { signatures: { ...store.signatures }, meta: { ...store.meta }, legacy: store.legacy };
  if (index === -1 || (index === 0 && proposalCount <= 1)) next.legacy = null;
  if (index >= 0) {
    delete next.signatures[String(index)];
    delete next.meta[String(index)];
  }
  return next;
}

/**
 * Which signature (if any) belongs to the option currently at `index`.
 *  - A signature whose fingerprint matches this option is "signed" (verified),
 *    wherever it is keyed — so a re-ordered option still finds its signature.
 *  - A signature keyed at this index with NO fingerprint (written before meta
 *    existed) is "signed" but unverified — the best the old data allows.
 *  - A signature keyed at this index whose fingerprint does NOT match is a
 *    "mismatch": the option changed after it was signed. Never show it as signed.
 *  - A legacy single signature counts for option 0 only when the report has one option.
 */
export function resolveProposalSignature(
  store: SignatureStore,
  proposals: ProposalLike[],
  index: number,
): ResolvedSignature {
  const proposal = proposals[index];
  const fp = proposal ? proposalFingerprint(proposal) : null;
  const k = String(index);

  if (fp) {
    for (const [key, m] of Object.entries(store.meta)) {
      if (m.fingerprint === fp && store.signatures[key]) {
        return { status: "signed", data: store.signatures[key], meta: m, verified: true, key };
      }
    }
  }
  if (store.signatures[k]) {
    if (!store.meta[k]) return { status: "signed", data: store.signatures[k], meta: null, verified: false, key: k };
    // The signature in this slot was for a different option. If that option still
    // exists elsewhere in the list it is simply not ours; only when it matches no
    // current option is it a real mismatch (the option changed after signing).
    const owner = store.meta[k];
    const ownerStillExists = proposals.some((p) => proposalFingerprint(p) === owner.fingerprint);
    if (ownerStillExists) return { status: "unsigned" };
    return { status: "mismatch", meta: owner, key: k };
  }
  if (index === 0 && proposals.length <= 1 && store.legacy && !hasPerOptionSignatures(store)) {
    return { status: "signed", data: store.legacy, meta: null, verified: false, key: "legacy" };
  }
  return { status: "unsigned" };
}

/** Human labels for the banner: what the customer actually signed. */
export function signedOptionLabels(store: SignatureStore, proposals: ProposalLike[]): string[] {
  const labels: string[] = [];
  for (const key of Object.keys(store.signatures).sort((a, b) => Number(a) - Number(b))) {
    const m = store.meta[key];
    const idx = Number(key);
    const letter = `Option ${String.fromCharCode(65 + idx)}`;
    if (m) {
      const current = proposals[idx];
      const stillMatches = current && proposalFingerprint(current) === m.fingerprint;
      const movedMatch = !stillMatches && proposals.some((p) => proposalFingerprint(p) === m.fingerprint);
      labels.push(stillMatches || movedMatch ? m.proposalName : `${m.proposalName} (option changed since signing)`);
    } else {
      labels.push(String(proposals[idx]?.name ?? "").trim() || letter);
    }
  }
  return labels;
}

/** Overlay an editor's local, explicitly-changed keys on top of the server store. */
export function applyLocalSignatureEdits(
  server: SignatureStore,
  local: Record<number, string | null | undefined>,
  dirtyKeys: Iterable<number>,
  proposals: ProposalLike[],
  source: SignatureMeta["source"],
): SignatureStore {
  let next = server;
  for (const k of dirtyKeys) {
    const v = local[k];
    next = v ? setProposalSignature(next, k, v, proposals[k], source) : clearProposalSignature(next, k, proposals.length);
  }
  return next;
}
