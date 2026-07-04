FROM python:3.12-slim

WORKDIR /app

# Install CPU-only torch first (much smaller than full torch)
RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu

# Install remaining dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY config.py .
COPY rag.py .
COPY api.py .

# Copy pre-built vector database
COPY data/vectordb/ data/vectordb/

EXPOSE 8000

CMD uvicorn api:app --host 0.0.0.0 --port ${PORT:-8000}
