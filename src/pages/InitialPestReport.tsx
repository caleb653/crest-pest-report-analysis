import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import {
  Home,
  Share2,
  Loader2,
  Send,
  FileDown,
  Plus,
  Minus,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  X,
  ChevronDown,
  Sparkles,
  Mail,
  Check,
  ChevronsUpDown,
  Edit,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { MapCanvas } from "@/components/MapCanvas";
import crestLogo from "@/assets/crest-logo.png";
import { useIsMobile, useIsTablet } from "@/hooks/use-mobile";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { inferImageUploadMeta, compressImage } from "@/lib/imageUpload";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import RichTextEditor from "@/components/RichTextEditor";
import CustomerPicker from "@/components/CustomerPicker";
import { useCurrentStaff } from "@/hooks/useCurrentStaff";
import ImageAnnotator from "@/components/ImageAnnotator";
import InlineImageAnnotator from "@/components/InlineImageAnnotator";
import { buildInitialPestReportPDF } from "@/lib/initialPestPdf";
import { autoMatchCustomerId } from "@/lib/fieldroutesAutoMatch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SALES_REPORT_DISCLAIMER_HTML } from "@/lib/rodentGuarantee";

const PROPERTY_TYPES = [
  "Residential",
  "Commercial",
  "Automotive",
  "Education",
  "Entertainment / Events",
  "Healthcare",
  "Hotel / Motel / Resort",
  "Industrial / Warehouse",
  "Mobile Home Park",
  "Multi-Unit Property",
  "Office",
  "Retail",
] as const;

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

const GENERAL_PESTS_LABEL =
  "General Pests: ants, spiders, cockroaches, earwigs, crickets, silverfish, centipedes, millipedes, wasps, fleas & ticks (outdoor only)";

const PEST_OPTIONS = [
  GENERAL_PESTS_LABEL,
  ...[
    "Ants",
    "Spiders",
    "Rodents",
    "Roaches",
    "American Roaches",
    "Wasps",
    "Bed Bugs",
    "Fleas",
    "Ticks",
    "Mosquitoes",
    "Silverfish",
    "Earwigs",
    "Crickets",
    "Centipedes",
    "Millipedes",
    "Drain Flies",
  ].sort((a, b) => a.localeCompare(b)),
  "Other",
];

// Display selected pests in the same order as the (alphabetized) picker,
// regardless of the order they were clicked. Unknown/custom pests sort last.
const pestDisplayOrder = (pests: string[]): string[] =>
  [...pests].sort((a, b) => {
    const rank = (p: string) => {
      const i = PEST_OPTIONS.indexOf(p);
      return i === -1 ? PEST_OPTIONS.length : i;
    };
    return rank(a) - rank(b);
  });

const defaultRodentPairLabel = (index: number) => `Entry Point #${index + 1}`;

const normalizeRodentPairLabels = (labels: unknown, count = 0): string[] => {
  const source = Array.isArray(labels) ? labels : [];
  const length = Math.max(count, source.length);
  return Array.from({ length }, (_, index) => {
    const raw = typeof source[index] === "string" ? source[index].trim() : "";
    return !raw || /^Pair\s*#?\s*\d+$/i.test(raw) ? defaultRodentPairLabel(index) : raw;
  });
};

// Per-pest snippet libraries. Techs tap chips to add/remove bullets; nothing
// is preselected. Keys must match entries in PEST_OPTIONS (or the General
// Pests label) so chip groups appear when that pest is selected.
const SERVICE_SNIPPETS: Record<string, string[]> = {
  [GENERAL_PESTS_LABEL]: [
    "• Inspected interior and exterior for general pest activity and entry points",
    "• Applied targeted general pest treatments to ensure a protective barrier around the home",
    "• Applied targeted general pest treatments, including organic solutions, to ensure a protective barrier around the home",
    "• De-webbed the entire home",
  ],
  Ants: ["• Inspected for ant activity and treated ant trails and entry points"],
  Spiders: [
    "• Inspected for spider activity, removed webs, and applied spider-targeted treatments",
  ],
  Roaches: [
    "• Inspected for cockroach activity and applied cockroach-targeted treatments to harborage areas",
  ],
  "American Roaches": [
    "• Inspected for cockroach activity and applied cockroach-targeted treatments to harborage areas",
  ],
  Wasps: ["• Inspected for wasp nests and treated active wasp activity areas"],
  Earwigs: ["• Inspected for earwig activity and treated entry points and harborage areas"],
  Crickets: ["• Inspected for cricket activity and treated perimeter and entry points"],
  Silverfish: ["• Inspected for silverfish activity in moisture-prone areas and applied treatments"],
  Centipedes: ["• Inspected for centipede/millipede activity and treated perimeter and foundation areas"],
  Millipedes: ["• Inspected for centipede/millipede activity and treated perimeter and foundation areas"],
  Fleas: ["• Inspected for flea and tick activity in outdoor areas and applied treatments"],
  Ticks: ["• Inspected for flea and tick activity in outdoor areas and applied treatments"],
  Rodents: [
    "• Inspected for rodent activity and strategically placed traps in areas of highest activity",
    "• Will monitor and adjust trap placement as needed to ensure effective rodent control",
    "• Installed rodent bait stations around the property perimeter",
  ],
  Mosquitoes: [
    "• Set up mosquito stations to interrupt breeding cycle and neutralize future mosquito generations",
    "• Targeted adult mosquitoes and larvae with long-lasting products",
  ],
  "Bed Bugs": [
    "• Inspected sleeping areas, furniture, and baseboards for bed bug activity",
    "• Applied targeted bed bug treatments to affected areas",
  ],
  "Drain Flies": ["• Inspected and treated drains for drain fly breeding activity"],
};

const RECOMMENDATION_SNIPPETS: Record<string, string[]> = {
  [GENERAL_PESTS_LABEL]: [
    "<strong>Ants:</strong> (1) Wipe food/sugar spills fast (2) Fix leaks & avoid overwatering",
    "<strong>Spiders:</strong> (1) Remove webs regularly (2) Reduce insects & outdoor lighting",
  ],
  Ants: ["<strong>Ants:</strong> (1) Wipe food/sugar spills fast (2) Fix leaks & avoid overwatering"],
  Spiders: ["<strong>Spiders:</strong> (1) Remove webs regularly (2) Reduce insects & outdoor lighting"],
  "American Roaches": [
    "<strong>American & Oriental Cockroaches:</strong> (1) Keep garages/laundry clutter-free (2) Don't leave pet food/water out",
  ],
  Roaches: [
    "<strong>American & Oriental Cockroaches:</strong> (1) Keep garages/laundry clutter-free (2) Don't leave pet food/water out",
  ],
  Crickets: ["<strong>Crickets:</strong> (1) Reduce moisture & fix leaks (2) Turn off exterior lights"],
  Earwigs: ["<strong>Earwigs:</strong> (1) Clear mulch/debris near home (2) Avoid overwatering foundations"],
  Fleas: ["<strong>Fleas:</strong> (1) Wash pet bedding hot (2) Vacuum pet areas often"],
  Ticks: ["<strong>Fleas:</strong> (1) Wash pet bedding hot (2) Vacuum pet areas often"],
  Silverfish: ["<strong>Silverfish:</strong> (1) Lower humidity (2) Declutter & vacuum cracks"],
  Wasps: ["<strong>Wasps:</strong> (1) Cover food/drinks outdoors (2) Seal & rinse trash cans"],
  "Bed Bugs": ["<strong>Bed Bugs:</strong> (1) Inspect luggage after travel (2) Use mattress encasements"],
  Mosquitoes: ["<strong>Mosquitoes:</strong> (1) Remove standing water (2) Trim vegetation"],
  "Drain Flies": ["<strong>Drain Flies:</strong> (1) Clean drains regularly (2) Avoid grease/food waste"],
  Rodents: [
    "<strong>Rats:</strong> (1) Seal food & clean outdoor debris (2) Keep yards clutter-free",
    "<strong>Mice:</strong> (1) Store food sealed (2) Clean crumbs & spills promptly",
  ],
};

const CUSTOMER_KEY_AREAS = ["Children", "Pets", "Elderly", "Garden"];

const GENERAL_PESTS_OPTION = GENERAL_PESTS_LABEL;

const PRODUCT_OPTIONS = [
  "Alpine WSG",
  "Bifen I/T",
  "Essentria IC Pro",
  "Temprid FX",
  "Termidor SC",
  "Phantom",
  "ExciteR",
  "Gentrol IGR Concentrate",
  "Nyguard IGR Concentrate",
  "PT Wasp Freeze",
  "PT Alpine Flea & Bed Bug",
  "PT Alpine Fly Bait",
  "Gentrol Aerosol",
  "Bedlam",
  "Invade Hot Spot +",
  "Niban",
  "Bifen LP",
  "Advion Ant Gel Bait",
  "Maxforce FC Ant Gel",
  "MasterLine B MaxxPro",
  "Advion Cockroach Gel Bait",
  "Contrac California",
  "Delta Dust (Bayer)",
  "In2Care Mix",
  "OneGuard",
  "Advion Microflow",
  "Optigard",
  "Crossfire Bedbug Concentrate",
  "Other",
];

const EQUIPMENT_OPTIONS = ["Rodent Bait Stations", "Rodent Traps", "Mosquito Buckets", "Fly Light", "Pest Monitors"];

interface AnalysisData {
  findings: string[];
  recommendations: string[];
  nextSteps: string[];
}

const Report = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { reportId } = useParams();
  const isMobile = useIsMobile();
  const isTablet = useIsTablet();
  const isMobileOrTablet = isMobile || isTablet;
  const {
    technicianName,
    customerName,
    address,
    notes,
    screenshots,
    serviceDate,
    licenseNumber,
    targetPests,
    productsUsed,
    variant,
  } = location.state || {};

  // "rodent-exclusion" variant tweaks the initial report for rodent
  // exclusion / attic jobs: defaults Target Pest to Rodents and shows a
  // mobile-friendly grouped photo capture panel at the top of the body.
  // Persisted as customer_preferences.reportFormat so it survives reloads
  // and is detectable by the dashboard router.
  const [isRodentExclusion, setIsRodentExclusion] = useState<boolean>(
    variant === "rodent-exclusion",
  );

  const [extractedAddress, setExtractedAddress] = useState<string>("");
  const [editableAddress, setEditableAddress] = useState<string>(address || "");
  const [coordinates, setCoordinates] = useState<{ lat: number; lng: number } | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [analysis, setAnalysis] = useState<AnalysisData | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [editableTech, setEditableTech] = useState(technicianName || "");
  const [editableCustomer, setEditableCustomer] = useState(customerName || "");
  // FieldRoutes customer link (chosen via the picker) + autofilled phone.
  const [fieldroutesCustomerId, setFieldroutesCustomerId] = useState<string | null>(null);
  // FieldPortals loginLink for the linked customer — powers the prominent
  // "Open Customer Portal" button at the top of the report (same UX as
  // the sales / multi-proposal report).
  const [fieldroutesLoginLink, setFieldroutesLoginLink] = useState<string | null>(null);
  const [customerPhone, setCustomerPhone] = useState("");
  const currentStaff = useCurrentStaff();
  const [editableServiceDate, setEditableServiceDate] = useState(serviceDate || new Date().toISOString().split("T")[0]);
  const [editableLicenseNumber, setEditableLicenseNumber] = useState(licenseNumber || "");
  const [techDropdownOpen, setTechDropdownOpen] = useState(false);

  // Auto-set license when technician changes
  const handleTechnicianChange = (techName: string) => {
    setEditableTech(techName);
    const tech = TECHNICIANS.find((t) => t.name === techName);
    if (tech) {
      setEditableLicenseNumber(tech.license);
    }
    setTechDropdownOpen(false);
  };
  const [editableTargetPests, setEditableTargetPests] = useState<string[]>(
    targetPests?.filter((p: string) => p) ||
      (isRodentExclusion ? ["Rodents"] : []),
  );
  const [editableProductsUsed, setEditableProductsUsed] = useState<string[]>(
    productsUsed?.filter((p: string) => p) || [],
  );
  const [editableEquipment, setEditableEquipment] = useState<string[]>([]);
  const [customerKeyAreas, setCustomerKeyAreas] = useState<string[]>([]);
  const [customerKeyAreasNotes, setCustomerKeyAreasNotes] = useState<string>("");
  const [todaysFindings, setTodaysFindings] = useState<string>("");
  const [customerPreference, setCustomerPreference] = useState<string>("");
  const [customerPreferenceNotes, setCustomerPreferenceNotes] = useState<string>("");
  const [editableFindings, setEditableFindings] = useState<string[]>([]);
  const [editableExpectations, setEditableExpectations] = useState<string[]>([]);
  const [editableRecommendations, setEditableRecommendations] = useState<string[]>([]);
  const [mapData, setMapData] = useState<string | null>(null);
  const [zoomLevel, setZoomLevel] = useState(20);
  const [staticMapUrl, setStaticMapUrl] = useState<string | null>(null);
  const [pestsDropdownOpen, setPestsDropdownOpen] = useState(false);
  const pestsDropdownRef = useRef<HTMLDivElement>(null);
  const [customMapImage, setCustomMapImage] = useState<string | null>(null);
  const latestMapDataRef = useRef<string | null>(null);
  const reportLoadedRef = useRef(false);
  const pendingAutoSaveRef = useRef(false);
  const [renderedMapImage, setRenderedMapImage] = useState<string | null>(null);
  const [pdfExportMode, setPdfExportMode] = useState(false);
  const [propertyImages, setPropertyImages] = useState<Array<{ image: string; caption?: string }>>([]);
  // "Before" photos (rodent-exclusion variant only) — seeded from the source
  // sales report, but techs can also upload/replace them directly here.
  const [beforePhotos, setBeforePhotos] = useState<Array<{ image: string; caption?: string }>>([]);
  // Editable labels for each Before/After pair (rodent-exclusion only).
  // Defaults to "Entry Point #N"; tech can rename to anything (e.g. "Clean Up Spot #1").
  const [pairLabels, setPairLabels] = useState<string[]>([]);
  // Whether the bulk uploader on the rodent-exclusion photo panel adds
  // "before" or "after" photos. Techs pick before snapping/selecting.
  const [bulkUploadKind, setBulkUploadKind] = useState<"before" | "after">("after");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isExpandingFindings, setIsExpandingFindings] = useState(false);
  const [isExpandingExpect, setIsExpandingExpect] = useState(false);
  const [customerEmail, setCustomerEmail] = useState("");
  const [propertyType, setPropertyType] = useState<string>("Residential");
  const [companyName, setCompanyName] = useState<string>("");
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [hasManuallyEditedFindings, setHasManuallyEditedFindings] = useState(false);
  const [showComposeDialog, setShowComposeDialog] = useState(false);
  const [includePdf, setIncludePdf] = useState(false);
  const [emailSubject, setEmailSubject] = useState(
    variant === "rodent-exclusion"
      ? "Your Rodent Exclusion Report from Crest"
      : "Your Initial Pest Report from Crest",
  );
  const [emailMessage, setEmailMessage] = useState(
    variant === "rodent-exclusion"
      ? "Hi,\n\nThank you for choosing Crest for your rodent exclusion work. Attached/linked is your Rodent Exclusion Report, which documents the entry points we sealed, the exclusion materials used, and before & after photos of the work performed on your property.\n\nA few reminders:\n• Our exclusion work carries a lifetime warranty on areas we sealed as long as you remain on an ongoing rodent bait box service (1-year warranty otherwise).\n• If you notice any new rodent activity, give us a call right away so we can re-inspect.\n\nPlease let us know if you have any questions — we're happy to walk through the report with you.\n\nThank you,\nThe Crest Team"
      : "",
  );
  const [ccEmails, setCcEmails] = useState<string[]>(["office@crestpestcontrol.com", "caleb@crestpestco.com"]);
  const [ccInput, setCcInput] = useState("");
  const [recommendationsFontSize, setRecommendationsFontSize] = useState(14);
  const [annotatingImageIndex, setAnnotatingImageIndex] = useState<number | null>(null);

  // Generate findings and expectations based on selected pests, equipment, and products
  const generateContentFromSelections = (pests: string[], equipment: string[], products: string[]) => {
    const lines: string[] = [];
    const isGeneralPests = pests.some(p => p.startsWith("General Pests"));
    const usesOrganic = products.some(p => p.toLowerCase().includes("essentria"));

    if (isGeneralPests) {
      lines.push("• Inspected interior and exterior for general pest activity and entry points");
      const treatmentLine = usesOrganic
        ? "• Applied targeted general pest treatments, including organic solutions, to ensure a protective barrier around the home"
        : "• Applied targeted general pest treatments to ensure a protective barrier around the home";
      lines.push(treatmentLine);
      lines.push("• De-webbed the entire home");
    }

    // Individual pest-specific findings — mention each by name
    if (pests.includes("Ants")) {
      lines.push("• Inspected for ant activity and treated ant trails and entry points");
    }
    if (pests.includes("Spiders")) {
      lines.push("• Inspected for spider activity, removed webs, and applied spider-targeted treatments");
    }
    if (pests.includes("Roaches") || pests.includes("American Roaches")) {
      lines.push("• Inspected for cockroach activity and applied cockroach-targeted treatments to harborage areas");
    }
    if (pests.includes("Wasps")) {
      lines.push("• Inspected for wasp nests and treated active wasp activity areas");
    }
    if (pests.includes("Earwigs")) {
      lines.push("• Inspected for earwig activity and treated entry points and harborage areas");
    }
    if (pests.includes("Crickets")) {
      lines.push("• Inspected for cricket activity and treated perimeter and entry points");
    }
    if (pests.includes("Silverfish")) {
      lines.push("• Inspected for silverfish activity in moisture-prone areas and applied treatments");
    }
    if (pests.includes("Centipedes") || pests.includes("Millipedes")) {
      lines.push("• Inspected for centipede/millipede activity and treated perimeter and foundation areas");
    }
    if (pests.includes("Fleas") || pests.includes("Ticks")) {
      lines.push("• Inspected for flea and tick activity in outdoor areas and applied treatments");
    }
    if (pests.includes("Rodents")) {
      lines.push("• Inspected for rodent activity and strategically placed traps in areas of highest activity");
      lines.push("• Will monitor and adjust trap placement as needed to ensure effective rodent control");
    }
    if (pests.includes("Mosquitoes")) {
      lines.push("• Set up mosquito stations to interrupt breeding cycle and neutralize future mosquito generations");
      lines.push("• Targeted adult mosquitoes and larvae with long-lasting products");
    }
    if (pests.includes("Bed Bugs")) {
      lines.push("• Inspected sleeping areas, furniture, and baseboards for bed bug activity");
      lines.push("• Applied targeted bed bug treatments to affected areas");
    }
    if (pests.includes("Drain Flies")) {
      lines.push("• Inspected and treated drains for drain fly breeding activity");
    }

    // Equipment-based additions
    if (equipment.includes("Rodent Bait Stations")) {
      lines.push("• Installed rodent bait stations around the property perimeter");
    }
    if (equipment.includes("Rodent Traps")) {
      lines.push("• Placed rodent traps for population control");
    }
    if (equipment.includes("Mosquito Buckets")) {
      lines.push("• Installed mosquito stations around the property");
    }

    return lines.join("\n");
  };

  const generateExpectations = () => {
    return "• Initial Period: You may notice increased pest activity in the first 24-48 hours as pests are flushed from hiding spots.\n• Treatment Effect: Pest populations will decrease significantly over the next 7-10 days.\n• Long-term Results: With continued service, pests will become less of an issue. Contact us if activity persists beyond 2 weeks.";
  };

  const generateRecommendations = (pests: string[]) => {
    const lines: string[] = [];
    
    // If "General Pests" is selected, default to ants + spiders recommendations
    const isGeneralPests = pests.some(p => p.startsWith("General Pests"));
    
    if (isGeneralPests || pests.includes("Ants")) {
      lines.push("<strong>Ants:</strong> (1) Wipe food/sugar spills fast (2) Fix leaks & avoid overwatering");
    }
    if (isGeneralPests || pests.includes("Spiders")) {
      lines.push("<strong>Spiders:</strong> (1) Remove webs regularly (2) Reduce insects & outdoor lighting");
    }
    if (pests.includes("American Roaches") || pests.includes("Oriental Roaches") || pests.includes("Roaches")) {
      lines.push("<strong>American & Oriental Cockroaches:</strong> (1) Keep garages/laundry clutter-free (2) Don't leave pet food/water out");
    }
    if (pests.includes("German Roaches")) {
      lines.push("<strong>German Cockroaches:</strong> (1) Clean kitchens nightly (2) Take trash out often");
    }
    if (pests.includes("Crickets")) {
      lines.push("<strong>Crickets:</strong> (1) Reduce moisture & fix leaks (2) Turn off exterior lights");
    }
    if (pests.includes("Earwigs")) {
      lines.push("<strong>Earwigs:</strong> (1) Clear mulch/debris near home (2) Avoid overwatering foundations");
    }
    if (pests.includes("Fleas") || pests.includes("Fleas & Ticks") || pests.includes("Ticks")) {
      lines.push("<strong>Fleas:</strong> (1) Wash pet bedding hot (2) Vacuum pet areas often");
    }
    if (pests.includes("Silverfish")) {
      lines.push("<strong>Silverfish:</strong> (1) Lower humidity (2) Declutter & vacuum cracks");
    }
    if (pests.includes("Wasps")) {
      lines.push("<strong>Wasps:</strong> (1) Cover food/drinks outdoors (2) Seal & rinse trash cans");
    }
    if (pests.includes("Bed Bugs")) {
      lines.push("<strong>Bed Bugs:</strong> (1) Inspect luggage after travel (2) Use mattress encasements");
    }
    if (pests.includes("Pantry Pests")) {
      lines.push("<strong>Pantry Pests:</strong> (1) Store food airtight (2) Discard infested items");
    }
    if (pests.includes("Carpet Beetles")) {
      lines.push("<strong>Carpet Beetles:</strong> (1) Vacuum carpets/upholstery (2) Wash stored fabrics");
    }
    if (pests.includes("Mosquitoes")) {
      lines.push("<strong>Mosquitoes:</strong> (1) Remove standing water (2) Trim vegetation");
    }
    if (pests.includes("Drain Flies")) {
      lines.push("<strong>Drain Flies:</strong> (1) Clean drains regularly (2) Avoid grease/food waste");
    }
    if (pests.includes("Fruit Flies")) {
      lines.push("<strong>Fruit Flies:</strong> (1) Toss overripe fruit (2) Clean trash/recycling bins");
    }
    if (pests.includes("Rats") || pests.includes("Rodents")) {
      lines.push("<strong>Rats:</strong> (1) Seal food & clean outdoor debris (2) Keep yards clutter-free");
    }
    if (pests.includes("Mice")) {
      lines.push("<strong>Mice:</strong> (1) Store food sealed (2) Clean crumbs & spills promptly");
    }
    
    if (lines.length === 0) {
      lines.push("<strong>General:</strong> (1) Keep food in airtight containers (2) Seal cracks around doors & windows");
      lines.push("<strong>Moisture:</strong> (1) Fix leaks promptly (2) Improve ventilation in damp areas");
    }
    
    return lines.join("<br>");
  };

  // Services Completed and Recommendations are now snippet-pick only — they
  // do NOT autopopulate from the pest list. We still keep "What to Expect"
  // pre-filled with the boilerplate copy on first load.
  useEffect(() => {
    if (!hasManuallyEditedFindings && editableExpectations.length === 0) {
      setEditableExpectations([generateExpectations()]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-add rodent equipment when Rodents is selected
  useEffect(() => {
    if (editableTargetPests.includes("Rodents")) {
      setEditableEquipment(prev => {
        if (!prev.includes("Rodent Bait Stations")) {
          return [...prev, "Rodent Bait Stations"];
        }
        return prev;
      });
    }
  }, [editableTargetPests]);

  // Snippet toggle helpers — used by chip pickers above Services Completed
  // and Recommendations. Chips are "active" when their snippet is already
  // present; clicking removes it. Otherwise the snippet is appended.
  const toggleFindingSnippet = (snippet: string) => {
    const current = editableFindings[0] || "";
    const lines = current.split("\n");
    const idx = lines.findIndex((l) => l.trim() === snippet.trim());
    let next: string;
    if (idx >= 0) {
      next = lines.filter((_, i) => i !== idx).join("\n").replace(/\n{3,}/g, "\n\n");
    } else {
      next = current.trim() ? `${current.replace(/\s+$/, "")}\n${snippet}` : snippet;
    }
    setEditableFindings([next]);
    setHasManuallyEditedFindings(true);
  };
  const isFindingSnippetActive = (snippet: string) =>
    (editableFindings[0] || "")
      .split("\n")
      .some((l) => l.trim() === snippet.trim());

  const toggleRecSnippet = (snippet: string) => {
    const current = editableRecommendations[0] || "";
    const parts = current
      .split(/<br\s*\/?>(?:\s*)/i)
      .map((p) => p.trim())
      .filter(Boolean);
    const idx = parts.findIndex((p) => p === snippet);
    let next: string;
    if (idx >= 0) {
      next = parts.filter((_, i) => i !== idx).join("<br>");
    } else {
      next = parts.length ? `${parts.join("<br>")}<br>${snippet}` : snippet;
    }
    setEditableRecommendations([next]);
  };
  const isRecSnippetActive = (snippet: string) =>
    (editableRecommendations[0] || "").includes(snippet);

  const expandWithAI = async (
    text: string,
    type: "findings" | "expect",
    setter: React.Dispatch<React.SetStateAction<string[]>>,
  ) => {
    if (type === "findings") setIsExpandingFindings(true);
    else setIsExpandingExpect(true);

    try {
      const { data, error } = await supabase.functions.invoke("expand-findings", {
        body: { text, type },
      });

      if (error) throw error;

      if (data?.expandedText) {
        setter([data.expandedText]);
        toast.success("Text expanded!");
        if (type === "findings") {
          setHasManuallyEditedFindings(true);
        }

        // Auto-fill expectations when expanding findings
        if (type === "findings") {
          setEditableExpectations([generateExpectations()]);
        }
      }
    } catch (error: any) {
      console.error("Error expanding text:", error);
      toast.error("Failed to expand text");
    } finally {
      setIsExpandingFindings(false);
      setIsExpandingExpect(false);
    }
  };

  useEffect(() => {
    if (reportId) {
      loadReport();
    } else if (screenshots && screenshots.length > 0) {
      processScreenshots();
      analyzeFindings();
    } else if (address) {
      geocodeAddress(address);
    }
  }, [reportId]);

  useEffect(() => {
    if (analysis) {
      setEditableFindings(analysis.findings || []);
      setEditableExpectations(analysis.nextSteps || []);
    }
  }, [analysis]);

  useEffect(() => {
    latestMapDataRef.current = mapData;
  }, [mapData]);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (pestsDropdownRef.current && !pestsDropdownRef.current.contains(event.target as Node)) {
        setPestsDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Fetch static 2D satellite map whenever coordinates or zoom change
  useEffect(() => {
    if (coordinates) {
      fetchStaticMap();
    }
  }, [coordinates, zoomLevel]);

  const fetchStaticMap = async () => {
    if (!coordinates) return;
    // Static map (Mapbox) fetching has been removed — users upload custom maps instead.
  };

  const loadReport = async () => {
    if (!reportId) return;

    try {
      const adminSessionToken = localStorage.getItem("admin_session");
      let row: any = null;

      if (adminSessionToken) {
        const { data: adminData, error: adminError } = await supabase.functions.invoke("admin-reports", {
          body: { sessionToken: adminSessionToken, action: "get", reportId },
        });

        if (!adminError && adminData?.ok && adminData.report) {
          row = adminData.report;
        }
      }

      if (!row) {
        const { data, error } = await supabase.from("reports").select("*").eq("id", reportId).single();
        if (error) throw error;
        row = data;
      }

      setEditableTech(row.technician_name);
      setEditableCustomer(row.customer_name || "");
      // Fallback variant detection: legacy rodent-exclusion reports may have
      // been saved before customer_preferences.reportFormat existed. Treat
      // any row whose saved report_title says so as rodent-exclusion so the
      // page renders the correct UI on reload.
      if (typeof row.report_title === "string" && /rodent\s*exclusion/i.test(row.report_title)) {
        setIsRodentExclusion(true);
      }
      setFieldroutesCustomerId((row as { fieldroutes_customer_id?: string | null }).fieldroutes_customer_id || null);
      setCustomerPhone(row.customer_phone || "");
      setExtractedAddress(row.address || "");
      setEditableAddress(row.address || "");
      setEditableFindings((row.findings as string[]) || []);
      setEditableExpectations((row.next_steps as string[]) || []);
      if (row.recommendations && Array.isArray(row.recommendations)) {
        setEditableRecommendations(row.recommendations as string[]);
      }

      // Load additional fields
      if (row.service_date) {
        setEditableServiceDate(row.service_date);
      }
      if (row.license_number) {
        setEditableLicenseNumber(row.license_number);
      }
      if (row.target_pests && Array.isArray(row.target_pests)) {
        setEditableTargetPests(row.target_pests as string[]);
      }
      if (row.products_used && Array.isArray(row.products_used)) {
        setEditableProductsUsed(row.products_used as string[]);
      }
      if (row.equipment && Array.isArray(row.equipment)) {
        setEditableEquipment(row.equipment as string[]);
      }
      if (row.customer_key_areas && typeof row.customer_key_areas === 'object') {
        const keyAreas = row.customer_key_areas as any;
        if (Array.isArray(keyAreas)) {
          setCustomerKeyAreas(keyAreas as string[]);
        } else if (keyAreas.areas) {
          setCustomerKeyAreas(keyAreas.areas as string[]);
          if (keyAreas.notes) setCustomerKeyAreasNotes(keyAreas.notes);
        }
      }
      if (row.customer_preferences) {
        const prefs = row.customer_preferences as any;
        if (prefs.preference) setCustomerPreference(prefs.preference);
        if (prefs.notes) setCustomerPreferenceNotes(prefs.notes);
        if (prefs.propertyType) setPropertyType(prefs.propertyType);
        if (prefs.companyName) setCompanyName(prefs.companyName);
        if (prefs.reportFormat === "rodent-exclusion") {
          setIsRodentExclusion(true);
          setEmailSubject("Your Rodent Exclusion Report from Crest");
          setEmailMessage((prev) =>
            prev && prev.trim()
              ? prev
              : "Hi,\n\nThank you for choosing Crest for your rodent exclusion work. Attached/linked is your Rodent Exclusion Report, which documents the entry points we sealed, the exclusion materials used, and before & after photos of the work performed on your property.\n\nA few reminders:\n• Our exclusion work carries a lifetime warranty on areas we sealed as long as you remain on an ongoing rodent bait box service (1-year warranty otherwise).\n• If you notice any new rodent activity, give us a call right away so we can re-inspect.\n\nPlease let us know if you have any questions — we're happy to walk through the report with you.\n\nThank you,\nThe Crest Team",
          );
        }
        if (prefs.beforeAfter && Array.isArray(prefs.beforeAfter.before)) {
          const savedBefore = prefs.beforeAfter.before as Array<{ image: string; caption?: string }>;
          setBeforePhotos(savedBefore);
          setPairLabels(normalizeRodentPairLabels((prefs.beforeAfter as any).pairLabels, savedBefore.length));
        } else if (prefs.beforeAfter && Array.isArray((prefs.beforeAfter as any).pairLabels)) {
          setPairLabels(normalizeRodentPairLabels((prefs.beforeAfter as any).pairLabels));
        }
        if (typeof prefs.fieldroutes_login_link === "string" && prefs.fieldroutes_login_link) {
          setFieldroutesLoginLink(prefs.fieldroutes_login_link as string);
        }
      }
      if (row.notes) {
        setTodaysFindings(row.notes as string);
      }
      if (row.customer_email) {
        setCustomerEmail(row.customer_email);
      }

      console.log("Loading report map_data:", {
        hasMapData: !!row.map_data,
        mapDataType: typeof row.map_data,
        mapDataPreview: row.map_data ? JSON.stringify(row.map_data).substring(0, 150) : "null",
      });

      setMapData(row.map_data ? JSON.stringify(row.map_data) : null);

      // Load custom map and property images
      if (row.custom_map_url) {
        setCustomMapImage(row.custom_map_url);
      }

      if (row.property_images) {
        setPropertyImages(row.property_images as Array<{ image: string; caption?: string }>);
      }

      // Extract coordinates from map_url if available, otherwise geocode
      if (row.map_url) {
        const latMatch = row.map_url.match(/mlat=([-\d.]+)/);
        const lngMatch = row.map_url.match(/mlon=([-\d.]+)/);
        if (latMatch && lngMatch) {
          setCoordinates({
            lat: parseFloat(latMatch[1]),
            lng: parseFloat(lngMatch[1]),
          });
        }
      } else if (row.address) {
        geocodeAddress(row.address);
      }
      reportLoadedRef.current = true;
    } catch (error: any) {
      toast.error("Failed to load report");
      console.error(error);
    }
  };

  const processScreenshots = async () => {
    setIsProcessing(true);
    try {
      const imagePromises = screenshots.map((file: File) => {
        return new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
      });

      const imageDataUrls = await Promise.all(imagePromises);

      // Extract customer name from images
      extractCustomerName(imageDataUrls);

      const { data, error } = await supabase.functions.invoke("extract-address", {
        body: { images: imageDataUrls },
      });

      if (error) {
        console.error("Error extracting address:", error);
        return;
      }

      if (data.address && data.address !== "Address not found") {
        setExtractedAddress(data.address);

        if (data.coordinates) {
          setCoordinates(data.coordinates);
        }
      }
    } catch (error) {
      console.error("Error processing screenshots:", error);
    } finally {
      setIsProcessing(false);
    }
  };

  const extractCustomerName = async (imageDataUrls: string[]) => {
    try {
      const { data, error } = await supabase.functions.invoke("extract-customer-info", {
        body: { images: imageDataUrls.slice(0, 3) }, // Only use first 3 images
      });

      if (!error && data?.customerName) {
        setEditableCustomer(data.customerName);
        toast.success(`Customer name found: ${data.customerName}`);
      }
    } catch (error) {
      console.error("Error extracting customer name:", error);
    }
  };

  const analyzeFindings = async () => {
    setIsAnalyzing(true);
    try {
      const imagePromises = screenshots.map((file: File) => {
        return new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
      });

      const imageDataUrls = await Promise.all(imagePromises);

      const { data, error } = await supabase.functions.invoke("analyze-findings", {
        body: {
          images: imageDataUrls,
          address: extractedAddress || address,
        },
      });

      if (error) {
        console.error("Error analyzing findings:", error);
        return;
      }

      setAnalysis(data);
      toast.success("Report generated!");
    } catch (error) {
      console.error("Error analyzing findings:", error);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const geocodeAddress = async (addr: string) => {
    try {
      const geocodeUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(addr)}`;
      const response = await fetch(geocodeUrl, {
        headers: {
          "User-Agent": "PestProReports/1.0",
        },
      });

      if (response.ok) {
        const data = await response.json();
        if (data && data.length > 0) {
          setCoordinates({
            lat: parseFloat(data[0].lat),
            lng: parseFloat(data[0].lon),
          });
          setExtractedAddress(addr);
        }
      }
    } catch (error) {
      console.error("Geocoding error:", error);
    }
  };

  // Render map canvas to a static image and upload to storage
  const renderMapImage = async (): Promise<string | null> => {
    try {
      const exportFn = (window as any).exportMapAsImage;
      if (!exportFn) return null;
      
      const dataUrl = await exportFn();
      if (!dataUrl) return null;
      
      // Convert data URL to blob and upload to storage
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      const fileName = `${reportId || crypto.randomUUID()}/rendered-map/${Date.now()}.png`;
      
      const { error: uploadError } = await supabase.storage
        .from("report-images")
        .upload(fileName, blob, { upsert: true, contentType: "image/png" });
      
      if (uploadError) {
        console.error("Error uploading rendered map:", uploadError);
        return null;
      }
      
      const { data: { publicUrl } } = supabase.storage.from("report-images").getPublicUrl(fileName);
      return publicUrl;
    } catch (error) {
      console.error("Error rendering map image:", error);
      return null;
    }
  };

  // Auto-link to a FieldRoutes customer when not already linked, so a completed
  // report's PDF can later upload back to the right customer. High-confidence
  // only (unique exact email / address); the picker stays the manual override.
  const ensureCustomerLink = async (reportData: Record<string, any>) => {
    if (reportData.fieldroutes_customer_id) return;
    try {
      const match = await autoMatchCustomerId({
        email: reportData.customer_email,
        name: reportData.customer_name,
        address: reportData.address,
        staffName: currentStaff?.fullName,
      });
      if (match) {
        reportData.fieldroutes_customer_id = match.customerId;
        setFieldroutesCustomerId(match.customerId);
      }
    } catch (e) {
      console.warn("FieldRoutes auto-match skipped", e);
    }
  };

  const handleSubmit = async () => {
    if (!editableTech) {
      toast.error("Please enter technician name");
      return;
    }

    setIsSaving(true);
    try {
      const rawMap = latestMapDataRef.current ?? mapData;
      console.log("Submitting report with map data:", {
        hasRawMap: !!rawMap,
        rawMapLength: rawMap?.length,
        rawMapPreview: rawMap ? rawMap.substring(0, 150) : "null",
      });

      let mapPayload: any = null;
      if (rawMap) {
        try {
          mapPayload = JSON.parse(rawMap);
          console.log("Parsed map payload:", {
            hasObjects: !!mapPayload.objects,
            objectCount: mapPayload.objects?.objects?.length,
          });
        } catch (e) {
          console.error("Failed to parse map data:", e);
          mapPayload = rawMap;
        }
      }

      // Render the map with annotations to a static image
      const renderedMapUrl = await renderMapImage();

      const reportData = {
        technician_name: editableTech,
        customer_name: editableCustomer,
        address: editableAddress || extractedAddress || address,
        notes: todaysFindings || notes || null,
        findings: editableFindings,
        recommendations: editableRecommendations,
        next_steps: editableExpectations,
        map_url: coordinates
          ? `https://www.openstreetmap.org/?mlat=${coordinates.lat}&mlon=${coordinates.lng}#map=17/${coordinates.lat}/${coordinates.lng}`
          : null,
        map_data: mapPayload,
        custom_map_url: customMapImage,
        rendered_map_url: renderedMapUrl,
        property_images: propertyImages,
        service_date: editableServiceDate,
        license_number: editableLicenseNumber,
        target_pests: pestDisplayOrder(editableTargetPests),
        products_used: editableProductsUsed,
        equipment: editableEquipment,
        report_title: isRodentExclusion ? "Rodent Exclusion Report" : "Initial Pest Report",
        customer_key_areas: customerKeyAreas.length > 0 || customerKeyAreasNotes ? { areas: customerKeyAreas, notes: customerKeyAreasNotes } : null,
        customer_preferences: {
          preference: customerPreference,
          notes: customerPreferenceNotes,
          propertyType,
          companyName: companyName || undefined,
          ...(isRodentExclusion ? { reportFormat: "rodent-exclusion" } : {}),
          ...(fieldroutesLoginLink ? { fieldroutes_login_link: fieldroutesLoginLink } : {}),
          ...(beforePhotos.length > 0 || propertyImages.length > 0 ? { beforeAfter: { before: beforePhotos, pairLabels: normalizeRodentPairLabels(pairLabels, Math.max(beforePhotos.length, propertyImages.length)) } } : {}),
        },
        customer_email: customerEmail || null,
        customer_phone: customerPhone || null,
        fieldroutes_customer_id: fieldroutesCustomerId,
      };

      await ensureCustomerLink(reportData);

      if (reportId) {
        const { error } = await supabase.from("reports").update(reportData).eq("id", reportId);

        if (error) throw error;
        toast.success("Report saved successfully!");
      } else {
        // Generate an id client-side so we can navigate to it
        const newId = crypto.randomUUID();
        const { error } = await supabase.from("reports").insert([{ id: newId, ...reportData }]);

        if (error) throw error;
        
        // Navigate to the new report URL
        navigate(`/initial-pest-report/${newId}`, { replace: true });
        toast.success("Report saved successfully!");
      }
    } catch (error: any) {
      toast.error("Failed to save report");
      console.error(error);
    } finally {
      setIsSaving(false);
    }
  };

  // Silent auto-save (no toast, no loading spinner)
  const autoSave = async () => {
    if (!editableTech || !reportId) return;
    try {
      const rawMap = latestMapDataRef.current ?? mapData;
      let mapPayload: any = null;
      if (rawMap) {
        try { mapPayload = JSON.parse(rawMap); } catch { mapPayload = rawMap; }
      }
      const renderedMapUrl = renderedMapImage;
      const reportData = {
        technician_name: editableTech,
        customer_name: editableCustomer,
        address: editableAddress || extractedAddress || address,
        notes: todaysFindings || notes || null,
        findings: editableFindings,
        recommendations: editableRecommendations,
        next_steps: editableExpectations,
        map_url: coordinates
          ? `https://www.openstreetmap.org/?mlat=${coordinates.lat}&mlon=${coordinates.lng}#map=17/${coordinates.lat}/${coordinates.lng}`
          : null,
        map_data: mapPayload,
        custom_map_url: customMapImage,
        rendered_map_url: renderedMapUrl,
        property_images: propertyImages,
        service_date: editableServiceDate,
        license_number: editableLicenseNumber,
        target_pests: pestDisplayOrder(editableTargetPests),
        products_used: editableProductsUsed,
        equipment: editableEquipment,
        report_title: isRodentExclusion ? "Rodent Exclusion Report" : "Initial Pest Report",
        customer_key_areas: customerKeyAreas.length > 0 || customerKeyAreasNotes ? { areas: customerKeyAreas, notes: customerKeyAreasNotes } : null,
        customer_preferences: {
          preference: customerPreference,
          notes: customerPreferenceNotes,
          propertyType,
          companyName: companyName || undefined,
          ...(isRodentExclusion ? { reportFormat: "rodent-exclusion" } : {}),
          ...(fieldroutesLoginLink ? { fieldroutes_login_link: fieldroutesLoginLink } : {}),
          ...(beforePhotos.length > 0 || propertyImages.length > 0 ? { beforeAfter: { before: beforePhotos, pairLabels: normalizeRodentPairLabels(pairLabels, Math.max(beforePhotos.length, propertyImages.length)) } } : {}),
        },
        customer_email: customerEmail || null,
        customer_phone: customerPhone || null,
        fieldroutes_customer_id: fieldroutesCustomerId,
      };
      const { error } = await supabase.from("reports").update(reportData).eq("id", reportId);
      if (error) throw error;
      console.log("[autosave] saved successfully");
    } catch (err) {
      console.error("[autosave] failed:", err);
    }
  };

  // Effect: auto-save when images/map change after upload
  useEffect(() => {
    if (!pendingAutoSaveRef.current || !reportLoadedRef.current) return;
    pendingAutoSaveRef.current = false;
    autoSave();
  }, [propertyImages, beforePhotos, customMapImage]);

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: "Pest Control Report",
          text: `Report for ${editableCustomer || "Customer"} at ${extractedAddress || address || "location"}`,
        });
      } catch {
        console.log("Share cancelled");
      }
    } else {
      toast.info("Sharing not supported on this device");
    }
  };

  /** Downscale an <img> to a JPEG data-URL (max 800px, q=0.5) */
  const downscaleImg = (img: HTMLImageElement, maxDim = 800, quality = 0.5): Promise<string | null> => {
    return new Promise((resolve) => {
      // If already a data URL that's small, skip
      if (img.naturalWidth <= maxDim && img.naturalHeight <= maxDim) {
        // Still re-encode as JPEG for size savings
      }
      const cv = document.createElement("canvas");
      let w = img.naturalWidth;
      let h = img.naturalHeight;
      if (w > maxDim || h > maxDim) {
        const ratio = Math.min(maxDim / w, maxDim / h);
        w = Math.round(w * ratio);
        h = Math.round(h * ratio);
      }
      cv.width = w;
      cv.height = h;
      const c = cv.getContext("2d");
      if (!c) { resolve(null); return; }
      c.drawImage(img, 0, 0, w, h);
      resolve(cv.toDataURL("image/jpeg", quality));
    });
  };

  const buildCurrentInitialPdf = async (mapOverride?: string | null) => {
    return buildInitialPestReportPDF({
      reportTitle: isRodentExclusion ? "Rodent Exclusion Report" : "Initial Pest Report",
      logoSrc: crestLogo,
      customerName: editableCustomer || "Customer",
      address: editableAddress || extractedAddress || address || "—",
      serviceDate: editableServiceDate,
      technicianName: editableTech || "—",
      licenseNumber: editableLicenseNumber,
      propertyType,
      companyName,
      targetPests: pestDisplayOrder(editableTargetPests),
      productsUsed: editableProductsUsed,
      equipment: editableEquipment,
      serviceSummary: editableFindings[0] || "",
      todaysFindings,
      recommendationsHtml: editableRecommendations[0] || "",
      expectations: editableExpectations[0] || "",
      mapImage: mapOverride || renderedMapImage || customMapImage,
      isRodentExclusion,
      beforePhotos,
      afterPhotos: propertyImages,
      pairLabels: normalizeRodentPairLabels(pairLabels, Math.max(beforePhotos.length, propertyImages.length)),
      customerKeyAreas,
      customerKeyAreasNotes,
      customerPreference,
      customerPreferenceNotes,
    });
  };

  const exportToPDF = async () => {
    try {
      toast.info("Generating PDF...", { duration: 15000, id: "pdf-gen" });

      // Capture a fresh map render BEFORE entering PDF mode (which unmounts the canvas)
      let freshMapImage: string | null = null;
      const exportFn = (window as any).exportMapAsImage;
      if (exportFn) {
        const freshRender = await exportFn();
        if (freshRender) {
          freshMapImage = freshRender;
          setRenderedMapImage(freshRender);
        }
      }

      const pdfBytes = await buildCurrentInitialPdf(freshMapImage);

      setPdfExportMode(false);
      toast.dismiss("pdf-gen");

      const blob = new Blob([new Uint8Array(pdfBytes)], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Crest_Initial_Report_${(editableCustomer || "Customer").replace(/\s+/g, "_")}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("PDF export error:", e);
      setPdfExportMode(false);
      toast.dismiss("pdf-gen");
      toast.error("PDF generation failed. Try again.");
    }
  };

  // Queue this completed report's PDF to upload onto the linked FieldRoutes
  // customer (via the approval queue — does NOT write to FieldRoutes directly).
  // Admin-only; requires a linked customer. This is the "completed" trigger for
  // initial reports: there is no completion flag and auto-created drafts start
  // linked, so an explicit click avoids uploading half-finished drafts. Idempotent.
  const sendReportToFieldRoutes = async () => {
    const sessionToken = localStorage.getItem("admin_session");
    if (!sessionToken) { toast.error("Admin session required to send to FieldRoutes."); return; }
    if (!fieldroutesCustomerId) {
      toast.error("Link a FieldRoutes customer first (the search box at the top).");
      return;
    }
    try {
      toast.info("Preparing PDF…", { duration: 15000, id: "fr-doc" });
      let freshMapImage: string | null = null;
      const exportFn = (window as any).exportMapAsImage;
      if (exportFn) {
        const fresh = await exportFn();
        if (fresh) {
          freshMapImage = fresh;
          setRenderedMapImage(fresh);
        }
      }
      const pdfBytes = await buildCurrentInitialPdf(freshMapImage);
      setPdfExportMode(false);
      let bin = "";
      const chunk = 0x8000;
      for (let i = 0; i < pdfBytes.length; i += chunk) {
        bin += String.fromCharCode(...pdfBytes.subarray(i, i + chunk));
      }
      const fileBase64 = btoa(bin);
      const { data, error } = await supabase.functions.invoke("fieldroutes-document-submit", {
        body: {
          sessionToken,
          customerID: Number(fieldroutesCustomerId),
          fileBase64,
          filename: `Crest_Initial_${(editableCustomer || "Customer").replace(/\s+/g, "_")}.pdf`,
          description: `Initial Pest Report — ${editableCustomer || "Customer"}`,
          reportId: reportId ?? undefined,
          showCustomer: false,
        },
      });
      toast.dismiss("fr-doc");
      if (error || !data?.ok) {
        toast.error(`Could not queue: ${data?.error ?? error?.message ?? "unknown error"}`);
        return;
      }
      if (data?.deduped) { toast.info("Already queued for FieldRoutes."); return; }
      toast.success("Initial report queued for FieldRoutes — approve it in Admin → FieldRoutes Writes.");
    } catch (e) {
      console.error("send to FieldRoutes error:", e);
      setPdfExportMode(false);
      toast.dismiss("fr-doc");
      toast.error("Failed to prepare/queue the PDF. Try again.");
    }
  };

  const handleOpenCompose = () => {
    // Set a default email message when opening compose
    const firstName = (editableCustomer || "").split(" ")[0] || "there";
    const defaultMessage = `Hi ${firstName},

Thank you for choosing Crest Pest Control! Please find your pest control service report linked below.

If you have any questions about the service or findings, please don't hesitate to reach out to us.

Best regards,
${editableTech || "Your Technician"}
Crest Pest Control
(949) 424-5000`;
    setEmailMessage(defaultMessage);
    setShowComposeDialog(true);
  };

  const handleSendEmail = async () => {
    if (!customerEmail) {
      toast.error("Please enter customer email address");
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(customerEmail)) {
      toast.error("Please enter a valid email address");
      return;
    }

    setIsSendingEmail(true);
    try {
      // Save report first if not saved
      const rawMap = latestMapDataRef.current ?? mapData;
      let mapPayload: any = null;
      if (rawMap) {
        try {
          mapPayload = JSON.parse(rawMap);
        } catch (e) {
          mapPayload = rawMap;
        }
      }

      // Render the map with annotations to a static image
      const renderedMapUrl = await renderMapImage();

      const fullReportData = {
        technician_name: editableTech,
        customer_name: editableCustomer,
        address: editableAddress || extractedAddress || address,
        notes: todaysFindings || notes || null,
        findings: editableFindings,
        recommendations: editableRecommendations,
        next_steps: editableExpectations,
        map_url: coordinates
          ? `https://www.openstreetmap.org/?mlat=${coordinates.lat}&mlon=${coordinates.lng}#map=17/${coordinates.lat}/${coordinates.lng}`
          : null,
        map_data: mapPayload,
        custom_map_url: customMapImage,
        rendered_map_url: renderedMapUrl,
        property_images: propertyImages,
        service_date: editableServiceDate,
        license_number: editableLicenseNumber,
        target_pests: pestDisplayOrder(editableTargetPests),
        products_used: editableProductsUsed,
        equipment: editableEquipment,
        report_title: isRodentExclusion ? "Rodent Exclusion Report" : "Initial Pest Report",
        customer_key_areas: customerKeyAreas.length > 0 || customerKeyAreasNotes ? { areas: customerKeyAreas, notes: customerKeyAreasNotes } : null,
        customer_preferences: {
          preference: customerPreference,
          notes: customerPreferenceNotes,
          propertyType,
          companyName: companyName || undefined,
          ...(isRodentExclusion ? { reportFormat: "rodent-exclusion" } : {}),
          ...(fieldroutesLoginLink ? { fieldroutes_login_link: fieldroutesLoginLink } : {}),
          ...(beforePhotos.length > 0 || propertyImages.length > 0 ? { beforeAfter: { before: beforePhotos, pairLabels: normalizeRodentPairLabels(pairLabels, Math.max(beforePhotos.length, propertyImages.length)) } } : {}),
        },
        customer_email: customerEmail,
        customer_phone: customerPhone || null,
        fieldroutes_customer_id: fieldroutesCustomerId,
        sent_to_customer_at: new Date().toISOString(),
      };

      await ensureCustomerLink(fullReportData);

      let finalReportId = reportId;

      if (reportId) {
        const { error: updateError } = await supabase
          .from("reports")
          .update(fullReportData)
          .eq("id", reportId);

        if (updateError) throw updateError;
      } else {
        // Create new report if none exists
        const newId = crypto.randomUUID();
        const { error: insertError } = await supabase
          .from("reports")
          .insert([{ id: newId, ...fullReportData }]);

        if (insertError) throw insertError;
        finalReportId = newId;
        navigate(`/initial-pest-report/${newId}`, { replace: true });
      }

      // Generate PDF to attach (only if toggle is on)
      let pdfBase64: string | undefined;
      if (includePdf) {
        toast.info("Generating PDF for email...", { duration: 15000, id: "pdf-email" });
        try {
          let freshMapImage: string | null = null;
          const emailExportFn = (window as any).exportMapAsImage;
          if (emailExportFn) {
            const freshRender = await emailExportFn();
            if (freshRender) {
              freshMapImage = freshRender;
              setRenderedMapImage(freshRender);
            }
          }

          const pdfBytes = await buildCurrentInitialPdf(freshMapImage);

          setPdfExportMode(false);
          const binary = Array.from(pdfBytes as Uint8Array).map((b: number) => String.fromCharCode(b)).join("");
          pdfBase64 = btoa(binary);
        } catch (pdfErr) {
          setPdfExportMode(false);
          console.warn("PDF generation failed, sending email without attachment:", pdfErr);
        }
        toast.dismiss("pdf-email");
      }

      const { data, error } = await supabase.functions.invoke("send-report-email", {
        body: {
          customerEmail,
          ccEmails: ccEmails.length > 0 ? ccEmails : undefined,
          customerName: editableCustomer,
          technicianName: editableTech,
          address: editableAddress || extractedAddress || address || "",
          reportUrl: `${window.location.origin}/view-report/${finalReportId}`,
          emailSubject,
          emailMessage,
          buttonText: "View Your Report",
          baseUrl: window.location.origin,
          reportType: "initial",
          ...(pdfBase64 ? {
            pdfBase64,
            pdfFilename: `Crest_Initial_Report_${(editableCustomer || "Customer").replace(/\s+/g, "_")}.pdf`,
          } : {}),
        },
      });

      if (error) throw error;

      toast.success(`Report saved and sent to ${customerEmail}`);
      setShowComposeDialog(false);
    } catch (error: any) {
      console.error("Error sending email:", error);
      toast.error("Failed to save or send email. Please try again.");
    } finally {
      setIsSendingEmail(false);
    }
  };

  const displayAddress = editableAddress || extractedAddress || address || "Not provided";

  const updateItem = (index: number, value: string, setter: React.Dispatch<React.SetStateAction<string[]>>) => {
    setter((prev) => {
      const newArr = [...prev];
      newArr[index] = value;
      return newArr;
    });
  };

  const mapUrl = staticMapUrl || "";

  const handleZoomIn = () => setZoomLevel((prev) => Math.min(prev + 1, 22));
  const handleZoomOut = () => setZoomLevel((prev) => Math.max(prev - 0.5, 15));

  const panBy = (dxPx: number, dyPx: number) => {
    setCoordinates((prev) => {
      if (!prev) return prev;
      const latRad = (prev.lat * Math.PI) / 180;
      const metersPerPixel = (156543.03392 * Math.cos(latRad)) / Math.pow(2, zoomLevel);
      const metersX = dxPx * metersPerPixel;
      const metersY = dyPx * metersPerPixel;
      const deltaLng = metersX / (111320 * Math.cos(latRad));
      const deltaLat = -metersY / 110540;
      return { lat: prev.lat + deltaLat, lng: prev.lng + deltaLng };
    });
  };

  const handleCustomMapUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    console.log("[upload] custom map selected", {
      name: file?.name,
      type: file?.type,
      size: file?.size,
    });
    if (!file) return;

    if (file.type && !file.type.startsWith("image/")) {
      toast.error("Please upload an image file");
      return;
    }

    if (file.size === 0) {
      toast.error("That photo isn't downloaded to this iPad yet (iCloud). Open Photos, download it, then try again.");
      return;
    }

    try {
      const { ext, contentType } = inferImageUploadMeta(file);
      const fileName = `${Math.random()}.${ext}`;
      const filePath = `${reportId || "temp"}/custom-map/${fileName}`;

      const { error: uploadError, data } = await supabase.storage
        .from("report-images")
        .upload(filePath, file, { upsert: true, contentType });

      if (uploadError) throw uploadError;

      const {
        data: { publicUrl },
      } = supabase.storage.from("report-images").getPublicUrl(filePath);

      setCustomMapImage(publicUrl);
      pendingAutoSaveRef.current = true;
      toast.success("Custom map image uploaded");
    } catch (error) {
      console.error("Error uploading map:", error);
      toast.error("Failed to upload map image");
    }
  };

  const handlePropertyImagesUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    console.log("[upload] property images selected", {
      count: files?.length,
      types: files ? Array.from(files).slice(0, 12).map((f) => f.type) : [],
    });
    if (!files) return;

    const fileArray = Array.from(files).slice(0, 12);

    if (fileArray.some((file) => file.size === 0)) {
      toast.error("One of the selected photos isn't downloaded to this iPad yet (iCloud). Download it in Photos and try again.");
      return;
    }

    if (fileArray.some((file) => file.type && !file.type.startsWith("image/"))) {
      toast.error("Please upload only image files");
      return;
    }

    try {
      const uploadPromises = fileArray.map(async (file) => {
        const { ext, contentType } = inferImageUploadMeta(file);
        
        // Compress image to reduce file size
        let uploadBlob: Blob = file;
        try {
          const compressed = await compressImage(file, { maxWidth: 1600, maxHeight: 1600, quality: 0.7 });
          uploadBlob = compressed.blob;
          URL.revokeObjectURL(compressed.localUrl);
        } catch (compressErr) {
          console.warn("Image compression failed, uploading original:", compressErr);
        }
        
        const fileName = `${Math.random()}.${ext}`;
        const filePath = `${reportId || "temp"}/property/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from("report-images")
          .upload(filePath, uploadBlob, { upsert: true, contentType });


        if (uploadError) throw uploadError;

        const {
          data: { publicUrl },
        } = supabase.storage.from("report-images").getPublicUrl(filePath);

        return { image: publicUrl, caption: "" };
      });

      const uploadedImages = await Promise.all(uploadPromises);
      setPropertyImages(uploadedImages);
      pendingAutoSaveRef.current = true;
      toast.success(`${fileArray.length} image(s) uploaded`);
    } catch (error) {
      console.error("Error uploading images:", error);
      toast.error("Failed to upload images");
    }
  };

  const updateImageCaption = (index: number, caption: string) => {
    setPropertyImages((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], caption };
      return updated;
    });
  };

  // Append-style uploader used by the Rodent Exclusion / Attic grouped photo
  // capture panel. `kind` decides whether the photos land as Before photos
  // (beforePhotos) or After photos (propertyImages).
  const handleRodentGroupUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    kind: "before" | "after",
  ) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const existingCount = kind === "before" ? beforePhotos.length : propertyImages.length;
    const fileArray = Array.from(files).slice(0, 20 - existingCount);
    if (fileArray.length === 0) {
      toast.error("Maximum 20 images allowed");
      e.currentTarget.value = "";
      return;
    }
    if (fileArray.some((file) => file.size === 0)) {
      toast.error("One of the selected photos isn't downloaded yet (iCloud). Download it in Photos and try again.");
      e.currentTarget.value = "";
      return;
    }
    if (fileArray.some((file) => file.type && !file.type.startsWith("image/"))) {
      toast.error("Please upload only image files");
      e.currentTarget.value = "";
      return;
    }
    try {
      const uploadPromises = fileArray.map(async (file) => {
        const { ext, contentType } = inferImageUploadMeta(file);
        let uploadBlob: Blob = file;
        try {
          const compressed = await compressImage(file, { maxWidth: 1600, maxHeight: 1600, quality: 0.7 });
          uploadBlob = compressed.blob;
          URL.revokeObjectURL(compressed.localUrl);
        } catch (compressErr) {
          console.warn("Image compression failed, uploading original:", compressErr);
        }
        const fileName = `${Math.random()}.${ext}`;
        const filePath = `${reportId || "temp"}/property/${fileName}`;
        const { error: uploadError } = await supabase.storage
          .from("report-images")
          .upload(filePath, uploadBlob, { upsert: true, contentType });
        if (uploadError) throw uploadError;
        const {
          data: { publicUrl },
        } = supabase.storage.from("report-images").getPublicUrl(filePath);
        return { image: publicUrl, caption: "" };
      });
      const uploadedImages = await Promise.all(uploadPromises);
      // Fill empty slots first (so newly uploaded photos pair with existing
      // photos in the other column that don't have a partner yet), then append.
      const fillThenAppend = (prev: Array<{ image: string; caption?: string }>) => {
        const next = [...prev];
        let queue = [...uploadedImages];
        for (let i = 0; i < next.length && queue.length > 0; i++) {
          if (!next[i]?.image) {
            const u = queue.shift()!;
            next[i] = { ...u, caption: next[i]?.caption || u.caption || "" };
          }
        }
        return [...next, ...queue];
      };
      if (kind === "before") setBeforePhotos(fillThenAppend);
      else setPropertyImages(fillThenAppend);
      pendingAutoSaveRef.current = true;
      toast.success(`${uploadedImages.length} ${kind} photo(s) added`);
    } catch (error) {
      console.error("Error uploading rodent group images:", error);
      toast.error("Failed to upload images");
    } finally {
      e.currentTarget.value = "";
    }
  };

  // Upload a photo into a specific pair slot (Before or After column) so it
  // pairs visually with the photo at the same index in the other column. Pads
  // empty slots as needed so the photo can land at the requested index even
  // when earlier pairs are still missing.
  const handlePairUploadAtIndex = async (
    e: React.ChangeEvent<HTMLInputElement>,
    targetIndex: number,
    kind: "before" | "after",
  ) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    const valid = files.filter((f) => {
      if (f.size === 0) {
        toast.error("A photo isn't downloaded yet (iCloud). Download it in Photos and try again.");
        return false;
      }
      if (f.type && !f.type.startsWith("image/")) return false;
      return true;
    });
    if (valid.length === 0) {
      e.currentTarget.value = "";
      return;
    }
    try {
      const uploaded = await Promise.all(
        valid.map(async (file) => {
          const { ext, contentType } = inferImageUploadMeta(file);
          let uploadBlob: Blob = file;
          try {
            const compressed = await compressImage(file, { maxWidth: 1600, maxHeight: 1600, quality: 0.7 });
            uploadBlob = compressed.blob;
            URL.revokeObjectURL(compressed.localUrl);
          } catch (compressErr) {
            console.warn("Image compression failed, uploading original:", compressErr);
          }
          const fileName = `${Math.random()}.${ext}`;
          const filePath = `${reportId || "temp"}/property/${fileName}`;
          const { error: uploadError } = await supabase.storage
            .from("report-images")
            .upload(filePath, uploadBlob, { upsert: true, contentType });
          if (uploadError) throw uploadError;
          const { data: { publicUrl } } = supabase.storage.from("report-images").getPublicUrl(filePath);
          return publicUrl;
        }),
      );
      const placeAtIndex = (prev: Array<{ image: string; caption?: string }>) => {
        const next = [...prev];
        let cursor = targetIndex;
        for (const url of uploaded) {
          while (next.length <= cursor) next.push({ image: "" });
          next[cursor] = { image: url, caption: next[cursor]?.caption || "" };
          cursor += 1;
        }
        return next;
      };
      if (kind === "before") setBeforePhotos(placeAtIndex);
      else setPropertyImages(placeAtIndex);
      pendingAutoSaveRef.current = true;
      toast.success(`${uploaded.length} ${kind} photo${uploaded.length > 1 ? "s" : ""} added`);
    } catch (error) {
      console.error("Error uploading pair image:", error);
      toast.error("Failed to upload image");
    } finally {
      e.currentTarget.value = "";
    }
  };

  const clearAfterAtIndex = (targetIndex: number) => {
    setPropertyImages((prev) => {
      const next = [...prev];
      if (targetIndex < next.length) {
        // If trailing slots become empty, trim them so we don't grow forever.
        next[targetIndex] = { image: "" };
        while (next.length > 0 && !next[next.length - 1].image) next.pop();
      }
      return next;
    });
    pendingAutoSaveRef.current = true;
  };

  const clearBeforeAtIndex = (targetIndex: number) => {
    setBeforePhotos((prev) => {
      const next = [...prev];
      if (targetIndex < next.length) {
        next[targetIndex] = { image: "" };
        while (next.length > 0 && !next[next.length - 1].image) next.pop();
      }
      return next;
    });
    pendingAutoSaveRef.current = true;
  };

  // Drag-and-drop swap helpers — let the tech reorder Before tiles or After
  // tiles to re-pair them without re-uploading. We swap within the same
  // column (Before<->Before, After<->After); pairing is by index.
  const swapBeforeAt = (from: number, to: number) => {
    if (from === to) return;
    setBeforePhotos((prev) => {
      const next = [...prev];
      const max = Math.max(from, to);
      while (next.length <= max) next.push({ image: "" });
      [next[from], next[to]] = [next[to], next[from]];
      return next;
    });
    pendingAutoSaveRef.current = true;
  };
  const swapAfterAt = (from: number, to: number) => {
    if (from === to) return;
    setPropertyImages((prev) => {
      const next = [...prev];
      const max = Math.max(from, to);
      while (next.length <= max) next.push({ image: "" });
      [next[from], next[to]] = [next[to], next[from]];
      return next;
    });
    pendingAutoSaveRef.current = true;
  };

  // Touch-friendly: move the After photo in a slot up/down by one position.
  // Works on iPad where native HTML5 drag-and-drop is unreliable.
  const moveAfterBy = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0) return;
    setPropertyImages((prev) => {
      const next = [...prev];
      while (next.length <= Math.max(index, target)) next.push({ image: "" });
      [next[index], next[target]] = [next[target], next[index]];
      while (next.length > 0 && !next[next.length - 1].image) next.pop();
      return next;
    });
    pendingAutoSaveRef.current = true;
  };

  // Remove an entire pair (Before + After + Label) at the given index.
  const deletePairAt = (index: number) => {
    setBeforePhotos((prev) => {
      const next = [...prev];
      if (index < next.length) next.splice(index, 1);
      return next;
    });
    setPropertyImages((prev) => {
      const next = [...prev];
      if (index < next.length) next.splice(index, 1);
      return next;
    });
    setPairLabels((prev) => {
      const next = [...prev];
      if (index < next.length) next.splice(index, 1);
      return next;
    });
    pendingAutoSaveRef.current = true;
  };

  // Update the editable label for a specific pair (e.g. "Entry Point #1").
  const setPairLabelAt = (index: number, value: string) => {
    setPairLabels((prev) => {
      const next = [...prev];
      while (next.length <= index) next.push("");
      next[index] = value;
      return next;
    });
    pendingAutoSaveRef.current = true;
  };

  const moveAfterToIndex = (from: number, toValue: string) => {
    const to = Number.parseInt(toValue, 10);
    if (!Number.isFinite(to)) return;
    swapAfterAt(from, to);
  };

  // Handle pasting images from clipboard for custom map
  const handleMapPaste = async (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (const item of items) {
      if (item.type.startsWith("image/")) {
        e.preventDefault();
        const file = item.getAsFile();
        if (!file) continue;

        try {
          const { ext, contentType } = inferImageUploadMeta(file);
          const fileName = `${Math.random()}.${ext}`;
          const filePath = `${reportId || "temp"}/custom-map/${fileName}`;

          const { error: uploadError } = await supabase.storage
            .from("report-images")
            .upload(filePath, file, { upsert: true, contentType });

          if (uploadError) throw uploadError;

          const {
            data: { publicUrl },
          } = supabase.storage.from("report-images").getPublicUrl(filePath);

          setCustomMapImage(publicUrl);
          pendingAutoSaveRef.current = true;
          toast.success("Map pasted successfully");
        } catch (error) {
          console.error("Error pasting map:", error);
          toast.error("Failed to paste map image");
        }
        break;
      }
    }
  };

  // Handle pasting images from clipboard for property images
  const handlePropertyImagesPaste = async (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    const imageFiles: File[] = [];
    for (const item of items) {
      if (item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) imageFiles.push(file);
      }
    }

    if (imageFiles.length === 0) return;
    e.preventDefault();

    // Limit to 5 images total for this report type
    const maxNew = Math.min(imageFiles.length, 20 - propertyImages.length);
    if (maxNew <= 0) {
      toast.error("Maximum 20 images allowed");
      return;
    }

    const filesToProcess = imageFiles.slice(0, maxNew);

    try {
      const uploadPromises = filesToProcess.map(async (file) => {
        const { ext, contentType } = inferImageUploadMeta(file);
        const fileName = `${Math.random()}.${ext}`;
        const filePath = `${reportId || "temp"}/property/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from("report-images")
          .upload(filePath, file, { upsert: true, contentType });

        if (uploadError) throw uploadError;

        const {
          data: { publicUrl },
        } = supabase.storage.from("report-images").getPublicUrl(filePath);

        return { image: publicUrl, caption: "" };
      });

      const uploadedImages = await Promise.all(uploadPromises);
      setPropertyImages(prev => [...prev, ...uploadedImages]);
      pendingAutoSaveRef.current = true;
      toast.success(`${filesToProcess.length} image(s) pasted`);
    } catch (error) {
      console.error("Error pasting images:", error);
      toast.error("Failed to paste images");
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile Header */}
      {isMobile && (
        <div className="print-header bg-gradient-primary border-b-2 border-foreground px-4 py-3 sticky top-0 z-20">
          <div className="flex items-center justify-between">
            <img src={crestLogo} alt="Crest" className="h-10 no-print-compress" />
            <div className="flex gap-2 no-print">
              <Button size="sm" variant="secondary" onClick={handleOpenCompose} className="h-9">
                <Mail className="w-4 h-4" />
              </Button>
              <Button size="sm" variant="default" onClick={handleSubmit} disabled={isSaving} className="h-9">
                {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </Button>
              <Button size="sm" variant="outline" onClick={exportToPDF} className="h-9">
                <FileDown className="w-4 h-4" />
              </Button>
              <Button size="sm" onClick={() => navigate("/")} variant="outline" className="h-9">
                <Home className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Desktop Header */}
      {!isMobile && (
        <div data-pdf-page="0" data-pdf-capture="0" data-report-type="initial-pest" className="print-header bg-gradient-to-r from-sage/40 via-sage/15 to-sage/35 shadow-md border-b-2 border-dark-sage px-6 py-2 md:sticky md:top-0 md:z-20 lg:static">
          <div className="max-w-[1800px] mx-auto">
            {/* Action buttons row for iPad - shown at top on medium screens */}
            <div className="hidden md:flex lg:hidden items-center gap-2 no-print mb-1 flex-wrap">
              <Button onClick={handleOpenCompose} variant="secondary" size="sm"><Mail className="w-3 h-3 mr-1" />Email</Button>
              <Button onClick={handleSubmit} disabled={isSaving} size="sm">
                {isSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3 mr-1" />}Save
              </Button>
              <Button onClick={exportToPDF} variant="outline" size="sm"><FileDown className="w-3 h-3 mr-1" />PDF</Button>
              {!!localStorage.getItem("admin_session") && (
                <Button onClick={sendReportToFieldRoutes} variant="outline" size="sm">Send to FieldRoutes</Button>
              )}
              <Button onClick={() => navigate("/")} variant="outline" size="sm"><Home className="w-3 h-3" /></Button>
            </div>

            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-4 flex-1">
                <div className="flex flex-col items-center shrink-0">
                  <img src={crestLogo} alt="Crest Pest Control" className="h-14 w-auto min-w-[60px] no-print-compress" />
                  <span className="text-[10px] text-muted-foreground">PR #9859</span>
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-4 mb-1">
                    <h1 className="text-2xl font-bold text-foreground whitespace-nowrap">
                      {isRodentExclusion ? "Rodent Exclusion Report" : "Initial Pest Report"}
                    </h1>
                  </div>

                  {/* FieldRoutes customer link — search & select to autofill + link */}
                  <div className="mb-3 no-print">
                    <p className="text-xs font-medium text-muted-foreground mb-1">FieldRoutes customer</p>
                    <CustomerPicker
                      staffName={currentStaff?.fullName}
                      linkedId={fieldroutesCustomerId}
                      linkedLabel={editableCustomer || null}
                      onSelect={(c) => {
                        setFieldroutesCustomerId(c.customer_id);
                        setFieldroutesLoginLink(c.loginLink || null);
                        if (c.name || c.company_name) setEditableCustomer(c.name || c.company_name || "");
                        if (c.email) setCustomerEmail(c.email);
                        if (c.phone) setCustomerPhone(c.phone);
                        const addr = [c.address, [c.city, c.state].filter(Boolean).join(", "), c.zip]
                          .filter(Boolean).join(", ");
                        if (addr) { setEditableAddress(addr); setExtractedAddress(addr); }
                      }}
                      onClear={() => { setFieldroutesCustomerId(null); setFieldroutesLoginLink(null); }}
                    />
                    {fieldroutesCustomerId && (
                      <div className="mt-2">
                        <p className="text-[11px] font-medium text-muted-foreground mb-1">
                          Customer Portal loginLink (paste from FieldRoutes — used by the "Open Customer Portal" button)
                        </p>
                        <Input
                          value={fieldroutesLoginLink ?? ""}
                          onChange={(e) => setFieldroutesLoginLink(e.target.value.trim() || null)}
                          placeholder="https://crestpest.pestportals.com/?loginHash=…"
                          className="text-xs font-mono"
                        />
                      </div>
                    )}
                  </div>

                  {/* Prominent "Open Customer Portal" button — appears once the
                      FieldPortals {loginlink} for the linked customer is known. */}
                  {fieldroutesLoginLink && (
                    <div className="mb-3">
                      <a
                        href={fieldroutesLoginLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-between gap-3 rounded-xl border border-primary/40 bg-primary/10 px-4 py-2 hover:bg-primary/15 transition-colors no-underline"
                      >
                        <div className="min-w-0">
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-primary/80">Customer Portal</p>
                          <p className="text-xs font-bold text-foreground truncate">
                            Open Customer Portal &nbsp;→&nbsp; manage account &amp; add a payment method in Wallet
                          </p>
                        </div>
                        <span className="hidden sm:inline-flex items-center rounded-md bg-foreground text-background text-[11px] font-bold px-2.5 py-1">
                          Open
                        </span>
                      </a>
                    </div>
                  )}

                  <div className="flex flex-col lg:flex-row gap-2 lg:gap-6 text-xs">
                    <div className="flex-[2] space-y-0">
                      <div className="flex items-center gap-1">
                        <span className="text-muted-foreground w-16 shrink-0">Name:</span>
                        <Input
                          value={editableCustomer}
                          onChange={(e) => setEditableCustomer(e.target.value)}
                          placeholder="Customer name"
                          className="bg-transparent border-b border-border text-foreground placeholder:text-muted-foreground px-1 h-5 text-xs flex-1 focus-visible:ring-0 no-print rounded-none"
                        />
                        <span className="print-only-text hidden text-foreground">{editableCustomer || "Customer name"}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-muted-foreground w-16 shrink-0">Address:</span>
                        <Input
                          value={editableAddress || extractedAddress}
                          onChange={(e) => setEditableAddress(e.target.value)}
                          placeholder="Enter address"
                          className="bg-transparent border-b border-border text-foreground placeholder:text-muted-foreground px-1 h-5 text-xs flex-1 focus-visible:ring-0 no-print rounded-none"
                        />
                        <span className="print-only-text hidden text-foreground">{displayAddress}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-muted-foreground w-16 shrink-0">Date:</span>
                        <Input
                          type="date"
                          value={editableServiceDate}
                          onChange={(e) => setEditableServiceDate(e.target.value)}
                          className="bg-transparent border-b border-border text-foreground px-1 h-5 text-xs w-28 focus-visible:ring-0 no-print rounded-none"
                        />
                        <span className="print-only-text hidden text-foreground">{editableServiceDate}</span>
                      </div>
                    </div>

                    <div className="flex-1 space-y-0">
                      <div className="flex items-center gap-1">
                        <span className="text-muted-foreground w-16 shrink-0">Tech:</span>
                        <Popover open={techDropdownOpen} onOpenChange={setTechDropdownOpen}>
                          <PopoverTrigger asChild>
                            <Button
                              variant="ghost"
                              role="combobox"
                              aria-expanded={techDropdownOpen}
                              className="h-5 px-1 text-xs justify-between bg-transparent border-b border-border rounded-none hover:bg-transparent focus-visible:ring-0 flex-1 no-print"
                            >
                              {editableTech || "Select technician"}
                              <ChevronsUpDown className="ml-1 h-3 w-3 shrink-0 opacity-50" />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-[200px] p-0 z-50 bg-background border border-border" onOpenAutoFocus={(e) => e.preventDefault()} onPointerDownOutside={(e) => e.preventDefault()}>
                            <Command>
                              <CommandInput placeholder="Search technician..." className="h-8 text-xs" />
                              <CommandList>
                                <CommandEmpty>No technician found.</CommandEmpty>
                                <CommandGroup>
                                  {TECHNICIANS.map((tech) => (
                                    <CommandItem key={tech.name} value={tech.name} onSelect={handleTechnicianChange} className="text-xs">
                                      <Check className={cn("mr-2 h-3 w-3", editableTech === tech.name ? "opacity-100" : "opacity-0")} />
                                      {tech.name}
                                    </CommandItem>
                                  ))}
                                </CommandGroup>
                              </CommandList>
                            </Command>
                          </PopoverContent>
                        </Popover>
                        <span className="print-only-text hidden">{editableTech}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-muted-foreground w-16 shrink-0">License:</span>
                        <span className="text-foreground text-xs">{editableLicenseNumber || "—"}</span>
                      </div>
                      <div className="flex items-center gap-1 no-print">
                        <span className="text-muted-foreground w-16 shrink-0">Email:</span>
                        <Input
                          type="email"
                          value={customerEmail}
                          onChange={(e) => setCustomerEmail(e.target.value)}
                          placeholder="customer@email.com"
                          className="bg-transparent border-b border-border text-foreground placeholder:text-muted-foreground px-1 h-5 text-xs flex-1 focus-visible:ring-0 no-print rounded-none"
                        />
                      </div>
                      <div className="flex items-center gap-1 no-print">
                        <span className="text-muted-foreground w-16 shrink-0">Type:</span>
                        <Select value={propertyType} onValueChange={setPropertyType}>
                          <SelectTrigger className="bg-transparent border-b border-border text-foreground h-5 text-xs flex-1 focus:ring-0 [&>svg]:h-3 [&>svg]:w-3 rounded-none">
                            <SelectValue placeholder="Select type" />
                          </SelectTrigger>
                          <SelectContent>
                            {PROPERTY_TYPES.map((type) => (
                              <SelectItem key={type} value={type} className="text-xs">
                                {type}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      {propertyType !== "Residential" && (
                        <div className="flex items-center gap-1 no-print">
                          <span className="text-muted-foreground w-16 shrink-0">Company:</span>
                          <Input
                            value={companyName}
                            onChange={(e) => setCompanyName(e.target.value)}
                            placeholder="Company name (optional)"
                            className="bg-transparent border-b border-border text-foreground placeholder:text-muted-foreground px-1 h-5 text-xs flex-1 focus-visible:ring-0 no-print rounded-none"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex gap-1.5 no-print shrink-0">
                <Button onClick={handleOpenCompose} variant="secondary" size="sm" className="h-7 px-2 text-xs hidden lg:flex">
                  <Mail className="w-3 h-3 mr-1" />Email
                </Button>
                <Button onClick={handleSubmit} disabled={isSaving} variant="default" size="sm" className="h-7 px-2 text-xs hidden lg:flex">
                  {isSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3 mr-1" />}Save
                </Button>
                <Button onClick={exportToPDF} variant="outline" size="sm" className="h-7 px-2 text-xs hidden lg:flex">
                  <FileDown className="w-3 h-3 mr-1" />PDF
                </Button>
                {!!localStorage.getItem("admin_session") && (
                  <Button onClick={sendReportToFieldRoutes} variant="outline" size="sm" className="h-7 px-2 text-xs hidden lg:flex">
                    Send to FieldRoutes
                  </Button>
                )}
                <Button onClick={() => navigate("/")} variant="outline" size="icon" className="h-7 w-7 hidden lg:flex">
                  <Home className="w-3 h-3" />
                </Button>
              </div>
            </div>

            {/* Purpose Text - condensed */}
            <p className="mt-1 text-[10px] text-foreground leading-tight opacity-80">
              We appreciate you entrusting Crest with your pest control needs. We've created this educational report to help you get one step closer to living a pest-free life. Call <span className="font-semibold">949-424-5000</span> with any questions.
            </p>
          </div>
        </div>
      )}



      {/* Main Content */}
      <div data-pdf-page="1" data-pdf-capture="1" data-report-type="initial-pest" className={`print-layout ${isMobileOrTablet ? "flex flex-col" : "flex min-h-[calc(100vh-88px)]"}`}>
        {/* Map Section - Fixed 3:4 aspect ratio for consistency across devices */}
        <div
          className={`print-map-container ${
            isMobileOrTablet ? "w-full max-w-[506px] mx-auto px-4 py-2" : "flex-none p-4"
          }`}
          style={!isMobileOrTablet ? { width: 'min(130mm, calc((100vh - 88px) * 0.75))', maxWidth: '42%' } : undefined}
        >
          <div 
            className="relative w-full bg-sage rounded-lg print-map-aspect" 
            style={{ paddingBottom: "133%" }}
            onPaste={handleMapPaste}
            tabIndex={0}
          > {/* 3:4 aspect ratio (taller) */}
            <div className="absolute inset-0">
              {isProcessing && (
                <div className="no-print absolute inset-0 bg-background/80 flex items-center justify-center z-10 rounded-lg">
                  <div className="text-center">
                    <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto mb-4" />
                    <p className="text-foreground font-semibold">Processing Map...</p>
                  </div>
                </div>
              )}

              {mapUrl || customMapImage ? (
                <div className="relative h-full w-full">
                  {pdfExportMode && renderedMapImage ? (
                    <img src={renderedMapImage} alt="Property map with annotations" className="w-full h-full object-cover" />
                  ) : (
                    <MapCanvas
                      key={customMapImage ? `custom-${customMapImage}` : `map-${mapUrl}`}
                      mapUrl={customMapImage || mapUrl}
                      onSave={setMapData}
                      onExportImage={setRenderedMapImage}
                      initialData={mapData}
                    />
                  )}

                  {/* Upload custom map button */}
                  <div className="no-print absolute top-4 right-4 z-20">
                    <div className="relative inline-flex">
                      <Button size="sm" variant="secondary" type="button">
                        <FileDown className="w-4 h-4 mr-2" />
                        Upload Map
                      </Button>
                      <input
                        id="custom-map-upload"
                        type="file"
                        accept="image/*"
                        onClick={(e) => {
                          (e.currentTarget as HTMLInputElement).value = "";
                        }}
                        onChange={handleCustomMapUpload}
                        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                        aria-label="Upload map image"
                      />
                    </div>
                  </div>

                  {/* Pan controls - only show when using coordinates-based map */}
                  {coordinates && !customMapImage && (
                    <div className="no-print absolute bottom-4 left-4 flex gap-3 z-20">
                      <div className="flex flex-col gap-2">
                        <Button size="icon" variant="secondary" onClick={() => panBy(0, -100)} title="Pan up">
                          <ArrowUp className="w-4 h-4" />
                        </Button>
                        <div className="flex gap-2">
                          <Button size="icon" variant="secondary" onClick={() => panBy(-100, 0)} title="Pan left">
                            <ArrowLeft className="w-4 h-4" />
                          </Button>
                          <Button size="icon" variant="secondary" onClick={() => panBy(100, 0)} title="Pan right">
                            <ArrowRight className="w-4 h-4" />
                          </Button>
                        </div>
                        <Button size="icon" variant="secondary" onClick={() => panBy(0, 100)} title="Pan down">
                          <ArrowDown className="w-4 h-4" />
                        </Button>
                      </div>

                      {/* Zoom controls */}
                      <div className="flex flex-col gap-2">
                        <Button size="icon" variant="default" onClick={handleZoomIn} aria-label="Zoom in" title="Zoom in">
                          <Plus className="w-4 h-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="secondary"
                          onClick={handleZoomOut}
                          aria-label="Zoom out"
                          title="Zoom out"
                        >
                          <Minus className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center bg-muted border-2 border-dashed border-border rounded-lg">
                  {isProcessing ? (
                    <div className="text-center">
                      <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto mb-4" />
                      <p className="text-foreground font-semibold">Processing location...</p>
                    </div>
                  ) : (
                    <div className="text-center p-8">
                      <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                        <FileDown className="w-8 h-8 text-primary" />
                      </div>
                      <p className="text-lg font-semibold text-foreground mb-2">No Map Image</p>
                      <p className="text-sm text-muted-foreground mb-4">Upload or paste a property map/satellite image</p>
                      <div className="relative inline-flex">
                        <Button variant="default" type="button">
                          <FileDown className="w-4 h-4 mr-2" />
                          Upload Map Image
                        </Button>
                        <input
                          id="custom-map-upload-empty"
                          type="file"
                          accept="image/*"
                          onClick={(e) => {
                            (e.currentTarget as HTMLInputElement).value = "";
                          }}
                          onChange={handleCustomMapUpload}
                          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                          aria-label="Upload map image"
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className={isMobileOrTablet ? "flex-1 overflow-y-auto pb-32" : "flex-1 min-w-0 overflow-y-auto"}>
          <div className="p-3 md:p-4 space-y-3">
            {/* Mobile/Tablet: Customer & Technician - hidden in print */}
            {isMobileOrTablet && (
              <Card className="p-4 no-print">
                <div className="space-y-3">
                  <div>
                    <label className="text-sm font-medium mb-1 block">Customer Name</label>
                    <Input
                      value={editableCustomer}
                      onChange={(e) => setEditableCustomer(e.target.value)}
                      placeholder="Enter customer name"
                      className="text-base"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1 block">Technician Name</label>
                    <Popover open={techDropdownOpen} onOpenChange={setTechDropdownOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          role="combobox"
                          aria-expanded={techDropdownOpen}
                          className="w-full justify-between text-base"
                        >
                          {editableTech || "Select technician"}
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-full p-0 z-50 bg-background border border-border" onOpenAutoFocus={(e) => e.preventDefault()} onPointerDownOutside={(e) => e.preventDefault()}>
                        <Command>
                          <CommandInput placeholder="Search technician..." />
                          <CommandList>
                            <CommandEmpty>No technician found.</CommandEmpty>
                            <CommandGroup>
                              {TECHNICIANS.map((tech) => (
                                <CommandItem
                                  key={tech.name}
                                  value={tech.name}
                                  onSelect={handleTechnicianChange}
                                >
                                  <Check
                                    className={cn(
                                      "mr-2 h-4 w-4",
                                      editableTech === tech.name ? "opacity-100" : "opacity-0"
                                    )}
                                  />
                                  {tech.name}
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1 block">Address</label>
                    <Input
                      value={editableAddress || extractedAddress}
                      onChange={(e) => setEditableAddress(e.target.value)}
                      placeholder="Enter address"
                      className="text-base"
                    />
                  </div>
                  {editableLicenseNumber && (
                    <div className="text-sm text-muted-foreground">
                      License: {editableLicenseNumber}
                    </div>
                  )}
                  <div>
                    <label className="text-sm font-medium mb-1 block">Property Type</label>
                    <Select value={propertyType} onValueChange={setPropertyType}>
                      <SelectTrigger className="text-base">
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent>
                        {PROPERTY_TYPES.map((type) => (
                          <SelectItem key={type} value={type}>{type}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {propertyType !== "Residential" && (
                    <div>
                      <label className="text-sm font-medium mb-1 block">Company Name (Optional)</label>
                      <Input
                        value={companyName}
                        onChange={(e) => setCompanyName(e.target.value)}
                        placeholder="Enter company name"
                        className="text-base"
                      />
                    </div>
                  )}
                </div>
              </Card>
            )}

            {/* Target Pest(s) Section - Made more prominent */}
            <Card className="print-section p-0 overflow-visible border-2 border-primary/50">
              <div className="relative" ref={pestsDropdownRef}>
                <button
                  type="button"
                  onClick={() => setPestsDropdownOpen(!pestsDropdownOpen)}
                  className="print-section-header text-lg md:text-xl font-bold w-full flex items-center justify-between cursor-pointer bg-primary"
                >
                  <span className="flex items-center gap-2">
                    🎯 Target Pest(s)
                    <span className="text-sm font-normal opacity-80">— tap to select</span>
                  </span>
                  <ChevronDown
                    className={`w-6 h-6 text-white transition-transform no-print ${pestsDropdownOpen ? "rotate-180" : ""}`}
                  />
                </button>

                {pestsDropdownOpen && (
                  <div
                    className="absolute z-50 w-full mt-0 bg-background border-2 border-primary/30 rounded-b-md shadow-lg max-h-60 overflow-y-auto"
                    onMouseDown={(e) => e.stopPropagation()}
                  >
                    {PEST_OPTIONS.map((pest) => (
                      <button
                        key={pest}
                        type="button"
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setEditableTargetPests((prev) =>
                            prev.includes(pest) ? prev.filter((p) => p !== pest) : [...prev, pest],
                          );
                        }}
                        className={`w-full px-3 py-2.5 text-left text-sm hover:bg-muted flex items-center justify-between ${
                          editableTargetPests.includes(pest) ? "bg-primary/10 text-primary font-medium" : ""
                        }`}
                      >
                        {pest}
                        {editableTargetPests.includes(pest) && <span className="text-primary text-lg">✓</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {editableTargetPests.length > 0 && (
                <div className="print-tags flex flex-wrap gap-2 items-start content-start p-3 bg-background">
                  {pestDisplayOrder(editableTargetPests).map((pest) => (
                    <span
                      key={pest}
                      className="print-tag inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-sm font-medium bg-primary text-primary-foreground"
                    >
                      {pest}
                      <button
                        type="button"
                        onClick={() => setEditableTargetPests((prev) => prev.filter((p) => p !== pest))}
                        className="hover:bg-primary-foreground/20 rounded-full p-0.5 no-print"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              {editableTargetPests.length === 0 && (
                <div className="p-4 text-center text-muted-foreground animate-pulse no-print">
                  ☝️ Tap above to select target pests
                </div>
              )}
            </Card>

            {/* For rodent-exclusion variant, collapse all the structured
                sections (Key Areas, Preferences, Services Completed,
                Today's Findings, Recommendations, What to Expect) into a
                single big "Service Summary / Findings" card. */}
            {isRodentExclusion && (
              <Card className="print-section p-3 md:p-4">
                <h2 className="print-section-header text-lg md:text-xl font-bold mb-3 text-dark-sage">
                  Service Summary / Findings
                </h2>
                <div className="p-2 no-print">
                  <div className="mb-3">
                    <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
                      Quick add — tap a preset to append
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {[
                        "Inspected the attic, garage, crawl space, and exterior of the property for rodent activity and entry points.",
                        "Sealed identified entry points using steel wool, hardware cloth, and sealant to prevent re-entry.",
                        "Installed snap traps in high-activity areas; will monitor and adjust placement on follow-up visits.",
                        "Installed exterior rodent bait stations around the perimeter of the property.",
                        "Removed contaminated insulation from the attic and disposed of it per industry guidelines.",
                        "Vacuumed and sanitized the attic to remove rodent droppings and odors.",
                        "Blew in new TAP insulation to restore R-value and provide ongoing pest protection.",
                        "Advised customer to remove yard debris and trim vegetation away from the structure to reduce harborage.",
                      ].map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => {
                            const current = editableFindings[0] || "";
                            const line = `• ${preset}`;
                            if (current.includes(preset)) return;
                            const next = current.trim().length === 0 ? line : `${current.replace(/\s+$/, "")}\n${line}`;
                            setEditableFindings([next]);
                          }}
                          className="text-xs px-2.5 py-1 rounded-full border border-dark-sage/40 bg-sage/10 hover:bg-sage/30 transition-colors text-left max-w-[280px] truncate"
                          title={preset}
                        >
                          {preset.length > 48 ? preset.slice(0, 46) + "…" : preset}
                        </button>
                      ))}
                    </div>
                  </div>
                  <Textarea
                    value={editableFindings[0] || ""}
                    onChange={(e) => updateItem(0, e.target.value, setEditableFindings)}
                    placeholder="Describe the rodent exclusion / attic work completed, findings, entry points sealed, and anything the customer should know..."
                    className="text-sm resize-y min-h-[260px] leading-relaxed"
                    rows={12}
                  />
                </div>
                <div
                  className="hidden print-content-formatted p-2"
                  dangerouslySetInnerHTML={{
                    __html: (editableFindings[0] || "")
                      .replace(/^(.*?:)/gm, "<strong>$1</strong>")
                      .replace(/\n/g, "<br/>"),
                  }}
                />
              </Card>
            )}

            {/* Materials Used — rodent-exclusion only. Multi-select chips
                stored in editableEquipment so they persist via the existing
                equipment column without schema changes. */}
            {isRodentExclusion && (
              <Card className="print-section p-3 md:p-4">
                <h2 className="print-section-header text-lg md:text-xl font-bold mb-3">
                  Materials Used
                </h2>
                <div className="flex flex-wrap gap-2 p-2 no-print">
                  {[
                    "Steel Wool",
                    "Chicken Wire",
                    "Hardware Cloth",
                    "Expanding Foam",
                    "Sealant / Caulk",
                    "Grates / Vent Covers",
                    "Mesh Screen",
                    "Snap Traps",
                    "Glue Boards",
                    "Bait Boxes",
                    "TAP Insulation",
                    "Door Sweeps",
                  ].map((mat) => {
                    const selected = editableEquipment.includes(mat);
                    return (
                      <button
                        key={mat}
                        type="button"
                        onClick={() => {
                          setEditableEquipment((prev) =>
                            prev.includes(mat)
                              ? prev.filter((m) => m !== mat)
                              : [...prev, mat],
                          );
                        }}
                        className={cn(
                          "print-tag inline-flex items-center px-3 py-1.5 rounded-full text-sm font-medium border-2 transition-colors",
                          selected
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-background text-foreground border-border hover:border-dark-sage",
                        )}
                      >
                        {mat}
                      </button>
                    );
                  })}
                </div>
                {/* Print-only rendering of selected materials as non-button
                    chips — html2canvas hides <button> in the PDF export. */}
                <div className="hidden print-content-formatted print-tags flex flex-wrap gap-2 p-3">
                  {editableEquipment.length === 0 ? (
                    <span className="text-foreground">—</span>
                  ) : (
                    editableEquipment.map((mat) => (
                      <span
                        key={`print-${mat}`}
                        className="print-tag inline-flex items-center px-3 py-1.5 rounded-full text-sm font-medium bg-primary text-primary-foreground"
                      >
                        {mat}
                      </span>
                    ))
                  )}
                </div>
                {editableEquipment.length === 0 && (
                  <p className="text-xs text-muted-foreground p-2 no-print">
                    Tap to select materials used during the exclusion.
                  </p>
                )}
              </Card>
            )}

            {/* Customer Key Areas */}
            {!isRodentExclusion && (
            <>
            <Card className="print-section p-3 md:p-4">
              <h2 className="print-section-header text-lg md:text-xl font-bold mb-3">Customer Key Areas</h2>
              <div className="flex flex-wrap gap-2 p-2">
                {CUSTOMER_KEY_AREAS.map((area) => (
                  <button
                    key={area}
                    type="button"
                    onClick={() => {
                      setCustomerKeyAreas((prev) =>
                        prev.includes(area) ? prev.filter((a) => a !== area) : [...prev, area]
                      );
                    }}
                    className={`px-4 py-2 rounded-full text-sm font-medium border-2 transition-colors ${
                      customerKeyAreas.includes(area)
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background text-foreground border-border hover:border-primary/50"
                    }`}
                  >
                    {area === "Children" && "👶 "}
                    {area === "Pets" && "🐾 "}
                    {area === "Elderly" && "👴 "}
                    {area === "Garden" && "🌿 "}
                    {area}
                    {customerKeyAreas.includes(area) && " ✓"}
                  </button>
                ))}
              </div>
              <div className="px-2 pt-2">
                <Textarea
                  value={customerKeyAreasNotes}
                  onChange={(e) => setCustomerKeyAreasNotes(e.target.value)}
                  placeholder="Type additional key areas or notes..."
                  className="text-sm resize-y min-h-[50px] leading-relaxed"
                  rows={2}
                />
              </div>
              {(customerKeyAreas.length > 0 || customerKeyAreasNotes) && (
                <div className="hidden print-content-formatted p-3">
                  <p className="text-sm">
                    {customerKeyAreas.join(", ")}
                    {customerKeyAreas.length > 0 && customerKeyAreasNotes && " — "}
                    {customerKeyAreasNotes}
                  </p>
                </div>
              )}
            </Card>

            {/* Customer Preferences */}
            <Card className="print-section p-3 md:p-4">
              <h2 className="print-section-header text-lg md:text-xl font-bold mb-3">Customer Preferences</h2>
              <div className="space-y-3 p-2">
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setCustomerPreference(customerPreference === "Organic" ? "" : "Organic")}
                    className={`px-4 py-2 rounded-full text-sm font-medium border-2 transition-colors ${
                      customerPreference === "Organic"
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background text-foreground border-border hover:border-primary/50"
                    }`}
                  >
                    🌱 Organic {customerPreference === "Organic" && "✓"}
                  </button>
                </div>
                <Textarea
                  value={customerPreferenceNotes}
                  onChange={(e) => setCustomerPreferenceNotes(e.target.value)}
                  placeholder="Additional preferences or notes..."
                  className="text-sm resize-y min-h-[60px] leading-relaxed"
                  rows={2}
                />
              </div>
              {(customerPreference || customerPreferenceNotes) && (
                <div className="hidden print-content-formatted p-3">
                  <p className="text-sm">
                    {customerPreference && <span className="font-medium">{customerPreference}</span>}
                    {customerPreference && customerPreferenceNotes && <span> — </span>}
                    {customerPreferenceNotes && <span>{customerPreferenceNotes}</span>}
                  </p>
                </div>
              )}
            </Card>

            {/* Service Area Section */}
            <Card className="print-section p-3 md:p-4">
              <h2 className="print-section-header text-lg md:text-xl font-bold mb-3">Service Area</h2>
              
              {/* Services Completed subsection (was Findings) */}
              <div className="p-3 space-y-3">
                <h3 className="text-base font-semibold text-foreground border-b border-border pb-1">Services Completed</h3>
                {isAnalyzing ? (
                  <div className="text-center py-4">
                    <Loader2 className="w-6 h-6 animate-spin text-primary mx-auto mb-2" />
                    <p className="text-xs text-muted-foreground">Analyzing...</p>
                  </div>
                ) : (
                  <>
                    {editableTargetPests.length > 0 && (
                      <div className="no-print space-y-2">
                        {pestDisplayOrder(editableTargetPests)
                          .filter((p) => SERVICE_SNIPPETS[p]?.length)
                          .map((pest) => (
                            <div key={pest} className="space-y-1">
                              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                                {pest.startsWith("General Pests") ? "General Pests" : pest}
                              </p>
                              <div className="flex flex-wrap gap-1.5">
                                {SERVICE_SNIPPETS[pest].map((snip) => {
                                  const active = isFindingSnippetActive(snip);
                                  return (
                                    <button
                                      key={snip}
                                      type="button"
                                      onClick={() => toggleFindingSnippet(snip)}
                                      className={cn(
                                        "text-left text-xs px-2.5 py-1.5 rounded-full border transition-colors",
                                        active
                                          ? "bg-primary text-primary-foreground border-primary"
                                          : "bg-background text-foreground border-border hover:border-primary/50",
                                      )}
                                    >
                                      {active && "✓ "}
                                      {snip.replace(/^•\s*/, "")}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          ))}
                        {editableTargetPests.every((p) => !SERVICE_SNIPPETS[p]?.length) && (
                          <p className="text-xs text-muted-foreground italic">
                            No preset snippets for the selected pests — type your own below.
                          </p>
                        )}
                      </div>
                    )}
                    <Textarea
                      value={editableFindings[0] || ""}
                      onChange={(e) => {
                        updateItem(0, e.target.value, setEditableFindings);
                        setHasManuallyEditedFindings(true);
                      }}
                      placeholder="Enter services completed..."
                      className="text-sm resize-y min-h-[100px] leading-relaxed no-print"
                      rows={4}
                    />
                    <div
                      className="hidden print-content-formatted"
                      dangerouslySetInnerHTML={{
                        __html: (editableFindings[0] || "")
                          .replace(/^(.*?:)/gm, "<strong>$1</strong>")
                          .replace(/\n/g, "<br/>"),
                      }}
                    />
                  </>
                )}
              </div>

              {/* Today's Findings subsection */}
              <div className="p-3 space-y-3 border-t border-border mt-3">
                <h3 className="text-base font-semibold text-foreground border-b border-border pb-1">Today's Findings</h3>
                <Textarea
                  value={todaysFindings}
                  onChange={(e) => setTodaysFindings(e.target.value)}
                  placeholder="Describe what was found during today's visit..."
                  className="text-sm resize-y min-h-[80px] leading-relaxed no-print"
                  rows={3}
                />
                <div
                  className="hidden print-content-formatted"
                  dangerouslySetInnerHTML={{
                    __html: (todaysFindings || "").replace(/\n/g, "<br/>"),
                  }}
                />
              </div>
            </Card>

            {/* Recommendations Section */}
            <Card className="print-section p-3 md:p-4">
              <h2 className="print-section-header text-lg md:text-xl font-bold mb-3 text-foreground">Recommendations</h2>
              {editableTargetPests.length > 0 && (
                <div className="no-print px-3 pb-2 space-y-2">
                  {pestDisplayOrder(editableTargetPests)
                    .filter((p) => RECOMMENDATION_SNIPPETS[p]?.length)
                    .map((pest) => (
                      <div key={pest} className="space-y-1">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                          {pest.startsWith("General Pests") ? "General Pests" : pest}
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {RECOMMENDATION_SNIPPETS[pest].map((snip) => {
                            const active = isRecSnippetActive(snip);
                            return (
                              <button
                                key={snip}
                                type="button"
                                onClick={() => toggleRecSnippet(snip)}
                                className={cn(
                                  "text-left text-xs px-2.5 py-1.5 rounded-full border transition-colors",
                                  active
                                    ? "bg-primary text-primary-foreground border-primary"
                                    : "bg-background text-foreground border-border hover:border-primary/50",
                                )}
                                dangerouslySetInnerHTML={{
                                  __html: `${active ? "✓ " : ""}${snip}`,
                                }}
                              />
                            );
                          })}
                        </div>
                      </div>
                    ))}
                </div>
              )}
              <div className="p-3 no-print">
                <RichTextEditor
                  value={editableRecommendations[0] || ""}
                  onChange={(val) => updateItem(0, val, setEditableRecommendations)}
                  placeholder="Enter recommendations for the customer..."
                  fontSize={recommendationsFontSize}
                  onFontSizeChange={setRecommendationsFontSize}
                  className="min-h-[120px] text-foreground"
                  showControls={true}
                />
              </div>
              {/* Print version */}
              <div
                className="hidden print-content-formatted text-foreground p-3"
                style={{ fontSize: `${recommendationsFontSize}px` }}
                dangerouslySetInnerHTML={{
                  __html: (editableRecommendations[0] || "").replace(/\n/g, "<br/>"),
                }}
              />
            </Card>

            {/* What to Expect Section (was Actions) */}
            <Card className="print-section p-3 md:p-4">
              <h2 className="print-section-header text-lg md:text-xl font-bold mb-3">What to Expect</h2>
              <div className="p-3 space-y-3">
                <Textarea
                  value={editableExpectations[0] || ""}
                  onChange={(e) => updateItem(0, e.target.value, setEditableExpectations)}
                  placeholder="What the customer should expect..."
                  className="text-sm resize-y min-h-[100px] leading-relaxed no-print"
                  rows={4}
                />
                <div
                  className="hidden print-content-formatted"
                  dangerouslySetInnerHTML={{
                    __html: (editableExpectations[0] || "")
                      .replace(/^(.*?:)/gm, "<strong>$1</strong>")
                      .replace(/\n/g, "<br/>"),
                  }}
                />
              </div>
            </Card>

            {/* Rodent Exclusion Disclaimer — mirrors the sales-report wording so
                customers see the same scope/liability language on the service
                report. Renders only for the rodent-exclusion variant. */}
            {isRodentExclusion && (
              <Card className="print-section p-3 md:p-4 border-2 border-dark-sage/60 bg-sage/10">
                <h2 className="print-section-header text-lg md:text-xl font-bold mb-2">Scope &amp; Disclaimer</h2>
                <div className="p-3 text-xs md:text-sm leading-relaxed text-foreground space-y-2">
                  <p>
                    <strong>Additional Details:</strong> We are a licensed pest control company, not a licensed contractor.
                    We use materials like steel mesh, chicken wire, and weatherproof sealants to block off potential
                    rodent entry points. We do not make structural alterations like cutting into drywall or stucco,
                    replacing framing, and any other general construction work.
                  </p>
                  <p>
                    <strong>Rodent Exclusion Guarantee:</strong> Our standard guarantee for rodent exclusion work is
                    6 months. If rodents re-enter your property through previously sealed entry points during this
                    period, we will re-seal them and reset traps at no additional cost. This guarantee does not
                    cover any newly created entry points.
                  </p>
                  <p>
                    <strong>Extended Warranty for Ongoing Rodent Control Customers:</strong> Customers enrolled in
                    our ongoing rodent control program receive an extended warranty for as long as their service
                    remains active.
                  </p>
                  <p>
                    <strong>Disclaimer:</strong> Crest Pest Control is not liable for any structural or property
                    damage caused by rodents.
                  </p>
                </div>
              </Card>
            )}
            </>
            )}
          </div>
        </div>
      </div>


      {/* Rodent Exclusion / Attic — grouped photo capture panel.
          Renders only for the rodent-exclusion variant. Designed to be
          ultra simple on mobile: stacked, full-width "Add Photos" buttons
          per category that append to propertyImages with a caption tag. */}
      {isRodentExclusion && (
        <div className="no-print bg-sage/20 border-y-2 border-dark-sage/40">
          <div className={isMobile ? "p-4" : "p-4 max-w-[1800px] mx-auto"}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-foreground uppercase tracking-wide">
                Entry Point Photos
              </h3>
              <span className="text-[11px] text-muted-foreground">
                {beforePhotos.length} before · {propertyImages.filter((p) => p.image).length} after
              </span>
            </div>
            {(() => {
              const pairCount = Math.max(beforePhotos.length, propertyImages.length);
              const rows = Array.from({ length: pairCount }, (_, i) => i);
              const usedAfters = propertyImages.filter((p) => p.image).length;
              const usedBefores = beforePhotos.filter((p) => p.image).length;
              const bulkUsed = bulkUploadKind === "before" ? usedBefores : usedAfters;
              return (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {rows.map((i) => {
                    const before = beforePhotos[i];
                    const after = propertyImages[i];
                    const labelValue = normalizeRodentPairLabels(pairLabels, pairCount)[i] || defaultRodentPairLabel(i);
                    return (
                      <div
                        key={`pair-${i}`}
                        className="rounded-xl border-2 border-dark-sage/50 bg-card p-2"
                      >
                        <div className="flex items-center gap-1 mb-1.5 px-0.5">
                          <Input
                            value={labelValue}
                            onChange={(e) => setPairLabelAt(i, e.target.value)}
                            placeholder={`Entry Point #${i + 1}`}
                            className="h-7 text-xs font-bold uppercase tracking-wide flex-1"
                          />
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-[11px] text-destructive hover:bg-destructive/10"
                            onClick={() => deletePairAt(i)}
                            aria-label={`Delete ${labelValue}`}
                            title="Delete this pair"
                          >
                            <X className="w-3 h-3 mr-1" />
                            Delete pairing
                          </Button>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          {/* Before — draggable to swap with another Before tile */}
                          <div className="space-y-1">
                            <span className="block text-[10px] font-semibold uppercase tracking-wide text-dark-sage">Before</span>
                            {before?.image ? (
                              <div
                                className="relative aspect-[4/3] rounded-lg overflow-hidden border border-border bg-muted group cursor-grab active:cursor-grabbing hover:ring-2 hover:ring-dark-sage transition-shadow"
                                draggable
                                onDragStart={(e) => {
                                  e.dataTransfer.setData("application/x-photo", JSON.stringify({ kind: "before", index: i }));
                                  e.dataTransfer.effectAllowed = "move";
                                }}
                                onDragOver={(e) => {
                                  const types = e.dataTransfer.types;
                                  if (types && Array.from(types).includes("application/x-photo")) {
                                    e.preventDefault();
                                    e.dataTransfer.dropEffect = "move";
                                  }
                                }}
                                onDrop={(e) => {
                                  e.preventDefault();
                                  try {
                                    const data = JSON.parse(e.dataTransfer.getData("application/x-photo"));
                                    if (data?.kind === "before" && typeof data.index === "number") swapBeforeAt(data.index, i);
                                  } catch {}
                                }}
                              >
                                <img src={before.image} alt={`Before ${i + 1}`} className="w-full h-full object-cover pointer-events-none" />
                                <Button
                                  size="icon"
                                  variant="destructive"
                                  className="absolute top-1 right-1 h-6 w-6 md:opacity-0 md:group-hover:opacity-100 transition-opacity"
                                  onClick={() => clearBeforeAtIndex(i)}
                                  aria-label="Remove before photo"
                                >
                                  <X className="w-3 h-3" />
                                </Button>
                              </div>
                            ) : (
                              <div
                                className="aspect-[4/3] flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-dark-sage/60 bg-card p-2 text-center"
                                onDragOver={(e) => {
                                  const types = e.dataTransfer.types;
                                  if (types && Array.from(types).includes("application/x-photo")) {
                                    e.preventDefault();
                                    e.dataTransfer.dropEffect = "move";
                                  }
                                }}
                                onDrop={(e) => {
                                  e.preventDefault();
                                  try {
                                    const data = JSON.parse(e.dataTransfer.getData("application/x-photo"));
                                    if (data?.kind === "before" && typeof data.index === "number") swapBeforeAt(data.index, i);
                                  } catch {}
                                }}
                              >
                                <Plus className="w-5 h-5 text-dark-sage" />
                                <span className="text-[10px] font-semibold text-foreground leading-tight px-1">
                                  Add Before
                                </span>
                                <div className="flex flex-col gap-1 w-full">
                                  <label className="relative inline-flex h-8 items-center justify-center rounded-md border border-dark-sage bg-card px-2 text-[11px] font-semibold text-foreground cursor-pointer hover:bg-sage/30">
                                    Photo Library
                                    <input
                                      type="file"
                                      accept="image/*"
                                      multiple
                                      onChange={(e) => handlePairUploadAtIndex(e, i, "before")}
                                      className="absolute inset-0 opacity-0 cursor-pointer"
                                      aria-label={`Choose before photo from photo library for pair ${i + 1}`}
                                    />
                                  </label>
                                  <label className="relative inline-flex h-8 items-center justify-center rounded-md border border-border bg-muted px-2 text-[11px] font-semibold text-foreground cursor-pointer hover:bg-sage/30">
                                    Camera
                                    <input
                                      type="file"
                                      accept="image/*"
                                      capture="environment"
                                      onChange={(e) => handlePairUploadAtIndex(e, i, "before")}
                                      className="absolute inset-0 opacity-0 cursor-pointer"
                                      aria-label={`Take before photo with camera for pair ${i + 1}`}
                                    />
                                  </label>
                                </div>
                              </div>
                            )}
                          </div>
                          {/* After — draggable to swap with another After tile */}
                          <div className="space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] font-semibold uppercase tracking-wide text-primary">After</span>
                              {after?.image && (
                                <div className="flex items-center gap-0.5">
                                  <button
                                    type="button"
                                    onClick={() => moveAfterBy(i, -1)}
                                    disabled={i === 0}
                                    className="h-5 w-5 inline-flex items-center justify-center rounded border border-border text-[10px] hover:bg-muted disabled:opacity-30"
                                    aria-label="Move after photo up"
                                    title="Swap with previous pair"
                                  >
                                    ↑
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => moveAfterBy(i, 1)}
                                    className="h-5 w-5 inline-flex items-center justify-center rounded border border-border text-[10px] hover:bg-muted"
                                    aria-label="Move after photo down"
                                    title="Swap with next pair"
                                  >
                                    ↓
                                  </button>
                                </div>
                              )}
                            </div>
                            {after?.image ? (
                              <div
                                className="relative aspect-[4/3] rounded-lg overflow-hidden border border-border bg-muted group cursor-grab active:cursor-grabbing hover:ring-2 hover:ring-primary transition-shadow"
                                draggable
                                onDragStart={(e) => {
                                  e.dataTransfer.setData("application/x-photo", JSON.stringify({ kind: "after", index: i }));
                                  e.dataTransfer.effectAllowed = "move";
                                }}
                                onDragOver={(e) => {
                                  const types = e.dataTransfer.types;
                                  if (types && Array.from(types).includes("application/x-photo")) {
                                    e.preventDefault();
                                    e.dataTransfer.dropEffect = "move";
                                  }
                                }}
                                onDrop={(e) => {
                                  e.preventDefault();
                                  try {
                                    const data = JSON.parse(e.dataTransfer.getData("application/x-photo"));
                                    if (data?.kind === "after" && typeof data.index === "number") swapAfterAt(data.index, i);
                                  } catch {}
                                }}
                              >
                                <img src={after.image} alt={`After ${i + 1}`} className="w-full h-full object-cover pointer-events-none" />
                                <Button
                                  size="icon"
                                  variant="destructive"
                                  className="absolute top-1 right-1 h-6 w-6 md:opacity-0 md:group-hover:opacity-100 transition-opacity"
                                  onClick={() => clearAfterAtIndex(i)}
                                  aria-label="Remove after photo"
                                >
                                  <X className="w-3 h-3" />
                                </Button>
                                <div className="absolute left-1 right-1 bottom-1 flex items-center gap-1 rounded-md bg-background/90 p-1 shadow-sm md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                                  <span className="text-[10px] font-semibold text-muted-foreground shrink-0">Move to</span>
                                  <Select value={String(i)} onValueChange={(value) => moveAfterToIndex(i, value)}>
                                    <SelectTrigger className="h-7 min-w-0 flex-1 text-[11px] bg-card">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {rows.map((target) => (
                                        <SelectItem key={`after-target-${i}-${target}`} value={String(target)}>
                                          {(pairLabels[target] && pairLabels[target].trim()) || `Entry Point #${target + 1}`}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                              </div>
                            ) : (
                              <div
                                className="aspect-[4/3] flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-dark-sage bg-card p-2 text-center"
                                onDragOver={(e) => {
                                  const types = e.dataTransfer.types;
                                  if (types && Array.from(types).includes("application/x-photo")) {
                                    e.preventDefault();
                                    e.dataTransfer.dropEffect = "move";
                                  }
                                }}
                                onDrop={(e) => {
                                  e.preventDefault();
                                  try {
                                    const data = JSON.parse(e.dataTransfer.getData("application/x-photo"));
                                    if (data?.kind === "after" && typeof data.index === "number") swapAfterAt(data.index, i);
                                  } catch {}
                                }}
                              >
                                <Plus className="w-5 h-5 text-dark-sage" />
                                <span className="text-[10px] font-semibold text-foreground leading-tight px-1">
                                  Add After
                                </span>
                                <div className="flex flex-col gap-1 w-full">
                                  <label className="relative inline-flex h-8 items-center justify-center rounded-md border border-dark-sage bg-card px-2 text-[11px] font-semibold text-foreground cursor-pointer hover:bg-sage/30">
                                    Photo Library
                                    <input
                                      type="file"
                                      accept="image/*"
                                      multiple
                                      onChange={(e) => handlePairUploadAtIndex(e, i, "after")}
                                      className="absolute inset-0 opacity-0 cursor-pointer"
                                      aria-label={`Choose after photo from photo library for pair ${i + 1}`}
                                    />
                                  </label>
                                  <label className="relative inline-flex h-8 items-center justify-center rounded-md border border-border bg-muted px-2 text-[11px] font-semibold text-foreground cursor-pointer hover:bg-sage/30">
                                    Camera
                                    <input
                                      type="file"
                                      accept="image/*"
                                      capture="environment"
                                      onChange={(e) => handlePairUploadAtIndex(e, i, "after")}
                                      className="absolute inset-0 opacity-0 cursor-pointer"
                                      aria-label={`Take after photo with camera for pair ${i + 1}`}
                                    />
                                  </label>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {/* Trailing card to bulk-add photos. A Before/After toggle
                      picks which column the uploads land in; uploads fill
                      empty slots first, then append new pairs. Stops at 20
                      per column. */}
                  {bulkUsed < 20 && (
                    <div className="rounded-xl border-2 border-dashed border-dark-sage bg-card min-h-[140px] flex flex-col items-center justify-center gap-2 p-3 text-center">
                      <Plus className="w-7 h-7 text-dark-sage" />
                      <span className="text-sm font-semibold text-foreground leading-tight">
                        Upload photos
                      </span>
                      <div className="inline-flex rounded-md border border-dark-sage overflow-hidden">
                        <button
                          type="button"
                          onClick={() => setBulkUploadKind("before")}
                          className={`px-3 h-8 text-xs font-semibold transition-colors ${bulkUploadKind === "before" ? "bg-dark-sage text-white" : "bg-card text-foreground hover:bg-sage/30"}`}
                          aria-pressed={bulkUploadKind === "before"}
                        >
                          Before
                        </button>
                        <button
                          type="button"
                          onClick={() => setBulkUploadKind("after")}
                          className={`px-3 h-8 text-xs font-semibold transition-colors ${bulkUploadKind === "after" ? "bg-dark-sage text-white" : "bg-card text-foreground hover:bg-sage/30"}`}
                          aria-pressed={bulkUploadKind === "after"}
                        >
                          After
                        </button>
                      </div>
                      <span className="text-[10px] text-muted-foreground">
                        {bulkUsed}/20 {bulkUploadKind} · pick several from Photo Library, or use Camera one at a time
                      </span>
                      <div className="grid grid-cols-2 gap-2 w-full max-w-[260px]">
                        <label className="relative inline-flex h-9 items-center justify-center rounded-md border border-dark-sage bg-card px-2 text-xs font-semibold text-foreground cursor-pointer hover:bg-sage/30 active:bg-sage/40">
                          Photo Library
                          <input
                            type="file"
                            accept="image/*"
                            multiple
                            onChange={(e) => handleRodentGroupUpload(e, bulkUploadKind)}
                            className="absolute inset-0 opacity-0 cursor-pointer"
                            aria-label={`Choose ${bulkUploadKind} photos from photo library`}
                          />
                        </label>
                        <label className="relative inline-flex h-9 items-center justify-center rounded-md border border-border bg-muted px-2 text-xs font-semibold text-foreground cursor-pointer hover:bg-sage/30 active:bg-sage/40">
                          Camera
                          <input
                            type="file"
                            accept="image/*"
                            capture="environment"
                            onChange={(e) => handleRodentGroupUpload(e, bulkUploadKind)}
                            className="absolute inset-0 opacity-0 cursor-pointer"
                            aria-label={`Take ${bulkUploadKind} photo with camera`}
                          />
                        </label>
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* Second Page - Before/After Photos (rodent-exclusion variant).
          Mirrors the editor grid into a clean, captured PDF page so the
          Before vs After labels and pairing are obvious in the export. */}
      {isRodentExclusion && (
      <div
        data-pdf-page="2"
        data-pdf-capture="2"
        data-report-type="initial-pest"
        className={`print-page-break bg-background ${beforePhotos.length === 0 && propertyImages.filter((p) => p.image).length === 0 ? 'print:hidden' : ''}`}
      >
        <div className={isMobile ? "p-4" : "p-4 max-w-[1800px] mx-auto"}>
          {/* Page Header */}
          <div className="flex items-center justify-between mb-3 pb-2 border-b-2 border-border">
            <div className="flex items-center gap-3">
              <img src={crestLogo} alt="Crest Pest Control" className="h-10 no-print-compress" />
              <h1 className="text-lg font-bold text-foreground">Entry Point Photos — Before &amp; After</h1>
            </div>
            <span className="text-xs text-muted-foreground">
              {beforePhotos.filter((b) => b?.image).length} before · {propertyImages.filter((p) => p.image).length} after
            </span>
          </div>

          {(() => {
            const pairCount = Math.max(beforePhotos.length, propertyImages.length);
            if (pairCount === 0) {
              return (
                <div className="no-images-placeholder text-center py-12 text-muted-foreground">
                  <p>No before/after photos uploaded yet.</p>
                </div>
              );
            }
            const labels = normalizeRodentPairLabels(pairLabels, pairCount);
            return (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {Array.from({ length: pairCount }, (_, i) => {
                  const before = beforePhotos[i];
                  const after = propertyImages[i];
                  if (!before?.image && !after?.image) return null;
                  const label = (labels[i] && labels[i].trim()) || defaultRodentPairLabel(i);
                  return (
                    <div
                      key={`pdf-pair-${i}`}
                      className="rounded-lg border-2 border-dark-sage/60 bg-card p-2"
                    >
                      <div className="text-xs font-bold uppercase tracking-wide text-foreground mb-1.5 px-0.5">
                        {label}
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <div className="text-[10px] font-bold uppercase tracking-wide text-dark-sage text-center bg-sage/30 rounded py-0.5">
                            Before
                          </div>
                          <div className="aspect-[4/3] rounded overflow-hidden border border-border bg-muted">
                            {before?.image ? (
                              <img src={before.image} alt={`${label} — before`} className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-[10px] text-muted-foreground">
                                No before photo
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="space-y-1">
                          <div className="text-[10px] font-bold uppercase tracking-wide text-primary-foreground text-center bg-primary rounded py-0.5">
                            After
                          </div>
                          <div className="aspect-[4/3] rounded overflow-hidden border border-border bg-muted">
                            {after?.image ? (
                              <img src={after.image} alt={`${label} — after`} className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-[10px] text-muted-foreground">
                                No after photo
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                      {after?.caption && (
                        <p className="mt-1.5 px-0.5 text-[10px] leading-tight text-foreground">{after.caption}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>
      </div>
      )}

      {/* Second Page - Property Images (non-rodent variant) */}
      {!isRodentExclusion && (
      <div 
        data-pdf-page="2"
        data-pdf-capture="2"
        data-report-type="initial-pest"
        className={`print-page-break bg-background ${propertyImages.length === 0 ? 'print:hidden' : ''}`}
        onPaste={handlePropertyImagesPaste}
        tabIndex={0}
      >
        <div className={isMobile ? "p-4" : "p-4 max-w-[1800px] mx-auto"}>
          {/* Page Header */}
          <div className="flex items-center justify-between mb-3 pb-2 border-b-2 border-border">
            <div className="flex items-center gap-3">
              <img src={crestLogo} alt="Crest Pest Control" className="h-10 no-print-compress" />
              <h1 className="text-lg font-bold text-foreground">Property Images</h1>
            </div>
          </div>

          {/* Upload Section */}
          <div className="no-print mb-6 flex items-center gap-3">
            <div className="relative inline-flex">
              <Button variant="outline" size="lg" type="button">
                <FileDown className="w-5 h-5 mr-2" />
                Upload Images (up to 20)
              </Button>
              <input
                id="property-images-upload"
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                onClick={(e) => {
                  (e.currentTarget as HTMLInputElement).value = "";
                }}
                onChange={handlePropertyImagesUpload}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                aria-label="Upload property images"
              />
            </div>
            <span className="text-sm text-muted-foreground">or paste from clipboard (Ctrl+V / Cmd+V)</span>
          </div>

          {/* Property Images Grid - All 5 images in a row */}
          {propertyImages.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3">
              {propertyImages.map((item, index) => (
                <div key={index} className="space-y-1">
                  <div className="aspect-[4/3] rounded-lg overflow-hidden border border-border bg-muted relative group">
                    {annotatingImageIndex === index ? (
                      <InlineImageAnnotator
                        imageUrl={item.image}
                        onSave={(annotatedDataUrl) => {
                          setPropertyImages((prev) => {
                            const updated = [...prev];
                            updated[index] = { ...updated[index], image: annotatedDataUrl };
                            return updated;
                          });
                          setAnnotatingImageIndex(null);
                          toast.success("Annotations saved");
                        }}
                        onCancel={() => setAnnotatingImageIndex(null)}
                      />
                    ) : (
                      <>
                        <img src={item.image} alt={`Property ${index + 1}`} className="w-full h-full object-cover" />
                        <Button
                          size="icon"
                          variant="destructive"
                          className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity no-print"
                          onClick={() => {
                            setPropertyImages((prev) => prev.filter((_, i) => i !== index));
                            toast.info("Image removed");
                          }}
                        >
                          <X className="w-3 h-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          className="absolute bottom-1 right-1 h-6 px-2 text-[10px] no-print"
                          onClick={() => setAnnotatingImageIndex(index)}
                        >
                          <Edit className="w-3 h-3 mr-1" />
                          Draw
                        </Button>
                      </>
                    )}
                  </div>
                  {item.caption && (
                    <div className="p-1.5 bg-card rounded border border-border">
                      <p className="text-[10px] leading-tight text-foreground">{item.caption}</p>
                    </div>
                  )}
                  <Input
                    value={item.caption || ""}
                    onChange={(e) => updateImageCaption(index, e.target.value)}
                    placeholder="Add caption"
                    className="no-print text-xs h-7"
                  />
                </div>
              ))}
            </div>
          )}

          {propertyImages.length === 0 && (
            <div className="no-images-placeholder text-center py-12 text-muted-foreground">
              <p>No images uploaded yet. Upload or paste (Ctrl+V / Cmd+V) up to 20 images.</p>
            </div>
          )}
        </div>
      </div>
      )}

      {/* Crest Guarantee */}
      <div className="bg-background">
        <div className={isMobile ? "p-4" : "p-6 max-w-[1800px] mx-auto"}>
          <div className="border-2 border-border rounded-lg p-4 text-center bg-muted/30">
            <h3 className="text-sm font-bold text-foreground mb-2">The Crest Guarantee</h3>
            <p className="text-xs text-foreground leading-relaxed max-w-2xl mx-auto">
              If pests return, we will return at no charge. We don't lock you into a long-term contract. We want our service quality to keep you as a customer, not a contract.
            </p>
          </div>
          {isRodentExclusion && (
            <p
              className="text-[10px] italic text-muted-foreground text-center mt-3 leading-snug px-4"
              data-pdf-section="rodent-exclusion-disclaimer"
            >
              {SALES_REPORT_DISCLAIMER_HTML.replace(/<[^>]+>/g, "")}
            </p>
          )}
        </div>
      </div>




      {/* Compose Email Dialog */}
      <Dialog open={showComposeDialog} onOpenChange={setShowComposeDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="w-5 h-5" />
              Compose Email
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="email-to">To</Label>
              <Input
                id="email-to"
                type="email"
                value={customerEmail}
                onChange={(e) => setCustomerEmail(e.target.value)}
                placeholder="customer@email.com"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email-cc">CC <span className="text-muted-foreground font-normal">(optional — press Enter or comma to add)</span></Label>
              <div className="flex flex-wrap gap-1.5 p-2 border border-input rounded-md bg-background min-h-[40px]">
                {ccEmails.map((email, i) => (
                  <span key={i} className="flex items-center gap-1 bg-muted px-2 py-0.5 rounded text-sm">
                    {email}
                    <button type="button" onClick={() => setCcEmails(prev => prev.filter((_, idx) => idx !== i))} className="text-muted-foreground hover:text-foreground ml-0.5">×</button>
                  </span>
                ))}
                <input
                  id="email-cc"
                  type="email"
                  value={ccInput}
                  onChange={(e) => setCcInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === ",") {
                      e.preventDefault();
                      const val = ccInput.trim().replace(/,$/, "");
                      if (val && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val) && !ccEmails.includes(val)) {
                        setCcEmails(prev => [...prev, val]);
                      }
                      setCcInput("");
                    } else if (e.key === "Backspace" && !ccInput && ccEmails.length > 0) {
                      setCcEmails(prev => prev.slice(0, -1));
                    }
                  }}
                  onBlur={() => {
                    const val = ccInput.trim().replace(/,$/, "");
                    if (val && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val) && !ccEmails.includes(val)) {
                      setCcEmails(prev => [...prev, val]);
                      setCcInput("");
                    }
                  }}
                  placeholder={ccEmails.length === 0 ? "cc@example.com" : ""}
                  className="flex-1 min-w-[120px] outline-none bg-transparent text-sm placeholder:text-muted-foreground"
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="email-subject">Subject</Label>
              <Input
                id="email-subject"
                value={emailSubject}
                onChange={(e) => setEmailSubject(e.target.value)}
                placeholder="Email subject"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="email-message">Message</Label>
              <Textarea
                id="email-message"
                value={emailMessage}
                onChange={(e) => setEmailMessage(e.target.value)}
                placeholder="Write your message..."
                className="min-h-[150px]"
              />
            </div>
            
            <div className="space-y-2">
              <Label>Report Link (included in email)</Label>
              <div className="p-3 bg-muted rounded-md text-sm">
                {reportId ? (
                  <a 
                    href={`${window.location.origin}/view-report/${reportId}`} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-primary underline break-all"
                  >
                    {`${window.location.origin}/view-report/${reportId}`}
                  </a>
                ) : (
                  <span className="text-muted-foreground italic">
                    Save the report first to generate a shareable link
                  </span>
                )}
              </div>
            </div>
          </div>
          
          <div className="flex items-center space-x-2 pt-2">
            <Switch checked={includePdf} onCheckedChange={setIncludePdf} id="include-pdf-ipr" className="data-[state=checked]:bg-green-500" />
            <Label htmlFor="include-pdf-ipr" className="text-sm font-medium cursor-pointer">Include PDF attachment</Label>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowComposeDialog(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleSendEmail} 
              disabled={isSendingEmail || !customerEmail}
            >
              {isSendingEmail ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Send className="w-4 h-4 mr-2" />
              )}
              Send Email
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Report;
