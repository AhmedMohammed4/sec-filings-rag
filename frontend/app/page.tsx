"use client";

import { useState, useRef, useEffect } from "react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const COMPANIES = [
  "AAPL", "AMZN", "GOOGL", "JNJ", "JPM",
  "META", "MSFT", "NVDA", "TSLA", "WMT",
];

const COMPANY_NAMES: Record<string, string> = {
  AAPL: "Apple", AMZN: "Amazon", GOOGL: "Google", JNJ: "Johnson & Johnson",
  JPM: "JPMorgan", META: "Meta", MSFT: "Microsoft", NVDA: "NVIDIA",
  TSLA: "Tesla", WMT: "Walmart",
};

type Source = { ticker: string; form: string; filing_date: string; preview: string };
type Message = {
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
};

function renderMarkdown(text: string) {
  let html = text
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^# (.+)$/gm, "<h1>$1</h1>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/^> (.+)$/gm, "<blockquote>$1</blockquote>")
    .replace(/^---$/gm, '<hr>');

  const lines = html.split("\n");
  let inTable = false;
  let headerDone = false;
  const processed: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith("|") && line.endsWith("|")) {
      if (!inTable) { processed.push("<table>"); inTable = true; headerDone = false; }
      if (line.match(/^\|[\s\-:|]+\|$/)) { headerDone = true; continue; }
      const cells = line.split("|").filter((c) => c !== "");
      const tag = !headerDone ? "th" : "td";
      if (tag === "th") processed.push("<thead>");
      processed.push("<tr>" + cells.map((c) => `<${tag}>${c.trim()}</${tag}>`).join("") + "</tr>");
      if (tag === "th") processed.push("</thead><tbody>");
    } else {
      if (inTable) { processed.push("</tbody></table>"); inTable = false; }
      processed.push(line);
    }
  }
  if (inTable) processed.push("</tbody></table>");

  html = processed.join("\n");
  html = html.replace(/^- (.+)$/gm, "<li>$1</li>");
  html = html.replace(/((?:<li>.*<\/li>\n?)+)/g, "<ul>$1</ul>");
  html = html.replace(/\n\n/g, "</p><p>");

  return "<p>" + html + "</p>";
}

const SUGGESTIONS = [
  { text: "What are Apple's biggest risk factors?", icon: "M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z M12 15.75h.007v.008H12v-.008z" },
  { text: "Compare Tesla and NVIDIA's revenue", icon: "M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" },
  { text: "What did Meta say about AI investments?", icon: "M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" },
  { text: "How many stores does Walmart operate?", icon: "M13.5 21v-7.5a.75.75 0 01.75-.75h3a.75.75 0 01.75.75V21m-4.5 0H2.36m11.14 0H18m0 0h3.64m-1.39 0V9.349m-16.5 11.65V9.35m0 0a3.001 3.001 0 003.75-.615A2.993 2.993 0 009.75 9.75c.896 0 1.7-.393 2.25-1.016a2.993 2.993 0 002.25 1.016c.896 0 1.7-.393 2.25-1.016A3.001 3.001 0 0021 9.349m-18 0A2.996 2.996 0 007.5 7.757a2.996 2.996 0 002.25-1.008 2.996 2.996 0 002.25 1.008A2.996 2.996 0 0021 9.35m0 0V3.818a1.006 1.006 0 00-.944-.907 48.986 48.986 0 00-15.112 0A1.005 1.005 0 004 3.818V9.35" },
];

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [ticker, setTicker] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => { inputRef.current?.focus(); }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const question = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: question }]);
    setLoading(true);

    try {
      const res = await fetch(`${API}/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, ticker: ticker || null }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Request failed");
      }

      const data = await res.json();
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.answer, sources: data.sources },
      ]);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Something went wrong";
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `Error: ${message}` },
      ]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }

  if (!mounted) return null;

  return (
    <div className="flex flex-col h-screen relative overflow-hidden">
      {/* Background effects */}
      <div className="orb orb-1" />
      <div className="orb orb-2" />
      <div className="grid-bg fixed inset-0 z-0" />

      {/* Header */}
      <header className="relative z-10 border-b border-border backdrop-blur-xl bg-bg-primary/80 px-6 py-3.5 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-accent-dim flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-accent">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
          </div>
          <div>
            <h1 className="font-sans text-sm font-semibold tracking-tight text-text-primary">SEC Filings</h1>
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-green status-pulse" />
              <span className="font-mono text-[10px] text-text-muted uppercase tracking-wider">10-K Reports</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={ticker}
            onChange={(e) => setTicker(e.target.value)}
            className="font-mono text-xs bg-bg-card border border-border rounded-lg px-3 py-2 text-text-secondary focus:outline-none glow-border transition-all"
          >
            <option value="">All companies</option>
            {COMPANIES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
      </header>

      {/* Messages */}
      <main className="relative z-10 flex-1 overflow-y-auto px-4 py-6">
        <div className="max-w-2xl mx-auto flex flex-col gap-3">

          {/* Empty state */}
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="animate-fade-up">
                <div className="w-16 h-16 rounded-2xl bg-accent-dim border border-accent/20 flex items-center justify-center mb-6 mx-auto">
                  <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-accent">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="16" y1="13" x2="8" y2="13" />
                    <line x1="16" y1="17" x2="8" y2="17" />
                  </svg>
                </div>
                <h2 className="font-sans text-2xl font-bold mb-2 text-text-primary tracking-tight">
                  Query SEC filings
                </h2>
                <p className="font-sans text-sm text-text-secondary max-w-sm mx-auto mb-10 leading-relaxed">
                  Ask anything about 10-K annual reports from the top 10 public companies.
                  Answers are grounded in real filings.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 w-full max-w-lg">
                {SUGGESTIONS.map((s, i) => (
                  <button
                    key={s.text}
                    onClick={() => { setInput(s.text); inputRef.current?.focus(); }}
                    className={`animate-fade-up delay-${i + 1} group text-left font-sans text-[13px] leading-snug px-4 py-3.5 rounded-xl border border-border bg-bg-card/50 backdrop-blur-sm card-lift flex items-start gap-3 text-text-secondary hover:text-text-primary`}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-text-muted group-hover:text-accent transition-colors shrink-0 mt-0.5">
                      <path d={s.icon} />
                    </svg>
                    {s.text}
                  </button>
                ))}
              </div>

              <div className="mt-10 flex items-center gap-6 animate-fade-up delay-4">
                {["AAPL", "NVDA", "TSLA", "META", "MSFT"].map((t) => (
                  <button
                    key={t}
                    onClick={() => setTicker(t)}
                    className="font-mono text-[11px] tracking-wider text-text-muted hover:text-accent transition-colors"
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Messages */}
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"} ${
                msg.role === "user" ? "animate-slide-right" : "animate-slide-left"
              }`}
            >
              {msg.role === "assistant" && (
                <div className="w-6 h-6 rounded-md bg-accent-dim border border-accent/20 flex items-center justify-center shrink-0 mt-1 mr-2.5">
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-accent">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                  </svg>
                </div>
              )}
              <div
                className={`rounded-2xl px-4 py-3 ${
                  msg.role === "user"
                    ? "bg-accent text-white font-sans text-sm max-w-[75%]"
                    : "bg-bg-card/80 backdrop-blur-sm border border-border font-sans text-sm max-w-[85%] text-text-primary"
                }`}
              >
                {msg.role === "assistant" ? (
                  <div>
                    <div
                      className="answer-content"
                      dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }}
                    />
                    {msg.sources && msg.sources.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-border">
                        <p className="font-mono text-[10px] text-text-muted uppercase tracking-wider mb-2">Sources</p>
                        <div className="flex flex-wrap gap-1.5">
                          {msg.sources.map((s, j) => (
                            <span
                              key={j}
                              className="ticker-badge font-mono text-[11px] px-2.5 py-1 rounded-md bg-bg-elevated border border-border text-text-secondary"
                            >
                              {s.ticker} {s.form} {s.filing_date}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  msg.content
                )}
              </div>
            </div>
          ))}

          {/* Loading state */}
          {loading && (
            <div className="flex justify-start animate-slide-left">
              <div className="w-6 h-6 rounded-md bg-accent-dim border border-accent/20 flex items-center justify-center shrink-0 mt-1 mr-2.5">
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-accent">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
              </div>
              <div className="bg-bg-card/80 backdrop-blur-sm border border-border rounded-2xl px-4 py-3.5">
                <div className="flex items-center gap-3">
                  <div className="flex gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse-ring" />
                    <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse-ring" style={{ animationDelay: "0.2s" }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse-ring" style={{ animationDelay: "0.4s" }} />
                  </div>
                  <span className="font-mono text-xs animate-shimmer">Searching filings...</span>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </main>

      {/* Input bar */}
      <div className="relative z-10 border-t border-border backdrop-blur-xl bg-bg-primary/80 px-4 py-3.5 shrink-0">
        <form onSubmit={handleSubmit} className="max-w-2xl mx-auto flex gap-2.5">
          <div className="flex-1 relative">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={ticker ? `Ask about ${COMPANY_NAMES[ticker]}...` : "Ask about any SEC filing..."}
              disabled={loading}
              className="w-full font-sans text-sm bg-bg-card border border-border rounded-xl px-4 py-3 text-text-primary placeholder:text-text-muted focus:outline-none glow-border transition-all disabled:opacity-40"
            />
            {ticker && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 font-mono text-[10px] px-2 py-0.5 rounded bg-accent-dim text-accent border border-accent/20">
                {ticker}
              </span>
            )}
          </div>
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="bg-accent text-white font-sans text-sm font-medium px-5 py-3 rounded-xl transition-all disabled:opacity-30 hover:shadow-[0_0_20px_rgba(99,102,241,0.3)] active:scale-[0.97]"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </form>
      </div>
    </div>
  );
}
