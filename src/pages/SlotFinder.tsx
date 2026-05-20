// SlotFinder — admin-only page that wraps the scheduling-find-slot edge function.
// User enters an address (+ optional time window) and gets the 2 best slot
// recommendations for the next 24 hours and the next 72 hours.

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, MapPin } from "lucide-react";

import { useAdminSession } from "@/hooks/useAdminSession";
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
  prev_stop: { customer_name: string; city: string; start_time: string };
  next_stop: { customer_name: string; city: string; start_time: string };
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
  const h12 = ((minSinceMidnight / 60) | 0) % 12 || 12;
  const m = minSinceMidnight % 60;
  const ampm = (minSinceMidnight / 60) | 0 < 12 ? "AM" : "PM";
  return `${h12}:${m.toString().padStart(2, "0")} ${ampm}`;
}

function fmtDetour(c: SlotCandidate): string {
  const sec = c.extra_sec_gmaps ?? c.extra_sec_haversine;
  const min = Math.round(sec / 60);
  const miles = c.extra_miles_haversine.toFixed(1);
  const src = c.extra_sec_gmaps != null ? "Maps" : "HV";
  return `+${min} min (${src}) / +${miles} mi`;
}

const SlotFinder = () => {
  const session = useAdminSession();
  const navigate = useNavigate();

  const [address, setAddress] = useState("");
  const [window, setWindow] = useState<string>("none");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SlotResult | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (session.status !== "valid") return;
    if (address.trim().length < 4) {
      toast.error("Please enter a full street address.");
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("scheduling-find-slot", {
        body: {
          sessionToken: session.token,
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

  if (session.status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="h-8 w-8 rounded-full border-2 border-muted border-t-foreground animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate("/admin")}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to admin
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
              next 24 hours and the next 72 hours, ranked by detour distance
              (traffic-aware via Google Distance Matrix).
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
                  Next 72 hours ({result.today} → {result.h72_end})
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
          <TableHead>Approx time</TableHead>
          <TableHead>Inserts between</TableHead>
          <TableHead>Detour</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((c, i) => (
          <TableRow key={i}>
            <TableCell><Badge variant="secondary">{i + 1}</Badge></TableCell>
            <TableCell>{c.route_date}</TableCell>
            <TableCell className="font-medium">{c.tech_name}</TableCell>
            <TableCell>{fmtTime(c.est_min)}</TableCell>
            <TableCell className="text-xs">
              {c.prev_stop.customer_name} ({c.prev_stop.city}, {c.prev_stop.start_time})
              <br />→ {c.next_stop.customer_name} ({c.next_stop.city}, {c.next_stop.start_time})
            </TableCell>
            <TableCell className="font-mono text-xs">{fmtDetour(c)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export default SlotFinder;
