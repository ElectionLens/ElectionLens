"""Strict Form20 PDF row extraction shared by the archive importers."""

from __future__ import annotations

import re
import subprocess
from pathlib import Path


def parse_form20_pdf_rows(
    pdf_path: Path, non_nota_count: int, *, max_booth: int = 2000
) -> dict[int, tuple[list[int], int, int, int, int, int]]:
    """Extract booth rows from a Form20 PDF using arithmetic invariants.

    A row is accepted only when candidate votes sum to Total Valid Votes and
    the tail fields reconcile. This intentionally supports the common four-tail
    and five-tail exports without trusting column headers, which are often
    rotated, generic, or OCR-corrupted.
    """
    try:
        text = subprocess.run(
            ['pdftotext', '-raw', str(pdf_path), '-'],
            capture_output=True,
            text=True,
            timeout=120,
            check=False,
        ).stdout
    except (OSError, subprocess.SubprocessError):
        return {}

    found: dict[int, tuple[list[int], int, int, int, int, int]] = {}
    for line in text.splitlines():
        nums = [int(value) for value in re.findall(r'(?<![A-Za-z])\d+', line)]
        if not nums:
            continue

        starts = (2, 1) if len(nums) > 1 and nums[0] == nums[1] else (1, 2)
        for start in starts:
            if start == 2 and len(nums) < 2:
                continue
            booth = nums[1] if start == 2 and nums[0] == nums[1] else nums[0]
            if not 1 <= booth <= max_booth:
                continue

            for tail_len in (5, 4):
                if len(nums) < start + non_nota_count + tail_len:
                    continue
                candidates = nums[start : start + non_nota_count]
                tail = nums[start + non_nota_count : start + non_nota_count + tail_len]
                if tail_len == 5:
                    valid, rejected, nota, total, tendered = tail
                    if sum(candidates) != valid or valid + rejected + nota != total:
                        continue
                else:
                    valid, first, second, third = tail
                    if sum(candidates) != valid:
                        continue
                    if valid + first == second:
                        rejected, nota, total, tendered = 0, first, second, third
                    elif valid + first + second == third:
                        rejected, nota, total, tendered = first, second, third, 0
                    else:
                        continue

                found.setdefault(
                    booth,
                    (candidates, valid, rejected, nota, total, tendered),
                )
                break
            if booth in found:
                break

    return found
