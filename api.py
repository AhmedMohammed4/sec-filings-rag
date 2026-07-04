"""Phase 5: FastAPI backend for SEC Filings RAG."""

import os
import sys
import time
from collections import defaultdict

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from dotenv import load_dotenv

load_dotenv()

from rag import SecRAG
from config import COMPANIES

rag_instance: SecRAG = None

# Rate limiting: max requests per IP per minute
RATE_LIMIT = int(os.getenv("RATE_LIMIT", "5"))
rate_tracker: dict[str, list[float]] = defaultdict(list)


def check_rate_limit(ip: str):
    now = time.time()
    # Clean old entries
    rate_tracker[ip] = [t for t in rate_tracker[ip] if now - t < 60]
    if len(rate_tracker[ip]) >= RATE_LIMIT:
        raise HTTPException(status_code=429, detail="Too many requests. Try again in a minute.")
    rate_tracker[ip].append(now)


@asynccontextmanager
async def lifespan(app: FastAPI):
    global rag_instance
    print("Loading RAG pipeline...")
    rag_instance = SecRAG()
    print("Ready.")
    yield
    print("Shutting down.")


app = FastAPI(
    title="SEC Filings RAG API",
    description="Ask natural language questions about SEC 10-K filings",
    version="1.0.0",
    lifespan=lifespan,
)

ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000,http://localhost:3001").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class AskRequest(BaseModel):
    question: str = Field(..., min_length=3, max_length=500, description="Question about SEC filings")
    ticker: str | None = Field(None, description="Optional ticker to filter results (e.g. AAPL)")


class Source(BaseModel):
    ticker: str
    form: str
    filing_date: str
    preview: str


class AskResponse(BaseModel):
    answer: str
    sources: list[Source]


class CompanyInfo(BaseModel):
    ticker: str
    cik: str


@app.get("/health")
async def health():
    stats = rag_instance.get_stats() if rag_instance else {}
    return {"status": "ok", **stats}


@app.get("/companies", response_model=list[CompanyInfo])
async def list_companies():
    return [{"ticker": ticker, "cik": cik} for ticker, cik in sorted(COMPANIES.items())]


@app.get("/filings/{ticker}")
async def list_filings(ticker: str):
    ticker = ticker.upper()
    if ticker not in COMPANIES:
        raise HTTPException(status_code=404, detail=f"Unknown ticker: {ticker}")

    results = rag_instance.collection.get(
        where={"ticker": ticker},
        include=["metadatas"],
    )

    seen = set()
    filings = []
    for meta in results["metadatas"]:
        key = f"{meta['form']}_{meta['filing_date']}"
        if key not in seen:
            seen.add(key)
            filings.append({
                "form": meta["form"],
                "filing_date": meta["filing_date"],
                "total_chunks": meta["total_chunks"],
            })

    filings.sort(key=lambda x: x["filing_date"], reverse=True)
    return filings


@app.post("/ask", response_model=AskResponse)
async def ask(request: AskRequest, req: Request):
    # Rate limit by IP
    client_ip = req.client.host if req.client else "unknown"
    check_rate_limit(client_ip)

    ticker = request.ticker.upper() if request.ticker else None

    if ticker and ticker not in COMPANIES:
        raise HTTPException(status_code=400, detail=f"Unknown ticker: {ticker}")

    try:
        # Retrieve chunks (for sources display)
        chunks = rag_instance.retrieve(request.question, ticker=ticker)

        if not chunks:
            raise HTTPException(status_code=404, detail="No relevant documents found")

        # Get answer (uses cache + cost tracking internally)
        answer = rag_instance.ask(request.question, ticker=ticker)

        # Build sources list
        seen_sources = set()
        sources = []
        for chunk in chunks:
            key = f"{chunk['ticker']}_{chunk['form']}_{chunk['filing_date']}"
            if key not in seen_sources:
                seen_sources.add(key)
                sources.append(Source(
                    ticker=chunk["ticker"],
                    form=chunk["form"],
                    filing_date=chunk["filing_date"],
                    preview=chunk["text"][:150].replace("\n", " "),
                ))

        return AskResponse(answer=answer, sources=sources)

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("api:app", host="0.0.0.0", port=8000, reload=True)
