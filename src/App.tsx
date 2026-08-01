import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import PinGate from "./components/PinGate";

// Code-split every heavy route so the initial bundle (the landing page) stays
// tiny. Each page only downloads when the user actually navigates to it,
// dramatically improving cold-load time without changing any functionality.
const SelectTechnician     = lazy(() => import("./pages/SelectTechnician"));
const DataEntry            = lazy(() => import("./pages/DataEntry"));
const Report               = lazy(() => import("./pages/Report"));
const InitialPestReport    = lazy(() => import("./pages/InitialPestReport"));
const MultiProposalReport  = lazy(() => import("./pages/MultiProposalReport"));
const TeamDocs             = lazy(() => import("./pages/TeamDocs"));
const Competition          = lazy(() => import("./pages/Competition"));
const SubmittedReports     = lazy(() => import("./pages/SubmittedReports"));
const CustomerReportView   = lazy(() => import("./pages/CustomerReportView"));
const NotFound             = lazy(() => import("./pages/NotFound"));
const PortalAdmin          = lazy(() => import("./pages/PortalAdmin"));
const ClientPortal         = lazy(() => import("./pages/ClientPortal"));
const TenantPortal         = lazy(() => import("./pages/TenantPortal"));
const PMPortal             = lazy(() => import("./pages/PMPortal"));
const AppointmentReport    = lazy(() => import("./pages/AppointmentReport"));
const RightToTreat         = lazy(() => import("./pages/RightToTreat"));
const SurveyTake           = lazy(() => import("./pages/SurveyTake"));
const Notifications        = lazy(() => import("./pages/Notifications"));
const PreApplicationNoticePage = lazy(() => import("./pages/PreApplicationNoticePage"));
const SlotFinder           = lazy(() => import("./pages/SlotFinder"));
const ScheduleReview       = lazy(() => import("./pages/ScheduleReview"));
const AdminLogin           = lazy(() => import("./pages/AdminLogin"));

const queryClient = new QueryClient();

// Lightweight, brand-neutral fallback while a route's chunk is downloading.
// Intentionally minimal so it doesn't add weight to the initial bundle.
const RouteFallback = () => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <div className="h-8 w-8 rounded-full border-2 border-muted border-t-foreground animate-spin" aria-label="Loading" />
  </div>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            {/* Public routes - no PIN required */}
            <Route path="/view-report/:reportId" element={<CustomerReportView />} />
            <Route path="/portal/:token" element={<ClientPortal />} />
            <Route path="/tenant/:token" element={<TenantPortal />} />
            <Route path="/pm/:token" element={<PMPortal />} />
            <Route path="/appointment-report/:serviceId" element={<AppointmentReport />} />
            <Route path="/portal-admin" element={<PortalAdmin />} />
            <Route path="/right-to-treat/:token" element={<RightToTreat />} />
            <Route path="/survey/:token" element={<SurveyTake />} />
            <Route path="/pre-application/:propertyId" element={<PreApplicationNoticePage />} />
            {/* Admin routes — each page guards itself via useAdminSession()
                / validate-admin-session edge function. No PIN required so
                office staff who don't know the PIN can still sign in. */}
            <Route path="/admin-login" element={<AdminLogin />} />
            {/* All other routes require PIN */}
            <Route path="*" element={
              <PinGate>
                <Suspense fallback={<RouteFallback />}>
                  <Routes>
                    <Route path="/" element={<Index />} />
                    <Route path="/select-technician" element={<SelectTechnician />} />
                    <Route path="/data-entry" element={<DataEntry />} />
                    <Route path="/report" element={<Report />} />
                    <Route path="/report/:reportId" element={<Report />} />
                    <Route path="/multi-proposal-report" element={<MultiProposalReport />} />
                    <Route path="/multi-proposal-report/:reportId" element={<MultiProposalReport />} />
                    <Route path="/initial-pest-report" element={<InitialPestReport />} />
                    <Route path="/initial-pest-report/:reportId" element={<InitialPestReport />} />
                    <Route path="/submitted-reports" element={<SubmittedReports />} />
                    <Route path="/portal-admin" element={<PortalAdmin />} />
                    <Route path="/team-docs" element={<TeamDocs />} />
                    <Route path="/competition" element={<Competition />} />
                    <Route path="/notifications" element={<Notifications />} />
                    <Route path="/slot-finder" element={<SlotFinder />} />
                    <Route path="/schedule-review" element={<ScheduleReview />} />
                    <Route path="*" element={<NotFound />} />
                  </Routes>
                </Suspense>
              </PinGate>
            } />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
