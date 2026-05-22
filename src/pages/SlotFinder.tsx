// SlotFinder — admin-only page that wraps the scheduling-find-slot edge function.
// User enters an address (+ optional time window) and gets the 2 best slot
// recommendations for the next 24 hours and the next 72 hours.

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, MapPin } from "lucide-react";

import { useCurrentStaff } from "@/hooks/useCurrentStaff";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

type SlotCandidate = {
  score_sec: number;
  extra_sec_haversine: number;
  extra_sec_gmaps?: number | null;
  extra_miles_haversine: number;
  est_min: number | null;
  route_date: string;
  tech_name: string;
  prev_stop: { customer_name: string; city: string; start_time: string; end_time: string };
  next_stop: { customer_name: string; city: string; start_time: string; end_time: string };
};

type SlotResult = {
  address: string;
  geocoded: { lat: number; lng: number; formatted: string };
  today: string;
  h24_end: string;
  h72_end: string;
  horizon_24h: SlotCandidate[];
  horizon_72h: SlotCandidate[];
  routes_scored: number;
  stops_in_horizon: number;
  error?: string;
};

function fmtTime(minSinceMidnight: number | null): string {
  if (minSinceMidnight === null || minSinceMidnight === undefined) return "?";
  const h24 = Math.floor(minSinceMidnight / 60);
  const m = minSinceMidnight % 60;
  const h12 = h24 % 12 || 12;
  const ampm = h24 < 12 ? "AM" : "PM";
  return `${h12}:${m.toString().padStart(2, "0")} ${ampm}`;
}

function fmtHHMMSS(s: string | null | undefined): string {
  // FieldRoutes returns "13:00:00"; convert to "1:00 PM"
  if (!s) return "?";
  const [hStr, mStr] = s.split(":");
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  if (Number.isNaN(h) || Number.isNaN(m)) return s;
  return fmtTime(h * 60 + m);
}

function fmtWindow(start: string | null | undefined, end: string | null | undefined): string {
  if (!start || !end) return "?";
  return `${fmtHHMMSS(start)} – ${fmtHHMMSS(end)}`;
}

function fmtDetour(c: SlotCandidate): string {
  const sec = c.extra_sec_gmaps ?? c.extra_sec_haversine;
  const min = Math.round(sec / 60);
  const miles = c.extra_miles_haversine.toFixed(1);
  const src = c.extra_sec_gmaps != null ? "Maps" : "HV";
  return `+${min} min (${src}) / +${miles} mi`;
}

// Drive-time tiers based on EXTRA DRIVE MINUTES added by this insertion.
// Prefer Google Maps duration when available; fall back to Haversine estimate.
//   <  5 min  → ON ROUTE        (emerald, very green)
//   <  10 min → green
//   <  15 min → yellow
//   <  20 min → LONG DRIVE      (amber/orange)
//   ≥ 20 min → VERY LONG DRIVE (red)
type DriveTier = "on_route" | "near" | "edge" | "long" | "very_long";

function detourMinutes(c: SlotCandidate): number {
  const sec = c.extra_sec_gmaps ?? c.extra_sec_haversine;
  return Math.round(sec / 60);
}

function driveTier(c: SlotCandidate): DriveTier {
  const min = detourMinutes(c);
  if (min >= 20) return "very_long";
  if (min >= 15) return "long";
  if (min >= 10) return "edge";
  if (min >= 5)  return "near";
  return "on_route";
}

function rowClass(c: SlotCandidate): string {
  switch (driveTier(c)) {
    case "very_long": return "bg-red-100 hover:bg-red-200";
    case "long":      return "bg-amber-50 hover:bg-amber-100";
    case "edge":      return "bg-yellow-50 hover:bg-yellow-100";
    case "near":      return "bg-green-50 hover:bg-green-100";
    case "on_route":  return "bg-emerald-100 hover:bg-emerald-200";
  }
}

function DriveBadge({ c }: { c: SlotCandidate }) {
  switch (driveTier(c)) {
    case "very_long":
      return (
        <Badge className="ml-2 bg-red-600 text-white hover:bg-red-700 font-bold">
          VERY LONG DRIVE
        </Badge>
      );
    case "long":
      return (
        <Badge className="ml-2 bg-amber-500 text-white hover:bg-amber-600 font-semibold">
          LONG DRIVE
        </Badge>
      );
    case "on_route":
      return (
        <Badge className="ml-2 bg-emerald-600 text-white hover:bg-emerald-700 font-semibold">
          ON ROUTE
        </Badge>
      );
    default:
      return null;
  }
}

const SlotFinder = () => {
  const staff = useCurrentStaff();
  const navigate = useNavigate();

  const [address, setAddress] = useState("");
  const [window, setWindow] = useState<string>("none");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SlotResult | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!staff) {
      toast.error("Please sign in again.");
      return;
    }
    if (address.trim().length < 4) {
      toast.error("Please enter a full street address.");
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("scheduling-find-slot", {
        body: {
          staffName: staff.fullName,
          address: address.trim(),
          window: window === "none" ? null : window,
          use_google: true,
        },
      });
      if (error) throw error;
      if (!data?.ok) {
        toast.error(data?.detail?.detail || data?.error || "Failed to find slots.");
        return;
      }
      setResult(data.result as SlotResult);
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || "Unexpected error.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate("/")}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to home
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="w-5 h-5" />
              Slot Finder
            </CardTitle>
            <CardDescription>
              Enter a service address. Returns the 2 best slot picks in the
              next 24 hours and the next 3 business days, ranked by detour
              distance (traffic-aware via Google Distance Matrix).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="address">Service address</Label>
                <Input
                  id="address"
                  placeholder="e.g. 9 Harrisburg, Irvine CA 92620"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="space-y-2 md:w-64">
                <Label>Preferred window (optional)</Label>
                <Select value={window} onValueChange={setWindow}>
                  <SelectTrigger>
                    <SelectValue placeholder="Any time" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Any time</SelectItem>
                    <SelectItem value="AM">AM (8 AM – 12 PM)</SelectItem>
                    <SelectItem value="PM">PM (12 PM – 5 PM)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button type="submit" disabled={loading} className="w-full md:w-auto">
                {loading ? "Searching…" : "Find slots"}
              </Button>
            </form>
          </CardContent>
        </Card>

        {result && (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Next 24 hours ({result.today} → {result.h24_end})
                </CardTitle>
                <CardDescription>
                  Scored {result.routes_scored} routes / {result.stops_in_horizon} stops
                  in the horizon. Geocoded to{" "}
                  <code>{result.geocoded.lat.toFixed(4)}, {result.geocoded.lng.toFixed(4)}</code>.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <SlotTable rows={result.horizon_24h} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Next 3 business days ({result.today} → {result.h72_end})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <SlotTable rows={result.horizon_72h} />
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
};

function SlotTable({ rows }: { rows: SlotCandidate[] }) {
  if (!rows || rows.length === 0) {
    return <p className="text-sm text-muted-foreground italic">No slots found in this window.</p>;
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Rank</TableHead>
          <TableHead>Date</TableHead>
          <TableHead>Tech</TableHead>
          <TableHead>Window</TableHead>
          <TableHead>Inserts between</TableHead>
          <TableHead>Detour</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((c, i) => (
          <TableRow key={i} className={rowClass(c)}>
            <TableCell><Badge variant="secondary">{i + 1}</Badge></TableCell>
            <TableCell>{c.route_date}</TableCell>
            <TableCell className="font-medium">{c.tech_name}</TableCell>
            <TableCell className="font-medium">{fmtWindow(c.next_stop.start_time, c.next_stop.end_time)}</TableCell>
            <TableCell className="text-xs">
              {c.prev_stop.customer_name} ({c.prev_stop.city})
              <br />→ {c.next_stop.customer_name} ({c.next_stop.city})
            </TableCell>
            <TableCell className="font-mono text-xs whitespace-nowrap">
              {fmtDetour(c)}
              <DriveBadge c={c} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export default SlotFinder;
