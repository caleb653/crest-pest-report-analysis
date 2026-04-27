import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Printer, Download } from "lucide-react";
import { PreApplicationNotice } from "@/components/portal/PreApplicationNotice";

/**
 * Public, link-shareable pre-application notice for a given property.
 * Route: /pre-application/:propertyId
 */
export default function PreApplicationNoticePage() {
  const { propertyId } = useParams<{ propertyId: string }>();
  const [property, setProperty] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!propertyId) return;
    (async () => {
      const { data } = await supabase
        .from("portal_properties")
        .select("id, name, address, customer_preferences, notes")
        .eq("id", propertyId)
        .maybeSingle();
      setProperty(data);
      setLoading(false);
    })();
  }, [propertyId]);

  const handlePrint = () => window.print();

  const handleDownloadPdf = async () => {
    if (!printRef.current) return;
    // Lazy-load to keep the initial bundle small.
    const html2pdf = (await import("html2pdf.js")).default;
    html2pdf()
      .set({
        margin: 0,
        filename: `Pre-Application-Notice-${(property?.name || "Property").replace(/[^a-z0-9]+/gi, "-")}.pdf`,
        image: { type: "jpeg", quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, backgroundColor: "#ffffff" },
        jsPDF: { unit: "in", format: "letter", orientation: "portrait" },
      })
      .from(printRef.current)
      .save();
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted">
        <div className="h-8 w-8 rounded-full border-2 border-muted-foreground border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!property) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted">
        <div className="text-center">
          <h1 className="text-xl font-semibold">Notice not found</h1>
          <p className="text-muted-foreground mt-1">This property could not be located.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted py-6 print:bg-white print:py-0">
      <div className="max-w-[8.5in] mx-auto mb-4 flex justify-end gap-2 px-2 print:hidden">
        <Button variant="outline" onClick={handlePrint}>
          <Printer className="w-4 h-4 mr-2" /> Print
        </Button>
        <Button onClick={handleDownloadPdf}>
          <Download className="w-4 h-4 mr-2" /> Download PDF
        </Button>
      </div>
      <div className="shadow-lg print:shadow-none">
        <PreApplicationNotice ref={printRef} property={property} />
      </div>
    </div>
  );
}