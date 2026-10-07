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
  "This Right to Treat Authorization and Release (\"Authorization\") is between Crest Pest Control (\"Crest\") " +
  "and the undersigned owner, occupant, manager, or authorized agent (\"you\") for the premises identified " +
  "above (the \"Premises\"). By signing, you confirm you have read, understood, and agree to every section below.";

export const RTT_RIGHT_TO_ENTER_ACK =
  "Right to Enter. I give Crest Pest Control and its licensed technicians permission to enter the Premises " +
  "(including any unit, yard, attic, crawl space, garage, or common area needed for the work) on the scheduled " +
  "date(s) and for any follow-up visits, whether or not I am present, to inspect, treat, and install or service " +
  "pest control devices.";

export const RTT_TERMS_ACK =
  "I have read and agree to all Terms, Notices, and Releases on this form, including the Pesticide Notice, the " +
  "Limitation of Liability and Release, and the Indemnification.";

export interface RttSection {
  title: string;
  paragraphs: string[];
}

export const RTT_SECTIONS: RttSection[] = [
  {
    title: "1. Authorization to Treat",
    paragraphs: [
      "You authorize Crest to inspect and treat the Premises for pests, inside and/or outside, and to perform " +
      "follow-up treatments, using the methods, products, and devices the licensed technician judges appropriate " +
      "(including sprays, dusts, gels, baits, foams, traps, bait stations, monitors, and minor non-structural " +
      "exclusion). All pesticides are registered by the U.S. EPA and the California Department of Pesticide " +
      "Regulation and are applied per label and California law. Crest is licensed and regulated by the " +
      "California Structural Pest Control Board. Devices installed by Crest remain Crest's property; do not " +
      "move, open, or tamper with them.",
    ],
  },
  {
    title: "2. State-Required Pesticide Notice (Bus. & Prof. Code § 8538)",
    paragraphs: [PESTICIDE_NOTICE],
  },
  {
    title: "3. Possible Chemicals Used",
    paragraphs: [
      "Depending on the pest and the technician's findings, any of the following may be applied: " +
      POSSIBLE_CHEMICALS.join("; ") + ". Labels and Safety Data Sheets are available on request. The products " +
      "actually applied are listed on each visit's service report.",
    ],
  },
  {
    title: "4. Your Responsibilities & Health Acknowledgment",
    paragraphs: [
      "You will follow all preparation and post-treatment instructions; remove or cover food, dishes, pet bowls, " +
      "bedding, and personal items in treated areas; secure pets and cover aquariums; keep children, pregnant " +
      "persons, and anyone with asthma, allergies, chemical sensitivities, or other medical conditions out of " +
      "treated areas during application and for the re-entry period stated by the technician; provide safe, " +
      "clear access; and disclose in advance any known health condition of an occupant or hazard at the Premises. " +
      "You acknowledge that pesticides are toxic chemicals and that risk depends on exposure. If anyone has " +
      "flu-like symptoms within 24 hours of an application, contact a physician or Poison Control (800-222-1222) " +
      "and Crest immediately.",
    ],
  },
  {
    title: "5. No Guarantee of Eradication; Exclusions",
    paragraphs: [
      "Results depend on sanitation, structure, moisture, weather, neighboring properties, and your cooperation, " +
      "none of which Crest controls, so Crest does not guarantee complete elimination or permanent prevention of " +
      "any pest. Under an active Crest service plan, your sole remedy for pest activity between visits is a " +
      "re-treatment at no extra charge. Unless stated in a separate written agreement, this Authorization does " +
      "not include termites or other wood-destroying organisms (or any WDO inspection or report), bed bugs, " +
      "German cockroaches, interior fleas, bees or wasps, birds or wildlife, rodent trapping or exclusion, attic " +
      "or crawl-space clean-out, web removal, or repair of any structure, finish, or landscaping. Crest does not " +
      "identify, test for, or remediate mold, asbestos, lead, moisture, or structural, electrical, or plumbing " +
      "conditions, and may stop or decline work it considers unsafe without liability.",
    ],
  },
  {
    title: "6. Limitation of Liability & Release",
    paragraphs: [
      "TO THE FULLEST EXTENT PERMITTED BY LAW, Crest is not liable for: (a) structural or property damage caused " +
      "by any pest, rodent, or wildlife; (b) damage to flooring, fabric, finishes, plants, electronics, or " +
      "personal property resulting from your failure to prepare the Premises or to disclose a sensitive item or " +
      "condition; (c) injury or illness to any person or animal that enters a treated area before the re-entry " +
      "period ends, tampers with a device, or has a condition not disclosed to Crest; or (d) any indirect, " +
      "incidental, consequential, or punitive damages, including loss of use, rent, or business and relocation " +
      "costs. Crest's total liability for any claim will not exceed the amount paid to Crest for the service " +
      "giving rise to the claim.",
      "You release and discharge Crest and its owners, employees, technicians, and agents from all claims, known " +
      "or unknown, arising from the work under this Authorization, except those caused by Crest's gross " +
      "negligence or willful misconduct, and you waive California Civil Code § 1542, which states: \"A general " +
      "release does not extend to claims that the creditor or releasing party does not know or suspect to exist " +
      "in his or her favor at the time of executing the release and that, if known by him or her, would have " +
      "materially affected his or her settlement with the debtor or released party.\"",
    ],
  },
  {
    title: "7. Indemnification",
    paragraphs: [
      "You will defend, indemnify, and hold harmless Crest and its owners, employees, technicians, and agents " +
      "from any claim, loss, or expense (including reasonable attorneys' fees) arising from your breach of this " +
      "Authorization, any misrepresentation of your authority to sign, failure to disclose a health condition or " +
      "hazard, tampering with a Crest device, failure to follow instructions, or any claim by a tenant, guest, " +
      "or other occupant relating to the access granted here.",
    ],
  },
  {
    title: "8. Access, Fees & Revocation",
    paragraphs: [
      "If safe access is not available, the Premises are not prepared, or entry is refused, Crest may postpone or " +
      "decline the treatment; the visit may count as completed and a trip fee may apply under the governing " +
      "service agreement. Fees and payment terms are governed by the applicable Crest service agreement, " +
      "proposal, or invoice; otherwise payment is due on completion, and past-due balances may accrue 1.5% per " +
      "month (or the legal maximum, if less) plus collection costs and attorneys' fees. This Authorization " +
      "covers every visit at the Premises until you revoke it in writing; revocation does not affect work " +
      "already performed, fees already incurred, or Sections 5 through 10, which survive.",
    ],
  },
  {
    title: "9. Authority of Signer; Records",
    paragraphs: [
      "You represent that you are the owner, a lawful occupant with the right to grant entry, the property " +
      "manager, or an agent with authority to bind the owner or occupant, and that no lease, association rule, " +
      "or law prohibits this work. If you are a tenant, your landlord permits or has requested the treatment; if " +
      "you are a manager or agent, any notice to occupants required by law or lease has been given. Crest may " +
      "photograph treated areas and conditions for its records and share them with the owner, manager, or " +
      "account holder, and may contact you by email, text, or phone about the service.",
    ],
  },
  {
    title: "10. Electronic Signature, Governing Law & General Terms",
    paragraphs: [
      "Your electronic signature, typed name, or checkbox has the same effect as a handwritten signature under " +
      "the California Uniform Electronic Transactions Act (Civ. Code § 1633.1 et seq.) and the federal E-SIGN " +
      "Act, and a stored copy is as valid as an original. California law governs; any dispute will be brought " +
      "exclusively in the state or federal courts in Orange County, California, and the prevailing party " +
      "recovers reasonable attorneys' fees and costs. If any provision is unenforceable, the rest remains in " +
      "effect. This Authorization supplements any Crest service agreement; if they conflict, the service " +
      "agreement controls between Crest and the account holder, and this Authorization controls as to access, " +
      "release, and indemnity. Questions: Crest Pest Control, (949) 424-5000. Regulatory information or " +
      "complaints: Structural Pest Control Board, 2005 Evergreen St., Ste. 1500, Sacramento, CA 95815, " +
      "(800) 737-8188.",
    ],
  },
];

/** Everything saved for one signed generic Right to Treat (team_documents.form_data). */
export interface RightToTreatFormData {
  /** Removed from the form 10/7/26; still present on older rows. */
  property_name?: string;
  service_address: string;
  /** Removed from the form 10/7/26; still present on older rows. */
  unit_or_area?: string | null;
  signer_name: string;
  /** Removed from the form 10/7/26; still present on older rows. */
  signer_relationship?: string;
  signer_email: string | null;
  signer_phone: string | null;
  form_date: string;
  crest_representative: string | null;
  right_to_enter: boolean;
  terms_agreed: boolean;
  /** Version of the terms text that was signed — bump when RTT_SECTIONS change. */
  terms_version: string;
}

export const RTT_TERMS_VERSION = "2026-10-07b";
