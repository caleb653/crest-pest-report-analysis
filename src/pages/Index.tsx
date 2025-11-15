import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { FileText, MapPin, Camera, CheckCircle } from "lucide-react";
import heroImage from "@/assets/hero-home.jpg";

const Index = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <section className="relative h-[600px] flex items-center justify-center overflow-hidden">
        <div className="absolute inset-0">
          <img 
            src={heroImage} 
            alt="Professional pest control service" 
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-primary/90 to-secondary/80" />
        </div>
        
        <div className="relative z-10 max-w-4xl mx-auto px-4 text-center text-primary-foreground">
          <h1 className="text-5xl md:text-6xl font-bold mb-6">
            Professional Pest Control Reports
          </h1>
          <p className="text-xl md:text-2xl mb-8 opacity-95">
            Create beautiful, detailed service reports in minutes
          </p>
          <Button 
            size="lg" 
            onClick={() => navigate('/technician')}
            className="bg-card text-card-foreground hover:bg-card/90 shadow-lg text-lg px-8 py-6 h-auto"
          >
            Start New Report
          </Button>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 px-4">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-4xl font-bold text-center mb-16 text-foreground">
            Simple, Fast, Professional
          </h2>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {[
              {
                icon: Camera,
                title: "Upload Photos",
                description: "Capture and upload service photos instantly"
              },
              {
                icon: MapPin,
                title: "Interactive Maps",
                description: "Draw and annotate property maps with ease"
              },
              {
                icon: FileText,
                title: "Auto Reports",
                description: "Generate detailed reports automatically"
              },
              {
                icon: CheckCircle,
                title: "Client Ready",
                description: "Professional reports ready to share"
              }
            ].map((feature, index) => (
              <div 
                key={index}
                className="bg-card p-8 rounded-2xl shadow-md hover:shadow-lg transition-all duration-300"
              >
                <div className="w-16 h-16 bg-gradient-primary rounded-xl flex items-center justify-center mb-6">
                  <feature.icon className="w-8 h-8 text-primary-foreground" />
                </div>
                <h3 className="text-xl font-semibold mb-3 text-card-foreground">{feature.title}</h3>
                <p className="text-muted-foreground">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4 bg-muted">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl font-bold mb-6 text-foreground">
            Ready to Create Your First Report?
          </h2>
          <p className="text-lg text-muted-foreground mb-8">
            Join our team of technicians creating professional service reports
          </p>
          <Button 
            size="lg"
            onClick={() => navigate('/technician')}
            className="bg-gradient-primary text-primary-foreground hover:opacity-90 shadow-md text-lg px-8 py-6 h-auto"
          >
            Get Started Now
          </Button>
        </div>
      </section>
    </div>
  );
};

export default Index;
