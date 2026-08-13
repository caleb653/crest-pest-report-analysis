import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SignatureCanvas, SignatureCanvasRef } from "@/components/SignatureCanvas";
import { CheckCircle2, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { downloadRightToTreatPdf } from "@/lib/rightToTreatPdf";
import { Download } from "lucide-react";

interface RequestRow {
  id: string;
  unit_number: string | null;
  pest_type: string | null;
  location_type: string | null;
  description: string | null;
  preferred_date: string | null;
  right_to_treat_signature: string | null;
  right_to_treat_signed_at: string | null;
  right_to_treat_signer_name: string | null;
}
interface PropertyRow {
  name: string;
  address: string | null;
}

const RightToTreat = () => {
  const { token } = useParams();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [request, setRequest] = useState<RequestRow | null>(null);
  const [property, setProperty] = useState<PropertyRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [signerName, setSignerName] = useState("");
  const [signature, setSignature] = useState<string | null>(null);
  const sigRef = useRef<SignatureCanvasRef>(null);

  useEffect(() => {
    if (!token) { setError("Invalid link"); setLoading(false); return; }
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke("sign-right-to-treat", {
          body: undefined,
          // GET via query string isn't supported by invoke; use fetch instead
        });
        // Fall through — we use direct fetch below
        void data; void error;
      } catch { /* ignored */ }

      try {
        const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sign-right-to-treat?token=${encodeURIComponent(token)}`;
        const res = await fetch(url, {
          headers: { apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` },
        });
        const json = await res.json();
        if (!json.ok) {
          setError(json.error === "not_found" ? "This link is invalid or has expired." : "Could not load request.");
        } else {
          setRequest(json.request);
          setProperty(json.property);
          if (json.request?.right_to_treat_signer_name) setSignerName(json.request.right_to_treat_signer_name);
        }
      } catch (e) {
        setError("Could not load request.");
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  const handleSubmit = async () => {
    const sig = sigRef.current?.forceSave() || signature;
    if (!sig) {
      toast.error("Please sign before submitting");
      return;
    }
    if (!signerName.trim()) {
      toast.error("Please type your name");
      return;
    }
    setSubmitting(true);
    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sign-right-to-treat`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ token, signature: sig, signerName: signerName.trim() }),
      });
      const json = await res.json();
      if (!json.ok) {
        toast.error("Could not save signature");
      } else {
        toast.success("Thank you — your authorization has been recorded");
        setRequest((r) => r ? { ...r, right_to_treat_signature: sig, right_to_treat_signed_at: new Date().toISOString(), right_to_treat_signer_name: signerName.trim() } : r);
      }
    } catch {
      toast.error("Network error");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
        <Card className="max-w-md w-full">
          <CardContent className="p-6 text-center">
            <p className="text-destructive font-medium">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const alreadySigned = !!request?.right_to_treat_signature;

  return (
    <div className="min-h-screen bg-muted/30 py-6 px-4">
      <div className="max-w-xl mx-auto space-y-4">
        <Card>
          <CardHeader className="bg-foreground text-background rounded-t-lg">
            <CardTitle className="flex items-center gap-2 text-lg">
              <ShieldCheck className="w-5 h-5" />
              Right to Treat — Authorization
            </CardTitle>
          </CardHeader>
          <CardContent className="p-5 space-y-4">
            <div className="space-y-1 text-sm">
              <p><span className="text-muted-foreground">Property:</span> <span className="font-semibold">{property?.name || "—"}</span></p>
              {property?.address && <p><span className="text-muted-foreground">Address:</span> {property.address}</p>}
              {request?.unit_number && <p><span className="text-muted-foreground">Unit:</span> <span className="font-semibold">{request.unit_number}</span></p>}
              {request?.pest_type && <p><span className="text-muted-foreground">Reason:</span> {request.pest_type}{request.location_type ? ` (${request.location_type})` : ""}</p>}
            </div>

            <div className="rounded-md border bg-muted/40 p-3 text-xs leading-relaxed">
              By signing below, I authorize Crest Pest Control to enter and treat the unit identified above.
              I understand the technician will apply EPA-registered pest control products consistent with their professional judgment
              and the property's service plan.
            </div>

            <div className="rounded-md border border-amber-300 bg-amber-50/70 p-3 text-[11px] leading-snug text-amber-950/90 space-y-2">
              <p className="font-bold uppercase tracking-wide text-amber-800 text-xs">Pesticide Notice</p>
              <p className="italic">
                State law requires that you be given the following information: CAUTION—PESTICIDES ARE TOXIC CHEMICALS.
                Structural Pest Control Companies are registered and regulated by the Structural Pest Control Board, and
                apply pesticides which are registered and approved for use by the California Department of Pesticide
                Regulation and the United States Environmental Protection Agency. Registration is granted when the state
                finds that, based on existing scientific evidence, there are no appreciable risks if proper use conditions
                are followed or that the risks are outweighed by the benefits. The degree of risk depends upon the degree
                of exposure, so exposure should be minimized. If within 24 hours following application you experience
                symptoms similar to common seasonal illness comparable to the flu, contact your physician or poison
                control center (800-222-1222) and your pest control company immediately. For further information,
                contact: Crest Pest Control (949-424-5000); Health Questions—County Health Department (800-564-8448);
                Application Information—County Agricultural Commissioner (714-955-0100); Regulatory Information—
                Structural Pest Control Board (800-737-8188), 2005 Evergreen Street, Ste. 1500, Sacramento, CA 95815.
              </p>
            </div>

            <div className="rounded-md border bg-muted/30 p-3 text-[11px] leading-snug space-y-1.5">
              <p className="font-bold uppercase tracking-wide text-foreground text-xs">Possible Chemicals Used</p>
              <p className="text-muted-foreground">
                Depending on conditions observed, the technician may apply one or more of the following EPA-registered products:
              </p>
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-0.5 list-disc pl-4 text-foreground/90">
                <li>Alpine WSG (Dinotefuran)</li>
                <li>Bifen I/T (Bifenthrin)</li>
                <li>Essentria IC Pro (Geraniol, Clove Oil, Cornmint Oil)</li>
                <li>Temprid FX (Imidacloprid, Cyfluthrin)</li>
                <li>Termidor SC (Fipronil)</li>
                <li>Phantom (Chlorfenapyr)</li>
                <li>ExciteR (Pyrethrins, Piperonyl Butoxide)</li>
                <li>Gentrol IGR Concentrate ((S)-Hydroprene)</li>
                <li>Nyguard IGR Concentrate (Pyridine)</li>
                <li>PT Wasp Freeze (Prallethrin)</li>
                <li>PT Alpine Flea & Bed Bug (Dinotefuran, Pyriproxyfen, Prallethrin)</li>
                <li>PT Alpine Fly Bait</li>
                <li>Gentrol Aerosol ((S)-Hydroprene)</li>
                <li>Bedlam (Cyclopropanecarboxylate, Dicarboximide)</li>
                <li>Invade Hot Spot +</li>
                <li>Bifen LP (Bifenthrin)</li>
                <li>Advion Ant Gel Bait (Indoxacarb)</li>
                <li>Maxforce FC Ant Gel (Fipronil)</li>
                <li>MasterLine B MaxxPro</li>
                <li>Advion Cockroach Gel Bait (Indoxacarb)</li>
                <li>Contrac California (Bromethalin)</li>
                <li>Delta Dust (Deltamethrin)</li>
                <li>In2Care Mix (Pyriproxyfen, Beauveria bassiana Strain GHA)</li>
                <li>OneGuard (Lambda-cyhalothrin, Prallethrin, Pyriproxyfen, Piperonyl Butoxide)</li>
                <li>Advion Microflow (Indoxacarb)</li>
                <li>Optigard (Thiamethoxam)</li>
                <li>Crossfire Bedbug Concentrate (Clothianidin, Metofluthrin, Piperonyl Butoxide)</li>
                <li>Nibor-D Insecticide (Disodium Octaborate)</li>
                <li>Nibor-D Foam + IGR (Disodium Octaborate)</li>
                <li>Neogen SureKill SK100 (Pyrethrins, Piperonyl Butoxide, N-Octyl Bicycloheptene Dicarboximide)</li>
                <li>ProFoam Platinum (Foaming Agent)</li>
                <li>Invade Bio Cleaner (Citrus Oil, Microbes, Surfactants)</li>
                <li>Take Down II Soft Bait (Bromethalin)</li>
              </ul>
            </div>

            {alreadySigned ? (
              <div className="rounded-md border border-primary/30 bg-primary/5 p-4 text-center space-y-2">
                <CheckCircle2 className="w-8 h-8 text-primary mx-auto" />
                <p className="font-semibold">Authorization Received</p>
                <p className="text-xs text-muted-foreground">
                  Signed{request?.right_to_treat_signer_name ? ` by ${request.right_to_treat_signer_name}` : ""}
                  {request?.right_to_treat_signed_at ? ` on ${new Date(request.right_to_treat_signed_at).toLocaleString()}` : ""}
                </p>
                {request?.right_to_treat_signature && (
                  <img src={request.right_to_treat_signature} alt="Signature" className="mx-auto max-h-20 bg-white rounded border p-2" />
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  onClick={() => downloadRightToTreatPdf({
                    propertyName: property?.name,
                    propertyAddress: property?.address,
                    unitNumber: request?.unit_number,
                    signerName: request?.right_to_treat_signer_name,
                    reason: request?.pest_type,
                    locationType: request?.location_type,
                    description: request?.description,
                    signedAt: request?.right_to_treat_signed_at,
                    signatureDataUrl: request?.right_to_treat_signature,
                  })}
                >
                  <Download className="w-4 h-4 mr-1.5" />Download Signed Authorization (PDF)
                </Button>
              </div>
            ) : (
              <>
                <div className="space-y-1.5">
                  <Label className="text-sm">Your Name</Label>
                  <Input value={signerName} onChange={(e) => setSignerName(e.target.value)} placeholder="Full name" maxLength={200} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm">Signature</Label>
                  <div className="border rounded-md bg-background">
                    <SignatureCanvas ref={sigRef} onSave={setSignature} label="" />
                  </div>
                </div>
                <Button className="w-full" size="lg" onClick={handleSubmit} disabled={submitting}>
                  {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ShieldCheck className="w-4 h-4 mr-2" />}
                  Submit Authorization
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default RightToTreat;