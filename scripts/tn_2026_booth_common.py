"""Shared helpers for TN LA 2026 PS-list and Form 20 booth tooling."""

from __future__ import annotations

import json
import re
import sys
import time
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urljoin
from urllib.request import Request, urlopen

REPO_ROOT = Path(__file__).resolve().parents[1]
SCHEMA_PATH = REPO_ROOT / "public/data/schema.json"
ELECTIONS_TN_2026 = REPO_ROOT / "public/data/elections/ac/TN/2026.json"
BOOTHS_TN = REPO_ROOT / "public/data/booths/TN"

PSLIST_INDEX = "https://www.elections.tn.gov.in/PSLIST_06042026.aspx"
FORM20_INDEX = "https://www.elections.tn.gov.in/Form20_TNLA2026.aspx"
USER_AGENT = "ElectionLens/1.0 (+https://github.com/) booth-data-script"


def ensure_pdfplumber():
    try:
        import pdfplumber  # noqa: F401
    except ImportError:
        print(
            "Missing dependency pdfplumber. Install with:\n"
            "  pip3 install -r scripts/requirements-booth.txt",
            file=sys.stderr,
        )
        sys.exit(1)


def is_pdf_bytes(data: bytes) -> bool:
    return len(data) >= 5 and data[:5] == b"%PDF-"


def http_get(url: str, timeout: float = 60.0) -> bytes:
    req = Request(url, headers={"User-Agent": USER_AGENT})
    with urlopen(req, timeout=timeout) as resp:
        return resp.read()


def http_get_retry(url: str, timeout: float = 60.0, attempts: int = 5) -> bytes:
    """Retry on transient DNS/network failures; do not retry permanent HTTP errors."""
    last: Exception | None = None
    for i in range(attempts):
        try:
            return http_get(url, timeout=timeout)
        except HTTPError as e:
            last = e
            if e.code in (404, 410):
                raise
            if i + 1 == attempts:
                raise
            time.sleep(min(2.0 * (i + 1), 15.0))
        except (URLError, TimeoutError, OSError) as e:
            last = e
            if i + 1 == attempts:
                raise
            time.sleep(min(2.0 * (i + 1), 15.0))
    assert last
    raise last


def fetch_text(url: str, timeout: float = 120.0) -> str:
    return http_get_retry(url, timeout=timeout).decode("utf-8", errors="replace")


def abs_url(href: str) -> str:
    return urljoin("https://www.elections.tn.gov.in/", href)


# When Form20 index HTML is missing or empty, infer CEO folder from neighbouring ACs (same dt path).
FORM20_FALLBACK_DT: dict[int, str] = {
    213: "dt27",
    214: "dt27",
    217: "dt28",
    218: "dt28",
}


def fallback_form20_pdf_url(ac_no: int) -> str | None:
    dt = FORM20_FALLBACK_DT.get(ac_no)
    if not dt:
        return None
    return abs_url(f"Form20_TNLA2026/{dt}/AC{ac_no:03d}.pdf")


def probe_pslist_pdf(ac_no: int, *, timeout: float = 12.0) -> tuple[bytes, str] | None:
    """Try CEO PSLIST PDF URLs when index/staging has no file (dt1–dt40 × English/Tamil)."""
    for d in range(1, 41):
        for lang in ("English", "Tamil"):
            url = abs_url(f"PSLIST_06042026/dt{d}/{lang}/AC{ac_no:03d}.pdf")
            try:
                raw = http_get(url, timeout=timeout)
            except HTTPError as e:
                if e.code in (404, 410):
                    continue
                continue
            except (URLError, TimeoutError, OSError):
                continue
            if is_pdf_bytes(raw):
                return raw, url
    return None


def load_schema_tn_ac_map() -> dict[int, dict[str, Any]]:
    """acNo -> { schemaId, name, ... } for Tamil Nadu assembly constituencies."""
    schema = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
    out: dict[int, dict[str, Any]] = {}
    for ac_id, row in schema.get("assemblyConstituencies", {}).items():
        if row.get("stateId") != "TN":
            continue
        ac_no = int(row["acNo"])
        out[ac_no] = {**row, "schemaId": ac_id}
    return out


def load_tn_2026_elections() -> dict[str, Any]:
    return json.loads(ELECTIONS_TN_2026.read_text(encoding="utf-8"))


def parse_pslist_english_links(html: str) -> list[tuple[int, str]]:
    """Return sorted list of (ceo_ac_no, absolute_pdf_url)."""
    pat = re.compile(
        r'href="(PSLIST_06042026/[^"]+?/English/AC(\d{3})\.pdf)"',
        re.IGNORECASE,
    )
    found: dict[int, str] = {}
    for m in pat.finditer(html):
        path, ac_s = m.group(1), m.group(2)
        ac_no = int(ac_s)
        found[ac_no] = abs_url(path)
    return sorted(found.items())


def parse_pslist_tamil_links(html: str) -> list[tuple[int, str]]:
    """Return sorted list of (ceo_ac_no, absolute_pdf_url) for Tamil PS PDFs."""
    pat = re.compile(
        r'href="(PSLIST_06042026/[^"]+?/Tamil/AC(\d{3})\.pdf)"',
        re.IGNORECASE,
    )
    found: dict[int, str] = {}
    for m in pat.finditer(html):
        path, ac_s = m.group(1), m.group(2)
        ac_no = int(ac_s)
        found[ac_no] = abs_url(path)
    return sorted(found.items())


def parse_form20_links(html: str) -> list[tuple[int, str]]:
    pat = re.compile(
        r'href="(Form20_TNLA2026/[^"]+?/AC(\d{3})\.pdf)"',
        re.IGNORECASE,
    )
    found: dict[int, str] = {}
    for m in pat.finditer(html):
        path, ac_s = m.group(1), m.group(2)
        ac_no = int(ac_s)
        found[ac_no] = abs_url(path)
    return sorted(found.items())


def norm_candidate_key(s: str) -> str:
    t = (s or "").replace("\n", " ")
    t = re.sub(r"\s+", " ", t).strip().upper()
    t = t.replace("B.L.,", "BL").replace("B.SC.", "BSC").replace("L.L.B", "LLB")
    t = re.sub(r"[^A-Z0-9]+", "", t)
    return t


def booth_num_sort_key(booth_no: str) -> tuple[int, str]:
    m = re.match(r"^(\d+)", (booth_no or "").strip())
    if m:
        return (int(m.group(1)), booth_no)
    return (10**9, booth_no)


def polling_station_type_to_booth_type(cell: str) -> str:
    u = (cell or "").upper()
    if "WOMEN" in u or "(W)" in u:
        return "women"
    if "AUX" in u:
        return "auxiliary"
    if "SPECIAL" in u or "MIGRAT" in u:
        return "special"
    return "regular"
