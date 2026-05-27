#!/usr/bin/env python3
"""
Verify TN 2026 postal vote data across all constituencies.

Checks per AC:
  - postal block present with correct candidate count
  - postal.booth + postal.postal == postal.total (per candidate)
  - booth_sum + postal + unmapped == official elections total (per candidate)
  - postal non-negative; postal <= official - booth
  - postalPct in sane range (flags >5% and >10%)
  - no residual_booth_fill rows
  - optional: stored postal matches Form20 PDF re-extraction

  python3 scripts/tn_2026_verify_postal.py --all
  python3 scripts/tn_2026_verify_postal.py --all --compare-pdf --no-ocr
  python3 scripts/tn_2026_verify_postal.py --all --ci
"""

from __future__ import annotations

import argparse
import copy
import json
import sys
from pathlib import Path

_SCRIPTS_DIR = Path(__file__).resolve().parent
if str(_SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS_DIR))

from tn_2026_accuracy_report import strict_deltas_for_ac
from tn_2026_booth_common import BOOTHS_TN, REPO_ROOT, load_schema_tn_ac_map, load_tn_2026_elections
from tn_2026_form20_2026 import extract_form20_postal_votes
from tn_2026_reconcile_votes import apply_honest_postal_and_unmapped


def verify_postal_ac(
    ac_id: str,
    ac_no: int,
    res_doc: dict,
    booths_doc: dict,
    econ: dict,
    *,
    pdf_path: Path | None,
    compare_pdf: bool,
    use_ocr: bool,
) -> dict:
    issues: list[str] = []
    warnings: list[str] = []

    cands = res_doc.get("candidates") or []
    n_c = len(cands)
    postal_block = res_doc.get("postal") or {}
    postal_cands = postal_block.get("candidates") or []
    unmapped_cands = (res_doc.get("unmapped") or {}).get("candidates") or []

    if not postal_cands:
        issues.append("missing postal.candidates")
    elif len(postal_cands) != n_c:
        issues.append(f"postal.candidates length {len(postal_cands)} != {n_c}")

    if unmapped_cands and len(unmapped_cands) != n_c:
        issues.append(f"unmapped.candidates length {len(unmapped_cands)} != {n_c}")

    postal_total = 0
    for i, pc in enumerate(postal_cands[:n_c]):
        booth = int(pc.get("booth") or 0)
        postal = int(pc.get("postal") or 0)
        total = int(pc.get("total") or 0)
        postal_total += postal
        if postal < 0:
            issues.append(f"candidate[{i}] negative postal={postal}")
        if booth + postal != total:
            issues.append(f"candidate[{i}] booth({booth})+postal({postal})!={total}")
        official = int((econ.get("candidates") or [{}])[i].get("votes") or 0) if i < len(econ.get("candidates") or []) else 0
        if postal > max(0, official - booth):
            issues.append(f"candidate[{i}] postal exceeds official-booth gap")

    ecands = econ.get("candidates") or []
    official_total = sum(int(c.get("votes") or 0) for c in ecands)
    postal_pct = round(100 * postal_total / max(1, official_total), 2)
    if postal_pct > 10:
        issues.append(f"postalPct={postal_pct}% (>10%, likely inflated)")
    elif postal_pct > 5:
        warnings.append(f"postalPct={postal_pct}% (>5%, unusual for TN)")

    residual = sum(
        1
        for rv in (res_doc.get("results") or {}).values()
        if rv.get("sourceNote") == "residual_booth_fill"
    )
    if residual:
        issues.append(f"{residual} booths still have residual_booth_fill")

    sums = [0] * n_c
    for rv in (res_doc.get("results") or {}).values():
        for j, v in enumerate(rv.get("votes") or []):
            if j < n_c:
                sums[j] += int(v or 0)

    ok_reconcile, max_d, mism, _ = strict_deltas_for_ac(booths_doc, res_doc, econ)
    if not ok_reconcile and mism:
        for m in mism[:3]:
            issues.append(
                f"totals: {m.get('name')}: booth+postal+unmapped delta={m.get('absDelta')}"
            )
    elif max_d > 0:
        issues.append(f"max candidate delta vs elections={max_d}")

    pdf_match: bool | None = None
    pdf_extracted: int | None = None
    if compare_pdf and pdf_path and pdf_path.exists():
        try:
            extracted = extract_form20_postal_votes(
                pdf_path,
                cands,
                use_ocr=use_ocr,
            )
        except Exception as e:
            warnings.append(f"PDF extract failed: {e}")
            extracted = None
        if extracted is None:
            warnings.append("Form20 PDF: no postal row parsed")
        elif len(extracted) != n_c:
            warnings.append(f"PDF postal length {len(extracted)} != {n_c}")
        else:
            pdf_extracted = sum(int(v or 0) for v in extracted)
            probe = copy.deepcopy(res_doc)
            apply_honest_postal_and_unmapped(probe, econ, booths_doc, extracted)
            expected = [
                int(pc.get("postal") or 0)
                for pc in (probe.get("postal") or {}).get("candidates") or []
            ][:n_c]
            stored_vals = [int(pc.get("postal") or 0) for pc in postal_cands[:n_c]]
            pdf_match = expected == stored_vals
            if not pdf_match:
                if sum(expected) != sum(stored_vals):
                    warnings.append(
                        f"capped postal {sum(stored_vals):,} != re-apply {sum(expected):,} "
                        f"(raw PDF {pdf_extracted:,})"
                    )
                else:
                    warnings.append("capped per-candidate postal differs from re-apply (sums match)")

    q = res_doc.get("dataQuality") or {}
    if q.get("postalPct") is not None and abs(float(q.get("postalPct") or 0) - postal_pct) > 0.15:
        warnings.append(
            f"dataQuality.postalPct={q.get('postalPct')} != computed {postal_pct}"
        )

    return {
        "acId": ac_id,
        "acNo": ac_no,
        "postalVotes": postal_total,
        "postalPct": postal_pct,
        "postalSource": postal_block.get("source"),
        "reconciledToElections": bool(res_doc.get("reconciledToElections")),
        "pdfMatch": pdf_match,
        "pdfExtractedTotal": pdf_extracted,
        "issues": issues,
        "warnings": warnings,
        "ok": len(issues) == 0,
    }


def main() -> None:
    ap = argparse.ArgumentParser(description="Verify TN 2026 postal vote data")
    ap.add_argument("--ac", help="Comma-separated TN-NNN")
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--compare-pdf", action="store_true", help="Re-extract postal from Form20 PDFs")
    ap.add_argument("--no-ocr", action="store_true", help="Skip OCR when comparing PDFs")
    ap.add_argument("--cache-dir", type=Path, default=REPO_ROOT / "scripts/cache/tn-2026-form20")
    ap.add_argument("--json", type=Path, help="Write JSON report")
    ap.add_argument("--ci", action="store_true", help="Exit 1 if any AC has issues")
    args = ap.parse_args()
    if not args.ac and not args.all:
        ap.error("Specify --ac or --all")

    ac_map = load_schema_tn_ac_map()
    elec = load_tn_2026_elections()

    if args.all:
        targets = sorted(ac_map.keys())
    else:
        targets = [int(p.strip().split("-")[1]) for p in args.ac.split(",")]

    rows: list[dict] = []
    for ac_no in targets:
        row = ac_map.get(ac_no)
        if not row:
            continue
        ac_id = row["schemaId"]
        rpath = BOOTHS_TN / ac_id / "2026.json"
        bpath = BOOTHS_TN / ac_id / "booths.json"
        if not rpath.exists():
            rows.append({"acId": ac_id, "ok": False, "issues": ["missing 2026.json"]})
            continue
        res_doc = json.loads(rpath.read_text(encoding="utf-8"))
        booths_doc = json.loads(bpath.read_text(encoding="utf-8")) if bpath.exists() else {"booths": []}
        econ = elec.get(ac_id) or {}
        pdf_path = args.cache_dir / f"AC{ac_no:03d}_f20.pdf"
        rows.append(
            verify_postal_ac(
                ac_id,
                ac_no,
                res_doc,
                booths_doc,
                econ,
                pdf_path=pdf_path,
                compare_pdf=args.compare_pdf,
                use_ocr=not args.no_ocr,
            )
        )

    ok_acs = [r for r in rows if r.get("ok")]
    fail_acs = [r for r in rows if not r.get("ok")]
    warn_acs = [r for r in rows if r.get("ok") and r.get("warnings")]
    postal_pcts = [float(r.get("postalPct") or 0) for r in rows if "postalPct" in r]

    summary = {
        "constituencies": len(rows),
        "pass": len(ok_acs),
        "fail": len(fail_acs),
        "withWarnings": len(warn_acs),
        "postalPct": {
            "median": round(sorted(postal_pcts)[len(postal_pcts) // 2], 2) if postal_pcts else 0,
            "max": round(max(postal_pcts), 2) if postal_pcts else 0,
            "over5pct": sum(1 for p in postal_pcts if p > 5),
            "over10pct": sum(1 for p in postal_pcts if p > 10),
        },
        "pdfCompared": sum(1 for r in rows if r.get("pdfMatch") is not None),
        "pdfExactMatch": sum(1 for r in rows if r.get("pdfMatch") is True),
        "pdfMismatch": [r["acId"] for r in rows if r.get("pdfMatch") is False],
        "failures": fail_acs,
        "highPostalPct": sorted(
            [{"acId": r["acId"], "postalPct": r.get("postalPct")} for r in rows if (r.get("postalPct") or 0) > 3],
            key=lambda x: -x["postalPct"],
        )[:15],
    }

    print("TN 2026 postal verification")
    print(json.dumps({k: v for k, v in summary.items() if k not in ("failures", "highPostalPct", "pdfMismatch")}, indent=2))
    if summary["postalPct"]["over10pct"]:
        print(f"\nERROR: {summary['postalPct']['over10pct']} ACs with postal >10%")
    if fail_acs:
        print(f"\nFailed ACs ({len(fail_acs)}):")
        for r in fail_acs[:20]:
            print(f"  {r['acId']}: {', '.join(r.get('issues') or [])}")
    if args.compare_pdf and summary["pdfMismatch"]:
        print(f"\nPDF vs stored mismatch ({len(summary['pdfMismatch'])}):")
        for ac_id in summary["pdfMismatch"][:20]:
            print(f"  {ac_id}")
    if summary.get("highPostalPct"):
        print("\nHighest postal % (>3%):")
        for r in summary["highPostalPct"]:
            print(f"  {r['acId']}: {r['postalPct']}%")

    if args.json:
        args.json.parent.mkdir(parents=True, exist_ok=True)
        out = {**summary, "rows": rows}
        args.json.write_text(json.dumps(out, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        print(f"\nWrote {args.json}")

    if args.ci and fail_acs:
        sys.exit(1)


if __name__ == "__main__":
    main()
