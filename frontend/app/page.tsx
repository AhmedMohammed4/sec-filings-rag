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
  "What are Apple's biggest risk factors?",
  "Compare Tesla and NVIDIA's revenue",
  "What did Meta say about AI investments?",
  "How many stores does Walmart operate?",
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
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, loading]);
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
    <div className="flex flex-col h-screen bg-bg-primary">

      {/* Header */}
      <header className="border-b border-border bg-bg-card px-6 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2.5">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-text-primary">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
          </svg>
          <span className="font-sans text-sm font-semibold text-text-primary">SEC Filings</span>
        </div>
        <select
          value={ticker}
          onChange={(e) => setTicker(e.target.value)}
          className="font-sans text-xs bg-bg-secondary border border-border rounded-lg px-3 py-1.5 text-text-secondary focus:outline-none focus:ring-1 focus:ring-text-muted transition-all"
        >
          <option value="">All companies</option>
          {COMPANIES.map((t) => (
            <option key={t} value={t}>{t} - {COMPANY_NAMES[t]}</option>
          ))}
        </select>
      </header>

      {/* Messages */}
      <main className="flex-1 overflow-y-auto px-4 py-6 bg-bg-secondary">
        <div className="max-w-2xl mx-auto flex flex-col gap-3">

          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="animate-fade-up mb-6">
                <h2 className="font-sans text-2xl font-bold text-text-primary tracking-tight mb-2">
                  What do you want to know?
                </h2>
                <p className="font-sans text-sm text-text-secondary max-w-md leading-relaxed">
                  Ask questions about 10-K annual reports from 10 public companies. Answers cite real SEC filings.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-lg">
                {SUGGESTIONS.map((q, i) => (
                  <button
                    key={q}
                    onClick={() => { setInput(q); inputRef.current?.focus(); }}
                    className={`animate-fade-up delay-${i + 1} text-left font-sans text-[13px] text-text-secondary px-4 py-3 rounded-xl border border-border bg-bg-card card-lift hover:text-text-primary`}
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"} ${
                msg.role === "user" ? "animate-slide-right" : "animate-slide-left"
              }`}
            >
              <div
                className={`rounded-2xl px-4 py-3 ${
                  msg.role === "user"
                    ? "bg-text-primary text-white font-sans text-sm max-w-[75%]"
                    : "bg-bg-card border border-border font-sans text-sm max-w-[85%] text-text-primary"
                }`}
              >
                {msg.role === "assistant" ? (
                  <div>
                    <div
                      className="answer-content"
                      dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }}
                    />
                    {msg.sources && msg.sources.length > 0 && (
                      <div className="mt-3 pt-2.5 border-t border-border">
                        <p className="font-mono text-[10px] text-text-muted uppercase tracking-wider mb-1.5">Sources</p>
                        <div className="flex flex-wrap gap-1">
                          {msg.sources.map((s, j) => (
                            <span
                              key={j}
                              className="font-mono text-[11px] px-2 py-0.5 rounded-md bg-bg-secondary text-text-secondary"
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

          {loading && (
            <div className="flex justify-start animate-slide-left">
              <div className="bg-bg-card border border-border rounded-2xl px-4 py-3.5">
                <div className="flex gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-text-muted" style={{ animation: "dot-bounce 1s ease-in-out infinite 0ms" }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-text-muted" style={{ animation: "dot-bounce 1s ease-in-out infinite 200ms" }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-text-muted" style={{ animation: "dot-bounce 1s ease-in-out infinite 400ms" }} />
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </main>

      {/* Input */}
      <div className="border-t border-border bg-bg-card px-4 py-3 shrink-0">
        <form onSubmit={handleSubmit} className="max-w-2xl mx-auto flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={ticker ? `Ask about ${COMPANY_NAMES[ticker]}...` : "Ask a question..."}
            disabled={loading}
            className="flex-1 font-sans text-sm bg-bg-secondary border border-border rounded-xl px-4 py-2.5 text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-text-muted transition-all disabled:opacity-40"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="bg-text-primary text-white font-sans text-sm font-medium px-4 py-2.5 rounded-xl transition-opacity disabled:opacity-20 hover:opacity-80 active:opacity-70"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
          </button>
        </form>
      </div>
    </div>
  );
}
