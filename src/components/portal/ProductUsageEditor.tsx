import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ChevronDown, Plus, X, Calculator } from "lucide-react";
import {
  STANDARD_PRODUCTS,
  CATALOG_PRODUCTS,
  ProductUsage,
  makeDefaultUsage,
  autoCalcUndiluted,
  findStandardProduct,
  findEpaNumber,
  computeDilution,
} from "@/lib/productCatalog";

interface Props {
  value: ProductUsage[];
  onChange: (next: ProductUsage[]) => void;
  compact?: boolean; // smaller UI for inline table cells
  readOnly?: boolean;
}

const UNIT_OPTIONS = ["gal", "fl oz", "oz", "mL", "cc", "grams", "lbs", "qt", "each", "pkg", "units", "can"];

export const ProductUsageEditor = ({ value, onChange, compact, readOnly }: Props) => {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState("");

  const presentNames = useMemo(() => new Set(value.map(v => v.name)), [value]);

  const addProduct = (name: string) => {
    if (!name || presentNames.has(name)) return;
    onChange([...value, makeDefaultUsage(name)]);
  };

  const removeAt = (idx: number) => onChange(value.filter((_, i) => i !== idx));

  const updateAt = (idx: number, patch: Partial<ProductUsage>) => {
    const next = [...value];
    const merged = { ...next[idx], ...patch };
    // Auto-calc undiluted when applied changes (only for standard products in gallons)
    if (patch.applied_amount !== undefined && merged.applied_unit === "gal") {
      const calc = autoCalcUndiluted(merged.name, Number(patch.applied_amount || 0));
      if (calc !== null) merged.undiluted_amount = calc;
    }
    next[idx] = merged;
    onChange(next);
  };

  // Combined dropdown list: 12 standard products first, then full catalog (deduped)
  const combinedOptions = useMemo(() => {
    const seen = new Set<string>();
    const out: Array<{ name: string; manufacturer?: string; standard?: boolean; perGallonHint?: string }> = [];
    for (const p of STANDARD_PRODUCTS) {
      seen.add(p.name.toLowerCase());
      out.push({ name: p.name, standard: true, perGallonHint: `${p.perGallon} ${p.unit}/gal` });
    }
    for (const p of CATALOG_PRODUCTS) {
      if (seen.has(p.name.toLowerCase())) continue;
      seen.add(p.name.toLowerCase());
      out.push({ name: p.name, manufacturer: p.manufacturer });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  }, []);

  const filteredOptions = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return combinedOptions;
    return combinedOptions.filter(o =>
      o.name.toLowerCase().includes(q) || (o.manufacturer || "").toLowerCase().includes(q)
    );
  }, [combinedOptions, search]);

  return (
    <div className={compact ? "space-y-1.5" : "space-y-2"}>
      {/* Single dropdown product picker — hidden in readOnly mode */}
      {!readOnly && (
      <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="w-full flex items-center justify-between gap-2 px-3 py-1.5 rounded-md border border-input bg-background hover:bg-muted text-xs text-muted-foreground"
          >
            <span className="flex items-center gap-1.5">
              <Plus className="w-3 h-3" />
              {value.length === 0 ? "Add a product…" : `Add another product (${value.length} added)`}
            </span>
            <ChevronDown className="w-3 h-3 opacity-60" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-2" align="start">
          <Input
            autoFocus
            placeholder="Search products…"
            className="h-8 text-xs mb-2"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <div className="max-h-72 overflow-y-auto space-y-0.5">
            {filteredOptions.map(opt => {
              const active = presentNames.has(opt.name);
              return (
                <button
                  key={opt.name}
                  type="button"
                  disabled={active}
                  onClick={() => { addProduct(opt.name); setPickerOpen(false); setSearch(""); }}
                  className={`w-full text-left px-2 py-1.5 rounded text-xs hover:bg-muted flex items-center justify-between gap-2 ${active ? "opacity-40" : ""}`}
                >
                  <span className="min-w-0 truncate">
                    <span className="font-medium">{opt.name}</span>
                    {opt.manufacturer && <span className="text-muted-foreground"> · {opt.manufacturer}</span>}
                  </span>
                  <span className="text-[10px] text-muted-foreground shrink-0">
                    {opt.standard ? opt.perGallonHint : ""}
                  </span>
                </button>
              );
            })}
            {filteredOptions.length === 0 && (
              <p className="text-[11px] text-muted-foreground p-2 text-center">No matches</p>
            )}
            {search.trim() && !combinedOptions.some(o => o.name.toLowerCase() === search.toLowerCase()) && (
              <button
                type="button"
                onClick={() => { addProduct(search.trim()); setPickerOpen(false); setSearch(""); }}
                className="w-full text-left px-2 py-1.5 rounded text-xs hover:bg-muted flex items-center gap-1.5 mt-1 border-t border-border pt-2"
              >
                <Plus className="w-3 h-3" /> Add custom product: <span className="font-semibold">"{search.trim()}"</span>
              </button>
            )}
          </div>
        </PopoverContent>
      </Popover>
      )}

      {/* Per-product amount rows */}
      {value.length > 0 && (
        <div className="rounded-md border border-border/60 bg-muted/20 divide-y divide-border/40">
          <div className="grid grid-cols-12 gap-1 px-2 py-1 text-[9px] font-bold uppercase tracking-wide text-muted-foreground bg-muted/40">
            <div className="col-span-3">Product</div>
            <div className="col-span-4">Applied (diluted)</div>
            <div className="col-span-4">Undiluted (concentrate)</div>
            <div className="col-span-1"></div>
          </div>
          {value.map((u, idx) => {
            const std = findStandardProduct(u.name);
            const epa = findEpaNumber(u.name);
            const dil = computeDilution(u);
            return (
              <div key={`${u.name}-${idx}`} className="grid grid-cols-12 gap-1 px-2 py-1.5 items-center">
                <div className="col-span-3 text-[11px] font-medium truncate" title={u.name}>
                  {u.name}
                  {std && (
                    <span className="block text-[9px] text-muted-foreground font-normal">
                      {std.perGallon} {std.unit}/gal
                    </span>
                  )}
                  {epa && (
                    <span className="block text-[9px] text-muted-foreground font-mono">EPA {epa}</span>
                  )}
                  {(dil.ratePct != null) && (
                    <span className="block text-[9px] text-primary/80 font-normal">
                      {dil.ratePct.toFixed(2)}% dilution
                    </span>
                  )}
                </div>
                <div className="col-span-4 flex gap-1">
                  <Input
                    type="number"
                    step="0.5"
                    inputMode="decimal"
                    placeholder="0"
                    className="h-7 text-[11px] px-1.5 w-full"
                    value={u.applied_amount ?? ""}
                    readOnly={readOnly}
                    disabled={readOnly}
                    onChange={e => updateAt(idx, { applied_amount: e.target.value === "" ? null : Number(e.target.value) })}
                  />
                  <select
                    className="h-7 text-[10px] px-1 rounded border border-input bg-background w-16"
                    value={u.applied_unit}
                    disabled={readOnly}
                    onChange={e => updateAt(idx, { applied_unit: e.target.value })}
                  >
                    {UNIT_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
                <div className="col-span-4 flex gap-1">
                  <Input
                    type="number"
                    step="0.5"
                    inputMode="decimal"
                    placeholder="0"
                    className="h-7 text-[11px] px-1.5 w-full"
                    value={u.undiluted_amount ?? ""}
                    title={std ? "Auto-calculated from applied gallons (editable)" : ""}
                    readOnly={readOnly}
                    disabled={readOnly}
                    onChange={e => updateAt(idx, { undiluted_amount: e.target.value === "" ? null : Number(e.target.value) })}
                  />
                  <select
                    className="h-7 text-[10px] px-1 rounded border border-input bg-background w-16"
                    value={u.undiluted_unit}
                    disabled={readOnly}
                    onChange={e => updateAt(idx, { undiluted_unit: e.target.value })}
                  >
                    {UNIT_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
                <div className="col-span-1 flex justify-end">
                  {!readOnly && (
                    <button
                      type="button"
                      onClick={() => removeAt(idx)}
                      className="text-muted-foreground hover:text-destructive p-0.5"
                      title="Remove product"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {value.length > 0 && !readOnly && (
        <p className="text-[9px] text-muted-foreground flex items-center gap-1">
          <Calculator className="w-2.5 h-2.5" />
          Tip: enter gallons applied — undiluted amount auto-calculates for standard products.
        </p>
      )}
    </div>
  );
};

export default ProductUsageEditor;
