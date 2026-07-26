import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { downloadVisitPdf } from "@/lib/visitPdf";

/**
 * Small "Download PDF" button attached to any past-visit card in the
 * apartment or commercial portal. The parent card must have a matching
 * `id={cardId}` attribute and be expanded (or opened via `onBeforeCapture`)
 * so the full body is visible in the DOM before html2canvas runs.
 */
export function VisitPdfButton({
  cardId,
  filename,
  title,
  onBeforeCapture,
  className,
  compact = true,
}: {
  cardId: string;
  filename?: string;
  title?: string;
  onBeforeCapture?: () => void | Promise<void>;
  className?: string;
  compact?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const run = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (busy) return;
    try {
      setBusy(true);
      if (onBeforeCapture) await onBeforeCapture();
      // Give React a beat to render the expanded body before capture.
      await new Promise(r => setTimeout(r, 250));
      await downloadVisitPdf({ cardId, filename, title });
      toast.success("PDF downloaded");
    } catch (err) {
      console.error(err);
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
