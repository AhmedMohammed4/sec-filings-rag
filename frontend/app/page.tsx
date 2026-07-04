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
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>')
    .replace(/^---$/gm, '<hr class="my-3 border-border">');

  const lines = html.split('\n');
  let inTable = false;
  let headerDone = false;
  const processed: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('|') && line.endsWith('|')) {
      if (!inTable) {
        processed.push('<table>');
        inTable = true;
        headerDone = false;
      }
      if (line.match(/^\|[\s\-:|]+\|$/)) {
        headerDone = true;
        continue;
      }
      const cells = line.split('|').filter(c => c !== '');
      const tag = !headerDone ? 'th' : 'td';
      if (tag === 'th') processed.push('<thead>');
      processed.push('<tr>' + cells.map(c => `<${tag}>${c.trim()}</${tag}>`).join('') + '</tr>');
      if (tag === 'th') processed.push('</thead><tbody>');
    } else {
      if (inTable) {
        processed.push('</tbody></table>');
        inTable = false;
      }
      processed.push(line);
    }
  }
  if (inTable) processed.push('</tbody></table>');

  html = processed.join('\n');
  html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
  html = html.replace(/((?:<li>.*<\/li>\n?)+)/g, '<ul>$1</ul>');
  html = html.replace(/\n\n/g, '</p><p>');

  return '<p>' + html + '</p>';
}

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [ticker, setTicker] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

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

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <header className="border-b border-border bg-card px-6 py-4 flex items-center justify-between shrink-0">
        <div>
          <h1 className="font-sans text-lg font-bold tracking-tight">SEC Filings RAG</h1>
          <p className="font-sans text-sm text-muted">Ask questions about 10-K annual reports</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="font-mono text-xs text-muted">Filter:</label>
          <select
            value={ticker}
            onChange={(e) => setTicker(e.target.value)}
            className="font-mono text-sm bg-background border border-border rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-accent"
          >
            <option value="">All companies</option>
            {COMPANIES.map((t) => (
              <option key={t} value={t}>
                {t} - {COMPANY_NAMES[t]}
              </option>
            ))}
          </select>
        </div>
      </header>

      {/* Messages */}
      <main className="flex-1 overflow-y-auto px-4 py-6">
        <div className="max-w-3xl mx-auto flex flex-col gap-4">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <div className="w-14 h-14 rounded-2xl bg-accent-light flex items-center justify-center mb-5">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-accent">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                  <polyline points="10 9 9 9 8 9" />
                </svg>
              </div>
              <h2 className="font-sans text-xl font-bold mb-2">Ask about SEC filings</h2>
              <p className="font-sans text-sm text-muted max-w-md mb-8">
                Query 10-K annual reports from Apple, Tesla, NVIDIA, Meta, and more.
                Every answer is grounded in real filings with citations.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-lg">
                {[
                  "What are Apple's biggest risk factors?",
                  "Compare Tesla and NVIDIA's revenue",
                  "What did Meta say about AI investments?",
                  "How many stores does Walmart operate?",
                ].map((q) => (
                  <button
                    key={q}
                    onClick={() => { setInput(q); inputRef.current?.focus(); }}
                    className="text-left font-sans text-sm px-4 py-3 rounded-xl border border-border bg-card hover:bg-accent-light hover:border-accent/30 transition-colors"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[85%] rounded-2xl px-5 py-3.5 ${
                  msg.role === "user"
                    ? "bg-accent text-white font-sans text-sm"
                    : "bg-card border border-border font-sans text-sm"
                }`}
              >
                {msg.role === "assistant" ? (
                  <div>
                    <div
                      className="answer-content"
                      dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }}
                    />
                    {msg.sources && msg.sources.length > 0 && (
                      <div className="mt-4 pt-3 border-t border-border">
                        <p className="font-mono text-xs text-muted mb-2">Sources:</p>
                        <div className="flex flex-wrap gap-1.5">
                          {msg.sources.map((s, j) => (
                            <span
                              key={j}
                              className="font-mono text-xs px-2.5 py-1 rounded-full bg-accent-light text-accent"
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
            <div className="flex justify-start">
              <div className="bg-card border border-border rounded-2xl px-5 py-4">
                <div className="flex gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-muted animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="w-2 h-2 rounded-full bg-muted animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="w-2 h-2 rounded-full bg-muted animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </main>

      {/* Input */}
      <div className="border-t border-border bg-card px-4 py-4 shrink-0">
        <form onSubmit={handleSubmit} className="max-w-3xl mx-auto flex gap-3">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={ticker ? `Ask about ${COMPANY_NAMES[ticker]}...` : "Ask about any SEC filing..."}
            disabled={loading}
            className="flex-1 font-sans text-sm bg-background border border-border rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="bg-accent text-white font-sans text-sm font-medium px-5 py-3 rounded-xl hover:bg-accent/90 transition-colors disabled:opacity-40"
          >
            Ask
          </button>
        </form>
      </div>
    </div>
  );
}
