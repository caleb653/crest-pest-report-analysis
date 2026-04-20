import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import PMPortalView from "@/components/portal/PMPortalView";
import crestLogo from "@/assets/crest-logo.png";
import { Card, CardContent } from "@/components/ui/card";

const PMPortal = () => {
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [linkId, setLinkId] = useState<string | null>(null);
  const [propertyId, setPropertyId] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    (async () => {
      setLoading(true);
      const { data: link } = await supabase
        .from("portal_links")
        .select("*")
        .eq("token", token)
        .eq("is_active", true)
        .maybeSingle();

      if (!link) {
        setError("Invalid or expired link");
        setLoading(false);
        return;
      }

      const ids = Array.isArray(link.assigned_property_ids)
        ? (link.assigned_property_ids as string[])
        : [];

      if (ids.length === 0) {
        setError("No property assigned to this link");
        setLoading(false);
        return;
      }

      setLinkId(link.id);
      setPropertyId(ids[0]);
      setLoading(false);
    })();
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <img src={crestLogo} alt="Crest Pest Control" className="h-16 mx-auto mb-4 animate-pulse" />
          <p className="text-muted-foreground text-sm">Loading your portal...</p>
        </div>
      </div>
    );
  }

  if (error || !propertyId || !linkId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Card className="max-w-md w-full mx-4">
          <CardContent className="p-8 text-center">
            <img src={crestLogo} alt="Crest Pest Control" className="h-16 mx-auto mb-4" />
            <p className="text-destructive font-medium">{error || "Unable to load portal"}</p>
            <p className="text-sm text-muted-foreground mt-2">
              Please contact Crest Pest Control if you believe this is an error.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <PMPortalView propertyId={propertyId} linkId={linkId} />;
};

export default PMPortal;
