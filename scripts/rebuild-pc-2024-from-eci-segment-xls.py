#!/usr/bin/env python3
"""
Rebuild public/data/elections/pc/*/2024.json from ECI report
"34 - Details Of Assembly Segment Of PC" (.xls).

The file on disk may not open with xlrd.open_workbook(path) due to OLE
directory corruption; reading stream 'Workbook' via olefile works.

Optional: --xls PATH (default: ~/Desktop/34-Details-Of-Assembly-Segment-Of-PC.xls)

Preserves Gujarat GJ-24 (Surat) from the existing 2024.json when missing in ECI
(unopposed election — excluded from this statistical report).

Then runs scripts/fix-od08-jajpur-2024-eci-discrepancy.mjs — Report 34 mis-orders
BJP vs BJD for OD-08 vs the gazetted result.

Disable post-steps with: --no-post-fixes
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
from collections import defaultdict
from datetime import date
from typing import Any, Dict, List, Tuple

try:
    import olefile
    import xlrd
except ImportError as e:
    print("Requires olefile and xlrd: pip install olefile xlrd==1.2.0", file=sys.stderr)
    raise SystemExit(1) from e

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
PC_BASE = os.path.join(REPO_ROOT, "public", "data", "elections", "pc")

# ECI State/UT name -> folder code (matches public/data/elections/pc/*)
STATE_TO_CODE: Dict[str, str] = {
    "Andaman & Nicobar Islands": "AN",
    "Andhra Pradesh": "AP",
    "Arunachal Pradesh": "AR",
    "Assam": "AS",
    "Bihar": "BR",
    "Chandigarh": "CH",
    "Chhattisgarh": "CG",
    "Dadra & Nagar Haveli and Daman & Diu": "DD",
    "Goa": "GA",
    "Gujarat": "GJ",
    "Haryana": "HR",
    "Himachal Pradesh": "HP",
    "Jammu and Kashmir": "JK",
    "Jharkhand": "JH",
    "Karnataka": "KA",
    "Kerala": "KL",
    "Ladakh": "LD",
    "Lakshadweep": "LA",
    "Madhya Pradesh": "MP",
    "Maharashtra": "MH",
    "Manipur": "MN",
    "Meghalaya": "ML",
    "Mizoram": "MZ",
    "NCT OF Delhi": "DL",
    "Nagaland": "NL",
    "Odisha": "OD",
    "Puducherry": "PY",
    "Punjab": "PB",
    "Rajasthan": "RJ",
    "Sikkim": "SK",
    "Tamil Nadu": "TN",
    "Telangana": "TS",
    "Tripura": "TR",
    "Uttar Pradesh": "UP",
    "Uttarakhand": "UK",
    "West Bengal": "WB",
}


def read_workbook_bytes(path: str) -> bytes:
    ole = olefile.OleFileIO(path)
    try:
        if not ole.exists("Workbook"):
            raise RuntimeError("OLE stream 'Workbook' not found — not a valid .xls")
        return ole.openstream("Workbook").read()
    finally:
        ole.close()


def strip_reservation_suffix(name: str) -> str:
    return re.sub(r"\s*\((SC|ST)\)\s*$", "", name, flags=re.IGNORECASE).strip()


def reservation_from_pc_name(name: str) -> str:
    m = re.search(r"\((SC|ST)\)\s*$", name, flags=re.IGNORECASE)
    if not m:
        return "GEN"
    return m.group(1).upper()


def original_display_name(stripped: str) -> str:
    """Match app style: Title Case if ECI used all caps; otherwise keep ECI casing."""
    s = stripped.strip()
    if not s:
        return s
    if any(ch.islower() for ch in s):
        return s
    return s.title()


def load_sheet(path: str):
    data = read_workbook_bytes(path)
    return xlrd.open_workbook(file_contents=data).sheet_by_index(0)


def should_skip_row(state: str, cand: str, party: str) -> bool:
    if not state or state not in STATE_TO_CODE:
        return True
    if not cand or not str(cand).strip():
        return True
    low = state.lower()
    if "disclaimer" in low or "note" in low and len(state) > 80:
        return True
    if state.startswith("*"):
        return True
    return False


def build_pc_database(sh) -> Dict[Tuple[str, int], Dict[str, Any]]:
    """(state_code, pc_no) -> aggregated PC payload."""
    pcs: Dict[Tuple[str, int], Dict[str, Any]] = {}

    for r in range(2, sh.nrows):
        state = str(sh.cell_value(r, 0)).strip()
        cand_raw = sh.cell_value(r, 9)
        cand = str(cand_raw).strip() if cand_raw else ""
        party_raw = sh.cell_value(r, 10)
        party = str(party_raw).strip() if party_raw else ""

        if should_skip_row(state, cand, party):
            continue

        code = STATE_TO_CODE[state]
        pc_no = int(sh.cell_value(r, 1))
        pc_name = str(sh.cell_value(r, 2)).strip()
        pc_electors = int(sh.cell_value(r, 3)) if sh.cell_value(r, 3) else 0
        ac_no = int(sh.cell_value(r, 4)) if sh.cell_value(r, 4) else 0
        ac_name = str(sh.cell_value(r, 5)).strip()
        votes_raw = sh.cell_value(r, 11)
        votes = int(votes_raw) if votes_raw else 0

        key = (code, pc_no)
        if key not in pcs:
            pcs[key] = {
                "state": state,
                "pc_name": pc_name,
                "pc_electors": pc_electors,
                "ac_order": [],  # list of (ac_no, ac_name)
                "ac_seen": set(),
                "candidates": defaultdict(lambda: {"votes_by_ac": {}, "name": cand, "party": party}),
            }

        entry = pcs[key]
        # Prefer first-seen electors / name if repeated
        if not entry["pc_electors"] and pc_electors:
            entry["pc_electors"] = pc_electors

        ac_key = (ac_no, ac_name)
        if ac_key not in entry["ac_seen"]:
            entry["ac_seen"].add(ac_key)
            entry["ac_order"].append(ac_key)

        ck = (cand.upper(), party)
        cobj = entry["candidates"][ck]
        cobj["name"] = cand
        cobj["party"] = party
        vac = cobj["votes_by_ac"]
        vac[ac_key] = vac.get(ac_key, 0) + votes

    # Sort ACs by number
    for entry in pcs.values():
        entry["ac_order"].sort(key=lambda x: x[0])

    return pcs


def ac_totals_for_candidate_matrix(
    entry: Dict[str, Any], ac_order: List[Tuple[int, str]]
) -> Dict[Tuple[int, str], int]:
    totals = defaultdict(int)
    for cobj in entry["candidates"].values():
        for ac_key, v in cobj["votes_by_ac"].items():
            totals[ac_key] += v
    return totals


def build_pc_json(state_code: str, pc_no: int, entry: Dict[str, Any]) -> Dict[str, Any]:
    ac_order = entry["ac_order"]
    stripped = strip_reservation_suffix(entry["pc_name"])
    ctype = reservation_from_pc_name(entry["pc_name"])
    orig = original_display_name(stripped)

    ac_totals = ac_totals_for_candidate_matrix(entry, ac_order)

    cand_list: List[Dict[str, Any]] = []
    for _ck, cobj in entry["candidates"].items():
        total_votes = sum(cobj["votes_by_ac"].values())
        ac_wise = []
        for ac_key in ac_order:
            v = cobj["votes_by_ac"].get(ac_key, 0)
            atot = ac_totals.get(ac_key, 0)
            share = round((v / atot) * 100, 2) if atot > 0 else 0.0
            ac_wise.append({"acName": ac_key[1], "votes": v, "voteShare": share})

        cand_list.append(
            {
                "name": re.sub(r"\s+", " ", cobj["name"]).strip().upper(),
                "party": cobj["party"],
                "votes": total_votes,
                "voteShare": 0.0,
                "position": 0,
                "acWiseVotes": ac_wise,
            }
        )

    cand_list.sort(key=lambda x: x["votes"], reverse=True)
    valid_votes = sum(c["votes"] for c in cand_list)

    for i, c in enumerate(cand_list):
        c["position"] = i + 1
        c["voteShare"] = round((c["votes"] / valid_votes) * 100, 2) if valid_votes else 0.0

    if len(cand_list) >= 2:
        cand_list[0]["margin"] = cand_list[0]["votes"] - cand_list[1]["votes"]

    electors = entry["pc_electors"]
    turnout = round((valid_votes / electors) * 100, 2) if electors else 0.0

    schema_id = f"{state_code}-{pc_no:02d}"

    return {
        "constituencyName": stripped.upper(),
        "constituencyNameOriginal": orig,
        "constituencyNo": pc_no,
        "constituencyType": ctype,
        "state": entry["state"],
        "year": 2024,
        "electors": electors,
        "validVotes": valid_votes,
        "turnout": turnout,
        "totalCandidates": len(cand_list),
        "candidates": cand_list,
        "schemaId": schema_id,
        "name": orig,
        "type": ctype,
    }


def merge_surat_gujarat(out_gj: Dict[str, Any], prev_path: str) -> None:
    if not os.path.isfile(prev_path):
        return
    with open(prev_path, "r", encoding="utf-8") as f:
        prev = json.load(f)
    if "GJ-24" in prev and "GJ-24" not in out_gj:
        out_gj["GJ-24"] = prev["GJ-24"]
        # Normalize display fields if legacy
        p = out_gj["GJ-24"]
        if "stateName" in p and "state" not in p:
            p["state"] = p.pop("stateName")
        p.setdefault("year", 2024)


def update_index(state_code: str, state_display: str, slug: str, n_pc: int) -> None:
    idx_path = os.path.join(PC_BASE, state_code, "index.json")
    state_dir = os.path.join(PC_BASE, state_code)
    years: List[int] = []
    if os.path.isdir(state_dir):
        for fname in os.listdir(state_dir):
            m = re.match(r"^(\d{4})\.json$", fname)
            if m:
                years.append(int(m.group(1)))
    if not years:
        years = [2024]
    years = sorted(set(years))

    idx_data = {
        "state": state_display,
        "stateSlug": slug,
        "availableYears": years,
        "years": years,
        "totalConstituencies": n_pc,
        "lastUpdated": date.today().isoformat(),
        "source": "ECI/TCPD",
        "stateCode": state_code,
    }
    with open(idx_path, "w", encoding="utf-8") as f:
        json.dump(idx_data, f, indent=2)
        f.write("\n")


# slug mirrors scripts/update-2024-pc-with-acwise.mjs STATE_SLUG_MAP
CODE_TO_SLUG = {
    "AN": "andaman-and-nicobar-islands",
    "AP": "andhra-pradesh",
    "AR": "arunachal-pradesh",
    "AS": "assam",
    "BR": "bihar",
    "CH": "chandigarh",
    "CG": "chhattisgarh",
    "DD": "dnh-and-dd",
    "GA": "goa",
    "GJ": "gujarat",
    "HR": "haryana",
    "HP": "himachal-pradesh",
    "JK": "jammu-and-kashmir",
    "JH": "jharkhand",
    "KA": "karnataka",
    "KL": "kerala",
    "LD": "ladakh",
    "LA": "lakshadweep",
    "MP": "madhya-pradesh",
    "MH": "maharashtra",
    "MN": "manipur",
    "ML": "meghalaya",
    "MZ": "mizoram",
    "DL": "nct-of-delhi",
    "NL": "nagaland",
    "OD": "odisha",
    "PY": "puducherry",
    "PB": "punjab",
    "RJ": "rajasthan",
    "SK": "sikkim",
    "TN": "tamil-nadu",
    "TS": "telangana",
    "TR": "tripura",
    "UP": "uttar-pradesh",
    "UK": "uttarakhand",
    "WB": "west-bengal",
}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "--xls",
        default=os.path.expanduser("~/Desktop/34-Details-Of-Assembly-Segment-Of-PC.xls"),
        help="Path to ECI 34-Details-Of-Assembly-Segment-Of-PC.xls",
    )
    ap.add_argument(
        "--no-post-fixes",
        action="store_true",
        help="Skip Jajpur OD-08 correction (not recommended)",
    )
    args = ap.parse_args()
    path = args.xls
    if not os.path.isfile(path):
        print(f"Missing file: {path}", file=sys.stderr)
        raise SystemExit(2)

    print(f"Reading {path} …")
    sh = load_sheet(path)
    pcs = build_pc_database(sh)

    by_state: Dict[str, Dict[str, Any]] = defaultdict(dict)
    for (code, pc_no), entry in pcs.items():
        schema_id = f"{code}-{pc_no:02d}"
        by_state[code][schema_id] = build_pc_json(code, pc_no, entry)

    gj_path = os.path.join(PC_BASE, "GJ", "2024.json")
    if "GJ" in by_state:
        merge_surat_gujarat(by_state["GJ"], gj_path)

    for code, payload in sorted(by_state.items()):
        out_dir = os.path.join(PC_BASE, code)
        os.makedirs(out_dir, exist_ok=True)
        out_path = os.path.join(out_dir, "2024.json")
        # Sort keys by constituency number
        ordered = dict(sorted(payload.items(), key=lambda kv: kv[1]["constituencyNo"]))
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(ordered, f, indent=2)
            f.write("\n")
        st_display = next(pcs[k]["state"] for k in pcs if k[0] == code)
        update_index(code, st_display, CODE_TO_SLUG.get(code, code.lower()), len(ordered))
        print(f"Wrote {out_path} ({len(ordered)} PCs)")

    if not args.no_post_fixes:
        fix_script = os.path.join(REPO_ROOT, "scripts", "fix-od08-jajpur-2024-eci-discrepancy.mjs")
        if os.path.isfile(fix_script):
            print("Running Jajpur OD-08 post-fix …")
            subprocess.run(["node", fix_script], check=True, cwd=REPO_ROOT)
    print("Done.")


if __name__ == "__main__":
    main()
