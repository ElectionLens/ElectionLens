"""
Multi-strategy Form20 text extraction (from unified-pdf-parser-v2 patterns).

Uses pdfplumber tables, pdfplumber page text, and pdftotext -layout. Output is a neutral
row type keyed by booth token string (no TN-specific header alignment).
"""

from __future__ import annotations

import re
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Any

MIN_VOTES_PER_BOOTH = 20
MAX_VOTES_PER_BOOTH = 3000


@dataclass(frozen=True)
class Form20UnifiedRow:
    booth_key: str
    votes: list[int]
    total: int
    source_page: int
    confidence: float
    source: str


def _normalize_booth_key(booth_no: int) -> str:
    return str(int(booth_no))


def parse_table_enhanced(table: list[list[Any]], num_candidates: int, page_num: int) -> list[Form20UnifiedRow]:
    booths: list[Form20UnifiedRow] = []
    if not table or len(table) < 2:
        return booths

    header_row = 0
    for i, row in enumerate(table[:5]):
        if row and any(
            cell
            and isinstance(cell, str)
            and any(kw in str(cell).upper() for kw in ("SL", "STATION", "NO", "SERIAL"))
            for cell in row[:3]
        ):
            header_row = i
            break

    for row in table[header_row + 1 :]:
        if not row or len(row) < 3:
            continue
        clean_row: list[str] = []
        for cell in row:
            if cell is None:
                clean_row.append("")
            else:
                cell_str = str(cell).strip()
                cell_str = re.sub(r"[^\d\s]", " ", cell_str)
                clean_row.append(cell_str)

        all_numbers: list[int] = []
        for cell in clean_row:
            nums = re.findall(r"\b(\d+)\b", cell)
            all_numbers.extend(int(n) for n in nums)

        if len(all_numbers) < 4:
            continue

        booth_no: int | None = None
        vote_start = 0
        for i, num in enumerate(all_numbers[:5]):
            if 1 <= num <= 600:
                booth_no = num
                vote_start = i + 1
                break
        if not booth_no:
            continue

        votes: list[int] = []
        for num in all_numbers[vote_start:]:
            if num <= 2000:
                votes.append(num)
            elif num > 5000:
                break

        if len(votes) < 3:
            continue
        votes = votes[:num_candidates]
        while len(votes) < num_candidates:
            votes.append(0)
        total = sum(votes)
        if MIN_VOTES_PER_BOOTH <= total <= MAX_VOTES_PER_BOOTH:
            booths.append(
                Form20UnifiedRow(
                    booth_key=_normalize_booth_key(booth_no),
                    votes=votes,
                    total=total,
                    source_page=page_num,
                    confidence=0.95,
                    source="tables",
                )
            )
    return booths


def parse_text_enhanced(text: str, num_candidates: int, page_num: int) -> list[Form20UnifiedRow]:
    booths: list[Form20UnifiedRow] = []
    for line in text.split("\n"):
        if any(
            kw in line.upper()
            for kw in ("FORM 20", "ELECTION", "CANDIDATE", "PARTY", "TOTAL", "NOTA", "POSTAL")
        ):
            continue
        numbers = [int(m.group(1)) for m in re.finditer(r"\b(\d+)\b", line)]
        if len(numbers) < 4:
            continue
        booth_no: int | None = None
        vote_start = 0
        for i, num in enumerate(numbers[:3]):
            if 1 <= num <= 600:
                booth_no = num
                vote_start = i + 1
                break
        if not booth_no:
            continue
        votes: list[int] = []
        for num in numbers[vote_start:]:
            if num <= 2000:
                votes.append(num)
            elif num > 5000:
                break
        if len(votes) < 3:
            continue
        votes = votes[:num_candidates]
        while len(votes) < num_candidates:
            votes.append(0)
        total = sum(votes)
        if MIN_VOTES_PER_BOOTH <= total <= MAX_VOTES_PER_BOOTH:
            booths.append(
                Form20UnifiedRow(
                    booth_key=_normalize_booth_key(booth_no),
                    votes=votes,
                    total=total,
                    source_page=page_num,
                    confidence=0.85,
                    source="text",
                )
            )
    return booths


def extract_form20_text_strategies(pdf_path: Path, num_candidates: int) -> dict[str, Form20UnifiedRow]:
    """Merge strategies by booth_key; keep highest confidence per key."""
    import pdfplumber

    merged: dict[str, tuple[Form20UnifiedRow, float]] = {}

    def put(row: Form20UnifiedRow) -> None:
        k = row.booth_key
        prev = merged.get(k)
        if prev is None or row.confidence > prev[1]:
            merged[k] = (row, row.confidence)

    try:
        with pdfplumber.open(pdf_path) as pdf:
            for page_num, page in enumerate(pdf.pages):
                for table in page.extract_tables() or []:
                    for booth in parse_table_enhanced(table, num_candidates, page_num):
                        put(booth)
                text = page.extract_text() or ""
                for booth in parse_text_enhanced(text, num_candidates, page_num):
                    put(booth)
    except Exception:
        pass

    try:
        result = subprocess.run(
            ["pdftotext", "-layout", str(pdf_path), "-"],
            capture_output=True,
            text=True,
            timeout=60,
        )
        if result.returncode == 0:
            for booth in parse_text_enhanced(result.stdout, num_candidates, 0):
                b2 = Form20UnifiedRow(
                    booth_key=booth.booth_key,
                    votes=booth.votes,
                    total=booth.total,
                    source_page=booth.source_page,
                    confidence=0.75,
                    source="pdftotext",
                )
                put(b2)
    except (FileNotFoundError, subprocess.SubprocessError, OSError):
        pass

    return {k: v[0] for k, v in merged.items()}


def unified_rows_to_form20_records(
    rows: dict[str, Form20UnifiedRow],
    n_json_candidates: int,
) -> dict[str, dict[str, Any]]:
    out: dict[str, dict[str, Any]] = {}
    for key, row in rows.items():
        votes = list(row.votes[:n_json_candidates])
        while len(votes) < n_json_candidates:
            votes.append(0)
        votes = votes[:n_json_candidates]
        polled = sum(votes)
        out[key] = {
            "booth": key,
            "votes": votes,
            "total": polled,
            "rejected": 0,
            "_total_valid": polled,
            "_nota": votes[-1] if votes else 0,
        }
    return out
