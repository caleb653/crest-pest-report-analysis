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
  findings: string | string[] | null;
  notes: string | null;
  services: ServiceItem[] | null;
  target_pests: string[] | null;
  products_used: string[] | null;
  equipment: string[] | null;
  custom_map_url: string | null;
  rendered_map_url: string | null;
  map_data: any;
  property_images: PropertyImage[] | null;
  customer_signature: string | null;
  sent_to_customer_at: string | null;
  report_title: string | null;
  license_number: string | null;
  recommendations: string[] | null;
  next_steps: string[] | null;
  customer_key_areas: string[] | null;
  customer_preferences: { preference?: string; notes?: string; propertyType?: string; companyName?: string } | null;
}

// Full product list with chemicals (legally required)
const PRODUCT_LIST = [
  { name: "Alpine WSG", chemical: "Dinotefuran" },
  { name: "Bifen I/T", chemical: "Bifenthrin" },
  { name: "Essentria IC Pro", chemical: "Geraniol, Clove Oil, Cornmint Oil" },
  { name: "Temprid FX", chemical: "Imidacloprid, Cyfluthrin" },
  { name: "Termidor SC", chemical: "Fipronil" },
  { name: "Phantom", chemical: "Chlorfenapyr" },
  { name: "ExciteR", chemical: "Pyrethrins, Piperonyl Butoxide" },
  { name: "Gentrol IGR Concentrate", chemical: "(S)-Hydroprene" },
  { name: "Nyguard IGR Concentrate", chemical: "Pyridine" },
  { name: "PT Wasp Freeze", chemical: "Prallethrin" },
  { name: "PT Alpine Flea & Bed Bug", chemical: "Dinotefuran, Pyriproxyfen, Prallethrin" },
  { name: "PT Alpine Fly Bait", chemical: "" },
  { name: "Gentrol Aerosol", chemical: "(S)-Hydroprene" },
  { name: "Bedlam", chemical: "Cyclopropanecarboxylate, Dicarboximide" },
  { name: "Invade Hot Spot +", chemical: "" },
  { name: "Niban", chemical: "Orthoboric Acid" },
  { name: "Bifen LP", chemical: "Bifenthrin" },
  { name: "Advion Ant Gel Bait", chemical: "Indoxacarb" },
  { name: "Maxforce FC Ant Gel", chemical: "Fipronil" },
  { name: "MasterLine B MaxxPro", chemical: "" },
  { name: "Advion Cockroach Gel Bait", chemical: "Indoxacarb" },
  { name: "Contrac California", chemical: "Bromethalin" },
  { name: "Delta Dust (Bayer)", chemical: "Deltamethrin" },
  { name: "In2Care Mix", chemical: "Pyriproxyfen, Beauveria bassiana Strain GHA" },
  { name: "OneGuard", chemical: "Lambda-cyhalothrin, Prallethrin, Pyriproxyfen, Piperonyl butoxide" },
  { name: "Advion Microflow", chemical: "Indoxacarb" },
  { name: "Optigard", chemical: "Thiamethoxam" },
];

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

      const parsedReport: ReportData = {
        id: reportRow.id,
        technician_name: reportRow.technician_name,
        customer_name: reportRow.customer_name,
        address: reportRow.address,
        service_date: reportRow.service_date,
        findings: reportRow.findings || null,
        notes: reportRow.notes,
        custom_map_url: reportRow.custom_map_url,
        rendered_map_url: reportRow.rendered_map_url,
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
        recommendations: reportRow.recommendations ? (Array.isArray(reportRow.recommendations) ? (reportRow.recommendations as unknown as string[]) : []) : null,
        next_steps: reportRow.next_steps ? (Array.isArray(reportRow.next_steps) ? (reportRow.next_steps as unknown as string[]) : []) : null,
        customer_key_areas: (reportRow as any).customer_key_areas ? (Array.isArray((reportRow as any).customer_key_areas) ? ((reportRow as any).customer_key_areas as string[]) : []) : null,
        customer_preferences: (reportRow as any).customer_preferences ? ((reportRow as any).customer_preferences as any) : null,
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
    if (!reportId || !signatureData) {
      console.error("Missing reportId or signatureData", { reportId, hasSignature: !!signatureData });
      return;
    }

    console.log("Saving signature for report:", reportId, "signature length:", signatureData.length);

    setIsSaving(true);
    try {
      // Use edge function to save signature and notify office
      const { data, error: invokeError } = await supabase.functions.invoke("save-customer-signature", {
        body: { 
          reportId, 
          signatureData,
          notifyOffice: true 
        },
      });

      if (invokeError) {
        console.error("Edge function error:", invokeError);
        throw invokeError;
      }

      if (!data?.ok) {
        console.error("Save failed:", data?.error);
        throw new Error(data?.error || "Failed to save signature");
      }

      console.log("Signature saved successfully via edge function");

      // Update local report state so the signed banner and signature display immediately
      setReport(prev => prev ? { ...prev, customer_signature: signatureData } : prev);
      setHasSigned(true);
      toast.success("Signature saved! Thank you for approving the proposal.");
    } catch (err: any) {
      console.error("Error saving signature:", err);
      toast.error("Failed to save signature. Please try again.");
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

  // Determine if this is an Initial Pest Report
  const isInitialReport = report.report_title === "Initial Pest Report";

  // Extract property type and company name from either source
  let displayPropertyType = report.customer_preferences?.propertyType || "";
  let displayCompanyName = report.customer_preferences?.companyName || "";
  // For Sales Reports, these are in the structured notes
  if (!displayPropertyType && report.notes) {
    try {
      const parsed = JSON.parse(report.notes);
      if (parsed?._structuredNotes) {
        displayPropertyType = parsed.propertyType || "";
        displayCompanyName = parsed.companyName || "";
      }
    } catch { /* not JSON */ }
  }

  // Format findings for display
  const findingsHtml = Array.isArray(report.findings)
    ? report.findings.join('<br/>')
    : (report.findings || '');

  // Build products display string with chemicals
  const productsDisplay = PRODUCT_LIST.map(p => 
    p.chemical ? `${p.name} (${p.chemical})` : p.name
  ).join(', ');

  return (
    <div className="min-h-screen bg-background">
      {/* Already Signed Banner - only for sales reports */}
      {!isInitialReport && report.customer_signature && (
        <div className="bg-sage/50 border-b border-sage py-3 px-4">
          <div className="max-w-5xl mx-auto flex items-center gap-3 justify-center">
            <FileCheck className="w-5 h-5 text-dark-sage" />
            <span className="text-foreground font-medium">
              This proposal has been signed and approved. Thank you!
            </span>
          </div>
        </div>
      )}

      {/* Page 1: Main Proposal */}
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <header className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-3">
            <img src={crestLogo} alt="Crest Pest Control" className="h-10" />
            <h1 className="text-lg font-bold">{report.report_title || "Pest Control Proposal"}</h1>
          </div>
          <div className="text-right text-xs text-muted-foreground">
            {displayPropertyType && displayPropertyType !== "Residential" && (
              <span className="font-semibold text-foreground mr-3">{displayPropertyType}</span>
            )}
            <span className="font-bold text-foreground">PEST CONTROL</span>
          </div>
        </header>

        <main className="p-4 space-y-4">
          {/* Customer & Technician Details - Side by Side */}
          <div className="grid grid-cols-2 gap-4">
            <Card className="p-4">
              <h2 className="text-xs font-bold uppercase text-muted-foreground mb-2">Customer Details</h2>
              <div className="space-y-1 text-sm">
                <p><span className="text-muted-foreground">Name:</span> <span className="font-medium">{report.customer_name || "—"}</span></p>
                {displayCompanyName && (
                  <p><span className="text-muted-foreground">Company:</span> <span className="font-medium">{displayCompanyName}</span></p>
                )}
                <p><span className="text-muted-foreground">Address:</span> <span className="font-medium">{report.address || "—"}</span></p>
                <p><span className="text-muted-foreground">Date:</span> <span className="font-medium">{report.service_date || "—"}</span></p>
              </div>
            </Card>
            <Card className="p-4">
              <h2 className="text-xs font-bold uppercase text-muted-foreground mb-2">Technician Information</h2>
              <div className="space-y-1 text-sm">
                <p><span className="text-muted-foreground">Name:</span> <span className="font-medium">{report.technician_name}</span></p>
                <p><span className="text-muted-foreground">License:</span> <span className="font-medium">{report.license_number || "—"}</span></p>
              </div>
            </Card>
          </div>

          {/* === INITIAL PEST REPORT LAYOUT === */}
          {isInitialReport ? (
            <>
              {/* Target Pests */}
              {report.target_pests && report.target_pests.length > 0 && (
                <Card className="overflow-hidden">
                  <div className="bg-brand-black text-white px-4 py-2">
                    <span className="text-xs font-bold uppercase">Target Pest(s)</span>
                  </div>
                  <div className="p-3">
                    <div className="flex flex-wrap gap-1.5">
                      {report.target_pests.map((pest, idx) => (
                        <span key={idx} className="bg-primary text-primary-foreground px-2.5 py-1 rounded-full text-xs font-medium">
                          {pest}
                        </span>
                      ))}
                    </div>
                  </div>
                </Card>
              )}

              {/* Customer Key Areas */}
              {report.customer_key_areas && report.customer_key_areas.length > 0 && (
                <Card className="overflow-hidden">
                  <div className="bg-brand-black text-white px-4 py-2">
                    <span className="text-xs font-bold uppercase">Customer Key Areas</span>
                  </div>
                  <div className="p-3">
                    <div className="flex flex-wrap gap-1.5">
                      {report.customer_key_areas.map((area, idx) => (
                        <span key={idx} className="bg-primary text-primary-foreground px-2.5 py-1 rounded-full text-xs font-medium">
                          {area === "Children" && "👶 "}{area === "Pets" && "🐾 "}{area === "Elderly" && "👴 "}{area === "Garden" && "🌿 "}{area}
                        </span>
                      ))}
                    </div>
                  </div>
                </Card>
              )}

              {/* Customer Preferences */}
              {report.customer_preferences && (report.customer_preferences.preference || report.customer_preferences.notes) && (
                <Card className="overflow-hidden">
                  <div className="bg-brand-black text-white px-4 py-2">
                    <span className="text-xs font-bold uppercase">Customer Preferences</span>
                  </div>
                  <div className="p-3 space-y-1">
                    {report.customer_preferences.preference && (
                      <p className="text-sm font-medium">🌱 {report.customer_preferences.preference}</p>
                    )}
                    {report.customer_preferences.notes && (
                      <p className="text-sm text-muted-foreground">{report.customer_preferences.notes}</p>
                    )}
                  </div>
                </Card>
              )}

              {/* Findings & Actions Taken */}
              {findingsHtml && (
                <Card className="overflow-hidden">
                  <div className="bg-brand-black text-white px-4 py-2">
                    <span className="text-xs font-bold uppercase">Findings & Actions Taken</span>
                  </div>
                  <div className="p-4">
                    <div 
                      className="text-sm leading-relaxed prose prose-sm max-w-none"
                      dangerouslySetInnerHTML={{ __html: findingsHtml }}
                    />
                  </div>
                </Card>
              )}

              {/* What to Expect */}
              {report.next_steps && report.next_steps.length > 0 && report.next_steps[0] && (
                <Card className="overflow-hidden">
                  <div className="bg-brand-black text-white px-4 py-2">
                    <span className="text-xs font-bold uppercase">What to Expect</span>
                  </div>
                  <div className="p-4">
                    <div 
                      className="text-sm leading-relaxed prose prose-sm max-w-none"
                      dangerouslySetInnerHTML={{ __html: report.next_steps.join('<br/>') }}
                    />
                  </div>
                </Card>
              )}

              {/* Recommendations */}
              {report.recommendations && report.recommendations.length > 0 && report.recommendations[0] && (
                <Card className="overflow-hidden">
                  <div className="bg-brand-black text-white px-4 py-2">
                    <span className="text-xs font-bold uppercase text-dark-sage">Recommendations</span>
                  </div>
                  <div className="p-4">
                    <div 
                      className="text-sm leading-relaxed prose prose-sm max-w-none text-dark-sage"
                      dangerouslySetInnerHTML={{ __html: report.recommendations.join('<br/>') }}
                    />
                  </div>
                </Card>
              )}

              {/* Products + Pesticide Notice Row */}
              <div className="grid grid-cols-[2fr_3fr] gap-4">
                <Card className="overflow-hidden">
                  <div className="bg-brand-black text-white px-4 py-2">
                    <span className="text-xs font-bold uppercase">Products</span>
                  </div>
                  <div className="p-3">
                    <p className="text-[10px] leading-relaxed text-foreground">
                      {productsDisplay}
                    </p>
                  </div>
                </Card>

                <Card className="overflow-hidden">
                  <div className="bg-brand-black text-white px-4 py-2">
                    <span className="text-xs font-bold uppercase">Pesticide Notice</span>
                  </div>
                  <div className="p-3">
                    <p className="text-[9px] leading-[1.3] text-foreground">
                      State law requires that you be given the following information: CAUTION--PESTICIDES ARE TOXIC CHEMICALS. Structural Pest Control Companies are registered and regulated by the Structural Pest Control Board, and apply pesticides which are registered and approved for use by the California Department of Pesticide Regulation and the United States Environmental Protection Agency. Registration is granted when the state finds that, based on existing scientific evidence, there are no appreciable risks if proper use conditions are followed or that the risks are outweighed by the benefits. The degree of risk depends upon the degree of exposure, so exposure should be minimized." "If within 24 hours following application you experience symptoms similar to common seasonal illness comparable to the flu, contact your physician or poison control center (800-222-1222) and your pest control company immediately." This statement shall be modified to include any other symptoms of overexposure which are not typical of influenza.
                    </p>
                    <p className="text-[9px] leading-[1.3] text-foreground font-medium mt-1">
                      For further information, contact any of the following: Your Pest Control Company (949-424-5000); for Health Questions--the County Health Department (800-564-8448); for Application Information--the County Agricultural Commissioner (714-955-0100) and for Regulatory Information--the Structural Pest Control Board (800-737-8188, 2005 Evergreen Street, Ste. 1500, Sacramento, CA 95815).
                    </p>
                  </div>
                </Card>
              </div>
            </>
          ) : (
            <>
              {/* === SALES REPORT LAYOUT (existing) === */}
              {/* Services Table */}
              {report.services && report.services.length > 0 && (
                <Card className="overflow-hidden">
                  <div className="bg-brand-black text-white px-4 py-2">
                    <span className="text-xs font-bold uppercase">Services</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="text-left px-4 py-2 font-medium">Service Type</th>
                          <th className="text-center px-4 py-2 font-medium">Initial</th>
                          <th className="text-center px-4 py-2 font-medium">Recurring</th>
                          <th className="text-center px-4 py-2 font-medium">Frequency</th>
                        </tr>
                      </thead>
                      <tbody>
                        {report.services.map((service, idx) => (
                          <tr key={idx} className="border-t border-border">
                            <td className="px-4 py-2 font-medium">{service.serviceType}</td>
                            <td className="px-4 py-2 text-center">${service.initialPrice}</td>
                            <td className="px-4 py-2 text-center">${service.recurringPrice}</td>
                            <td className="px-4 py-2 text-center">{formatFrequency(service.frequency)}</td>
                          </tr>
                        ))}
                        <tr className="border-t-2 border-border bg-muted/30">
                          <td className="px-4 py-2 font-bold text-right">Total:</td>
                          <td className="px-4 py-2 text-center font-bold">
                            ${Math.round(report.services.reduce((sum, s) => sum + (parseFloat(s.initialPrice) || 0), 0)).toLocaleString()}
                          </td>
                          <td className="px-4 py-2 text-center font-bold">
                            ${Math.round(report.services.reduce((sum, s) => sum + (parseFloat(s.recurringPrice) || 0), 0)).toLocaleString()}
                          </td>
                          <td></td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </Card>
              )}

              {/* Target Pests + Proposed Services Row */}
              <div className="grid grid-cols-[2fr_3fr] gap-4">
                <div className="space-y-4">
                  {report.target_pests && report.target_pests.length > 0 && (
                    <Card className="overflow-hidden">
                      <div className="bg-brand-black text-white px-4 py-2">
                        <span className="text-xs font-bold uppercase">Target Pest(s)</span>
                      </div>
                      <div className="p-3">
                        <div className="flex flex-wrap gap-1.5">
                          {report.target_pests.map((pest, idx) => (
                            <span key={idx} className="bg-primary text-primary-foreground px-2.5 py-1 rounded-full text-xs font-medium">
                              {pest}
                            </span>
                          ))}
                        </div>
                      </div>
                    </Card>
                  )}
                  <Card className="overflow-hidden">
                    <div className="bg-brand-black text-white px-4 py-2">
                      <span className="text-xs font-bold uppercase">Products</span>
                    </div>
                    <div className="p-3">
                      <p className="text-[10px] leading-relaxed text-foreground">
                        {productsDisplay}
                      </p>
                    </div>
                  </Card>
                </div>

                {findingsHtml && (
                  <Card className="overflow-hidden">
                    <div className="bg-brand-black text-white px-4 py-2">
                      <span className="text-xs font-bold uppercase">Proposed Services</span>
                    </div>
                    <div className="p-4">
                      <div 
                        className="text-sm leading-relaxed prose prose-sm max-w-none"
                        dangerouslySetInnerHTML={{ __html: findingsHtml }}
                      />
                    </div>
                  </Card>
                )}
              </div>

              {/* Signature + Pesticide Notice Row */}
              <div className="grid grid-cols-[2fr_3fr] gap-4">
                <Card className="overflow-hidden">
                  <div className="bg-brand-black text-white px-4 py-2">
                    <span className="text-xs font-bold uppercase">Customer Signature</span>
                  </div>
                  <div className="p-4">
                    {report.customer_signature ? (
                      <div className="space-y-3">
                        <div className="border rounded p-3 bg-muted/30">
                          <img 
                            src={report.customer_signature} 
                            alt="Customer signature" 
                            className="max-h-16 mx-auto"
                          />
                        </div>
                        <div className="flex items-center justify-center gap-2 text-dark-sage text-sm">
                          <Check className="w-4 h-4" />
                          <span className="font-medium">Proposal Approved</span>
                        </div>
                        <div className="flex justify-between text-xs text-muted-foreground border-t pt-2">
                          <span><span className="font-medium text-foreground">Print:</span> {report.customer_name}</span>
                          <span><span className="font-medium text-foreground">Date:</span> {new Date().toLocaleDateString()}</span>
                        </div>
                        <p className="text-xs text-muted-foreground text-center mt-2">
                          This proposal has already been signed.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <p className="text-xs text-muted-foreground">
                          Please sign below to approve this proposal.
                        </p>
                        <div className="border rounded overflow-hidden">
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
                          size="sm"
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
                  </div>
                </Card>

                <Card className="overflow-hidden">
                  <div className="bg-brand-black text-white px-4 py-2">
                    <span className="text-xs font-bold uppercase">Pesticide Notice</span>
                  </div>
                  <div className="p-3">
                    <p className="text-[9px] leading-[1.3] text-foreground">
                      State law requires that you be given the following information: CAUTION--PESTICIDES ARE TOXIC CHEMICALS. Structural Pest Control Companies are registered and regulated by the Structural Pest Control Board, and apply pesticides which are registered and approved for use by the California Department of Pesticide Regulation and the United States Environmental Protection Agency. Registration is granted when the state finds that, based on existing scientific evidence, there are no appreciable risks if proper use conditions are followed or that the risks are outweighed by the benefits. The degree of risk depends upon the degree of exposure, so exposure should be minimized." "If within 24 hours following application you experience symptoms similar to common seasonal illness comparable to the flu, contact your physician or poison control center (800-222-1222) and your pest control company immediately." This statement shall be modified to include any other symptoms of overexposure which are not typical of influenza.
                    </p>
                    <p className="text-[9px] leading-[1.3] text-foreground font-medium mt-1">
                      For further information, contact any of the following: Your Pest Control Company (949-424-5000); for Health Questions--the County Health Department (800-564-8448); for Application Information--the County Agricultural Commissioner (714-955-0100) and for Regulatory Information--the Structural Pest Control Board (800-737-8188, 2005 Evergreen Street, Ste. 1500, Sacramento, CA 95815).
                    </p>
                  </div>
                </Card>
              </div>
            </>
          )}
        </main>
      </div>

      {/* Page 2: Map & Additional Details */}
      {(report.custom_map_url || report.rendered_map_url || report.notes) && (() => {
        // Parse structured notes
        let additionalDetailsHtml = report.notes || "";
        let propertyTypeDisplay = "";
        let preferredDay = "";
        let preferredTime = "";
        let pointOfContact = "";
        let contactPhoneNum = "";
        let materials: Array<{ name: string; quantity: string }> = [];
        let limitationsTextVal = "";

        if (report.notes) {
          try {
            const parsed = JSON.parse(report.notes);
            if (parsed?._structuredNotes) {
              additionalDetailsHtml = parsed.additionalDetails || "";
              propertyTypeDisplay = parsed.propertyType || "";
              preferredDay = parsed.preferredServiceDay || "";
              preferredTime = parsed.preferredServiceTime || "";
              pointOfContact = parsed.mainPointOfContact || "";
              contactPhoneNum = parsed.contactPhone || "";
              materials = parsed.setupMaterials || [];
              limitationsTextVal = parsed.limitationsText || "";
            }
          } catch {
            // Not JSON, use as plain HTML
          }
        }

        const hasSchedulingData = preferredDay || preferredTime || pointOfContact || contactPhoneNum;
        const hasMaterials = materials.length > 0;

        return (
        <div className="max-w-5xl mx-auto border-t-4 border-border mt-8">
          {/* Header */}
          <header className="flex items-center justify-between p-4 border-b border-border">
            <div className="flex items-center gap-3">
              <img src={crestLogo} alt="Crest Pest Control" className="h-10" />
              <h1 className="text-lg font-bold">Property Map & Details</h1>
            </div>
            <div className="text-right text-xs text-muted-foreground">
              {propertyTypeDisplay && (
                <span className="font-semibold text-foreground mr-3">{propertyTypeDisplay}</span>
              )}
              <span className="font-bold text-foreground">PEST CONTROL</span>
            </div>
          </header>

          <main className="p-4 space-y-4">
            {(report.rendered_map_url || report.custom_map_url) ? (
            <div className="grid grid-cols-[2fr_3fr] gap-4">
              {/* Map Section */}
              <div className="aspect-[3/4] rounded-lg overflow-hidden border border-border bg-muted">
                {report.rendered_map_url ? (
                  <img 
                    src={report.rendered_map_url} 
                    alt="Property map with annotations" 
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <ReadOnlyMapCanvas 
                    mapUrl={report.custom_map_url!}
                    mapData={mapDataString}
                  />
                )}
              </div>

              {/* Right column: Additional Details + Scheduling + Materials */}
              <div className="space-y-4">
                {/* Additional Details */}
                {additionalDetailsHtml && (
                  <Card className="overflow-hidden">
                    <div className="bg-brand-black text-white px-4 py-2">
                      <span className="text-xs font-bold uppercase">Additional Details</span>
                    </div>
                    <div className="p-4">
                      <div 
                        className="text-xs leading-relaxed prose prose-sm max-w-none"
                        dangerouslySetInnerHTML={{ __html: additionalDetailsHtml }}
                      />
                    </div>
                  </Card>
                )}

                {/* Scheduling & Communication */}
                {hasSchedulingData && (
                  <Card className="overflow-hidden">
                    <div className="bg-brand-black text-white px-4 py-2">
                      <span className="text-xs font-bold uppercase">Scheduling & Communication</span>
                    </div>
                    <div className="p-4">
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        {preferredDay && (
                          <div>
                            <p className="text-muted-foreground text-xs">Preferred Service Day</p>
                            <p className="font-medium">{preferredDay}</p>
                          </div>
                        )}
                        {preferredTime && (
                          <div>
                            <p className="text-muted-foreground text-xs">Preferred Service Time</p>
                            <p className="font-medium">{preferredTime}</p>
                          </div>
                        )}
                        {pointOfContact && (
                          <div>
                            <p className="text-muted-foreground text-xs">Main Point of Contact</p>
                            <p className="font-medium">{pointOfContact}</p>
                          </div>
                        )}
                        {contactPhoneNum && (
                          <div>
                            <p className="text-muted-foreground text-xs">Phone #</p>
                            <p className="font-medium">{contactPhoneNum}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </Card>
                )}

                {/* Setup Materials */}
                {hasMaterials && (
                  <Card className="overflow-hidden">
                    <div className="bg-brand-black text-white px-4 py-2">
                      <span className="text-xs font-bold uppercase">Setup Materials</span>
                    </div>
                    <div className="p-4">
                      <div className="space-y-1.5">
                        {materials.map((mat, idx) => (
                          <div key={idx} className="flex justify-between text-sm">
                            <span className="font-medium">{mat.name}</span>
                            <span className="text-muted-foreground">×{mat.quantity}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </Card>
                )}
              </div>
            </div>
            ) : (
            /* No map - show details/scheduling/materials in full width */
            <div className="space-y-4">
              {additionalDetailsHtml && (
                <Card className="overflow-hidden">
                  <div className="bg-brand-black text-white px-4 py-2">
                    <span className="text-xs font-bold uppercase">Additional Details</span>
                  </div>
                  <div className="p-4">
                    <div 
                      className="text-xs leading-relaxed prose prose-sm max-w-none"
                      dangerouslySetInnerHTML={{ __html: additionalDetailsHtml }}
                    />
                  </div>
                </Card>
              )}

              {(hasSchedulingData || hasMaterials) && (
                <div className="grid grid-cols-2 gap-4">
                  {hasSchedulingData && (
                    <Card className="overflow-hidden">
                      <div className="bg-brand-black text-white px-4 py-2">
                        <span className="text-xs font-bold uppercase">Scheduling & Communication</span>
                      </div>
                      <div className="p-4">
                        <div className="grid grid-cols-2 gap-3 text-sm">
                          {preferredDay && (
                            <div>
                              <p className="text-muted-foreground text-xs">Preferred Service Day</p>
                              <p className="font-medium">{preferredDay}</p>
                            </div>
                          )}
                          {preferredTime && (
                            <div>
                              <p className="text-muted-foreground text-xs">Preferred Service Time</p>
                              <p className="font-medium">{preferredTime}</p>
                            </div>
                          )}
                          {pointOfContact && (
                            <div>
                              <p className="text-muted-foreground text-xs">Main Point of Contact</p>
                              <p className="font-medium">{pointOfContact}</p>
                            </div>
                          )}
                          {contactPhoneNum && (
                            <div>
                              <p className="text-muted-foreground text-xs">Phone #</p>
                              <p className="font-medium">{contactPhoneNum}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    </Card>
                  )}

                  {hasMaterials && (
                    <Card className="overflow-hidden">
                      <div className="bg-brand-black text-white px-4 py-2">
                        <span className="text-xs font-bold uppercase">Setup Materials</span>
                      </div>
                      <div className="p-4">
                        <div className="space-y-1.5">
                          {materials.map((mat, idx) => (
                            <div key={idx} className="flex justify-between text-sm">
                              <span className="font-medium">{mat.name}</span>
                              <span className="text-muted-foreground">×{mat.quantity}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </Card>
                  )}
                </div>
              )}
            </div>
            )}
          </main>
        </div>
        );
      })()}

      {/* Page 3: Property Images */}
      {report.property_images && report.property_images.length > 0 && (
        <div className="max-w-5xl mx-auto border-t-4 border-border mt-8">
          {/* Header */}
          <header className="flex items-center justify-between p-4 border-b border-border">
            <div className="flex items-center gap-3">
              <img src={crestLogo} alt="Crest Pest Control" className="h-10" />
              <h1 className="text-lg font-bold">Property Images</h1>
            </div>
            <div className="text-right text-xs text-muted-foreground">
              <span className="font-bold text-foreground">PEST CONTROL</span>
            </div>
          </header>

          <main className="p-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {report.property_images.map((img, idx) => {
                const imageUrl = img.url || img.image;
                if (!imageUrl) return null;
                return (
                  <div key={idx} className="space-y-2">
                    <img 
                      src={imageUrl} 
                      alt={img.caption || `Property photo ${idx + 1}`}
                      className="w-full h-48 object-cover rounded-lg border border-border"
                    />
                    {img.caption && (
                      <p className="text-xs text-muted-foreground">{img.caption}</p>
                    )}
                  </div>
                );
              })}
            </div>
          </main>
        </div>
      )}

      {/* Crest Guarantee */}
      <div className="max-w-5xl mx-auto mt-8 px-4">
        <div className="border-2 border-border rounded-lg p-5 text-center bg-muted/30">
          <h3 className="text-sm font-bold text-foreground mb-2">The Crest Guarantee</h3>
          <p className="text-xs text-foreground leading-relaxed max-w-2xl mx-auto">
            If pests return, we will return at no charge. We don't lock you into a long-term contract. We want our service quality to keep you as a customer, not a contract.
          </p>
        </div>
      </div>

      {/* Footer */}
      <div className="max-w-5xl mx-auto text-center text-sm text-muted-foreground py-8 border-t border-border mt-8">
        <p>Questions? Contact Crest Pest Control</p>
        <p className="font-medium">(949) 424-5000</p>
      </div>
    </div>
  );
}
