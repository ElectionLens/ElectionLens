"""Reusable archive-2 Form20 and polling-station layout recovery helpers."""

from __future__ import annotations

import re
import subprocess
from pathlib import Path
from typing import Any


def try_int(s: str) -> int | None:
    """Parse clean integers and conservative OCR cells containing one integer."""
    s = (s or "").strip()
    if s == "":
        return 0
    if "dnuor" in s.lower() or "round" in s.lower():
        return 0
    if re.fullmatch(r"-?\d+", s):
        return int(s)
    tokens = re.findall(r"-?\d+", s)
    return int(tokens[0]) if len(tokens) == 1 else None


def validate_candidate_columns(
    header: list[str], rows: list[list[str]], reserved: list[str]
) -> tuple[bool, str, list[str], list[list[int]]]:
    if len(header) < 7:
        return False, f"header too short ({len(header)} cols)", [], []
    if header[-5:] != reserved:
        return False, f"unexpected trailing columns {header[-5:]}", [], []
    candidate_cols = header[1:-5]
    parsed_rows: list[list[int]] = []
    for i, row in enumerate(rows):
        if len(row) != len(header):
            return False, f"row {i + 1} has {len(row)} fields, header has {len(header)}", [], []
        vals: list[int] = []
        for j, cell in enumerate(row[1:]):
            value = try_int(cell)
            if value is None:
                col_name = (candidate_cols + reserved)[j]
                return False, f"row {i + 1} col '{col_name}' is not numeric: {cell!r}", [], []
            vals.append(value)
        parsed_rows.append(vals)
    return True, "", candidate_cols, parsed_rows


def recover_form20_layout(
    header: list[str], rows: list[list[str]], non_nota_count: int
) -> tuple[bool, str, list[str], list[list[int]]]:
    """Recover exports with inserted address/elector columns using row arithmetic."""
    if non_nota_count <= 0:
        return False, "no official candidates", [], []
    recovered: list[list[int]] = []
    starts: list[int] = []
    for row_no, row in enumerate(rows, 1):
        numeric = [try_int(cell) for cell in row]
        found: tuple[int, list[int]] | None = None
        for start in range(1, min(5, len(row) - non_nota_count)):
            segment = numeric[start : start + non_nota_count]
            if any(v is None for v in segment):
                continue
            candidate_sum = sum(int(v) for v in segment)
            for nota_offset in (0, 1):
                valid_idx = start + non_nota_count + nota_offset
                if valid_idx >= len(numeric) or numeric[valid_idx] is None:
                    continue
                if candidate_sum != int(numeric[valid_idx]):
                    continue
                rejected_idx = valid_idx + 1
                nota_idx = start + non_nota_count if nota_offset == 1 else valid_idx + 2
                total_idx = valid_idx + 3
                tendered_idx = total_idx + 1
                if total_idx >= len(numeric):
                    continue
                fields = (rejected_idx, nota_idx, total_idx, tendered_idx)
                if any(i >= len(numeric) or numeric[i] is None for i in fields):
                    continue
                found = (
                    start,
                    [*map(int, segment), int(numeric[rejected_idx]), int(numeric[nota_idx]),
                     int(numeric[total_idx]), int(numeric[tendered_idx])],
                )
                break
            if found:
                break
        if not found:
            return False, f"row {row_no}: no candidate segment sums to Total Valid Votes", [], []
        start, normalized = found
        starts.append(start)
        recovered.append(normalized)
    if len(set(starts)) != 1:
        return False, f"mixed row layouts detected: {sorted(set(starts))}", [], []
    start = starts[0]
    candidate_cols = header[start : start + non_nota_count]
    if len(candidate_cols) != non_nota_count:
        candidate_cols = [f"Candidate_{i + 1}" for i in range(non_nota_count)]
    return True, "", candidate_cols, recovered


def parse_polling_station_text(pdf_path: Path, ac_no: int, expected: int) -> list[dict[str, Any]]:
    """Fallback for text PDFs whose visual table is not exposed by pdfplumber."""
    try:
        text = subprocess.run(
            ["pdftotext", "-layout", str(pdf_path), "-"],
            capture_output=True, text=True, timeout=60, check=False,
        ).stdout
    except (OSError, subprocess.SubprocessError):
        return []
    lines = text.splitlines()
    markers: list[tuple[int, str, str, str]] = []
    ac_prefix = re.compile(rf"^\s*{ac_no}\s+(\d+)\s+(\d+)(?:\s+(.*))?$")
    repeated = re.compile(r"^\s*(\d+)\s+(\d+)(?:\s+(.*))?$")
    for i, line in enumerate(lines):
        match = ac_prefix.match(line) or repeated.match(line)
        if not match or (match.re is repeated and match.group(1) != match.group(2)):
            continue
        num = int(match.group(2))
        if 1 <= num <= expected + 5:
            markers.append((i, match.group(1), match.group(2), match.group(3) or ""))
    seen: set[str] = set()
    booths: list[dict[str, Any]] = []
    for marker_index, _part, ps_no, tail in markers:
        if ps_no in seen:
            continue
        seen.add(ps_no)
        name = tail.strip()
        if not name or name.lower() in {"all voter", "all voters"}:
            for candidate in lines[marker_index + 1 : marker_index + 5]:
                candidate = candidate.strip()
                if candidate and not re.match(r"^\d+\s+\d+", candidate):
                    if candidate.lower() not in {"all voter", "all voters"}:
                        name = candidate
                        break
        booths.append({
            "boothNo": ps_no,
            "num": int(re.match(r"\d+", ps_no).group()),
            "name": name,
            "address": name,
            "area": "",
            "pst": "All Voter",
        })
    return booths if len(booths) == expected else []
