import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { downloadVisitPdf, type VisitPdfData } from "@/lib/visitPdf";

/**
 * Small "Download PDF" button attached to any past-visit card in the
 * apartment or commercial portal. Builds a clean print-style report from
 * the visit's data via `getData` (see buildCommercialVisitPdfData /
 * buildApartmentVisitPdfData in @/lib/visitPdf).
 */
export function VisitPdfButton({
  getData,
  filename,
  className,
  compact = true,
}: {
  getData: () => VisitPdfData;
  filename?: string;
  className?: string;
  compact?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const run = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (busy) return;
    try {
      setBusy(true);
      await downloadVisitPdf({ ...getData(), filename });
      toast.success("PDF downloaded");
    } catch (err) {
      console.error("Visit PDF failed:", err);
      toast.error("Could not generate PDF");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Button
      type="button"
      variant="outline"
      size={compact ? "icon" : "sm"}
      onClick={run}
      disabled={busy}
      title="Download this visit as PDF"
      data-visit-pdf-hide
      className={compact ? `h-8 w-8 ${className ?? ""}` : className}
    >
      {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
      {!compact && <span className="ml-1 text-xs">PDF</span>}
    </Button>
  );
}
