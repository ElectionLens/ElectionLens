#!/usr/bin/env python3
"""
Bring every in-scope AC to phase-A coverage: booths.json ids ↔ 2026.json results.

  python3 scripts/tn_2026_finalize_phase_a.py --all --in-scope-230 --write
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
from tn_2026_form20_coverage import (
    fill_zero_results_for_missing,
    merge_extra_result_ids_into_booths_doc,
    phase_a_ok,
)

EXCLUDED_IN_SCOPE_230: frozenset[int] = frozenset()


def main() -> None:
    ap = argparse.ArgumentParser(description="Finalize phase-A booth ↔ results alignment")
    ap.add_argument("--ac", help="Comma-separated TN-NNN")
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--in-scope-230", action="store_true")
    ap.add_argument("--write", action="store_true")
    args = ap.parse_args()
    if not args.ac and not args.all:
        ap.error("Specify --ac or --all")

    ac_map = load_schema_tn_ac_map()
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

    ok_n = fail_n = 0
    for ac_no in targets:
        ac_id = ac_map[ac_no]["schemaId"]
        bpath = BOOTHS_TN / ac_id / "booths.json"
        rpath = BOOTHS_TN / ac_id / "2026.json"
        if not bpath.exists() or not rpath.exists():
            print(f"{ac_id}: skip (missing booths.json or 2026.json)")
            fail_n += 1
            continue

        booths_doc = json.loads(bpath.read_text(encoding="utf-8"))
        doc = json.loads(rpath.read_text(encoding="utf-8"))

        # Drop duplicate booth ids (keep first); re-key obvious num-only collisions.
        seen_ids: set[str] = set()
        deduped: list[dict] = []
        for row in booths_doc.get("booths") or []:
            bid = str(row.get("id") or "")
            if bid and bid in seen_ids:
                continue
            if bid:
                seen_ids.add(bid)
            deduped.append(row)
        if len(deduped) != len(booths_doc.get("booths") or []):
            booths_doc["booths"] = deduped
            booths_doc["totalBooths"] = len(deduped)

        n_fill = fill_zero_results_for_missing(doc, booths_doc)
        n_booth_add, _ = merge_extra_result_ids_into_booths_doc(booths_doc, doc, ac_id=ac_id)
        pa_ok, missing, extra = phase_a_ok(booths_doc, doc)

        if args.write:
            rpath.write_text(json.dumps(doc, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
            if n_booth_add:
                booths_doc["lastUpdated"] = "2026-05-08"
                bpath.write_text(json.dumps(booths_doc, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

        if pa_ok:
            ok_n += 1
            print(f"{ac_id}: phaseA ok (filled {n_fill} results, +{n_booth_add} booths)")
        else:
            fail_n += 1
            print(
                f"{ac_id}: phaseA FAIL missing={len(missing)} extra={len(extra)} "
                f"(filled {n_fill}, booths+{n_booth_add}) sample miss={missing[:3]} extra={extra[:3]}"
            )

    print(f"Phase A: {ok_n} ok, {fail_n} fail, {len(targets)} ACs")


if __name__ == "__main__":
    main()
