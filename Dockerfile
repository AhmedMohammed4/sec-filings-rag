FROM python:3.12-slim

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY config.py .
COPY ingest.py .
COPY embed.py .
COPY rag.py .
COPY api.py .
COPY evaluate.py .

# Copy pre-built vector database and clean data
COPY data/vectordb/ data/vectordb/
COPY data/clean/ data/clean/

EXPOSE 8000

CMD ["uvicorn", "api:app", "--host", "0.0.0.0", "--port", "8000"]
