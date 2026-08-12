import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Printer, Download, Pencil, Check, Loader2 } from "lucide-react";
import { PreApplicationNotice } from "@/components/portal/PreApplicationNotice";
import { toast } from "@/hooks/use-toast";

/**
 * Public, link-shareable pre-application notice for a given property.
 * Route: /pre-application/:propertyId
 */
export default function PreApplicationNoticePage() {
  const { propertyId } = useParams<{ propertyId: string }>();
  const [property, setProperty] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
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
    const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
      import("html2canvas"),
      import("jspdf"),
    ]);
    const canvas = await html2canvas(printRef.current, {
      scale: 2, useCORS: true, backgroundColor: "#ffffff",
    });
    const imgData = canvas.toDataURL("image/jpeg", 0.95);
    const pdf = new jsPDF({ unit: "in", format: "letter", orientation: "portrait" });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    pdf.addImage(imgData, "JPEG", 0, 0, pageW, pageH);
    const safeName = (property?.name || "Property").replace(/[^a-z0-9]+/gi, "-");
    pdf.save(`Pre-Application-Notice-${safeName}.pdf`);
  };

  // Persist edits to portal_properties.customer_preferences. Stored under
  // dedicated keys so they only affect this notice (not the rest of the portal):
  //   notice_target_pests, notice_date, initial_service_date
  // service_frequency is shared with the rest of the portal so editing it
  // here also updates the property's plan — which is the desired behavior.
  const persist = async (next: {
    frequency: string;
    checkedPests: string[];
    noticeDate: string;
    initialDate: string;
  }) => {
    const updatedPrefs = {
      ...(property.customer_preferences || {}),
      service_frequency: next.frequency,
      notice_target_pests: next.checkedPests,
      notice_date: next.noticeDate,
      initial_service_date: next.initialDate,
    };
    // Optimistic local update so the form reflects changes immediately
    setProperty({ ...property, customer_preferences: updatedPrefs });
    setSaving(true);
    const { error } = await supabase
      .from("portal_properties")
      .update({ customer_preferences: updatedPrefs })
      .eq("id", property.id);
    setSaving(false);
    if (error) {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
    }
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
      <div className="max-w-[8.5in] mx-auto mb-4 flex flex-wrap justify-end gap-2 px-2 print:hidden">
        <Button
          variant={editing ? "default" : "outline"}
          onClick={() => setEditing((v) => !v)}
        >
          {editing ? <Check className="w-4 h-4 mr-2" /> : <Pencil className="w-4 h-4 mr-2" />}
          {editing ? "Done Editing" : "Edit"}
        </Button>
        {saving && (
          <span className="flex items-center text-xs text-muted-foreground gap-1 self-center">
            <Loader2 className="w-3 h-3 animate-spin" /> Saving…
          </span>
        )}
        <Button variant="outline" onClick={handlePrint}>
          <Printer className="w-4 h-4 mr-2" /> Print
        </Button>
        <Button onClick={handleDownloadPdf}>
          <Download className="w-4 h-4 mr-2" /> Download PDF
        </Button>
      </div>
      {editing && (
        <div className="max-w-[8.5in] mx-auto mb-3 px-3 py-2 rounded-md bg-primary/10 border border-primary/30 text-xs text-primary-foreground/90">
          <span className="font-semibold text-primary">Editing:</span>{" "}
          <span className="text-foreground/80">
            Click any pest checkbox, frequency option, or date to update it. Changes save automatically.
          </span>
        </div>
      )}
      <div className="overflow-x-auto">
        <div className="shadow-lg print:shadow-none">
          <PreApplicationNotice
            ref={printRef}
            property={property}
            noticeDate={property.customer_preferences?.notice_date}
            editable={editing}
            onChange={persist}
          />
        </div>
      </div>
    </div>
  );
}