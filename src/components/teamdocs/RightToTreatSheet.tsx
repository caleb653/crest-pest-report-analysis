import { useRef, useState } from "react";
import { Download, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SignatureCanvas, type SignatureCanvasRef } from "@/components/SignatureCanvas";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  COMPANY, RTT_INTRO, RTT_RIGHT_TO_ENTER_ACK, RTT_SECTIONS, RTT_TERMS_ACK,
  RTT_TERMS_VERSION, RTT_TITLE, type RightToTreatFormData,
} from "@/lib/rightToTreatTerms";
import { downloadRightToTreatAgreementPdf } from "@/lib/rightToTreatAgreementPdf";

export type RttDraft = Partial<RightToTreatFormData>;

export const emptyRttDraft = (): RightToTreatFormData => ({
  service_address: "",
  signer_name: "",
  signer_email: "",
  signer_phone: "",
  form_date: format(new Date(), "yyyy-MM-dd"),
  crest_representative: "",
  right_to_enter: false,
  terms_agreed: false,
  terms_version: RTT_TERMS_VERSION,
});

export function rttDraftFrom(partial: RttDraft | null | undefined): RightToTreatFormData {
  const base = emptyRttDraft();
  if (!partial) return base;
  return {
    ...base,
    ...Object.fromEntries(Object.entries(partial).filter(([, v]) => v !== null && v !== undefined)),
    right_to_enter: false,
    terms_agreed: false,
    form_date: partial.form_date || base.form_date,
  } as RightToTreatFormData;
}

/** The full legal text, used by the sign view and the submitted-doc viewer. */
export function RttTermsBody({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`rounded-lg border bg-muted/40 p-4 ${compact ? "text-[11px]" : "text-xs"} leading-relaxed space-y-3`}>
      <p className="italic">{RTT_INTRO}</p>
      {RTT_SECTIONS.map((s) => (
        <div key={s.title} className="space-y-1">
          <p className="font-bold text-foreground">{s.title}</p>
          {s.paragraphs.map((p, i) => (
            <p key={i} className={s.title.startsWith("2.") ? "italic" : ""}>{p}</p>
          ))}
        </div>
      ))}
    </div>
  );
}

export function RttHeader() {
  return (
    <CardHeader className="text-center space-y-1">
      <CardTitle className="text-xl">{COMPANY.name}</CardTitle>
      <p className="text-xs text-muted-foreground">
        {COMPANY.license} · {COMPANY.phone} · {COMPANY.website}
      </p>
      <p className="text-base font-semibold text-foreground pt-1">{RTT_TITLE}</p>
    </CardHeader>
  );
}

interface Props {
  /** Pre-filled values (pre-made sheet) or nothing (blank sheet). */
  initial?: RttDraft | null;
  /** "sign" = customer signs now; "prepare" = office fills customer details only, no signature. */
  mode: "sign" | "prepare";
  submitting?: boolean;
  onSubmit: (data: RightToTreatFormData, signature: string | null) => Promise<void> | void;
}

export function RightToTreatSheet({ initial, mode, submitting, onSubmit }: Props) {
  const [d, setD] = useState<RightToTreatFormData>(() => rttDraftFrom(initial));
  const [signature, setSignature] = useState<string | null>(null);
  const sigRef = useRef<SignatureCanvasRef>(null);
  const set = <K extends keyof RightToTreatFormData>(k: K, v: RightToTreatFormData[K]) => setD((p) => ({ ...p, [k]: v }));

  const submit = async () => {
    if (!d.service_address.trim()) { toast.error("Service address is required"); return; }
    if (mode === "prepare") {
      await onSubmit({ ...d, terms_version: RTT_TERMS_VERSION }, null);
      return;
    }
    if (!d.signer_name.trim()) { toast.error("Please type the signer's full name"); return; }
    if (!d.right_to_enter) { toast.error("Please check the Right to Enter box"); return; }
    if (!d.terms_agreed) { toast.error("Please check the Terms & Conditions box"); return; }
    const sig = sigRef.current?.forceSave() || signature;
    if (!sig) { toast.error("Please sign before submitting"); return; }
    await onSubmit({ ...d, terms_version: RTT_TERMS_VERSION }, sig);
  };

  const prepare = mode === "prepare";

  return (
    <Card>
      <RttHeader />
      <CardContent className="space-y-5">
        {prepare && (
          <p className="text-sm text-muted-foreground rounded-md border bg-amber-50/60 border-amber-200 p-3">
            Fill in what you know about the customer. The sheet is saved under <b>Pre-Made Signature Sheets</b> and
            moves to <b>Submitted</b> once the customer signs it.
          </p>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Service Address <span className="text-destructive">*</span></Label>
            <Input value={d.service_address} onChange={(e) => set("service_address", e.target.value)} placeholder="Street, City, CA ZIP" maxLength={300} />
          </div>
          <div className="space-y-1.5">
            <Label>Date</Label>
            <Input type="date" value={d.form_date} onChange={(e) => set("form_date", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Crest Representative <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <Input value={d.crest_representative || ""} onChange={(e) => set("crest_representative", e.target.value)} placeholder="Technician or office member" maxLength={120} />
          </div>
          <div className="space-y-1.5">
            <Label>Signer's Full Name {!prepare && <span className="text-destructive">*</span>}</Label>
            <Input value={d.signer_name} onChange={(e) => set("signer_name", e.target.value)} placeholder="Printed name" maxLength={200} />
          </div>
          <div className="space-y-1.5">
            <Label>Email <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <Input type="email" value={d.signer_email || ""} onChange={(e) => set("signer_email", e.target.value)} placeholder="name@example.com" maxLength={200} />
          </div>
          <div className="space-y-1.5">
            <Label>Phone <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <Input type="tel" value={d.signer_phone || ""} onChange={(e) => set("signer_phone", e.target.value)} placeholder="(xxx) xxx-xxxx" maxLength={40} />
          </div>
        </div>

        <RttTermsBody />

        {!prepare && (
          <div className="space-y-2">
            <label className="flex items-start gap-2.5 rounded-md border bg-background p-3 text-xs leading-snug cursor-pointer">
              <Checkbox checked={d.right_to_enter} onCheckedChange={(v) => set("right_to_enter", v === true)} className="mt-0.5" />
              <span>{RTT_RIGHT_TO_ENTER_ACK}</span>
            </label>
            <label className="flex items-start gap-2.5 rounded-md border bg-background p-3 text-xs leading-snug cursor-pointer">
              <Checkbox checked={d.terms_agreed} onCheckedChange={(v) => set("terms_agreed", v === true)} className="mt-0.5" />
              <span>{RTT_TERMS_ACK}</span>
            </label>
            <div className="space-y-1.5 pt-1">
              <Label>Signature of Authorizing Party</Label>
              <div className="h-44 border rounded-md bg-background p-1">
                <SignatureCanvas ref={sigRef} onSave={setSignature} label="" />
              </div>
            </div>
          </div>
        )}

        <Button className="w-full" size="lg" onClick={submit} disabled={!!submitting}>
          {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <ShieldCheck className="w-4 h-4 mr-2" />}
          {prepare ? "Save Pre-Made Sheet" : "Submit Signed Authorization"}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="w-full text-xs text-muted-foreground"
          onClick={() => downloadRightToTreatAgreementPdf({ ...d, right_to_enter: false, terms_agreed: false })}
        >
          <Download className="w-3.5 h-3.5 mr-1" />Download this sheet as a blank PDF (print &amp; sign)
        </Button>
      </CardContent>
    </Card>
  );
}
