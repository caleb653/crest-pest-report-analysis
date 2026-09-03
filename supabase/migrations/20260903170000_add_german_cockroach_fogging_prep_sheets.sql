-- Add the three German Cockroach FOGGING prep sheets (Standard / Apartment-Tenant / Commercial).
-- PDFs live in the public portal-documents bucket under prep-sheets/. Idempotent on title.
INSERT INTO public.portal_prep_sheets (title, treatment_type, description, file_url)
SELECT $$Standard - German Cockroach Fogging Prep Sheet$$, $$German Cockroaches (Fogging)$$, $$Preparation Sheet: German Roaches (Fogging)

Welcome to Crest Pest Control! We appreciate you entrusting us with your pest control needs. These requirements (especially clearing the kitchen counters/cabinets and the post-treatment procedures) are absolutely necessary for a safe and effective treatment. If these steps are NOT followed, for your safety, we will not perform a fogging treatment. If these steps are followed, we can perform a full treatment and deliver the ideal outcome for you (i.e., no more roaches). German roaches are stubborn pests, so you'll likely see them dying over the next 2-4 weeks. We'll be back in ~7 days for a follow up visit. If you have any questions, don't hesitate to give us a call at 949-424-5000.

Pre-Treatment Requirements:

If pest activity is limited to the kitchen or bathroom:
• Kitchen & Bathroom Cabinets: Remove everything (food, containers, personal items, etc.) from all kitchen/bathroom cabinets and counters.
   - Place all kitchen items on a table or floor, outside of the kitchen, and cover with a plastic bag or sheet.
   - Clean and wash all kitchen cabinets
• Electrical Outlets: Remove outlet covers in kitchen and affected bedrooms, so we can treat the wall voids
• Appliances: If easily accessible, please pull out large appliances (e.g., refrigerator and stove), so we can do a thorough treatment in these areas.

If pest activity has also been identified in bedrooms:
• Closet: Remove all items from bedroom closet racks, floor, shelves, and hall closets. Place items in the center of the room or on the bed.
   - Clothing on hangers may be left in place by pulling it towards the center of the rack and covering it with a sheet and/or plastic (e.g., trash bag).
• Furniture: Move all furniture at least 8 inches away from the walls.

During Treatment:
• Remove all pets (birds, dogs, cats, fish, rodents, amphibians, and reptiles) from treated areas
   - Pro Tip: If you cannot remove a fish tank, cover the fish tank and turn off air pumps and filters prior to treatment (remember to turn on air pump and filters once treatment has dried).
• All people and pets are required vacate the premises during treatment for the time specified by the pest control professional (typically 4 hours)

Post-Treatment:
• Be sure the products used are completely dry before returning your items to their cabinets, closets, and drawers.
• Wipe down any counter tops, stove tops, bread boards, and any eating services after the treatment.
• Do not wash the cabinets themselves, as this will lessen the effectiveness of the products.
• There will be a follow-up visit by your technician in ~7 days. The same preparation is required for the follow-up treatment (so it may be easiest to keep the cabinets empty in between services)$$, $$https://dbalmswufjanxswboxxp.supabase.co/storage/v1/object/public/portal-documents/prep-sheets/german-cockroaches-fogging-standard.pdf$$
WHERE NOT EXISTS (SELECT 1 FROM public.portal_prep_sheets WHERE title = $$Standard - German Cockroach Fogging Prep Sheet$$);

INSERT INTO public.portal_prep_sheets (title, treatment_type, description, file_url)
SELECT $$Apartment (Tenant) - German Cockroach Fogging Prep Sheet$$, $$German Cockroaches (Fogging)$$, $$Prep Sheet: German Roach (Fogging)

Below are the instructions and information to assist you in preparing your residence for a German Cockroach fogging treatment. These requirements (especially clearing the kitchen counters/cabinets and the post-treatment procedures) are absolutely necessary for a safe and effective treatment. If these steps are NOT followed, for your safety, we will not perform a fogging treatment. If these steps are followed, we can perform a full treatment and deliver the ideal outcome for you (i.e., no more roaches). Depending on our findings, we will likely request a follow-up visit 7 days later. If this is required, the same preparation steps must be completed.

Pre-Treatment Requirements:

If pest activity is limited to the kitchen or bathroom:
• Kitchen Cabinets: Remove everything (food, containers, personal items, etc.) from all kitchen and bathroom cabinets, drawers, and counters.
   - Place all kitchen items on a table or floor, outside of the kitchen, and cover with a plastic bag or sheet.
   - Make sure all food items are placed in the fridge or covered by the plastic bag. No food items should remain in or around the kitchen area
   - Clean and wash all kitchen cabinets
• Electrical Outlets: Remove outlet covers in kitchen and affected bedrooms, so we can treat the wall voids
• Appliances: If easily accessible, please pull out large appliances (e.g., refrigerator and stove), so we can do a thorough treatment in these areas.

If pest activity has also been identified in bedrooms:
• Closet: Remove all items from bedroom closet racks, floor, shelves, and hall closets. Place items in the center of the room or on the bed.
   - Clothing on hangers may be left in place by pulling it towards the center of the rack and covering it with a sheet and/or plastic (e.g., trash bag).
• Furniture: Move all furniture at least 8 inches away from the walls.

During Treatment:
• All people and pets (birds, dogs, cats, fish, rodents, amphibians, and reptiles) must vacate the premises during treatment for the time specified by the pest control professional (typically 4 hours)

Post-Treatment:
• Be sure the products used are completely dry before returning your items to their cabinets, closets, and drawers
• Wipe down any counter and/or eating surfaces upon returning
• Do not wash the cabinets, as this will lessen the effectiveness of the products$$, $$https://dbalmswufjanxswboxxp.supabase.co/storage/v1/object/public/portal-documents/prep-sheets/german-cockroaches-fogging-apartment.pdf$$
WHERE NOT EXISTS (SELECT 1 FROM public.portal_prep_sheets WHERE title = $$Apartment (Tenant) - German Cockroach Fogging Prep Sheet$$);

INSERT INTO public.portal_prep_sheets (title, treatment_type, description, file_url)
SELECT $$Commercial - German Cockroach Fogging Prep Sheet$$, $$German Cockroaches (Fogging)$$, $$Commercial Preparation Sheet: German Roaches (Fogging)

Welcome to Crest Pest Control! We appreciate you entrusting us with your pest control needs. Below are the preparation and post-treatment requirements for our commercial German cockroach fogging treatment. These requirements (especially clearing the kitchen counters/cabinets, turning off pilot lights, and the post-treatment procedures) are absolutely necessary for a safe and effective treatment. If these steps are NOT followed, for your safety, we will not perform a fogging treatment. If these steps are followed, we can perform a full treatment and deliver the ideal outcome for you. German roaches are stubborn pests, so you'll likely see them dying over the next 4 weeks. We'll be back in ~7 days for a follow up visit. If you have any questions, don't hesitate to give us a call at 949-424-5000.

Pre-Treatment Requirements:
• Exposed Food & Food Contact Items: Remove all food, disposable cups/plates, utensils, and food-contact equipment from exposed counters and open shelving
• Cabinets: Empty affected kitchen cabinets and drawers. Perform the same process in bathrooms if activity exists in that area
• Access: To the extent possible, move portable items and appliances away from walls (8-12 inches) in affected areas so baseboards and corners are reachable.
• Electrical Outlets: Remove outlet covers in kitchen and affected bathrooms, so we can treat wall voids
• Pilot Lights: Turn off all pilot lights throughout the kitchen
• Conditions: See the inspection report for any sanitation concerns. Address these concerns ASAP to help get the best outcome.

During Treatment:
• Keep employees, customers, and all pets/animals out of treatment area during and at least 4 hours after the treatment

Post-Treatment:
• Cleaning: Wash food contact areas (e.g., counter tops, stove tops, bread boards, etc.)
   - Do not wash the cabinets or baseboards, as this will lessen the effectiveness of the products.
• Cabinets: Be sure the products used are completely dry before returning your items to their cabinets, closets, and drawers.
• Follow-Up: There will be a follow-up visit by your technician in ~7 days (our scheduling team will confirm the exact timing). Based on the technician’s initial assessment, the same preparation may be required for the follow-up treatment$$, $$https://dbalmswufjanxswboxxp.supabase.co/storage/v1/object/public/portal-documents/prep-sheets/german-cockroaches-fogging-commercial.pdf$$
WHERE NOT EXISTS (SELECT 1 FROM public.portal_prep_sheets WHERE title = $$Commercial - German Cockroach Fogging Prep Sheet$$);

