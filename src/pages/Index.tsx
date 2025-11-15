import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { FileText, ArrowRight } from "lucide-react";

const Index = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gradient-primary flex items-center justify-center p-4">
      <div className="text-center max-w-2xl">
        <div className="mb-8">
          <FileText className="w-24 h-24 mx-auto text-primary-foreground mb-6" />
          <h1 className="text-5xl font-bold text-primary-foreground mb-4">
            PestPro Reports
          </h1>
          <p className="text-xl text-primary-foreground/90">
            Internal Technician Report System
          </p>
        </div>

        <Button
          size="lg"
          onClick={() => navigate('/select-technician')}
          className="bg-card text-card-foreground hover:bg-card/90 text-2xl px-16 py-12 h-auto rounded-2xl shadow-2xl hover:scale-105 transition-all duration-300"
        >
          <div className="flex flex-col items-center gap-3">
            <span className="text-3xl font-bold">Start New Report</span>
            <ArrowRight className="w-8 h-8" />
          </div>
        </Button>
      </div>
    </div>
  );
};

export default Index;
