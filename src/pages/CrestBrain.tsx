import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Brain, ExternalLink, RefreshCw, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCurrentStaff } from "@/hooks/useCurrentStaff";
import { BRAIN_ACCESS_CODE } from "@/lib/crestBrainConfig";

/**
 * Crest Brain — ask anything about how Crest works. Answers come only from the
 * "Crest Brain Trust" Google Drive folder via the crest-brain Cloud Run service.
 * This page lives behind the app's PinGate; the service itself is gated by a
 * shared access code sent as a header.
 */
const BRAIN_URL = "https://crest-brain-485248446308.us-central1.run.app";
const FOLDER_URL = "https://drive.google.com/drive/folders/17MudjJReiTxor-u1Yn7rBOCyGOhWS3uF";

const STARTERS = [
  "What is our rodent exclusion guarantee?",
  "How does the burrito compliance email work?",
  "What's the meal break rule?",
  "How do I route a month the Crest Way?",
  "What do we charge for mosquito service?",
  "What should I say when a Yelp lead asks for pricing?",
];

type Source = { id: string; title: string; path: string; link: string };
type Msg = { role: "user" | "assistant"; content: string; sources?: Source[]; error?: string };
type Status = { ready: boolean; docs?: { error?: string | null }[]; synced_ago_s?: number; folder?: string; syncing?: boolean };

const escapeHtml = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));

/** Small, safe markdown renderer (bold, italics, code, headings, lists, quotes, links). */
function renderMarkdown(md: string): string {
  const lines = md.replace(/\r/g, "").split("\n");
  const out: string[] = [];
  let list: "ul" | "ol" | null = null;
  let para: string[] = [];
  const inline = (t: string) => {
    let s = escapeHtml(t);
    s = s.replace(/`([^`]+)`/g, "<code>$1</code>");
    s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
    s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener" class="underline">$1</a>');
    return s;
  };
  const flushPara = () => { if (para.length) { out.push(`<p>${inline(para.join(" "))}</p>`); para = []; } };
  const closeList = () => { if (list) { out.push(`</${list}>`); list = null; } };
  for (const raw of lines) {
    const line = raw.trimEnd();
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    const ul = /^\s*[-*•]\s+(.*)$/.exec(line);
    const ol = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    const q = /^>\s?(.*)$/.exec(line);
    if (!line.trim()) { flushPara(); closeList(); continue; }
    if (h) { flushPara(); closeList(); out.push(`<h4>${inline(h[2])}</h4>`); continue; }
    if (ul || ol) {
      flushPara();
      const kind = ul ? "ul" : "ol";
      if (list !== kind) { closeList(); list = kind; out.push(`<${kind}>`); }
      out.push(`<li>${inline((ul || ol)![1])}</li>`);
      continue;
    }
    if (q) { flushPara(); closeList(); out.push(`<blockquote>${inline(q[1])}</blockquote>`); continue; }
    closeList();
    para.push(line);
  }
  flushPara(); closeList();
  return out.join("");
}

const stripSources = (t: string) => t.replace(/\n?\s*Sources?\s*:\s*[^\n]*\s*$/i, "");

export default function CrestBrain() {
  const navigate = useNavigate();
  const staff = useCurrentStaff();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status | null>(null);
  const [syncing, setSyncing] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const headers = (): Record<string, string> => ({
    "Content-Type": "application/json",
    "X-Brain-Code": BRAIN_ACCESS_CODE,
    "X-Brain-User": staff?.fullName || sessionStorage.getItem("app_logged_in_user") || "",
  });

  const loadStatus = async () => {
    try {
      const r = await fetch(`${BRAIN_URL}/api/status`, { headers: headers() });
      if (r.ok) setStatus(await r.json());
    } catch { /* status is cosmetic */ }
  };
  useEffect(() => { loadStatus(); const t = setInterval(loadStatus, 5 * 60 * 1000); return () => clearInterval(t); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const resync = async () => {
    setSyncing(true);
    try { await fetch(`${BRAIN_URL}/api/sync`, { method: "POST", headers: headers() }); await loadStatus(); }
    finally { setSyncing(false); }
  };

  const ask = async (question: string) => {
    const q = question.trim();
    if (!q || busy) return;
    setBusy(true);
    setInput("");
    const history = messages.filter((m) => !m.error).map((m) => ({ role: m.role, content: m.content }));
    setMessages((m) => [...m, { role: "user", content: q }, { role: "assistant", content: "" }]);
    const update = (patch: Partial<Msg>) =>
      setMessages((m) => { const copy = m.slice(); copy[copy.length - 1] = { ...copy[copy.length - 1], ...patch }; return copy; });
    try {
      const r = await fetch(`${BRAIN_URL}/api/ask`, { method: "POST", headers: headers(), body: JSON.stringify({ question: q, history }) });
      if (!r.ok || !r.body) {
        const j = await r.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error || `HTTP ${r.status}`);
      }
      const reader = r.body.getReader();
      const dec = new TextDecoder();
      let buf = "", text = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let idx: number;
        while ((idx = buf.indexOf("\n\n")) >= 0) {
          const line = buf.slice(0, idx).trim();
          buf = buf.slice(idx + 2);
          if (!line.startsWith("data:")) continue;
          const ev = JSON.parse(line.slice(5));
          if (ev.delta) { text += ev.delta; update({ content: text }); }
          if (ev.error) throw new Error(ev.error);
          if (ev.done) update({ content: text, sources: ev.sources || [] });
        }
      }
    } catch (e) {
      update({ error: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  };

  const docsKnown = status?.ready ? (status.docs || []).filter((d) => !d.error).length : 0;
  const syncedAgo = status?.synced_ago_s == null ? "" : status.synced_ago_s < 90 ? "just now" : `${Math.round(status.synced_ago_s / 60)} min ago`;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="sticky top-0 z-10 bg-card border-b px-3 sm:px-6 py-3 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/")} aria-label="Back"><ArrowLeft className="h-5 w-5" /></Button>
        <div className="w-9 h-9 rounded-full bg-emerald-50 flex items-center justify-center"><Brain className="h-5 w-5 text-emerald-700" /></div>
        <div className="flex-1 min-w-0">
          <h1 className="font-semibold leading-tight">Crest Brain</h1>
          <p className="text-xs text-muted-foreground truncate">
            {status?.ready ? `Knows ${docsKnown} documents · synced ${syncedAgo}` : status?.syncing ? "Reading documents…" : "Ask anything about how Crest works"}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={resync} disabled={syncing} title="Re-read the Brain Trust folder now">
          <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} /><span className="hidden sm:inline ml-1">Re-sync</span>
        </Button>
        <Button asChild variant="outline" size="sm">
          <a href={status?.folder || FOLDER_URL} target="_blank" rel="noopener"><ExternalLink className="h-4 w-4" /><span className="hidden sm:inline ml-1">Edit what it knows</span></a>
        </Button>
      </header>

      <main className="flex-1 w-full max-w-3xl mx-auto px-3 sm:px-6 py-4 pb-36">
        {messages.length === 0 && (
          <div className="rounded-xl border bg-card p-5 text-sm leading-relaxed">
            <h2 className="font-semibold text-base mb-1">Hi{staff ? ` ${staff.fullName.split(" ")[0]}` : ""}, I'm the Crest Brain.</h2>
            <p>Ask me anything about how Crest works: policies, pricing, scripts, scheduling rules, the Crest Way, tools, who to contact. Every answer comes from the documents in the Crest Brain Trust folder, and I'll tell you which ones.</p>
            <p className="text-muted-foreground text-xs mt-2">Wrong or missing? Fix or add the document in that folder. I re-read it every 30 minutes, or hit Re-sync.</p>
            <div className="flex flex-wrap gap-2 mt-4">
              {STARTERS.map((s) => (
                <button key={s} type="button" onClick={() => ask(s)} className="text-xs sm:text-sm rounded-full border bg-background px-3 py-1.5 hover:border-emerald-400 text-left">{s}</button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={`my-3 flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[90%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${m.role === "user" ? "bg-emerald-100 rounded-br-sm" : "bg-card border rounded-bl-sm"}`}>
              {m.role === "user" ? (
                <span className="whitespace-pre-wrap">{m.content}</span>
              ) : m.error ? (
                <span className="text-destructive">Sorry, that didn't work: {m.error}</span>
              ) : !m.content ? (
                <span className="text-muted-foreground text-xs">thinking…</span>
              ) : (
                <>
                  <div className="brain-md space-y-2 [&_h4]:font-semibold [&_h4]:mt-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_blockquote]:border-l-2 [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground [&_code]:bg-muted [&_code]:px-1 [&_code]:rounded"
                       dangerouslySetInnerHTML={{ __html: renderMarkdown(stripSources(m.content)) }} />
                  {m.sources && (
                    <div className="mt-3 pt-2 border-t border-dashed text-xs text-muted-foreground">
                      {m.sources.length ? (
                        <>
                          <span>From: </span>
                          {m.sources.map((s) => (
                            <a key={s.id} href={s.link} target="_blank" rel="noopener" title={s.path} className="inline-block mr-1.5 mb-1 rounded-full border bg-background px-2 py-0.5 text-foreground hover:border-emerald-400">{s.title}</a>
                          ))}
                          <div className="mt-1">Not right? Open the document above and fix it.</div>
                        </>
                      ) : (
                        <span>No document cited. Think this should be in the brain? <a href={FOLDER_URL} target="_blank" rel="noopener" className="underline">Add it to the Brain Trust</a>.</span>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </main>

      <form
        onSubmit={(e) => { e.preventDefault(); ask(input); }}
        className="fixed bottom-0 left-0 right-0 p-3 sm:p-4 bg-gradient-to-t from-background via-background to-transparent"
      >
        <div className="max-w-3xl mx-auto flex gap-2 rounded-2xl border bg-card p-2 pl-4 shadow-lg">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(input); } }}
            rows={1}
            placeholder="Ask the Crest Brain…"
            className="flex-1 resize-none bg-transparent outline-none text-sm py-2 max-h-40"
          />
          <Button type="submit" disabled={busy || !input.trim()} size="icon" aria-label="Ask"><Send className="h-4 w-4" /></Button>
        </div>
      </form>
    </div>
  );
}
