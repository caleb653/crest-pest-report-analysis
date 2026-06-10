// CustomerPicker — search the synced FieldRoutes customers and select one.
//
// Selecting a customer stamps the real FieldRoutes customer_id onto a report
// (so later writes target the right record, no duplicates) and autofills the
// customer's name / email / phone / address into the form.
//
// Auth: passes the PinGate staff name to the read-only fieldroutes-customer-search
// edge function. Safe to use on any PinGate page.

import { useEffect, useRef, useState } from "react";
import { Search, Check, X, Loader2, Building2, User } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export type FRCustomer = {
  customer_id: string;
  name: string;
  company_name?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  commercial?: boolean | null;
  /** FieldRoutes customer-portal URL ({loginlink} merge tag). */
  loginLink?: string | null;
};

type Props = {
  staffName?: string | null;
  /** Currently-linked FieldRoutes customer id (if the report is already linked). */
  linkedId?: string | null;
  /** Display label for the linked customer (e.g. name). */
  linkedLabel?: string | null;
  onSelect: (c: FRCustomer) => void;
  onClear?: () => void;
};

function cityLine(c: FRCustomer): string {
  return [c.address, [c.city, c.state].filter(Boolean).join(", "), c.zip]
    .filter(Boolean).join(" · ");
}

export default function CustomerPicker({ staffName, linkedId, linkedLabel, onSelect, onClear }: Props) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<FRCustomer[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced search.
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    const query = q.trim();
    if (query.length < 2) { setResults([]); setSearched(false); return; }
    timer.current = setTimeout(async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase.functions.invoke("fieldroutes-customer-search", {
          body: { q: query, staffName, limit: 15 },
        });
        if (error || !data?.ok) { setResults([]); }
        else setResults(data.results ?? []);
        setSearched(true);
      } catch {
        setResults([]); setSearched(true);
      } finally {
        setLoading(false);
      }
    }, 350);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [q, staffName]);

  // Linked state: compact confirmation chip with a "Change" button.
  if (linkedId && !open) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm">
        <Check className="h-4 w-4 text-green-600 shrink-0" />
        <span className="flex-1 min-w-0 truncate">
          Linked to FieldRoutes customer <span className="font-medium">#{linkedId}</span>
          {linkedLabel ? ` — ${linkedLabel}` : ""}
        </span>
        <Button type="button" variant="ghost" size="sm" className="h-7 px-2"
          onClick={() => { setOpen(true); setQ(""); setResults([]); setSearched(false); }}>
          Change
        </Button>
        {onClear && (
          <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0"
            onClick={() => onClear()} aria-label="Unlink">
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          autoFocus={open}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search FieldRoutes customer by name, company, address, email…"
          className="pl-9"
        />
        {loading && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />}
      </div>

      {q.trim().length >= 2 && (
        <div className="rounded-md border max-h-72 overflow-y-auto divide-y">
          {results.map((c) => (
            <button
              type="button"
              key={c.customer_id}
              onClick={() => { onSelect(c); setOpen(false); setQ(""); setResults([]); }}
              className="w-full text-left px-3 py-2 hover:bg-muted flex items-start gap-2"
            >
              {c.commercial ? <Building2 className="h-4 w-4 mt-0.5 text-amber-600 shrink-0" />
                            : <User className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />}
              <div className="min-w-0">
                <div className="font-medium truncate">
                  {c.name || c.company_name || "(no name)"}
                  <span className="text-xs text-muted-foreground font-normal"> · #{c.customer_id}</span>
                </div>
                <div className="text-xs text-muted-foreground truncate">{cityLine(c)}</div>
                {(c.email || c.phone) && (
                  <div className="text-xs text-muted-foreground truncate">
                    {[c.email, c.phone].filter(Boolean).join(" · ")}
                  </div>
                )}
              </div>
            </button>
          ))}
          {!loading && searched && results.length === 0 && (
            <div className="px-3 py-3 text-sm text-muted-foreground">
              No FieldRoutes customer found. Check spelling, or proceed without linking
              (you can create them in FieldRoutes separately).
            </div>
          )}
        </div>
      )}
    </div>
  );
}
