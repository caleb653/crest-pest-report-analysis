import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Save, Loader2, Check, ChevronsUpDown } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import crestLogo from "@/assets/crest-logo.png";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import RichTextEditor from "@/components/RichTextEditor";
import InlineImageAnnotator from "@/components/InlineImageAnnotator";

const TECHNICIANS = [
  { name: "Darrell Tanner", license: "FR 62523" },
  { name: "Jesse Angulo", license: "OPR #14972" },
  { name: "Jake Shubin", license: "FR 71068" },
  { name: "Caleb Whalen", license: "FR 71183" },
  { name: "Jackson Latham", license: "FR 68261" },
  { name: "Dylan Gallegos", license: "RA 71068" },
  { name: "Michael Muniz", license: "FR 54193" },
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
  "In2Care Mix", "OneGuard", "Advion Microflow", "Optigard", "Other",
];

const EQUIPMENT_OPTIONS = ["Rodent Bait Stations", "Rodent Traps", "Mosquito Buckets", "Fly Light", "Pest Monitors"];

const CUSTOMER_KEY_AREAS = ["Children", "Pets", "Elderly", "Garden"];

const AppointmentReport = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { serviceId } = useParams();
  const { serviceData, propertyName, clientName, returnTo } = location.state || {};

  const [isSaving, setIsSaving] = useState(false);
  const [techDropdownOpen, setTechDropdownOpen] = useState(false);
  const [pestsDropdownOpen, setPestsDropdownOpen] = useState(false);
  const pestsDropdownRef = useRef<HTMLDivElement>(null);

  // Form state
  const [technicianName, setTechnicianName] = useState(serviceData?.technician || "");
  const [licenseNumber, setLicenseNumber] = useState("");
  const [serviceDate, setServiceDate] = useState(serviceData?.service_date || new Date().toISOString().split("T")[0]);
  const [targetPests, setTargetPests] = useState<string[]>([PEST_OPTIONS[0]]);
  const [productsUsed, setProductsUsed] = useState<string[]>(
    Array.isArray(serviceData?.products_used) ? serviceData.products_used : []
  );
  const [equipment, setEquipment] = useState<string[]>([]);
  const [customerKeyAreas, setCustomerKeyAreas] = useState<string[]>([]);
  const [customerKeyAreasNotes, setCustomerKeyAreasNotes] = useState("");
  const [todaysFindings, setTodaysFindings] = useState(serviceData?.findings || "");
  const [findings, setFindings] = useState<string[]>([]);
  const [expectations, setExpectations] = useState<string[]>([]);
  const [recommendations, setRecommendations] = useState<string[]>([]);
  const [customerPreference, setCustomerPreference] = useState("");
  const [findingsFontSize, setFindingsFontSize] = useState(14);
  const [expectationsFontSize, setExpectationsFontSize] = useState(14);
  const [recommendationsFontSize, setRecommendationsFontSize] = useState(14);
  const [customerPreferenceNotes, setCustomerPreferenceNotes] = useState("");
  const [propertyImages, setPropertyImages] = useState<Array<{ image: string; caption?: string }>>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [annotatingImageIndex, setAnnotatingImageIndex] = useState<number | null>(null);

  // Auto-set license when technician changes
  const handleTechnicianChange = (name: string) => {
    setTechnicianName(name);
    const tech = TECHNICIANS.find(t => t.name === name);
    if (tech) setLicenseNumber(tech.license);
    setTechDropdownOpen(false);
  };

  // Generate findings from pest selections
  const generateContentFromSelections = (pests: string[], equip: string[], products: string[]) => {
    const lines: string[] = [];
    const isGeneralPests = pests.some(p => p.startsWith("General Pests"));
    const usesOrganic = products.some(p => p.toLowerCase().includes("essentria"));

    if (isGeneralPests) {
      lines.push("• Inspected interior and exterior for general pest activity and entry points");
      lines.push(usesOrganic
        ? "• Applied targeted general pest treatments, including organic solutions, to ensure a protective barrier around the home"
        : "• Applied targeted general pest treatments to ensure a protective barrier around the home");
      lines.push("• De-webbed the entire home");
    }
    if (pests.includes("Ants")) lines.push("• Inspected for ant activity and treated ant trails and entry points");
    if (pests.includes("Spiders")) lines.push("• Inspected for spider activity, removed webs, and applied spider-targeted treatments");
    if (pests.includes("Roaches") || pests.includes("American Roaches")) lines.push("• Inspected for cockroach activity and applied cockroach-targeted treatments to harborage areas");
    if (pests.includes("Wasps")) lines.push("• Inspected for wasp nests and treated active wasp activity areas");
    if (pests.includes("Rodents")) {
      lines.push("• Inspected for rodent activity and strategically placed traps in areas of highest activity");
      lines.push("• Will monitor and adjust trap placement as needed to ensure effective rodent control");
    }
    if (pests.includes("Mosquitoes")) {
      lines.push("• Set up mosquito stations to interrupt breeding cycle and neutralize future mosquito generations");
    }
    if (pests.includes("Bed Bugs")) {
      lines.push("• Inspected sleeping areas, furniture, and baseboards for bed bug activity");
      lines.push("• Applied targeted bed bug treatments to affected areas");
    }
    if (equip.includes("Rodent Bait Stations")) lines.push("• Installed rodent bait stations around the property perimeter");
    if (equip.includes("Rodent Traps")) lines.push("• Placed rodent traps for population control");
    if (equip.includes("Mosquito Buckets")) lines.push("• Installed mosquito stations around the property");
    return lines.join("\n");
  };

  const generateRecommendations = (pests: string[]) => {
    const lines: string[] = [];
    const isGeneralPests = pests.some(p => p.startsWith("General Pests"));
    if (isGeneralPests || pests.includes("Ants")) lines.push("<strong>Ants:</strong> (1) Wipe food/sugar spills fast (2) Fix leaks & avoid overwatering");
    if (isGeneralPests || pests.includes("Spiders")) lines.push("<strong>Spiders:</strong> (1) Remove webs regularly (2) Reduce insects & outdoor lighting");
    if (pests.includes("Rodents")) lines.push("<strong>Rats:</strong> (1) Seal food & clean outdoor debris (2) Keep yards clutter-free");
    if (pests.includes("Bed Bugs")) lines.push("<strong>Bed Bugs:</strong> (1) Inspect luggage after travel (2) Use mattress encasements");
    if (pests.includes("Mosquitoes")) lines.push("<strong>Mosquitoes:</strong> (1) Remove standing water (2) Trim vegetation");
    if (lines.length === 0) {
      lines.push("<strong>General:</strong> (1) Keep food in airtight containers (2) Seal cracks around doors & windows");
    }
    return lines.join("<br>");
  };

  // Auto-update content when selections change
  useEffect(() => {
    if (targetPests.length > 0 || equipment.length > 0) {
      const content = generateContentFromSelections(targetPests, equipment, productsUsed);
      setFindings([content]);
      setExpectations(["• Initial Period: You may notice increased pest activity in the first 24-48 hours as pests are flushed from hiding spots.\n• Treatment Effect: Pest populations will decrease significantly over the next 7-10 days.\n• Long-term Results: With continued service, pests will become less of an issue. Contact us if activity persists beyond 2 weeks."]);
      setRecommendations([generateRecommendations(targetPests)]);
    }
  }, [targetPests, equipment, productsUsed]);

  const togglePest = (pest: string) => {
    setTargetPests(prev => prev.includes(pest) ? prev.filter(p => p !== pest) : [...prev, pest]);
  };

  const toggleProduct = (product: string) => {
    setProductsUsed(prev => prev.includes(product) ? prev.filter(p => p !== product) : [...prev, product]);
  };

  const toggleEquipment = (item: string) => {
    setEquipment(prev => prev.includes(item) ? prev.filter(e => e !== item) : [...prev, item]);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    for (const file of Array.from(files)) {
      const reader = new FileReader();
      reader.onload = () => {
        setPropertyImages(prev => [...prev, { image: reader.result as string }]);
      };
      reader.readAsDataURL(file);
    }
  };

  const saveReport = async () => {
    if (!serviceId) return;
    setIsSaving(true);

    const reportData = {
      technician_name: technicianName,
      license_number: licenseNumber,
      service_date: serviceDate,
      target_pests: targetPests,
      products_used: productsUsed,
      equipment,
      customer_key_areas: { areas: customerKeyAreas, notes: customerKeyAreasNotes },
      todays_findings: todaysFindings,
      findings,
      expectations,
      recommendations,
      customer_preference: customerPreference,
      customer_preference_notes: customerPreferenceNotes,
      property_images: propertyImages,
    };

    const { error } = await supabase
      .from("portal_services")
      .update({
        report_data: reportData as any,
        technician: technicianName,
        service_date: serviceDate,
        products_used: productsUsed,
        findings: todaysFindings || (findings.length > 0 ? findings[0] : null),
      })
      .eq("id", serviceId);

    if (error) {
      toast.error("Failed to save report");
    } else {
      toast.success("Appointment Report saved!");
      if (returnTo) navigate(returnTo);
      else navigate(-1);
    }
    setIsSaving(false);
  };

  // Load existing report data
  useEffect(() => {
    if (serviceId) {
      supabase
        .from("portal_services")
        .select("*")
        .eq("id", serviceId)
        .single()
        .then(({ data }) => {
          if (data?.report_data && typeof data.report_data === "object") {
            const rd = data.report_data as any;
            if (rd.technician_name) setTechnicianName(rd.technician_name);
            if (rd.license_number) setLicenseNumber(rd.license_number);
            if (rd.service_date) setServiceDate(rd.service_date);
            if (rd.target_pests) setTargetPests(rd.target_pests);
            if (rd.products_used) setProductsUsed(rd.products_used);
            if (rd.equipment) setEquipment(rd.equipment);
            if (rd.customer_key_areas) {
              setCustomerKeyAreas(rd.customer_key_areas.areas || []);
              setCustomerKeyAreasNotes(rd.customer_key_areas.notes || "");
            }
            if (rd.todays_findings) setTodaysFindings(rd.todays_findings);
            if (rd.findings) setFindings(rd.findings);
            if (rd.expectations) setExpectations(rd.expectations);
            if (rd.recommendations) setRecommendations(rd.recommendations);
            if (rd.customer_preference) setCustomerPreference(rd.customer_preference);
            if (rd.customer_preference_notes) setCustomerPreferenceNotes(rd.customer_preference_notes);
            if (rd.property_images) setPropertyImages(rd.property_images);
          } else if (data) {
            // Pre-fill from service data
            if (data.technician) setTechnicianName(data.technician);
            if (data.service_date) setServiceDate(data.service_date);
            if (data.products_used && Array.isArray(data.products_used)) setProductsUsed(data.products_used as string[]);
            if (data.findings) setTodaysFindings(data.findings);
          }
        });
    }
  }, [serviceId]);

  const reportTitle = serviceDate
    ? `${new Date(serviceDate + "T00:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })} Appointment Report`
    : "Appointment Report";

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-card border-b px-4 py-3 flex items-center gap-3 sticky top-0 z-10">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <img src={crestLogo} alt="Crest" className="h-8" />
        <div className="flex-1">
          <h1 className="text-base font-bold">{reportTitle}</h1>
          {propertyName && <p className="text-xs text-muted-foreground">{propertyName}</p>}
        </div>
        <Button onClick={saveReport} disabled={isSaving}>
          {isSaving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
          Save
        </Button>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        {/* Report Title */}
        <div className="text-center">
          <img src={crestLogo} alt="Crest Pest Control" className="h-14 mx-auto mb-2" />
          <h2 className="text-xl font-bold">{reportTitle}</h2>
          {clientName && <p className="text-sm text-muted-foreground mt-1">{clientName}</p>}
          {propertyName && <p className="text-sm text-muted-foreground">{propertyName}</p>}
        </div>

        {/* Technician & Date */}
        <Card className="p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
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
          </div>
        </Card>

        {/* Target Pests */}
        <Card className="p-4">
          <Label className="mb-2 block font-semibold">Target Pests</Label>
          <div className="flex flex-wrap gap-1.5" ref={pestsDropdownRef}>
            {PEST_OPTIONS.map(pest => (
              <Badge
                key={pest}
                variant={targetPests.includes(pest) ? "default" : "outline"}
                className="cursor-pointer text-xs"
                onClick={() => togglePest(pest)}
              >
                {pest.length > 40 ? "General Pests" : pest}
              </Badge>
            ))}
          </div>
        </Card>

        {/* Products Used */}
        <Card className="p-4">
          <Label className="mb-2 block font-semibold">Products Used</Label>
          <div className="flex flex-wrap gap-1.5">
            {PRODUCT_OPTIONS.map(p => (
              <Badge
                key={p}
                variant={productsUsed.includes(p) ? "default" : "outline"}
                className="cursor-pointer text-xs"
                onClick={() => toggleProduct(p)}
              >
                {p}
              </Badge>
            ))}
          </div>
        </Card>

        {/* Equipment */}
        <Card className="p-4">
          <Label className="mb-2 block font-semibold">Equipment</Label>
          <div className="flex flex-wrap gap-1.5">
            {EQUIPMENT_OPTIONS.map(e => (
              <Badge
                key={e}
                variant={equipment.includes(e) ? "default" : "outline"}
                className="cursor-pointer text-xs"
                onClick={() => toggleEquipment(e)}
              >
                {e}
              </Badge>
            ))}
          </div>
        </Card>

        {/* Customer Key Areas */}
        <Card className="p-4 space-y-3">
          <Label className="font-semibold">Customer Key Areas of Concern</Label>
          <div className="flex flex-wrap gap-1.5">
            {CUSTOMER_KEY_AREAS.map(area => (
              <Badge
                key={area}
                variant={customerKeyAreas.includes(area) ? "default" : "outline"}
                className="cursor-pointer text-xs"
                onClick={() => setCustomerKeyAreas(prev => prev.includes(area) ? prev.filter(a => a !== area) : [...prev, area])}
              >
                {area}
              </Badge>
            ))}
          </div>
          <Textarea
            placeholder="Notes about key areas..."
            value={customerKeyAreasNotes}
            onChange={e => setCustomerKeyAreasNotes(e.target.value)}
            rows={2}
          />
        </Card>

        {/* Customer Preference */}
        <Card className="p-4 space-y-3">
          <Label className="font-semibold">Customer Preference</Label>
          <Select value={customerPreference} onValueChange={setCustomerPreference}>
            <SelectTrigger><SelectValue placeholder="Select preference" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="Interior & Exterior">Interior & Exterior</SelectItem>
              <SelectItem value="Exterior Only">Exterior Only</SelectItem>
              <SelectItem value="Interior Only">Interior Only</SelectItem>
            </SelectContent>
          </Select>
          <Textarea
            placeholder="Additional notes..."
            value={customerPreferenceNotes}
            onChange={e => setCustomerPreferenceNotes(e.target.value)}
            rows={2}
          />
        </Card>

        {/* Today's Findings */}
        <Card className="p-4 space-y-2">
          <Label className="font-semibold">Today's Findings</Label>
          <Textarea
            placeholder="What was found during today's service..."
            value={todaysFindings}
            onChange={e => setTodaysFindings(e.target.value)}
            rows={4}
          />
        </Card>

        {/* Service Performed */}
        <Card className="p-4 space-y-2">
          <Label className="font-semibold">Service Performed</Label>
          <RichTextEditor
            value={findings[0] || ""}
            onChange={v => setFindings([v])}
            fontSize={findingsFontSize}
            onFontSizeChange={setFindingsFontSize}
          />
        </Card>

        {/* Expectations */}
        <Card className="p-4 space-y-2">
          <Label className="font-semibold">What to Expect</Label>
          <RichTextEditor
            value={expectations[0] || ""}
            onChange={v => setExpectations([v])}
            fontSize={expectationsFontSize}
            onFontSizeChange={setExpectationsFontSize}
          />
        </Card>

        {/* Recommendations */}
        <Card className="p-4 space-y-2">
          <Label className="font-semibold">Recommendations</Label>
          <RichTextEditor
            value={recommendations[0] || ""}
            onChange={v => setRecommendations([v])}
            fontSize={recommendationsFontSize}
            onFontSizeChange={setRecommendationsFontSize}
          />
        </Card>

        {/* Property Images */}
        <Card className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <Label className="font-semibold">Property Images</Label>
            <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
              Add Photo
            </Button>
            <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleImageUpload} />
          </div>
          {propertyImages.length > 0 && (
            <div className="grid grid-cols-2 gap-2">
              {propertyImages.map((img, i) => (
                <div key={i} className="relative">
                  <img
                    src={img.image}
                    alt={img.caption || `Photo ${i + 1}`}
                    className="w-full h-32 object-cover rounded cursor-pointer"
                    onClick={() => setAnnotatingImageIndex(i)}
                  />
                  <button
                    className="absolute top-1 right-1 bg-destructive text-destructive-foreground rounded-full w-5 h-5 flex items-center justify-center text-xs"
                    onClick={() => setPropertyImages(prev => prev.filter((_, j) => j !== i))}
                  >×</button>
                  <Input
                    placeholder="Caption..."
                    value={img.caption || ""}
                    onChange={e => setPropertyImages(prev => prev.map((p, j) => j === i ? { ...p, caption: e.target.value } : p))}
                    className="mt-1 text-xs h-7"
                  />
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Save */}
        <Button className="w-full" size="lg" onClick={saveReport} disabled={isSaving}>
          {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
          Save Appointment Report
        </Button>
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
