#!/usr/bin/env python3
"""List TN LA 2026 data gaps: missing 2026.json, partial booth coverage, optional Form20 cache.

  python3 scripts/tn_2026_missing_data_report.py
  python3 scripts/tn_2026_missing_data_report.py --json /tmp/tn_missing.json
"""

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
    ap = argparse.ArgumentParser(description="TN 2026 missing / partial booth data report")
    ap.add_argument(
        "--form20-cache",
        type=Path,
        default=REPO_ROOT / "scripts/cache/tn-2026-form20",
        help="If set, note whether ACnnn_f20.pdf exists",
    )
    ap.add_argument("--json", type=Path, help="Write JSON report")
    args = ap.parse_args()

    ac_map = load_schema_tn_ac_map()
    missing_2026: list[str] = []
    partial: list[dict[str, int | str]] = []
    zero_results: list[str] = []

    for ac_no in sorted(ac_map):
        ac_id = ac_map[ac_no]["schemaId"]
        bpath = BOOTHS_TN / ac_id / "booths.json"
        rpath = BOOTHS_TN / ac_id / "2026.json"
        if not bpath.exists():
            continue
        bdoc = json.loads(bpath.read_text(encoding="utf-8"))
        total_b = int(bdoc.get("totalBooths") or len(bdoc.get("booths", [])))
        if not rpath.exists():
            missing_2026.append(ac_id)
            continue
        rdoc = json.loads(rpath.read_text(encoding="utf-8"))
        n_res = len(rdoc.get("results") or {})
        if n_res == 0:
            zero_results.append(ac_id)
        if total_b and n_res < total_b:
            partial.append(
                {
                    "acId": ac_id,
                    "acNo": ac_no,
                    "issue": "partial_results",
                    "totalBooths": total_b,
                    "nResults": n_res,
                    "missingBoothRows": total_b - n_res,
                }
            )

    missing_detail = [{"acId": ac_id, "acNo": int(ac_id.split("-")[1])} for ac_id in missing_2026]
    if args.form20_cache:
        for d in missing_detail:
            n = d["acNo"]
            d["hasForm20Cache"] = (args.form20_cache / f"AC{n:03d}_f20.pdf").exists()

    print(f"Tamil Nadu ACs in schema: {len(ac_map)}")
    print(f"Missing public/.../2026.json: {len(missing_2026)}")
    if missing_2026:
        print(" ", ", ".join(missing_2026[:50]))
        if len(missing_2026) > 50:
            print(f"  ... and {len(missing_2026) - 50} more")
    print(f"Partial coverage (results < booths.json total): {len(partial)}")
    for p in partial[:30]:
        print(f"  {p['acId']}: {p['nResults']}/{p['totalBooths']} booths in results (−{p['missingBoothRows']})")
    if len(partial) > 30:
        print(f"  ... and {len(partial) - 30} more")
    if zero_results:
        print(f"2026.json with zero booths: {len(zero_results)} → {', '.join(zero_results[:20])}")

    if args.json:
        out = {
            "missing2026Json": missing_detail,
            "partialResults": partial,
            "zeroResultFiles": zero_results,
        }
        args.json.parent.mkdir(parents=True, exist_ok=True)
        args.json.write_text(json.dumps(out, indent=2) + "\n", encoding="utf-8")
        print(f"Wrote {args.json}")


if __name__ == "__main__":
    main()
