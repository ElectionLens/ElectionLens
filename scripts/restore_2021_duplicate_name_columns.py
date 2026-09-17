#!/usr/bin/env python3
"""Restore booth vote columns clobbered by the 2021 duplicate-name bug.

WHAT WENT WRONG
---------------
`scripts/fix-final-postal-booth-100-percent-2021.py` (commit eba47f73, titled
"Achieve 100% match rate") built its lookup of official results as::

    official_candidates = {c['name']: c for c in ac_data.get('candidates', [])}

A dict keyed by name. Thirteen TN 2021 ACs ran two candidates with the same
normalised name, so the later one silently overwrote the earlier. In Bargur,
ADMK's KRISHNAN A (84,642 votes) was overwritten by an independent also called
KRISHNAN A (107 votes); the script then "corrected" the ADMK booth column down
to 107 and rescaled every row total to match. The result reconciled perfectly
against the wrong target, which is why it was reported as a 100% success.

Downstream, summing per-booth leads claimed the winner led 350 of 350 booths in
a race won 49.2% to 42.8%.

WHY RESTORE RATHER THAN RECOMPUTE
---------------------------------
The votes are genuinely gone from the current files - Bargur's rows sum to
108,417 against an official 197,784 - so they cannot be recovered from within.
Commit 6b6dd162 is the last state before the clobbering, and its columns
reconcile exactly to the official totals for all affected ACs.

TWO CONVENTIONS
---------------
The good commit and the current files disagree about what a booth column means:

    good commit:  sum(booth column)            == official total
    current:      sum(booth column) + postal   == official total

So the good column cannot be copied across verbatim; it is rescaled to leave
room for the current file's postal figure. Only the *clobbered* column is
touched - columns that already reconcile are left exactly as they are, because
rewriting correct data to satisfy a script is how this bug happened in the
first place.

Default is a dry run; pass --write to save.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
BOOTHS = REPO / "public/data/booths/TN"
OFFICIAL = REPO / "public/data/elections/ac/TN/2021.json"

#: Last commit whose booth columns reconcile to the official totals.
GOOD_COMMIT = "6b6dd162"

#: ACs where two candidates share a normalised name (the trigger condition).
AFFECTED = [
    "TN-001", "TN-003", "TN-052", "TN-059", "TN-061", "TN-065",
    "TN-067", "TN-071", "TN-084", "TN-121", "TN-147", "TN-202",
]

#: TN-181 is excluded deliberately. Its current file holds TN-234's booth IDs
#: and a different candidate list entirely - a separate bug that this script is
#: not equipped to fix, and which merging vote arrays would silently entrench.
EXCLUDED = {"TN-181": "booth IDs belong to TN-234; needs its own investigation"}


def normalise(name: str) -> str:
    return (name or "").upper().strip().replace(".", "").replace(",", "")


def load_from_commit(commit: str, ac: str) -> dict | None:
    result = subprocess.run(
        ["git", "show", f"{commit}:public/data/booths/TN/{ac}/2021.json"],
        capture_output=True, text=True, cwd=REPO,
    )
    if result.returncode != 0 or not result.stdout:
        return None
    return json.loads(result.stdout)


def column_sums(data: dict) -> list[int]:
    candidates = data["candidates"]
    sums = [0] * len(candidates)
    for row in data["results"].values():
        for index, votes in enumerate((row.get("votes") or [])[: len(candidates)]):
            sums[index] += votes
    return sums


def find_clobbered(current: dict, official: dict) -> list[int]:
    """Column indices whose booth+postal falls far short of the official total.

    Half is a deliberately loose threshold: the clobbered columns are off by
    two or three orders of magnitude, while healthy columns are exact. Nothing
    legitimately lands in between.
    """
    sums = column_sums(current)
    postal = {
        (normalise(c.get("name")), c.get("party")): c
        for c in (current.get("postal") or {}).get("candidates", [])
    }
    official_by_key: dict[tuple[str, str], list[dict]] = {}
    for c in official["candidates"]:
        official_by_key.setdefault((normalise(c["name"]), c["party"]), []).append(c)

    clobbered = []
    for index, cand in enumerate(current["candidates"]):
        key = (normalise(cand.get("name")), cand.get("party"))
        matches = official_by_key.get(key)
        if not matches or len(matches) > 1:
            continue
        expected = matches[0]["votes"]
        got = sums[index] + (postal.get(key, {}).get("postal") or 0)
        if expected > 0 and got < expected * 0.5:
            clobbered.append(index)
    return clobbered


def rescale(values: list[int], target: int) -> list[int]:
    """Scale a per-booth column so it sums to `target`, preserving shape.

    Largest-remainder apportionment, so the total is exact rather than off by a
    few votes from rounding.
    """
    total = sum(values)
    if total == 0 or target == 0:
        return [0] * len(values)
    scaled = [v * target / total for v in values]
    floored = [int(x) for x in scaled]
    shortfall = target - sum(floored)
    # Hand the remaining votes to the booths with the largest fractional part.
    order = sorted(range(len(values)), key=lambda i: scaled[i] - floored[i], reverse=True)
    for i in order[:shortfall]:
        floored[i] += 1
    return floored


def check(ac: str, restored: dict, official: dict) -> list[str]:
    """Every candidate's booth+postal must equal their official total."""
    problems: list[str] = []
    sums = column_sums(restored)
    postal = {
        (normalise(c.get("name")), c.get("party")): c
        for c in (restored.get("postal") or {}).get("candidates", [])
    }
    official_by_key: dict[tuple[str, str], list[dict]] = {}
    for c in official["candidates"]:
        official_by_key.setdefault((normalise(c["name"]), c["party"]), []).append(c)

    for index, cand in enumerate(restored["candidates"]):
        key = (normalise(cand.get("name")), cand.get("party"))
        matches = official_by_key.get(key)
        if not matches:
            problems.append(f"no official row for {key}")
            continue
        if len(matches) > 1:
            # Name AND party both duplicated - the pair is genuinely
            # indistinguishable, so refuse rather than guess.
            problems.append(f"ambiguous official rows for {key}")
            continue
        expected = matches[0]["votes"]
        got = sums[index] + (postal.get(key, {}).get("postal") or 0)
        if got != expected:
            problems.append(f"{key[1]} {cand.get('name')}: booth+postal {got:,} != official {expected:,}")
    return problems


def restore(ac: str, official: dict, write: bool) -> tuple[bool | None, str]:
    current_path = BOOTHS / ac / "2021.json"
    current = json.loads(current_path.read_text())
    good = load_from_commit(GOOD_COMMIT, ac)
    if good is None:
        return False, "not present in the good commit"

    # Vote arrays are positional, so the candidate lists must agree exactly.
    if [c.get("name") for c in good["candidates"]] != [
        c.get("name") for c in current["candidates"]
    ]:
        return False, "candidate lists differ; positional restore is unsafe"

    missing = set(current["results"]) - set(good["results"])
    if missing:
        return False, f"{len(missing)} current booths absent from the good commit"

    clobbered = find_clobbered(current, official)
    if not clobbered:
        # Having a duplicate name made an AC *eligible* for the bug, not a
        # victim of it - the clobber only bit when the wrong row was also the
        # one the script rescaled against. Healthy files are left untouched.
        return None, "already reconciles; nothing to do"

    postal_by_key = {
        (normalise(c.get("name")), c.get("party")): c
        for c in (current.get("postal") or {}).get("candidates", [])
    }
    official_by_key = {
        (normalise(c["name"]), c["party"]): c for c in official["candidates"]
    }

    restored = json.loads(json.dumps(current))
    booth_ids = list(restored["results"])
    notes = []

    for index in clobbered:
        cand = restored["candidates"][index]
        key = (normalise(cand.get("name")), cand.get("party"))
        target_total = official_by_key[key]["votes"]
        postal_votes = postal_by_key.get(key, {}).get("postal") or 0
        # Current convention: the booth column carries everything except postal.
        booth_target = target_total - postal_votes

        good_column = [
            (good["results"][b].get("votes") or [0] * len(good["candidates"]))[index]
            for b in booth_ids
        ]
        if sum(good_column) == 0:
            return False, f"good commit also has an empty column for {key[1]} {cand.get('name')}"

        # The good column holds the real per-booth *shape*; rescale it to sit in
        # the current convention rather than copying its absolute values.
        new_column = rescale(good_column, booth_target)
        for booth_id, value in zip(booth_ids, new_column):
            votes = restored["results"][booth_id]["votes"]
            delta = value - votes[index]
            votes[index] = value
            # Row totals were scaled down with the column; put back what we add.
            if "total" in restored["results"][booth_id]:
                restored["results"][booth_id]["total"] += delta
        notes.append(f"{key[1]} {cand.get('name')} -> {booth_target:,}")

    restored["source"] = (
        f"{current.get('source', '')} (restored duplicate-name clobber from {GOOD_COMMIT})"
    ).strip()

    problems = check(ac, restored, official)
    if problems:
        return False, "; ".join(problems[:3])

    if write:
        current_path.write_text(json.dumps(restored, ensure_ascii=False, indent=2) + "\n")
    return True, "; ".join(notes)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--write", action="store_true", help="save changes (default: dry run)")
    args = parser.parse_args()

    official_all = json.loads(OFFICIAL.read_text())
    ok = failed = healthy = 0

    for ac, reason in EXCLUDED.items():
        print(f"  {ac}  SKIPPED  {reason}")

    for ac in AFFECTED:
        official = official_all.get(ac)
        if not official:
            print(f"  {ac}  FAILED   no official result")
            failed += 1
            continue
        success, message = restore(ac, official, args.write)
        label = {True: "OK", False: "FAILED", None: "HEALTHY"}[success]
        print(f"  {ac}  {label:7s}  {message}")
        ok += success is True
        failed += success is False
        healthy += success is None

    verb = "restored" if args.write else "would restore"
    print(
        f"\n{verb}: {ok}   already healthy: {healthy}   "
        f"failed: {failed}   skipped: {len(EXCLUDED)}"
    )
    if not args.write and ok:
        print("Dry run. Re-run with --write to apply.")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
