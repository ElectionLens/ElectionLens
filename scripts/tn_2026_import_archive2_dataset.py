#!/usr/bin/env python3
"""
Import the "archive 2" boothwise_dataset (TN 2026 Form20 + Poll Station Details) into
public/data/booths/TN/{ac}/2026.json + booths.json, replacing OCR-estimated booth votes
with real per-booth Form20 rows.

Why this exists: the archive dataset ships Form20 CSVs already reconciled against its own
source PDFs (row count verified), plus Poll_Station_Details.pdf per AC. That is real booth
data. Our existing pipeline had to fall back to `residual_booth_fill` / `unmapped_booth_fill`
synthetic distribution for a chunk of ACs (0% real Form20 coverage) because live CEO scraping
either failed or the OCR ensemble punted. This script replaces synthetic votes with real ones
wherever the archive file is trustworthy, and *refuses* to touch an AC if the archive file
looks corrupt (never silently writes wrong votes) -- see `validate_candidate_columns`.

Column-name matching:
  Some archive CSVs have real candidate names in the header (safe: match by normalized name).
  Many (101 of 233) use generic "Candidate_N" headers with unknown column->candidate order.
  For those we rank-match: sort official (non-NOTA) candidates by official votes desc, sort
  CSV candidate columns by column-sum desc, zip pairwise -- then validate the pairing against
  official totals (booth votes must be <= official, and short by no more than --tolerance-pct,
  which absorbs the postal-vote gap). If validation fails we flag the AC and skip it rather
  than guess (see Bargur/TN-052: shifted columns, an embedded address field, garbage trailing
  fields -- caught here because its column sums don't line up with official results at all).

Usage:
  python3 scripts/tn_2026_import_archive2_dataset.py --all --report
  python3 scripts/tn_2026_import_archive2_dataset.py --all --write
  python3 scripts/tn_2026_import_archive2_dataset.py --ac 1,52,234 --write
"""

from __future__ import annotations

import argparse
import csv
import json
import re
import sys
from datetime import date
from pathlib import Path
from typing import Any

_SCRIPTS_DIR = Path(__file__).resolve().parent
if str(_SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS_DIR))

from tn_2026_booth_common import (
    BOOTHS_TN,
    REPO_ROOT,
    booth_num_sort_key,
    load_schema_tn_ac_map,
    load_tn_2026_elections,
    norm_candidate_key,
)
from tn_2026_pslist_booths import parse_ps_pdf_tables
from tn_2026_reconcile_votes import compute_booth_data_quality

DEFAULT_ARCHIVE_DIR = Path("/Users/p0s097d/Desktop/archive 2")
RESERVED_TRAILING = ["Total Valid Votes", "Rejected Votes", "NOTA", "Total", "Tendered Votes"]


def find_dataset_root(archive_dir: Path) -> Path:
    """Accept either the archive root or the boothwise_dataset dir directly."""
    if (archive_dir / "boothwise_dataset").is_dir():
        return archive_dir / "boothwise_dataset"
    if archive_dir.name == "boothwise_dataset":
        return archive_dir
    raise FileNotFoundError(f"No boothwise_dataset under {archive_dir}")


def find_ac_folder(dataset_root: Path, ac_no: int) -> Path | None:
    prefix = f"{ac_no:03d}-"
    for p in dataset_root.iterdir():
        if p.is_dir() and p.name.startswith(prefix):
            return p
    return None


def read_form20_csv(csv_path: Path) -> tuple[list[str], list[list[str]]]:
    with csv_path.open(newline="", encoding="utf-8-sig") as fh:
        r = csv.reader(fh)
        header = next(r)
        rows = [row for row in r if any(c.strip() for c in row)]
    return header, rows


def is_generic_header(candidate_cols: list[str]) -> bool:
    return all(re.match(r"^Candidate_\d+$", c.strip()) for c in candidate_cols)


def try_int(s: str) -> int | None:
    s = (s or "").strip()
    if s == "":
        return 0
    try:
        return int(float(s)) if re.match(r"^-?\d+\.0+$", s) else int(s)
    except ValueError:
        return None


def validate_candidate_columns(
    header: list[str], rows: list[list[str]], csv_path: Path
) -> tuple[bool, str, list[str], list[list[int]]]:
    """
    Confirm every row has header-length fields and every candidate+reserved value is a
    clean integer. Returns (ok, reason_if_not_ok, candidate_cols, parsed_rows[candidate+5]).
    """
    if len(header) < 7:
        return False, f"header too short ({len(header)} cols)", [], []
    if header[-5:] != RESERVED_TRAILING:
        return False, f"unexpected trailing columns {header[-5:]}", [], []

    candidate_cols = header[1:-5]
    parsed_rows: list[list[int]] = []
    for i, row in enumerate(rows):
        if len(row) != len(header):
            return False, f"row {i + 1} has {len(row)} fields, header has {len(header)}", [], []
        vals: list[int] = []
        for j, cell in enumerate(row[1:]):
            v = try_int(cell)
            if v is None:
                col_name = (candidate_cols + RESERVED_TRAILING)[j]
                return (
                    False,
                    f"row {i + 1} col '{col_name}' is not numeric: {cell!r}",
                    [],
                    [],
                )
            vals.append(v)
        parsed_rows.append(vals)
    return True, "", candidate_cols, parsed_rows


def build_column_candidate_map(
    candidate_cols: list[str],
    parsed_rows: list[list[int]],
    econ_candidates: list[dict[str, Any]],
    *,
    tolerance_pct: float,
) -> tuple[list[int | None], str, list[dict[str, Any]]]:
    """
    Map each CSV candidate column index -> index into econ_candidates (which includes NOTA).
    Returns (col_to_econ_idx, matched_by, per_candidate_diagnostics). col_to_econ_idx[j] is
    the econ_candidates index that CSV candidate column j feeds, or None if unresolved.
    """
    n_cols = len(candidate_cols)
    col_sums = [0] * n_cols
    for vals in parsed_rows:
        for j in range(n_cols):
            col_sums[j] += vals[j]

    non_nota = [(idx, c) for idx, c in enumerate(econ_candidates) if c.get("party") != "NOTA"]
    diagnostics: list[dict[str, Any]] = []

    if not is_generic_header(candidate_cols):
        norm_to_econ_idx = {norm_candidate_key(c["name"]): idx for idx, c in non_nota}
        col_to_econ: list[int | None] = []
        unresolved = 0
        for j, name in enumerate(candidate_cols):
            idx = norm_to_econ_idx.get(norm_candidate_key(name))
            col_to_econ.append(idx)
            if idx is None:
                unresolved += 1
        if unresolved == 0:
            for j, name in enumerate(candidate_cols):
                idx = col_to_econ[j]
                official = econ_candidates[idx]["votes"]
                diagnostics.append(
                    {
                        "column": name,
                        "candidate": econ_candidates[idx]["name"],
                        "colSum": col_sums[j],
                        "official": official,
                        "errPct": round(100 * (official - col_sums[j]) / max(1, official), 2),
                    }
                )
            return col_to_econ, "name", diagnostics
        # fall through to rank-based matching if name matching didn't fully resolve

    if n_cols != len(non_nota):
        return (
            [None] * n_cols,
            "rank",
            [{"error": f"{n_cols} candidate columns vs {len(non_nota)} official non-NOTA candidates"}],
        )

    order_by_sum = sorted(range(n_cols), key=lambda j: -col_sums[j])
    order_by_votes = sorted(range(len(non_nota)), key=lambda k: -non_nota[k][1]["votes"])
    col_to_econ = [None] * n_cols
    for rank, col_j in enumerate(order_by_sum):
        econ_idx = non_nota[order_by_votes[rank]][0]
        col_to_econ[col_j] = econ_idx
        official = econ_candidates[econ_idx]["votes"]
        diagnostics.append(
            {
                "column": candidate_cols[col_j],
                "candidate": econ_candidates[econ_idx]["name"],
                "colSum": col_sums[col_j],
                "official": official,
                "errPct": round(100 * (official - col_sums[col_j]) / max(1, official), 2),
            }
        )
    return col_to_econ, "rank", diagnostics


def validate_diagnostics(diagnostics: list[dict[str, Any]], tolerance_pct: float) -> tuple[bool, str]:
    for d in diagnostics:
        if "error" in d:
            return False, d["error"]
        if d["colSum"] > d["official"] * 1.02:
            return False, f"{d['candidate']}: booth sum {d['colSum']} exceeds official {d['official']}"
        if d["errPct"] > tolerance_pct:
            return False, f"{d['candidate']}: errPct {d['errPct']} exceeds tolerance {tolerance_pct}"
    return True, ""


def build_booths_from_pdf_or_synthetic(
    ac_id: str, ac_name: str, ps_pdf: Path | None, n_booths: int
) -> tuple[list[dict[str, Any]], str]:
    if ps_pdf and ps_pdf.exists() and ps_pdf.stat().st_size > 0:
        try:
            rows = parse_ps_pdf_tables(ps_pdf)
        except Exception as e:  # noqa: BLE001
            rows = []
            print(f"WARN {ac_id}: could not parse {ps_pdf.name}: {e}", file=sys.stderr)
        if rows and len(rows) == n_booths:
            booths = []
            for b in rows:
                bid = f"{ac_id}-{b['boothNo']}"
                booths.append(
                    {
                        "id": bid,
                        "boothNo": b["boothNo"],
                        "num": b["num"],
                        "type": "regular",
                        "name": b["name"],
                        "address": b["address"],
                        "area": b.get("area", ""),
                    }
                )
            return booths, "archive2_ps_pdf"
        if rows:
            print(
                f"WARN {ac_id}: Poll_Station_Details.pdf has {len(rows)} rows, "
                f"Form20 has {n_booths} -- using synthetic numeric booth ids",
                file=sys.stderr,
            )
    booths = [
        {
            "id": f"{ac_id}-{n}",
            "boothNo": str(n),
            "num": n,
            "type": "regular",
            "name": "",
            "address": "",
            "area": "",
        }
        for n in range(1, n_booths + 1)
    ]
    return booths, "synthetic_numeric"


def build_doc_candidates(econ_candidates: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [
        {
            "slNo": i + 1,
            "name": c["name"],
            "party": c["party"],
            "symbol": "",
        }
        for i, c in enumerate(econ_candidates)
    ]


def process_ac(
    ac_no: int,
    dataset_root: Path,
    ac_map: dict[int, dict[str, Any]],
    elections: dict[str, Any],
    *,
    tolerance_pct: float,
) -> dict[str, Any]:
    row = ac_map.get(ac_no)
    if not row:
        return {"acNo": ac_no, "status": "skip", "reason": "not in TN schema"}
    ac_id = row["schemaId"]

    folder = find_ac_folder(dataset_root, ac_no)
    if not folder:
        return {"acNo": ac_no, "acId": ac_id, "status": "skip", "reason": "no archive folder"}

    csv_candidates = list(folder.glob("*_Form_20.csv"))
    if not csv_candidates:
        return {"acNo": ac_no, "acId": ac_id, "status": "skip", "reason": "no Form_20.csv"}
    csv_path = csv_candidates[0]

    econ = elections.get(ac_id)
    if not econ or not econ.get("candidates"):
        return {"acNo": ac_no, "acId": ac_id, "status": "skip", "reason": "no elections/ac/TN/2026.json row"}
    econ_candidates = econ["candidates"]

    header, rows = read_form20_csv(csv_path)
    ok, reason, candidate_cols, parsed_rows = validate_candidate_columns(header, rows, csv_path)
    if not ok:
        return {"acNo": ac_no, "acId": ac_id, "status": "flagged", "reason": f"csv shape: {reason}"}

    col_to_econ, matched_by, diagnostics = build_column_candidate_map(
        candidate_cols, parsed_rows, econ_candidates, tolerance_pct=tolerance_pct
    )
    valid, reason = validate_diagnostics(diagnostics, tolerance_pct)
    if not valid:
        return {
            "acNo": ac_no,
            "acId": ac_id,
            "status": "flagged",
            "reason": f"vote mismatch ({matched_by}): {reason}",
            "diagnostics": diagnostics,
        }

    n_c = len(econ_candidates)
    nota_econ_idx = next((i for i, c in enumerate(econ_candidates) if c.get("party") == "NOTA"), None)
    n_cols = len(candidate_cols)
    reserved_offset = n_cols  # index into parsed row's tail (candidate values, then 5 reserved)

    ps_pdfs = list(folder.glob("*_Poll_Station_Details.pdf"))
    ac_name = econ.get("constituencyName") or row.get("name") or ac_id
    booths, booth_source = build_booths_from_pdf_or_synthetic(
        ac_id, ac_name, ps_pdfs[0] if ps_pdfs else None, len(parsed_rows)
    )
    if len(booths) != len(parsed_rows):
        return {
            "acNo": ac_no,
            "acId": ac_id,
            "status": "flagged",
            "reason": f"booth count {len(booths)} != Form20 rows {len(parsed_rows)}",
        }

    results: dict[str, Any] = {}
    for i, vals in enumerate(parsed_rows):
        booth = booths[i]
        votes = [0] * n_c
        for j in range(n_cols):
            econ_idx = col_to_econ[j]
            if econ_idx is not None:
                votes[econ_idx] = vals[j]
        rejected = vals[reserved_offset + 1]
        nota_val = vals[reserved_offset + 2]
        if nota_econ_idx is not None:
            votes[nota_econ_idx] = nota_val
        results[booth["id"]] = {
            "votes": votes,
            "total": sum(votes) + rejected,
            "rejected": rejected,
            "name": booth.get("name", ""),
            "address": booth.get("address", ""),
            "area": booth.get("area", ""),
            "sourceNote": "archive2_form20",
        }

    doc = {
        "acId": ac_id,
        "acName": ac_name,
        "year": 2026,
        "electionType": "assembly",
        "date": econ.get("date") or "2026-05-08",
        "source": csv_path.resolve().as_uri(),
        "candidates": build_doc_candidates(econ_candidates),
        "results": results,
    }
    booths_doc = {
        "acId": ac_id,
        "acName": ac_name,
        "state": "Tamil Nadu",
        "totalBooths": len(booths),
        "lastUpdated": date.today().isoformat(),
        "source": (ps_pdfs[0].resolve().as_uri() if booth_source == "archive2_ps_pdf" else "archive2 (synthetic numeric ids)"),
        "booths": booths,
    }

    from tn_2026_reconcile_votes import force_strict_to_elections

    strict_ok, max_abs = force_strict_to_elections(doc, econ, booths_doc, legacy_booth_ids_only=True)
    doc["dataQuality"] = compute_booth_data_quality(doc, booths_doc, econ)

    return {
        "acNo": ac_no,
        "acId": ac_id,
        "status": "ok",
        "matchedBy": matched_by,
        "boothSource": booth_source,
        "boothCount": len(booths),
        "strictOk": strict_ok,
        "maxAbsDelta": max_abs,
        "tier": doc["dataQuality"]["tier"],
        "form20ParsedPct": doc["dataQuality"]["form20ParsedPct"],
        "doc": doc,
        "boothsDoc": booths_doc,
    }


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--archive-dir", type=Path, default=DEFAULT_ARCHIVE_DIR)
    ap.add_argument("--ac", help="Comma-separated AC numbers, e.g. 1,52,234")
    ap.add_argument("--all", action="store_true", help="All 234 TN ACs present in schema")
    ap.add_argument("--write", action="store_true", help="Write 2026.json + booths.json (default: dry-run report)")
    ap.add_argument("--tolerance-pct", type=float, default=20.0, help="Max allowed per-candidate booth-vs-official error %%")
    ap.add_argument(
        "--report-out",
        type=Path,
        default=REPO_ROOT / "scripts/cache/tn_2026_archive2_import_report.json",
    )
    args = ap.parse_args()

    if not args.ac and not args.all:
        ap.error("Specify --ac or --all")

    dataset_root = find_dataset_root(args.archive_dir)
    ac_map = load_schema_tn_ac_map()
    elections = load_tn_2026_elections()

    if args.all:
        targets = sorted(ac_map.keys())
    else:
        targets = [int(x.strip()) for x in args.ac.split(",")]

    summary = {"ok": 0, "flagged": 0, "skip": 0}
    flagged: list[dict[str, Any]] = []
    written: list[str] = []

    for ac_no in targets:
        result = process_ac(ac_no, dataset_root, ac_map, elections, tolerance_pct=args.tolerance_pct)
        summary[result["status"]] = summary.get(result["status"], 0) + 1
        if result["status"] == "flagged":
            flagged.append({k: v for k, v in result.items() if k not in ("diagnostics",)})
            print(f"FLAGGED TN-{ac_no:03d}: {result['reason']}", file=sys.stderr)
            continue
        if result["status"] == "skip":
            print(f"SKIP TN-{ac_no:03d}: {result['reason']}", file=sys.stderr)
            continue

        print(
            f"OK TN-{ac_no:03d} ({result['acId']}): matchedBy={result['matchedBy']} "
            f"boothSource={result['boothSource']} booths={result['boothCount']} "
            f"strictOk={result['strictOk']} tier={result['tier']} form20Pct={result['form20ParsedPct']}"
        )
        if args.write:
            ac_dir = BOOTHS_TN / result["acId"]
            ac_dir.mkdir(parents=True, exist_ok=True)
            (ac_dir / "2026.json").write_text(
                json.dumps(result["doc"], indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
            )
            (ac_dir / "booths.json").write_text(
                json.dumps(result["boothsDoc"], indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
            )
            written.append(result["acId"])

    print("\n=== Summary ===")
    print(json.dumps(summary, indent=2))
    if flagged:
        print(f"\n{len(flagged)} AC(s) flagged for manual review:")
        for f in flagged:
            print(f"  TN-{f['acNo']:03d}: {f['reason']}")

    args.report_out.parent.mkdir(parents=True, exist_ok=True)
    args.report_out.write_text(
        json.dumps({"summary": summary, "flagged": flagged, "written": written}, indent=2), encoding="utf-8"
    )
    print(f"\nReport written to {args.report_out}")


if __name__ == "__main__":
    main()
