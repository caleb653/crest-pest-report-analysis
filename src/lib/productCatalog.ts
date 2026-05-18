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
  epa?: string;          // EPA Registration # (or "25B Exempt" / "None")
}

export const STANDARD_PRODUCTS: StandardProduct[] = [
  // Pinned to top in this order
  { id: "Temprid FX",                     name: "Temprid FX",                     perGallon: 8.00, unit: "mL",    appliedUnit: "gal", epa: "101563-165" },
  { id: "Alpine WSG",                     name: "Alpine WSG",                     perGallon: 10.00, unit: "grams", appliedUnit: "gal", epa: "499-561" },
  { id: "MasterLine / Bifen I/T",         name: "MasterLine / Bifen I/T",         perGallon: 1.00, unit: "oz",    appliedUnit: "gal", epa: "279-3206-73748 / 53883-118" },
  { id: "Termidor SC",                    name: "Termidor SC",                    perGallon: 0.04, unit: "oz",    appliedUnit: "gal", epa: "7969-210" },
  { id: "Delta Dust",                     name: "Delta Dust",                     perGallon: 0,    unit: "grams", appliedUnit: "grams", epa: "432-772" },
  { id: "Advion Ant Gel Bait",            name: "Advion Ant Gel Bait",            perGallon: 0,    unit: "grams", appliedUnit: "grams", epa: "100-1498" },
  { id: "Advion Cockroach Gel Bait",      name: "Advion Cockroach Gel Bait",      perGallon: 0,    unit: "grams", appliedUnit: "grams", epa: "100-1484" },
  // Remaining standard products
  { id: "Essentria IC Pro",               name: "Essentria IC Pro",               perGallon: 2.00, unit: "oz",    appliedUnit: "gal", epa: "25B Exempt" },
  { id: "Phantom",                        name: "Phantom",                        perGallon: 3.00, unit: "oz",    appliedUnit: "gal", epa: "241-392" },
  { id: "OptiGard Flex Liquid",           name: "OptiGard Flex Liquid",           perGallon: 0.41, unit: "oz",    appliedUnit: "gal", epa: "100-1306" },
  { id: "Onslaught FastCap Spider/Scorp", name: "Onslaught FastCap Spider/Scorp", perGallon: 1.00, unit: "oz",    appliedUnit: "gal", epa: "1021-2574" },
  { id: "OneGuard Multi MoA",             name: "OneGuard Multi MoA",             perGallon: 1.50, unit: "oz",    appliedUnit: "gal", epa: "1021-2807" },
  { id: "Gentrol IGR Concentrate",        name: "Gentrol IGR Concentrate",        perGallon: 1.00, unit: "oz",    appliedUnit: "gal", epa: "2724-351" },
  { id: "Nyguard IGR Concentrate",        name: "Nyguard IGR Concentrate",        perGallon: 5.50, unit: "mL",    appliedUnit: "gal", epa: "1021-1603" },
  { id: "ExciteR",                        name: "ExciteR",                        perGallon: 1.56, unit: "oz",    appliedUnit: "gal" },
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
  epa?: string;            // EPA Registration #
}

// Deduplicated catalog from the provided CSV.
// Source: chemicals list in the project knowledge.
const RAW_CATALOG: Array<[string, string, string, string, string?]> = [
  // [name, manufacturer, concentrated_unit, diluted_unit, epa?]
  ["Silverfish Paks", "Dekko", "pkg", "pkg"],
  ["Dekko Bait Silverfish", "", "units", "units"],
  ["Premise Foam", "Bayer", "can", "can"],
  ["565 Plus", "BASF", "can", "can"],
  ["Ultracide", "Whitmore Micro-Gen", "can", "oz"],
  ["Webster Pole", "", "cc", "cc"],
  ["PT Alpine Pressurized Insecticide", "", "cc", "cc"],
  ["Advion Cockroach Gel", "Syngenta", "grams", "grams", "100-1484"],
  ["FastCap", "MGK", "cc", "cc"],
  ["Invade Hot Spot+", "", "fl oz", "fl oz", "None"],
  ["Niban", "Nisus", "cc", "cc", "64405-2"],
  ["Niban Granular Bait", "Nisus", "lbs", "lbs", "64405-2"],
  ["Nibor-D Foam + IGR", "Nisus", "fl oz", "fl oz", "64405-37"],
  ["Shockwave", "", "cc", "cc", "1021-2804"],
  ["Exciter", "", "cc", "cc"],
  ["CB-80", "", "fl oz", "fl oz"],
  ["Selontra Rodent Bait", "BASF", "cc", "cc"],
  ["Essentria Pro", "", "cc", "fl oz", "25B Exempt"],
  ["Essentria G", "", "grams", "grams", "25B Exempt"],
  ["Evo Tunnel", "", "each", "each"],
  ["Glue Trays", "", "each", "each"],
  ["Secured Rodent Station", "", "each", "each"],
  ["EZ Klean Station", "", "each", "each"],
  ["Rat Snap Trap", "", "each", "each"],
  ["Tin Cat", "", "each", "each"],
  ["Mouse Trap", "", "each", "each"],
  ["Sentricon Recruit AG", "Dow", "each", "each"],
  ["Sentricon Recruit HD", "Dow", "each", "each"],
  ["Gentrol Aerosol", "Zoecon", "fl oz", "fl oz", "2724-484"],
  ["Precor 2000", "Wellmark", "fl oz", "fl oz"],
  ["Precor", "Wellmark", "fl oz", "gal"],
  ["Tekko Pro", "CSI", "fl oz", "gal"],
  ["Bedlam Plus", "MGK", "fl oz", "fl oz", "1021-2569"],
  ["Cross Check Plus", "Lesco", "fl oz", "gal"],
  ["Talstar P", "FMC", "fl oz", "gal"],
  ["MasterLine B MaxxPro", "FMC", "fl oz", "gal", "279-3206-73748"],
  ["Phantom RTS", "BASF", "fl oz", "fl oz"],
  ["Cy-Kick CS", "BASF", "fl oz", "gal"],
  ["Cyper TC", "", "fl oz", "gal"],
  ["Suspend PolyZone", "Bayer", "fl oz", "gal"],
  ["PT Alpine Flea & Bed Bug", "BASF", "fl oz", "fl oz", "499-540"],
  ["PT Alpine Fly Bait", "BASF", "fl oz", "fl oz", "499-568"],
  ["Zenprox", "Zoecon", "fl oz", "gal"],
  ["Taurus SC", "", "fl oz", "gal"],
  ["Termidor HE", "BASF", "fl oz", "gal"],
  ["Tempo SC", "Bayer", "mL", "gal"],
  ["Demand CS", "Syngenta", "fl oz", "gal"],
  ["Cyzmic CS", "CSI", "fl oz", "gal"],
  ["Sector", "MGK", "fl oz", "gal"],
  ["PT Wasp Freeze", "PT", "fl oz", "fl oz", "499-550"],
  ["PT Wasp Freeze II", "PT", "fl oz", "fl oz", "499-550"],
  ["Archer IGR", "Syngenta", "fl oz", "gal"],
  ["Suspend SC", "Bayer", "fl oz", "gal"],
  ["Bora Care", "Nisus", "gal", "gal"],
  ["DSV", "Nisus", "fl oz", "gal"],
  ["Avert DF", "BASF", "grams", "grams"],
  ["Bifen L/P", "CSI", "grams", "grams", "53883-124"],
  ["Bifen LP", "CSI", "grams", "grams", "53883-124"],
  ["Take Down", "Liphatech", "grams", "grams"],
  ["Alpine Cockroach Gel", "BASF", "grams", "grams"],
  ["Max Force Roach Bait", "Bayer", "grams", "grams"],
  ["Maxforce Ant Gel", "Bayer", "grams", "grams"],
  ["Maxforce Quantum Ant Bait", "Bayer", "grams", "grams", "432-1506"],
  ["Maxforce Quantum", "Bayer", "grams", "grams", "432-1506"],
  ["In2Care", "In2Care", "grams", "grams", "91720-1"],
  ["In2Care Mix", "In2Care", "grams", "grams", "91720-1"],
  ["Advion Fire Ant Bait", "Syngenta", "lbs", "lbs"],
  ["Wisdom Lawn Granular", "AmVac", "lbs", "lbs"],
  ["Contrac Blox", "Bell Labs", "oz", "oz", "12455-151"],
  ["California - Contrac All Weather Blox", "Bell Labs", "oz", "oz", "12455-151"],
  ["DeltaDust", "Bayer", "grams", "grams", "432-772"],
  ["DeltaDust Insecticide", "Bayer", "grams", "grams", "432-772"],
  ["Top Choice", "Bayer", "lbs", "lbs"],
  ["Snake A Way", "Dr. T's", "lbs", "lbs"],
  ["American Brand Granules", "VPG", "lbs", "lbs"],
  ["Sluggo", "Neudorff", "lbs", "lbs"],
  ["Tandem", "", "mL", "mL"],
  ["Talon G", "Syngenta", "oz", "grams"],
  ["Advion Microflow", "Syngenta", "oz", "oz", "100-1682"],
  ["Advion MicroFlow", "Syngenta", "oz", "oz", "100-1682"],
  ["Advion Ant Gel", "Syngenta", "grams", "grams", "100-1498"],
  ["Optiguard", "Syngenta", "oz", "oz", "100-1306"],
  ["Transport Mikron", "FMC", "fl oz", "gal"],
  ["Eco-Via EC", "Rockwell Labs", "fl oz", "gal"],
];

export const CATALOG_PRODUCTS: CatalogProduct[] = RAW_CATALOG.map(([name, manufacturer, conc, dil, epa]) => ({
  name,
  manufacturer: manufacturer || undefined,
  undilutedUnit: normalizeUnit(conc),
  appliedUnit: normalizeUnit(dil),
  epa: epa || undefined,
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
  // unknown product → safe defaults (default to grams when unit is unknown)
  return {
    name,
    applied_amount: null,
    applied_unit: "gal",
    undiluted_amount: null,
    undiluted_unit: "grams",
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

// Collect every product usage entry from a service: the service-level
// `products_used` PLUS each unit's `unit_details[].products_used`.
// Used by HOA views so technicians who only logged products per-unit still
// see a complete "Products Used" table at the service level.
export const collectServiceProductUsage = (service: any): ProductUsage[] => {
  const out: ProductUsage[] = [];
  if (Array.isArray(service?.products_used)) {
    out.push(...normalizeUsageList(service.products_used));
  }
  if (Array.isArray(service?.unit_details)) {
    for (const u of service.unit_details as any[]) {
      if (Array.isArray(u?.products_used)) {
        out.push(...normalizeUsageList(u.products_used));
      }
    }
  }
  return out;
};

// ─── EPA Registration # lookup (standard products first, then catalog) ───
export const findEpaNumber = (name: string): string | undefined => {
  if (!name) return undefined;
  const std = findStandardProduct(name);
  if (std?.epa) return std.epa;
  const cat = findCatalogProduct(name);
  if (cat?.epa) return cat.epa;
  return undefined;
};

// ─── Convert any volume amount → fluid ounces (for dilution math) ───
const toFlOz = (amount: number, unit: string): number | null => {
  const u = (unit || "").toLowerCase();
  switch (u) {
    case "fl oz": case "floz": case "oz": return amount; // treat dry "oz" loosely
    case "ml": return amount / 29.5735;
    case "cc": return amount / 29.5735;
    case "gal": return amount * 128;
    case "qt": return amount * 32;
    case "grams": case "g": case "lbs": case "lb":
    case "each": case "pkg": case "units": case "can":
      return null; // dry / discrete — no volumetric dilution math
    default: return null;
  }
};
const flOzToUnit = (flOz: number, unit: string): number => {
  const u = (unit || "").toLowerCase();
  switch (u) {
    case "fl oz": case "floz": case "oz": return flOz;
    case "ml": case "cc": return flOz * 29.5735;
    case "gal": return flOz / 128;
    case "qt": return flOz / 32;
    default: return flOz;
  }
};

// ─── Dilution math result for a single ProductUsage ───
// Returns dilution rate (% concentrate) and mix ratio (concentrate per 1 gallon finished mix).
// Falls back to undefined fields if the units are not volumetric.
export interface DilutionInfo {
  ratePct?: number;          // 0.### %
  mixRatioPerGal?: number;   // amount of concentrate per 1 gal finished mix
  mixRatioUnit?: string;     // unit for mixRatioPerGal (matches u.undiluted_unit)
}
export const computeDilution = (u: ProductUsage): DilutionInfo => {
  const appliedFlOz = u.applied_amount != null ? toFlOz(Number(u.applied_amount), u.applied_unit) : null;
  const concFlOz = u.undiluted_amount != null ? toFlOz(Number(u.undiluted_amount), u.undiluted_unit) : null;

  let ratePct: number | undefined;
  if (appliedFlOz && appliedFlOz > 0 && concFlOz != null) {
    ratePct = +(100 * (concFlOz / appliedFlOz)).toFixed(2);
  }

  // Mix ratio per 1 gal finished mix, expressed in the concentrate's unit
  let mixRatioPerGal: number | undefined;
  let mixRatioUnit: string | undefined;
  // Standard products have a known per-gallon ratio
  const std = findStandardProduct(u.name);
  if (std && std.perGallon > 0) {
    mixRatioPerGal = std.perGallon;
    mixRatioUnit = std.unit;
  } else if (appliedFlOz && appliedFlOz > 0 && u.undiluted_amount != null) {
    // Derive: concentrate per (appliedFlOz / 128) gallons
    const galsApplied = appliedFlOz / 128;
    if (galsApplied > 0) {
      mixRatioPerGal = +(Number(u.undiluted_amount) / galsApplied).toFixed(3);
      mixRatioUnit = u.undiluted_unit;
    }
  }

  return { ratePct, mixRatioPerGal, mixRatioUnit };
};
