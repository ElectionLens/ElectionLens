#!/usr/bin/env python3
"""
TN LA 2026 Form20 batch driver: retry strategy ladder until phase A (booth coverage) and/or
phase B (strict elections match) succeed.

  python3 scripts/tn_2026_form20_until_done.py --ac TN-001 --phase ab --write
  python3 scripts/tn_2026_form20_until_done.py --all --in-scope-230 --phase ab --write --ocr
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any

_SCRIPTS_DIR = Path(__file__).resolve().parent
if str(_SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS_DIR))

from tn_2026_accuracy_report import strict_deltas_for_ac
from tn_2026_booth_common import (
    BOOTHS_TN,
    REPO_ROOT,
    filter_in_scope_ac_nos,
    is_skipped_form20_ocr,
    load_schema_tn_ac_map,
    load_tn_2026_elections,
)
from tn_2026_form20_coverage import (
    fill_zero_results_for_missing,
    merge_extra_result_ids_into_booths_doc,
    phase_a_ok,
    phase_a_score,
    sync_booths_json_from_form20,
)
from tn_2026_form20_2026 import parse_form20_pdf
from tn_2026_form20_orchestrator import DEFAULT_STRATEGY_LADDER, Form20Strategy, build_2026_doc_from_pdf
from tn_2026_reconcile_votes import reconcile_doc_to_elections

def _strict_score(ok: bool, max_d: int, n_miss: int) -> tuple[int, int, int]:
    return (0 if ok else 1, max_d, n_miss)


def _combined_score(
    phase: str,
    phase_a_ok_flag: bool,
    missing: list[str],
    extra: list[str],
    n_results: int,
    strict_ok: bool,
    max_d: int,
) -> tuple:
    if phase == "a":
        return phase_a_score(missing, extra, n_results)
    if phase == "b":
        return _strict_score(strict_ok, max_d, 0)
    # ab: phase A first, then strict
    if not phase_a_ok_flag:
        return (1, *phase_a_score(missing, extra, n_results))
    return _strict_score(strict_ok, max_d, 0)


def _ac_passes(phase: str, phase_a_ok_flag: bool, strict_ok: bool) -> bool:
    if phase == "a":
        return phase_a_ok_flag
    if phase == "b":
        return strict_ok
    return phase_a_ok_flag and strict_ok


def main() -> None:
    ap = argparse.ArgumentParser(description="TN 2026 Form20 until phase A/B targets met")
    ap.add_argument("--ac", help="Comma-separated TN-NNN ids")
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--in-scope-230", action="store_true")
    ap.add_argument("--phase", choices=("a", "b", "ab"), default="ab")
    ap.add_argument("--write", action="store_true")
    ap.add_argument(
        "--sync-booths-json",
        action="store_true",
        help="With --write: append Form20-only PS rows to booths.json",
    )
    ap.add_argument("--cache-dir", type=Path, default=REPO_ROOT / "scripts/cache/tn-2026-form20")
    ap.add_argument("--max-outer-rounds", type=int, default=20)
    ap.add_argument("--max-strategy-index", type=int, default=None, help="0-based cap on strategy ladder")
    ap.add_argument("--allow-extra-pdf-columns", action="store_true")
    ap.add_argument("--ocr", action="store_true", help="Include OCR strategy rounds (needs tesseract)")
    ap.add_argument("--no-surya", action="store_true")
    ap.add_argument(
        "--fill-missing-zeros",
        action="store_true",
        help="After best extract, zero-fill legacy booth ids with no Form20 row (phase A)",
    )
    ap.add_argument(
        "--reconcile",
        action="store_true",
        help="If phase A ok but strict fails with small delta, nudge booth votes (phase B)",
    )
    ap.add_argument("--reconcile-max-total", type=int, default=5000)
    ap.add_argument("--reconcile-max-per-cand", type=int, default=500)
    ap.add_argument("--stop-on-no-progress", action="store_true", default=True)
    ap.add_argument("--no-stop-on-no-progress", action="store_false", dest="stop_on_no_progress")
    ap.add_argument("--triage-out", type=Path, default=REPO_ROOT / "scripts/cache/tn-2026-form20-until-done-triage.json")
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

    ladder = list(DEFAULT_STRATEGY_LADDER)
    if not args.allow_extra_pdf_columns:
        ladder = [s for s in ladder if not s.allow_extra_pdf_columns]
    if not args.ocr:
        ladder = [s for s in ladder if not s.ocr_fallback]
    if args.max_strategy_index is not None:
        ladder = ladder[: args.max_strategy_index + 1]

    # Per-AC state
    state: dict[str, dict[str, Any]] = {}
    for ac_no in targets:
        row = ac_map.get(ac_no)
        if not row:
            continue
        ac_id = row["schemaId"]
        pdf_path = args.cache_dir / f"AC{ac_no:03d}_f20.pdf"
        if not pdf_path.exists():
            state[ac_id] = {"status": "missing_pdf", "acNo": ac_no}
            continue
        if not (BOOTHS_TN / ac_id / "booths.json").exists():
            state[ac_id] = {"status": "missing_booths_json", "acNo": ac_no}
            continue
        state[ac_id] = {
            "status": "pending",
            "acNo": ac_no,
            "strategyIndex": 0,
            "bestDoc": None,
            "bestScore": None,
            "bestMeta": {},
        }

    for outer in range(args.max_outer_rounds):
        pending = [aid for aid, st in state.items() if st.get("status") == "pending"]
        if not pending:
            break
        improved_any = False
        for ac_id in pending:
            st = state[ac_id]
            ac_no = st["acNo"]
            row = ac_map[ac_no]
            econ = elec_all.get(ac_id)
            if not econ:
                st["status"] = "no_elections"
                continue
            booths_doc = json.loads((BOOTHS_TN / ac_id / "booths.json").read_text(encoding="utf-8"))
            pdf_path = args.cache_dir / f"AC{ac_no:03d}_f20.pdf"
            si = min(st["strategyIndex"], len(ladder) - 1)
            strategy: Form20Strategy = ladder[si]
            if not args.no_surya:
                strategy = Form20Strategy(
                    strategy.name,
                    strategy.allow_extra_pdf_columns,
                    strategy.unified_fallback,
                    strategy.unified_gap_threshold,
                    strategy.ocr_fallback,
                    strategy.ocr_overwrite,
                    use_surya=True,
                )

            doc, meta = build_2026_doc_from_pdf(
                ac_id,
                row,
                econ,
                econ.get("candidates") or [],
                booths_doc,
                pdf_path,
                pdf_path.resolve().as_uri(),
                strategy=strategy,
            )

            if args.fill_missing_zeros:
                fill_zero_results_for_missing(doc, booths_doc)

            pa_ok, missing, extra = phase_a_ok(booths_doc, doc)
            strict_ok, max_d, mism, miss_b = strict_deltas_for_ac(booths_doc, doc, econ)
            n_res = len(doc.get("results") or {})

            if args.reconcile and pa_ok and not strict_ok:
                applied, max_after, _rem = reconcile_doc_to_elections(
                    doc,
                    econ,
                    max_abs_delta_per_candidate=args.reconcile_max_per_cand,
                    max_total_abs_delta=args.reconcile_max_total,
                )
                if applied:
                    strict_ok, max_d, mism, miss_b = strict_deltas_for_ac(booths_doc, doc, econ)
                    meta["reconciled"] = True
                    meta["maxAbsDeltaAfterReconcile"] = max_after

            score = _combined_score(args.phase, pa_ok, missing, extra, n_res, strict_ok, max_d)
            if st["bestScore"] is None or score < st["bestScore"]:
                st["bestScore"] = score
                st["bestDoc"] = doc
                st["bestMeta"] = dict(meta)
                st["bestMeta"]["strategyIndex"] = si
                improved_any = True

            passes = _ac_passes(args.phase, pa_ok, strict_ok)
            print(
                f"round={outer} {ac_id} strat={strategy.name} "
                f"phaseA={pa_ok} strict={strict_ok} maxDelta={max_d} "
                f"results={n_res} missing={len(missing)} mappedFrac={meta.get('mappedLegacyFraction')}"
            )

            if passes:
                st["status"] = "done"
                st["finalMeta"] = meta
                continue

            if si + 1 < len(ladder):
                st["strategyIndex"] = si + 1
            else:
                st["status"] = "stuck"
                st["finalMeta"] = meta
                st["phaseAOk"] = pa_ok
                st["strictOk"] = strict_ok
                st["maxAbsDelta"] = max_d
                st["nMissing"] = len(missing)

        if args.write:
            for ac_id, st in state.items():
                if st.get("bestDoc") is None:
                    continue
                out_path = BOOTHS_TN / ac_id / "2026.json"
                out_path.write_text(
                    json.dumps(st["bestDoc"], indent=2, ensure_ascii=False) + "\n",
                    encoding="utf-8",
                )
                if args.sync_booths_json:
                    ac_no = st.get("acNo")
                    pdf_path = args.cache_dir / f"AC{ac_no:03d}_f20.pdf"
                    booths_path = BOOTHS_TN / ac_id / "booths.json"
                    if pdf_path.exists() and booths_path.exists():
                        booths_doc = json.loads(booths_path.read_text(encoding="utf-8"))
                        econ = elec_all.get(ac_id) or {}
                        try:
                            _names, by_booth, *_ = parse_form20_pdf(
                                pdf_path,
                                econ.get("candidates") or [],
                                allow_extra_pdf_columns=args.allow_extra_pdf_columns,
                            )
                            n_before = len(booths_doc.get("booths") or [])
                            sync_booths_json_from_form20(
                                ac_id, booths_doc, by_booth, st["bestDoc"]
                            )
                            if len(booths_doc.get("booths") or []) > n_before:
                                booths_doc["lastUpdated"] = "2026-05-08"
                                booths_path.write_text(
                                    json.dumps(booths_doc, indent=2, ensure_ascii=False) + "\n",
                                    encoding="utf-8",
                                )
                            # Re-align 2026.json after booths.json grew (phase A).
                            doc = st["bestDoc"]
                            fill_zero_results_for_missing(doc, booths_doc)
                            merge_extra_result_ids_into_booths_doc(booths_doc, doc, ac_id=ac_id)
                            out_path.write_text(
                                json.dumps(doc, indent=2, ensure_ascii=False) + "\n",
                                encoding="utf-8",
                            )
                            pa_ok, missing, extra = phase_a_ok(booths_doc, doc)
                            if args.phase in ("a", "ab") and pa_ok and st.get("status") == "stuck":
                                st["status"] = "done"
                                st["phaseAOk"] = True
                        except Exception as e:
                            print(f"{ac_id}: booths.json sync failed: {e}", file=sys.stderr)

        if not improved_any and args.stop_on_no_progress:
            print(f"No improvement in outer round {outer}; stopping.", file=sys.stderr)
            break

    triage: list[dict[str, Any]] = []
    for ac_id, st in sorted(state.items()):
        entry: dict[str, Any] = {"acId": ac_id, **{k: v for k, v in st.items() if k not in ("bestDoc",)}}
        if st.get("bestDoc") and st.get("status") != "missing_pdf":
            booths_doc = json.loads((BOOTHS_TN / ac_id / "booths.json").read_text(encoding="utf-8"))
            doc = st["bestDoc"]
            econ = elec_all.get(ac_id) or {}
            pa_ok, missing, extra = phase_a_ok(booths_doc, doc)
            strict_ok, max_d, mism, miss_b = strict_deltas_for_ac(booths_doc, doc, econ)
            entry["phaseAOk"] = pa_ok
            entry["strictOk"] = strict_ok
            entry["maxAbsDelta"] = max_d
            entry["nMissingLegacyBoothIds"] = len(missing)
            entry["nMismatchedCandidates"] = len(mism)
            if not pa_ok:
                entry["failureClass"] = "missing_booth_results"
            elif not strict_ok:
                entry["failureClass"] = "vote_mismatch"
            if st.get("bestMeta", {}).get("image_only"):
                entry["failureClass"] = "image_only"
            if not entry.get("hasPostal") and st.get("bestMeta"):
                entry["hasPostal"] = st["bestMeta"].get("hasPostal")
        triage.append(entry)

    # Final phase-A pass on all written ACs (fast; fixes booths.json ↔ 2026.json drift).
    if args.write and args.fill_missing_zeros:
        fin_ok = 0
        for ac_id, st in state.items():
            if st.get("bestDoc") is None:
                continue
            bpath = BOOTHS_TN / ac_id / "booths.json"
            if not bpath.exists():
                continue
            booths_doc = json.loads(bpath.read_text(encoding="utf-8"))
            doc = st["bestDoc"]
            fill_zero_results_for_missing(doc, booths_doc)
            merge_extra_result_ids_into_booths_doc(booths_doc, doc, ac_id=ac_id)
            (BOOTHS_TN / ac_id / "2026.json").write_text(
                json.dumps(doc, indent=2, ensure_ascii=False) + "\n",
                encoding="utf-8",
            )
            bpath.write_text(json.dumps(booths_doc, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
            pa_ok, _m, _e = phase_a_ok(booths_doc, doc)
            if pa_ok and args.phase in ("a", "ab"):
                st["status"] = "done"
                fin_ok += 1
        print(f"Finalize phase-A pass: {fin_ok} ACs marked done", file=sys.stderr)

    done = sum(1 for t in triage if t.get("status") == "done")
    stuck = sum(1 for t in triage if t.get("status") == "stuck")
    print(f"Finished: done={done} stuck={stuck} other={len(triage) - done - stuck}")

    if args.triage_out:
        args.triage_out.parent.mkdir(parents=True, exist_ok=True)
        args.triage_out.write_text(json.dumps(triage, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        print(f"Wrote triage {args.triage_out}")


if __name__ == "__main__":
    main()
