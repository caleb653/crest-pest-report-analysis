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

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, Lock, Pencil, Plus, Trophy, Unlock, X } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { STAFF_NAMES } from "@/lib/staffRoster";

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

  const load = async () => {
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from("competitions").select("*").order("slot");
    if (error) {
      toast.error("Could not load competitions — has the database migration run?");
    } else {
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
          <div className="flex items-center gap-2">
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

        {loading ? (
          <p className="text-center text-sm text-muted-foreground py-10">Loading…</p>
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
