// CustomerLookup — home-tile page: type any phone number and cross-reference
// FieldRoutes to see if it appears as the PRIMARY or SECONDARY number (or a
// billing number) on any account.
//
// Data path: fieldroutes-customer-search edge function → Cloud Run
// /api/fr/customer-search, which detects a digits-only query and matches it
// against phone1 / phone2 / billing_phone / billing_phone2 in the synced
// FieldRoutes customers table, returning `matched_on` per account.
//
// Auth: read-only, PinGate staff name — same as the CustomerPicker.

import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Building2, Loader2, Phone, Search, User } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useCurrentStaff } from "@/hooks/useCurrentStaff";

type LookupResult = {
  customer_id: string;
  name: string;
  company_name?: string | null;
  email?: string | null;
  phone?: string | null;
  phone2?: string | null;
  billing_phone?: string | null;
  billing_phone2?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  status?: number | null;
  commercial?: boolean | null;
  matched_on?: string[];
};

const MATCH_LABELS: Record<string, string> = {
  primary: "Primary #",
  secondary: "Secondary #",
  billing: "Billing #",
  "billing 2nd": "Billing 2nd #",
};

// Primary/secondary are the answer the page exists for; billing hits are shown
// in a muted style so they read as "found, but not a main number".
const MATCH_STYLES: Record<string, string> = {
  primary: "bg-emerald-100 text-emerald-800 border-emerald-300",
  secondary: "bg-sky-100 text-sky-800 border-sky-300",
  billing: "bg-muted text-muted-foreground border-border",
  "billing 2nd": "bg-muted text-muted-foreground border-border",
};

function digitsOf(s: string): string {
  const d = s.replace(/\D/g, "");
  return d.length === 11 && d.startsWith("1") ? d.slice(1) : d;
}

function formatPhone(p?: string | null): string {
  if (!p) return "";
  const d = digitsOf(p);
  if (d.length === 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  return p;
}

function addressLine(c: LookupResult): string {
  return [c.address, [c.city, c.state].filter(Boolean).join(", "), c.zip]
    .filter(Boolean).join(" · ");
}

export default function CustomerLookup() {
  const navigate = useNavigate();
  const staff = useCurrentStaff();

  const [q, setQ] = useState("");
  const [results, setResults] = useState<LookupResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const digits = digitsOf(q);
  const searchable = digits.length >= 7;

  // Debounced lookup once the number is long enough (7+ digits).
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    setError(null);
    if (!searchable) { setResults([]); setSearched(false); return; }
    timer.current = setTimeout(async () => {
      setLoading(true);
      try {
        const { data, error: fnError } = await supabase.functions.invoke("fieldroutes-customer-search", {
          body: { q: digits, staffName: staff?.fullName ?? null, limit: 25 },
        });
        if (fnError || !data?.ok) {
          setResults([]);
          setError("Lookup failed — try again in a moment.");
        } else {
          setResults(data.results ?? []);
        }
        setSearched(true);
      } catch {
        setResults([]); setError("Lookup failed — try again in a moment."); setSearched(true);
      } finally {
        setLoading(false);
      }
    }, 350);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [digits, searchable, staff?.fullName]);

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto p-4 sm:p-6">
        <div className="flex items-center justify-between mb-6">
          <Button variant="ghost" onClick={() => navigate("/")}>
            <ArrowLeft className="w-4 h-4 mr-2" /> Back to home
          </Button>
        </div>

        <div className="mb-6">
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Phone className="w-6 h-6 text-teal-600" /> Customer Lookup
          </h1>
          <p className="text-muted-foreground mt-1">
            Type a phone number to check whether it's the primary or secondary
            number on any FieldRoutes account.
          </p>
        </div>

        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            autoFocus
            type="tel"
            inputMode="tel"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="e.g. (714) 555-1234"
            className="pl-9 text-lg h-12"
          />
          {loading && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />}
        </div>

        {!searchable && q.trim().length > 0 && (
          <p className="text-sm text-muted-foreground">Keep typing — at least 7 digits to search.</p>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}

        {searched && !loading && !error && results.length === 0 && (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              No FieldRoutes account has <span className="font-medium text-foreground">{formatPhone(digits)}</span> as
              a primary, secondary, or billing number.
            </CardContent>
          </Card>
        )}

        <div className="space-y-3">
          {results.map((c) => {
            const inactive = c.status !== 1;
            return (
              <Card key={c.customer_id} className={inactive ? "opacity-80" : ""}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    {c.commercial
                      ? <Building2 className="h-5 w-5 mt-0.5 text-amber-600 shrink-0" />
                      : <User className="h-5 w-5 mt-0.5 text-muted-foreground shrink-0" />}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="font-semibold text-foreground">
                          {c.name || c.company_name || "(no name)"}
                        </span>
                        <span className="text-xs text-muted-foreground">#{c.customer_id}</span>
                        <Badge variant="outline" className={inactive
                          ? "bg-muted text-muted-foreground border-border"
                          : "bg-emerald-50 text-emerald-700 border-emerald-200"}>
                          {inactive ? "Inactive" : "Active"}
                        </Badge>
                      </div>
                      {c.company_name && c.name && (
                        <div className="text-sm text-muted-foreground truncate">{c.company_name}</div>
                      )}
                      {addressLine(c) && (
                        <div className="text-sm text-muted-foreground truncate mt-0.5">{addressLine(c)}</div>
                      )}

                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {(c.matched_on ?? []).map((m) => (
                          <Badge key={m} variant="outline" className={MATCH_STYLES[m] ?? ""}>
                            Matches {MATCH_LABELS[m] ?? m}
                          </Badge>
                        ))}
                      </div>

                      <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-0.5 text-sm">
                        {c.phone && (
                          <div>
                            <span className="text-muted-foreground">Primary: </span>
                            <span className={c.matched_on?.includes("primary") ? "font-semibold" : ""}>
                              {formatPhone(c.phone)}
                            </span>
                          </div>
                        )}
                        {c.phone2 && (
                          <div>
                            <span className="text-muted-foreground">Secondary: </span>
                            <span className={c.matched_on?.includes("secondary") ? "font-semibold" : ""}>
                              {formatPhone(c.phone2)}
                            </span>
                          </div>
                        )}
                        {c.email && (
                          <div className="sm:col-span-2 truncate">
                            <span className="text-muted-foreground">Email: </span>{c.email}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
