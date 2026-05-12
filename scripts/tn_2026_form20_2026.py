#!/usr/bin/env python3
"""
Parse TN CEO Form20_TNLA2026 per-AC PDFs into public/data/booths/TN/{id}/2026.json
with candidates aligned to public/data/elections/ac/TN/2026.json (ballot columns → JSON order).

  pip3 install -r scripts/requirements-booth.txt
  python3 scripts/tn_2026_form20_2026.py --ac TN-001 --fetch --write
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
from difflib import SequenceMatcher
from pathlib import Path
from typing import Any

_SCRIPTS_DIR = Path(__file__).resolve().parent
if str(_SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS_DIR))

from urllib.error import HTTPError, URLError

from tn_2026_booth_common import (
    BOOTHS_TN,
    FORM20_INDEX,
    REPO_ROOT,
    ensure_pdfplumber,
    fallback_form20_pdf_url,
    fetch_text,
    http_get_retry,
    is_pdf_bytes,
    load_schema_tn_ac_map,
    load_tn_2026_elections,
    norm_candidate_key,
    parse_form20_links,
)

PAGE_LINE = re.compile(r"^\s*Pa(?P<n>\d+)ge\s+(?P<rest>.+)\s*$", re.IGNORECASE)
# e.g. "P1a3g8 e 3 112 146 ..." — footer "Page 3" merged with booth 138 (digits scattered in token).
CORRUPT_PAGE_E = re.compile(r"^\s*(P[^\s]+)\s+e\s+(?P<rest>.+)\s*$", re.IGNORECASE)
# e.g. "P5a9ge 01 264 ..." — booth 59; "P1a18ge ..." — booth 118 (CEO footer variants).
CORRUPT_P_DIGIT_A_DIGIT_GE = re.compile(
    r"^\s*P(\d+)a(\d+)ge\s+(?P<rest>.+)\s*$",
    re.IGNORECASE,
)
DATE_LINE = re.compile(r"Date\s*[:-]\s*(\d{2}-\d{2}-\d{4})", re.IGNORECASE)


def _merged_header_cell(rows: list[list[Any]], i: int, max_row: int) -> str:
    parts: list[str] = []
    for r in rows[:max_row]:
        if i < len(r) and r[i]:
            parts.append(str(r[i]))
    return " ".join(parts).replace("\n", " ").strip()


def _is_probable_nota_header(t: str) -> bool:
    u = t.upper()
    if "NOTA" in u:
        return True
    # Tamil CEO Form 20 sometimes labels NOTA only in Tamil.
    if "நோட்டா" in t:
        return True
    return False


def find_rejected_col(tab: list[list[Any]]) -> int:
    """Locate the Rejected-votes column using merged header rows, with NOTA-adjacent fallback."""
    hdr_rows = tab[: min(4, len(tab))]
    if not hdr_rows:
        raise ValueError("Empty Form 20 table")
    n = max((len(r) for r in hdr_rows), default=0)

    def merged(i: int) -> str:
        return _merged_header_cell(hdr_rows, i, len(hdr_rows))

    for i in range(n):
        raw_m = merged(i)
        t = raw_m.upper()
        if not t:
            continue
        if "REJECTED" in t and ("VOTE" in t or "VOTES" in t):
            return i
        if "REJECTED" in t and ("NO. OF" in t or "NO OF" in t or "NUMBER OF" in t or "NOS." in t):
            return i
        # Tamil-only CEO headers (no English "Rejected").
        if "தவிர்க்கப்பட்ட" in raw_m or "நிராகரிக்கப்பட்ட" in raw_m:
            return i
    for i in range(n):
        t = merged(i).upper()
        if not t or i == 0:
            continue
        if "REJECT" in t and "NOTA" not in t:
            if "VOTE" in t or "BALLOT" in t or len(t) <= 56:
                return i

    nota_candidates: list[int] = []
    for i in range(1, n):
        raw = merged(i)
        if _is_probable_nota_header(raw):
            nota_candidates.append(i)
    if nota_candidates:
        nota_i = nota_candidates[-1]
        if nota_i >= 1:
            return nota_i - 1

    tender_idx = [i for i in range(n) if "TENDER" in merged(i).upper()]
    if tender_idx:
        t_i = tender_idx[-1]
        if t_i >= 4:
            block = list(range(t_i - 4, t_i + 1))
            for j in block:
                u = merged(j).upper()
                if "REJECT" in u or ("NO." in u and "VOTE" in u):
                    return j

    raise ValueError("Could not find Rejected Votes column in Form 20 header")


def find_rejected_col_geometry(tab: list[list[Any]]) -> int:
    """When CEO PDF headers are mirrored/garbled, infer rejected column from fixed 5-column tail."""
    for row in tab[2:]:
        if not row or len(row) < 10:
            continue
        booth_raw = (row[0] or "").replace("\n", "").strip()
        if not booth_raw or booth_raw.upper().startswith("TOTAL") or "POSTAL" in booth_raw.upper():
            continue
        if not re.match(r"^[\dA-Za-z().\-/]+$", booth_raw):
            continue
        ncol = len(row)
        rej = ncol - 4
        if rej < 3:
            continue
        try:
            int(str(row[rej] or "0").replace(",", ""))
            int(str(row[rej + 1] or "0").replace(",", ""))
        except (ValueError, IndexError):
            continue
        return rej
    raise ValueError("Could not infer Rejected column from Form 20 layout")


def _maybe_strip_sl_no_column(tab: list[list[Any]]) -> list[list[Any]]:
    """CEO Form20 tables sometimes add a leading Sl.No. column before Polling Station No."""
    if not tab or len(tab[0]) < 4:
        return tab
    c0 = str(tab[0][0] or "").replace("\n", " ").strip().lower()
    c1 = str(tab[0][1] or "").replace("\n", " ").strip().lower()
    if len(c0) > 48:
        return tab
    if "sl" in c0 and "poll" in c1:
        return [row[1:] if len(row) > 1 else row for row in tab]
    return tab


def _form20_pdf_probably_image_only(pdf_path: Path, *, max_pages: int = 6) -> bool:
    """Large JPEG-only Form20 PDFs have no extractable text/tables (pdfplumber cannot parse)."""
    try:
        if pdf_path.stat().st_size < 750_000:
            return False
    except OSError:
        return False
    ensure_pdfplumber()
    import pdfplumber

    with pdfplumber.open(str(pdf_path)) as pdf:
        for page in pdf.pages[: min(max_pages, len(pdf.pages))]:
            if (page.extract_text() or "").strip():
                return False
            for tab in page.extract_tables() or []:
                if tab and len(tab) >= 3:
                    return False
    return True


def parse_header(tab: list[list[Any]]) -> tuple[int, list[str], int, int]:
    """Returns (n_person, pdf_person_names, rejected_col_idx, nota_col_idx)."""
    h0 = tab[0]
    h1 = tab[1] if len(tab) > 1 else []
    try:
        rej = find_rejected_col(tab)
    except ValueError:
        rej = find_rejected_col_geometry(tab)
    n_person = rej - 2
    if n_person < 1:
        raise ValueError("Invalid person column count")
    r1 = h1
    names: list[str] = []
    for j in range(1, rej - 1):
        cell = r1[j] if j < len(r1) else None
        names.append((str(cell or "")).replace("\n", " ").strip())
    nota_col = rej + 1
    return n_person, names, rej, nota_col


def assign_columns(
    json_candidates: list[dict],
    pdf_names: list[str],
    *,
    allow_extra_pdf_columns: bool = False,
) -> dict[int, int]:
    """Map JSON candidate list index -> PDF table column index (same as row cell index)."""
    nota_indices = [i for i, c in enumerate(json_candidates) if c.get("name", "").strip().upper() == "NOTA"]
    if len(nota_indices) != 1:
        raise ValueError("Expected exactly one NOTA row in elections JSON")
    nota_i = nota_indices[0]
    j_idx = [i for i in range(len(json_candidates)) if i != nota_i]
    pdf_use = list(pdf_names)
    if len(pdf_use) < len(j_idx):
        raise ValueError(
            f"Person count mismatch: elections has {len(j_idx)} non-NOTA candidates, "
            f"Form 20 has {len(pdf_use)} name columns"
        )
    if len(pdf_use) > len(j_idx):
        if not allow_extra_pdf_columns:
            raise ValueError(
                f"Person count mismatch: elections has {len(j_idx)} non-NOTA candidates, "
                f"Form 20 has {len(pdf_use)} name columns"
            )
        while len(pdf_use) > len(j_idx):
            dropped = pdf_use.pop()
            print(
                f"WARN {Path(__file__).name}: --allow-extra-pdf-columns dropped trailing "
                f"Form20 name column {dropped!r}",
                file=sys.stderr,
            )
    keys_json = [norm_candidate_key(json_candidates[i]["name"]) for i in j_idx]
    keys_pdf = [norm_candidate_key(x) for x in pdf_use]
    nonempty_pdf = sum(1 for k in keys_pdf if k)
    if nonempty_pdf <= max(1, len(keys_pdf) // 3) and len(j_idx) == len(pdf_use):
        print(
            f"WARN {Path(__file__).name}: unreadable Form20 header names; "
            "using ballot-order column mapping (CEO PDF text extraction)",
            file=sys.stderr,
        )
        out_map: dict[int, int] = {}
        for slot, ji in enumerate(j_idx):
            out_map[ji] = slot + 1
        out_map[nota_i] = -1
        return out_map
    n_pdf = len(keys_pdf)
    scored: list[tuple[float, int, int]] = []
    for ji in range(len(j_idx)):
        for pi in range(n_pdf):
            r = SequenceMatcher(None, keys_json[ji], keys_pdf[pi]).ratio()
            if keys_json[ji] == keys_pdf[pi]:
                r = 1.0
            scored.append((r, ji, pi))
    scored.sort(reverse=True)
    assign_ji_to_pi: dict[int, int] = {}
    used_pi: set[int] = set()
    for r, ji, pi in scored:
        if ji in assign_ji_to_pi or pi in used_pi:
            continue
        if r < 0.42:
            continue
        assign_ji_to_pi[ji] = pi
        used_pi.add(pi)
    if len(assign_ji_to_pi) != len(j_idx):
        missing = [ji for ji in range(len(j_idx)) if ji not in assign_ji_to_pi]
        if len(pdf_use) == len(j_idx):
            print(
                f"WARN {Path(__file__).name}: incomplete name match {missing}; "
                "using ballot-order column mapping (same column count as elections)",
                file=sys.stderr,
            )
            out_ballot: dict[int, int] = {}
            for slot, ji in enumerate(j_idx):
                out_ballot[ji] = slot + 1
            out_ballot[nota_i] = -1
            return out_ballot
        raise ValueError(f"Incomplete name match for Form 20 columns; missing slots {missing}")
    out: dict[int, int] = {}
    for ji, pi in assign_ji_to_pi.items():
        json_i = j_idx[ji]
        out[json_i] = pi + 1  # table column index (row[0] is booth)
    out[nota_i] = -1  # sentinel: NOTA from NOTA column
    return out


def row_cells_to_record(
    cells: list[Any],
    n_person: int,
    rej: int,
    json_to_pdf_col: dict[int, int],
    nota_i: int,
    json_candidates: list[dict],
) -> dict[str, Any] | None:
    booth_raw = (cells[0] or "").replace("\n", "").strip()
    if not booth_raw:
        return None
    if booth_raw.upper().startswith("TOTAL") or "POSTAL" in booth_raw.upper():
        return None
    if not re.match(r"^[\dA-Za-z().\-/]+$", booth_raw):
        return None
    try:
        vote_cells = [int(str(cells[j] or "0").replace(",", "")) for j in range(1, rej - 1)]
    except ValueError:
        return None
    if len(vote_cells) != n_person:
        return None
    try:
        nota_val = int(str(cells[rej + 1] or "0").replace(",", ""))
        rejected = int(str(cells[rej] or "0").replace(",", ""))
        total_valid = int(str(cells[rej - 1] or "0").replace(",", ""))
    except ValueError:
        return None
    votes_out: list[int] = [0] * len(json_candidates)
    for ji, _c in enumerate(json_candidates):
        if ji == nota_i:
            votes_out[ji] = nota_val
            continue
        pdf_col = json_to_pdf_col[ji]
        votes_out[ji] = vote_cells[pdf_col - 1]
    person_sum = sum(votes_out[i] for i in range(len(votes_out)) if i != nota_i)
    if abs(person_sum - total_valid) > 2:
        return None
    polled = sum(votes_out) + rejected
    return {
        "booth": booth_raw,
        "votes": votes_out,
        "total": polled,
        "rejected": rejected,
        "_total_valid": total_valid,
        "_nota": nota_val,
    }


def row_cells_to_candidate_votes_out(
    cells: list[Any],
    n_person: int,
    rej: int,
    json_to_pdf_col: dict[int, int],
    nota_i: int,
    json_candidates: list[dict],
) -> list[int] | None:
    """Parse candidate-column votes from a non-booth summary row (e.g. postal totals)."""
    try:
        vote_cells = [int(str(cells[j] or "0").replace(",", "")) for j in range(1, rej - 1)]
    except ValueError:
        return None
    if len(vote_cells) != n_person:
        return None
    try:
        nota_val = int(str(cells[rej + 1] or "0").replace(",", ""))
    except ValueError:
        return None

    votes_out: list[int] = [0] * len(json_candidates)
    for ji, _c in enumerate(json_candidates):
        if ji == nota_i:
            votes_out[ji] = nota_val
            continue
        pdf_col = json_to_pdf_col[ji]
        votes_out[ji] = vote_cells[pdf_col - 1]
    return votes_out


def _score_form20_table(
    tab: list[list[Any]],
    json_candidates: list[dict],
    nota_i: int,
    *,
    allow_extra_pdf_columns: bool,
) -> tuple[int, int, int, list[str], int, dict[int, int]] | None:
    """Return (valid_booth_row_count, width, n_person, pdf_names, rej, json_to_pdf_col) or None."""
    try:
        n_person, pdf_names, rej, _nc = parse_header(tab)
        cmap = assign_columns(
            json_candidates, pdf_names, allow_extra_pdf_columns=allow_extra_pdf_columns
        )
    except Exception:
        return None
    w = max((len(r) for r in tab if r), default=0)
    n_ok = 0
    for row in tab[2:]:
        if not row or len(row) < rej + 3:
            continue
        rec = row_cells_to_record(row, n_person, rej, cmap, nota_i, json_candidates)
        if rec:
            n_ok += 1
    return n_ok, w, n_person, pdf_names, rej, cmap


def parse_form20_pdf(
    pdf_path: Path,
    json_candidates: list[dict],
    *,
    allow_extra_pdf_columns: bool = False,
) -> tuple[list[str], dict[str, dict[str, Any]], int, str, list[int] | None]:
    ensure_pdfplumber()
    import pdfplumber

    if _form20_pdf_probably_image_only(pdf_path):
        raise ValueError(
            "Form20 PDF appears image-only (no extractable text/tables). "
            "Replace the cached PDF with a text-based Form20 from CEO, or run --fetch when the site is reachable."
        )

    n_person = 0
    pdf_names: list[str] = []
    rej = 0
    json_to_pdf_col: dict[int, int] = {}
    nota_i = next(i for i, c in enumerate(json_candidates) if c.get("name", "").strip().upper() == "NOTA")

    with pdfplumber.open(str(pdf_path)) as pdf:
        tab0 = None
        n_person = 0
        pdf_names = []
        rej = 0
        last_hdr_err: BaseException | None = None
        best_n = -1
        best_w = -1
        for page in pdf.pages:
            for tab in page.extract_tables() or []:
                tab = _maybe_strip_sl_no_column(tab)
                if not tab or len(tab) < 3:
                    continue
                try:
                    scored = _score_form20_table(
                        tab,
                        json_candidates,
                        nota_i,
                        allow_extra_pdf_columns=allow_extra_pdf_columns,
                    )
                except (ValueError, IndexError) as e:
                    last_hdr_err = e
                    continue
                if not scored:
                    continue
                n_ok, w, np2, names2, rej2, cmap = scored
                if n_ok > best_n or (n_ok == best_n and w > best_w):
                    best_n, best_w = n_ok, w
                    tab0 = tab
                    n_person, pdf_names, rej = np2, names2, rej2
                    json_to_pdf_col = cmap

        if not tab0 or best_n < 0:
            raise ValueError(f"No parseable Form 20 header table: {last_hdr_err}")
        by_booth: dict[str, dict[str, Any]] = {}
        postal_votes: list[int] | None = None
        for page in pdf.pages:
            for tab in page.extract_tables() or []:
                tab = _maybe_strip_sl_no_column(tab)
                if not tab or len(tab) < 3:
                    continue
                try:
                    np2, _, rej2, _ = parse_header(tab)
                except Exception:
                    continue
                if np2 != n_person or rej2 != rej:
                    continue
                for row in tab[2:]:
                    if not row or len(row) < rej + 3:
                        continue
                    booth_raw = (row[0] or "").replace("\n", "").strip()
                    if postal_votes is None and booth_raw and "POSTAL" in booth_raw.upper():
                        postal_votes = row_cells_to_candidate_votes_out(
                            row, n_person, rej, json_to_pdf_col, nota_i, json_candidates
                        )
                    rec = row_cells_to_record(
                        row, n_person, rej, json_to_pdf_col, nota_i, json_candidates
                    )
                    if not rec:
                        continue
                    by_booth[rec["booth"]] = rec

        # Text-line pass overwrites / fills rows where table cells are corrupted (e.g. Page footer).
        n_tail = 5
        for page in pdf.pages:
            text = page.extract_text() or ""
            for ln in text.split("\n"):
                rec = parse_text_data_line(ln, n_person, json_to_pdf_col, nota_i, json_candidates, n_tail)
                if rec:
                    by_booth[rec["booth"]] = rec

        m = DATE_LINE.search(pdf.pages[0].extract_text() or "")
        date_s = m.group(1) if m else ""

    return pdf_names, by_booth, nota_i, date_s, postal_votes


def _parse_vote_ints_from_rest(rest: str, n_person: int, n_tail: int) -> list[int] | None:
    nums = [int(x) for x in re.findall(r"\d+", rest)]
    if len(nums) == n_person + n_tail + 1:
        nums = nums[1:]
    if len(nums) != n_person + n_tail:
        return None
    return nums


def parse_text_data_line(
    ln: str,
    n_person: int,
    json_to_pdf_col: dict[int, int],
    nota_i: int,
    json_candidates: list[dict],
    n_tail: int,
) -> dict[str, Any] | None:
    s = ln.strip()
    nums: list[int] | None = None
    booth: str | None = None

    m_pag = CORRUPT_P_DIGIT_A_DIGIT_GE.match(s)
    if m_pag:
        booth = m_pag.group(1) + m_pag.group(2)
        nums = _parse_vote_ints_from_rest(m_pag.group("rest"), n_person, n_tail)

    if nums is None:
        m_pe = CORRUPT_PAGE_E.match(s)
        if m_pe:
            tok = m_pe.group(1)
            if tok.upper().startswith("P") and re.search(r"\d", tok):
                booth_digits = "".join(re.findall(r"\d", tok))
                if len(booth_digits) >= 2:
                    cand = _parse_vote_ints_from_rest(m_pe.group("rest"), n_person, n_tail)
                    if cand is not None:
                        booth, nums = booth_digits, cand

    if nums is None:
        m = PAGE_LINE.match(s)
        if m:
            booth = m.group("n")
            rest = m.group("rest")
            nums = [int(x) for x in re.findall(r"\d+", rest)]
            if len(nums) == n_person + n_tail + 1:
                nums = nums[1:]
            if len(nums) != n_person + n_tail:
                nums = None
                booth = None
        else:
            parts = s.split()
            if parts and parts[0].isdigit():
                try:
                    cand = [int(x) for x in parts[1:]]
                except ValueError:
                    cand = []
                if len(cand) == n_person + n_tail:
                    booth, nums = parts[0], cand

    if nums is None or booth is None:
        return None

    vote_cells = nums[:n_person]
    total_valid, rejected, nota_val, total_all, tendered = nums[n_person : n_person + n_tail]
    votes_out: list[int] = [0] * len(json_candidates)
    for ji, _c in enumerate(json_candidates):
        if ji == nota_i:
            votes_out[ji] = nota_val
            continue
        pdf_col = json_to_pdf_col[ji]
        votes_out[ji] = vote_cells[pdf_col - 1]
    person_sum = sum(votes_out[i] for i in range(len(votes_out)) if i != nota_i)
    # Text-extracted rows (page-footers, CEO PDF merges) can disagree slightly with the PDF total column.
    if abs(person_sum - total_valid) > 15:
        return None
    polled = sum(votes_out) + rejected
    return {
        "booth": booth,
        "votes": votes_out,
        "total": polled,
        "rejected": rejected,
        "_total_valid": total_valid,
        "_nota": nota_val,
    }


def slim_candidates(cands: list[dict]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for i, c in enumerate(cands, 1):
        out.append(
            {
                "slNo": i,
                "name": c.get("name", ""),
                "party": c.get("party", ""),
                "symbol": c.get("symbol", ""),
            }
        )
    return out


def build_summary(
    json_candidates: list[dict],
    results: dict[str, Any],
    electors: int | None,
) -> dict[str, Any]:
    n = len(json_candidates)
    sums = [0] * n
    for r in results.values():
        for i, v in enumerate(r.get("votes", [])):
            sums[i] += v
    order = sorted(range(n), key=lambda i: sums[i], reverse=True)
    w, r2 = order[0], order[1] if n > 1 else 0
    margin = sums[w] - sums[r2]
    winner = json_candidates[w]
    runner = json_candidates[r2]
    tv = sum(sums)
    ev = int(electors or 0)
    return {
        "totalVoters": ev,
        "totalVotes": tv,
        "turnoutPercent": round(100.0 * tv / ev, 2) if ev else 0.0,
        "winner": {"name": winner.get("name", ""), "party": winner.get("party", ""), "votes": sums[w]},
        "runnerUp": {"name": runner.get("name", ""), "party": runner.get("party", ""), "votes": sums[r2]},
        "margin": margin,
        "marginPercent": round(100.0 * margin / tv, 2) if tv else 0.0,
    }


def main() -> None:
    ap = argparse.ArgumentParser(description="TN 2026 Form 20 → 2026.json")
    ap.add_argument("--ac", help="Comma-separated schema AC ids")
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--fetch", action="store_true")
    ap.add_argument("--write", action="store_true")
    ap.add_argument("--cache-dir", type=Path, default=REPO_ROOT / "scripts/cache/tn-2026-form20")
    ap.add_argument("--sleep", type=float, default=0.0)
    ap.add_argument("--force-fetch", action="store_true", help="Re-download Form20 PDFs if cached")
    ap.add_argument(
        "--allow-extra-pdf-columns",
        action="store_true",
        help="When Form20 has more name columns than elections (non-NOTA), drop trailing name columns "
        "and match the remainder (risky; CEO layout dependent)",
    )
    ap.add_argument(
        "--refresh-index",
        action="store_true",
        help="With --fetch: always re-download Form20 HTML index (default: reuse cached index if present)",
    )
    args = ap.parse_args()
    if not args.ac and not args.all:
        ap.error("Specify --ac or --all")

    ac_map = load_schema_tn_ac_map()
    elec_all = load_tn_2026_elections()

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
    cached_html = args.cache_dir / "Form20_TNLA2026.html"
    if args.fetch:
        if cached_html.exists() and not args.refresh_index:
            html = cached_html.read_text(encoding="utf-8")
        else:
            try:
                html = fetch_text(FORM20_INDEX)
            except (URLError, OSError, TimeoutError) as e:
                if cached_html.exists():
                    print(f"WARN: Form20 index fetch failed ({e}); using cached {cached_html}", file=sys.stderr)
                    html = cached_html.read_text(encoding="utf-8")
                else:
                    print(
                        f"WARN: Form20 index fetch failed ({e}); using empty index (staged AC*_f20.pdf only)",
                        file=sys.stderr,
                    )
                    html = "<html></html>"
            cached_html.write_text(html, encoding="utf-8")
    elif cached_html.exists():
        html = cached_html.read_text(encoding="utf-8")
    else:
        # Staged PDFs only: skip network; CEO links unknown until index is saved.
        html = "<html></html>"
    links = dict(parse_form20_links(html))

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
        if not pdf_url and not pdf_path.exists():
            print(f"No Form20 PDF link or staged cache for AC {ac_no:03d}", file=sys.stderr)
            continue
        if args.fetch:
            want_fetch = (
                pdf_url
                and (
                    not pdf_path.exists()
                    or args.force_fetch
                    or (pdf_path.exists() and _form20_pdf_probably_image_only(pdf_path))
                )
            )
            if want_fetch:
                try:
                    raw = http_get_retry(pdf_url)
                except HTTPError as e:
                    print(f"WARN {ac_id}: Form20 fetch {e.code} {pdf_url}", file=sys.stderr)
                    continue
                except (URLError, OSError, TimeoutError) as e:
                    print(f"WARN {ac_id}: Form20 fetch failed ({e}) {pdf_url}", file=sys.stderr)
                    continue
                if not is_pdf_bytes(raw):
                    print(f"WARN {ac_id}: Form20 response not PDF {pdf_url}", file=sys.stderr)
                    continue
                pdf_path.write_bytes(raw)
            elif not pdf_url and not pdf_path.exists():
                print(f"WARN {ac_id}: no CEO link and missing cache {pdf_path}", file=sys.stderr)
                continue
            if args.sleep:
                time.sleep(args.sleep)
        elif not pdf_path.exists():
            print(f"Missing {pdf_path}; use --fetch or scripts/tn_2026_stage_desktop_pdfs.py", file=sys.stderr)
            continue

        try:
            _names, by_booth, _nota_i, date_s, postal_votes = parse_form20_pdf(
                pdf_path,
                json_candidates,
                allow_extra_pdf_columns=args.allow_extra_pdf_columns,
            )
        except Exception as e:
            print(f"{ac_id}: parse failed: {e}", file=sys.stderr)
            continue

        booths_path = BOOTHS_TN / ac_id / "booths.json"
        if not booths_path.exists():
            print(f"{ac_id}: missing booths.json (legacy metadata; not auto-generated for 2026)", file=sys.stderr)
            continue
        booths_doc = json.loads(booths_path.read_text(encoding="utf-8"))

        booth_ids_by_no = {b["boothNo"]: b["id"] for b in booths_doc.get("booths", [])}

        results: dict[str, Any] = {}
        missing_map: list[str] = []
        for booth_no, rec in sorted(by_booth.items(), key=lambda kv: (len(kv[0]), kv[0])):
            bid = booth_ids_by_no.get(booth_no)
            if not bid:
                missing_map.append(booth_no)
                continue
            meta = next((x for x in booths_doc.get("booths", []) if x.get("boothNo") == booth_no), None)
            entry = {
                "votes": rec["votes"],
                "total": rec["total"],
                "rejected": rec["rejected"],
            }
            if meta:
                entry["name"] = meta.get("name", "")
                entry["address"] = meta.get("address", "")
                entry["area"] = meta.get("area", "")
            results[bid] = entry

        if missing_map:
            print(
                f"{ac_id}: skipped {len(missing_map)} Form20 rows with no matching boothNo in legacy booths.json "
                f"(sample: {missing_map[:8]})",
                file=sys.stderr,
            )

        expected_booths = int(booths_doc.get("totalBooths") or len(booth_ids_by_no))
        if expected_booths >= 20 and len(results) == 0:
            print(
                f"{ac_id}: skip write: zero booths mapped (booths.json total {expected_booths}); "
                "check Form20 PDF / parser",
                file=sys.stderr,
            )
            continue

        # Sum booth votes in JSON candidate order so we can populate AC-level postal totals:
        # `postal.candidates[] = {postal, booth, total}`.
        booth_sums = [0] * len(json_candidates)
        for rv in results.values():
            for i, v in enumerate(rv.get("votes") or []):
                booth_sums[i] += v

        postal_candidates = None
        if postal_votes is not None and len(postal_votes) == len(json_candidates):
            postal_candidates = []
            for i, c in enumerate(json_candidates):
                postal_val = postal_votes[i]
                booth_val = booth_sums[i]
                postal_candidates.append(
                    {
                        "name": c.get("name", ""),
                        "party": c.get("party", ""),
                        "postal": postal_val,
                        "booth": booth_val,
                        "total": booth_val + postal_val,
                    }
                )
        else:
            print(f"{ac_id}: WARN no postal totals parsed from Form 20", file=sys.stderr)

        ac_name = (econ.get("constituencyName") or econ.get("name") or row.get("name") or ac_id).upper()
        out_doc: dict[str, Any] = {
            "acId": ac_id,
            "acName": ac_name,
            "year": 2026,
            "electionType": "assembly",
            "date": date_s or "2026-05-08",
            "source": pdf_url or pdf_path.resolve().as_uri(),
            "candidates": slim_candidates(json_candidates),
            "results": results,
            "summary": build_summary(json_candidates, results, econ.get("electors")),
            "totalBooths": booths_doc.get("totalBooths", len(results)),
        }

        if postal_candidates is not None:
            out_doc["postal"] = {"candidates": postal_candidates}

        out_path = BOOTHS_TN / ac_id / "2026.json"
        if args.write:
            out_path.write_text(json.dumps(out_doc, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
            print(f"Wrote {out_path} ({len(results)} booths)")
        else:
            print(f"{ac_id}: parsed {len(results)} booths (dry-run; use --write)")


if __name__ == "__main__":
    main()
