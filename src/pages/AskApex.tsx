// AskApex — PREVIEW SHELL (Phase 0 mockup).
//
// This is a UI-only preview of the planned "Ask Apex" page. It does NOT call any
// backend — answers are canned/stubbed so you can see and feel the page before
// the Apex Agent Service (read-only BigQuery, Claude Agent SDK) is built.
//
// When Phase 0 is built for real, the stub `cannedAnswer()` is replaced by a
// supabase.functions.invoke("apex-chat", …) call; everything else stays.

import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, MessageSquare, Send, Lock } from "lucide-react";

import { useCurrentStaff } from "@/hooks/useCurrentStaff";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type Turn = { role: "user" | "assistant"; content: string };

const EXAMPLES = [
  "Which customers are overdue for service this week?",
  "How many Pending appointments are in Irvine in the next 7 days?",
  "What's our reservice rate trend over the last 3 months?",
];

const AskApex = () => {
  const navigate = useNavigate();
  const staff = useCurrentStaff();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const RESTRICTED = new Set(["Michael Muniz","Darrell Tanner","Dylan Gallegos","Jackson Latham","Nick Stovall"]);
    if (staff && RESTRICTED.has(staff.fullName)) navigate("/", { replace: true });
  }, [staff, navigate]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns, thinking]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = input.trim();
    if (!staff) return toast.error("Please sign in again.");
    if (q.length < 2) return;

    const history = [...turns, { role: "user" as const, content: q }];
    setTurns(history);
    setInput("");
    setThinking(true);
    try {
      const { data, error } = await supabase.functions.invoke("apex-chat", {
        body: {
          staffName: staff.fullName,
          messages: history.map((t) => ({ role: t.role, content: t.content })),
        },
      });
      if (error) throw error;
      if (!data?.ok || !data.result?.ok) {
        const msg = data?.result?.error || data?.detail?.detail || data?.error || "Couldn't answer that.";
        setTurns((t) => [...t, { role: "assistant", content: `Sorry — ${msg}` }]);
        return;
      }
      setTurns((t) => [...t, { role: "assistant", content: data.result.answer || "(no answer)" }]);
    } catch (err: any) {
      console.error(err);
      setTurns((t) => [...t, { role: "assistant", content: "Sorry — something went wrong reaching the assistant." }]);
    } finally {
      setThinking(false);
    }
  };

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate("/")}>
            <ArrowLeft className="w-4 h-4 mr-2" /> Back to home
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-sky-500" /> Ask Me Anything
            </CardTitle>
            <CardDescription>
              Ask anything about your customer and scheduling data and get a plain-language
              answer. <strong>Read-only</strong> — it can't change anything.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="min-h-[260px] max-h-[480px] overflow-y-auto space-y-3 rounded-md border p-3 bg-muted/20">
              {turns.length === 0 && (
                <>
                  <div className="text-left">
                    <div className="inline-block max-w-[90%] rounded-lg border bg-background px-3 py-2 text-sm">
                      Hi{staff ? ` ${staff.fullName.split(" ")[0]}` : ""} 👋 Ask me anything about your
                      customer and scheduling data — overdue customers, what's scheduled in a city or
                      area, service-type counts, reservice trends, and more. I read the data and answer
                      in plain language. I can't change anything.
                    </div>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    <p className="mb-2">Try asking:</p>
                    <ul className="space-y-1">
                      {EXAMPLES.map((ex) => (
                        <li key={ex}>
                          <button
                            type="button"
                            className="text-left underline decoration-dotted hover:text-foreground"
                            onClick={() => setInput(ex)}
                          >
                            {ex}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                </>
              )}
              {turns.map((t, i) => (
                <div key={i} className={t.role === "user" ? "text-right" : "text-left"}>
                  <div className={`inline-block max-w-[90%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${
                    t.role === "user" ? "bg-primary text-primary-foreground" : "bg-background border"
                  }`}>
                    {t.content}
                  </div>
                </div>
              ))}
              {thinking && <div className="text-sm text-muted-foreground italic">Thinking…</div>}
              <div ref={endRef} />
            </div>

            <form onSubmit={send} className="mt-3 flex gap-2">
              <Input
                placeholder="Ask a question about your data…"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                autoFocus
              />
              <Button type="submit" disabled={input.trim().length < 2}>
                <Send className="w-4 h-4" />
              </Button>
            </form>

            <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Lock className="w-3 h-3" />
              Read-only — reads your customer &amp; scheduling data; it can't change anything.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AskApex;
