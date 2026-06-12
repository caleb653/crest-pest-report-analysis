// Shared Rodent Exclusion guarantee + warranty content.
// Rendered in its own card (admin Report, Multi-Proposal Report, Customer view)
// whenever a proposal includes "Rodent Exclusion" or "Rodent Trapping and Exclusion".

export const RODENT_GUARANTEE_SERVICES = new Set<string>([
  "Rodent Exclusion",
  "Rodent Trapping and Exclusion",
  "Rodent Trapping & Exclusion",
]);

export const hasRodentGuaranteeService = (
  serviceTypes: Array<string | undefined | null>
): boolean =>
  serviceTypes.some((t) => !!t && RODENT_GUARANTEE_SERVICES.has(String(t)));

export const RODENT_GUARANTEE_HTML = `<b>Rodent Exclusion Guarantee:</b> Our standard guarantee for rodent exclusion work is 6 months. If rodents re-enter your property through previously sealed entry points during this period, we will re-seal them and reset traps at no additional cost. Please note that this guarantee does not cover any newly created entry points.<br><br><b>Extended Warranty for Ongoing Rodent Control Customers:</b> Customers enrolled in our ongoing rodent control program receive an extended warranty for as long as their service remains active. Because ongoing treatment helps reduce the rodent population around your property, it significantly lowers the likelihood of re-entry through previously sealed points.`;

// ---------- Editable Guarantee/Warranty boxes ----------
// Each report (or proposal in a multi-proposal) carries an array of
// guarantee/warranty boxes. The rodent box auto-seeds the first time a
// rodent service is present, but after that the array (including any
// deletions, edits, or additions) is persisted verbatim.

export interface GuaranteeBox {
  id: string;
  title: string;
  html: string;
}

export const RODENT_DEFAULT_BOX_ID = "rodent-default";

export const buildDefaultRodentBox = (): GuaranteeBox => ({
  id: RODENT_DEFAULT_BOX_ID,
  title: "Rodent Service Guarantee & Warranty",
  html: RODENT_GUARANTEE_HTML,
});

export const newCustomGuaranteeBox = (): GuaranteeBox => ({
  id: `box-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  title: "Guarantee & Warranty",
  html: "",
});

/**
 * Resolve the initial guarantee boxes for a report/proposal.
 *  - If `saved` is an array (even empty), return it verbatim — the admin's
 *    intent (including deletions) wins.
 *  - Otherwise seed `[defaultRodentBox]` if any rodent guarantee service
 *    exists, else an empty list.
 */
export const resolveInitialGuaranteeBoxes = (
  saved: GuaranteeBox[] | undefined | null,
  serviceTypes: Array<string | undefined | null>,
): GuaranteeBox[] => {
  if (Array.isArray(saved)) return saved.map(sanitizeBox).filter(Boolean) as GuaranteeBox[];
  if (hasRodentGuaranteeService(serviceTypes)) return [buildDefaultRodentBox()];
  return [];
};

const sanitizeBox = (b: any): GuaranteeBox | null => {
  if (!b || typeof b !== "object") return null;
  const id = typeof b.id === "string" && b.id ? b.id : `box-${Math.random().toString(36).slice(2, 9)}`;
  const title = typeof b.title === "string" ? b.title : "Guarantee & Warranty";
  const html = typeof b.html === "string" ? b.html : "";
  return { id, title, html };
};

// Strip the legacy embedded guarantee/warranty paragraphs from a services HTML
// blob so older saved reports don't show the text twice once we render the
// dedicated card.
export const stripRodentGuaranteeFromHtml = (html: string): string => {
  if (!html) return html;
  let out = html;
  // Remove either paragraph wherever it appears, regardless of surrounding whitespace/<br> tags.
  const patterns: RegExp[] = [
    /(<br\s*\/?\>\s*){0,4}\s*<b>\s*Rodent Exclusion Guarantee:\s*<\/b>[\s\S]*?(?=(<br\s*\/?\>\s*){2,}<b>|$)/gi,
    /(<br\s*\/?\>\s*){0,4}\s*<b>\s*Extended Warranty for Ongoing Rodent Control Customers:\s*<\/b>[\s\S]*?(?=(<br\s*\/?\>\s*){2,}<b>|$)/gi,
  ];
  for (const re of patterns) {
    out = out.replace(re, "");
  }
  // Collapse 3+ consecutive <br> sequences down to a double-break.
  out = out.replace(/(?:\s*<br\s*\/?\>\s*){3,}/gi, "<br><br>");
  return out.trim();
};