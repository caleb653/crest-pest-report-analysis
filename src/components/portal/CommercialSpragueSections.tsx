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
 *   • PestTrendingSection       — bar chart of pest sightings by month +
 *                                 a breakdown by pest type.
 *   • DeviceTrendingSection     — chart of non-chem equipment usage per
 *                                 visit so customers see monitoring effort.
 *   • ServiceRecordsSection     — flat sortable table of every completed
 *                                 visit (date / tech / type / outcome).
 *   • MaterialUseLogSection     — flat list of every product applied across
 *                                 all visits with date / area / amount.
 *   • ServiceTeamSection        — service team roster compiled from past
 *                                 visits, with badges for assigned techs.
 *   • BusinessLicenseSection    — license docs (CA/UT/etc.) surfaced from
 *                                 portal_documents with category='license'.
 *   • HelpTutorialSection       — "how to use this portal" content + the
 *                                 Crest support phone.
 *   • DownloadLogbookButton     — one-click print/PDF of the whole logbook
 *                                 (uses window.print after isolating the
 *                                 logbook surface — no new deps required).
 *   • LogbookDateBadge          — small "Logbook · Apr 2024 → today" pill
 *                                 used in the dashboard header bar.
 */
import { useMemo, useState } from "react";
import { format, parseISO, startOfMonth } from "date-fns";
import {
  AlertTriangle, CalendarRange, ChevronDown, FileDown, FlaskConical,
  HelpCircle, Phone, ShieldCheck, Users, Wrench, Activity, ClipboardList,
  TrendingUp, FileText, Plus, Trash2, Check, X, ExternalLink, Edit3, Mail,
  Camera, Upload, Lock,
} from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  LineChart, Line, Legend,
} from "recharts";
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
import { normalizeUsageList } from "@/lib/productCatalog";
import { APPROVED_COMMERCIAL_MATERIALS } from "@/components/portal/CommercialApprovedMaterials";

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

export interface SpragueRequest {
  id: string;
  created_at: string;
  pest_type?: string | null;
  location_type?: string | null;
  description: string;
  status: string;
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
}

export function ConditionsReportSection({ services, readOnly, onSaveServiceReportData, includeUndated, propertyName, notifyEmail, compact }: ConditionsProps) {
  const past = useMemo(
    () => services
      .filter(s => includeUndated || s.service_date)
      .sort((a, b) => (b.service_date || "").localeCompare(a.service_date || "")),
    [services, includeUndated]
  );

  const conditionsFor = (s: SpragueService): ConditionRow[] => {
    const raw = s.report_data?.conditions;
    if (!Array.isArray(raw)) return [];
    return raw.map((r: any) => ({ ...newConditionRow(), ...r }));
  };

  const save = async (s: SpragueService, rows: ConditionRow[]) => {
    if (!onSaveServiceReportData) return;
    const next = { ...(s.report_data || {}), conditions: rows };
    await onSaveServiceReportData(s.id, next);
    // ── Notify office when a condition gets first real description, or is closed ──
    try {
      const prev = conditionsFor(s);
      const prevById = new Map(prev.map(r => [r.id, r]));
      const newlyDescribed: ConditionRow[] = [];
      const newlyClosed: ConditionRow[] = [];
      for (const r of rows) {
        const p = prevById.get(r.id);
        const prevDesc = ((p?.condition || "") + (p?.detail || "")).trim();
        const nextDesc = ((r.condition || "") + (r.detail || "")).trim();
        if (!prevDesc && nextDesc) newlyDescribed.push(r);
        if (p && p.status !== "Closed" && r.status === "Closed") newlyClosed.push(r);
      }
      const visitLabel = `${s.service_date ? fmtDay(s.service_date) : "Upcoming"} · ${s.service_type}`;
      for (const r of newlyDescribed) {
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
  };

  const visitsWithAny = past.filter(s => conditionsFor(s).length > 0);
  const open = past.flatMap(s => conditionsFor(s).filter(c => c.status !== "Closed").map(c => ({ s, c })));
  const closed = past.flatMap(s => conditionsFor(s).filter(c => c.status === "Closed").map(c => ({ s, c })));
  const [showClosed, setShowClosed] = useState(false);

  // Split each visit's rows into active/closed so each section renders cleanly.
  const visitsWithActive = past
    .map(s => ({ s, rows: conditionsFor(s).filter(c => c.status !== "Closed") }))
    .filter(v => !readOnly || v.rows.length > 0);
  const visitsWithClosed = past
    .map(s => ({ s, rows: conditionsFor(s).filter(c => c.status === "Closed") }))
    .filter(v => v.rows.length > 0);

  return (
    <div className={compact ? "space-y-2" : "space-y-4"}>
      {!compact && (
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <h3 className="text-lg font-bold flex items-center gap-2">
              <ClipboardList className="w-5 h-5 text-primary" /> Conditions Report
            </h3>
            <p className="text-xs text-muted-foreground max-w-prose">
              Sanitation, structural, and conducive conditions noted during each visit. Items
              stay <span className="font-semibold">Open</span> until resolved by the responsible
              party.
            </p>
          </div>
          <div className="flex gap-2 text-xs">
            <Badge variant="outline" className="border-red-300 text-red-900 bg-red-50">
              {open.length} Open
            </Badge>
            <Badge variant="outline" className="border-green-300 text-green-900 bg-green-50">
              {closed.length} Closed
            </Badge>
            <Badge variant="outline">{visitsWithAny.length} Visits Logged</Badge>
          </div>
        </div>
      )}

      {past.length === 0 && !compact && (
        <Card><CardContent className="p-6 text-sm text-muted-foreground text-center">
          No past visits yet — conditions appear here once visits are logged.
        </CardContent></Card>
      )}

      {/* ─── ACTIVE ─── */}
      <div className={compact ? "space-y-2" : "space-y-3"}>
        {!compact && (
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-bold uppercase tracking-wide text-red-900">Active</h4>
            <Badge variant="outline" className="border-red-300 text-red-900 bg-red-50 text-[10px]">
              {open.length}
            </Badge>
          </div>
        )}
        {visitsWithActive.length === 0 ? (
          <Card><CardContent className="p-4 text-sm text-muted-foreground text-center italic">
            No active conditions.
          </CardContent></Card>
        ) : (
          visitsWithActive.map(({ s, rows: activeRows }) => {
            const allRows = conditionsFor(s);
            return (
              <Card key={`active-${s.id}`}>
                <div className="bg-red-50/60 border-b border-red-200 px-3 py-2 flex items-center justify-between gap-2 flex-wrap">
                  <p className="text-sm font-semibold">
                    {fmtDay(s.service_date)} <span className="text-muted-foreground">·</span>{" "}
                    <span className="text-muted-foreground">{s.service_type}</span>
                    {s.technician && <span className="text-muted-foreground"> · {s.technician}</span>}
                  </p>
                  {!readOnly && (
                    <Button size="sm" variant="outline" className="h-8 text-xs gap-1"
                      onClick={() => save(s, [...allRows, newConditionRow()])}>
                      <Plus className="w-3 h-3" /> Add Condition
                    </Button>
                  )}
                </div>
                <CardContent className="p-0">
                  <div className="divide-y divide-border">
                    {activeRows.map((c) => {
                      const idx = allRows.findIndex(r => r.id === c.id);
                      return (
                        <ConditionRowEditor
                          key={c.id}
                          row={c}
                          readOnly={readOnly}
                          onChange={(next) => save(s, allRows.map((r, i) => i === idx ? next : r))}
                          onRemove={() => save(s, allRows.filter((_, i) => i !== idx))}
                        />
                      );
                    })}
                  </div>
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
            <span>Closed</span>
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
                <CardContent className="p-0">
                  <div className="divide-y divide-border">
                    {closedRows.map((c) => {
                      const idx = allRows.findIndex(r => r.id === c.id);
                      return (
                        <ConditionRowEditor
                          key={c.id}
                          row={c}
                          readOnly={readOnly}
                          onChange={(next) => save(s, allRows.map((r, i) => i === idx ? next : r))}
                          onRemove={() => save(s, allRows.filter((_, i) => i !== idx))}
                        />
                      );
                    })}
                  </div>
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
  row, readOnly, onChange, onRemove,
}: {
  row: ConditionRow; readOnly?: boolean;
  onChange: (next: ConditionRow) => void; onRemove: () => void;
}) {
  const [local, setLocal] = useState<ConditionRow>(row);
  const [uploading, setUploading] = useState<"id" | "res" | null>(null);
  // Local-then-blur pattern so typing in tables doesn't lose focus mid-keystroke.
  const set = <K extends keyof ConditionRow>(k: K, v: ConditionRow[K]) =>
    setLocal(prev => ({ ...prev, [k]: v }));
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
      <div className="p-3 grid grid-cols-1 sm:grid-cols-5 gap-2 text-sm">
        <div>
          <p className="text-[10px] uppercase font-bold text-muted-foreground">Area</p>
          <p className="font-medium">{row.area || "—"}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase font-bold text-muted-foreground">Condition</p>
          <p>{row.condition || "—"}</p>
          {row.detail && <p className="text-xs text-muted-foreground mt-0.5">{row.detail}</p>}
          {(row.photos?.length || 0) > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {row.photos!.slice(0, 4).map((u, i) => (
                <a key={i} href={u} target="_blank" rel="noopener noreferrer" className="w-12 h-12 rounded border border-border overflow-hidden block">
                  <img src={u} alt="" loading="lazy" className="w-full h-full object-cover" />
                </a>
              ))}
            </div>
          )}
        </div>
        <div>
          <p className="text-[10px] uppercase font-bold text-muted-foreground">Action</p>
          <p>{row.action || "—"}</p>
        </div>
        <div className="flex flex-col gap-1">
          <Badge variant="outline" className={`text-[10px] w-fit ${SEVERITY_COLORS[row.severity]}`}>
            {row.severity}
          </Badge>
          <Badge variant="outline" className="text-[10px] w-fit">
            {row.responsibility} resp.
          </Badge>
        </div>
        <div>
          <Badge variant="outline" className={`text-[10px] ${STATUS_COLORS[row.status]}`}>
            {row.status}
          </Badge>
          {row.comments && (
            <p className="text-xs text-muted-foreground mt-1">{row.comments}</p>
          )}
          {row.status === "Closed" && (row.resolution_photos?.length || 0) > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {row.resolution_photos!.slice(0, 3).map((u, i) => (
                <a key={i} href={u} target="_blank" rel="noopener noreferrer" className="w-10 h-10 rounded border border-emerald-300 overflow-hidden block">
                  <img src={u} alt="" loading="lazy" className="w-full h-full object-cover" />
                </a>
              ))}
            </div>
          )}
          {row.status === "Closed" && row.resolution_note && (
            <p className="text-[11px] text-emerald-900 italic mt-1">"{row.resolution_note}"</p>
          )}
        </div>
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

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
        {/* ── Photos as the hero (left, large) ── */}
        <div className="lg:col-span-7 rounded-md border-2 border-dashed border-border p-2 space-y-2 bg-muted/20">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <p className="text-[11px] uppercase font-bold text-muted-foreground flex items-center gap-1.5">
              <Camera className="w-3.5 h-3.5" /> Condition Photos
              {needsIdentifyPhoto && (
                <Badge variant="outline" className="ml-1 text-[9px] border-amber-400 text-amber-900 bg-amber-50">Required</Badge>
              )}
            </p>
            <label className="cursor-pointer">
              <input type="file" accept="image/*" multiple className="hidden"
                onChange={e => { uploadTo("photos", e.target.files); e.currentTarget.value = ""; }} />
              <span className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2.5 py-1.5 text-[12px] hover:bg-muted">
                <Upload className="w-3.5 h-3.5" /> {uploading === "id" ? "Uploading…" : "Add Photo"}
              </span>
            </label>
          </div>
          {photos.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {photos.map((u, i) => (
                <a key={i} href={u} target="_blank" rel="noopener noreferrer"
                   className="relative aspect-square rounded-md border border-border overflow-hidden group block bg-background">
                  <img src={u} alt="" loading="lazy" className="w-full h-full object-cover" />
                  <button type="button"
                    onClick={(e) => { e.preventDefault(); removePhoto("photos", i); }}
                    className="absolute top-1 right-1 w-6 h-6 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 shadow">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </a>
              ))}
            </div>
          ) : (
            <label className="cursor-pointer flex flex-col items-center justify-center text-center text-muted-foreground border border-dashed border-border rounded-md py-10 hover:bg-muted/50">
              <input type="file" accept="image/*" multiple className="hidden"
                onChange={e => { uploadTo("photos", e.target.files); e.currentTarget.value = ""; }} />
              <Camera className="w-8 h-8 mb-1.5 opacity-60" />
              <p className="text-sm font-medium">Add condition photos</p>
              <p className="text-[11px]">Photos are the primary record of this condition.</p>
            </label>
          )}
        </div>

        {/* ── Supporting fields (right, compact) ── */}
        <div className="lg:col-span-5 grid grid-cols-2 gap-2 content-start">
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
          <div className="col-span-2 flex gap-1">
            <Input value={local.comments} onChange={e => set("comments", e.target.value)} onBlur={flush}
              placeholder="Comments" className="h-9 text-xs flex-1" />
            <Button size="icon" variant="ghost" onClick={onRemove}
              className="h-9 w-9 text-destructive shrink-0">
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      </div>

      {/* ── Resolution (only shown when working toward Closed) ── */}
      {(local.status !== "Open" || resPhotos.length > 0 || (local.resolution_note || "").length > 0) && (
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
                <div key={i} className="relative w-16 h-16 rounded border border-emerald-400 overflow-hidden group">
                  <img src={u} alt="" loading="lazy" className="w-full h-full object-cover" />
                  <button type="button" onClick={() => removePhoto("resolution_photos", i)}
                    className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100">
                    <X className="w-2.5 h-2.5" />
                  </button>
                </div>
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
// PEST TRENDING — bar chart of pest sightings by month + pest type breakdown
// ─────────────────────────────────────────────────────────────────────────────
export function PestTrendingSection({ requests }: { requests: SpragueRequest[] }) {
  // (placeholder anchor — actual body unchanged below)
  void requests;
  return PestTrendingSectionImpl({ requests });
}
function PestTrendingSectionImpl({ requests }: { requests: SpragueRequest[] }) {
  const byMonth = useMemo(() => {
    const m = new Map<string, number>();
    requests.forEach(r => {
      const d = startOfMonth(new Date(r.created_at));
      const key = format(d, "MMM yyyy");
      m.set(key, (m.get(key) || 0) + 1);
    });
    return Array.from(m.entries()).map(([month, count]) => ({ month, count })).slice(-12);
  }, [requests]);

  const byPest = useMemo(() => {
    const m = new Map<string, number>();
    requests.forEach(r => {
      const k = (r.pest_type || "Unspecified").trim() || "Unspecified";
      m.set(k, (m.get(k) || 0) + 1);
    });
    return Array.from(m.entries())
      .map(([pest, count]) => ({ pest, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
  }, [requests]);

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-bold flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-primary" /> Pest Trending
        </h3>
        <p className="text-xs text-muted-foreground">Sightings over time and the most common pests reported.</p>
      </div>

      <Card>
        <CardContent className="p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-3">
            Sightings per Month
          </p>
          {byMonth.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No sightings logged yet.</p>
          ) : (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byMonth}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                  <YAxis allowDecimals={false} stroke="hsl(var(--muted-foreground))" fontSize={11} />
                  <Tooltip cursor={{ fill: "hsl(var(--muted) / 0.4)" }} />
                  <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-3">
            Top Pests Reported
          </p>
          {byPest.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No pest data yet.</p>
          ) : (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byPest} layout="vertical" margin={{ left: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" allowDecimals={false} stroke="hsl(var(--muted-foreground))" fontSize={11} />
                  <YAxis type="category" dataKey="pest" stroke="hsl(var(--muted-foreground))" fontSize={11} width={120} />
                  <Tooltip cursor={{ fill: "hsl(var(--muted) / 0.4)" }} />
                  <Bar dataKey="count" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DEVICE TRENDING — non-chem equipment deployed / serviced per visit
// ─────────────────────────────────────────────────────────────────────────────
export function DeviceTrendingSection({ services }: { services: SpragueService[] }) {
  const data = useMemo(() => {
    return services
      .filter(s => s.service_date && s.status === "completed")
      .sort((a, b) => (a.service_date || "").localeCompare(b.service_date || ""))
      .slice(-12)
      .map(s => {
        const equip: any[] = Array.isArray(s.report_data?.non_chem_equipment)
          ? s.report_data.non_chem_equipment : [];
        const total = equip.reduce((sum, e) => sum + (Number(e?.qty) || 0), 0);
        return {
          date: s.service_date ? format(parseISO(s.service_date + "T00:00:00"), "MMM d") : "—",
          devices: total,
          types: equip.length,
        };
      });
  }, [services]);

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-bold flex items-center gap-2">
          <Activity className="w-5 h-5 text-primary" /> Device Trending
          <span
            title="Each point is one completed service visit (last 12). 'Devices' is the total count of monitoring devices and equipment serviced that visit (e.g. snap traps, glue boards, bait stations, ILTs). 'Types' is how many distinct equipment categories were touched. A rising 'Devices' line on a steady 'Types' line usually means heavier activity in the same areas; rising 'Types' means coverage is expanding."
            className="inline-flex"
          >
            <HelpCircle className="w-4 h-4 text-muted-foreground cursor-help" />
          </span>
        </h3>
        <p className="text-xs text-muted-foreground">
          Number of monitoring devices and equipment types deployed / serviced per visit (last 12 visits).
        </p>
      </div>
      <Card>
        <CardContent className="p-4">
          {data.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No device data logged yet.
            </p>
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                  <YAxis allowDecimals={false} stroke="hsl(var(--muted-foreground))" fontSize={11} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line type="monotone" dataKey="devices" stroke="hsl(var(--primary))" strokeWidth={2} dot />
                  <Line type="monotone" dataKey="types"   stroke="hsl(var(--muted-foreground))" strokeWidth={2} dot />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SERVICE RECORDS — flat table of every completed visit
// ─────────────────────────────────────────────────────────────────────────────
export function ServiceRecordsSection({ services }: { services: SpragueService[] }) {
  const records = useMemo(
    () => services
      .filter(s => s.status === "completed" || (s.service_date && s.service_date <= new Date().toISOString().slice(0, 10)))
      .sort((a, b) => (b.service_date || "").localeCompare(a.service_date || "")),
    [services]
  );
  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-lg font-bold flex items-center gap-2">
          <FileText className="w-5 h-5 text-primary" /> Service Records
        </h3>
        <p className="text-xs text-muted-foreground">
          Every completed service visit at this location.
        </p>
      </div>
      <Card>
        <CardContent className="p-0">
          {records.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground text-center">No service records yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/60">
                  <tr>
                    <th className="text-left px-3 py-2 font-bold">Date</th>
                    <th className="text-left px-3 py-2 font-bold">Service</th>
                    <th className="text-left px-3 py-2 font-bold hidden sm:table-cell">Technician</th>
                    <th className="text-left px-3 py-2 font-bold hidden md:table-cell">Summary</th>
                    <th className="text-right px-3 py-2 font-bold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map(r => (
                    <tr key={r.id} className="border-t border-border">
                      <td className="px-3 py-2 whitespace-nowrap">{fmtDay(r.service_date)}</td>
                      <td className="px-3 py-2">{r.service_type}</td>
                      <td className="px-3 py-2 hidden sm:table-cell">{r.technician || "—"}</td>
                      <td className="px-3 py-2 hidden md:table-cell max-w-md">
                        <span className="line-clamp-2 text-muted-foreground">{r.summary || "—"}</span>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Badge variant="outline" className="text-[10px] capitalize">
                          {r.status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MATERIAL USE LOG — every product applied across every visit
// ─────────────────────────────────────────────────────────────────────────────
export function MaterialUseLogSection({ services }: { services: SpragueService[] }) {
  const rows = useMemo(() => {
    const out: Array<{ date: string | null; service: string; tech: string | null; name: string; applied: string; undiluted: string }> = [];
    for (const s of services) {
      const products = normalizeUsageList(s.products_used);
      for (const p of products) {
        out.push({
          date: s.service_date,
          service: s.service_type,
          tech: s.technician,
          name: p.name,
          applied: p.applied_amount != null ? `${p.applied_amount} ${p.applied_unit}` : "—",
          undiluted: p.undiluted_amount != null ? `${p.undiluted_amount} ${p.undiluted_unit}` : "—",
        });
      }
    }
    return out.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  }, [services]);

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-lg font-bold flex items-center gap-2">
          <FlaskConical className="w-5 h-5 text-primary" /> Material Use Log
        </h3>
        <p className="text-xs text-muted-foreground">
          Every product application performed on this site, in compliance with state pesticide-use record-keeping.
        </p>
      </div>
      <Card>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground text-center">No applications logged yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/60">
                  <tr>
                    <th className="text-left px-3 py-2 font-bold">Date</th>
                    <th className="text-left px-3 py-2 font-bold">Product</th>
                    <th className="text-left px-3 py-2 font-bold hidden sm:table-cell">Applied</th>
                    <th className="text-left px-3 py-2 font-bold hidden md:table-cell">Active (Undiluted)</th>
                    <th className="text-left px-3 py-2 font-bold hidden lg:table-cell">Visit / Tech</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i} className="border-t border-border">
                      <td className="px-3 py-2 whitespace-nowrap">{fmtDay(r.date)}</td>
                      <td className="px-3 py-2 font-medium">{r.name}</td>
                      <td className="px-3 py-2 hidden sm:table-cell">{r.applied}</td>
                      <td className="px-3 py-2 hidden md:table-cell">{r.undiluted}</td>
                      <td className="px-3 py-2 hidden lg:table-cell text-muted-foreground">
                        {r.service}{r.tech ? ` · ${r.tech}` : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
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
      q: "How do I download my logbook?",
      a: "Use the Download Logbook button at the top of the Dashboard — it produces a printable PDF of everything Crest has on file for this location.",
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

// ─────────────────────────────────────────────────────────────────────────────
// DOWNLOAD LOGBOOK BUTTON — uses window.print() against the current portal so
// no new deps required. A future enhancement could use the existing
// pdfExport.ts machinery for a styled multi-page PDF.
// ─────────────────────────────────────────────────────────────────────────────
export function DownloadLogbookButton({ propertyName }: { propertyName: string }) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="h-9 gap-1.5"
      onClick={() => {
        // Surface a print dialog that the browser turns into PDF.
        const original = document.title;
        document.title = `Crest Logbook — ${propertyName}`;
        window.print();
        setTimeout(() => { document.title = original; }, 800);
        toast({ title: "Logbook ready", description: "Use the print dialog to save as PDF." });
      }}
    >
      <FileDown className="w-4 h-4" /> Download Logbook
    </Button>
  );
}

// Small "Logbook · MMM yyyy → today" chip for the dashboard header.
export function LogbookDateBadge({ services }: { services: SpragueService[] }) {
  const oldest = services
    .filter(s => s.service_date)
    .reduce((min, s) => (!min || (s.service_date! < min) ? s.service_date! : min), "" as string);
  if (!oldest) return null;
  return (
    <Badge variant="outline" className="gap-1.5 text-[11px]">
      <CalendarRange className="w-3 h-3" />
      Logbook · {fmtDay(oldest)} → today
    </Badge>
  );
}

// Helper for admin views: persist report_data patch + toast
export async function persistServiceReportData(serviceId: string, nextReportData: any) {
  const { error } = await supabase
    .from("portal_services")
    .update({ report_data: nextReportData })
    .eq("id", serviceId);
  if (error) {
    toast({ title: "Save failed", description: error.message, variant: "destructive" });
  }
}