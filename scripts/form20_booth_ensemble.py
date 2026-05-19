"""
Multi-parser Form20 booth extraction for image-only CEO scans.

Runs EasyOCR + Tesseract with several DPI / line-group / strictness passes,
then retries on missing booth numbers until target coverage or max rounds.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from form20_unified_strategies import Form20UnifiedRow
from form20_ocr_strategies import (
    _easyocr_available,
    _extract_surya,
    _extract_tesseract_pages_fast,
    _ocr_available,
    extract_form20_booths_easyocr,
)
from form20_unified_strategies import extract_form20_text_strategies
from tn_2026_form20_coverage import form20_key_maps_to_legacy


@dataclass(frozen=True)
class _EasyPass:
    name: str
    dpi: int = 300
    y_bucket: int = 12
    strictness: str = "normal"
    preprocess: str | None = None


# Broad passes first, then targeted missing-booth retries use permissive + allowed set.
EASYOCR_PASSES: tuple[_EasyPass, ...] = (
    _EasyPass("easy_300_12", 300, 12, "normal", None),
    _EasyPass("easy_300_8", 300, 8, "relaxed", None),
    _EasyPass("easy_300_16", 300, 16, "relaxed", None),
    _EasyPass("easy_350_12", 350, 12, "relaxed", None),
    _EasyPass("easy_250_10", 250, 10, "relaxed", None),
    _EasyPass("easy_300_hc", 300, 12, "relaxed", "high_contrast"),
    _EasyPass("easy_300_adapt", 300, 10, "permissive", "adaptive"),
)

MISSING_RETRY_PASSES: tuple[_EasyPass, ...] = (
    _EasyPass("miss_300_8", 300, 8, "permissive", None),
    _EasyPass("miss_350_6", 350, 6, "permissive", None),
    _EasyPass("miss_300_hc", 300, 12, "permissive", "high_contrast"),
    _EasyPass("miss_250_8", 250, 8, "permissive", None),
)

TESSERACT_PASSES: tuple[tuple[str, str, int], ...] = (
    ("tess_hc_psm6", "high_contrast", 6),
    ("tess_std_psm4", "standard", 4),
    ("tess_adapt_psm6", "adaptive", 6),
)


def expected_booth_ints(booths_doc: dict[str, Any]) -> frozenset[int]:
    out: set[int] = set()
    for b in booths_doc.get("booths") or []:
        bn = b.get("boothNo")
        if bn is None:
            continue
        m = re.match(r"^(\d+)", str(bn).strip())
        if m:
            out.add(int(m.group(1)))
    return frozenset(out)


def _merge_rows(
    merged: dict[str, tuple[Form20UnifiedRow, float]],
    rows: dict[str, Form20UnifiedRow],
    booths_doc: dict[str, Any],
) -> int:
    added = 0
    for k, row in rows.items():
        if not form20_key_maps_to_legacy(k, booths_doc):
            continue
        prev = merged.get(k)
        if prev is None or row.confidence > prev[1]:
            if prev is None:
                added += 1
            merged[k] = (row, row.confidence)
    return added


def _coverage(
    merged: dict[str, tuple[Form20UnifiedRow, float]],
    expected: frozenset[int],
) -> tuple[float, frozenset[int]]:
    found: set[int] = set()
    for k in merged:
        try:
            found.add(int(k))
        except ValueError:
            pass
    hit = found & expected
    frac = len(hit) / max(1, len(expected))
    missing = frozenset(expected - found)
    return frac, missing


def _run_easy_passes(
    pdf_path: Path,
    num_candidates: int,
    max_booth: int,
    merged: dict[str, tuple[Form20UnifiedRow, float]],
    booths_doc: dict[str, Any],
    passes: tuple[_EasyPass, ...],
    *,
    allowed_booths: frozenset[int] | None = None,
) -> list[dict[str, Any]]:
    stats: list[dict[str, Any]] = []
    if not _easyocr_available():
        return stats
    for p in passes:
        before = len(merged)
        rows = extract_form20_booths_easyocr(
            pdf_path,
            num_candidates,
            max_booth=max_booth,
            dpi=p.dpi,
            y_bucket=p.y_bucket,
            strictness=p.strictness,
            preprocess=p.preprocess,
            allowed_booths=allowed_booths,
        )
        added = _merge_rows(merged, rows, booths_doc)
        stats.append(
            {
                "pass": p.name,
                "parser": "easyocr",
                "raw": len(rows),
                "added": added,
                "total": len(merged) - before + before,
            }
        )
    return stats


def _run_tesseract_passes(
    pdf_path: Path,
    num_candidates: int,
    max_booth: int,
    merged: dict[str, tuple[Form20UnifiedRow, float]],
    booths_doc: dict[str, Any],
    *,
    allowed_booths: frozenset[int] | None = None,
) -> list[dict[str, Any]]:
    stats: list[dict[str, Any]] = []
    if not _ocr_available():
        return stats
    for name, preprocess, psm in TESSERACT_PASSES:
        before = len(merged)
        rows = _extract_tesseract_pages_fast(
            pdf_path,
            num_candidates,
            max_booth,
            preprocess=preprocess,
            psm=psm,
            allowed_booths=allowed_booths,
        )
        added = _merge_rows(merged, rows, booths_doc)
        stats.append(
            {
                "pass": name,
                "parser": "tesseract",
                "raw": len(rows),
                "added": added,
                "total_keys": len(merged),
            }
        )
        _ = before
    return stats


def extract_form20_booths_ensemble(
    pdf_path: Path,
    num_candidates: int,
    booths_doc: dict[str, Any],
    *,
    max_booth: int | None = None,
    allowed_booths: frozenset[int] | None = None,
    use_surya: bool = True,
    use_text: bool = True,
) -> tuple[dict[str, Form20UnifiedRow], dict[str, Any]]:
    """Run all parsers and merge by booth_key (legacy-mapped keys only)."""
    booths_list = list(booths_doc.get("booths") or [])
    max_b = max_booth or max(1, len(booths_list)) + 50
    expected = expected_booth_ints(booths_doc)
    merged: dict[str, tuple[Form20UnifiedRow, float]] = {}
    pass_stats: list[dict[str, Any]] = []

    if use_text:
        text_rows = extract_form20_text_strategies(pdf_path, num_candidates)
        if allowed_booths is not None:
            text_rows = {
                k: v
                for k, v in text_rows.items()
                if k.isdigit() and int(k) in allowed_booths
            }
        pass_stats.append(
            {
                "pass": "pdfplumber_pdftotext",
                "parser": "text",
                "raw": len(text_rows),
                "added": _merge_rows(merged, text_rows, booths_doc),
            }
        )

    pass_stats.extend(
        _run_easy_passes(
            pdf_path,
            num_candidates,
            max_b,
            merged,
            booths_doc,
            EASYOCR_PASSES,
            allowed_booths=allowed_booths,
        )
    )
    pass_stats.extend(
        _run_tesseract_passes(
            pdf_path,
            num_candidates,
            max_b,
            merged,
            booths_doc,
            allowed_booths=allowed_booths,
        )
    )

    if use_surya and allowed_booths is None:
        surya_rows = _extract_surya(pdf_path, num_candidates, max_b)
        pass_stats.append(
            {
                "pass": "surya",
                "parser": "surya",
                "raw": len(surya_rows),
                "added": _merge_rows(merged, surya_rows, booths_doc),
            }
        )

    frac, missing = _coverage(merged, expected)
    return (
        {k: v[0] for k, v in merged.items()},
        {
            "passes": pass_stats,
            "nKeys": len(merged),
            "expectedBooths": len(expected),
            "coverageFraction": round(frac, 4),
            "nMissing": len(missing),
        },
    )


def extract_form20_booths_until_full(
    pdf_path: Path,
    num_candidates: int,
    booths_doc: dict[str, Any],
    *,
    max_booth: int | None = None,
    target_fraction: float = 1.0,
    max_rounds: int = 8,
    use_surya: bool = False,
) -> tuple[dict[str, Form20UnifiedRow], dict[str, Any]]:
    """
    Repeated ensemble extraction until legacy booth numbers reach target_fraction.
    """
    expected = expected_booth_ints(booths_doc)
    merged: dict[str, tuple[Form20UnifiedRow, float]] = {}
    rounds: list[dict[str, Any]] = []

    rows, meta0 = extract_form20_booths_ensemble(
        pdf_path,
        num_candidates,
        booths_doc,
        max_booth=max_booth,
        allowed_booths=None,
        use_surya=use_surya,
        use_text=True,
    )
    for k, row in rows.items():
        merged[k] = (row, row.confidence)
    frac, missing = _coverage(merged, expected)
    rounds.append({"round": 0, "phase": "ensemble", **meta0, "coverage": frac, "nMissing": len(missing)})

    for r in range(1, max_rounds + 1):
        if frac >= target_fraction or not missing:
            break
        before_keys = len(merged)
        pass_stats: list[dict[str, Any]] = []
        pass_stats.extend(
            _run_easy_passes(
                pdf_path,
                num_candidates,
                (max_booth or len(expected) + 50),
                merged,
                booths_doc,
                MISSING_RETRY_PASSES,
                allowed_booths=missing,
            )
        )
        pass_stats.extend(
            _run_tesseract_passes(
                pdf_path,
                num_candidates,
                (max_booth or len(expected) + 50),
                merged,
                booths_doc,
                allowed_booths=missing,
            )
        )
        frac, missing = _coverage(merged, expected)
        rounds.append(
            {
                "round": r,
                "phase": "missing_retry",
                "passes": pass_stats,
                "added": len(merged) - before_keys,
                "coverage": frac,
                "nMissing": len(missing),
            }
        )
        if len(merged) == before_keys:
            break

    return (
        {k: v[0] for k, v in merged.items()},
        {
            "rounds": rounds,
            "finalCoverage": round(frac, 4),
            "nMissing": len(missing),
            "nKeys": len(merged),
            "expectedBooths": len(expected),
        },
    )
