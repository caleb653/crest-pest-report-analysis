// Free and Clear certificate download, shared by every surface that shows a
// free-and-clear unit: the admin PropertyDashboard cards, the PM portal (unit
// rows + single-unit detail), and the customer-facing ClientPortal.
//
// The rep picks what the certificate certifies — general pest, German
// cockroach, bed bug, or any combination — and one PDF is produced naming
// exactly those pests. Keeping it in one component is what stops the four
// portals from drifting apart.
import { useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  FREE_AND_CLEAR_PESTS,
  generateFreeAndClearCertificatePdf,
  type FreeAndClearContext,
  type FreeAndClearPest,
} from "@/lib/freeAndClearCertificate";

interface FreeAndClearCertificateButtonProps {
  /** Everything about the unit and visit except which pests are certified. */
  context: Omit<FreeAndClearContext, "pests" | "variant">;
  /** False when someone unchecked the bed bug box on the report. */
  allowBedBug?: boolean;
  label?: string;
  /** Classes for the trigger button (each portal sizes it differently). */
  className?: string;
  /** Admin cards strip these controls out of generated visit PDFs. */
  hideInVisitPdf?: boolean;
}

export const FreeAndClearCertificateButton = ({
  context,
  allowBedBug = true,
  label = "Free & Clear PDF",
  className,
  hideInVisitPdf,
}: FreeAndClearCertificateButtonProps) => {
  const [selected, setSelected] = useState<FreeAndClearPest[]>(["general"]);

  const options = FREE_AND_CLEAR_PESTS.filter((o) => o.value !== "bedbug" || allowBedBug);

  const toggle = (pest: FreeAndClearPest) =>
    setSelected((prev) => (prev.includes(pest) ? prev.filter((p) => p !== pest) : [...prev, pest]));

  const download = () => {
    if (!selected.length) return;
    generateFreeAndClearCertificatePdf({ ...context, pests: selected });
  };

  return (
    // These controls live inside click-to-expand card headers on several
    // portals, so every click stops here instead of toggling the card.
    <span
      data-no-toggle
      {...(hideInVisitPdf ? { "data-visit-pdf-hide": true } : {})}
      onClick={(e) => e.stopPropagation()}
    >
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" size="sm" variant="outline" className={className}>
            <Download className="w-3 h-3 mr-1" /> {label}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60 bg-popover z-50">
          <DropdownMenuLabel className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Certify free and clear of…
          </DropdownMenuLabel>
          {options.map((option) => (
            <DropdownMenuCheckboxItem
              key={option.value}
              checked={selected.includes(option.value)}
              // Keep the menu open so several pests can go on one certificate.
              onSelect={(e) => e.preventDefault()}
              onCheckedChange={() => toggle(option.value)}
            >
              {option.label}
            </DropdownMenuCheckboxItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled={selected.length === 0} onSelect={download}>
            <Download className="w-3 h-3 mr-2" />
            {selected.length > 1 ? `Download (${selected.length} pests)` : "Download certificate"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </span>
  );
};

export default FreeAndClearCertificateButton;
