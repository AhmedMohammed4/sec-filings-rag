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
    .replace(/^---$/gm, "<hr>");

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
  { text: "What are Apple's biggest risk factors?", sub: "AAPL 10-K" },
  { text: "Compare Tesla and NVIDIA's revenue", sub: "TSLA vs NVDA" },
  { text: "What did Meta say about AI investments?", sub: "META 10-K" },
  { text: "How many stores does Walmart operate?", sub: "WMT 10-K" },
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
    <div className="flex flex-col h-screen relative overflow-hidden noise-bg scan-line">
      {/* Background effects */}
      <div className="orb orb-1" />
      <div className="orb orb-2" />
      <div className="orb orb-3" />
      <div className="grid-bg fixed inset-0 z-0" />
      <div className="particle particle-1" />
      <div className="particle particle-2" />
      <div className="particle particle-3" />
      <div className="particle particle-4" />
      <div className="particle particle-5" />

      {/* Header */}
      <header className="relative z-10 border-b border-border backdrop-blur-2xl bg-bg-primary/70 px-6 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-accent-dim border border-accent/20 flex items-center justify-center animate-breathe">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-accent">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
          </div>
          <div>
            <h1 className="font-sans text-sm font-semibold tracking-tight gradient-text">SEC Filings</h1>
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-green status-pulse" />
              <span className="font-mono text-[10px] text-text-muted uppercase tracking-widest">Live data</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={ticker}
            onChange={(e) => setTicker(e.target.value)}
            className="font-mono text-xs bg-bg-card/80 backdrop-blur-sm border border-border rounded-lg px-3 py-2 text-text-secondary focus:outline-none glow-border transition-all"
          >
            <option value="">All companies</option>
            {COMPANIES.map((t) => (
              <option key={t} value={t}>{t} - {COMPANY_NAMES[t]}</option>
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
              <div className="animate-scale-in">
                <div className="w-20 h-20 rounded-2xl bg-accent-dim border border-accent/15 flex items-center justify-center mb-7 mx-auto animate-breathe">
                  <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-accent">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="16" y1="13" x2="8" y2="13" />
                    <line x1="16" y1="17" x2="8" y2="17" />
                  </svg>
                </div>
              </div>
              <div className="animate-fade-up delay-1">
                <h2 className="font-sans text-3xl font-bold mb-3 tracking-tight">
                  <span className="gradient-text">Query SEC filings</span>
                </h2>
                <p className="font-sans text-sm text-text-secondary max-w-sm mx-auto leading-relaxed">
                  Ask anything about 10-K annual reports from the top 10 public companies.
                  Every answer is sourced from real filings.
                </p>
              </div>

              {/* Stats bar */}
              <div className="animate-fade-up delay-2 flex items-center gap-6 mt-8 mb-10">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-lg font-bold gradient-text">10</span>
                  <span className="font-mono text-[10px] text-text-muted uppercase tracking-wider">Companies</span>
                </div>
                <div className="w-px h-4 bg-border" />
                <div className="flex items-center gap-2">
                  <span className="font-mono text-lg font-bold gradient-text">19</span>
                  <span className="font-mono text-[10px] text-text-muted uppercase tracking-wider">Filings</span>
                </div>
                <div className="w-px h-4 bg-border" />
                <div className="flex items-center gap-2">
                  <span className="font-mono text-lg font-bold gradient-text">2.6K</span>
                  <span className="font-mono text-[10px] text-text-muted uppercase tracking-wider">Chunks</span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-lg">
                {SUGGESTIONS.map((s, i) => (
                  <button
                    key={s.text}
                    onClick={() => { setInput(s.text); inputRef.current?.focus(); }}
                    className={`animate-fade-up delay-${i + 2} group text-left px-4 py-4 rounded-xl border border-border bg-bg-card/40 backdrop-blur-sm card-lift`}
                  >
                    <p className="font-sans text-[13px] leading-snug text-text-secondary group-hover:text-text-primary transition-colors mb-1.5">
                      {s.text}
                    </p>
                    <span className="font-mono text-[10px] text-text-muted uppercase tracking-wider group-hover:text-accent transition-colors">
                      {s.sub}
                    </span>
                  </button>
                ))}
              </div>

              <div className="mt-12 flex items-center gap-4 animate-fade-up delay-5">
                {COMPANIES.map((t) => (
                  <button
                    key={t}
                    onClick={() => { setTicker(t); }}
                    className={`font-mono text-[10px] tracking-widest transition-all duration-200 hover:scale-110 ${
                      ticker === t ? "text-accent" : "text-text-muted hover:text-text-secondary"
                    }`}
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
                <div className="w-7 h-7 rounded-lg bg-accent-dim border border-accent/15 flex items-center justify-center shrink-0 mt-1 mr-2.5">
                  <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-accent">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                  </svg>
                </div>
              )}
              <div
                className={`rounded-2xl px-4 py-3.5 ${
                  msg.role === "user"
                    ? "bg-gradient-to-br from-accent to-accent-secondary text-white font-sans text-sm max-w-[75%] shadow-lg shadow-accent/10"
                    : "bg-bg-card/70 backdrop-blur-sm border border-border font-sans text-sm max-w-[85%] text-text-primary"
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
                        <p className="font-mono text-[10px] text-text-muted uppercase tracking-widest mb-2">Sources</p>
                        <div className="flex flex-wrap gap-1.5">
                          {msg.sources.map((s, j) => (
                            <span
                              key={j}
                              className="ticker-badge font-mono text-[11px] px-2.5 py-1 rounded-md bg-bg-elevated border border-border text-text-secondary cursor-default"
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
              <div className="w-7 h-7 rounded-lg bg-accent-dim border border-accent/15 flex items-center justify-center shrink-0 mt-1 mr-2.5">
                <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-accent">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
              </div>
              <div className="bg-bg-card/70 backdrop-blur-sm border border-border rounded-2xl px-4 py-4">
                <div className="flex items-center gap-3">
                  <div className="flex items-end gap-[3px] h-4">
                    <span className="w-[3px] bg-accent rounded-full animate-wave" style={{ height: "60%", animationDelay: "0ms" }} />
                    <span className="w-[3px] bg-accent rounded-full animate-wave" style={{ height: "100%", animationDelay: "150ms" }} />
                    <span className="w-[3px] bg-accent rounded-full animate-wave" style={{ height: "40%", animationDelay: "300ms" }} />
                    <span className="w-[3px] bg-accent rounded-full animate-wave" style={{ height: "80%", animationDelay: "450ms" }} />
                  </div>
                  <span className="font-mono text-xs animate-shimmer">Searching filings</span>
                  <span className="text-accent animate-blink">_</span>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </main>

      {/* Input bar */}
      <div className="relative z-10 border-t border-border backdrop-blur-2xl bg-bg-primary/70 px-4 py-3.5 shrink-0">
        <form onSubmit={handleSubmit} className="max-w-2xl mx-auto flex gap-2.5">
          <div className="flex-1 relative">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={ticker ? `Ask about ${COMPANY_NAMES[ticker]}...` : "Ask about any SEC filing..."}
              disabled={loading}
              className="w-full font-sans text-sm bg-bg-card/80 backdrop-blur-sm border border-border rounded-xl px-4 py-3 text-text-primary placeholder:text-text-muted focus:outline-none glow-border transition-all disabled:opacity-40"
            />
            {ticker && (
              <button
                type="button"
                onClick={() => setTicker("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 font-mono text-[10px] px-2 py-0.5 rounded bg-accent-dim text-accent border border-accent/20 hover:bg-accent/20 transition-colors flex items-center gap-1"
              >
                {ticker}
                <svg xmlns="http://www.w3.org/2000/svg" width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            )}
          </div>
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="btn-send bg-gradient-to-r from-accent to-accent-secondary text-white font-sans text-sm font-medium w-11 h-11 rounded-xl transition-all disabled:opacity-25 hover:shadow-[0_0_25px_rgba(16,185,129,0.3)] active:scale-95 flex items-center justify-center shrink-0"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </form>
      </div>
    </div>
  );
}
