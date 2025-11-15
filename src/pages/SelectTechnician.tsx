import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useNavigate } from "react-router-dom";
import { ArrowRight, User } from "lucide-react";
import { toast } from "sonner";

const SelectTechnician = () => {
  const navigate = useNavigate();
  const [selectedTech, setSelectedTech] = useState("");

  const technicians = [
    "Alexis Rodriguez",
    "Darrell Tanner",
    "Jesse Angulo",
    "Marcus Reynolds",
    "Caleb Whalen",
    "Jacob Shubin"
  ];

  const handleNext = () => {
    if (!selectedTech) {
      toast.error("Please select a technician");
      return;
    }
    navigate('/data-entry', { state: { technicianName: selectedTech } });
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-2xl shadow-xl">
        <CardHeader className="text-center pb-8">
          <User className="w-16 h-16 mx-auto mb-4 text-primary" />
          <CardTitle className="text-3xl mb-2">Select Technician</CardTitle>
          <CardDescription className="text-lg">Who is completing this report?</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 pb-8">
          <div className="grid grid-cols-1 gap-3">
            {technicians.map((tech) => (
              <Button
                key={tech}
                variant={selectedTech === tech ? "default" : "outline"}
                size="lg"
                onClick={() => setSelectedTech(tech)}
                className={`text-lg py-6 justify-start ${
                  selectedTech === tech 
                    ? 'bg-gradient-primary text-primary-foreground' 
                    : ''
                }`}
              >
                <User className="mr-3 w-5 h-5" />
                {tech}
              </Button>
            ))}
          </div>

          <Button
            size="lg"
            onClick={handleNext}
            disabled={!selectedTech}
            className="w-full mt-8 bg-gradient-primary text-primary-foreground text-lg py-6"
          >
            Continue
            <ArrowRight className="ml-2 w-5 h-5" />
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default SelectTechnician;
