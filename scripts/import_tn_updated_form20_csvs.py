#!/usr/bin/env python3
"""Strictly import the revised flat TN 2026 Form 20 CSV batch.

The revised files have two leading metadata layouts:
  SL_No, Polling_Station_No, [Polling_Station_Name], candidates..., totals...

This importer maps named columns first, handles generic surplus columns by aggregate rank,
checks every row's candidate sum against Total_Valid_Votes, and reconciles every candidate
against the official AC total plus postal votes. It writes nothing without --write.
"""

from __future__ import annotations

import argparse
import csv
import json
import re
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_INPUT = Path("/Users/p0s097d/Desktop/TN_Form20_CSVs")
BOOTH_ROOT = REPO_ROOT / "public/data/booths/TN"
ELECTIONS = REPO_ROOT / "public/data/elections/ac/TN/2026.json"
DEFAULT_REPORT = REPO_ROOT / "scripts/cache/tn_updated_form20_import_report.json"


def norm(value: str) -> str:
    return re.sub(r"[^a-z0-9]", "", (value or "").lower())


def as_int(value: str) -> int | None:
    value = (value or "").strip()
    if re.fullmatch(r"-?\d+", value):
        return int(value)
    numbers = re.findall(r"-?\d+", value)
    return int(numbers[0]) if len(numbers) == 1 else None


def read_csv(path: Path) -> tuple[list[str], list[list[str]]]:
    with path.open(encoding="utf-8-sig", newline="", errors="replace") as handle:
        reader = csv.reader(handle)
        return next(reader), list(reader)


def identify_layout(header: list[str], official_count: int) -> tuple[int, int, int, int]:
    total_idx = next(i for i, value in enumerate(header) if norm(value) == "totalvalidvotes")
    candidate_start = 3 if "name" in norm(header[2]) or "station" in norm(header[2]) else 2
    rejected_idx = next(i for i in range(total_idx + 1, len(header)) if "rejected" in norm(header[i]))
    return candidate_start, total_idx, rejected_idx, total_idx - candidate_start


def map_columns(
    headers: list[str], values: list[list[int]], official: list[dict[str, Any]]
) -> tuple[dict[int, int], str, list[str]]:
    non_nota = [(i, c) for i, c in enumerate(official) if c.get("party") != "NOTA"]
    official_by_norm: dict[str, list[int]] = {}
    for i, candidate in non_nota:
        official_by_norm.setdefault(norm(candidate["name"]), []).append(i)

    mapping: dict[int, int] = {}
    used: set[int] = set()
    unresolved: list[int] = []
    for col, header in enumerate(headers):
        matches = official_by_norm.get(norm(header), [])
        if len(matches) == 1 and matches[0] not in used:
            mapping[col] = matches[0]
            used.add(matches[0])
        else:
            unresolved.append(col)

    missing = [i for i, _ in non_nota if i not in used]
    col_sums = [sum(row[col] for row in values) for col in range(len(headers))]
    # Remove generic surplus columns first. Their values are retained in the report.
    generic = [col for col in unresolved if norm(headers[col]).startswith("candidate")]
    keep_unresolved = [col for col in unresolved if col not in generic]
    surplus = max(0, len(unresolved) - len(missing))
    dropped = sorted(generic, key=lambda col: col_sums[col])[:surplus]
    dropped_names = [headers[col] for col in dropped]
    remaining_cols = [col for col in unresolved if col not in dropped]
    if len(remaining_cols) != len(missing):
        return {}, "invalid-column-count", dropped_names
    for col, official_idx in zip(
        sorted(remaining_cols, key=lambda col: -col_sums[col]),
        sorted(missing, key=lambda idx: -int(official[idx].get("votes") or 0)),
    ):
        mapping[col] = official_idx
    return mapping, "name+rank" if used else "rank", dropped_names


def process(path: Path, official: dict[str, Any], *, write: bool) -> dict[str, Any]:
    ac_no = int(path.name[:3])
    ac_id = f"TN-{ac_no:03d}"
    header, raw_rows = read_csv(path)
    # A few revised files mislabel the station-name column as Candidate_1. Detect it
    # from the first booth row rather than treating the long address as vote data.
    if (
        len(header) > 2
        and norm(header[2]).startswith("candidate")
        and raw_rows
        and not re.fullmatch(r"\s*\d+\s*", raw_rows[0][2] or "")
    ):
        header = [header[0], header[1], "Polling_Station_Name", *header[3:]]
        raw_rows = [[row[0], row[1], row[2], *row[3:]] for row in raw_rows]
    try:
        start, total_idx, rejected_idx, candidate_count = identify_layout(
            header, len(official.get("candidates") or [])
        )
    except (StopIteration, IndexError) as error:
        return {"acId": ac_id, "status": "flagged", "reason": f"layout: {error}"}

    candidate_headers = header[start:total_idx]
    nota_col = next((i for i, value in enumerate(candidate_headers) if norm(value) == "nota"), None)
    non_nota_columns = [i for i in range(len(candidate_headers)) if i != nota_col]
    non_nota_headers = [candidate_headers[i] for i in non_nota_columns]
    parsed: list[list[int]] = []
    nota_values: list[int] = []
    names: list[str] = []
    stations: list[str] = []
    row_errors: list[str] = []
    for row_no, row in enumerate(raw_rows, 2):
        # Form 20 CSVs append three aggregate footer rows (polling-station total,
        # postal total, total votes polled). They are not booths and must never be
        # included in booth sums.
        if len(row) > 1 and as_int(row[1]) is None:
            continue
        if len(row) != len(header):
            row_errors.append(f"row {row_no}: {len(row)} columns, expected {len(header)}")
            continue
        values = [as_int(cell) for cell in row[start:total_idx]]
        valid = as_int(row[total_idx])
        if valid is None or any(value is None for value in values):
            row_errors.append(f"row {row_no}: non-numeric candidate/total cell")
            continue
        numeric = [int(value) for value in values]
        non_nota_values = [numeric[i] for i in non_nota_columns]
        if sum(non_nota_values) != valid:
            row_errors.append(f"row {row_no}: non-NOTA sum {sum(non_nota_values)} != valid {valid}")
            continue
        parsed.append(non_nota_values)
        nota_values.append(numeric[nota_col] if nota_col is not None else 0)
        stations.append(row[1].strip())
        names.append(row[2].strip() if start == 3 else "")
    if row_errors:
        return {"acId": ac_id, "status": "flagged", "reason": row_errors[0], "rowErrors": len(row_errors)}

    official_candidates = official.get("candidates") or []
    mapping, matched_by, dropped = map_columns(non_nota_headers, parsed, official_candidates)
    if not mapping:
        return {"acId": ac_id, "status": "flagged", "reason": matched_by, "droppedColumns": dropped}

    booth_sums = [0] * len(official_candidates)
    for row in parsed:
        for col, official_idx in mapping.items():
            booth_sums[official_idx] += row[col]

    nota_idx = next((i for i, candidate in enumerate(official_candidates) if candidate.get("party") == "NOTA"), None)
    if nota_idx is not None:
        booth_sums[nota_idx] = sum(nota_values)

    postal = (json.loads((BOOTH_ROOT / ac_id / "2026.json").read_text()).get("postal") or {}).get("candidates", [])
    postal_by_norm = {norm(c.get("name", "")): int(c.get("postal") or 0) for c in postal}
    mismatches: list[str] = []
    residual_total = 0
    for i, candidate in enumerate(official_candidates):
        expected = int(candidate.get("votes") or 0)
        booth_total = booth_sums[i]
        if booth_total > expected:
            mismatches.append(f"{candidate['name']}: booth {booth_total} exceeds official {expected}")
        residual_total += expected - booth_total
    official_total = sum(int(c.get("votes") or 0) for c in official_candidates)
    residual_pct = 100 * residual_total / official_total if official_total else 0
    if residual_pct > 5:
        mismatches.append(f"postal residual {residual_pct:.2f}% exceeds 5% ceiling")
    if mismatches:
        return {
            "acId": ac_id, "status": "flagged", "reason": mismatches[0],
            "mismatchCount": len(mismatches), "droppedColumns": dropped,
            "rows": len(parsed), "candidateCount": candidate_count,
        }

    result_path = BOOTH_ROOT / ac_id / "2026.json"
    existing = json.loads(result_path.read_text())
    existing_booths = list((existing.get("results") or {}).items())
    if len(existing_booths) >= len(parsed):
        booth_ids = existing_booths[: len(parsed)]
    else:
        booth_ids = [(f"{ac_id}-{station}", {}) for station in stations]
    existing_booth_doc = json.loads((BOOTH_ROOT / ac_id / "booths.json").read_text())
    existing_booth_rows = existing_booth_doc.get("booths") or []
    if len(existing_booth_rows) >= len(parsed):
        booth_rows = [dict(row) for row in existing_booth_rows[: len(parsed)]]
    else:
        booth_rows = [
            {"id": booth_id, "boothNo": stations[i], "num": int(stations[i]), "type": "regular"}
            for i, (booth_id, _old) in enumerate(booth_ids)
        ]
    for i, (booth_id, _old) in enumerate(booth_ids):
        booth_rows[i]["id"] = booth_id
        if i < len(stations):
            booth_rows[i]["boothNo"] = stations[i]
            try:
                booth_rows[i]["num"] = int(stations[i])
            except ValueError:
                pass
    if names and any(names):
        for i, name in enumerate(names):
            if name:
                booth_rows[i]["name"] = name
                booth_rows[i]["address"] = name

    if write:
        results: dict[str, Any] = {}
        for index, (booth_id, old) in enumerate(booth_ids):
            votes = [0] * len(official_candidates)
            for col, official_idx in mapping.items():
                votes[official_idx] = parsed[index][col]
            nota_idx = next(
                (i for i, candidate in enumerate(official_candidates) if candidate.get("party") == "NOTA"),
                None,
            )
            if nota_idx is not None:
                votes[nota_idx] = nota_values[index]
            rejected = 0
            if rejected_idx < len(raw_rows[index]):
                rejected = as_int(raw_rows[index][rejected_idx]) or 0
            result_name = names[index] or old.get("name", "")
            result_address = names[index] or old.get("address", "")
            results[booth_id] = {
                **old,
                "votes": votes,
                "total": sum(votes) + rejected,
                "rejected": rejected,
                "name": result_name,
                "address": result_address,
                "sourceNote": "updated_tn_form20_csv",
            }
        existing["results"] = results
        booths_doc_path = BOOTH_ROOT / ac_id / "booths.json"
        existing_booth_doc["booths"] = booth_rows
        existing_booth_doc["totalBooths"] = len(booth_rows)
        existing_booth_doc["lastUpdated"] = "2026-09-16"
        booths_doc_path.write_text(json.dumps(existing_booth_doc, indent=2, ensure_ascii=False) + "\n")
        existing["postal"] = {
            **(existing.get("postal") or {}),
            "candidates": [
                {
                    "name": candidate.get("name", ""),
                    "party": candidate.get("party", ""),
                    "postal": int(candidate.get("votes") or 0) - booth_sums[i],
                    "booth": booth_sums[i],
                    "total": int(candidate.get("votes") or 0),
                }
                for i, candidate in enumerate(official_candidates)
            ],
        }
        existing["dataQuality"] = {
            **(existing.get("dataQuality") or {}),
            "form20ParsedBooths": len(parsed),
            "form20ParsedPct": round(100 * len(parsed) / len(results), 2),
            "estimatedBooths": max(0, len(results) - len(parsed)),
            "acTotalsReconciled": True,
        }
        result_path.write_text(json.dumps(existing, indent=2, ensure_ascii=False) + "\n")

    return {
        "acId": ac_id, "status": "ok", "rows": len(parsed), "matchedBy": matched_by,
        "droppedColumns": dropped, "candidateCount": candidate_count,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    parser.add_argument("--write", action="store_true")
    parser.add_argument("--report-out", type=Path, default=DEFAULT_REPORT)
    args = parser.parse_args()
    elections = json.loads(ELECTIONS.read_text())
    reports = []
    for path in sorted(args.input.glob("*.csv")):
        reports.append(process(path, elections[f"TN-{int(path.name[:3]):03d}"], write=args.write))
    summary = {"ok": sum(r["status"] == "ok" for r in reports), "flagged": sum(r["status"] == "flagged" for r in reports)}
    args.report_out.parent.mkdir(parents=True, exist_ok=True)
    args.report_out.write_text(json.dumps({"summary": summary, "reports": reports}, indent=2) + "\n")
    print(json.dumps(summary, indent=2))
    for report in reports:
        print(report)


if __name__ == "__main__":
    main()
