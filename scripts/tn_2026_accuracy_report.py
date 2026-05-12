#!/usr/bin/env python3
"""
TN LA 2026 booth data: coverage + strict agreement with public/data/elections/ac/TN/2026.json.

  python3 scripts/tn_2026_accuracy_report.py
  python3 scripts/tn_2026_accuracy_report.py --json scripts/cache/tn-2026-accuracy-report.json
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

_SCRIPTS_DIR = Path(__file__).resolve().parent
if str(_SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS_DIR))

from tn_2026_booth_common import (
    BOOTHS_TN,
    REPO_ROOT,
    load_schema_tn_ac_map,
    load_tn_2026_elections,
)


def strict_deltas_for_ac(
    booths_doc: dict,
    res_doc: dict,
    econ: dict,
) -> tuple[bool, int, list[dict], list[str]]:
    """Return (all_match, max_abs_delta, mismatch_details, missing_booth_ids)."""
    results = res_doc.get("results") or {}
    cands = res_doc.get("candidates") or []
    n_c = len(cands)
    ecands = econ.get("candidates") or []
    booth_ids = {b["id"] for b in booths_doc.get("booths", [])}
    res_ids = set(results.keys())
    missing_booths = sorted(booth_ids - res_ids)

    sums = [0] * n_c
    for rv in results.values():
        for i, v in enumerate(rv.get("votes") or []):
            if i < len(sums):
                sums[i] += int(v or 0)
    postal_vals: list[int] | None = None
    postal_block = res_doc.get("postal") or {}
    postal_cands = postal_block.get("candidates") or []
    if postal_cands and len(postal_cands) == n_c:
        postal_vals = [int(pc.get("postal") or 0) for pc in postal_cands[:n_c]]
    max_abs = 0
    mismatches: list[dict] = []
    n_ec = min(len(ecands), n_c)
    for i in range(n_ec):
        official = int(ecands[i].get("votes") or 0)
        booth_part = sums[i] if i < len(sums) else 0
        postal_part = postal_vals[i] if postal_vals and i < len(postal_vals) else 0
        got = booth_part + postal_part
        d = abs(got - official)
        max_abs = max(max_abs, d)
        if d > 0:
            mismatches.append(
                {
                    "candidateIndex": i,
                    "name": ecands[i].get("name", ""),
                    "official": official,
                    "boothSum": booth_part,
                    "postal": postal_part,
                    "absDelta": d,
                }
            )
    full_booth = not missing_booths and not (res_ids - booth_ids)
    all_match = full_booth and len(mismatches) == 0
    return all_match, max_abs, mismatches, missing_booths


def main() -> None:
    ap = argparse.ArgumentParser(description="TN 2026 booth coverage and elections-accuracy report")
    ap.add_argument(
        "--form20-cache",
        type=Path,
        default=REPO_ROOT / "scripts/cache/tn-2026-form20",
    )
    ap.add_argument(
        "--ps-cache",
        type=Path,
        default=REPO_ROOT / "scripts/cache/tn-2026-pslist",
    )
    ap.add_argument("--json", type=Path, help="Write full JSON report")
    args = ap.parse_args()

    ac_map = load_schema_tn_ac_map()
    elec = load_tn_2026_elections()
    n_total = len(ac_map)

    has_2026: list[str] = []
    missing_2026: list[str] = []
    full_booth: list[str] = []
    partial_booth: list[dict] = []
    has_postal: list[str] = []
    strict_ok: list[str] = []
    strict_fail: list[dict] = []
    missing_f20: list[int] = []
    missing_ps: list[int] = []

    for ac_no in sorted(ac_map.keys()):
        row = ac_map[ac_no]
        ac_id = row["schemaId"]
        if not (args.form20_cache / f"AC{ac_no:03d}_f20.pdf").exists():
            missing_f20.append(ac_no)
        if not (args.ps_cache / f"AC{ac_no:03d}_en.pdf").exists():
            missing_ps.append(ac_no)
        if not (BOOTHS_TN / ac_id / "booths.json").exists():
            continue

        bpath = BOOTHS_TN / ac_id / "booths.json"
        rpath = BOOTHS_TN / ac_id / "2026.json"
        booths_doc = json.loads(bpath.read_text(encoding="utf-8"))
        total_b = int(booths_doc.get("totalBooths") or len(booths_doc.get("booths", [])))

        if not rpath.exists():
            missing_2026.append(ac_id)
            continue
        has_2026.append(ac_id)
        res_doc = json.loads(rpath.read_text(encoding="utf-8"))
        n_res = len(res_doc.get("results") or {})
        if total_b and n_res == total_b:
            full_booth.append(ac_id)
        elif total_b:
            partial_booth.append(
                {"acId": ac_id, "totalBooths": total_b, "nResults": n_res, "gap": total_b - n_res}
            )

        postal_cands = (res_doc.get("postal") or {}).get("candidates") or []
        if postal_cands and len(postal_cands) == len(res_doc.get("candidates") or []):
            has_postal.append(ac_id)

        econ = elec.get(ac_id) or {}
        if not econ.get("candidates"):
            continue
        try:
            ok, max_d, mism, miss_b = strict_deltas_for_ac(booths_doc, res_doc, econ)
        except Exception as e:
            strict_fail.append({"acId": ac_id, "error": str(e)})
            continue
        if ok:
            strict_ok.append(ac_id)
        else:
            strict_fail.append(
                {
                    "acId": ac_id,
                    "maxAbsDelta": max_d,
                    "nMismatchedCandidates": len(mism),
                    "nMissingBoothResults": len(miss_b),
                    "sampleMismatches": mism[:5],
                    "sampleMissingBoothIds": miss_b[:5],
                }
            )

    report = {
        "constituenciesInSchema": n_total,
        "hasBoothsJson": sum(1 for n in ac_map if (BOOTHS_TN / ac_map[n]["schemaId"] / "booths.json").exists()),
        "has2026Json": len(has_2026),
        "missing2026Json": missing_2026,
        "fullBoothCoverage": len(full_booth),
        "partialBoothCoverage": len(partial_booth),
        "partialBoothDetails": partial_booth,
        "hasPostalBlock": len(has_postal),
        "strictElectionsMatch": len(strict_ok),
        "strictElectionsFail": len(strict_fail),
        "strictFailDetails": strict_fail,
        "missingForm20CacheAcNo": missing_f20,
        "missingPsEnCacheAcNo": missing_ps,
        "rates": {
            "has2026Json": round(len(has_2026) / n_total, 4),
            "fullBoothCoverage": round(len(full_booth) / n_total, 4),
            "strictElectionsMatch": round(len(strict_ok) / n_total, 4),
        },
    }

    print("TN LA 2026 accuracy / coverage")
    print(json.dumps({k: report[k] for k in report if k not in ("partialBoothDetails", "strictFailDetails")}, indent=2))
    if missing_f20:
        print(f"missing Form20 cache ({len(missing_f20)}): {missing_f20}")
    if missing_ps:
        print(f"missing PS EN cache ({len(missing_ps)}): {missing_ps}")
    print(f"strict pass: {len(strict_ok)}/{n_total}  full booth rows: {len(full_booth)}/{n_total}")

    if args.json:
        args.json.parent.mkdir(parents=True, exist_ok=True)
        args.json.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        print(f"Wrote {args.json}")


if __name__ == "__main__":
    main()
