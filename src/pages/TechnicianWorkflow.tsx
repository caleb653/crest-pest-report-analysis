import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Upload } from "lucide-react";
import { toast } from "sonner";

const TechnicianWorkflow = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    technicianName: "",
    customerName: "",
    address: "",
    serviceType: "",
    notes: "",
  });
  const [photos, setPhotos] = useState<File[]>([]);

  const technicians = [
    "John Smith",
    "Sarah Johnson", 
    "Mike Davis",
    "Emily Wilson",
    "Chris Martinez"
  ];

  const serviceTypes = [
    "General Pest Treatment",
    "Rodent Control",
    "Termite Inspection",
    "Bee/Wasp Removal",
    "Bed Bug Treatment",
    "Flea Treatment",
    "Spider Control"
  ];

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newPhotos = Array.from(e.target.files);
      setPhotos([...photos, ...newPhotos]);
      toast.success(`${newPhotos.length} photo(s) uploaded`);
    }
  };

  const handleNext = () => {
    if (step === 1 && !formData.technicianName) {
      toast.error("Please select a technician name");
      return;
    }
    if (step === 2 && (!formData.customerName || !formData.address || !formData.serviceType)) {
      toast.error("Please fill in all required fields");
      return;
    }
    
    if (step < 3) {
      setStep(step + 1);
    } else {
      // Navigate to map editor
      toast.success("Report created! Opening map editor...");
      navigate('/map-editor', { state: { formData, photos } });
    }
  };

  return (
    <div className="min-h-screen bg-background py-12 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Progress Indicator */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            {[1, 2, 3].map((s) => (
              <div 
                key={s}
                className={`flex-1 h-2 rounded-full mx-1 transition-all duration-300 ${
                  s <= step ? 'bg-gradient-primary' : 'bg-muted'
                }`}
              />
            ))}
          </div>
          <p className="text-center text-sm text-muted-foreground">
            Step {step} of 3
          </p>
        </div>

        {/* Step 1: Technician Selection */}
        {step === 1 && (
          <Card className="shadow-lg">
            <CardHeader>
              <CardTitle className="text-2xl">Select Technician</CardTitle>
              <CardDescription>Choose your name to begin the report</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="technician">Technician Name</Label>
                <Select 
                  value={formData.technicianName}
                  onValueChange={(value) => setFormData({...formData, technicianName: value})}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select technician..." />
                  </SelectTrigger>
                  <SelectContent>
                    {technicians.map((tech) => (
                      <SelectItem key={tech} value={tech}>{tech}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 2: Job Details */}
        {step === 2 && (
          <Card className="shadow-lg">
            <CardHeader>
              <CardTitle className="text-2xl">Job Details</CardTitle>
              <CardDescription>Enter customer and service information</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="customerName">Customer Name *</Label>
                <Input
                  id="customerName"
                  value={formData.customerName}
                  onChange={(e) => setFormData({...formData, customerName: e.target.value})}
                  placeholder="John Doe"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="address">Property Address *</Label>
                <Input
                  id="address"
                  value={formData.address}
                  onChange={(e) => setFormData({...formData, address: e.target.value})}
                  placeholder="123 Main St, Austin, TX 78701"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="service">Service Type *</Label>
                <Select 
                  value={formData.serviceType}
                  onValueChange={(value) => setFormData({...formData, serviceType: value})}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select service..." />
                  </SelectTrigger>
                  <SelectContent>
                    {serviceTypes.map((service) => (
                      <SelectItem key={service} value={service}>{service}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">Additional Notes</Label>
                <Textarea
                  id="notes"
                  value={formData.notes}
                  onChange={(e) => setFormData({...formData, notes: e.target.value})}
                  placeholder="Any additional information..."
                  rows={4}
                />
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 3: Photo Upload */}
        {step === 3 && (
          <Card className="shadow-lg">
            <CardHeader>
              <CardTitle className="text-2xl">Upload Photos</CardTitle>
              <CardDescription>Add photos from the service visit</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="border-2 border-dashed border-border rounded-lg p-8 text-center">
                <Upload className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                <Label 
                  htmlFor="photos" 
                  className="cursor-pointer text-primary hover:text-primary/80 font-medium"
                >
                  Click to upload photos
                </Label>
                <Input
                  id="photos"
                  type="file"
                  multiple
                  accept="image/*"
                  className="hidden"
                  onChange={handlePhotoUpload}
                />
                <p className="text-sm text-muted-foreground mt-2">
                  or drag and drop images here
                </p>
              </div>

              {photos.length > 0 && (
                <div className="space-y-2">
                  <p className="font-medium">{photos.length} photo(s) uploaded</p>
                  <div className="grid grid-cols-3 gap-2">
                    {photos.map((photo, index) => (
                      <div key={index} className="aspect-square bg-muted rounded-lg flex items-center justify-center text-xs text-muted-foreground">
                        {photo.name}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Navigation Buttons */}
        <div className="flex gap-4 mt-8">
          {step > 1 && (
            <Button
              variant="outline"
              onClick={() => setStep(step - 1)}
              className="flex-1"
            >
              Back
            </Button>
          )}
          <Button
            onClick={handleNext}
            className={`bg-gradient-primary text-primary-foreground hover:opacity-90 shadow-md ${step === 1 ? 'w-full' : 'flex-1'}`}
          >
            {step === 3 ? 'Continue to Map' : 'Next'}
            <ArrowRight className="ml-2 w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
};

export default TechnicianWorkflow;
