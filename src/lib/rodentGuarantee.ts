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

// ─────────────────────────────────────────────────────────────────────────────
// Sales-report-wide disclaimer + Additional Details relocation.
// ─────────────────────────────────────────────────────────────────────────────

// One disclaimer that appears at the bottom of every sales report (replaces
// the per-service `<b>Disclaimer:</b>` lines that used to live inside each
// proposed-services block). Covers both pests and rodents per request.
export const SALES_REPORT_DISCLAIMER_HTML =
  `Crest Pest Control is not liable for any structural or property damage caused by pests or rodents. ` +
  `Pest control is an ongoing process — results depend on environmental, structural, and seasonal factors. ` +
  `We do not guarantee that pests or rodents will be entirely eliminated from your property, and we make ` +
  `no warranty of habitability. New entry points, conditions made by others, and natural deterioration are ` +
  `excluded from any service warranty.`;

export interface ServiceAdditionalDetail {
  serviceName: string;
  html: string;
}

export interface SplitServicesResult {
  cleanedHtml: string;
  additionalDetails: ServiceAdditionalDetail[];
}

// Splits a proposed-services HTML blob into:
//  - cleanedHtml: services with `<b>Additional Details:</b>` and `<b>Disclaimer:</b>`
//    sub-paragraphs removed (so they no longer render inline)
//  - additionalDetails: an ordered list of `{ serviceName, html }` for each
//    Additional Details block, attributed to the most-recent service header
//    (so multi-service reports show "Rodent Trapping & Exclusion — ...").
export const splitServicesContent = (rawHtml: string): SplitServicesResult => {
  const html = rawHtml || "";
  if (!html.trim()) return { cleanedHtml: "", additionalDetails: [] };

  // Normalize <br/> variants then split on paragraph boundaries (double-break).
  const normalized = html.replace(/<br\s*\/?\>/gi, "<br>");
  const paragraphs = normalized.split(/(?:\s*<br>\s*){2,}/g);

  const cleaned: string[] = [];
  const details: ServiceAdditionalDetail[] = [];
  let currentService = "";

  for (const raw of paragraphs) {
    const p = raw.trim();
    if (!p) continue;
    // Extract a leading `<b>Label:</b>` (case-insensitive, allow <strong>).
    const m = p.match(/^<(?:b|strong)>\s*([^<]+?)\s*:\s*<\/(?:b|strong)>\s*([\s\S]*)$/i);
    const label = m ? m[1].trim() : "";
    const body = m ? m[2].trim() : p;
    if (/^additional details$/i.test(label)) {
      if (body) details.push({ serviceName: currentService, html: body });
      continue;
    }
    if (/^disclaimer$/i.test(label)) {
      // Drop — replaced by the global SALES_REPORT_DISCLAIMER_HTML at the bottom.
      continue;
    }
    // Treat any other bold-labeled paragraph as a service header; remember the
    // most recent one so following Additional Details get attributed to it.
    if (label) currentService = label;
    cleaned.push(p);
  }

  return {
    cleanedHtml: cleaned.join("<br><br>"),
    additionalDetails: details,
  };
};