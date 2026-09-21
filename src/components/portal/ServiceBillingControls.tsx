/**
 * Billing controls on a past service card (admin only).
 *
 * Everything that decides what a visit costs lives here, on the visit itself,
 * so Previous Services and the Billing tab can never disagree:
 *
 *   - is it a RECURRING visit (covered by the plan's period price) or a
 *     ONE-TIME PAID visit with its own price?
 *   - do the units beyond the plan get charged on this visit, or not?
 *
 * Nothing here creates an invoice. It decides what the visit is worth; the
 * Billing tab decides which invoice it lands on.
 */

import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { Repeat, Receipt, Check } from "lucide-react";
import { formatOverageMoney, type OverageResult } from "@/lib/unitOverage";

type BillingType = "plan" | "billable" | "no_charge" | "warranty" | "quoted";

export function ServiceBillingControls({
  service,
  overage,
  invoiced,
  onChanged,
}: {
  service: any;
  overage: OverageResult;
  /** Already on a sent invoice — the decision is locked in. */
  invoiced?: boolean;
  onChanged: () => void;
}) {
  const current: BillingType = (service?.billing_type as BillingType) || "plan";
  const [type, setType] = useState<BillingType>(current);
  const [price, setPrice] = useState<string>(
    service?.billing_amount != null ? String(service.billing_amount) : ""
  );
  const [busy, setBusy] = useState(false);

  const save = async (patch: Record<string, unknown>) => {
    setBusy(true);
    const { error } = await supabase.from("portal_services").update(patch).eq("id", service.id);
    setBusy(false);
    if (error) {
      toast({ title: "Could not save", description: error.message, variant: "destructive" });
      return false;
    }
    onChanged();
    return true;
  };

  const setKind = async (next: BillingType) => {
    setType(next);
    await save(
      next === "billable"
        ? { billing_type: "billable", billing_amount: price === "" ? null : Number(price) }
        : { billing_type: next, billing_amount: null }
    );
  };

  const savePrice = async () => {
    if (price.trim() === "") return;
    await save({ billing_type: "billable", billing_amount: Number(price) || 0 });
  };

  /** Charging the extra units is the inverse of the per-visit waiver. */
  const setChargeUnits = async (charge: boolean) => {
    const rd = { ...(service.report_data || {}) };
    rd.overage_waived = !charge;
    if (!charge) rd.overage_waived_at = new Date().toISOString();
    if (rd.overage) {
      rd.overage = { ...rd.overage, waived: !charge, billable_cost: charge ? Number(rd.overage.overage_cost) || 0 : 0 };
    }
    await save({ report_data: rd });
  };

  const chargingUnits = !(service?.report_data?.overage_waived === true);
  const unitCharge = overage.unitsOver > 0 && chargingUnits ? overage.overageCost : 0;

  return (
    <div className="border-2 border-primary/25 bg-primary/[0.03] rounded-lg p-3 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Billing for this visit</p>
        {invoiced && <Badge variant="outline" className="text-[10px]">already invoiced</Badge>}
      </div>

      {/* what kind of visit this is */}
      <div className="flex flex-wrap gap-1.5">
        {(
          [
            ["plan", "Recurring visit", Repeat],
            ["billable", "One-time paid visit", Receipt],
            ["no_charge", "No charge", null],
            ["warranty", "Warranty", null],
          ] as [BillingType, string, any][]
        ).map(([value, label, Icon]) => (
          <Button
            key={value}
            type="button"
            size="sm"
            variant={type === value ? "default" : "outline"}
            className="h-8 text-xs"
            disabled={busy || invoiced}
            onClick={() => setKind(value)}
          >
            {Icon && <Icon className="w-3 h-3 mr-1" />}
            {label}
            {type === value && <Check className="w-3 h-3 ml-1" />}
          </Button>
        ))}
      </div>

      {/* price, when it has one of its own */}
      {type === "billable" && (
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold">Price for this visit</span>
          <div className="relative">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">$</span>
            <Input
              className="h-8 w-32 pl-6 text-right"
              type="number"
              value={price}
              disabled={invoiced}
              onChange={(e) => setPrice(e.target.value)}
              onBlur={savePrice}
              placeholder="0"
            />
          </div>
        </div>
      )}

      {/* charge the units over the plan? */}
      {overage.planConfigured && overage.unitsOver > 0 && (
        <div className="flex items-center justify-between gap-3 flex-wrap border-t pt-2.5">
          <div className="text-xs">
            <span className="font-semibold">{overage.unitsOver} unit{overage.unitsOver === 1 ? "" : "s"} over the plan</span>
            <span className="text-muted-foreground">
              {" "}— {overage.unitsOver} × {formatOverageMoney(overage.pricePerUnit)} ={" "}
              {formatOverageMoney(overage.overageCost)}
            </span>
          </div>
          <Button
            type="button"
            size="sm"
            variant={chargingUnits ? "default" : "outline"}
            className="h-8 text-xs"
            disabled={busy || invoiced}
            onClick={() => setChargeUnits(!chargingUnits)}
          >
            {chargingUnits ? "Charging extra units" : "Not charging extra units"}
          </Button>
        </div>
      )}

      {/* what this visit actually bills */}
      <div className="border-t pt-2.5 text-xs">
        {type === "plan" && (
          <>
            <span className="text-muted-foreground">Covered by the recurring price</span>
            {unitCharge > 0 && (
              <span className="font-semibold"> · plus {formatOverageMoney(unitCharge)} for extra units</span>
            )}
          </>
        )}
        {type === "billable" && (
          <span className="font-semibold">
            Bills {formatOverageMoney(Number(price) || 0)}
            {unitCharge > 0 ? ` · plus ${formatOverageMoney(unitCharge)} for extra units` : ""}
          </span>
        )}
        {(type === "no_charge" || type === "warranty") && (
          <span className="text-muted-foreground">Shows on the invoice at $0</span>
        )}
      </div>
    </div>
  );
}

export default ServiceBillingControls;
