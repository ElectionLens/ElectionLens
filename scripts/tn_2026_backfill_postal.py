#!/usr/bin/env python3
"""
Backfill postal vote blocks in public/data/booths/TN/*/2026.json from Form20 PDFs.

  python3 scripts/tn_2026_backfill_postal.py --all --in-scope-230 --write
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

from tn_2026_booth_common import BOOTHS_TN, REPO_ROOT, load_schema_tn_ac_map, load_tn_2026_elections
from tn_2026_form20_2026 import extract_form20_postal_votes

EXCLUDED_IN_SCOPE_230: frozenset[int] = frozenset({213, 214, 217, 218})


def _apply_postal_to_doc(doc: dict, postal: list[int] | None, json_candidates: list[dict]) -> bool:
    if postal is None or len(postal) != len(json_candidates):
        return False
    booth_sums = [0] * len(json_candidates)
    for rv in (doc.get("results") or {}).values():
        for i, v in enumerate(rv.get("votes") or []):
            if i < len(booth_sums):
                booth_sums[i] += int(v or 0)
    doc["postal"] = {
        "candidates": [
            {
                "name": c.get("name", ""),
                "party": c.get("party", ""),
                "postal": postal[i],
                "booth": booth_sums[i],
                "total": booth_sums[i] + postal[i],
            }
            for i, c in enumerate(json_candidates)
        ]
    }
    return True


def main() -> None:
    ap = argparse.ArgumentParser(description="Backfill Form20 postal votes into 2026.json")
    ap.add_argument("--ac", help="Comma-separated TN-NNN")
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--in-scope-230", action="store_true")
    ap.add_argument("--write", action="store_true")
    ap.add_argument("--cache-dir", type=Path, default=REPO_ROOT / "scripts/cache/tn-2026-form20")
    ap.add_argument("--allow-extra-pdf-columns", action="store_true")
    ap.add_argument("--no-ocr", action="store_true", help="Skip OCR fallback for image-only PDFs")
    args = ap.parse_args()
    if not args.ac and not args.all:
        ap.error("Specify --ac or --all")

    ac_map = load_schema_tn_ac_map()
    elec = load_tn_2026_elections()

    if args.all:
        targets = sorted(ac_map.keys())
        if args.in_scope_230:
            targets = [n for n in targets if n not in EXCLUDED_IN_SCOPE_230]
    else:
        targets = []
        for part in args.ac.split(","):
            m = re.match(r"^TN-(\d{3})$", part.strip(), re.I)
            if not m:
                ap.error(f"Bad --ac {part}")
            targets.append(int(m.group(1)))

    ok = fail = skip = 0
    for ac_no in targets:
        row = ac_map[ac_no]
        ac_id = row["schemaId"]
        pdf_path = args.cache_dir / f"AC{ac_no:03d}_f20.pdf"
        rpath = BOOTHS_TN / ac_id / "2026.json"
        bpath = BOOTHS_TN / ac_id / "booths.json"
        if not pdf_path.exists() or not rpath.exists():
            skip += 1
            continue
        econ = elec.get(ac_id) or {}
        cands = econ.get("candidates") or []
        booths_doc = json.loads(bpath.read_text(encoding="utf-8"))
        doc = json.loads(rpath.read_text(encoding="utf-8"))
        try:
            postal = extract_form20_postal_votes(
                pdf_path,
                cands,
                allow_extra_pdf_columns=args.allow_extra_pdf_columns,
                use_ocr=not args.no_ocr,
            )
        except Exception as e:
            print(f"{ac_id}: parse failed: {e}", file=sys.stderr)
            fail += 1
            continue
        if not _apply_postal_to_doc(doc, postal, cands):
            print(f"{ac_id}: no postal row parsed", file=sys.stderr)
            fail += 1
            continue
        ok += 1
        if args.write:
            rpath.write_text(json.dumps(doc, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
            print(f"{ac_id}: wrote postal block ({sum(p for p in postal)} postal votes)")
        else:
            print(f"{ac_id}: dry-run postal ok")

    print(f"Postal backfill: ok={ok} fail={fail} skip={skip}")


if __name__ == "__main__":
    main()
