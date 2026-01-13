import { useState, useEffect, useRef } from "react";
import { useParams } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Check, FileCheck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { SignatureCanvas, SignatureCanvasRef } from "@/components/SignatureCanvas";
import crestLogo from "@/assets/crest-logo.png";

interface ServiceItem {
  serviceType: string;
  initialPrice: string;
  recurringPrice: string;
  frequency: string;
}

interface PropertyImage {
  url: string;
  caption: string;
}

interface ReportData {
  id: string;
  technician_name: string;
  customer_name: string | null;
  address: string | null;
  service_date: string | null;
  findings: string | null;
  notes: string | null;
  services: ServiceItem[] | null;
  target_pests: string[] | null;
  products_used: string[] | null;
  equipment: string[] | null;
  custom_map_url: string | null;
  map_data: any;
  property_images: PropertyImage[] | null;
  customer_signature: string | null;
  sent_to_customer_at: string | null;
  report_title: string | null;
  license_number: string | null;
}

export default function CustomerReportView() {
  const { reportId } = useParams<{ reportId: string }>();
  const [report, setReport] = useState<ReportData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [hasSigned, setHasSigned] = useState(false);
  const signatureRef = useRef<SignatureCanvasRef>(null);

  useEffect(() => {
    if (reportId) {
      loadReport();
    }
  }, [reportId]);

  const loadReport = async () => {
    try {
      const { data, error: fetchError } = await supabase
        .from("reports")
        .select("*")
        .eq("id", reportId)
        .single();

      if (fetchError) throw fetchError;
      if (!data) throw new Error("Report not found");

      // Parse data properly - handle potential JSON types
      const parsedReport: ReportData = {
        id: data.id,
        technician_name: data.technician_name,
        customer_name: data.customer_name,
        address: data.address,
        service_date: data.service_date,
        findings: typeof data.findings === 'string' ? data.findings : (data.findings ? String(data.findings) : null),
        notes: data.notes,
        custom_map_url: data.custom_map_url,
        map_data: data.map_data,
        customer_signature: data.customer_signature,
        sent_to_customer_at: data.sent_to_customer_at,
        report_title: data.report_title,
        license_number: data.license_number,
        services: data.services ? (Array.isArray(data.services) ? (data.services as unknown as ServiceItem[]) : []) : null,
        target_pests: data.target_pests ? (Array.isArray(data.target_pests) ? (data.target_pests as unknown as string[]) : []) : null,
        products_used: data.products_used ? (Array.isArray(data.products_used) ? (data.products_used as unknown as string[]) : []) : null,
        equipment: data.equipment ? (Array.isArray(data.equipment) ? (data.equipment as unknown as string[]) : []) : null,
        property_images: data.property_images ? (Array.isArray(data.property_images) ? (data.property_images as unknown as PropertyImage[]) : []) : null,
      };

      setReport(parsedReport);
      setHasSigned(!!data.customer_signature);
    } catch (err: any) {
      console.error("Error loading report:", err);
      setError(err.message || "Failed to load report");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignatureSave = async (signatureData: string) => {
    if (!reportId || !signatureData) return;

    setIsSaving(true);
    try {
      const { error: updateError } = await supabase
        .from("reports")
        .update({ customer_signature: signatureData })
        .eq("id", reportId);

      if (updateError) throw updateError;

      setHasSigned(true);
      toast.success("Signature saved! Thank you for approving the proposal.");
    } catch (err: any) {
      console.error("Error saving signature:", err);
      toast.error("Failed to save signature");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSubmitSignature = () => {
    const sig = signatureRef.current?.forceSave();
    if (sig) {
      handleSignatureSave(sig);
    } else {
      toast.error("Please sign above before submitting");
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-primary" />
          <p className="text-muted-foreground">Loading your proposal...</p>
        </div>
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="p-8 max-w-md text-center">
          <h1 className="text-xl font-semibold mb-2">Unable to Load Proposal</h1>
          <p className="text-muted-foreground">
            {error || "The proposal you're looking for could not be found."}
          </p>
          <p className="text-sm text-muted-foreground mt-4">
            If you believe this is an error, please contact Crest Pest Control at (949) 424-5000.
          </p>
        </Card>
      </div>
    );
  }

  const formatFindings = (text: string | null) => {
    if (!text) return null;
    return text.split('\n').map((line, i) => (
      <span key={i}>
        {line}
        {i < text.split('\n').length - 1 && <br />}
      </span>
    ));
  };

  return (
    <div className="min-h-screen bg-[#f8f9fa]">
      {/* Header */}
      <header className="bg-[#1a5f2a] py-6 px-4">
        <div className="max-w-4xl mx-auto flex items-center justify-center">
          <img src={crestLogo} alt="Crest Pest Control" className="h-12" />
        </div>
      </header>

      {/* Already Signed Banner */}
      {hasSigned && (
        <div className="bg-green-100 border-b border-green-200 py-4 px-4">
          <div className="max-w-4xl mx-auto flex items-center gap-3 justify-center">
            <FileCheck className="w-5 h-5 text-green-700" />
            <span className="text-green-800 font-medium">
              This proposal has been signed and approved. Thank you!
            </span>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="max-w-4xl mx-auto p-4 py-8 space-y-6">
        {/* Title & Basic Info */}
        <Card className="p-6">
          <h1 className="text-2xl font-bold mb-4">
            {report.report_title || "Pest Control Proposal"}
          </h1>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Customer:</span>
              <p className="font-medium">{report.customer_name || "—"}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Service Address:</span>
              <p className="font-medium">{report.address || "—"}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Service Date:</span>
              <p className="font-medium">{report.service_date || "—"}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Technician:</span>
              <p className="font-medium">
                {report.technician_name}
                {report.license_number && <span className="text-muted-foreground ml-1">({report.license_number})</span>}
              </p>
            </div>
          </div>
        </Card>

        {/* Services */}
        {report.services && report.services.length > 0 && (
          <Card className="p-6">
            <h2 className="text-lg font-semibold mb-4">Proposed Services</h2>
            <div className="space-y-4">
              {report.services.map((service, idx) => (
                <div key={idx} className="border rounded-lg p-4 bg-muted/30">
                  <h3 className="font-medium text-base mb-2">{service.serviceType}</h3>
                  <div className="flex flex-wrap gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">Initial:</span>{" "}
                      <span className="font-medium">${service.initialPrice}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Recurring:</span>{" "}
                      <span className="font-medium">${service.recurringPrice}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Frequency:</span>{" "}
                      <span className="font-medium">{service.frequency}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Target Pests */}
        {report.target_pests && report.target_pests.length > 0 && (
          <Card className="p-6">
            <h2 className="text-lg font-semibold mb-3">Target Pests</h2>
            <div className="flex flex-wrap gap-2">
              {report.target_pests.map((pest, idx) => (
                <span key={idx} className="bg-primary/10 text-primary px-3 py-1 rounded-full text-sm">
                  {pest}
                </span>
              ))}
            </div>
          </Card>
        )}

        {/* Findings */}
        {report.findings && (
          <Card className="p-6">
            <h2 className="text-lg font-semibold mb-3">Inspection Findings</h2>
            <p className="text-sm leading-relaxed whitespace-pre-wrap">
              {formatFindings(report.findings)}
            </p>
          </Card>
        )}

        {/* Products */}
        {report.products_used && report.products_used.length > 0 && (
          <Card className="p-6">
            <h2 className="text-lg font-semibold mb-3">Products Used</h2>
            <ul className="list-disc list-inside text-sm space-y-1">
              {report.products_used.map((product, idx) => (
                <li key={idx}>{product}</li>
              ))}
            </ul>
          </Card>
        )}

        {/* Equipment */}
        {report.equipment && report.equipment.length > 0 && (
          <Card className="p-6">
            <h2 className="text-lg font-semibold mb-3">Equipment</h2>
            <ul className="list-disc list-inside text-sm space-y-1">
              {report.equipment.map((item, idx) => (
                <li key={idx}>{item}</li>
              ))}
            </ul>
          </Card>
        )}

        {/* Property Map */}
        {report.custom_map_url && (
          <Card className="p-6">
            <h2 className="text-lg font-semibold mb-3">Property Map</h2>
            <img 
              src={report.custom_map_url} 
              alt="Property map" 
              className="w-full rounded-lg max-h-96 object-contain bg-muted"
            />
          </Card>
        )}

        {/* Property Images */}
        {report.property_images && report.property_images.length > 0 && (
          <Card className="p-6">
            <h2 className="text-lg font-semibold mb-4">Property Photos</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {report.property_images.map((img, idx) => (
                <div key={idx} className="space-y-2">
                  <img 
                    src={img.url} 
                    alt={img.caption || `Property photo ${idx + 1}`}
                    className="w-full h-48 object-cover rounded-lg"
                  />
                  {img.caption && (
                    <p className="text-sm text-muted-foreground">{img.caption}</p>
                  )}
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Signature Section */}
        <Card className="p-6">
          <h2 className="text-lg font-semibold mb-4">
            {hasSigned ? "Your Signature" : "Sign to Approve"}
          </h2>
          
          {hasSigned && report.customer_signature ? (
            <div className="space-y-4">
              <div className="border rounded-lg p-4 bg-muted/30">
                <img 
                  src={report.customer_signature} 
                  alt="Customer signature" 
                  className="max-h-24 mx-auto"
                />
              </div>
              <div className="flex items-center justify-center gap-2 text-green-700">
                <Check className="w-5 h-5" />
                <span className="font-medium">Proposal Approved</span>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Please sign below to approve this pest control proposal.
              </p>
              <div className="border rounded-lg overflow-hidden">
                <SignatureCanvas
                  ref={signatureRef}
                  onSave={() => {}}
                  label="Sign here"
                />
              </div>
              <Button 
                onClick={handleSubmitSignature}
                disabled={isSaving}
                className="w-full"
                size="lg"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4 mr-2" />
                    Submit Signature
                  </>
                )}
              </Button>
            </div>
          )}
        </Card>

        {/* Additional Notes */}
        {report.notes && (
          <Card className="p-6">
            <h2 className="text-lg font-semibold mb-3">Additional Notes</h2>
            <p className="text-sm leading-relaxed whitespace-pre-wrap">{report.notes}</p>
          </Card>
        )}

        {/* Footer */}
        <div className="text-center text-sm text-muted-foreground pt-8 pb-4">
          <p>Questions? Contact Crest Pest Control</p>
          <p className="font-medium">(949) 424-5000</p>
        </div>
      </main>
    </div>
  );
}
