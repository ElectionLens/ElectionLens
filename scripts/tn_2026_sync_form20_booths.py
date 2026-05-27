#!/usr/bin/env python3
"""
Merge Form20-only polling stations into public/data/booths/TN/{ac}/booths.json.

Use after Form20 extraction when PDF lists PS numbers not in legacy CEO PS metadata.

  python3 scripts/tn_2026_sync_form20_booths.py --ac TN-001 --write
  python3 scripts/tn_2026_sync_form20_booths.py --all --in-scope-230 --write
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

_SCRIPTS_DIR = Path(__file__).resolve().parent
if str(_SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS_DIR))

from tn_2026_booth_common import BOOTHS_TN, REPO_ROOT, load_schema_tn_ac_map, load_tn_2026_elections
from tn_2026_form20_2026 import parse_form20_pdf
from tn_2026_form20_coverage import sync_booths_json_from_form20

EXCLUDED_IN_SCOPE_230: frozenset[int] = frozenset()


def main() -> None:
    ap = argparse.ArgumentParser(description="Sync Form20 PS rows into booths.json")
    ap.add_argument("--ac", help="Comma-separated TN-NNN")
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--in-scope-230", action="store_true")
    ap.add_argument("--write", action="store_true")
    ap.add_argument("--cache-dir", type=Path, default=REPO_ROOT / "scripts/cache/tn-2026-form20")
    ap.add_argument("--allow-extra-pdf-columns", action="store_true")
    ap.add_argument("--from-2026-json", action="store_true", help="Also merge result ids from existing 2026.json")
    args = ap.parse_args()
    if not args.ac and not args.all:
        ap.error("Specify --ac or --all")

    ac_map = load_schema_tn_ac_map()
    elec = load_tn_2026_elections()

    if args.all:
        targets = sorted(ac_map.keys())
        if args.in_scope_230:
            targets = [n for n in targets if n not in EXCLUDED_IN_SCOPE_230]
    else:
        targets = []
        for part in args.ac.split(","):
            m = re.match(r"^TN-(\d{3})$", part.strip(), re.I)
            if not m:
                ap.error(f"Bad --ac {part}")
            targets.append(int(m.group(1)))

    total_added = 0
    for ac_no in targets:
        row = ac_map[ac_no]
        ac_id = row["schemaId"]
        booths_path = BOOTHS_TN / ac_id / "booths.json"
        if not booths_path.exists():
            print(f"{ac_id}: skip (no booths.json)", file=sys.stderr)
            continue
        pdf_path = args.cache_dir / f"AC{ac_no:03d}_f20.pdf"
        if not pdf_path.exists():
            print(f"{ac_id}: skip (no Form20 PDF)", file=sys.stderr)
            continue

        booths_doc = json.loads(booths_path.read_text(encoding="utf-8"))
        econ = elec.get(ac_id) or {}
        cands = econ.get("candidates") or []
        by_booth: dict = {}
        try:
            _names, by_booth, *_ = parse_form20_pdf(
                pdf_path, cands, allow_extra_pdf_columns=args.allow_extra_pdf_columns
            )
        except Exception as e:
            if not args.from_2026_json:
                print(f"{ac_id}: parse failed: {e}", file=sys.stderr)
                continue
            print(f"{ac_id}: WARN pdf parse ({e}); syncing from 2026.json result ids only", file=sys.stderr)

        res_doc = None
        if args.from_2026_json:
            rpath = BOOTHS_TN / ac_id / "2026.json"
            if rpath.exists():
                res_doc = json.loads(rpath.read_text(encoding="utf-8"))

        before = len(booths_doc.get("booths") or [])
        sync_booths_json_from_form20(ac_id, booths_doc, by_booth, res_doc)
        after = len(booths_doc.get("booths") or [])
        n_add = after - before
        total_added += n_add

        if n_add:
            booths_doc["lastUpdated"] = "2026-05-08"
            booths_doc["source"] = booths_doc.get("source") or "Tamil Nadu CEO - Polling Stations + Form20 2026"
            msg = f"{ac_id}: +{n_add} booths ({before} -> {after})"
        else:
            msg = f"{ac_id}: booths.json unchanged ({after} booths)"

        if args.write:
            booths_path.write_text(json.dumps(booths_doc, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
            print(f"Wrote {booths_path} — {msg}")
        else:
            print(f"dry-run — {msg}")

    print(f"Total booths added: {total_added}")


if __name__ == "__main__":
    main()
