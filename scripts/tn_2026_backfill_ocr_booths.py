#!/usr/bin/env python3
"""
Re-extract booth votes from Form20 PDFs using multi-parser OCR ensemble (image scans).

  python3 scripts/tn_2026_backfill_ocr_booths.py --image-only-zeros --write
  python3 scripts/tn_2026_backfill_ocr_booths.py --ac TN-152,TN-153 --write --until-full
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

from form20_booth_ensemble import extract_form20_booths_until_full
from form20_unified_strategies import unified_rows_to_form20_records
from tn_2026_booth_common import (
    BOOTHS_TN,
    REPO_ROOT,
    SKIP_FORM20_OCR_AC_NOS,
    filter_in_scope_ac_nos,
    is_skipped_form20_ocr,
    load_schema_tn_ac_map,
    load_tn_2026_elections,
)
from tn_2026_form20_2026 import assemble_2026_json_doc, extract_form20_postal_votes
from tn_2026_form20_coverage import count_legacy_booths_mapped, fill_zero_results_for_missing
from tn_2026_form20_orchestrator import _merge_unified_or_ocr

# TN-151 only; TN-152..159 skipped (see SKIP_FORM20_OCR_AC_NOS).
IMAGE_ONLY_OCR_ACS: tuple[str, ...] = ("TN-151",)


def _booth_votes_nonzero(doc: dict) -> int:
    total = 0
    for rv in (doc.get("results") or {}).values():
        if rv.get("sourceNote") == "no_form20_row":
            continue
        for v in rv.get("votes") or []:
            total += int(v or 0)
    return total


def _ac_all_zero_booth_votes(doc: dict) -> bool:
    return _booth_votes_nonzero(doc) == 0


def _extract_and_build(
    ac_id: str,
    schema_row: dict,
    econ: dict,
    cands: list,
    booths_doc: dict,
    pdf_path: Path,
    *,
    until_full: bool,
    target_fraction: float,
    max_rounds: int,
) -> tuple[dict, dict]:
    n_c = len(cands)
    if until_full:
        rows, emeta = extract_form20_booths_until_full(
            pdf_path,
            n_c,
            booths_doc,
            target_fraction=target_fraction,
            max_rounds=max_rounds,
            use_surya=False,
        )
        meta = {"strategy": "ensemble_until_full", "ensemble": emeta}
    else:
        from form20_booth_ensemble import extract_form20_booths_ensemble

        rows, emeta = extract_form20_booths_ensemble(
            pdf_path, n_c, booths_doc, use_surya=False
        )
        meta = {"strategy": "ensemble", "ensemble": emeta}

    by_booth: dict[str, dict] = {}
    uni_recs = unified_rows_to_form20_records(rows, n_c)
    _merge_unified_or_ocr(by_booth, uni_recs, booths_doc, overwrite=True)

    postal = extract_form20_postal_votes(
        pdf_path,
        cands,
        allow_extra_pdf_columns=True,
        use_ocr=True,
    )
    doc = assemble_2026_json_doc(
        ac_id,
        schema_row,
        econ,
        cands,
        by_booth,
        "",
        postal,
        f"file://{pdf_path.resolve()}",
        booths_doc,
    )
    meta["nMappedLegacyBooths"] = count_legacy_booths_mapped(by_booth, booths_doc)
    meta["nForm20Keys"] = len(by_booth)
    meta["finalCoverage"] = emeta.get("finalCoverage", emeta.get("coverageFraction"))
    return doc, meta


def main() -> None:
    ap = argparse.ArgumentParser(description="Backfill booth votes via multi-parser OCR ensemble")
    ap.add_argument("--ac", help="Comma-separated TN-NNN")
    ap.add_argument("--all-zero", action="store_true", help="Every in-scope AC with zero booth votes")
    ap.add_argument(
        "--image-only-zeros",
        action="store_true",
        help="TN-151 image-only Form20 (152-159 excluded)",
    )
    ap.add_argument("--in-scope-230", action="store_true")
    ap.add_argument("--write", action="store_true")
    ap.add_argument(
        "--until-full",
        action="store_true",
        default=True,
        help="Retry parsers on missing booth numbers until target coverage (default: on)",
    )
    ap.add_argument("--no-until-full", action="store_false", dest="until_full")
    ap.add_argument("--target-fraction", type=float, default=1.0)
    ap.add_argument("--max-rounds", type=int, default=8)
    ap.add_argument("--cache-dir", type=Path, default=REPO_ROOT / "scripts/cache/tn-2026-form20")
    ap.add_argument("--fill-missing-zeros", action="store_true", default=True)
    ap.add_argument("--no-fill-missing-zeros", action="store_false", dest="fill_missing_zeros")
    args = ap.parse_args()

    if not args.ac and not args.all_zero and not args.image_only_zeros:
        ap.error("Specify --ac, --all-zero, or --image-only-zeros")

    ac_map = load_schema_tn_ac_map()
    elec = load_tn_2026_elections()

    if args.image_only_zeros:
        targets = list(IMAGE_ONLY_OCR_ACS)
    elif args.ac:
        targets = []
        for part in args.ac.split(","):
            m = re.match(r"^TN-(\d{3})$", part.strip(), re.I)
            if not m:
                ap.error(f"Bad --ac {part}")
            targets.append(f"TN-{int(m.group(1)):03d}")
    else:
        ac_nos = filter_in_scope_ac_nos(
            sorted(ac_map.keys()),
            in_scope_230=args.in_scope_230,
            skip_ocr=True,
        )
        targets = [ac_map[n]["schemaId"] for n in ac_nos]

    ok = fail = skip = improved = 0
    for ac_id in sorted(targets):
        ac_no = int(ac_id.split("-")[1])
        if is_skipped_form20_ocr(ac_no):
            print(f"{ac_id}: skip (SKIP_FORM20_OCR_AC_NOS)", file=sys.stderr)
            skip += 1
            continue
        if args.all_zero and ac_id not in IMAGE_ONLY_OCR_ACS:
            rpath = BOOTHS_TN / ac_id / "2026.json"
            if not rpath.exists():
                skip += 1
                continue
            doc0 = json.loads(rpath.read_text(encoding="utf-8"))
            if not _ac_all_zero_booth_votes(doc0):
                skip += 1
                continue

        pdf_path = args.cache_dir / f"AC{ac_no:03d}_f20.pdf"
        rpath = BOOTHS_TN / ac_id / "2026.json"
        bpath = BOOTHS_TN / ac_id / "booths.json"
        if not pdf_path.exists() or not bpath.exists():
            print(f"{ac_id}: skip (missing pdf or booths.json)", file=sys.stderr)
            skip += 1
            continue

        schema_row = next((r for r in ac_map.values() if r["schemaId"] == ac_id), None)
        if not schema_row:
            skip += 1
            continue

        econ = elec.get(ac_id) or {}
        cands = econ.get("candidates") or []
        booths_doc = json.loads(bpath.read_text(encoding="utf-8"))
        prev_mapped = 0
        prev_votes = 0
        if rpath.exists():
            prev_doc = json.loads(rpath.read_text(encoding="utf-8"))
            prev_votes = _booth_votes_nonzero(prev_doc)
            prev_mapped = sum(
                1
                for r in (prev_doc.get("results") or {}).values()
                if r.get("sourceNote") != "no_form20_row" and sum(r.get("votes") or []) > 0
            )

        try:
            doc, meta = _extract_and_build(
                ac_id,
                schema_row,
                econ,
                cands,
                booths_doc,
                pdf_path,
                until_full=args.until_full,
                target_fraction=args.target_fraction,
                max_rounds=args.max_rounds,
            )
        except Exception as e:
            print(f"{ac_id}: extract failed: {e}", file=sys.stderr)
            fail += 1
            continue

        if args.fill_missing_zeros:
            fill_zero_results_for_missing(doc, booths_doc)

        new_votes = _booth_votes_nonzero(doc)
        new_mapped = sum(
            1
            for r in (doc.get("results") or {}).values()
            if r.get("sourceNote") != "no_form20_row" and sum(r.get("votes") or []) > 0
        )
        n_legacy = len(booths_doc.get("booths") or [])
        cov = meta.get("finalCoverage", meta.get("nMappedLegacyBooths", 0) / max(1, n_legacy))
        print(
            f"{ac_id}: mapped={meta.get('nMappedLegacyBooths', 0)}/{n_legacy} "
            f"coverage={cov} booths {prev_mapped}->{new_mapped} "
            f"votes {prev_votes}->{new_votes}"
        )

        if new_mapped <= prev_mapped and prev_mapped > 0:
            skip += 1
            continue
        if new_mapped > prev_mapped:
            improved += 1
        ok += 1
        if args.write:
            rpath.parent.mkdir(parents=True, exist_ok=True)
            rpath.write_text(json.dumps(doc, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    print(f"OCR booth backfill: ok={ok} improved={improved} fail={fail} skip={skip}")


if __name__ == "__main__":
    main()
