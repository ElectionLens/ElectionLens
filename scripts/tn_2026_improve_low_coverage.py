#!/usr/bin/env python3
"""
Re-extract TN 2026 ACs below a Form20 booth coverage threshold, then refresh postal/unmapped.

  python3 scripts/tn_2026_improve_low_coverage.py --max-form20-pct 80 --write
  python3 scripts/tn_2026_improve_low_coverage.py --ac TN-229,TN-230 --write --force-ocr
  python3 scripts/tn_2026_improve_low_coverage.py --ac TN-152 --write --include-skipped-ocr
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

from tn_2026_booth_common import BOOTHS_TN, REPO_ROOT, load_schema_tn_ac_map
from tn_2026_form20_2026 import extract_form20_postal_votes
from tn_2026_reextract_low_booths import _legacy_nonzero_count, reextract_ac_doc
from tn_2026_reconcile_votes import restore_honest_booth_postal_split


def main() -> None:
    ap = argparse.ArgumentParser(description="Improve TN 2026 ACs with low Form20 booth coverage")
    ap.add_argument("--ac", help="Comma-separated TN-NNN (overrides threshold scan)")
    ap.add_argument(
        "--max-form20-pct",
        type=float,
        default=80.0,
        help="Target ACs with form20ParsedPct below this (default 80)",
    )
    ap.add_argument("--write", action="store_true")
    ap.add_argument("--include-skipped-ocr", action="store_true")
    ap.add_argument(
        "--force-ocr",
        action="store_true",
        help="Run OCR on text PDFs (needed for TN-229..234 style CEO PDFs)",
    )
    ap.add_argument(
        "--skip-above-pct",
        type=float,
        default=50.0,
        help="Without --force-ocr: skip ACs already at or above this Form20 %% (text parser ceiling)",
    )
    ap.add_argument("--cache-dir", type=Path, default=REPO_ROOT / "scripts/cache/tn-2026-form20")
    args = ap.parse_args()

    ac_map = load_schema_tn_ac_map()
    if args.ac:
        targets = []
        for part in args.ac.split(","):
            m = re.match(r"^TN-(\d{3})$", part.strip(), re.I)
            if not m:
                ap.error(f"Bad --ac {part}")
            targets.append(int(m.group(1)))
    else:
        targets = []
        for ac_no in sorted(ac_map.keys()):
            ac_id = ac_map[ac_no]["schemaId"]
            rpath = BOOTHS_TN / ac_id / "2026.json"
            if not rpath.exists():
                continue
            q = json.loads(rpath.read_text(encoding="utf-8")).get("dataQuality") or {}
            if q.get("form20ParsedPct", 100) < args.max_form20_pct:
                targets.append(ac_no)

    improved = skip = 0
    for ac_no in targets:
        ac_id = ac_map[ac_no]["schemaId"]
        bpath = BOOTHS_TN / ac_id / "booths.json"
        rpath = BOOTHS_TN / ac_id / "2026.json"
        if not bpath.exists() or not rpath.exists():
            skip += 1
            continue

        booths_doc = json.loads(bpath.read_text(encoding="utf-8"))
        prev_doc = json.loads(rpath.read_text(encoding="utf-8"))
        prev_q = prev_doc.get("dataQuality") or {}
        prev_nz = _legacy_nonzero_count(prev_doc, booths_doc)
        prev_pct = float(prev_q.get("form20ParsedPct") or 0)

        use_force_ocr = args.force_ocr or prev_pct < 15.0
        if not use_force_ocr and prev_pct >= args.skip_above_pct:
            print(
                f"{ac_id}: skip (form20={prev_pct:.0f}% >= {args.skip_above_pct:.0f}%; "
                "use --force-ocr to re-run OCR)"
            )
            skip += 1
            continue

        doc, new_nz, summary = reextract_ac_doc(
            ac_id,
            ac_no,
            cache_dir=args.cache_dir,
            try_ocr=True,
            include_skipped_ocr=args.include_skipped_ocr,
            fill_empty_from_postal=False,
            force_ocr=use_force_ocr,
        )
        if doc is None:
            print(f"{ac_id}: extract failed", file=sys.stderr)
            skip += 1
            continue

        pdf_path = args.cache_dir / f"AC{ac_no:03d}_f20.pdf"
        form20_postal = None
        if pdf_path.exists():
            try:
                form20_postal = extract_form20_postal_votes(
                    pdf_path, doc.get("candidates") or []
                )
            except Exception as exc:
                print(f"{ac_id}: WARN postal: {exc}", file=sys.stderr)

        from tn_2026_booth_common import load_tn_2026_elections

        econ = load_tn_2026_elections().get(ac_id) or {}
        restore_honest_booth_postal_split(
            doc, econ, booths_doc, form20_postal=form20_postal
        )
        new_pct = doc["dataQuality"]["form20ParsedPct"]
        if new_pct < prev_pct * 0.5:
            print(
                f"{ac_id}: reject regression {prev_pct:.0f}%->{new_pct:.0f}% "
                f"({prev_nz}->{new_nz} booths; keep existing data)"
            )
            continue
        if new_nz <= prev_nz and new_pct <= prev_pct + 0.1:
            print(f"{ac_id}: no gain {prev_pct:.0f}%->{new_pct:.0f}% ({prev_nz}->{new_nz} booths)")
            continue

        improved += 1
        q = doc["dataQuality"]
        print(
            f"{ac_id}: {summary} form20 {prev_pct:.0f}%->{new_pct:.0f}% "
            f"postal={q['postalPct']}% unmapped={q['unmappedPct']}%"
        )
        if args.write:
            rpath.write_text(json.dumps(doc, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    print(f"Improve: updated={improved} skip={skip} scanned={len(targets)}")


if __name__ == "__main__":
    main()
