import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ClipboardList } from "lucide-react";
import {
  DEFAULT_PEST_SURVEY_QUESTIONS,
  type SurveyQuestion,
} from "@/lib/surveyDefaults";

interface SurveyQuestionsPreviewProps {
  /** "tenant" | "resident" — used in the helper text only. */
  residentTerm?: string;
  /** Optional override. Defaults to the canonical pest survey question set. */
  questions?: SurveyQuestion[];
  /** Render the preview already expanded (default: collapsed). */
  defaultOpen?: boolean;
}

/**
 * Read-only preview of the exact survey questions {residentTerm}s receive.
 * Used in BOTH the admin portal (PropertyDashboard) and the PM portal
 * (PMPortalView) so internal stakeholders can confirm what's being asked
 * before they hit "Send Survey".
 */
export function SurveyQuestionsPreview({
  residentTerm = "resident",
  questions = DEFAULT_PEST_SURVEY_QUESTIONS,
  defaultOpen = false,
}: SurveyQuestionsPreviewProps) {
  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <ClipboardList className="w-4 h-4 text-primary" />
          Survey Questions Preview
          <Badge variant="secondary" className="ml-1 text-xs">
            {questions.length} questions
          </Badge>
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          This is exactly what {residentTerm}s will see.
        </p>
      </CardHeader>
      <CardContent>
        <details className="group" open={defaultOpen}>
          <summary className="flex items-center justify-between gap-3 cursor-pointer list-none rounded-md border bg-muted/30 px-3 py-2 hover:bg-muted/50">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Show question preview
            </span>
            <ChevronDown className="w-4 h-4 text-muted-foreground transition-transform group-open:rotate-180" />
          </summary>
          <div className="space-y-4 mt-3">
            {questions.map((q, idx) => (
              <div key={q.id} className="border rounded-md p-3 bg-muted/30">
                <p className="text-sm font-semibold mb-2">
                  <span className="text-muted-foreground mr-1">{idx + 1}.</span>
                  {q.label.replace(/^\s*\d+\.\s*/, "")}
                </p>
                {q.type === "rating" && (
                  <div className="space-y-1">
                    <div className="flex gap-1.5">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <div
                          key={n}
                          className="w-9 h-9 rounded border bg-background flex items-center justify-center text-xs font-semibold text-muted-foreground"
                        >
                          {n}
                        </div>
                      ))}
                    </div>
                    <div className="flex justify-between text-xs text-muted-foreground max-w-[230px] px-0.5">
                      <span>1 = Poor</span>
                      <span>5 = Excellent</span>
                    </div>
                  </div>
                )}
                {q.type === "text" && (
                  <div className="border rounded bg-background h-14 text-xs text-muted-foreground italic px-2 py-1.5">
                    Open-ended response…
                  </div>
                )}
                {(q.type === "single" || q.type === "multi") && (
                  <div className="space-y-1">
                    {(q.options || []).map((opt) => (
                      <div key={opt} className="flex items-center gap-2 text-xs">
                        <div
                          className={`w-3.5 h-3.5 border ${
                            q.type === "single" ? "rounded-full" : "rounded-sm"
                          } bg-background`}
                        />
                        <span>{opt}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </details>
      </CardContent>
    </Card>
  );
}

export default SurveyQuestionsPreview;
