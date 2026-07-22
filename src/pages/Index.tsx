import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ClipboardList, FolderOpen, FileText, Archive, Building2, BookOpen, Lock, LogOut, MapPin, MessageSquare, Bug, Home as HomeIcon } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import crestLogo from "@/assets/crest-logo.png";
import crestBug from "@/assets/crest-bug.png";
import { supabase } from "@/integrations/supabase/client";
const reportTypes = [
  {
    id: "initial-pest",
    title: "Initial Pest Report",
    description: "Create a new initial service report",
    icon: ClipboardList,
    path: "/initial-pest-report",
    color: "text-emerald-600",
    bg: "bg-emerald-50",
    hoverBg: "hover:bg-emerald-100",
    border: "hover:border-emerald-300",
  },
  {
    id: "sales",
    title: "Archived Sales Report",
    description: "Legacy single-service report (archive only — do not create new)",
    icon: FileText,
    path: "/report",
    color: "text-blue-600",
    bg: "bg-blue-50",
    hoverBg: "hover:bg-blue-100",
    border: "hover:border-blue-300",
  },
  {
    id: "multi-sales",
    title: "Sales Report",
    description: "Create a multi-service sales proposal",
    icon: FileText,
    path: "/multi-proposal-report",
    color: "text-blue-600",
    bg: "bg-blue-50",
    hoverBg: "hover:bg-blue-100",
    border: "hover:border-blue-300",
  },
  {
    id: "client-portal",
    title: "Client Portal",
    description: "Manage commercial & property portals",
    icon: Building2,
    path: "/portal-admin",
    color: "text-amber-600",
    bg: "bg-amber-50",
    hoverBg: "hover:bg-amber-100",
    border: "hover:border-amber-300",
  },
  {
    id: "created-initial",
    title: "Created Initial Reports",
    description: "View and manage initial pest reports",
    icon: FolderOpen,
    path: "/submitted-reports",
    state: { filter: "initial" },
    color: "text-emerald-600",
    bg: "bg-emerald-50",
    hoverBg: "hover:bg-emerald-100",
    border: "hover:border-emerald-300",
  },
  {
    id: "created-sales",
    title: "Created Sales Reports",
    description: "View and manage sales reports",
    icon: Archive,
    path: "/submitted-reports",
    state: { filter: "sales" },
    color: "text-blue-600",
    bg: "bg-blue-50",
    hoverBg: "hover:bg-blue-100",
    border: "hover:border-blue-300",
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
];

// Layout: row1 = initial-pest, team-docs, multi-sales
//         row2 = created-initial, client-portal, created-sales
//         row3 = slot-finder, schedule-review
const gridOrder = [0, 6, 2, 4, 3, 5, 7, 8];

const Index = () => {
  const navigate = useNavigate();
  // Detect "is this device signed in as admin?" Optimistically check localStorage
  // for the admin_session token. Server-side validation happens when they
  // navigate to an admin route (via useAdminSession), so an expired token will
  // bounce to /admin-login at click time rather than silently failing here.
  const [isAdmin, setIsAdmin] = useState(false);
  const [showInitialVariantPicker, setShowInitialVariantPicker] = useState(false);
  const currentUser = sessionStorage.getItem("app_logged_in_user") || "";
  const RESTRICTED_USERS = new Set([
    "Michael Muniz",
    "Darrell Tanner",
    "Dylan Gallegos",
    "Jackson Latham",
    "Nick Stovall",
  ]);
  const RESTRICTED_CARDS = new Set(["slot-finder", "schedule-review"]);
  const isRestricted = RESTRICTED_USERS.has(currentUser);
  useEffect(() => {
    setIsAdmin(!!localStorage.getItem("admin_session"));
  }, []);

  const handleCardClick = (report: typeof reportTypes[0]) => {
    if (report.id === "initial-pest") {
      setShowInitialVariantPicker(true);
      return;
    }
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

      <div className="grid grid-cols-3 gap-4 max-w-4xl w-full">
        {gridOrder
          .map((idx) => reportTypes[idx])
          .filter((report) => !(isRestricted && RESTRICTED_CARDS.has(report.id)))
          .map((report) => {
          const Icon = report.icon;
          return (
            <Card
              key={report.id}
              className={`cursor-pointer ${report.border} hover:shadow-lg transition-all duration-200 group`}
              onClick={() => handleCardClick(report)}
            >
              <CardContent className="flex flex-col items-center justify-center p-8 text-center min-h-[220px]">
                <div className={`w-20 h-20 rounded-full ${report.bg} flex items-center justify-center mb-4 ${report.hoverBg} transition-colors`}>
                  <Icon className={`w-10 h-10 ${report.color}`} />
                </div>
                <h2 className="text-xl font-semibold text-foreground mb-1">{report.title}</h2>
                <p className="text-base text-muted-foreground leading-tight">{report.description}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Dialog open={showInitialVariantPicker} onOpenChange={setShowInitialVariantPicker}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Choose Initial Report Type</DialogTitle>
            <DialogDescription>
              Pick the type of initial service this report is for.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
            <button
              type="button"
              onClick={() => {
                setShowInitialVariantPicker(false);
                navigate("/initial-pest-report", { state: { variant: "general" } });
              }}
              className="group flex flex-col items-center text-center gap-3 rounded-xl border-2 border-border bg-card p-5 hover:border-emerald-400 hover:shadow-md transition-all"
            >
              <div className="w-14 h-14 rounded-full bg-emerald-50 group-hover:bg-emerald-100 flex items-center justify-center transition-colors">
                <Bug className="w-7 h-7 text-emerald-600" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground">General Pest / Bait Boxes</h3>
                <p className="text-xs text-muted-foreground mt-1 leading-snug">
                  Standard initial pest service report
                </p>
              </div>
            </button>
            <button
              type="button"
              onClick={() => {
                setShowInitialVariantPicker(false);
                navigate("/initial-pest-report", { state: { variant: "rodent-exclusion", targetPests: ["Rodents"] } });
              }}
              className="group flex flex-col items-center text-center gap-3 rounded-xl border-2 border-border bg-card p-5 hover:border-amber-400 hover:shadow-md transition-all"
            >
              <div className="w-14 h-14 rounded-full bg-amber-50 group-hover:bg-amber-100 flex items-center justify-center transition-colors">
                <HomeIcon className="w-7 h-7 text-amber-600" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground">Rodent Exclusion / Attic</h3>
                <p className="text-xs text-muted-foreground mt-1 leading-snug">
                  Photo-heavy exclusion & attic write-up
                </p>
              </div>
            </button>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
};

export default Index;
