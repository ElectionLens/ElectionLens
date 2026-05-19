#!/usr/bin/env python3
"""
TN LA 2026 Form20 extraction orchestration: primary Form20 parser + unified text + OCR.

Primary: tn_2026_form20_2026.parse_form20_pdf (header-aware, postal row).
Fallback: form20_unified_strategies (pdfplumber + pdftotext heuristics).
OCR: form20_ocr_strategies (pytesseract / optional Surya).
"""

from __future__ import annotations

import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any

_SCRIPTS_DIR = Path(__file__).resolve().parent
if str(_SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS_DIR))

from form20_ocr_strategies import _easyocr_available, extract_form20_ocr
from form20_unified_strategies import extract_form20_text_strategies, unified_rows_to_form20_records
from tn_2026_form20_2026 import (
    _form20_pdf_probably_image_only,
    assemble_2026_json_doc,
    extract_form20_postal_votes,
    parse_form20_pdf,
    resolve_booth_metas_for_form20_key,
)
from tn_2026_form20_coverage import (
    count_legacy_booths_mapped,
    form20_key_maps_to_legacy,
    legacy_booth_ids,
    phase_a_ok,
)


@dataclass(frozen=True)
class Form20Strategy:
    name: str = "primary"
    allow_extra_pdf_columns: bool = False
    unified_fallback: bool = False
    unified_gap_threshold: float = 0.85
    ocr_fallback: bool = False
    ocr_overwrite: bool = False
    use_surya: bool = True


DEFAULT_STRATEGY_LADDER: list[Form20Strategy] = [
    Form20Strategy("primary", False, False, 0.85, False),
    Form20Strategy("unified_85", False, True, 0.85, False),
    Form20Strategy("unified_50_extra", True, True, 0.50, False),
    Form20Strategy("ocr", False, True, 0.50, True),
    Form20Strategy("ocr_extra", True, True, 0.50, True),
]


def _merge_unified_or_ocr(
    by_booth: dict[str, dict[str, Any]],
    uni_recs: dict[str, dict[str, Any]],
    booths_doc: dict[str, Any],
    *,
    overwrite: bool,
) -> int:
    added = 0
    if len(by_booth) == 0 or overwrite:
        for k, rec in uni_recs.items():
            if not form20_key_maps_to_legacy(k, booths_doc):
                continue
            if overwrite or k not in by_booth:
                by_booth[k] = rec
                added += 1
    else:
        for k, rec in uni_recs.items():
            if k not in by_booth and form20_key_maps_to_legacy(k, booths_doc):
                by_booth[k] = rec
                added += 1
    return added


def _enrich_meta(
    meta: dict[str, Any],
    booths_doc: dict[str, Any],
    by_booth: dict[str, Any],
    doc: dict[str, Any],
) -> None:
    booths_list = list(booths_doc.get("booths") or [])
    n_legacy = len(legacy_booth_ids(booths_doc))
    meta["nForm20Keys"] = len(by_booth)
    meta["nLegacyBoothIds"] = n_legacy
    meta["nMappedLegacyBooths"] = count_legacy_booths_mapped(by_booth, booths_doc)
    meta["mappedLegacyFraction"] = round(meta["nMappedLegacyBooths"] / max(1, n_legacy), 4)
    pa_ok, missing, extra = phase_a_ok(booths_doc, doc)
    meta["phaseAOk"] = pa_ok
    meta["nMissingLegacyBoothIds"] = len(missing)
    meta["nExtraResultIds"] = len(extra)
    meta["sampleMissingLegacyBoothIds"] = missing[:8]
    meta["hasPostal"] = bool((doc.get("postal") or {}).get("candidates"))
    meta["pdfNameColumns"] = meta.get("pdf_name_count")
    meta["electionCandidates"] = len(doc.get("candidates") or [])


def extract_form20_merged(
    pdf_path: Path,
    json_candidates: list[dict[str, Any]],
    booths_doc: dict[str, Any],
    *,
    allow_extra_pdf_columns: bool = False,
    unified_fallback: bool = False,
    unified_gap_threshold: float = 0.85,
    ocr_fallback: bool = False,
    ocr_overwrite: bool = False,
    use_surya: bool = True,
    strategy_name: str | None = None,
) -> tuple[dict[str, dict[str, Any]], list[int] | None, str, list[str], dict[str, Any]]:
    """
    Returns (by_booth keyed by boothNo string, postal_votes, date_s, pdf_names, meta).
    """
    meta: dict[str, Any] = {
        "strategy": strategy_name or "custom",
        "image_only": False,
        "primary_error": None,
        "primary_n": 0,
        "unified_rows_raw": 0,
        "unified_added": 0,
        "unified_ran": False,
        "ocr_rows_raw": 0,
        "ocr_added": 0,
        "ocr_ran": False,
        "easyocr_rows_raw": 0,
        "easyocr_added": 0,
        "easyocr_ran": False,
    }
    if _form20_pdf_probably_image_only(pdf_path):
        meta["image_only"] = True

    booths_list = list(booths_doc.get("booths") or [])
    n_expected = max(1, len(legacy_booth_ids(booths_doc)))

    by_booth: dict[str, dict[str, Any]] = {}
    postal: list[int] | None = None
    date_s = ""
    names: list[str] = []

    try:
        names, by_booth, _nota_i, date_s, postal = parse_form20_pdf(
            pdf_path,
            json_candidates,
            allow_extra_pdf_columns=allow_extra_pdf_columns,
        )
    except Exception as e:
        meta["primary_error"] = str(e)
        by_booth = {}

    meta["primary_n"] = len(by_booth)
    meta["pdf_name_count"] = len(names)

    mapped_legacy = count_legacy_booths_mapped(by_booth, booths_doc)
    coverage_frac = mapped_legacy / n_expected

    need_unified = unified_fallback and (
        meta["primary_error"] is not None
        or mapped_legacy < max(3, int(unified_gap_threshold * n_expected))
        or (len(by_booth) == 0 and not meta["image_only"])
    )

    if need_unified and not meta["image_only"]:
        meta["unified_ran"] = True
        n_c = len(json_candidates)
        uni = extract_form20_text_strategies(pdf_path, n_c)
        meta["unified_rows_raw"] = len(uni)
        uni_recs = unified_rows_to_form20_records(uni, n_c)
        meta["unified_added"] = _merge_unified_or_ocr(by_booth, uni_recs, booths_doc, overwrite=False)

    mapped_legacy = count_legacy_booths_mapped(by_booth, booths_doc)
    coverage_frac = mapped_legacy / n_expected

    need_ocr = ocr_fallback and (
        meta["image_only"]
        or mapped_legacy < max(3, int(unified_gap_threshold * n_expected))
        or len(by_booth) == 0
    )

    if need_ocr:
        n_c = len(json_candidates)
        max_booth = max(1, len(booths_list))
        meta["easyocr_ran"] = meta["image_only"] and _easyocr_available()
        meta["ocr_ran"] = True
        ocr_rows = extract_form20_ocr(
            pdf_path,
            n_c,
            max_booth=max_booth + 50,
            use_surya=use_surya,
            image_only=meta["image_only"],
            full_ensemble=meta["image_only"],
            booths_doc=booths_doc,
            target_coverage=1.0 if meta["image_only"] else unified_gap_threshold,
        )
        meta["easyocr_rows_raw"] = sum(
            1 for r in ocr_rows.values() if getattr(r, "source", "") == "ocr_easyocr"
        )
        meta["ocr_rows_raw"] = len(ocr_rows)
        ocr_recs = unified_rows_to_form20_records(ocr_rows, n_c)
        overwrite_ocr = ocr_overwrite or meta["image_only"]
        meta["ocr_added"] = _merge_unified_or_ocr(
            by_booth, ocr_recs, booths_doc, overwrite=overwrite_ocr
        )
        meta["easyocr_added"] = meta["ocr_added"] if meta["easyocr_ran"] else 0

    if postal is None:
        postal = extract_form20_postal_votes(
            pdf_path,
            json_candidates,
            allow_extra_pdf_columns=allow_extra_pdf_columns,
            use_ocr=True,
        )

    meta["nMappedLegacyBooths"] = count_legacy_booths_mapped(by_booth, booths_doc)
    meta["mappedLegacyFraction"] = round(meta["nMappedLegacyBooths"] / n_expected, 4)
    return by_booth, postal, date_s, names, meta


def build_2026_doc_from_pdf(
    ac_id: str,
    schema_row: dict[str, Any],
    econ: dict[str, Any],
    json_candidates: list[dict[str, Any]],
    booths_doc: dict[str, Any],
    pdf_path: Path,
    pdf_source: str,
    *,
    allow_extra_pdf_columns: bool = False,
    unified_fallback: bool = False,
    unified_gap_threshold: float = 0.85,
    ocr_fallback: bool = False,
    ocr_overwrite: bool = False,
    use_surya: bool = True,
    strategy: Form20Strategy | None = None,
) -> tuple[dict[str, Any], dict[str, Any]]:
    """Run merged extraction and assemble 2026.json document."""
    if strategy is not None:
        allow_extra_pdf_columns = strategy.allow_extra_pdf_columns
        unified_fallback = strategy.unified_fallback
        unified_gap_threshold = strategy.unified_gap_threshold
        ocr_fallback = strategy.ocr_fallback
        ocr_overwrite = strategy.ocr_overwrite
        use_surya = strategy.use_surya
        strategy_name = strategy.name
    else:
        strategy_name = "custom"

    by_booth, postal, date_s, _names, meta = extract_form20_merged(
        pdf_path,
        json_candidates,
        booths_doc,
        allow_extra_pdf_columns=allow_extra_pdf_columns,
        unified_fallback=unified_fallback,
        unified_gap_threshold=unified_gap_threshold,
        ocr_fallback=ocr_fallback,
        ocr_overwrite=ocr_overwrite,
        use_surya=use_surya,
        strategy_name=strategy_name,
    )
    doc = assemble_2026_json_doc(
        ac_id,
        schema_row,
        econ,
        json_candidates,
        by_booth,
        date_s,
        postal,
        pdf_source,
        booths_doc,
    )
    _enrich_meta(meta, booths_doc, by_booth, doc)
    return doc, meta
