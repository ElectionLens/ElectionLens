#!/usr/bin/env python3
"""
Re-extract TN 2026 booth votes from Form20 PDFs; target 100% legacy booth coverage.

Merges multiple Form20 strategies, strict-reconciles to elections totals, then
distributes postal residuals onto still-empty booths.

  python3 scripts/tn_2026_reextract_low_booths.py --all --in-scope-230 --write --min-coverage 1.0
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

_SCRIPTS_DIR = Path(__file__).resolve().parent
if str(_SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS_DIR))

from tn_2026_booth_common import (
    BOOTHS_TN,
    REPO_ROOT,
    SKIP_FORM20_OCR_AC_NOS,
    filter_in_scope_ac_nos,
    load_schema_tn_ac_map,
    load_tn_2026_elections,
)
from tn_2026_form20_2026 import _form20_pdf_probably_image_only
from tn_2026_form20_coverage import legacy_booth_ids
from tn_2026_form20_orchestrator import (
    DEFAULT_STRATEGY_LADDER,
    Form20Strategy,
    assemble_2026_json_doc,
    extract_form20_merged,
)
from tn_2026_reconcile_votes import finalize_doc_booth_coverage


def _legacy_nonzero_count(doc: dict, booths_doc: dict) -> int:
    legacy = legacy_booth_ids(booths_doc)
    results = doc.get("results") or {}
    n = 0
    for bid in legacy:
        rv = results.get(bid) or {}
        if rv.get("sourceNote") == "no_form20_row":
            continue
        if sum(int(v or 0) for v in rv.get("votes") or []) > 0:
            n += 1
    return n


def _coverage(doc: dict, booths_doc: dict) -> float:
    legacy = legacy_booth_ids(booths_doc)
    if not legacy:
        return 0.0
    return _legacy_nonzero_count(doc, booths_doc) / len(legacy)


def reextract_ac_doc(
    ac_id: str,
    ac_no: int,
    *,
    cache_dir: Path,
    try_ocr: bool,
    include_skipped_ocr: bool,
    fill_empty_from_postal: bool,
) -> tuple[dict | None, int, str]:
    """Return (doc, legacy_nonzero_count, strategy_summary)."""
    bpath = BOOTHS_TN / ac_id / "booths.json"
    pdf_path = cache_dir / f"AC{ac_no:03d}_f20.pdf"
    if not bpath.exists() or not pdf_path.exists():
        return None, 0, ""

    ac_map = load_schema_tn_ac_map()
    row = ac_map.get(ac_no)
    if not row:
        return None, 0, ""
    econ = load_tn_2026_elections().get(ac_id) or {}
    cands = econ.get("candidates") or []
    if not cands:
        return None, 0, ""

    booths_doc = json.loads(bpath.read_text(encoding="utf-8"))
    image_only = _form20_pdf_probably_image_only(pdf_path)

    strategies: list[Form20Strategy] = list(DEFAULT_STRATEGY_LADDER)
    if not try_ocr:
        strategies = [s for s in strategies if not s.ocr_fallback]
    if ac_no in SKIP_FORM20_OCR_AC_NOS and not include_skipped_ocr:
        strategies = [s for s in strategies if not s.ocr_fallback]

    by_booth: dict = {}
    postal = None
    date_s = ""
    used: list[str] = []

    for strat in strategies:
        if strat.ocr_fallback and not image_only and strat.name.startswith("ocr"):
            # Tesseract full-PDF is slow on text PDFs; unified strategies usually win.
            continue
        try:
            bb, post, ds, _names, meta = extract_form20_merged(
                pdf_path,
                cands,
                booths_doc,
                allow_extra_pdf_columns=strat.allow_extra_pdf_columns,
                unified_fallback=strat.unified_fallback,
                unified_gap_threshold=strat.unified_gap_threshold,
                ocr_fallback=strat.ocr_fallback,
                ocr_overwrite=strat.ocr_overwrite,
                use_surya=False,
                strategy_name=strat.name,
            )
        except Exception:
            continue
        added = 0
        for k, v in bb.items():
            if k not in by_booth:
                by_booth[k] = v
                added += 1
        if added:
            used.append(f"{strat.name}+{added}")
        if post:
            postal = post
        if ds:
            date_s = ds

    if not by_booth:
        return None, 0, ""

    doc = assemble_2026_json_doc(
        ac_id,
        row,
        econ,
        cands,
        by_booth,
        date_s,
        postal,
        f"file://{pdf_path.resolve()}",
        booths_doc,
    )
    finalize_doc_booth_coverage(
        doc,
        econ,
        booths_doc,
        fill_empty_from_postal=fill_empty_from_postal,
    )
    summary = ",".join(used) if used else "merged"
    return doc, _legacy_nonzero_count(doc, booths_doc), summary


def main() -> None:
    ap = argparse.ArgumentParser(description="Re-extract TN 2026 booth JSON toward 100% coverage")
    ap.add_argument("--ac", help="Comma-separated TN-NNN")
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--in-scope-230", action="store_true")
    ap.add_argument("--write", action="store_true")
    ap.add_argument(
        "--min-coverage",
        type=float,
        default=1.0,
        help="Re-extract if legacy booth vote coverage is below this (default 1.0 = 100%%)",
    )
    ap.add_argument("--try-ocr", action="store_true", default=True)
    ap.add_argument("--no-try-ocr", action="store_false", dest="try_ocr")
    ap.add_argument(
        "--include-skipped-ocr",
        action="store_true",
        help="Run OCR ladder on TN-152..159 (slow)",
    )
    ap.add_argument(
        "--no-fill-residual",
        action="store_false",
        dest="fill_empty_from_postal",
        default=True,
        help="Do not distribute postal onto empty booths",
    )
    ap.add_argument("--cache-dir", type=Path, default=REPO_ROOT / "scripts/cache/tn-2026-form20")
    args = ap.parse_args()
    if not args.ac and not args.all:
        ap.error("Specify --ac or --all")

    ac_map = load_schema_tn_ac_map()
    if args.all:
        targets = filter_in_scope_ac_nos(sorted(ac_map.keys()), in_scope_230=args.in_scope_230, skip_ocr=False)
    else:
        targets = []
        for part in args.ac.split(","):
            m = re.match(r"^TN-(\d{3})$", part.strip(), re.I)
            if not m:
                ap.error(f"Bad --ac {part}")
            targets.append(int(m.group(1)))

    ok = skip = fail = 0
    for ac_no in targets:
        ac_id = ac_map[ac_no]["schemaId"]
        rpath = BOOTHS_TN / ac_id / "2026.json"
        bpath = BOOTHS_TN / ac_id / "booths.json"
        if not bpath.exists():
            skip += 1
            continue

        booths_doc = json.loads(bpath.read_text(encoding="utf-8"))
        n_legacy = len(legacy_booth_ids(booths_doc))
        if rpath.exists():
            prev_doc = json.loads(rpath.read_text(encoding="utf-8"))
            prev_nz = _legacy_nonzero_count(prev_doc, booths_doc)
            prev_cov = _coverage(prev_doc, booths_doc)
        else:
            prev_doc = None
            prev_nz = 0
            prev_cov = 0.0
        if prev_cov >= args.min_coverage - 1e-9:
            skip += 1
            continue

        doc, new_nz, summary = reextract_ac_doc(
            ac_id,
            ac_no,
            cache_dir=args.cache_dir,
            try_ocr=args.try_ocr,
            include_skipped_ocr=args.include_skipped_ocr,
            fill_empty_from_postal=args.fill_empty_from_postal,
        )
        new_cov = new_nz / max(1, n_legacy) if doc else prev_cov
        if doc is None or new_cov <= prev_cov + 1e-9:
            fail += 1
            print(f"{ac_id}: no gain ({prev_nz}/{n_legacy})", file=sys.stderr)
            continue

        ok += 1
        print(
            f"{ac_id}: {summary} {prev_nz}->{new_nz}/{n_legacy} "
            f"({100*prev_cov:.0f}%->{100*new_cov:.0f}%)"
        )
        if args.write:
            rpath.write_text(json.dumps(doc, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    print(f"Re-extract: improved={ok} skip={skip} no_gain={fail}")


if __name__ == "__main__":
    main()
