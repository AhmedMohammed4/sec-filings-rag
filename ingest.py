"""Phase 1: Pull SEC filings from EDGAR and clean them into plain text."""

import os
import re
import json
import time
import requests
from bs4 import BeautifulSoup
from tqdm import tqdm
from config import (
    SEC_USER_AGENT,
    COMPANIES,
    FILING_TYPES,
    FILINGS_PER_COMPANY,
    RAW_DIR,
    CLEAN_DIR,
)

HEADERS = {"User-Agent": SEC_USER_AGENT}
BASE_URL = "https://efts.sec.gov/LATEST/search-index/efulltext/search"
SUBMISSIONS_URL = "https://data.sec.gov/submissions/CIK{cik}.json"
FILING_URL = "https://www.sec.gov/Archives/edgar/data/{cik}/{accession}/{doc}"


def get_filings_list(cik: str, filing_type: str, count: int) -> list[dict]:
    """Get list of recent filings for a company from EDGAR."""
    url = SUBMISSIONS_URL.format(cik=cik)
    resp = requests.get(url, headers=HEADERS)
    resp.raise_for_status()
    data = resp.json()

    recent = data["filings"]["recent"]
    filings = []

    for i in range(len(recent["form"])):
        if recent["form"][i] == filing_type and len(filings) < count:
            accession = recent["accessionNumber"][i].replace("-", "")
            filings.append({
                "accession": accession,
                "accession_display": recent["accessionNumber"][i],
                "filing_date": recent["filingDate"][i],
                "primary_doc": recent["primaryDocument"][i],
                "form": recent["form"][i],
            })

    return filings


def download_filing(cik: str, filing: dict) -> str:
    """Download a single filing document and return the HTML content."""
    url = FILING_URL.format(
        cik=cik.lstrip("0"),
        accession=filing["accession"],
        doc=filing["primary_doc"],
    )
    resp = requests.get(url, headers=HEADERS)
    resp.raise_for_status()
    return resp.text


def clean_html_to_text(html: str) -> str:
    """Convert SEC filing HTML to clean plain text."""
    import warnings
    from bs4 import XMLParsedAsHTMLWarning
    warnings.filterwarnings("ignore", category=XMLParsedAsHTMLWarning)

    soup = BeautifulSoup(html, "lxml")

    # Remove script, style, and hidden tags
    for tag in soup(["script", "style", "meta", "link", "ix:hidden"]):
        tag.decompose()

    # Get text
    text = soup.get_text(separator="\n")

    # Clean up whitespace
    lines = []
    for line in text.splitlines():
        line = line.strip()
        if line:
            lines.append(line)

    text = "\n".join(lines)

    # Strip XBRL junk before actual filing content
    # Look for the standard SEC filing header
    markers = ["UNITED STATES", "ANNUAL REPORT PURSUANT", "FORM 10-K"]
    for marker in markers:
        idx = text.find(marker)
        if idx != -1:
            text = text[idx:]
            break

    # Remove lines that look like XBRL data (urls, pure numbers, CIK patterns)
    cleaned_lines = []
    for line in text.splitlines():
        # Skip XBRL namespace URLs
        if line.startswith("http://") or line.startswith("https://"):
            continue
        # Skip bare CIK-like numbers (7-10 digit numbers alone on a line)
        if re.match(r"^\d{7,10}$", line):
            continue
        # Skip XBRL prefixed values
        if re.match(r"^(us-gaap|dei|xbrli|iso4217|srt):", line):
            continue
        cleaned_lines.append(line)

    text = "\n".join(cleaned_lines)

    # Collapse multiple blank lines
    text = re.sub(r"\n{3,}", "\n\n", text)

    return text


def save_raw(ticker: str, filing: dict, html: str):
    """Save raw HTML filing."""
    path = os.path.join(RAW_DIR, ticker)
    os.makedirs(path, exist_ok=True)
    filename = f"{filing['form']}_{filing['filing_date']}.html"
    with open(os.path.join(path, filename), "w", encoding="utf-8") as f:
        f.write(html)


def save_clean(ticker: str, filing: dict, text: str):
    """Save cleaned text filing with metadata."""
    path = os.path.join(CLEAN_DIR, ticker)
    os.makedirs(path, exist_ok=True)
    filename = f"{filing['form']}_{filing['filing_date']}.txt"

    # Prepend metadata header
    header = (
        f"TICKER: {ticker}\n"
        f"FORM: {filing['form']}\n"
        f"FILING DATE: {filing['filing_date']}\n"
        f"ACCESSION: {filing['accession_display']}\n"
        f"---\n\n"
    )

    with open(os.path.join(path, filename), "w", encoding="utf-8") as f:
        f.write(header + text)

    return filename


def save_metadata(ticker: str, filing: dict, filename: str):
    """Save filing metadata as JSON."""
    path = os.path.join(CLEAN_DIR, ticker)
    meta_file = os.path.join(path, "metadata.json")

    metadata = []
    if os.path.exists(meta_file):
        with open(meta_file, "r") as f:
            metadata = json.load(f)

    metadata.append({
        "ticker": ticker,
        "form": filing["form"],
        "filing_date": filing["filing_date"],
        "accession": filing["accession_display"],
        "filename": filename,
    })

    with open(meta_file, "w") as f:
        json.dump(metadata, f, indent=2)


def main():
    os.makedirs(RAW_DIR, exist_ok=True)
    os.makedirs(CLEAN_DIR, exist_ok=True)

    total = len(COMPANIES) * len(FILING_TYPES) * FILINGS_PER_COMPANY
    print(f"Fetching up to {total} filings for {len(COMPANIES)} companies...\n")

    success = 0
    errors = []

    for ticker, cik in tqdm(COMPANIES.items(), desc="Companies"):
        for filing_type in FILING_TYPES:
            # Get filing list
            try:
                filings = get_filings_list(cik, filing_type, FILINGS_PER_COMPANY)
            except Exception as e:
                errors.append(f"{ticker} {filing_type}: failed to get filing list - {e}")
                continue

            for filing in filings:
                try:
                    # Rate limit: SEC asks for max 10 requests/sec
                    time.sleep(0.15)

                    # Download
                    html = download_filing(cik, filing)
                    save_raw(ticker, filing, html)

                    # Clean
                    text = clean_html_to_text(html)
                    filename = save_clean(ticker, filing, text)
                    save_metadata(ticker, filing, filename)

                    success += 1
                    tqdm.write(f"  {ticker} {filing['form']} {filing['filing_date']} - {len(text):,} chars")

                except Exception as e:
                    errors.append(f"{ticker} {filing['form']} {filing['filing_date']}: {e}")

    print(f"\nDone: {success} filings downloaded, {len(errors)} errors")
    if errors:
        print("\nErrors:")
        for e in errors:
            print(f"  - {e}")


if __name__ == "__main__":
    main()
