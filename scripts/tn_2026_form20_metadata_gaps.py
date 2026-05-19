#!/usr/bin/env python3
"""Analyze Form20 vs booths.json gaps; optional zero-fill for phase A completion."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

_SCRIPTS_DIR = Path(__file__).resolve().parent
if str(_SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS_DIR))

from tn_2026_booth_common import BOOTHS_TN, REPO_ROOT, load_schema_tn_ac_map
from tn_2026_form20_2026 import parse_form20_pdf, resolve_booth_metas_for_form20_key
from tn_2026_form20_coverage import fill_zero_results_for_missing, legacy_booth_ids, phase_a_ok


def analyze_ac(
    ac_id: str,
    pdf_path: Path,
    booths_doc: dict[str, Any],
    json_candidates: list[dict[str, Any]],
    *,
    allow_extra_pdf_columns: bool,
) -> dict[str, Any]:
    booths_list = list(booths_doc.get("booths") or [])
    nums = [int(b.get("num") or 0) for b in booths_list if b.get("num") is not None]
    max_num = max(nums) if nums else 0
    try:
        _names, by_booth, *_rest = parse_form20_pdf(
            pdf_path, json_candidates, allow_extra_pdf_columns=allow_extra_pdf_columns
        )
    except Exception as e:
        return {"acId": ac_id, "error": str(e)}
    form20_keys = sorted(by_booth.keys(), key=lambda x: (len(x), x))
    numeric_keys = [int(k) for k in form20_keys if str(k).isdigit()]
    max_form20 = max(numeric_keys) if numeric_keys else 0
    unmapped_keys: list[str] = []
    for k in form20_keys:
        if not resolve_booth_metas_for_form20_key(str(k), booths_list):
            unmapped_keys.append(str(k))
    return {
        "acId": ac_id,
        "nForm20Keys": len(form20_keys),
        "maxForm20NumericKey": max_form20,
        "maxBoothNum": max_num,
        "nLegacyBoothIds": len(legacy_booth_ids(booths_doc)),
        "unmappedForm20Keys": unmapped_keys[:20],
        "nUnmappedForm20Keys": len(unmapped_keys),
    }


def main() -> None:
    ap = argparse.ArgumentParser(description="TN 2026 Form20 vs booths.json gap analysis")
    ap.add_argument("--ac", help="TN-NNN")
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--cache-dir", type=Path, default=REPO_ROOT / "scripts/cache/tn-2026-form20")
    ap.add_argument("--json-out", type=Path)
    ap.add_argument("--allow-extra-pdf-columns", action="store_true")
    ap.add_argument(
        "--fill-missing-zeros",
        action="store_true",
        help="Write zero-vote rows into existing 2026.json for missing legacy booth ids",
    )
    args = ap.parse_args()
    if not args.ac and not args.all:
        ap.error("Specify --ac or --all")

    from tn_2026_booth_common import load_tn_2026_elections

    ac_map = load_schema_tn_ac_map()
    elec = load_tn_2026_elections()
    if args.all:
        targets = sorted(ac_map.keys())
    else:
        import re

        m = re.match(r"^TN-(\d{3})$", args.ac.strip(), re.I)
        if not m:
            ap.error("Bad --ac")
        targets = [int(m.group(1))]

    report: list[dict[str, Any]] = []
    for ac_no in targets:
        row = ac_map[ac_no]
        ac_id = row["schemaId"]
        pdf_path = args.cache_dir / f"AC{ac_no:03d}_f20.pdf"
        booths_path = BOOTHS_TN / ac_id / "booths.json"
        if not pdf_path.exists() or not booths_path.exists():
            continue
        booths_doc = json.loads(booths_path.read_text(encoding="utf-8"))
        econ = elec.get(ac_id) or {}
        entry = analyze_ac(
            ac_id,
            pdf_path,
            booths_doc,
            econ.get("candidates") or [],
            allow_extra_pdf_columns=args.allow_extra_pdf_columns,
        )
        report.append(entry)

        if args.fill_missing_zeros:
            rpath = BOOTHS_TN / ac_id / "2026.json"
            if rpath.exists():
                doc = json.loads(rpath.read_text(encoding="utf-8"))
                n = fill_zero_results_for_missing(doc, booths_doc)
                if n:
                    rpath.write_text(json.dumps(doc, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
                    entry["filledZeroRows"] = n
                    ok, miss, _extra = phase_a_ok(booths_doc, doc)
                    entry["phaseAOkAfterFill"] = ok
                    entry["stillMissing"] = miss[:8]

    if args.json_out:
        args.json_out.parent.mkdir(parents=True, exist_ok=True)
        args.json_out.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        print(f"Wrote {args.json_out}")
    else:
        print(json.dumps(report[:5], indent=2))


if __name__ == "__main__":
    main()
