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
COPY start.sh .

# Copy clean data
COPY data/clean/ data/clean/

RUN chmod +x start.sh

EXPOSE 8000

CMD ["./start.sh"]
