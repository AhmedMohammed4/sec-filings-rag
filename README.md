# SEC Filings RAG

A retrieval-augmented generation (RAG) system that lets you ask natural language questions about SEC 10-K filings. Every answer is grounded in real filings with citations.

## What it does

- Pulls 10-K annual reports from SEC EDGAR for 10 major companies (Apple, Tesla, NVIDIA, Meta, Microsoft, Amazon, Google, JPMorgan, J&J, Walmart)
- Chunks and embeds filings into a vector database (ChromaDB)
- Retrieves relevant sections using semantic search
- Generates grounded answers with citations to specific filings
- Chat-style frontend with company filtering and source pills

## Stack

**Backend:** Python, FastAPI, ChromaDB, Sentence-Transformers

**Frontend:** Next.js, TypeScript, Tailwind CSS

**Data:** SEC EDGAR API (free, public)

## Setup

### Prerequisites
- Python 3.12+
- Node.js 18+
- LLM API key

### Backend

```bash
cd sec-rag
python -m venv .venv
source .venv/bin/activate  # or .venv\Scripts\activate on Windows
pip install -r requirements.txt

# Add your API key
echo "ANTHROPIC_API_KEY=your-key-here" > .env

# Pull filings from SEC EDGAR
python ingest.py

# Chunk and embed into vector DB
python embed.py

# Start API server
python api.py
```

API runs at http://localhost:8000. Interactive docs at http://localhost:8000/docs.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend runs at http://localhost:3000.

### Docker (backend only)

```bash
# Build (after running ingest.py and embed.py locally)
docker build -t sec-rag .
docker run -p 8000:8000 -e ANTHROPIC_API_KEY=your-key sec-rag
```

## API Endpoints

| Endpoint | Method | Description |
|---|---|---|
| `/health` | GET | Health check |
| `/companies` | GET | List available companies |
| `/filings/{ticker}` | GET | List filings for a company |
| `/ask` | POST | Ask a question, get a cited answer |

### Example request

```bash
curl -X POST http://localhost:8000/ask \
  -H "Content-Type: application/json" \
  -d '{"question": "What are Apple biggest risk factors?", "ticker": "AAPL"}'
```

## Evaluation

Run `python evaluate.py` to test retrieval quality across a 20-question test set.

Current results (top_k=12, no filter):
- Ticker accuracy: 100%
- Keyword recall: 92%

## Project structure

```
sec-rag/
  config.py          # Company list, settings
  ingest.py          # Pull + clean SEC filings
  embed.py           # Chunk + embed into ChromaDB
  rag.py             # RAG pipeline (retrieve + generate)
  evaluate.py        # Retrieval evaluation
  api.py             # FastAPI backend
  frontend/          # Next.js chat interface
  data/
    clean/           # Cleaned filing text (git-tracked)
    vectordb/        # ChromaDB vector store
    raw/             # Raw HTML (git-ignored)
```
