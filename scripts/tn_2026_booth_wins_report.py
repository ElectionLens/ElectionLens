#!/usr/bin/env python3
"""
List booth-level winners for TN LA 2026 (highest votes per booth, NOTA excluded).

  python3 scripts/tn_2026_booth_wins_report.py
  python3 scripts/tn_2026_booth_wins_report.py --csv out.csv --json out.json
"""

from __future__ import annotations

import argparse
import csv
import json
import sys
from pathlib import Path

_SCRIPTS_DIR = Path(__file__).resolve().parent
if str(_SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS_DIR))

from tn_2026_booth_common import BOOTHS_TN, REPO_ROOT, load_schema_tn_ac_map


def booth_winner(candidates: list[dict], votes: list[int]) -> dict | None:
    best_idx = -1
    best_votes = -1
    second_votes = -1
    for i, c in enumerate(candidates):
        if c.get("party") == "NOTA" or c.get("name") == "NOTA":
            continue
        v = int(votes[i] or 0) if i < len(votes) else 0
        if v > best_votes:
            second_votes = best_votes
            best_votes = v
            best_idx = i
        elif v > second_votes:
            second_votes = v
    if best_idx < 0 or best_votes <= 0:
        return None
    c = candidates[best_idx]
    return {
        "winnerName": c.get("name", ""),
        "winnerParty": c.get("party", ""),
        "winnerVotes": best_votes,
        "margin": best_votes - max(0, second_votes),
        "totalValid": sum(int(v or 0) for v in votes),
    }


def main() -> None:
    ap = argparse.ArgumentParser(description="TN 2026 booth wins by constituency")
    ap.add_argument(
        "--csv",
        type=Path,
        default=REPO_ROOT / "scripts/cache/tn-2026-booth-wins.csv",
    )
    ap.add_argument(
        "--json",
        type=Path,
        default=REPO_ROOT / "scripts/cache/tn-2026-booth-wins-by-ac.json",
    )
    args = ap.parse_args()

    ac_map = load_schema_tn_ac_map()
    by_ac: dict[str, dict] = {}
    rows: list[dict] = []

    for ac_no in sorted(ac_map.keys()):
        ac_id = ac_map[ac_no]["schemaId"]
        bpath = BOOTHS_TN / ac_id / "booths.json"
        rpath = BOOTHS_TN / ac_id / "2026.json"
        if not bpath.exists() or not rpath.exists():
            continue

        booths_doc = json.loads(bpath.read_text(encoding="utf-8"))
        res_doc = json.loads(rpath.read_text(encoding="utf-8"))
        ac_name = res_doc.get("acName") or booths_doc.get("acName") or ac_id
        candidates = res_doc.get("candidates") or []
        results = res_doc.get("results") or {}

        party_wins: dict[str, int] = {}
        booth_list: list[dict] = []

        for booth in sorted(booths_doc.get("booths") or [], key=lambda b: b.get("num", 0)):
            bid = booth.get("id")
            if not bid:
                continue
            rv = results.get(bid)
            if not rv:
                continue
            win = booth_winner(candidates, rv.get("votes") or [])
            row = {
                "acId": ac_id,
                "acNo": ac_no,
                "acName": ac_name,
                "boothId": bid,
                "boothNo": booth.get("boothNo", ""),
                "boothType": booth.get("type", "regular"),
                "boothName": booth.get("name", rv.get("name", "")),
                "winnerName": "",
                "winnerParty": "",
                "winnerVotes": 0,
                "margin": 0,
                "totalValid": sum(int(v or 0) for v in (rv.get("votes") or [])),
                "sourceNote": rv.get("sourceNote", ""),
            }
            if win:
                row.update(win)
                party_wins[win["winnerParty"]] = party_wins.get(win["winnerParty"], 0) + 1
            booth_list.append(
                {
                    "boothId": bid,
                    "boothNo": row["boothNo"],
                    "winnerParty": row["winnerParty"],
                    "winnerName": row["winnerName"],
                    "winnerVotes": row["winnerVotes"],
                    "margin": row["margin"],
                }
            )
            rows.append(row)

        by_ac[ac_id] = {
            "acId": ac_id,
            "acNo": ac_no,
            "acName": ac_name,
            "totalBooths": len(booth_list),
            "boothWinsByParty": dict(sorted(party_wins.items(), key=lambda x: -x[1])),
            "booths": booth_list,
        }

    args.csv.parent.mkdir(parents=True, exist_ok=True)
    with args.csv.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(
            f,
            fieldnames=[
                "acId",
                "acNo",
                "acName",
                "boothId",
                "boothNo",
                "boothType",
                "boothName",
                "winnerParty",
                "winnerName",
                "winnerVotes",
                "margin",
                "totalValid",
                "sourceNote",
            ],
        )
        w.writeheader()
        w.writerows(rows)

    args.json.write_text(json.dumps(by_ac, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    print(f"Constituencies: {len(by_ac)}")
    print(f"Booth rows: {len(rows)}")
    print(f"CSV: {args.csv}")
    print(f"JSON (by AC): {args.json}")


if __name__ == "__main__":
    main()
