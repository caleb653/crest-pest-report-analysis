// Preset note templates for per-unit Technician Findings.
// Selecting one inserts (or appends) the text into the findings textarea.

export interface PresetNote {
  id: string;
  label: string;
  text: string;
}

export const PRESET_NOTES: PresetNote[] = [
  {
    id: "vacant-treatment",
    label: "Vacant Unit Treatment",
    text:
      "Performed a comprehensive treatment including liquid residual, outlet dusting, baiting, and an aerosol flush out. Pest monitors placed throughout. Will assess during the next visit.",
  },
  {
    id: "vacant-followup",
    label: "Vacant Unit Follow-Up Treatment",
    text:
      "Checked monitors and confirmed continued pest activity. Performed another full treatment and replaced all monitors.",
  },
  {
    id: "vacant-clear",
    label: "Vacant Unit – Free and Clear",
    text:
      "Inspected all monitors. No pest activity detected at this time. The unit is clear to rent.",
  },
  {
    id: "german-full",
    label: "Full German Roach Treatment",
    text:
      "Applied liquid residual to kitchen and bathroom cabinets and all baseboards. Placed bait in high-traffic areas, dusted wall voids and outlets, and used aerosol to flush out activity. Monitors placed to track ongoing activity.",
  },
  {
    id: "german-partial",
    label: "Partial German Roach Treatment",
    text:
      "Unit was not fully prepped for treatment. See attached photos. Applied bait and placed monitors to help mitigate activity. A full treatment is required to make substantial progress toward elimination.",
  },
  {
    id: "general-pest",
    label: "General Pest Treatment",
    text:
      "Applied liquid residual to all baseboards and high-traffic areas. Monitors placed to track ongoing activity.",
  },
  {
    id: "bed-bug",
    label: "Bed Bug Treatment",
    text:
      "Performed a comprehensive bed bug treatment including liquid residual, outlet dusting, and aerosol application. Pest monitors placed throughout. Will assess during the next visit.",
  },
  {
    id: "sanitation",
    label: "Sanitation Concern",
    text:
      "Sanitation issue – see attached photo. The active pest problem is unlikely to be resolved until this is addressed. We strongly recommend the tenant remediate this as soon as possible.",
  },
];