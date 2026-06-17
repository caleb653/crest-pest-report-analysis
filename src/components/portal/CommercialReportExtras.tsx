/**
 * Shared building blocks used on commercial service reports in BOTH the
 * admin dashboard and the PM (customer) portal. Keeping these here so the
 * two stay visually identical (per cofounder feedback).
 */
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  AlertTriangle, Camera, Plus, X, Loader2, Wrench, Upload,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

// ─────────────────────────────────────────────────────────────────────────────
// Constants — shared by the appointment report editor + the portal views.
// ─────────────────────────────────────────────────────────────────────────────

export const COMMERCIAL_CONCERNS = [
  "Sanitation concerns",
  "Harborage / clutter",
  "Exclusion gaps",
  "Moisture issues",
  "Food storage issues",
  "Trash / dumpster issues",
  "Structural deficiencies",
  "Conducive conditions",
] as const;

export const COMMERCIAL_NON_CHEM_EQUIPMENT = [
  "Rodent Bait Stations",
  "Rodent Traps",
  "Snap Traps",
  "Glue Boards",
  "Mosquito Buckets",
  "Fly Lights",
  "Pest Monitors",
  "Insect Light Traps",
  "Tin Cats",
] as const;

export const COMMERCIAL_PEST_OPTIONS = [
  "Ants",
  "American Roaches",
  "German Cockroaches",
  "Spiders",
  "Rodents (mice/rats)",
  "Flies",
  "Drain Flies",
  "Fleas",
  "Mosquitoes",
  "Wasps / Bees",
  "Silverfish",
  "Stored-product Pests",
  "Bed Bugs",
  "Other",
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// Shapes stored on portal_services.report_data
// ─────────────────────────────────────────────────────────────────────────────

export interface ConcernEntry {
  name: string;
  photos: string[];
}
export interface NonChemEquipmentEntry {
  name: string;
  qty: number;
}

export const normalizeConcerns = (raw: any): ConcernEntry[] => {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry: any) => {
      if (typeof entry === "string") return { name: entry, photos: [] };
      if (entry && typeof entry === "object" && entry.name) {
        return {
          name: String(entry.name),
          photos: Array.isArray(entry.photos) ? entry.photos.filter(Boolean) : [],
        };
      }
      return null;
    })
    .filter(Boolean) as ConcernEntry[];
};

export const normalizeNonChemEquipment = (raw: any): NonChemEquipmentEntry[] => {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry: any) => {
      if (typeof entry === "string") return { name: entry, qty: 1 };
      if (entry && typeof entry === "object" && entry.name) {
        const n = Number(entry.qty);
        return { name: String(entry.name), qty: Number.isFinite(n) && n > 0 ? n : 1 };
      }
      return null;
    })
    .filter(Boolean) as NonChemEquipmentEntry[];
};

// ─────────────────────────────────────────────────────────────────────────────
// Active Conditions editor — toggle a condition, prompted to attach photos to it.
// Read-only mode shows the chips + photos.
// ─────────────────────────────────────────────────────────────────────────────

interface ConcernsProps {
  value: ConcernEntry[];
  onChange?: (next: ConcernEntry[]) => void;
  readOnly?: boolean;
  /** Storage path prefix for uploaded concern photos. */
  uploadPrefix?: string;
}

export function CommercialConcernsObserved({
  value, onChange, readOnly, uploadPrefix,
}: ConcernsProps) {
  const [activeConcernUpload, setActiveConcernUpload] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadingFor = activeConcernUpload;

  const toggleConcern = (name: string) => {
    if (readOnly || !onChange) return;
    const exists = value.find((c) => c.name === name);
    if (exists) {
      onChange(value.filter((c) => c.name !== name));
    } else {
      const next = [...value, { name, photos: [] }];
      onChange(next);
      // Immediately prompt for a photo per cofounder feedback.
      setActiveConcernUpload(name);
      setTimeout(() => fileInputRef.current?.click(), 50);
    }
  };

  const addPhotoTo = async (name: string, files: FileList | null) => {
    if (!files || files.length === 0 || !onChange) return;
    const uploaded: string[] = [];
    for (const file of Array.from(files)) {
      try {
        const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
        const path = `${uploadPrefix || "concern-photos"}/${Date.now()}-${Math.random()
          .toString(36).slice(2, 8)}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("report-images")
          .upload(path, file, { contentType: file.type || "image/jpeg", upsert: false });
        if (upErr) {
          toast({ title: "Upload failed", description: upErr.message, variant: "destructive" });
          continue;
        }
        const { data: pub } = supabase.storage.from("report-images").getPublicUrl(path);
        uploaded.push(pub.publicUrl);
      } catch (e: any) {
        toast({ title: "Upload failed", description: e?.message, variant: "destructive" });
      }
    }
    if (uploaded.length === 0) return;
    onChange(
      value.map((c) =>
        c.name === name ? { ...c, photos: [...(c.photos || []), ...uploaded] } : c
      )
    );
    toast({ title: `Added ${uploaded.length} photo${uploaded.length === 1 ? "" : "s"}` });
  };

  const removePhoto = (name: string, idx: number) => {
    if (readOnly || !onChange) return;
    onChange(
      value.map((c) =>
        c.name === name ? { ...c, photos: c.photos.filter((_, i) => i !== idx) } : c
      )
    );
  };

  const activeNames = new Set(value.map((c) => c.name));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-xs font-bold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 text-primary" />
          Active Conditions
        </Label>
        {!readOnly && (
          <p className="text-[10.5px] text-muted-foreground">
            Click a concern to mark it — you'll be asked to attach a photo.
          </p>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {COMMERCIAL_CONCERNS.map((c) => {
          const active = activeNames.has(c);
          return (
            <button
              type="button"
              key={c}
              disabled={readOnly}
              onClick={() => toggleConcern(c)}
              className={[
                "px-3 h-9 rounded-full text-xs font-medium border-2 transition-all",
                active
                  ? "bg-primary text-primary-foreground border-primary shadow-sm"
                  : "bg-background text-foreground border-border hover:border-primary/50",
                readOnly ? "cursor-default opacity-90" : "cursor-pointer",
              ].join(" ")}
            >
              {active ? "✓ " : ""}{c}
            </button>
          );
        })}
      </div>
      {value.length > 0 && (
        <ul className="space-y-2">
          {value.map((c) => (
            <li key={c.name} className="rounded-md border bg-muted/30 p-2.5">
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <p className="text-sm font-semibold">{c.name}</p>
                {!readOnly && (
                  <label className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded border bg-background hover:bg-muted/50 cursor-pointer">
                    <Camera className="w-3 h-3" />
                    Add Photo
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      multiple
                      className="hidden"
                      onChange={(e) => {
                        addPhotoTo(c.name, e.target.files);
                        e.target.value = "";
                      }}
                    />
                  </label>
                )}
              </div>
              {c.photos.length === 0 ? (
                <p className="text-[11px] text-muted-foreground italic">
                  {readOnly ? "No photo attached." : "No photo yet — add one above."}
                </p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {c.photos.map((url, i) => (
                    <div key={`${url}-${i}`} className="relative group">
                      <a href={url} target="_blank" rel="noopener noreferrer" className="block w-16 h-16 rounded border overflow-hidden bg-background">
                        <img src={url} alt={`${c.name} photo ${i + 1}`} className="w-full h-full object-cover" loading="lazy" />
                      </a>
                      {!readOnly && (
                        <button
                          type="button"
                          onClick={() => removePhoto(c.name, i)}
                          className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition"
                          aria-label="Remove photo"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {/* hidden file input used for the auto-prompt-on-toggle flow */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        className="hidden"
        onChange={(e) => {
          if (uploadingFor) addPhotoTo(uploadingFor, e.target.files);
          e.target.value = "";
          setActiveConcernUpload(null);
        }}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Non-Chemical Equipment editor with quantity per item.
// Read-only mode renders chips with "× qty" badges.
// ─────────────────────────────────────────────────────────────────────────────

interface EquipmentProps {
  value: NonChemEquipmentEntry[];
  onChange?: (next: NonChemEquipmentEntry[]) => void;
  readOnly?: boolean;
  /** Render as a compact dropdown picker (used on Upcoming visit card). */
  dropdown?: boolean;
}

export function CommercialNonChemEquipment({
  value, onChange, readOnly, dropdown,
}: EquipmentProps) {
  const activeMap = new Map(value.map((e) => [e.name, e.qty]));

  const toggle = (name: string) => {
    if (readOnly || !onChange) return;
    if (activeMap.has(name)) {
      onChange(value.filter((e) => e.name !== name));
    } else {
      const qtyStr = window.prompt(`How many ${name.toLowerCase()}?`, "1");
      if (qtyStr === null) return;
      const qty = Math.max(1, parseInt(qtyStr, 10) || 1);
      onChange([...value, { name, qty }]);
    }
  };

  const updateQty = (name: string, qty: number) => {
    if (readOnly || !onChange) return;
    const safe = Math.max(1, Math.floor(qty) || 1);
    onChange(value.map((e) => (e.name === name ? { ...e, qty: safe } : e)));
  };

  if (dropdown && !readOnly) {
    const remaining = COMMERCIAL_NON_CHEM_EQUIPMENT.filter(n => !activeMap.has(n));
    return (
      <div className="space-y-2">
        <Label className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
          <Wrench className="w-3 h-3 text-primary" />
          Equipment Used
        </Label>
        <select
          className="h-9 w-full rounded-md border border-input bg-background px-2 text-xs"
          value=""
          onChange={(e) => {
            const name = e.target.value;
            if (!name || !onChange) return;
            onChange([...value, { name, qty: 1 }]);
            e.currentTarget.value = "";
          }}
          disabled={remaining.length === 0}
        >
          <option value="">{remaining.length === 0 ? "All equipment added" : "Add equipment…"}</option>
          {remaining.map(n => <option key={n} value={n}>{n}</option>)}
        </select>
        {value.length > 0 && (
          <div className="space-y-1">
            {value.map(e => (
              <div key={e.name} className="flex items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1">
                <span className="text-xs flex-1 truncate" title={e.name}>{e.name}</span>
                <Input
                  type="number"
                  min={1}
                  value={e.qty}
                  onChange={(ev) => updateQty(e.name, Number(ev.target.value))}
                  className="h-7 w-14 text-xs"
                />
                <button
                  type="button"
                  onClick={() => onChange?.(value.filter(v => v.name !== e.name))}
                  className="text-muted-foreground hover:text-destructive"
                  aria-label={`Remove ${e.name}`}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Label className="text-xs font-bold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
        <Wrench className="w-3.5 h-3.5 text-primary" />
        Non-Chemical Equipment Used
      </Label>
      <div className="flex flex-wrap gap-1.5">
        {COMMERCIAL_NON_CHEM_EQUIPMENT.map((name) => {
          const active = activeMap.has(name);
          return (
            <Badge
              key={name}
              variant={active ? "default" : "outline"}
              className={`text-xs h-8 px-3 ${readOnly ? "" : "cursor-pointer"}`}
              onClick={() => toggle(name)}
            >
              {name}
              {active && <span className="ml-1.5 font-bold">× {activeMap.get(name)}</span>}
            </Badge>
          );
        })}
      </div>
      {value.length > 0 && !readOnly && (
        <div className="rounded-md border p-2.5 space-y-1.5 bg-muted/30">
          <p className="text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground">
            Adjust Quantities
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {value.map((e) => (
              <div key={e.name} className="flex items-center gap-1.5">
                <span className="text-xs flex-1 truncate" title={e.name}>{e.name}</span>
                <Input
                  type="number"
                  min={1}
                  value={e.qty}
                  onChange={(ev) => updateQty(e.name, Number(ev.target.value))}
                  className="h-8 w-16 text-xs"
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}