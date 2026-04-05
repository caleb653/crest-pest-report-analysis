import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import SelectTechnician from "./pages/SelectTechnician";
import DataEntry from "./pages/DataEntry";
import Report from "./pages/Report";
import InitialPestReport from "./pages/InitialPestReport";
import SubmittedReports from "./pages/SubmittedReports";
import CustomerReportView from "./pages/CustomerReportView";
import NotFound from "./pages/NotFound";
import PinGate from "./components/PinGate";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          {/* Public customer portal - no PIN required */}
          <Route path="/view-report/:reportId" element={<CustomerReportView />} />
          {/* All other routes require PIN */}
          <Route path="*" element={
            <PinGate>
              <Routes>
                <Route path="/" element={<Index />} />
                <Route path="/select-technician" element={<SelectTechnician />} />
                <Route path="/data-entry" element={<DataEntry />} />
                <Route path="/report" element={<Report />} />
                <Route path="/report/:reportId" element={<Report />} />
                <Route path="/initial-pest-report" element={<InitialPestReport />} />
                <Route path="/initial-pest-report/:reportId" element={<InitialPestReport />} />
                <Route path="/submitted-reports" element={<SubmittedReports />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </PinGate>
          } />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
