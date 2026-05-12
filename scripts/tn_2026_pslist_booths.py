#!/usr/bin/env python3
"""
Compare TN CEO PSLIST_06042026 English PDFs to existing public/data/booths/TN/{id}/booths.json.

By design this does **not** overwrite legacy `booths.json` (2021-era metadata). The 2026 pipeline
only updates `2026.json` via `tn_2026_form20_2026.py`. Use `--overwrite-booths-json` only if you
intentionally want to replace booth metadata from the CEO PS list.

  pip3 install -r scripts/requirements-booth.txt
  python3 scripts/tn_2026_pslist_booths.py --ac TN-001 --fetch --diff
  python3 scripts/tn_2026_pslist_booths.py --all --fetch --diff --sleep 0.25
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
from pathlib import Path
from typing import Any

_SCRIPTS_DIR = Path(__file__).resolve().parent
if str(_SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS_DIR))

from urllib.error import HTTPError

from tn_2026_booth_common import (
    BOOTHS_TN,
    PSLIST_INDEX,
    REPO_ROOT,
    booth_num_sort_key,
    ensure_pdfplumber,
    fetch_text,
    http_get_retry,
    is_pdf_bytes,
    load_schema_tn_ac_map,
    parse_pslist_english_links,
    parse_pslist_tamil_links,
    polling_station_type_to_booth_type,
    probe_pslist_pdf,
)


def load_elections_row(ac_id: str) -> dict[str, Any]:
    p = REPO_ROOT / "public/data/elections/ac/TN/2026.json"
    data = json.loads(p.read_text(encoding="utf-8"))
    return data.get(ac_id, {})


def parse_ps_pdf_tables(path: Path, *, min_name_len: int = 6) -> list[dict[str, Any]]:
    ensure_pdfplumber()
    import pdfplumber

    booths: list[dict[str, Any]] = []
    with pdfplumber.open(str(path)) as pdf:
        for page in pdf.pages:
            for table in page.extract_tables() or []:
                if not table or len(table) < 3:
                    continue
                for row in table[2:]:
                    if not row:
                        continue
                    if len(row) >= 5:
                        sl = (row[0] or "").replace("\n", " ").strip()
                        psn = (row[1] or "").replace("\n", " ").strip()
                        if re.match(r"^Sl", sl, re.I):
                            continue
                        if sl == "1" and psn == "2" and (row[2] or "").strip() in ("3", "4", "5"):
                            continue
                        if not psn:
                            continue
                        if not re.match(r"^[\dA-Za-z().\-/]+$", psn):
                            continue
                        name = (row[2] or "").replace("\n", " ").strip()
                        if not name or len(name) < min_name_len:
                            continue
                        area = (row[3] or "").replace("\n", " ").strip()
                        pst = (row[4] or "").replace("\n", " ").strip()
                        mnum = re.match(r"^(\d+)", psn)
                        num = int(mnum.group(1)) if mnum else 0
                        booths.append(
                            {
                                "boothNo": psn,
                                "num": num,
                                "name": name,
                                "address": name,
                                "area": area,
                                "pst": pst,
                            }
                        )
                    elif len(row) >= 4:
                        # Alternate CEO layout: booth no | building | polling areas | station type (4 cols).
                        psn = (row[0] or "").replace("\n", " ").strip()
                        name = (row[1] or "").replace("\n", " ").strip()
                        area = (row[2] or "").replace("\n", " ").strip()
                        pst = (row[3] or "").replace("\n", " ").strip()
                        if re.match(r"^Sl", psn, re.I):
                            continue
                        if psn in ("2", "3", "4", "5") and len(name) <= 2:
                            continue
                        if not psn or not name:
                            continue
                        if not re.match(r"^[\dA-Za-z().\-/]+$", psn):
                            continue
                        if len(name) < min_name_len:
                            continue
                        mnum = re.match(r"^(\d+)", psn)
                        num = int(mnum.group(1)) if mnum else 0
                        booths.append(
                            {
                                "boothNo": psn,
                                "num": num,
                                "name": name,
                                "address": name,
                                "area": area,
                                "pst": pst,
                            }
                        )
    seen: set[str] = set()
    uniq: list[dict[str, Any]] = []
    for b in booths:
        k = b["boothNo"]
        if k in seen:
            continue
        seen.add(k)
        uniq.append(b)
    uniq.sort(key=lambda x: booth_num_sort_key(x["boothNo"]))
    return uniq


def build_booths_json(
    ac_id: str,
    ac_name: str,
    rows: list[dict[str, Any]],
    source_url: str,
) -> dict[str, Any]:
    booths_out: list[dict[str, Any]] = []
    for b in rows:
        booth_no = b["boothNo"]
        bid = f"{ac_id}-{booth_no}"
        booths_out.append(
            {
                "id": bid,
                "boothNo": booth_no,
                "num": b["num"],
                "type": polling_station_type_to_booth_type(b.get("pst", "")),
                "name": b["name"],
                "address": b["address"],
                "area": b["area"],
            }
        )
    return {
        "acId": ac_id,
        "acName": ac_name,
        "state": "Tamil Nadu",
        "totalBooths": len(booths_out),
        "lastUpdated": "2026-04-06",
        "source": source_url,
        "booths": booths_out,
    }


def diff_booths(old: dict[str, Any] | None, new: dict[str, Any]) -> dict[str, Any]:
    old_ids = [b["id"] for b in (old or {}).get("booths", [])]
    new_ids = [b["id"] for b in new.get("booths", [])]
    old_set, new_set = set(old_ids), set(new_ids)
    added = sorted(new_set - old_set)
    removed = sorted(old_set - new_set)
    changed: list[dict[str, str]] = []
    old_by_id = {b["id"]: b for b in (old or {}).get("booths", [])}
    new_by_id = {b["id"]: b for b in new.get("booths", [])}
    for bid in sorted(old_set & new_set):
        o, n = old_by_id[bid], new_by_id[bid]
        for field in ("name", "address", "area", "type"):
            if (o.get(field) or "") != (n.get(field) or ""):
                changed.append({"id": bid, "field": field})
                break
    return {"added": added, "removed": removed, "changed": changed}


def main() -> None:
    ap = argparse.ArgumentParser(description="TN 2026 PS list → booths.json")
    ap.add_argument("--ac", help="Comma-separated schema AC ids (e.g. TN-001,TN-018)")
    ap.add_argument("--all", action="store_true", help="All TN ACs in schema (234)")
    ap.add_argument("--fetch", action="store_true", help="Download index HTML / PDFs")
    ap.add_argument(
        "--overwrite-booths-json",
        action="store_true",
        help="Write booths.json from CEO PS list (overwrites legacy booth metadata; not part of normal 2026-only updates)",
    )
    ap.add_argument("--diff", action="store_true", help="Print diff report (default)")
    ap.add_argument("--cache-dir", type=Path, default=REPO_ROOT / "scripts/cache/tn-2026-pslist")
    ap.add_argument("--sleep", type=float, default=0.0, help="Seconds between HTTP GETs when --fetch")
    ap.add_argument(
        "--force-fetch",
        action="store_true",
        help="Re-download PDFs even if already present under --cache-dir",
    )
    args = ap.parse_args()

    if not args.ac and not args.all:
        ap.error("Specify --ac or --all")

    ac_map = load_schema_tn_ac_map()
    if args.all:
        targets = sorted(ac_map.keys())
    else:
        targets = []
        for part in args.ac.split(","):
            part = part.strip()
            m = re.match(r"^TN-(\d{3})$", part, re.I)
            if not m:
                print(f"Bad --ac {part}", file=sys.stderr)
                sys.exit(2)
            targets.append(int(m.group(1)))

    args.cache_dir.mkdir(parents=True, exist_ok=True)
    cached_index = args.cache_dir / "PSLIST_06042026.html"
    if args.fetch:
        index_html = fetch_text(PSLIST_INDEX)
        cached_index.write_text(index_html, encoding="utf-8")
    elif cached_index.exists():
        index_html = cached_index.read_text(encoding="utf-8")
    else:
        # Staged ACnnn_en.pdf only (no CEO HTML): empty index — links stay empty; local PDFs still work.
        index_html = "<html></html>"

    links_en = dict(parse_pslist_english_links(index_html))
    links_ta = dict(parse_pslist_tamil_links(index_html))

    show_diff = args.diff or not args.overwrite_booths_json
    for ac_no in targets:
        row = ac_map.get(ac_no)
        if not row:
            print(f"Skip unknown acNo {ac_no}", file=sys.stderr)
            continue
        ac_id = row["schemaId"]
        pdf_url_en = links_en.get(ac_no)
        pdf_url_ta = links_ta.get(ac_no)
        pdf_path_en = args.cache_dir / f"AC{ac_no:03d}_en.pdf"
        pdf_path_ta = args.cache_dir / f"AC{ac_no:03d}_ta.pdf"

        def _ps_head_ok(p: Path) -> bool:
            if not p.exists():
                return False
            try:
                with p.open("rb") as fh:
                    return is_pdf_bytes(fh.read(8192))
            except OSError:
                return False

        if not pdf_url_en and not pdf_url_ta:
            if not (_ps_head_ok(pdf_path_en) or _ps_head_ok(pdf_path_ta)):
                # No index links (offline / empty HTML). Downstream still tries probe_pslist_pdf.
                pass

        def _try_fetch_ps(url: str | None, dest: Path) -> bool:
            if not url:
                return False
            if dest.exists() and not args.force_fetch and _ps_head_ok(dest):
                return True
            try:
                raw = http_get_retry(url)
            except HTTPError as e:
                if e.code != 404:
                    print(f"WARN {ac_id}: cannot fetch PS PDF ({e.code}) {url}", file=sys.stderr)
                return False
            if not is_pdf_bytes(raw):
                print(f"WARN {ac_id}: response is not a PDF {url}", file=sys.stderr)
                return False
            dest.write_bytes(raw)
            return True

        pdf_path: Path
        source_url = ""
        if args.fetch:
            _try_fetch_ps(pdf_url_en, pdf_path_en)
            if not _ps_head_ok(pdf_path_en):
                _try_fetch_ps(pdf_url_ta, pdf_path_ta)
            if _ps_head_ok(pdf_path_en):
                pdf_path = pdf_path_en
                source_url = pdf_url_en or pdf_path_en.resolve().as_uri()
            elif _ps_head_ok(pdf_path_ta):
                pdf_path = pdf_path_ta
                source_url = pdf_url_ta or pdf_path_ta.resolve().as_uri()
            else:
                probed = probe_pslist_pdf(ac_no)
                if probed:
                    raw, url = probed
                    pdf_path_en.write_bytes(raw)
                    pdf_path = pdf_path_en
                    source_url = url
                else:
                    print(f"WARN {ac_id}: no usable PS PDF (English/Tamil fetch or cache)", file=sys.stderr)
                    continue
            if args.sleep:
                time.sleep(args.sleep)
        else:
            if _ps_head_ok(pdf_path_en):
                pdf_path = pdf_path_en
                source_url = pdf_url_en or pdf_path_en.resolve().as_uri()
            elif _ps_head_ok(pdf_path_ta):
                pdf_path = pdf_path_ta
                source_url = pdf_url_ta or pdf_path_ta.resolve().as_uri()
            else:
                probed = probe_pslist_pdf(ac_no)
                if probed:
                    raw, url = probed
                    pdf_path_en.write_bytes(raw)
                    pdf_path = pdf_path_en
                    source_url = url
                else:
                    print(
                        f"Missing cached PS PDF {pdf_path_en} / {pdf_path_ta}; use --fetch or scripts/tn_2026_stage_desktop_pdfs.py",
                        file=sys.stderr,
                    )
                    continue

        try:
            ta_pdf = pdf_path.name.endswith("_ta.pdf")
            rows = parse_ps_pdf_tables(pdf_path, min_name_len=4 if ta_pdf else 6)
        except Exception as e:
            print(f"WARN {ac_id}: cannot parse PS PDF {pdf_path}: {e}", file=sys.stderr)
            continue
        el = load_elections_row(ac_id)
        ac_name = (el.get("constituencyName") or el.get("name") or row.get("name") or ac_id).upper()
        new_doc = build_booths_json(ac_id, ac_name, rows, source_url)

        out_path = BOOTHS_TN / ac_id / "booths.json"
        old_doc = None
        if out_path.exists():
            old_doc = json.loads(out_path.read_text(encoding="utf-8"))

        if show_diff:
            rep = diff_booths(old_doc, new_doc)
            print(f"=== {ac_id} ({ac_name}) total {new_doc['totalBooths']} ===")
            print(f"  added: {len(rep['added'])} removed: {len(rep['removed'])} changed: {len(rep['changed'])}")
            if rep["added"][:10]:
                print("  sample added:", rep["added"][:10])
            if rep["removed"][:10]:
                print("  sample removed:", rep["removed"][:10])

        if args.overwrite_booths_json:
            out_path.parent.mkdir(parents=True, exist_ok=True)
            out_path.write_text(json.dumps(new_doc, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
            print(f"Wrote {out_path}")


if __name__ == "__main__":
    main()
