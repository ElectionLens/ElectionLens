"""
Optional OCR extraction for TN Form20 PDFs (pytesseract + pdf2image; optional Surya CLI).

Requires: pip install -r scripts/requirements-form20-ocr.txt
System: poppler (pdftoppm), tesseract binary on PATH.
"""

from __future__ import annotations

import json
import re
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Any

from form20_unified_strategies import (
    Form20UnifiedRow,
    MAX_VOTES_PER_BOOTH,
    MIN_VOTES_PER_BOOTH,
    _normalize_booth_key,
    parse_text_enhanced,
)

_OCR_PREPROCESS = ("standard", "high_contrast", "adaptive")
_OCR_PSM = (6, 4, 3)
_STRICTNESS_LEVELS = ("strict", "normal", "relaxed", "permissive")


def _ocr_available() -> bool:
    try:
        import pytesseract  # noqa: F401
        from pdf2image import convert_from_path  # noqa: F401
    except ImportError:
        return False
    return bool(shutil.which("tesseract"))


def _preprocess_image(image, method: str):
    import cv2
    import numpy as np
    from PIL import Image

    img_array = np.array(image)
    if len(img_array.shape) == 3:
        gray = cv2.cvtColor(img_array, cv2.COLOR_RGB2GRAY)
    else:
        gray = img_array
    if method == "standard":
        _, processed = cv2.threshold(gray, 150, 255, cv2.THRESH_BINARY)
    elif method == "high_contrast":
        gray = cv2.convertScaleAbs(gray, alpha=1.5, beta=0)
        _, processed = cv2.threshold(gray, 140, 255, cv2.THRESH_BINARY)
    else:
        processed = cv2.adaptiveThreshold(
            gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 11, 2
        )
    return Image.fromarray(processed)


def _parse_ocr_line(line: str, num_candidates: int, page_num: int, max_booth: int) -> Form20UnifiedRow | None:
    line = re.sub(r"[|\\\/\[\]{}()<>]", " ", line)
    line = re.sub(r"[oO](?=\d)", "0", line)
    line = re.sub(r"[lI](?=\d)", "1", line)
    line = re.sub(r"(?<=\d)[oO]", "0", line)
    line = re.sub(r"\s+", " ", line).strip()
    if len(line) < 10:
        return None
    if any(kw in line.upper() for kw in ("FORM", "ELECTION", "CANDIDATE", "PARTY", "TOTAL", "NOTA", "POSTAL")):
        return None
    numbers: list[tuple[int, int]] = []
    for match in re.finditer(r"\b(\d+)\b", line):
        numbers.append((match.start(), int(match.group(1))))
    if len(numbers) < 4:
        return None
    numbers.sort(key=lambda x: x[0])
    booth_no: int | None = None
    vote_start = 0
    for i, (_pos, num) in enumerate(numbers[:3]):
        if 1 <= num <= max_booth + 50:
            booth_no = num
            vote_start = i + 1
            break
    if not booth_no:
        return None
    votes: list[int] = []
    for _pos, num in numbers[vote_start:]:
        if num <= 2000:
            votes.append(num)
        elif num > 5000:
            break
    if len(votes) < 3:
        return None
    votes = votes[:num_candidates]
    while len(votes) < num_candidates:
        votes.append(0)
    total = sum(votes)
    if not (MIN_VOTES_PER_BOOTH <= total <= MAX_VOTES_PER_BOOTH):
        return None
    return Form20UnifiedRow(
        booth_key=_normalize_booth_key(booth_no),
        votes=votes,
        total=total,
        source_page=page_num,
        confidence=0.78,
        source="ocr_tesseract",
    )


def _extract_tesseract_pages(pdf_path: Path, num_candidates: int, max_booth: int) -> dict[str, Form20UnifiedRow]:
    import pytesseract
    from pdf2image import convert_from_path

    merged: dict[str, tuple[Form20UnifiedRow, float]] = {}

    def put(row: Form20UnifiedRow) -> None:
        prev = merged.get(row.booth_key)
        if prev is None or row.confidence > prev[1]:
            merged[row.booth_key] = (row, row.confidence)

    images = convert_from_path(str(pdf_path), dpi=300)
    for page_num, image in enumerate(images):
        for preprocess in _OCR_PREPROCESS:
            processed = _preprocess_image(image, preprocess)
            for psm in _OCR_PSM:
                config = f"--psm {psm} --oem 3"
                try:
                    text = pytesseract.image_to_string(processed, config=config)
                except Exception:
                    continue
                for row in parse_text_enhanced(text, num_candidates, page_num):
                    row2 = Form20UnifiedRow(
                        booth_key=row.booth_key,
                        votes=row.votes,
                        total=row.total,
                        source_page=row.source_page,
                        confidence=min(0.82, row.confidence),
                        source="ocr_tesseract",
                    )
                    put(row2)
                for line in text.split("\n"):
                    row = _parse_ocr_line(line, num_candidates, page_num, max_booth)
                    if row:
                        put(row)
    return {k: v[0] for k, v in merged.items()}


def _surya_text_from_results(data: dict) -> str:
    parts: list[str] = []
    for _key, pages in data.items():
        if not isinstance(pages, list):
            continue
        for page in pages:
            if not isinstance(page, dict):
                continue
            for line in page.get("text_lines") or []:
                if isinstance(line, dict) and line.get("text"):
                    parts.append(str(line["text"]))
                elif isinstance(line, str):
                    parts.append(line)
    return "\n".join(parts)


def _extract_surya(pdf_path: Path, num_candidates: int, max_booth: int) -> dict[str, Form20UnifiedRow]:
    if not shutil.which("surya_ocr"):
        return {}
    merged: dict[str, tuple[Form20UnifiedRow, float]] = {}

    def put(row: Form20UnifiedRow) -> None:
        prev = merged.get(row.booth_key)
        if prev is None or row.confidence > prev[1]:
            merged[row.booth_key] = (row, row.confidence)

    with tempfile.TemporaryDirectory(prefix="form20_surya_") as tmp:
        out_root = Path(tmp)
        try:
            subprocess.run(
                ["surya_ocr", str(pdf_path), "--output_dir", str(out_root), "--disable_math"],
                capture_output=True,
                text=True,
                timeout=600,
                check=False,
            )
        except (FileNotFoundError, subprocess.SubprocessError, OSError):
            return {}
        for rf in out_root.rglob("results.json"):
            try:
                data = json.loads(rf.read_text(encoding="utf-8"))
            except (json.JSONDecodeError, OSError):
                continue
            text = _surya_text_from_results(data)
            for row in parse_text_enhanced(text, num_candidates, 0):
                put(
                    Form20UnifiedRow(
                        booth_key=row.booth_key,
                        votes=row.votes,
                        total=row.total,
                        source_page=row.source_page,
                        confidence=0.9,
                        source="ocr_surya",
                    )
                )
    return {k: v[0] for k, v in merged.items()}


_easyocr_reader = None


def _easyocr_available() -> bool:
    try:
        import easyocr  # noqa: F401
    except ImportError:
        return False
    return True


def _get_easyocr_reader():
    global _easyocr_reader
    if _easyocr_reader is None:
        import easyocr

        _easyocr_reader = easyocr.Reader(["en"], gpu=False, verbose=False)
    return _easyocr_reader


def _ocr_tokens_at_y(
    results: list[tuple],
    y_target: float,
    *,
    tol: float = 22,
) -> list[tuple[int, str]]:
    return sorted(
        [
            (int(bbox[0][0]), text)
            for bbox, text, _conf in results
            if abs((bbox[0][1] + bbox[2][1]) / 2 - y_target) < tol
        ],
        key=lambda x: x[0],
    )


def _nearest_vote_at_x(tokens: list[tuple[int, str]], x: float, *, tol: float = 95) -> int | None:
    best_v: int | None = None
    best_d = tol
    for tx, text in tokens:
        for match in re.finditer(r"\d+", text):
            v = int(match.group())
            d = abs(tx - x)
            if d < best_d:
                best_d = d
                best_v = v
    return best_v


def extract_postal_votes_easyocr(
    pdf_path: Path,
    json_candidates: list[dict],
    json_to_pdf_col: dict[int, int],
    nota_i: int,
) -> list[int] | None:
    """
    Column-aligned postal row from EasyOCR on the last page(s) of image-only Form20 PDFs.
    Uses the grand-total row for column x positions, then reads the Postal Ballot row.
    """
    if not _easyocr_available():
        return None

    import numpy as np
    from pdf2image import convert_from_path
    from pdf2image.pdf2image import pdfinfo_from_path

    n_cand = len(json_candidates)
    try:
        n_pages = pdfinfo_from_path(str(pdf_path))["Pages"]
        images = convert_from_path(
            str(pdf_path),
            dpi=300,
            first_page=max(1, n_pages - 1),
            last_page=n_pages,
        )
    except Exception:
        return None

    reader = _get_easyocr_reader()

    def _run_page(img) -> list[int] | None:
        w, h = img.size
        crops = [
            img.crop((int(w * 0.04), int(h * 0.25), w, h)),
            img,
        ]
        for crop in crops:
            got = _run_crop(reader, crop, json_candidates, json_to_pdf_col, nota_i)
            if got is not None:
                return got
        return None

    for img in reversed(images):
        got = _run_page(img)
        if got is not None:
            return got
    return None


def _run_crop(
    reader: Any,
    crop: Any,
    json_candidates: list[dict],
    json_to_pdf_col: dict[int, int],
    nota_i: int,
) -> list[int] | None:
    import numpy as np

    n_cand = len(json_candidates)
    try:
        results = reader.readtext(np.array(crop), paragraph=False)
    except Exception:
        return None
    if not results:
        return None

    postal_y: float | None = None
    for bbox, text, _conf in results:
        if re.search(r"postal\s*bal", text, re.I):
            postal_y = (bbox[0][1] + bbox[2][1]) / 2
            break
    if postal_y is None:
        return None

    official_sum = sum(int(c.get("votes") or 0) for c in json_candidates)

    by_y: dict[int, list[tuple[int, str, float]]] = {}
    for bbox, text, _conf in results:
        y = (bbox[0][1] + bbox[2][1]) / 2
        by_y.setdefault(int(y // 16), []).append((int(bbox[0][0]), text, y))

    total_y: float | None = None
    best_row: list[tuple[int, int]] | None = None
    best_score = float("inf")

    per_cand_cap = max(100000, int(official_sum * 0.85))
    garbage_floor = max(official_sum * 2, 500000)

    for yb in sorted(by_y.keys(), reverse=True):
        toks = sorted(by_y[yb], key=lambda x: x[0])
        row_y = toks[0][2]
        in_summary_band = postal_y - 80 <= row_y <= postal_y + 320
        nums: list[tuple[int, int]] = []
        for x, t, _y in toks:
            for i, n in enumerate(re.findall(r"\d+", t)):
                v = int(n)
                if v >= garbage_floor:
                    continue
                nums.append((x + i * 2, v))
        if len(nums) < max(4, n_cand - 2):
            continue
        maxv = max(v for _x, v in nums)
        if maxv < max(3000, official_sum * 0.15):
            continue
        cand_pairs = sorted(
            [(x, v) for x, v in nums if 50 <= v <= per_cand_cap],
            key=lambda p: p[0],
        )
        if len(cand_pairs) < max(4, n_cand - 2):
            if not (
                in_summary_band
                and any(abs(v - official_sum) < max(500, official_sum * 0.02) for _x, v in nums)
            ):
                continue
        row_sum = sum(v for _x, v in cand_pairs)
        score = abs(row_sum - official_sum)
        if any(abs(v - official_sum) < max(500, official_sum * 0.02) for _x, v in nums):
            score = 0
        if not in_summary_band and score > official_sum * 0.35:
            continue
        if score < best_score:
            best_score = score
            best_row = cand_pairs
            total_y = row_y

    if not best_row:
        return None
    if len(best_row) > n_cand:
        best_win = best_row[:n_cand]
        best_diff = abs(sum(v for _x, v in best_win) - official_sum)
        for i in range(len(best_row) - n_cand + 1):
            win = best_row[i : i + n_cand]
            diff = abs(sum(v for _x, v in win) - official_sum)
            if diff < best_diff:
                best_diff = diff
                best_win = win
        best_row = best_win
    col_xs = [x for x, _v in best_row]
    if len(col_xs) < max(4, n_cand - 2):
        return None

    postal_tokens = _ocr_tokens_at_y(results, postal_y)
    polling_tokens = _ocr_tokens_at_y(results, postal_y - 52) + _ocr_tokens_at_y(
        results, postal_y - 78
    )
    total_tokens = _ocr_tokens_at_y(results, total_y or postal_y + 90, tol=28)

    if total_y and abs(total_y - postal_y) > 20:
        for dy in (40, 55, 70, 85):
            polling_tokens = polling_tokens + _ocr_tokens_at_y(results, postal_y - dy)

    votes_out: list[int] = [0] * n_cand
    ok_cols = 0
    for ji in range(n_cand):
        pc = json_to_pdf_col.get(ji, -1)
        col_idx = nota_i if pc < 1 else pc - 1
        if col_idx >= len(col_xs):
            continue
        x = col_xs[col_idx]
        tv = _nearest_vote_at_x(total_tokens, x, tol=110)
        poll_v = _nearest_vote_at_x(polling_tokens, x, tol=110)
        pv = _nearest_vote_at_x(postal_tokens, x, tol=110)
        if pv is None and tv is not None and poll_v is not None:
            pv = max(0, tv - poll_v)
        if pv is None:
            continue
        votes_out[ji] = pv
        ok_cols += 1

    min_ok = max(4, min(6, n_cand // 2))
    if sum(votes_out) >= max(50, int(official_sum * 0.002)) and ok_cols >= min_ok:
        return votes_out
    return None


def _parse_limits(
    strictness: str,
    num_candidates: int,
) -> tuple[int, int, int, float]:
    """Return (min_vote_cols, min_total, max_total, base_confidence)."""
    if strictness == "strict":
        return max(6, num_candidates - 2), 12, 3200, 0.90
    if strictness == "relaxed":
        return max(5, num_candidates - 8), 8, 3500, 0.82
    if strictness == "permissive":
        return max(4, num_candidates - 12), 5, 3800, 0.75
    return max(6, num_candidates - 5), 12, 3200, 0.88


def _parse_easyocr_booth_line(
    line: str,
    num_candidates: int,
    max_booth: int,
    *,
    strictness: str = "normal",
    allowed_booths: frozenset[int] | None = None,
) -> Form20UnifiedRow | None:
    """Parse one EasyOCR text line into a booth row (TN Form20 data lines)."""
    if re.search(
        r"postal|total\s+no|electors|form\s*20|sl\.?\s*no|polling\s+station\s+no",
        line,
        re.I,
    ):
        return None
    nums = [int(x) for x in re.findall(r"\d+", line)]
    min_cols, min_total, max_total, conf = _parse_limits(strictness, num_candidates)
    if len(nums) < min_cols:
        return None
    if strictness in ("strict", "normal") and len(nums) >= 6:
        if nums[1] - nums[0] == 1 and nums[2] - nums[1] == 1:
            return None

    booth: int | None = None
    start = 0
    for i in range(min(4, len(nums) - 1)):
        if nums[i] == nums[i + 1] and 1 <= nums[i] <= max_booth:
            booth, start = nums[i], i + 2
            break
    if booth is None:
        for i in range(min(3, len(nums) - 2)):
            if nums[i + 1] == nums[i + 2] and 1 <= nums[i + 1] <= max_booth:
                booth, start = nums[i + 1], i + 3
                break
    if booth is None and 1 <= nums[0] <= max_booth:
        booth, start = nums[0], 1
        if start < len(nums) and nums[start] == booth:
            start += 1
    if booth is None:
        return None
    if allowed_booths is not None and booth not in allowed_booths:
        return None

    vote_nums = [n for n in nums[start:] if n <= 2800]
    if len(vote_nums) < min_cols:
        return None
    votes = vote_nums[:num_candidates]
    while len(votes) < num_candidates:
        votes.append(0)
    total = sum(votes)
    if total < min_total or total > max_total:
        return None
    return Form20UnifiedRow(
        booth_key=_normalize_booth_key(booth),
        votes=votes,
        total=total,
        source_page=0,
        confidence=conf,
        source="ocr_easyocr",
    )


def _parse_line_all_parsers(
    line: str,
    num_candidates: int,
    max_booth: int,
    page_num: int,
    *,
    strictness: str = "normal",
    allowed_booths: frozenset[int] | None = None,
) -> Form20UnifiedRow | None:
    row = _parse_easyocr_booth_line(
        line,
        num_candidates,
        max_booth,
        strictness=strictness,
        allowed_booths=allowed_booths,
    )
    if row:
        return Form20UnifiedRow(
            booth_key=row.booth_key,
            votes=row.votes,
            total=row.total,
            source_page=page_num,
            confidence=row.confidence,
            source=row.source,
        )
    ocr = _parse_ocr_line(line, num_candidates, page_num, max_booth)
    if not ocr:
        return None
    if allowed_booths is not None:
        try:
            if int(ocr.booth_key) not in allowed_booths:
                return None
        except ValueError:
            return None
    if strictness in ("strict", "normal"):
        if not (MIN_VOTES_PER_BOOTH <= ocr.total <= MAX_VOTES_PER_BOOTH):
            return None
    elif strictness == "relaxed":
        if not (8 <= ocr.total <= 3500):
            return None
    elif ocr.total < 5 or ocr.total > 3800:
        return None
    return Form20UnifiedRow(
        booth_key=ocr.booth_key,
        votes=ocr.votes,
        total=ocr.total,
        source_page=page_num,
        confidence=min(0.80, ocr.confidence),
        source="ocr_tesseract_line",
    )


def _easyocr_lines_from_image(
    reader: Any,
    image: Any,
    y_bucket: int = 12,
    *,
    preprocess: str | None = None,
) -> list[str]:
    import numpy as np
    from collections import defaultdict

    if preprocess:
        image = _preprocess_image(image, preprocess)
    try:
        results = reader.readtext(np.array(image), paragraph=False)
    except Exception:
        return []
    by_y: dict[int, list[tuple[int, str]]] = defaultdict(list)
    for bbox, text, _conf in results:
        y = int((bbox[0][1] + bbox[2][1]) / 2) // y_bucket
        by_y[y].append((int(bbox[0][0]), str(text)))
    lines: list[str] = []
    for y in sorted(by_y.keys()):
        lines.append(" ".join(t for _, t in sorted(by_y[y], key=lambda x: x[0])))
    return lines


def _easyocr_parse_page(
    reader: Any,
    image: Any,
    page_num: int,
    num_candidates: int,
    max_booth: int,
    merged: dict[str, tuple[Form20UnifiedRow, float]],
    *,
    y_bucket: int = 12,
    strictness: str = "normal",
    preprocess: str | None = None,
    allowed_booths: frozenset[int] | None = None,
) -> int:
    added = 0

    def put(row: Form20UnifiedRow) -> None:
        nonlocal added
        prev = merged.get(row.booth_key)
        if prev is None or row.confidence > prev[1]:
            if prev is None:
                added += 1
            merged[row.booth_key] = (row, row.confidence)

    lines = _easyocr_lines_from_image(
        reader, image, y_bucket, preprocess=preprocess
    )
    page_text = "\n".join(lines)
    for row in parse_text_enhanced(page_text, num_candidates, page_num):
        if allowed_booths is not None:
            try:
                if int(row.booth_key) not in allowed_booths:
                    continue
            except ValueError:
                continue
        put(
            Form20UnifiedRow(
                booth_key=row.booth_key,
                votes=row.votes,
                total=row.total,
                source_page=page_num,
                confidence=min(0.86, row.confidence),
                source="ocr_easyocr_text",
            )
        )
    for line in lines:
        row = _parse_line_all_parsers(
            line,
            num_candidates,
            max_booth,
            page_num,
            strictness=strictness,
            allowed_booths=allowed_booths,
        )
        if row:
            put(row)
    return added


def extract_form20_booths_easyocr(
    pdf_path: Path,
    num_candidates: int,
    *,
    max_booth: int = 600,
    dpi: int = 300,
    y_bucket: int = 12,
    strictness: str = "normal",
    preprocess: str | None = None,
    allowed_booths: frozenset[int] | None = None,
) -> dict[str, Form20UnifiedRow]:
    """Page-wise EasyOCR for image-only Form20 PDFs (better than Tesseract on CEO scans)."""
    if not _easyocr_available():
        return {}

    from pdf2image import convert_from_path

    try:
        images = convert_from_path(str(pdf_path), dpi=dpi)
    except Exception:
        return {}

    reader = _get_easyocr_reader()
    merged: dict[str, tuple[Form20UnifiedRow, float]] = {}

    for page_num, image in enumerate(images, start=1):
        _easyocr_parse_page(
            reader,
            image,
            page_num,
            num_candidates,
            max_booth,
            merged,
            y_bucket=y_bucket,
            strictness=strictness,
            preprocess=preprocess,
            allowed_booths=allowed_booths,
        )

    return {k: v[0] for k, v in merged.items()}


def _extract_tesseract_pages_fast(
    pdf_path: Path,
    num_candidates: int,
    max_booth: int,
    *,
    dpi: int = 300,
    preprocess: str = "high_contrast",
    psm: int = 6,
    allowed_booths: frozenset[int] | None = None,
) -> dict[str, Form20UnifiedRow]:
    """Single-pass Tesseract over all pages (for image-only ensemble)."""
    if not _ocr_available():
        return {}
    import pytesseract
    from pdf2image import convert_from_path

    merged: dict[str, tuple[Form20UnifiedRow, float]] = {}

    def put(row: Form20UnifiedRow) -> None:
        prev = merged.get(row.booth_key)
        if prev is None or row.confidence > prev[1]:
            merged[row.booth_key] = (row, row.confidence)

    try:
        images = convert_from_path(str(pdf_path), dpi=dpi)
    except Exception:
        return {}

    config = f"--psm {psm} --oem 3"
    for page_num, image in enumerate(images):
        processed = _preprocess_image(image, preprocess)
        try:
            text = pytesseract.image_to_string(processed, config=config)
        except Exception:
            continue
        for row in parse_text_enhanced(text, num_candidates, page_num):
            if allowed_booths is not None:
                try:
                    if int(row.booth_key) not in allowed_booths:
                        continue
                except ValueError:
                    continue
            put(
                Form20UnifiedRow(
                    booth_key=row.booth_key,
                    votes=row.votes,
                    total=row.total,
                    source_page=page_num,
                    confidence=0.76,
                    source="ocr_tesseract",
                )
            )
        for line in text.split("\n"):
            row = _parse_line_all_parsers(
                line,
                num_candidates,
                max_booth,
                page_num,
                strictness="relaxed",
                allowed_booths=allowed_booths,
            )
            if row:
                put(row)
    return {k: v[0] for k, v in merged.items()}


def extract_form20_ocr(
    pdf_path: Path,
    num_candidates: int,
    *,
    max_booth: int = 600,
    use_surya: bool = True,
    prefer_easyocr: bool = True,
    image_only: bool = False,
    full_ensemble: bool = False,
    booths_doc: dict | None = None,
    target_coverage: float = 1.0,
) -> dict[str, Form20UnifiedRow]:
    """
    Merge OCR strategies by booth_key; highest confidence wins.
    When full_ensemble=True (image scans), runs multi-parser passes until target_coverage.
    """
    if full_ensemble and booths_doc is not None:
        from form20_booth_ensemble import extract_form20_booths_until_full

        rows, _meta = extract_form20_booths_until_full(
            pdf_path,
            num_candidates,
            booths_doc,
            max_booth=max_booth,
            target_fraction=target_coverage,
        )
        return rows

    merged: dict[str, tuple[Form20UnifiedRow, float]] = {}

    def absorb(rows: dict[str, Form20UnifiedRow]) -> None:
        for k, row in rows.items():
            prev = merged.get(k)
            if prev is None or row.confidence > prev[1]:
                merged[k] = (row, row.confidence)

    if prefer_easyocr and _easyocr_available():
        absorb(extract_form20_booths_easyocr(pdf_path, num_candidates, max_booth=max_booth))

    if image_only and _ocr_available():
        absorb(
            _extract_tesseract_pages_fast(
                pdf_path, num_candidates, max_booth, allowed_booths=None
            )
        )
    elif not image_only and _ocr_available():
        absorb(_extract_tesseract_pages(pdf_path, num_candidates, max_booth))
    if use_surya and not image_only:
        absorb(_extract_surya(pdf_path, num_candidates, max_booth))
    return {k: v[0] for k, v in merged.items()}
