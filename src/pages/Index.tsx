import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ClipboardList, FileText, Building2, BookOpen, Lock, LogOut, MapPin, Trophy, Phone, Brain } from "lucide-react";
import crestLogo from "@/assets/crest-logo.png";
import crestBug from "@/assets/crest-bug.png";
import { supabase } from "@/integrations/supabase/client";

// Consolidated: "Initial Reports" and "Sales Reports" each open the Created
// Reports list (filtered to that type), where a prominent Create button at the
// top lets you start a new one. This keeps the home screen to one card per
// report family instead of separate Create / Created cards.
const reportTypes = [
  {
    id: "initial-reports",
    title: "Initial Reports",
    description: "Create & manage initial service reports",
    icon: ClipboardList,
    path: "/submitted-reports",
    state: { filter: "initial" },
    color: "text-emerald-600",
    bg: "bg-emerald-50",
    hoverBg: "hover:bg-emerald-100",
    border: "hover:border-emerald-300",
  },
  {
    id: "sales-reports",
    title: "Sales Reports",
    description: "Create & manage sales proposals",
    icon: FileText,
    path: "/submitted-reports",
    state: { filter: "sales" },
    color: "text-blue-600",
    bg: "bg-blue-50",
    hoverBg: "hover:bg-blue-100",
    border: "hover:border-blue-300",
  },
  {
    id: "client-portal",
    title: "Client Portals",
    description: "Manage commercial & property portals",
    icon: Building2,
    path: "/portal-admin",
    color: "text-amber-600",
    bg: "bg-amber-50",
    hoverBg: "hover:bg-amber-100",
    border: "border-2 border-amber-400 hover:border-amber-500",
  },
  {
    id: "team-docs",
    title: "Crest Team Docs",
    description: "Internal team documents & resources",
    icon: BookOpen,
    path: "/team-docs",
    color: "text-violet-600",
    bg: "bg-violet-50",
    hoverBg: "hover:bg-violet-100",
    border: "hover:border-violet-300",
  },
  {
    id: "slot-finder",
    title: "Slot Finder",
    description: "Best slot in next 24h / 72h for a new address",
    icon: MapPin,
    path: "/slot-finder",
    color: "text-rose-600",
    bg: "bg-rose-50",
    hoverBg: "hover:bg-rose-100",
    border: "hover:border-rose-300",
  },
  {
    id: "schedule-review",
    title: "Schedule Review / Fill",
    description: "Review routes, or fill future days from the due pool",
    icon: ClipboardList,
    path: "/schedule-review",
    color: "text-indigo-600",
    bg: "bg-indigo-50",
    hoverBg: "hover:bg-indigo-100",
    border: "hover:border-indigo-300",
  },
  {
    id: "competition",
    title: "Competition",
    description: "Company scoreboards — team & sales competitions",
    icon: Trophy,
    path: "/competition",
    color: "text-amber-600",
    bg: "bg-amber-50",
    hoverBg: "hover:bg-amber-100",
    border: "hover:border-amber-300",
  },
  {
    id: "customer-lookup",
    title: "Customer Lookup",
    description: "Check a phone number against FieldRoutes accounts",
    icon: Phone,
    path: "/customer-lookup",
    color: "text-teal-600",
    bg: "bg-teal-50",
    hoverBg: "hover:bg-teal-100",
    border: "hover:border-teal-300",
  },
  {
    id: "crest-brain",
    title: "Crest Brain",
    description: "Ask anything about how Crest works — answers from the Brain Trust",
    icon: Brain,
    path: "/crest-brain",
    color: "text-emerald-700",
    bg: "bg-emerald-50",
    hoverBg: "hover:bg-emerald-100",
    border: "hover:border-emerald-300",
  },
];

const Index = () => {
  const navigate = useNavigate();
  // Detect "is this device signed in as admin?" Optimistically check localStorage
  // for the admin_session token. Server-side validation happens when they
  // navigate to an admin route (via useAdminSession), so an expired token will
  // bounce to /admin-login at click time rather than silently failing here.
  const [isAdmin, setIsAdmin] = useState(false);
  const currentUser = sessionStorage.getItem("app_logged_in_user") || "";
  const RESTRICTED_USERS = new Set([
    "Michael Muniz",
    "Darrell Tanner",
    "Dylan Gallegos",
    "Jackson Latham",
    "Nick Stovall",
    "Brock Lyttle",
    "Joseph Ibarbo",
  ]);
  // Slot Finder is open to the whole team; only Schedule Review stays limited.
  const RESTRICTED_CARDS = new Set(["schedule-review"]);
  const isRestricted = RESTRICTED_USERS.has(currentUser);
  useEffect(() => {
    setIsAdmin(!!localStorage.getItem("admin_session"));
  }, []);

  const handleCardClick = (report: typeof reportTypes[0]) => {
    if ("state" in report && report.state) {
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
      {/* Discreet admin entry. When already signed in, goes straight to the
          dashboard; otherwise opens the password prompt. Lives behind the PIN
          gate, so clients/tenants never see this anyway. */}
      <Button
        variant="ghost"
        size="sm"
        onClick={async () => {
          if (!isAdmin) { navigate("/admin-login"); return; }
          const t = localStorage.getItem("admin_session");
          if (t) {
            try { await supabase.functions.invoke("invalidate-admin-session", { body: { sessionToken: t } }); } catch {}
          }
          localStorage.removeItem("admin_session");
          setIsAdmin(false);
        }}
        className="absolute top-4 right-4 text-muted-foreground hover:text-foreground"
      >
        {isAdmin ? <LogOut className="w-4 h-4 mr-2" /> : <Lock className="w-4 h-4 mr-2" />}
        {isAdmin ? "Sign out (admin)" : "Admin"}
      </Button>
      <div className="text-center mb-10">
        <img
          src={crestLogo}
          alt="Crest Pest Control"
          className="h-28 mx-auto mb-4"
        />
        <h1 className="text-3xl font-bold text-foreground mb-2">The Crest App</h1>
        <p className="text-muted-foreground">Select an option to get started</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 max-w-4xl w-full">
        {reportTypes
          .filter((report) => !(isRestricted && RESTRICTED_CARDS.has(report.id)))
          .map((report) => {
          const Icon = report.icon;
          return (
            <Card
              key={report.id}
              className={`cursor-pointer ${report.border} hover:shadow-lg transition-all duration-200 group`}
              onClick={() => handleCardClick(report)}
            >
              <CardContent className="flex flex-col items-center justify-center p-3 sm:p-8 text-center min-h-[120px] sm:min-h-[220px]">
                <div className={`w-12 h-12 sm:w-20 sm:h-20 rounded-full ${report.bg} flex items-center justify-center mb-2 sm:mb-4 ${report.hoverBg} transition-colors`}>
                  <Icon className={`w-6 h-6 sm:w-10 sm:h-10 ${report.color}`} />
                </div>
                <h2 className="text-sm sm:text-xl font-semibold text-foreground mb-1 leading-tight">{report.title}</h2>
                <p className="hidden sm:block text-base text-muted-foreground leading-tight">{report.description}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
};

export default Index;
