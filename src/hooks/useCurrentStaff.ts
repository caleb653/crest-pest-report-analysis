import { useEffect, useState } from "react";
import { findStaffByName, type StaffMember } from "@/lib/staffRoster";

/**
 * Returns the staff member currently logged in via PinGate (sessionStorage).
 * Returns null on public pages where no staff is signed in.
 */
export function useCurrentStaff(): StaffMember | null {
  const [staff, setStaff] = useState<StaffMember | null>(null);

  useEffect(() => {
    const fullName = sessionStorage.getItem("app_logged_in_user");
    setStaff(findStaffByName(fullName));

    // React to logins/logouts in other tabs
    const onStorage = () => {
      const n = sessionStorage.getItem("app_logged_in_user");
      setStaff(findStaffByName(n));
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  return staff;
}