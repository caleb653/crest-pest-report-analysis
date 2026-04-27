import { ReadOnlyMapCanvas } from "@/components/ReadOnlyMapCanvas";
import { MapCanvas } from "@/components/MapCanvas";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ClipboardList, MapPin, Edit, Image as ImageIcon, FlaskConical, Bug } from "lucide-react";
import { ProductUsageSummary } from "@/components/portal/ProductUsageSummary";
import { normalizeUsageList } from "@/lib/productCatalog";
import { PesticideNotice } from "@/components/portal/PesticideNotice";
import { useState } from "react";

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
  { value: "Treated - Complete",  label: "Treated - Free and Clear" },
  { value: "Complete",            label: "Complete" },
  { value: "Not Treated",         label: "Not Treated" },
];

export interface HOAUnitItem {
  unit_number: string;
  status?: string;
  follow_up_needed?: boolean;
}

export interface HOAServiceViewProps {
  /** "admin" allows inline map + findings editing; "pm" is fully read-only. */
  mode: "admin" | "pm";
  /** Whether this is an upcoming visit (true) or completed past visit (false). */
  isUpcoming: boolean;

  /** Map background image URL (community site plan). */
  mapUrl: string | null;
  /** Persisted map annotations / drawings, if any. */
  mapData: any;
  /** Called by admin to persist map edits. PM does not pass this. */
  onSaveMapData?: (canvasData: string) => Promise<void> | void;

  /** Combined technician findings text (summary + findings + notes). */
  findings: string;
  /** Technician name shown in the findings header. */
  technician?: string | null;
  /** Called by admin to persist updated findings. PM does not pass this. */
  onChangeFindings?: (next: string) => void;

  /** Products used on this visit (ignored when isUpcoming). */
  products?: any[];

  /** Units / homes scheduled or treated on this visit. */
  units: HOAUnitItem[];
  /** Admin-only — change a unit's treatment status. */
  onChangeUnitStatus?: (unitNumber: string, status: string) => void;

  /** Admin-only file picker handler for replacing the map background. */
  onUploadMapImage?: (file: File) => void;
  uploadingMap?: boolean;
}

export function HOAServiceView(props: HOAServiceViewProps) {
  const {
    mode,
    isUpcoming,
    mapUrl,
    mapData,
    onSaveMapData,
    findings,
    technician,
    onChangeFindings,
    products = [],
    units,
    onChangeUnitStatus,
    onUploadMapImage,
    uploadingMap,
  } = props;

  const [isEditingMap, setIsEditingMap] = useState(false);
  const canEditMap = mode === "admin" && !!onSaveMapData;
  const canEditFindings = mode === "admin" && !!onChangeFindings;

  const productList = normalizeUsageList(products);

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
                </p>
              </div>
              {canEditMap && (
                <Button
                  size="sm"
                  variant={isEditingMap ? "default" : "secondary"}
                  className="h-7 px-2 text-xs shadow-sm"
                  onClick={() => setIsEditingMap((v) => !v)}
                  disabled={!mapUrl}
                >
                  <Edit className="w-3 h-3 mr-1" />
                  {isEditingMap ? "Done" : "Edit Map"}
                </Button>
              )}
            </div>
            <div
              className="relative bg-background w-full"
              style={{ minHeight: 480, height: "60vh" }}
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
                    onSave={onSaveMapData}
                    initialData={
                      mapData
                        ? typeof mapData === "string"
                          ? mapData
                          : JSON.stringify(mapData)
                        : undefined
                    }
                  />
                ) : mapData ? (
                  <ReadOnlyMapCanvas mapUrl={mapUrl} mapData={mapData} />
                ) : (
                  <img
                    src={mapUrl}
                    alt="Community site map"
                    className="w-full h-full object-contain"
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
                  ? "Add icons, draw, or erase. Changes save automatically."
                  : "Tip: paste a screenshot (⌘/Ctrl + V) or drag & drop an image to update the site map."}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT — Findings + Products (2/5 width) */}
        <div className="space-y-3">
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
                value={findings}
                onChange={(e) => onChangeFindings!(e.target.value)}
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

          {!isUpcoming && productList.length > 0 && (
            <div className="rounded-lg border border-border bg-muted/30 p-3">
              <p className="text-xs font-semibold text-muted-foreground mb-1.5 flex items-center gap-1.5">
                <FlaskConical className="w-3.5 h-3.5 text-primary" />
                Products Used
              </p>
              <ProductUsageSummary entries={productList} />
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
                  title={u.status || undefined}
                >
                  {u.unit_number || "—"}
                  {u.status && !isUpcoming ? (
                    <span className="ml-1 font-normal text-muted-foreground">
                      · {u.status}
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