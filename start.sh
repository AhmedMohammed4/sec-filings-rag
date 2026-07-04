#!/bin/bash
# Build vector DB on first run if it doesn't exist
if [ ! -d "data/vectordb" ]; then
    echo "Building vector database (first run)..."
    python embed.py
fi

uvicorn api:app --host 0.0.0.0 --port ${PORT:-8000}
