import { AlertTriangle } from "lucide-react";

/**
 * California-required pesticide notice + Crest safety notice.
 * Rendered at the bottom of every COMPLETED service report.
 */
export const PesticideNotice = () => (
  <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50/70 p-3.5">
    <div className="flex items-center gap-1.5 mb-2">
      <AlertTriangle className="w-3.5 h-3.5 text-amber-700" />
      <p className="text-xs font-bold uppercase tracking-wide text-amber-800">Caution</p>
    </div>
    <p className="text-[11px] leading-snug text-amber-950/90 mb-2">
      Crest Pest Control is committed to the safety of our customers and our environment. All
      materials used by Crest Pest Control have been registered by the Environmental Protection
      Agency. Please avoid unnecessary contact with materials and comply with all instructions and
      recommendations from our technicians. Thanks for your patronage!{" "}
      <span className="font-semibold">National Emergency Poison Control: (800) 222-1222</span>
    </p>
    <p className="text-[10.5px] leading-snug text-amber-950/80 italic">
      "State law requires that you be given the following information: CAUTION—PESTICIDES ARE TOXIC
      CHEMICALS. Structural Pest Control Companies are registered and regulated by the Structural
      Pest Control Board, and apply pesticides which are registered and approved for use by the
      California Department of Pesticide Regulation and the United States Environmental Protection
      Agency. Registration is granted when the state finds that, based on existing scientific
      evidence, there are no appreciable risks if proper use conditions are followed or that the
      risks are outweighed by the benefits. The degree of risk depends upon the degree of exposure,
      so exposure should be minimized." "If within 24 hours following application you experience
      symptoms similar to common seasonal illness comparable to the flu, contact your physician or
      poison control center (800-222-1222) and your pest control company immediately." (This
      statement shall be modified to include any other symptoms of overexposure which are not
      typical of influenza.) "For further information, contact any of the following: Crest Pest
      Control (949-424-5000); for Health Questions—the County Health Department (800-564-8448); for
      Application Information—the County Agricultural Commissioner (714-955-0100) and for
      Regulatory Information—the Structural Pest Control Board (800-737-8188), 2005 Evergreen
      Street, Ste. 1500, Sacramento, CA 95815)."
    </p>
  </div>
);

export default PesticideNotice;