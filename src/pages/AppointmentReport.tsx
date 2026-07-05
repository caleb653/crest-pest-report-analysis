import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { Save, Loader2, Check, ChevronsUpDown, Plus, FileDown, Home, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import crestLogo from "@/assets/crest-logo.png";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import InlineImageAnnotator from "@/components/InlineImageAnnotator";
import { MapCanvas } from "@/components/MapCanvas";
import { useIsMobile, useIsTablet } from "@/hooks/use-mobile";
import { PesticideNotice } from "@/components/portal/PesticideNotice";
import ApartmentInspectionDisclaimer from "@/components/portal/ApartmentInspectionDisclaimer";
import { ProductUsageEditor } from "@/components/portal/ProductUsageEditor";
import { ProductUsage, normalizeUsageList } from "@/lib/productCatalog";

const SERVICE_STATUS_OPTIONS = ["Treated - Complete", "Treated - Follow Up"] as const;
const INSPECTION_STATUS_OPTIONS = ["Activity Found - Follow Up", "Free and Clear*"] as const;

const TECHNICIANS = [
  { name: "Darrell Tanner", license: "FR 62523" },
  { name: "Jake Shubin", license: "FR 71068" },
  { name: "Caleb Whalen", license: "FR 71183" },
  { name: "Jackson Latham", license: "FR 68261" },
  { name: "Dylan Gallegos", license: "RA 71068" },
  { name: "Michael Muniz", license: "FR 54193" },
  { name: "David Longoria", license: "FR 71710" },
  { name: "Nick Stovall", license: "FR 69245" },
];

const PEST_OPTIONS = [
  "General Pests: ants, spiders, cockroaches, earwigs, crickets, silverfish, centipedes, millipedes, wasps, fleas & ticks (outdoor only)",
  "Ants", "Spiders", "Rodents", "Roaches", "American Roaches", "Wasps",
  "Bed Bugs", "Fleas", "Ticks", "Mosquitoes", "Silverfish", "Earwigs",
  "Crickets", "Centipedes", "Millipedes", "Drain Flies", "Other",
];

const PRODUCT_OPTIONS = [
  "Alpine WSG", "Bifen I/T", "Essentria IC Pro", "Temprid FX", "Termidor SC",
  "Phantom", "ExciteR", "Gentrol IGR Concentrate", "Nyguard IGR Concentrate",
  "PT Wasp Freeze", "PT Alpine Flea & Bed Bug", "PT Alpine Fly Bait",
  "Gentrol Aerosol", "Bedlam", "Invade Hot Spot +", "Niban", "Bifen LP",
  "Advion Ant Gel Bait", "Maxforce FC Ant Gel", "MasterLine B MaxxPro",
  "Advion Cockroach Gel Bait", "Contrac California", "Delta Dust (Bayer)",
  "In2Care Mix", "OneGuard", "Advion Microflow", "Optigard",
  "Crossfire Bedbug Concentrate", "Other",
];

const EQUIPMENT_OPTIONS = ["Rodent Bait Stations", "Rodent Traps", "Mosquito Buckets", "Fly Light", "Pest Monitors"];

const UNIT_PEST_OPTIONS = [
  "General Pests", "Ants", "Spiders", "Rodents", "Roaches", "American Roaches", "Wasps",
  "Bed Bugs", "Fleas", "Ticks", "Mosquitoes", "Silverfish", "Earwigs",
  "Crickets", "Centipedes", "Millipedes", "Drain Flies", "Other",
];

const CUSTOMER_KEY_AREAS = ["Children", "Pets", "Elderly", "Garden"];

const COMMERCIAL_CONCERNS = [
  "Sanitation concerns",
  "Harborage / clutter",
  "Exclusion gaps",
  "Moisture issues",
  "Food storage issues",
  "Trash / dumpster issues",
  "Structural deficiencies",
  "Conducive conditions",
];

const AppointmentReport = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { serviceId } = useParams();
  const isMobile = useIsMobile();
  const isTablet = useIsTablet();
  const isMobileOrTablet = isMobile || isTablet;

  // Get state from location.state or sessionStorage (for new tab opens)
  const getInitialState = () => {
    if (location.state) return location.state;
    if (serviceId) {
      const stored = sessionStorage.getItem(`appointment-report-${serviceId}`);
      if (stored) {
        try { return JSON.parse(stored); } catch { return {}; }
      }
    }
    return {};
  };
  const initialState = getInitialState();
  const {
    serviceData,
    propertyName: initPropertyName,
    clientName,
    returnTo,
    propertyId: initPropertyId,
    propertyAddress,
    propertyEquipment,
    customerPreference: initPref,
    customerPreferenceNotes: initPrefNotes,
    prePopulatedUnits,
    recentPestData,
    followUpUnits,
  } = initialState;

  interface UnitRow {
    unit: string;
    targetPests: string;
    notes: string;
    areasTreated: string;
    productsUsed: string;
    followUp: string;
    followUpNotes: string;
    status: string;
    activityLevel: string;
    flags: string;
    originalWorkOrder?: string;
  }

  const emptyUnit: UnitRow = {
    unit: "",
    targetPests: "",
    notes: "",
    areasTreated: "",
    productsUsed: "",
    followUp: "No",
    followUpNotes: "",
    status: "To Be Treated",
    activityLevel: "",
    flags: "",
    originalWorkOrder: "",
  };

  const normalizeUnit = (value: unknown) => String(value ?? "").trim();

  const buildPrefilledUnitRowsFromSource = ({
    units,
    pestData,
    flaggedFollowUps,
    workOrders,
  }: {
    units: string[];
    pestData?: Record<string, { findings?: string; pest_activity?: string; products_used?: string }>;
    flaggedFollowUps?: string[];
    workOrders?: Record<string, string>;
  }) => {
    if (!Array.isArray(units) || units.length === 0) {
      return [{ ...emptyUnit }];
    }

    return units.map((unitNumber) => {
      const unitKey = normalizeUnit(unitNumber);
      const details = pestData?.[unitKey] || pestData?.[unitNumber] || {};
      const isFollowUp = Array.isArray(flaggedFollowUps) && flaggedFollowUps.some((unit) => normalizeUnit(unit) === unitKey);
      const originalWO = workOrders?.[unitKey] || workOrders?.[unitNumber] || "";

      return {
        unit: unitKey,
        // For follow-up units, do NOT prefill notes/pests/products from the
        // prior service — the tech should enter fresh observations. The prior
        // service notes are still visible in the unit history section.
        targetPests: isFollowUp ? "" : (details.pest_activity && details.pest_activity !== "None" ? details.pest_activity : ""),
        notes: isFollowUp ? "" : (details.findings || ""),
        areasTreated: "",
        productsUsed: isFollowUp ? "" : (details.products_used || ""),
        followUp: isFollowUp ? "Yes" : "No",
        followUpNotes: "",
        status: "To Be Treated",
        activityLevel: "",
        flags: "",
        originalWorkOrder: originalWO,
      };
    });
  };

  const buildInitialPrefilledUnitRows = () =>
    buildPrefilledUnitRowsFromSource({
      units: Array.isArray(prePopulatedUnits) ? prePopulatedUnits : [],
      pestData: recentPestData,
      flaggedFollowUps: Array.isArray(followUpUnits) ? followUpUnits : [],
    });

  const [isSaving, setIsSaving] = useState(false);
  const [techDropdownOpen, setTechDropdownOpen] = useState(false);

  // Form state
  const [technicianName, setTechnicianName] = useState(serviceData?.technician || "");
  const [licenseNumber, setLicenseNumber] = useState("");
  const [serviceDate, setServiceDate] = useState(serviceData?.service_date || new Date().toISOString().split("T")[0]);
  const [timeIn, setTimeIn] = useState("");
  const [timeOut, setTimeOut] = useState("");
  // Appointment-level outcome (separate from per-unit status)
  const [appointmentService, setAppointmentService] = useState<string>(serviceData?.appointment_service || "");
  const [targetPests, setTargetPests] = useState<string[]>([PEST_OPTIONS[0]]);
  const [productsUsed, setProductsUsed] = useState<string[]>(
    Array.isArray(serviceData?.products_used) ? serviceData.products_used : []
  );
  // Commercial path uses the structured ProductUsageEditor (with amounts/dilution),
  // mirroring the apartment service-date table format.
  const [commercialProducts, setCommercialProducts] = useState<ProductUsage[]>(
    normalizeUsageList(serviceData?.products_used)
  );
  const [equipment, setEquipment] = useState<string[]>(Array.isArray(propertyEquipment) ? propertyEquipment : []);
  const [customerKeyAreas, setCustomerKeyAreas] = useState<string[]>([]);
  const [customerKeyAreasNotes, setCustomerKeyAreasNotes] = useState("");
  const [todaysFindings, setTodaysFindings] = useState(serviceData?.findings || "");
  const [customerPreference, setCustomerPreference] = useState(initPref || "");
  const [customerPreferenceNotes, setCustomerPreferenceNotes] = useState(initPrefNotes || "");
  const [propertyImages, setPropertyImages] = useState<Array<{ image: string; caption?: string }>>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [annotatingImageIndex, setAnnotatingImageIndex] = useState<number | null>(null);

  // Commercial-specific simplified state
  const [isCommercial, setIsCommercial] = useState(false);
  const [serviceNotes, setServiceNotes] = useState("");
  const [concerns, setConcerns] = useState<string[]>([]);
  const [otherConcerns, setOtherConcerns] = useState("");
  const toggleConcern = (c: string) =>
    setConcerns(prev => prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c]);

  // Unit overview table
  const [unitRows, setUnitRows] = useState<UnitRow[]>(() => buildInitialPrefilledUnitRows());
  const [commonAreaPests, setCommonAreaPests] = useState("");
  const [commonAreaNotes, setCommonAreaNotes] = useState("");
  const [techObservations, setTechObservations] = useState("");

  // Property map - persistent per property
  const [propertyId, setPropertyId] = useState<string | null>(initPropertyId || null);
  const [propertyName, setPropertyName] = useState(initPropertyName || "");
  const [mapData, setMapData] = useState<string | null>(null);
  const [mapImageUrl, setMapImageUrl] = useState<string | null>(null);
  const [renderedMapImage, setRenderedMapImage] = useState<string | null>(null);
  const [customMapImage, setCustomMapImage] = useState<string | null>(null);
  const latestMapDataRef = useRef<string | null>(null);
  const mapFileInputRef = useRef<HTMLInputElement>(null);
  const unitStatusOptions = appointmentService === "Inspection Complete" ? INSPECTION_STATUS_OPTIONS : SERVICE_STATUS_OPTIONS;

  // Load property map data (persistent across appointments)
  useEffect(() => {
    if (!propertyId) return;
    supabase.from("portal_properties").select("map_data, map_image_url, name, address, customer_preferences").eq("id", propertyId).single()
      .then(({ data }) => {
        if (data) {
          if (data.map_data) {
            try { setMapData(typeof data.map_data === "string" ? data.map_data : JSON.stringify(data.map_data)); } catch {}
          }
          if (data.map_image_url) setCustomMapImage(data.map_image_url);
          if (data.name && !propertyName) setPropertyName(data.name);
          const ptype = (data.customer_preferences as any)?.property_type;
          setIsCommercial(ptype === "commercial");
        }
      });
  }, [propertyId]);

  // Save map data back to property (persistent)
  const handleMapSave = (data: string) => {
    setMapData(data);
    latestMapDataRef.current = data;
    if (propertyId) {
      let parsed: any = null;
      try { parsed = JSON.parse(data); } catch { parsed = data; }
      supabase.from("portal_properties").update({ map_data: parsed }).eq("id", propertyId).then(() => {});
    }
  };

  const handleCustomMapUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const ext = file.name.split(".").pop();
    const path = `portal-maps/${propertyId || crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from("report-images").upload(path, file, { contentType: file.type, upsert: true });
    if (error) { toast.error("Upload failed"); return; }
    const { data: pub } = supabase.storage.from("report-images").getPublicUrl(path);
    const url = pub.publicUrl;
    setCustomMapImage(url);
    if (propertyId) {
      await supabase.from("portal_properties").update({ map_image_url: url }).eq("id", propertyId);
    }
    toast.success("Map image uploaded");
  };

  // Auto-set license when technician changes
  const handleTechnicianChange = (name: string) => {
    setTechnicianName(name);
    const tech = TECHNICIANS.find(t => t.name === name);
    if (tech) setLicenseNumber(tech.license);
    setTechDropdownOpen(false);
  };

  const togglePest = (pest: string) => setTargetPests(prev => prev.includes(pest) ? prev.filter(p => p !== pest) : [...prev, pest]);
  const toggleProduct = (product: string) => setProductsUsed(prev => prev.includes(product) ? prev.filter(p => p !== product) : [...prev, product]);
  const toggleEquipment = (item: string) => setEquipment(prev => prev.includes(item) ? prev.filter(e => e !== item) : [...prev, item]);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    for (const file of Array.from(files)) {
      const reader = new FileReader();
      reader.onload = () => setPropertyImages(prev => [...prev, { image: reader.result as string }]);
      reader.readAsDataURL(file);
    }
  };

  const saveReport = async () => {
    if (!serviceId) return;
    setIsSaving(true);
    const reportData = {
      technician_name: technicianName, license_number: licenseNumber, service_date: serviceDate,
      time_in: timeIn, time_out: timeOut,
      target_pests: targetPests, products_used: productsUsed, equipment,
      customer_key_areas: { areas: customerKeyAreas, notes: customerKeyAreasNotes },
      todays_findings: todaysFindings,
      customer_preference: customerPreference, customer_preference_notes: customerPreferenceNotes,
      property_images: propertyImages, unit_rows: unitRows,
      common_area_pests: commonAreaPests, common_area_notes: commonAreaNotes,
      tech_observations: techObservations,
      appointment_service: appointmentService,
      service_notes: serviceNotes,
      concerns,
      other_concerns: otherConcerns,
    };
    const productsToSave: any = isCommercial ? commercialProducts : productsUsed;
    const { error } = await supabase.from("portal_services").update({
      report_data: reportData as any, technician: technicianName, service_date: serviceDate,
      products_used: productsToSave, findings: todaysFindings || null,
      appointment_service: appointmentService || null,
    }).eq("id", serviceId);
    if (error) toast.error("Failed to save report");
    else toast.success("Appointment Report saved!");
    setIsSaving(false);
  };

  // Load existing report data
  useEffect(() => {
    if (!serviceId) return;

    const loadReport = async () => {
      const { data } = await supabase.from("portal_services").select("*").eq("id", serviceId).single();
      if (!data) return;

      if (data.property_id && !propertyId) setPropertyId(data.property_id);

      let prefilledRows = buildInitialPrefilledUnitRows();
      const hasRealPrefill = prefilledRows.some((row) => normalizeUnit(row.unit));

      if (!hasRealPrefill && data.property_id) {
        const [{ data: recentCompleted }, { data: pendingReqs }, { data: allReqs }] = await Promise.all([
          supabase
            .from("portal_services")
            .select("unit_details")
            .eq("property_id", data.property_id)
            .eq("status", "completed")
            .order("service_date", { ascending: false })
            .limit(1)
            .maybeSingle(),
          supabase
            .from("portal_requests")
            .select("unit_number, pest_type, location_type, description")
            .eq("property_id", data.property_id)
            .in("status", ["pending", "in_progress"]),
          supabase
            .from("portal_requests")
            .select("unit_number, pest_type, location_type, description, created_at")
            .eq("property_id", data.property_id)
            .order("created_at", { ascending: true }),
        ]);

        const unitsPlanned = Array.isArray(data.units_planned) ? (data.units_planned as string[]) : [];
        const followUps: string[] = [];
        const pestData: Record<string, { findings?: string; pest_activity?: string; products_used?: string }> = {};
        // Earliest portal_request per unit = the ORIGINAL work order. Persists
        // across however many follow-ups occur so the tech always sees the
        // request that started this chain of visits.
        const workOrders: Record<string, string> = {};
        (allReqs || []).forEach((request: any) => {
          const unitNumber = normalizeUnit(request?.unit_number);
          if (!unitNumber || workOrders[unitNumber]) return;
          const context = [request.pest_type, request.location_type, request.description].filter(Boolean).join(" - ");
          if (context) workOrders[unitNumber] = context;
        });

        const details = Array.isArray(recentCompleted?.unit_details) ? (recentCompleted.unit_details as any[]) : [];
        details.forEach((unit: any) => {
          const unitNumber = normalizeUnit(unit?.unit_number);
          if (!unitNumber) return;

          pestData[unitNumber] = {
            findings: unit.findings || "",
            pest_activity: unit.pest_activity || "",
            products_used: unit.products_used || "",
          };

          // Follow-up must be explicitly checked on the prior service. Status
          // text alone must never roll a unit into a future service.
          if (unit.follow_up_needed === true) {
            followUps.push(unitNumber);
          }
        });

        (pendingReqs || []).forEach((request: any) => {
          const unitNumber = normalizeUnit(request?.unit_number);
          if (!unitNumber) return;

          const existing = pestData[unitNumber] || {};
          const workOrderContext = [request.pest_type, request.location_type, request.description].filter(Boolean).join(" - ");
          pestData[unitNumber] = {
            findings: existing.findings
              ? `${existing.findings}\nWork Order: ${workOrderContext}`
              : `Work Order: ${workOrderContext}`,
            pest_activity: existing.pest_activity || request.pest_type || "",
            products_used: existing.products_used || "",
          };
        });

        const mergedUnits = Array.from(new Set([...unitsPlanned, ...followUps]))
          .map((unit) => normalizeUnit(unit))
          .filter(Boolean)
          .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

        prefilledRows = buildPrefilledUnitRowsFromSource({
          units: mergedUnits,
          pestData,
          flaggedFollowUps: followUps,
          workOrders,
        });
      }

      if (data.report_data && typeof data.report_data === "object") {
        const rd = data.report_data as any;
        if (rd.technician_name) setTechnicianName(rd.technician_name);
        if (rd.license_number) setLicenseNumber(rd.license_number);
        if (rd.service_date) setServiceDate(rd.service_date);
        if (rd.target_pests) setTargetPests(rd.target_pests);
        if (rd.products_used) {
          setProductsUsed(Array.isArray(rd.products_used)
            ? rd.products_used.map((p: any) => typeof p === "string" ? p : p?.name).filter(Boolean)
            : []);
          setCommercialProducts(normalizeUsageList(rd.products_used));
        }
        if (rd.equipment) setEquipment(rd.equipment);
        if (rd.customer_key_areas) {
          setCustomerKeyAreas(rd.customer_key_areas.areas || []);
          setCustomerKeyAreasNotes(rd.customer_key_areas.notes || "");
        }
        if (rd.todays_findings) setTodaysFindings(rd.todays_findings);
        if (rd.customer_preference) setCustomerPreference(rd.customer_preference);
        if (rd.customer_preference_notes) setCustomerPreferenceNotes(rd.customer_preference_notes);
        if (rd.property_images) setPropertyImages(rd.property_images);
        if (rd.unit_rows && Array.isArray(rd.unit_rows)) {
          const existingRows = rd.unit_rows as UnitRow[];
          const existingUnits = new Set(existingRows.map((row) => normalizeUnit(row.unit)).filter(Boolean));
          const mergedRows = [
            ...existingRows.map((row) => {
              const matchingPrefill = prefilledRows.find((prefill) => normalizeUnit(prefill.unit) === normalizeUnit(row.unit));
              return matchingPrefill
                ? {
                    ...matchingPrefill,
                    ...row,
                    targetPests: row.targetPests || matchingPrefill.targetPests,
                    notes: row.notes || matchingPrefill.notes,
                    productsUsed: row.productsUsed || matchingPrefill.productsUsed,
                    followUp: matchingPrefill.followUp === "Yes" ? "Yes" : (row.followUp || "No"),
                    followUpNotes: row.followUpNotes || matchingPrefill.followUpNotes,
                    // Always prefer the freshly-resolved original work order
                    // so chains of follow-ups keep showing the request that
                    // started them, even after the row has been saved.
                    originalWorkOrder: matchingPrefill.originalWorkOrder || row.originalWorkOrder || "",
                  }
                : row;
            }),
            ...prefilledRows.filter((prefill) => !existingUnits.has(normalizeUnit(prefill.unit))),
          ];
          setUnitRows(mergedRows.length > 0 ? mergedRows : prefilledRows);
        } else {
          setUnitRows(prefilledRows);
        }
        if (rd.common_area_pests) setCommonAreaPests(rd.common_area_pests);
        if (rd.common_area_notes) setCommonAreaNotes(rd.common_area_notes);
        if (rd.tech_observations) setTechObservations(rd.tech_observations);
        if (rd.time_in) setTimeIn(rd.time_in);
        if (rd.time_out) setTimeOut(rd.time_out);
        if (rd.appointment_service) setAppointmentService(rd.appointment_service);
        if (rd.service_notes) setServiceNotes(rd.service_notes);
        if (Array.isArray(rd.concerns)) setConcerns(rd.concerns);
        if (rd.other_concerns) setOtherConcerns(rd.other_concerns);
      } else {
        setUnitRows(prefilledRows);
        if (data.technician) setTechnicianName(data.technician);
        if (data.service_date) setServiceDate(data.service_date);
        if (data.products_used) {
          const arr = Array.isArray(data.products_used) ? data.products_used as any[] : [];
          setProductsUsed(arr.map((p: any) => typeof p === "string" ? p : p?.name).filter(Boolean));
          setCommercialProducts(normalizeUsageList(data.products_used));
        }
        if (data.findings) setTodaysFindings(data.findings);
      }
      if ((data as any).appointment_service && !appointmentService) {
        setAppointmentService((data as any).appointment_service);
      }
    };

    void loadReport();
  }, [serviceId]);

  const reportTitle = serviceDate
    ? `${new Date(serviceDate + "T00:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })} Appointment Report`
    : "Appointment Report";

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-gradient-to-r from-sage/40 via-sage/15 to-sage/35 shadow-md border-b-2 border-dark-sage px-4 py-2 sticky top-0 z-10">
        <div className="max-w-[1800px] mx-auto flex items-center gap-3">
          <img src={crestLogo} alt="Crest" className="h-10" />
          <div className="flex-1">
            <h1 className="text-lg font-bold">{reportTitle}</h1>
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              {propertyName && <span>{propertyName}</span>}
              {clientName && <span>— {clientName}</span>}
            </div>
          </div>
          <div className="flex gap-1.5">
            <Button onClick={saveReport} disabled={isSaving} size="sm" className="h-7 px-2 text-xs">
              {isSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3 mr-1" />}Save
            </Button>
            <Button onClick={() => {
              // Store property ID so portal admin re-selects it
              if (initPropertyId) sessionStorage.setItem("portal-admin-selected-property", initPropertyId);
              navigate(returnTo || "/portal-admin");
            }} variant="outline" size="sm" className="h-7 px-2 text-xs">
              <ArrowLeft className="w-3 h-3 mr-1" />Back
            </Button>
          </div>
        </div>
      </div>

      {/* Main content: Map on left, form on right — like InitialPestReport */}
      <div className={`${isMobileOrTablet ? "flex flex-col" : "flex min-h-[calc(100vh-52px)]"}`}>
        {/* Map Section */}
        <div
          className={`${isMobileOrTablet ? "w-full max-w-[506px] mx-auto px-4 py-2" : "flex-none p-4"}`}
          style={!isMobileOrTablet ? { width: 'min(130mm, calc((100vh - 52px) * 0.75))', maxWidth: '42%' } : undefined}
        >
          <div className="relative w-full bg-muted rounded-lg" style={{ paddingBottom: "133%" }}>
            <div className="absolute inset-0">
              {customMapImage ? (
                <div className="relative h-full w-full">
                  <MapCanvas
                    key={`map-${customMapImage}`}
                    mapUrl={customMapImage}
                    onSave={handleMapSave}
                    onExportImage={setRenderedMapImage}
                    initialData={mapData}
                  />
                  <div className="absolute top-3 right-3 z-20">
                    <div className="relative inline-flex">
                      <Button size="sm" variant="secondary" type="button">
                        <FileDown className="w-4 h-4 mr-1" />Replace Map
                      </Button>
                      <input type="file" accept="image/*" className="absolute inset-0 h-full w-full cursor-pointer opacity-0" onChange={handleCustomMapUpload} />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                  <p className="text-sm font-medium mb-2">No property map</p>
                  <p className="text-xs mb-3 text-center px-4">Upload a satellite/aerial image to annotate pest concerns for this property</p>
                  <div className="relative inline-flex">
                    <Button size="sm" variant="outline">Upload Map Image</Button>
                    <input type="file" accept="image/*" className="absolute inset-0 h-full w-full cursor-pointer opacity-0" onChange={handleCustomMapUpload} />
                  </div>
                </div>
              )}
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-2 text-center">This map is shared across all appointments for this property</p>
        </div>

        {/* Right column - form content */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-3xl px-4 py-4 space-y-4">
            {/* Technician & Date */}
            <Card className="p-4 space-y-3">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <div>
                  <Label>Technician</Label>
                  <Popover open={techDropdownOpen} onOpenChange={setTechDropdownOpen}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
                        {technicianName || "Select technician"}
                        <ChevronsUpDown className="ml-2 h-4 w-4 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-full p-0">
                      <Command>
                        <CommandInput placeholder="Search..." />
                        <CommandList>
                          <CommandEmpty>No match.</CommandEmpty>
                          <CommandGroup>
                            {TECHNICIANS.map(t => (
                              <CommandItem key={t.name} value={t.name} onSelect={() => handleTechnicianChange(t.name)}>
                                <Check className={cn("mr-2 h-4 w-4", technicianName === t.name ? "opacity-100" : "opacity-0")} />
                                {t.name}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>
                <div>
                  <Label>License #</Label>
                  <Input value={licenseNumber} onChange={e => setLicenseNumber(e.target.value)} />
                </div>
                <div>
                  <Label>Service Date</Label>
                  <Input type="date" value={serviceDate} onChange={e => setServiceDate(e.target.value)} />
                </div>
                <div>
                  <Label>Time In</Label>
                  <Input type="time" value={timeIn} onChange={e => setTimeIn(e.target.value)} />
                </div>
                <div>
                  <Label>Time Out</Label>
                  <Input type="time" value={timeOut} onChange={e => setTimeOut(e.target.value)} />
                </div>
              </div>
            </Card>

            {/* ─── Commercial: simplified single-location form ─── */}
            {isCommercial && (
              <Card className="p-5 space-y-5 border-2 border-primary/30 bg-gradient-to-br from-primary/[0.04] to-transparent shadow-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.15em] font-bold text-primary/80">Commercial Service Visit</p>
                    <h2 className="text-xl font-bold tracking-tight">Service Notes & Conditions</h2>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Service Notes</Label>
                  <Textarea
                    value={serviceNotes}
                    onChange={e => setServiceNotes(e.target.value)}
                    placeholder="What was inspected and treated, areas of focus, recommendations for management…"
                    rows={6}
                    className="text-sm leading-relaxed resize-y"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Active Conditions</Label>
                  <div className="flex flex-wrap gap-2">
                    {COMMERCIAL_CONCERNS.map(c => {
                      const active = concerns.includes(c);
                      return (
                        <button
                          type="button"
                          key={c}
                          onClick={() => toggleConcern(c)}
                          className={cn(
                            "px-3.5 h-10 rounded-full text-sm font-medium border-2 transition-all",
                            active
                              ? "bg-primary text-primary-foreground border-primary shadow-sm"
                              : "bg-background text-foreground border-border hover:border-primary/50"
                          )}
                        >
                          {active ? "✓ " : ""}{c}
                        </button>
                      );
                    })}
                  </div>
                  <Textarea
                    value={otherConcerns}
                    onChange={e => setOtherConcerns(e.target.value)}
                    placeholder="Other concerns or details to flag for the office…"
                    rows={2}
                    className="text-sm mt-1"
                  />
                </div>

                {/* Products Used (commercial) */}
                <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Products Used</Label>
                  <p className="text-[10px] text-muted-foreground -mt-1">
                    Add each product applied today with the diluted amount; concentrate auto-calculates for standard products.
                  </p>
                  <ProductUsageEditor value={commercialProducts} onChange={setCommercialProducts} />
                </div>

                {/* Equipment (commercial) */}
                <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Equipment Used</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {EQUIPMENT_OPTIONS.map(eq => (
                      <Badge
                        key={eq}
                        variant={equipment.includes(eq) ? "default" : "outline"}
                        className="cursor-pointer text-xs h-8 px-3"
                        onClick={() => toggleEquipment(eq)}
                      >
                        {eq}
                      </Badge>
                    ))}
                  </div>
                </div>

                {/* Target Pests (commercial) */}
                <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Target Pests</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full justify-between font-normal h-11 text-sm">
                        <span className="text-left line-clamp-1 flex-1">
                          {targetPests.length > 0 ? targetPests.map(p => p.length > 40 ? "General Pests" : p).join(", ") : "Select pests…"}
                        </span>
                        <ChevronsUpDown className="ml-2 h-4 w-4 opacity-50 shrink-0" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-72 p-0" align="start">
                      <Command>
                        <CommandInput placeholder="Search pests..." />
                        <CommandList className="max-h-64">
                          <CommandEmpty>No match.</CommandEmpty>
                          <CommandGroup>
                            {PEST_OPTIONS.map(pest => (
                              <CommandItem key={pest} value={pest} onSelect={() => togglePest(pest)}>
                                <Check className={cn("mr-2 h-4 w-4", targetPests.includes(pest) ? "opacity-100" : "opacity-0")} />
                                {pest.length > 40 ? "General Pests" : pest}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>
              </Card>
            )}

            {/* Property & Service Overview (apartments / HOA only) */}
            {!isCommercial && (
            <Card className="p-4 space-y-4">
              <Label className="font-semibold text-base">Property & Service Overview</Label>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-muted-foreground">Property Name:</span> <span className="font-medium">{propertyName || "—"}</span></div>
                <div><span className="text-muted-foreground">Service Date:</span> <span className="font-medium">{serviceDate || "—"}</span></div>
                <div><span className="text-muted-foreground">Property Address:</span> <span className="font-medium">{propertyAddress || "—"}</span></div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end pt-1 border-t">
                <div className="md:col-span-1">
                  <Label className="text-xs">Service (this appointment)</Label>
                  <Select value={appointmentService || "__none"} onValueChange={(v) => setAppointmentService(v === "__none" ? "" : v)}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select outcome" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">—</SelectItem>
                      <SelectItem value="Inspection Complete">Inspection Complete</SelectItem>
                      <SelectItem value="Service Complete">Service Complete</SelectItem>
                      <SelectItem value="Not Serviced">Not Serviced</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <p className="md:col-span-2 text-[11px] text-muted-foreground italic">
                  Inspection statuses switch to Activity Found - Follow Up / Free and Clear*. Service statuses switch to Treated - Complete / Treated - Follow Up.
                </p>
              </div>

              {/* Unit Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse min-w-[1400px]">
                  <thead>
                    <tr className="bg-muted">
                      <th className="border p-2 text-left w-10 text-xs font-semibold whitespace-normal">#</th>
                      <th className="border p-2 text-left w-20 text-xs font-semibold whitespace-normal">Unit</th>
                      <th className="border p-2 text-left w-[140px] text-xs font-semibold whitespace-normal">Target Pests</th>
                      <th className="border p-2 text-left text-xs font-semibold whitespace-normal min-w-[220px]">Findings or Services Completed</th>
                      <th className="border p-2 text-left text-xs font-semibold whitespace-normal min-w-[160px]">Areas Treated</th>
                      <th className="border p-2 text-left w-[160px] text-xs font-semibold whitespace-normal">Products Used</th>
                      <th className="border p-2 text-left w-28 text-xs font-semibold whitespace-normal">Activity Level</th>
                      <th className="border p-2 text-left w-[160px] text-xs font-semibold whitespace-normal">Flags</th>
                      <th className="border p-2 text-left w-40 text-xs font-semibold whitespace-normal">Status</th>
                      <th className="border p-2 w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {unitRows.map((row, i) => (
                      <tr key={i} className="align-top">
                        <td className="border p-1.5 text-center text-muted-foreground text-xs">{i + 1}</td>
                        <td className="border p-1"><Input value={row.unit} onChange={e => setUnitRows(prev => prev.map((r, j) => j === i ? { ...r, unit: e.target.value } : r))} className="h-8 text-sm border-0 px-1.5" placeholder="Unit" /></td>
                        <td className="border p-0.5">
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button variant="ghost" className="h-auto min-h-[3rem] py-1.5 text-xs w-full justify-start px-1.5 font-normal whitespace-normal text-left leading-snug">
                                {row.targetPests || <span className="text-muted-foreground">Select...</span>}
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-56 p-0" align="start">
                              <Command>
                                <CommandInput placeholder="Search pests..." />
                                <CommandList className="max-h-48">
                                  <CommandGroup>
                                    {UNIT_PEST_OPTIONS.map(pest => {
                                      const selected = (row.targetPests || "").split(", ").filter(Boolean);
                                      const isSelected = selected.includes(pest);
                                      return (
                                        <CommandItem key={pest} value={pest} onSelect={() => {
                                          const current = (row.targetPests || "").split(", ").filter(Boolean);
                                          const next = isSelected ? current.filter(p => p !== pest) : [...current, pest];
                                          setUnitRows(prev => prev.map((r, j) => j === i ? { ...r, targetPests: next.join(", ") } : r));
                                        }}>
                                          <Check className={cn("mr-2 h-3 w-3", isSelected ? "opacity-100" : "opacity-0")} />
                                          {pest}
                                        </CommandItem>
                                      );
                                    })}
                                  </CommandGroup>
                                </CommandList>
                              </Command>
                            </PopoverContent>
                          </Popover>
                        </td>
                        <td className="border p-0.5">
                          {row.originalWorkOrder && (
                            <div className="mx-1.5 mt-1 mb-1 rounded border border-amber-300 bg-amber-50 px-2 py-1 text-[10px] leading-snug text-amber-900">
                              <span className="font-semibold">Original Work Order:</span> {row.originalWorkOrder}
                            </div>
                          )}
                          <Textarea
                            value={row.notes}
                            onChange={e => setUnitRows(prev => prev.map((r, j) => j === i ? { ...r, notes: e.target.value } : r))}
                            className="text-xs border-0 px-1.5 py-1.5 min-h-[3.5rem] resize-y leading-snug"
                            rows={3}
                            placeholder="Findings or services completed..."
                          />
                        </td>
                        <td className="border p-0.5">
                          <Textarea
                            value={row.areasTreated}
                            onChange={e => setUnitRows(prev => prev.map((r, j) => j === i ? { ...r, areasTreated: e.target.value } : r))}
                            className="text-xs border-0 px-1.5 py-1.5 min-h-[3.5rem] resize-y leading-snug"
                            rows={3}
                          />
                        </td>
                        <td className="border p-0.5">
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button variant="ghost" className="h-auto min-h-[3rem] py-1.5 text-xs w-full justify-start px-1.5 font-normal whitespace-normal text-left leading-snug">
                                {row.productsUsed || <span className="text-muted-foreground">Select...</span>}
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-56 p-0" align="start">
                              <Command>
                                <CommandInput placeholder="Search products..." />
                                <CommandList className="max-h-48">
                                  <CommandGroup>
                                    {PRODUCT_OPTIONS.map(prod => {
                                      const selected = (row.productsUsed || "").split(", ").filter(Boolean);
                                      const isSelected = selected.includes(prod);
                                      return (
                                        <CommandItem key={prod} value={prod} onSelect={() => {
                                          const current = (row.productsUsed || "").split(", ").filter(Boolean);
                                          const next = isSelected ? current.filter(p => p !== prod) : [...current, prod];
                                          setUnitRows(prev => prev.map((r, j) => j === i ? { ...r, productsUsed: next.join(", ") } : r));
                                        }}>
                                          <Check className={cn("mr-2 h-3 w-3", isSelected ? "opacity-100" : "opacity-0")} />
                                          {prod}
                                        </CommandItem>
                                      );
                                    })}
                                  </CommandGroup>
                                </CommandList>
                              </Command>
                            </PopoverContent>
                          </Popover>
                        </td>
                        <td className="border p-0.5">
                          <Select value={row.activityLevel || "__none"} onValueChange={v => setUnitRows(prev => prev.map((r, j) => j === i ? { ...r, activityLevel: v === "__none" ? "" : v } : r))}>
                            <SelectTrigger className="h-9 text-xs border-0 px-1.5"><SelectValue placeholder="—" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none">—</SelectItem>
                              <SelectItem value="Low">Low</SelectItem>
                              <SelectItem value="Medium">Medium</SelectItem>
                              <SelectItem value="High">High</SelectItem>
                              <SelectItem value="Very High">Very High</SelectItem>
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="border p-0.5">
                          <Textarea
                            value={row.flags}
                            onChange={e => setUnitRows(prev => prev.map((r, j) => j === i ? { ...r, flags: e.target.value } : r))}
                            className="text-xs border-0 px-1.5 py-1.5 min-h-[3.5rem] resize-y leading-snug"
                            rows={3}
                            placeholder="e.g. Sanitation concerns"
                          />
                        </td>
                        <td className="border p-0.5">
                          <Select
                            value={row.status || unitStatusOptions[0]}
                            onValueChange={v => setUnitRows(prev => prev.map((r, j) => j === i ? {
                              ...r,
                              status: v,
                              followUp: r.followUp,
                            } : r))}
                          >
                            <SelectTrigger className="h-9 text-xs border-0 px-1.5"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {unitStatusOptions.map((status) => (
                                <SelectItem key={status} value={status}>{status}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="border p-0.5 text-center">
                          {unitRows.length > 1 && <button className="text-destructive text-xs" onClick={() => setUnitRows(prev => prev.filter((_, j) => j !== i))}>×</button>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <Button variant="outline" size="sm" className="mt-2" onClick={() => setUnitRows(prev => [...prev, { ...emptyUnit }])}>
                  <Plus className="w-3 h-3 mr-1" />Add Unit
                </Button>
              </div>

              {/* Common Area */}
              <div className="border-t pt-3 space-y-2">
                <p className="text-sm font-medium">Common Area Pest</p>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">Target Pests</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className="w-full justify-between font-normal h-7 text-xs">
                          <span className="truncate flex-1 text-left">{commonAreaPests || "Select pests..."}</span>
                          <ChevronsUpDown className="ml-1 h-3 w-3 opacity-50 shrink-0" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-56 p-0" align="start">
                        <Command>
                          <CommandInput placeholder="Search pests..." />
                          <CommandList className="max-h-48">
                            <CommandGroup>
                              {UNIT_PEST_OPTIONS.map(pest => {
                                const selected = (commonAreaPests || "").split(", ").filter(Boolean);
                                const isSelected = selected.includes(pest);
                                return (
                                  <CommandItem key={pest} value={pest} onSelect={() => {
                                    const current = (commonAreaPests || "").split(", ").filter(Boolean);
                                    const next = isSelected ? current.filter(p => p !== pest) : [...current, pest];
                                    setCommonAreaPests(next.join(", "));
                                  }}>
                                    <Check className={cn("mr-2 h-3 w-3", isSelected ? "opacity-100" : "opacity-0")} />
                                    {pest}
                                  </CommandItem>
                                );
                              })}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div><Label className="text-xs">Notes</Label><Input value={commonAreaNotes} onChange={e => setCommonAreaNotes(e.target.value)} className="h-7 text-xs" /></div>
                </div>
              </div>

              {/* Technician Observations */}
              <div className="border-t pt-3 space-y-2">
                <p className="text-sm font-medium">Crest Technician: Observations & Notes</p>
                <Textarea value={techObservations} onChange={e => setTechObservations(e.target.value)} placeholder="Technician observations and notes..." rows={3} className="text-xs" />
              </div>

              <p className="text-xs text-muted-foreground italic">Note: See full service report for details on pesticide usage and observations for exterior and common areas.</p>
            </Card>
            )}

            {/* Selections: Pests, Products, Equipment, Customer Info (apartments / HOA only) */}
            {!isCommercial && (
            <Card className="p-4 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Target Pests */}
                <div className="space-y-1.5">
                  <Label className="font-semibold text-sm">Target Pests</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full justify-between font-normal h-auto min-h-[36px] text-xs">
                        <span className="text-left line-clamp-2 flex-1">
                          {targetPests.length > 0 ? targetPests.map(p => p.length > 40 ? "General Pests" : p).join(", ") : "Select pests..."}
                        </span>
                        <ChevronsUpDown className="ml-2 h-3.5 w-3.5 opacity-50 shrink-0" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-72 p-0" align="start">
                      <Command>
                        <CommandInput placeholder="Search pests..." />
                        <CommandList className="max-h-56">
                          <CommandEmpty>No match.</CommandEmpty>
                          <CommandGroup>
                            {PEST_OPTIONS.map(pest => (
                              <CommandItem key={pest} value={pest} onSelect={() => togglePest(pest)}>
                                <Check className={cn("mr-2 h-3.5 w-3.5", targetPests.includes(pest) ? "opacity-100" : "opacity-0")} />
                                {pest.length > 40 ? "General Pests" : pest}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  {targetPests.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {targetPests.map(p => (
                        <Badge key={p} variant="default" className="text-[10px] cursor-pointer" onClick={() => togglePest(p)}>
                          {p.length > 40 ? "General Pests" : p} ×
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>

                {/* Products Used */}
                <div className="space-y-1.5">
                  <Label className="font-semibold text-sm">Products Used</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full justify-between font-normal h-auto min-h-[36px] text-xs">
                        <span className="text-left line-clamp-2 flex-1">
                          {productsUsed.length > 0 ? productsUsed.join(", ") : "Select products..."}
                        </span>
                        <ChevronsUpDown className="ml-2 h-3.5 w-3.5 opacity-50 shrink-0" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-72 p-0" align="start">
                      <Command>
                        <CommandInput placeholder="Search products..." />
                        <CommandList className="max-h-56">
                          <CommandEmpty>No match.</CommandEmpty>
                          <CommandGroup>
                            {PRODUCT_OPTIONS.map(p => (
                              <CommandItem key={p} value={p} onSelect={() => toggleProduct(p)}>
                                <Check className={cn("mr-2 h-3.5 w-3.5", productsUsed.includes(p) ? "opacity-100" : "opacity-0")} />
                                {p}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  {productsUsed.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {productsUsed.map(p => (
                        <Badge key={p} variant="default" className="text-[10px] cursor-pointer" onClick={() => toggleProduct(p)}>
                          {p} ×
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>

                {/* Equipment */}
                <div className="space-y-1.5">
                  <Label className="font-semibold text-sm">Equipment</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full justify-between font-normal h-auto min-h-[36px] text-xs">
                        <span className="text-left line-clamp-2 flex-1">
                          {equipment.length > 0 ? equipment.join(", ") : "Select equipment..."}
                        </span>
                        <ChevronsUpDown className="ml-2 h-3.5 w-3.5 opacity-50 shrink-0" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-72 p-0" align="start">
                      <Command>
                        <CommandList>
                          <CommandGroup>
                            {EQUIPMENT_OPTIONS.map(eq => (
                              <CommandItem key={eq} value={eq} onSelect={() => toggleEquipment(eq)}>
                                <Check className={cn("mr-2 h-3.5 w-3.5", equipment.includes(eq) ? "opacity-100" : "opacity-0")} />
                                {eq}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  {equipment.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {equipment.map(eq => (
                        <Badge key={eq} variant="default" className="text-[10px] cursor-pointer" onClick={() => toggleEquipment(eq)}>
                          {eq} ×
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>

                {/* Customer Preference */}
                <div className="space-y-1.5">
                  <Label className="font-semibold text-sm">Customer Preference</Label>
                  <Select value={customerPreference} onValueChange={setCustomerPreference}>
                    <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Select preference" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Interior & Exterior">Interior & Exterior</SelectItem>
                      <SelectItem value="Exterior Only">Exterior Only</SelectItem>
                      <SelectItem value="Interior Only">Interior Only</SelectItem>
                    </SelectContent>
                  </Select>
                  <Textarea placeholder="Additional notes..." value={customerPreferenceNotes} onChange={e => setCustomerPreferenceNotes(e.target.value)} rows={2} className="text-xs" />
                </div>
              </div>

              {/* Customer Key Areas */}
              <div className="border-t pt-3 space-y-2">
                <Label className="font-semibold text-sm">Customer Key Areas of Concern</Label>
                <div className="flex flex-wrap gap-1.5">
                  {CUSTOMER_KEY_AREAS.map(area => (
                    <Badge key={area} variant={customerKeyAreas.includes(area) ? "default" : "outline"} className="cursor-pointer text-xs"
                      onClick={() => setCustomerKeyAreas(prev => prev.includes(area) ? prev.filter(a => a !== area) : [...prev, area])}>{area}</Badge>
                  ))}
                </div>
                <Textarea placeholder="Notes about key areas..." value={customerKeyAreasNotes} onChange={e => setCustomerKeyAreasNotes(e.target.value)} rows={2} className="text-xs" />
              </div>
            </Card>
            )}

            {!isCommercial && (
              <Card className="p-4 space-y-2">
                <Label className="font-semibold">Summary of Resident and Common Area Services</Label>
                <Textarea placeholder="What was found during today's service..." value={todaysFindings} onChange={e => setTodaysFindings(e.target.value)} rows={4} />
              </Card>
            )}


            {/* Property Images */}
            <Card className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <Label className="font-semibold">Property Images</Label>
                <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>Add Photo</Button>
                <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleImageUpload} />
              </div>
              {propertyImages.length > 0 && (
                <div className="grid grid-cols-2 gap-2">
                  {propertyImages.map((img, i) => (
                    <div key={i} className="relative">
                      <img src={img.image} alt={img.caption || `Photo ${i + 1}`} className="w-full h-32 object-cover rounded cursor-pointer" onClick={() => setAnnotatingImageIndex(i)} />
                      <button className="absolute top-1 right-1 bg-destructive text-destructive-foreground rounded-full w-5 h-5 flex items-center justify-center text-xs"
                        onClick={() => setPropertyImages(prev => prev.filter((_, j) => j !== i))}>×</button>
                      <Input placeholder="Caption..." value={img.caption || ""} onChange={e => setPropertyImages(prev => prev.map((p, j) => j === i ? { ...p, caption: e.target.value } : p))} className="mt-1 text-xs h-7" />
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {/* Disclaimers — match apartment portal. The "Important Disclaimer"
                is not relevant for commercial accounts. */}
            <PesticideNotice />
            {!isCommercial && <ApartmentInspectionDisclaimer />}

            {/* Save */}
            <Button className="w-full" size="lg" onClick={saveReport} disabled={isSaving}>
              {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
              Save Appointment Report
            </Button>

            {/* Free & Clear disclaimer */}
            <p className="text-[10px] leading-snug text-muted-foreground italic px-1 pt-2 border-t">
              *Free and clear is based on our assessment at the time of inspection and does not guarantee the absence of all pests.
              Pests may reappear or migrate from neighboring units, common areas, or external sources beyond our control.
            </p>
          </div>
        </div>
      </div>

      {/* Image annotator */}
      {annotatingImageIndex !== null && (
        <InlineImageAnnotator
          imageUrl={propertyImages[annotatingImageIndex]?.image || ""}
          onSave={(annotatedUrl) => {
            setPropertyImages(prev => prev.map((p, i) => i === annotatingImageIndex ? { ...p, image: annotatedUrl } : p));
            setAnnotatingImageIndex(null);
          }}
          onCancel={() => setAnnotatingImageIndex(null)}
        />
      )}
    </div>
  );
};

export default AppointmentReport;
