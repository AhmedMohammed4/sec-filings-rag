"""Phase 3: RAG pipeline - retrieve relevant chunks and generate answers."""

import os
import sys
import hashlib
import json
import time

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

import chromadb
from sentence_transformers import SentenceTransformer
from anthropic import Anthropic
from dotenv import load_dotenv

load_dotenv()

DB_PATH = "data/vectordb"
TOP_K = 6

SYSTEM_PROMPT = """You are a financial analyst assistant. Answer questions about SEC 10-K filings using ONLY the provided context.

Rules:
- Only use the provided context. No outside knowledge.
- Cite sources as [TICKER FORM DATE].
- If the context is insufficient, say so.
- Be concise. Use bullet points and short paragraphs.
- Keep answers under 400 words."""


class SecRAG:
    SYSTEM_PROMPT = SYSTEM_PROMPT

    def __init__(self):
        print("Loading embedding model...")
        self.embedder = SentenceTransformer("all-MiniLM-L6-v2")

        self.db = chromadb.PersistentClient(path=DB_PATH)
        self.collection = self.db.get_collection("sec_filings")

        self.client = Anthropic()

        # Simple in-memory cache
        self._cache: dict[str, dict] = {}
        self._cache_max = 200

        # Cost tracking
        self._total_input_tokens = 0
        self._total_output_tokens = 0
        self._monthly_spend = 0.0
        self._spend_limit = float(os.getenv("SPEND_LIMIT", "4.0"))

    def _cache_key(self, question: str, ticker: str | None) -> str:
        raw = f"{question.lower().strip()}|{(ticker or '').upper()}"
        return hashlib.md5(raw.encode()).hexdigest()

    def _estimate_cost(self, input_tokens: int, output_tokens: int) -> float:
        # Haiku pricing: $0.80/M input, $4.00/M output
        return (input_tokens * 0.80 / 1_000_000) + (output_tokens * 4.00 / 1_000_000)

    def retrieve(self, query: str, n_results: int = TOP_K, ticker: str = None) -> list[dict]:
        query_embedding = self.embedder.encode([query]).tolist()

        where_filter = None
        if ticker:
            where_filter = {"ticker": ticker.upper()}

        results = self.collection.query(
            query_embeddings=query_embedding,
            n_results=n_results,
            where=where_filter,
        )

        chunks = []
        for i in range(len(results["documents"][0])):
            chunks.append({
                "text": results["documents"][0][i],
                "ticker": results["metadatas"][0][i]["ticker"],
                "form": results["metadatas"][0][i]["form"],
                "filing_date": results["metadatas"][0][i]["filing_date"],
                "distance": results["distances"][0][i] if results["distances"] else None,
            })

        return chunks

    def build_context(self, chunks: list[dict]) -> str:
        context_parts = []
        for i, chunk in enumerate(chunks, 1):
            source = f"[{chunk['ticker']} {chunk['form']} {chunk['filing_date']}]"
            context_parts.append(f"--- Source {i}: {source} ---\n{chunk['text']}")

        return "\n\n".join(context_parts)

    def ask(self, question: str, ticker: str = None) -> str:
        """Full RAG pipeline with caching and cost limits."""
        # Check cache
        key = self._cache_key(question, ticker)
        if key in self._cache:
            return self._cache[key]["answer"]

        # Check spending limit
        if self._monthly_spend >= self._spend_limit:
            return "Spending limit reached. Try again next month."

        # Retrieve
        chunks = self.retrieve(question, ticker=ticker)

        if not chunks:
            return "No relevant documents found."

        # Build context
        context = self.build_context(chunks)

        user_message = f"""Context from SEC filings:

{context}

---

Question: {question}"""

        model = os.getenv("LLM_MODEL", "claude-haiku-4-5-20251001")

        response = self.client.messages.create(
            model=model,
            max_tokens=800,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_message}],
        )

        answer = response.content[0].text

        # Track cost
        input_tokens = response.usage.input_tokens
        output_tokens = response.usage.output_tokens
        self._total_input_tokens += input_tokens
        self._total_output_tokens += output_tokens
        cost = self._estimate_cost(input_tokens, output_tokens)
        self._monthly_spend += cost

        # Cache the answer
        if len(self._cache) < self._cache_max:
            self._cache[key] = {"answer": answer, "time": time.time()}

        return answer

    def get_stats(self) -> dict:
        return {
            "total_input_tokens": self._total_input_tokens,
            "total_output_tokens": self._total_output_tokens,
            "estimated_spend": round(self._monthly_spend, 4),
            "spend_limit": self._spend_limit,
            "cached_answers": len(self._cache),
        }

    def ask_interactive(self):
        print("\n" + "=" * 60)
        print("SEC Filings RAG - Ask questions about 10-K filings")
        print("=" * 60)
        print("\nCompanies: AAPL, MSFT, TSLA, GOOGL, AMZN, META, NVDA, JPM, JNJ, WMT")
        print("Tip: prefix with a ticker to filter, e.g. 'TSLA: what are the risk factors?'")
        print("Type 'quit' to exit.\n")

        while True:
            try:
                query = input("You: ").strip()
            except (EOFError, KeyboardInterrupt):
                break

            if not query or query.lower() in ("quit", "exit", "q"):
                print("Goodbye.")
                break

            ticker = None
            if ":" in query and query.split(":")[0].strip().upper() in {
                "AAPL", "MSFT", "TSLA", "GOOGL", "AMZN", "META", "NVDA", "JPM", "JNJ", "WMT"
            }:
                ticker, query = query.split(":", 1)
                ticker = ticker.strip().upper()
                query = query.strip()

            print("\nSearching filings...")
            try:
                answer = self.ask(query, ticker=ticker)
                stats = self.get_stats()
                print(f"\nAnswer:\n{answer}\n")
                print(f"[Cost so far: ${stats['estimated_spend']:.4f} / ${stats['spend_limit']:.2f}]\n")
            except Exception as e:
                print(f"\nError: {e}\n")


def main():
    rag = SecRAG()

    print("\n--- Demo queries ---\n")

    demos = [
        ("What are Apple's biggest risk factors?", "AAPL"),
        ("Compare Tesla and NVIDIA's revenue", None),
        ("What did Meta say about AI investments?", "META"),
    ]

    for question, ticker in demos:
        label = f"[{ticker}] " if ticker else ""
        print(f"Q: {label}{question}")
        print("-" * 50)
        answer = rag.ask(question, ticker=ticker)
        print(f"{answer}\n")
        print("=" * 60 + "\n")

    stats = rag.get_stats()
    print(f"Total spend: ${stats['estimated_spend']:.4f}")


if __name__ == "__main__":
    import sys
    if "--interactive" in sys.argv or "-i" in sys.argv:
        rag = SecRAG()
        rag.ask_interactive()
    else:
        main()
