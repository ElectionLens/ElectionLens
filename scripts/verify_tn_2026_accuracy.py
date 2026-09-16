#!/usr/bin/env python3
"""Verify TN 2026 boothwise data against official AC election totals.

Accuracy here means one thing only: for every AC and every candidate,
    sum(booth votes) + postal votes == official candidate total
and the booth/candidate structures are internally consistent. Anything less is
reported as a failure rather than rounded up to "verified".
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[1]
BOOTH_DIR = REPO_ROOT / "public/data/booths/TN"
OFFICIAL_FILE = REPO_ROOT / "public/data/elections/ac/TN/2026.json"
DEFAULT_OUT = REPO_ROOT / "scripts/cache/tn_2026_accuracy_verification.json"


def normalize(name: str) -> str:
    return re.sub(r"[^a-z0-9]", "", (name or "").lower())


def candidate_totals_from_booths(payload: dict[str, Any]) -> tuple[dict[str, int], list[str]]:
    """Sum booth votes per candidate; also return structural problems found."""
    problems: list[str] = []
    candidates = payload.get("candidates") or []
    names = [c.get("name", "") for c in candidates]
    sums = [0] * len(names)
    for booth_id, result in (payload.get("results") or {}).items():
        votes = result.get("votes") or []
        if len(votes) != len(names):
            problems.append(f"{booth_id}: {len(votes)} vote slots for {len(names)} candidates")
            continue
        for i, value in enumerate(votes):
            sums[i] += int(value or 0)
        # Booth `total` is the polled total: candidate votes plus rejected ballots.
        declared = result.get("total")
        expected = sum(int(v or 0) for v in votes) + int(result.get("rejected") or 0)
        if declared is not None and int(declared) != expected:
            problems.append(f"{booth_id}: booth total {declared} != votes+rejected {expected}")
    return dict(zip(names, sums)), problems


def build_lookup(entries: list[dict[str, Any]], value_key: str) -> dict[str, int]:
    """Map candidate name -> votes.

    Exact names are authoritative because a single AC can legitimately contain
    near-identical names (e.g. `KAMARAJ. S` and `KAMARAJ.S`). Normalized keys are
    only added as a fallback when they are unambiguous, so punctuation differences
    never silently merge two different candidates.
    """
    exact: dict[str, int] = {}
    normalized_counts: dict[str, int] = {}
    for entry in entries:
        name = entry.get("name", "")
        exact[name] = int(entry.get(value_key) or 0)
        normalized_counts[normalize(name)] = normalized_counts.get(normalize(name), 0) + 1
    lookup = dict(exact)
    for entry in entries:
        name = entry.get("name", "")
        key = normalize(name)
        if normalized_counts[key] == 1 and key not in lookup:
            lookup[key] = int(entry.get(value_key) or 0)
    return lookup


def lookup_votes(table: dict[str, int], name: str) -> int | None:
    if name in table:
        return table[name]
    return table.get(normalize(name))


def verify_ac(ac_id: str, official: dict[str, Any]) -> dict[str, Any]:
    booth_file = BOOTH_DIR / ac_id / "2026.json"
    booths_file = BOOTH_DIR / ac_id / "booths.json"
    if not booth_file.exists():
        return {"acId": ac_id, "status": "missing", "reasons": ["no booth 2026.json"]}

    payload = json.loads(booth_file.read_text(encoding="utf-8"))
    reasons: list[str] = []

    booth_sums, structural = candidate_totals_from_booths(payload)
    reasons.extend(structural)

    postal_entries = (payload.get("postal") or {}).get("candidates", [])
    postal_by_name = build_lookup(postal_entries, "postal")
    official_by_name = build_lookup(official.get("candidates") or [], "votes")

    matched = 0
    for name, booth_total in booth_sums.items():
        expected = lookup_votes(official_by_name, name)
        if expected is None:
            reasons.append(f"candidate not in official results: {name}")
            continue
        combined = booth_total + (lookup_votes(postal_by_name, name) or 0)
        if combined != expected:
            reasons.append(f"{name}: booth+postal {combined} != official {expected}")
        else:
            matched += 1

    booth_names = set(booth_sums)
    for entry in official.get("candidates") or []:
        official_name = entry.get("name", "")
        if official_name not in booth_names and normalize(official_name) not in {
            normalize(n) for n in booth_names
        }:
            reasons.append(f"official candidate absent from booth data: {official_name}")

    if booths_file.exists():
        booths = json.loads(booths_file.read_text(encoding="utf-8")).get("booths", [])
        booth_ids = {b.get("id") for b in booths}
        result_ids = set((payload.get("results") or {}).keys())
        if booth_ids != result_ids:
            reasons.append(
                f"booth/result id mismatch: {len(booth_ids)} booths vs {len(result_ids)} results"
            )
    else:
        reasons.append("no booths.json")

    quality = payload.get("dataQuality") or {}
    return {
        "acId": ac_id,
        "status": "exact" if not reasons else "mismatch",
        "boothCount": len(payload.get("results") or {}),
        "candidatesMatched": matched,
        "candidatesTotal": len(booth_sums),
        "declaredTier": quality.get("tier"),
        "form20ParsedPct": quality.get("form20ParsedPct"),
        "source": payload.get("source", ""),
        "reasons": reasons[:10],
        "reasonCount": len(reasons),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    args = parser.parse_args()

    official_all = json.loads(OFFICIAL_FILE.read_text(encoding="utf-8"))
    ac_ids = sorted(k for k in official_all if re.fullmatch(r"TN-\d+", k))
    reports = [verify_ac(ac_id, official_all[ac_id]) for ac_id in ac_ids]

    exact = [r for r in reports if r["status"] == "exact"]
    archive_backed = [r for r in exact if "archive%202" in r.get("source", "")]
    summary = {
        "totalAcs": len(reports),
        "exactMatch": len(exact),
        "mismatch": sum(1 for r in reports if r["status"] == "mismatch"),
        "missing": sum(1 for r in reports if r["status"] == "missing"),
        "exactAndArchiveBacked": len(archive_backed),
        "accuracyPct": round(100.0 * len(exact) / len(reports), 2) if reports else 0.0,
    }

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(
        json.dumps({"summary": summary, "acReports": reports}, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    print(json.dumps(summary, indent=2))
    print(f"Wrote {args.out}")


if __name__ == "__main__":
    main()
