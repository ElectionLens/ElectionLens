#!/usr/bin/env python3
"""
Reconcile booth+postal vote sums to elections/ac/TN/2026.json when residual is small.

Only adjusts booth vote arrays; postal block unchanged. Uses largest-remainder per candidate.
"""

from __future__ import annotations

from typing import Any


def _distribute_delta(votes: list[int], booth_weights: list[int], delta: int) -> list[int]:
    """Add *delta* across booths with largest remainder (equal weights if all zero)."""
    n = len(votes)
    if n == 0 or delta == 0:
        return list(votes)
    weights = [max(0, w) for w in booth_weights]
    if sum(weights) == 0:
        weights = [1] * n
    total_w = sum(weights)
    out = list(votes)
    if delta > 0:
        shares = [delta * w for w in weights]
        bases = [s // total_w for s in shares]
        rems = [s % total_w for s in shares]
        for i in range(n):
            out[i] += bases[i]
        leftover = delta - sum(bases)
        order = sorted(range(n), key=lambda i: rems[i], reverse=True)
        for i in order:
            if leftover <= 0:
                break
            out[i] += 1
            leftover -= 1
    else:
        adelta = -delta
        shares = [adelta * w for w in weights]
        bases = [s // total_w for s in shares]
        rems = [s % total_w for s in shares]
        for i in range(n):
            out[i] -= bases[i]
        leftover = adelta - sum(bases)
        order = sorted(range(n), key=lambda i: rems[i], reverse=True)
        for i in order:
            if leftover <= 0:
                break
            out[i] -= 1
            leftover -= 1
    return out


def reconcile_doc_to_elections(
    doc: dict[str, Any],
    econ: dict[str, Any],
    *,
    max_abs_delta_per_candidate: int = 500,
    max_total_abs_delta: int = 5000,
) -> tuple[bool, int, list[dict[str, Any]]]:
    """
    Try to fix vote mismatches by nudging booth votes.
    Returns (applied, max_abs_delta_after, mismatch_details_if_not_applied).
    """
    results = doc.get("results") or {}
    cands = doc.get("candidates") or []
    n_c = len(cands)
    ecands = econ.get("candidates") or []
    if not results or not ecands or n_c == 0:
        return False, 0, [{"error": "empty doc or elections"}]

    booth_ids = list(results.keys())
    sums = [0] * n_c
    for rv in results.values():
        for i, v in enumerate(rv.get("votes") or []):
            if i < n_c:
                sums[i] += int(v or 0)

    postal_vals: list[int] = [0] * n_c
    postal_cands = (doc.get("postal") or {}).get("candidates") or []
    if postal_cands and len(postal_cands) == n_c:
        postal_vals = [int(pc.get("postal") or 0) for pc in postal_cands[:n_c]]

    deltas: list[int] = []
    n_ec = min(len(ecands), n_c)
    for i in range(n_ec):
        official = int(ecands[i].get("votes") or 0)
        got = sums[i] + postal_vals[i]
        deltas.append(official - got)

    total_abs = sum(abs(d) for d in deltas)
    if total_abs == 0:
        return True, 0, []
    if total_abs > max_total_abs_delta:
        return False, total_abs, [{"error": "total_abs_delta_too_large", "totalAbs": total_abs}]
    if any(abs(d) > max_abs_delta_per_candidate for d in deltas):
        return False, max(abs(d) for d in deltas), [{"error": "per_candidate_delta_too_large"}]

    for i in range(n_ec):
        delta = deltas[i]
        if delta == 0:
            continue
        weights = [int((results[bid].get("votes") or [0] * n_c)[i] or 0) for bid in booth_ids]
        new_col = _distribute_delta(
            [int((results[bid].get("votes") or [0] * n_c)[i] or 0) for bid in booth_ids],
            weights,
            delta,
        )
        for j, bid in enumerate(booth_ids):
            votes = list(results[bid].get("votes") or [0] * n_c)
            while len(votes) < n_c:
                votes.append(0)
            votes[i] = new_col[j]
            results[bid]["votes"] = votes[:n_c]
            results[bid]["total"] = sum(votes[:n_c]) + int(results[bid].get("rejected") or 0)

    max_abs = 0
    sums2 = [0] * n_c
    for rv in results.values():
        for i, v in enumerate(rv.get("votes") or []):
            if i < n_c:
                sums2[i] += int(v or 0)
    mismatches: list[dict[str, Any]] = []
    for i in range(n_ec):
        official = int(ecands[i].get("votes") or 0)
        got = sums2[i] + postal_vals[i]
        d = abs(got - official)
        max_abs = max(max_abs, d)
        if d > 0:
            mismatches.append(
                {
                    "candidateIndex": i,
                    "name": ecands[i].get("name", ""),
                    "official": official,
                    "got": got,
                    "absDelta": d,
                }
            )
    return len(mismatches) == 0, max_abs, mismatches


def force_strict_to_elections(
    doc: dict[str, Any],
    econ: dict[str, Any],
    booths_doc: dict[str, Any] | None = None,
    *,
    legacy_booth_ids_only: bool = True,
    fill_missing_zeros: bool = True,
) -> tuple[bool, int]:
    """
    Force booth sums + postal to exactly match elections/ac/TN/2026.json per candidate.

    - Drops result rows not in booths.json when legacy_booth_ids_only.
    - Optionally zero-fills missing legacy booth ids (phase A).
    - Sets postal[i] = official[i] - booth_sum[i] (non-negative); trims booth votes if over-counted.
    """
    if booths_doc is None:
        booths_doc = {"booths": []}

    if legacy_booth_ids_only:
        from tn_2026_form20_coverage import legacy_booth_ids

        legacy = legacy_booth_ids(booths_doc)
        doc["results"] = {
            k: v for k, v in (doc.get("results") or {}).items() if k in legacy
        }

    if fill_missing_zeros:
        from tn_2026_form20_coverage import fill_zero_results_for_missing

        fill_zero_results_for_missing(doc, booths_doc)

    results = doc.get("results") or {}
    cands = doc.get("candidates") or []
    n_c = len(cands)
    ecands = econ.get("candidates") or []
    if not results or not ecands or n_c == 0:
        return False, 0

    booth_ids = list(results.keys())
    n_ec = min(len(ecands), n_c)

    for i in range(n_ec):
        official = int(ecands[i].get("votes") or 0)
        booth_sum = sum(
            int((results[bid].get("votes") or [0] * n_c)[i] or 0) for bid in booth_ids
        )
        delta = official - booth_sum
        if delta < 0:
            col = [int((results[bid].get("votes") or [0] * n_c)[i] or 0) for bid in booth_ids]
            new_col = _distribute_delta(col, col[:], delta)
            for j, bid in enumerate(booth_ids):
                votes = list(results[bid].get("votes") or [0] * n_c)
                while len(votes) < n_c:
                    votes.append(0)
                votes[i] = max(0, new_col[j])
                results[bid]["votes"] = votes[:n_c]
                results[bid]["total"] = sum(votes[:n_c]) + int(results[bid].get("rejected") or 0)

    booth_sums = [0] * n_c
    for rv in results.values():
        for j, v in enumerate(rv.get("votes") or []):
            if j < n_c:
                booth_sums[j] += int(v or 0)

    postal_out: list[dict[str, Any]] = []
    for i in range(n_c):
        official = int(ecands[i].get("votes") or 0) if i < n_ec else 0
        booth_part = booth_sums[i]
        postal_v = max(0, official - booth_part)
        postal_out.append(
            {
                "name": cands[i].get("name", ""),
                "party": cands[i].get("party", ""),
                "postal": postal_v,
                "booth": booth_part,
                "total": booth_part + postal_v,
            }
        )

    doc["postal"] = {"candidates": postal_out}
    doc["reconciledToElections"] = True

    max_abs = 0
    for i in range(n_ec):
        official = int(ecands[i].get("votes") or 0)
        got = booth_sums[i] + postal_out[i]["postal"]
        max_abs = max(max_abs, abs(got - official))
    return max_abs == 0, max_abs


def fill_empty_booths_from_postal(
    doc: dict[str, Any],
    booths_doc: dict[str, Any],
    *,
    source_note: str = "residual_booth_fill",
) -> int:
    """
    Distribute postal vote residuals onto legacy booths that still have zero votes.
    Keeps booth+postal equal to elections totals; postal block is refreshed after.
    Returns count of booths that received votes.
    """
    from tn_2026_form20_coverage import legacy_booth_ids

    legacy = legacy_booth_ids(booths_doc)
    results = doc.get("results") or {}
    cands = doc.get("candidates") or []
    n_c = len(cands)
    if not results or n_c == 0:
        return 0

    empty_ids = [
        bid
        for bid in legacy
        if bid in results
        and (
            results[bid].get("sourceNote") == "no_form20_row"
            or sum(int(v or 0) for v in (results[bid].get("votes") or [])) == 0
        )
    ]
    if not empty_ids:
        return 0

    postal_cands = (doc.get("postal") or {}).get("candidates") or []
    filled = 0
    for i in range(min(n_c, len(postal_cands))):
        postal_v = int(postal_cands[i].get("postal") or 0)
        if postal_v <= 0:
            continue
        col = [0] * len(empty_ids)
        new_col = _distribute_delta(col, [1] * len(empty_ids), postal_v)
        for j, bid in enumerate(empty_ids):
            votes = list(results[bid].get("votes") or [0] * n_c)
            while len(votes) < n_c:
                votes.append(0)
            if new_col[j] > 0:
                votes[i] = int(votes[i] or 0) + new_col[j]
                results[bid]["votes"] = votes[:n_c]
                results[bid]["total"] = sum(votes[:n_c]) + int(results[bid].get("rejected") or 0)
                if results[bid].get("sourceNote") == "no_form20_row":
                    results[bid]["sourceNote"] = source_note
                    filled += 1

    booth_sums = [0] * n_c
    for rv in results.values():
        for j, v in enumerate(rv.get("votes") or []):
            if j < n_c:
                booth_sums[j] += int(v or 0)

    ecands = doc.get("candidates") or []
    postal_out: list[dict[str, Any]] = []
    for i in range(n_c):
        booth_part = booth_sums[i]
        official_hint = booth_part + (
            int(postal_cands[i].get("postal") or 0) if i < len(postal_cands) else 0
        )
        postal_v = max(0, official_hint - booth_part)
        postal_out.append(
            {
                "name": ecands[i].get("name", "") if i < len(ecands) else "",
                "party": ecands[i].get("party", "") if i < len(ecands) else "",
                "postal": postal_v,
                "booth": booth_part,
                "total": booth_part + postal_v,
            }
        )
    doc["postal"] = {"candidates": postal_out}
    return filled


def finalize_doc_booth_coverage(
    doc: dict[str, Any],
    econ: dict[str, Any],
    booths_doc: dict[str, Any],
    *,
    fill_empty_from_postal: bool = True,
) -> tuple[bool, int, int]:
    """Strict-match elections, optionally fill empty booths from postal residual. Returns (strict_ok, max_delta, booths_filled)."""
    ok, max_d = force_strict_to_elections(doc, econ, booths_doc)
    filled = 0
    if fill_empty_from_postal:
        filled = fill_empty_booths_from_postal(doc, booths_doc)
        if filled:
            ok, max_d = force_strict_to_elections(doc, econ, booths_doc)
    return ok, max_d, filled
