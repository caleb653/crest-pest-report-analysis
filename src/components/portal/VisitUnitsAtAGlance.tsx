import { useState } from "react";
import { Copy, Check, Bug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { friendlyUnitStatus } from "@/lib/unitStatus";
import type { UpcomingUnitContext } from "@/lib/upcomingUnits";
import { UnitRightToTreatButton } from "@/components/portal/UnitRightToTreatButton";

/**
 * Compact "every unit on this visit" strip pinned to the TOP of an apartment
 * visit card (admin + PM portals, upcoming + past). Lets the office / PM see
 * the whole list before scrolling into the per-unit report, and copies as
 * plain text (one unit per line, service name beside each) so it can be
 * pasted straight into a text or email.
 */
export type GlanceUnit = {
  unit_number: string;
  /** Service label shown beside the unit (Treatment, Inspection, Follow-up, Treated, ...). */
  service: string;
  tone: "work_order" | "follow_up" | "planned";
};

// Dark text on a solid card; the tone only drives the border colour so the
// list stays high-contrast (the tinted-on-tint version read too light).
const TONE_CLASS: Record<GlanceUnit["tone"], string> = {
  follow_up: "border-orange-500",
  work_order: "border-primary",
  planned: "border-muted-foreground/60",
};

/** Unit list for an UPCOMING visit, straight from the merged upcoming contexts. */
export function glanceUnitsFromUpcoming(contexts: UpcomingUnitContext[]): GlanceUnit[] {
  return contexts
    .map((uc) => {
      const unit = String(uc.unit_number || "").trim();
      const isWO = uc.source === "work_order";
      const isFU = uc.source === "follow_up";
      const isInspectionWO = isWO && (uc.request?.request_type || "").toLowerCase().includes("inspection");
      const service = isWO ? (isInspectionWO ? "Inspection" : "Treatment") : isFU ? "Follow-up" : "Planned";
      const pest = String(uc.target_pest || uc.request?.pest_type || uc.follow_up?.target_pest || "").trim();
      return {
        unit_number: unit,
        service: pest ? `${service} (${pest})` : service,
        tone: (isFU ? "follow_up" : isWO ? "work_order" : "planned") as GlanceUnit["tone"],
      };
    })
    .filter((u) => u.unit_number);
}

/** Unit list for a COMPLETED visit, from the saved unit_details rows.
 *  `forInvoice` leaves the follow-up flag off the text: it is an internal
 *  scheduling note, not something the customer should read on a bill. */
export function glanceUnitsFromPast(unitDetails: any[], opts: { forInvoice?: boolean } = {}): GlanceUnit[] {
  return (Array.isArray(unitDetails) ? unitDetails : [])
    .map((u: any) => {
      const unit = String(u?.unit_number || "").trim();
      const status = friendlyUnitStatus(u?.status, u?.kind);
      const pest = String(u?.target_pest || "").trim();
      const isFU = u?.follow_up_needed === true;
      return {
        unit_number: unit,
        service: [status, pest ? `(${pest})` : "", isFU && !opts.forInvoice ? "• Follow-up needed" : ""].filter(Boolean).join(" "),
        tone: (isFU ? "follow_up" : "planned") as GlanceUnit["tone"],
      };
    })
    .filter((u) => u.unit_number);
}

export function glanceUnitsToText(units: Pick<GlanceUnit, "unit_number" | "service">[]): string {
  return units.map((u) => `Unit ${u.unit_number} — ${u.service}`).join("\n");
}

export function VisitUnitsAtAGlance({
  units,
  title,
  serviceDate,
  serviceTitle,
  staff = false,
}: {
  units: GlanceUnit[];
  title?: string;
  /** Office view: the Right to Treat chip also offers copy-link / clear. */
  staff?: boolean;
  /** Included as the first line of the copied text so a pasted list is self-describing. */
  serviceDate?: string | null;
  serviceTitle?: string | null;
}) {
  const [copied, setCopied] = useState(false);
  if (units.length === 0) return null;

  const heading = title || `Units on this visit (${units.length})`;

  const copy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const header = [serviceTitle, serviceDate].filter(Boolean).join(" — ");
    const text = (header ? `${header}\n` : "") + glanceUnitsToText(units);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast({ title: `Copied ${units.length} unit${units.length === 1 ? "" : "s"}`, duration: 1500 });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: "Couldn't copy", description: "Select the list and copy it manually.", variant: "destructive" });
    }
  };

  return (
    <div className="rounded-xl border-2 border-primary/40 bg-primary/[0.04] p-3" data-visit-units-glance>
      <div className="flex items-center justify-between gap-2 mb-2">
        <p className="text-xs font-bold text-primary uppercase tracking-wide flex items-center gap-1.5">
          <Bug className="w-4 h-4" />
          {heading}
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 text-xs gap-1.5 bg-background"
          onClick={copy}
          title="Copy this list as text, one unit per line"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
          {copied ? "Copied" : "Copy units"}
        </Button>
      </div>
      {/* Plain <ul> so a mouse drag-select + paste also yields one unit per line. */}
      <ul className="flex flex-wrap gap-1.5 select-text">
        {units.map((u, i) => (
          <li
            key={`${u.unit_number}-${i}`}
            className={`inline-flex items-baseline gap-1.5 rounded-md border-2 bg-background px-2.5 py-1 text-sm leading-tight text-foreground shadow-sm ${TONE_CLASS[u.tone]}`}
          >
            <span className="font-bold">Unit {u.unit_number}</span>
            <span className="text-xs font-semibold text-foreground/80">— {u.service}</span>
            <UnitRightToTreatButton unitNumber={u.unit_number} size="xs" allowStaffActions={staff} className="self-center ml-1" />
          </li>
        ))}
      </ul>
    </div>
  );
}
