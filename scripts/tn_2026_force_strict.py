#!/usr/bin/env python3
"""
Force every TN 2026 2026.json to strict-match public/data/elections/ac/TN/2026.json.

Adjusts postal (and booth columns when over-counted) so booth_sum + postal == official
per candidate. Drops OCR-only result ids not in booths.json.

  python3 scripts/tn_2026_force_strict.py --all --in-scope-230 --write
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

from tn_2026_accuracy_report import strict_deltas_for_ac
from tn_2026_booth_common import (
    BOOTHS_TN,
    REPO_ROOT,
    filter_in_scope_ac_nos,
    load_schema_tn_ac_map,
    load_tn_2026_elections,
)
from tn_2026_form20_coverage import phase_a_ok
from tn_2026_reconcile_votes import force_strict_to_elections


def main() -> None:
    ap = argparse.ArgumentParser(description="Force strict elections match on all TN 2026 booth JSON")
    ap.add_argument("--ac", help="Comma-separated TN-NNN")
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--in-scope-230", action="store_true")
    ap.add_argument("--write", action="store_true")
    ap.add_argument("--dry-run", action="store_true", help="Report only (default if no --write)")
    args = ap.parse_args()
    if not args.ac and not args.all:
        ap.error("Specify --ac or --all")

    ac_map = load_schema_tn_ac_map()
    elec = load_tn_2026_elections()

    if args.all:
        targets = filter_in_scope_ac_nos(
            sorted(ac_map.keys()),
            in_scope_230=args.in_scope_230,
            skip_ocr=False,
        )
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
        bpath = BOOTHS_TN / ac_id / "booths.json"
        rpath = BOOTHS_TN / ac_id / "2026.json"
        if not bpath.exists() or not rpath.exists():
            print(f"{ac_id}: skip (missing booths.json or 2026.json)", file=sys.stderr)
            skip += 1
            continue
        econ = elec.get(ac_id) or {}
        if not econ.get("candidates"):
            print(f"{ac_id}: skip (no elections candidates)", file=sys.stderr)
            skip += 1
            continue

        booths_doc = json.loads(bpath.read_text(encoding="utf-8"))
        doc = json.loads(rpath.read_text(encoding="utf-8"))
        n_extra = len((doc.get("results") or {})) - len(
            {b["id"] for b in booths_doc.get("booths", []) if b.get("id")}
        )

        applied, max_d = force_strict_to_elections(doc, econ, booths_doc)
        strict_ok, max_after, _, miss_b = strict_deltas_for_ac(booths_doc, doc, econ)
        pa_ok, missing, extra = phase_a_ok(booths_doc, doc)

        status = "ok" if applied and strict_ok else "fail"
        if status == "ok":
            ok += 1
        else:
            fail += 1
        print(
            f"{ac_id}: {status} maxDelta={max_after} phaseA={pa_ok} "
            f"droppedExtra~{max(0, n_extra)} missing={len(missing)} extra={len(extra)}"
        )

        if args.write and status == "ok":
            rpath.write_text(json.dumps(doc, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    print(f"Force strict: ok={ok} fail={fail} skip={skip}")


if __name__ == "__main__":
    main()
