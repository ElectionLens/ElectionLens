"""TN 2026 Form20 booth-id coverage helpers (phase A gate)."""

from __future__ import annotations

import re
from typing import Any

from tn_2026_booth_common import booth_num_sort_key
from tn_2026_form20_2026 import resolve_booth_metas_for_form20_key, synthetic_booth_meta


def legacy_booth_ids(booths_doc: dict[str, Any]) -> set[str]:
    return {str(b["id"]) for b in booths_doc.get("booths", []) if b.get("id")}


def count_legacy_booths_mapped(by_booth: dict[str, Any], booths_doc: dict[str, Any]) -> int:
    """Count distinct legacy booth ids reachable from Form20 keys via boothNo/num resolver."""
    booths_list = list(booths_doc.get("booths") or [])
    ac_id = str(booths_doc.get("acId") or "")
    mapped: set[str] = set()
    for key in by_booth:
        for meta in resolve_booth_metas_for_form20_key(
            str(key), booths_list, ac_id=ac_id or None, allow_synthetic=True
        ):
            bid = meta.get("id")
            if bid:
                mapped.add(str(bid))
    return len(mapped)


def form20_key_maps_to_legacy(key: str, booths_doc: dict[str, Any]) -> bool:
    booths_list = list(booths_doc.get("booths") or [])
    ac_id = str(booths_doc.get("acId") or "")
    return bool(
        resolve_booth_metas_for_form20_key(
            str(key), booths_list, ac_id=ac_id or None, allow_synthetic=True
        )
    )


def phase_a_ok(booths_doc: dict[str, Any], res_doc: dict[str, Any]) -> tuple[bool, list[str], list[str]]:
    """
    Phase A: every legacy booth id has a results entry; no extra result keys.
    Returns (ok, missing_ids, extra_ids).
    """
    booth_ids = legacy_booth_ids(booths_doc)
    res_ids = set((res_doc.get("results") or {}).keys())
    missing = sorted(booth_ids - res_ids)
    extra = sorted(res_ids - booth_ids)
    return (not missing and not extra), missing, extra


def phase_a_score(missing: list[str], extra: list[str], n_results: int) -> tuple[int, int, int]:
    """Lower is better: (missing_count, extra_count, -n_results)."""
    return (len(missing), len(extra), -n_results)


def fill_zero_results_for_missing(
    doc: dict[str, Any],
    booths_doc: dict[str, Any],
    *,
    source_note: str = "no_form20_row",
) -> int:
    """Add zero-vote result rows for legacy booth ids missing from doc. Returns count added."""
    booth_ids = legacy_booth_ids(booths_doc)
    results = doc.setdefault("results", {})
    n_c = len(doc.get("candidates") or [])
    added = 0
    booths_by_id = {b["id"]: b for b in booths_doc.get("booths", []) if b.get("id")}
    for bid in sorted(booth_ids):
        if bid in results:
            continue
        meta = booths_by_id.get(bid) or {}
        votes = [0] * n_c if n_c else []
        results[bid] = {
            "votes": votes,
            "total": 0,
            "rejected": 0,
            "name": meta.get("name", ""),
            "address": meta.get("address", ""),
            "area": meta.get("area", ""),
            "sourceNote": source_note,
        }
        added += 1
    return added


def _booth_row_from_meta(meta: dict[str, Any], *, source_note: str) -> dict[str, Any]:
    return {
        "id": meta["id"],
        "boothNo": meta.get("boothNo", ""),
        "num": int(meta.get("num") or 0),
        "type": meta.get("type") or "regular",
        "name": meta.get("name") or "",
        "address": meta.get("address") or "",
        "area": meta.get("area") or "",
        "source": source_note,
    }


def merge_form20_booths_into_booths_doc(
    booths_doc: dict[str, Any],
    by_booth: dict[str, Any],
    *,
    ac_id: str,
    source_note: str = "Tamil Nadu CEO Form20 2026",
) -> tuple[int, list[str]]:
    """
    Append Form20-only PS rows (synthetic resolution) to booths_doc.booths.
    Returns (count_added, boothNos_added).
    """
    booths_list: list[dict[str, Any]] = list(booths_doc.get("booths") or [])
    known_ids = {str(b["id"]) for b in booths_list if b.get("id")}

    added_nos: list[str] = []
    for key in sorted(by_booth.keys(), key=lambda k: (len(str(k)), str(k))):
        metas = resolve_booth_metas_for_form20_key(
            str(key), booths_list, ac_id=ac_id, allow_synthetic=True
        )
        for meta in metas:
            if not meta.get("_form20Synthetic"):
                continue
            bid = str(meta.get("id") or "")
            if not bid or bid in known_ids:
                continue
            booths_list.append(_booth_row_from_meta(meta, source_note=source_note))
            known_ids.add(bid)
            added_nos.append(str(meta.get("boothNo") or key))

    booths_list.sort(key=lambda b: booth_num_sort_key(str(b.get("boothNo") or "")))
    booths_doc["booths"] = booths_list
    booths_doc["totalBooths"] = len(booths_list)
    return len(added_nos), added_nos


def merge_extra_result_ids_into_booths_doc(
    booths_doc: dict[str, Any],
    res_doc: dict[str, Any],
    *,
    ac_id: str,
    source_note: str = "Tamil Nadu CEO Form20 2026",
) -> tuple[int, list[str]]:
    """Add booths.json rows for result ids present in 2026.json but missing from metadata."""
    booths_list: list[dict[str, Any]] = list(booths_doc.get("booths") or [])
    known_ids = {str(b["id"]) for b in booths_list if b.get("id")}
    prefix = f"{ac_id}-"
    added: list[str] = []

    for bid in sorted((res_doc.get("results") or {}).keys()):
        if bid in known_ids:
            continue
        booth_no = bid[len(prefix) :] if bid.startswith(prefix) else bid
        m = re.match(r"^(\d+)", booth_no)
        num = int(m.group(1)) if m else 0
        meta = synthetic_booth_meta(ac_id, booth_no, num)
        rv = (res_doc.get("results") or {}).get(bid) or {}
        row = _booth_row_from_meta(meta, source_note=source_note)
        row["name"] = rv.get("name") or row["name"]
        row["address"] = rv.get("address") or row["address"]
        row["area"] = rv.get("area") or row["area"]
        booths_list.append(row)
        known_ids.add(bid)
        added.append(booth_no)

    if added:
        booths_list.sort(key=lambda b: booth_num_sort_key(str(b.get("boothNo") or "")))
        booths_doc["booths"] = booths_list
        booths_doc["totalBooths"] = len(booths_list)
    return len(added), added


def sync_booths_json_from_form20(
    ac_id: str,
    booths_doc: dict[str, Any],
    by_booth: dict[str, Any],
    res_doc: dict[str, Any] | None = None,
) -> tuple[dict[str, Any], int]:
    """Merge Form20 booths + optional 2026.json extras into booths_doc. Returns (doc, total_added)."""
    n1, _ = merge_form20_booths_into_booths_doc(booths_doc, by_booth, ac_id=ac_id)
    n2 = 0
    if res_doc is not None:
        n2, _ = merge_extra_result_ids_into_booths_doc(booths_doc, res_doc, ac_id=ac_id)
    return booths_doc, n1 + n2
