/**
 * CommercialSpragueSections — shared "Sprague Online Logbook"-style sections
 * used in BOTH the commercial admin dashboard (CommercialDashboardView) and
 * the commercial customer portal (CommercialPMView). Co-founder wants the
 * two sides to look identical and to match / exceed Sprague's logbook UI.
 *
 * Each exported component is self-contained and accepts a `readOnly` flag so
 * the same component renders for both admin (editable) and customer (view-
 * only) consumers.
 *
 * Sections delivered here (mirrors Sprague's nav):
 *   • ConditionsReportSection   — IPM conditions log per visit (severity,
 *                                 action, responsibility, status). Grouped
 *                                 by date. Editable for admin.
 *   • ConditionUnitPills        — conditions editor embedded on the upcoming
 *                                 visit card (Route Manager entry point).
 *   • ServiceTeamSection        — service team roster compiled from past
 *                                 visits, with badges for assigned techs.
 *   • BusinessLicenseSection    — license docs (CA/UT/etc.) surfaced from
 *                                 portal_documents with category='license'.
 *   • HelpTutorialSection       — "how to use this portal" content + the
 *                                 Crest support phone.
 */
import { useMemo, useState, type ReactNode } from "react";
import { format, parseISO } from "date-fns";
import {
  AlertTriangle, ChevronDown, FlaskConical,
  HelpCircle, Phone, ShieldCheck, Users, Wrench, ClipboardList,
  FileText, Plus, Trash2, Check, X, ExternalLink, Edit3, Mail,
  Camera, Upload, Lock,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

// ─────────────────────────────────────────────────────────────────────────────
// Shared types — kept loose so we don't have to re-derive from supabase types
// ─────────────────────────────────────────────────────────────────────────────

export interface SpragueService {
  id: string;
  service_date: string | null;
  service_type: string;
  technician: string | null;
  status: string;
  summary: string | null;
  findings: string | null;
  products_used: any;
  report_data?: any;
}

// Condition row stored under service.report_data.conditions
export interface ConditionRow {
  id: string;          // local uuid
  area: string;        // e.g. "Kitchen", "Dish Pit", "Exterior"
  severity: "Low" | "Medium" | "High";
  action: string;      // e.g. "Clean as needed", "Repair or replace"
  condition: string;   // e.g. "Trash and clutter noted"
  detail: string;      // longer description
  responsibility: "Customer" | "Crest";
  comments: string;
  status: "Open" | "Ongoing" | "Closed";
  /** Photos documenting the condition when identified. At least one is required
   *  before the condition is considered "complete". */
  photos?: string[];
  /** Resolution photos uploaded when the condition is closed. Required to
   *  mark status = "Closed". */
  resolution_photos?: string[];
  /** Optional note posted at close time. */
  resolution_note?: string;
  /** ISO timestamp when condition was first added. */
  identified_at?: string;
  /** ISO timestamp when condition was moved to "Closed". */
  closed_at?: string | null;
}

const SEVERITY_COLORS: Record<string, string> = {
  Low:    "bg-emerald-100 text-emerald-800 border-emerald-300",
  Medium: "bg-amber-100  text-amber-900  border-amber-300",
  High:   "bg-red-100    text-red-900    border-red-300",
};
const STATUS_COLORS: Record<string, string> = {
  Open:    "bg-red-100     text-red-900     border-red-300",
  Ongoing: "bg-amber-100   text-amber-900   border-amber-300",
  Closed:  "bg-emerald-100 text-emerald-800 border-emerald-300",
};

const newConditionRow = (): ConditionRow => ({
  id: (typeof crypto !== "undefined" && (crypto as any).randomUUID)
    ? (crypto as any).randomUUID() : Math.random().toString(36).slice(2),
  area: "",
  severity: "Medium",
  action: "Clean as needed",
  condition: "",
  detail: "",
  responsibility: "Customer",
  comments: "",
  status: "Open",
  photos: [],
  resolution_photos: [],
  resolution_note: "",
  identified_at: new Date().toISOString(),
  closed_at: null,
});

const ACTION_OPTIONS = [
  "Clean as needed",
  "Repair or replace as needed",
  "Cut back vegetation",
  "Remove clutter",
  "Improve sanitation",
  "Seal entry point",
  "Address moisture",
  "Adjust trash storage",
  "Other",
];

const fmtDay = (iso: string | null | undefined) => {
  if (!iso) return "—";
  try { return format(parseISO(iso.length > 10 ? iso : iso + "T00:00:00"), "MMM d, yyyy"); }
  catch { return iso; }
};

const SEVERITY_DOT: Record<string, string> = {
  Low:    "bg-emerald-500",
  Medium: "bg-amber-500",
  High:   "bg-red-500",
};

// Normalize stored rows WITHOUT stamping identified_at: legacy rows that
// predate the field must stay date-less (display falls back to the visit's
// service_date) — otherwise a cosmetic edit would persist "identified today"
// on a months-old condition.
function normalizeConditionRows(raw: any): ConditionRow[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((r: any) => {
    const row = { ...newConditionRow(), ...r } as ConditionRow;
    if (!r?.identified_at) row.identified_at = undefined;
    return row;
  });
}

// ── Office notification on condition add / close ────────────────────────────
// Shared by ConditionsReportSection AND ConditionUnitPills so the upcoming-visit
// card (the primary Route Manager surface) sends the same emails as the
// Conditions tab. The module-level sets dedupe within a session: props are
// often stale for ~1.5s after a save, so a naive prev-vs-next diff would
// re-detect (and re-email) the same transition on the next blur.
const _notifiedNewIds = new Set<string>();
const _notifiedClosedIds = new Set<string>();

async function notifyConditionChanges(
  prevRows: ConditionRow[],
  nextRows: ConditionRow[],
  s: SpragueService,
  propertyName?: string,
  notifyEmail?: string | null,
) {
  try {
    const prevById = new Map(prevRows.map(r => [r.id, r]));
    const newlyDescribed: ConditionRow[] = [];
    const newlyClosed: ConditionRow[] = [];
    for (const r of nextRows) {
      const p = prevById.get(r.id);
      const prevDesc = ((p?.condition || "") + (p?.detail || "")).trim();
      const nextDesc = ((r.condition || "") + (r.detail || "")).trim();
      if (!prevDesc && nextDesc && !_notifiedNewIds.has(r.id)) newlyDescribed.push(r);
      if (p && p.status !== "Closed" && r.status === "Closed" && !_notifiedClosedIds.has(r.id)) newlyClosed.push(r);
    }
    const visitLabel = `${s.service_date ? fmtDay(s.service_date) : "Upcoming"} · ${s.service_type}`;
    for (const r of newlyDescribed) {
      _notifiedNewIds.add(r.id);
      await supabase.functions.invoke("send-portal-message", {
        body: {
          senderName: "Crest Portal — Conditions Log",
          senderEmail: notifyEmail || undefined,
          propertyName: propertyName || "Property",
          subject: `New condition logged — ${propertyName || "Property"}`,
          message:
            `A new condition was logged.\n\n` +
            `Visit: ${visitLabel}\n` +
            `Area: ${r.area || "—"}\n` +
            `Severity: ${r.severity}\n` +
            `Responsible: ${r.responsibility || "—"}\n` +
            `Status: ${r.status}\n\n` +
            `Condition:\n${r.condition || r.detail || "—"}\n\n` +
            `Detail:\n${r.detail || "—"}\n\n` +
            `Action requested:\n${r.action || "—"}`,
        },
      });
    }
    for (const r of newlyClosed) {
      _notifiedClosedIds.add(r.id);
      await supabase.functions.invoke("send-portal-message", {
        body: {
          senderName: "Crest Portal — Conditions Log",
          senderEmail: notifyEmail || undefined,
          propertyName: propertyName || "Property",
          subject: `Condition resolved — ${propertyName || "Property"}`,
          message:
            `A condition was marked Closed.\n\n` +
            `Visit: ${visitLabel}\n` +
            `Area: ${r.area || "—"}\n` +
            `Condition:\n${r.condition || r.detail || "—"}\n\n` +
            `Resolution note:\n${r.resolution_note || "—"}`,
        },
      });
    }
  } catch (e) {
    // non-blocking — UI still saved
    console.warn("[Conditions] notify failed", e);
  }
}

// ── Read-only condition cards (customer-facing) ─────────────────────────────
// Same ConditionCard + read-only body the admin dashboard uses, so the
// customer portal renders conditions IDENTICALLY (badges, photos, dates).
// Pass all services for the carry-forward pool (upcoming report view) or a
// single service for that visit's own log (past report view).
export function ConditionCardsReadOnly({ services }: { services: SpragueService[] }) {
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setOpenIds(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  const pool = services
    .slice()
    .sort((a, b) => (b.service_date || "").localeCompare(a.service_date || ""))
    .flatMap(s => normalizeConditionRows(s.report_data?.conditions)
      .filter(r => r.status !== "Closed")
      .map(r => ({ owner: s, row: r })));
  if (pool.length === 0) return null;
  return (
    <div className="space-y-1.5">
      {pool.map(({ owner, row }, i) => (
        <ConditionCard
          key={row.id}
          row={row}
          index={i}
          isOpen={openIds.has(row.id)}
          onToggle={() => toggle(row.id)}
          serviceDate={owner.service_date}
        >
          <ConditionRowEditor
            row={row}
            readOnly
            serviceDate={owner.service_date}
            onChange={() => {}}
            onRemove={() => {}}
          />
        </ConditionCard>
      ))}
    </div>
  );
}

// ── Session-surviving condition drafts ──────────────────────────────────────
// A draft lives in sessionStorage (keyed by service id) so switching tabs or
// collapsing the card doesn't silently discard typed text + uploaded photos.
// Nothing photo-less ever reaches the database.
const conditionDraftKey = (serviceId: string) => `condition-draft-${serviceId}`;
function readConditionDraft(serviceId: string): ConditionRow | null {
  try {
    const raw = sessionStorage.getItem(conditionDraftKey(serviceId));
    return raw ? (JSON.parse(raw) as ConditionRow) : null;
  } catch { return null; }
}
function writeConditionDraft(serviceId: string, d: ConditionRow | null) {
  try {
    if (d) sessionStorage.setItem(conditionDraftKey(serviceId), JSON.stringify(d));
    else sessionStorage.removeItem(conditionDraftKey(serviceId));
  } catch { /* storage unavailable — draft is memory-only */ }
}

// ─────────────────────────────────────────────────────────────────────────────
// CONDITION CARD — collapsible card matching the apartment portal's unit-card
// pattern: colored header bar with a numbered circle + condition title + area /
// severity / status badges + dates + chevron, expanding to the row editor.
// Shared by ConditionsReportSection and ConditionUnitPills so the Conditions
// tab and the upcoming-visit card look identical.
// ─────────────────────────────────────────────────────────────────────────────
function ConditionCard({
  row, index, isOpen, onToggle, serviceDate, children,
}: {
  row: ConditionRow;
  index: number;
  isOpen: boolean;
  onToggle: () => void;
  /** Fallback "identified" date when the row predates identified_at stamping. */
  serviceDate?: string | null;
  children?: ReactNode;
}) {
  const isClosed = row.status === "Closed";
  const title = row.condition?.trim() || "Untitled condition";
  const photoCount = row.photos?.length || 0;
  const identified = row.identified_at || serviceDate || null;
  return (
    <div className={`rounded-xl border-2 bg-card shadow-md overflow-hidden ${
      isClosed ? "border-emerald-500/50" : "border-amber-500/60"}`}>
      <button
        type="button"
        onClick={onToggle}
        className={`w-full flex items-center gap-3 px-3 sm:px-4 py-2.5 text-left transition-colors ${
          isClosed
            ? "bg-emerald-50/80 hover:bg-emerald-100/70 border-b-2 border-emerald-500/40"
            : "bg-amber-100/70 hover:bg-amber-100 border-b-2 border-amber-500/50"}`}
      >
        <div className={`shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white ${
          isClosed ? "bg-emerald-600" : SEVERITY_DOT[row.severity] || "bg-amber-500"}`}>
          {index + 1}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-foreground truncate">{title}</p>
          {isClosed && row.closed_at && (
            <p className="text-[10px] text-muted-foreground">
              Closed {fmtDay(row.closed_at)}
            </p>
          )}
        </div>
        {row.area && (
          <Badge variant="outline" className="hidden sm:inline-flex h-5 text-[10px] bg-background/60">
            {row.area}
          </Badge>
        )}
        <Badge variant="outline" className={`hidden sm:inline-flex h-5 text-[10px] ${SEVERITY_COLORS[row.severity]}`}>
          {row.severity}
        </Badge>
        <Badge variant="outline" className={`h-5 text-[10px] ${STATUS_COLORS[row.status]}`}>
          {row.status}
        </Badge>
        {photoCount > 0 && (
          <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground">
            <Camera className="w-3 h-3" />{photoCount}
          </span>
        )}
        <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform shrink-0 ${isOpen ? "rotate-180" : ""}`} />
      </button>
      {isOpen && <div className="bg-background">{children}</div>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CONDITIONS REPORT
// ─────────────────────────────────────────────────────────────────────────────
interface ConditionsProps {
  services: SpragueService[];
  readOnly?: boolean;
  /** Admin-only: persist a patch to portal_services.report_data. */
  onSaveServiceReportData?: (serviceId: string, nextReportData: any) => Promise<void> | void;
  /** Include services even when they have no service_date (e.g. upcoming visits). */
  includeUndated?: boolean;
  /** Used for email notifications when conditions are added or closed. */
  propertyName?: string;
  notifyEmail?: string | null;
  /** Hide the big title/description/Active subheader (for embedded use). */
  compact?: boolean;
  /** When set, this service is treated as the "current" visit — it renders even
   * when empty (so the admin can add), and open conditions from other services
   * carry over into this view. */
  currentServiceId?: string;
}

export function ConditionsReportSection({ services, readOnly, onSaveServiceReportData, includeUndated, propertyName, notifyEmail, compact, currentServiceId }: ConditionsProps) {
  const past = useMemo(
    () => services
      .filter(s => includeUndated || s.service_date)
      .sort((a, b) => (b.service_date || "").localeCompare(a.service_date || "")),
    [services, includeUndated]
  );

  const conditionsFor = (s: SpragueService): ConditionRow[] => normalizeConditionRows(s.report_data?.conditions);

  const save = async (s: SpragueService, rows: ConditionRow[]) => {
    if (!onSaveServiceReportData) return;
    // PATCH, not the whole blob — the persister fetches fresh report_data and
    // merges, so we never clobber sibling keys saved since our props loaded.
    await onSaveServiceReportData(s.id, { conditions: rows });
    await notifyConditionChanges(conditionsFor(s), rows, s, propertyName, notifyEmail);
  };

  const visitsWithAny = past.filter(s => conditionsFor(s).length > 0);
  const open = past.flatMap(s => conditionsFor(s).filter(c => c.status !== "Closed").map(c => ({ s, c })));
  const closed = past.flatMap(s => conditionsFor(s).filter(c => c.status === "Closed").map(c => ({ s, c })));
  const [showClosed, setShowClosed] = useState(false);
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());
  // Draft-first add: a new condition lives in local state + sessionStorage
  // until it has a description AND at least one photo — nothing photo-less
  // ever persists, and a tab switch doesn't lose typed work.
  const [drafts, setDraftsState] = useState<Record<string, ConditionRow | null>>({});

  const toggleOpen = (id: string) =>
    setOpenIds(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  const draftFor = (sid: string) => (sid in drafts ? drafts[sid] : readConditionDraft(sid));
  const setDraftFor = (sid: string, d: ConditionRow | null) => {
    setDraftsState(prev => ({ ...prev, [sid]: d }));
    writeConditionDraft(sid, d);
  };
  const draftReady = (d: ConditionRow | null) =>
    !!d && (d.photos?.length || 0) > 0 && !!d.condition.trim();

  // Split each visit's rows into active/closed so each section renders cleanly.
  // Only surface visits that actually have conditions — with one exception:
  // when a `currentServiceId` is supplied (upcoming-visit card), we keep that
  // service on-screen even when empty so the admin can add a new condition,
  // and we float it to the top of the list.
  const visitsWithActive = past
    .map(s => ({ s, rows: conditionsFor(s).filter(c => c.status !== "Closed") }))
    .filter(v => v.rows.length > 0 || v.s.id === currentServiceId)
    .sort((a, b) => {
      if (a.s.id === currentServiceId) return -1;
      if (b.s.id === currentServiceId) return 1;
      return 0;
    });
  const visitsWithClosed = past
    .map(s => ({ s, rows: conditionsFor(s).filter(c => c.status === "Closed") }))
    .filter(v => v.rows.length > 0);

  return (
    <div className={compact ? "space-y-2" : "space-y-4"}>
      {past.length === 0 && !compact && (
        <Card><CardContent className="p-6 text-sm text-muted-foreground text-center">
          No past visits yet — conditions appear here once visits are logged.
        </CardContent></Card>
      )}

      {/* ─── ACTIVE ─── */}
      <div className={compact ? "space-y-2" : "space-y-3"}>
        {!compact && (
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className="text-sm font-bold uppercase tracking-wide text-red-900 flex items-center gap-1.5">
                <ClipboardList className="w-4 h-4 text-primary" /> Active Conditions
              </h4>
              <Badge variant="outline" className="border-red-300 text-red-900 bg-red-50 text-[10px]">
                {open.length}
              </Badge>
              <p className="text-[11px] text-muted-foreground max-w-md leading-snug">
                Sanitation, structural, and conducive conditions noted during each visit. Items stay <span className="font-semibold">Open</span> until resolved by the responsible party.
              </p>
            </div>
            <div className="flex gap-1.5 text-[10px]">
              <Badge variant="outline" className="border-green-300 text-green-900 bg-green-50">
                {closed.length} Closed
              </Badge>
              <Badge variant="outline">{visitsWithAny.length} Visits Logged</Badge>
            </div>
          </div>
        )}
        {visitsWithActive.length === 0 ? (
          <Card><CardContent className="p-4 text-sm text-muted-foreground text-center italic">
            No active conditions.
          </CardContent></Card>
        ) : currentServiceId ? (() => {
          // Upcoming-visit card: flatten open conditions into a single list with
          // a single Add Condition button targeting the current visit.
          const currentSvc = visitsWithActive.find(v => v.s.id === currentServiceId)?.s
            || past.find(p => p.id === currentServiceId);
          const flatRows = visitsWithActive.flatMap(({ s, rows }) => rows.map(c => ({ s, c })));
          const draft = currentSvc ? draftFor(currentSvc.id) : null;
          const currentAllRows = currentSvc ? conditionsFor(currentSvc) : [];
          return (
            <Card>
              {!readOnly && currentSvc && !draft && (
                <div className="bg-red-50/60 border-b border-red-200 px-3 py-2 flex items-center justify-end">
                  <Button size="sm" variant="outline" className="h-8 text-xs gap-1"
                    onClick={() => setDraftFor(currentSvc.id, newConditionRow())}>
                    <Plus className="w-3 h-3" /> Add Condition
                  </Button>
                </div>
              )}
              <CardContent className="p-2 space-y-2">
                {draft && !readOnly && currentSvc && (
                  <ConditionCard row={draft} index={flatRows.length} isOpen onToggle={() => {}} serviceDate={currentSvc.service_date}>
                    <ConditionRowEditor
                      row={draft}
                      live
                      onChange={(next) => setDraftFor(currentSvc.id, next)}
                      onRemove={() => setDraftFor(currentSvc.id, null)}
                    />
                    <div className="flex items-center gap-2 px-3 pb-3 flex-wrap">
                      <Button size="sm" disabled={!draftReady(draft)} className="h-8 text-xs gap-1"
                        onClick={async () => { await save(currentSvc, [...currentAllRows, draft]); setDraftFor(currentSvc.id, null); }}>
                        <Check className="w-3.5 h-3.5" /> Save Condition
                      </Button>
                      <Button size="sm" variant="ghost" className="h-8 text-xs"
                        onClick={() => setDraftFor(currentSvc.id, null)}>
                        Cancel
                      </Button>
                      {!draftReady(draft) && (
                        <p className="text-[11px] text-amber-900">
                          Add a condition description and at least one photo to save.
                        </p>
                      )}
                    </div>
                  </ConditionCard>
                )}
                {flatRows.map(({ s, c }, i) => {
                  const allRows = conditionsFor(s);
                  const idx = allRows.findIndex(r => r.id === c.id);
                  return (
                    <ConditionCard
                      key={c.id}
                      row={c}
                      index={i}
                      isOpen={openIds.has(c.id)}
                      onToggle={() => toggleOpen(c.id)}
                      serviceDate={s.service_date}
                    >
                      <ConditionRowEditor
                        row={c}
                        readOnly={readOnly}
                        serviceDate={s.service_date}
                        onChange={(next) => save(s, allRows.map((r, i2) => i2 === idx ? next : r))}
                        onRemove={() => save(s, allRows.filter((_, i2) => i2 !== idx))}
                      />
                    </ConditionCard>
                  );
                })}
              </CardContent>
            </Card>
          );
        })() : (
          visitsWithActive.map(({ s, rows: activeRows }) => {
            const allRows = conditionsFor(s);
            const draft = draftFor(s.id);
            return (
              <Card key={`active-${s.id}`}>
                <div className="bg-red-50/60 border-b border-red-200 px-3 py-2 flex items-center justify-between gap-2 flex-wrap">
                  <p className="text-sm font-semibold flex items-center gap-2 flex-wrap">
                    <span>
                      {fmtDay(s.service_date)} <span className="text-muted-foreground">·</span>{" "}
                      <span className="text-muted-foreground">{s.service_type}</span>
                      {s.technician && <span className="text-muted-foreground"> · {s.technician}</span>}
                    </span>
                  </p>
                  {!readOnly && !draft && (
                    <Button size="sm" variant="outline" className="h-8 text-xs gap-1"
                      onClick={() => setDraftFor(s.id, newConditionRow())}>
                      <Plus className="w-3 h-3" /> Add Condition
                    </Button>
                  )}
                </div>
                <CardContent className="p-2 space-y-2">
                  {draft && !readOnly && (
                    <ConditionCard row={draft} index={activeRows.length} isOpen onToggle={() => {}} serviceDate={s.service_date}>
                      <ConditionRowEditor
                        row={draft}
                        live
                        onChange={(next) => setDraftFor(s.id, next)}
                        onRemove={() => setDraftFor(s.id, null)}
                      />
                      <div className="flex items-center gap-2 px-3 pb-3 flex-wrap">
                        <Button size="sm" disabled={!draftReady(draft)} className="h-8 text-xs gap-1"
                          onClick={async () => { await save(s, [...allRows, draft]); setDraftFor(s.id, null); }}>
                          <Check className="w-3.5 h-3.5" /> Save Condition
                        </Button>
                        <Button size="sm" variant="ghost" className="h-8 text-xs"
                          onClick={() => setDraftFor(s.id, null)}>
                          Cancel
                        </Button>
                        {!draftReady(draft) && (
                          <p className="text-[11px] text-amber-900">
                            Add a condition description and at least one photo to save.
                          </p>
                        )}
                      </div>
                    </ConditionCard>
                  )}
                  {activeRows.map((c, i) => {
                    const idx = allRows.findIndex(r => r.id === c.id);
                    return (
                      <ConditionCard
                        key={c.id}
                        row={c}
                        index={i}
                        isOpen={openIds.has(c.id)}
                        onToggle={() => toggleOpen(c.id)}
                        serviceDate={s.service_date}
                      >
                        <ConditionRowEditor
                          row={c}
                          readOnly={readOnly}
                          serviceDate={s.service_date}
                          onChange={(next) => save(s, allRows.map((r, i2) => i2 === idx ? next : r))}
                          onRemove={() => save(s, allRows.filter((_, i2) => i2 !== idx))}
                        />
                      </ConditionCard>
                    );
                  })}
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      {/* ─── CLOSED ─── */}
      {visitsWithClosed.length > 0 && (
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => setShowClosed(v => !v)}
            className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-green-900 hover:text-green-700 transition"
          >
            <span>Former Conditions</span>
            <Badge variant="outline" className="border-green-300 text-green-900 bg-green-50 text-[10px]">
              {closed.length}
            </Badge>
            <span className="text-[10px] text-muted-foreground normal-case font-normal">
              ({showClosed ? "hide" : "show"})
            </span>
          </button>
          {showClosed && visitsWithClosed.map(({ s, rows: closedRows }) => {
            const allRows = conditionsFor(s);
            return (
              <Card key={`closed-${s.id}`} className="opacity-90">
                <div className="bg-green-50/60 border-b border-green-200 px-3 py-2">
                  <p className="text-sm font-semibold">
                    {fmtDay(s.service_date)} <span className="text-muted-foreground">·</span>{" "}
                    <span className="text-muted-foreground">{s.service_type}</span>
                    {s.technician && <span className="text-muted-foreground"> · {s.technician}</span>}
                  </p>
                </div>
                <CardContent className="p-2 space-y-2">
                  {closedRows.map((c, i) => {
                    const idx = allRows.findIndex(r => r.id === c.id);
                    return (
                      <ConditionCard
                        key={c.id}
                        row={c}
                        index={i}
                        isOpen={openIds.has(c.id)}
                        onToggle={() => toggleOpen(c.id)}
                        serviceDate={s.service_date}
                      >
                        <ConditionRowEditor
                          row={c}
                          readOnly={readOnly}
                          serviceDate={s.service_date}
                          onChange={(next) => save(s, allRows.map((r, i2) => i2 === idx ? next : r))}
                          onRemove={() => save(s, allRows.filter((_, i2) => i2 !== idx))}
                        />
                      </ConditionCard>
                    );
                  })}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ConditionRowEditor({
  row, readOnly, onChange, onRemove, serviceDate, live,
}: {
  row: ConditionRow; readOnly?: boolean;
  onChange: (next: ConditionRow) => void; onRemove: () => void;
  /** Fallback "identified" date for rows that predate identified_at stamping. */
  serviceDate?: string | null;
  /** Draft mode: push every keystroke to onChange (no DB behind it), so the
   *  parent's Save gate reflects what's typed without waiting for blur. */
  live?: boolean;
}) {
  const [local, setLocal] = useState<ConditionRow>(row);
  const [uploading, setUploading] = useState<"id" | "res" | null>(null);
  // Local-then-blur pattern so typing in tables doesn't lose focus mid-keystroke.
  const set = <K extends keyof ConditionRow>(k: K, v: ConditionRow[K]) =>
    setLocal(prev => {
      const next = { ...prev, [k]: v };
      if (live) onChange(next);
      return next;
    });
  const flush = () => { if (JSON.stringify(local) !== JSON.stringify(row)) onChange(local); };

  const photos = local.photos || [];
  const resPhotos = local.resolution_photos || [];
  const needsIdentifyPhoto = photos.length === 0;

  // Upload helper — pushes the public URL onto the named bucket field.
  const uploadTo = async (
    field: "photos" | "resolution_photos",
    files: FileList | null,
  ) => {
    if (!files || files.length === 0) return;
    setUploading(field === "photos" ? "id" : "res");
    try {
      const next = [...(local[field] || [])];
      for (const file of Array.from(files)) {
        const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
        const path = `conditions/${local.id}/${field}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("portal-documents")
          .upload(path, file, { contentType: file.type || "image/jpeg", upsert: false });
        if (upErr) {
          toast({ title: "Upload failed", description: upErr.message, variant: "destructive" });
          continue;
        }
        const { data: pub } = supabase.storage.from("portal-documents").getPublicUrl(path);
        if (pub?.publicUrl) next.push(pub.publicUrl);
      }
      const merged = { ...local, [field]: next } as ConditionRow;
      setLocal(merged);
      onChange(merged);
    } finally {
      setUploading(null);
    }
  };

  const removePhoto = (field: "photos" | "resolution_photos", idx: number) => {
    const next = [...(local[field] || [])];
    next.splice(idx, 1);
    const merged = { ...local, [field]: next } as ConditionRow;
    setLocal(merged);
    onChange(merged);
  };

  // Gate Close: must have a resolution photo before flipping status → Closed.
  const tryChangeStatus = (v: ConditionRow["status"]) => {
    if (v === "Closed" && resPhotos.length === 0) {
      toast({
        title: "Resolution photo required",
        description: "Upload at least one photo showing the condition was resolved before closing.",
        variant: "destructive",
      });
      return;
    }
    const closedAt = v === "Closed" ? new Date().toISOString() : null;
    const merged = { ...local, status: v, closed_at: closedAt } as ConditionRow;
    setLocal(merged);
    onChange(merged);
  };

  if (readOnly) {
    return (
      <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
        {/* Left 2/3 — condition details (apartment unit-card layout) */}
        <div className="md:col-span-2 space-y-3">
          <div>
            <p className="text-[10px] uppercase font-bold text-muted-foreground">Condition</p>
            <p className="font-medium">{row.condition || "—"}</p>
            {row.detail && <p className="text-xs text-muted-foreground mt-0.5 whitespace-pre-wrap">{row.detail}</p>}
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2">
            <div>
              <p className="text-[10px] uppercase font-bold text-muted-foreground">Area</p>
              <p>{row.area || "—"}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase font-bold text-muted-foreground">Action Requested</p>
              <p>{row.action || "—"}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase font-bold text-muted-foreground">Severity</p>
              <Badge variant="outline" className={`text-[10px] w-fit ${SEVERITY_COLORS[row.severity]}`}>
                {row.severity}
              </Badge>
            </div>
            <div>
              <p className="text-[10px] uppercase font-bold text-muted-foreground">Responsibility</p>
              <p>{row.responsibility || "—"}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase font-bold text-muted-foreground">Identified</p>
              <p>{fmtDay(row.identified_at || serviceDate)}</p>
            </div>
            {row.status === "Closed" && (
              <div>
                <p className="text-[10px] uppercase font-bold text-muted-foreground">Closed</p>
                <p>{fmtDay(row.closed_at)}</p>
              </div>
            )}
          </div>
          {row.comments && (
            <p className="text-xs text-muted-foreground">{row.comments}</p>
          )}
          {row.status === "Closed" && (row.resolution_note || (row.resolution_photos?.length || 0) > 0) && (
            <div className="rounded-lg border border-emerald-300 bg-emerald-50/40 p-2.5 space-y-1.5">
              <p className="text-[10px] uppercase font-bold text-emerald-900 flex items-center gap-1">
                <Check className="w-3 h-3" /> Resolution
              </p>
              {row.resolution_note && (
                <p className="text-[11px] text-emerald-900 italic">"{row.resolution_note}"</p>
              )}
              {(row.resolution_photos?.length || 0) > 0 && (
                <div className="grid grid-cols-3 gap-1.5">
                  {row.resolution_photos!.map((u, i) => (
                    <a key={i} href={u} target="_blank" rel="noopener noreferrer" className="aspect-[4/3] rounded border border-emerald-300 overflow-hidden block bg-muted">
                      <img src={u} alt="" loading="lazy" className="w-full h-full object-contain" />
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
        {/* Right 1/3 — condition photos */}
        {(row.photos?.length || 0) > 0 && (
          <div className="md:col-span-1 rounded-lg border-2 border-primary/40 bg-primary/[0.04] p-3 self-start">
            <p className="text-[10px] font-bold uppercase tracking-wide mb-2">
              Condition Photos <span className="text-muted-foreground font-normal normal-case">({row.photos!.length})</span>
            </p>
            <div className="grid grid-cols-2 gap-2">
              {row.photos!.map((u, i) => (
                <a key={i} href={u} target="_blank" rel="noopener noreferrer" className="aspect-[4/3] rounded-md border border-border overflow-hidden block bg-muted">
                  <img src={u} alt="" loading="lazy" className="w-full h-full object-contain" />
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`p-3 space-y-3 ${needsIdentifyPhoto ? "bg-amber-50/40" : ""}`}>
      {needsIdentifyPhoto && (
        <div className="flex items-center gap-2 text-[11px] text-amber-900 bg-amber-100 border border-amber-300 rounded px-2 py-1">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          <span><b>Photo required.</b> Upload at least one photo of the condition before this entry is considered complete.</span>
          <Badge variant="outline" className="ml-auto border-amber-400 text-amber-900 bg-amber-50 text-[10px]">Required</Badge>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* ── Fields (left 2/3 — apartment unit-card layout) ── */}
        <div className="md:col-span-2 grid grid-cols-2 gap-2 content-start">
          <div className="col-span-2">
            <Label className="text-[10px] uppercase font-bold text-muted-foreground">Condition / Detail</Label>
            <Input value={local.condition} onChange={e => set("condition", e.target.value)} onBlur={flush}
              placeholder="Trash and clutter noted" className="h-9 text-sm" />
            <Textarea value={local.detail} onChange={e => set("detail", e.target.value)} onBlur={flush}
              placeholder="More detail (optional)" rows={2} className="mt-1 text-xs" />
          </div>
          <div>
            <Label className="text-[10px] uppercase font-bold text-muted-foreground">Area</Label>
            <Input value={local.area} onChange={e => set("area", e.target.value)} onBlur={flush}
              placeholder="Kitchen" className="h-9 text-sm" />
          </div>
          <div>
            <Label className="text-[10px] uppercase font-bold text-muted-foreground">Action</Label>
            <Select value={local.action} onValueChange={v => { set("action", v); onChange({ ...local, action: v }); }}>
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ACTION_OPTIONS.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-[10px] uppercase font-bold text-muted-foreground">Severity</Label>
            <Select value={local.severity} onValueChange={(v: any) => { set("severity", v); onChange({ ...local, severity: v }); }}>
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Low">Low</SelectItem>
                <SelectItem value="Medium">Medium</SelectItem>
                <SelectItem value="High">High</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-[10px] uppercase font-bold text-muted-foreground">Responsibility</Label>
            <Select value={local.responsibility} onValueChange={(v: any) => { set("responsibility", v); onChange({ ...local, responsibility: v }); }}>
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Customer">Customer</SelectItem>
                <SelectItem value="Crest">Crest</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-[10px] uppercase font-bold text-muted-foreground">Status</Label>
            <Select value={local.status} onValueChange={(v: any) => tryChangeStatus(v)}>
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Open">Open</SelectItem>
                <SelectItem value="Ongoing">Ongoing</SelectItem>
                <SelectItem value="Closed">
                  Closed {resPhotos.length === 0 ? "(needs resolution photo)" : ""}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2 flex justify-end">
            <Button size="icon" variant="ghost" onClick={onRemove}
              className="h-9 w-9 text-destructive shrink-0">
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>

        {/* ── Photos (right 1/3 — apartment "Unit Photos" panel) ── */}
        <div className="md:col-span-1 rounded-lg border-2 border-primary/40 bg-primary/[0.04] p-3 self-start space-y-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <p className="text-[10px] uppercase font-bold text-foreground tracking-wide flex items-center gap-1.5">
              <Camera className="w-3.5 h-3.5" /> Photos
              {needsIdentifyPhoto && (
                <Badge variant="outline" className="ml-1 text-[9px] border-amber-400 text-amber-900 bg-amber-50">Required</Badge>
              )}
            </p>
            <label className="cursor-pointer">
              <input type="file" accept="image/*" multiple className="hidden"
                onChange={e => { uploadTo("photos", e.target.files); e.currentTarget.value = ""; }} />
              <span className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-[11px] hover:bg-muted">
                <Upload className="w-3 h-3" /> {uploading === "id" ? "Uploading…" : "Add"}
              </span>
            </label>
          </div>
          {photos.length > 0 ? (
            <div className="grid grid-cols-2 gap-2">
              {photos.map((u, i) => (
                <a key={i} href={u} target="_blank" rel="noopener noreferrer"
                   className="relative aspect-[4/3] rounded-md border border-border overflow-hidden group block bg-muted">
                  <img src={u} alt="" loading="lazy" className="w-full h-full object-contain" />
                  <button type="button"
                    onClick={(e) => { e.preventDefault(); removePhoto("photos", i); }}
                    className="absolute top-1 right-1 w-6 h-6 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 shadow">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </a>
              ))}
            </div>
          ) : (
            <label className="cursor-pointer flex flex-col items-center justify-center text-center text-muted-foreground border border-dashed border-border rounded-md py-8 hover:bg-muted/50">
              <input type="file" accept="image/*" multiple className="hidden"
                onChange={e => { uploadTo("photos", e.target.files); e.currentTarget.value = ""; }} />
              <Camera className="w-8 h-8 mb-1.5 opacity-60" />
              <p className="text-sm font-medium">Add condition photos</p>
              <p className="text-[11px]">Photos are the primary record of this condition.</p>
            </label>
          )}
        </div>
      </div>

      {/* ── Resolution (only shown when working toward Closed) ── */}
      {/* Always render once the condition itself has been documented (has at
          least one identifying photo) so techs / managers can upload the
          resolution photo BEFORE flipping status to Closed. Previously this
          block was hidden while status was "Open", so users couldn't figure
          out where to upload the resolution photo the close-out gate required. */}
      {!needsIdentifyPhoto && (
        <div className="sm:col-span-6 rounded-md border border-emerald-300 bg-emerald-50/40 p-2 space-y-1.5">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <p className="text-[10px] uppercase font-bold text-emerald-900 flex items-center gap-1">
              <Check className="w-3 h-3" /> Resolution
              {local.status !== "Closed" && resPhotos.length === 0 && (
                <Badge variant="outline" className="ml-1 text-[9px] border-emerald-400 text-emerald-900 bg-emerald-50">
                  Photo required to close
                </Badge>
              )}
            </p>
            <label className="cursor-pointer">
              <input type="file" accept="image/*" multiple className="hidden"
                onChange={e => { uploadTo("resolution_photos", e.target.files); e.currentTarget.value = ""; }} />
              <span className="inline-flex items-center gap-1 rounded-md border border-emerald-300 bg-background px-2 py-1 text-[11px] hover:bg-emerald-100">
                <Upload className="w-3 h-3" /> {uploading === "res" ? "Uploading…" : "Add Resolution Photo"}
              </span>
            </label>
          </div>
          {resPhotos.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {resPhotos.map((u, i) => (
                <a key={i} href={u} target="_blank" rel="noopener noreferrer"
                   className="relative w-24 aspect-[4/3] rounded border border-emerald-400 overflow-hidden group block bg-muted">
                  <img src={u} alt="" loading="lazy" className="w-full h-full object-contain" />
                  <button type="button" onClick={(e) => { e.preventDefault(); removePhoto("resolution_photos", i); }}
                    className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100">
                    <X className="w-2.5 h-2.5" />
                  </button>
                </a>
              ))}
            </div>
          )}
          <Input
            value={local.resolution_note || ""}
            onChange={e => set("resolution_note", e.target.value)}
            onBlur={flush}
            placeholder="Resolution note (optional, shown to customer)"
            className="h-8 text-xs"
          />
          {local.status !== "Closed" && resPhotos.length > 0 && (
            <Button size="sm" variant="outline" onClick={() => tryChangeStatus("Closed")}
              className="h-7 text-xs gap-1 border-emerald-400 text-emerald-900 hover:bg-emerald-100">
              <Lock className="w-3 h-3" /> Mark Closed
            </Button>
          )}
          {local.status === "Closed" && local.closed_at && (
            <p className="text-[10px] text-emerald-900 italic">
              Closed {fmtDay(local.closed_at)}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CONDITION UNIT PILLS — apartment-unit-style collapsible condition cards
// embedded on the upcoming-visit card. Shows ALL non-Closed conditions across
// the property's services (carry-forward: an open condition follows every
// subsequent report until it is closed), each saving back to the service it
// was logged on. New conditions are drafted locally and only persisted once
// they have a description AND at least one photo.
// ─────────────────────────────────────────────────────────────────────────────
export function ConditionUnitPills({
  service,
  services,
  readOnly,
  onSaveServiceReportData,
  propertyName,
  notifyEmail,
}: {
  /** The visit this card belongs to — new conditions are logged against it. */
  service: SpragueService;
  /** All of the property's services. When provided, every non-Closed condition
   *  across them is surfaced here (open items carry forward to the next report). */
  services?: SpragueService[];
  readOnly?: boolean;
  /** Persister — receives a PATCH of report_data keys (e.g. { conditions }). */
  onSaveServiceReportData?: (serviceId: string, patch: any) => Promise<void> | void;
  /** For office email notifications on add/close (same as ConditionsReportSection). */
  propertyName?: string;
  notifyEmail?: string | null;
}) {
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());
  // Draft survives tab switches / card collapses via sessionStorage.
  const [draft, setDraftState] = useState<ConditionRow | null>(() => readConditionDraft(service.id));
  const setDraft = (d: ConditionRow | null) => {
    setDraftState(d);
    writeConditionDraft(service.id, d);
  };

  const rowsOf = (s: SpragueService): ConditionRow[] => normalizeConditionRows(s.report_data?.conditions);

  // Carry-forward pool: every non-Closed condition on the property, newest
  // visit first, with this visit's own rows leading.
  const pool = (services && services.length ? services : [service])
    .slice()
    .sort((a, b) => (a.id === service.id ? -1 : b.id === service.id ? 1 : (b.service_date || "").localeCompare(a.service_date || "")))
    .flatMap(s => rowsOf(s).filter(r => r.status !== "Closed").map(r => ({ owner: s, row: r })));

  const saveFor = async (owner: SpragueService, next: ConditionRow[]) => {
    if (!onSaveServiceReportData) return;
    const prev = rowsOf(owner);
    // PATCH — persister fetches fresh report_data and merges (no clobber).
    await onSaveServiceReportData(owner.id, { conditions: next });
    // Same office emails as the Conditions tab — this card is the primary
    // Route Manager surface, so adds/closes here must notify too.
    await notifyConditionChanges(prev, next, owner, propertyName, notifyEmail);
  };
  const toggle = (id: string) =>
    setOpenIds(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const draftReady = !!draft && (draft.photos?.length || 0) > 0 && !!draft.condition.trim();
  const saveDraft = async () => {
    if (!draft || !draftReady) return;
    await saveFor(service, [...rowsOf(service), draft]);
    setDraft(null);
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2 rounded-md bg-gradient-to-r from-red-200 to-red-100 border-l-4 border-red-500 px-3 py-2 shadow-sm">
        <div className="flex items-center gap-2 flex-wrap">
          <ClipboardList className="w-4 h-4 text-red-700" />
          <h4 className="text-sm font-black uppercase tracking-wider text-red-950">Active Conditions</h4>
          {pool.length > 0 && (
            <Badge variant="outline" className="text-[10px] border-red-500 text-red-950 bg-white/70">
              {pool.length}
            </Badge>
          )}
        </div>
        {!readOnly && !draft && (
          <Button size="sm" variant="outline" onClick={() => setDraft(newConditionRow())} className="h-7 text-[11px] gap-1 border-amber-400 text-amber-900 hover:bg-amber-100">
            <Plus className="w-3 h-3" /> Add
          </Button>
        )}
      </div>

      {/* Draft — not persisted until it has a description and a photo. */}
      {draft && !readOnly && (
        <div className="space-y-1.5">
          <ConditionCard row={draft} index={pool.length} isOpen onToggle={() => {}} serviceDate={service.service_date}>
            <ConditionRowEditor
              row={draft}
              live
              onChange={setDraft}
              onRemove={() => setDraft(null)}
            />
            <div className="flex items-center gap-2 px-3 pb-3 flex-wrap">
              <Button size="sm" disabled={!draftReady} onClick={saveDraft} className="h-8 text-xs gap-1">
                <Check className="w-3.5 h-3.5" /> Save Condition
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setDraft(null)} className="h-8 text-xs">
                Cancel
              </Button>
              {!draftReady && (
                <p className="text-[11px] text-amber-900">
                  Add a condition description and at least one photo to save.
                </p>
              )}
            </div>
          </ConditionCard>
        </div>
      )}

      {pool.length === 0 && !draft ? (
        <p className="text-xs text-muted-foreground italic px-1">No active conditions.</p>
      ) : (
        <div className="space-y-1.5">
          {pool.map(({ owner, row: c }, i) => (
            <ConditionCard
              key={c.id}
              row={c}
              index={i}
              isOpen={openIds.has(c.id)}
              onToggle={() => toggle(c.id)}
              serviceDate={owner.service_date}
            >
              <ConditionRowEditor
                row={c}
                readOnly={readOnly}
                serviceDate={owner.service_date}
                onChange={(next) => saveFor(owner, rowsOf(owner).map(r => r.id === c.id ? next : r))}
                onRemove={() => saveFor(owner, rowsOf(owner).filter(r => r.id !== c.id))}
              />
            </ConditionCard>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SERVICE TEAM — unique techs from past visits + last visit date
// ─────────────────────────────────────────────────────────────────────────────
export function ServiceTeamSection({ services }: { services: SpragueService[] }) {
  const team = useMemo(() => {
    const m = new Map<string, { visits: number; last: string | null }>();
    for (const s of services) {
      if (!s.technician) continue;
      const cur = m.get(s.technician) || { visits: 0, last: null };
      cur.visits += 1;
      if (!cur.last || (s.service_date && s.service_date > cur.last)) cur.last = s.service_date;
      m.set(s.technician, cur);
    }
    return Array.from(m.entries())
      .map(([name, info]) => ({ name, ...info }))
      .sort((a, b) => b.visits - a.visits);
  }, [services]);

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-lg font-bold flex items-center gap-2">
          <Users className="w-5 h-5 text-primary" /> Service Team
        </h3>
        <p className="text-xs text-muted-foreground">
          Crest technicians who have serviced this account, each licensed and trained on commercial IPM.
        </p>
      </div>
      {team.length === 0 ? (
        <Card><CardContent className="p-6 text-sm text-muted-foreground text-center">
          No assigned technicians yet.
        </CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {team.map(t => (
            <Card key={t.name}>
              <CardContent className="p-4 flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/15 text-primary flex items-center justify-center font-bold text-sm shrink-0">
                  {t.name.split(" ").map(p => p[0]).slice(0, 2).join("").toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="font-bold text-sm truncate">{t.name}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {t.visits} visit{t.visits === 1 ? "" : "s"}
                    {t.last && ` · last ${fmtDay(t.last)}`}
                  </p>
                  <Badge variant="secondary" className="mt-1 text-[10px] gap-1">
                    <ShieldCheck className="w-3 h-3" /> CA Licensed Applicator
                  </Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// BUSINESS LICENSE — license documents from portal_documents
// ─────────────────────────────────────────────────────────────────────────────
export interface PortalDoc {
  id: string;
  title: string;
  description?: string | null;
  file_url: string;
  file_name?: string | null;
  category?: string | null;
  created_at: string;
}

export function BusinessLicenseSection({ docs }: { docs: PortalDoc[] }) {
  const licenses = docs.filter(d => (d.category || "").toLowerCase().includes("licens"));
  const standardLicenses = [
    { name: "California Structural Pest Control Board — Co. Reg.", number: "PR 9859", verified: "01/01/2025", url: "https://www.pestboard.ca.gov/" },
  ];
  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-lg font-bold flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-primary" /> Business Licenses
        </h3>
        <p className="text-xs text-muted-foreground">
          State pesticide business registrations and certifications kept on file for this account.
        </p>
      </div>
      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="bg-muted/60">
              <tr>
                <th className="text-left px-3 py-2 font-bold">License</th>
                <th className="text-left px-3 py-2 font-bold hidden sm:table-cell">Number</th>
                <th className="text-right px-3 py-2 font-bold">View</th>
              </tr>
            </thead>
            <tbody>
              {standardLicenses.map(l => (
                <tr key={l.name} className="border-t border-border">
                  <td className="px-3 py-2 font-medium">
                    <a href={l.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{l.name}</a>
                  </td>
                  <td className="px-3 py-2 hidden sm:table-cell text-muted-foreground">{l.number}</td>
                  <td className="px-3 py-2 text-right text-muted-foreground text-xs italic">On file</td>
                </tr>
              ))}
              {licenses.map(d => (
                <tr key={d.id} className="border-t border-border">
                  <td className="px-3 py-2 font-medium">{d.title}</td>
                  <td className="px-3 py-2 hidden sm:table-cell text-muted-foreground">{d.file_name || "—"}</td>
                  <td className="px-3 py-2 text-right">
                    <Button size="sm" variant="outline" className="h-8 text-xs gap-1"
                      onClick={() => window.open(d.file_url, "_blank", "noopener,noreferrer")}>
                      <ExternalLink className="w-3 h-3" /> Open
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// HELP / TUTORIAL
// ─────────────────────────────────────────────────────────────────────────────
export function HelpTutorialSection() {
  const faqs = [
    {
      q: "What's the Conditions Report?",
      a: "Every visit our technician notes sanitation, structural, or conducive issues that could attract pests. Items stay Open until they're resolved by whoever's responsible (Crest or your team).",
    },
    {
      q: "How do I report a pest sighting?",
      a: "Use the Pest Sightings tab — add the area, pest type, and a quick description. We get a notification immediately and triage on the next visit (or sooner if it's urgent).",
    },
    {
      q: "Where do I find SDS / safety sheets?",
      a: "Materials tab → Approved Materials. Every product is listed with active ingredient, EPA registration, and a one-click SDS link. There's also a Download All SDS button.",
    },
    {
      q: "Who do I call in an emergency?",
      a: "Call Crest 24/7 at (949) 424-5000. For non-urgent items use the Contact tab — it routes straight to the account manager.",
    },
  ];
  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-lg font-bold flex items-center gap-2">
          <HelpCircle className="w-5 h-5 text-primary" /> Help &amp; Tutorial
        </h3>
        <p className="text-xs text-muted-foreground">Quick answers and how to get more help from the team.</p>
      </div>
      <Card>
        <CardContent className="p-4 space-y-3">
          {faqs.map(f => (
            <details key={f.q} className="group border-b border-border last:border-0 pb-3 last:pb-0">
              <summary className="cursor-pointer list-none flex items-center justify-between gap-2 font-semibold text-sm">
                {f.q}
                <ChevronDown className="w-4 h-4 text-muted-foreground transition-transform group-open:rotate-180" />
              </summary>
              <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{f.a}</p>
            </details>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <a href="tel:9494245000" className="flex items-center gap-3 rounded-md border border-border px-3 py-2 hover:bg-muted/40">
            <Phone className="w-5 h-5 text-primary" />
            <div>
              <p className="font-bold text-sm">Call Crest</p>
              <p className="text-xs text-muted-foreground">(949) 424-5000 · 24/7</p>
            </div>
          </a>
          <a href="mailto:office@crestpestcontrol.com" className="flex items-center gap-3 rounded-md border border-border px-3 py-2 hover:bg-muted/40">
            <Mail className="w-5 h-5 text-primary" />
            <div>
              <p className="font-bold text-sm">Email the Office</p>
              <p className="text-xs text-muted-foreground">office@crestpestcontrol.com</p>
            </div>
          </a>
        </CardContent>
      </Card>
    </div>
  );
}

// Helper for admin views: persist a report_data PATCH + toast.
// Fetches the CURRENT report_data first and merges the patch over it —
// callers' props are often stale (saves elsewhere don't refresh them), and
// writing a whole blob built from a stale prop silently deletes sibling keys
// (e.g. a target_pests save wiping just-added conditions).
export async function persistServiceReportData(serviceId: string, patch: any) {
  const { data } = await supabase
    .from("portal_services")
    .select("report_data")
    .eq("id", serviceId)
    .maybeSingle();
  const fresh = (data?.report_data as any) || {};
  const { error } = await supabase
    .from("portal_services")
    .update({ report_data: { ...fresh, ...patch } })
    .eq("id", serviceId);
  if (error) {
    toast({ title: "Save failed", description: error.message, variant: "destructive" });
  }
}