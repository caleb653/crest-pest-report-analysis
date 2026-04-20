import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ChevronDown, Plus, X, Search, Calculator } from "lucide-react";
import {
  STANDARD_PRODUCTS,
  CATALOG_PRODUCTS,
  ProductUsage,
  makeDefaultUsage,
  autoCalcUndiluted,
  findStandardProduct,
} from "@/lib/productCatalog";

interface Props {
  value: ProductUsage[];
  onChange: (next: ProductUsage[]) => void;
  compact?: boolean; // smaller UI for inline table cells
}

const UNIT_OPTIONS = ["gal", "fl oz", "oz", "mL", "cc", "grams", "lbs", "qt", "each", "pkg", "units", "can"];

export const ProductUsageEditor = ({ value, onChange, compact }: Props) => {
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

  const filteredCatalog = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return CATALOG_PRODUCTS.slice(0, 30);
    return CATALOG_PRODUCTS.filter(p =>
      p.name.toLowerCase().includes(q) || (p.manufacturer || "").toLowerCase().includes(q)
    ).slice(0, 30);
  }, [search]);

  return (
    <div className={compact ? "space-y-1.5" : "space-y-2"}>
      {/* Quick-pick chips for the 12 standard products */}
      <div className="flex flex-wrap gap-1">
        {STANDARD_PRODUCTS.map(p => {
          const active = presentNames.has(p.id);
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => active ? onChange(value.filter(v => v.name !== p.id)) : addProduct(p.id)}
              className={`text-[10px] leading-none px-2 py-1 rounded-full border transition-colors ${
                active
                  ? "bg-primary text-primary-foreground border-primary font-semibold"
                  : "bg-background hover:bg-muted border-border text-foreground"
              }`}
              title={`${p.perGallon} ${p.unit} per gallon`}
            >
              {p.name}
            </button>
          );
        })}

        <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="text-[10px] leading-none px-2 py-1 rounded-full border border-dashed border-border bg-background hover:bg-muted text-muted-foreground flex items-center gap-1"
            >
              <Search className="w-2.5 h-2.5" /> Other product
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-72 p-2" align="start">
            <Input
              autoFocus
              placeholder="Search catalog…"
              className="h-7 text-xs mb-2"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            <div className="max-h-64 overflow-y-auto space-y-0.5">
              {filteredCatalog.map(p => {
                const active = presentNames.has(p.name);
                return (
                  <button
                    key={p.name}
                    type="button"
                    disabled={active}
                    onClick={() => { addProduct(p.name); setPickerOpen(false); setSearch(""); }}
                    className={`w-full text-left px-2 py-1.5 rounded text-xs hover:bg-muted flex items-center justify-between ${active ? "opacity-40" : ""}`}
                  >
                    <span>
                      <span className="font-medium">{p.name}</span>
                      {p.manufacturer && <span className="text-muted-foreground"> · {p.manufacturer}</span>}
                    </span>
                    <span className="text-[10px] text-muted-foreground">{p.appliedUnit}</span>
                  </button>
                );
              })}
              {filteredCatalog.length === 0 && (
                <p className="text-[11px] text-muted-foreground p-2 text-center">No matches</p>
              )}
              {search.trim() && !CATALOG_PRODUCTS.some(p => p.name.toLowerCase() === search.toLowerCase()) && (
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
      </div>

      {/* Per-product amount rows */}
      {value.length > 0 && (
        <div className="rounded-md border border-border/60 bg-muted/20 divide-y divide-border/40">
          <div className="grid grid-cols-12 gap-1 px-2 py-1 text-[9px] font-bold uppercase tracking-wide text-muted-foreground bg-muted/40">
            <div className="col-span-4">Product</div>
            <div className="col-span-4">Applied (diluted)</div>
            <div className="col-span-3">Undiluted (concentrate)</div>
            <div className="col-span-1"></div>
          </div>
          {value.map((u, idx) => {
            const std = findStandardProduct(u.name);
            return (
              <div key={`${u.name}-${idx}`} className="grid grid-cols-12 gap-1 px-2 py-1.5 items-center">
                <div className="col-span-4 text-[11px] font-medium truncate" title={u.name}>
                  {u.name}
                  {std && (
                    <span className="block text-[9px] text-muted-foreground font-normal">
                      {std.perGallon} {std.unit}/gal
                    </span>
                  )}
                </div>
                <div className="col-span-4 flex gap-1">
                  <Input
                    type="number"
                    step="0.01"
                    inputMode="decimal"
                    placeholder="0"
                    className="h-7 text-[11px] px-1.5 w-full"
                    value={u.applied_amount ?? ""}
                    onChange={e => updateAt(idx, { applied_amount: e.target.value === "" ? null : Number(e.target.value) })}
                  />
                  <select
                    className="h-7 text-[10px] px-1 rounded border border-input bg-background w-16"
                    value={u.applied_unit}
                    onChange={e => updateAt(idx, { applied_unit: e.target.value })}
                  >
                    {UNIT_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
                <div className="col-span-3 flex gap-1">
                  <Input
                    type="number"
                    step="0.01"
                    inputMode="decimal"
                    placeholder="0"
                    className="h-7 text-[11px] px-1.5 w-full"
                    value={u.undiluted_amount ?? ""}
                    title={std ? "Auto-calculated from applied gallons (editable)" : ""}
                    onChange={e => updateAt(idx, { undiluted_amount: e.target.value === "" ? null : Number(e.target.value) })}
                  />
                  <select
                    className="h-7 text-[10px] px-1 rounded border border-input bg-background w-16"
                    value={u.undiluted_unit}
                    onChange={e => updateAt(idx, { undiluted_unit: e.target.value })}
                  >
                    {UNIT_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
                <div className="col-span-1 flex justify-end">
                  <button
                    type="button"
                    onClick={() => removeAt(idx)}
                    className="text-muted-foreground hover:text-destructive p-0.5"
                    title="Remove product"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {value.length > 0 && (
        <p className="text-[9px] text-muted-foreground flex items-center gap-1">
          <Calculator className="w-2.5 h-2.5" />
          Tip: enter gallons applied — undiluted amount auto-calculates for standard products.
        </p>
      )}
    </div>
  );
};

export default ProductUsageEditor;
