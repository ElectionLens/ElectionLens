#!/usr/bin/env python3
"""Audit and quarantine TN 2026 booth data against official AC results.

The booth extractor can produce rows that look structurally complete while
candidate columns or summaries are wrong. This script never rewrites raw booth
votes. It only:

* compares booth-column sums with the official AC candidate totals;
* repairs the display summary from the official AC result;
* synchronizes reservation metadata from the canonical schema; and
* marks the booth layer unverified when independent reconciliation fails.

Run a dry audit:
    python scripts/quarantine_tn_2026_booths.py

Apply the safe metadata quarantine:
    python scripts/quarantine_tn_2026_booths.py --write
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
RESULTS = ROOT / "public/data/elections/ac/TN/2026.json"
SCHEMA = ROOT / "public/data/schema.json"
BOOTH_ROOT = ROOT / "public/data/booths/TN"


def read_json(path: Path) -> Any:
    return json.loads(path.read_text())


def official_summary(ac: dict[str, Any]) -> dict[str, Any]:
    candidates = sorted(ac["candidates"], key=lambda row: row.get("votes", 0), reverse=True)
    winner, runner = candidates[:2]
    valid = ac.get("validVotes", 0)
    margin = winner["votes"] - runner["votes"]
    return {
        "totalVoters": ac.get("electors", 0),
        "totalVotes": valid,
        "turnoutPercent": ac.get("turnout", 0),
        "winner": {"name": winner["name"], "party": winner["party"], "votes": winner["votes"]},
        "runnerUp": {"name": runner["name"], "party": runner["party"], "votes": runner["votes"]},
        "margin": margin,
        "marginPercent": round(margin / valid * 100, 2) if valid else 0,
    }


def booth_and_postal_totals(booth: dict[str, Any]) -> dict[str, int]:
    names = [candidate.get("name", "") for candidate in booth.get("candidates", [])]
    sums = [0] * len(names)
    for row in booth.get("results", {}).values():
        for index, value in enumerate(row.get("votes", [])):
            if index < len(sums):
                sums[index] += value or 0

    totals = dict(zip(names, sums))
    for candidate in booth.get("postal", {}).get("candidates", []):
        name = candidate.get("name", "")
        totals[name] = totals.get(name, 0) + (candidate.get("postal", 0) or 0)
    return totals


def booth_diff(booth: dict[str, Any], ac: dict[str, Any]) -> int:
    extracted = booth_and_postal_totals(booth)
    return sum(
        abs(extracted.get(candidate["name"], 0) - candidate.get("votes", 0))
        for candidate in ac["candidates"]
    )


def audit_one(path: Path, ac: dict[str, Any], schema_ac: dict[str, Any], write: bool) -> dict[str, Any]:
    booth = read_json(path)
    diff = booth_diff(booth, ac)
    quality = booth.setdefault("dataQuality", {})
    has_estimates = quality.get("estimatedBooths", 0) > 0
    missing = quality.get("missingBooths", 0) > 0
    totals_reconcile = diff == 0
    invalid = not totals_reconcile
    incomplete_source = has_estimates or missing

    if write:
        # The summary is display metadata, so it must agree with the official
        # AC result even while the booth rows are quarantined.
        booth["summary"] = official_summary(ac)
        booth["acName"] = ac.get("constituencyName", booth.get("acName"))
        quality["tier"] = "incomplete" if invalid else ("partial" if incomplete_source else "verified")
        quality["acTotalsReconciled"] = totals_reconcile
        booth["reconciledToElections"] = totals_reconcile
        if invalid:
            booth["validationNote"] = (
                "2026 booth plus postal totals do not reconcile to the official "
                "AC result. Raw booth rows require Form 20 re-extraction."
            )
        elif incomplete_source:
            booth["validationNote"] = (
                "Booth plus postal totals reconcile to the official AC result, "
                "but some booth rows are estimated or missing. Booth-level "
                "analysis is partial until Form 20 re-extraction is complete."
            )
        else:
            booth.pop("validationNote", None)
        path.write_text(json.dumps(booth, indent=2) + "\n")

    # Keep reservation metadata authoritative in the election result file; the
    # schema is the canonical geography source and is handled by the caller.
    return {
        "ac": path.parent.name,
        "name": ac.get("constituencyName"),
        "candidateDifference": diff,
        "estimatedBooths": quality.get("estimatedBooths", 0),
        "missingBooths": quality.get("missingBooths", 0),
        "invalid": invalid,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--write", action="store_true", help="Apply summary and quality metadata fixes")
    args = parser.parse_args()

    results = read_json(RESULTS)
    schema = read_json(SCHEMA)["assemblyConstituencies"]
    report = []
    for path in sorted(BOOTH_ROOT.glob("TN-*/2026.json")):
        ac_id = path.parent.name
        if ac_id in results:
            report.append(audit_one(path, results[ac_id], schema.get(ac_id, {}), args.write))

    # Synchronize AC reservation metadata without touching vote totals.
    changed_types = 0
    for ac_id, ac in results.items():
        canonical_type = schema.get(ac_id, {}).get("type")
        if canonical_type and ac.get("constituencyType") != canonical_type:
            ac["constituencyType"] = canonical_type
            ac["type"] = canonical_type
            changed_types += 1
    if args.write:
        RESULTS.write_text(json.dumps(results, indent=2) + "\n")

    invalid = [row for row in report if row["invalid"]]
    print(f"Audited booth files: {len(report)}")
    print(f"Files failing validation: {len(invalid)}")
    print(f"Reservation metadata synchronized: {changed_types}")
    if not args.write:
        print("Dry run only. Re-run with --write to apply safe metadata quarantine.")


if __name__ == "__main__":
    main()
