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