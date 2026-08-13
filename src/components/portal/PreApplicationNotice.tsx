import { forwardRef } from "react";
import crestLogo from "@/assets/crest-logo.png";

/**
 * Pesticide Pre-Application Notice — auto-customized per property.
 *
 * Reads property data (name, address, customer_preferences) and renders
 * a print-ready single page that mirrors the official PDF.
 */

export interface PreApplicationProperty {
  id: string;
  name: string;
  address: string | null;
  customer_preferences?: any;
  notes?: string | null;
}

const FREQ_LABELS: Record<string, string> = {
  weekly: "Weekly",
  "bi-weekly": "Bi-Weekly",
  monthly: "Monthly",
  "8-weekly": "Every 8 Weeks",
  "bi-monthly": "Bi-Monthly",
  "12-weekly": "Every 12 Weeks",
  quarterly: "Quarterly",
};

const ALL_PESTS = [
  "Ants", "Earwigs", "Spiders",
  "Centipedes", "Fleas and Ticks", "Wasps",
  "Cockroaches", "Millipedes", "Rodents",
  "Crickets", "Silverfish", "Bees",
];

// Default pest set per the company target list — every recurring service
// covers these pests, so they're always checked unless the property has
// an explicit override in customer_preferences.target_pests.
const DEFAULT_CHECKED = new Set([
  "Ants", "Earwigs", "Spiders", "Centipedes", "Fleas and Ticks",
  "Wasps", "Cockroaches", "Millipedes", "Crickets", "Silverfish",
]);

const PRODUCTS: string[] = [
  "Advion Ant Gel Bait (Indoxacarb)",
  "MasterLine B MaxxPro (Bifenthrin)",
  "Advion Cockroach Gel Bait (Indoxacarb)",
  "Maxforce FC Ant Gel (Fipronil)",
  "Alpine WSG (Dinotefuran)",
  "Niban (Orthoboric Acid)",
  "Bedlam (Cyclopropanecarboxylate, Dicarboximide)",
  "OptiGard Flex Liquid (Thiamethoxam)",
  "Bifen I/T (Bifenthrin)",
  "Onslaught FastCap (Esfenvalerate, Prallethrin, Piperonyl Butoxide)",
  "Bifen LP (Bifenthrin)",
  "OneGuard (Lambda-cyhalothrin, Prallethrin, Pyriproxyfen, Piperonyl Butoxide)",
  "Contrac California (Bromethalin)",
  "Nyguard IGR Concentrate (Pyridine)",
  "Delta Dust (Deltamethrin)",
  "Phantom (Chlorfenapyr)",
  "Essentria IC Pro (Sodium Lauryl Sulfate, Geraniol, Clove Oil)",
  "PT Alpine Flea & Bed Bug (Dinotefuran, Pyriproxyfen, Prallethrin)",
  "Essentria G (Eugenol, Thyme Oil)",
  "PT Alpine Fly Bait (Dinotefuran)",
  "ExciteR (Pyrethrins, Piperonyl Butoxide)",
  "PT Wasp Freeze (Prallethrin)",
  "Gentrol Aerosol ((S)-Hydroprene)",
  "Shockwave 1 (Pyrethrins, Piperonyl Butoxide, N-Octyl, Bifenthrin, Pyriproxyfen)",
  "Gentrol IGR Concentrate ((S)-Hydroprene)",
  "Temprid FX (Imidacloprid, Cyfluthrin)",
  "In2Care Mix (Pyriproxyfen, Beauveria bassiana Strain GHA)",
  "Termidor SC (Fipronil)",
  "Invade Hot Spot +",
  "Invade Bio Cleaner (Citrus Oil, Microbes, Surfactants)",
  "Nibor-D Insecticide (Disodium Octaborate)",
  "Nibor-D Foam + IGR (Disodium Octaborate)",
  "Neogen SureKill SK100 (Pyrethrins, Piperonyl Butoxide, N-Octyl Bicycloheptene Dicarboximide)",
  "ProFoam Platinum (Foaming Agent)",
  "Take Down II Soft Bait (Bromethalin)",
];

function getCheckedPests(property: PreApplicationProperty): Set<string> {
  const prefs = property.customer_preferences || {};
  const override = Array.isArray(prefs.notice_target_pests) ? prefs.notice_target_pests : null;
  if (override) return new Set(override);
  // Apartments and HOAs always include Rodents in the default target pests.
  const propType = String(prefs.property_type || "").toLowerCase();
  const includeRodentsByType = propType === "apartments" || propType === "hoa";
  // If property has known target pests stored, intersect — otherwise use defaults
  const stored = Array.isArray(prefs.target_pests) ? prefs.target_pests : null;
  if (stored && stored.length > 0) {
    const lowered = new Set(stored.map((p: string) => String(p).toLowerCase()));
    const result = new Set<string>();
    for (const pest of ALL_PESTS) {
      const key = pest.toLowerCase();
      if (lowered.has(key) || DEFAULT_CHECKED.has(pest)) result.add(pest);
    }
    if (includeRodentsByType) result.add("Rodents");
    return result;
  }
  const result = new Set(DEFAULT_CHECKED);
  if (includeRodentsByType) result.add("Rodents");
  return result;
}

function getFrequency(property: PreApplicationProperty): string {
  const prefs = property.customer_preferences || {};
  const f = prefs.service_frequency || prefs.frequency;
  if (typeof f === "string" && FREQ_LABELS[f]) return f;
  return "monthly";
}

function getInitialServiceDate(property: PreApplicationProperty): string {
  const prefs = property.customer_preferences || {};
  return prefs.initial_service_date || "";
}

const Box = ({
  checked,
  editable,
  onClick,
}: {
  checked: boolean;
  editable?: boolean;
  onClick?: () => void;
}) => (
  <span
    role={editable ? "button" : undefined}
    onClick={editable ? onClick : undefined}
    className={`inline-block align-middle mr-2 ${editable ? "cursor-pointer hover:ring-2 hover:ring-primary/40" : ""}`}
    style={{
      width: 12, height: 12, border: "1.5px solid #2A2A2A",
      background: checked ? "#2A2A2A" : "transparent",
    }}
  />
);

interface PreApplicationNoticeProps {
  property: PreApplicationProperty;
  /** Optional explicit notice date (YYYY-MM-DD); defaults to today. */
  noticeDate?: string;
  /** When true, frequency / pests / dates become editable in-place. */
  editable?: boolean;
  /** Receives the next set of values when the user edits. */
  onChange?: (next: {
    frequency: string;
    checkedPests: string[];
    noticeDate: string;
    initialDate: string;
  }) => void;
}

export const PreApplicationNotice = forwardRef<HTMLDivElement, PreApplicationNoticeProps>(
  ({ property, noticeDate, editable, onChange }, ref) => {
    const checked = getCheckedPests(property);
    const frequency = getFrequency(property);
    // Notice date starts blank — only populated when explicitly set.
    const today = noticeDate || "";
    const initialDate = getInitialServiceDate(property);

    const emit = (patch: Partial<{
      frequency: string;
      checkedPests: string[];
      noticeDate: string;
      initialDate: string;
    }>) => {
      onChange?.({
        frequency,
        checkedPests: Array.from(checked),
        noticeDate: today,
        initialDate,
        ...patch,
      });
    };

    const togglePest = (pest: string) => {
      const next = new Set(checked);
      if (next.has(pest)) next.delete(pest); else next.add(pest);
      emit({ checkedPests: Array.from(next) });
    };

    return (
      <div
        ref={ref}
        className="bg-white text-[#2A2A2A] mx-auto"
        style={{
          width: "8.5in",
          minHeight: "11in",
          padding: "0.5in",
          fontFamily: "'Helvetica Neue', Arial, sans-serif",
          fontSize: "10.5px",
          lineHeight: 1.4,
        }}
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-4 pb-3 border-b-2" style={{ borderColor: "#2A2A2A" }}>
          <div>
            <h1 className="font-bold" style={{ fontSize: "20px", letterSpacing: "0.5px" }}>
              Pesticide Pre-Application Notice
            </h1>
            <div className="mt-2 text-[10px] leading-snug">
              <div className="font-semibold">Crest Pest Control of Orange County, PR #9859</div>
              <div>2709 S Orange Avenue, Unit C</div>
              <div>Santa Ana, CA 92707</div>
            </div>
          </div>
          <img src={crestLogo} alt="Crest Pest Control" style={{ height: 70, width: "auto" }} />
        </div>

        {/* Property Info */}
        <table className="w-full mb-4" style={{ fontSize: "11px" }}>
          <tbody>
            <tr>
              <td className="py-1 pr-3 align-top" style={{ width: "50%" }}>
                <span className="font-semibold">Property Name: </span>
                <span className="border-b border-[#2A2A2A] inline-block min-w-[240px]">{property.name || ""}</span>
              </td>
              <td className="py-1 pl-3 align-top">
                <span className="font-semibold">Notice Date: </span>
                {editable ? (
                  <input
                    type="date"
                    value={today}
                    onChange={(e) => emit({ noticeDate: e.target.value })}
                    className="border-b border-[#2A2A2A] bg-transparent outline-none focus:bg-primary/10 px-1"
                    style={{ fontSize: "11px" }}
                  />
                ) : (
                  <span className="border-b border-[#2A2A2A] inline-block min-w-[160px]">{today}</span>
                )}
              </td>
            </tr>
            <tr>
              <td className="py-1 pr-3 align-top">
                <span className="font-semibold">Property Address: </span>
                <span className="border-b border-[#2A2A2A] inline-block min-w-[240px]">{property.address || ""}</span>
              </td>
              <td className="py-1 pl-3 align-top">
                <span className="font-semibold">Initial Service Date: </span>
                {editable ? (
                  <input
                    type="date"
                    value={initialDate}
                    onChange={(e) => emit({ initialDate: e.target.value })}
                    className="border-b border-[#2A2A2A] bg-transparent outline-none focus:bg-primary/10 px-1"
                    style={{ fontSize: "11px" }}
                  />
                ) : (
                  <span className="border-b border-[#2A2A2A] inline-block min-w-[160px]">{initialDate}</span>
                )}
              </td>
            </tr>
          </tbody>
        </table>

        {/* Frequency */}
        <div className="mb-4">
          <div className="font-bold mb-1" style={{ fontSize: "12px" }}>Service Frequency:</div>
          <div className="flex gap-6" style={{ fontSize: "11px" }}>
            {(["weekly", "bi-weekly", "monthly", "8-weekly", "bi-monthly", "12-weekly", "quarterly"] as const).map((k) => (
              <span
                key={k}
                className={editable ? "cursor-pointer select-none" : ""}
                onClick={editable ? () => emit({ frequency: k }) : undefined}
              >
                <Box checked={frequency === k} editable={editable} onClick={() => emit({ frequency: k })} />
                {FREQ_LABELS[k]}
              </span>
            ))}
          </div>
        </div>

        {/* Target Pests */}
        <div className="mb-4">
          <div className="font-bold mb-1" style={{ fontSize: "12px" }}>Target Pests (check all that apply)</div>
          <div className="grid grid-cols-3 gap-y-1" style={{ fontSize: "11px" }}>
            {ALL_PESTS.map((pest) => (
              <div
                key={pest}
                className={editable ? "cursor-pointer select-none" : ""}
                onClick={editable ? () => togglePest(pest) : undefined}
              >
                <Box checked={checked.has(pest)} editable={editable} onClick={() => togglePest(pest)} />
                {pest}
              </div>
            ))}
          </div>
        </div>

        {/* Products */}
        <div className="mb-4">
          <div className="font-bold mb-1" style={{ fontSize: "12px" }}>Products (Active Ingredients)</div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-[2px]" style={{ fontSize: "9.5px" }}>
            {PRODUCTS.map((p) => (<div key={p}>{p}</div>))}
          </div>
        </div>

        {/* Pesticide Notice */}
        <div>
          <div className="font-bold mb-1" style={{ fontSize: "12px" }}>Pesticide Notice</div>
          <p className="text-[9px] leading-snug text-justify">
            State law requires that you be given the following information: CAUTION—PESTICIDES ARE TOXIC CHEMICALS.
            Structural Pest Control Companies are registered and regulated by the Structural Pest Control Board, and
            apply pesticides which are registered and approved for use by the California Department of Pesticide
            Regulation and the United States Environmental Protection Agency. Registration is granted when the state
            finds that, based on existing scientific evidence, there are no appreciable risks if proper use conditions
            are followed or that the risks are outweighed by the benefits. The degree of risk depends upon the degree of
            exposure, so exposure should be minimized. If within 24 hours following application you experience symptoms
            similar to common seasonal illness comparable to the flu, contact your physician or poison control center
            (800-222-1222) and your pest control company immediately. For further information, contact any of the
            following: Crest Pest Control (949-424-5000); for Health Questions—the County Health Department
            (800-564-8448); for Application Information—the County Agricultural Commissioner (714-955-0100) and for
            Regulatory Information—the Structural Pest Control Board (800-737-8188, 2005 Evergreen Street, Ste. 1500,
            Sacramento, CA 95815).
          </p>
        </div>
      </div>
    );
  }
);
PreApplicationNotice.displayName = "PreApplicationNotice";

export default PreApplicationNotice;