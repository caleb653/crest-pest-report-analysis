import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Copy, Loader2, ShieldCheck, Shield, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SignatureCanvas, type SignatureCanvasRef } from "@/components/SignatureCanvas";
import { toast } from "sonner";
import { PESTICIDE_NOTICE, POSSIBLE_CHEMICALS } from "@/lib/rightToTreatPdf";
import { useUnitAuthorizations, type UnitAuthorization } from "@/lib/unitAuthorizations";

/**
 * "Right to Treat" chip that sits beside a unit number on any apartment
 * visit card. Unsigned → outline chip, click opens the signable form in the
 * app (the resident signs on the tech's / PM's screen, or the office copies a
 * link for the resident to sign from their phone). Signed → green chip, click
 * shows the signed authorization in the app.
 *
 * Renders nothing when there is no UnitAuthorizationsProvider above it, so
 * the same unit list components stay safe on surfaces without one (invoices,
 * customer read-only views).
 */
export function UnitRightToTreatButton({
  unitNumber,
  size = "sm",
  allowStaffActions = false,
  className = "",
}: {
  unitNumber: string | null | undefined;
  size?: "xs" | "sm";
  /** Office-only extras: copy the resident sign link, clear a signature. */
  allowStaffActions?: boolean;
  className?: string;
}) {
  const ctx = useUnitAuthorizations();
  const [open, setOpen] = useState(false);
  const unit = String(unitNumber ?? "").trim();
  if (!ctx || !unit) return null;

  const auth = ctx.get(unit);
  const signed = !!auth?.signature;
  const sizeClass = size === "xs" ? "h-6 px-1.5 text-[10px] gap-1" : "h-7 px-2 text-xs gap-1.5";

  return (
    <>
      {/* Rendered as a <span role="button"> (asChild) because several unit
          headers are themselves <button>s that expand the card; nesting a
          real <button> inside them is invalid HTML. */}
      <Button
        asChild
        variant={signed ? "default" : "outline"}
        size="sm"
        className={`${sizeClass} font-semibold shrink-0 cursor-pointer select-none ${
          signed
            ? "bg-green-600 hover:bg-green-700 text-white border-green-600"
            : "bg-background border-primary/60 text-primary hover:bg-primary/10"
        } ${className}`}
      >
        <span
          role="button"
          tabIndex={0}
          onClick={(e) => { e.stopPropagation(); e.preventDefault(); setOpen(true); }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); e.preventDefault(); setOpen(true); }
          }}
          title={signed ? `Right to Treat signed for unit ${unit}` : `Open the Right to Treat form for unit ${unit}`}
        >
          {signed ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Shield className="w-3.5 h-3.5" />}
          {signed ? "Right to Treat ✓" : "Right to Treat"}
        </span>
      </Button>
      {open && (
        <UnitRightToTreatDialog
          unitNumber={unit}
          open={open}
          onOpenChange={setOpen}
          allowStaffActions={allowStaffActions}
        />
      )}
    </>
  );
}

function NoticeBlocks() {
  return (
    <>
      <div className="rounded-md border bg-muted/40 p-3 text-xs leading-relaxed">
        By signing below, I authorize Crest Pest Control to enter and treat the unit identified above.
        I understand the technician will apply EPA-registered pest control products consistent with their
        professional judgment and the property's service plan.
      </div>
      <details className="rounded-md border border-amber-300 bg-amber-50/70 p-3 text-[11px] leading-snug text-amber-950/90">
        <summary className="font-bold uppercase tracking-wide text-amber-800 text-xs cursor-pointer">Pesticide Notice (tap to read)</summary>
        <p className="italic mt-2">{PESTICIDE_NOTICE}</p>
      </details>
      <details className="rounded-md border bg-muted/30 p-3 text-[11px] leading-snug">
        <summary className="font-bold uppercase tracking-wide text-foreground text-xs cursor-pointer">Possible Chemicals Used (tap to read)</summary>
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-0.5 list-disc pl-4 text-foreground/90 mt-2">
          {POSSIBLE_CHEMICALS.map((c) => <li key={c}>{c}</li>)}
        </ul>
      </details>
    </>
  );
}

export function UnitRightToTreatDialog({
  unitNumber,
  open,
  onOpenChange,
  allowStaffActions,
}: {
  unitNumber: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  allowStaffActions: boolean;
}) {
  const ctx = useUnitAuthorizations();
  const auth: UnitAuthorization | undefined = ctx?.get(unitNumber);
  const signed = !!auth?.signature;
  const [signerName, setSignerName] = useState("");
  const [signerEmail, setSignerEmail] = useState("");
  const [signature, setSignature] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [linkBusy, setLinkBusy] = useState(false);
  const sigRef = useRef<SignatureCanvasRef>(null);

  useEffect(() => {
    if (open) {
      setSignerName(auth?.signer_name || "");
      setSignerEmail(auth?.signer_email || "");
      setSignature(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!ctx) return null;

  const submit = async () => {
    const sig = sigRef.current?.forceSave() || signature;
    if (!sig) { toast.error("Please sign before submitting"); return; }
    if (!signerName.trim()) { toast.error("Please type your name"); return; }
    setSubmitting(true);
    try {
      const row = await ctx.sign(unitNumber, { signerName, signerEmail, signature: sig, via: allowStaffActions ? "admin" : "portal" });
      if (!row) toast.error("Could not save the signature");
      else toast.success(`Right to Treat recorded for unit ${unitNumber}`);
    } finally {
      setSubmitting(false);
    }
  };

  const copyLink = async () => {
    setLinkBusy(true);
    try {
      const row = auth?.token ? auth : await ctx.ensure(unitNumber);
      if (!row?.token) { toast.error("Could not create a sign link"); return; }
      const url = `${window.location.origin}/right-to-treat/${row.token}`;
      await navigator.clipboard.writeText(url);
      toast.success("Sign link copied — text or email it to the resident");
    } catch {
      toast.error("Couldn't copy the link");
    } finally {
      setLinkBusy(false);
    }
  };

  const clearSignature = async () => {
    if (!window.confirm(`Clear the signed Right to Treat for unit ${unitNumber}? The resident will need to sign again.`)) return;
    await ctx.clear(unitNumber);
    toast.success("Signature cleared");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-lg max-h-[92vh] overflow-y-auto p-0"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <DialogHeader className="bg-foreground text-background p-4 rounded-t-lg space-y-1">
          <DialogTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="w-5 h-5" />
            Right to Treat — Unit {unitNumber}
          </DialogTitle>
          <DialogDescription className="text-background/80 text-xs">
            {ctx.propertyName}{ctx.propertyAddress ? ` · ${ctx.propertyAddress}` : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="p-4 space-y-3">
          <NoticeBlocks />

          {signed ? (
            <div className="rounded-md border border-green-600/40 bg-green-50 p-4 text-center space-y-2">
              <CheckCircle2 className="w-8 h-8 text-green-600 mx-auto" />
              <p className="font-semibold">Authorization on file</p>
              <p className="text-xs text-muted-foreground">
                Signed{auth?.signer_name ? ` by ${auth.signer_name}` : ""}
                {auth?.signer_email ? ` (${auth.signer_email})` : ""}
                {auth?.signed_at ? ` on ${new Date(auth.signed_at).toLocaleString()}` : ""}
              </p>
              {auth?.signature && (
                <img src={auth.signature} alt="Signature" className="mx-auto max-h-24 bg-white rounded border p-2" />
              )}
              {allowStaffActions && (
                <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" onClick={clearSignature}>
                  <Undo2 className="w-3.5 h-3.5 mr-1" />Clear signature
                </Button>
              )}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-sm">Resident name</Label>
                  <Input value={signerName} onChange={(e) => setSignerName(e.target.value)} placeholder="Full name" maxLength={200} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm">Email <span className="text-muted-foreground font-normal">(optional)</span></Label>
                  <Input type="email" value={signerEmail} onChange={(e) => setSignerEmail(e.target.value)} placeholder="name@example.com" maxLength={200} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">Signature</Label>
                <div className="h-40 border rounded-md bg-background p-1">
                  <SignatureCanvas ref={sigRef} onSave={setSignature} label="" />
                </div>
              </div>
              <Button className="w-full" size="lg" onClick={submit} disabled={submitting}>
                {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ShieldCheck className="w-4 h-4 mr-2" />}
                Submit Authorization
              </Button>
              {allowStaffActions && (
                <Button variant="outline" size="sm" className="w-full text-xs" onClick={copyLink} disabled={linkBusy}>
                  {linkBusy ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Copy className="w-3.5 h-3.5 mr-1" />}
                  Copy a link for the resident to sign on their phone
                </Button>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
