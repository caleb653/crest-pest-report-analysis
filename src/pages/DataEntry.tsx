import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useLocation, useNavigate } from "react-router-dom";
import { ArrowRight, Upload, Image as ImageIcon, X } from "lucide-react";
import { toast } from "sonner";

const DataEntry = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { technicianName } = location.state || {};
  const [screenshots, setScreenshots] = useState<File[]>([]);
  const [formData, setFormData] = useState({
    customerName: "",
    address: "",
    notes: "",
  });

  const handleScreenshotUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files);
      setScreenshots([...screenshots, ...newFiles]);
      toast.success(`${newFiles.length} screenshot(s) uploaded`);
    }
  };

  const removeScreenshot = (index: number) => {
    setScreenshots(screenshots.filter((_, i) => i !== index));
    toast.info("Screenshot removed");
  };

  const handleGenerate = () => {
    if (screenshots.length === 0 && !formData.customerName && !formData.address) {
      toast.error("Please upload screenshots or enter customer information");
      return;
    }
    
    navigate('/report', { 
      state: { 
        technicianName,
        screenshots,
        ...formData 
      } 
    });
    toast.success("Generating report...");
  };

  return (
    <div className="min-h-screen bg-background py-8 px-4">
      <div className="max-w-3xl mx-auto">
        <Card className="shadow-xl">
          <CardHeader className="text-center">
            <CardTitle className="text-3xl mb-2">Upload & Enter Details</CardTitle>
            <CardDescription className="text-lg">
              Upload screenshots or manually enter information
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 pb-8">
            {/* Screenshot Upload Section */}
            <div className="space-y-4">
              <Label className="text-lg font-semibold">Screenshots (Optional)</Label>
              
              <div className="border-4 border-dashed border-primary/30 rounded-xl p-8 text-center hover:border-primary/50 transition-colors bg-muted/30">
                <Upload className="w-16 h-16 mx-auto mb-4 text-primary" />
                <Label 
                  htmlFor="screenshots" 
                  className="cursor-pointer block"
                >
                  <span className="text-xl font-semibold text-primary hover:text-primary/80">
                    Tap to Upload Screenshots
                  </span>
                  <p className="text-muted-foreground mt-2">
                    From other apps with customer info
                  </p>
                </Label>
                <Input
                  id="screenshots"
                  type="file"
                  multiple
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={handleScreenshotUpload}
                />
              </div>

              {screenshots.length > 0 && (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {screenshots.map((file, index) => (
                    <div key={index} className="relative group">
                      <div className="aspect-square bg-muted rounded-lg flex items-center justify-center border-2 border-border p-2">
                        <div className="text-center">
                          <ImageIcon className="w-8 h-8 mx-auto mb-1 text-muted-foreground" />
                          <p className="text-xs text-muted-foreground truncate px-1">
                            {file.name}
                          </p>
                        </div>
                      </div>
                      <Button
                        size="icon"
                        variant="destructive"
                        className="absolute -top-2 -right-2 opacity-0 group-hover:opacity-100 transition-opacity rounded-full w-7 h-7"
                        onClick={() => removeScreenshot(index)}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="bg-card px-4 text-muted-foreground font-medium">
                  OR ENTER MANUALLY
                </span>
              </div>
            </div>

            {/* Manual Entry Section */}
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="customerName" className="text-base">Customer Name</Label>
                <Input
                  id="customerName"
                  value={formData.customerName}
                  onChange={(e) => setFormData({...formData, customerName: e.target.value})}
                  placeholder="John Doe"
                  className="text-lg py-6"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="address" className="text-base">Property Address</Label>
                <Input
                  id="address"
                  value={formData.address}
                  onChange={(e) => setFormData({...formData, address: e.target.value})}
                  placeholder="123 Main St, Austin, TX 78701"
                  className="text-lg py-6"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes" className="text-base">Notes</Label>
                <Textarea
                  id="notes"
                  value={formData.notes}
                  onChange={(e) => setFormData({...formData, notes: e.target.value})}
                  placeholder="Service details, observations, recommendations..."
                  rows={6}
                  className="text-base"
                />
              </div>
            </div>

            <Button
              size="lg"
              onClick={handleGenerate}
              className="w-full bg-gradient-primary text-primary-foreground text-xl py-8 mt-8"
            >
              Generate Report
              <ArrowRight className="ml-2 w-6 h-6" />
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default DataEntry;
