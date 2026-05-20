// ScheduleReview — admin-only page that wraps the scheduling-review edge function.
// Shows compliance issues, route-order suggestions, miss-window flags, and
// per-tech-day snapshot for a configurable window.

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, ClipboardList } from "lucide-react";

import { useAdminSession } from "@/hooks/useAdminSession";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from "@/components/ui/tabs";

type ComplianceIssue = {
  kind: string; date: string; tech_name: string;
  customer?: string; city?: string; detail: string;
};
type RouteOrder = {
  current_drive_sec: number;
  optimized_drive_sec: number;
  savings_sec: number;
  current_sequence: string[];
  suggested_sequence: string[];
};
type MissWindowEntry = {
  customer: string; city: string; window: string;
  projected_arrival_min: number; late_by_min: number;
};
type Snapshot = {
  stops: number; total_miles: number; job_miles_first_to_last: number;
  total_drive_min: number; onsite_min: number; paperwork_min: number;
  est_completion_h: number; has_home: boolean;
};
type ReviewResult = {
  start: string; end: string;
  tech_filter: string | null;
  routes: { date: string; route_id: number; tech_name: string; stop_count: number; day_alert: string | null }[];
  compliance: ComplianceIssue[];
  route_order: Record<string, RouteOrder>;
  miss_window: Record<string, MissWindowEntry[]>;
  snapshot: Record<string, Snapshot>;
  empty?: boolean;
};

function fmtMinutes(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h > 0 ? `${h}h${m.toString().padStart(2, "0")}m` : `${m}m`;
}

function routeMeta(result: ReviewResult, key: string) {
  const [d, ridStr] = key.split("|");
  const rid = parseInt(ridStr, 10);
  return result.routes.find((r) => r.date === d && r.route_id === rid);
}

const ScheduleReview = () => {
  const session = useAdminSession();
  const navigate = useNavigate();

  const [days, setDays] = useState<number>(3);
  const [start, setStart] = useState<string>("");
  const [tech, setTech] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ReviewResult | null>(null);

  const run = async () => {
    if (session.status !== "valid") return;
    setLoading(true);
    setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("scheduling-review", {
        body: {
          sessionToken: session.token,
          start_date: start || null,
          days,
          tech: tech.trim() || null,
        },
      });
      if (error) throw error;
      if (!data?.ok) {
        toast.error(data?.error || "Failed to run review.");
        return;
      }
      setResult(data.result as ReviewResult);
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

  const orderEntries = result ? Object.entries(result.route_order) : [];
  const missWindowEntries = result
    ? Object.entries(result.miss_window).flatMap(([k, list]) => list.map((f) => [k, f] as const))
    : [];
  const snapEntries = result ? Object.entries(result.snapshot) : [];

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate("/admin")}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to admin
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ClipboardList className="w-5 h-5" />
              Schedule Review
            </CardTitle>
            <CardDescription>
              Compliance, route-order optimization, past-window risks, and a
              per-tech-day snapshot for any window.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label>Start date</Label>
                <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Days</Label>
                <Input type="number" min={1} max={14} value={days}
                       onChange={(e) => setDays(parseInt(e.target.value, 10) || 3)} />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>Tech filter (optional)</Label>
                <Input placeholder="e.g. Darrell"
                       value={tech} onChange={(e) => setTech(e.target.value)} />
              </div>
            </div>
            <Button onClick={run} disabled={loading} className="mt-4">
              {loading ? "Running…" : "Run review"}
            </Button>
          </CardContent>
        </Card>

        {result?.empty && (
          <Card>
            <CardContent className="py-6 text-center text-sm text-muted-foreground">
              No Pending appointments / routes between {result.start} and {result.end}.
            </CardContent>
          </Card>
        )}

        {result && !result.empty && (
          <Tabs defaultValue="compliance">
            <TabsList>
              <TabsTrigger value="compliance">
                Compliance ({result.compliance.length})
              </TabsTrigger>
              <TabsTrigger value="order">
                Route order ({orderEntries.length})
              </TabsTrigger>
              <TabsTrigger value="miss">
                Past window ({missWindowEntries.length})
              </TabsTrigger>
              <TabsTrigger value="snapshot">
                Snapshot ({snapEntries.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="compliance">
              <Card>
                <CardContent className="pt-6">
                  {result.compliance.length === 0 ? (
                    <p className="text-sm text-muted-foreground italic">No compliance issues.</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>Tech</TableHead>
                          <TableHead>Issue</TableHead>
                          <TableHead>Customer</TableHead>
                          <TableHead>Detail</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {result.compliance.slice(0, 50).map((i, idx) => (
                          <TableRow key={idx}>
                            <TableCell>{i.date}</TableCell>
                            <TableCell>{i.tech_name}</TableCell>
                            <TableCell>
                              <Badge variant="outline">{i.kind}</Badge>
                            </TableCell>
                            <TableCell className="text-xs">
                              {i.customer ?? "-"}
                              {i.city ? <> ({i.city})</> : null}
                            </TableCell>
                            <TableCell className="text-xs">{i.detail}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="order">
              <Card>
                <CardContent className="pt-6 space-y-4">
                  {orderEntries.length === 0 ? (
                    <p className="text-sm text-muted-foreground italic">
                      Every route is within 5 min of its 2-opt optimum.
                    </p>
                  ) : orderEntries.map(([key, s]) => {
                    const r = routeMeta(result, key);
                    return (
                      <div key={key} className="border rounded p-4 space-y-2">
                        <div className="flex items-center gap-2 flex-wrap text-sm">
                          <Badge>{r?.date}</Badge>
                          <span className="font-medium">{r?.tech_name}</span>
                          <span className="text-muted-foreground">{r?.stop_count} stops</span>
                          <span className="text-muted-foreground">·</span>
                          <span>{fmtMinutes(s.current_drive_sec / 60)} → {fmtMinutes(s.optimized_drive_sec / 60)}</span>
                          <Badge variant="default" className="ml-auto">
                            Saves {fmtMinutes(s.savings_sec / 60)}
                          </Badge>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Current: {s.current_sequence.join(" → ")}
                        </div>
                        <div className="text-xs font-medium">
                          Suggested: {s.suggested_sequence.join(" → ")}
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="miss">
              <Card>
                <CardContent className="pt-6">
                  {missWindowEntries.length === 0 ? (
                    <p className="text-sm text-muted-foreground italic">All scheduled times are reachable.</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>Tech</TableHead>
                          <TableHead>Customer</TableHead>
                          <TableHead>Window</TableHead>
                          <TableHead>Projected arrival</TableHead>
                          <TableHead>Late by</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {missWindowEntries.slice(0, 50).map(([key, f], idx) => {
                          const r = routeMeta(result, key);
                          const h = Math.floor(f.projected_arrival_min / 60);
                          const m = f.projected_arrival_min % 60;
                          return (
                            <TableRow key={idx}>
                              <TableCell>{r?.date}</TableCell>
                              <TableCell>{r?.tech_name}</TableCell>
                              <TableCell className="text-xs">{f.customer} ({f.city})</TableCell>
                              <TableCell className="font-mono text-xs">{f.window}</TableCell>
                              <TableCell className="font-mono text-xs">{h.toString().padStart(2, "0")}:{m.toString().padStart(2, "0")}</TableCell>
                              <TableCell className="font-bold text-destructive">{f.late_by_min} min</TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="snapshot">
              <Card>
                <CardContent className="pt-6">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Tech</TableHead>
                        <TableHead>Stops</TableHead>
                        <TableHead>Total miles (home→home)</TableHead>
                        <TableHead>Job miles</TableHead>
                        <TableHead>Drive</TableHead>
                        <TableHead>Onsite</TableHead>
                        <TableHead>Est completion</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {snapEntries.map(([key, s]) => {
                        const r = routeMeta(result, key);
                        return (
                          <TableRow key={key}>
                            <TableCell>{r?.date}</TableCell>
                            <TableCell>{r?.tech_name}</TableCell>
                            <TableCell>{s.stops}</TableCell>
                            <TableCell className="font-medium">
                              {s.has_home ? `${s.total_miles} mi` : <span className="text-muted-foreground italic">no home</span>}
                            </TableCell>
                            <TableCell>{s.job_miles_first_to_last} mi</TableCell>
                            <TableCell>{fmtMinutes(s.total_drive_min)}</TableCell>
                            <TableCell>{fmtMinutes(s.onsite_min)}</TableCell>
                            <TableCell className="font-bold">{s.est_completion_h}h</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        )}
      </div>
    </div>
  );
};

export default ScheduleReview;
