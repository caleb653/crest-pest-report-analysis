import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { CheckCircle2, Loader2, ClipboardList } from "lucide-react";
import { toast } from "sonner";

interface SurveyQuestion {
  id: string;
  label: string;
  type: "single" | "multi" | "rating" | "text";
  options?: string[];
}

const SurveyTake = () => {
  const { token } = useParams();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [survey, setSurvey] = useState<{ title: string; intro: string | null; questions: SurveyQuestion[] } | null>(null);
  const [property, setProperty] = useState<{ name: string; address: string | null } | null>(null);
  const [alreadySubmitted, setAlreadySubmitted] = useState(false);
  const [respondentName, setRespondentName] = useState("");
  const [unitNumber, setUnitNumber] = useState("");
  const [answers, setAnswers] = useState<Record<string, unknown>>({});

  useEffect(() => {
    if (!token) { setError("Invalid link"); setLoading(false); return; }
    (async () => {
      try {
        const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/submit-survey-response?token=${encodeURIComponent(token)}`;
        const res = await fetch(url, {
          headers: {
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
        });
        const json = await res.json();
        if (!json.ok) {
          setError(json.error === "not_found" ? "This link is invalid or has expired." : "Could not load survey.");
        } else {
          setSurvey(json.survey || { title: "Pest Activity Survey", intro: null, questions: [] });
          setProperty(json.property);
          setAlreadySubmitted(!!json.response?.submitted_at);
          if (json.response?.respondent_name) setRespondentName(json.response.respondent_name);
          if (json.response?.unit_number) setUnitNumber(json.response.unit_number);
          if (json.response?.answers && typeof json.response.answers === "object") {
            setAnswers(json.response.answers);
          }
        }
      } catch {
        setError("Could not load survey.");
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  const handleSubmit = async () => {
    if (!survey) return;
    // Light validation: at least one answer
    const answered = Object.values(answers).some((v) => {
      if (Array.isArray(v)) return v.length > 0;
      return v !== undefined && v !== null && String(v).trim() !== "";
    });
    if (!answered) {
      toast.error("Please answer at least one question");
      return;
    }
    setSubmitting(true);
    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/submit-survey-response`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({
          token,
          answers,
          respondentName: respondentName.trim() || undefined,
          unitNumber: unitNumber.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!json.ok) {
        toast.error("Could not submit survey");
      } else {
        toast.success("Thank you — your response has been recorded");
        setAlreadySubmitted(true);
      }
    } catch {
      toast.error("Network error");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
        <Card className="max-w-md w-full"><CardContent className="p-6 text-center">
          <p className="text-destructive font-medium">{error}</p>
        </CardContent></Card>
      </div>
    );
  }

  if (alreadySubmitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
        <Card className="max-w-md w-full"><CardContent className="p-8 text-center space-y-3">
          <CheckCircle2 className="w-12 h-12 text-primary mx-auto" />
          <p className="font-semibold text-lg">Response Received</p>
          <p className="text-sm text-muted-foreground">Thank you for taking the time. Property management and Crest Pest Control have your feedback.</p>
        </CardContent></Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30 py-6 px-4">
      <div className="max-w-xl mx-auto space-y-4">
        <Card>
          <CardHeader className="bg-foreground text-background rounded-t-lg">
            <CardTitle className="flex items-center gap-2 text-lg">
              <ClipboardList className="w-5 h-5" />
              {survey?.title || "Pest Activity Survey"}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-5 space-y-5">
            {property && (
              <div className="text-sm">
                <p><span className="text-muted-foreground">Property:</span> <span className="font-semibold">{property.name}</span></p>
                {property.address && <p className="text-xs text-muted-foreground">{property.address}</p>}
              </div>
            )}
            {survey?.intro && (
              <div className="rounded-md border bg-muted/40 p-3 text-xs leading-relaxed whitespace-pre-wrap">{survey.intro}</div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Your Name (optional)</Label>
                <Input value={respondentName} onChange={(e) => setRespondentName(e.target.value)} maxLength={200} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Unit Number (optional)</Label>
                <Input value={unitNumber} onChange={(e) => setUnitNumber(e.target.value)} maxLength={50} />
              </div>
            </div>

            <div className="space-y-5">
              {(survey?.questions || []).map((q) => (
                <div key={q.id} className="space-y-2">
                  <Label className="text-sm font-semibold">{q.label}</Label>
                  {q.type === "single" && (
                    <RadioGroup
                      value={(answers[q.id] as string) || ""}
                      onValueChange={(v) => setAnswers((a) => ({ ...a, [q.id]: v }))}
                    >
                      {(q.options || []).map((opt) => (
                        <div key={opt} className="flex items-center gap-2">
                          <RadioGroupItem value={opt} id={`${q.id}-${opt}`} />
                          <Label htmlFor={`${q.id}-${opt}`} className="text-sm font-normal cursor-pointer">{opt}</Label>
                        </div>
                      ))}
                    </RadioGroup>
                  )}
                  {q.type === "multi" && (
                    <div className="space-y-1.5">
                      {(q.options || []).map((opt) => {
                        const current = Array.isArray(answers[q.id]) ? (answers[q.id] as string[]) : [];
                        const checked = current.includes(opt);
                        return (
                          <div key={opt} className="flex items-center gap-2">
                            <Checkbox
                              id={`${q.id}-${opt}`}
                              checked={checked}
                              onCheckedChange={(c) => {
                                const next = c ? [...current, opt] : current.filter((x) => x !== opt);
                                setAnswers((a) => ({ ...a, [q.id]: next }));
                              }}
                            />
                            <Label htmlFor={`${q.id}-${opt}`} className="text-sm font-normal cursor-pointer">{opt}</Label>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {q.type === "rating" && (
                    <div className="flex gap-2">
                      {[1, 2, 3, 4, 5].map((n) => {
                        const selected = Number(answers[q.id]) === n;
                        return (
                          <button
                            key={n}
                            type="button"
                            onClick={() => setAnswers((a) => ({ ...a, [q.id]: n }))}
                            className={`w-10 h-10 rounded-md border text-sm font-semibold transition ${selected ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-muted"}`}
                          >
                            {n}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {q.type === "text" && (
                    <Textarea
                      value={(answers[q.id] as string) || ""}
                      onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
                      rows={3}
                      maxLength={1000}
                      placeholder="Your answer..."
                    />
                  )}
                </div>
              ))}
            </div>

            <Button className="w-full" size="lg" onClick={handleSubmit} disabled={submitting}>
              {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Submit Survey
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default SurveyTake;