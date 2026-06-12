import { ReadOnlyMapCanvas } from "@/components/ReadOnlyMapCanvas";
import { MapCanvas } from "@/components/MapCanvas";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ClipboardList, MapPin, Edit, Image as ImageIcon, FlaskConical, Bug, RotateCcw, Check, Loader2, Upload, X, Film, Flag, AlertTriangle } from "lucide-react";
import { MessageSquare } from "lucide-react";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
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
  /** Admin-only immediate draft mirror so completing a visit never misses fast typing. */
  onDraftChange?: (draft: { findings?: string; products?: ProductUsage[] }) => void;

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
    photos?: any;
  }>;

  /** Service requests / work orders attached to this appointment. Upcoming = open requests, past = addressed snapshot. */
  serviceRequests?: Array<{
    id: string;
    created_at: string;
    pest_type?: string | null;
    location_type?: string | null;
    description?: string | null;
    unit_number?: string | null;
    request_type?: string | null;
    photos?: any;
  }>;

  /** Photos & videos attached to this appointment.
   *  Each entry: { url, type: 'image' | 'video', name? }. Visible to PM. */
  attachments?: Array<{ url: string; type?: "image" | "video"; name?: string; caption?: string }>;
  /** Admin-only — persist updated attachments list to portal_services.attachments. */
  onChangeAttachments?: (next: Array<{ url: string; type?: "image" | "video"; name?: string; caption?: string }>) => Promise<void> | void;

  /** Admin-only private notes for this single appointment.
   *  Stored on portal_services.office_notes. NEVER passed to PM mode. */
  officeNotes?: string;
  /** Admin-only — persist updated office notes. */
  onChangeOfficeNotes?: (next: string) => Promise<void> | void;
  /** Admin-only — emails office@crestpestcontrol.com with the office note. */
  onFlagOffice?: () => Promise<void> | void;
  /** Storage path prefix used when uploading attachments (e.g. property id). */
  attachmentsPathPrefix?: string;
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
    onDraftChange,
    communityFeedback = [],
    serviceRequests = [],
  } = props;

  const {
    attachments = [],
    onChangeAttachments,
    officeNotes = "",
    onChangeOfficeNotes,
    onFlagOffice,
    attachmentsPathPrefix,
  } = props;
  const { toast } = useToast();
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
  const productList = normalizeUsageList(products);
  const displayList = normalizeUsageList(displayProducts ?? products);
  const onChangeFindingsRef = useRef(onChangeFindings);
  const findingsTimerRef = useRef<number | null>(null);

  useEffect(() => { onChangeFindingsRef.current = onChangeFindings; }, [onChangeFindings]);

  // ─── Office notes (admin only) — local debounced persist ──────────────
  const canEditOfficeNotes = mode === "admin" && !!onChangeOfficeNotes;
  const [localOfficeNotes, setLocalOfficeNotes] = useState(officeNotes);
  const officeNotesSyncedRef = useRef(officeNotes);
  const officeNotesTimerRef = useRef<number | null>(null);
  useEffect(() => {
    if (officeNotes !== officeNotesSyncedRef.current) {
      setLocalOfficeNotes(officeNotes);
      officeNotesSyncedRef.current = officeNotes;
    }
  }, [officeNotes]);
  useEffect(() => {
    if (!canEditOfficeNotes) return;
    if (localOfficeNotes === officeNotesSyncedRef.current) return;
    if (officeNotesTimerRef.current) window.clearTimeout(officeNotesTimerRef.current);
    officeNotesTimerRef.current = window.setTimeout(async () => {
      const next = localOfficeNotes;
      officeNotesSyncedRef.current = next;
      await onChangeOfficeNotes?.(next);
    }, 400);
    return () => {
      if (officeNotesTimerRef.current) window.clearTimeout(officeNotesTimerRef.current);
    };
  }, [localOfficeNotes, canEditOfficeNotes, onChangeOfficeNotes]);

  // ─── Attachments (photos + videos) ────────────────────────────────────
  const canEditAttachments = mode === "admin" && !!onChangeAttachments;
  const [uploadingAttach, setUploadingAttach] = useState(false);
  const handleAttachmentUpload = async (files: FileList | null) => {
    if (!files || files.length === 0 || !onChangeAttachments) return;
    setUploadingAttach(true);
    try {
      const uploaded: Array<{ url: string; type: "image" | "video"; name: string }> = [];
      for (const file of Array.from(files)) {
        const isVideo = file.type.startsWith("video/");
        const ext = (file.name.split(".").pop() || (isVideo ? "mp4" : "jpg")).toLowerCase();
        const path = `${attachmentsPathPrefix || "service-attachments"}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("report-images")
          .upload(path, file, { contentType: file.type || (isVideo ? "video/mp4" : "image/jpeg"), upsert: false });
        if (upErr) {
          console.error("attachment upload failed", upErr);
          toast({ title: "Upload failed", description: upErr.message, variant: "destructive" });
          continue;
        }
        const { data: pub } = supabase.storage.from("report-images").getPublicUrl(path);
        uploaded.push({ url: pub.publicUrl, type: isVideo ? "video" : "image", name: file.name });
      }
      if (uploaded.length > 0) {
        await onChangeAttachments([...attachments, ...uploaded]);
        toast({ title: `Uploaded ${uploaded.length} file${uploaded.length === 1 ? "" : "s"}`, duration: 1500 });
      }
    } finally {
      setUploadingAttach(false);
    }
  };
  const removeAttachment = async (idx: number) => {
    if (!onChangeAttachments) return;
    if (!window.confirm("Remove this attachment?")) return;
    const next = attachments.filter((_, i) => i !== idx);
    await onChangeAttachments(next);
  };
  const updateAttachmentCaption = async (idx: number, caption: string) => {
    if (!onChangeAttachments) return;
    const next = attachments.map((att, i) => (i === idx ? { ...att, caption } : att));
    await onChangeAttachments(next);
  };

  // ─── Office flag email ────────────────────────────────────────────────
  const [flagging, setFlagging] = useState(false);
  const handleFlagOffice = async () => {
    if (!onFlagOffice) return;
    if (!localOfficeNotes.trim()) {
      toast({ title: "Add an office note first", description: "Type the issue you want to flag for the office.", variant: "destructive" });
      return;
    }
    if (!window.confirm("Email office@crestpestcontrol.com with these office notes?")) return;
    setFlagging(true);
    try {
      // Make sure the latest draft is persisted before we email it.
      if (canEditOfficeNotes && localOfficeNotes !== officeNotesSyncedRef.current) {
        officeNotesSyncedRef.current = localOfficeNotes;
        await onChangeOfficeNotes?.(localOfficeNotes);
      }
      await onFlagOffice();
      toast({ title: "Flagged for office", description: "Email sent to office@crestpestcontrol.com" });
    } catch (e: any) {
      toast({ title: "Flag failed", description: e?.message || "Could not send email", variant: "destructive" });
    } finally {
      setFlagging(false);
    }
  };

  useEffect(() => {
    if (!canEditFindings) return;
    if (localFindings === lastSyncedRef.current) return;
    if (findingsTimerRef.current) window.clearTimeout(findingsTimerRef.current);
    findingsTimerRef.current = window.setTimeout(async () => {
      const next = localFindings;
      lastSyncedRef.current = next;
      await onChangeFindingsRef.current?.(next);
    }, 350);
    return () => {
      if (findingsTimerRef.current) window.clearTimeout(findingsTimerRef.current);
    };
  }, [localFindings, canEditFindings]);

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
              className="relative bg-background mx-auto"
              style={{ aspectRatio: "3 / 4", width: "100%", maxWidth: 540, maxHeight: 720 }}
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
          {communityFeedback.length > 0 && (
            <div className="rounded-xl border-2 border-amber-500/70 bg-amber-50/60 dark:bg-amber-500/[0.06] p-4 shadow-sm">
              <div className="flex items-center gap-1.5 mb-2">
                <MessageSquare className="w-4 h-4 text-amber-700 dark:text-amber-400" />
                <p className="text-xs font-bold uppercase tracking-wide text-amber-800 dark:text-amber-300">
                  {isUpcoming
                    ? `Feedback from Community (${communityFeedback.length})`
                    : `Community Sightings Addressed (${communityFeedback.length})`}
                </p>
              </div>
              <p className="text-[11px] text-muted-foreground mb-2 leading-snug">
                {isUpcoming
                  ? "Community pest sightings submitted since the last visit. Incorporate these into this upcoming service."
                  : "Community pest sightings that were addressed on this visit."}
              </p>
              <ul className="space-y-2">
                {communityFeedback.map((f) => {
                  const dateStr = (() => {
                    try { return new Date(f.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }); }
                    catch { return ""; }
                  })();
                  // Strip the "[COMMUNITY SIGHTING] " tag the form prepends.
                  const cleanDesc = (f.description || "").replace(/^\[COMMUNITY SIGHTING\]\s*/i, "").trim();
                  const photos = Array.isArray(f.photos) ? f.photos : [];
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
                      {photos.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {photos.map((url: any, i: number) => {
                            const src = typeof url === "string" ? url : url?.url;
                            if (!src) return null;
                            return (
                              <a key={`${src}-${i}`} href={src} target="_blank" rel="noopener noreferrer" className="block w-14 h-14 rounded border overflow-hidden bg-muted">
                                <img src={src} alt={`Sighting photo ${i + 1}`} className="w-full h-full object-cover" loading="lazy" />
                              </a>
                            );
                          })}
                        </div>
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
                onChange={(e) => {
                  const next = e.target.value;
                  setLocalFindings(next);
                  onDraftChange?.({ findings: next });
                }}
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
                  onChange={(next) => {
                    onDraftChange?.({ products: next });
                    onChangeProducts!(next);
                  }}
                />
              </div>
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

      {/* ─── Bottom zone: Compact unit chips (always visible, discrete) ─── */}
      <div className="rounded-md border border-dashed border-border/60 bg-transparent px-3 py-2 text-muted-foreground">
        <p className="text-[10px] font-medium uppercase tracking-wide flex items-center gap-1.5 mb-2">
          <Bug className="w-3 h-3 opacity-60" />
          <span>
            {isUpcoming
              ? `Homes Scheduled${units.length ? ` (${units.length})` : ""}`
              : `Homes Treated${units.length ? ` (${units.length})` : ""}`}
          </span>
        </p>
        {units.length === 0 ? (
          <p className="text-[11px] italic text-muted-foreground">
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
                    <div className="inline-flex rounded-full border border-border bg-muted/30 p-0.5">
                      {[
                        { value: "Treated - Complete", label: "Completed" },
                        { value: "Not Treated", label: "Not Completed" },
                      ].map((o) => {
                        const active = (u.status || "To Be Treated") === o.value;
                        return (
                          <button
                            key={o.value}
                            type="button"
                            onClick={() => onChangeUnitStatus!(u.unit_number, o.value)}
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold transition-colors ${
                              active ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                            }`}
                          >
                            {o.label}
                          </button>
                        );
                      })}
                    </div>
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

      {/* ─── Attachments (photos + videos) — visible to PM, admin can edit ─── */}
      {(canEditAttachments || attachments.length > 0) && (
        <div className="rounded-xl border-2 border-blue-300 bg-blue-50/40 p-4 shadow-sm">
          <div className="flex items-center justify-between gap-2 mb-3">
            <p className="text-xs font-bold uppercase tracking-wide text-blue-900 flex items-center gap-1.5">
              <ImageIcon className="w-4 h-4" />
              Photos & Videos {attachments.length > 0 ? `(${attachments.length})` : ""}
            </p>
            {canEditAttachments && (
              <label className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-md border bg-background hover:bg-muted/40 cursor-pointer ${uploadingAttach ? "opacity-50 pointer-events-none" : ""}`}>
                {uploadingAttach ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                {uploadingAttach ? "Uploading…" : "Upload"}
                <input
                  type="file"
                  accept="image/*,video/*"
                  multiple
                  className="hidden"
                  disabled={uploadingAttach}
                  onChange={(e) => {
                    handleAttachmentUpload(e.target.files);
                    e.target.value = "";
                  }}
                />
              </label>
            )}
          </div>
          {attachments.length === 0 ? (
            <p className="text-xs italic text-muted-foreground">No attachments yet.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {attachments.map((att, i) => {
                const isVideo = att.type === "video" || /\.(mp4|webm|mov|m4v)$/i.test(att.url);
                return (
                  <div key={i} className="flex flex-col gap-1.5">
                    <div className="relative group rounded-md overflow-hidden border bg-background">
                      {isVideo ? (
                        <video
                          src={att.url}
                          controls
                          className="w-full h-56 sm:h-64 object-cover bg-black"
                        />
                      ) : (
                        <a href={att.url} target="_blank" rel="noopener noreferrer">
                          <img src={att.url} alt={att.caption || att.name || "Attachment"} className="w-full h-56 sm:h-64 object-cover" />
                        </a>
                      )}
                      <div className="absolute top-1 left-1 bg-background/90 rounded px-1.5 py-0.5 text-[10px] font-semibold flex items-center gap-1">
                        {isVideo ? <Film className="w-3 h-3" /> : <ImageIcon className="w-3 h-3" />}
                        {isVideo ? "Video" : "Photo"}
                      </div>
                      {canEditAttachments && (
                        <button
                          type="button"
                          onClick={() => removeAttachment(i)}
                          className="absolute top-1 right-1 bg-red-600 hover:bg-red-700 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                          title="Remove"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                    {canEditAttachments ? (
                      <input
                        type="text"
                        defaultValue={att.caption || ""}
                        placeholder="Add caption / context…"
                        onBlur={(e) => {
                          const val = e.target.value.trim();
                          if (val !== (att.caption || "")) updateAttachmentCaption(i, val);
                        }}
                        className="w-full text-[11px] px-2 py-1 rounded border bg-background focus:outline-none focus:ring-1 focus:ring-blue-400"
                      />
                    ) : att.caption ? (
                      <p className="text-[11px] text-foreground/80 leading-snug px-0.5 whitespace-pre-wrap">{att.caption}</p>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ─── Office Only Notes (admin only — never shown to PM) ─── */}
      {mode === "admin" && (canEditOfficeNotes || onFlagOffice) && (
        <div className="rounded-xl border-2 border-red-500 bg-red-50/60 p-4 shadow-sm">
          <div className="flex items-center justify-between gap-2 mb-2">
            <p className="text-xs font-bold uppercase tracking-wide text-red-900 flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4" />
              Office Only Notes — Per Appointment
            </p>
            {onFlagOffice && (
              <Button
                size="sm"
                variant="destructive"
                className="h-8 text-xs"
                onClick={handleFlagOffice}
                disabled={flagging}
              >
                {flagging ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Flag className="w-3.5 h-3.5 mr-1" />}
                {flagging ? "Sending…" : "Flag for Office"}
              </Button>
            )}
          </div>
          <p className="text-[11px] text-red-900/80 mb-2 leading-snug">
            Private notes for this appointment. Never shown to the property manager. Use "Flag for Office" to email office@crestpestcontrol.com.
          </p>
          {canEditOfficeNotes ? (
            <Textarea
              value={localOfficeNotes}
              onChange={(e) => setLocalOfficeNotes(e.target.value)}
              placeholder="Issue, scheduling concern, callback needed…"
              className="text-sm min-h-[90px] resize-y bg-background border-red-300 focus-visible:ring-red-400"
            />
          ) : officeNotes ? (
            <p className="text-sm whitespace-pre-wrap text-red-900 font-medium">{officeNotes}</p>
          ) : (
            <p className="text-xs italic text-muted-foreground">No office notes yet.</p>
          )}
        </div>
      )}
    </div>
  );
}