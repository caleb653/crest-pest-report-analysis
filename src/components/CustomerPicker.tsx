// CustomerPicker — search the synced FieldRoutes customers and select one.
//
// Selecting a customer stamps the real FieldRoutes customer_id onto a report
// (so later writes target the right record, no duplicates) and autofills the
// customer's name / email / phone / address into the form.
//
// Auth: passes the PinGate staff name to the read-only fieldroutes-customer-search
// edge function. Safe to use on any PinGate page.

import { useEffect, useRef, useState } from "react";
import { Search, Check, X, Loader2, Building2, User, ExternalLink } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { lastServiceLabel } from "@/lib/lastService";
import { fetchLoginLinks, saveLoginLink } from "@/lib/frLoginLinks";
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
  /** Last COMPLETED visit (ISO date) + whether it was the initial → "last svc 8/12/26 (I)". */
  last_completed?: string | null;
  last_is_initial?: boolean | null;
};

type Props = {
  staffName?: string | null;
  /** Currently-linked FieldRoutes customer id (if the report is already linked). */
  linkedId?: string | null;
  /** Display label for the linked customer (e.g. name). */
  linkedLabel?: string | null;
  /** Portal loginLink for the linked customer — shows an "Open portal" button on the chip. */
  linkedLoginLink?: string | null;
  onSelect: (c: FRCustomer) => void;
  onClear?: () => void;
};

function cityLine(c: FRCustomer): string {
  return [c.address, [c.city, c.state].filter(Boolean).join(", "), c.zip]
    .filter(Boolean).join(" · ");
}

export default function CustomerPicker({ staffName, linkedId, linkedLabel, linkedLoginLink, onSelect, onClear }: Props) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<FRCustomer[]>([]);
  // customer_id -> portal loginLink from the fieldroutes_login_links cache. The
  // synced customer data carries no portal link, so this is the only way search
  // results learn one — it drives the "Portal" badge and enriches the selection.
  const [cachedLinks, setCachedLinks] = useState<Record<string, string>>({});
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

  // Enrich results with cached portal links (FieldRoutes-generated loginLinks
  // captured earlier via webhook or paste) so "has a portal" pops immediately.
  useEffect(() => {
    const missing = results.filter((c) => !c.loginLink).map((c) => c.customer_id);
    if (missing.length === 0) return;
    let cancelled = false;
    fetchLoginLinks(missing).then((map) => {
      if (!cancelled && Object.keys(map).length > 0) {
        setCachedLinks((prev) => ({ ...prev, ...map }));
      }
    });
    return () => { cancelled = true; };
  }, [results]);

  const portalLinkOf = (c: FRCustomer): string | null =>
    c.loginLink ?? cachedLinks[c.customer_id] ?? null;

  // Linked state: compact confirmation chip with a "Change" button.
  if (linkedId && !open) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm">
        <Check className="h-4 w-4 text-green-600 shrink-0" />
        <span className="flex-1 min-w-0 truncate">
          Linked to FieldRoutes customer <span className="font-medium">#{linkedId}</span>
          {linkedLabel ? ` — ${linkedLabel}` : ""}
        </span>
        {linkedLoginLink && (
          <Button asChild variant="outline" size="sm" className="h-7 px-2 gap-1 text-xs shrink-0">
            <a href={linkedLoginLink} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-3.5 w-3.5" /> Portal
            </a>
          </Button>
        )}
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
              onClick={() => {
                // Carry the portal link with the selection: upstream value if it
                // ever appears, else the cached FieldRoutes-generated link.
                if (c.loginLink) saveLoginLink(c.customer_id, c.loginLink, "customer-search");
                onSelect({ ...c, loginLink: portalLinkOf(c) });
                setOpen(false); setQ(""); setResults([]);
              }}
              className="w-full text-left px-3 py-2 hover:bg-muted flex items-start gap-2"
            >
              {c.commercial ? <Building2 className="h-4 w-4 mt-0.5 text-amber-600 shrink-0" />
                            : <User className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />}
              <div className="min-w-0">
                <div className="font-medium truncate">
                  {c.name || c.company_name || "(no name)"}
                  <span className="text-xs text-muted-foreground font-normal"> · #{c.customer_id}</span>
                  {portalLinkOf(c) && (
                    <span className="ml-1.5 inline-flex items-center rounded border border-emerald-200 bg-emerald-50 px-1 py-px text-[10px] font-medium text-emerald-700 align-middle">
                      Portal
                    </span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground truncate">
                  {cityLine(c)}
                  {lastServiceLabel(c) && (
                    <span title="Last completed visit. (I) = it was the initial → next visit slips ±5 like a monthly">
                      {cityLine(c) ? " · " : ""}{lastServiceLabel(c)}
                    </span>
                  )}
                </div>
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
