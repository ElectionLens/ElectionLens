#!/usr/bin/env python3
"""
Booth-level accuracy audit for TN 2026: structure, AC totals, extraction quality.

  python3 scripts/tn_2026_verify_booth_accuracy.py --all
  python3 scripts/tn_2026_verify_booth_accuracy.py --all --json scripts/cache/tn-2026-booth-accuracy.json
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

_SCRIPTS_DIR = Path(__file__).resolve().parent
if str(_SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS_DIR))

from tn_2026_accuracy_report import strict_deltas_for_ac
from tn_2026_booth_common import BOOTHS_TN, REPO_ROOT, load_schema_tn_ac_map, load_tn_2026_elections
from tn_2026_form20_coverage import legacy_booth_ids, phase_a_ok


def audit_ac(ac_id: str, booths_doc: dict, res_doc: dict, econ: dict) -> dict:
    legacy = legacy_booth_ids(booths_doc)
    results = res_doc.get("results") or {}
    n_legacy = len(legacy)

    pa_ok, missing, extra = phase_a_ok(booths_doc, res_doc)
    strict_ok, max_d, mism, miss_b = strict_deltas_for_ac(booths_doc, res_doc, econ)

    parsed = residual = zero_fill = empty = 0
    booth_vote_sum = 0
    for bid in legacy:
        rv = results.get(bid) or {}
        note = rv.get("sourceNote")
        vsum = sum(int(v or 0) for v in rv.get("votes") or [])
        booth_vote_sum += vsum
        if note == "no_form20_row" or vsum == 0:
            if note == "no_form20_row":
                zero_fill += 1
            else:
                empty += 1
        elif note == "residual_booth_fill":
            residual += 1
        else:
            parsed += 1

    ecands = econ.get("candidates") or []
    official_total = sum(int(c.get("votes") or 0) for c in ecands)
    postal_sum = sum(
        int(pc.get("postal") or 0)
        for pc in (res_doc.get("postal") or {}).get("candidates") or []
    )

    return {
        "acId": ac_id,
        "nLegacyBooths": n_legacy,
        "phaseAOk": pa_ok,
        "nMissingBoothIds": len(missing),
        "nExtraResultIds": len(extra),
        "strictAcTotalsOk": strict_ok,
        "maxAbsDelta": max_d,
        "nCandidateMismatches": len(mism),
        "boothsParsedForm20": parsed,
        "boothsResidualFill": residual,
        "boothsZeroFill": zero_fill,
        "boothsEmptyNoNote": empty,
        "boothVoteSum": booth_vote_sum,
        "postalSum": postal_sum,
        "electionsOfficialTotal": official_total,
        "boothCoveragePct": round(100 * (parsed + residual) / max(1, n_legacy), 2),
        "parsedForm20Pct": round(100 * parsed / max(1, n_legacy), 2),
        "residualFillPct": round(100 * residual / max(1, n_legacy), 2),
        "reconciledToElections": bool(res_doc.get("reconciledToElections")),
    }


def main() -> None:
    ap = argparse.ArgumentParser(description="TN 2026 booth-level accuracy audit")
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--json", type=Path, help="Write JSON report")
    ap.add_argument("--ci", action="store_true", help="Exit 1 if strict/phaseA failures")
    args = ap.parse_args()
    if not args.all:
        ap.error("Use --all")

    ac_map = load_schema_tn_ac_map()
    elec = load_tn_2026_elections()
    rows: list[dict] = []
    missing_json: list[str] = []

    for ac_no in sorted(ac_map.keys()):
        ac_id = ac_map[ac_no]["schemaId"]
        bpath = BOOTHS_TN / ac_id / "booths.json"
        rpath = BOOTHS_TN / ac_id / "2026.json"
        if not bpath.exists() or not rpath.exists():
            if not rpath.exists():
                missing_json.append(ac_id)
            continue
        booths_doc = json.loads(bpath.read_text(encoding="utf-8"))
        res_doc = json.loads(rpath.read_text(encoding="utf-8"))
        econ = elec.get(ac_id) or {}
        if not econ.get("candidates"):
            continue
        rows.append(audit_ac(ac_id, booths_doc, res_doc, econ))

    n = len(rows)
    phase_a_ok = sum(1 for r in rows if r["phaseAOk"])
    strict_ok = sum(1 for r in rows if r["strictAcTotalsOk"])
    full_booth_votes = sum(
        1
        for r in rows
        if r["boothsParsedForm20"] + r["boothsResidualFill"] == r["nLegacyBooths"]
        and r["boothsZeroFill"] == 0
    )
    all_parsed_only = sum(
        1 for r in rows if r["boothsParsedForm20"] == r["nLegacyBooths"] and r["boothsResidualFill"] == 0
    )
    any_residual = sum(1 for r in rows if r["boothsResidualFill"] > 0)
    total_booths = sum(r["nLegacyBooths"] for r in rows)
    total_parsed = sum(r["boothsParsedForm20"] for r in rows)
    total_residual = sum(r["boothsResidualFill"] for r in rows)

    summary = {
        "constituenciesAudited": n,
        "missing2026Json": missing_json,
        "phaseAOk": phase_a_ok,
        "strictAcTotalsOk": strict_ok,
        "allBoothsHaveVotes": full_booth_votes,
        "allBoothsForm20ParsedOnly": all_parsed_only,
        "constituenciesWithResidualFill": any_residual,
        "totalLegacyBooths": total_booths,
        "totalBoothsForm20Parsed": total_parsed,
        "totalBoothsResidualFill": total_residual,
        "parsedForm20PctOfBooths": round(100 * total_parsed / max(1, total_booths), 2),
        "residualFillPctOfBooths": round(100 * total_residual / max(1, total_booths), 2),
        "rates": {
            "phaseAOk": round(phase_a_ok / max(1, n), 4),
            "strictAcTotalsOk": round(strict_ok / max(1, n), 4),
            "allBoothsHaveVotes": round(full_booth_votes / max(1, n), 4),
            "allBoothsForm20ParsedOnly": round(all_parsed_only / max(1, n), 4),
        },
        "below100BoothVotes": [
            r["acId"]
            for r in rows
            if r["boothsParsedForm20"] + r["boothsResidualFill"] < r["nLegacyBooths"]
        ],
        "strictFailures": [
            {"acId": r["acId"], "maxAbsDelta": r["maxAbsDelta"], "nMismatches": r["nCandidateMismatches"]}
            for r in rows
            if not r["strictAcTotalsOk"]
        ],
        "phaseAFailures": [
            {"acId": r["acId"], "missing": r["nMissingBoothIds"], "extra": r["nExtraResultIds"]}
            for r in rows
            if not r["phaseAOk"]
        ],
        "perAc": rows,
    }

    print("TN 2026 booth-level accuracy audit")
    print(json.dumps({k: v for k, v in summary.items() if k != "perAc"}, indent=2))
    print()
    print(f"AC totals (strict):     {strict_ok}/{n} pass")
    print(f"Phase A (booth ids):    {phase_a_ok}/{n} pass")
    print(f"All booths have votes:  {full_booth_votes}/{n} ACs")
    print(f"Form20-parsed only:     {all_parsed_only}/{n} ACs (true booth-level accuracy)")
    print(f"Booth rows parsed:      {total_parsed:,}/{total_booths:,} ({summary['parsedForm20PctOfBooths']}%)")
    print(f"Booth rows residual:    {total_residual:,} ({summary['residualFillPctOfBooths']}%) — distributed from postal, not Form20")
    if summary["below100BoothVotes"]:
        print(f"Below 100% booth votes: {', '.join(summary['below100BoothVotes'])}")
    if missing_json:
        print(f"No 2026.json: {', '.join(missing_json)}")

    if args.json:
        args.json.parent.mkdir(parents=True, exist_ok=True)
        args.json.write_text(json.dumps(summary, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        print(f"Wrote {args.json}")

    if args.ci and (strict_ok < n or phase_a_ok < n or summary["below100BoothVotes"]):
        sys.exit(1)


if __name__ == "__main__":
    main()
