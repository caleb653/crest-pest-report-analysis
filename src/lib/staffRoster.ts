/**
 * Single source of truth for the Crest staff roster.
 * Used by login, technician selection, property owner dropdown, and
 * notification routing. Jesse Angulo intentionally excluded.
 */
export interface StaffMember {
  username: string;   // login key (lowercase)
  fullName: string;   // display name (matches technician_name fields)
  email: string;      // company email for notification CCs
}

export const STAFF: StaffMember[] = [
  { username: "dtanner",   fullName: "Darrell Tanner",  email: "dtanner@crestpestcontrol.com" },
  { username: "jake",      fullName: "Jake Shubin",     email: "jake@crestpestcontrol.com" },
  { username: "caleb",     fullName: "Caleb Whalen",    email: "caleb@crestpestcontrol.com" },
  { username: "jlatham",   fullName: "Jackson Latham",  email: "jlatham@crestpestcontrol.com" },
  { username: "dgallegos", fullName: "Dylan Gallegos",  email: "dgallegos@crestpestcontrol.com" },
  { username: "mmuniz",    fullName: "Michael Muniz",   email: "mmuniz@crestpestcontrol.com" },
  { username: "clopez",    fullName: "Carmen Lopez",    email: "clopez@crestpestcontrol.com" },
  { username: "dlongoria", fullName: "David Longoria",  email: "dlongoria@crestpestcontrol.com" },
  { username: "nstovall", fullName: "Nick Stovall",    email: "nstovall@crestpestcontrol.com" },
  { username: "ccarnival", fullName: "Cade Carnival",  email: "ccarnival@crestpestcontrol.com" },
  { username: "blyttle",   fullName: "Brock Lyttle",   email: "blyttle@crestpestcontrol.com" },
];

export const STAFF_NAMES: string[] = STAFF.map(s => s.fullName);

export function findStaffByName(fullName: string | null | undefined): StaffMember | null {
  if (!fullName) return null;
  return STAFF.find(s => s.fullName === fullName) || null;
}

export function findStaffByUsername(username: string | null | undefined): StaffMember | null {
  if (!username) return null;
  const key = username.toLowerCase();
  return STAFF.find(s => s.username === key) || null;
}

/** Carmen always receives notifications for tenant requests. */
export const CARMEN_FULL_NAME = "Carmen Lopez";
export const CARMEN_EMAIL = "office@crestpestcontrol.com";
export const OFFICE_EMAIL = "office@crestpestcontrol.com";