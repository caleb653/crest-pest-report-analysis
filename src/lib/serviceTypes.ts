// FieldRoutes service-type catalog used by the Slot Finder.
//
// Caleb's rule (locked):
//   - kind: "standalone"  → subscription_id MUST be -1 (no recurring contract).
//                           Inspections + one-off rodent / treatment jobs.
//   - kind: "subscription" → subscription_id MUST be a real FR subscription id
//                           on the customer (never -1).
//
// service_type_id values are populated as we map them in FieldRoutes. Where we
// don't know the id yet, we set 0 and the office completes it before approving
// the queued appointment.

export type ServiceTypeKind = "standalone" | "subscription";

export type ServiceType = {
  id: number;            // FieldRoutes service type id (0 = needs office mapping)
  label: string;         // Human label shown in the dropdown
  kind: ServiceTypeKind;
};

export const SERVICE_TYPES: ServiceType[] = [
  // ── Subscription / recurring ────────────────────────────────────────────
  { id: 0, label: "Monthly General Pest Service", kind: "subscription" },
  { id: 0, label: "Bi-Monthly Service", kind: "subscription" },
  { id: 0, label: "Bi-Monthly Service w Monthly Billing", kind: "subscription" },
  { id: 0, label: "Bi-Monthly Service w/ Upfront Billing", kind: "subscription" },
  { id: 0, label: "Quarterly Service", kind: "subscription" },
  { id: 0, label: "Quarterly Service w Monthly Billing", kind: "subscription" },
  { id: 0, label: "Quarterly Service w/ Upfront Billing", kind: "subscription" },
  { id: 0, label: "Commercial General Pest", kind: "subscription" },
  { id: 0, label: "Commercial Pest and Rodent", kind: "subscription" },
  { id: 0, label: "Commercial Rodent", kind: "subscription" },
  { id: 0, label: "Rodent Bait Boxes", kind: "subscription" },
  { id: 0, label: "Mosquito Standalone Service", kind: "subscription" },
  { id: 0, label: "Monthly Mosquito Add-On", kind: "subscription" },
  { id: 0, label: "Inspection Program", kind: "subscription" },

  // ── Standalone / one-time ───────────────────────────────────────────────
  { id: 0, label: "Initial Service", kind: "standalone" },
  { id: 0, label: "One-TIME Pest", kind: "standalone" },
  { id: 0, label: "Annual Survey", kind: "standalone" },
  { id: 0, label: "Bedbug Inspection", kind: "standalone" },
  { id: 0, label: "Inspection", kind: "standalone" },
  { id: 0, label: "Pest Inspection", kind: "standalone" },
  { id: 0, label: "Rodent Inspection", kind: "standalone" },
  { id: 0, label: "Dead Rodent Removal", kind: "standalone" },
  { id: 0, label: "Mice Trapping", kind: "standalone" },
  { id: 0, label: "Rodent Clean Up", kind: "standalone" },
  { id: 0, label: "Rodent Exclusion", kind: "standalone" },
  { id: 0, label: "Rodent Trapping", kind: "standalone" },
  { id: 0, label: "Rodent Trapping and Exclusion", kind: "standalone" },
  { id: 0, label: "Attic Service", kind: "standalone" },
  { id: 0, label: "Bed Bugs", kind: "standalone" },
  { id: 0, label: "Drain Flies", kind: "standalone" },
  { id: 0, label: "Flea/Tick", kind: "standalone" },
  { id: 0, label: "Follow-up Service", kind: "standalone" },
  { id: 0, label: "German Cockroach Treatment", kind: "standalone" },
  { id: 0, label: "Re-service", kind: "standalone" },
  { id: 0, label: "Trap Check", kind: "standalone" },
  { id: 0, label: "Custom Service Schedule", kind: "standalone" },
  { id: 0, label: "Multi-Family Quality Control", kind: "standalone" },
  { id: 0, label: "HOA Video Update", kind: "standalone" },
  { id: 0, label: "Leadership Meeting", kind: "standalone" },
  { id: 0, label: "Team Meeting", kind: "standalone" },
  { id: 0, label: "Task", kind: "standalone" },
];

export function findServiceType(label: string): ServiceType | undefined {
  return SERVICE_TYPES.find((s) => s.label === label);
}