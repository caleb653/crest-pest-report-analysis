/**
 * Shared building blocks used on commercial service reports in BOTH the
 * admin dashboard and the PM (customer) portal. Keeping these here so the
 * two stay visually identical (per cofounder feedback).
 */
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { X, Wrench } from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// Constants — shared by the appointment report editor + the portal views.
// ─────────────────────────────────────────────────────────────────────────────

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

export interface NonChemEquipmentEntry {
  name: string;
  qty: number;
}

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