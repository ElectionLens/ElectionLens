#!/usr/bin/env python3
"""
Restore honest booth/postal split for TN 2026: strip synthetic residual_booth_fill,
reconcile postal to official totals, and attach dataQuality metadata.

  python3 scripts/tn_2026_restore_honest_booths.py --all --write
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
from tn_2026_reconcile_votes import restore_honest_booth_postal_split


def main() -> None:
    ap = argparse.ArgumentParser(description="Strip synthetic booth fill; restore postal + dataQuality")
    ap.add_argument("--ac", help="Comma-separated TN-NNN")
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--write", action="store_true")
    ap.add_argument("--cache-dir", type=Path, default=REPO_ROOT / "scripts/cache/tn-2026-form20")
    args = ap.parse_args()
    if not args.ac and not args.all:
        ap.error("Specify --ac or --all")

    ac_map = load_schema_tn_ac_map()
    elec = load_tn_2026_elections()
    if args.all:
        targets = sorted(ac_map.keys())
    else:
        targets = []
        for part in args.ac.split(","):
            m = re.match(r"^TN-(\d{3})$", part.strip(), re.I)
            if not m:
                ap.error(f"Bad --ac {part}")
            targets.append(int(m.group(1)))

    ok = skip = 0
    total_stripped = 0
    for ac_no in targets:
        ac_id = ac_map[ac_no]["schemaId"]
        bpath = BOOTHS_TN / ac_id / "booths.json"
        rpath = BOOTHS_TN / ac_id / "2026.json"
        if not bpath.exists() or not rpath.exists():
            skip += 1
            continue
        econ = elec.get(ac_id) or {}
        if not econ.get("candidates"):
            skip += 1
            continue

        booths_doc = json.loads(bpath.read_text(encoding="utf-8"))
        doc = json.loads(rpath.read_text(encoding="utf-8"))
        pdf_path = args.cache_dir / f"AC{ac_no:03d}_f20.pdf"
        form20_postal = None
        if pdf_path.exists():
            try:
                form20_postal = extract_form20_postal_votes(pdf_path, doc.get("candidates") or [])
            except Exception as exc:
                print(f"{ac_id}: WARN postal extract failed: {exc}", file=sys.stderr)
        stripped, strict_ok, quality = restore_honest_booth_postal_split(
            doc, econ, booths_doc, form20_postal=form20_postal
        )
        total_stripped += stripped
        ok += 1
        print(
            f"{ac_id}: stripped={stripped} tier={quality['tier']} "
            f"form20={quality['form20ParsedBooths']}/{quality['totalBooths']} "
            f"postal={quality['postalPct']}% unmapped={quality['unmappedPct']}% "
            f"strict={'OK' if strict_ok else 'FAIL'}"
        )
        if args.write:
            rpath.write_text(json.dumps(doc, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    print(f"Done: updated={ok} skip={skip} booths_stripped={total_stripped}")


if __name__ == "__main__":
    main()
