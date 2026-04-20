import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { FlaskConical } from "lucide-react";
import {
  ProductUsage,
  normalizeUsageList,
  aggregateUsage,
} from "@/lib/productCatalog";

// ─── Display a list of products + amounts on a single service card ───
export const ProductUsageSummary = ({ entries }: { entries: ProductUsage[] }) => {
  if (!entries || entries.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {entries.map((u, j) => {
        const hasAmt = u.applied_amount || u.undiluted_amount;
        return (
          <Badge
            key={`${u.name}-${j}`}
            variant="outline"
            className="text-[10px] flex items-center gap-1 py-0.5"
            title={hasAmt ? `Applied: ${u.applied_amount ?? "—"} ${u.applied_unit} · Undiluted: ${u.undiluted_amount ?? "—"} ${u.undiluted_unit}` : ""}
          >
            <span className="font-medium">{u.name}</span>
            {hasAmt && (
              <span className="text-muted-foreground">
                {u.applied_amount != null && <span> · {u.applied_amount}{u.applied_unit}</span>}
                {u.undiluted_amount != null && (
                  <span className="text-primary"> ({u.undiluted_amount}{u.undiluted_unit})</span>
                )}
              </span>
            )}
          </Badge>
        );
      })}
    </div>
  );
};

// ─── Property-level cumulative totals across ALL services ───
interface ServiceLike {
  service_date: string | null;
  status: string;
  unit_details?: any;
  products_used?: any;
}

export const ProductUsageTotalsCard = ({ services }: { services: ServiceLike[] }) => {
  const totals = useMemo(() => {
    const all: ProductUsage[] = [];
    for (const s of services) {
      // 1) service-level products_used (legacy + new)
      all.push(...normalizeUsageList(s.products_used));
      // 2) per-unit products_used inside unit_details
      if (Array.isArray(s.unit_details)) {
        for (const u of s.unit_details) {
          // unit_details may store products as string, array, or ProductUsage[]
          if (Array.isArray(u?.products_used)) {
            all.push(...normalizeUsageList(u.products_used));
          } else if (typeof u?.products_used === "string" && u.products_used.trim()) {
            // legacy CSV-string format → split on commas
            const parts = u.products_used.split(",").map((p: string) => p.trim()).filter(Boolean);
            all.push(...normalizeUsageList(parts));
          }
        }
      }
    }
    return aggregateUsage(all.filter(u => u.name));
  }, [services]);

  if (totals.length === 0) {
    return (
      <Card className="p-4 text-center text-xs text-muted-foreground">
        <FlaskConical className="w-5 h-5 mx-auto mb-1.5 opacity-50" />
        No product usage recorded for this property yet.
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <div className="bg-primary/[0.06] px-3 py-2 border-b border-border flex items-center gap-2">
        <FlaskConical className="w-4 h-4 text-primary" />
        <p className="text-xs font-bold uppercase tracking-wide">Product Usage Totals</p>
        <Badge variant="secondary" className="ml-auto text-[10px]">{totals.length} product{totals.length === 1 ? "" : "s"}</Badge>
      </div>
      <table className="w-full text-xs">
        <thead className="bg-muted/40">
          <tr>
            <th className="text-left px-3 py-1.5 font-semibold">Product</th>
            <th className="text-right px-3 py-1.5 font-semibold">Total Applied</th>
            <th className="text-right px-3 py-1.5 font-semibold">Total Undiluted</th>
          </tr>
        </thead>
        <tbody>
          {totals.map((t, i) => (
            <tr key={`${t.name}-${i}`} className={i % 2 === 1 ? "bg-muted/20" : ""}>
              <td className="px-3 py-1.5 font-medium">{t.name}</td>
              <td className="px-3 py-1.5 text-right">
                {t.appliedTotal > 0 ? `${+t.appliedTotal.toFixed(2)} ${t.appliedUnit}` : <span className="text-muted-foreground">—</span>}
              </td>
              <td className="px-3 py-1.5 text-right text-primary font-semibold">
                {t.undilutedTotal > 0 ? `${+t.undilutedTotal.toFixed(2)} ${t.undilutedUnit}` : <span className="text-muted-foreground">—</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
};
