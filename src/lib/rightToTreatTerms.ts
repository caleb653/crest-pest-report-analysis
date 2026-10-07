/**
 * Generic Right to Treat / Authorization to Treat agreement.
 *
 * Shared by the Signature Sheets form (src/pages/TeamDocs.tsx) and the PDF
 * (src/lib/rightToTreatAgreementPdf.ts) so the words a customer signs on screen
 * are exactly the words that land in the saved PDF. Not tied to a property,
 * portal or unit — it is the stand-alone, fill-anything version of the per-unit
 * Right to Treat chip in the portals.
 */
import { PESTICIDE_NOTICE, POSSIBLE_CHEMICALS } from "@/lib/rightToTreatPdf";

export const COMPANY = {
  name: "Crest Pest Control",
  license: "CA Structural Pest Control License #PR 9859",
  licenseShort: "CA Lic. #PR 9859",
  phone: "(949) 424-5000",
  website: "crestpestco.com",
  serviceArea: "Orange County, Los Angeles, San Bernardino & Riverside counties, CA",
};

export const RTT_TITLE = "Right to Treat — Authorization & Release";

export const RTT_INTRO =
  "This Right to Treat Authorization and Release (\"Authorization\") is made between Crest Pest Control " +
  "(\"Crest,\" \"we,\" \"us\") and the undersigned owner, occupant, property manager, or authorized agent " +
  "(\"Authorizing Party,\" \"you\") for the premises identified above (the \"Premises\"). By signing, you " +
  "represent that you have read and understood every section below and agree to be bound by it.";

export const RELATIONSHIP_OPTIONS = [
  "Owner",
  "Tenant / Occupant",
  "Property Manager",
  "Authorized Agent",
  "Business Owner / Operator",
] as const;

export const RTT_RIGHT_TO_ENTER_ACK =
  "Right to Enter. I grant Crest Pest Control and its licensed technicians permission to enter the Premises " +
  "(including any unit, suite, room, yard, attic, crawl space, garage, or common area identified above or " +
  "reasonably necessary to perform the work) on the date(s) scheduled, whether or not I am present, to " +
  "inspect, treat, install or service pest control devices, and perform any follow-up visits.";

export const RTT_TERMS_ACK =
  "I have read and agree to all of the Terms, Conditions, Notices, and Releases on this form, including the " +
  "Pesticide Notice, the Limitation of Liability, the Release, and the Indemnification.";

export interface RttSection {
  title: string;
  paragraphs: string[];
}

export const RTT_SECTIONS: RttSection[] = [
  {
    title: "1. Authorization to Treat",
    paragraphs: [
      "You authorize Crest to inspect and treat the Premises for pests, and to perform any related follow-up " +
      "treatments, using the methods, materials, equipment, and devices that the licensed technician determines " +
      "in their professional judgment to be appropriate. Treatment may include, without limitation, the application " +
      "of liquid, aerosol, dust, gel-bait, granular, foam, and biological products; the placement of traps, bait " +
      "stations, glue boards, insect light traps, and monitoring devices; and minor non-structural exclusion. " +
      "Treatment may be performed on the interior and/or exterior of the Premises.",
      "All pesticides used are registered and approved by the United States Environmental Protection Agency and " +
      "the California Department of Pesticide Regulation and are applied in accordance with the product label and " +
      "California law. Crest is licensed and regulated by the California Structural Pest Control Board.",
    ],
  },
  {
    title: "2. State-Required Pesticide Notice",
    paragraphs: [PESTICIDE_NOTICE],
  },
  {
    title: "3. Possible Chemicals Used",
    paragraphs: [
      "Any of the following products, or others registered for the intended use, may be applied depending on the " +
      "pest, the location, and the technician's findings: " + POSSIBLE_CHEMICALS.join("; ") + ".",
      "Safety Data Sheets and product labels are available on request and at crestpestco.com. Notice of the " +
      "specific products applied is provided on the service report for each visit.",
    ],
  },
  {
    title: "4. Your Responsibilities & Preparation",
    paragraphs: [
      "You agree to: (a) follow every preparation sheet and instruction given by Crest before and after treatment; " +
      "(b) remove or cover food, dishes, utensils, pet food and water bowls, toys, bedding, and personal items in " +
      "the treatment area; (c) remove or secure all pets, and cover and disconnect aquariums, terrariums, and bird " +
      "cages; (d) ensure that children, elderly persons, pregnant persons, and persons with asthma, allergies, " +
      "chemical sensitivities, or other medical conditions are out of the treatment area during application and " +
      "for any re-entry interval stated by the technician; (e) provide clear, safe, and unobstructed access to " +
      "all areas to be treated; (f) keep all traps, bait stations, monitors, and other devices undisturbed and " +
      "out of reach of children and pets; and (g) maintain sanitation, moisture control, and housekeeping " +
      "practices that reduce pest harborage.",
      "You will disclose to Crest, before treatment, any known health condition, allergy, or chemical " +
      "sensitivity of any occupant, and any known hazardous or unsafe condition at the Premises.",
    ],
  },
  {
    title: "5. Health & Safety Acknowledgment",
    paragraphs: [
      "You acknowledge that pesticides are toxic chemicals, that some persons may be more sensitive than " +
      "others, and that the degree of risk depends on the degree of exposure. You agree to minimize exposure " +
      "by complying with all instructions. If, within 24 hours of an application, any person experiences " +
      "symptoms similar to common seasonal illness, you will contact a physician or Poison Control " +
      "(800-222-1222) and notify Crest immediately.",
    ],
  },
  {
    title: "6. Pest Control Devices & Equipment",
    paragraphs: [
      "All bait stations, traps, monitors, insect light traps, and other devices installed by Crest remain the " +
      "property of Crest unless purchased by you in writing. You will not open, move, remove, tamper with, or " +
      "discard any device. Crest may inspect, service, replace, or remove its devices at any visit and upon " +
      "termination of service. You are responsible for the replacement cost of any device that is lost, damaged, " +
      "or destroyed other than by Crest.",
    ],
  },
  {
    title: "7. No Guarantee of Eradication; Limitations & Exclusions",
    paragraphs: [
      "Pest control is a process, not a single event. Results depend on sanitation, structural conditions, " +
      "moisture, weather, neighboring properties and units, and your cooperation, all of which are outside " +
      "Crest's control. Crest therefore does not guarantee the complete elimination or permanent prevention of " +
      "any pest. Where an active Crest service plan is in place, Crest's sole obligation and your sole and " +
      "exclusive remedy for pest activity between scheduled visits is a re-treatment at no additional charge.",
      "Unless expressly stated in a separate written service agreement or proposal, this Authorization does not " +
      "include: treatment for termites or other wood-destroying organisms; a wood-destroying pest inspection or " +
      "report; bed bugs; German cockroaches; interior fleas; bees, wasps, or hornets; birds or wildlife; rodent " +
      "trapping or physical exclusion; attic or crawl-space clean-out; insulation; removal of spider webs or egg " +
      "sacs; repair of any structure, finish, fixture, or landscaping; or treatment of individual residential " +
      "units under a common-area agreement. Any such services require a separate inspection and agreement.",
    ],
  },
  {
    title: "8. Undisclosed & Hazardous Conditions",
    paragraphs: [
      "Crest is not responsible for identifying, testing for, treating, or remediating mold, mildew, fungus, " +
      "asbestos, lead, moisture intrusion, structural defects, electrical or plumbing hazards, or any other " +
      "condition unrelated to the pest control work. If Crest discovers a condition that it considers unsafe, " +
      "Crest may stop or decline work, in whole or in part, without liability. Crest is not liable for any " +
      "condition that existed before, or that is discovered during, the work.",
    ],
  },
  {
    title: "9. Limitation of Liability & Release",
    paragraphs: [
      "TO THE FULLEST EXTENT PERMITTED BY LAW: (a) Crest is not liable for any structural or property damage " +
      "caused by any pest, rodent, or wildlife, whether before, during, or after treatment; (b) Crest is not " +
      "liable for damage to carpet, flooring, fabric, finishes, plants, landscaping, electronics, or personal " +
      "property that results from your failure to prepare the Premises as instructed or to disclose a sensitive " +
      "item or condition; (c) Crest is not liable for injury or illness to any person, pet, or animal that results " +
      "from entering a treated area before the re-entry interval has passed, from tampering with a device, or from " +
      "a condition or sensitivity not disclosed to Crest in advance; (d) in no event will Crest be liable for any " +
      "indirect, incidental, special, consequential, or punitive damages, including loss of use, loss of rent, " +
      "loss of business, relocation costs, or emotional distress, even if advised of the possibility; and (e) " +
      "Crest's total aggregate liability arising out of or relating to the work performed under this Authorization " +
      "will not exceed the amount actually paid to Crest for the specific service giving rise to the claim.",
      "You, on behalf of yourself and anyone claiming through you, release and forever discharge Crest, its " +
      "owners, officers, employees, technicians, and agents from any and all claims, demands, and causes of " +
      "action, known or unknown, arising out of or relating to the work performed under this Authorization, " +
      "except to the extent caused by Crest's gross negligence or willful misconduct. You expressly waive the " +
      "benefit of California Civil Code Section 1542, which states: \"A general release does not extend to claims " +
      "that the creditor or releasing party does not know or suspect to exist in his or her favor at the time of " +
      "executing the release and that, if known by him or her, would have materially affected his or her " +
      "settlement with the debtor or released party.\"",
    ],
  },
  {
    title: "10. Indemnification",
    paragraphs: [
      "You agree to defend, indemnify, and hold harmless Crest and its owners, officers, employees, technicians, " +
      "and agents from and against any claim, loss, damage, liability, cost, or expense (including reasonable " +
      "attorneys' fees) arising out of or relating to: (a) any breach of this Authorization by you; (b) any " +
      "misrepresentation of your authority to sign; (c) your failure to disclose a health condition, hazard, or " +
      "sensitive item; (d) tampering with, moving, or removing any Crest device; (e) failure to follow " +
      "preparation, re-entry, or post-treatment instructions; or (f) any claim by a tenant, guest, invitee, or " +
      "other occupant of the Premises relating to access granted under this Authorization.",
    ],
  },
  {
    title: "11. Access, Refusals & Rescheduling",
    paragraphs: [
      "If the technician cannot gain safe access, the Premises are not prepared as instructed, an occupant " +
      "refuses entry, or an unsafe condition exists, Crest may postpone or decline the treatment. The visit may " +
      "be counted as a completed service, and a trip or re-scheduling fee may apply under the governing service " +
      "agreement. Crest will not force entry and is not responsible for any delay in treatment caused by a " +
      "refusal or lack of access.",
    ],
  },
  {
    title: "12. Fees & Payment",
    paragraphs: [
      "Fees, billing cycles, and payment terms for the work are governed by the applicable Crest service " +
      "agreement, proposal, or invoice. Where no separate agreement exists, payment is due upon completion of " +
      "service. Past-due balances may accrue a late charge of 1.5% per month (or the maximum permitted by law, " +
      "if less) plus the costs of collection, including reasonable attorneys' fees.",
    ],
  },
  {
    title: "13. Term, Continuing Authorization & Revocation",
    paragraphs: [
      "This Authorization takes effect on the date signed and continues for every visit, treatment, and follow-up " +
      "at the Premises until revoked by you in writing delivered to Crest. Revocation does not affect any work " +
      "already performed, any fees already incurred, or Sections 6 through 10 and 14 through 17, which survive.",
    ],
  },
  {
    title: "14. Authority of Signer",
    paragraphs: [
      "You represent and warrant that you are the owner of the Premises, a lawful occupant with the right to " +
      "grant entry, the property manager, or an agent with actual authority to sign on behalf of the owner or " +
      "occupant, and that no lease, covenant, association rule, or law prohibits the work authorized here. If " +
      "you are a tenant, you confirm that your landlord permits pest treatment of the Premises or has requested " +
      "it. If you are a property manager or agent, you confirm that you have authority to bind the owner and, " +
      "where required, that occupants have received any notice required by law or by the lease.",
    ],
  },
  {
    title: "15. Records, Photographs & Communications",
    paragraphs: [
      "Crest may photograph treated areas, pest activity, and conditions at the Premises for its service " +
      "records and reports, and may share those records with the property owner, property manager, or account " +
      "holder for the Premises. You consent to receive service reports, reminders, and related communications " +
      "from Crest by email, text message, and phone at the contact information provided.",
    ],
  },
  {
    title: "16. Relationship to Service Agreement",
    paragraphs: [
      "This Authorization supplements, and does not replace, any Crest service agreement, proposal, or invoice " +
      "covering the Premises. If there is a conflict between this Authorization and a signed service agreement, " +
      "the service agreement controls as between Crest and the account holder, and this Authorization controls " +
      "as to access, release, and indemnity by the Authorizing Party.",
    ],
  },
  {
    title: "17. Electronic Signature, Governing Law & General Terms",
    paragraphs: [
      "You agree that this Authorization may be signed electronically and that your electronic signature, " +
      "typed name, or checkbox acknowledgment has the same force and effect as a handwritten signature under the " +
      "California Uniform Electronic Transactions Act (Cal. Civ. Code § 1633.1 et seq.) and the federal E-SIGN " +
      "Act. A printed or electronically stored copy of this Authorization is as valid as an original.",
      "This Authorization is governed by the laws of the State of California without regard to its conflict-of-" +
      "laws rules. Any dispute arising out of or relating to this Authorization or the work will be brought " +
      "exclusively in the state or federal courts located in Orange County, California, and the prevailing party " +
      "will recover its reasonable attorneys' fees and costs. If any provision is held unenforceable, it will be " +
      "enforced to the maximum extent permitted and the remaining provisions will remain in full force. No " +
      "waiver is effective unless in writing. This Authorization, together with any applicable service agreement, " +
      "is the entire agreement regarding the subject matter and supersedes all prior oral statements.",
    ],
  },
  {
    title: "18. Questions & Regulatory Contact",
    paragraphs: [
      "Questions about this Authorization or any treatment: Crest Pest Control, (949) 424-5000, crestpestco.com. " +
      "Regulatory information and complaints: Structural Pest Control Board, 2005 Evergreen Street, Ste. 1500, " +
      "Sacramento, CA 95815, (800) 737-8188.",
    ],
  },
];

/** Everything saved for one signed generic Right to Treat (team_documents.form_data). */
export interface RightToTreatFormData {
  property_name: string;
  service_address: string;
  unit_or_area: string | null;
  signer_name: string;
  signer_relationship: string;
  signer_email: string | null;
  signer_phone: string | null;
  form_date: string;
  crest_representative: string | null;
  right_to_enter: boolean;
  terms_agreed: boolean;
  /** Version of the terms text that was signed — bump when RTT_SECTIONS change. */
  terms_version: string;
}

export const RTT_TERMS_VERSION = "2026-10-07";
