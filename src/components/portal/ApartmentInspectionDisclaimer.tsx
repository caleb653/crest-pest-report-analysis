/**
 * Apartment-portal inspection disclaimer.
 *
 * Rendered at the bottom of every completed apartment-unit service report
 * to clarify the legal scope of a "free and clear" designation. Mirrors the
 * pesticide notice in placement and visual weight (compact italic block).
 */
const ApartmentInspectionDisclaimer = () => (
  <div className="text-[10px] leading-snug text-muted-foreground italic px-1 pt-2 border-t mt-2">
    <p>
      <span className="font-semibold not-italic text-foreground">IMPORTANT DISCLAIMER:</span>{" "}
      This report documents the observable pest conditions present in the above-referenced unit at the date and time of inspection only. A "free and clear" designation is a professional opinion based on visual inspection conducted under accessible and observable conditions; it is not a guarantee, certification, or warranty of any kind. Crest Pest Control expressly disclaims any and all liability for: (1) pest activity originating after the inspection date; (2) conditions concealed behind walls, under flooring, or in areas inaccessible at the time of inspection; (3) infestation migrating from neighboring units, common areas, or the building exterior; and (4) re-infestation resulting from tenant activity or introduction of infested items. This report does not create a warranty of habitability and does not substitute for any representations made by the property owner or manager. All parties should be aware that pest control is an ongoing process, and no single inspection can guarantee a permanently pest-free environment.
    </p>
  </div>
);

export default ApartmentInspectionDisclaimer;