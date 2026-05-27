#!/usr/bin/env python3
"""Print TN 2026 dataQuality summary from 2026.json files."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

_SCRIPTS_DIR = Path(__file__).resolve().parent
if str(_SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS_DIR))

from tn_2026_booth_common import BOOTHS_TN, REPO_ROOT, load_schema_tn_ac_map


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--json", type=Path, help="Write JSON report")
    args = ap.parse_args()

    ac_map = load_schema_tn_ac_map()
    tiers: dict[str, int] = {}
    rows: list[dict] = []
    postal_pcts: list[float] = []
    unmapped_pcts: list[float] = []

    for ac_no in sorted(ac_map.keys()):
        ac_id = ac_map[ac_no]["schemaId"]
        rpath = BOOTHS_TN / ac_id / "2026.json"
        if not rpath.exists():
            continue
        q = json.loads(rpath.read_text(encoding="utf-8")).get("dataQuality") or {}
        tier = q.get("tier", "unknown")
        tiers[tier] = tiers.get(tier, 0) + 1
        postal_pcts.append(float(q.get("postalPct") or 0))
        unmapped_pcts.append(float(q.get("unmappedPct") or 0))
        rows.append({"acId": ac_id, **q})

    rows.sort(key=lambda r: (r.get("form20ParsedPct") or 0, r.get("acId", "")))
    summary = {
        "constituencies": len(rows),
        "tiers": tiers,
        "postalPct": {
            "median": round(sorted(postal_pcts)[len(postal_pcts) // 2], 2) if postal_pcts else 0,
            "max": round(max(postal_pcts), 2) if postal_pcts else 0,
            "over10pct": sum(1 for p in postal_pcts if p > 10),
        },
        "unmappedPct": {
            "median": round(sorted(unmapped_pcts)[len(unmapped_pcts) // 2], 2) if unmapped_pcts else 0,
            "max": round(max(unmapped_pcts), 2) if unmapped_pcts else 0,
            "over50pct": sum(1 for p in unmapped_pcts if p > 50),
        },
        "lowestForm20Coverage": rows[:15],
        "highestUnmapped": sorted(rows, key=lambda r: -(r.get("unmappedPct") or 0))[:15],
    }

    print(json.dumps({k: v for k, v in summary.items() if k not in ("lowestForm20Coverage", "highestUnmapped")}, indent=2))
    print("\nLowest Form20 booth coverage:")
    for r in summary["lowestForm20Coverage"]:
        print(
            f"  {r['acId']}: form20={r.get('form20ParsedPct')}% "
            f"postal={r.get('postalPct')}% unmapped={r.get('unmappedPct')}%"
        )

    if args.json:
        args.json.parent.mkdir(parents=True, exist_ok=True)
        args.json.write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
        print(f"\nWrote {args.json}")


if __name__ == "__main__":
    main()
