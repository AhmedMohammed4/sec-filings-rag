"""Phase 3: RAG pipeline - retrieve relevant chunks and generate answers."""

import os
import sys

# Fix Windows console encoding
sys.stdout.reconfigure(encoding="utf-8", errors="replace")

import chromadb
from sentence_transformers import SentenceTransformer
from anthropic import Anthropic
from dotenv import load_dotenv

load_dotenv()

DB_PATH = "data/vectordb"
TOP_K = 12  # number of chunks to retrieve (tuned via evaluate.py)

SYSTEM_PROMPT = """You are a financial analyst assistant. You answer questions about SEC filings (10-K annual reports) using ONLY the provided context from real filings.

Rules:
- Base every claim on the provided context. Do not use outside knowledge.
- Cite your sources using [TICKER FORM DATE] format, e.g. [AAPL 10-K 2025-10-31].
- If the context does not contain enough information to answer, say so clearly.
- Be specific with numbers, dates, and facts from the filings.
- Keep answers clear and well-structured."""


class SecRAG:
    SYSTEM_PROMPT = SYSTEM_PROMPT

    def __init__(self):
        print("Loading embedding model...")
        self.embedder = SentenceTransformer("all-MiniLM-L6-v2")

        self.db = chromadb.PersistentClient(path=DB_PATH)
        self.collection = self.db.get_collection("sec_filings")

        self.client = Anthropic()

    def retrieve(self, query: str, n_results: int = TOP_K, ticker: str = None) -> list[dict]:
        """Retrieve relevant chunks for a query."""
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
        """Format retrieved chunks into context for the LLM."""
        context_parts = []
        for i, chunk in enumerate(chunks, 1):
            source = f"[{chunk['ticker']} {chunk['form']} {chunk['filing_date']}]"
            context_parts.append(f"--- Source {i}: {source} ---\n{chunk['text']}")

        return "\n\n".join(context_parts)

    def ask(self, question: str, ticker: str = None) -> str:
        """Full RAG pipeline: retrieve context, generate answer with LLM."""
        # Retrieve
        chunks = self.retrieve(question, ticker=ticker)

        if not chunks:
            return "No relevant documents found."

        # Build context
        context = self.build_context(chunks)

        # Generate
        user_message = f"""Context from SEC filings:

{context}

---

Question: {question}"""

        response = self.client.messages.create(
            model=os.getenv("LLM_MODEL", "claude-sonnet-4-6"),
            max_tokens=1500,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_message}],
        )

        return response.content[0].text

    def ask_interactive(self):
        """Run an interactive Q&A loop."""
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

            # Check for ticker prefix
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
                print(f"\nAnswer:\n{answer}\n")
            except Exception as e:
                print(f"\nError: {e}\n")


def main():
    rag = SecRAG()

    # Run a few demo queries to verify it works
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


if __name__ == "__main__":
    import sys
    if "--interactive" in sys.argv or "-i" in sys.argv:
        rag = SecRAG()
        rag.ask_interactive()
    else:
        main()
