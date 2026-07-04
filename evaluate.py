"""Phase 4: Evaluate retrieval quality and tune parameters."""

import os
import sys
import json
import time

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

import chromadb
from sentence_transformers import SentenceTransformer
from dotenv import load_dotenv

load_dotenv()

DB_PATH = "data/vectordb"

# Test set: questions with expected ticker and keywords that should appear in retrieved chunks
TEST_SET = [
    {
        "question": "What are Apple's main risk factors?",
        "expected_ticker": "AAPL",
        "expected_keywords": ["risk", "supply", "competition", "regulatory"],
    },
    {
        "question": "How much revenue did Tesla generate?",
        "expected_ticker": "TSLA",
        "expected_keywords": ["revenue", "automotive"],
    },
    {
        "question": "What is NVIDIA's data center revenue?",
        "expected_ticker": "NVDA",
        "expected_keywords": ["data center", "revenue"],
    },
    {
        "question": "What did Meta say about artificial intelligence?",
        "expected_ticker": "META",
        "expected_keywords": ["ai", "artificial intelligence", "machine learning"],
    },
    {
        "question": "How many employees does Amazon have?",
        "expected_ticker": "AMZN",
        "expected_keywords": ["employee", "personnel", "workforce", "headcount"],
    },
    {
        "question": "What is Microsoft's cloud revenue?",
        "expected_ticker": "MSFT",
        "expected_keywords": ["cloud", "azure", "revenue"],
    },
    {
        "question": "What legal proceedings is Google facing?",
        "expected_ticker": "GOOGL",
        "expected_keywords": ["legal", "litigation", "antitrust", "proceedings", "lawsuit"],
    },
    {
        "question": "What is JPMorgan's net interest income?",
        "expected_ticker": "JPM",
        "expected_keywords": ["net interest", "income"],
    },
    {
        "question": "What are Johnson & Johnson's major product segments?",
        "expected_ticker": "JNJ",
        "expected_keywords": ["segment", "pharmaceutical", "medtech", "innovative medicine"],
    },
    {
        "question": "How many stores does Walmart operate?",
        "expected_ticker": "WMT",
        "expected_keywords": ["store", "unit", "club", "location"],
    },
    {
        "question": "What is Tesla's automotive gross margin?",
        "expected_ticker": "TSLA",
        "expected_keywords": ["gross margin", "automotive", "cost"],
    },
    {
        "question": "How much did NVIDIA spend on research and development?",
        "expected_ticker": "NVDA",
        "expected_keywords": ["research", "development", "r&d"],
    },
    {
        "question": "What are Meta's daily active users?",
        "expected_ticker": "META",
        "expected_keywords": ["daily active", "user", "people", "dau"],
    },
    {
        "question": "What is Apple's services revenue?",
        "expected_ticker": "AAPL",
        "expected_keywords": ["services", "revenue"],
    },
    {
        "question": "What cybersecurity risks does Amazon face?",
        "expected_ticker": "AMZN",
        "expected_keywords": ["cyber", "security", "breach", "data"],
    },
    {
        "question": "What is Walmart's e-commerce strategy?",
        "expected_ticker": "WMT",
        "expected_keywords": ["ecommerce", "e-commerce", "online", "digital", "omni"],
    },
    {
        "question": "How much long-term debt does Microsoft have?",
        "expected_ticker": "MSFT",
        "expected_keywords": ["debt", "long-term", "borrowing", "note"],
    },
    {
        "question": "What is Google's advertising revenue breakdown?",
        "expected_ticker": "GOOGL",
        "expected_keywords": ["advertising", "ad", "revenue", "search", "youtube"],
    },
    {
        "question": "What environmental initiatives does Tesla mention?",
        "expected_ticker": "TSLA",
        "expected_keywords": ["environment", "emission", "climate", "energy", "sustainability", "solar"],
    },
    {
        "question": "What is JPMorgan's total assets?",
        "expected_ticker": "JPM",
        "expected_keywords": ["total assets", "billion", "asset"],
    },
]


def evaluate_retrieval(embedder, collection, top_k: int, use_filter: bool) -> dict:
    """Evaluate retrieval quality across the test set."""
    ticker_hits = 0       # did we retrieve chunks from the right company?
    keyword_hits = 0      # did retrieved chunks contain expected keywords?
    total_keywords = 0

    per_question = []

    for test in TEST_SET:
        query_embedding = embedder.encode([test["question"]]).tolist()

        where_filter = None
        if use_filter:
            where_filter = {"ticker": test["expected_ticker"]}

        results = collection.query(
            query_embeddings=query_embedding,
            n_results=top_k,
            where=where_filter,
        )

        docs = results["documents"][0]
        metas = results["metadatas"][0]

        # Check ticker accuracy
        retrieved_tickers = [m["ticker"] for m in metas]
        has_correct_ticker = test["expected_ticker"] in retrieved_tickers
        ticker_pct = retrieved_tickers.count(test["expected_ticker"]) / len(retrieved_tickers)

        if has_correct_ticker:
            ticker_hits += 1

        # Check keyword coverage
        all_text = " ".join(docs).lower()
        kw_found = 0
        kw_missing = []
        for kw in test["expected_keywords"]:
            if kw.lower() in all_text:
                kw_found += 1
            else:
                kw_missing.append(kw)

        keyword_hits += kw_found
        total_keywords += len(test["expected_keywords"])

        per_question.append({
            "question": test["question"],
            "expected_ticker": test["expected_ticker"],
            "ticker_found": has_correct_ticker,
            "ticker_pct": ticker_pct,
            "keywords_found": kw_found,
            "keywords_total": len(test["expected_keywords"]),
            "keywords_missing": kw_missing,
        })

    return {
        "top_k": top_k,
        "use_filter": use_filter,
        "ticker_accuracy": ticker_hits / len(TEST_SET),
        "keyword_recall": keyword_hits / total_keywords if total_keywords else 0,
        "per_question": per_question,
    }


def main():
    print("Loading embedding model...")
    embedder = SentenceTransformer("all-MiniLM-L6-v2")
    db = chromadb.PersistentClient(path=DB_PATH)
    collection = db.get_collection("sec_filings")

    count = collection.count()
    print(f"Collection has {count} chunks\n")

    # Test different configurations
    configs = [
        {"top_k": 5, "use_filter": False, "label": "top_k=5, no filter"},
        {"top_k": 8, "use_filter": False, "label": "top_k=8, no filter"},
        {"top_k": 12, "use_filter": False, "label": "top_k=12, no filter"},
        {"top_k": 5, "use_filter": True, "label": "top_k=5, with ticker filter"},
        {"top_k": 8, "use_filter": True, "label": "top_k=8, with ticker filter"},
    ]

    all_results = []

    for cfg in configs:
        result = evaluate_retrieval(embedder, collection, cfg["top_k"], cfg["use_filter"])
        all_results.append(result)

        print(f"Config: {cfg['label']}")
        print(f"  Ticker accuracy: {result['ticker_accuracy']:.0%}")
        print(f"  Keyword recall:  {result['keyword_recall']:.0%}")
        print()

    # Find best config
    best = max(all_results, key=lambda r: (r["keyword_recall"] + r["ticker_accuracy"]) / 2)
    print("=" * 60)
    print(f"Best config: top_k={best['top_k']}, filter={best['use_filter']}")
    print(f"  Ticker accuracy: {best['ticker_accuracy']:.0%}")
    print(f"  Keyword recall:  {best['keyword_recall']:.0%}")
    print()

    # Show per-question breakdown for best unfiltered config
    best_unfiltered = max(
        [r for r in all_results if not r["use_filter"]],
        key=lambda r: (r["keyword_recall"] + r["ticker_accuracy"]) / 2,
    )

    print("=" * 60)
    print(f"Per-question breakdown (top_k={best_unfiltered['top_k']}, no filter):\n")

    for q in best_unfiltered["per_question"]:
        ticker_ok = "Y" if q["ticker_found"] else "N"
        kw = f"{q['keywords_found']}/{q['keywords_total']}"
        missing = f" (missing: {', '.join(q['keywords_missing'])})" if q["keywords_missing"] else ""
        print(f"  [{ticker_ok}] {kw} kw | {q['expected_ticker']:5s} | {q['question'][:60]}{missing}")

    # Save results
    os.makedirs("data", exist_ok=True)
    with open("data/eval_results.json", "w") as f:
        json.dump(all_results, f, indent=2)
    print(f"\nFull results saved to data/eval_results.json")


if __name__ == "__main__":
    main()
