import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Shield, ExternalLink, Copy } from "lucide-react";
import { toast } from "@/hooks/use-toast";

/**
 * Small card surfaced in admin & PM views with a shareable / downloadable
 * link to the customized Pesticide Pre-Application Notice for a property.
 */
export function PreApplicationNoticeCard({ propertyId }: { propertyId: string }) {
  const url = `${window.location.origin}/pre-application/${propertyId}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: "Link copied", description: "Pre-application notice link copied to clipboard." });
    } catch {
      toast({ title: "Copy failed", description: url, variant: "destructive" });
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Shield className="w-4 h-4" />
          Pesticide Pre-Application Notice
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          California-required pre-application notice, customized for this property. Share the link
          with residents and management — they can view, print, or download as PDF.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" asChild>
            <a href={url} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
              View / Download
            </a>
          </Button>
          <Button size="sm" variant="outline" onClick={copy}>
            <Copy className="w-3.5 h-3.5 mr-1.5" />
            Copy Link
          </Button>
        </div>
        <div className="text-[10px] text-muted-foreground break-all font-mono bg-muted/50 rounded px-2 py-1">
          {url}
        </div>
      </CardContent>
    </Card>
  );
}

export default PreApplicationNoticeCard;