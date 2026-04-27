import { ReadOnlyMapCanvas } from "@/components/ReadOnlyMapCanvas";
import { MapCanvas } from "@/components/MapCanvas";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ClipboardList, MapPin, Edit, Image as ImageIcon, FlaskConical, Bug, RotateCcw, Check, Loader2 } from "lucide-react";
import { MessageSquare } from "lucide-react";
import { normalizeUsageList, type ProductUsage } from "@/lib/productCatalog";
import { ProductUsageEditor } from "@/components/portal/ProductUsageEditor";
import { PesticideNotice } from "@/components/portal/PesticideNotice";
import { useState, useEffect, useRef } from "react";

/**
 * HOAServiceView — dedicated layout for HOA past + upcoming services.
 *
 * Replaces the dense per-unit cards used for apartments with a much simpler
 * three-zone layout the HOA board cares about:
 *   • Big editable / annotated community site map on the LEFT
 *   • Technician findings (read-only or editable) on the RIGHT
 *   • Compact unit chips at the BOTTOM listing which homes were treated
 *
 * The same component is rendered by both the admin portal (PropertyDashboard)
 * and the PM portal (PMPortalView). Pass `mode="admin"` to enable inline map
 * editing and findings editing; PM uses the read-only defaults.
 */

const TREATMENT_STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "To Be Treated",       label: "To Be Treated" },
  { value: "Treated - Complete",  label: "Treated" },
  { value: "Not Treated",         label: "Not Treated" },
];

export interface HOAUnitItem {
  unit_number: string;
  status?: string;
  follow_up_needed?: boolean;
  /** Pest the home is being serviced for (shown next to the unit number). */
  target_pest?: string;
}

export interface HOAServiceViewProps {
  /** "admin" allows inline map + findings editing; "pm" is fully read-only. */
  mode: "admin" | "pm";
  /** Whether this is an upcoming visit (true) or completed past visit (false). */
  isUpcoming: boolean;

  /** Map background image URL (community site plan). */
  mapUrl: string | null;
  /** PERMANENT site map annotations from the property profile (Site Map page).
   *  Acts as the default emblem layer for every service. */
  mapData: any;
  /** OPTIONAL per-service map overlay. When present, this is shown for the
   *  service instead of the property base map (so per-visit drawings stay
   *  scoped to that single service and do NOT leak into future services). */
  serviceMapData?: any;
  /** Called by admin to persist per-service map edits to this single service.
   *  PM does not pass this. Saves into the service, NEVER the property. */
  onSaveServiceMapData?: (canvasData: string) => Promise<void> | void;
  /** Called by admin to clear the per-service overlay and revert to the
   *  permanent site map. PM does not pass this. */
  onResetServiceMapData?: () => Promise<void> | void;

  /** Combined technician findings text (summary + findings + notes). */
  findings: string;
  /** Technician name shown in the findings header. */
  technician?: string | null;
  /** Called by admin to persist updated findings. PM does not pass this. */
  onChangeFindings?: (next: string) => void;

  /** Products used on this visit. */
  products?: any[];
  /** Optional read-only display list — usually the rolled-up service+unit
   *  totals. Used by the PM read-only table; the editor still binds to
   *  `products` so edits round-trip cleanly. */
  displayProducts?: any[];
  /** Admin-only — edit products used for this service (works for upcoming + past). */
  onChangeProducts?: (next: ProductUsage[]) => void;

  /** Units / homes scheduled or treated on this visit. */
  units: HOAUnitItem[];
  /** Admin-only — change a unit's treatment status. */
  onChangeUnitStatus?: (unitNumber: string, status: string) => void;

  /** Admin-only file picker handler for replacing the map background. */
  onUploadMapImage?: (file: File) => void;
  uploadingMap?: boolean;

  /**
   * Community Pest Sightings submitted since the last completed visit.
   * Rendered as the "Feedback from Community" card on upcoming visits so the
   * board (and assigned tech) sees what to incorporate into the next service.
   */
  communityFeedback?: Array<{
    id: string;
    created_at: string;
    pest_type?: string | null;
    location_type?: string | null;
    description?: string | null;
  }>;
}

export function HOAServiceView(props: HOAServiceViewProps) {
  const {
    mode,
    isUpcoming,
    mapUrl,
    mapData,
    serviceMapData,
    onSaveServiceMapData,
    onResetServiceMapData,
    findings,
    technician,
    onChangeFindings,
    products = [],
    displayProducts,
    units,
    onChangeUnitStatus,
    onUploadMapImage,
    uploadingMap,
    onChangeProducts,
    communityFeedback = [],
  } = props;

  const [isEditingMap, setIsEditingMap] = useState(false);
  const canEditMap = mode === "admin" && !!onSaveServiceMapData;
  const canEditFindings = mode === "admin" && !!onChangeFindings;
  const canEditProducts = mode === "admin" && !!onChangeProducts;

  // Tracks autosave state for the inline map editor so the admin gets a
  // clear "Saving… / Saved" pill instead of having to wonder whether their
  // emblem stuck.
  const [mapSaveState, setMapSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const savedTimerRef = useRef<number | null>(null);
  const handleMapAutoSave = async (canvasData: string) => {
    if (!onSaveServiceMapData) return;
    setMapSaveState("saving");
    try {
      await onSaveServiceMapData(canvasData);
      setMapSaveState("saved");
      if (savedTimerRef.current) window.clearTimeout(savedTimerRef.current);
      savedTimerRef.current = window.setTimeout(() => setMapSaveState("idle"), 1500);
    } catch {
      setMapSaveState("idle");
    }
  };
  useEffect(() => {
    return () => {
      if (savedTimerRef.current) window.clearTimeout(savedTimerRef.current);
    };
  }, []);

  // Per-service overlay takes precedence over the permanent site map.
  const hasServiceOverlay =
    serviceMapData != null &&
    !(typeof serviceMapData === "string" && serviceMapData.trim() === "");
  const effectiveMapData = hasServiceOverlay ? serviceMapData : mapData;
  // When admin opens the editor, seed the canvas with the per-service overlay
  // if one exists, otherwise start from the permanent site map so they don't
  // lose the existing emblems.
  const editorSeedData = effectiveMapData;

  // Local copy of findings so admin typing is instant; we debounce-persist
  // upstream via onChangeFindings (which writes to the DB).
  const [localFindings, setLocalFindings] = useState(findings);
  const lastSyncedRef = useRef(findings);
  useEffect(() => {
    // If the upstream value changed (e.g. another tab refreshed) and we
    // haven't got pending edits, mirror it locally.
    if (findings !== lastSyncedRef.current) {
      setLocalFindings(findings);
      lastSyncedRef.current = findings;
    }
  }, [findings]);
  useEffect(() => {
    if (!canEditFindings) return;
    if (localFindings === lastSyncedRef.current) return;
    const t = setTimeout(() => {
      lastSyncedRef.current = localFindings;
      onChangeFindings!(localFindings);
    }, 600);
    return () => clearTimeout(t);
  }, [localFindings, canEditFindings, onChangeFindings]);

  const productList = normalizeUsageList(products);
  const displayList = normalizeUsageList(displayProducts ?? products);

  return (
    <div className="space-y-4">
      {/* ─── Top zone: Map (left) + Findings (right) ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        {/* LEFT — Community site map (1/2 width) */}
        <div>
          <div className="rounded-xl border-2 border-emerald-400 bg-emerald-50/40 overflow-hidden shadow-md">
            <div className="px-3 py-2 bg-emerald-100/70 border-b-2 border-emerald-300 flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <MapPin className="w-5 h-5 text-emerald-700" />
                <p className="text-sm font-bold uppercase tracking-wide text-emerald-800">
                  Community Site Map
                  {hasServiceOverlay && (
                    <span className="ml-2 text-[10px] font-semibold text-emerald-700/80 normal-case tracking-normal">
                      (this visit's edits)
                    </span>
                  )}
                </p>
              </div>
              {canEditMap && (
                <div className="flex items-center gap-1.5">
                  {isEditingMap && mapSaveState !== "idle" && (
                    <span
                      className={`flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                        mapSaveState === "saving"
                          ? "bg-amber-100 text-amber-800"
                          : "bg-emerald-200 text-emerald-900"
                      }`}
                    >
                      {mapSaveState === "saving" ? (
                        <>
                          <Loader2 className="w-3 h-3 animate-spin" />
                          Saving…
                        </>
                      ) : (
                        <>
                          <Check className="w-3 h-3" />
                          Saved
                        </>
                      )}
                    </span>
                  )}
                  {hasServiceOverlay && !isEditingMap && onResetServiceMapData && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs"
                      onClick={() => {
                        if (
                          window.confirm(
                            "Clear this visit's map edits and revert to the permanent site map?"
                          )
                        ) {
                          onResetServiceMapData();
                        }
                      }}
                      title="Revert this service's map back to the permanent site map"
                    >
                      <RotateCcw className="w-3 h-3 mr-1" />
                      Revert
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant={isEditingMap ? "default" : "secondary"}
                    className="h-7 px-2 text-xs shadow-sm"
                    onClick={() => setIsEditingMap((v) => !v)}
                    disabled={!mapUrl}
                  >
                    <Edit className="w-3 h-3 mr-1" />
                    {isEditingMap ? "Done — Saved" : "Edit Map"}
                  </Button>
                </div>
              )}
            </div>
            <div
              className="relative bg-background w-full"
              style={{ aspectRatio: "3 / 4", height: 720, maxWidth: "100%" }}
              onPaste={
                canEditMap && onUploadMapImage
                  ? async (e) => {
                      const items = e.clipboardData?.items;
                      if (!items) return;
                      for (const item of Array.from(items)) {
                        if (item.type.startsWith("image/")) {
                          const file = item.getAsFile();
                          if (file) {
                            const renamed = new File(
                              [file],
                              `pasted-map-${Date.now()}.png`,
                              { type: file.type }
                            );
                            onUploadMapImage(renamed);
                            e.preventDefault();
                            break;
                          }
                        }
                      }
                    }
                  : undefined
              }
              onDragOver={
                canEditMap && onUploadMapImage
                  ? (e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }
                  : undefined
              }
              onDrop={
                canEditMap && onUploadMapImage
                  ? (e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      const file = e.dataTransfer?.files?.[0];
                      if (file && file.type.startsWith("image/")) {
                        onUploadMapImage(file);
                      }
                    }
                  : undefined
              }
              tabIndex={canEditMap ? 0 : undefined}
            >
              {mapUrl ? (
                isEditingMap && canEditMap ? (
                  <MapCanvas
                    mapUrl={mapUrl}
                    onSave={handleMapAutoSave}
                    initialData={
                      editorSeedData
                        ? typeof editorSeedData === "string"
                          ? editorSeedData
                          : JSON.stringify(editorSeedData)
                        : undefined
                    }
                  />
                ) : effectiveMapData ? (
                  <ReadOnlyMapCanvas mapUrl={mapUrl} mapData={effectiveMapData} />
                ) : (
                  <img
                    src={mapUrl}
                    alt="Community site map"
                    className="w-full h-full object-cover"
                  />
                )
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground gap-2 p-4 text-center">
                  <ImageIcon className="w-8 h-8 opacity-40" />
                  <p className="text-sm">No community site map uploaded yet.</p>
                  {canEditMap && (
                    <p className="text-xs opacity-70">
                      Drag, drop, or paste an image to add one.
                    </p>
                  )}
                </div>
              )}
              {canEditMap && onUploadMapImage && (
                <label className="absolute bottom-2 right-2 bg-background/90 rounded px-2 py-1.5 cursor-pointer hover:bg-background text-xs flex items-center gap-1 shadow-sm border">
                  <ImageIcon className="w-3.5 h-3.5" />
                  {uploadingMap ? "Uploading..." : mapUrl ? "Change" : "Upload"}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={uploadingMap}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) onUploadMapImage(f);
                    }}
                  />
                </label>
              )}
            </div>
            {canEditMap && (
              <div className="px-3 py-2 border-t bg-muted/30 text-[10.5px] text-muted-foreground text-center">
                {isEditingMap
                  ? "Add icons, draw, or erase. Edits save to THIS service only — they won't carry over to future visits."
                  : hasServiceOverlay
                    ? "This service has its own map edits. The permanent site map (used by future visits) is unchanged."
                    : "Edits made here apply only to this service. Update the permanent site map from the Site Map / Plan page."}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT — Findings + Products (2/5 width) */}
        <div className="space-y-3">
          {isUpcoming && communityFeedback.length > 0 && (
            <div className="rounded-xl border-2 border-amber-500/70 bg-amber-50/60 dark:bg-amber-500/[0.06] p-4 shadow-sm">
              <div className="flex items-center gap-1.5 mb-2">
                <MessageSquare className="w-4 h-4 text-amber-700 dark:text-amber-400" />
                <p className="text-xs font-bold uppercase tracking-wide text-amber-800 dark:text-amber-300">
                  Feedback from Community ({communityFeedback.length})
                </p>
              </div>
              <p className="text-[11px] text-muted-foreground mb-2 leading-snug">
                Community pest sightings submitted since the last visit. Incorporate these into this upcoming service.
              </p>
              <ul className="space-y-2">
                {communityFeedback.map((f) => {
                  const dateStr = (() => {
                    try { return new Date(f.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" }); }
                    catch { return ""; }
                  })();
                  // Strip the "[COMMUNITY SIGHTING] " tag the form prepends.
                  const cleanDesc = (f.description || "").replace(/^\[COMMUNITY SIGHTING\]\s*/i, "").trim();
                  return (
                    <li key={f.id} className="rounded-md border border-amber-300/60 bg-background/70 p-2">
                      <div className="flex items-start justify-between gap-2 mb-0.5">
                        <p className="text-[13px] font-semibold text-foreground">
                          {f.pest_type || "Pest activity"}
                          {f.location_type ? <span className="text-muted-foreground font-normal"> — {f.location_type}</span> : null}
                        </p>
                        {dateStr && <span className="text-[10px] text-muted-foreground shrink-0">{dateStr}</span>}
                      </div>
                      {cleanDesc && (
                        <p className="text-[12px] text-muted-foreground leading-snug whitespace-pre-wrap">{cleanDesc}</p>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          <div className="rounded-xl border-2 border-primary/70 bg-gradient-to-br from-primary/[0.06] to-transparent p-4 shadow-sm">
            <div className="flex items-center gap-1.5 mb-2">
              <ClipboardList className="w-4 h-4 text-primary" />
              <p className="text-xs font-bold uppercase tracking-wide text-primary">
                {isUpcoming ? "Visit Notes" : "Technician Findings"}
                {technician ? ` — ${technician}` : ""}
              </p>
            </div>
            {canEditFindings ? (
              <Textarea
                value={localFindings}
                onChange={(e) => setLocalFindings(e.target.value)}
                placeholder={
                  isUpcoming
                    ? "Notes for this upcoming community visit…"
                    : "Summary of what was treated, observations across the community, recommendations…"
                }
                className="text-sm min-h-[260px] resize-y bg-background"
              />
            ) : findings ? (
              <p className="text-sm whitespace-pre-wrap leading-relaxed font-medium text-foreground">
                {findings}
              </p>
            ) : (
              <p className="text-xs italic text-muted-foreground">
                {isUpcoming
                  ? "No notes yet for this visit."
                  : "No technician findings recorded for this visit."}
              </p>
            )}
          </div>

          {canEditProducts ? (
            <div>
              <p className="font-bold text-foreground uppercase text-[13px] tracking-wide mb-2 flex items-center gap-1.5">
                <FlaskConical className="w-3.5 h-3.5 text-primary" />
                Products Used (this service)
              </p>
              <div className="rounded-md border bg-background p-2">
                <ProductUsageEditor
                  value={productList}
                  onChange={(next) => onChangeProducts!(next)}
                />
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">
                Saved to this service only. Add what was (or will be) applied during the visit.
              </p>
            </div>
          ) : !isUpcoming && displayList.length > 0 && (
            <div>
              <p className="font-bold text-foreground uppercase text-[13px] tracking-wide mb-2 flex items-center gap-1.5">
                <FlaskConical className="w-3.5 h-3.5 text-primary" />
                Products Used (this service)
              </p>
              <div className="border rounded-md overflow-hidden">
                <table className="w-full text-[13px]">
                  <thead className="bg-muted/60">
                    <tr>
                      <th className="text-left px-3 py-2 font-bold">Product</th>
                      <th className="text-left px-3 py-2 font-bold">Applied (diluted)</th>
                      <th className="text-left px-3 py-2 font-bold">Undiluted (concentrate)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayList.map((p, i) => (
                      <tr key={i} className="border-t border-border">
                        <td className="px-3 py-2 font-semibold">{p.name}</td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {p.applied_amount != null ? `${p.applied_amount} ${p.applied_unit}` : "—"}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {p.undiluted_amount != null ? `${p.undiluted_amount} ${p.undiluted_unit}` : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ─── Bottom zone: Compact unit chips ─── */}
      <div className="rounded-lg border border-border bg-muted/20 p-3">
        <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
          <Bug className="w-3.5 h-3.5 text-primary" />
          {isUpcoming
            ? `Homes Scheduled${units.length ? ` (${units.length})` : ""}`
            : `Homes Treated${units.length ? ` (${units.length})` : ""}`}
        </p>
        {units.length === 0 ? (
          <p className="text-xs italic text-muted-foreground">
            {isUpcoming
              ? "No specific homes flagged for this visit yet."
              : "No specific homes recorded — this was a community-wide visit."}
          </p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {units.map((u, i) => {
              const isFollowUp = !!u.follow_up_needed;
              const editable =
                mode === "admin" && !!onChangeUnitStatus && isUpcoming;
              if (editable) {
                return (
                  <div
                    key={`${u.unit_number}-${i}`}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 bg-background ${
                      isFollowUp
                        ? "border-orange-500"
                        : "border-primary/60"
                    }`}
                  >
                    <span className="text-xs font-semibold">
                      {u.unit_number || "—"}
                    </span>
                    {u.target_pest && (
                      <span className="text-[11px] font-medium text-muted-foreground">
                        · {u.target_pest}
                      </span>
                    )}
                    <Select
                      value={u.status || "To Be Treated"}
                      onValueChange={(v) =>
                        onChangeUnitStatus!(u.unit_number, v)
                      }
                    >
                      <SelectTrigger className="h-6 text-[11px] px-1.5 border-0 bg-transparent w-auto min-w-[120px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TREATMENT_STATUS_OPTIONS.map((o) => (
                          <SelectItem key={o.value} value={o.value}>
                            {o.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                );
              }
              return (
                <Badge
                  key={`${u.unit_number}-${i}`}
                  variant="outline"
                  className={`text-xs font-semibold ${
                    isFollowUp
                      ? "border-orange-500 text-orange-700 bg-orange-50"
                      : "border-primary/60 bg-background"
                  }`}
                  title={u.target_pest || u.status || undefined}
                >
                  {u.unit_number || "—"}
                  {u.target_pest ? (
                    <span className="ml-1 font-normal text-muted-foreground">
                      · {u.target_pest}
                    </span>
                  ) : null}
                </Badge>
              );
            })}
          </div>
        )}
      </div>

      {!isUpcoming && <PesticideNotice />}
    </div>
  );
}