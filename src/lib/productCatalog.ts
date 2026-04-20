// Product catalog for technician product-usage entry.
// - STANDARD_PRODUCTS: the 12 most-common products with per-gallon dilution rates
//   (Applied Amount in gallons → undiluted amount auto-calculated).
// - CATALOG_PRODUCTS: full chemical list with their default concentrated/diluted units
//   (used for the "Other product" search dropdown).

export interface StandardProduct {
  id: string;            // stable key (used as the "name")
  name: string;          // display name
  perGallon: number;     // amount of concentrate per 1 gallon of finished mix
  unit: string;          // unit of the per-gallon measurement (oz, mL, grams)
  appliedUnit: string;   // default unit for "applied amount" (gallons for these)
}

export const STANDARD_PRODUCTS: StandardProduct[] = [
  { id: "MasterLine / Bifen I/T",         name: "MasterLine / Bifen I/T",         perGallon: 1.00, unit: "oz",    appliedUnit: "gal" },
  { id: "Essentria IC Pro",               name: "Essentria IC Pro",               perGallon: 2.00, unit: "oz",    appliedUnit: "gal" },
  { id: "Temprid FX",                     name: "Temprid FX",                     perGallon: 8.00, unit: "mL",    appliedUnit: "gal" },
  { id: "Termidor SC",                    name: "Termidor SC",                    perGallon: 0.04, unit: "oz",    appliedUnit: "gal" },
  { id: "Phantom",                        name: "Phantom",                        perGallon: 3.00, unit: "oz",    appliedUnit: "gal" },
  { id: "OptiGard Flex Liquid",           name: "OptiGard Flex Liquid",           perGallon: 0.41, unit: "oz",    appliedUnit: "gal" },
  { id: "Onslaught FastCap Spider/Scorp", name: "Onslaught FastCap Spider/Scorp", perGallon: 1.00, unit: "oz",    appliedUnit: "gal" },
  { id: "OneGuard Multi MoA",             name: "OneGuard Multi MoA",             perGallon: 1.50, unit: "oz",    appliedUnit: "gal" },
  { id: "Gentrol IGR Concentrate",        name: "Gentrol IGR Concentrate",        perGallon: 1.00, unit: "oz",    appliedUnit: "gal" },
  { id: "Nyguard IGR Concentrate",        name: "Nyguard IGR Concentrate",        perGallon: 5.50, unit: "mL",    appliedUnit: "gal" },
  { id: "ExciteR",                        name: "ExciteR",                        perGallon: 1.56, unit: "oz",    appliedUnit: "gal" },
  { id: "Alpine WSG",                     name: "Alpine WSG",                     perGallon: 10.00, unit: "grams", appliedUnit: "gal" },
];

export const STANDARD_PRODUCT_IDS = new Set(STANDARD_PRODUCTS.map(p => p.id));

// Normalize raw CSV unit codes to friendlier labels.
const normalizeUnit = (u: string): string => {
  const k = (u || "").toLowerCase().trim();
  switch (k) {
    case "ozs": case "ounces": case "oz": return "oz";
    case "flozs": case "flounces": case "floz": return "fl oz";
    case "ml": return "mL";
    case "cc": return "cc";
    case "grams": case "g": return "grams";
    case "lbs": case "lb": return "lbs";
    case "gals": case "gal": case "gallon": case "gallons": return "gal";
    case "each": return "each";
    case "pkg": case "pkgs": return "pkg";
    case "units": case "unit": return "units";
    case "qrts": case "qts": case "qt": return "qt";
    default: return u || "units";
  }
};

export interface CatalogProduct {
  name: string;            // display name (de-duplicated from CSV)
  manufacturer?: string;
  appliedUnit: string;     // default for "applied amount" (diluted_unit)
  undilutedUnit: string;   // default for "undiluted amount" (concentrated_unit)
}

// Deduplicated catalog from the provided CSV.
// Source: chemicals list in the project knowledge.
const RAW_CATALOG: Array<[string, string, string, string]> = [
  // [name, manufacturer, concentrated_unit, diluted_unit]
  ["Silverfish Paks", "Dekko", "pkg", "pkg"],
  ["Dekko Bait Silverfish", "", "units", "units"],
  ["Premise Foam", "Bayer", "can", "can"],
  ["565 Plus", "BASF", "can", "can"],
  ["Ultracide", "Whitmore Micro-Gen", "can", "oz"],
  ["Webster Pole", "", "cc", "cc"],
  ["PT Alpine Pressurized Insecticide", "", "cc", "cc"],
  ["Advion Cockroach Gel", "Syngenta", "grams", "grams"],
  ["FastCap", "MGK", "cc", "cc"],
  ["Invade Hot Spot+", "", "fl oz", "fl oz"],
  ["Niban", "Nisus", "cc", "cc"],
  ["Shockwave", "", "cc", "cc"],
  ["Exciter", "", "cc", "cc"],
  ["CB-80", "", "fl oz", "fl oz"],
  ["Selontra Rodent Bait", "BASF", "cc", "cc"],
  ["Essentria Pro", "", "cc", "fl oz"],
  ["Evo Tunnel", "", "each", "each"],
  ["Glue Trays", "", "each", "each"],
  ["Secured Rodent Station", "", "each", "each"],
  ["EZ Klean Station", "", "each", "each"],
  ["Rat Snap Trap", "", "each", "each"],
  ["Tin Cat", "", "each", "each"],
  ["Mouse Trap", "", "each", "each"],
  ["Sentricon Recruit AG", "Dow", "each", "each"],
  ["Sentricon Recruit HD", "Dow", "each", "each"],
  ["Gentrol Aerosol", "Zoecon", "fl oz", "fl oz"],
  ["Precor 2000", "Wellmark", "fl oz", "fl oz"],
  ["Precor", "Wellmark", "fl oz", "gal"],
  ["Tekko Pro", "CSI", "fl oz", "gal"],
  ["Bedlam Plus", "MGK", "fl oz", "fl oz"],
  ["Cross Check Plus", "Lesco", "fl oz", "gal"],
  ["Talstar P", "FMC", "fl oz", "gal"],
  ["MasterLine B MaxxPro", "FMC", "fl oz", "gal"],
  ["Phantom RTS", "BASF", "fl oz", "fl oz"],
  ["Cy-Kick CS", "BASF", "fl oz", "gal"],
  ["Cyper TC", "", "fl oz", "gal"],
  ["Suspend PolyZone", "Bayer", "fl oz", "gal"],
  ["PT Alpine Flea & Bed Bug", "BASF", "fl oz", "fl oz"],
  ["PT Alpine Fly Bait", "BASF", "fl oz", "fl oz"],
  ["Zenprox", "Zoecon", "fl oz", "gal"],
  ["Taurus SC", "", "fl oz", "gal"],
  ["Termidor HE", "BASF", "fl oz", "gal"],
  ["Tempo SC", "Bayer", "mL", "gal"],
  ["Demand CS", "Syngenta", "fl oz", "gal"],
  ["Cyzmic CS", "CSI", "fl oz", "gal"],
  ["Sector", "MGK", "fl oz", "gal"],
  ["PT Wasp Freeze", "PT", "fl oz", "fl oz"],
  ["Archer IGR", "Syngenta", "fl oz", "gal"],
  ["Suspend SC", "Bayer", "fl oz", "gal"],
  ["Bora Care", "Nisus", "gal", "gal"],
  ["DSV", "Nisus", "fl oz", "gal"],
  ["Avert DF", "BASF", "grams", "grams"],
  ["Bifen L/P", "CSI", "grams", "grams"],
  ["Take Down", "Liphatech", "grams", "grams"],
  ["Alpine Cockroach Gel", "BASF", "grams", "grams"],
  ["Essentria G", "", "grams", "grams"],
  ["Max Force Roach Bait", "Bayer", "grams", "grams"],
  ["Maxforce Ant Gel", "Bayer", "grams", "grams"],
  ["In2Care", "In2Care", "grams", "grams"],
  ["Advion Fire Ant Bait", "Syngenta", "lbs", "lbs"],
  ["Wisdom Lawn Granular", "AmVac", "lbs", "lbs"],
  ["Contrac Blox", "Bell Labs", "oz", "oz"],
  ["DeltaDust", "Bayer", "grams", "grams"],
  ["Top Choice", "Bayer", "lbs", "lbs"],
  ["Snake A Way", "Dr. T's", "lbs", "lbs"],
  ["American Brand Granules", "VPG", "lbs", "lbs"],
  ["Sluggo", "Neudorff", "lbs", "lbs"],
  ["Tandem", "", "mL", "mL"],
  ["Talon G", "Syngenta", "oz", "grams"],
  ["Advion Microflow", "Syngenta", "oz", "oz"],
  ["Advion Ant Gel", "Syngenta", "grams", "grams"],
  ["Optiguard", "Syngenta", "oz", "oz"],
  ["Transport Mikron", "FMC", "fl oz", "gal"],
  ["Eco-Via EC", "Rockwell Labs", "fl oz", "gal"],
];

export const CATALOG_PRODUCTS: CatalogProduct[] = RAW_CATALOG.map(([name, manufacturer, conc, dil]) => ({
  name,
  manufacturer: manufacturer || undefined,
  undilutedUnit: normalizeUnit(conc),
  appliedUnit: normalizeUnit(dil),
}));

// ─── Product usage entry shape ───
// Stored on each unit row's `products_used` (legacy: string[] of names).
// New shape supports either string OR ProductUsage objects (back-compatible).
export interface ProductUsage {
  name: string;
  applied_amount: number | null;   // diluted/applied amount (e.g., gallons sprayed)
  applied_unit: string;            // gal, fl oz, etc.
  undiluted_amount: number | null; // concentrate (auto-calc but editable)
  undiluted_unit: string;          // oz, mL, grams, etc.
}

// Lookup helpers
export const findStandardProduct = (name: string): StandardProduct | undefined =>
  STANDARD_PRODUCTS.find(p => p.id === name || p.name.toLowerCase() === name.toLowerCase());

export const findCatalogProduct = (name: string): CatalogProduct | undefined =>
  CATALOG_PRODUCTS.find(p => p.name.toLowerCase() === name.toLowerCase());

// Build a default ProductUsage entry given a product name.
export const makeDefaultUsage = (name: string): ProductUsage => {
  const std = findStandardProduct(name);
  if (std) {
    return {
      name,
      applied_amount: null,
      applied_unit: std.appliedUnit,
      undiluted_amount: null,
      undiluted_unit: std.unit,
    };
  }
  const cat = findCatalogProduct(name);
  if (cat) {
    return {
      name,
      applied_amount: null,
      applied_unit: cat.appliedUnit,
      undiluted_amount: null,
      undiluted_unit: cat.undilutedUnit,
    };
  }
  // unknown product → safe defaults
  return {
    name,
    applied_amount: null,
    applied_unit: "gal",
    undiluted_amount: null,
    undiluted_unit: "oz",
  };
};

// Auto-calculate undiluted amount given applied (gallons) — only meaningful for STANDARD_PRODUCTS
// where dilution is per-gallon. Returns null if not auto-calculable.
export const autoCalcUndiluted = (name: string, appliedAmount: number): number | null => {
  const std = findStandardProduct(name);
  if (!std) return null;
  if (std.appliedUnit !== "gal") return null;
  return +(appliedAmount * std.perGallon).toFixed(3);
};

// Normalize a legacy products_used entry (string OR ProductUsage) → ProductUsage.
export const normalizeUsageEntry = (entry: any): ProductUsage => {
  if (typeof entry === "string") return makeDefaultUsage(entry);
  if (entry && typeof entry === "object" && entry.name) {
    return {
      name: String(entry.name),
      applied_amount: entry.applied_amount ?? null,
      applied_unit: entry.applied_unit || makeDefaultUsage(entry.name).applied_unit,
      undiluted_amount: entry.undiluted_amount ?? null,
      undiluted_unit: entry.undiluted_unit || makeDefaultUsage(entry.name).undiluted_unit,
    };
  }
  return makeDefaultUsage("");
};

// Normalize a list (string[] | ProductUsage[]) → ProductUsage[]
export const normalizeUsageList = (list: any): ProductUsage[] => {
  if (!Array.isArray(list)) return [];
  return list.filter(Boolean).map(normalizeUsageEntry);
};

// Aggregate usage entries across multiple unit rows / services into per-product totals.
// Only sums entries that share the same `undiluted_unit`. Different units stay separate.
export interface AggregateRow {
  name: string;
  appliedTotal: number;
  appliedUnit: string;
  undilutedTotal: number;
  undilutedUnit: string;
}
export const aggregateUsage = (entries: ProductUsage[]): AggregateRow[] => {
  const byKey = new Map<string, AggregateRow>();
  for (const e of entries) {
    if (!e.name) continue;
    const key = `${e.name}__${e.undiluted_unit}__${e.applied_unit}`;
    const cur = byKey.get(key);
    if (cur) {
      cur.appliedTotal += Number(e.applied_amount || 0);
      cur.undilutedTotal += Number(e.undiluted_amount || 0);
    } else {
      byKey.set(key, {
        name: e.name,
        appliedTotal: Number(e.applied_amount || 0),
        appliedUnit: e.applied_unit,
        undilutedTotal: Number(e.undiluted_amount || 0),
        undilutedUnit: e.undiluted_unit,
      });
    }
  }
  return Array.from(byKey.values()).sort((a, b) => a.name.localeCompare(b.name));
};
