// useAdminSession — wraps the existing admin-session pattern used by
// AdminDashboard. Pages that should be admin-only call this hook once on mount.
// While the token is being validated, they show a loading state; once valid,
// they get a ready `sessionToken` they can pass to other edge functions.

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";

export type AdminSessionState =
  | { status: "loading"; token: null }
  | { status: "valid";   token: string }
  | { status: "invalid"; token: null };

export function useAdminSession(): AdminSessionState {
  const navigate = useNavigate();
  const [state, setState] = useState<AdminSessionState>({ status: "loading", token: null });

  useEffect(() => {
    let cancelled = false;
    const sessionToken = localStorage.getItem("admin_session");

    if (!sessionToken) {
      toast.error("Please sign in");
      navigate("/admin-login");
      setState({ status: "invalid", token: null });
      return;
    }

    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke("validate-admin-session", {
          body: { sessionToken },
        });
        if (cancelled) return;
        if (error || !data?.valid) {
          localStorage.removeItem("admin_session");
          toast.error("Session expired. Please sign in again.");
          navigate("/admin-login");
          setState({ status: "invalid", token: null });
          return;
        }
        setState({ status: "valid", token: sessionToken });
      } catch (e) {
        console.error("Session validation error:", e);
        if (cancelled) return;
        localStorage.removeItem("admin_session");
        toast.error("Authentication failed. Please sign in again.");
        navigate("/admin-login");
        setState({ status: "invalid", token: null });
      }
    })();

    return () => { cancelled = true; };
  }, [navigate]);

  return state;
}
