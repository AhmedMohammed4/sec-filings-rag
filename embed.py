"""Phase 2: Chunk SEC filings and embed them into ChromaDB."""

import os
import json
import re
import chromadb
from sentence_transformers import SentenceTransformer
from tqdm import tqdm
from config import CLEAN_DIR

# Chunking settings
CHUNK_SIZE = 1000       # target tokens per chunk (approx 4 chars per token)
CHUNK_OVERLAP = 200     # overlap between chunks in tokens
CHAR_PER_TOKEN = 4      # rough estimate

CHUNK_CHARS = CHUNK_SIZE * CHAR_PER_TOKEN
OVERLAP_CHARS = CHUNK_OVERLAP * CHAR_PER_TOKEN

DB_PATH = "data/vectordb"


def parse_metadata_header(text: str) -> tuple[dict, str]:
    """Split metadata header from filing content."""
    meta = {}
    if "---" in text:
        header, body = text.split("---", 1)
        for line in header.strip().splitlines():
            if ":" in line:
                key, val = line.split(":", 1)
                meta[key.strip().lower().replace(" ", "_")] = val.strip()
        return meta, body.strip()
    return meta, text


def chunk_text(text: str, chunk_chars: int, overlap_chars: int) -> list[str]:
    """Split text into overlapping chunks, breaking at line boundaries."""
    lines = text.splitlines()

    chunks = []
    current_chunk = ""

    for line in lines:
        # If adding this line would exceed chunk size, save current and start new
        if len(current_chunk) + len(line) + 1 > chunk_chars and current_chunk:
            chunks.append(current_chunk.strip())
            # Keep overlap from end of current chunk
            if overlap_chars > 0 and len(current_chunk) > overlap_chars:
                current_chunk = current_chunk[-overlap_chars:]
            else:
                current_chunk = ""

        current_chunk += "\n" + line

    # Don't forget the last chunk
    if current_chunk.strip():
        chunks.append(current_chunk.strip())

    # Filter out tiny chunks (less than 100 chars)
    chunks = [c for c in chunks if len(c) >= 100]

    return chunks


def main():
    # Load embedding model
    print("Loading embedding model (all-MiniLM-L6-v2)...")
    model = SentenceTransformer("all-MiniLM-L6-v2")

    # Set up ChromaDB
    client = chromadb.PersistentClient(path=DB_PATH)

    # Delete existing collection if re-running
    try:
        client.delete_collection("sec_filings")
    except Exception:
        pass

    collection = client.create_collection(
        name="sec_filings",
        metadata={"hnsw:space": "cosine"},
    )

    # Process each company's filings
    tickers = sorted(os.listdir(CLEAN_DIR))
    total_chunks = 0

    for ticker in tqdm(tickers, desc="Companies"):
        ticker_dir = os.path.join(CLEAN_DIR, ticker)
        if not os.path.isdir(ticker_dir):
            continue

        txt_files = [f for f in os.listdir(ticker_dir) if f.endswith(".txt")]

        for txt_file in txt_files:
            filepath = os.path.join(ticker_dir, txt_file)
            with open(filepath, "r", encoding="utf-8") as f:
                raw = f.read()

            # Parse metadata and content
            meta, content = parse_metadata_header(raw)
            ticker_val = meta.get("ticker", ticker)
            form = meta.get("form", "10-K")
            filing_date = meta.get("filing_date", "unknown")

            # Chunk the content
            chunks = chunk_text(content, CHUNK_CHARS, OVERLAP_CHARS)

            if not chunks:
                continue

            # Generate embeddings in batch
            embeddings = model.encode(chunks, show_progress_bar=False).tolist()

            # Prepare data for ChromaDB
            ids = [f"{ticker_val}_{form}_{filing_date}_chunk_{i}" for i in range(len(chunks))]
            metadatas = [
                {
                    "ticker": ticker_val,
                    "form": form,
                    "filing_date": filing_date,
                    "chunk_index": i,
                    "total_chunks": len(chunks),
                }
                for i in range(len(chunks))
            ]

            # Add to collection in batches (ChromaDB has a limit)
            batch_size = 100
            for start in range(0, len(chunks), batch_size):
                end = min(start + batch_size, len(chunks))
                collection.add(
                    ids=ids[start:end],
                    embeddings=embeddings[start:end],
                    documents=chunks[start:end],
                    metadatas=metadatas[start:end],
                )

            total_chunks += len(chunks)
            tqdm.write(f"  {ticker_val} {form} {filing_date} - {len(chunks)} chunks")

    print(f"\nDone: {total_chunks} total chunks embedded and stored in {DB_PATH}")

    # Quick sanity check - test a query
    print("\n--- Sanity check ---")
    test_query = "What are the biggest risk factors?"
    query_embedding = model.encode([test_query]).tolist()
    results = collection.query(
        query_embeddings=query_embedding,
        n_results=3,
    )

    print(f"Query: \"{test_query}\"")
    for i, (doc, meta) in enumerate(zip(results["documents"][0], results["metadatas"][0])):
        print(f"\n  Result {i+1}: {meta['ticker']} {meta['form']} ({meta['filing_date']})")
        preview = doc[:200].encode("ascii", errors="replace").decode("ascii")
        print(f"  Preview: {preview}...")


if __name__ == "__main__":
    main()
