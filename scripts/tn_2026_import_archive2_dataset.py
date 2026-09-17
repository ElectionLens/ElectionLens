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

Column-name matching, in order of preference:
  1. Real candidate names in the header -> match by normalized name (safe, exact).
  2. Some archive headers reverse the candidate name character-by-character (an
     extraction quirk upstream) -- try the reversed spelling too.
  3. Some go further and rotate the reversed text (word fragments reassembled starting
     mid-name) -- try a cyclic-rotation match.
  4. If there are now more unresolved columns than unresolved candidates, the surplus is
     junk (e.g. a failed first extraction attempt for a name that was *also* captured
     correctly elsewhere) -- drop generic "Candidate_N" placeholders first, then pair any
     truly leftover named columns/candidates by rank (column-sum desc vs official-votes
     desc).
  5. Fully generic headers (all "Candidate_N") skip straight to rank-matching every column.
  Every path is gated by `validate_diagnostics`: booth-column sums must not exceed official
  totals and must be within --tolerance-pct of them (the gap being real postal votes), and
  the AC's overall postal residual must stay under --postal-ceiling-pct (catches columns we
  dropped that actually mattered). If validation fails we flag the AC and skip it rather
  than guess (see Bargur/TN-052: shifted columns, an embedded address field, garbage
  trailing fields -- caught here because its column sums don't line up with official
  results at all).

Usage:
  python3 scripts/tn_2026_import_archive2_dataset.py --all
  python3 scripts/tn_2026_import_archive2_dataset.py --all --write
  python3 scripts/tn_2026_import_archive2_dataset.py --ac 1,52,234 --write
"""

from __future__ import annotations

import argparse
import csv
import json
import re
import subprocess
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
    load_schema_tn_ac_map,
    load_tn_2026_elections,
    norm_candidate_key,
)
from tn_2026_pslist_booths import parse_ps_pdf_tables
from tn_2026_reconcile_votes import compute_booth_data_quality, force_strict_to_elections
from lib.archive2_parsers import (
    parse_polling_station_text,
    recover_form20_layout,
    try_int,
    validate_candidate_columns,
)
from lib.form20_pdf import parse_form20_pdf_rows

DEFAULT_ARCHIVE_DIR = Path.home() / "Desktop" / "archive 2"
RESERVED_TRAILING = ["Total Valid Votes", "Rejected Votes", "NOTA", "Total", "Tendered Votes"]


def find_dataset_root(archive_dir: Path) -> Path:
    """Accept either archive root or boothwise_dataset directly.

    The supplied archive has appeared under both ``archive`` and ``archive 2``
    on developer machines. If the requested path is absent, accept the sibling
    archive directory only when it contains the expected dataset shape. This is
    a convenience for local source discovery, never a reason to silently choose
    a different dataset once a path exists.
    """
    candidates = [archive_dir]
    if not archive_dir.exists() and archive_dir.name == "archive 2":
        candidates.append(archive_dir.with_name("archive"))
    for candidate in candidates:
        if (candidate / "boothwise_dataset").is_dir():
            return candidate / "boothwise_dataset"
        if candidate.name == "boothwise_dataset" and candidate.is_dir():
            return candidate
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


def is_generic_name(name: str) -> bool:
    return bool(re.match(r"^Candidate_\d+$", name.strip()))


def _is_rotation(a: str, b: str) -> bool:
    """True if b is a cyclic rotation of a. Handles a PDF-extraction quirk where
    reversed/rotated header text gets its words reassembled starting mid-name."""
    return bool(a) and len(a) == len(b) and b in (a + a)


def _candidate_diag(
    candidate_cols: list[str],
    col_sums: list[int],
    econ_candidates: list[dict[str, Any]],
    col_j: int,
    econ_idx: int,
) -> dict[str, Any]:
    official = econ_candidates[econ_idx]["votes"]
    col_sum = col_sums[col_j]
    return {
        "column": candidate_cols[col_j],
        "candidate": econ_candidates[econ_idx]["name"],
        "colSum": col_sum,
        "official": official,
        "errPct": round(100 * (official - col_sum) / max(1, official), 2),
    }


def _rank_pair(
    col_idxs: list[int], econ_idxs: list[int], col_sums: list[int], econ_candidates: list[dict[str, Any]]
) -> dict[int, int]:
    """Pair columns/candidates by descending column-sum vs descending official votes."""
    by_sum = sorted(col_idxs, key=lambda j: -col_sums[j])
    by_votes = sorted(econ_idxs, key=lambda idx: -econ_candidates[idx]["votes"])
    return dict(zip(by_sum, by_votes))


def build_column_candidate_map(
    candidate_cols: list[str],
    parsed_rows: list[list[int]],
    econ_candidates: list[dict[str, Any]],
) -> tuple[list[int | None], str, list[dict[str, Any]]]:
    """
    Map each CSV candidate column index -> index into econ_candidates (which includes NOTA).
    Returns (col_to_econ_idx, matched_by, per_candidate_diagnostics). Unmapped columns (junk,
    dropped as surplus) are left as None and contribute zero votes.
    """
    n_cols = len(candidate_cols)
    col_sums = [0] * n_cols
    for vals in parsed_rows:
        for j in range(n_cols):
            col_sums[j] += vals[j]

    non_nota = [(idx, c) for idx, c in enumerate(econ_candidates) if c.get("party") != "NOTA"]
    col_to_econ: list[int | None] = [None] * n_cols

    if not is_generic_header(candidate_cols):
        # Tier 1+2: forward name match, then reversed-string match.
        norm_to_econ_idx: dict[str, int] = {}
        for idx, c in non_nota:
            for key in (norm_candidate_key(c["name"]), norm_candidate_key(c["name"][::-1])):
                norm_to_econ_idx.setdefault(key, idx)

        used_idxs: set[int] = set()
        unresolved_cols: list[int] = []
        for j, name in enumerate(candidate_cols):
            idx = norm_to_econ_idx.get(norm_candidate_key(name))
            if idx is None:
                idx = norm_to_econ_idx.get(norm_candidate_key(name[::-1]))
            if idx is not None and idx not in used_idxs:
                col_to_econ[j] = idx
                used_idxs.add(idx)
            else:
                unresolved_cols.append(j)

        # Tier 3: cyclic-rotation match for whatever forward/reverse missed.
        remaining_idxs = [idx for idx, _ in non_nota if idx not in used_idxs]
        still_unresolved: list[int] = []
        for j in unresolved_cols:
            norm_fwd = norm_candidate_key(candidate_cols[j])
            norm_rev = norm_candidate_key(candidate_cols[j][::-1])
            match_idx = next(
                (
                    idx
                    for idx in remaining_idxs
                    if idx not in used_idxs
                    and (
                        _is_rotation(norm_candidate_key(econ_candidates[idx]["name"]), norm_fwd)
                        or _is_rotation(norm_candidate_key(econ_candidates[idx]["name"]), norm_rev)
                    )
                ),
                None,
            )
            if match_idx is not None:
                col_to_econ[j] = match_idx
                used_idxs.add(match_idx)
            else:
                still_unresolved.append(j)
        unresolved_cols = still_unresolved
        remaining_idxs = [idx for idx, _ in non_nota if idx not in used_idxs]

        dropped_cols: list[int] = []
        if unresolved_cols and len(unresolved_cols) == len(remaining_idxs):
            # Equal leftovers on both sides (commonly exactly one): resolve by rank.
            pairs = _rank_pair(unresolved_cols, remaining_idxs, col_sums, econ_candidates)
            for col_j, econ_idx in pairs.items():
                col_to_econ[col_j] = econ_idx
            unresolved_cols = []
        elif unresolved_cols and len(unresolved_cols) > len(remaining_idxs):
            # Tier 4: more leftover columns than leftover candidates -- every real candidate
            # already has a match, so the extra column(s) are junk. Drop generic
            # "Candidate_N" placeholders first; pair any truly-named remainder by rank.
            by_genericity = sorted(unresolved_cols, key=lambda j: 0 if is_generic_name(candidate_cols[j]) else 1)
            n_drop = len(unresolved_cols) - len(remaining_idxs)
            dropped_cols, keep_cols = by_genericity[:n_drop], by_genericity[n_drop:]
            pairs = _rank_pair(keep_cols, remaining_idxs, col_sums, econ_candidates)
            for col_j, econ_idx in pairs.items():
                col_to_econ[col_j] = econ_idx
            unresolved_cols = []

        if not unresolved_cols:
            diagnostics = [
                _candidate_diag(candidate_cols, col_sums, econ_candidates, j, col_to_econ[j])
                for j in range(n_cols)
                if col_to_econ[j] is not None
            ]
            if dropped_cols:
                diagnostics.append(
                    {"droppedColumns": [candidate_cols[j] for j in dropped_cols]}
                )
            matched_by = "name" if not remaining_idxs and not dropped_cols else "name+rank-residual"
            return col_to_econ, matched_by, diagnostics
        # else: names didn't resolve cleanly -- fall through to full rank matching

    if n_cols != len(non_nota):
        if is_generic_header(candidate_cols) and n_cols > len(non_nota):
            # Generic headers occasionally contain one or more extraction artefacts.
            # Keep the columns with the largest totals (the real candidates), drop the
            # smallest surplus columns, and let the aggregate postal ceiling below decide
            # whether the dropped values were actually meaningful.
            keep = sorted(range(n_cols), key=lambda j: -col_sums[j])[: len(non_nota)]
            drop = sorted(set(range(n_cols)) - set(keep))
            econ_idxs = [idx for idx, _ in non_nota]
            pairs = _rank_pair(keep, econ_idxs, col_sums, econ_candidates)
            for col_j, econ_idx in pairs.items():
                col_to_econ[col_j] = econ_idx
            diagnostics = [
                _candidate_diag(candidate_cols, col_sums, econ_candidates, j, col_to_econ[j])
                for j in keep
            ]
            diagnostics.append({"droppedColumns": [candidate_cols[j] for j in drop]})
            return col_to_econ, "rank+drop-surplus", diagnostics
        return (
            [None] * n_cols,
            "rank",
            [{"error": f"{n_cols} candidate columns vs {len(non_nota)} official non-NOTA candidates"}],
        )

    econ_idxs = [idx for idx, _ in non_nota]
    pairs = _rank_pair(list(range(n_cols)), econ_idxs, col_sums, econ_candidates)
    for col_j, econ_idx in pairs.items():
        col_to_econ[col_j] = econ_idx
    diagnostics = [_candidate_diag(candidate_cols, col_sums, econ_candidates, j, col_to_econ[j]) for j in range(n_cols)]
    return col_to_econ, "rank", diagnostics


def validate_diagnostics(diagnostics: list[dict[str, Any]], tolerance_pct: float) -> tuple[bool, str]:
    for d in diagnostics:
        if "error" in d or "droppedColumns" in d:
            if "error" in d:
                return False, d["error"]
            continue
        if d["colSum"] > d["official"] * 1.02:
            return False, f"{d['candidate']}: booth sum {d['colSum']} exceeds official {d['official']}"
        if d["errPct"] > tolerance_pct:
            return False, f"{d['candidate']}: errPct {d['errPct']} exceeds tolerance {tolerance_pct}"
    return True, ""


def build_booths_from_pdf_or_synthetic(
    ac_id: str, ps_pdf: Path | None, n_booths: int
) -> tuple[list[dict[str, Any]], str]:
    if ps_pdf and ps_pdf.exists() and ps_pdf.stat().st_size > 0:
        try:
            rows = parse_ps_pdf_tables(ps_pdf)
        except Exception as e:  # noqa: BLE001
            rows = []
            print(f"WARN {ac_id}: could not parse {ps_pdf.name}: {e}", file=sys.stderr)
        if rows and len(rows) == n_booths:
            booths = [
                {
                    "id": f"{ac_id}-{b['boothNo']}",
                    "boothNo": b["boothNo"],
                    "num": b["num"],
                    "type": "regular",
                    "name": b["name"],
                    "address": b["address"],
                    "area": b.get("area", ""),
                }
                for b in rows
            ]
            return booths, "archive2_ps_pdf"
        text_rows = parse_polling_station_text(ps_pdf, int(ac_id.rsplit("-", 1)[1]), n_booths)
        if text_rows:
            booths = [
                {
                    "id": f"{ac_id}-{b['boothNo']}",
                    "boothNo": b["boothNo"],
                    "num": b["num"],
                    "type": "regular",
                    "name": b["name"],
                    "address": b["address"],
                    "area": b.get("area", ""),
                }
                for b in text_rows
            ]
            return booths, "archive2_ps_text"
        if rows:
            print(
                f"WARN {ac_id}: Poll_Station_Details.pdf has {len(rows)} rows, "
                f"Form20 has {n_booths} -- using synthetic numeric booth ids",
                file=sys.stderr,
            )
    booths = [
        {"id": f"{ac_id}-{n}", "boothNo": str(n), "num": n, "type": "regular", "name": "", "address": "", "area": ""}
        for n in range(1, n_booths + 1)
    ]
    return booths, "synthetic_numeric"


def build_doc_candidates(econ_candidates: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [
        {"slNo": i + 1, "name": c["name"], "party": c["party"], "symbol": ""}
        for i, c in enumerate(econ_candidates)
    ]


def process_ac(
    ac_no: int,
    dataset_root: Path,
    ac_map: dict[int, dict[str, Any]],
    elections: dict[str, Any],
    *,
    tolerance_pct: float,
    postal_ceiling_pct: float,
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
    non_nota_count = sum(1 for c in econ_candidates if c.get("party") != "NOTA")
    pdf_fallback = False
    ok, reason, candidate_cols, parsed_rows = validate_candidate_columns(header, rows, RESERVED_TRAILING)
    if not ok:
        # Retry with arithmetic layout recovery for address/elector columns and OCR-shifted
        # exports. This still fails closed if no exact candidate-sum invariant is found.
        ok, reason, candidate_cols, parsed_rows = recover_form20_layout(
            header, rows, non_nota_count
        )
    if not ok:
        # Some archive CSVs are structurally unusable even though their paired PDF
        # is perfectly parseable (rotated headers, alternate tail names, inserted
        # elector columns). Use the PDF only when every accepted booth is present
        # and sequential; otherwise keep the AC flagged instead of guessing IDs.
        form20_pdfs = list(folder.glob("*_Form_20.pdf"))
        pdf_rows = (
            parse_form20_pdf_rows(form20_pdfs[0], non_nota_count)
            if form20_pdfs
            else {}
        )
        expected_numbers = list(range(1, len(pdf_rows) + 1))
        if pdf_rows and sorted(pdf_rows) == expected_numbers:
            candidate_cols = [f"Candidate_{i + 1}" for i in range(non_nota_count)]
            parsed_rows = [
                [*pdf_rows[number][0], *pdf_rows[number][1:]]
                for number in expected_numbers
            ]
            ok = True
            pdf_fallback = True
        else:
            return {"acNo": ac_no, "acId": ac_id, "status": "flagged", "reason": f"csv/pdf shape: {reason}"}

    col_to_econ, matched_by, diagnostics = build_column_candidate_map(candidate_cols, parsed_rows, econ_candidates)
    valid, reason = validate_diagnostics(diagnostics, tolerance_pct)
    if not valid and not pdf_fallback:
        # A CSV can have valid arithmetic while its headers/columns are shifted.
        # Retry the paired PDF before flagging: its row arithmetic is independent
        # of the CSV header semantics. This is still fail-closed; the same vote
        # diagnostics must pass after the fallback mapping.
        form20_pdfs = list(folder.glob("*_Form_20.pdf"))
        pdf_rows = (
            parse_form20_pdf_rows(form20_pdfs[0], non_nota_count)
            if form20_pdfs
            else {}
        )
        expected_numbers = list(range(1, len(pdf_rows) + 1))
        if pdf_rows and sorted(pdf_rows) == expected_numbers:
            candidate_cols = [f"Candidate_{i + 1}" for i in range(non_nota_count)]
            parsed_rows = [[*pdf_rows[number][0], *pdf_rows[number][1:]] for number in expected_numbers]
            col_to_econ, matched_by, diagnostics = build_column_candidate_map(
                candidate_cols, parsed_rows, econ_candidates
            )
            valid, reason = validate_diagnostics(diagnostics, tolerance_pct)
            pdf_fallback = valid
            if valid:
                ok = True
    if not valid:
        return {
            "acNo": ac_no,
            "acId": ac_id,
            "status": "flagged",
            "reason": f"vote mismatch ({matched_by}): {reason}",
        }

    n_c = len(econ_candidates)
    nota_econ_idx = next((i for i, c in enumerate(econ_candidates) if c.get("party") == "NOTA"), None)
    n_cols = len(candidate_cols)

    ps_pdfs = list(folder.glob("*_Poll_Station_Details.pdf"))
    ac_name = econ.get("constituencyName") or row.get("name") or ac_id
    booths, booth_source = build_booths_from_pdf_or_synthetic(
        ac_id, ps_pdfs[0] if ps_pdfs else None, len(parsed_rows)
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
        rejected = vals[n_cols + 1]
        nota_val = vals[n_cols + 2]
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
        "source": (
            ps_pdfs[0].resolve().as_uri() if booth_source == "archive2_ps_pdf" else "archive2 (synthetic numeric ids)"
        ),
        "booths": booths,
    }

    strict_ok, max_abs = force_strict_to_elections(doc, econ, booths_doc, legacy_booth_ids_only=True)
    quality = compute_booth_data_quality(doc, booths_doc, econ)
    doc["dataQuality"] = quality

    # Safety net: if dropped/misattributed columns hid real votes, the postal residual
    # this AC now needs (official - booth_sum) will spike well above the normal ~0.5-1.5%
    # baseline. Refuse to write rather than silently mislabel real booth votes as postal.
    if quality["postalPct"] > postal_ceiling_pct:
        return {
            "acNo": ac_no,
            "acId": ac_id,
            "status": "flagged",
            "reason": f"postal residual {quality['postalPct']}% exceeds ceiling {postal_ceiling_pct}% "
            f"(matchedBy={matched_by}) -- likely dropped/misattributed columns",
        }

    return {
        "acNo": ac_no,
        "acId": ac_id,
        "status": "ok",
        "matchedBy": matched_by,
        "inputSource": "form20_pdf_fallback" if pdf_fallback else "form20_csv",
        "boothSource": booth_source,
        "boothCount": len(booths),
        "strictOk": strict_ok,
        "maxAbsDelta": max_abs,
        "tier": quality["tier"],
        "form20ParsedPct": quality["form20ParsedPct"],
        "postalPct": quality["postalPct"],
        "doc": doc,
        "boothsDoc": booths_doc,
    }


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--archive-dir", type=Path, default=DEFAULT_ARCHIVE_DIR)
    ap.add_argument("--ac", help="Comma-separated AC numbers, e.g. 1,52,234")
    ap.add_argument("--all", action="store_true", help="All TN ACs present in schema")
    ap.add_argument("--write", action="store_true", help="Write 2026.json + booths.json (default: dry-run report)")
    ap.add_argument(
        "--tolerance-pct", type=float, default=20.0, help="Max allowed per-candidate booth-vs-official error %%"
    )
    ap.add_argument(
        "--postal-ceiling-pct",
        type=float,
        default=5.0,
        help="Max allowed AC-wide postal residual %% before flagging instead of writing",
    )
    ap.add_argument(
        "--report-out", type=Path, default=REPO_ROOT / "scripts/cache/tn_2026_archive2_import_report.json"
    )
    args = ap.parse_args()

    if not args.ac and not args.all:
        ap.error("Specify --ac or --all")

    dataset_root = find_dataset_root(args.archive_dir)
    ac_map = load_schema_tn_ac_map()
    elections = load_tn_2026_elections()

    targets = sorted(ac_map.keys()) if args.all else [int(x.strip()) for x in args.ac.split(",")]

    summary = {"ok": 0, "flagged": 0, "skip": 0}
    flagged: list[dict[str, Any]] = []
    written: list[str] = []

    for ac_no in targets:
        result = process_ac(
            ac_no,
            dataset_root,
            ac_map,
            elections,
            tolerance_pct=args.tolerance_pct,
            postal_ceiling_pct=args.postal_ceiling_pct,
        )
        summary[result["status"]] = summary.get(result["status"], 0) + 1
        if result["status"] == "flagged":
            flagged.append(result)
            print(f"FLAGGED TN-{ac_no:03d}: {result['reason']}", file=sys.stderr)
            continue
        if result["status"] == "skip":
            print(f"SKIP TN-{ac_no:03d}: {result['reason']}", file=sys.stderr)
            continue

        print(
            f"OK TN-{ac_no:03d} ({result['acId']}): matchedBy={result['matchedBy']} "
            f"boothSource={result['boothSource']} booths={result['boothCount']} "
            f"strictOk={result['strictOk']} tier={result['tier']} form20Pct={result['form20ParsedPct']} "
            f"postalPct={result['postalPct']}"
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
