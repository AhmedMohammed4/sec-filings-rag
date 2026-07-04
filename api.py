"""Phase 5: FastAPI backend for SEC Filings RAG."""

import os
import sys

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from dotenv import load_dotenv

load_dotenv()

from rag import SecRAG
from config import COMPANIES

rag_instance: SecRAG = None


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


# --- Request/Response models ---

class AskRequest(BaseModel):
    question: str = Field(..., min_length=3, max_length=1000, description="Question about SEC filings")
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


# --- Routes ---

@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/companies", response_model=list[CompanyInfo])
async def list_companies():
    """List all companies with available filings."""
    return [{"ticker": ticker, "cik": cik} for ticker, cik in sorted(COMPANIES.items())]


@app.get("/filings/{ticker}")
async def list_filings(ticker: str):
    """List available filings for a company."""
    ticker = ticker.upper()
    if ticker not in COMPANIES:
        raise HTTPException(status_code=404, detail=f"Unknown ticker: {ticker}")

    # Query ChromaDB for unique filings for this ticker
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
async def ask(request: AskRequest):
    """Ask a question about SEC filings."""
    ticker = request.ticker.upper() if request.ticker else None

    if ticker and ticker not in COMPANIES:
        raise HTTPException(status_code=400, detail=f"Unknown ticker: {ticker}")

    try:
        # Retrieve chunks
        chunks = rag_instance.retrieve(request.question, ticker=ticker)

        if not chunks:
            raise HTTPException(status_code=404, detail="No relevant documents found")

        # Build context and get answer
        context = rag_instance.build_context(chunks)

        user_message = f"""Context from SEC filings:

{context}

---

Question: {request.question}"""

        response = rag_instance.client.messages.create(
            model=os.getenv("LLM_MODEL", "claude-sonnet-4-6"),
            max_tokens=1500,
            system=rag_instance.SYSTEM_PROMPT if hasattr(rag_instance, 'SYSTEM_PROMPT') else "You are a financial analyst assistant. Answer questions using only the provided SEC filing context. Cite sources using [TICKER FORM DATE] format.",
            messages=[{"role": "user", "content": user_message}],
        )

        answer = response.content[0].text

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
