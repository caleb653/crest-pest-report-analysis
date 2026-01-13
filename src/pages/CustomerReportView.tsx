import { useState, useEffect, useRef } from "react";
import { useParams } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Check, FileCheck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { SignatureCanvas, SignatureCanvasRef } from "@/components/SignatureCanvas";
import { ReadOnlyMapCanvas } from "@/components/ReadOnlyMapCanvas";
import crestLogo from "@/assets/crest-logo.png";

interface ServiceItem {
  serviceType: string;
  initialPrice: string;
  recurringPrice: string;
  frequency: string | number;
}

interface PropertyImage {
  url?: string;
  image?: string;
  caption?: string;
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

// Helper to format frequency to readable string
const formatFrequency = (freq: string | number): string => {
  if (typeof freq === 'string') return freq;
  if (freq === 0) return 'One-Time';
  if (freq === 7) return 'Weekly';
  if (freq === 30) return 'Monthly';
  if (freq === 60) return 'Bi-Monthly';
  if (freq === 90) return 'Quarterly';
  return `Every ${freq} days`;
};

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
      const { data, error: invokeError } = await supabase.functions.invoke("public-report", {
        body: { reportId },
      });

      if (invokeError) throw invokeError;

      const reportRow = (data as any)?.report;
      if (!reportRow) throw new Error("Report not found");

      // Parse data properly
      const parsedReport: ReportData = {
        id: reportRow.id,
        technician_name: reportRow.technician_name,
        customer_name: reportRow.customer_name,
        address: reportRow.address,
        service_date: reportRow.service_date,
        findings: typeof reportRow.findings === 'string' ? reportRow.findings : (reportRow.findings ? String(reportRow.findings) : null),
        notes: reportRow.notes,
        custom_map_url: reportRow.custom_map_url,
        map_data: reportRow.map_data,
        customer_signature: reportRow.customer_signature,
        sent_to_customer_at: reportRow.sent_to_customer_at,
        report_title: reportRow.report_title,
        license_number: reportRow.license_number,
        services: reportRow.services ? (Array.isArray(reportRow.services) ? (reportRow.services as unknown as ServiceItem[]) : []) : null,
        target_pests: reportRow.target_pests ? (Array.isArray(reportRow.target_pests) ? (reportRow.target_pests as unknown as string[]) : []) : null,
        products_used: reportRow.products_used ? (Array.isArray(reportRow.products_used) ? (reportRow.products_used as unknown as string[]) : []) : null,
        equipment: reportRow.equipment ? (Array.isArray(reportRow.equipment) ? (reportRow.equipment as unknown as string[]) : []) : null,
        property_images: reportRow.property_images ? (Array.isArray(reportRow.property_images) ? (reportRow.property_images as unknown as PropertyImage[]) : []) : null,
      };

      setReport(parsedReport);
      setHasSigned(!!reportRow.customer_signature);
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

  // Get map data as string for ReadOnlyMapCanvas
  const mapDataString = report.map_data 
    ? (typeof report.map_data === 'string' ? report.map_data : JSON.stringify(report.map_data))
    : null;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-brand-black py-6 px-4">
        <div className="max-w-4xl mx-auto flex items-center justify-center">
          <img src={crestLogo} alt="Crest Pest Control" className="h-12" />
        </div>
      </header>

      {/* Already Signed Banner */}
      {hasSigned && (
        <div className="bg-sage/50 border-b border-sage py-4 px-4">
          <div className="max-w-4xl mx-auto flex items-center gap-3 justify-center">
            <FileCheck className="w-5 h-5 text-dark-sage" />
            <span className="text-foreground font-medium">
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
                      <span className="font-medium">{formatFrequency(service.frequency)}</span>
                    </div>
                  </div>
                </div>
              ))}
              
              {/* Totals */}
              <div className="flex flex-wrap gap-6 pt-3 border-t text-sm">
                <div>
                  <span className="text-muted-foreground">Total Initial:</span>{" "}
                  <span className="font-bold">
                    ${Math.round(report.services.reduce((sum, s) => sum + (parseFloat(s.initialPrice) || 0), 0)).toLocaleString()}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Total Recurring:</span>{" "}
                  <span className="font-bold">
                    ${Math.round(report.services.reduce((sum, s) => sum + (parseFloat(s.recurringPrice) || 0), 0)).toLocaleString()}
                  </span>
                </div>
              </div>
            </div>
          </Card>
        )}

        {/* Target Pests */}
        {report.target_pests && report.target_pests.length > 0 && (
          <Card className="p-6">
            <h2 className="text-lg font-semibold mb-3">Target Pests</h2>
            <div className="flex flex-wrap gap-2">
              {report.target_pests.map((pest, idx) => (
                <span key={idx} className="bg-primary text-primary-foreground px-3 py-1 rounded-full text-sm font-medium">
                  {pest}
                </span>
              ))}
            </div>
          </Card>
        )}

        {/* Proposed Services / Findings */}
        {report.findings && (
          <Card className="p-6">
            <h2 className="text-lg font-semibold mb-3">Proposed Services</h2>
            <div 
              className="text-sm leading-relaxed prose prose-sm max-w-none"
              dangerouslySetInnerHTML={{ __html: report.findings }}
            />
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

        {/* Property Map with Annotations */}
        {report.custom_map_url && (
          <Card className="p-6">
            <h2 className="text-lg font-semibold mb-3">Property Map</h2>
            <div className="w-full aspect-[3/4] max-h-[600px] rounded-lg overflow-hidden border border-border bg-muted">
              <ReadOnlyMapCanvas 
                mapUrl={report.custom_map_url}
                mapData={mapDataString}
              />
            </div>
          </Card>
        )}

        {/* Property Images */}
        {report.property_images && report.property_images.length > 0 && (
          <Card className="p-6">
            <h2 className="text-lg font-semibold mb-4">Property Photos</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {report.property_images.map((img, idx) => {
                const imageUrl = img.url || img.image;
                if (!imageUrl) return null;
                return (
                  <div key={idx} className="space-y-2">
                    <img 
                      src={imageUrl} 
                      alt={img.caption || `Property photo ${idx + 1}`}
                      className="w-full h-48 object-cover rounded-lg"
                    />
                    {img.caption && (
                      <p className="text-sm text-muted-foreground">{img.caption}</p>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        {/* Additional Notes */}
        {report.notes && (
          <Card className="p-6">
            <h2 className="text-lg font-semibold mb-3">Additional Details</h2>
            <div 
              className="text-sm leading-relaxed prose prose-sm max-w-none"
              dangerouslySetInnerHTML={{ __html: report.notes }}
            />
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
              <div className="flex items-center justify-center gap-2 text-dark-sage">
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

        {/* Footer */}
        <div className="text-center text-sm text-muted-foreground pt-8 pb-4">
          <p>Questions? Contact Crest Pest Control</p>
          <p className="font-medium">(949) 424-5000</p>
        </div>
      </main>
    </div>
  );
}
