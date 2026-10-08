// ─── Proposal agreement term (1-year contract) ─────────────────────────
// Shared by the proposal editor, the sales PDF and the customer-facing view so
// the contract language is identical everywhere it is shown.

export const DEFAULT_CANCELLATION_FEE = "50";

/** Every property type except plain Residential is a commercial account. */
export const isCommercialPropertyType = (propertyType?: string | null): boolean =>
  !!propertyType && propertyType !== "Residential";

/** "$50" — whole dollars when possible, otherwise the raw entry. */
export const formatCancellationFee = (fee?: string | number | null): string => {
  const raw = String(fee ?? "").replace(/[$,\s]/g, "").trim();
  if (raw === "") return `$${DEFAULT_CANCELLATION_FEE}`;
  const n = Number(raw);
  if (!Number.isFinite(n)) return `$${raw}`;
  return Number.isInteger(n) ? `$${n}` : `$${n.toFixed(2)}`;
};

export interface ContractTermsInput {
  oneYearContract?: boolean | null;
  cancellationFee?: string | number | null;
  propertyType?: string | null;
}

/**
 * Agreement-term paragraph shown under the Crest Guarantee when the 1-year
 * contract option is checked. Commercial accounts also get 30-day notice
 * language. Returns null when no contract is in effect.
 */
export const contractTermsText = (input: ContractTermsInput): string | null => {
  if (!input.oneYearContract) return null;
  const fee = formatCancellationFee(input.cancellationFee);
  const base =
    "Agreement Term: This agreement is for an initial term of one (1) year beginning on the first service date and continues month-to-month thereafter.";
  const notice = isCommercialPropertyType(input.propertyType)
    ? " Either party may cancel this agreement with thirty (30) days' written notice."
    : "";
  const feeLine = ` Cancellation before the end of the initial one-year term is subject to a ${fee} early cancellation fee.`;
  return base + notice + feeLine;
};

/** Short label for the Property Info block: "1-Year Contract ($50 cancellation fee)". */
export const contractTermLabel = (input: ContractTermsInput): string | null =>
  input.oneYearContract ? `1-Year Contract (${formatCancellationFee(input.cancellationFee)} early cancellation fee)` : null;

/**
 * The Crest Guarantee sentence. The default version promises no long-term
 * contract, which would contradict a signed 1-year term, so that clause is
 * dropped when the contract option is on.
 */
export const crestGuaranteeText = (oneYearContract?: boolean | null): string =>
  oneYearContract
    ? "If pests return, we will return at no charge. We want our service quality to keep you as a customer."
    : "If pests return, we will return at no charge. We don't lock you into a long-term contract. We want our service quality to keep you as a customer, not a contract.";
