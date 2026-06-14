import { useState, useEffect, useRef } from "react";
import { useParams } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Check, FileCheck, Play } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { SignatureCanvas, SignatureCanvasRef } from "@/components/SignatureCanvas";
import { ReadOnlyMapCanvas } from "@/components/ReadOnlyMapCanvas";
import crestLogo from "@/assets/crest-logo.png";
import crestLogoVideo from "@/assets/crest-logo-video.png";
import { buildSignedReportPDF } from "@/lib/pdfExport";
import {
  RODENT_GUARANTEE_HTML,
  hasRodentGuaranteeService,
  stripRodentGuaranteeFromHtml,
  resolveInitialGuaranteeBoxes,
  GuaranteeBox,
  SALES_REPORT_DISCLAIMER_HTML,
} from "@/lib/rodentGuarantee";
import { GuaranteeBoxesReadOnly } from "@/components/GuaranteeBoxesEditor";

interface ServiceItem {
  serviceType: string;
  initialPrice: string;
  recurringPrice: string;
  frequency: string | number;
}

interface Proposal {
  name: string;
  services: ServiceItem[];
}

interface PropertyImage {
  url?: string;
  image?: string;
  caption?: string;
}

const defaultRodentPairLabel = (index: number) => `Entry Point #${index + 1}`;

const normalizeRodentPairLabels = (labels: unknown, count = 0): string[] => {
  const source = Array.isArray(labels) ? labels : [];
  const length = Math.max(count, source.length);
  return Array.from({ length }, (_, index) => {
    const raw = typeof source[index] === "string" ? source[index].trim() : "";
    return !raw || /^Pair\s*#?\s*\d+$/i.test(raw) ? defaultRodentPairLabel(index) : raw;
  });
};

/**
 * Split a services HTML blob into the main "what we do" content and the
 * disclaimer/warranty/additional-details content. Returns both as HTML strings.
 * Used so the customer-facing proposal view can present disclaimers in their
 * own box near the bottom of the page rather than inline with each service.
 */
const splitProposalDisclaimers = (html: string): { mainHtml: string; disclaimerHtml: string } => {
  if (!html) return { mainHtml: "", disclaimerHtml: "" };
  // Split on two or more <br> tags (the chunk separator used when assembling
  // the proposal HTML in Report.tsx / MultiProposalReport.tsx).
  const chunks = html.split(/(?:<br\s*\/?>\s*){2,}/i).map((c) => c.trim()).filter(Boolean);
  const disclaimerHeader = /^<b>\s*(additional details|disclaimer|[^<]*guarantee|[^<]*warranty|not included[^<]*)\s*:?\s*<\/b>/i;
  const serviceHeader = /^<b>\s*([^<:]+?)\s*:\s*<\/b>/i;

  let currentService = "";
  const mainChunks: string[] = [];
  const disclaimerGroups: Record<string, string[]> = {};
  const serviceOrder: string[] = [];

  chunks.forEach((chunk) => {
    if (disclaimerHeader.test(chunk)) {
      const key = currentService || "General";
      if (!disclaimerGroups[key]) {
        disclaimerGroups[key] = [];
        serviceOrder.push(key);
      }
      disclaimerGroups[key].push(chunk);
    } else {
      const m = chunk.match(serviceHeader);
      if (m) currentService = m[1].trim();
      mainChunks.push(chunk);
    }
  });

  const mainHtml = mainChunks.join("<br><br>");
  const disclaimerHtml = serviceOrder
    .map((svc) => {
      const body = disclaimerGroups[svc].join("<br><br>");
      return `<div class="mb-3"><div class="text-[11px] font-bold uppercase tracking-wide text-foreground mb-1">${svc}</div><div>${body}</div></div>`;
    })
    .join("");

  return { mainHtml, disclaimerHtml };
};

const getRecurringLabel = (services: ServiceItem[]) => {
  const recurringServices = services.filter(s => {
    const freq = typeof s.frequency === 'string' ? parseInt(s.frequency, 10) : s.frequency;
    return freq > 0 && s.serviceType;
  });

  if (recurringServices.length === 0) {
    return "Recurring";
  }

  if (recurringServices.every(s => {
    const freq = typeof s.frequency === 'string' ? parseInt(s.frequency, 10) : s.frequency;
    return freq === 7 || freq === 14;
  })) {
    return "Every 4 Weeks";
  }

  if (recurringServices.every(s => {
    const freq = typeof s.frequency === 'string' ? parseInt(s.frequency, 10) : s.frequency;
    return freq === 30;
  })) {
    return "Monthly";
  }
  return "Recurring";
};

interface SetupMaterial {
  name: string;
  quantity: string;
}


interface StructuredNotes {
  _structuredNotes?: boolean;
  _reportFormat?: string;
  additionalDetails?: string;
  propertyType?: string;
  companyName?: string;
  preferredServiceDay?: string;
  preferredServiceTime?: string;
  mainPointOfContact?: string;
  contactPhone?: string;
  setupMaterials?: SetupMaterial[];
  limitationsText?: string;
  recommendedProposal?: number;
  videoUrl?: string | null;
  videoUrl2?: string | null;
  portalVideoAttached?: boolean;
  duplicatedPages?: number[];
  duplicateMapData?: Record<string, string | null>;
  duplicateRenderedMapImages?: Record<string, string | null>;
  proposalFindings?: Record<string, string>;
  guaranteeBoxes?: GuaranteeBox[];
  proposalGuaranteeBoxes?: Record<string, GuaranteeBox[]>;
}

interface ReportData {
  id: string;
  technician_name: string;
  customer_name: string | null;
  address: string | null;
  customer_email: string | null;
  service_date: string | null;
  findings: string | string[] | null;
  notes: string | null;
  services: ServiceItem[] | Proposal[] | null;
  target_pests: string[] | null;
  products_used: string[] | null;
  equipment: string[] | null;
  custom_map_url: string | null;
  rendered_map_url: string | null;
  map_data: unknown;
  property_images: PropertyImage[] | null;
  customer_signature: string | null;
  sent_to_customer_at: string | null;
  report_title: string | null;
  license_number: string | null;
  recommendations: string[] | null;
  next_steps: string[] | null;
  customer_key_areas: string[] | null;
  customer_preferences: {
    preference?: string;
    notes?: string;
    propertyType?: string;
    companyName?: string;
  } | null;
}

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

const formatFrequency = (freq: string | number): string => {
  if (typeof freq === "string") return freq;
  if (freq === 0) return "One-Time";
  if (freq === 7) return "Weekly";
  if (freq === 14) return "Bi-Weekly";
  if (freq === 28) return "Every 4 Weeks";
  if (freq === 30) return "Monthly";
  if (freq === 60) return "Bi-Monthly";
  if (freq === 90) return "Quarterly";
  return `Every ${freq} days`;
};

const getMapDataString = (mapData: unknown): string | null => {
  if (!mapData) return null;
  return typeof mapData === "string" ? mapData : JSON.stringify(mapData);
};

const getRecordValue = (
  record: Record<string, string | null> | undefined,
  index: number,
): string | null => {
  if (!record) return null;
  return record[String(index)] ?? null;
};

export default function CustomerReportView() {
  const { reportId } = useParams<{ reportId: string }>();
  const [report, setReport] = useState<ReportData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [savingProposalIndex, setSavingProposalIndex] = useState<number | null>(null);
  const [playingVideos, setPlayingVideos] = useState<Record<string, boolean>>({});
  const signatureRef = useRef<SignatureCanvasRef>(null);
  const proposalSignatureRefs = useRef<Record<number, SignatureCanvasRef | null>>({});
  const reportRootRef = useRef<HTMLDivElement>(null);
  const videoRefs = useRef<Record<string, HTMLVideoElement | null>>({});

  // Parse per-proposal signatures from the stored customer_signature field
  const getPerProposalSignatures = (): Record<string, string> => {
    if (!report?.customer_signature) return {};
    try {
      const parsed = JSON.parse(report.customer_signature);
      if (parsed && parsed._perProposal) {
        return parsed.signatures || {};
      }
    } catch {
      // Legacy single signature — not per-proposal
    }
    return {};
  };

  const isLegacySingleSignature = (): boolean => {
    if (!report?.customer_signature) return false;
    try {
      JSON.parse(report.customer_signature);
      return false;
    } catch {
      return true; // It's a raw data: URI
    }
  };

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

      const reportRow = (data as { report?: ReportData } | null)?.report;
      if (!reportRow) throw new Error("Report not found");

      const parsedReport: ReportData = {
        id: reportRow.id,
        technician_name: reportRow.technician_name,
        customer_name: reportRow.customer_name,
        address: reportRow.address,
        customer_email: (reportRow as any).customer_email ?? null,
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
        services: reportRow.services
          ? Array.isArray(reportRow.services)
            ? (reportRow.services as ServiceItem[] | Proposal[])
            : []
          : null,
        target_pests: reportRow.target_pests
          ? Array.isArray(reportRow.target_pests)
            ? (reportRow.target_pests as string[])
            : []
          : null,
        products_used: reportRow.products_used
          ? Array.isArray(reportRow.products_used)
            ? (reportRow.products_used as string[])
            : []
          : null,
        equipment: reportRow.equipment
          ? Array.isArray(reportRow.equipment)
            ? (reportRow.equipment as string[])
            : []
          : null,
        property_images: reportRow.property_images
          ? Array.isArray(reportRow.property_images)
            ? (reportRow.property_images as PropertyImage[])
            : []
          : null,
        recommendations: reportRow.recommendations
          ? Array.isArray(reportRow.recommendations)
            ? (reportRow.recommendations as string[])
            : []
          : null,
        next_steps: reportRow.next_steps
          ? Array.isArray(reportRow.next_steps)
            ? (reportRow.next_steps as string[])
            : []
          : null,
        customer_key_areas: reportRow.customer_key_areas
          ? Array.isArray(reportRow.customer_key_areas)
            ? (reportRow.customer_key_areas as string[])
            : []
          : null,
        customer_preferences: reportRow.customer_preferences || null,
      };

      setReport(parsedReport);
    } catch (err: unknown) {
      console.error("Error loading report:", err);
      setError(err instanceof Error ? err.message : "Failed to load report");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignatureSave = async (signatureData: string, proposalIndex?: number) => {
    if (!reportId || !signatureData) return;

    setIsSaving(true);
    if (proposalIndex !== undefined) setSavingProposalIndex(proposalIndex);
    try {
      const { data, error: invokeError } = await supabase.functions.invoke("save-customer-signature", {
        body: {
          reportId,
          signatureData,
          notifyOffice: true,
          appBaseUrl: typeof window !== "undefined" ? window.location.origin : undefined,
          ...(proposalIndex !== undefined ? { proposalIndex } : {}),
        },
      });

      if (invokeError) throw invokeError;
      if (!(data as { ok?: boolean; error?: string } | null)?.ok) {
        throw new Error((data as { error?: string } | null)?.error || "Failed to save signature");
      }

      if (proposalIndex !== undefined) {
        // Update local state with per-proposal signature
        setReport((prev) => {
          if (!prev) return prev;
          const existingSignatures = getPerProposalSignaturesFromValue(prev.customer_signature);
          existingSignatures[String(proposalIndex)] = signatureData;
          return { ...prev, customer_signature: JSON.stringify({ _perProposal: true, signatures: existingSignatures }) };
        });
        const optionLabel = `Option ${String.fromCharCode(65 + proposalIndex)}`;
        toast.success(`Signature saved for ${optionLabel}! Thank you.`);
      } else {
        setReport((prev) => (prev ? { ...prev, customer_signature: signatureData } : prev));
        toast.success("Signature saved! Thank you for approving the proposal.");
      }

      // Email the signed PDF to the customer (so they have a copy with their signature)
      void emailSignedPdfToCustomer();
    } catch (err) {
      console.error("Error saving signature:", err);
      toast.error("Failed to save signature. Please try again.");
    } finally {
      setIsSaving(false);
      setSavingProposalIndex(null);
    }
  };

  const emailSignedPdfToCustomer = async () => {
    try {
      const recipient = report?.customer_email;
      if (!recipient || !reportRootRef.current) return;
      // Wait for the signature image to render in the DOM
      await new Promise((r) => setTimeout(r, 600));
      toast.info("Emailing you a signed copy...", { id: "sign-email" });
      const pdfBytes = await buildSignedReportPDF(reportRootRef.current);
      const binary = Array.from(pdfBytes).map((b) => String.fromCharCode(b)).join("");
      const pdfBase64 = btoa(binary);
      const safeName = (report?.customer_name || "Customer").replace(/\s+/g, "_");
      await supabase.functions.invoke("send-report-email", {
        body: {
          customerEmail: recipient,
          customerName: report?.customer_name || "",
          technicianName: report?.technician_name || "",
          address: report?.address || "",
          reportUrl: typeof window !== "undefined" ? window.location.href : "",
          emailSubject: "Your Signed Proposal — Crest Pest Control",
          emailMessage: `Hi ${report?.customer_name || "there"},\n\nThank you for signing your proposal! A copy with your signature is attached for your records.\n\nWe'll be in touch shortly to confirm next steps. If you have any questions, just reply to this email.\n\n— Crest Pest Control`,
          buttonText: "View Signed Proposal",
          reportType: "sales",
          pdfBase64,
          pdfFilename: `Crest_Signed_Proposal_${safeName}.pdf`,
        },
      });
      toast.success(`Signed copy emailed to ${recipient}`, { id: "sign-email" });
    } catch (err) {
      console.error("Failed to email signed PDF:", err);
      toast.dismiss("sign-email");
    }
  };

  const getPerProposalSignaturesFromValue = (value: string | null): Record<string, string> => {
    if (!value) return {};
    try {
      const parsed = JSON.parse(value);
      if (parsed && parsed._perProposal) return parsed.signatures || {};
    } catch { /* legacy */ }
    return {};
  };

  const handleSubmitSignature = () => {
    const sig = signatureRef.current?.forceSave();
    if (sig) {
      handleSignatureSave(sig);
    } else {
      toast.error("Please sign above before submitting");
    }
  };

  const handleSubmitProposalSignature = (proposalIndex: number) => {
    const ref = proposalSignatureRefs.current[proposalIndex];
    const sig = ref?.forceSave();
    if (sig) {
      handleSignatureSave(sig, proposalIndex);
    } else {
      toast.error("Please sign above before submitting");
    }
  };

  const handleVideoPlayRequest = (videoKey: string) => {
    const video = videoRefs.current[videoKey];
    if (!video) return;

    setPlayingVideos((prev) => ({ ...prev, [videoKey]: true }));
    video.play().catch(() => {
      setPlayingVideos((prev) => ({ ...prev, [videoKey]: false }));
    });
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
          <p className="text-muted-foreground">{error || "The proposal you're looking for could not be found."}</p>
          <p className="text-sm text-muted-foreground mt-4">
            If you believe this is an error, please contact Crest Pest Control at (949) 424-5000.
          </p>
        </Card>
      </div>
    );
  }

  const structuredNotes: StructuredNotes | null = (() => {
    if (!report.notes) return null;
    try {
      const parsed = JSON.parse(report.notes);
      return parsed?._structuredNotes ? (parsed as StructuredNotes) : null;
    } catch {
      return null;
    }
  })();

  const mainMapDataString = getMapDataString(report.map_data);
  const shouldRenderMainMapFromData = !!report.custom_map_url && !!mainMapDataString;
  const isInitialReport = report.report_title === "Initial Pest Report";

  const displayPropertyType = structuredNotes?.propertyType || report.customer_preferences?.propertyType || "";
  const displayCompanyName = structuredNotes?.companyName || report.customer_preferences?.companyName || "";
  const additionalDetailsHtml = structuredNotes ? structuredNotes.additionalDetails || "" : report.notes || "";
  const preferredDay = structuredNotes?.preferredServiceDay || "";
  const preferredTime = structuredNotes?.preferredServiceTime || "";
  const pointOfContact = structuredNotes?.mainPointOfContact || "";
  const contactPhoneNum = structuredNotes?.contactPhone || "";
  const materials = structuredNotes?.setupMaterials || [];
  const limitationsTextVal = structuredNotes?.limitationsText || "";
  const recommendedProposalIndex = structuredNotes?.recommendedProposal ?? 0;
  const videoUrl = structuredNotes?.videoUrl || null;
  const videoUrl2 = structuredNotes?.videoUrl2 || null;
  const portalVideoAttached = structuredNotes?.portalVideoAttached === true;
  const duplicateMapData = structuredNotes?.duplicateMapData || {};
  const duplicateRenderedMapImages = structuredNotes?.duplicateRenderedMapImages || {};
  const proposalFindingsMap = structuredNotes?.proposalFindings || {};
  const proposalGuaranteeBoxesMap = structuredNotes?.proposalGuaranteeBoxes || {};
  const singleGuaranteeBoxes = structuredNotes?.guaranteeBoxes;

  const isMultiProposal =
    report.services &&
    Array.isArray(report.services) &&
    report.services.length > 0 &&
    typeof report.services[0] === "object" &&
    report.services[0] !== null &&
    "name" in report.services[0] &&
    "services" in report.services[0];

  const parsedProposals: Proposal[] = isMultiProposal
    ? (report.services as Proposal[])
    : report.services && (report.services as ServiceItem[]).length > 0
      ? [{ name: "Services", services: report.services as ServiceItem[] }]
      : [];

  const findingsHtml = Array.isArray(report.findings)
    ? report.findings.join("<br/>")
    : (report.findings || "");

  const productsDisplay = PRODUCT_LIST.map((p) => (p.chemical ? `${p.name} (${p.chemical})` : p.name)).join(", ");
  const hasSchedulingData = preferredDay || preferredTime || pointOfContact || contactPhoneNum;
  const hasMaterials = materials.length > 0;

  const renderHeader = (title: string) => (
    <header className="flex items-center justify-between p-4 border-b border-border">
      <div className="flex items-center gap-3">
        <img src={crestLogo} alt="Crest Pest Control" className="h-10" />
        <h1 className="text-lg font-bold">{title}</h1>
      </div>
      <div className="text-right text-xs text-muted-foreground">
        {displayPropertyType && displayPropertyType !== "Residential" && (
          <span className="font-semibold text-foreground mr-3">{displayPropertyType}</span>
        )}
        <span className="font-bold text-foreground">PEST CONTROL</span>
      </div>
    </header>
  );

  const renderPlayableVideo = (videoKey: string, title: string, src: string, label: string = title) => (
    <div className="max-w-5xl mx-auto border-t-4 border-border mt-8 no-pdf-export no-print">
      {renderHeader(title)}
      <main className="p-4">
        <div className="rounded-lg overflow-hidden border border-border relative bg-muted">
          <video
            ref={(el) => { videoRefs.current[videoKey] = el; }}
            src={src}
            controls
            preload="metadata"
            className="w-full h-auto max-h-[70vh] relative bg-muted"
            playsInline
            onPlay={() => setPlayingVideos((prev) => ({ ...prev, [videoKey]: true }))}
            onPause={() => setPlayingVideos((prev) => ({ ...prev, [videoKey]: false }))}
            onEnded={() => setPlayingVideos((prev) => ({ ...prev, [videoKey]: false }))}
          />
          {!playingVideos[videoKey] && (
            <button
              type="button"
              onClick={() => handleVideoPlayRequest(videoKey)}
              className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-sage text-foreground cursor-pointer"
              aria-label={`Play ${label}`}
            >
              <img src={crestLogoVideo} alt="Crest Pest Control" className="h-20 w-auto mb-4" />
              <p className="text-2xl font-bold tracking-wide">{label}</p>
              <span className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <Play className="h-4 w-4" />
                Click to play
              </span>
            </button>
          )}
        </div>
      </main>
    </div>
  );

  const renderProposalServicesContent = (proposal: Proposal, proposalIndex: number) => {
    // Use per-proposal findings if available, fall back to main findings for index 0
    const perProposalHtml = proposalFindingsMap[proposalIndex.toString()] || proposalFindingsMap[proposalIndex as any] || "";
    const rawContentHtml = perProposalHtml || (proposalIndex === 0 ? findingsHtml : "");
    const contentHtml = stripRodentGuaranteeFromHtml(rawContentHtml);
    if (contentHtml) {
      const { mainHtml } = splitProposalDisclaimers(contentHtml);
      return (
        <div
          className="text-sm leading-relaxed prose prose-sm max-w-none"
          dangerouslySetInnerHTML={{ __html: mainHtml || contentHtml }}
        />
      );
    }

    const filledServices = proposal.services.filter(
      (service) => service.serviceType || service.initialPrice || service.recurringPrice,
    );

    if (filledServices.length === 0) {
      return <p className="text-sm text-muted-foreground">No services defined for this option.</p>;
    }

    return (
      <div className="space-y-3">
        {filledServices.map((service, idx) => (
          <div key={`${proposal.name}-${idx}`} className="rounded-lg border border-border bg-muted/20 p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-foreground">{service.serviceType || "Service"}</p>
                <p className="text-xs text-muted-foreground">{formatFrequency(service.frequency)}</p>
              </div>
              <div className="text-right text-xs leading-5">
                <p>
                  <span className="text-muted-foreground">Initial:</span>{" "}
                  <span className="font-semibold text-foreground">${service.initialPrice || "0"}</span>
                </p>
                <p>
                  <span className="text-muted-foreground">Recurring:</span>{" "}
                  <span className="font-semibold text-foreground">${service.recurringPrice || "0"}</span>
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  };

  const renderProposalMapPage = (proposal: Proposal, proposalIndex: number) => {
    const duplicateIndex = proposalIndex - 1;
    const duplicateMapDataString = duplicateIndex >= 0 ? getRecordValue(duplicateMapData, duplicateIndex) : null;
    const proposalMapDataString = proposalIndex === 0 ? mainMapDataString : duplicateMapDataString;
    const proposalRenderedMap = proposalIndex === 0
      ? report.rendered_map_url
      : getRecordValue(duplicateRenderedMapImages, duplicateIndex);
    const shouldRenderMapFromData = !!report.custom_map_url && !!proposalMapDataString;
    const showRecommended = recommendedProposalIndex === proposalIndex;

    return (
      <div key={`${proposal.name}-${proposalIndex}`} className="max-w-5xl mx-auto border-t-4 border-border mt-8">
        {renderHeader(`Property Map & Details — ${proposal.name || `Option ${String.fromCharCode(65 + proposalIndex)}`}`)}

        <main className="p-4 space-y-4">
          <div className="grid grid-cols-[2fr_3fr] gap-4">
            <div className="aspect-[3/4] rounded-lg overflow-hidden border border-border bg-muted relative">
              {shouldRenderMapFromData ? (
                <ReadOnlyMapCanvas mapUrl={report.custom_map_url!} mapData={proposalMapDataString} />
              ) : proposalRenderedMap ? (
                <img
                  src={proposalRenderedMap}
                  alt={`Property map for ${proposal.name}`}
                  className="w-full h-full object-contain"
                />
              ) : report.rendered_map_url ? (
                <img
                  src={report.rendered_map_url}
                  alt="Property map with annotations"
                  className="w-full h-full object-contain"
                />
              ) : shouldRenderMainMapFromData ? (
                <ReadOnlyMapCanvas mapUrl={report.custom_map_url!} mapData={mainMapDataString} />
              ) : (
                <div className="h-full flex items-center justify-center px-6 text-center text-sm text-muted-foreground">
                  Map preview not available for this option.
                </div>
              )}
            </div>

            <div className="space-y-4">
              {/* Mini Pricing Table */}
              <Card className="overflow-hidden">
                <div className="bg-brand-black text-white px-4 py-2 flex items-center justify-between gap-3">
                  <span className="text-sm font-bold uppercase">Pricing — {proposal.name || `Option ${String.fromCharCode(65 + proposalIndex)}`}</span>
                  {showRecommended && (
                    <span className="text-xs bg-white/20 px-2 py-0.5 rounded-full">★ Recommended</span>
                  )}
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="text-left px-3 py-1.5 font-medium text-xs">Service</th>
                        <th className="text-center px-3 py-1.5 font-medium text-xs">Initial</th>
                        <th className="text-center px-3 py-1.5 font-medium text-xs">{getRecurringLabel(proposal.services)}</th>
                        <th className="text-center px-3 py-1.5 font-medium text-xs">Frequency</th>
                      </tr>
                    </thead>
                    <tbody>
                      {proposal.services.filter(s => s.serviceType).map((service, idx) => (
                        <tr key={idx} className="border-t border-border">
                          <td className="px-3 py-1.5 text-xs font-medium">{service.serviceType}</td>
                          <td className="px-3 py-1.5 text-xs text-center">${service.initialPrice || "0"}</td>
                          <td className="px-3 py-1.5 text-xs text-center">${service.recurringPrice || "0"}</td>
                          <td className="px-3 py-1.5 text-xs text-center">{formatFrequency(service.frequency)}</td>
                        </tr>
                      ))}
                      <tr className="border-t-2 border-border bg-muted/30">
                        <td className="px-3 py-1.5 text-xs font-bold text-right">Total:</td>
                        <td className="px-3 py-1.5 text-xs text-center font-bold">
                          ${Math.round(proposal.services.reduce((sum, s) => sum + (parseFloat(s.initialPrice) || 0), 0)).toLocaleString()}
                        </td>
                        <td className="px-3 py-1.5 text-xs text-center font-bold">
                          ${Math.round(proposal.services.reduce((sum, s) => sum + (parseFloat(s.recurringPrice) || 0), 0)).toLocaleString()}
                        </td>
                        <td></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </Card>

              {/* Proposed Services */}
              <Card className="overflow-hidden">
                <div className="bg-brand-black text-white px-4 py-3 flex items-center justify-between gap-3">
                  <span className="text-sm font-bold uppercase">Proposed Services — {proposal.name || `Option ${String.fromCharCode(65 + proposalIndex)}`}</span>
                </div>
                <div className="p-4">{renderProposalServicesContent(proposal, proposalIndex)}</div>
              </Card>

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

              {limitationsTextVal && (
                <Card className="overflow-hidden">
                  <div className="bg-brand-black text-white px-4 py-2">
                    <span className="text-xs font-bold uppercase">Limitations</span>
                  </div>
                  <div className="p-4">
                    <p className="text-xs leading-relaxed whitespace-pre-wrap">{limitationsTextVal}</p>
                  </div>
                </Card>
              )}

              {(hasSchedulingData || hasMaterials) && (
                <div className="grid grid-cols-1 gap-4">
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
                            <div key={`${mat.name}-${idx}`} className="flex justify-between text-sm gap-3">
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

              {/* Per-Proposal Signature Box */}
              {isMultiProposal && (
                <Card className="overflow-hidden">
                  <div className="bg-brand-black text-white px-4 py-2">
                    <span className="text-xs font-bold uppercase">
                      Sign for {proposal.name || `Option ${String.fromCharCode(65 + proposalIndex)}`}
                    </span>
                  </div>
                  <div className="p-4">
                    {(() => {
                      const perSigs = getPerProposalSignatures();
                      const existingSig = perSigs[String(proposalIndex)];
                      if (existingSig) {
                        return (
                          <div className="space-y-3">
                            <div className="border rounded p-3 bg-muted/30">
                              <img src={existingSig} alt={`Signature for ${proposal.name}`} className="max-h-16 mx-auto" />
                            </div>
                            <div className="flex items-center justify-center gap-2 text-dark-sage text-sm">
                              <Check className="w-4 h-4" />
                              <span className="font-medium">{proposal.name || `Option ${String.fromCharCode(65 + proposalIndex)}`} — Signed</span>
                            </div>
                            <div className="flex justify-between text-xs text-muted-foreground border-t pt-2">
                              <span><span className="font-medium text-foreground">Print:</span> {report.customer_name}</span>
                              <span><span className="font-medium text-foreground">Date:</span> {new Date().toLocaleDateString()}</span>
                            </div>
                          </div>
                        );
                      }
                      return (
                        <div className="space-y-3">
                          <p className="text-xs text-muted-foreground">
                            Sign below to approve <strong>{proposal.name || `Option ${String.fromCharCode(65 + proposalIndex)}`}</strong>.
                          </p>
                          <div className="border rounded overflow-hidden">
                            <SignatureCanvas
                              ref={(el) => { proposalSignatureRefs.current[proposalIndex] = el; }}
                              onSave={() => {}}
                              label={`Sign for ${proposal.name || `Option ${String.fromCharCode(65 + proposalIndex)}`}`}
                            />
                          </div>
                          <Button
                            onClick={() => handleSubmitProposalSignature(proposalIndex)}
                            disabled={isSaving && savingProposalIndex === proposalIndex}
                            className="w-full"
                            size="sm"
                          >
                            {isSaving && savingProposalIndex === proposalIndex ? (
                              <>
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                Saving...
                              </>
                            ) : (
                              <>
                                <Check className="w-4 h-4 mr-2" />
                                Submit Signature for {proposal.name || `Option ${String.fromCharCode(65 + proposalIndex)}`}
                              </>
                            )}
                          </Button>
                        </div>
                      );
                    })()}
                  </div>
                </Card>
              )}

              {/* Pesticide Notice — shown on every proposal page */}
              {(() => {
                const perProposalHtml = proposalFindingsMap[proposalIndex.toString()] || proposalFindingsMap[proposalIndex as any] || "";
                const rawContentHtml = perProposalHtml || (proposalIndex === 0 ? findingsHtml : "");
                const contentHtml = stripRodentGuaranteeFromHtml(rawContentHtml);
                const { disclaimerHtml } = splitProposalDisclaimers(contentHtml);
                return (
                  <Card className="overflow-hidden">
                    <div className="bg-brand-black text-white px-4 py-2">
                      <span className="text-xs font-bold uppercase">Disclaimers & Additional Details</span>
                    </div>
                    <div className="p-4">
                      {disclaimerHtml && (
                        <div
                          className="text-xs leading-relaxed prose prose-xs max-w-none text-foreground/90"
                          dangerouslySetInnerHTML={{ __html: disclaimerHtml }}
                        />
                      )}
                      <p className={`text-[11px] italic text-muted-foreground ${disclaimerHtml ? "mt-3 pt-3 border-t border-border" : ""}`}>
                        {SALES_REPORT_DISCLAIMER_HTML.replace(/<[^>]+>/g, "")}
                      </p>
                    </div>
                  </Card>
                );
              })()}

              {/* Guarantee / Warranty boxes — editable per proposal in admin. */}
              {(() => {
                const proposalServiceTypes = proposal.services.map((s) => s.serviceType);
                const savedPer = proposalGuaranteeBoxesMap[proposalIndex.toString()]
                  ?? proposalGuaranteeBoxesMap[proposalIndex as any];
                // For legacy single-report data, also accept top-level guaranteeBoxes
                // when there's only one proposal.
                const savedFallback = !parsedProposals || parsedProposals.length <= 1
                  ? singleGuaranteeBoxes
                  : undefined;
                const boxes = resolveInitialGuaranteeBoxes(
                  savedPer ?? savedFallback,
                  proposalServiceTypes,
                );
                return <GuaranteeBoxesReadOnly boxes={boxes} />;
              })()}

              <Card className="overflow-hidden">
                <div className="bg-brand-black text-white px-4 py-2">
                  <span className="text-xs font-bold uppercase">Pesticide Notice</span>
                </div>
                <div className="p-3">
                  <p className="text-[9px] leading-[1.3] text-foreground">
                    State law requires that you be given the following information: CAUTION--PESTICIDES ARE TOXIC CHEMICALS. Structural Pest Control Companies are registered and regulated by the Structural Pest Control Board, and apply pesticides which are registered and approved for use by the California Department of Pesticide Regulation and the United States Environmental Protection Agency. Registration is granted when the state finds that, based on existing scientific evidence, there are no appreciable risks if proper use conditions are followed or that the risks are outweighed by the benefits. The degree of risk depends upon the degree of exposure, so exposure should be minimized. If within 24 hours following application you experience symptoms similar to common seasonal illness comparable to the flu, contact your physician or poison control center (800-222-1222) and your pest control company immediately.
                  </p>
                  <p className="text-[9px] leading-[1.3] text-foreground font-medium mt-1">
                    For further information, contact any of the following: Crest Pest Control (949-424-5000); for Health Questions--the County Health Department (800-564-8448); for Application Information--the County Agricultural Commissioner (714-955-0100) and for Regulatory Information--the Structural Pest Control Board (800-737-8188, 2005 Evergreen Street, Ste. 1500, Sacramento, CA 95815).
                  </p>
                </div>
              </Card>
            </div>
          </div>
        </main>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-background" ref={reportRootRef}>
      {(() => {
        const prefs = (report.customer_preferences as any) || {};
        if (prefs.reportFormat !== "rodent-exclusion") return null;
        const beforePhotos: PropertyImage[] = Array.isArray(prefs?.beforeAfter?.before)
          ? prefs.beforeAfter.before
          : [];
        const afterPhotos: PropertyImage[] = Array.isArray(report.property_images)
          ? report.property_images.filter((p) => p && (p.image || p.url))
          : [];
        const pairCount = Math.max(beforePhotos.length, afterPhotos.length);
        const pairLabels = normalizeRodentPairLabels(prefs?.beforeAfter?.pairLabels, pairCount);
        const findingsTextHtml = Array.isArray(report.findings)
          ? report.findings.join("<br/>")
          : (report.findings || "");
        return (
          <>
            <div className="max-w-5xl mx-auto">
              <header className="flex items-center justify-between p-4 border-b border-border">
                <div className="flex items-center gap-3">
                  <img src={crestLogo} alt="Crest Pest Control" className="h-10" />
                  <h1 className="text-lg font-bold">Rodent Exclusion Report</h1>
                </div>
                <span className="text-xs font-bold text-foreground">PEST CONTROL</span>
              </header>

              <main className="p-4 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <Card className="p-4">
                    <h2 className="text-xs font-bold uppercase text-muted-foreground mb-2">Customer Details</h2>
                    <div className="space-y-1 text-sm">
                      <p><span className="text-muted-foreground">Name:</span> <span className="font-medium">{report.customer_name || "—"}</span></p>
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

                {findingsTextHtml && (
                  <Card className="overflow-hidden">
                    <div className="bg-brand-black text-white px-4 py-2">
                      <span className="text-xs font-bold uppercase">Service Summary / Findings</span>
                    </div>
                    <div className="p-4">
                      <div
                        className="text-sm leading-relaxed whitespace-pre-wrap"
                        dangerouslySetInnerHTML={{
                          __html: findingsTextHtml
                            .replace(/^(.*?:)/gm, "<strong>$1</strong>")
                            .replace(/\n/g, "<br/>"),
                        }}
                      />
                    </div>
                  </Card>
                )}

                {report.equipment && report.equipment.length > 0 && (
                  <Card className="overflow-hidden">
                    <div className="bg-brand-black text-white px-4 py-2">
                      <span className="text-xs font-bold uppercase">Materials Used</span>
                    </div>
                    <div className="p-3">
                      <div className="flex flex-wrap gap-1.5">
                        {report.equipment.map((mat, idx) => (
                          <span key={idx} className="bg-primary text-primary-foreground px-2.5 py-1 rounded-full text-xs font-medium">
                            {mat}
                          </span>
                        ))}
                      </div>
                    </div>
                  </Card>
                )}

                {pairCount > 0 && (
                  <Card className="overflow-hidden">
                    <div className="bg-brand-black text-white px-4 py-2 flex items-center justify-between">
                      <span className="text-xs font-bold uppercase">Entry Point Photos</span>
                      <span className="text-[10px] opacity-80">
                        {beforePhotos.length} before · {afterPhotos.length} after
                      </span>
                    </div>
                    <div className="p-3">
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {Array.from({ length: pairCount }, (_, i) => {
                          const before = beforePhotos[i];
                          const after = afterPhotos[i];
                          const beforeSrc = before?.image || before?.url;
                          const afterSrc = after?.image || after?.url;
                          const label = pairLabels[i] || defaultRodentPairLabel(i);
                          return (
                            <div key={`pair-${i}`} className="rounded-xl border-2 border-dark-sage/40 bg-card p-2">
                              <div className="flex items-center justify-between mb-1.5 px-0.5">
                                <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                                  {label}
                                </span>
                              </div>
                              <div className="grid grid-cols-2 gap-2">
                                <div className="space-y-1">
                                  <span className="block text-[10px] font-semibold uppercase tracking-wide text-dark-sage">Before</span>
                                  <div className="aspect-[4/3] rounded-lg overflow-hidden border border-border bg-muted">
                                    {beforeSrc ? (
                                      <img src={beforeSrc} alt={`Before ${i + 1}`} className="w-full h-full object-cover" />
                                    ) : (
                                      <div className="w-full h-full flex items-center justify-center text-[10px] text-muted-foreground">—</div>
                                    )}
                                  </div>
                                  {before?.caption && (
                                    <p className="text-[10px] leading-tight text-foreground bg-muted/40 rounded px-1.5 py-1">{before.caption}</p>
                                  )}
                                </div>
                                <div className="space-y-1">
                                  <span className="block text-[10px] font-semibold uppercase tracking-wide text-primary">After</span>
                                  <div className="aspect-[4/3] rounded-lg overflow-hidden border border-border bg-muted">
                                    {afterSrc ? (
                                      <img src={afterSrc} alt={`After ${i + 1}`} className="w-full h-full object-cover" />
                                    ) : (
                                      <div className="w-full h-full flex items-center justify-center text-[10px] text-muted-foreground">—</div>
                                    )}
                                  </div>
                                  {after?.caption && (
                                    <p className="text-[10px] leading-tight text-foreground bg-muted/40 rounded px-1.5 py-1">{after.caption}</p>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </Card>
                )}

                <Card className="overflow-hidden">
                  <div className="bg-brand-black text-white px-4 py-2">
                    <span className="text-xs font-bold uppercase">Crest Guarantee</span>
                  </div>
                  <div className="p-4 text-sm leading-relaxed space-y-2">
                    <p>
                      Our exclusion work carries a <strong>lifetime warranty</strong> on any area we sealed for as long as you remain on an ongoing rodent bait box service. If you are not on an ongoing bait box service, the warranty covers re-sealing at no charge for <strong>one year</strong>.
                    </p>
                    <p className="text-muted-foreground text-xs">
                      The warranty excludes new openings made by others or natural deterioration. Crest is not liable for any structural or property damage caused by rodents.
                    </p>
                  </div>
                </Card>

                <div className="text-center text-xs text-muted-foreground py-2">
                  Questions? Call Crest Pest Control at <span className="font-semibold text-foreground">949-424-5000</span>.
                </div>
              </main>
            </div>
          </>
        );
      })() || (
      <>
      {!isInitialReport && report.customer_signature && (
        <div className="bg-sage/50 border-b border-sage py-3 px-4">
          <div className="max-w-5xl mx-auto flex items-center gap-3 justify-center">
            <FileCheck className="w-5 h-5 text-dark-sage" />
            <span className="text-foreground font-medium">
              {isMultiProposal
                ? (() => {
                    const sigs = getPerProposalSignatures();
                    const signedOptions = Object.keys(sigs).map(k => `Option ${String.fromCharCode(65 + parseInt(k))}`);
                    return signedOptions.length > 0
                      ? `Signed: ${signedOptions.join(", ")}. Thank you!`
                      : "This proposal has been signed and approved. Thank you!";
                  })()
                : "This proposal has been signed and approved. Thank you!"}
            </span>
          </div>
        </div>
      )}

      {videoUrl && renderPlayableVideo("primary-property-video", "Property Video", videoUrl, "Video Report")}

      {videoUrl2 && (
        null
      )}

      <div className="max-w-5xl mx-auto">
        {renderHeader(report.report_title || "Pest Control Proposal")}

        <main className="p-4 space-y-4">
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

          {isInitialReport ? (
            <>
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

              {report.customer_key_areas && report.customer_key_areas.length > 0 && (
                <Card className="overflow-hidden">
                  <div className="bg-brand-black text-white px-4 py-2">
                    <span className="text-xs font-bold uppercase">Customer Key Areas</span>
                  </div>
                  <div className="p-3">
                    <div className="flex flex-wrap gap-1.5">
                      {report.customer_key_areas.map((area, idx) => (
                        <span key={idx} className="bg-primary text-primary-foreground px-2.5 py-1 rounded-full text-xs font-medium">
                          {area === "Children" && "👶 "}
                          {area === "Pets" && "🐾 "}
                          {area === "Elderly" && "👴 "}
                          {area === "Garden" && "🌿 "}
                          {area}
                        </span>
                      ))}
                    </div>
                  </div>
                </Card>
              )}

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

              {report.next_steps && report.next_steps.length > 0 && report.next_steps[0] && (
                <Card className="overflow-hidden">
                  <div className="bg-brand-black text-white px-4 py-2">
                    <span className="text-xs font-bold uppercase">What to Expect</span>
                  </div>
                  <div className="p-4">
                    <div
                      className="text-sm leading-relaxed prose prose-sm max-w-none"
                      dangerouslySetInnerHTML={{ __html: report.next_steps.join("<br/>") }}
                    />
                  </div>
                </Card>
              )}

              {report.recommendations && report.recommendations.length > 0 && report.recommendations[0] && (
                <Card className="overflow-hidden">
                  <div className="bg-brand-black text-white px-4 py-2">
                    <span className="text-xs font-bold uppercase text-dark-sage">Recommendations</span>
                  </div>
                  <div className="p-4">
                    <div
                      className="text-sm leading-relaxed prose prose-sm max-w-none text-dark-sage"
                      dangerouslySetInnerHTML={{ __html: report.recommendations.join("<br/>") }}
                    />
                  </div>
                </Card>
              )}

              <div className="grid grid-cols-[2fr_3fr] gap-4">
                <Card className="overflow-hidden">
                  <div className="bg-brand-black text-white px-4 py-2">
                    <span className="text-xs font-bold uppercase">Products</span>
                  </div>
                  <div className="p-3">
                    <p className="text-[10px] leading-relaxed text-foreground">{productsDisplay}</p>
                  </div>
                </Card>

                <Card className="overflow-hidden">
                  <div className="bg-brand-black text-white px-4 py-2">
                    <span className="text-xs font-bold uppercase">Pesticide Notice</span>
                  </div>
                  <div className="p-3">
                    <p className="text-[9px] leading-[1.3] text-foreground">
                      State law requires that you be given the following information: CAUTION--PESTICIDES ARE TOXIC CHEMICALS. Structural Pest Control Companies are registered and regulated by the Structural Pest Control Board, and apply pesticides which are registered and approved for use by the California Department of Pesticide Regulation and the United States Environmental Protection Agency. Registration is granted when the state finds that, based on existing scientific evidence, there are no appreciable risks if proper use conditions are followed or that the risks are outweighed by the benefits. The degree of risk depends upon the degree of exposure, so exposure should be minimized. If within 24 hours following application you experience symptoms similar to common seasonal illness comparable to the flu, contact your physician or poison control center (800-222-1222) and your pest control company immediately.
                    </p>
                    <p className="text-[9px] leading-[1.3] text-foreground font-medium mt-1">
                      For further information, contact any of the following: Crest Pest Control (949-424-5000); for Health Questions--the County Health Department (800-564-8448); for Application Information--the County Agricultural Commissioner (714-955-0100) and for Regulatory Information--the Structural Pest Control Board (800-737-8188, 2005 Evergreen Street, Ste. 1500, Sacramento, CA 95815).
                    </p>
                  </div>
                </Card>
              </div>
            </>
          ) : (
            <>
              {parsedProposals.length > 0 && parsedProposals.map((proposal, pIdx) => (
                <Card key={pIdx} className={`overflow-hidden ${isMultiProposal && recommendedProposalIndex === pIdx ? "ring-2 ring-primary" : ""}`}>
                  <div className="bg-brand-black text-white px-4 py-2 flex items-center justify-between">
                    <span className="text-xs font-bold uppercase">
                      {isMultiProposal ? proposal.name : "Services"}
                      {isMultiProposal && recommendedProposalIndex === pIdx && (
                        <span className="ml-2 text-[10px] bg-white/20 px-2 py-0.5 rounded-full">★ Recommended</span>
                      )}
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="text-left px-4 py-2 font-medium">Service Type</th>
                          <th className="text-center px-4 py-2 font-medium">Initial</th>
                          <th className="text-center px-4 py-2 font-medium">{getRecurringLabel(proposal.services)}</th>
                          <th className="text-center px-4 py-2 font-medium">Frequency</th>
                        </tr>
                      </thead>
                      <tbody>
                        {proposal.services.map((service, idx) => (
                          <tr key={idx} className="border-t border-border">
                            <td className="px-4 py-2 font-medium">{service.serviceType || "—"}</td>
                            <td className="px-4 py-2 text-center">${service.initialPrice || "0"}</td>
                            <td className="px-4 py-2 text-center">${service.recurringPrice || "0"}</td>
                            <td className="px-4 py-2 text-center">{formatFrequency(service.frequency)}</td>
                          </tr>
                        ))}
                        <tr className="border-t-2 border-border bg-muted/30">
                          <td className="px-4 py-2 font-bold text-right">Total:</td>
                          <td className="px-4 py-2 text-center font-bold">
                            ${Math.round(proposal.services.reduce((sum, s) => sum + (parseFloat(s.initialPrice) || 0), 0)).toLocaleString()}
                          </td>
                          <td className="px-4 py-2 text-center font-bold">
                            ${Math.round(proposal.services.reduce((sum, s) => sum + (parseFloat(s.recurringPrice) || 0), 0)).toLocaleString()}
                          </td>
                          <td></td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </Card>
              ))}

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
                      <p className="text-[10px] leading-relaxed text-foreground">{productsDisplay}</p>
                    </div>
                  </Card>
                </div>

                {!isMultiProposal && findingsHtml && (
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

              {/* Single signature for non-multi-proposal; multi-proposal has per-option signatures on map pages */}
              {!isMultiProposal && (
                <div className="grid grid-cols-[2fr_3fr] gap-4">
                  <Card className="overflow-hidden">
                    <div className="bg-brand-black text-white px-4 py-2">
                      <span className="text-xs font-bold uppercase">Customer Signature</span>
                    </div>
                    <div className="p-4">
                      {report.customer_signature && isLegacySingleSignature() ? (
                        <div className="space-y-3">
                          <div className="border rounded p-3 bg-muted/30">
                            <img src={report.customer_signature} alt="Customer signature" className="max-h-16 mx-auto" />
                          </div>
                          <div className="flex items-center justify-center gap-2 text-dark-sage text-sm">
                            <Check className="w-4 h-4" />
                            <span className="font-medium">Proposal Approved</span>
                          </div>
                          <div className="flex justify-between text-xs text-muted-foreground border-t pt-2">
                            <span><span className="font-medium text-foreground">Print:</span> {report.customer_name}</span>
                            <span><span className="font-medium text-foreground">Date:</span> {new Date().toLocaleDateString()}</span>
                          </div>
                          <p className="text-xs text-muted-foreground text-center mt-2">This proposal has already been signed.</p>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <p className="text-xs text-muted-foreground">Please sign below to approve this proposal.</p>
                          <div className="border rounded overflow-hidden">
                            <SignatureCanvas ref={signatureRef} onSave={() => {}} label="Sign here" />
                          </div>
                          <Button onClick={handleSubmitSignature} disabled={isSaving} className="w-full" size="sm">
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

                </div>
              )}

              {/* Pesticide Notice — always shown for sales (initial & multi-proposal) */}
              <Card className="overflow-hidden">
                <div className="bg-brand-black text-white px-4 py-2">
                  <span className="text-xs font-bold uppercase">Pesticide Notice</span>
                </div>
                <div className="p-3">
                  <p className="text-[9px] leading-[1.3] text-foreground">
                    State law requires that you be given the following information: CAUTION--PESTICIDES ARE TOXIC CHEMICALS. Structural Pest Control Companies are registered and regulated by the Structural Pest Control Board, and apply pesticides which are registered and approved for use by the California Department of Pesticide Regulation and the United States Environmental Protection Agency. Registration is granted when the state finds that, based on existing scientific evidence, there are no appreciable risks if proper use conditions are followed or that the risks are outweighed by the benefits. The degree of risk depends upon the degree of exposure, so exposure should be minimized. If within 24 hours following application you experience symptoms similar to common seasonal illness comparable to the flu, contact your physician or poison control center (800-222-1222) and your pest control company immediately.
                  </p>
                  <p className="text-[9px] leading-[1.3] text-foreground font-medium mt-1">
                    For further information, contact any of the following: Crest Pest Control (949-424-5000); for Health Questions--the County Health Department (800-564-8448); for Application Information--the County Agricultural Commissioner (714-955-0100) and for Regulatory Information--the Structural Pest Control Board (800-737-8188, 2005 Evergreen Street, Ste. 1500, Sacramento, CA 95815).
                  </p>
                </div>
              </Card>
            </>
          )}
        </main>
      </div>

      {!isInitialReport && isMultiProposal && parsedProposals.length > 0 ? (
        parsedProposals.map((proposal, proposalIndex) => renderProposalMapPage(proposal, proposalIndex))
      ) : ((report.custom_map_url || report.rendered_map_url || additionalDetailsHtml || hasSchedulingData || hasMaterials || limitationsTextVal) && (
        <div className="max-w-5xl mx-auto border-t-4 border-border mt-8">
          {renderHeader("Property Map & Details")}

          <main className="p-4 space-y-4">
            {(report.rendered_map_url || report.custom_map_url) ? (
              <div className="grid grid-cols-[2fr_3fr] gap-4">
                <div className="aspect-[3/4] rounded-lg overflow-hidden border border-border bg-muted">
                  {shouldRenderMainMapFromData ? (
                    <ReadOnlyMapCanvas mapUrl={report.custom_map_url!} mapData={mainMapDataString} />
                  ) : report.rendered_map_url ? (
                    <img src={report.rendered_map_url} alt="Property map with annotations" className="w-full h-full object-contain" />
                  ) : (
                    <ReadOnlyMapCanvas mapUrl={report.custom_map_url!} mapData={mainMapDataString} />
                  )}
                </div>

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

                  {limitationsTextVal && (
                    <Card className="overflow-hidden">
                      <div className="bg-brand-black text-white px-4 py-2">
                        <span className="text-xs font-bold uppercase">Limitations</span>
                      </div>
                      <div className="p-4">
                        <p className="text-xs leading-relaxed whitespace-pre-wrap">{limitationsTextVal}</p>
                      </div>
                    </Card>
                  )}

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
                            <div key={`${mat.name}-${idx}`} className="flex justify-between text-sm">
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

                {limitationsTextVal && (
                  <Card className="overflow-hidden">
                    <div className="bg-brand-black text-white px-4 py-2">
                      <span className="text-xs font-bold uppercase">Limitations</span>
                    </div>
                    <div className="p-4">
                      <p className="text-xs leading-relaxed whitespace-pre-wrap">{limitationsTextVal}</p>
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
                              <div key={`${mat.name}-${idx}`} className="flex justify-between text-sm">
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
      ))}

      {report.property_images && report.property_images.length > 0 && (
        <div className="max-w-5xl mx-auto border-t-4 border-border mt-8">
          {renderHeader("Property Images")}
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
                    {img.caption && <p className="text-xs text-muted-foreground">{img.caption}</p>}
                  </div>
                );
              })}
            </div>
          </main>
        </div>
      )}

      {portalVideoAttached && renderPlayableVideo("client-portal-walkthrough", "Additional Video", "/videos/client-portal-video.mp4", "Client Portal Walkthrough")}

      {/* Bottom-uploaded property video — render after all proposal content, photos, maps, and notices. */}
      {videoUrl2 && renderPlayableVideo("bottom-property-video", "Property Video", videoUrl2, "Property Video")}

      <div className="max-w-5xl mx-auto mt-8 px-4">
        <div className="border-2 border-border rounded-lg p-5 text-center bg-muted/30">
          <h3 className="text-sm font-bold text-foreground mb-2">The Crest Guarantee</h3>
          <p className="text-xs text-foreground leading-relaxed max-w-2xl mx-auto">
            If pests return, we will return at no charge. We don't lock you into a long-term contract. We want our service quality to keep you as a customer, not a contract.
          </p>
        </div>
        {parsedProposals.some((p) => p.services.some((s) => {
          const f = typeof s.frequency === "string" ? parseInt(s.frequency, 10) : s.frequency;
          return f === 7 || f === 14 || f === 28;
        })) && (
          <p className="text-[11px] italic text-muted-foreground text-center mt-2 leading-snug">
            * Scheduling and billing run on four-week cycles to help ensure consistency (e.g., the same day and time for each visit). Invoices are sent upon completion of each service.
          </p>
        )}
      </div>

      <div className="max-w-5xl mx-auto text-center text-sm text-muted-foreground py-8 border-t border-border mt-8">
        <p>Questions? Contact Crest Pest Control</p>
        <p className="font-medium">(949) 424-5000</p>
      </div>
      </>
      )}
    </div>
  );
}
