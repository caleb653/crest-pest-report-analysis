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

// Crest's standard approved commercial pesticide list (per project knowledge).
export const APPROVED_COMMERCIAL_MATERIALS: ApprovedMaterial[] = [
  { name: "Alpine WSG",                 activeIngredient: "Dinotefuran",                        epa: "499-561",        sdsUrl: "https://www.domyown.com/msds/Alpine_WSG_SDS.pdf" },
  { name: "Bifen I/T",                  activeIngredient: "Bifenthrin",                         epa: "53883-118",      sdsUrl: "https://www.domyown.com/msds/Bifen_I-T_SDS1.pdf" },
  { name: "Temprid FX",                 activeIngredient: "Imidacloprid, Beta-Cyfluthrin",      epa: "432-1483",       sdsUrl: "https://www.domyown.com/msds/Temprid_FX_SDS1.pdf" },
  { name: "Termidor SC",                activeIngredient: "Fipronil",                           epa: "7969-210",       sdsUrl: "https://www.domyown.com/msds/Termidor_SC_SDS1.pdf" },
  { name: "Phantom",                    activeIngredient: "Chlorfenapyr",                       epa: "241-392",        sdsUrl: "https://www.domyown.com/msds/Phantom_SDS1.pdf" },
  { name: "Essentria IC Pro",           activeIngredient: "Geraniol, Clove Oil, Cornmint Oil",  epa: "25B Exempt",     sdsUrl: "https://www.domyown.com/msds/Essentria_IC_Pro_SDS1.pdf" },
  { name: "Gentrol IGR Concentrate",    activeIngredient: "(S)-Hydroprene",                     epa: "2724-351",       sdsUrl: "https://www.domyown.com/msds/Gentrol_IGR_Concentrate_SDS.pdf" },
  { name: "Nyguard IGR Concentrate",    activeIngredient: "Pyriproxyfen",                       epa: "1021-1603",      sdsUrl: "https://www.domyown.com/msds/Nyguard_IGR_Concentrate_SDS1.pdf" },
  { name: "PT Wasp Freeze",             activeIngredient: "Prallethrin",                        epa: "499-550",        sdsUrl: "https://www.domyown.com/msds/PT_Wasp_Freeze_II_SDS.pdf" },
  { name: "PT Alpine Flea & Bed Bug",   activeIngredient: "Dinotefuran, Pyriproxyfen, Prallethrin", epa: "499-540",   sdsUrl: "https://www.domyown.com/msds/PT_Alpine_Flea_and_Bed_Bug_SDS1.pdf" },
  { name: "PT Alpine Fly Bait",         activeIngredient: "Dinotefuran",                        epa: "499-568",        sdsUrl: "https://www.domyown.com/msds/PT_Alpine_Pressurized_Fly_Bait_SDS1.pdf" },
  { name: "Advion Ant Gel Bait",        activeIngredient: "Indoxacarb",                         epa: "100-1498",       sdsUrl: "https://www.domyown.com/msds/Advion_Ant_Gel_SDS1.pdf" },
  { name: "Advion Cockroach Gel Bait",  activeIngredient: "Indoxacarb",                         epa: "100-1484",       sdsUrl: "https://www.domyown.com/msds/Advion_Cockroach_Gel_Bait_SDS.pdf" },
  { name: "Maxforce FC Ant Gel",        activeIngredient: "Fipronil",                           epa: "432-1264",       sdsUrl: "https://www.domyown.com/msds/Maxforce_FC_Ant_Killer_Bait_Gel_SDS.pdf" },
  { name: "Delta Dust",                 activeIngredient: "Deltamethrin",                       epa: "432-772",        sdsUrl: "https://www.domyown.com/msds/Delta_Dust_SDS1.pdf" },
  { name: "Contrac Blox (California)",  activeIngredient: "Bromethalin",                        epa: "12455-151",      sdsUrl: "https://www.domyown.com/msds/Contrac_Blox_SDS.pdf" },
  { name: "MasterLine B MaxxPro",       activeIngredient: "Bifenthrin",                         epa: "279-3206-73748", sdsUrl: "https://www.domyown.com/msds/MasterLine_Bifenthrin_2EC_Pro_SDS.pdf" },
  { name: "In2Care Mix",                activeIngredient: "Pyriproxyfen, Beauveria bassiana GHA", epa: "91720-1",     sdsUrl: "https://www.domyown.com/msds/In2Care_Mosquito_Station_SDS.pdf" },
  { name: "OneGuard Multi MoA",         activeIngredient: "Lambda-cyhalothrin, Prallethrin, Pyriproxyfen, PBO", epa: "1021-2807", sdsUrl: "https://www.domyown.com/msds/OneGuard_Multi_MoA_Pro_SDS.pdf" },
  { name: "Advion Microflow",           activeIngredient: "Indoxacarb",                         epa: "100-1682",       sdsUrl: "https://www.domyown.com/msds/Advion_MicroFlow_Insect_Bait_SDS.pdf" },
  { name: "Optigard Flex Liquid",       activeIngredient: "Thiamethoxam",                       epa: "100-1306",       sdsUrl: "https://www.domyown.com/msds/Optigard_Flex_Liquid_SDS.pdf" },
];

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
        SDS links open the manufacturer / distributor Safety Data Sheet. If a direct PDF
        isn't available, the link opens a search for the most recent SDS.
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