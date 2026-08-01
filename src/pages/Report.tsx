import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
  Edit,
  Check,
  ChevronsUpDown,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { TablesInsert, TablesUpdate } from "@/integrations/supabase/types";
import { MapCanvas } from "@/components/MapCanvas";
import { SignatureCanvas, SignatureCanvasRef } from "@/components/SignatureCanvas";
import RichTextEditor from "@/components/RichTextEditor";
import { PrepSheetPicker, buildPrepSheetAttachments } from "@/components/PrepSheetPicker";
import crestLogo from "@/assets/crest-logo.png";
import crestBugBlack from "@/assets/crest-bug-black.png";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { inferImageUploadMeta } from "@/lib/imageUpload";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import ImageAnnotator from "@/components/ImageAnnotator";
import InlineImageAnnotator from "@/components/InlineImageAnnotator";
import { buildMergedPDF, buildSimplePDF, downloadPDF } from "@/lib/pdfExport";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import CustomerPicker from "@/components/CustomerPicker";
import {
  salesReportHasRodentExclusion,
  ensureRodentExclusionReport,
  rodentExclusionUrl,
} from "@/lib/rodentExclusionAutoCreate";
import { useCurrentStaff } from "@/hooks/useCurrentStaff";
import { autoMatchCustomerId } from "@/lib/fieldroutesAutoMatch";
import {
  RODENT_GUARANTEE_HTML,
  hasRodentGuaranteeService,
  stripRodentGuaranteeFromHtml,
  stripDisclaimerFromHtml,
  resolveInitialGuaranteeBoxes,
  GuaranteeBox,
  splitServicesContent,
  SALES_REPORT_DISCLAIMER_HTML,
} from "@/lib/rodentGuarantee";
import GuaranteeBoxesEditor, { GuaranteeBoxesReadOnly } from "@/components/GuaranteeBoxesEditor";

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
  "Ants",
  "Roaches",
  "Crickets",
  "Earwigs",
  "Spiders",
  "Silverfish",
  "Centipedes",
  "Wasps",
  "Rodents",
  "Fleas & Ticks",
  "Bed Bugs",
  "Mosquitoes",
  "Millipedes",
  "American Roaches",
  "Drain Flies",
  "Other",
];

const PRODUCT_OPTIONS = [
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
  { name: "Crossfire Bedbug Concentrate", chemical: "Clothianidin, Metofluthrin, Piperonyl Butoxide" },
];

const EQUIPMENT_OPTIONS = ["Rodent Bait Stations", "Rodent Traps", "Mosquito Buckets", "Fly Light", "Pest Monitors"];

// Service configuration with auto-population data (aligned with sales report knowledge base)
const SERVICE_CONFIG: Record<
  string,
  {
    frequency: number;
    targetPests: string[];
    proposedServices: string;
    defaultInitial: number;
    defaultRecurring: number;
  }
> = {
  "Monthly Services": {
    frequency: 30,
    targetPests: ["Ants", "American Roaches", "Crickets", "Earwigs", "Spiders", "Silverfish", "Centipedes", "Millipedes", "Wasps", "Fleas & Ticks"],
    proposedServices:
      `<b>Recurring Pest Control (Monthly):</b><br>• Inspect exterior for potential pest entry points, harborage areas, and signs of infestation<br>• Remove webs from the exterior of the property including eaves, windows, outdoor furniture, and high visibility areas<br>• Create a pest barrier around your home and property by targeted exterior treatments. Treat the garage and interior upon request.<br><br><b>Additional Details:</b> Our goal is to reduce your pest population as much as possible. However, given pests are abundant in So Cal, it's unlikely for us (or anyone) to reduce 100% of the pest population (i.e., you may still see the occasional ant, spider, or cockroach). Our products typically take 7-10 days to take full effect (this gives the products time to spread back to the larger colonies). If activity levels remain high after this period, contact us and we'll get someone out ASAP for a complimentary follow-up service.`,
    defaultInitial: 75,
    defaultRecurring: 75,
  },
  "Bi-Monthly Services": {
    frequency: 60,
    targetPests: ["Ants", "American Roaches", "Crickets", "Earwigs", "Spiders", "Silverfish", "Centipedes", "Millipedes", "Wasps", "Fleas & Ticks"],
    proposedServices:
      `<b>Recurring Pest Control (Bi-Monthly):</b><br>• Inspect exterior for potential pest entry points, harborage areas, and signs of infestation<br>• Remove webs from the exterior of the property including eaves, windows, outdoor furniture, and high visibility areas<br>• Create a pest barrier around your home and property by targeted exterior treatments. Treat the garage and interior upon request.<br>• The first treatment from the Pest Protection Plan begins 30 days after the initial service to break pest egg cycles<br><br><b>Additional Details:</b> Our goal is to reduce your pest population as much as possible. However, given pests are abundant in So Cal, it's unlikely for us (or anyone) to reduce 100% of the pest population (i.e., you may still see the occasional ant, spider, or cockroach). Our products typically take 7-10 days to take full effect (this gives the products time to spread back to the larger colonies). If activity levels remain high after this period, contact us and we'll get someone out ASAP for a complimentary follow-up service.`,
    defaultInitial: 110,
    defaultRecurring: 110,
  },
  "Quarterly Services": {
    frequency: 90,
    targetPests: ["Ants", "American Roaches", "Crickets", "Earwigs", "Spiders", "Silverfish", "Centipedes", "Millipedes", "Wasps", "Fleas & Ticks"],
    proposedServices:
      `<b>Recurring Pest Control (Quarterly):</b><br>• Inspect exterior for potential pest entry points, harborage areas, and signs of infestation<br>• Remove webs from the exterior of the property including eaves, windows, outdoor furniture, and high visibility areas<br>• Create a pest barrier around your home and property by targeted exterior treatments. Treat the garage and interior upon request.<br>• The first treatment from the Pest Protection Plan begins 30 days after the initial service to break pest egg cycles<br><br><b>Additional Details:</b> Our goal is to reduce your pest population as much as possible. However, given pests are abundant in So Cal, it's unlikely for us (or anyone) to reduce 100% of the pest population (i.e., you may still see the occasional ant, spider, or cockroach). Our products typically take 7-10 days to take full effect (this gives the products time to spread back to the larger colonies). If activity levels remain high after this period, contact us and we'll get someone out ASAP for a complimentary follow-up service.`,
    defaultInitial: 135,
    defaultRecurring: 135,
  },
  "Commercial General Pest": {
    frequency: 30,
    targetPests: ["Ants", "American Roaches", "Crickets", "Earwigs", "Spiders", "Silverfish", "Centipedes", "Millipedes", "Wasps", "Fleas & Ticks"],
    proposedServices:
      `<b>Commercial General Pest:</b><br>• Inspect exterior and interior (including placing and monitoring pest traps) for pest activity<br>• Treat the exterior perimeter of the property and interior common areas (restrooms, break rooms, lounges, etc.). Treat other interior areas as needed<br>• Provide ongoing communication with management on pest sightings and activity levels`,
    defaultInitial: 100,
    defaultRecurring: 100,
  },
  "Rodent Exclusion": {
    frequency: 0,
    targetPests: ["Rodents"],
    proposedServices:
      `<b>Rodent Exclusion:</b><br>• Seal rodent entry points (pictured below) using industry-grade materials such as steel mesh, chicken wire, and weatherproof sealants.<br><br><b>Additional Details:</b> We are a licensed pest control company, not a licensed contractor. We use materials like steel mesh, chicken wire, and weatherproof sealants to block off potential rodent entry points. We do not make structural alterations like cutting into drywall or stucco, replacing framing, and any other general construction work.`,
    defaultInitial: 575,
    defaultRecurring: 0,
  },
  "Rodent Trapping": {
    frequency: 0,
    targetPests: ["Rodents"],
    proposedServices:
      `<b>Rodent Trapping:</b><br>• Strategically place traps in areas of highest activity to reduce active rodent populations.<br>• Two follow-up visits to monitor activity, dispose of any dead rodents, and adjust traps as needed.<br><br><b>Additional Details:</b> Rodent trapping is specifically targeted at eliminating the existing rodent population. After we've completed our follow-up visits, we can't guarantee that rodents will not re-enter your property unless we are also performing rodent exclusion work.`,
    defaultInitial: 575,
    defaultRecurring: 0,
  },
  "Rodent Trapping and Exclusion": {
    frequency: 0,
    targetPests: ["Rodents"],
    proposedServices:
      `<b>Rodent Trapping & Exclusion:</b><br>• Seal rodent entry points (pictured below) using industry-grade materials such as steel mesh, chicken wire, and weatherproof sealants.<br>• Strategically place traps in areas of highest activity to reduce active rodent populations.<br>• Two follow-up visits to monitor activity, dispose of any dead rodents, and adjust traps as needed.<br><br><b>Additional Details:</b> We are a licensed pest control company, not a licensed contractor. We use materials like steel mesh, chicken wire, and weatherproof sealants to block off potential rodent entry points. We do not make structural alterations like cutting into drywall or stucco, replace framing, and any other general construction work.`,
    defaultInitial: 575,
    defaultRecurring: 0,
  },
  "Rodent Bait Boxes": {
    frequency: 30,
    targetPests: ["Rodents"],
    proposedServices:
      `<b>Rodent Bait Boxes:</b><br>• Install rodent bait boxes around the property to maintain consistent control of rodent populations<br>• Monitor, replenish, and adjust bait boxes depending on ongoing rodent activity<br><br><b>Additional Details:</b> Rodent bait stations are designed to reduce the amount of rodent activity around your property. You may still see rodent activity around the exterior of your property.`,
    defaultInitial: 200,
    defaultRecurring: 70,
  },
  "Mosquito Service": {
    frequency: 30,
    targetPests: ["Mosquitoes"],
    proposedServices:
      `<b>Mosquito Service:</b><br>• Target adult mosquitoes by treating areas with heavy foliage and where mosquito activity has been identified<br>• Set up mosquito buckets to interrupt breeding cycles and impact nearby breeding sites.<br><br><b>Additional Details:</b> Mosquitoes are one of the most difficult pests to control. Our goal with these mosquito treatments is to reduce the population by 80-90%. It typically takes a couple treatments and 45-60 days for us to achieve this goal.`,
    defaultInitial: 150,
    defaultRecurring: 75,
  },
  "Attic Services (see details below)": {
    frequency: 0,
    targetPests: ["Rodents"],
    proposedServices:
      `<b>Attic Services (see details below):</b><br>• Remove all accessible insulation from the attic including any debris<br>• Vacuum and sanitize the attic<br>• Seal up all visible and accessible rodent entry points<br>• Blow in T.A.P. insulation (Thermal, Acoustical, and Pest Control)<br>• Set up rodent traps and come back 2x to check on all traps<br>• Warranties: Manufacturer's warranty on insulation*, and rodent exclusion warranty** (see page 2)`,
    defaultInitial: 0,
    defaultRecurring: 0,
  },
  "General Pest Control": {
    frequency: 30,
    targetPests: ["Ants", "American Roaches", "Crickets", "Earwigs", "Spiders", "Silverfish", "Centipedes", "Millipedes", "Wasps", "Fleas & Ticks"],
    proposedServices:
      `<b>General Pest Control:</b><br>• Inspect exterior for potential pest entry points, harborage areas, and signs of infestation<br>• Remove webs from the exterior of the property including eaves, windows, outdoor furniture, and high visibility areas<br>• Create a pest barrier around your home and property by targeted exterior treatments. Treat the garage and interior upon request.<br><br><b>Additional Details:</b> Our goal is to reduce your pest population as much as possible. However, given pests are abundant in So Cal, it's unlikely for us (or anyone) to reduce 100% of the pest population (i.e., you may still see the occasional ant, spider, or cockroach). Our products typically take 7-10 days to take full effect (this gives the products time to spread back to the larger colonies). If activity levels remain high after this period, contact us and we'll get someone out ASAP for a complimentary follow-up service.`,
    defaultInitial: 75,
    defaultRecurring: 75,
  },
  "De-webbing": {
    frequency: 0,
    targetPests: ["Spiders"],
    proposedServices:
      `<b>De-webbing:</b><br>• Thoroughly remove webs from the entire property`,
    defaultInitial: 100,
    defaultRecurring: 100,
  },
  "Rodent Sanitation": {
    frequency: 0,
    targetPests: ["Rodents"],
    proposedServices:
      `<b>Rodent Sanitation:</b><br>• Remove rodent droppings from impacted and accessible areas<br>• Spray disinfect on impacted areas to eliminate health hazards<br><br><b>Additional Information:</b> We will remove all accessible rodent droppings from your attic. Please note that some droppings may be embedded in the insulation and cannot be reasonably removed.`,
    defaultInitial: 0,
    defaultRecurring: 0,
  },
  "Commercial Rodent": {
    frequency: 30,
    targetPests: ["Rodents"],
    proposedServices:
      `<b>Commercial Rodent:</b><br>• Install rodent bait boxes around the property to maintain consistent control of rodent populations<br>• Monitor, replenish, and adjust bait boxes depending on ongoing rodent activity<br>• Provide ongoing communication with management on rodent activity levels<br><br><b>Additional Details:</b> Rodent bait stations are designed to reduce the amount of rodent activity around your property. You may still see rodent activity around the exterior of your property.`,
    defaultInitial: 200,
    defaultRecurring: 70,
  },
  "Commercial Rodent and Pest": {
    frequency: 30,
    targetPests: ["Ants", "American Roaches", "Crickets", "Earwigs", "Spiders", "Silverfish", "Centipedes", "Millipedes", "Wasps", "Fleas & Ticks", "Rodents"],
    proposedServices:
      `<b>Commercial General Pest & Rodent:</b><br>• Inspect exterior and interior (including placing and monitoring pest traps) for pest activity<br>• Treat the exterior perimeter of the property and interior common areas (restrooms, break rooms, lounges, etc.). Treat other interior areas as needed<br>• Install rodent bait boxes around the property to maintain consistent control of rodent populations<br>• Monitor, replenish, and adjust bait boxes depending on ongoing rodent activity<br>• Provide ongoing communication with management on pest sightings and activity levels<br><br><b>Additional Details:</b> Rodent bait stations are designed to reduce the amount of rodent activity around your property. You may still see rodent activity around the exterior of your property.`,
    defaultInitial: 250,
    defaultRecurring: 150,
  },
  "Bed Bug Treatment": {
    frequency: 0,
    targetPests: ["Bed Bugs"],
    proposedServices:
      `<b>Bed Bug Treatment:</b><br>• Conduct thorough inspection of all sleeping areas, furniture, and harborage points<br>• Apply targeted treatments using residual products to eliminate bed bug populations<br>• Provide a follow-up treatment roughly 2 weeks later<br><br><b>Additional Details:</b> Bed bugs are an extremely difficult pest to fully eliminate. Successful treatment requires you to complete the pre-treatment and post-treatment requirements provided in the preparation sheet. It typically takes 2-4 weeks for activity levels to fully subside.`,
    defaultInitial: 0,
    defaultRecurring: 0,
  },
  "Flea & Tick Treatment": {
    frequency: 0,
    targetPests: ["Fleas & Ticks"],
    proposedServices:
      `<b>Flea & Tick Treatment:</b><br>• Treat interior and exterior areas where fleas are most likely present (pet resting areas, carpeted areas, grass areas, etc.) to eliminate active flea and tick populations<br>• Apply insect growth regulators to break the flea lifecycle and prevent re-infestation<br>• Provide a follow-up treatment roughly 2 weeks later<br><br><b>Additional Details:</b> Fleas are a difficult pest to fully eliminate. Successful treatment requires you to complete the pre-treatment and post-treatment requirements provided in the preparation sheet. It typically takes 2-4 weeks for activity levels to fully subside.`,
    defaultInitial: 0,
    defaultRecurring: 0,
  },
  "German Cockroach Treatment": {
    frequency: 0,
    targetPests: ["Roaches"],
    proposedServices:
      `<b>German Cockroach Treatment:</b><br>• Apply gel baits, growth regulators, and residual products to eliminate German cockroach infestations<br>• Target kitchens, bathrooms, and other moisture-heavy areas where activity is concentrated<br>• Provide at least one follow-up treatment roughly 1 week later<br><br><b>Additional Details:</b> German roaches are a difficult pest to fully eliminate. Successful treatment requires you to complete the pre-treatment and post-treatment requirements provided in the preparation sheet. It typically takes 2-4 weeks for activity levels to fully subside.`,
    defaultInitial: 0,
    defaultRecurring: 0,
  },
  "Drain Fly Treatment": {
    frequency: 0,
    targetPests: ["Drain Flies"],
    proposedServices:
      `<b>Drain Fly Treatment:</b><br>• Inspect and identify breeding sources in drains, pipes, and moist areas<br>• Apply biological and chemical treatments to eliminate larvae and adult drain flies<br>• Recommend sanitation practices to prevent recurrence`,
    defaultInitial: 0,
    defaultRecurring: 0,
  },
};

// Attic Services additional details content for page 2 (HTML formatted)
const ATTIC_SERVICES_ADDITIONAL_DETAILS = `<b>Attic Service (additional details):</b><br><br><b>Manufacturer's Insulation Warranty:</b> The product will, for the lifetime of the structure:<br>a.) be free from manufacturing defects;<br>b.) not deteriorate under normal and proper use, including the pesticides, active ingredient, and the chemical fire retardant treatment if the insulation is installed according to Pest Control Insulation's label instructions.<br><br><b>Rodent Exclusion Guarantee:</b> Our standard guarantee for rodent exclusion work is 6 months. If rodents re-enter your property through previously sealed entry points during this period, we will re-seal them and reset traps at no additional cost. Please note that this guarantee does not cover any newly created entry points.<br><br><b>Extended Warranty for Ongoing Rodent Control Customers:</b> Customers enrolled in our ongoing rodent control program receive an extended warranty for as long as their service remains active. Because ongoing treatment helps reduce the rodent population around your property, it significantly lowers the likelihood of re-entry through previously sealed points.<br><br><b>Not Included Services (Unless Otherwise Specified or Pictured Below):</b><br>• Garage door repair<br>• Exclusion work in areas other than the attic<br>• Rodent clean up in areas other than the attic<br><br><b>Attic Specific Equipment:</b> TAP (Thermal, Acoustic, and Pest Control) Insulation [Active Ingredients: Boric Acid (&lt;15%)], Simple Green® d Pro 3 Plus disinfectant<br><br><b>Target Pests:</b> Rodents`;

// Preset exclusion clauses that can be multi-selected for the Limitations / Exclusions section
const EXCLUSION_PRESETS: { label: string; text: string }[] = [
  {
    label: "Specialty Pests",
    text: "Specialty Pests: Given the unique nature of these pests, treatment for German cockroaches, interior fleas, bed bugs, and bees is not covered under this agreement. We offer our customers these specialty pest services at a discount.",
  },
  {
    label: "Rodents",
    text: "Rodents: This agreement does not cover control for rats and mice.",
  },
  {
    label: "Rodent Trapping",
    text: "Rodent Trapping: This agreement does not cover rodent trapping. We offer these services to our customers at a discounted rate following an inspection.",
  },
  {
    label: "Exclusion",
    text: "Exclusion: This agreement does not include physical exclusion work, such as sealing or blocking entry points to prevent pest access.",
  },
  {
    label: "Web Removal",
    text: "Web Removal: Removal of spider webs or egg sacs from the interior or exterior of the property is not included in this service agreement.",
  },
  {
    label: "Individual Residences",
    text: "Individual Residences: This contract does not extend coverage to individual residential units and applies only to the common areas and/or structures specified in the agreement. Services are provided to residents at a discounted rate and require a separate signed agreement.",
  },
  {
    label: "Bed Bugs",
    text: "Bed Bugs: Bed bug treatment is not included in this agreement, but we offer it to our customers at a discounted rate following a required inspection.",
  },
];

const SERVICE_TYPE_OPTIONS = Object.keys(SERVICE_CONFIG);

// Pre-built proposed services language for "Multi-Family - Apartment Complex" property type
const APARTMENT_COMPLEX_PROPOSED_SERVICES = `<b>Every Visit</b><br>• Check in with management to understand any pest issues and confirm units to be serviced for that day<br>• [X] interior units* per visit for general pests, german roaches, and fleas. +$50 per unit above [X] units<br>• Address any active exterior pest problem areas as needed<br>• Provide the full service report and findings on our Crest Pest client portal<br><br><b>1st Weekly Visit (Focus on Zone #A)</b><br>• Inspect and treat the exterior and interior of the office, the pool area, and the exterior of buildings [XYZ]<br><br><b>2nd Weekly Visit (Focus on Zone #B)</b><br>• Inspect and treat the exterior of buildings [XYZ]<br><br><b>3rd Weekly Visit (Focus on Zone #C)</b><br>• Inspect and treat the exterior of buildings [XYZ]<br><br><b>4th Weekly Visit (Focus on Rodent Bait Stations)</b><br>• On initial visit, install [X] rodent bait stations around the property (see the site map below)<br>• On follow-up visits, check, replenish, and adjust rodent bait stations as needed<br>• Report findings on new rodent activity to management<br><br><b>Additional charges:</b> +$50 per unit above [X] units; $95 for ad hoc treatments; bed bug pricing depends on severity<br><br>* Interior units include treatments or inspections`;

const FREQUENCY_OPTIONS = [
  { label: "One-Time", days: 0 },
  { label: "Weekly", days: 7 },
  { label: "Bi-Weekly", days: 14 },
  { label: "Every 4 Weeks", days: 28 },
  { label: "30 days", days: 30 },
  { label: "60 days", days: 60 },
  { label: "90 days", days: 90 },
];

const formatScheduleChip = (date: Date, isHighFreq: boolean) => {
  if (!isHighFreq) return date.toLocaleDateString("en-US", { month: "short" });
  const month = date.toLocaleDateString("en-US", { month: "long" });
  const week = Math.ceil(date.getDate() / 7);
  return `${month} W${week}`;
};

interface AnalysisData {
  findings: string[];
  recommendations: string[];
  nextSteps: string[];
}

const Report = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { reportId: routeReportId } = useParams();
  const reportId = routeReportId ?? new URLSearchParams(location.search).get("id") ?? undefined;
  
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
    reportType,
  } = location.state || {};

  const [extractedAddress, setExtractedAddress] = useState<string>("");
  const [coordinates, setCoordinates] = useState<{ lat: number; lng: number } | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [analysis, setAnalysis] = useState<AnalysisData | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [editableTech, setEditableTech] = useState(technicianName || "");
  const [editableCustomer, setEditableCustomer] = useState(customerName || "");
  const [editableServiceDate, setEditableServiceDate] = useState(serviceDate || new Date().toISOString().split("T")[0]);
  const [editableLicenseNumber, setEditableLicenseNumber] = useState(licenseNumber || "");
  const [editableAddress, setEditableAddress] = useState(address || "");

  // Set title based on report type
  const getDefaultTitle = (type: string | undefined) => {
    switch (type) {
      case "initial-pest":
        return "Initial Pest Report";
      case "sales":
        return "Sales Report";
      default:
        return "Pest Control Proposal";
    }
  };
  const [editableTitle, setEditableTitle] = useState(getDefaultTitle(reportType));

  // Update title when reportType changes (navigation between report types)
  useEffect(() => {
    setEditableTitle(getDefaultTitle(reportType));
  }, [reportType]);

  // Auto-set license when technician changes
  const handleTechnicianChange = (techName: string) => {
    setEditableTech(techName);
    const tech = TECHNICIANS.find((t) => t.name === techName);
    if (tech) {
      setEditableLicenseNumber(tech.license);
    }
  };

  const [editableTargetPests, setEditableTargetPests] = useState<string[]>(targetPests?.filter((p: string) => p) || []);
  const [editableProductsUsed, setEditableProductsUsed] = useState<string[]>(
    productsUsed?.filter((p: string) => p) || [],
  );
  const [editableEquipment, setEditableEquipment] = useState<string[]>([]);
  const [editableFindings, setEditableFindings] = useState<string[]>([]);
  const [additionalDetailsHeader, setAdditionalDetailsHeader] = useState("Additional Details");
  // Multiple services support
  interface ServiceItem {
    serviceType: string;
    initialPrice: string;
    recurringPrice: string;
    frequency: number;
  }
  const defaultServiceItem = (): ServiceItem => ({ serviceType: "", initialPrice: "", recurringPrice: "", frequency: 30 });
  const normalizeStringArray = (value: unknown): string[] =>
    Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
  const normalizeServices = (value: unknown): ServiceItem[] => {
    if (!Array.isArray(value)) return [defaultServiceItem()];
    const normalized = value
      .filter((service): service is Record<string, unknown> => !!service && typeof service === "object" && !Array.isArray(service))
      .map((service) => ({
        serviceType: String(service.serviceType ?? service.service_type ?? ""),
        initialPrice: String(service.initialPrice ?? service.initial_price ?? ""),
        recurringPrice: String(service.recurringPrice ?? service.recurring_price ?? ""),
        frequency: Number.isFinite(Number(service.frequency)) ? Number(service.frequency) : 30,
      }));
    return normalized.length > 0 ? normalized : [defaultServiceItem()];
  };
  const [services, setServices] = useState<ServiceItem[]>([
    defaultServiceItem(),
  ]);

  const handleServiceChange = (index: number, field: keyof ServiceItem, value: string | number) => {
    setServices((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };

      // Auto-populate if service type changed
      if (field === "serviceType" && typeof value === "string") {
        const config = SERVICE_CONFIG[value];
        if (config) {
          updated[index].frequency = config.frequency;
          // Set default prices
          updated[index].initialPrice = String(config.defaultInitial);
          updated[index].recurringPrice = String(config.defaultRecurring);
        }
      }
      
      return updated;
    });
  };

  // Aggregate target pests and proposed services whenever selected service types change
  const serviceTypesKey = services.map((s) => s.serviceType).join(",");

  // Track if user has manually edited proposed services
  const [userEditedFindings, setUserEditedFindings] = useState(false);
  const findingsEditedRef = useRef(false);
  
  // Track which service types have already been added to proposed services
  const addedServiceTypesRef = useRef<Set<string>>(new Set());
  
  // Track if report has been loaded (to prevent service effect from running before load completes)
  const reportLoadedRef = useRef(false);

  useEffect(() => {
    // Skip adding service descriptions if we're loading an existing report (wait for load to complete)
    // But still update pests for new reports
    const isNewReport = !reportId;
    
    const allPests = new Set<string>();
    let hasAtticService = false;
    const currentServiceTypes = new Set<string>();

    services.forEach((service) => {
      const config = SERVICE_CONFIG[service.serviceType];
      if (config && service.serviceType) {
        currentServiceTypes.add(service.serviceType);
        config.targetPests.forEach((pest) => allPests.add(pest));
        // Check if Attic Services is selected
        if (service.serviceType === "Attic Services (see details below)") {
          hasAtticService = true;
        }
      }
    });

    if (allPests.size > 0) {
      setEditableTargetPests(Array.from(allPests));
    }

    // Auto-populate additional details for Attic Services + reduce font size
    if (hasAtticService && !additionalDetails) {
      setAdditionalDetails(ATTIC_SERVICES_ADDITIONAL_DETAILS);
      setAdditionalDetailsFontSize(9); // Even smaller font to fit attic details
    }

    // Skip service description auto-population for existing reports until loaded
    if (!isNewReport && !reportLoadedRef.current) {
      return;
    }

    // Find new services that haven't been added yet
    // Only add if we don't already have content that contains this service description
    const newServiceTypes: string[] = [];
    currentServiceTypes.forEach((serviceType) => {
      if (!addedServiceTypesRef.current.has(serviceType)) {
        // Double-check: see if the content already contains this service's header
        const config = SERVICE_CONFIG[serviceType];
        const existingContent = editableFindings[0] || "";
        
        // Check if this service description is already in the content
        const serviceHeaderMatch = config?.proposedServices?.match(/<b>([^<]+)<\/b>/);
        const serviceHeader = serviceHeaderMatch ? serviceHeaderMatch[1] : serviceType;
        
        if (!existingContent.includes(serviceHeader)) {
          newServiceTypes.push(serviceType);
        }
        // Mark as added regardless to prevent future re-adds
        addedServiceTypesRef.current.add(serviceType);
      }
    });

    // Append new service descriptions to existing content
    if (newServiceTypes.length > 0) {
      const newDescriptions: string[] = [];
      
      newServiceTypes.forEach((serviceType) => {
        const config = SERVICE_CONFIG[serviceType];
        if (config?.proposedServices) {
          newDescriptions.push(config.proposedServices);
        }
      });

      if (newDescriptions.length > 0) {
        setEditableFindings((prev) => {
          const existingContent = prev[0] || "";
          
          // Format new descriptions
          const formattedNew = newDescriptions.map((desc) => {
            // Check if it's HTML content
            if (desc.includes("<b>") || desc.includes("<br>")) {
              return desc;
            } else {
              // Convert plain text to bullet format
              return desc
                .split(/[.]\s*/)
                .filter((line) => line.trim())
                .map((line) => `• ${line.trim().replace(/\.$/, "")}`)
                .join("<br>");
            }
          }).join("<br><br>");

          // If there's existing content, append with double line break
          if (existingContent.trim()) {
            return [existingContent + "<br><br>" + formattedNew];
          } else {
            return [formattedNew];
          }
        });
      }
    }

    // Clean up removed services from tracking
    addedServiceTypesRef.current.forEach((serviceType) => {
      if (!currentServiceTypes.has(serviceType)) {
        addedServiceTypesRef.current.delete(serviceType);
      }
    });
  }, [serviceTypesKey, editableFindings]);

  const addService = () => {
    if (services.length < 3) {
      setServices((prev) => [...prev, defaultServiceItem()]);
    }
  };

  const removeService = (index: number) => {
    if (services.length > 1) {
      const removedServiceType = services[index].serviceType;
      
      // Remove the service's proposed text from findings
      if (removedServiceType && SERVICE_CONFIG[removedServiceType]) {
        const config = SERVICE_CONFIG[removedServiceType];
        const serviceHeaderMatch = config.proposedServices?.match(/<b>([^<]+)<\/b>/);
        const serviceHeader = serviceHeaderMatch ? serviceHeaderMatch[1] : "";
        
        if (serviceHeader) {
          setEditableFindings((prev) => {
            const content = prev[0] || "";
            if (!content.includes(serviceHeader)) return prev;
            
            // Build a regex to match from the <b>Header</b> to the next <b> or end
            // We need to remove the service block and any surrounding <br><br>
            const escapedHeader = serviceHeader.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            // Match: optional leading <br><br>, then <b>Header</b>..., up to (but not including) the next <b> or end
            const pattern = new RegExp(
              `(?:<br>\\s*<br>\\s*)?<b>${escapedHeader}<\\/b>(?:(?!<b>).)*`,
              'gs'
            );
            let cleaned = content.replace(pattern, '');
            // Clean up leading/trailing <br> tags
            cleaned = cleaned.replace(/^(<br>\s*)+/, '').replace(/(<br>\s*)+$/, '');
            // Clean up double <br><br><br><br> to <br><br>
            cleaned = cleaned.replace(/(<br>\s*){3,}/g, '<br><br>');
            
            return [cleaned];
          });
        }
        
        // Remove from tracking so it can be re-added if user selects it again
        addedServiceTypesRef.current.delete(removedServiceType);
      }
      
      setServices((prev) => prev.filter((_, i) => i !== index));
    }
  };
  const [equipmentDropdownOpen, setEquipmentDropdownOpen] = useState(false);
  const equipmentDropdownRef = useRef<HTMLDivElement>(null);
  const [mapData, setMapData] = useState<string | null>(null);
  const [zoomLevel, setZoomLevel] = useState(20);
  const [staticMapUrl, setStaticMapUrl] = useState<string | null>(null);
  const [pestsDropdownOpen, setPestsDropdownOpen] = useState(false);
  const [productsDropdownOpen, setProductsDropdownOpen] = useState(false);
  const pestsDropdownRef = useRef<HTMLDivElement>(null);
  const productsDropdownRef = useRef<HTMLDivElement>(null);
  const [customMapImage, setCustomMapImage] = useState<string | null>(null);
  const [renderedMapImage, setRenderedMapImage] = useState<string | null>(null); // Static map with annotations
  const [pdfExportMode, setPdfExportMode] = useState(false);
  const latestMapDataRef = useRef<string | null>(null);
  const [propertyImages, setPropertyImages] = useState<Array<{ image: string; caption?: string }>>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isExpandingFindings, setIsExpandingFindings] = useState(false);
  const [isExpandingExpect, setIsExpandingExpect] = useState(false);
  const [customerEmail, setCustomerEmail] = useState("");
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [showComposeDialog, setShowComposeDialog] = useState(false);
  const [pdfAttachOption, setPdfAttachOption] = useState<"short" | "full" | "none">("short");
  const [emailSubject, setEmailSubject] = useState("Crest Pest Control: Service Proposal");
  const [emailMessage, setEmailMessage] = useState("");
  const [selectedPrepSheetIds, setSelectedPrepSheetIds] = useState<string[]>([]);
  const [selectedPrepSheets, setSelectedPrepSheets] = useState<Array<{ id: string; title: string; file_url: string | null }>>([]);
  const [ccEmails, setCcEmails] = useState<string[]>(["office@crestpestcontrol.com", "sales@crestpestco.com", "caleb@crestpestco.com"]);
  const [ccInput, setCcInput] = useState("");
  const [customerSignature, setCustomerSignature] = useState<string | null>(null);
  const [additionalDetails, setAdditionalDetails] = useState("");
  const [fieldroutesCustomerId, setFieldroutesCustomerId] = useState<string | null>(null);
  // FieldRoutes customer-portal URL ({loginlink}) — shown as a prominent
  // "Customer Portal" button in the report header and emailed to the customer.
  const [fieldroutesLoginLink, setFieldroutesLoginLink] = useState<string | null>(null);
  const frAutoPushRef = useRef(false);
  const currentStaff = useCurrentStaff();
  const signatureRef = useRef<SignatureCanvasRef>(null);
  const [showSignatureModal, setShowSignatureModal] = useState(false);
  const [modalSignatureDraft, setModalSignatureDraft] = useState<string | null>(null);
  const modalSignatureRef = useRef<SignatureCanvasRef>(null);
  const [proposedServicesFontSize, setProposedServicesFontSize] = useState(12); // in pixels
  const [additionalDetailsFontSize, setAdditionalDetailsFontSize] = useState(11); // in pixels - compact default for fitting content
  const [showSignature, setShowSignature] = useState(true);
  
  // Property type
  const PROPERTY_TYPES = [
    "Residential",
    "Commercial",
    "Apartment",
    "Multi-Family - Apartment Complex",
    "HOA",
    "Restaurant",
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
  const [propertyType, setPropertyType] = useState<string>("Residential");
  const [companyName, setCompanyName] = useState<string>("");
  
  // Scheduling & Customer Communication
  const [preferredServiceDay, setPreferredServiceDay] = useState("");
  const [preferredServiceTime, setPreferredServiceTime] = useState("");
  const [mainPointOfContact, setMainPointOfContact] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  
  // Setup Materials
  interface SetupMaterial {
    name: string;
    quantity: string;
  }
  const SETUP_MATERIAL_PRESETS = [
    "Bait Boxes",
    "Mosquito Stations",
    "Tin Cats",
    "Snap Traps",
    "Steel Wool",
    "Chicken Wire",
    "Vacuum",
    "Sanitation Spray",
    "Fly Lights",
    "Door Sweep",
    "Drill",
  ];
  const [setupMaterials, setSetupMaterials] = useState<SetupMaterial[]>([]);
  const [limitationsText, setLimitationsText] = useState("");
  const [selectedExclusions, setSelectedExclusions] = useState<string[]>([]);
  const [guaranteeBoxes, setGuaranteeBoxes] = useState<GuaranteeBox[]>([]);
  const guaranteeBoxesHydratedRef = useRef(false);
  const [newMaterialName, setNewMaterialName] = useState("");
  const [newMaterialQty, setNewMaterialQty] = useState("");
  
  const addSetupMaterial = (name: string, quantity: string) => {
    if (name.trim() && quantity.trim()) {
      setSetupMaterials(prev => [...prev, { name: name.trim(), quantity: quantity.trim() }]);
    }
  };
  const removeSetupMaterial = (index: number) => {
    setSetupMaterials(prev => prev.filter((_, i) => i !== index));
  };
  
const [displayedProducts, setDisplayedProducts] = useState(PRODUCT_OPTIONS);
  const [customProductName, setCustomProductName] = useState("");
  const [customProductChemical, setCustomProductChemical] = useState("");
  
  // Track if signature was loaded from database (already saved - cannot be changed)
  const [signatureWasSaved, setSignatureWasSaved] = useState(false);

  // Read-only mode — locked once customer has signed (signature saved in DB)
  const [sentToCustomerAt, setSentToCustomerAt] = useState<string | null>(null);
  const [savedCustomerEmail, setSavedCustomerEmail] = useState<string | null>(null);
  const [isSavingSignature, setIsSavingSignature] = useState(false);
  const isReadOnly = !!signatureWasSaved;
  
  // Persist signature when a customer signs (read-only view), and also as a safety-net
  // if a customer ever lands on this page without an admin session.
  const handleSignatureSave = async (signatureData: string | null) => {
    setCustomerSignature(signatureData);

    const hasAdminSession = !!localStorage.getItem("admin_session");
    const shouldPersist = !!reportId && !!signatureData && (isReadOnly || !hasAdminSession);

    if (shouldPersist) {
      setIsSavingSignature(true);
      try {
        const { error } = await supabase
          .from("reports")
          .update({ customer_signature: signatureData })
          .eq("id", reportId);

        if (error) throw error;
        toast.success("Signature saved successfully!");
      } catch (error: any) {
        console.error("Error saving signature:", error);
        toast.error("Failed to save signature");
      } finally {
        setIsSavingSignature(false);
      }
    }

    // Auto-upload the signed report to FieldRoutes (no approval needed).
    if (signatureData) void autoPushSignedToFieldRoutes();

    // If this sales report contains Rodent Exclusion (or Trapping &
    // Exclusion), auto-spawn a Rodent Exclusion Report so the tech has a
    // pre-populated photo/exclusion write-up ready.
    if (signatureData && reportId) {
      void (async () => {
        try {
          const mod = await import("@/lib/rodentExclusionAutoCreate");
          if (!mod.salesReportHasRodentExclusion(services)) return;
          const res = await mod.ensureRodentExclusionReport({
            id: reportId,
            technician_name: editableTech,
            customer_name: editableCustomer,
            customer_email: customerEmail || null,
            address: editableAddress,
            service_date: editableServiceDate,
            license_number: editableLicenseNumber,
            map_data: mapData ? JSON.parse(mapData) : null,
            custom_map_url: customMapImage,
            rendered_map_url: renderedMapImage,
            fieldroutes_customer_id: fieldroutesCustomerId,
            services,
            property_images: propertyImages,
          });
          if (res?.created) {
            toast.success("Rodent Exclusion Report created", {
              description: "Open it to upload before/after photos.",
              action: {
                label: "Open",
                onClick: () => navigate(mod.rodentExclusionUrl(res.reportId)),
              },
            });
          }
        } catch (e) {
          console.warn("Rodent Exclusion auto-create failed:", e);
        }
      })();
    }
  };

  // Build the PDF and push it directly to FieldRoutes as "Signed Agreement".
  // Manually create a Rodent Exclusion Report from the current sales proposal.
  // Pre-populates customer, address, tech, map, and pests so the tech only
  // has to add the before/after photos.
  const handleCreateRodentExclusionReport = async () => {
    if (!reportId) {
      toast.error("Save the report first before creating the Rodent Exclusion Report.");
      return;
    }
    if (!salesReportHasRodentExclusion(services)) {
      toast.error("No rodent exclusion service on this proposal.");
      return;
    }
    try {
      const res = await ensureRodentExclusionReport({
        id: reportId,
        technician_name: editableTech,
        customer_name: editableCustomer,
        customer_email: customerEmail || null,
        address: editableAddress,
        service_date: editableServiceDate,
        license_number: editableLicenseNumber,
        map_data: mapData ? JSON.parse(mapData) : null,
        custom_map_url: customMapImage,
        rendered_map_url: renderedMapImage,
        fieldroutes_customer_id: fieldroutesCustomerId,
        services,
        property_images: propertyImages,
      });
      if (!res) {
        toast.error("Could not create Rodent Exclusion Report.");
        return;
      }
      toast.success(
        res.created ? "Rodent Exclusion Report created" : "Opening existing Rodent Exclusion Report",
        {
          description: "Add the before/after photos to finish it.",
          action: {
            label: "Open",
            onClick: () => navigate(rodentExclusionUrl(res.reportId)),
          },
        },
      );
      navigate(rodentExclusionUrl(res.reportId));
    } catch (e: any) {
      console.error("handleCreateRodentExclusionReport failed:", e);
      toast.error("Failed to create Rodent Exclusion Report");
    }
  };

  // Build the PDF and push it directly to FieldRoutes as "Signed Agreement".
  // Silent — runs only when admin session + linked customer are both present.
  const autoPushSignedToFieldRoutes = async () => {
    if (frAutoPushRef.current) return;
    const sessionToken = localStorage.getItem("admin_session");
    if (!sessionToken || !reportId || !fieldroutesCustomerId) return;
    frAutoPushRef.current = true;
    try {
      await captureFreshRenderedMap();
      setPdfExportMode(true);
      await new Promise((r) => setTimeout(r, 200));
      const pageEls = Array.from(
        document.querySelectorAll<HTMLElement>("[data-pdf-capture]")
      ).sort((a, b) => Number(a.dataset.pdfCapture) - Number(b.dataset.pdfCapture));
      const reportPages = pageEls.filter((el) => !el.querySelector(".no-images-placeholder"));
      const pdfBytes = await buildSimplePDF({ reportPages, compact: true }) as Uint8Array;
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
          filename: `Crest_${(editableCustomer || "Customer").replace(/\s+/g, "_")}_signed.pdf`,
          description: "Signed Agreement",
          reportId,
          showCustomer: false,
          autoApprove: true,
        },
      });
      if (error || !data?.ok) {
        frAutoPushRef.current = false;
        console.warn("FieldRoutes auto-upload failed", data?.error ?? error?.message);
      }
    } catch (e) {
      frAutoPushRef.current = false;
      setPdfExportMode(false);
      console.warn("FieldRoutes auto-upload exception", e);
    }
  };

  // If an admin opens an already-signed report, push it once (server dedupes).
  useEffect(() => {
    if (!reportId || !customerSignature || !fieldroutesCustomerId) return;
    if (!localStorage.getItem("admin_session")) return;
    if (frAutoPushRef.current) return;
    void autoPushSignedToFieldRoutes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportId, customerSignature, fieldroutesCustomerId]);

  // Backfill FieldRoutes {loginlink} when the report is linked but no portal URL
  // was captured at link time (older reports). Looks the customer up by email
  // and surfaces the prominent "Customer Portal" button in the header.
  useEffect(() => {
    if (!fieldroutesCustomerId || fieldroutesLoginLink) return;
    const query = (customerEmail || "").trim();
    if (query.length < 2) return;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase.functions.invoke("fieldroutes-customer-search", {
          body: { q: query, staffName: currentStaff?.fullName, limit: 25 },
        });
        if (cancelled || !data?.ok) return;
        const match = (data.results ?? []).find(
          (r: { customer_id?: string; loginLink?: string | null }) =>
            String(r.customer_id) === String(fieldroutesCustomerId),
        );
        if (match?.loginLink) setFieldroutesLoginLink(String(match.loginLink));
      } catch {
        /* silent */
      }
    })();
    return () => { cancelled = true; };
  }, [fieldroutesCustomerId, fieldroutesLoginLink, customerEmail, currentStaff?.fullName]);

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
    // Reset per-report tracking to prevent duplicated auto-appends when switching/loading reports
    addedServiceTypesRef.current = new Set();

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
      // Strip the legacy per-service `<b>Disclaimer:</b>` paragraph on the way
      // in — it lives globally at the bottom of the report now.
      setEditableFindings((analysis.findings || []).map((f) => stripDisclaimerFromHtml(f || "")));
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
      if (productsDropdownRef.current && !productsDropdownRef.current.contains(event.target as Node)) {
        setProductsDropdownOpen(false);
      }
      if (equipmentDropdownRef.current && !equipmentDropdownRef.current.contains(event.target as Node)) {
        setEquipmentDropdownOpen(false);
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

  // Auto-seed default rodent guarantee box once when a rodent service is
  // added and no boxes have been saved yet. After hydration or any admin
  // edit (including deletion), we leave the saved list alone.
  useEffect(() => {
    if (guaranteeBoxesHydratedRef.current) return;
    if (guaranteeBoxes.length > 0) return;
    const seeded = resolveInitialGuaranteeBoxes(undefined, services.map((s) => s.serviceType));
    if (seeded.length > 0) {
      setGuaranteeBoxes(seeded);
      guaranteeBoxesHydratedRef.current = true;
    }
  }, [services, guaranteeBoxes.length]);

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
        const { data, error } = await supabase.from("reports").select("*").eq("id", reportId).maybeSingle();
        if (error) throw error;
        if (!data) throw new Error("Report not found");
        row = data;
      }

      setEditableTech(row.technician_name || "");
      setEditableCustomer(row.customer_name || "");
      setExtractedAddress(row.address || "");
      setEditableAddress(row.address || "");
      setEditableFindings(normalizeStringArray(row.findings).map((f) => stripDisclaimerFromHtml(f || "")));
      // Mark findings as edited if there was saved data, to prevent auto-override
      if (row.findings && Array.isArray(row.findings) && row.findings.length > 0) {
        findingsEditedRef.current = true;
        setUserEditedFindings(true);
      }

      // Load new fields
      if (row.customer_signature) {
        setCustomerSignature(row.customer_signature);
        setSignatureWasSaved(true); // Mark as saved from DB - cannot be re-signed
      }
      if (row.fieldroutes_customer_id) {
        setFieldroutesCustomerId(String(row.fieldroutes_customer_id));
      }
      // Hydrate the customer portal link from customer_preferences JSON.
      {
        const prefs = (row as { customer_preferences?: { fieldroutes_login_link?: string | null } | null }).customer_preferences;
        if (prefs && typeof prefs === "object" && prefs.fieldroutes_login_link) {
          setFieldroutesLoginLink(String(prefs.fieldroutes_login_link));
        }
      }
      if (row.services && Array.isArray(row.services) && row.services.length > 0) {
        const normalizedServices = normalizeServices(row.services);
        setServices(normalizedServices);
        // Prevent the service auto-population effect from re-appending descriptions already saved
        addedServiceTypesRef.current = new Set(
          normalizedServices
            .map((s) => s.serviceType)
            .filter((t): t is string => !!t),
        );
      } else {
        // Ensure stale service tracking doesn't leak between reports
        addedServiceTypesRef.current = new Set();
      }
      
      // Mark report as loaded so service effect can now run for new service additions
      reportLoadedRef.current = true;
      if (row.service_date) {
        setEditableServiceDate(row.service_date);
      }
      if (row.license_number) {
        setEditableLicenseNumber(row.license_number);
      }
      if (row.target_pests && Array.isArray(row.target_pests)) {
        setEditableTargetPests(normalizeStringArray(row.target_pests));
      }
      if (row.products_used && Array.isArray(row.products_used)) {
        setEditableProductsUsed(normalizeStringArray(row.products_used));
      }
      if (row.equipment && Array.isArray(row.equipment)) {
        setEditableEquipment(normalizeStringArray(row.equipment));
      }
      if (row.report_title) {
        setEditableTitle(row.report_title);
      }
      if (row.notes) {
        // notes is stored as JSON string with structured data or plain string
        if (typeof row.notes === 'string') {
          try {
            const parsed = JSON.parse(row.notes);
            if (parsed && typeof parsed === 'object' && parsed._structuredNotes) {
              setAdditionalDetails(parsed.additionalDetails || "");
              setPropertyType(parsed.propertyType || "Residential");
              setCompanyName(parsed.companyName || "");
              setPreferredServiceDay(parsed.preferredServiceDay || "");
              setPreferredServiceTime(parsed.preferredServiceTime || "");
              setMainPointOfContact(parsed.mainPointOfContact || "");
              setContactPhone(parsed.contactPhone || "");
              setSetupMaterials(parsed.setupMaterials || []);
              setLimitationsText(parsed.limitationsText || "");
              setSelectedExclusions(Array.isArray(parsed.selectedExclusions) ? parsed.selectedExclusions : []);
              if (Array.isArray(parsed.guaranteeBoxes)) {
                setGuaranteeBoxes(parsed.guaranteeBoxes);
                guaranteeBoxesHydratedRef.current = true;
              }
            } else {
              setAdditionalDetails(row.notes);
            }
          } catch {
            setAdditionalDetails(row.notes);
          }
        } else {
          setAdditionalDetails(typeof row.notes === "string" ? row.notes : "");
        }
      }
      
      // Load sent status for read-only mode
      if (row.sent_to_customer_at) {
        setSentToCustomerAt(row.sent_to_customer_at);
      }
      if (row.customer_email) {
        setSavedCustomerEmail(row.customer_email);
        setCustomerEmail(row.customer_email);
      }

      console.log("Loading report map_data:", {
        hasMapData: !!row.map_data,
        mapDataType: typeof row.map_data,
        mapDataPreview: row.map_data ? JSON.stringify(row.map_data).substring(0, 150) : "null",
      });

      if (typeof row.map_data === "string") {
        setMapData(row.map_data);
      } else if (row.map_data && typeof row.map_data === "object") {
        setMapData(JSON.stringify(row.map_data));
      } else {
        setMapData(null);
      }

      // Load custom map and property images
      if (row.custom_map_url) {
        setCustomMapImage(row.custom_map_url);
      }

      if (Array.isArray(row.property_images)) {
        setPropertyImages(
          row.property_images
            .map((item: any) =>
              typeof item === "string"
                ? { image: item, caption: "" }
                : item && typeof item === "object" && typeof item.image === "string"
                  ? { image: item.image, caption: typeof item.caption === "string" ? item.caption : "" }
                  : null,
            )
            .filter((item): item is { image: string; caption: string } => !!item),
        );
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

  const buildStructuredNotes = () =>
    JSON.stringify({
      _structuredNotes: true,
      additionalDetails: additionalDetails || notes || "",
      propertyType,
      companyName,
      preferredServiceDay,
      preferredServiceTime,
      mainPointOfContact,
      contactPhone,
      setupMaterials,
      limitationsText,
      selectedExclusions,
      guaranteeBoxes,
    });

  const buildServicesPayload = () =>
    services
      .filter((service) => service.serviceType)
      .map((service) => ({
        serviceType: service.serviceType,
        initialPrice: service.initialPrice,
        recurringPrice: service.recurringPrice,
        frequency: service.frequency,
      }));

  const waitForPdfMapRender = () =>
    new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => resolve());
      });
    });

  const captureFreshRenderedMap = async (): Promise<string | null> => {
    const exportFn = (window as any).exportMapAsImage as undefined | (() => Promise<string | null>);
    if (!exportFn) return renderedMapImage;

    const freshRender = await exportFn();
    if (!freshRender) return renderedMapImage;

    setRenderedMapImage(freshRender);
    await waitForPdfMapRender();
    return freshRender;
  };

  const buildBaseReportPayload = (
    mapPayload: any,
    finalSignature?: string | null,
    renderedMapUrl?: string | null,
  ) => ({
    technician_name: editableTech,
    customer_name: editableCustomer,
    address: editableAddress || extractedAddress || address,
    notes: buildStructuredNotes(),
    findings: editableFindings,
    recommendations: [],
    next_steps: [],
    map_url: coordinates
      ? `https://www.openstreetmap.org/?mlat=${coordinates.lat}&mlon=${coordinates.lng}#map=17/${coordinates.lat}/${coordinates.lng}`
      : null,
    map_data: mapPayload,
    custom_map_url: customMapImage,
    rendered_map_url: renderedMapUrl ?? renderedMapImage,
    property_images: propertyImages,
    customer_signature: finalSignature,
    services: buildServicesPayload() as unknown as any[],
    service_date: editableServiceDate,
    license_number: editableLicenseNumber,
    target_pests: editableTargetPests,
    products_used: editableProductsUsed,
    equipment: editableEquipment,
    report_title: editableTitle,
    customer_email: customerEmail || null,
    fieldroutes_customer_id: fieldroutesCustomerId,
    // Persist FieldRoutes customer-portal link so it survives reload and
    // can be shown as the "Customer Portal" button on the report header.
    customer_preferences: { fieldroutes_login_link: fieldroutesLoginLink || null },
  });

  const persistReport = async (reportData: Record<string, unknown>) => {
    const adminSessionToken = localStorage.getItem("admin_session");

    // Auto-link to a FieldRoutes customer if not already linked, so the signed
    // PDF can later upload back to the right customer. High-confidence only.
    if (!reportData.fieldroutes_customer_id) {
      try {
        const match = await autoMatchCustomerId({
          email: reportData.customer_email as string | null,
          name: reportData.customer_name as string | null,
          address: reportData.address as string | null,
          staffName: currentStaff?.fullName,
        });
        if (match) {
          reportData.fieldroutes_customer_id = match.customerId;
          setFieldroutesCustomerId(match.customerId);
          if (match.loginLink) {
            setFieldroutesLoginLink(match.loginLink);
            const existingPrefs =
              (reportData.customer_preferences as Record<string, unknown> | null | undefined) || {};
            reportData.customer_preferences = {
              ...existingPrefs,
              fieldroutes_login_link: match.loginLink,
            };
          }
        }
      } catch (e) {
        console.warn("FieldRoutes auto-match skipped", e);
      }
    }

    if (reportId) {
      let savedViaAdmin = false;

      if (adminSessionToken) {
        console.log("Saving via admin-reports API...");
        try {
          const { data, error: invokeError } = await supabase.functions.invoke("admin-reports", {
            body: {
              sessionToken: adminSessionToken,
              action: "update",
              reportId,
              reportData,
            },
          });

          if (!invokeError && data?.ok) {
            savedViaAdmin = true;
            if (data.report?.services) {
              setServices(normalizeServices(data.report.services));
            }
            console.log("Admin save successful:", { servicesCount: data.report?.services?.length });
          } else {
            console.warn("Admin save failed, falling back to direct update", data?.error);
          }
        } catch (error) {
          console.warn("Admin API error, falling back to direct update", error);
        }
      }

      if (!savedViaAdmin) {
        const { error: updateError } = await supabase.from("reports").update(reportData).eq("id", reportId);
        if (updateError) throw updateError;
      }

      return reportId;
    }

    const newId = crypto.randomUUID();
    const { error: insertError } = await supabase.from("reports").insert([{ id: newId, ...reportData } as any]);

    if (insertError) throw insertError;

    navigate({ pathname: location.pathname, search: `?id=${newId}` }, { replace: true });
    return newId;
  };

  const handleSubmit = async () => {
    if (!editableTech) {
      toast.error("Please enter technician name");
      return;
    }

    setIsSaving(true);
    try {
      const finalSignature = signatureRef.current?.forceSave() ?? customerSignature;

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

      await persistReport(buildBaseReportPayload(mapPayload, finalSignature));
      toast.success("Report saved successfully!");
    } catch (error: any) {
      toast.error("Failed to save report");
      console.error(error);
    } finally {
      setIsSaving(false);
    }
  };

  // Auto-save flag — set after image/map uploads, cleared by the effect
  const pendingAutoSaveRef = useRef(false);

  // Silent auto-save (no toast, no loading spinner)
  const autoSave = async () => {
    if (!editableTech || !reportId) return;
    try {
      const rawMap = latestMapDataRef.current ?? mapData;
      let mapPayload: any = null;
      if (rawMap) {
        try { mapPayload = JSON.parse(rawMap); } catch { mapPayload = rawMap; }
      }
      const finalSignature = signatureRef.current?.forceSave() ?? customerSignature;
      await persistReport(buildBaseReportPayload(mapPayload, finalSignature));
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
  }, [propertyImages, customMapImage]);

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

  const exportToPDF = async (mode: "short" | "full" = "short") => {
    try {
      toast.info("Generating PDF...", { duration: 10000, id: "pdf-gen" });

      await captureFreshRenderedMap();

      // Switch to static map image for capture
      setPdfExportMode(true);
      await new Promise((r) => setTimeout(r, 200));

      const pageEls = Array.from(
        document.querySelectorAll<HTMLElement>("[data-pdf-capture]")
      ).sort((a, b) => Number(a.dataset.pdfCapture) - Number(b.dataset.pdfCapture));

      const reportPages = pageEls.filter((el) => !el.querySelector(".no-images-placeholder"));

      let pdfBytes: Uint8Array;
      if (mode === "full") {
        pdfBytes = await buildMergedPDF({
          customerName: editableCustomer || "",
          technicianName: editableTech || "",
          address: editableAddress || extractedAddress || address || "",
          reportPages,
        });
      } else {
        pdfBytes = await buildSimplePDF({ reportPages });
      }

      setPdfExportMode(false);

      toast.dismiss("pdf-gen");

      const filename = `Crest_Proposal_${(editableCustomer || "Customer").replace(/\s+/g, "_")}.pdf`;
      downloadPDF(pdfBytes, filename);
      toast.success("PDF downloaded!");
    } catch (e) {
      console.error("PDF export error:", e);
      setPdfExportMode(false);
      toast.dismiss("pdf-gen");
      toast.error("PDF generation failed. Try again.");
    }
  };

  const handleOpenCompose = () => {
    // Build a dynamic default email message based on selected services
    const activeServices = services.filter(s => s.serviceType);
    const primaryService = activeServices[0]?.serviceType || "pest control services";
    const freq = activeServices[0]?.frequency;
    const freqLabel = freq === 0 ? "" : freq === 30 ? "monthly" : freq === 60 ? "bi-monthly" : freq === 90 ? "quarterly" : freq === 7 ? "weekly" : `every ${freq} days`;
    const additionalServices = activeServices.slice(1).map(s => s.serviceType).join(", ");
    const additionalLine = additionalServices ? `, as well as ${additionalServices}` : "";
    const freqLine = freqLabel ? ` every ${freqLabel}` : "";

    const serviceLines = [primaryService, ...activeServices.slice(1).map((s) => s.serviceType)].filter(Boolean);

    const firstName = (editableCustomer || "").split(" ")[0] || "there";
    const serviceBullets = serviceLines.length > 0
      ? serviceLines.map((s) => `- ${s}`).join("\n\n")
      : "- General Pest Control";
    const defaultMessage = `Hi ${firstName},

Thank you for the opportunity to prepare a proposal for your property.

Based on our assessment, we've put together a plan designed to effectively address your pest control needs. This proposal includes:

${serviceBullets}

Our goal is to provide reliable, proactive protection so you can have peace of mind knowing your property is covered.

Please feel free to reach out with any questions or if you'd like to move forward, we’re happy to help. You can also add a payment method anytime through the customer portal button below.

Best,

${editableTech || "Your Technician"}

Crest Pest Control`;
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
      const finalSignature = signatureRef.current?.forceSave() ?? customerSignature;
      const rawMap = latestMapDataRef.current ?? mapData;

      let mapPayload: any = null;
      if (rawMap) {
        try {
          mapPayload = JSON.parse(rawMap);
        } catch (e) {
          mapPayload = rawMap;
        }
      }

      const freshRenderedMap = await captureFreshRenderedMap();
      const sentAt = new Date().toISOString();
      const finalReportId = await persistReport({
        ...buildBaseReportPayload(mapPayload, finalSignature, freshRenderedMap),
        customer_email: customerEmail,
        sent_to_customer_at: sentAt,
      });

      // Generate PDF to attach based on option
      let pdfBase64: string | undefined;
      if (pdfAttachOption !== "none") {
        toast.info("Generating PDF for email...", { duration: 15000, id: "pdf-email" });
        try {
          setPdfExportMode(true);
          await new Promise((r) => setTimeout(r, 200));

          const pageEls = Array.from(
            document.querySelectorAll<HTMLElement>("[data-pdf-capture]")
          ).sort((a, b) => Number(a.dataset.pdfCapture) - Number(b.dataset.pdfCapture));
          const reportPages = pageEls.filter((el) => !el.querySelector(".no-images-placeholder"));

          let pdfBytes: Uint8Array;
          if (pdfAttachOption === "full") {
            pdfBytes = await buildMergedPDF({
              customerName: editableCustomer || "",
              technicianName: editableTech || "",
              address: editableAddress || extractedAddress || address || "",
              reportPages,
            });
          } else {
            pdfBytes = await buildSimplePDF({ reportPages }) as Uint8Array;
          }

          setPdfExportMode(false);

          const binary = Array.from(pdfBytes).map((b) => String.fromCharCode(b)).join("");
          pdfBase64 = btoa(binary);
        } catch (pdfErr) {
          setPdfExportMode(false);
          console.warn("PDF generation failed, sending email without attachment:", pdfErr);
        }
        toast.dismiss("pdf-email");
      }

      const { error } = await supabase.functions.invoke("send-report-email", {
        body: {
          customerEmail,
          ccEmails: ccEmails.length > 0 ? ccEmails : undefined,
          customerName: editableCustomer,
          technicianName: editableTech,
          address: editableAddress || extractedAddress || address || "",
          reportUrl: `${window.location.origin}/view-report/${finalReportId}`,
          emailSubject,
          emailMessage,
          baseUrl: window.location.origin,
          reportType: "sales",
          customerPortalUrl: fieldroutesLoginLink || undefined,
          ...(selectedPrepSheets.length > 0 ? {
            extraAttachments: buildPrepSheetAttachments(selectedPrepSheets),
          } : {}),
          ...(pdfBase64 ? {
            pdfBase64,
            pdfFilename: `Crest_Proposal_${(editableCustomer || "Customer").replace(/\s+/g, "_")}.pdf`,
          } : {}),
        },
      });

      if (error) throw error;

      setSentToCustomerAt(sentAt);
      setSavedCustomerEmail(customerEmail);

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

  const formatProposedServices = (text: string): string => {
    if (!text) return "";
    // Just preserve the text exactly as entered, converting newlines for HTML display
    return text.replace(/\n/g, "<br/>");
  };

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
      // Import the compress function dynamically to avoid circular deps
      const { compressImage } = await import("@/lib/imageUpload");
      
      // Compress image and get instant local preview
      const { blob: compressedBlob, localUrl } = await compressImage(file, {
        maxWidth: 1200,
        maxHeight: 1200,
        quality: 0.75,
      });

      console.log("[upload] compressed", {
        originalSize: file.size,
        compressedSize: compressedBlob.size,
        reduction: `${Math.round((1 - compressedBlob.size / file.size) * 100)}%`,
      });

      // Show local preview INSTANTLY while upload happens
      setCustomMapImage(localUrl);

      // Upload compressed image in background
      const fileName = `${Math.random()}.jpg`;
      const filePath = `${reportId || "temp"}/custom-map/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from("report-images")
        .upload(filePath, compressedBlob, { upsert: true, contentType: "image/jpeg" });

      if (uploadError) throw uploadError;

      const {
        data: { publicUrl },
      } = supabase.storage.from("report-images").getPublicUrl(filePath);

      // Replace local URL with permanent URL (user won't notice the switch)
      setCustomMapImage(publicUrl);
      URL.revokeObjectURL(localUrl);
      pendingAutoSaveRef.current = true;
      toast.success("Map uploaded");
    } catch (error) {
      console.error("Error uploading map:", error);
      toast.error("Failed to upload map image");
    }
  };

  const handlePropertyImagesUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    console.log("[upload] property images selected", {
      count: files?.length,
      types: files ? Array.from(files).slice(0, 8).map((f) => f.type) : [],
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
      const { compressImage } = await import("@/lib/imageUpload");

      // Compress all images and show local previews instantly
      const compressionPromises = fileArray.map(async (file) => {
        const { blob, localUrl } = await compressImage(file, {
          maxWidth: 1200,
          maxHeight: 1200,
          quality: 0.75,
        });
        console.log("[upload] property image compressed", {
          originalSize: file.size,
          compressedSize: blob.size,
          reduction: `${Math.round((1 - blob.size / file.size) * 100)}%`,
        });
        return { blob, localUrl };
      });

      const compressedImages = await Promise.all(compressionPromises);

      // Show local previews INSTANTLY
      setPropertyImages(compressedImages.map(({ localUrl }) => ({ image: localUrl, caption: "" })));

      // Upload compressed images in background
      const uploadPromises = compressedImages.map(async ({ blob, localUrl }, index) => {
        const fileName = `${Math.random()}.jpg`;
        const filePath = `${reportId || "temp"}/property/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from("report-images")
          .upload(filePath, blob, { upsert: true, contentType: "image/jpeg" });

        if (uploadError) throw uploadError;

        const {
          data: { publicUrl },
        } = supabase.storage.from("report-images").getPublicUrl(filePath);

        // Revoke local URL after upload completes
        URL.revokeObjectURL(localUrl);

        return { image: publicUrl, caption: "", index };
      });

      const uploadedImages = await Promise.all(uploadPromises);
      
      // Replace local URLs with permanent URLs
      setPropertyImages(uploadedImages.map(({ image, caption }) => ({ image, caption })));
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

  const [draggedImageIndex, setDraggedImageIndex] = useState<number | null>(null);
  const [annotatingImageIndex, setAnnotatingImageIndex] = useState<number | null>(null);

  const handleImageDragStart = (index: number) => {
    setDraggedImageIndex(index);
  };

  const handleImageDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedImageIndex === null || draggedImageIndex === index) return;

    setPropertyImages((prev) => {
      const updated = [...prev];
      const [dragged] = updated.splice(draggedImageIndex, 1);
      updated.splice(index, 0, dragged);
      return updated;
    });
    setDraggedImageIndex(index);
  };

  const handleImageDragEnd = () => {
    setDraggedImageIndex(null);
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
          const { compressImage } = await import("@/lib/imageUpload");
          
          const { blob: compressedBlob, localUrl } = await compressImage(file, {
            maxWidth: 1200,
            maxHeight: 1200,
            quality: 0.75,
          });

          console.log("[paste] map image compressed", {
            originalSize: file.size,
            compressedSize: compressedBlob.size,
          });

          // Show local preview INSTANTLY
          setCustomMapImage(localUrl);

          // Upload in background
          const fileName = `${Math.random()}.jpg`;
          const filePath = `${reportId || "temp"}/custom-map/${fileName}`;

          const { error: uploadError } = await supabase.storage
            .from("report-images")
            .upload(filePath, compressedBlob, { upsert: true, contentType: "image/jpeg" });

          if (uploadError) throw uploadError;

          const {
            data: { publicUrl },
          } = supabase.storage.from("report-images").getPublicUrl(filePath);

          setCustomMapImage(publicUrl);
          URL.revokeObjectURL(localUrl);
          pendingAutoSaveRef.current = true;
          toast.success("Map pasted successfully");
        } catch (error) {
          console.error("Error pasting map:", error);
          toast.error("Failed to paste map image");
        }
        break; // Only process first image
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

    // Limit to 20 images total
    const maxNew = Math.min(imageFiles.length, 20 - propertyImages.length);
    if (maxNew <= 0) {
      toast.error("Maximum 20 images allowed");
      return;
    }

    const filesToProcess = imageFiles.slice(0, maxNew);

    try {
      const { compressImage } = await import("@/lib/imageUpload");

      const compressionPromises = filesToProcess.map(async (file) => {
        const { blob, localUrl } = await compressImage(file, {
          maxWidth: 1200,
          maxHeight: 1200,
          quality: 0.75,
        });
        console.log("[paste] property image compressed", {
          originalSize: file.size,
          compressedSize: blob.size,
        });
        return { blob, localUrl };
      });

      const compressedImages = await Promise.all(compressionPromises);

      // Show local previews INSTANTLY (append to existing)
      setPropertyImages(prev => [
        ...prev,
        ...compressedImages.map(({ localUrl }) => ({ image: localUrl, caption: "" }))
      ]);

      // Upload in background
      const uploadPromises = compressedImages.map(async ({ blob, localUrl }, index) => {
        const fileName = `${Math.random()}.jpg`;
        const filePath = `${reportId || "temp"}/property/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from("report-images")
          .upload(filePath, blob, { upsert: true, contentType: "image/jpeg" });

        if (uploadError) throw uploadError;

        const {
          data: { publicUrl },
        } = supabase.storage.from("report-images").getPublicUrl(filePath);

        URL.revokeObjectURL(localUrl);
        return { image: publicUrl, caption: "", localUrl };
      });

      const uploadedImages = await Promise.all(uploadPromises);
      
      // Replace local URLs with permanent URLs
      setPropertyImages(prev => {
        const updated = [...prev];
        uploadedImages.forEach(({ image, localUrl }) => {
          const idx = updated.findIndex(img => img.image === localUrl);
          if (idx !== -1) {
            updated[idx] = { ...updated[idx], image };
          }
        });
        return updated;
      });

      pendingAutoSaveRef.current = true;
      toast.success(`${filesToProcess.length} image(s) pasted`);
    } catch (error) {
      console.error("Error pasting images:", error);
      toast.error("Failed to paste images");
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Read-only banner for customer viewing */}
      {isReadOnly && (
        <div className="bg-primary text-primary-foreground py-3 px-4 text-center no-print sticky top-0 z-30">
          <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-center justify-center gap-2">
            <span className="font-semibold">
              {customerSignature ? "✓ Signed Proposal" : "Please review and sign below to accept this proposal"}
            </span>
            {customerSignature && (
              <span className="text-sm opacity-90">— Thank you for choosing Crest Pest Control!</span>
            )}
          </div>
        </div>
      )}
      
      {/* Mobile Header is removed — always use the unified desktop/tablet header below */}

      {/* Unified Header — always shown */}
      <div data-pdf-capture="0" className="print-header bg-card shadow-md border-b border-border px-3 sm:px-6 py-3 sm:py-4 print:py-2.5 sticky top-0 z-20 lg:static">
          <div className="max-w-[1800px] mx-auto">
            {/* Top row: Logo + Title + Action buttons */}
            <div className="flex items-center gap-3 mb-2 print:mb-1">
              <div className="flex items-center gap-3 shrink-0">
                <div className="flex flex-col items-center">
                  <img src={crestLogo} alt="Crest Pest Control" className="h-16 lg:h-24 w-auto object-contain" />
                  <span className="text-xs lg:text-sm text-muted-foreground mt-1">PR #9859</span>
                </div>
                <div className="flex flex-col justify-center">
                  {isReadOnly ? (
                    <h1 className="print-title font-bold text-foreground text-xl sm:text-2xl lg:text-3xl print:text-2xl leading-tight">
                      {editableTitle}
                    </h1>
                  ) : (
                    <input
                      value={editableTitle}
                      onChange={(e) => setEditableTitle(e.target.value)}
                      className="print-title font-bold text-foreground bg-transparent border-b border-border px-1 text-xl sm:text-2xl lg:text-3xl print:text-2xl h-10 lg:h-14 print:h-auto w-full max-w-[14rem] sm:max-w-[20rem] lg:w-[28rem] lg:max-w-none print:w-auto focus-visible:outline-none focus-visible:ring-0"
                    />
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 no-print ml-auto shrink-0">
                {salesReportHasRodentExclusion(services) && reportId && (
                  <Button
                    onClick={handleCreateRodentExclusionReport}
                    variant="secondary"
                    size="sm"
                    title="Create a Rodent Exclusion service report from this proposal"
                  >
                    <Plus className="w-3 h-3 mr-1" />
                    <span className="hidden sm:inline">Rodent Exclusion Report</span>
                  </Button>
                )}
                <Button onClick={handleOpenCompose} variant="secondary" size="sm">
                  <Mail className="w-3 h-3 mr-1" />
                  <span className="hidden sm:inline">Email</span>
                </Button>
                <Button onClick={handleSubmit} disabled={isSaving} size="sm">
                  {isSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3 mr-1" />}
                  <span className="hidden sm:inline">Save</span>
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm">
                      <FileDown className="w-3 h-3 mr-1" />
                      <span className="hidden sm:inline">PDF</span>
                      <ChevronDown className="w-3 h-3 ml-1" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => exportToPDF("short")}>Short PDF</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => exportToPDF("full")}>Full Proposal PDF</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button onClick={() => navigate("/")} variant="outline" size="sm">
                  <Home className="w-3 h-3" />
                </Button>
              </div>
            </div>

            {/* FieldRoutes customer link — search & select to autofill + link */}
            {!isReadOnly && (
              <div className="mb-3 no-print space-y-2">
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
                    const addr = [c.address, [c.city, c.state].filter(Boolean).join(", "), c.zip]
                      .filter(Boolean).join(", ");
                    if (addr) { setEditableAddress(addr); setExtractedAddress(addr); }
                  }}
                  onClear={() => { setFieldroutesCustomerId(null); setFieldroutesLoginLink(null); }}
                />
                {fieldroutesCustomerId && (
                  <div>
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
            )}
            {isReadOnly && fieldroutesCustomerId && (
              <div className="mb-2 text-xs text-muted-foreground">
                FieldRoutes customer <span className="font-medium text-foreground">#{fieldroutesCustomerId}</span>
              </div>
            )}

            {/* Customer Portal button — prominent at the top of the report header.
                Uses the FieldRoutes {loginlink} for the linked customer. */}
            {fieldroutesLoginLink && (
              <div className="mb-3">
                <a
                  href={fieldroutesLoginLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between gap-3 rounded-xl border border-primary/40 bg-primary/10 px-4 py-3 hover:bg-primary/15 transition-colors no-underline"
                >
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-primary/80">Customer Portal</p>
                    <p className="text-sm font-bold text-foreground truncate">
                      Open Customer Portal &nbsp;→&nbsp; manage account &amp; add a payment method in Wallet
                    </p>
                  </div>
                  <span className="hidden sm:inline-flex items-center rounded-md bg-foreground text-background text-xs font-bold px-3 py-1.5">
                    Open
                  </span>
                </a>
              </div>
            )}

            {/* Info grid - 2 columns on screen, 3 columns for print to reduce vertical height */}
            <div className="grid grid-cols-2 print:grid-cols-3 gap-x-6 gap-y-1 print:gap-x-4 print:gap-y-0">
              {/* Column 1: Customer Details */}
              <div>
                <p className="font-semibold text-foreground text-sm mb-0.5 print:text-xs">Customer Details:</p>
                <div className="space-y-0.5 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground w-16">Name:</span>
                    {isReadOnly ? (
                      <span className="text-foreground font-medium">{editableCustomer || "—"}</span>
                    ) : (
                      <>
                        <Input
                          value={editableCustomer}
                          onChange={(e) => setEditableCustomer(e.target.value)}
                          placeholder="Customer name"
                          className="bg-transparent border-b border-border text-foreground placeholder:text-muted-foreground px-1 h-6 text-xs flex-1 min-w-0 focus-visible:ring-0 no-print"
                        />
                        <span className="print-only-text hidden text-foreground font-medium">{editableCustomer || "—"}</span>
                      </>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground w-16">Address:</span>
                    {isReadOnly ? (
                      <span className="text-foreground font-medium">{editableAddress || extractedAddress || "—"}</span>
                    ) : (
                      <>
                        <Input
                          value={editableAddress || extractedAddress}
                          onChange={(e) => setEditableAddress(e.target.value)}
                          placeholder="Enter address"
                          className="bg-transparent border-b border-border text-foreground placeholder:text-muted-foreground px-1 h-6 text-xs flex-1 min-w-0 focus-visible:ring-0 no-print"
                        />
                        <span className="print-only-text hidden text-foreground font-medium">{editableAddress || extractedAddress || "—"}</span>
                      </>
                    )}
                  </div>
                  {!isReadOnly && (
                    <div className="flex items-center gap-2 print:hidden">
                      <span className="text-muted-foreground w-16">Email:</span>
                      <Input
                        type="email"
                        value={customerEmail}
                        onChange={(e) => setCustomerEmail(e.target.value)}
                        placeholder="customer@email.com"
                        className="bg-transparent border-b border-border text-foreground placeholder:text-muted-foreground px-1 h-6 text-xs flex-1 min-w-0 focus-visible:ring-0 no-print"
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Column 2: Property Info (print col 2) */}
              <div className="hidden print:block">
                <p className="font-semibold text-foreground text-sm mb-0.5 print:text-xs">Property Info:</p>
                <div className="space-y-0.5 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground w-16">Date:</span>
                    <span className="text-foreground font-medium">{editableServiceDate || "—"}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground w-16">Type:</span>
                    <span className="text-foreground font-medium">{propertyType || "—"}</span>
                  </div>
                  {propertyType !== "Residential" && companyName && (
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground w-16">Company:</span>
                      <span className="text-foreground font-medium">{companyName}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* On screen: Date/Type/Company stay in column 1 area (below customer details on screen) */}
              <div className="print:hidden col-span-1 -mt-0.5">
                <div className="space-y-0.5 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground w-16">Date:</span>
                    {isReadOnly ? (
                      <span className="text-foreground font-medium">{editableServiceDate || "—"}</span>
                    ) : (
                      <Input
                        type="date"
                        value={editableServiceDate}
                        onChange={(e) => setEditableServiceDate(e.target.value)}
                        className="bg-transparent border-b border-border text-foreground px-1 h-6 text-xs w-32 focus-visible:ring-0"
                      />
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground w-16">Type:</span>
                    {isReadOnly ? (
                      <span className="text-foreground font-medium">{propertyType || "—"}</span>
                    ) : (
                      <>
                         <Select
                           value={propertyType}
                           onValueChange={(value) => {
                             setPropertyType(value);
                             if (value === "Multi-Family - Apartment Complex") {
                               // Auto-fill pricing table with General Pest + Rodent Bait Boxes (weekly cadence)
                               const gpConfig = SERVICE_CONFIG["Commercial General Pest"];
                               const baitConfig = SERVICE_CONFIG["Rodent Bait Boxes"];
                               setServices([
                                 {
                                   serviceType: "Commercial General Pest",
                                   initialPrice: String(gpConfig?.defaultInitial ?? ""),
                                   recurringPrice: String(gpConfig?.defaultRecurring ?? ""),
                                   frequency: 7,
                                 },
                                 {
                                   serviceType: "Rodent Bait Boxes",
                                   initialPrice: String(baitConfig?.defaultInitial ?? ""),
                                   recurringPrice: String(baitConfig?.defaultRecurring ?? ""),
                                   frequency: 7,
                                 },
                               ]);
                               // Pre-fill the Proposed Services field with the apartment-complex template
                               setEditableFindings([APARTMENT_COMPLEX_PROPOSED_SERVICES]);
                               // Prevent the auto-populate effect from appending the default
                               // Commercial General Pest / Rodent Bait Boxes service descriptions
                               addedServiceTypesRef.current.add("Commercial General Pest");
                               addedServiceTypesRef.current.add("Rodent Bait Boxes");
                               findingsEditedRef.current = true;
                               setUserEditedFindings(true);
                             }
                           }}
                         >
                          <SelectTrigger className="bg-transparent border-b border-border text-foreground h-7 text-xs flex-1 min-w-0 focus:ring-0 [&>svg]:h-3 [&>svg]:w-3">
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
                      </>
                    )}
                  </div>
                  {propertyType !== "Residential" && (
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground w-16">Company:</span>
                      {isReadOnly ? (
                        <span className="text-foreground font-medium">{companyName || "—"}</span>
                      ) : (
                        <Input
                          value={companyName}
                          onChange={(e) => setCompanyName(e.target.value)}
                          placeholder="Company name"
                          className="bg-transparent border-b border-border text-foreground placeholder:text-muted-foreground px-1 h-6 text-xs flex-1 min-w-0 focus-visible:ring-0"
                        />
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Column 3 (print) / Column 2 (screen): Technician Info */}
              <div>
                <p className="font-semibold text-foreground text-sm mb-0.5 print:text-xs">Technician Information:</p>
                <div className="space-y-0.5 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground w-16">Name:</span>
                    {isReadOnly ? (
                      <span className="text-foreground font-medium">{editableTech || "—"}</span>
                    ) : (
                      <>
                        <Select value={editableTech} onValueChange={handleTechnicianChange}>
                          <SelectTrigger className="bg-transparent border-b border-border text-foreground h-7 text-xs flex-1 focus:ring-0 [&>svg]:h-3 [&>svg]:w-3 no-print">
                            <SelectValue placeholder="Select technician" />
                          </SelectTrigger>
                          <SelectContent>
                            {TECHNICIANS.map((tech) => (
                              <SelectItem key={tech.name} value={tech.name} className="text-xs">
                                {tech.name} ({tech.license})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <span className="print-only-text hidden text-foreground font-medium">{editableTech || "—"}</span>
                      </>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground w-16">License:</span>
                    <span className="text-foreground">{editableLicenseNumber || "—"}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

      {/* Page 1 - Contract/Form Content */}
      <div data-pdf-page="1" data-pdf-capture="1" className="p-2 pt-1.5 print:p-1 print:pt-0 max-w-[1800px] mx-auto">
        {/* Two Column Layout */}
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_2fr] gap-2 print:gap-1">

          {/* Services - Full Width at Top */}
          <Card className="print-section print-pricing-table p-2 print:p-0.5 print:py-1 col-span-2">
            <div className="space-y-1 print:space-y-0">
              {/* Header Row */}
              <div className="grid grid-cols-[minmax(150px,1fr)_80px_80px_180px_minmax(200px,2fr)_24px] print:grid-cols-[minmax(140px,1fr)_70px_70px_160px_minmax(200px,2fr)_24px] gap-2 print:gap-1 items-center text-xs print:text-[10px] font-bold uppercase border-b border-border pb-1 print:pb-0.5">
                <span className="pl-1">Service Type</span>
                <span className="text-center">Initial</span>
                <span className="text-center">{services.some(s => s.frequency === 7 || s.frequency === 14) ? "Monthly" : "Recurring"}</span>
                <span className="text-center">Frequency</span>
                <span className="text-center">Schedule</span>
                <span></span>
              </div>

              {/* Service Rows */}
              {services.map((service, index) => (
                <div
                  key={index}
                  className="grid grid-cols-[minmax(150px,1fr)_80px_80px_180px_minmax(200px,2fr)_24px] print:grid-cols-[minmax(140px,1fr)_70px_70px_160px_minmax(200px,2fr)_24px] gap-2 print:gap-1 items-center print:py-0"
                >
                  <div className="flex items-center gap-2 bg-white/80 rounded px-1">
                    <Select
                      value={service.serviceType}
                      onValueChange={(val) => handleServiceChange(index, "serviceType", val)}
                    >
                      <SelectTrigger className="h-6 text-sm w-full no-print bg-transparent border-0 shadow-none">
                        <SelectValue placeholder="Select service..." />
                      </SelectTrigger>
                      <SelectContent className="bg-white z-50">
                        {SERVICE_TYPE_OPTIONS.map((option) => (
                          <SelectItem key={option} value={option} className="text-sm">
                            {option}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <div className="hidden print:flex print-pricing-display print-pricing-display--left text-sm font-medium">
                      {service.serviceType || "-"}
                    </div>
                  </div>
                  <div className="relative bg-white/80 rounded">
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none no-print">
                      $
                    </span>
                    <Input
                      type="text"
                      inputMode="numeric"
                      value={parseInt(service.initialPrice || "0") >= 1000 ? parseInt(service.initialPrice).toLocaleString() : service.initialPrice}
                      onChange={(e) => {
                        const val = e.target.value.replace(/[^0-9]/g, "");
                        handleServiceChange(index, "initialPrice", val);
                      }}
                      placeholder="0"
                      className="h-6 text-sm pl-4 text-center pr-2 bg-transparent border-0 shadow-none no-print"
                    />
                    <div className="hidden print:flex print-pricing-display print-pricing-money text-sm">
                      <span className="text-muted-foreground">$</span>
                      <span>{(parseInt(service.initialPrice || "0") || 0).toLocaleString()}</span>
                    </div>
                  </div>
                  <div className="relative bg-white/80 rounded">
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none no-print">
                      $
                    </span>
                    <Input
                      type="text"
                      inputMode="numeric"
                      value={parseInt(service.recurringPrice || "0") >= 1000 ? parseInt(service.recurringPrice).toLocaleString() : service.recurringPrice}
                      onChange={(e) => {
                        const val = e.target.value.replace(/[^0-9]/g, "");
                        handleServiceChange(index, "recurringPrice", val);
                      }}
                      placeholder="0"
                      className="h-6 text-sm pl-4 text-center pr-2 bg-transparent border-0 shadow-none no-print"
                    />
                    <div className="hidden print:flex print-pricing-display print-pricing-money text-sm">
                      <span className="text-muted-foreground">$</span>
                      <span>{(parseInt(service.recurringPrice || "0") || 0).toLocaleString()}</span>
                    </div>
                  </div>
                  <div className="bg-white/80 rounded px-1">
                    <Select
                      value={(service.frequency ?? 30).toString()}
                      onValueChange={(val) => handleServiceChange(index, "frequency", parseInt(val))}
                    >
                      <SelectTrigger className="h-6 text-sm w-full no-print bg-transparent border-0 shadow-none">
                        <SelectValue placeholder="Select" />
                      </SelectTrigger>
                      <SelectContent className="bg-white z-50">
                        {FREQUENCY_OPTIONS.map((option) => (
                          <SelectItem key={option.days} value={option.days.toString()} className="text-sm">
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <div className="hidden print:flex print-pricing-display text-sm">
                      {FREQUENCY_OPTIONS.find((o) => o.days === service.frequency)?.label || "-"}
                    </div>
                  </div>
                  <div className="min-w-0 bg-white/80 rounded px-1.5 py-0.5 print:py-0">
                    {service.frequency > 0 ? (
                      <div className="flex flex-wrap gap-0.5 print:gap-0">
                        {(() => {
                          const isHighFreq = service.frequency === 7 || service.frequency === 14;
                          const today = new Date();

                          if (isHighFreq) {
                            // Show weekly/bi-weekly visits for ~1 year (perpetuity style, as many as fit)
                            const count = 12;
                            return Array.from({ length: count }, (_, i) => {
                              const scheduleDate = new Date(today);
                              scheduleDate.setDate(scheduleDate.getDate() + i * service.frequency);
                              const isFirst = i === 0;
                              return (
                                <span
                                  key={i}
                                  className={`px-1 py-0.5 rounded text-[10px] whitespace-nowrap print:text-[8px] print:px-0.5 ${
                                    isFirst ? "bg-secondary text-white font-medium" : "bg-muted text-muted-foreground"
                                  }`}
                                >
                                  {formatScheduleChip(scheduleDate, true)}
                                </span>
                              );
                            });
                          }

                          // Monthly+ frequencies: show 12 months
                          return Array.from({ length: 12 }, (_, i) => {
                            const scheduleDate = new Date(today);
                            scheduleDate.setDate(scheduleDate.getDate() + i * service.frequency);
                            const isFirst = i === 0;
                            return (
                              <span
                                key={i}
                                className={`px-1.5 py-0.5 rounded text-xs whitespace-nowrap ${
                                  isFirst ? "bg-secondary text-white font-medium" : "bg-muted text-muted-foreground"
                                }`}
                              >
                                {formatScheduleChip(scheduleDate, false)}
                              </span>
                            );
                          });
                        })()}
                      </div>
                    ) : (
                      <span className="text-sm text-muted-foreground">One-time service</span>
                    )}
                  </div>
                  <div>
                    {services.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 no-print"
                        onClick={() => removeService(index)}
                      >
                        <X className="w-3 h-3" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}

              {/* Totals Row */}
              <div className="grid grid-cols-[minmax(150px,1fr)_80px_80px_180px_minmax(200px,2fr)_24px] print:grid-cols-[minmax(140px,1fr)_70px_70px_160px_minmax(200px,2fr)_24px] gap-2 print:gap-1 items-center pt-1 print:pt-0.5 border-t border-border">
                <div className="text-sm font-bold text-right">Total:</div>
                <div className="text-sm bg-white/80 rounded py-0.5 px-1 flex items-center justify-center h-6">
                  <span className="text-muted-foreground">$</span>
                  <span className="font-bold">{Math.round(services.reduce((sum, s) => sum + (parseFloat(s.initialPrice) || 0), 0)).toLocaleString()}</span>
                </div>
                <div className="text-sm bg-white/80 rounded py-0.5 px-1 flex items-center justify-center h-6">
                  <span className="text-muted-foreground">$</span>
                  <span className="font-bold">{Math.round(services.reduce((sum, s) => sum + (parseFloat(s.recurringPrice) || 0), 0)).toLocaleString()}</span>
                </div>
                <div></div>
                <div></div>
                <div></div>
              </div>

              {services.length < 3 && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addService}
                  className="no-print h-7 text-xs mt-2"
                >
                  <Plus className="w-3 h-3 mr-1" />
                  Add Service
                </Button>
              )}
            </div>
          </Card>

          {/* Left: Target Pests + Products, Right: Proposed Services */}
          <div className="col-span-2 grid grid-cols-[2fr_3fr] gap-1.5 print:gap-0.5 print:items-start">
            {/* Left Column - Target Pests and Products stacked */}
            <div className="space-y-1.5 print:space-y-0.5">
              {/* Target Pests */}
              <Card className="print-section p-0 overflow-visible rounded-lg">
                <div className="print-section-header py-1.5 px-2.5 print:px-2 rounded-t-lg">
                  <span className="text-xs print:text-[10px] font-bold uppercase">Target Pest(s)</span>
                </div>
                <div className="relative" ref={pestsDropdownRef}>
                  <button
                    type="button"
                    onClick={() => setPestsDropdownOpen(!pestsDropdownOpen)}
                    className="w-full flex items-center justify-between cursor-pointer py-1 px-2 bg-card hover:bg-muted/50 transition-colors no-print"
                  >
                    <span className="text-xs text-muted-foreground">Click to select pests...</span>
                    <ChevronDown
                      className={`w-4 h-4 text-muted-foreground transition-transform ${pestsDropdownOpen ? "rotate-180" : ""}`}
                    />
                  </button>

                  {pestsDropdownOpen && (
                    <div
                      className="absolute z-50 w-full mt-0 bg-background border border-input rounded-b-md shadow-lg max-h-48 overflow-y-auto"
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
                          className={`w-full px-3 py-1.5 text-left text-xs hover:bg-muted flex items-center justify-between ${
                            editableTargetPests.includes(pest) ? "bg-primary/10 text-primary font-medium" : ""
                          }`}
                        >
                          {pest}
                          {editableTargetPests.includes(pest) && <span className="text-primary">✓</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="p-1.5 print:p-1 bg-card">
                  {editableTargetPests.length > 0 && (
                    <>
                      <div className="print:hidden flex flex-wrap gap-1">
                        {editableTargetPests.map((pest) => (
                          <span
                            key={pest}
                            className="print-tag inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-primary text-primary-foreground"
                          >
                            {pest}
                            <button
                              type="button"
                              onClick={() => setEditableTargetPests((prev) => prev.filter((p) => p !== pest))}
                              className="hover:bg-primary-foreground/20 rounded-full p-0.5"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </span>
                        ))}
                      </div>

                      <p className="hidden print:block text-xs leading-relaxed">
                        {editableTargetPests.join(", ")}
                      </p>
                    </>
                  )}
                  <Input
                    placeholder="Add custom pest..."
                    className="h-7 text-xs no-print mt-1"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        const value = (e.target as HTMLInputElement).value.trim();
                        if (value && !editableTargetPests.includes(value)) {
                          setEditableTargetPests((prev) => [...prev, value]);
                          (e.target as HTMLInputElement).value = "";
                        }
                      }
                    }}
                  />
                </div>
              </Card>

              {/* Products */}
              <Card className="print-section p-0 overflow-hidden print:overflow-visible rounded-lg">
                <div className="print-section-header py-1.5 px-2.5 print:px-2 rounded-t-lg">
                  <span className="text-xs print:text-[10px] font-bold uppercase">Products</span>
                </div>
                <div className="p-2.5 print:p-1.5">
                  <div className="text-[7px] leading-tight text-foreground columns-2 gap-2">
                    {displayedProducts.map((product, index) => (
                      <div key={index} className="flex items-center gap-1 group">
                        <p className="flex-1">
                          {product.name}{product.chemical ? ` (${product.chemical})` : ""}
                        </p>
                        <button
                          type="button"
                          onClick={() => setDisplayedProducts(prev => prev.filter((_, i) => i !== index))}
                          className="no-print opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive/80 transition-opacity"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                  {/* Add custom product */}
                  <div className="no-print mt-2 pt-2 border-t border-border space-y-1">
                    <div className="flex gap-1">
                      <Input
                        value={customProductName}
                        onChange={(e) => setCustomProductName(e.target.value)}
                        placeholder="Product name"
                        className="h-6 text-xs flex-1"
                      />
                      <Input
                        value={customProductChemical}
                        onChange={(e) => setCustomProductChemical(e.target.value)}
                        placeholder="Chemical (optional)"
                        className="h-6 text-xs flex-1"
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-6 px-2"
                        onClick={() => {
                          if (customProductName.trim()) {
                            setDisplayedProducts(prev => [...prev, { name: customProductName.trim(), chemical: customProductChemical.trim() }]);
                            setCustomProductName("");
                            setCustomProductChemical("");
                          }
                        }}
                      >
                        <Plus className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                </div>
              </Card>
            </div>

            {/* Right Column - Proposed Services */}
            <Card data-pdf-section="proposed-services" className="print-section p-0 flex flex-col overflow-hidden print:overflow-visible rounded-lg">
              <div className="print-section-header py-1.5 px-2.5 print:px-2 rounded-t-lg">
                <span className="text-xs print:text-[10px] font-bold uppercase">Proposed Services</span>
              </div>
              <div className="p-3 print:p-1.5 flex-1 flex flex-col">
                {isAnalyzing ? (
                  <div className="text-center py-2">
                    <Loader2 className="w-5 h-5 animate-spin text-primary mx-auto mb-1" />
                    <p className="text-xs text-muted-foreground">Analyzing...</p>
                  </div>
                ) : (
                  <>
                    <div className="no-print flex-1 flex flex-col space-y-1">
                      <RichTextEditor
                        value={editableFindings[0] || ""}
                        onChange={(newValue) => {
                          findingsEditedRef.current = true;
                          setUserEditedFindings(true);
                          updateItem(0, newValue, setEditableFindings);
                        }}
                        placeholder="• Enter proposed services..."
                        fontSize={proposedServicesFontSize}
                        onFontSizeChange={setProposedServicesFontSize}
                        className="flex-1"
                      />
                    </div>
                    <div
                      data-pdf-content="proposed-services"
                      className="hidden print-content-formatted"
                      style={{ fontSize: `${proposedServicesFontSize}px` }}
                      dangerouslySetInnerHTML={{
                        __html: formatProposedServices(
                          splitServicesContent(
                            stripRodentGuaranteeFromHtml(editableFindings[0] || ""),
                          ).cleanedHtml,
                        ),
                      }}
                    />
                  </>
                )}
              </div>
            </Card>
            {(() => {
              const split = splitServicesContent(
                stripRodentGuaranteeFromHtml(editableFindings[0] || ""),
              );
              if (split.additionalDetails.length === 0) return null;
              return (
                <div
                  className="hidden print-content-formatted mt-2 print:mt-1 border border-border rounded-md bg-card overflow-hidden"
                  data-pdf-section="additional-details"
                >
                  <div className="print-section-header py-1.5 px-2.5 print:px-2">
                    <span className="text-xs print:text-[10px] font-bold uppercase">Additional Details</span>
                  </div>
                  <div className="p-2.5 print:p-2 space-y-2" style={{ fontSize: `${proposedServicesFontSize}px` }}>
                    {split.additionalDetails.map((d, i) => (
                      <div key={`addl-${i}`} className="leading-snug">
                        {d.serviceName && (
                          <p className="font-bold mb-0.5">{d.serviceName}</p>
                        )}
                        <div dangerouslySetInnerHTML={{ __html: d.html }} />
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}
            <div className="mt-2 print:mt-1" data-pdf-section="guarantee-boxes">
              <GuaranteeBoxesEditor
                boxes={guaranteeBoxes}
                onChange={setGuaranteeBoxes}
                showRodentDefaultButton={hasRodentGuaranteeService(services.map((s) => s.serviceType))}
              />
            </div>
          </div>

          {/* Bottom Row: Signature + Pesticide Notice - Same column widths as above */}
          <div className="col-span-2 grid grid-cols-[2fr_3fr] gap-1.5 print:gap-0.5 print:mt-0.5">
            {/* Signature Section - Left (same width as Target Pests + Products) - compact to match Pesticide Notice */}
            <div className={`p-0 overflow-hidden print:overflow-visible rounded-lg relative ${showSignature ? 'print-section bg-card border shadow-sm' : ''}`}>
              {showSignature ? (
                <>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="absolute top-0.5 right-0.5 h-5 px-1.5 text-[9px] no-print z-10"
                    onClick={() => setShowSignature(false)}
                  >
                    Hide
                  </Button>
                  <div className="print-section-header py-1.5 px-2.5 print:px-2 rounded-t-lg">
                    <span className="text-xs print:text-[10px] font-bold uppercase">Customer Signature</span>
                  </div>
                  <div className="p-1 print:p-1 flex items-center gap-1.5 print:gap-2">
                    {/* Bug mascot on the left */}
                    <img src={crestBugBlack} alt="" className="h-11 print:h-14 w-auto shrink-0" />
                    
                    {/* Signature content on the right */}
                    <div className="flex-1 flex flex-col">
                      <div className="h-[38px] print:h-[42px] relative">
                        {customerSignature ? (
                          <div className="h-full flex items-center gap-2">
                            <div className="flex-1 flex items-center justify-center border rounded bg-muted/30 h-full">
                              <img 
                                src={customerSignature} 
                                alt="Customer signature" 
                                className="max-h-[34px] print:max-h-[38px] w-auto object-contain"
                              />
                            </div>
                            {/* Re-sign button - only show if signature was NOT loaded from DB */}
                            {!signatureWasSaved && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setCustomerSignature(null)}
                                className="h-7 text-xs no-print shrink-0"
                              >
                                Re-sign
                              </Button>
                            )}
                          </div>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                setModalSignatureDraft(null);
                                setShowSignatureModal(true);
                              }}
                              className="no-print w-full h-full border-2 border-dashed border-muted-foreground/40 rounded bg-muted/20 hover:bg-muted/40 transition flex items-center justify-center text-xs font-medium text-muted-foreground"
                            >
                              ✍️ Tap to Sign
                            </button>
                            {/* Hidden canvas kept for print/PDF parity if needed */}
                            <div className="hidden">
                              <SignatureCanvas ref={signatureRef} onSave={handleSignatureSave} initialData={customerSignature} label="" />
                            </div>
                            {isSavingSignature && (
                              <div className="absolute inset-0 bg-background/60 flex items-center justify-center rounded">
                                <Loader2 className="w-4 h-4 animate-spin text-primary" />
                              </div>
                            )}
                          </>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-[8px] print:text-[9px] pt-0.5 border-t border-border">
                        <div className="flex-1 flex items-center gap-1">
                          <span className="font-medium text-foreground whitespace-nowrap">Print:</span>
                          <Input
                            value={editableCustomer}
                            onChange={(e) => setEditableCustomer(e.target.value)}
                            placeholder="Customer name"
                            className="bg-transparent border-none text-muted-foreground placeholder:text-muted-foreground px-0.5 h-3 text-[8px] flex-1 focus-visible:ring-0 no-print"
                          />
                          <span className="hidden print:inline text-muted-foreground text-[8px]">{editableCustomer}</span>
                        </div>
                        <div className="text-muted-foreground whitespace-nowrap">
                          <span className="font-medium text-foreground">Date:</span> {new Date().toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  {/* Invisible placeholder to maintain spacing */}
                  <div className="invisible">
                    <div className="py-0.5 px-2.5 rounded-t-lg">
                      <span className="text-xs font-bold uppercase leading-none">&nbsp;</span>
                    </div>
                    <div className="p-1.5">
                      <div className="h-[40px]"></div>
                    </div>
                  </div>
                  {/* Centered show button */}
                  <div className="absolute inset-0 flex items-center justify-center no-print">
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs"
                      onClick={() => setShowSignature(true)}
                    >
                      Show Signature Box
                    </Button>
                  </div>
                </>
              )}
            </div>

            {/* Pesticide Notice - Right (same width as Proposed Services) */}
            <Card className="print-section p-0 overflow-hidden print:overflow-visible rounded-lg">
              <div className="print-section-header py-1.5 px-2.5 print:px-2 rounded-t-lg">
                <span className="text-xs print:text-[10px] font-bold uppercase">Pesticide Notice</span>
              </div>
              <div className="p-1.5 print:p-1">
                <div className="text-[7px] leading-[1.2] text-foreground">
                  <p>
                    State law requires that you be given the following information: CAUTION--PESTICIDES ARE TOXIC CHEMICALS. Structural Pest Control Companies are registered and regulated by the Structural Pest Control Board, and apply pesticides which are registered and approved for use by the California Department of Pesticide Regulation and the United States Environmental Protection Agency. Registration is granted when the state finds that, based on existing scientific evidence, there are no appreciable risks if proper use conditions are followed or that the risks are outweighed by the benefits. The degree of risk depends upon the degree of exposure, so exposure should be minimized." "If within 24 hours following application you experience symptoms similar to common seasonal illness comparable to the flu, contact your physician or poison control center (800-222-1222) and your pest control company immediately." This statement shall be modified to include any other symptoms of overexposure which are not typical of influenza.
                  </p>
                  <p className="font-medium mt-0.5">
                    For further information, contact any of the following: Crest Pest Control (949-424-5000); for Health Questions--the County Health Department (800-564-8448); for Application Information--the County Agricultural Commissioner (714-955-0100) and for Regulatory Information--the Structural Pest Control Board (800-737-8188, 2005 Evergreen Street, Ste. 1500, Sacramento, CA 95815).
                  </p>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </div>
      

      {/* Page 2 - Map & Property Images */}
      <div data-pdf-page="2" className="print-page-break bg-background print:flex print:flex-col print:min-h-[100vh]">
        <div data-pdf-capture="2" className="p-4 print:p-4 print:pt-4 max-w-[1800px] mx-auto print:min-h-[100vh] print:flex print:flex-col">
          {/* Page Header */}
          <div className="page2-header flex items-center justify-between mb-4 print:mb-3 pb-2 print:pb-2 border-b-2 border-border bg-primary/30 rounded-md px-4 py-2">
            <div className="flex items-center gap-3 print:gap-2">
              <img src={crestLogo} alt="Crest Pest Control" className="h-12 print:h-8" />
              <h1 className="text-xl print:text-lg font-bold text-foreground">Property Map & Details</h1>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-semibold text-muted-foreground">Property Type:</span>
              <span className="text-sm font-medium text-foreground">{propertyType}</span>
            </div>
          </div>

          {/* Map and Property Images Side by Side */}
          <div className="flex flex-col lg:grid lg:grid-cols-[40%_60%] gap-4 print:grid print:grid-cols-[48%_52%] print:gap-5 print:px-4 print:items-start print:justify-center print:mt-2 print:flex-1">
            {/* Map Section - fills column in print, fixed on screen */}
            <div className="flex flex-col min-h-0 print:mt-1">
              <div 
                className="w-[400px] h-[533px] print:w-full print:h-auto print:aspect-[3/4] mx-auto relative rounded-lg overflow-hidden border-2 border-border print:max-h-none"
                onPaste={handleMapPaste}
                tabIndex={0}
              >
                {isProcessing && (
                  <div className="no-print absolute inset-0 bg-background/80 flex items-center justify-center z-10">
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
                          <Button
                            size="icon"
                            variant="default"
                            onClick={handleZoomIn}
                            aria-label="Zoom in"
                            title="Zoom in"
                          >
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
                  <div className="h-full w-full bg-muted flex items-center justify-center">
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
                  </div>
                )}
              </div>
            </div>

            {/* Right Column - Additional Details + Scheduling + Setup Materials */}
            <div data-pdf-section="page2-details-column" className="flex flex-col gap-3 print:gap-2 h-full print:h-auto print:min-h-0 print:mt-0">
              {/* Additional Details Section - now shorter */}
              <Card data-pdf-section="additional-details" className="print-section additional-details-card p-0 overflow-hidden print:overflow-visible rounded-lg flex-[0.5] flex flex-col">
                <div className="print-section-header py-1.5 px-2.5 rounded-t-lg">
                  <input
                    type="text"
                    value={additionalDetailsHeader}
                    onChange={(e) => setAdditionalDetailsHeader(e.target.value)}
                    className="text-xs font-bold border-none outline-none w-full bg-transparent no-print"
                    style={{ color: "#2A2A2A", caretColor: "#2A2A2A" }}
                  />
                  <span className="print-only-text hidden">{additionalDetailsHeader}</span>
                </div>
                <div className="additional-details-body p-2 flex-1 flex flex-col">
                  <div className="no-print flex-1 flex flex-col">
                    <RichTextEditor
                      value={additionalDetails}
                      onChange={setAdditionalDetails}
                      placeholder="• Enter any additional details, notes, or observations..."
                      fontSize={additionalDetailsFontSize}
                      onFontSizeChange={setAdditionalDetailsFontSize}
                      className="additional-details-editor flex-1 min-h-[80px] print:min-h-0"
                    />
                  </div>
                  <div
                    className="hidden print-content-formatted"
                    style={{ fontSize: `${additionalDetailsFontSize}px` }}
                    dangerouslySetInnerHTML={{
                      __html: formatProposedServices(additionalDetails || ""),
                    }}
                  />
                </div>
              </Card>

              {/* Limitations Section */}
              <Card data-pdf-section="limitations" className="print-section p-0 overflow-hidden print:overflow-visible rounded-lg flex-[0.3] flex flex-col">
                <div className="print-section-header py-1.5 px-2.5 rounded-t-lg">
                  <span className="text-xs print:text-[10px] font-bold uppercase">Limitations & Exclusions</span>
                </div>
                <div className="p-2 flex-1 flex flex-col">
                  {/* Preset exclusions multi-select (editor only) */}
                  {!isReadOnly && (
                    <div className="no-print mb-2">
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs justify-between w-full"
                          >
                            <span className="truncate">
                              {selectedExclusions.length === 0
                                ? "Select preset exclusions..."
                                : `${selectedExclusions.length} selected`}
                            </span>
                            <ChevronDown className="w-3 h-3 ml-1 shrink-0" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[320px] p-1 bg-popover z-50" align="start">
                          <div className="max-h-72 overflow-auto">
                            {EXCLUSION_PRESETS.map((preset) => {
                              const checked = selectedExclusions.includes(preset.label);
                              return (
                                <button
                                  key={preset.label}
                                  type="button"
                                  onClick={() => {
                                    setSelectedExclusions((prev) =>
                                      prev.includes(preset.label)
                                        ? prev.filter((l) => l !== preset.label)
                                        : [...prev, preset.label]
                                    );
                                  }}
                                  className="w-full flex items-start gap-2 px-2 py-1.5 text-left text-xs rounded hover:bg-accent"
                                >
                                  <span
                                    className={cn(
                                      "mt-0.5 w-4 h-4 rounded border flex items-center justify-center shrink-0",
                                      checked ? "bg-primary border-primary text-primary-foreground" : "border-input"
                                    )}
                                  >
                                    {checked && <Check className="w-3 h-3" />}
                                  </span>
                                  <span className="font-medium">{preset.label}</span>
                                </button>
                              );
                            })}
                          </div>
                        </PopoverContent>
                      </Popover>
                    </div>
                  )}

                  {/* Render selected preset exclusion clauses (web + PDF) */}
                  {selectedExclusions.length > 0 && (
                    <div className="space-y-1 mb-2">
                      {EXCLUSION_PRESETS.filter((p) => selectedExclusions.includes(p.label)).map((p) => (
                        <p key={p.label} className="text-[11px] print:text-[10px] leading-snug text-foreground">
                          {p.text}
                        </p>
                      ))}
                    </div>
                  )}

                  {/* Free-text limitations (still supported) */}
                  {isReadOnly ? (
                    limitationsText ? (
                      <p className="text-xs text-foreground whitespace-pre-wrap">{limitationsText}</p>
                    ) : selectedExclusions.length === 0 ? (
                      <p className="text-xs text-foreground">None</p>
                    ) : null
                  ) : (
                    <textarea
                      value={limitationsText}
                      onChange={(e) => setLimitationsText(e.target.value)}
                      placeholder="• Add any additional custom limitations..."
                      className="text-xs w-full flex-1 bg-transparent border-none outline-none resize-none placeholder:text-muted-foreground"
                    />
                  )}
                </div>
              </Card>

              {/* Bottom row: Scheduling + Setup Materials side by side */}
              <div className="grid grid-cols-2 gap-3 print:gap-2">
                {/* Scheduling & Customer Communication */}
                <Card data-pdf-section="scheduling" className="print-section p-0 overflow-hidden print:overflow-visible rounded-lg" data-scheduling-empty={!preferredServiceDay && !preferredServiceTime && !mainPointOfContact && !contactPhone ? "true" : undefined}>
                  <div className="print-section-header py-1.5 px-2.5 rounded-t-lg">
                    <span className="text-xs print:text-[10px] font-bold uppercase">Scheduling & Communication</span>
                  </div>
                  <div className="p-2.5 print:p-1.5 space-y-1.5 print:space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground w-[110px] shrink-0">Preferred Day:</span>
                      {isReadOnly ? (
                        <span className="text-xs text-foreground">{preferredServiceDay || "—"}</span>
                      ) : (
                        <Input
                          value={preferredServiceDay}
                          onChange={(e) => setPreferredServiceDay(e.target.value)}
                          placeholder="e.g. Monday"
                          className="h-6 text-xs flex-1 bg-transparent border-b border-border shadow-none focus-visible:ring-0"
                        />
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground w-[110px] shrink-0">Preferred Time:</span>
                      {isReadOnly ? (
                        <span className="text-xs text-foreground">{preferredServiceTime || "—"}</span>
                      ) : (
                        <Input
                          value={preferredServiceTime}
                          onChange={(e) => setPreferredServiceTime(e.target.value)}
                          placeholder="e.g. Morning"
                          className="h-6 text-xs flex-1 bg-transparent border-b border-border shadow-none focus-visible:ring-0"
                        />
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground w-[110px] shrink-0">Point of Contact:</span>
                      {isReadOnly ? (
                        <span className="text-xs text-foreground">{mainPointOfContact || "—"}</span>
                      ) : (
                        <Input
                          value={mainPointOfContact}
                          onChange={(e) => setMainPointOfContact(e.target.value)}
                          placeholder="Name"
                          className="h-6 text-xs flex-1 bg-transparent border-b border-border shadow-none focus-visible:ring-0"
                        />
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground w-[110px] shrink-0">Phone #:</span>
                      {isReadOnly ? (
                        <span className="text-xs text-foreground">{contactPhone || "—"}</span>
                      ) : (
                        <Input
                          value={contactPhone}
                          onChange={(e) => setContactPhone(e.target.value)}
                          placeholder="(xxx) xxx-xxxx"
                          className="h-6 text-xs flex-1 bg-transparent border-b border-border shadow-none focus-visible:ring-0"
                        />
                      )}
                    </div>
                  </div>
                </Card>

                {/* Setup Materials */}
                <Card data-pdf-section="setup-materials" className="print-section p-0 overflow-hidden print:overflow-visible rounded-lg">
                  <div className="print-section-header py-1.5 px-2.5 rounded-t-lg">
                    <span className="text-xs print:text-[10px] font-bold uppercase">Setup Materials</span>
                  </div>
                  <div className="p-2.5 print:p-1.5">
                    {/* Listed materials */}
                    {setupMaterials.length > 0 && (
                      <div className="space-y-1 mb-2">
                        {setupMaterials.map((mat, index) => (
                          <div key={index} className="flex items-center justify-between text-xs group">
                            <span className="text-foreground">
                              {mat.name} <span className="font-semibold">×{mat.quantity}</span>
                            </span>
                            {!isReadOnly && (
                              <button
                                type="button"
                                onClick={() => removeSetupMaterial(index)}
                                className="text-destructive opacity-0 group-hover:opacity-100 transition-opacity no-print"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Add material - preset buttons */}
                    {!isReadOnly && (
                      <div className="no-print space-y-1.5">
                        <div className="flex flex-wrap gap-1">
                          {SETUP_MATERIAL_PRESETS.filter(
                            (preset) => !setupMaterials.some((m) => m.name === preset)
                          ).map((preset) => (
                            <button
                              key={preset}
                              type="button"
                              onClick={() => {
                                const qty = prompt(`How many ${preset}?`, "1");
                                if (qty) addSetupMaterial(preset, qty);
                              }}
                              className="px-2 py-0.5 rounded text-[10px] bg-muted text-muted-foreground hover:bg-muted/80 transition-colors"
                            >
                              + {preset}
                            </button>
                          ))}
                        </div>
                        {/* Custom material input */}
                        <div className="flex gap-1">
                          <Input
                            value={newMaterialName}
                            onChange={(e) => setNewMaterialName(e.target.value)}
                            placeholder="Custom item"
                            className="h-5 text-[10px] flex-1"
                          />
                          <Input
                            value={newMaterialQty}
                            onChange={(e) => setNewMaterialQty(e.target.value)}
                            placeholder="Qty"
                            className="h-5 text-[10px] w-12"
                          />
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-5 px-1.5 text-[10px]"
                            onClick={() => {
                              addSetupMaterial(newMaterialName, newMaterialQty);
                              setNewMaterialName("");
                              setNewMaterialQty("");
                            }}
                          >
                            <Plus className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                    )}

                    {setupMaterials.length === 0 && isReadOnly && (
                      <p className="text-xs text-muted-foreground italic">No setup materials listed</p>
                    )}
                  </div>
                </Card>
              </div>
            </div>
          </div>

          {/* Crest Guarantee - compact, pinned to bottom of page 2 */}
          <div className="border border-border rounded-md px-4 py-3 text-center bg-muted/30 mt-3 print:mt-auto print:pt-3 print:pb-1 print:border-x-0 print:border-b-0 print:rounded-none flex items-center justify-center gap-3">
            <img src={crestBugBlack} alt="" className="w-8 h-8 print:w-7 print:h-7 opacity-60 flex-shrink-0" />
            <p className="text-xs print:text-[13px] text-foreground leading-snug">
              <span className="font-bold">The Crest Guarantee:</span>{" "}
              If pests return, we will return at no charge. We don't lock you into a long-term contract. We want our service quality to keep you as a customer, not a contract.
            </p>
            <img src={crestBugBlack} alt="" className="w-8 h-8 print:w-7 print:h-7 opacity-60 flex-shrink-0" />
          </div>
          {services.some((s) => s.frequency === 7 || s.frequency === 14 || s.frequency === 28) && (
            <p className="text-[10px] print:text-[10px] italic text-muted-foreground text-center mt-1.5 leading-snug">
              * Scheduling and billing run on four-week cycles to help ensure consistency (e.g., the same day and time for each visit). Invoices are sent upon completion of each service.
            </p>
          )}
          <p
            className="text-[10px] print:text-[10px] italic text-muted-foreground text-center mt-1.5 leading-snug px-4"
            data-pdf-section="sales-report-disclaimer"
          >
            {SALES_REPORT_DISCLAIMER_HTML.replace(/<[^>]+>/g, "")}
          </p>
        </div>
      </div>

      {/* Page 3 - Property Images */}
      <div 
        data-pdf-page="3"
        className="print-page-break bg-background print:flex print:flex-col print:justify-start print:min-h-[100vh]"
        onPaste={handlePropertyImagesPaste}
        tabIndex={0}
      >
        <div data-pdf-capture="3" className="p-4 print:px-6 print:pb-6 print:pt-5 max-w-[1800px] mx-auto">
          {/* Page Header */}
          <div className="page2-header flex items-center justify-between mb-6 print:mb-5 pb-2 print:pb-2.5 border-b-2 border-border bg-primary/30 rounded-md px-4 py-2">
            <div className="flex items-center gap-3 print:gap-2">
              <img src={crestLogo} alt="Crest Pest Control" className="h-12 print:h-8" />
              <h1 className="text-xl print:text-lg font-bold text-foreground">Property Images</h1>
            </div>
          </div>

          {/* Upload Section */}
          <div className="no-print mb-4 flex items-center gap-3">
            <div className="relative inline-flex">
              <Button variant="outline" size="sm" type="button">
                <FileDown className="w-4 h-4 mr-2" />
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
            <span className="text-xs text-muted-foreground">or paste from clipboard (Ctrl+V / Cmd+V)</span>
          </div>

          {/* Property Images Grid - larger images */}
          {propertyImages.length > 0 ? (
            <div className="grid grid-cols-3 md:grid-cols-4 gap-3 print:gap-2 print:grid-cols-4">
              {propertyImages.map((item, index) => (
                <div
                  key={index}
                  className={`space-y-2 cursor-grab active:cursor-grabbing ${draggedImageIndex === index ? "opacity-50" : ""}`}
                  draggable
                  onDragStart={() => handleImageDragStart(index)}
                  onDragOver={(e) => handleImageDragOver(e, index)}
                  onDragEnd={handleImageDragEnd}
                >
                  <div className="aspect-[4/3] rounded-lg overflow-hidden border-2 border-border bg-muted print:w-full print:h-auto relative group">
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
                        <img
                          src={item.image}
                          alt={`Property ${index + 1}`}
                          className="w-full h-full object-cover pointer-events-none"
                        />
                        <Button
                          size="icon"
                          variant="destructive"
                          className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity no-print"
                          onClick={(e) => {
                            e.stopPropagation();
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
                          onClick={(e) => {
                            e.stopPropagation();
                            setAnnotatingImageIndex(index);
                          }}
                        >
                          <Edit className="w-3 h-3 mr-1" />
                          Draw
                        </Button>
                      </>
                    )}
                  </div>
                  <Input
                    value={item.caption || ""}
                    onChange={(e) => updateImageCaption(index, e.target.value)}
                    placeholder="Caption"
                    className="no-print text-sm h-8"
                  />
                  {/* Print-only caption */}
                  {item.caption && (
                    <p className="hidden print:block text-sm text-foreground font-medium mt-1 leading-tight">
                      {item.caption}
                    </p>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="no-images-placeholder h-[400px] flex items-center justify-center text-muted-foreground border-2 border-dashed border-border rounded-lg">
              <p className="text-lg text-center px-4">
                No images uploaded yet.
                <br />
                Click the button above to upload up to 20 images.
              </p>
            </div>
          )}
        </div>
      </div>





      {/* Signature Modal — large signing area */}
      <Dialog open={showSignatureModal} onOpenChange={setShowSignatureModal}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Customer Signature</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <p className="text-xs text-muted-foreground mb-2">
              Sign below. You can lift the pen between strokes — your signature won't be saved until you tap Done.
            </p>
            <div className="border-2 rounded-md bg-white" style={{ height: "60vh", minHeight: 360 }}>
              <SignatureCanvas
                ref={modalSignatureRef}
                onSave={(data) => setModalSignatureDraft(data)}
                initialData={null}
                label=""
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSignatureModal(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                const sig = modalSignatureRef.current?.forceSave() ?? modalSignatureDraft;
                if (!sig) {
                  toast.error("Please sign before saving");
                  return;
                }
                handleSignatureSave(sig);
                setShowSignatureModal(false);
              }}
            >
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
              <Label htmlFor="email-cc">CC <span className="text-muted-foreground font-normal">(click to add from directory, or type and press Enter)</span></Label>
              {/* Office Directory Quick-Add Buttons */}
              <div className="flex flex-wrap gap-1.5 mb-2">
                {[
                  "caleb@crestpestco.com",
                  "jake@crestpestco.com",
                  "dlongoria@crestpestco.com",
                  "jlatham@crestpestco.com",
                  "dtanner@crestpestco.com",
                  "dgallegos@crestpestco.com",
                  "mmuniz@crestpestco.com",
                  "nstovall@crestpestco.com",
                ].filter(email => !ccEmails.includes(email)).map((email) => (
                  <button
                    key={email}
                    type="button"
                    onClick={() => setCcEmails(prev => [...prev, email])}
                    className="text-xs px-2 py-1 rounded-full border border-input bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                  >
                    + {email}
                  </button>
                ))}
              </div>
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
                    href={`${window.location.origin}/report/${reportId}`} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-primary underline break-all"
                  >
                    {`${window.location.origin}/report/${reportId}`}
                  </a>
                ) : (
                  <span className="text-muted-foreground italic">
                    Save the report first to generate a shareable link
                  </span>
                )}
              </div>
            </div>
          </div>
          
          <div className="pt-2 space-y-2">
            <Label className="text-sm font-medium">PDF Attachment</Label>
            <RadioGroup value={pdfAttachOption} onValueChange={(v) => setPdfAttachOption(v as "short" | "full" | "none")} className="flex flex-col gap-2">
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="short" id="pdf-short" />
                <Label htmlFor="pdf-short" className="text-sm cursor-pointer">Short PDF (app pages only)</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="full" id="pdf-full" />
                <Label htmlFor="pdf-full" className="text-sm cursor-pointer">Full proposal PDF (with template pages)</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="none" id="pdf-none" />
                <Label htmlFor="pdf-none" className="text-sm cursor-pointer">No PDF attachment</Label>
              </div>
            </RadioGroup>
          </div>

          <div className="pt-2">
            <PrepSheetPicker
              selectedIds={selectedPrepSheetIds}
              onChange={(ids, sheets) => { setSelectedPrepSheetIds(ids); setSelectedPrepSheets(sheets); }}
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowComposeDialog(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleSendEmail} 
              disabled={isSendingEmail || !customerEmail || !reportId}
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
