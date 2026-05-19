#!/usr/bin/env python3
"""
TN LA 2026 Form20 master driver: orchestrated extraction + strict oracle + triage.

Runs primary + unified text strategies (see tn_2026_form20_orchestrator.py), scores each
attempt with strict_deltas_for_ac, keeps the best doc per AC, optionally writes 2026.json.

  python3 scripts/tn_2026_form20_master.py --ac TN-001 --write
  python3 scripts/tn_2026_form20_master.py --all --write --triage-out scripts/cache/tn-2026-form20-master-triage.json
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

from urllib.error import HTTPError, URLError

from tn_2026_accuracy_report import strict_deltas_for_ac
from tn_2026_booth_common import (
    BOOTHS_TN,
    FORM20_INDEX,
    REPO_ROOT,
    fetch_text,
    fallback_form20_pdf_url,
    http_get_retry,
    is_pdf_bytes,
    load_schema_tn_ac_map,
    filter_in_scope_ac_nos,
    is_skipped_form20_ocr,
    load_tn_2026_elections,
    parse_form20_links,
)
from tn_2026_form20_orchestrator import DEFAULT_STRATEGY_LADDER, Form20Strategy, build_2026_doc_from_pdf


def _score_tuple(ok: bool, max_d: int, n_miss: int) -> tuple[int, int, int]:
    return (0 if ok else 1, max_d, n_miss)


def _filtered_ladder(
    *,
    allow_extra: bool,
    ocr: bool,
    no_unified: bool,
) -> list[Form20Strategy]:
    ladder = list(DEFAULT_STRATEGY_LADDER)
    if not allow_extra:
        ladder = [s for s in ladder if not s.allow_extra_pdf_columns]
    if not ocr:
        ladder = [s for s in ladder if not s.ocr_fallback]
    if no_unified:
        ladder = [s for s in ladder if not s.unified_fallback and not s.ocr_fallback]
    if not ladder:
        ladder = [Form20Strategy("primary")]
    return ladder


def main() -> None:
    ap = argparse.ArgumentParser(description="TN 2026 Form20 master extract (unified fallback + strict gate)")
    ap.add_argument("--ac", help="Comma-separated TN-NNN ids")
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--in-scope-230", action="store_true", help="Exclude AC 213,214,217,218 from --all")
    ap.add_argument("--write", action="store_true", help="Write 2026.json when best attempt improves")
    ap.add_argument("--cache-dir", type=Path, default=REPO_ROOT / "scripts/cache/tn-2026-form20")
    ap.add_argument("--sleep", type=float, default=0.0)
    ap.add_argument("--fetch", action="store_true")
    ap.add_argument("--force-fetch", action="store_true")
    ap.add_argument(
        "--refresh-index",
        action="store_true",
        help="With --fetch: re-download Form20 HTML index",
    )
    ap.add_argument(
        "--allow-extra-pdf-columns",
        action="store_true",
        help="Allow rounds with --allow-extra-pdf-columns (Form20 wider than elections)",
    )
    ap.add_argument("--no-unified-fallback", action="store_true", help="Disable unified text strategies")
    ap.add_argument(
        "--triage-out",
        type=Path,
        default=None,
        help="Write JSON array of per-AC outcomes",
    )
    ap.add_argument("--max-rounds", type=int, default=3, help="Max strategy rounds per AC")
    ap.add_argument("--ocr", action="store_true", help="Include OCR strategy rounds in ladder")
    ap.add_argument("--no-surya", action="store_true")
    args = ap.parse_args()
    if not args.ac and not args.all:
        ap.error("Specify --ac or --all")

    ac_map = load_schema_tn_ac_map()
    elec_all = load_tn_2026_elections()

    if args.all:
        targets = filter_in_scope_ac_nos(
            sorted(ac_map.keys()),
            in_scope_230=args.in_scope_230,
            skip_ocr=True,
        )
    else:
        targets = []
        for part in args.ac.split(","):
            part = part.strip()
            m = re.match(r"^TN-(\d{3})$", part, re.I)
            if not m:
                print(f"Bad --ac {part}", file=sys.stderr)
                sys.exit(2)
            ac_no = int(m.group(1))
            if is_skipped_form20_ocr(ac_no):
                print(f"TN-{ac_no:03d}: skip (SKIP_FORM20_OCR_AC_NOS)", file=sys.stderr)
                continue
            targets.append(ac_no)

    args.cache_dir.mkdir(parents=True, exist_ok=True)
    cached_html = args.cache_dir / "Form20_TNLA2026.html"
    if args.fetch:
        if cached_html.exists() and not args.refresh_index:
            html = cached_html.read_text(encoding="utf-8")
        else:
            try:
                html = fetch_text(FORM20_INDEX)
            except (URLError, OSError, TimeoutError) as e:
                if cached_html.exists():
                    print(f"WARN: Form20 index fetch failed ({e}); using cached", file=sys.stderr)
                    html = cached_html.read_text(encoding="utf-8")
                else:
                    print(f"WARN: Form20 index fetch failed ({e}); empty index", file=sys.stderr)
                    html = "<html></html>"
            cached_html.write_text(html, encoding="utf-8")
    elif cached_html.exists():
        html = cached_html.read_text(encoding="utf-8")
    else:
        html = "<html></html>"
    links = dict(parse_form20_links(html))

    strategy_ladder = _filtered_ladder(
        allow_extra=args.allow_extra_pdf_columns,
        ocr=args.ocr,
        no_unified=args.no_unified_fallback,
    )

    triage: list[dict[str, Any]] = []

    for ac_no in targets:
        row = ac_map.get(ac_no)
        if not row:
            continue
        ac_id = row["schemaId"]
        econ = elec_all.get(ac_id)
        if not econ:
            print(f"No elections row for {ac_id}", file=sys.stderr)
            continue
        json_candidates = econ.get("candidates") or []
        pdf_url = links.get(ac_no) or fallback_form20_pdf_url(ac_no)
        pdf_path = args.cache_dir / f"AC{ac_no:03d}_f20.pdf"

        if args.fetch and pdf_url:
            want = not pdf_path.exists() or args.force_fetch
            if want:
                try:
                    raw = http_get_retry(pdf_url)
                except HTTPError as e:
                    triage.append({"acId": ac_id, "status": "fetch_http_error", "detail": str(e)})
                    continue
                except (URLError, OSError, TimeoutError) as e:
                    triage.append({"acId": ac_id, "status": "fetch_error", "detail": str(e)})
                    continue
                if is_pdf_bytes(raw):
                    pdf_path.write_bytes(raw)
                else:
                    triage.append({"acId": ac_id, "status": "fetch_not_pdf"})
                    continue
            if args.sleep:
                time.sleep(args.sleep)
        elif not pdf_path.exists():
            triage.append({"acId": ac_id, "status": "missing_pdf"})
            continue

        booths_path = BOOTHS_TN / ac_id / "booths.json"
        if not booths_path.exists():
            triage.append({"acId": ac_id, "status": "missing_booths_json"})
            continue
        booths_doc = json.loads(booths_path.read_text(encoding="utf-8"))

        best_doc: dict[str, Any] | None = None
        best_score: tuple[int, int, int] | None = None
        best_meta: dict[str, Any] = {}

        n_rounds = min(args.max_rounds, len(strategy_ladder))

        for round_i in range(n_rounds):
            strat = strategy_ladder[round_i]
            if not args.no_surya:
                strat = Form20Strategy(
                    strat.name,
                    strat.allow_extra_pdf_columns,
                    strat.unified_fallback,
                    strat.unified_gap_threshold,
                    strat.ocr_fallback,
                    strat.ocr_overwrite,
                    use_surya=True,
                )
            doc, meta = build_2026_doc_from_pdf(
                ac_id,
                row,
                econ,
                json_candidates,
                booths_doc,
                pdf_path,
                pdf_url or pdf_path.resolve().as_uri(),
                strategy=strat,
            )
            ok, max_d, mism, miss_b = strict_deltas_for_ac(booths_doc, doc, econ)
            sc = _score_tuple(ok, max_d, len(miss_b))
            if best_score is None or sc < best_score:
                best_score = sc
                best_doc = doc
                best_meta = dict(meta)
                best_meta["round"] = round_i
            if ok:
                break

        assert best_doc is not None
        final_ok, final_max, final_mism, final_miss = strict_deltas_for_ac(booths_doc, best_doc, econ)

        entry: dict[str, Any] = {
            "acId": ac_id,
            "strictOk": final_ok,
            "maxAbsDelta": final_max,
            "nMissingBooths": len(final_miss),
            "nMismatchedCandidates": len(final_mism),
            "meta": best_meta,
        }
        if not final_ok:
            if best_meta.get("image_only"):
                entry["failureClass"] = "image_only"
            elif best_meta.get("primary_error") and best_meta.get("primary_n", 0) == 0:
                entry["failureClass"] = "header_unreadable"
            elif len(final_miss) > 0:
                entry["failureClass"] = "missing_booth_results"
            elif len(final_mism) > 0:
                entry["failureClass"] = "vote_mismatch"
            else:
                entry["failureClass"] = "unknown"
        triage.append(entry)

        out_path = BOOTHS_TN / ac_id / "2026.json"
        if args.write:
            out_path.write_text(json.dumps(best_doc, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
            n_res = len(best_doc.get("results") or {})
            print(f"{ac_id}: wrote {out_path} ({n_res} booths) strictOk={final_ok}")
        else:
            n_res = len(best_doc.get("results") or {})
            print(f"{ac_id}: dry-run best {n_res} booths strictOk={final_ok} maxDelta={final_max}")

    if args.triage_out:
        args.triage_out.parent.mkdir(parents=True, exist_ok=True)
        args.triage_out.write_text(json.dumps(triage, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        print(f"Wrote triage {args.triage_out}")


if __name__ == "__main__":
    main()
