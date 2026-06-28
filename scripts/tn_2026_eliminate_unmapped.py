#!/usr/bin/env python3
"""
Move all unmapped vote gaps onto booth rows; keep Form20 postal only.

After this pass: booth_sum + postal == official per candidate; unmapped == 0.

  python3 scripts/tn_2026_eliminate_unmapped.py --all --write
  python3 scripts/tn_2026_eliminate_unmapped.py --ac TN-231 --write
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
from tn_2026_reconcile_votes import (
    finalize_booth_postal_no_unmapped,
    strip_residual_booth_fill,
    strip_unmapped_booth_fill,
)


def main() -> None:
    ap = argparse.ArgumentParser(description="Eliminate unmapped bucket; distribute gaps to booths")
    ap.add_argument("--ac", help="Comma-separated TN-NNN")
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--write", action="store_true")
    ap.add_argument("--cache-dir", type=Path, default=REPO_ROOT / "scripts/cache/tn-2026-form20")
    args = ap.parse_args()
    if not args.ac and not args.all:
        ap.error("Specify --ac or --all")

    ac_map = load_schema_tn_ac_map()
    elec = load_tn_2026_elections()
    targets = sorted(ac_map.keys()) if args.all else []
    if args.ac:
        targets = []
        for part in args.ac.split(","):
            m = re.match(r"^TN-(\d{3})$", part.strip(), re.I)
            if not m:
                ap.error(f"Bad --ac {part}")
            targets.append(int(m.group(1)))

    ok = fail = skip = 0
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
        prev_unmapped = int((doc.get("dataQuality") or {}).get("unmappedVotes") or 0)

        strip_residual_booth_fill(doc, booths_doc)
        strip_unmapped_booth_fill(doc, booths_doc)

        pdf_path = args.cache_dir / f"AC{ac_no:03d}_f20.pdf"
        form20_postal = None
        if pdf_path.exists():
            try:
                form20_postal = extract_form20_postal_votes(pdf_path, doc.get("candidates") or [])
            except Exception as exc:
                print(f"{ac_id}: WARN postal extract: {exc}", file=sys.stderr)

        filled, strict_ok, quality = finalize_booth_postal_no_unmapped(
            doc, econ, booths_doc, form20_postal=form20_postal
        )
        status = "OK" if strict_ok else "FAIL"
        if strict_ok:
            ok += 1
        else:
            fail += 1
        print(
            f"{ac_id}: {status} filled={filled} unmapped {prev_unmapped:,}"
            f"->{quality.get('unmappedVotes', 0):,} "
            f"form20={quality.get('form20ParsedPct')}% postal={quality.get('postalPct')}%"
        )
        if args.write:
            rpath.write_text(json.dumps(doc, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    print(f"Eliminate unmapped: ok={ok} fail={fail} skip={skip}")


if __name__ == "__main__":
    main()
