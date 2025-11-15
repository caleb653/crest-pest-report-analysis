import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLocation, useNavigate } from "react-router-dom";
import { MapPin, Pencil, Save, Bug, Home, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

const MapEditor = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { formData } = location.state || {};
  const [selectedTool, setSelectedTool] = useState<string>("select");

  const tools = [
    { id: "select", label: "Select", icon: MapPin },
    { id: "draw", label: "Draw", icon: Pencil },
    { id: "pest", label: "Pest Icon", icon: Bug },
    { id: "home", label: "Home Icon", icon: Home },
    { id: "alert", label: "Alert Icon", icon: AlertTriangle },
  ];

  const handleSaveReport = () => {
    toast.success("Report saved successfully!");
    navigate('/report-preview', { state: { formData } });
  };

  return (
    <div className="min-h-screen bg-background py-8 px-4">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-foreground mb-2">Map Editor</h1>
          <p className="text-muted-foreground">
            Draw and annotate the property map for {formData?.customerName || "customer"}
          </p>
        </div>

        <div className="grid lg:grid-cols-4 gap-6">
          {/* Tools Sidebar */}
          <Card className="lg:col-span-1 h-fit shadow-md">
            <CardHeader>
              <CardTitle>Drawing Tools</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {tools.map((tool) => (
                <Button
                  key={tool.id}
                  variant={selectedTool === tool.id ? "default" : "outline"}
                  className="w-full justify-start"
                  onClick={() => {
                    setSelectedTool(tool.id);
                    toast.info(`${tool.label} tool selected`);
                  }}
                >
                  <tool.icon className="mr-2 w-4 h-4" />
                  {tool.label}
                </Button>
              ))}

              <div className="pt-4 border-t border-border mt-4">
                <Button
                  onClick={handleSaveReport}
                  className="w-full bg-gradient-primary text-primary-foreground hover:opacity-90"
                >
                  <Save className="mr-2 w-4 h-4" />
                  Save Report
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Map Canvas */}
          <Card className="lg:col-span-3 shadow-md">
            <CardContent className="p-6">
              <div className="bg-muted rounded-lg aspect-[4/3] flex items-center justify-center border-2 border-dashed border-border">
                <div className="text-center">
                  <MapPin className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
                  <p className="text-lg font-medium text-muted-foreground">
                    Interactive Map Coming Soon
                  </p>
                  <p className="text-sm text-muted-foreground mt-2">
                    Satellite imagery and drawing tools will be integrated here
                  </p>
                  <p className="text-xs text-muted-foreground mt-4">
                    Address: {formData?.address || "No address provided"}
                  </p>
                </div>
              </div>

              {/* Legend */}
              <div className="mt-6 p-4 bg-card rounded-lg border border-border">
                <h3 className="font-semibold mb-3">Legend</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 bg-destructive rounded" />
                    <span className="text-sm">Treatment Area</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 bg-secondary rounded" />
                    <span className="text-sm">Safe Zone</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Bug className="w-4 h-4" />
                    <span className="text-sm">Pest Location</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default MapEditor;
