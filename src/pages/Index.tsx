import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import crestLogo from "@/assets/crest-logo-black.png";

const Index = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gradient-primary flex items-center justify-center p-4">
      <div className="text-center max-w-2xl w-full">
        <div className="mb-8">
          <img src={crestLogo} alt="Crest Logo" className="w-48 md:w-64 mx-auto mb-6" />
          <h1 className="text-3xl md:text-5xl font-bold text-primary-foreground mb-4">
            Pest Analysis Reports
          </h1>
          <p className="text-lg md:text-xl text-primary-foreground/90">
            Internal Technician Report System
          </p>
        </div>

        <div className="flex flex-col gap-4 max-w-md mx-auto">
          <Button
            size="lg"
            onClick={() => navigate('/select-technician')}
            className="bg-card text-card-foreground hover:bg-card/90 text-xl md:text-2xl px-12 md:px-16 py-10 md:py-12 h-auto rounded-2xl shadow-2xl hover:scale-105 transition-all duration-300"
          >
            <div className="flex flex-col items-center gap-3">
              <span className="text-2xl md:text-3xl font-bold">Start New Report</span>
              <ArrowRight className="w-6 h-6 md:w-8 md:h-8" />
            </div>
          </Button>

          <Button
            size="lg"
            onClick={() => navigate('/admin-login')}
            variant="secondary"
            className="text-lg md:text-xl px-8 md:px-12 py-8 md:py-10 h-auto rounded-2xl shadow-xl hover:scale-105 transition-all duration-300"
          >
            <div className="flex flex-col items-center gap-2">
              <span className="text-xl md:text-2xl font-bold">Admin Sign In</span>
              <span className="text-sm opacity-80">View All Reports</span>
            </div>
          </Button>
        </div>
      </div>
    </div>
  );
};

export default Index;
