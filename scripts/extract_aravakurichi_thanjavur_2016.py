#!/usr/bin/env python3
"""
Extract TN 2016 Form 20 booth data for Aravakurichi (TN-134) and Thanjavur (TN-174).
These two constituencies had deferred polls (Nov 2016). PDFs: 134.pdf, 174.pdf.

Usage:
  pip install pdfplumber
  python scripts/extract_aravakurichi_thanjavur_2016.py

PDFs expected at:
  - /Users/p0s097d/Desktop/Dropbox/134.pdf  (Aravakurichi)
  - /Users/p0s097d/Desktop/Dropbox/174.pdf  (Thanjavur)

Or set env: PDF_134_PATH, PDF_174_PATH.

Output:
  - public/data/booths/TN/TN-134/2016.json
  - public/data/booths/TN/TN-174/2016.json

Assembly 2016 data for TN-134 and TN-174 is already in public/data/elections/ac/TN/2016.json.
This script only fills booth-wise results from Form 20 PDFs.
"""

import json
import re
import os
from pathlib import Path

try:
    import pdfplumber
except ImportError:
    print("❌ pdfplumber not installed. Install with: pip install pdfplumber")
    exit(1)

REPO_ROOT = Path(__file__).resolve().parent.parent
DROPBOX = Path(os.environ.get("DROPBOX", "/Users/p0s097d/Desktop/Dropbox"))
PDF_134 = Path(os.environ.get("PDF_134_PATH", DROPBOX / "134.pdf"))
PDF_174 = Path(os.environ.get("PDF_174_PATH", DROPBOX / "174.pdf"))

CONFIGS = [
    {
        "pdf": PDF_134,
        "ac_id": "TN-134",
        "ac_name": "Aravakurichi",
        "booth_json": REPO_ROOT / "public/data/booths/TN/TN-134/2016.json",
        "expected_booths": 244,
        "booth_col_preference": (1, 2, 0),  # col1 = Polling Station No
        "first_vote_cols": (2, 3, 4, 5),
        "vote_column_order": None,  # same as PDF order
    },
    {
        "pdf": PDF_174,
        "ac_id": "TN-174",
        "ac_name": "Thanjavur",
        "booth_json": REPO_ROOT / "public/data/booths/TN/TN-174/2016.json",
        "expected_booths": 276,
        "booth_col_preference": (0,),  # col0 = serial/booth no; col1 = electors
        "first_vote_cols": (2,),  # votes in col2-7 only (col14-19 is different table / would double count)
        "vote_column_order": (3, 1, 2, 0, 5, 4),  # PDF col2-7 = DMDK, DMK, BJP, ADMK, NOTA, NTK -> our ADMK, DMK, BJP, DMDK, NTK, NOTA
    },
]


def reverse_text(text):
    """Reverse text (Tamil text in PDF is often reversed)."""
    if not text or not isinstance(text, str):
        return ""
    return text.strip()[::-1]


def _parse_booth_no(row, max_booth=300, col_preference=(1, 2, 0)):
    """
    Extract booth number from row. col_preference: which columns to try first (e.g. (0,) for serial, (1,2,0) for Polling Station No).
    """
    for col_idx in col_preference:
        if col_idx >= len(row):
            continue
        cell = row[col_idx]
        if cell is None:
            continue
        nums = re.findall(r"\b(\d+)\b", str(cell).strip())
        for n in nums:
            v = int(n)
            if 1 <= v <= max_booth:
                return v
    return None


def _extract_votes_row(row, first_vote_col, num_candidates, vote_column_order=None):
    """
    Extract vote list from row. Vote columns start at first_vote_col.
    vote_column_order: if set, list of candidate indices for each PDF column (PDF col i -> our candidate vote_column_order[i]).
    """
    if not row or len(row) < first_vote_col + num_candidates:
        return None, 0
    votes = [0] * num_candidates
    for pdf_offset in range(num_candidates):
        col = first_vote_col + pdf_offset
        if col >= len(row) or row[col] is None:
            continue
        nums = re.findall(r"\b(\d+)\b", str(row[col]))
        if not nums:
            continue
        val = int(nums[0])
        if vote_column_order is not None and pdf_offset < len(vote_column_order):
            c = vote_column_order[pdf_offset]
            if 0 <= c < num_candidates:
                votes[c] = val
        else:
            votes[pdf_offset] = val
    total = sum(votes)
    return votes, total


def extract_booth_results_from_pdf(pdf_path, ac_id, candidates_from_json, expected_booths=250, config=None):
    """
    Extract booth-wise votes from Form 20 PDF.
    candidates_from_json: list of {"name", "party"} from existing 2016.json (order = candidate index).
    expected_booths: max booth number (e.g. 244 for Aravakurichi, 276 for Thanjavur).
    config: optional dict with booth_col_preference, first_vote_cols, vote_column_order (AC-specific).
    Returns: (results_dict, candidate_column_mapping).
    """
    config = config or {}
    results = {}  # booth_id -> { votes, total, rejected }; keep entry with highest total per booth
    num_candidates = len(candidates_from_json)
    if num_candidates == 0:
        return results, {}

    booth_col_preference = config.get("booth_col_preference", (1, 2, 0))
    first_vote_cols = config.get("first_vote_cols", (2, 3, 4, 5))
    vote_column_order = config.get("vote_column_order")  # e.g. (1,0,2,3,4,5) for TN-174
    # Relaxed total: single booth 2–6 candidates; allow 1–8000 to capture all rows
    total_min, total_max = 1, 8000

    with pdfplumber.open(pdf_path) as pdf:
        for page_num, page in enumerate(pdf.pages, 1):
            tables = page.extract_tables()
            if not tables:
                continue
            for table in tables:
                if not table or len(table) < 2:
                    continue
                for row_idx, row in enumerate(table):
                    if not row:
                        continue
                    # Skip totals / header rows (first 2–4 rows often header)
                    row_text = " ".join(str(c) for c in (row[:5] or []) if c)
                    if "Total" in row_text or "total" in row_text.lower() or "Polled" in row_text:
                        continue
                    if row_idx < 4 and ("Sl." in row_text or "Polling" in row_text or "Station" in row_text or "No.of Valid" in row_text):
                        continue
                    booth_no = _parse_booth_no(row, max_booth=expected_booths, col_preference=booth_col_preference)
                    if booth_no is None:
                        continue
                    booth_id = f"{ac_id}-{booth_no}"
                    for first_vote_col in first_vote_cols:
                        votes, total = _extract_votes_row(
                            row, first_vote_col, num_candidates, vote_column_order=vote_column_order
                        )
                        if total < total_min or total > total_max:
                            continue
                        # Reject if votes look like booth/serial leak (first vote equals booth_no)
                        if num_candidates >= 1 and votes[0] == booth_no and sum(votes[1:]) == 0:
                            continue
                        existing = results.get(booth_id)
                        if existing is None or total > existing["total"]:
                            results[booth_id] = {
                                "votes": votes,
                                "total": total,
                                "rejected": 0,
                            }
                        break  # one layout matched for this row (first that gives valid total)
    return results, {}


def run_one(config):
    pdf_path = config["pdf"]
    ac_id = config["ac_id"]
    ac_name = config["ac_name"]
    booth_json = config["booth_json"]

    if not pdf_path.exists():
        print(f"⏭️  Skip {ac_name}: PDF not found at {pdf_path}")
        return

    # Load existing 2016.json to get candidates and summary
    if not booth_json.exists():
        print(f"⏭️  Skip {ac_name}: {booth_json} not found")
        return
    with open(booth_json, encoding="utf-8") as f:
        data = json.load(f)
    candidates = data.get("candidates", [])
    summary = data.get("summary", {})
    if not candidates:
        print(f"⏭️  Skip {ac_name}: no candidates in existing JSON")
        return

    # Build list of {name, party} for column order (PDF columns usually follow same order as Form 20)
    candidates_for_extract = [{"name": c.get("name", ""), "party": c.get("party", "")} for c in candidates]
    expected_booths = config.get("expected_booths", 300)

    print(f"📄 {ac_name} ({ac_id}): extracting from {pdf_path.name} ({len(candidates)} candidates, expect up to {expected_booths} booths)")
    results, _ = extract_booth_results_from_pdf(
        pdf_path, ac_id, candidates_for_extract, expected_booths=expected_booths, config=config
    )
    print(f"   Extracted {len(results)} booths")

    if not results:
        print(f"   ⚠️  No booth rows extracted; check PDF layout or column start index (first_vote_col)")
        return

    expected_booths = config.get("expected_booths", 300)
    if expected_booths and len(results) < expected_booths * 0.5:
        existing_count = len(data.get("results") or {})
        if existing_count > len(results):
            print(f"   ⚠️  Extracted only {len(results)} booths (expected ~{expected_booths}); keeping existing {existing_count} booths to avoid regression.")
            return

    # Convert to output format: results keyed by booth id, sorted by booth number
    out_results = {}
    for booth_id, r in results.items():
        out_results[booth_id] = {
            "votes": r["votes"],
            "total": r["total"],
            "rejected": r.get("rejected", 0),
        }
    # Sort by booth number for deterministic output
    def booth_sort_key(k):
        try:
            return int(k.split("-")[-1])
        except (IndexError, ValueError):
            return 0
    data["results"] = dict(sorted(out_results.items(), key=lambda x: booth_sort_key(x[0])))

    # Use official summary from JSON (already set from assembly data); only recompute if missing
    extracted_total = sum(r["total"] for r in out_results.values())
    if not summary.get("totalVotes") or summary.get("totalVotes") == 0:
        cand_totals = [0] * len(candidates)
        for r in out_results.values():
            for i, v in enumerate(r["votes"]):
                if i < len(cand_totals):
                    cand_totals[i] += v
        if cand_totals:
            winner_idx = max(range(len(cand_totals)), key=lambda i: cand_totals[i])
            runner_idx = max((i for i in range(len(cand_totals)) if i != winner_idx), key=lambda i: cand_totals[i], default=winner_idx)
            margin = cand_totals[winner_idx] - cand_totals[runner_idx]
            margin_pct = (margin / extracted_total * 100) if extracted_total else 0
            summary = {
                "totalVoters": summary.get("totalVoters", 0),
                "totalVotes": extracted_total,
                "turnoutPercent": summary.get("turnoutPercent", 0),
                "winner": {"name": candidates[winner_idx].get("name", ""), "party": candidates[winner_idx].get("party", ""), "votes": cand_totals[winner_idx]},
                "runnerUp": {"name": candidates[runner_idx].get("name", ""), "party": candidates[runner_idx].get("party", ""), "votes": cand_totals[runner_idx]},
                "margin": margin,
                "marginPercent": round(margin_pct, 2),
            }
    if extracted_total and summary.get("totalVotes"):
        print(f"   Extracted total votes: {extracted_total:,} (official: {summary['totalVotes']:,})")

    data["totalBooths"] = config.get("expected_booths", len(out_results))
    data["summary"] = summary
    data["source"] = "Tamil Nadu CEO - Form 20 (Aravakurichi/Thanjavur deferred poll 2016; extracted from PDF)"

    with open(booth_json, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    print(f"   ✅ Wrote {booth_json}")


def debug_pdf(pdf_path, max_rows=20):
    """Print first page table structure to verify column layout."""
    import sys
    if not pdf_path.exists():
        print(f"❌ PDF not found: {pdf_path}", file=sys.stderr)
        return
    with pdfplumber.open(pdf_path) as pdf:
        page = pdf.pages[0]
        tables = page.extract_tables()
        print(f"Page 1: {len(tables)} table(s)", file=sys.stderr)
        for ti, table in enumerate(tables or []):
            print(f"  Table {ti}: {len(table)} rows", file=sys.stderr)
            for ri, row in enumerate(table[:max_rows]):
                print(f"    Row {ri}: {row}", file=sys.stderr)


def main():
    import sys
    if "--debug" in sys.argv:
        debug_pdf(PDF_134)
        return
    print("=" * 60)
    print("TN 2016 Form 20: Aravakurichi (134) & Thanjavur (174)")
    print("=" * 60)
    for config in CONFIGS:
        run_one(config)
    print("Done.")


if __name__ == "__main__":
    main()
