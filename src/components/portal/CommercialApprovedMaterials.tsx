/**
 * CommercialApprovedMaterials — shared section used in BOTH the commercial
 * admin dashboard and the commercial PM (customer) portal so the two look
 * the same (per cofounder feedback: "most components should match").
 *
 * Renders Crest's approved-for-commercial pesticide list with:
 *   • Product name + active ingredient
 *   • EPA Reg #
 *   • SDS button (opens a Safety Data Sheet PDF in a new tab; falls back to
 *     a manufacturer search if we don't have a direct URL yet)
 *
 * Includes a "Download All SDS" helper that opens every approved product's
 * SDS in sequence so the customer can grab them in one go.
 */
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FlaskConical, FileDown, ExternalLink, ShieldCheck } from "lucide-react";

export interface ApprovedMaterial {
  name: string;
  activeIngredient: string;
  epa?: string;
  /** Direct PDF link if known; otherwise we fall back to a vendor search. */
  sdsUrl?: string;
}

// Crest's approved commercial pesticide list. ONLY products with an SDS
// on file (served locally from /public/sds) are shown — never list a
// product we cannot hand the customer a current Safety Data Sheet for.
export const APPROVED_COMMERCIAL_MATERIALS: ApprovedMaterial[] = [
  { name: "Alpine WSG",               activeIngredient: "Dinotefuran",                            epa: "499-561",  sdsUrl: "/sds/Alpine_WSG_SDS.pdf" },
  { name: "Delta Dust",               activeIngredient: "Deltamethrin",                           epa: "432-772",  sdsUrl: "/sds/Delta_Dust_SDS.pdf" },
  { name: "Nyguard IGR Concentrate",  activeIngredient: "Pyriproxyfen",                           epa: "1021-1603",sdsUrl: "/sds/Nyguard_IGR_SDS.pdf" },
  { name: "Onslaught FastCap",        activeIngredient: "Esfenvalerate, Prallethrin, PBO",        epa: "1021-2574",sdsUrl: "/sds/Onslaught_FC_SDS.pdf" },
  { name: "Phantom",                  activeIngredient: "Chlorfenapyr",                           epa: "241-392",  sdsUrl: "/sds/Phantom_SDS.pdf" },
  { name: "PT Alpine Flea & Bed Bug", activeIngredient: "Dinotefuran, Pyriproxyfen, Prallethrin", epa: "499-540",  sdsUrl: "/sds/PT_Alpine_Flea_Bed_Bug_SDS.pdf" },
  { name: "PT Wasp Freeze II",        activeIngredient: "Prallethrin",                            epa: "499-550",  sdsUrl: "/sds/PT_Wasp_Freeze_SDS.pdf" },
  { name: "Shockwave",                activeIngredient: "Cypermethrin, Imiprothrin, PBO",         epa: "1021-1798",sdsUrl: "/sds/Shockwave_SDS.pdf" },
  { name: "Temprid FX",               activeIngredient: "Imidacloprid, Beta-Cyfluthrin",          epa: "432-1483", sdsUrl: "/sds/Temprid_FX_SDS.pdf" },
  { name: "Termidor SC",              activeIngredient: "Fipronil",                               epa: "7969-210", sdsUrl: "/sds/Termidor_SC_SDS.pdf" },
];

// Every approved material is required to have a hosted SDS — but keep a
// search fallback as a defensive guard in case the list ever grows.
const sdsHref = (m: ApprovedMaterial) =>
  m.sdsUrl || `https://duckduckgo.com/?q=${encodeURIComponent(`${m.name} SDS pesticide pdf`)}`;

interface Props {
  /** Optional: dim items not in this subset (e.g. only ones used on the site). */
  highlightOnly?: string[];
  /** Compact = no border card wrapper, used inside an existing tab. */
  compact?: boolean;
}

export default function CommercialApprovedMaterials({ highlightOnly, compact }: Props) {
  const downloadAll = () => {
    for (const m of APPROVED_COMMERCIAL_MATERIALS) {
      // Stagger so popup blockers are less likely to nuke them all.
      setTimeout(() => window.open(sdsHref(m), "_blank", "noopener,noreferrer"), 80);
    }
  };

  const inner = (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <p className="text-base font-bold flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-primary" /> Approved Materials
          </p>
          <p className="text-xs text-muted-foreground mt-0.5 max-w-prose">
            The complete list of products Crest is approved to use on this commercial site.
            Click <span className="font-semibold">SDS</span> next to any product to view its
            Safety Data Sheet, or use <span className="font-semibold">Download All SDS</span>{" "}
            to open every sheet at once.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={downloadAll} className="h-9 gap-1.5 text-xs">
          <FileDown className="w-3.5 h-3.5" /> Download All SDS
        </Button>
      </div>

      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-[13px]">
          <thead className="bg-muted/60">
            <tr>
              <th className="text-left px-3 py-2 font-bold">Product</th>
              <th className="text-left px-3 py-2 font-bold hidden sm:table-cell">Active Ingredient</th>
              <th className="text-left px-3 py-2 font-bold hidden md:table-cell">EPA Reg #</th>
              <th className="text-right px-3 py-2 font-bold">SDS</th>
            </tr>
          </thead>
          <tbody>
            {APPROVED_COMMERCIAL_MATERIALS.map((m) => {
              const highlighted = !highlightOnly || highlightOnly.includes(m.name);
              return (
                <tr
                  key={m.name}
                  className={`border-t border-border ${highlighted ? "" : "opacity-60"}`}
                >
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1.5 font-semibold">
                      <FlaskConical className="w-3.5 h-3.5 text-primary/70 shrink-0" />
                      <span>{m.name}</span>
                      {highlightOnly && highlightOnly.includes(m.name) && (
                        <Badge variant="secondary" className="ml-1 text-[9px] h-4">Used here</Badge>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground sm:hidden mt-0.5">
                      {m.activeIngredient}
                    </p>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground hidden sm:table-cell">
                    {m.activeIngredient}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground hidden md:table-cell">
                    {m.epa || "—"}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs gap-1"
                      onClick={() => window.open(sdsHref(m), "_blank", "noopener,noreferrer")}
                    >
                      <ExternalLink className="w-3 h-3" /> SDS
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[10.5px] text-muted-foreground italic leading-snug">
        Only products with a current Safety Data Sheet on file are listed.
        Each SDS link opens the manufacturer's PDF directly.
      </p>
    </div>
  );

  if (compact) return inner;
  return (
    <Card>
      <CardContent className="p-4">{inner}</CardContent>
    </Card>
  );
}