#!/usr/bin/env python3
"""Recompute dataQuality + reconciledToElections on existing TN 2026.json files."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

_SCRIPTS_DIR = Path(__file__).resolve().parent
if str(_SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS_DIR))

from tn_2026_booth_common import BOOTHS_TN, load_schema_tn_ac_map, load_tn_2026_elections
from tn_2026_reconcile_votes import compute_booth_data_quality


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true")
    args = ap.parse_args()

    ac_map = load_schema_tn_ac_map()
    elec = load_tn_2026_elections()
    tiers: dict[str, int] = {}
    incomplete: list[str] = []

    for ac_no in sorted(ac_map.keys()):
        ac_id = ac_map[ac_no]["schemaId"]
        rpath = BOOTHS_TN / ac_id / "2026.json"
        bpath = BOOTHS_TN / ac_id / "booths.json"
        if not rpath.exists() or not bpath.exists():
            continue
        doc = json.loads(rpath.read_text(encoding="utf-8"))
        booths_doc = json.loads(bpath.read_text(encoding="utf-8"))
        econ = elec.get(ac_id) or {}
        quality = compute_booth_data_quality(doc, booths_doc, econ)
        doc["dataQuality"] = quality
        doc["reconciledToElections"] = quality["acTotalsReconciled"]
        tier = quality["tier"]
        tiers[tier] = tiers.get(tier, 0) + 1
        if tier == "incomplete":
            incomplete.append(ac_id)
        if args.write:
            rpath.write_text(json.dumps(doc, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    print("Tiers:", tiers)
    if incomplete:
        print(f"incomplete ({len(incomplete)}):", ", ".join(incomplete))
    else:
        print("incomplete: 0")
    if args.write:
        print("Wrote dataQuality to all 2026.json files")


if __name__ == "__main__":
    main()
