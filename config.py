"""Project configuration."""

# SEC EDGAR requires a User-Agent with your name and email
SEC_USER_AGENT = "Ahmed Mohammed mahme109@illinois.edu"

# Companies to pull filings for (CIK numbers)
# CIK is the unique identifier SEC uses for each company
COMPANIES = {
    "AAPL":  "0000320193",  # Apple
    "MSFT":  "0000789019",  # Microsoft
    "TSLA":  "0001318605",  # Tesla
    "GOOGL": "0001652044",  # Alphabet (Google)
    "AMZN":  "0001018724",  # Amazon
    "META":  "0001326801",  # Meta
    "NVDA":  "0001045810",  # NVIDIA
    "JPM":   "0000019617",  # JPMorgan Chase
    "JNJ":   "0000200406",  # Johnson & Johnson
    "WMT":   "0000104169",  # Walmart
}

# Filing types to fetch
FILING_TYPES = ["10-K"]

# How many filings per company (most recent)
FILINGS_PER_COMPANY = 2

# Where to store raw data
DATA_DIR = "data"
RAW_DIR = "data/raw"
CLEAN_DIR = "data/clean"
