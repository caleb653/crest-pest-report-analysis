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
  Copy,
  Star,
  Video,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { TablesInsert, TablesUpdate } from "@/integrations/supabase/types";
import { MapCanvas } from "@/components/MapCanvas";
import { SignatureCanvas, SignatureCanvasRef } from "@/components/SignatureCanvas";
import RichTextEditor from "@/components/RichTextEditor";
import CustomerPicker from "@/components/CustomerPicker";
import { PrepSheetPicker, buildPrepSheetAttachments } from "@/components/PrepSheetPicker";
import { autoMatchCustomerId } from "@/lib/fieldroutesAutoMatch";
import { useCurrentStaff } from "@/hooks/useCurrentStaff";
import crestLogo from "@/assets/crest-logo.png";
import crestBugBlack from "@/assets/crest-bug-black.png";
import crestLogoVideo from "@/assets/crest-logo-video.png";

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
import {
  RODENT_GUARANTEE_HTML,
  hasRodentGuaranteeService,
  stripRodentGuaranteeFromHtml,
  resolveInitialGuaranteeBoxes,
  GuaranteeBox,
} from "@/lib/rodentGuarantee";
import GuaranteeBoxesEditor from "@/components/GuaranteeBoxesEditor";

const TECHNICIANS = [
  { name: "Darrell Tanner", license: "FR 62523" },
  { name: "Jake Shubin", license: "FR 71068" },
  { name: "Caleb Whalen", license: "FR 71183" },
  { name: "Jackson Latham", license: "FR 68261" },
  { name: "Dylan Gallegos", license: "RA 71068" },
  { name: "Michael Muniz", license: "FR 54193" },
  { name: "David Longoria", license: "FR 71710" },
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
];

const EQUIPMENT_OPTIONS = ["Rodent Bait Stations", "Rodent Traps", "Mosquito Buckets", "Fly Light", "Pest Monitors"];

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
    defaultInitial: 85,
    defaultRecurring: 85,
  },
  "Bi-Monthly Services": {
    frequency: 60,
    targetPests: ["Ants", "American Roaches", "Crickets", "Earwigs", "Spiders", "Silverfish", "Centipedes", "Millipedes", "Wasps", "Fleas & Ticks"],
    proposedServices:
      `<b>Recurring Pest Control (Bi-Monthly):</b><br>• Inspect exterior for potential pest entry points, harborage areas, and signs of infestation<br>• Remove webs from the exterior of the property including eaves, windows, outdoor furniture, and high visibility areas<br>• Create a pest barrier around your home and property by targeted exterior treatments. Treat the garage and interior upon request.<br>• The first treatment from the Pest Protection Plan begins 30 days after the initial service to break pest egg cycles<br><br><b>Additional Details:</b> Our goal is to reduce your pest population as much as possible. However, given pests are abundant in So Cal, it's unlikely for us (or anyone) to reduce 100% of the pest population (i.e., you may still see the occasional ant, spider, or cockroach). Our products typically take 7-10 days to take full effect (this gives the products time to spread back to the larger colonies). If activity levels remain high after this period, contact us and we'll get someone out ASAP for a complimentary follow-up service.`,
    defaultInitial: 120,
    defaultRecurring: 120,
  },
  "Quarterly Services": {
    frequency: 90,
    targetPests: ["Ants", "American Roaches", "Crickets", "Earwigs", "Spiders", "Silverfish", "Centipedes", "Millipedes", "Wasps", "Fleas & Ticks"],
    proposedServices:
      `<b>Recurring Pest Control (Quarterly):</b><br>• Inspect exterior for potential pest entry points, harborage areas, and signs of infestation<br>• Remove webs from the exterior of the property including eaves, windows, outdoor furniture, and high visibility areas<br>• Create a pest barrier around your home and property by targeted exterior treatments. Treat the garage and interior upon request.<br>• The first treatment from the Pest Protection Plan begins 30 days after the initial service to break pest egg cycles<br><br><b>Additional Details:</b> Our goal is to reduce your pest population as much as possible. However, given pests are abundant in So Cal, it's unlikely for us (or anyone) to reduce 100% of the pest population (i.e., you may still see the occasional ant, spider, or cockroach). Our products typically take 7-10 days to take full effect (this gives the products time to spread back to the larger colonies). If activity levels remain high after this period, contact us and we'll get someone out ASAP for a complimentary follow-up service.`,
    defaultInitial: 145,
    defaultRecurring: 145,
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
      `<b>Rodent Exclusion:</b><br>• Seal rodent entry points (pictured below) using industry-grade materials such as steel mesh, chicken wire, and weatherproof sealants.<br><br><b>Additional Details:</b> We are a licensed pest control company, not a licensed contractor. We use materials like steel mesh, chicken wire, and weatherproof sealants to block off potential rodent entry points. We do not make structural alterations like cutting into drywall or stucco, replacing framing, and any other general construction work.<br><br><b>Disclaimer:</b> Crest Pest Control is not liable for any structural or property damage caused by rodents.`,
    defaultInitial: 575,
    defaultRecurring: 0,
  },
  "Rodent Trapping": {
    frequency: 0,
    targetPests: ["Rodents"],
    proposedServices:
      `<b>Rodent Trapping:</b><br>• Strategically place traps in areas of highest activity to reduce active rodent populations.<br>• Three follow-up visits to monitor activity, dispose of any dead rodents, and adjust traps as needed.<br><br><b>Additional Details:</b> Rodent trapping is specifically targeted at eliminating the existing rodent population. After we've completed our follow-up visits, we can't guarantee that rodents will not re-enter your property unless we are also performing rodent exclusion work.<br><br><b>Disclaimer:</b> Crest Pest Control is not liable for any structural or property damage caused by rodents.`,
    defaultInitial: 575,
    defaultRecurring: 0,
  },
  "Rodent Trapping and Exclusion": {
    frequency: 0,
    targetPests: ["Rodents"],
    proposedServices:
      `<b>Rodent Trapping & Exclusion:</b><br>• Seal rodent entry points (pictured below) using industry-grade materials such as steel mesh, chicken wire, and weatherproof sealants.<br>• Strategically place traps in areas of highest activity to reduce active rodent populations.<br>• Three follow-up visits to monitor activity, dispose of any dead rodents, and adjust traps as needed.<br><br><b>Additional Details:</b> We are a licensed pest control company, not a licensed contractor. We use materials like steel mesh, chicken wire, and weatherproof sealants to block off potential rodent entry points. We do not make structural alterations like cutting into drywall or stucco, replace framing, and any other general construction work.<br><br><b>Disclaimer:</b> Crest Pest Control is not liable for any structural or property damage caused by rodents.`,
    defaultInitial: 575,
    defaultRecurring: 0,
  },
  "Rodent Bait Boxes": {
    frequency: 30,
    targetPests: ["Rodents"],
    proposedServices:
      `<b>Rodent Bait Boxes:</b><br>• Install rodent bait boxes around the property to maintain consistent control of rodent populations<br>• Monitor, replenish, and adjust bait boxes depending on ongoing rodent activity<br><br><b>Additional Details:</b> Rodent bait stations are designed to reduce the amount of rodent activity around your property. You may still see rodent activity around the exterior of your property.<br><br><b>Disclaimer:</b> Crest Pest Control is not liable for any structural or property damage caused by rodents.`,
    defaultInitial: 200,
    defaultRecurring: 70,
  },
  "Mosquito Service": {
    frequency: 30,
    targetPests: ["Mosquitoes"],
    proposedServices:
      `<b>Mosquito Service:</b><br>• Target adult mosquitoes by treating areas with heavy foliage and where mosquito activity has been identified<br>• Set up mosquito buckets to interrupt breeding cycles and impact nearby breeding sites.<br><br><b>Additional Details:</b> Mosquitoes are one of the most difficult pests to control. Our goal with these mosquito treatments is to reduce the population by 80-90%. It typically takes a couple treatments and 45-60 days for us to achieve this goal.`,
    defaultInitial: 150,
    defaultRecurring: 85,
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
    defaultInitial: 85,
    defaultRecurring: 85,
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
    defaultInitial: 575,
    defaultRecurring: 0,
  },
  "Commercial Rodent": {
    frequency: 30,
    targetPests: ["Rodents"],
    proposedServices:
      `<b>Commercial Rodent:</b><br>• Install rodent bait boxes around the property to maintain consistent control of rodent populations<br>• Monitor, replenish, and adjust bait boxes depending on ongoing rodent activity<br>• Provide ongoing communication with management on rodent activity levels<br><br><b>Additional Details:</b> Rodent bait stations are designed to reduce the amount of rodent activity around your property. You may still see rodent activity around the exterior of your property.<br><br><b>Disclaimer:</b> Crest Pest Control is not liable for any structural or property damage caused by rodents.`,
    defaultInitial: 200,
    defaultRecurring: 70,
  },
  "Commercial Rodent and Pest": {
    frequency: 30,
    targetPests: ["Ants", "American Roaches", "Crickets", "Earwigs", "Spiders", "Silverfish", "Centipedes", "Millipedes", "Wasps", "Fleas & Ticks", "Rodents"],
    proposedServices:
      `<b>Commercial General Pest & Rodent:</b><br>• Inspect exterior and interior (including placing and monitoring pest traps) for pest activity<br>• Treat the exterior perimeter of the property and interior common areas (restrooms, break rooms, lounges, etc.). Treat other interior areas as needed<br>• Install rodent bait boxes around the property to maintain consistent control of rodent populations<br>• Monitor, replenish, and adjust bait boxes depending on ongoing rodent activity<br>• Provide ongoing communication with management on pest sightings and activity levels<br><br><b>Additional Details:</b> Rodent bait stations are designed to reduce the amount of rodent activity around your property. You may still see rodent activity around the exterior of your property.<br><br><b>Disclaimer:</b> Crest Pest Control is not liable for any structural or property damage caused by rodents.`,
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
    defaultInitial: 399,
    defaultRecurring: 0,
  },
  "German Cockroach Treatment": {
    frequency: 0,
    targetPests: ["Roaches"],
    proposedServices:
      `<b>German Cockroach Treatment:</b><br>• Apply gel baits, growth regulators, and residual products to eliminate German cockroach infestations<br>• Target kitchens, bathrooms, and other moisture-heavy areas where activity is concentrated<br>• Provide at least one follow-up treatment roughly 1 week later<br><br><b>Additional Details:</b> German roaches are a difficult pest to fully eliminate. Successful treatment requires you to complete the pre-treatment and post-treatment requirements provided in the preparation sheet. It typically takes 2-4 weeks for activity levels to fully subside.`,
    defaultInitial: 399,
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

const ATTIC_SERVICES_ADDITIONAL_DETAILS = `<b>Attic Service (additional details):</b><br><br><b>Manufacturer's Insulation Warranty:</b> The product will, for the lifetime of the structure:<br>a.) be free from manufacturing defects;<br>b.) not deteriorate under normal and proper use, including the pesticides, active ingredient, and the chemical fire retardant treatment if the insulation is installed according to Pest Control Insulation's label instructions.<br><br><b>Rodent Exclusion Guarantee:</b> Our standard guarantee for rodent exclusion work is 6 months. If rodents re-enter your property through previously sealed entry points during this period, we will re-seal them and reset traps at no additional cost. Please note that this guarantee does not cover any newly created entry points.<br><br><b>Extended Warranty for Ongoing Rodent Control Customers:</b> Customers enrolled in our ongoing rodent control program receive an extended warranty for as long as their service remains active. Because ongoing treatment helps reduce the rodent population around your property, it significantly lowers the likelihood of re-entry through previously sealed points.<br><br><b>Not Included Services (Unless Otherwise Specified or Pictured Below):</b><br>• Garage door repair<br>• Exclusion work in areas other than the attic<br>• Rodent clean up in areas other than the attic<br><br><b>Disclaimer:</b> Crest Pest Control is not liable for any structural or property damage caused by rodents.<br><br><b>Attic Specific Equipment:</b> TAP (Thermal, Acoustic, and Pest Control) Insulation [Active Ingredients: Boric Acid (&lt;15%)], Simple Green® d Pro 3 Plus disinfectant<br><br><b>Target Pests:</b> Rodents`;

const SERVICE_TYPE_OPTIONS = Object.keys(SERVICE_CONFIG);

// Preset exclusion clauses that can be multi-selected for the Limitations / Exclusions section
const EXCLUSION_PRESETS: { label: string; text: string }[] = [
  { label: "Specialty Pests", text: "Specialty Pests: Given the unique nature of these pests, treatment for German cockroaches, interior fleas, bed bugs, and bees is not covered under this agreement. We offer our customers these specialty pest services at a discount." },
  { label: "Rodents", text: "Rodents: This agreement does not cover control for rats and mice." },
  { label: "Rodent Trapping", text: "Rodent Trapping: This agreement does not cover rodent trapping. We offer these services to our customers at a discounted rate following an inspection." },
  { label: "Exclusion", text: "Exclusion: This agreement does not include physical exclusion work, such as sealing or blocking entry points to prevent pest access." },
  { label: "Web Removal", text: "Web Removal: Removal of spider webs or egg sacs from the interior or exterior of the property is not included in this service agreement." },
  { label: "Individual Residences", text: "Individual Residences: This contract does not extend coverage to individual residential units and applies only to the common areas and/or structures specified in the agreement. Services are provided to residents at a discounted rate and require a separate signed agreement." },
  { label: "Bed Bugs", text: "Bed Bugs: Bed bug treatment is not included in this agreement, but we offer it to our customers at a discounted rate following a required inspection." },
];

// Pre-built proposed services language for the "Multi-Family - Apartment Complex" property type
const APARTMENT_COMPLEX_PROPOSED_SERVICES = `<b>Every Visit</b><br>• Check in with management to understand any pest issues and confirm units to be serviced for that day<br>• [X] interior units* per visit for general pests, german roaches, and fleas. +$50 per unit above [X] units<br>• Address any active exterior pest problem areas as needed<br>• Provide the full service report and findings on our Crest Pest client portal<br><br><b>1st Weekly Visit (Focus on Zone #A)</b><br>• Inspect and treat the exterior and interior of the office, the pool area, and the exterior of buildings [XYZ]<br><br><b>2nd Weekly Visit (Focus on Zone #B)</b><br>• Inspect and treat the exterior of buildings [XYZ]<br><br><b>3rd Weekly Visit (Focus on Zone #C)</b><br>• Inspect and treat the exterior of buildings [XYZ]<br><br><b>4th Weekly Visit (Focus on Rodent Bait Stations)</b><br>• On initial visit, install [X] rodent bait stations around the property (see the site map below)<br>• On follow-up visits, check, replenish, and adjust rodent bait stations as needed<br>• Report findings on new rodent activity to management<br><br><b>Additional charges:</b> +$50 per unit above [X] units; $95 for ad hoc treatments; bed bug pricing depends on severity<br><br>* Interior units include treatments or inspections`;

const FREQUENCY_OPTIONS = [
  { label: "One-Time", days: 0 },
  { label: "Weekly", days: 7 },
  { label: "Bi-Weekly", days: 14 },
  { label: "Every 4 Weeks", days: 28 },
  { label: "30 days", days: 30 },
  { label: "60 days", days: 60 },
  { label: "8 Weeks", days: 56 },
  { label: "90 days", days: 90 },
  { label: "12 Weeks", days: 84 },
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

interface ServiceItem {
  serviceType: string;
  initialPrice: string;
  recurringPrice: string;
  frequency: number;
}

interface Proposal {
  name: string;
  services: ServiceItem[];
}

const PROPOSAL_NAMES = ["Option A", "Option B", "Option C", "Option D"];

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

  // FieldRoutes customer link (chosen via the picker) + autofilled phone.
  const [fieldroutesCustomerId, setFieldroutesCustomerId] = useState<string | null>(null);
  // FieldRoutes customer-portal URL ({loginlink}) — shown as a prominent
  // "Customer Portal" button in the report header and emailed to the customer.
  // Per-customer FieldPortals auto-login link ({{loginLink}}). Auto-captured by
  // the inspection webhook from the FieldRoutes Trigger, or pasted manually in
  // the loginLink field. The "Open Customer Portal" button + email only render
  // when this real link is present — we deliberately do NOT fall back to the
  // generic portal login page (that drops the customer on a login screen).
  const [fieldroutesLoginLink, setFieldroutesLoginLink] = useState<string | null>(null);
  const [customerPhone, setCustomerPhone] = useState("");
  const currentStaff = useCurrentStaff();

  const [editableTitle, setEditableTitle] = useState("Proposal");

  // (title auto-update moved below companyName declaration)

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

  // Multi-proposal system
  const [proposals, setProposals] = useState<Proposal[]>([
    { name: "Option A", services: [{ serviceType: "", initialPrice: "", recurringPrice: "", frequency: 30 }] },
  ]);
  const [recommendedProposal, setRecommendedProposal] = useState<number>(0);
  
  // Page 2 duplicates
  const [duplicatedPages, setDuplicatedPages] = useState<number[]>([]);
  
  // Separate map data per duplicated page
  const [duplicateMapData, setDuplicateMapData] = useState<Record<number, string | null>>({});
  const [duplicateRenderedMapImages, setDuplicateRenderedMapImages] = useState<Record<number, string | null>>({});
  const duplicateRenderedMapImagesRef = useRef<Record<number, string | null>>({});
  const [duplicateCustomMapImages, setDuplicateCustomMapImages] = useState<Record<number, string | null>>({});
  // Track which map is actively being edited (its toolbar is visible)
  // "main" = Option A map, "dupe-0" = Option B, "dupe-1" = Option C, etc.
  // When only one map exists, default to "main"
  const [activeMapId, setActiveMapId] = useState<string>("main");
  // Per-proposal editable findings (keyed by proposalIndex)
  const [proposalFindings, setProposalFindings] = useState<Record<number, string>>({});

  // Video upload
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoUrl2, setVideoUrl2] = useState<string | null>(null);
  // Client Portal walkthrough video — when true, renders the canned
  // /videos/client-portal-video.mp4 at the VERY bottom of the proposal
  // (after property images). Toggled from the bottom of the media page.
  const [portalVideoAttached, setPortalVideoAttached] = useState<boolean>(false);
  // HOA portal walkthrough video — renders /videos/hoa-portal-video.mp4
  // at the bottom of the proposal alongside the Client Portal walkthrough.
  const [hoaVideoAttached, setHoaVideoAttached] = useState<boolean>(false);
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [uploadingVideo2, setUploadingVideo2] = useState(false);

  // Flatten all services across proposals for backward compat
  const allServices = proposals.flatMap(p => p.services);
  const serviceTypesKey = allServices.map((s) => s.serviceType).join(",");

  const handleProposalServiceChange = (proposalIndex: number, serviceIndex: number, field: keyof ServiceItem, value: string | number) => {
    setProposals((prev) => {
      const updated = [...prev];
      const proposal = { ...updated[proposalIndex] };
      const services = [...proposal.services];
      services[serviceIndex] = { ...services[serviceIndex], [field]: value };

      if (field === "serviceType" && typeof value === "string") {
        const config = SERVICE_CONFIG[value];
        if (config) {
          services[serviceIndex].frequency = config.frequency;
          services[serviceIndex].initialPrice = String(config.defaultInitial);
          services[serviceIndex].recurringPrice = String(config.defaultRecurring);
        }
      }

      proposal.services = services;
      updated[proposalIndex] = proposal;
      return updated;
    });
  };

  const addServiceToProposal = (proposalIndex: number) => {
    setProposals((prev) => {
      const updated = [...prev];
      const proposal = { ...updated[proposalIndex] };
      if (proposal.services.length < 5) {
        proposal.services = [...proposal.services, { serviceType: "", initialPrice: "", recurringPrice: "", frequency: 30 }];
        updated[proposalIndex] = proposal;
      }
      return updated;
    });
  };

  const getRecurringLabel = (services: ServiceItem[]) => {
    const recurringServices = services.filter(s => s.frequency > 0 && s.serviceType);
    if (recurringServices.length === 0) {
      return "Recurring";
    }
    if (recurringServices.every(s => s.frequency === 7 || s.frequency === 14)) {
      return "Every 4 Weeks";
    }
    if (recurringServices.every(s => s.frequency === 30)) {
      return "Monthly";
    }
    return "Recurring";
  };

  const removeServiceFromProposal = (proposalIndex: number, serviceIndex: number) => {
    setProposals((prev) => {
      const updated = [...prev];
      const proposal = { ...updated[proposalIndex] };
      if (proposal.services.length > 1) {
        proposal.services = proposal.services.filter((_, i) => i !== serviceIndex);
        updated[proposalIndex] = proposal;
      }
      return updated;
    });
  };

  const addProposal = () => {
    if (proposals.length < 4) {
      const nextName = PROPOSAL_NAMES[proposals.length] || `Option ${proposals.length + 1}`;
      setProposals((prev) => [...prev, { name: nextName, services: [{ serviceType: "", initialPrice: "", recurringPrice: "", frequency: 30 }] }]);
    }
  };

  const removeProposal = (index: number) => {
    if (proposals.length > 1) {
      setProposals((prev) => prev.filter((_, i) => i !== index));
      if (recommendedProposal >= index) {
        setRecommendedProposal(Math.max(0, recommendedProposal - 1));
      }
    }
  };

  const [userEditedFindings, setUserEditedFindings] = useState(false);
  const findingsEditedRef = useRef(false);
  const addedServiceTypesRef = useRef<Set<string>>(new Set());
  const reportLoadedRef = useRef(false);

  // Auto-populate target pests from all proposals
  useEffect(() => {
    const allPests = new Set<string>();
    allServices.forEach((service) => {
      const config = SERVICE_CONFIG[service.serviceType];
      if (config && service.serviceType) {
        config.targetPests.forEach((pest) => allPests.add(pest));
      }
    });
    if (allPests.size > 0) {
      setEditableTargetPests(Array.from(allPests));
    }
  }, [serviceTypesKey]);

  // Auto-populate proposed services text from all proposals
  useEffect(() => {
    const isNewReport = !reportId;
    if (!isNewReport && !reportLoadedRef.current) return;

    const currentServiceTypes = new Set<string>();
    allServices.forEach((service) => {
      if (service.serviceType) currentServiceTypes.add(service.serviceType);
    });

    const newServiceTypes: string[] = [];
    currentServiceTypes.forEach((serviceType) => {
      if (!addedServiceTypesRef.current.has(serviceType)) {
        const config = SERVICE_CONFIG[serviceType];
        const existingContent = editableFindings[0] || "";
        const serviceHeaderMatch = config?.proposedServices?.match(/<b>([^<]+)<\/b>/);
        const serviceHeader = serviceHeaderMatch ? serviceHeaderMatch[1] : serviceType;
        if (!existingContent.includes(serviceHeader)) {
          newServiceTypes.push(serviceType);
        }
        addedServiceTypesRef.current.add(serviceType);
      }
    });

    if (newServiceTypes.length > 0) {
      const newDescriptions = newServiceTypes
        .map((st) => SERVICE_CONFIG[st]?.proposedServices)
        .filter(Boolean) as string[];

      if (newDescriptions.length > 0) {
        setEditableFindings((prev) => {
          const existingContent = prev[0] || "";
          const formattedNew = newDescriptions.join("<br><br>");
          if (existingContent.trim()) {
            return [existingContent + "<br><br>" + formattedNew];
          }
          return [formattedNew];
        });
      }
    }

    addedServiceTypesRef.current.forEach((serviceType) => {
      if (!currentServiceTypes.has(serviceType)) {
        addedServiceTypesRef.current.delete(serviceType);
      }
    });
  }, [serviceTypesKey, editableFindings]);

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
  const [renderedMapImage, setRenderedMapImage] = useState<string | null>(null);
  const [pdfExportMode, setPdfExportMode] = useState(false);
  const latestMapDataRef = useRef<string | null>(null);
  const [propertyImages, setPropertyImages] = useState<Array<{ image: string; caption?: string }>>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isExpandingFindings, setIsExpandingFindings] = useState(false);
  const [isExpandingExpect, setIsExpandingExpect] = useState(false);
  const [customerEmail, setCustomerEmail] = useState("");
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [showComposeDialog, setShowComposeDialog] = useState(false);
  const [pdfAttachOption, setPdfAttachOption] = useState<"short" | "full" | "none">("none");
  const [emailSubject, setEmailSubject] = useState("Crest Pest Control: Service Proposal");
  const [emailMessage, setEmailMessage] = useState("");
  const [selectedPrepSheetIds, setSelectedPrepSheetIds] = useState<string[]>([]);
  const [selectedPrepSheets, setSelectedPrepSheets] = useState<Array<{ id: string; title: string; file_url: string | null }>>([]);
  const [ccEmails, setCcEmails] = useState<string[]>(["office@crestpestcontrol.com", "sales@crestpestco.com", "caleb@crestpestco.com"]);
  const [ccInput, setCcInput] = useState("");
  const [customerSignature, setCustomerSignature] = useState<string | null>(null);
  const [perProposalSignatures, setPerProposalSignatures] = useState<Record<number, string | null>>({});
  const [additionalDetails, setAdditionalDetails] = useState("");
  const signatureRef = useRef<SignatureCanvasRef>(null);
  const proposalSignatureRefs = useRef<Record<number, SignatureCanvasRef | null>>({});
  const [signatureModalIndex, setSignatureModalIndex] = useState<number | null>(null);
  const [modalSignatureDraft, setModalSignatureDraft] = useState<string | null>(null);
  const modalSignatureRef = useRef<SignatureCanvasRef>(null);
  const [proposedServicesFontSize, setProposedServicesFontSize] = useState(12);
  const [additionalDetailsFontSize, setAdditionalDetailsFontSize] = useState(11);
  const [showSignature, setShowSignature] = useState(true);
  
  const PROPERTY_TYPES = [
    "Residential",
    "Multi-Family - Apartment Complex",
    "Commercial",
    "Apartment",
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
  
  // Auto-update title when customer/company name changes
  useEffect(() => {
    setEditableTitle(prev => {
      if (prev === "Multi-Proposal Report" || prev === "Proposal" || prev.startsWith("Proposal: ")) {
        const label = companyName?.trim() || editableCustomer?.trim() || "";
        return label ? `Proposal: ${label}` : "Proposal";
      }
      return prev;
    });
  }, [editableCustomer, companyName]);

  const [preferredServiceDay, setPreferredServiceDay] = useState("");
  const [preferredServiceTime, setPreferredServiceTime] = useState("");
  const [mainPointOfContact, setMainPointOfContact] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  
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
  // Per-option setup materials (keyed by proposalIndex)
  const [proposalSetupMaterials, setProposalSetupMaterials] = useState<Record<number, SetupMaterial[]>>({});
  // Per-option preset exclusion labels (keyed by proposalIndex)
  const [proposalSelectedExclusions, setProposalSelectedExclusions] = useState<Record<number, string[]>>({});
  // Per-option guarantee/warranty boxes (keyed by proposalIndex). Auto-seeded
  // with the default rodent box on first encounter; fully editable afterward.
  const [proposalGuaranteeBoxes, setProposalGuaranteeBoxes] = useState<Record<number, GuaranteeBox[]>>({});
  const guaranteeBoxesHydratedRef = useRef(false);
  // Per-option additional details (keyed by proposalIndex)
  const [proposalAdditionalDetails, setProposalAdditionalDetails] = useState<Record<number, string>>({});
  // Per-option target pests (keyed by proposalIndex). When undefined, auto-computed from services.
  const [proposalTargetPests, setProposalTargetPests] = useState<Record<number, string[]>>({});
  // Tracks which proposals have user-overridden target pests (so we don't recompute over their edits)
  const [proposalTargetPestsEdited, setProposalTargetPestsEdited] = useState<Record<number, boolean>>({});

  const [limitationsText, setLimitationsText] = useState("");
  const [newMaterialName, setNewMaterialName] = useState("");
  const [newMaterialQty, setNewMaterialQty] = useState("");

  const getProposalSetupMaterials = (idx: number): SetupMaterial[] =>
    proposalSetupMaterials[idx] ?? [];

  const addSetupMaterial = (proposalIndex: number, name: string, quantity: string) => {
    if (name.trim() && quantity.trim()) {
      setProposalSetupMaterials(prev => ({
        ...prev,
        [proposalIndex]: [...(prev[proposalIndex] ?? []), { name: name.trim(), quantity: quantity.trim() }],
      }));
    }
  };
  const removeSetupMaterial = (proposalIndex: number, index: number) => {
    setProposalSetupMaterials(prev => ({
      ...prev,
      [proposalIndex]: (prev[proposalIndex] ?? []).filter((_, i) => i !== index),
    }));
  };

  // GENERAL pests baseline (matches "Monthly Services" etc.)
  const GENERAL_TARGET_PESTS = ["Ants", "American Roaches", "Crickets", "Earwigs", "Spiders", "Silverfish", "Centipedes", "Millipedes", "Wasps", "Fleas & Ticks"];

  // Compute target pests for an option based on its selected services.
  // Defaults to general pests; adds Rodents / Mosquitoes when relevant services are present.
  const computeTargetPestsForProposal = (proposalIndex: number): string[] => {
    const proposal = proposals[proposalIndex];
    if (!proposal) return [...GENERAL_TARGET_PESTS];
    const services = proposal.services.filter(s => s.serviceType);
    if (services.length === 0) return [...GENERAL_TARGET_PESTS];

    const collected: string[] = [];
    const seen = new Set<string>();
    const add = (p: string) => { if (!seen.has(p)) { seen.add(p); collected.push(p); } };

    // Determine if this proposal contains any "general pest" service.
    // A general pest service is one whose configured targetPests include any
    // of the GENERAL_TARGET_PESTS (e.g. Monthly/Bi-Monthly/Quarterly,
    // Commercial General Pest, General Pest Control, Combined Commercial Rodent + Pest).
    // Rodent-only / mosquito-only / bed-bug-only services do NOT trigger the
    // general baseline — so a rodent-only proposal lists only "Rodents".
    const generalSet = new Set(GENERAL_TARGET_PESTS);
    const hasGeneralService = services.some(s => {
      const cfg = SERVICE_CONFIG[s.serviceType];
      return cfg?.targetPests?.some(p => generalSet.has(p));
    });

    if (hasGeneralService) {
      GENERAL_TARGET_PESTS.forEach(add);
    }

    // Add service-specific pests (Rodents, Mosquitoes, Bed Bugs, etc.)
    services.forEach(s => {
      const cfg = SERVICE_CONFIG[s.serviceType];
      if (cfg?.targetPests) {
        cfg.targetPests.forEach(add);
      }
    });
    return collected;
  };

  const getProposalTargetPests = (idx: number): string[] => {
    if (proposalTargetPestsEdited[idx] && proposalTargetPests[idx]) {
      return proposalTargetPests[idx];
    }
    return proposalTargetPests[idx] ?? computeTargetPestsForProposal(idx);
  };

  // Auto-recompute non-edited proposal target pests when their services change
  useEffect(() => {
    setProposalTargetPests(prev => {
      const next = { ...prev };
      proposals.forEach((_, idx) => {
        if (!proposalTargetPestsEdited[idx]) {
          next[idx] = computeTargetPestsForProposal(idx);
        }
      });
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serviceTypesKey, proposals.length]);

  // Auto-seed default rodent guarantee box for any proposal that contains a
  // rodent service but has no boxes saved yet. Once a proposal's array exists
  // (after hydration or any admin edit), we leave it alone.
  useEffect(() => {
    setProposalGuaranteeBoxes(prev => {
      const next = { ...prev };
      let changed = false;
      proposals.forEach((proposal, idx) => {
        if (next[idx] !== undefined) return;
        const seeded = resolveInitialGuaranteeBoxes(
          undefined,
          proposal.services.map((s) => s.serviceType),
        );
        if (seeded.length > 0) {
          next[idx] = seeded;
          changed = true;
        }
      });
      return changed ? next : prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serviceTypesKey, proposals.length]);

  // Auto-populate Attic Services additional details per proposal when Attic is selected
  // and the additional details box is empty for that proposal.
  useEffect(() => {
    setProposalAdditionalDetails(prev => {
      const next = { ...prev };
      let changed = false;
      proposals.forEach((proposal, idx) => {
        const hasAttic = proposal.services.some(
          (s) => s.serviceType === "Attic Services (see details below)"
        );
        const current = next[idx] ?? (idx === 0 ? additionalDetails : "");
        if (hasAttic && (!current || current.trim() === "")) {
          next[idx] = ATTIC_SERVICES_ADDITIONAL_DETAILS;
          changed = true;
          if (idx === 0) setAdditionalDetails(ATTIC_SERVICES_ADDITIONAL_DETAILS);
        }
      });
      return changed ? next : prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serviceTypesKey, proposals.length]);

  // Detect weekly / bi-weekly services on a proposal — used for invoice note
  const getInvoiceNoteForProposal = (proposalIndex: number): string | null => {
    const proposal = proposals[proposalIndex];
    if (!proposal) return null;
    const recurring = proposal.services.filter(s => s.serviceType && (s.frequency === 7 || s.frequency === 14));
    if (recurring.length === 0) return null;
    // If ANY weekly → invoice every 4 services. Else bi-weekly only → every 2.
    const hasWeekly = recurring.some(s => s.frequency === 7);
    const count = hasWeekly ? 4 : 2;
    return `Invoices are charged after every ${count} services.`;
  };
  
  const [displayedProducts, setDisplayedProducts] = useState(PRODUCT_OPTIONS);
  const [customProductName, setCustomProductName] = useState("");
  const [customProductChemical, setCustomProductChemical] = useState("");
  
  const [signatureWasSaved, setSignatureWasSaved] = useState(false);
  const [sentToCustomerAt, setSentToCustomerAt] = useState<string | null>(null);
  const [savedCustomerEmail, setSavedCustomerEmail] = useState<string | null>(null);
  const [isSavingSignature, setIsSavingSignature] = useState(false);
  const isReadOnly = !!signatureWasSaved;
  // Clear-signature-after-submit flow: gated behind the same 18444 password
  // used elsewhere for protected admin actions. State tracks WHICH proposal's
  // signature is being cleared so we can scope the wipe to a single option.
  const [clearSigDialog, setClearSigDialog] = useState<{ open: boolean; index: number | null }>({ open: false, index: null });
  const [clearSigPassword, setClearSigPassword] = useState("");
  const [clearSigSaving, setClearSigSaving] = useState(false);

  const requestClearSignature = (proposalIndex: number) => {
    setClearSigPassword("");
    setClearSigDialog({ open: true, index: proposalIndex });
  };

  const confirmClearSignature = async () => {
    if (clearSigPassword !== "18444") {
      toast.error("Incorrect password");
      return;
    }
    const idx = clearSigDialog.index;
    if (idx === null) return;
    setClearSigSaving(true);
    try {
      // Build the next per-proposal signatures map with this slot cleared.
      const nextSigs: Record<number, string | null> = { ...perProposalSignatures, [idx]: null };
      setPerProposalSignatures(nextSigs);

      // Determine if ANY signatures remain — if not, also clear the legacy
      // top-level customer_signature so the report flips back out of read-only.
      const anyRemain = Object.values(nextSigs).some((v) => !!v);
      const payloadSig = anyRemain
        ? JSON.stringify({
            _perProposal: true,
            signatures: Object.fromEntries(
              Object.entries(nextSigs).filter(([, v]) => !!v)
            ),
          })
        : null;

      if (reportId) {
        const { error } = await supabase
          .from("reports")
          .update({ customer_signature: payloadSig })
          .eq("id", reportId);
        if (error) throw error;
      }
      if (!anyRemain) {
        setCustomerSignature(null);
        setSignatureWasSaved(false);
      }
      toast.success("Signature cleared");
      setClearSigDialog({ open: false, index: null });
      setClearSigPassword("");
    } catch (err: any) {
      console.error("Failed to clear signature:", err);
      toast.error("Failed to clear signature");
    } finally {
      setClearSigSaving(false);
    }
  };

  const hasSchedulingInfo = [preferredServiceDay, preferredServiceTime, mainPointOfContact, contactPhone]
    .some((value) => value.trim().length > 0 && value.trim() !== "-");
  const showSchedulingSection = !isReadOnly || hasSchedulingInfo;
  
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
    // Signed = proposal accepted → queue its PDF to FieldRoutes. Auto mode is
    // idempotent and silently no-ops without an admin session / linked customer.
    if (signatureData) {
      void sendReportToFieldRoutes({ auto: true });
      // If this sales report contains Rodent Exclusion (or Trapping &
      // Exclusion), auto-spawn a Rodent Exclusion Report so the tech has a
      // pre-populated photo/exclusion write-up ready.
      void (async () => {
        try {
          const mod = await import("@/lib/rodentExclusionAutoCreate");
          // Flatten all proposals' services for the trigger check.
          const flat = proposals.flatMap((p) => p.services || []);
          if (!mod.salesReportHasRodentExclusion(flat) || !reportId) return;
          const res = await mod.ensureRodentExclusionReport({
            id: reportId,
            technician_name: editableTech,
            customer_name: editableCustomer,
            customer_email: customerEmail || null,
            customer_phone: customerPhone || null,
            address: editableAddress,
            service_date: editableServiceDate,
            license_number: editableLicenseNumber,
            map_data: mapData ? JSON.parse(mapData) : null,
            custom_map_url: customMapImage,
            rendered_map_url: renderedMapImage,
            fieldroutes_customer_id: fieldroutesCustomerId,
            services: flat,
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
      setEditableFindings(analysis.findings || []);
    }
  }, [analysis]);

  useEffect(() => {
    latestMapDataRef.current = mapData;
  }, [mapData]);

  useEffect(() => {
    duplicateRenderedMapImagesRef.current = duplicateRenderedMapImages;
  }, [duplicateRenderedMapImages]);

  // Backfill the FieldRoutes {loginlink} when the report is already linked to a
  // customer but no portal URL was captured at link time (older reports). Looks
  // the customer up by email and copies the loginLink so the prominent
  // "Customer Portal" button can appear at the top of the report.
  useEffect(() => {
    if (!fieldroutesCustomerId || fieldroutesLoginLink) return;
    const query = (customerEmail || editableCustomer || "").trim();
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
  }, [fieldroutesCustomerId, fieldroutesLoginLink, customerEmail, editableCustomer, currentStaff?.fullName]);

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
        const { data, error } = await supabase.from("reports").select("*").eq("id", reportId).maybeSingle();
        if (error) throw error;
        if (!data) throw new Error("Report not found");
        row = data;
      }

      setEditableTech(row.technician_name);
      setEditableCustomer(row.customer_name || "");
      setExtractedAddress(row.address || "");
      setEditableAddress(row.address || "");
      setFieldroutesCustomerId((row as { fieldroutes_customer_id?: string | null }).fieldroutes_customer_id || null);
      // Hydrate the customer portal link from customer_preferences JSON.
      {
        const prefs = (row as { customer_preferences?: { fieldroutes_login_link?: string | null } | null }).customer_preferences;
        if (prefs && typeof prefs === "object" && prefs.fieldroutes_login_link) {
          setFieldroutesLoginLink(String(prefs.fieldroutes_login_link));
        }
      }
      setCustomerPhone(row.customer_phone || "");
      setEditableFindings((row.findings as string[]) || []);
      if (row.findings && Array.isArray(row.findings) && row.findings.length > 0) {
        findingsEditedRef.current = true;
        setUserEditedFindings(true);
      }

      if (row.customer_signature) {
        setCustomerSignature(row.customer_signature);
        setSignatureWasSaved(true);
        // Load per-proposal signatures if stored as JSON
        try {
          const parsed = JSON.parse(row.customer_signature);
          if (parsed && parsed._perProposal && parsed.signatures) {
            const sigs: Record<number, string | null> = {};
            Object.entries(parsed.signatures).forEach(([k, v]) => { sigs[parseInt(k)] = v as string; });
            setPerProposalSignatures(sigs);
          }
        } catch {
          // Legacy single signature — apply to proposal 0
          setPerProposalSignatures({ 0: row.customer_signature });
        }
      }
      
      // Load proposals from services field
      if (row.services && Array.isArray(row.services) && row.services.length > 0) {
        // Check if first item has a 'name' key (new multi-proposal format)
        if (row.services[0] && typeof row.services[0] === 'object' && 'name' in row.services[0] && 'services' in row.services[0]) {
          setProposals(row.services as Proposal[]);
        } else {
          // Legacy single-service format - wrap in a proposal
          setProposals([{ name: "Option A", services: row.services as ServiceItem[] }]);
        }
        
        const allSvcs = row.services[0]?.services 
          ? (row.services as Proposal[]).flatMap(p => p.services)
          : (row.services as ServiceItem[]);
        addedServiceTypesRef.current = new Set(
          allSvcs.map((s: any) => s.serviceType).filter((t: any): t is string => !!t),
        );
      } else {
        addedServiceTypesRef.current = new Set();
      }
      
      reportLoadedRef.current = true;
      if (row.service_date) setEditableServiceDate(row.service_date);
      if (row.license_number) setEditableLicenseNumber(row.license_number);
      if (row.target_pests && Array.isArray(row.target_pests)) setEditableTargetPests(row.target_pests as string[]);
      if (row.products_used && Array.isArray(row.products_used)) setEditableProductsUsed(row.products_used as string[]);
      if (row.equipment && Array.isArray(row.equipment)) setEditableEquipment(row.equipment as string[]);
      if (row.report_title) setEditableTitle(row.report_title);
      
      if (row.notes) {
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

              // Per-option additional details (migrate legacy single value into Option A only)
              if (parsed.proposalAdditionalDetails && typeof parsed.proposalAdditionalDetails === 'object') {
                setProposalAdditionalDetails(parsed.proposalAdditionalDetails);
              } else if (parsed.additionalDetails) {
                setProposalAdditionalDetails({ 0: parsed.additionalDetails });
              }

              // Per-option setup materials (migrate legacy array into Option A only)
              if (parsed.proposalSetupMaterials && typeof parsed.proposalSetupMaterials === 'object') {
                setProposalSetupMaterials(parsed.proposalSetupMaterials);
              } else if (Array.isArray(parsed.setupMaterials) && parsed.setupMaterials.length > 0) {
                setProposalSetupMaterials({ 0: parsed.setupMaterials });
              }

              // Per-option preset exclusions
              if (parsed.proposalSelectedExclusions && typeof parsed.proposalSelectedExclusions === 'object') {
                setProposalSelectedExclusions(parsed.proposalSelectedExclusions);
              }
              if (parsed.proposalGuaranteeBoxes && typeof parsed.proposalGuaranteeBoxes === 'object') {
                setProposalGuaranteeBoxes(parsed.proposalGuaranteeBoxes);
                guaranteeBoxesHydratedRef.current = true;
              }

              // Per-option target pests + edited flags
              if (parsed.proposalTargetPests && typeof parsed.proposalTargetPests === 'object') {
                setProposalTargetPests(parsed.proposalTargetPests);
              }
              if (parsed.proposalTargetPestsEdited && typeof parsed.proposalTargetPestsEdited === 'object') {
                setProposalTargetPestsEdited(parsed.proposalTargetPestsEdited);
              }

              setLimitationsText(parsed.limitationsText || "");
              if (parsed.recommendedProposal !== undefined) setRecommendedProposal(parsed.recommendedProposal);
              if (parsed.videoUrl) setVideoUrl(parsed.videoUrl);
              if (parsed.videoUrl2) setVideoUrl2(parsed.videoUrl2);
              if (parsed.portalVideoAttached) setPortalVideoAttached(true);
              if (parsed.hoaVideoAttached) setHoaVideoAttached(true);
              if (parsed.duplicatedPages) setDuplicatedPages(parsed.duplicatedPages);
              if (parsed.duplicateMapData) setDuplicateMapData(parsed.duplicateMapData);
              if (parsed.duplicateRenderedMapImages) setDuplicateRenderedMapImages(parsed.duplicateRenderedMapImages);
              if (parsed.duplicateCustomMapImages) setDuplicateCustomMapImages(parsed.duplicateCustomMapImages);
              if (parsed.proposalFindings) setProposalFindings(parsed.proposalFindings);
            } else {
              setAdditionalDetails(row.notes);
            }
          } catch {
            setAdditionalDetails(row.notes);
          }
        } else {
          setAdditionalDetails(row.notes as string);
        }
      }
      
      if (row.sent_to_customer_at) setSentToCustomerAt(row.sent_to_customer_at);
      if (row.customer_email) {
        setSavedCustomerEmail(row.customer_email);
        setCustomerEmail(row.customer_email);
      }

      setMapData(row.map_data ? JSON.stringify(row.map_data) : null);
      if (row.custom_map_url) setCustomMapImage(row.custom_map_url);
      if (row.property_images) setPropertyImages(row.property_images as Array<{ image: string; caption?: string }>);

      if (row.map_url) {
        const latMatch = row.map_url.match(/mlat=([-\d.]+)/);
        const lngMatch = row.map_url.match(/mlon=([-\d.]+)/);
        if (latMatch && lngMatch) {
          setCoordinates({ lat: parseFloat(latMatch[1]), lng: parseFloat(lngMatch[1]) });
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
      extractCustomerName(imageDataUrls);
      const { data, error } = await supabase.functions.invoke("extract-address", {
        body: { images: imageDataUrls },
      });
      if (error) { console.error("Error extracting address:", error); return; }
      if (data.address && data.address !== "Address not found") {
        setExtractedAddress(data.address);
        if (data.coordinates) setCoordinates(data.coordinates);
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
        body: { images: imageDataUrls.slice(0, 3) },
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
        body: { images: imageDataUrls, address: extractedAddress || address },
      });
      if (error) { console.error("Error analyzing findings:", error); return; }
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
      const response = await fetch(geocodeUrl, { headers: { "User-Agent": "PestProReports/1.0" } });
      if (response.ok) {
        const data = await response.json();
        if (data && data.length > 0) {
          setCoordinates({ lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) });
          setExtractedAddress(addr);
        }
      }
    } catch (error) {
      console.error("Geocoding error:", error);
    }
  };

  const buildStructuredNotes = (options?: { duplicateMapDataOverride?: Record<number, string | null> }) => {
    // Ensure all proposals have findings text populated for the customer view
    const completeFindings: Record<number, string> = { ...proposalFindings };
    proposals.forEach((proposal, index) => {
      if (!completeFindings[index] || !completeFindings[index].trim()) {
        if (index === 0) {
          completeFindings[index] = editableFindings[0] || getProposalServicesText(index);
        } else {
          completeFindings[index] = getProposalServicesText(index);
        }
      }
    });

    return JSON.stringify({
      _structuredNotes: true,
      _reportFormat: "multi-proposal",
      // Legacy fields kept in sync with Option A for backward compat
      additionalDetails: (proposalAdditionalDetails[0] ?? additionalDetails) || notes || "",
      setupMaterials: proposalSetupMaterials[0] ?? [],
      // New per-option fields
      proposalAdditionalDetails,
      proposalSetupMaterials,
      proposalTargetPests,
      proposalTargetPestsEdited,
      proposalSelectedExclusions,
      proposalGuaranteeBoxes,
      propertyType,
      companyName,
      preferredServiceDay,
      preferredServiceTime,
      mainPointOfContact,
      contactPhone,
      limitationsText,
      recommendedProposal,
      videoUrl,
      videoUrl2,
      portalVideoAttached,
      hoaVideoAttached,
      duplicatedPages,
      duplicateMapData: options?.duplicateMapDataOverride ?? duplicateMapData,
      duplicateRenderedMapImages: duplicateRenderedMapImagesRef.current,
      duplicateCustomMapImages,
      proposalFindings: completeFindings,
    });
  };

  const buildServicesPayload = () => proposals;

  const waitForPdfMapRender = (ms = 300) =>
    new Promise<void>((resolve) => {
      setTimeout(() => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => resolve());
        });
      }, ms);
    });

  const parseMapPayload = (rawMap: string | null) => {
    if (!rawMap) return null;
    try {
      return JSON.parse(rawMap);
    } catch {
      return rawMap;
    }
  };

  const captureFreshMapState = async () => {
    const globalWindow = window as any;
    const exportStateFn = globalWindow.exportMapState as undefined | (() => string | null | Promise<string | null>);
    const stateRegistry = (globalWindow.mapStateRegistry ?? {}) as Record<string, (() => string | null | Promise<string | null>) | undefined>;

    let mainMapState = latestMapDataRef.current ?? mapData;

    if (exportStateFn) {
      try {
        const liveMainState = await exportStateFn();
        if (liveMainState) {
          mainMapState = liveMainState;
          latestMapDataRef.current = liveMainState;
          setMapData(liveMainState);
        }
      } catch (e) {
        console.warn('Failed to capture live main map state:', e);
      }
    }

    const duplicateStateUpdates: Record<number, string | null> = {};
    const duplicatePageEls = Array.from(document.querySelectorAll<HTMLElement>('[data-pdf-page^="2-dupe-"]'));

    for (const dupeContainer of duplicatePageEls) {
      const pageKey = dupeContainer.dataset.pdfPage ?? "";
      const match = pageKey.match(/^2-dupe-(\d+)$/);
      if (!match) continue;

      const dupeIndex = Number(match[1]);
      const exportDuplicateState = stateRegistry[`duplicate-${dupeIndex}`];
      if (!exportDuplicateState) continue;

      try {
        const liveDuplicateState = await exportDuplicateState();
        if (liveDuplicateState) {
          duplicateStateUpdates[dupeIndex] = liveDuplicateState;
        }
      } catch (e) {
        console.warn(`Failed to capture live duplicate map state ${dupeIndex}:`, e);
      }
    }

    const duplicateMapDataOverride = Object.keys(duplicateStateUpdates).length > 0
      ? { ...duplicateMapData, ...duplicateStateUpdates }
      : duplicateMapData;

    if (Object.keys(duplicateStateUpdates).length > 0) {
      setDuplicateMapData((prev) => ({ ...prev, ...duplicateStateUpdates }));
    }

    return {
      mainMapPayload: parseMapPayload(mainMapState),
      duplicateMapDataOverride,
    };
  };

  const captureFreshRenderedMap = async (): Promise<string | null> => {
    const globalWindow = window as any;
    const exportFn = globalWindow.exportMapAsImage as undefined | (() => Promise<string | null>);
    const exportRegistry = (globalWindow.mapExportRegistry ?? {}) as Record<string, (() => Promise<string | null>) | undefined>;
    let mainResult: string | null = renderedMapImage;

    if (exportFn) {
      const freshRender = await exportFn();
      if (freshRender) {
        mainResult = freshRender;
        setRenderedMapImage(freshRender);
      }
    }

    const dupeImages: Record<number, string | null> = {};
    const duplicatePageEls = Array.from(
      document.querySelectorAll<HTMLElement>('[data-pdf-page^="2-dupe-"]')
    );

    for (const dupeContainer of duplicatePageEls) {
      const pageKey = dupeContainer.dataset.pdfPage ?? "";
      const match = pageKey.match(/^2-dupe-(\d+)$/);
      if (!match) continue;
      const i = Number(match[1]);

      const registryExport = exportRegistry[`duplicate-${i}`];
      if (registryExport) {
        try {
          const dupeDataUrl = await registryExport();
          if (dupeDataUrl && dupeDataUrl !== "data:,") {
            dupeImages[i] = dupeDataUrl;
          }
        } catch (e) {
          console.warn(`Failed to capture duplicate map ${i}:`, e);
        }
      }

      if (!dupeImages[i]) {
        const dupeCanvas =
          dupeContainer.querySelector<HTMLCanvasElement>("canvas.upper-canvas") ||
          dupeContainer.querySelector<HTMLCanvasElement>("canvas");
        if (dupeCanvas) {
          try {
            const dupeDataUrl = dupeCanvas.toDataURL("image/png");
            if (dupeDataUrl && dupeDataUrl !== "data:,") {
              dupeImages[i] = dupeDataUrl;
            }
          } catch {
            // ignore canvas fallback failures
          }
        }
      }
    }

    if (Object.keys(dupeImages).length > 0) {
      duplicateRenderedMapImagesRef.current = { ...duplicateRenderedMapImagesRef.current, ...dupeImages };
      setDuplicateRenderedMapImages((prev) => ({ ...prev, ...dupeImages }));
    }

    await waitForPdfMapRender(500);
    return mainResult;
  };

  const buildBaseReportPayload = (
    mapPayload: any,
    finalSignature?: string | null,
    renderedMapUrl?: string | null,
    options?: { duplicateMapDataOverride?: Record<number, string | null> },
  ) => ({
    technician_name: editableTech,
    customer_name: editableCustomer,
    address: editableAddress || extractedAddress || address,
    notes: buildStructuredNotes(options),
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
    customer_phone: customerPhone || null,
    fieldroutes_customer_id: fieldroutesCustomerId,
    // Persist FieldRoutes customer-portal link so it survives reload and
    // can be shown as the "Customer Portal" button on the report header.
    customer_preferences: { fieldroutes_login_link: fieldroutesLoginLink || null },
  });

  const persistReport = async (reportData: Record<string, unknown>) => {
    const adminSessionToken = localStorage.getItem("admin_session");

    // Auto-link to a FieldRoutes customer if not already linked, so the completed
    // report's PDF can later upload back to the right customer. High-confidence
    // only (unique exact email / address); the picker stays the manual override.
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
        try {
          const { data, error: invokeError } = await supabase.functions.invoke("admin-reports", {
            body: { sessionToken: adminSessionToken, action: "update", reportId, reportData },
          });
          if (!invokeError && data?.ok) {
            savedViaAdmin = true;
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

  const getSerializedSignature = (): string | null => {
    // Collect per-proposal signatures
    const sigs: Record<string, string | null> = {};
    let hasSig = false;
    Object.entries(perProposalSignatures).forEach(([k, v]) => {
      if (v) { sigs[k] = v; hasSig = true; }
    });
    // Also force-save from refs
    Object.entries(proposalSignatureRefs.current).forEach(([k, ref]) => {
      const data = ref?.forceSave();
      if (data) { sigs[k] = data; hasSig = true; }
    });
    if (!hasSig) return customerSignature;
    return JSON.stringify({ _perProposal: true, signatures: sigs });
  };

  const handleSubmit = async () => {
    if (!editableTech) { toast.error("Please enter technician name"); return; }
    setIsSaving(true);
    try {
      const finalSignature = getSerializedSignature();
      const { mainMapPayload, duplicateMapDataOverride } = await captureFreshMapState();
      await persistReport(buildBaseReportPayload(mainMapPayload, finalSignature, undefined, { duplicateMapDataOverride }));
      toast.success("Report saved successfully!");
    } catch (error: any) {
      toast.error("Failed to save report");
      console.error(error);
    } finally {
      setIsSaving(false);
    }
  };

  const pendingAutoSaveRef = useRef(false);

  const autoSave = async () => {
    if (!editableTech || !reportId) return;
    try {
      const { mainMapPayload, duplicateMapDataOverride } = await captureFreshMapState();
      const finalSignature = signatureRef.current?.forceSave() ?? customerSignature;
      await persistReport(buildBaseReportPayload(mainMapPayload, finalSignature, undefined, { duplicateMapDataOverride }));
    } catch (err) {
      console.error("[autosave] failed:", err);
    }
  };

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
      } catch { console.log("Share cancelled"); }
    } else {
      toast.info("Sharing not supported on this device");
    }
  };

  // Capture the on-screen report pages and build the PDF bytes (no download).
  // Shared by the PDF download and the "Send to FieldRoutes" upload.
  const capturePdfBytes = async (mode: "short" | "full" = "short"): Promise<Uint8Array> => {
    await captureFreshRenderedMap();
    setPdfExportMode(true);
    try {
      // Wait for all rendered map images to appear in DOM
      await new Promise((r) => setTimeout(r, 600));
      const pageEls = Array.from(
        document.querySelectorAll<HTMLElement>("[data-pdf-capture]")
      ).sort((a, b) => Number(a.dataset.pdfCapture) - Number(b.dataset.pdfCapture));
      const reportPages = pageEls.filter((el) => !el.querySelector(".no-images-placeholder"));
      if (mode === "full") {
        return await buildMergedPDF({
          customerName: editableCustomer || "",
          technicianName: editableTech || "",
          address: editableAddress || extractedAddress || address || "",
          reportPages,
        });
      }
      return await buildSimplePDF({ reportPages });
    } finally {
      setPdfExportMode(false);
    }
  };

  const exportToPDF = async (mode: "short" | "full" = "short") => {
    try {
      toast.info("Generating PDF...", { duration: 10000, id: "pdf-gen" });
      const pdfBytes = await capturePdfBytes(mode);
      toast.dismiss("pdf-gen");
      const filename = `Crest_MultiProposal_${(editableCustomer || "Customer").replace(/\s+/g, "_")}.pdf`;
      downloadPDF(pdfBytes, filename);
      toast.success("PDF downloaded!");
    } catch (e) {
      console.error("PDF export error:", e);
      toast.dismiss("pdf-gen");
      toast.error("PDF generation failed. Try again.");
    }
  };

  // Queue this report's PDF to upload back onto the linked FieldRoutes customer.
  // Goes through the approval queue (fieldroutes-document-submit) — it does NOT
  // write to FieldRoutes directly. Admin-only; requires a linked customer.
  // `auto` mode (fired on signature) stays quiet on the "nothing to do" cases
  // and never double-queues (server-side dedup + this ref).
  const frQueueAttemptedRef = useRef(false);
  const sendReportToFieldRoutes = async (opts?: { auto?: boolean }) => {
    const auto = opts?.auto === true;
    const sessionToken = localStorage.getItem("admin_session");
    // On a customer's device (remote signing) there's no admin session — we
    // can't authenticate a write, so auto-mode silently skips.
    if (!sessionToken) { if (!auto) toast.error("Admin session required to send to FieldRoutes."); return; }
    if (!fieldroutesCustomerId) {
      if (!auto) toast.error("Link a FieldRoutes customer first (the search box at the top).");
      return;
    }
    if (auto) {
      if (frQueueAttemptedRef.current) return;
      frQueueAttemptedRef.current = true;
    }
    try {
      if (!auto) toast.info("Preparing PDF…", { duration: 15000, id: "fr-doc" });
      const pdfBytes = await capturePdfBytes("short");
      // Uint8Array -> base64, chunked to avoid call-stack limits on big files.
      let bin = "";
      const chunk = 0x8000;
      for (let i = 0; i < pdfBytes.length; i += chunk) {
        bin += String.fromCharCode(...pdfBytes.subarray(i, i + chunk));
      }
      const fileBase64 = btoa(bin);
      // Signed agreements skip the approval queue and upload directly with a
      // standard "Signed Agreement" tag. Manual sends still go through the
      // approval queue with the descriptive title.
      const description = auto
        ? "Signed Agreement"
        : `${editableTitle || "Proposal"} — ${editableCustomer || "Customer"}`.slice(0, 120);
      const { data, error } = await supabase.functions.invoke("fieldroutes-document-submit", {
        body: {
          sessionToken,
          customerID: Number(fieldroutesCustomerId),
          fileBase64,
          filename: `Crest_${(editableCustomer || "Customer").replace(/\s+/g, "_")}.pdf`,
          description,
          reportId: reportId ?? undefined,
          showCustomer: false,
          autoApprove: auto, // signed-agreement auto-push bypasses approval
        },
      });
      if (!auto) toast.dismiss("fr-doc");
      if (error || !data?.ok) {
        frQueueAttemptedRef.current = false; // allow a retry on a real failure
        if (!auto) toast.error(`Could not send: ${data?.error ?? error?.message ?? "unknown error"}`);
        else console.warn("FieldRoutes auto-queue failed", data?.error ?? error?.message);
        return;
      }
      if (data?.deduped) { if (!auto) toast.info("Already queued for FieldRoutes."); return; }
      if (auto && data?.autoApproved) {
        // silent success on auto-push
      } else if (data?.autoApproved) {
        toast.success("Uploaded to FieldRoutes ✓");
      } else {
        toast.success("Sales report queued for FieldRoutes — approve it in Admin → FieldRoutes Writes.");
      }
    } catch (e) {
      console.error("send to FieldRoutes error:", e);
      frQueueAttemptedRef.current = false;
      if (!auto) { toast.dismiss("fr-doc"); toast.error("Failed to prepare/queue the PDF. Try again."); }
    }
  };

  // Auto-push a signed proposal to FieldRoutes whenever an admin opens it.
  // The customer's own device never has an admin session, so the on-sign
  // auto-call there silently no-ops. This effect closes that gap: any admin
  // viewing the report fires the queue (server-side dedup makes re-fires safe).
  useEffect(() => {
    if (!reportId || !customerSignature || !fieldroutesCustomerId) return;
    if (!localStorage.getItem("admin_session")) return;
    if (frQueueAttemptedRef.current) return;
    void sendReportToFieldRoutes({ auto: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportId, customerSignature, fieldroutesCustomerId]);

  const handleOpenCompose = () => {
    const firstName = (editableCustomer || "").split(" ")[0] || "there";
    const defaultMessage = `Hi ${firstName},

Thank you for the opportunity to prepare a proposal for your property.

Based on our assessment, we've put together a plan designed to effectively address your pest control needs.

Our goal is to provide reliable, proactive protection so you can have peace of mind knowing your property is covered.

Please feel free to reach out with any questions or if you'd like to move forward, we're happy to help. You can also add a payment method anytime through the customer portal button below.

Best,

${editableTech || "Your Technician"}

Crest Pest Control`;
    setEmailMessage(defaultMessage);
    setShowComposeDialog(true);
  };

  const handleSendEmail = async () => {
    if (!customerEmail) { toast.error("Please enter customer email address"); return; }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(customerEmail)) { toast.error("Please enter a valid email address"); return; }
    setIsSendingEmail(true);
    try {
      const finalSignature = signatureRef.current?.forceSave() ?? customerSignature;
      const { mainMapPayload, duplicateMapDataOverride } = await captureFreshMapState();
      const freshRenderedMap = await captureFreshRenderedMap();
      const sentAt = new Date().toISOString();
      const finalReportId = await persistReport({
        ...buildBaseReportPayload(mainMapPayload, finalSignature, freshRenderedMap, { duplicateMapDataOverride }),
        customer_email: customerEmail,
        sent_to_customer_at: sentAt,
      });

      let pdfBase64: string | undefined;
      if (pdfAttachOption !== "none") {
        toast.info("Generating PDF for email...", { duration: 15000, id: "pdf-email" });
        try {
          setPdfExportMode(true);
          await new Promise((r) => setTimeout(r, 600));
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
          reportType: "multi-proposal",
          customerPortalUrl: fieldroutesLoginLink || undefined,
          ...(selectedPrepSheets.length > 0 ? {
            extraAttachments: buildPrepSheetAttachments(selectedPrepSheets),
          } : {}),
          ...(pdfBase64 ? {
            pdfBase64,
            pdfFilename: `Crest_MultiProposal_${(editableCustomer || "Customer").replace(/\s+/g, "_")}.pdf`,
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


  const handlePropertyImagesUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    const fileArray = Array.from(files).slice(0, 12);
    if (fileArray.some((file) => file.size === 0)) { toast.error("One of the selected photos isn't downloaded to this iPad yet (iCloud). Download it in Photos and try again."); return; }
    if (fileArray.some((file) => file.type && !file.type.startsWith("image/"))) { toast.error("Please upload only image files"); return; }
    try {
      const { compressImage } = await import("@/lib/imageUpload");
      const compressionPromises = fileArray.map(async (file) => {
        const { blob, localUrl } = await compressImage(file, { maxWidth: 1200, maxHeight: 1200, quality: 0.75 });
        return { blob, localUrl };
      });
      const compressedImages = await Promise.all(compressionPromises);
      setPropertyImages(compressedImages.map(({ localUrl }) => ({ image: localUrl, caption: "" })));
      const uploadPromises = compressedImages.map(async ({ blob, localUrl }) => {
        const fileName = `${Math.random()}.jpg`;
        const filePath = `${reportId || "temp"}/property/${fileName}`;
        const { error: uploadError } = await supabase.storage
          .from("report-images")
          .upload(filePath, blob, { upsert: true, contentType: "image/jpeg" });
        if (uploadError) throw uploadError;
        const { data: { publicUrl } } = supabase.storage.from("report-images").getPublicUrl(filePath);
        URL.revokeObjectURL(localUrl);
        return { image: publicUrl, caption: "" };
      });
      const uploadedImages = await Promise.all(uploadPromises);
      setPropertyImages(uploadedImages.map(({ image, caption }) => ({ image, caption })));
      pendingAutoSaveRef.current = true;
      toast.success(`${fileArray.length} image(s) uploaded`);
    } catch (error) {
      console.error("Error uploading images:", error);
      toast.error("Failed to upload images");
    }
  };

  const handleVideoUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    slot: 1 | 2 = 1,
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("video/")) { toast.error("Please upload a video file"); return; }
    const setUrl = slot === 2 ? setVideoUrl2 : setVideoUrl;
    const setUploading = slot === 2 ? setUploadingVideo2 : setUploadingVideo;
    setUploading(true);
    try {
      const localUrl = URL.createObjectURL(file);
      setUrl(localUrl);
      const fileName = `${Math.random()}.${file.name.split('.').pop() || 'mp4'}`;
      const filePath = `${reportId || "temp"}/video${slot === 2 ? "2" : ""}/${fileName}`;
      const { error: uploadError } = await supabase.storage
        .from("report-images")
        .upload(filePath, file, { upsert: true, contentType: file.type });
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage.from("report-images").getPublicUrl(filePath);
      setUrl(publicUrl);
      URL.revokeObjectURL(localUrl);
      pendingAutoSaveRef.current = true;
      toast.success("Video uploaded");
    } catch (error) {
      console.error("Error uploading video:", error);
      toast.error("Failed to upload video");
    } finally {
      setUploading(false);
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

  const handleImageDragStart = (index: number) => { setDraggedImageIndex(index); };
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
  const handleImageDragEnd = () => { setDraggedImageIndex(null); };

  const handleMapPasteForPage = async (e: React.ClipboardEvent, isDupe: boolean, dupeIdx?: number) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith("image/")) {
        e.preventDefault();
        const file = item.getAsFile();
        if (!file) continue;
        try {
          const { compressImage } = await import("@/lib/imageUpload");
          const { blob: compressedBlob, localUrl } = await compressImage(file, { maxWidth: 1200, maxHeight: 1200, quality: 0.75 });
          if (isDupe && dupeIdx !== undefined) {
            setDuplicateCustomMapImages(prev => ({ ...prev, [dupeIdx]: localUrl }));
          } else {
            setCustomMapImage(localUrl);
          }
          const fileName = `${Math.random()}.jpg`;
          const filePath = `${reportId || "temp"}/custom-map/${fileName}`;
          const { error: uploadError } = await supabase.storage
            .from("report-images")
            .upload(filePath, compressedBlob, { upsert: true, contentType: "image/jpeg" });
          if (uploadError) throw uploadError;
          const { data: { publicUrl } } = supabase.storage.from("report-images").getPublicUrl(filePath);
          if (isDupe && dupeIdx !== undefined) {
            setDuplicateCustomMapImages(prev => ({ ...prev, [dupeIdx]: publicUrl }));
          } else {
            setCustomMapImage(publicUrl);
          }
          URL.revokeObjectURL(localUrl);
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

  const handleMapUploadForPage = async (e: React.ChangeEvent<HTMLInputElement>, isDupe: boolean, dupeIdx?: number) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type && !file.type.startsWith("image/")) { toast.error("Please upload an image file"); return; }
    if (file.size === 0) { toast.error("That photo isn't downloaded to this iPad yet (iCloud). Open Photos, download it, then try again."); return; }
    try {
      const { compressImage } = await import("@/lib/imageUpload");
      const { blob: compressedBlob, localUrl } = await compressImage(file, { maxWidth: 1200, maxHeight: 1200, quality: 0.75 });
      if (isDupe && dupeIdx !== undefined) {
        setDuplicateCustomMapImages(prev => ({ ...prev, [dupeIdx]: localUrl }));
      } else {
        setCustomMapImage(localUrl);
      }
      const fileName = `${Math.random()}.jpg`;
      const filePath = `${reportId || "temp"}/custom-map/${fileName}`;
      const { error: uploadError } = await supabase.storage
        .from("report-images")
        .upload(filePath, compressedBlob, { upsert: true, contentType: "image/jpeg" });
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage.from("report-images").getPublicUrl(filePath);
      if (isDupe && dupeIdx !== undefined) {
        setDuplicateCustomMapImages(prev => ({ ...prev, [dupeIdx]: publicUrl }));
      } else {
        setCustomMapImage(publicUrl);
      }
      URL.revokeObjectURL(localUrl);
      pendingAutoSaveRef.current = true;
      toast.success("Map uploaded");
    } catch (error) {
      console.error("Error uploading map:", error);
      toast.error("Failed to upload map image");
    }
  };

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
    const maxNew = Math.min(imageFiles.length, 12 - propertyImages.length);
    if (maxNew <= 0) { toast.error("Maximum 12 images allowed"); return; }
    const filesToProcess = imageFiles.slice(0, maxNew);
    try {
      const { compressImage } = await import("@/lib/imageUpload");
      const compressionPromises = filesToProcess.map(async (file) => {
        const { blob, localUrl } = await compressImage(file, { maxWidth: 1200, maxHeight: 1200, quality: 0.75 });
        return { blob, localUrl };
      });
      const compressedImages = await Promise.all(compressionPromises);
      setPropertyImages(prev => [...prev, ...compressedImages.map(({ localUrl }) => ({ image: localUrl, caption: "" }))]);
      const uploadPromises = compressedImages.map(async ({ blob, localUrl }) => {
        const fileName = `${Math.random()}.jpg`;
        const filePath = `${reportId || "temp"}/property/${fileName}`;
        const { error: uploadError } = await supabase.storage
          .from("report-images")
          .upload(filePath, blob, { upsert: true, contentType: "image/jpeg" });
        if (uploadError) throw uploadError;
        const { data: { publicUrl } } = supabase.storage.from("report-images").getPublicUrl(filePath);
        URL.revokeObjectURL(localUrl);
        return { image: publicUrl, caption: "", localUrl };
      });
      const uploadedImages = await Promise.all(uploadPromises);
      setPropertyImages(prev => {
        const updated = [...prev];
        uploadedImages.forEach(({ image, localUrl }) => {
          const idx = updated.findIndex(img => img.image === localUrl);
          if (idx !== -1) updated[idx] = { ...updated[idx], image };
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

  const handleDuplicatePage2 = () => {
    setDuplicatedPages(prev => [...prev, prev.length + 1]);
  };

  const removeDuplicatedPage = (index: number) => {
    setDuplicatedPages(prev => prev.filter((_, i) => i !== index));
  };

  // Render a proposal pricing table
  const renderProposalTable = (proposal: Proposal, proposalIndex: number) => {
    const isRecommended = recommendedProposal === proposalIndex;
    const proposalLabel = proposal.name.trim() || PROPOSAL_NAMES[proposalIndex] || `Option ${proposalIndex + 1}`;

    return (
      <div key={proposalIndex} className="print-pricing-wrapper">
        {/* Option name header — sits ABOVE the pricing card */}
        <div className="proposal-option-header flex items-center justify-between gap-2 mb-1">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <div className="proposal-name-shell min-w-[220px] flex-1 rounded-lg border border-border bg-muted/40 px-3 py-1.5">
              {isReadOnly ? (
                <h3 className="proposal-name-text break-words text-base font-bold leading-tight text-foreground">{proposalLabel}</h3>
              ) : (
                <>
                  <Input
                    value={proposal.name}
                    onChange={(e) => {
                      setProposals(prev => {
                        const updated = [...prev];
                        updated[proposalIndex] = { ...updated[proposalIndex], name: e.target.value };
                        return updated;
                      });
                    }}
                    className="proposal-name-input no-print h-8 w-full border-0 bg-transparent px-0 py-0 text-base font-bold shadow-none focus-visible:ring-0"
                  />
                  <div className="proposal-name-print hidden break-words text-base font-bold leading-tight text-foreground print:block">{proposalLabel}</div>
                </>
              )}
            </div>
            {isRecommended && (
              <span className="proposal-recommended-tag shrink-0 rounded-md bg-foreground px-3 py-1 text-xs font-bold uppercase tracking-[0.15em] text-background">
                ★ Recommended
              </span>
            )}
          </div>
          {!isReadOnly && proposals.length > 1 && (
            <Button variant="ghost" size="icon" className="h-6 w-6 no-print" onClick={() => removeProposal(proposalIndex)}>
              <X className="w-3 h-3" />
            </Button>
          )}
        </div>
        {/* Pricing table card */}
        <Card
          data-recommended={isRecommended ? "true" : "false"}
          className={cn(
            "print-section print-pricing-table p-2.5 print:p-1 print:py-1.5",
            "border border-border rounded-xl bg-background",
          )}
        >
        {/* ── Interactive grid (screen only) ── */}
        <div className="space-y-1 print:hidden">
          {/* Header Row */}
          <div className="grid grid-cols-[minmax(100px,1fr)_70px_70px_120px_minmax(140px,1.5fr)_24px] gap-1.5 items-center text-sm font-bold uppercase border-b border-border pb-1">
            <span className="pl-1">Service Type</span>
            <span className="text-center">Initial</span>
            <span className="text-center">{getRecurringLabel(proposal.services)}</span>
            <span className="text-center">Frequency</span>
            <span className="text-center">Schedule</span>
            <span></span>
          </div>

          {/* Service Rows */}
          {proposal.services.map((service, serviceIndex) => (
            <div
              key={serviceIndex}
              className="grid grid-cols-[minmax(100px,1fr)_70px_70px_120px_minmax(140px,1.5fr)_24px] gap-1.5 items-center"
            >
              <div className="bg-white/80 rounded px-1">
                <Select
                  value={service.serviceType}
                  onValueChange={(val) => handleProposalServiceChange(proposalIndex, serviceIndex, "serviceType", val)}
                >
                  <SelectTrigger className="h-6 text-xs w-full bg-transparent border-0 shadow-none">
                    <SelectValue placeholder="Select service..." />
                  </SelectTrigger>
                  <SelectContent className="bg-white z-50">
                    {SERVICE_TYPE_OPTIONS.map((option) => (
                      <SelectItem key={option} value={option} className="text-xs">{option}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="relative bg-white/80 rounded">
                <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">$</span>
                <Input type="text" inputMode="numeric" value={service.initialPrice}
                  onChange={(e) => handleProposalServiceChange(proposalIndex, serviceIndex, "initialPrice", e.target.value.replace(/[^0-9]/g, ""))}
                  placeholder="0" className="h-6 text-xs pl-4 text-center pr-1 bg-transparent border-0 shadow-none" />
              </div>
              <div className="relative bg-white/80 rounded">
                <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">$</span>
                <Input type="text" inputMode="numeric" value={service.recurringPrice}
                  onChange={(e) => handleProposalServiceChange(proposalIndex, serviceIndex, "recurringPrice", e.target.value.replace(/[^0-9]/g, ""))}
                  placeholder="0" className="h-6 text-xs pl-4 text-center pr-1 bg-transparent border-0 shadow-none" />
              </div>
              <div className="bg-white/80 rounded px-1">
                <Select value={service.frequency.toString()}
                  onValueChange={(val) => handleProposalServiceChange(proposalIndex, serviceIndex, "frequency", parseInt(val))}>
                  <SelectTrigger className="h-6 text-xs w-full bg-transparent border-0 shadow-none">
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent className="bg-white z-50">
                    {FREQUENCY_OPTIONS.map((option) => (
                      <SelectItem key={option.days} value={option.days.toString()} className="text-xs">{option.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="min-w-0 bg-white/80 rounded-lg px-1 py-0.5">
                {service.frequency > 0 ? (
                  <div className="flex flex-wrap gap-0.5">
                    {(() => {
                      const isHighFreq = service.frequency === 7 || service.frequency === 14;
                      const today = new Date();
                      const count = isHighFreq ? 8 : 6;
                      return Array.from({ length: count }, (_, i) => {
                        const scheduleDate = new Date(today);
                        scheduleDate.setDate(scheduleDate.getDate() + i * service.frequency);
                        const isFirst = i === 0;
                        return (
                          <span key={i} className={`px-1 py-0.5 rounded text-[9px] whitespace-nowrap ${isFirst ? "bg-secondary text-white font-medium" : "bg-muted text-muted-foreground"}`}>
                            {formatScheduleChip(scheduleDate, isHighFreq)}
                          </span>
                        );
                      });
                    })()}
                  </div>
                ) : (
                  <span className="text-[10px] text-muted-foreground">One-time</span>
                )}
              </div>
              <div>
                {proposal.services.length > 1 && (
                  <Button type="button" variant="ghost" size="icon" className="h-6 w-6"
                    onClick={() => removeServiceFromProposal(proposalIndex, serviceIndex)}>
                    <X className="w-3 h-3" />
                  </Button>
                )}
              </div>
            </div>
          ))}

          {/* Totals Row */}
          <div className="grid grid-cols-[minmax(100px,1fr)_70px_70px_120px_minmax(140px,1.5fr)_24px] gap-1.5 items-center pt-1 border-t border-border">
            <div className="text-xs font-bold text-right">Total:</div>
            <div className="text-xs bg-white/80 rounded-lg py-0.5 px-1 flex items-center justify-center h-6">
              <span className="text-muted-foreground">$</span>
              <span className="font-bold">{Math.round(proposal.services.reduce((sum, s) => sum + (parseFloat(s.initialPrice) || 0), 0)).toLocaleString()}</span>
            </div>
            <div className="text-xs bg-white/80 rounded-lg py-0.5 px-1 flex items-center justify-center h-6">
              <span className="text-muted-foreground">$</span>
              <span className="font-bold">{Math.round(proposal.services.reduce((sum, s) => sum + (parseFloat(s.recurringPrice) || 0), 0)).toLocaleString()}</span>
            </div>
            <div></div><div></div><div></div>
          </div>

          {proposal.services.length < 5 && !isReadOnly && (
            <Button type="button" variant="outline" size="sm" onClick={() => addServiceToProposal(proposalIndex)}
              className="h-6 text-[10px] mt-1">
              <Plus className="w-3 h-3 mr-1" /> Add Service
            </Button>
          )}
        </div>

        {/* ── Print-only HTML table (for PDF capture) ── */}
        <table className="proposal-print-table hidden print:table w-full">
          <thead>
            <tr>
              <th className="text-left">Service Type</th>
              <th className="text-center">Initial</th>
              <th className="text-center">{getRecurringLabel(proposal.services)}</th>
              <th className="text-center">Frequency</th>
              <th className="text-center">Schedule</th>
            </tr>
          </thead>
          <tbody>
            {proposal.services.map((service, serviceIndex) => (
              <tr key={serviceIndex}>
                <td>{service.serviceType || "—"}</td>
                <td className="text-center font-semibold">${(parseInt(service.initialPrice || "0") || 0).toLocaleString()}</td>
                <td className="text-center font-semibold">${(parseInt(service.recurringPrice || "0") || 0).toLocaleString()}</td>
                <td className="text-center">{FREQUENCY_OPTIONS.find((o) => o.days === service.frequency)?.label || "—"}</td>
                <td>
                  {service.frequency > 0 ? (
                    <span className="proposal-schedule-pills">
                      {(() => {
                        const isHighFreq = service.frequency === 7 || service.frequency === 14;
                        const today = new Date();
                        const count = isHighFreq ? 8 : 6;
                        return Array.from({ length: count }, (_, i) => {
                          const d = new Date(today);
                          d.setDate(d.getDate() + i * service.frequency);
                          return (
                            <span key={i} className={`schedule-pill ${i === 0 ? "schedule-pill--first" : ""}`}>
                              {formatScheduleChip(d, isHighFreq)}
                            </span>
                          );
                        });
                      })()}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">One-time</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td className="text-right font-bold">Total:</td>
              <td className="text-center font-bold">${Math.round(proposal.services.reduce((sum, s) => sum + (parseFloat(s.initialPrice) || 0), 0)).toLocaleString()}</td>
              <td className="text-center font-bold">${Math.round(proposal.services.reduce((sum, s) => sum + (parseFloat(s.recurringPrice) || 0), 0)).toLocaleString()}</td>
              <td></td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </Card>
      </div>
    );
  };

  // Get the proposed services text for a specific proposal index
  const getProposalServicesText = (proposalIndex: number): string => {
    const proposal = proposals[proposalIndex];
    if (!proposal) return "";
    const descriptions = proposal.services
      .filter(s => s.serviceType)
      .map(s => SERVICE_CONFIG[s.serviceType]?.proposedServices)
      .filter(Boolean) as string[];
    return descriptions.join("<br><br>");
  };

  // Render the map section (reused for original and duplicates)
  // proposalIndex determines which proposal's services to auto-populate
  const renderMapSection = (captureIndex: number, isDuplicate: boolean = false, dupeIndex?: number) => {
    // Page 2 (original) = proposal 0, first dupe = proposal 1, etc.
    const proposalIndex = isDuplicate ? (dupeIndex ?? 0) + 1 : 0;
    const proposalServicesText = getProposalServicesText(proposalIndex);
    const proposalName = proposals[proposalIndex]?.name || `Option ${String.fromCharCode(65 + proposalIndex)}`;
    // Use per-proposal editable findings; fall back to auto-generated text
    const proposalFindingsValue = proposalFindings[proposalIndex] ?? "";
    const servicesContent = proposalFindingsValue || (isDuplicate ? proposalServicesText : (editableFindings[0] || ""));
    
    // Each page gets its own map data
    const currentMapData = isDuplicate ? (duplicateMapData[dupeIndex ?? 0] ?? mapData) : mapData;
    const currentRenderedMap = isDuplicate ? (duplicateRenderedMapImages[dupeIndex ?? 0] ?? renderedMapImage) : renderedMapImage;
    
    const handleDupeMapSave = (data: string | null) => {
      if (isDuplicate && dupeIndex !== undefined) {
        setDuplicateMapData(prev => ({ ...prev, [dupeIndex]: data }));
      } else {
        setMapData(data);
      }
    };
    
    const handleDupeMapExport = (img: string | null) => {
      if (isDuplicate && dupeIndex !== undefined) {
        duplicateRenderedMapImagesRef.current = { ...duplicateRenderedMapImagesRef.current, [dupeIndex]: img };
        setDuplicateRenderedMapImages(prev => ({ ...prev, [dupeIndex]: img }));
      } else {
        setRenderedMapImage(img);
      }
    };
    
    return (
    <div data-pdf-page={isDuplicate ? `2-dupe-${dupeIndex}` : "2"} className="print-page-break bg-background print:flex print:flex-col print:min-h-[100vh]">
      <div data-pdf-capture={captureIndex.toString()} className="w-full p-4 print:px-2 print:py-3 max-w-[1800px] mx-auto print:min-h-[100vh] print:flex print:flex-col">
        {/* Page Header */}
        <div className="page2-header flex items-center justify-between mb-4 print:mb-2.5 pb-2 print:pb-1.5 border-b-2 border-border bg-primary/30 rounded-md px-5 py-3 print:px-3 print:py-2">
          <div className="flex items-center gap-3 print:gap-2">
            <img src={crestLogo} alt="Crest Pest Control" className="h-14 print:h-10" />
            <h1 className="text-3xl print:text-2xl font-bold text-foreground">
              Property Map & Details — {proposalName}
            </h1>
          </div>
          <div className="flex items-center gap-3">
            {isDuplicate && !isReadOnly && dupeIndex !== undefined && (
              <div className="flex items-center gap-2">
                {(customMapImage || mapUrl || mapData) && (
                  <Button variant="outline" size="sm" className="no-print" onClick={() => {
                    if (dupeIndex === undefined) return;
                    // Copy Option A's map (image + emblems/annotations) into this option's map page
                    if (customMapImage) {
                      setDuplicateCustomMapImages(prev => ({ ...prev, [dupeIndex]: customMapImage }));
                    }
                    if (mapData) {
                      setDuplicateMapData(prev => ({ ...prev, [dupeIndex]: mapData }));
                    }
                    if (renderedMapImage) {
                      setDuplicateRenderedMapImages(prev => ({ ...prev, [dupeIndex]: renderedMapImage }));
                      duplicateRenderedMapImagesRef.current = { ...duplicateRenderedMapImagesRef.current, [dupeIndex]: renderedMapImage };
                    }
                    toast.success(`Option A map copied to ${proposalName}`);
                  }}>
                    <Copy className="w-3 h-3 mr-1" /> Copy Option A Map
                  </Button>
                )}
                {dupeIndex < duplicatedPages.length && (
                  <Button variant="destructive" size="sm" className="no-print" onClick={() => removeDuplicatedPage(dupeIndex)}>
                    <X className="w-3 h-3 mr-1" /> Remove
                  </Button>
                )}
              </div>
            )}
            {!isDuplicate && !isReadOnly && (
              <Button variant="outline" size="sm" className="no-print" onClick={handleDuplicatePage2}>
                <Copy className="w-3 h-3 mr-1" /> Add Extra Map Page
              </Button>
            )}
          </div>
        </div>

        {/* Map and Right Panel Side by Side */}
        <div className="flex flex-col lg:grid lg:grid-cols-[40%_60%] gap-4 print:grid print:grid-cols-[40%_60%] print:gap-4 print:px-0 print:items-start print:justify-center print:mt-1 print:flex-1">
          {/* Map Section */}
          <div className="flex flex-col min-h-0 print:mt-0">
            {(() => {
              const pageMapImage = isDuplicate ? (duplicateCustomMapImages[dupeIndex ?? 0] || customMapImage) : customMapImage;
              const hasMap = mapUrl || pageMapImage;
              return (
              <div 
                className="w-[400px] h-[533px] print:w-full print:h-auto print:aspect-[3/4] mx-auto relative rounded-xl overflow-hidden border-2 border-border print:max-h-none"
                onPaste={(e) => handleMapPasteForPage(e, isDuplicate, dupeIndex)}
                tabIndex={0}
              >
                {isProcessing && !isDuplicate && (
                  <div className="no-print absolute inset-0 bg-background/80 flex items-center justify-center z-10">
                    <div className="text-center">
                      <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto mb-4" />
                      <p className="text-foreground font-semibold">Processing Map...</p>
                    </div>
                  </div>
                )}
                {hasMap ? (
                  <div className="relative h-full w-full">
                    {pdfExportMode && (currentRenderedMap || (isDuplicate && renderedMapImage)) ? (
                      <img src={currentRenderedMap || renderedMapImage || ''} alt="Property map with annotations" className="w-full h-full object-cover" />
                    ) : (
                      <MapCanvas
                        key={isDuplicate ? `dupe-${dupeIndex}-${pageMapImage || mapUrl}` : (pageMapImage ? `custom-${pageMapImage}` : `map-${mapUrl}`)}
                        mapUrl={pageMapImage || mapUrl}
                        onSave={handleDupeMapSave}
                        onExportImage={handleDupeMapExport}
                        initialData={currentMapData}
                        exportId={isDuplicate ? `duplicate-${dupeIndex}` : "main"}
                        showToolbar={activeMapId === (isDuplicate ? `dupe-${dupeIndex}` : "main")}
                      />
                    )}
                    {!isReadOnly && (
                      <>
                        {(isDuplicate || duplicateMapPageCount > 0) && (
                          <div className="no-print absolute top-4 left-4 z-20">
                            {activeMapId === (isDuplicate ? `dupe-${dupeIndex}` : "main") ? (
                              <Button size="sm" variant="default" type="button" className="bg-green-600 hover:bg-green-700">
                                <Check className="w-4 h-4 mr-2" /> Editing This Map
                              </Button>
                            ) : (
                              <Button size="sm" variant="secondary" type="button" onClick={() => {
                                const mapId = isDuplicate ? `dupe-${dupeIndex}` : "main";
                                setActiveMapId(mapId);
                                const mapContainer = document.querySelector(`[data-pdf-page="${isDuplicate ? `2-dupe-${dupeIndex}` : "2"}"] canvas`);
                                if (mapContainer) {
                                  mapContainer.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                }
                              }}>
                                <Edit className="w-4 h-4 mr-2" /> Edit Map
                              </Button>
                            )}
                          </div>
                        )}
                        <div className="no-print absolute top-4 right-4 z-20">
                          <div className="relative inline-flex">
                            <Button size="sm" variant="secondary" type="button">
                              <FileDown className="w-4 h-4 mr-2" /> Upload Map
                            </Button>
                            <input
                              type="file"
                              accept="image/*"
                              onClick={(e) => { (e.currentTarget as HTMLInputElement).value = ""; }}
                              onChange={(e) => handleMapUploadForPage(e, isDuplicate, dupeIndex)}
                              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                            />
                          </div>
                        </div>
                      </>
                    )}
                    {coordinates && !pageMapImage && !isDuplicate && (
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
                        <div className="flex flex-col gap-2 justify-center">
                          <Button size="icon" variant="secondary" onClick={handleZoomIn} title="Zoom in">
                            <Plus className="w-4 h-4" />
                          </Button>
                          <Button size="icon" variant="secondary" onClick={handleZoomOut} title="Zoom out">
                            <Minus className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center bg-muted/30 cursor-pointer" onClick={() => {
                    if (isReadOnly) return;
                    const input = document.createElement('input');
                    input.type = 'file';
                    input.accept = 'image/*';
                    input.onchange = (ev) => handleMapUploadForPage(ev as any, isDuplicate, dupeIndex);
                    input.click();
                  }}>
                    <FileDown className="w-10 h-10 text-muted-foreground/50 mb-3" />
                    <p className="text-muted-foreground font-medium text-sm text-center px-4">
                      Click to upload or paste a map image
                    </p>
                    <p className="text-muted-foreground/60 text-xs mt-1">
                      Copy an image and click here, then Ctrl+V
                    </p>
                  </div>
                )}
              </div>
              );
            })()}
          </div>

          {/* Right Column - Pricing + Proposed Services + Additional Details + Setup Materials */}
          <div className="flex flex-col gap-4 print:gap-3">
            {/* Mini Pricing Table for this proposal */}
            {proposals[proposalIndex] && (
              <Card className="print-section p-0 overflow-hidden print:overflow-visible rounded-xl border-2 border-foreground/60">
                <div className="print-section-header py-2 px-3.5 print:px-3 rounded-t-xl">
                  <span className="text-base print:text-sm font-bold uppercase">
                    Pricing — {proposalName}
                  </span>
                </div>
                <div className="p-2 print:p-1.5">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-xs font-bold uppercase">
                        <th className="text-left px-2 py-1">Service</th>
                        <th className="text-center px-2 py-1">Initial</th>
                        <th className="text-center px-2 py-1">{getRecurringLabel(proposals[proposalIndex].services)}</th>
                        <th className="text-center px-2 py-1">Frequency</th>
                      </tr>
                    </thead>
                    <tbody>
                      {proposals[proposalIndex].services.filter(s => s.serviceType).map((service, idx) => (
                        <tr key={idx} className="border-b border-border/50">
                          <td className="px-2 py-1 text-xs font-medium">{service.serviceType}</td>
                          <td className="px-2 py-1 text-xs text-center">${service.initialPrice || "0"}</td>
                          <td className="px-2 py-1 text-xs text-center">${service.recurringPrice || "0"}</td>
                          <td className="px-2 py-1 text-xs text-center">
                            {FREQUENCY_OPTIONS.find(o => o.days === service.frequency)?.label || "One-time"}
                          </td>
                        </tr>
                      ))}
                      <tr className="border-t-2 border-foreground/30">
                        <td className="px-2 py-1 text-xs font-bold text-right">Total:</td>
                        <td className="px-2 py-1 text-xs text-center font-bold">
                          ${Math.round(proposals[proposalIndex].services.reduce((sum, s) => sum + (parseFloat(s.initialPrice) || 0), 0)).toLocaleString()}
                        </td>
                        <td className="px-2 py-1 text-xs text-center font-bold">
                          ${Math.round(proposals[proposalIndex].services.reduce((sum, s) => sum + (parseFloat(s.recurringPrice) || 0), 0)).toLocaleString()}
                        </td>
                        <td></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </Card>
            )}

            {/* Proposed Services */}
            <Card data-pdf-section="proposed-services" className="print-section p-0 flex flex-col overflow-hidden print:overflow-visible rounded-xl">
              <div className="print-section-header py-2.5 px-3.5 print:px-3 rounded-t-xl">
                <span className="text-lg print:text-base font-bold uppercase">
                  Proposed Services — {proposalName}
                </span>
              </div>
              <div className="p-4 print:p-2.5 flex-1 flex flex-col">
                {isAnalyzing ? (
                  <div className="text-center py-2">
                    <Loader2 className="w-5 h-5 animate-spin text-primary mx-auto mb-1" />
                    <p className="text-xs text-muted-foreground">Analyzing...</p>
                  </div>
                ) : (
                  <>
                    <div className="no-print flex-1 flex flex-col space-y-1">
                      <RichTextEditor
                        value={isDuplicate ? (proposalFindings[proposalIndex] ?? servicesContent) : (editableFindings[0] || "")}
                        onChange={(newValue) => {
                          if (isDuplicate) {
                            setProposalFindings(prev => ({ ...prev, [proposalIndex]: newValue }));
                          } else {
                            findingsEditedRef.current = true;
                            setUserEditedFindings(true);
                            updateItem(0, newValue, setEditableFindings);
                            setProposalFindings(prev => ({ ...prev, [0]: newValue }));
                          }
                          pendingAutoSaveRef.current = true;
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
                      dangerouslySetInnerHTML={{ __html: formatProposedServices(stripRodentGuaranteeFromHtml(servicesContent)) }}
                    />
                  </>
                )}
              </div>
            </Card>
            {proposals[proposalIndex] && (
              <div data-pdf-section="guarantee-boxes">
                <GuaranteeBoxesEditor
                  boxes={proposalGuaranteeBoxes[proposalIndex] ?? []}
                  onChange={(next) => {
                    setProposalGuaranteeBoxes((prev) => ({ ...prev, [proposalIndex]: next }));
                    pendingAutoSaveRef.current = true;
                  }}
                  showRodentDefaultButton={hasRodentGuaranteeService(
                    proposals[proposalIndex].services.map((s) => s.serviceType),
                  )}
                />
              </div>
            )}

            {/* Target Pests — per option (compact) */}
            <Card data-pdf-section="target-pests" className="print-section p-0 overflow-hidden print:overflow-visible rounded-xl">
              <div className="print-section-header py-2 px-3.5 print:px-3 rounded-t-xl">
                <span className="text-base print:text-sm font-bold uppercase">
                  Target Pests — {proposalName}
                </span>
              </div>
              <div className="p-2.5 print:p-2">
                {(() => {
                  const pests = getProposalTargetPests(proposalIndex);
                  return (
                    <>
                      <div className="flex flex-wrap gap-1.5">
                        {pests.length === 0 && (
                          <span className="text-xs text-muted-foreground italic">No target pests</span>
                        )}
                        {pests.map((pest, pestIdx) => (
                          <span
                            key={`${pest}-${pestIdx}`}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted text-foreground text-xs print:text-[11px] border border-border group"
                          >
                            {pest}
                            {!isReadOnly && (
                              <button
                                type="button"
                                onClick={() => {
                                  setProposalTargetPests(prev => ({
                                    ...prev,
                                    [proposalIndex]: pests.filter((_, i) => i !== pestIdx),
                                  }));
                                  setProposalTargetPestsEdited(prev => ({ ...prev, [proposalIndex]: true }));
                                  pendingAutoSaveRef.current = true;
                                }}
                                className="text-destructive opacity-0 group-hover:opacity-100 transition-opacity no-print"
                                aria-label={`Remove ${pest}`}
                              >
                                <X className="w-3 h-3" />
                              </button>
                            )}
                          </span>
                        ))}
                      </div>
                      {!isReadOnly && (
                        <div className="no-print mt-2 flex flex-wrap gap-1">
                          {PEST_OPTIONS.filter(p => p !== "Other" && !pests.includes(p)).map(p => (
                            <button
                              key={p}
                              type="button"
                              onClick={() => {
                                setProposalTargetPests(prev => ({
                                  ...prev,
                                  [proposalIndex]: [...(prev[proposalIndex] ?? pests), p],
                                }));
                                setProposalTargetPestsEdited(prev => ({ ...prev, [proposalIndex]: true }));
                                pendingAutoSaveRef.current = true;
                              }}
                              className="px-2 py-0.5 rounded text-[10px] bg-muted/60 text-muted-foreground hover:bg-muted transition-colors"
                            >
                              + {p}
                            </button>
                          ))}
                          {proposalTargetPestsEdited[proposalIndex] && (
                            <button
                              type="button"
                              onClick={() => {
                                setProposalTargetPestsEdited(prev => ({ ...prev, [proposalIndex]: false }));
                                setProposalTargetPests(prev => ({
                                  ...prev,
                                  [proposalIndex]: computeTargetPestsForProposal(proposalIndex),
                                }));
                                pendingAutoSaveRef.current = true;
                              }}
                              className="px-2 py-0.5 rounded text-[10px] bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors"
                            >
                              ↺ Reset to defaults
                            </button>
                          )}
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            </Card>

            {/* Additional Details — per option */}
            <Card data-pdf-section="additional-details" className="print-section p-0 overflow-hidden print:overflow-visible rounded-xl flex flex-col">
              <div className="print-section-header py-2.5 px-3.5 rounded-t-xl">
                <span className="text-lg print:text-base font-bold uppercase">Additional Details</span>
              </div>
              <div className="additional-details-body p-4 print:p-2.5 flex-1 flex flex-col">
                {(() => {
                  const detailsValue = proposalAdditionalDetails[proposalIndex] ?? (proposalIndex === 0 ? additionalDetails : "");
                  return (
                    <>
                      <div className="no-print flex-1 flex flex-col">
                        <RichTextEditor
                          value={detailsValue}
                          onChange={(v) => {
                            setProposalAdditionalDetails(prev => ({ ...prev, [proposalIndex]: v }));
                            if (proposalIndex === 0) setAdditionalDetails(v);
                            pendingAutoSaveRef.current = true;
                          }}
                          placeholder="• Enter any additional details, notes, or observations..."
                          fontSize={additionalDetailsFontSize}
                          onFontSizeChange={setAdditionalDetailsFontSize}
                          className="additional-details-editor flex-1 min-h-[80px] print:min-h-0"
                        />
                      </div>
                      <div
                        className="hidden print-content-formatted"
                        style={{ fontSize: `${additionalDetailsFontSize}px` }}
                        dangerouslySetInnerHTML={{ __html: formatProposedServices(detailsValue || "") }}
                      />
                    </>
                  );
                })()}
              </div>
            </Card>

            {/* Setup Materials — per option */}
            <Card data-pdf-section="setup-materials" className="print-section p-0 overflow-hidden print:overflow-visible rounded-xl">
              <div className="print-section-header py-2.5 px-3.5 rounded-t-xl">
                <span className="text-lg print:text-base font-bold uppercase">Setup Materials</span>
              </div>
              <div className="p-4 print:p-2.5">
                {(() => {
                  const optionMaterials = getProposalSetupMaterials(proposalIndex);
                  return (
                    <>
                      {optionMaterials.length > 0 && (
                        <div className="space-y-1 mb-2">
                          {optionMaterials.map((mat, index) => (
                            <div key={index} className="flex items-center justify-between text-base group">
                              <span className="text-foreground">{mat.name} <span className="font-semibold">×{mat.quantity}</span></span>
                              {!isReadOnly && (
                                <button type="button" onClick={() => { removeSetupMaterial(proposalIndex, index); pendingAutoSaveRef.current = true; }}
                                  className="text-destructive opacity-0 group-hover:opacity-100 transition-opacity no-print">
                                  <X className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                      {!isReadOnly && (
                        <div className="no-print space-y-1.5">
                          <div className="flex flex-wrap gap-1">
                            {SETUP_MATERIAL_PRESETS.filter(
                              (preset) => !optionMaterials.some((m) => m.name === preset)
                            ).map((preset) => (
                              <button key={preset} type="button"
                                onClick={() => { const qty = prompt(`How many ${preset}?`, "1"); if (qty) { addSetupMaterial(proposalIndex, preset, qty); pendingAutoSaveRef.current = true; } }}
                                className="px-2 py-0.5 rounded text-[10px] bg-muted text-muted-foreground hover:bg-muted/80 transition-colors">
                                + {preset}
                              </button>
                            ))}
                          </div>
                          <div className="flex gap-1">
                            <Input value={newMaterialName} onChange={(e) => setNewMaterialName(e.target.value)} placeholder="Custom item" className="h-5 text-[10px] flex-1" />
                            <Input value={newMaterialQty} onChange={(e) => setNewMaterialQty(e.target.value)} placeholder="Qty" className="h-5 text-[10px] w-12" />
                            <Button type="button" size="sm" variant="outline" className="h-5 px-1.5 text-[10px]"
                              onClick={() => { addSetupMaterial(proposalIndex, newMaterialName, newMaterialQty); setNewMaterialName(""); setNewMaterialQty(""); pendingAutoSaveRef.current = true; }}>
                              <Plus className="w-3 h-3" />
                            </Button>
                          </div>
                        </div>
                      )}
                      {optionMaterials.length === 0 && isReadOnly && (
                        <p className="text-xs text-muted-foreground italic">No setup materials listed</p>
                      )}
                    </>
                  );
                })()}
              </div>
            </Card>

            {/* Limitations & Exclusions — per option */}
            {(() => {
              const optionExclusions = proposalSelectedExclusions[proposalIndex] ?? [];
              const toggle = (label: string) => {
                setProposalSelectedExclusions((prev) => {
                  const current = prev[proposalIndex] ?? [];
                  const next = current.includes(label)
                    ? current.filter((l) => l !== label)
                    : [...current, label];
                  return { ...prev, [proposalIndex]: next };
                });
                pendingAutoSaveRef.current = true;
              };
              if (isReadOnly && optionExclusions.length === 0 && !limitationsText) return null;
              return (
                <Card data-pdf-section="limitations" className="print-section p-0 overflow-hidden print:overflow-visible rounded-xl">
                  <div className="print-section-header py-2.5 px-3.5 rounded-t-xl">
                    <span className="text-lg print:text-base font-bold uppercase">Limitations & Exclusions</span>
                  </div>
                  <div className="p-4 print:p-2.5">
                    {!isReadOnly && (
                      <div className="no-print mb-2">
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button type="button" variant="outline" size="sm" className="h-7 text-xs justify-between w-full">
                              <span className="truncate">
                                {optionExclusions.length === 0
                                  ? "Select preset exclusions..."
                                  : `${optionExclusions.length} selected`}
                              </span>
                              <ChevronDown className="w-3 h-3 ml-1 shrink-0" />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-[320px] p-1 bg-popover z-50" align="start">
                            <div className="max-h-72 overflow-auto">
                              {EXCLUSION_PRESETS.map((preset) => {
                                const checked = optionExclusions.includes(preset.label);
                                return (
                                  <button
                                    key={preset.label}
                                    type="button"
                                    onClick={() => toggle(preset.label)}
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

                    {optionExclusions.length > 0 && (
                      <div className="space-y-1">
                        {EXCLUSION_PRESETS.filter((p) => optionExclusions.includes(p.label)).map((p) => (
                          <p key={p.label} className="text-xs print:text-[11px] leading-snug text-foreground">
                            {p.text}
                          </p>
                        ))}
                      </div>
                    )}

                    {optionExclusions.length === 0 && isReadOnly && (
                      <p className="text-xs text-muted-foreground italic">No exclusions listed</p>
                    )}
                  </div>
                </Card>
              );
            })()}

            {/* Invoice cadence note (only when option includes weekly / bi-weekly services) */}
            {(() => {
              const invoiceNote = getInvoiceNoteForProposal(proposalIndex);
              if (!invoiceNote) return null;
              return (
                <div className="border border-border rounded-md px-3 py-2 text-center bg-muted/30 text-xs print:text-[11px] text-foreground italic">
                  {invoiceNote}
                </div>
              );
            })()}

            {/* Customer Signature — per-proposal */}
            {(() => {
              const sigData = perProposalSignatures[proposalIndex] ?? null;
              const optionLetter = String.fromCharCode(65 + proposalIndex);
              const sigLabel = proposals[proposalIndex]?.name?.trim() || `Option ${optionLetter}`;
              return (
                <Card className="print-section p-0 overflow-hidden print:overflow-visible rounded-xl">
                  <div className="print-section-header py-2.5 px-3.5 print:px-3 rounded-t-xl">
                    <span className="text-base print:text-sm font-bold uppercase">
                      Sign for {sigLabel}
                    </span>
                  </div>
                  <div className="p-3 print:p-2 flex items-center gap-2.5 print:gap-2">
                    <img src={crestBugBlack} alt="" className="h-10 print:h-12 w-auto shrink-0" />
                    <div className="flex-1 flex flex-col">
                      <div className="h-[38px] print:h-[42px] relative">
                        {sigData ? (
                          <div className="h-full flex items-center gap-2">
                            <div className="flex-1 flex items-center justify-center border rounded bg-muted/30 h-full">
                              <img src={sigData} alt={`Signature for ${sigLabel}`} className="max-h-[34px] print:max-h-[38px] w-auto object-contain" />
                            </div>
                            {!isReadOnly && (
                              <div className="flex gap-1 no-print shrink-0">
                                <Button variant="outline" size="sm" onClick={() => {
                                  setPerProposalSignatures(prev => ({ ...prev, [proposalIndex]: null }));
                                  pendingAutoSaveRef.current = true;
                                }} className="h-7 text-xs">Re-sign</Button>
                                <Button variant="outline" size="sm" onClick={() => {
                                  setPerProposalSignatures(prev => ({ ...prev, [proposalIndex]: null }));
                                  pendingAutoSaveRef.current = true;
                                }} className="h-7 text-xs text-destructive hover:text-destructive">
                                  <X className="w-3 h-3 mr-1" /> Delete
                                </Button>
                              </div>
                            )}
                            {isReadOnly && (
                              <div className="flex gap-1 no-print shrink-0">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => requestClearSignature(proposalIndex)}
                                  className="h-7 text-xs text-destructive hover:text-destructive"
                                  title="Clear this signature (admin password required)"
                                >
                                  <X className="w-3 h-3 mr-1" /> Clear
                                </Button>
                              </div>
                            )}
                          </div>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                setModalSignatureDraft(null);
                                setSignatureModalIndex(proposalIndex);
                              }}
                              className="no-print w-full h-full border-2 border-dashed border-muted-foreground/40 rounded bg-muted/20 hover:bg-muted/40 transition flex items-center justify-center text-xs font-medium text-muted-foreground"
                            >
                              ✍️ Tap to Sign {sigLabel}
                            </button>
                            {isSavingSignature && (
                              <div className="absolute inset-0 bg-background/60 flex items-center justify-center rounded">
                                <Loader2 className="w-4 h-4 animate-spin text-primary" />
                              </div>
                            )}
                          </>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs print:text-[10px] pt-1 border-t border-border">
                        <div className="flex-1 flex items-center gap-1">
                          <span className="font-medium text-foreground whitespace-nowrap">Print:</span>
                          <span className="text-muted-foreground text-xs">{editableCustomer || "—"}</span>
                        </div>
                        <div className="text-muted-foreground whitespace-nowrap">
                          <span className="font-medium text-foreground">Date:</span> {new Date().toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                  </div>
                </Card>
              );
            })()}
          </div>
        </div>
      </div>
    </div>
    );
  };

  const duplicateMapPageCount = Math.max(duplicatedPages.length, Math.max(proposals.length - 1, 0));

  return (
    <div className="min-h-screen bg-background">
      {/* Read-only banner */}
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

      {/* Video Page - FIRST if video exists */}
      {videoUrl && (
        <div data-pdf-page="video" className="print-page-break bg-background no-pdf-export">
          <div className="p-4 max-w-[1800px] mx-auto">
            <div className="page2-header flex items-center justify-between mb-4 pb-2 border-b-2 border-border bg-primary/30 rounded-md px-4 py-2">
              <div className="flex items-center gap-3">
                <img src={crestLogo} alt="Crest Pest Control" className="h-12 print:h-8" />
                <h1 className="text-xl print:text-lg font-bold text-foreground">Property Video</h1>
              </div>
              {!isReadOnly && (
                <Button variant="destructive" size="sm" className="no-print" onClick={() => setVideoUrl(null)}>
                  <X className="w-3 h-3 mr-1" /> Remove Video
                </Button>
              )}
            </div>
            <div className="max-w-3xl mx-auto relative group">
              <video
                id="property-video-1"
                src={videoUrl}
                controls
                className="w-full rounded-lg border-2 border-border relative"
                poster={`data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='1920' height='1080'><rect width='1920' height='1080' fill='#C3D1C5'/></svg>`)}`}
                onPlay={(e) => { const overlay = (e.target as HTMLElement).parentElement?.querySelector('[data-video-overlay]') as HTMLElement; if (overlay) overlay.style.display = 'none'; }}
                onPause={(e) => { const overlay = (e.target as HTMLElement).parentElement?.querySelector('[data-video-overlay]') as HTMLElement; if (overlay) overlay.style.display = ''; }}
              />
              <div data-video-overlay className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none rounded-lg z-20" style={{ background: 'linear-gradient(135deg, #C3D1C5 0%, #a8b8aa 100%)' }}>
                <img src={crestLogoVideo} alt="Crest Pest Control" className="h-20 w-auto mb-4" />
                <p className="text-2xl font-bold text-foreground tracking-wide">Video Report</p>
                <p className="text-sm text-muted-foreground mt-2">Click to play</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
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
              {(() => {
                const flat = proposals.flatMap((p) => p.services || []);
                // Inline check (mirrors salesReportHasRodentExclusion) to avoid a top-level import churn.
                const has = flat.some((s: any) => {
                  const t = String(s?.serviceType || "").trim().toLowerCase();
                  return t === "rodent exclusion" || t === "rodent trapping & exclusion" || t === "rodent trapping and exclusion";
                });
                if (!has || !reportId) return null;
                return (
                  <Button
                    onClick={async () => {
                      try {
                        const mod = await import("@/lib/rodentExclusionAutoCreate");
                        const res = await mod.ensureRodentExclusionReport({
                          id: reportId,
                          technician_name: editableTech,
                          customer_name: editableCustomer,
                          customer_email: customerEmail || null,
                          customer_phone: customerPhone || null,
                          address: editableAddress,
                          service_date: editableServiceDate,
                          license_number: editableLicenseNumber,
                          map_data: mapData ? JSON.parse(mapData) : null,
                          custom_map_url: customMapImage,
                          rendered_map_url: renderedMapImage,
                          fieldroutes_customer_id: fieldroutesCustomerId,
                          services: flat,
                          property_images: propertyImages,
                        });
                        if (!res) { toast.error("Could not create Rodent Exclusion Report"); return; }
                        toast.success(res.created ? "Rodent Exclusion Report created" : "Opening existing Rodent Exclusion Report");
                        navigate(mod.rodentExclusionUrl(res.reportId));
                      } catch (e) {
                        console.error(e);
                        toast.error("Failed to create Rodent Exclusion Report");
                      }
                    }}
                    variant="secondary"
                    size="sm"
                    title="Create a Rodent Exclusion service report from this proposal"
                  >
                    <Plus className="w-3 h-3 mr-1" />
                    <span className="hidden sm:inline">Rodent Exclusion Report</span>
                  </Button>
                );
              })()}
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
                  <DropdownMenuItem onClick={() => exportToPDF("short")}>Normal PDF</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => exportToPDF("full")}>Full Proposal PDF</DropdownMenuItem>
                  {!!localStorage.getItem("admin_session") && (
                    <DropdownMenuItem onClick={() => sendReportToFieldRoutes()}>Send to FieldRoutes…</DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
              <Button onClick={() => navigate("/")} variant="outline" size="sm">
                <Home className="w-3 h-3" />
              </Button>
            </div>
          </div>

          {/* FieldRoutes customer link — search & select to autofill + link */}
          {!isReadOnly && (
            <div className="mb-4 no-print space-y-2">
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

          {/* Customer Portal button — prominent at the top of the report header.
              Only shown when the FieldRoutes {loginlink} for the linked customer
              is known, so the button always logs the customer straight in. */}
          {fieldroutesLoginLink && (
            <div className="mb-4">
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

          {/* Info grid */}
          <div className="grid grid-cols-2 print:grid-cols-3 gap-x-6 gap-y-1 print:gap-x-4 print:gap-y-0">
            {/* Column 1: Customer Details */}
            <div>
              <p className="font-semibold text-foreground text-base mb-0.5 print:text-sm">Customer Details:</p>
              <div className="space-y-0.5 text-base">
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground w-16">Name:</span>
                  {isReadOnly ? (
                    <span className="text-foreground font-medium">{editableCustomer || "—"}</span>
                  ) : (
                    <>
                      <Input value={editableCustomer} onChange={(e) => setEditableCustomer(e.target.value)}
                        placeholder="Customer name"
                        className="bg-transparent border-b border-border text-foreground placeholder:text-muted-foreground px-1 h-6 text-xs flex-1 min-w-0 focus-visible:ring-0 no-print" />
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
                      <Input value={editableAddress || extractedAddress} onChange={(e) => setEditableAddress(e.target.value)}
                        placeholder="Enter address"
                        className="bg-transparent border-b border-border text-foreground placeholder:text-muted-foreground px-1 h-6 text-xs flex-1 min-w-0 focus-visible:ring-0 no-print" />
                      <span className="print-only-text hidden text-foreground font-medium">{editableAddress || extractedAddress || "—"}</span>
                    </>
                  )}
                </div>
                {!isReadOnly && (
                  <div className="flex items-center gap-2 print:hidden">
                    <span className="text-muted-foreground w-16">Email:</span>
                    <Input type="email" value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)}
                      placeholder="customer@email.com"
                      className="bg-transparent border-b border-border text-foreground placeholder:text-muted-foreground px-1 h-6 text-xs flex-1 min-w-0 focus-visible:ring-0 no-print" />
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground w-16">FR ID:</span>
                  {isReadOnly ? (
                    <span className="text-foreground font-medium">{fieldroutesCustomerId || "—"}</span>
                  ) : (
                    <>
                      <Input
                        value={fieldroutesCustomerId ?? ""}
                        onChange={(e) => {
                          const v = e.target.value.replace(/[^0-9]/g, "");
                          setFieldroutesCustomerId(v ? v : null);
                        }}
                        placeholder="FieldRoutes customer ID"
                        inputMode="numeric"
                        className="bg-transparent border-b border-border text-foreground placeholder:text-muted-foreground px-1 h-6 text-xs flex-1 min-w-0 focus-visible:ring-0 no-print"
                      />
                      <span className="print-only-text hidden text-foreground font-medium">{fieldroutesCustomerId || "—"}</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Column 2: Property Info (print only) */}
            <div className="hidden print:block">
              <p className="font-semibold text-foreground text-base mb-0.5 print:text-sm">Property Info:</p>
              <div className="space-y-0.5 text-base">
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

            {/* On screen: Date/Type/Company */}
            <div className="print:hidden col-span-1 -mt-0.5">
              <div className="space-y-0.5 text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground w-16">Date:</span>
                  {isReadOnly ? (
                    <span className="text-foreground font-medium">{editableServiceDate || "—"}</span>
                  ) : (
                    <Input type="date" value={editableServiceDate} onChange={(e) => setEditableServiceDate(e.target.value)}
                      className="bg-transparent border-b border-border text-foreground px-1 h-6 text-xs w-32 focus-visible:ring-0" />
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground w-16">Type:</span>
                  {isReadOnly ? (
                    <span className="text-foreground font-medium">{propertyType || "—"}</span>
                  ) : (
                    <Select
                      value={propertyType}
                      onValueChange={(value) => {
                        setPropertyType(value);
                        if (value === "Multi-Family - Apartment Complex") {
                          // Auto-fill Option A pricing table with Commercial General Pest + Rodent Bait Boxes (weekly)
                          const gpConfig = SERVICE_CONFIG["Commercial General Pest"];
                          const baitConfig = SERVICE_CONFIG["Rodent Bait Boxes"];
                          setProposals((prev) => {
                            const updated = [...prev];
                            const optionA = updated[0] ?? { name: "Option A", services: [] };
                            updated[0] = {
                              ...optionA,
                              name: optionA.name || "Option A",
                              services: [
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
                              ],
                            };
                            return updated;
                          });
                          // Pre-fill Option A's proposed services with the apartment-complex template
                          setProposalFindings((prev) => ({ ...prev, 0: APARTMENT_COMPLEX_PROPOSED_SERVICES }));
                          setEditableFindings((prev) => {
                            const next = [...prev];
                            next[0] = APARTMENT_COMPLEX_PROPOSED_SERVICES;
                            return next;
                          });
                          // Prevent the auto-populate effect from appending the default
                          // Commercial General Pest / Rodent Bait Boxes service descriptions
                          addedServiceTypesRef.current.add("Commercial General Pest");
                          addedServiceTypesRef.current.add("Rodent Bait Boxes");
                        }
                      }}
                    >
                      <SelectTrigger className="bg-transparent border-b border-border text-foreground h-7 text-xs flex-1 min-w-0 focus:ring-0 [&>svg]:h-3 [&>svg]:w-3">
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent>
                        {PROPERTY_TYPES.map((type) => (
                          <SelectItem key={type} value={type} className="text-xs">{type}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
                {propertyType !== "Residential" && (
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground w-16">Company:</span>
                    {isReadOnly ? (
                      <span className="text-foreground font-medium">{companyName || "—"}</span>
                    ) : (
                      <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Company name"
                        className="bg-transparent border-b border-border text-foreground placeholder:text-muted-foreground px-1 h-6 text-xs flex-1 min-w-0 focus-visible:ring-0" />
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Column 3: Technician Info */}
            <div>
              <p className="font-semibold text-foreground text-base mb-0.5 print:text-sm">Technician Information:</p>
              <div className="space-y-0.5 text-base">
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
                            <SelectItem key={tech.name} value={tech.name} className="text-xs">{tech.name} ({tech.license})</SelectItem>
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

      {/* PAGE 1 - Proposals + Products + Scheduling + Guarantee */}
      <div data-pdf-page="1" data-pdf-capture="1" className="p-2 pt-1.5 print:p-1 print:pt-0 max-w-[1800px] mx-auto">
        <div className="space-y-4 print:space-y-2">
          {/* Multiple Proposal Tables */}
          {proposals.map((proposal, index) => (
            <div key={index}>
              {index > 0 && (
                <div className="flex items-center gap-3 my-3 no-print">
                  <div className="flex-1 h-[2px] bg-gradient-to-r from-transparent via-primary/20 to-primary/30" />
                  <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">{proposal.name}</span>
                  <div className="flex-1 h-[2px] bg-gradient-to-l from-transparent via-primary/20 to-primary/30" />
                </div>
              )}
              {renderProposalTable(proposal, index)}
            </div>
          ))}

          {/* Add Proposal Button */}
          {proposals.length < 4 && !isReadOnly && (
            <Button type="button" variant="outline" size="sm" onClick={addProposal} className="no-print h-8 text-xs">
              <Plus className="w-3 h-3 mr-1" /> Add Proposal (up to 4)
            </Button>
          )}

          {/* Recommended Proposal Selector — editor only */}
          {proposals.length > 1 && !isReadOnly && (
            <div className="no-print flex items-center gap-3 p-2 bg-muted/50 rounded-lg border border-border">
              <Star className="h-5 w-5 text-primary fill-primary shrink-0" />
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Set Recommended:</span>
              <Select value={recommendedProposal.toString()} onValueChange={(v) => setRecommendedProposal(parseInt(v))}>
                <SelectTrigger className="h-8 w-56 bg-background text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {proposals.map((p, i) => (
                    <SelectItem key={i} value={i.toString()} className="text-xs">{p.name?.trim() || PROPOSAL_NAMES[i]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Scheduling + Products + Pesticide Notice in a row */}
          <div className={cn(
            "grid gap-1.5 print:gap-0.5",
            showSchedulingSection ? "grid-cols-[1fr_1fr_2fr]" : "grid-cols-[2fr_3fr]",
            showSchedulingSection ? "print:grid-cols-[1fr_1fr_2fr]" : "print:grid-cols-[2fr_3fr]",
          )}>
            {/* Scheduling & Communication */}
            {showSchedulingSection && (
              <Card data-pdf-section="scheduling" className="print-section p-0 overflow-hidden print:overflow-visible rounded-lg">
                <div className="print-section-header py-1.5 px-2.5 rounded-t-lg">
                  <span className="text-base print:text-sm font-bold uppercase">Scheduling & Communication</span>
                </div>
                <div className="p-2.5 print:p-1.5 space-y-1.5 print:space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground w-[110px] shrink-0">Preferred Day:</span>
                    {isReadOnly ? (
                      <span className="text-sm text-foreground">{preferredServiceDay || "—"}</span>
                    ) : (
                      <Input value={preferredServiceDay} onChange={(e) => setPreferredServiceDay(e.target.value)} placeholder="—"
                        className="h-6 text-xs flex-1 bg-transparent border-b border-border shadow-none focus-visible:ring-0" />
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground w-[110px] shrink-0">Preferred Time:</span>
                    {isReadOnly ? (
                      <span className="text-sm text-foreground">{preferredServiceTime || "—"}</span>
                    ) : (
                      <Input value={preferredServiceTime} onChange={(e) => setPreferredServiceTime(e.target.value)} placeholder="—"
                        className="h-6 text-xs flex-1 bg-transparent border-b border-border shadow-none focus-visible:ring-0" />
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground w-[110px] shrink-0">Point of Contact:</span>
                    {isReadOnly ? (
                      <span className="text-sm text-foreground">{mainPointOfContact || "—"}</span>
                    ) : (
                      <Input value={mainPointOfContact} onChange={(e) => setMainPointOfContact(e.target.value)} placeholder="—"
                        className="h-6 text-xs flex-1 bg-transparent border-b border-border shadow-none focus-visible:ring-0" />
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground w-[110px] shrink-0">Phone #:</span>
                    {isReadOnly ? (
                      <span className="text-sm text-foreground">{contactPhone || "—"}</span>
                    ) : (
                      <Input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} placeholder="—"
                        className="h-6 text-xs flex-1 bg-transparent border-b border-border shadow-none focus-visible:ring-0" />
                    )}
                  </div>
                </div>
              </Card>
            )}

            {/* Products */}
            <Card className="print-section p-0 overflow-hidden print:overflow-visible rounded-lg">
              <div className="print-section-header py-1.5 px-2.5 print:px-2 rounded-t-lg">
                <span className="text-base print:text-sm font-bold uppercase">Products</span>
              </div>
              <div className="p-2.5 print:p-1.5">
                <div className="text-[11px] leading-snug text-foreground columns-2 gap-2">
                  {displayedProducts.map((product, index) => (
                    <div key={index} className="flex items-center gap-1 group">
                      <p className="flex-1">
                        {product.name}{product.chemical ? ` (${product.chemical})` : ""}
                      </p>
                      <button type="button" onClick={() => setDisplayedProducts(prev => prev.filter((_, i) => i !== index))}
                        className="no-print opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive/80 transition-opacity">
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="no-print mt-2 pt-2 border-t border-border space-y-1">
                  <div className="flex gap-1">
                    <Input value={customProductName} onChange={(e) => setCustomProductName(e.target.value)} placeholder="Product name" className="h-6 text-xs flex-1" />
                    <Input value={customProductChemical} onChange={(e) => setCustomProductChemical(e.target.value)} placeholder="Chemical (optional)" className="h-6 text-xs flex-1" />
                    <Button type="button" size="sm" variant="outline" className="h-6 px-2"
                      onClick={() => {
                        if (customProductName.trim()) {
                          setDisplayedProducts(prev => [...prev, { name: customProductName.trim(), chemical: customProductChemical.trim() }]);
                          setCustomProductName(""); setCustomProductChemical("");
                        }
                      }}>
                      <Plus className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              </div>
            </Card>

            {/* Pesticide Notice */}
            <Card className="print-section p-0 overflow-hidden print:overflow-visible rounded-lg">
              <div className="print-section-header py-1.5 px-2.5 print:px-2 rounded-t-lg">
                <span className="text-base print:text-sm font-bold uppercase">Pesticide Notice</span>
              </div>
              <div className="p-1.5 print:p-1">
                <div className="text-[11px] leading-[1.35] text-foreground">
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

          {/* Crest Guarantee */}
          <div className="border border-border rounded-md px-4 py-3 text-center bg-muted/30 flex items-center justify-center gap-3">
            <img src={crestBugBlack} alt="" className="w-8 h-8 print:w-7 print:h-7 opacity-60 flex-shrink-0" />
            <p className="crest-guarantee-text text-base print:text-sm text-foreground leading-snug">
              <span className="font-bold">The Crest Guarantee:</span>{" "}
              If pests return, we will return at no charge. We don't lock you into a long-term contract. We want our service quality to keep you as a customer, not a contract.
            </p>
            <img src={crestBugBlack} alt="" className="w-8 h-8 print:w-7 print:h-7 opacity-60 flex-shrink-0" />
          </div>
          {proposals.some((p) => p.services.some((s) => s.frequency === 7 || s.frequency === 14 || s.frequency === 28)) && (
            <p className="text-[11px] print:text-[10px] italic text-muted-foreground text-center mt-1.5 leading-snug">
              * Scheduling and billing run on four-week cycles to help ensure consistency (e.g., the same day and time for each visit). Invoices are sent upon completion of each service.
            </p>
          )}
          <p className="text-[10px] print:text-[10px] italic text-muted-foreground text-center mt-1.5 leading-snug">
            Crest Pest Control is not liable for any structural or property damage caused by any pests or rodents.
          </p>
        </div>
      </div>

      {/* Page Separator */}
      <div className="no-print max-w-[1800px] mx-auto px-4">
        <div className="flex items-center gap-4 py-6">
          <div className="flex-1 h-px bg-gradient-to-r from-transparent via-border to-border" />
          <div className="flex items-center gap-2 bg-muted/50 border border-border rounded-full px-4 py-1.5">
            <img src={crestBugBlack} alt="" className="w-4 h-4 opacity-40" />
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Page 2 — {proposals[0]?.name || "Option A"}</span>
          </div>
          <div className="flex-1 h-px bg-gradient-to-l from-transparent via-border to-border" />
        </div>
      </div>

      {/* PAGE 2 - Map + Services/Details/Materials */}
      {renderMapSection(2)}

      {/* Proposal map pages after Option A */}
      {Array.from({ length: duplicateMapPageCount }, (_, dupeIndex) => (
        <div key={dupeIndex}>
          <div className="no-print max-w-[1800px] mx-auto px-4">
            <div className="flex items-center gap-4 py-6">
              <div className="flex-1 h-px bg-gradient-to-r from-transparent via-border to-border" />
              <div className="flex items-center gap-2 bg-muted/50 border border-border rounded-full px-4 py-1.5">
                <img src={crestBugBlack} alt="" className="w-4 h-4 opacity-40" />
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Page {3 + dupeIndex} — {proposals[dupeIndex + 1]?.name || `Option ${String.fromCharCode(66 + dupeIndex)}`}
                </span>
              </div>
              <div className="flex-1 h-px bg-gradient-to-l from-transparent via-border to-border" />
            </div>
          </div>
          {renderMapSection(3 + dupeIndex, true, dupeIndex)}
        </div>
      ))}

      {/* Page Separator for Media */}
      <div className="no-print max-w-[1800px] mx-auto px-4">
        <div className="flex items-center gap-4 py-6">
          <div className="flex-1 h-px bg-gradient-to-r from-transparent via-border to-border" />
          <div className="flex items-center gap-2 bg-muted/50 border border-border rounded-full px-4 py-1.5">
            <img src={crestBugBlack} alt="" className="w-4 h-4 opacity-40" />
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Property Images & Media</span>
          </div>
          <div className="flex-1 h-px bg-gradient-to-l from-transparent via-border to-border" />
        </div>
      </div>

      {/* Image/Video Upload Page */}
      <div 
        data-pdf-page="media"
        className="print-page-break bg-background print:flex print:flex-col print:justify-start print:min-h-[100vh]"
        onPaste={handlePropertyImagesPaste}
        tabIndex={0}
      >
        <div data-pdf-capture={(3 + duplicateMapPageCount).toString()} className="p-4 print:px-6 print:pb-6 print:pt-5 max-w-[1800px] mx-auto">
          {/* Page Header */}
          <div className="page2-header flex items-center justify-between mb-6 print:mb-5 pb-2 print:pb-2.5 border-b-2 border-border bg-primary/30 rounded-md px-4 py-2">
            <div className="flex items-center gap-3 print:gap-2">
              <img src={crestLogo} alt="Crest Pest Control" className="h-12 print:h-8" />
              <h1 className="text-2xl print:text-xl font-bold text-foreground">Property Images & Media</h1>
            </div>
          </div>

          {/* Video Upload (Top) */}
          {!videoUrl && !isReadOnly && (
            <div className="no-print mb-4 flex items-center gap-3">
              <div className="relative inline-flex">
                <Button variant="outline" size="sm" type="button">
                  <Video className="w-4 h-4 mr-2" />
                  Upload Video (Top)
                </Button>
                <input
                  type="file"
                  accept="video/*"
                  onClick={(e) => { (e.currentTarget as HTMLInputElement).value = ""; }}
                  onChange={(e) => handleVideoUpload(e, 1)}
                  className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                />
              </div>
              {uploadingVideo && <Loader2 className="w-4 h-4 animate-spin" />}
              <span className="text-xs text-muted-foreground">Appears on the first page of the proposal</span>
            </div>
          )}

          {/* Image Upload */}
          <div className="no-print mb-4 flex items-center gap-3">
            <div className="relative inline-flex">
              <Button variant="outline" size="sm" type="button">
                <FileDown className="w-4 h-4 mr-2" />
                Upload Images (up to 12)
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                onClick={(e) => { (e.currentTarget as HTMLInputElement).value = ""; }}
                onChange={handlePropertyImagesUpload}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              />
            </div>
            <span className="text-xs text-muted-foreground">or paste from clipboard (Ctrl+V / Cmd+V)</span>
          </div>

          {/* Property Images Grid */}
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
                        <img src={item.image} alt={`Property ${index + 1}`} className="w-full h-full object-cover pointer-events-none" />
                        <Button size="icon" variant="destructive"
                          className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity no-print"
                          onClick={(e) => {
                            e.stopPropagation();
                            setPropertyImages((prev) => prev.filter((_, i) => i !== index));
                            toast.info("Image removed");
                          }}>
                          <X className="w-3 h-3" />
                        </Button>
                        <Button size="sm" variant="secondary"
                          className="absolute bottom-1 right-1 h-6 px-2 text-[10px] no-print"
                          onClick={(e) => { e.stopPropagation(); setAnnotatingImageIndex(index); }}>
                          <Edit className="w-3 h-3 mr-1" /> Draw
                        </Button>
                      </>
                    )}
                  </div>
                  <Input value={item.caption || ""} onChange={(e) => updateImageCaption(index, e.target.value)} placeholder="Caption" className="no-print text-sm h-8" />
                  {item.caption && (
                    <p className="hidden print:block text-sm text-foreground font-medium mt-1 leading-tight">{item.caption}</p>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="no-images-placeholder h-[400px] flex items-center justify-center text-muted-foreground border-2 border-dashed border-border rounded-lg">
              <p className="text-lg text-center px-4">
                No images uploaded yet.
                <br />
                Click the button above to upload up to 12 images.
              </p>
            </div>
          )}

          {/* Bottom Videos — Upload Video (Bottom) + Client Portal Walkthrough.
              Both render at the VERY bottom of the proposal (below all photos). */}
          {!isReadOnly && (
            <div className="no-print mt-8 pt-6 border-t border-border flex flex-wrap items-center gap-3">
              {!portalVideoAttached ? (
                <Button
                  variant="outline"
                  size="sm"
                  type="button"
                  onClick={() => setPortalVideoAttached(true)}
                >
                  <Video className="w-4 h-4 mr-2" />
                  Attach Client Portal Walkthrough Video
                </Button>
              ) : (
                <Button
                  variant="destructive"
                  size="sm"
                  type="button"
                  onClick={() => setPortalVideoAttached(false)}
                >
                  <X className="w-4 h-4 mr-1" />
                  Remove Client Portal Walkthrough Video
                </Button>
              )}
              {!hoaVideoAttached ? (
                <Button
                  variant="outline"
                  size="sm"
                  type="button"
                  onClick={() => setHoaVideoAttached(true)}
                >
                  <Video className="w-4 h-4 mr-2" />
                  Attach HOA Video
                </Button>
              ) : (
                <Button
                  variant="destructive"
                  size="sm"
                  type="button"
                  onClick={() => setHoaVideoAttached(false)}
                >
                  <X className="w-4 h-4 mr-1" />
                  Remove HOA Video
                </Button>
              )}
              {!videoUrl2 ? (
                <div className="relative inline-flex">
                  <Button variant="outline" size="sm" type="button">
                    <Video className="w-4 h-4 mr-2" />
                    Upload Video (Bottom)
                  </Button>
                  <input
                    type="file"
                    accept="video/*"
                    onClick={(e) => { (e.currentTarget as HTMLInputElement).value = ""; }}
                    onChange={(e) => handleVideoUpload(e, 2)}
                    className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                  />
                </div>
              ) : (
                <Button
                  variant="destructive"
                  size="sm"
                  type="button"
                  onClick={() => setVideoUrl2(null)}
                >
                  <X className="w-4 h-4 mr-1" />
                  Remove Bottom Video
                </Button>
              )}
              {uploadingVideo2 && <Loader2 className="w-4 h-4 animate-spin" />}
              <span className="text-xs text-muted-foreground">
                Bottom videos appear at the very bottom of the proposal — below all photos.
              </span>
            </div>
          )}

        </div>
      </div>

      {/* ─── Bottom Videos — render at the VERY end of the report,
          AFTER all proposal pages, maps, notices, and photos so they
          always sit at the very bottom of what the customer scrolls. */}
      {(videoUrl2 || portalVideoAttached || hoaVideoAttached) && (
        <div data-pdf-page="bottom-videos" className="print-page-break bg-background no-pdf-export">
          <div className="p-4 max-w-[1800px] mx-auto space-y-6">
            {videoUrl2 && (
              <div>
                <h2 className="text-lg font-semibold text-foreground mb-3">Property Video</h2>
                <div className="max-w-3xl mx-auto relative group">
                  <video
                    id="property-video-bottom"
                    src={videoUrl2}
                    controls
                    preload="metadata"
                    className="w-full rounded-lg border-2 border-border relative"
                    poster={`data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='1920' height='1080'><rect width='1920' height='1080' fill='#C3D1C5'/></svg>`)}`}
                    onPlay={(e) => { const overlay = (e.target as HTMLElement).parentElement?.querySelector('[data-bottom-video-overlay]') as HTMLElement; if (overlay) overlay.style.display = 'none'; }}
                    onPause={(e) => { const overlay = (e.target as HTMLElement).parentElement?.querySelector('[data-bottom-video-overlay]') as HTMLElement; if (overlay) overlay.style.display = ''; }}
                  />
                  <div data-bottom-video-overlay className="absolute inset-0 flex items-center justify-center pointer-events-none rounded-lg z-20" style={{ background: 'linear-gradient(135deg, #C3D1C5 0%, #a8b8aa 100%)' }}>
                    <img src={crestLogoVideo} alt="Crest Pest Control" className="h-24 w-auto" />
                  </div>
                </div>
              </div>
            )}

            {portalVideoAttached && (
              <div>
                <div className="max-w-3xl mx-auto relative group">
                  <video
                    id="portal-walkthrough-video"
                    src="/videos/client-portal-video.mp4"
                    controls
                    preload="metadata"
                    className="w-full rounded-lg border-2 border-border relative"
                    poster={`data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='1920' height='1080'><rect width='1920' height='1080' fill='#C3D1C5'/></svg>`)}`}
                    onPlay={(e) => { const overlay = (e.target as HTMLElement).parentElement?.querySelector('[data-portal-video-overlay]') as HTMLElement; if (overlay) overlay.style.display = 'none'; }}
                    onPause={(e) => { const overlay = (e.target as HTMLElement).parentElement?.querySelector('[data-portal-video-overlay]') as HTMLElement; if (overlay) overlay.style.display = ''; }}
                  />
                  <div data-portal-video-overlay className="absolute inset-0 flex items-center justify-center pointer-events-none rounded-lg z-20" style={{ background: 'linear-gradient(135deg, #C3D1C5 0%, #a8b8aa 100%)' }}>
                    <img src={crestLogoVideo} alt="Crest Pest Control" className="h-24 w-auto" />
                  </div>
                </div>
              </div>
            )}

            {hoaVideoAttached && (
              <div>
                <div className="max-w-3xl mx-auto relative group">
                  <video
                    id="hoa-portal-video"
                    src="/videos/hoa-portal-video.mp4"
                    controls
                    preload="metadata"
                    className="w-full rounded-lg border-2 border-border relative"
                    poster={`data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='1920' height='1080'><rect width='1920' height='1080' fill='#C3D1C5'/></svg>`)}`}
                    onPlay={(e) => { const overlay = (e.target as HTMLElement).parentElement?.querySelector('[data-hoa-video-overlay]') as HTMLElement; if (overlay) overlay.style.display = 'none'; }}
                    onPause={(e) => { const overlay = (e.target as HTMLElement).parentElement?.querySelector('[data-hoa-video-overlay]') as HTMLElement; if (overlay) overlay.style.display = ''; }}
                  />
                  <div data-hoa-video-overlay className="absolute inset-0 flex items-center justify-center pointer-events-none rounded-lg z-20" style={{ background: 'linear-gradient(135deg, #C3D1C5 0%, #a8b8aa 100%)' }}>
                    <img src={crestLogoVideo} alt="Crest Pest Control" className="h-24 w-auto" />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Signature Modal — large signing area for the active proposal */}
      <Dialog
        open={signatureModalIndex !== null}
        onOpenChange={(o) => { if (!o) setSignatureModalIndex(null); }}
      >
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
            <Button variant="outline" onClick={() => setSignatureModalIndex(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                const sig = modalSignatureRef.current?.forceSave() ?? modalSignatureDraft;
                if (!sig) {
                  toast.error("Please sign before saving");
                  return;
                }
                const idx = signatureModalIndex;
                if (idx === null) return;
                setPerProposalSignatures(prev => ({ ...prev, [idx]: sig }));
                setCustomerSignature(sig);
                pendingAutoSaveRef.current = true;
                setSignatureModalIndex(null);
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
              <Mail className="w-5 h-5" /> Compose Email
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="email-to">To</Label>
              <Input id="email-to" type="email" value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} placeholder="customer@email.com" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email-cc">CC <span className="text-muted-foreground font-normal">(click to add from directory, or type and press Enter)</span></Label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {[
                  "caleb@crestpestco.com", "jake@crestpestco.com", "dlongoria@crestpestco.com",
                  "jlatham@crestpestco.com", "dtanner@crestpestco.com",
                  "dgallegos@crestpestco.com", "mmuniz@crestpestco.com",
                ].filter(email => !ccEmails.includes(email)).map((email) => (
                  <button key={email} type="button" onClick={() => setCcEmails(prev => [...prev, email])}
                    className="text-xs px-2 py-1 rounded-full border border-input bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
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
                <input id="email-cc" type="email" value={ccInput} onChange={(e) => setCcInput(e.target.value)}
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
              <Input id="email-subject" value={emailSubject} onChange={(e) => setEmailSubject(e.target.value)} placeholder="Email subject" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email-message">Message</Label>
              <Textarea id="email-message" value={emailMessage} onChange={(e) => setEmailMessage(e.target.value)} placeholder="Write your message..." className="min-h-[150px]" />
            </div>
            <div className="space-y-2">
              <Label>Report Link (included in email)</Label>
              <div className="p-3 bg-muted rounded-md text-sm">
                {reportId ? (
                  <a href={`${window.location.origin}/report/${reportId}`} target="_blank" rel="noopener noreferrer" className="text-primary underline break-all">
                    {`${window.location.origin}/report/${reportId}`}
                  </a>
                ) : (
                  <span className="text-muted-foreground italic">Save the report first to generate a shareable link</span>
                )}
              </div>
            </div>
          </div>
          <div className="pt-2 space-y-2">
            <Label className="text-sm font-medium">PDF Attachment</Label>
            <RadioGroup value={pdfAttachOption} onValueChange={(v) => setPdfAttachOption(v as "short" | "full" | "none")} className="flex flex-col gap-2">
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="short" id="pdf-short" />
                <Label htmlFor="pdf-short" className="text-sm cursor-pointer">Normal PDF (app pages only)</Label>
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
            <Button variant="outline" onClick={() => setShowComposeDialog(false)}>Cancel</Button>
            <Button onClick={handleSendEmail} disabled={isSendingEmail || !customerEmail || !reportId}>
              {isSendingEmail ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Send className="w-4 h-4 mr-2" />}
              Send Email
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Clear-signature confirmation (admin password 18444) */}
      <Dialog open={clearSigDialog.open} onOpenChange={(o) => { if (!o) { setClearSigDialog({ open: false, index: null }); setClearSigPassword(""); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Clear this signature?</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground">
              This will permanently remove the customer's signature on this proposal so it can be re-signed. Enter the admin password to confirm.
            </p>
            <Input
              type="password"
              autoFocus
              placeholder="Admin password"
              value={clearSigPassword}
              onChange={(e) => setClearSigPassword(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") confirmClearSignature(); }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setClearSigDialog({ open: false, index: null }); setClearSigPassword(""); }}>Cancel</Button>
            <Button variant="destructive" onClick={confirmClearSignature} disabled={clearSigSaving || !clearSigPassword}>
              {clearSigSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Clear Signature
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Report;
