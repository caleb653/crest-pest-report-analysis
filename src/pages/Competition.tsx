// Competition — two company scoreboards on one page (home tile).
//
// Slot 1: general competition — one editable score per person.
// Slot 2: SALES competition — each person's score IS their list of sale
//         names (score = count); the names show under their bar.
//
// Anyone can view. Editing (competition name + scores/sales) unlocks with the
// shared password. Charts follow the dataviz method: single-series magnitude →
// vertical bars in ONE hue (identity lives in the name labels, so no legend),
// thin marks with rounded tops anchored to the baseline, 2px gaps, values
// direct-labeled (a scoreboard's whole point), text in text tokens.

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { AlertTriangle, ArrowLeft, Crown, Lock, Pencil, Plus, RefreshCw, Sparkles, Star, Trophy, Unlock, X } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { STAFF_NAMES } from "@/lib/staffRoster";
import { useCurrentStaff } from "@/hooks/useCurrentStaff";

// Everyone at the company (login roster is the source of truth).
const PEOPLE = Array.from(new Set(STAFF_NAMES));

const EDIT_PASSWORD = "18444";

type Entry = { score: number; sales: string[] };
type Competition = {
  id: string;
  slot: number;
  name: string;
  is_sales: boolean;
  entries: Record<string, Entry>;
};

const entryOf = (c: Competition, person: string): Entry => {
  const e = (c.entries || {})[person] || {};
  const sales = Array.isArray((e as Entry).sales) ? (e as Entry).sales : [];
  const score = c.is_sales ? sales.length : Number((e as Entry).score) || 0;
  return { score, sales };
};

const firstName = (full: string) => full.split(" ")[0];

// ── Competition period ───────────────────────────────────────────────────────
// Both auto boards (reviews + self-gen sales) and the leaders banner use ONE
// window. Default = the current competition (Aug 5 – Sep 30 2026). Editable
// while unlocked; the override is persisted on the slot-1 competitions row
// under the reserved `_period` key (no schema change needed).
const DEFAULT_PERIOD = { start: "2026-08-05", end: "2026-09-30" };
type Period = { start: string; end: string };
const PERIOD_KEY = "_period";

const PERIOD_LS_KEY = "competition_period";
const okDate = (v: unknown) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
const asPeriod = (raw: any): Period | null =>
  raw && okDate(raw.start) && okDate(raw.end) ? { start: raw.start, end: raw.end } : null;

const readPeriod = (comps: Competition[]): Period => {
  const row = comps.find((c) => c.slot === 1) ?? comps[0];
  const shared = asPeriod((row?.entries as any)?.[PERIOD_KEY]);
  if (shared) return shared;
  // No competitions row (table missing / never seeded): fall back to a
  // per-browser override so the period can still be changed.
  try {
    const local = asPeriod(JSON.parse(localStorage.getItem(PERIOD_LS_KEY) || "null"));
    if (local) return local;
  } catch { /* ignore */ }
  return DEFAULT_PERIOD;
};

const longDate = (iso: string) => {
  const d = new Date(`${iso}T12:00:00`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};
const periodLabel = (p: Period) => `${longDate(p.start)} – ${longDate(p.end)}, ${p.end.slice(0, 4)}`;

// ── Leaders banner ───────────────────────────────────────────────────────────
type Leader = { name: string; value: number } | null;
const topTwo = (rows: { name: string; value: number }[]): [Leader, Leader] => {
  const sorted = [...rows].filter((r) => r.value > 0).sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
  return [sorted[0] ?? null, sorted[1] ?? null];
};

function LeaderTile({ icon, title, unit, rows, loading }: {
  icon: ReactNode; title: string; unit: string; rows: { name: string; value: number }[]; loading: boolean;
}) {
  const [first, second] = topTwo(rows);
  const tied = first && second && first.value === second.value;
  return (
    <div className="flex-1 min-w-[220px] rounded-xl border-2 border-amber-300/70 bg-gradient-to-br from-amber-50 to-background dark:from-amber-950/30 p-4">
      <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-amber-800 dark:text-amber-300">
        {icon} {title}
      </p>
      {loading && rows.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">Loading…</p>
      ) : !first ? (
        <p className="mt-2 text-sm text-muted-foreground">Nothing yet this period.</p>
      ) : (
        <>
          <p className="mt-1.5 flex items-baseline gap-2">
            <Crown className="w-5 h-5 text-amber-500 self-center" />
            <span className="text-2xl font-bold text-foreground leading-none">{first.name}</span>
          </p>
          <p className="mt-1 text-sm text-foreground">
            <span className="font-bold tabular-nums">{first.value}</span> {unit}
            {tied && <span className="text-muted-foreground"> · tied with {firstName(second!.name)}</span>}
          </p>
          {second && !tied && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              Next: {firstName(second.name)} with {second.value} · {first.value - second.value} behind
            </p>
          )}
        </>
      )}
    </div>
  );
}

// ── Reviews (auto from Google + Yelp name mentions) ──────────────────────────
type ReviewMention = { review_date: string | null; platform: string; location: string | null; reviewer: string | null; stars: number | null; recommended: boolean | null };
type ReviewsResult = {
  start_date: string;
  end_date: string;
  leaderboard: { name: string; mentions: number; google: number; yelp: number; reviews: ReviewMention[] }[];
  reviews_with_mentions: { google: number; yelp: number };
};

function ReviewsSection({ period, onData }: { period: Period; onData: (rows: { name: string; value: number }[], loading: boolean) => void }) {
  const staff = useCurrentStaff();
  const [data, setData] = useState<ReviewsResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    if (!staff) return;
    setLoading(true);
    onData(data?.leaderboard.map((r) => ({ name: r.name, value: r.mentions })) ?? [], true);
    setError(null);
    try {
      const { data: res, error: fnError } = await supabase.functions.invoke("contest-selfgen", {
        body: { staffName: staff.fullName, kind: "reviews", start_date: period.start, end_date: period.end },
      });
      if (fnError || !res?.ok) throw new Error(res?.error || fnError?.message || "load failed");
      const result = res.result as ReviewsResult;
      setData(result);
      onData(result.leaderboard.map((r) => ({ name: r.name, value: r.mentions })), false);
    } catch (e) {
      setError(String((e as Error).message || e));
      onData([], false);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [staff?.fullName, period.start, period.end]); // eslint-disable-line react-hooks/exhaustive-deps

  const board = data?.leaderboard ?? [];
  const maxScore = Math.max(1, ...board.map((r) => r.mentions));
  const BAR_MAX_PX = 180;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg flex-wrap">
          <Star className="w-5 h-5 text-amber-500" />
          Reviews
          <span className="text-[10px] font-bold uppercase tracking-wider rounded-full bg-emerald-100 text-emerald-800 px-2 py-0.5">
            auto from Google + Yelp
          </span>
          <span className="flex-1" />
          <span className="flex items-center gap-1.5 text-xs font-normal text-muted-foreground">
            {periodLabel(period)}
            <Button type="button" size="icon" variant="ghost" className="h-7 w-7" disabled={loading} onClick={() => void load()}>
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </span>
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          One point per review that names you (Google + Yelp, incl. Yelp "not recommended"). A review naming two people counts for both.
          {data && ` ${data.reviews_with_mentions.google + data.reviews_with_mentions.yelp} reviews named someone this period.`}
        </p>
      </CardHeader>
      <CardContent>
        {loading && !data ? (
          <p className="text-center text-sm text-muted-foreground py-8">Counting reviews…</p>
        ) : error ? (
          <p className="text-center text-sm text-destructive py-8">Couldn't load: {error}</p>
        ) : board.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-8">No reviews naming anyone in this period yet.</p>
        ) : (
          <div className="overflow-x-auto pb-1">
            <div className="flex items-end gap-2 min-w-[480px]" style={{ minHeight: BAR_MAX_PX + 100 }}>
              {board.map((row) => {
                const h = row.mentions > 0 ? Math.max(8, Math.round((row.mentions / maxScore) * BAR_MAX_PX)) : 0;
                return (
                  <div key={row.name} className="flex-1 min-w-[96px] flex flex-col items-center justify-end gap-1">
                    <span className="text-sm font-bold text-foreground tabular-nums">{row.mentions}</span>
                    <div className="w-full flex justify-center" style={{ height: BAR_MAX_PX }}>
                      <div className="flex items-end h-full">
                        <div
                          title={`${row.name}: ${row.mentions} (Google ${row.google} · Yelp ${row.yelp})`}
                          className="w-9 rounded-t-[4px] bg-primary transition-[height] duration-300"
                          style={{ height: h }}
                        />
                      </div>
                    </div>
                    <div className="w-full border-t border-border pt-1 text-center">
                      <span className="text-xs font-medium text-foreground">{firstName(row.name)}</span>
                    </div>
                    <div className="w-full space-y-1">
                      {row.reviews.map((r, i) => (
                        <div key={i} className="rounded bg-muted/60 px-1.5 py-0.5 text-[10px] leading-tight text-muted-foreground text-left">
                          <span className="font-semibold text-foreground">{r.platform === "google" ? "G" : "Y"}</span>{" "}
                          {r.reviewer || "Anonymous"}
                          {typeof r.stars === "number" ? ` · ${r.stars}★` : ""}
                          <span className="text-muted-foreground/70"> ({shortDate(r.review_date)})</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Self-Generated Sales (auto-computed from FieldRoutes) ───────────────────
// 1x route-manager upsell (bait boxes / mosquito on an existing recurring
// customer), 2x self-generated net-new residential, 3x self-generated
// commercial. Data comes from the contest-selfgen edge function (Cloud Run →
// BigQuery); nothing here is hand-entered.

type SelfGenEvent = {
  event_type: "upsell" | "selfgen_residential" | "selfgen_commercial";
  points: number;
  event_date: string | null;
  customer: string;
  service_type: string | null;
  credited_to: string | null;
};
type SelfGenResult = {
  start_date: string;
  end_date: string;
  leaderboard: { name: string; points: number; upsells: number; selfgen_residential: number; selfgen_commercial: number }[];
  events: SelfGenEvent[];
  needs_attribution: SelfGenEvent[];
};

const EVENT_LABELS: Record<SelfGenEvent["event_type"], string> = {
  upsell: "Upsell",
  selfgen_residential: "Self-Gen Residential",
  selfgen_commercial: "Self-Gen Commercial",
};

const shortDate = (iso: string | null) =>
  iso ? `${parseInt(iso.slice(5, 7), 10)}/${parseInt(iso.slice(8, 10), 10)}` : "";

function SelfGenSection({ period, onData }: { period: Period; onData: (rows: { name: string; value: number }[], loading: boolean) => void }) {
  const staff = useCurrentStaff();
  const [data, setData] = useState<SelfGenResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    if (!staff) return;
    setLoading(true);
    onData(data?.leaderboard.map((r) => ({ name: r.name, value: r.points })) ?? [], true);
    setError(null);
    try {
      const { data: res, error: fnError } = await supabase.functions.invoke("contest-selfgen", {
        body: { staffName: staff.fullName, start_date: period.start, end_date: period.end },
      });
      if (fnError || !res?.ok) throw new Error(res?.error || fnError?.message || "load failed");
      const result = res.result as SelfGenResult;
      setData(result);
      onData(result.leaderboard.map((r) => ({ name: r.name, value: r.points })), false);
    } catch (e) {
      setError(String((e as Error).message || e));
      onData([], false);
    } finally {
      setLoading(false);
    }
  };

  // Load once the PinGate identity is known; reload when the period changes.
  useEffect(() => { void load(); }, [staff?.fullName, period.start, period.end]); // eslint-disable-line react-hooks/exhaustive-deps

  const board = data?.leaderboard ?? [];
  const maxScore = Math.max(1, ...board.map((r) => r.points));
  const BAR_MAX_PX = 180;
  const eventsFor = (name: string) => (data?.events ?? []).filter((e) => e.credited_to === name);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg flex-wrap">
          <Sparkles className="w-5 h-5 text-amber-500" />
          Self-Generated Sales
          <span className="text-[10px] font-bold uppercase tracking-wider rounded-full bg-emerald-100 text-emerald-800 px-2 py-0.5">
            auto from FieldRoutes
          </span>
          <span className="flex-1" />
          <span className="flex items-center gap-1.5 text-xs font-normal text-muted-foreground">
            {periodLabel(period)}
            <Button type="button" size="icon" variant="ghost" className="h-7 w-7" disabled={loading}
                    onClick={() => void load()}>
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </span>
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          1× upsell to an existing customer (bait boxes / mosquito, sold by a route manager) ·
          2× self-generated net-new residential · 3× self-generated commercial.
          Self-generated = customer source "Self-Generated" in FieldRoutes. Inspections don't count.
        </p>
      </CardHeader>
      <CardContent>
        {loading && !data ? (
          <p className="text-center text-sm text-muted-foreground py-8">Crunching FieldRoutes data…</p>
        ) : error ? (
          <p className="text-center text-sm text-destructive py-8">Couldn't load: {error}</p>
        ) : board.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-8">
            No qualifying sales yet — set the customer's source to "Self-Generated" in FieldRoutes
            and make sure Sold By is set to the rep who earned it.
          </p>
        ) : (
          <div className="overflow-x-auto pb-1">
            <div className="flex items-end gap-2 min-w-[480px]" style={{ minHeight: BAR_MAX_PX + 100 }}>
              {board.map((row) => {
                const h = row.points > 0 ? Math.max(8, Math.round((row.points / maxScore) * BAR_MAX_PX)) : 0;
                return (
                  <div key={row.name} className="flex-1 min-w-[96px] flex flex-col items-center justify-end gap-1">
                    <span className="text-sm font-bold text-foreground tabular-nums">{row.points}</span>
                    <div className="w-full flex justify-center" style={{ height: BAR_MAX_PX }}>
                      <div className="flex items-end h-full">
                        <div
                          title={`${row.name}: ${row.points} pts`}
                          className="w-9 rounded-t-[4px] bg-primary transition-[height] duration-300"
                          style={{ height: h }}
                        />
                      </div>
                    </div>
                    <div className="w-full border-t border-border pt-1 text-center">
                      <span className="text-xs font-medium text-foreground">{firstName(row.name)}</span>
                    </div>
                    <div className="w-full space-y-1">
                      {eventsFor(row.name).map((e, i) => (
                        <div key={i}
                             className="rounded bg-muted/60 px-1.5 py-0.5 text-[10px] leading-tight text-muted-foreground text-left">
                          <span className="font-semibold text-foreground">{e.points}×</span>{" "}
                          {EVENT_LABELS[e.event_type]} · {e.customer}
                          <span className="text-muted-foreground/70"> ({shortDate(e.event_date)})</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {(data?.needs_attribution?.length ?? 0) > 0 && (
          <div className="mt-4 rounded-md border border-amber-300 bg-amber-50 p-3">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-900">
              <AlertTriangle className="w-3.5 h-3.5" />
              Caught but not counting — fix "Sold By" in FieldRoutes to award credit
            </p>
            <ul className="mt-1 space-y-0.5 text-[11px] text-amber-900/90">
              {data!.needs_attribution.map((e, i) => (
                <li key={i}>
                  {shortDate(e.event_date)} · {EVENT_LABELS[e.event_type]} · {e.customer}
                  {e.service_type ? ` — ${e.service_type}` : ""} (Sold By: {e.credited_to || "none"})
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function Competition() {
  const navigate = useNavigate();
  const [comps, setComps] = useState<Competition[]>([]);
  const [loading, setLoading] = useState(true);
  // Edit unlock is per browser session.
  const [unlocked, setUnlocked] = useState(() => sessionStorage.getItem("competition_unlocked") === "1");
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [passwordTry, setPasswordTry] = useState("");
  const [editing, setEditing] = useState(false);
  const [newSaleDrafts, setNewSaleDrafts] = useState<Record<string, string>>({});
  // Leader data reported up by the two auto boards.
  const [reviewRows, setReviewRows] = useState<{ name: string; value: number }[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(true);
  const [selfGenRows, setSelfGenRows] = useState<{ name: string; value: number }[]>([]);
  const [selfGenLoading, setSelfGenLoading] = useState(true);
  const [compsUnavailable, setCompsUnavailable] = useState(false);
  const [localPeriodTick, setLocalPeriodTick] = useState(0); // re-read after a localStorage save
  const period = useMemo(() => readPeriod(comps), [comps, localPeriodTick]);

  const load = async () => {
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from("competitions").select("*").order("slot");
    if (error) {
      // Table missing (migration never applied) or RLS: the auto boards above
      // still work; only the manual scoreboards need the table.
      setCompsUnavailable(true);
      setComps([]);
    } else {
      setCompsUnavailable(false);
      setComps((data ?? []) as Competition[]);
    }
    setLoading(false);
  };
  useEffect(() => { void load(); }, []);

  const tryUnlock = () => {
    if (passwordTry === EDIT_PASSWORD) {
      sessionStorage.setItem("competition_unlocked", "1");
      setUnlocked(true);
      setEditing(true);
      setPasswordOpen(false);
      setPasswordTry("");
    } else {
      toast.error("Wrong password");
    }
  };

  const persist = async (comp: Competition) => {
    const { error } = await (supabase as any)
      .from("competitions")
      .update({ name: comp.name, entries: comp.entries })
      .eq("id", comp.id);
    if (error) toast.error("Save failed — try again.");
  };

  const patchComp = (id: string, patch: (c: Competition) => Competition) => {
    setComps((prev) => {
      const next = prev.map((c) => (c.id === id ? patch({ ...c, entries: { ...c.entries } }) : c));
      const changed = next.find((c) => c.id === id);
      if (changed) void persist(changed);
      return next;
    });
  };

  const setPeriod = (patch: Partial<Period>) => {
    const next = { ...period, ...patch };
    if (next.end < next.start) return;
    const row = comps.find((c) => c.slot === 1) ?? comps[0];
    if (row) {
      patchComp(row.id, (c) => ({ ...c, entries: { ...c.entries, [PERIOD_KEY]: next as any } }));
      return;
    }
    // No shared row to persist on — keep it in this browser.
    try { localStorage.setItem(PERIOD_LS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
    setLocalPeriodTick((t) => t + 1);
  };

  const setScore = (comp: Competition, person: string, score: number) =>
    patchComp(comp.id, (c) => ({
      ...c,
      entries: { ...c.entries, [person]: { score: Math.max(0, score), sales: entryOf(c, person).sales } },
    }));

  const addSale = (comp: Competition, person: string, saleName: string) => {
    const name = saleName.trim();
    if (!name) return;
    patchComp(comp.id, (c) => {
      const cur = entryOf(c, person);
      const sales = [...cur.sales, name];
      return { ...c, entries: { ...c.entries, [person]: { score: sales.length, sales } } };
    });
    setNewSaleDrafts((d) => ({ ...d, [`${comp.id}|${person}`]: "" }));
  };

  const removeSale = (comp: Competition, person: string, index: number) =>
    patchComp(comp.id, (c) => {
      const cur = entryOf(c, person);
      const sales = cur.sales.filter((_, i) => i !== index);
      return { ...c, entries: { ...c.entries, [person]: { score: sales.length, sales } } };
    });

  const renderCompetition = (comp: Competition) => {
    const scores = PEOPLE.map((p) => ({ person: p, ...entryOf(comp, p) }));
    const maxScore = Math.max(1, ...scores.map((s) => s.score));
    const BAR_MAX_PX = 180;

    return (
      <Card key={comp.id}>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Trophy className="w-5 h-5 text-amber-500" />
            {editing ? (
              <Input
                value={comp.name}
                onChange={(e) => patchComp(comp.id, (c) => ({ ...c, name: e.target.value }))}
                className="h-9 text-lg font-semibold max-w-md"
              />
            ) : (
              comp.name
            )}
            {comp.is_sales && (
              <span className="text-[10px] font-bold uppercase tracking-wider rounded-full bg-amber-100 text-amber-800 px-2 py-0.5">
                sales — names count
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {/* Vertical bar per person; scrolls sideways on small screens. */}
          <div className="overflow-x-auto pb-1">
            <div className="flex items-end gap-2 min-w-[640px]" style={{ minHeight: BAR_MAX_PX + 100 }}>
              {scores.map(({ person, score, sales }) => {
                const h = score > 0 ? Math.max(8, Math.round((score / maxScore) * BAR_MAX_PX)) : 0;
                return (
                  <div key={person} className="flex-1 min-w-[76px] flex flex-col items-center justify-end gap-1">
                    {/* Value label above the bar (the scoreboard's whole point). */}
                    <span className="text-sm font-bold text-foreground tabular-nums">{score}</span>
                    <div className="w-full flex justify-center" style={{ height: BAR_MAX_PX }}>
                      <div className="flex items-end h-full">
                        <div
                          title={`${person}: ${score}`}
                          className="w-9 rounded-t-[4px] bg-primary transition-[height] duration-300"
                          style={{ height: h }}
                        />
                      </div>
                    </div>
                    <div className="w-full border-t border-border pt-1 text-center">
                      <span className="text-xs font-medium text-foreground">{firstName(person)}</span>
                    </div>
                    {/* Score editor (general) or sale-name list (sales). */}
                    {comp.is_sales ? (
                      <div className="w-full space-y-1">
                        {sales.map((sale, i) => (
                          <div key={i}
                               className="flex items-center gap-1 rounded bg-muted/60 px-1.5 py-0.5 text-[10px] leading-tight text-muted-foreground">
                            <span className="flex-1 break-words text-left">{sale}</span>
                            {editing && (
                              <button type="button" className="shrink-0 text-muted-foreground hover:text-destructive max-md:p-2"
                                      onClick={() => removeSale(comp, person, i)}>
                                <X className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        ))}
                        {editing && (
                          <div className="flex items-center gap-1">
                            <Input
                              value={newSaleDrafts[`${comp.id}|${person}`] ?? ""}
                              onChange={(e) => setNewSaleDrafts((d) => ({ ...d, [`${comp.id}|${person}`]: e.target.value }))}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") addSale(comp, person, newSaleDrafts[`${comp.id}|${person}`] ?? "");
                              }}
                              placeholder="Sale name"
                              className="h-6 max-md:h-9 text-[10px] px-1"
                            />
                            <Button type="button" size="icon" variant="outline" className="h-6 w-6 max-md:h-9 max-md:w-9 shrink-0"
                                    onClick={() => addSale(comp, person, newSaleDrafts[`${comp.id}|${person}`] ?? "")}>
                              <Plus className="w-3 h-3" />
                            </Button>
                          </div>
                        )}
                      </div>
                    ) : (
                      editing && (
                        <Input
                          type="number"
                          min={0}
                          value={String(score)}
                          onChange={(e) => setScore(comp, person, parseInt(e.target.value, 10) || 0)}
                          className="h-7 max-md:h-9 w-16 text-center text-xs"
                        />
                      )
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="min-h-screen bg-background p-4 sm:p-6">
      <div className="max-w-6xl mx-auto space-y-4">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <Button variant="ghost" onClick={() => navigate("/")}>
            <ArrowLeft className="w-4 h-4 mr-2" /> Back to home
          </Button>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            {/* Competition period — drives the leaders banner + both auto boards.
                Editing it is password-gated like everything else (18444). */}
            <div className="flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs">
              <span className="text-muted-foreground">Period</span>
              {editing ? (
                <>
                  <Input type="date" value={period.start} onChange={(e) => e.target.value && setPeriod({ start: e.target.value })} className="h-7 w-[138px] text-xs" />
                  <span className="text-muted-foreground">to</span>
                  <Input type="date" value={period.end} onChange={(e) => e.target.value && setPeriod({ end: e.target.value })} className="h-7 w-[138px] text-xs" />
                </>
              ) : (
                <>
                  <span className="font-semibold text-foreground">{periodLabel(period)}</span>
                  <button
                    type="button"
                    aria-label="Edit competition period"
                    title="Edit competition period (password)"
                    className="text-muted-foreground hover:text-foreground max-md:p-2"
                    onClick={() => (unlocked ? setEditing(true) : setPasswordOpen(true))}
                  >
                    <Pencil className="w-3 h-3" />
                  </button>
                </>
              )}
            </div>
            {editing ? (
              <Button variant="outline" size="sm" onClick={() => setEditing(false)}>
                Done editing
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => (unlocked ? setEditing(true) : setPasswordOpen(true))}
              >
                {unlocked ? <Unlock className="w-3.5 h-3.5 mr-1.5" /> : <Lock className="w-3.5 h-3.5 mr-1.5" />}
                <Pencil className="w-3.5 h-3.5 mr-1.5" /> Edit
              </Button>
            )}
          </div>
        </div>

        <div className="text-center">
          <h1 className="text-2xl font-bold text-foreground flex items-center justify-center gap-2">
            <Trophy className="w-6 h-6 text-amber-500" /> Crest Competitions
          </h1>
        </div>

        {/* Who's winning — always visible, both auto boards, one competition period. */}
        <Card className="border-amber-300/60">
          <CardContent className="pt-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Leaders · {periodLabel(period)}
            </p>
            <div className="flex gap-3 flex-wrap">
              <LeaderTile icon={<Star className="w-3.5 h-3.5" />} title="Most reviews" unit="reviews naming them" rows={reviewRows} loading={reviewsLoading} />
              <LeaderTile icon={<Sparkles className="w-3.5 h-3.5" />} title="Most self-gen sales" unit="points" rows={selfGenRows} loading={selfGenLoading} />
            </div>
          </CardContent>
        </Card>

        <ReviewsSection period={period} onData={(rows, l) => { setReviewRows(rows); setReviewsLoading(l); }} />
        <SelfGenSection period={period} onData={(rows, l) => { setSelfGenRows(rows); setSelfGenLoading(l); }} />

        {loading ? (
          <p className="text-center text-sm text-muted-foreground py-10">Loading…</p>
        ) : compsUnavailable ? (
          <p className="text-center text-xs text-muted-foreground py-6">
            Manual scoreboards unavailable — the competitions table hasn't been created in this environment yet.
            Period changes are saved on this device only until it is.
          </p>
        ) : (
          comps.map(renderCompetition)
        )}
      </div>

      <Dialog open={passwordOpen} onOpenChange={setPasswordOpen}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="w-4 h-4" /> Edit password
            </DialogTitle>
          </DialogHeader>
          <Input
            type="password"
            inputMode="numeric"
            value={passwordTry}
            onChange={(e) => setPasswordTry(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") tryUnlock(); }}
            placeholder="Password"
            autoFocus
          />
          <Button onClick={tryUnlock}>Unlock</Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
