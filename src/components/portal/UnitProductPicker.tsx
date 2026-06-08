import { useMemo, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Check, ChevronDown, X } from "lucide-react";
import { STANDARD_PRODUCTS, CATALOG_PRODUCTS } from "@/lib/productCatalog";

interface Props {
  // Stored as comma-separated string OR array of names — we accept either, return string.
  value: string | string[] | null | undefined;
  onChange: (next: string) => void;
  placeholder?: string;
  // Optional: previous unit's product selection. When provided and current is empty,
  // a "Same as prior unit" shortcut appears at the top of the picker.
  previousValue?: string | string[] | null;
}

// Compact multi-select for product NAMES per unit (no amounts).
// Stores as a comma-separated string for backward compatibility with unit_details.products_used.
export const UnitProductPicker = ({ value, onChange, placeholder = "Add products", previousValue }: Props) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const selected: string[] = useMemo(() => {
    if (Array.isArray(value)) return value.map(v => (typeof v === "string" ? v : (v as any)?.name || "")).filter(Boolean);
    if (typeof value === "string") return value.split(",").map(s => s.trim()).filter(Boolean);
    return [];
  }, [value]);

  const selectedSet = useMemo(() => new Set(selected.map(s => s.toLowerCase())), [selected]);

  const options = useMemo(() => {
    const seen = new Set<string>();
    const out: { name: string; standard?: boolean; manufacturer?: string }[] = [];
    for (const p of STANDARD_PRODUCTS) {
      seen.add(p.name.toLowerCase());
      out.push({ name: p.name, standard: true });
    }
    for (const p of CATALOG_PRODUCTS) {
      if (seen.has(p.name.toLowerCase())) continue;
      seen.add(p.name.toLowerCase());
      out.push({ name: p.name, manufacturer: p.manufacturer });
    }
    // Alphabetical sort across the whole list
    return out.sort((a, b) => a.name.localeCompare(b.name));
  }, []);
  const previousList = useMemo(() => {
    if (Array.isArray(previousValue)) return previousValue.filter(Boolean);
    if (typeof previousValue === "string") return previousValue.split(",").map(s => s.trim()).filter(Boolean);
    return [];
  }, [previousValue]);

  const copyFromPrior = () => {
    if (previousList.length === 0) return;
    onChange(previousList.join(", "));
    setOpen(false);
  };


  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return options;
    return options.filter(o => o.name.toLowerCase().includes(q) || (o.manufacturer || "").toLowerCase().includes(q));
  }, [options, search]);

  const toggle = (name: string) => {
    const lower = name.toLowerCase();
    let next: string[];
    if (selectedSet.has(lower)) {
      next = selected.filter(s => s.toLowerCase() !== lower);
    } else {
      next = [...selected, name];
    }
    onChange(next.join(", "));
  };

  const remove = (name: string) => {
    const next = selected.filter(s => s.toLowerCase() !== name.toLowerCase());
    onChange(next.join(", "));
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="w-full min-h-[28px] flex flex-wrap items-center gap-1 px-1.5 py-0.5 rounded border border-transparent hover:border-border focus:border-primary bg-transparent text-left"
        >
          {selected.length === 0 ? (
            <span className="text-[10px] text-muted-foreground flex items-center gap-1">
              {placeholder} <ChevronDown className="w-3 h-3 opacity-60" />
            </span>
          ) : (
            <>
              {selected.map(name => (
                <span
                  key={name}
                  className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[10px] font-medium"
                >
                  {name}
                  <X
                    className="w-2.5 h-2.5 hover:text-destructive cursor-pointer"
                    onClick={(e) => { e.stopPropagation(); remove(name); }}
                  />
                </span>
              ))}
              <ChevronDown className="w-3 h-3 opacity-60 ml-auto" />
            </>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-2" align="start">
        {previousList.length > 0 && selected.length === 0 && (
          <button
            type="button"
            onClick={copyFromPrior}
            className="w-full text-left mb-2 px-2 py-1.5 rounded text-xs font-semibold bg-primary/10 text-primary hover:bg-primary/15 border border-primary/30"
          >
            ↑ Same as prior unit ({previousList.length})
          </button>
        )}
        <Input
          autoFocus
          placeholder="Search products…"
          className="h-8 text-xs mb-2"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <div className="max-h-60 overflow-y-auto space-y-0.5">
          {filtered.map(opt => {
            const checked = selectedSet.has(opt.name.toLowerCase());
            return (
              <button
                key={opt.name}
                type="button"
                onClick={() => toggle(opt.name)}
                className={`w-full text-left px-2 py-1.5 rounded text-xs hover:bg-muted flex items-center gap-2 ${checked ? "bg-primary/[0.08]" : ""}`}
              >
                <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 ${checked ? "bg-primary border-primary text-primary-foreground" : "border-input"}`}>
                  {checked && <Check className="w-2.5 h-2.5" />}
                </span>
                <span className="min-w-0 truncate">
                  <span className="font-medium">{opt.name}</span>
                  {opt.manufacturer && <span className="text-muted-foreground"> · {opt.manufacturer}</span>}
                </span>
              </button>
            );
          })}
          {filtered.length === 0 && (
            <p className="text-[11px] text-muted-foreground p-2 text-center">No matches</p>
          )}
          {search.trim() && !options.some(o => o.name.toLowerCase() === search.trim().toLowerCase()) && (
            <button
              type="button"
              onClick={() => { toggle(search.trim()); setSearch(""); }}
              className="w-full text-left px-2 py-1.5 rounded text-xs hover:bg-muted mt-1 border-t border-border pt-2"
            >
              + Add custom: <span className="font-semibold">"{search.trim()}"</span>
            </button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default UnitProductPicker;
