#!/usr/bin/env python3
"""
Verify TN 2026 booths.json vs 2026.json (coverage, vote lengths, sums vs elections JSON).

  python3 scripts/tn_2026_verify_booths_2026.py --ac TN-001
  python3 scripts/tn_2026_verify_booths_2026.py --all
  python3 scripts/tn_2026_verify_booths_2026.py --all --compare-elections
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

_SCRIPTS_DIR = Path(__file__).resolve().parent
if str(_SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS_DIR))

from tn_2026_booth_common import BOOTHS_TN, REPO_ROOT, load_schema_tn_ac_map, load_tn_2026_elections


def main() -> None:
    ap = argparse.ArgumentParser(description="Verify TN 2026 booth metadata vs results")
    ap.add_argument("--ac", help="Comma-separated AC ids")
    ap.add_argument("--all", action="store_true")
    ap.add_argument(
        "--compare-elections",
        action="store_true",
        help="Compare summed booth votes to public/data/elections/ac/TN/2026.json (warn if >1% off)",
    )
    ap.add_argument(
        "--strict-elections",
        action="store_true",
        help="With --compare-elections: require booth_sum + postal == elections votes per candidate (exact)",
    )
    ap.add_argument(
        "--allow-abs",
        type=int,
        default=0,
        help="With --strict-elections: allowed absolute difference vs elections votes (default 0)",
    )
    ap.add_argument("--ci", action="store_true", help="Exit non-zero on any error")
    args = ap.parse_args()
    if not args.ac and not args.all:
        ap.error("Specify --ac or --all")

    ac_map = load_schema_tn_ac_map()
    elec = load_tn_2026_elections()
    if args.all:
        targets = sorted(ac_map.keys())
    else:
        targets = []
        for p in args.ac.split(","):
            p = p.strip().upper()
            if not p.startswith("TN-"):
                print(f"Bad --ac {p}", file=sys.stderr)
                sys.exit(2)
            targets.append(int(p.split("-")[1]))

    errors = 0
    for ac_no in targets:
        row = ac_map.get(ac_no)
        if not row:
            continue
        ac_id = row["schemaId"]
        bpath = BOOTHS_TN / ac_id / "booths.json"
        rpath = BOOTHS_TN / ac_id / "2026.json"
        if not rpath.exists():
            print(f"{ac_id}: ERROR missing 2026.json")
            errors += 1
            continue
        booths = json.loads(bpath.read_text(encoding="utf-8")) if bpath.exists() else None
        res_doc = json.loads(rpath.read_text(encoding="utf-8"))
        results = res_doc.get("results") or {}
        cands = res_doc.get("candidates") or []
        n_c = len(cands)

        if not booths:
            print(f"{ac_id}: ERROR missing booths.json")
            errors += 1
            continue

        booth_ids = {b["id"] for b in booths.get("booths", [])}
        res_ids = set(results.keys())
        missing_res = sorted(booth_ids - res_ids)
        extra_res = sorted(res_ids - booth_ids)
        if missing_res:
            print(f"{ac_id}: ERROR {len(missing_res)} booths in booths.json missing from results (e.g. {missing_res[:5]})")
            errors += 1
        if extra_res:
            print(f"{ac_id}: WARN {len(extra_res)} result keys not in booths.json (e.g. {extra_res[:5]})")

        for bid, rv in results.items():
            votes = rv.get("votes") or []
            if len(votes) != n_c:
                print(f"{ac_id}: ERROR {bid} votes len {len(votes)} != candidates {n_c}")
                errors += 1
            tot = int(rv.get("total", 0))
            rej = int(rv.get("rejected", 0))
            if sum(votes) + rej != tot:
                print(f"{ac_id}: WARN {bid} sum(votes)+rejected={sum(votes)+rej} total={tot}")

        econ = elec.get(ac_id)
        if args.compare_elections and econ:
            ecands = econ.get("candidates") or []
            if len(ecands) != n_c:
                print(f"{ac_id}: WARN elections vs results candidate count {len(ecands)} vs {n_c}")
            sums = [0] * n_c
            for rv in results.values():
                for i, v in enumerate(rv.get("votes") or []):
                    sums[i] += v

            postal_vals: list[int] | None = None
            postal_block = res_doc.get("postal") or {}
            postal_cands = postal_block.get("candidates") or []
            if postal_cands:
                if len(postal_cands) != n_c:
                    print(
                        f"{ac_id}: WARN postal.candidates length {len(postal_cands)} vs candidates {n_c}"
                    )
                postal_vals = []
                for pc in postal_cands[:n_c]:
                    postal_v = int(pc.get("postal") or 0)
                    if postal_v < 0:
                        print(f"{ac_id}: ERROR postal negative for candidate postal={postal_v}")
                        errors += 1
                    postal_vals.append(postal_v)
            unmapped_vals: list[int] | None = None
            unmapped_block = res_doc.get("unmapped") or {}
            unmapped_cands = unmapped_block.get("candidates") or []
            if unmapped_cands:
                unmapped_vals = [int(uc.get("unmapped") or 0) for uc in unmapped_cands[:n_c]]
            for i, ec in enumerate(ecands):
                official = int(ec.get("votes") or 0)
                booth_part = sums[i] if i < len(sums) else 0
                postal_part = 0
                if postal_vals is not None and i < len(postal_vals):
                    postal_part = postal_vals[i]
                unmapped_part = 0
                if unmapped_vals is not None and i < len(unmapped_vals):
                    unmapped_part = unmapped_vals[i]
                got = booth_part + postal_part + unmapped_part
                if args.strict_elections:
                    if abs(got - official) > args.allow_abs:
                        print(
                            f"{ac_id}: ERROR candidate {i} {ec.get('name')}: "
                            f"booth={booth_part} postal={postal_part} unmapped={unmapped_part} "
                            f"sum={got} elections={official}"
                        )
                        errors += 1
                    continue
                if official <= 0:
                    continue
                diff = abs(got - official) / official
                if diff > 0.02:
                    print(
                        f"{ac_id}: WARN candidate {i} {ec.get('name')}: "
                        f"booth_plus_postal={got} elections={official} rel_diff={diff:.4f}"
                    )

        print(f"{ac_id}: OK booths={len(booth_ids)} results={len(res_ids)} candidates={n_c}")

    if args.ci and errors:
        sys.exit(1)


if __name__ == "__main__":
    main()
