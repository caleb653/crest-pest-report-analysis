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
              {request?.preferred_date && <p><span className="text-muted-foreground">Preferred date:</span> {request.preferred_date}</p>}
            </div>

            <div className="rounded-md border bg-muted/40 p-3 text-xs leading-relaxed">
              By signing below, I authorize Crest Pest Control to enter and treat the unit identified above.
              I understand the technician will apply EPA-registered pest control products consistent with their professional judgment
              and the property's service plan.
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