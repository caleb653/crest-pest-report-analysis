import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { ClipboardList, FileText, Shield } from "lucide-react";
import crestLogo from "@/assets/crest-logo.png";
import crestBug from "@/assets/crest-bug.png";

const reportTypes = [
  {
    id: "initial-pest",
    title: "Initial Pest Report",
    description: "Complete pest inspection and treatment documentation",
    icon: ClipboardList,
    path: "/initial-pest-report",
    state: null,
  },
  {
    id: "sales",
    title: "Sales Report",
    description: "Sales consultation and proposal documentation",
    icon: FileText,
    path: "/report",
    state: null,
  },
  {
    id: "admin",
    title: "Admin Portal",
    description: "View and manage all submitted reports",
    icon: Shield,
    path: "/admin-login",
    state: null,
  },
];

const Index = () => {
  const navigate = useNavigate();

  const handleCardClick = (report: typeof reportTypes[0]) => {
    if (report.state) {
      navigate(report.path, { state: report.state });
    } else {
      navigate(report.path);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 relative overflow-hidden">
      <img 
        src={crestBug} 
        alt="" 
        className="absolute bottom-4 right-4 w-24 h-auto opacity-30"
      />
      <div className="text-center mb-10">
        <img 
          src={crestLogo} 
          alt="Crest Pest Control" 
          className="h-28 mx-auto mb-4"
        />
        <h1 className="text-3xl font-bold text-foreground mb-2">Service Reports</h1>
        <p className="text-muted-foreground">Select a report type to get started</p>
      </div>

      <div className="grid grid-cols-2 gap-4 max-w-2xl w-full">
        {reportTypes.map((report) => {
          const Icon = report.icon;
          return (
            <Card
              key={report.id}
              className="cursor-pointer hover:border-primary/50 hover:shadow-lg transition-all duration-200 group"
              onClick={() => handleCardClick(report)}
            >
              <CardContent className="flex flex-col items-center justify-center p-6 text-center min-h-[180px]">
                <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
                  <Icon className="w-10 h-10 text-primary" />
                </div>
                <h2 className="font-semibold text-foreground mb-1">{report.title}</h2>
                <p className="text-xs text-muted-foreground leading-tight">{report.description}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
};

export default Index;
