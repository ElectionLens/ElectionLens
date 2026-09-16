#!/usr/bin/env python3
"""Audit the public election-data-2026.vercel.app TN 2026 API.

The deployed app is useful as an independent comparison source, but its index marks all
234 ACs parsed even though several station arrays are empty/incomplete. This script records
those discrepancies without importing unverified API data into production JSON.
"""

from __future__ import annotations

import argparse
import json
import time
from pathlib import Path
from urllib.error import URLError
from urllib.request import Request, urlopen

BASE_URL = "https://election-data-2026.vercel.app"
REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUT = REPO_ROOT / "scripts/cache/tn_2026_deployed_api_audit.json"


def get_json(url: str, attempts: int = 4) -> dict | list:
    """Fetch JSON with retry/backoff for transient Vercel/network resets."""
    request = Request(url, headers={"User-Agent": "ElectionLens/1.0"})
    last_error: Exception | None = None
    for attempt in range(attempts):
        try:
            with urlopen(request, timeout=60) as response:
                return json.loads(response.read().decode("utf-8"))
        except (URLError, TimeoutError, OSError) as error:
            last_error = error
            if attempt + 1 < attempts:
                time.sleep(2**attempt)
    raise RuntimeError(f"Unable to fetch {url}: {last_error}")


def int_value(value: object) -> int:
    try:
        return int(value or 0)
    except (TypeError, ValueError):
        return 0


def audit() -> dict:
    index = get_json(f"{BASE_URL}/api/constituencies")
    rows = index if isinstance(index, list) else index.get("constituencies", [])
    ac_reports: list[dict] = []
    for item in rows:
        ac_id = int(item["id"])
        payload = get_json(f"{BASE_URL}/api/constituency/{ac_id}")
        stations = payload.get("pollingStations") or []
        totals = payload.get("totals") or {}
        station_valid = sum(int_value(s.get("validVotes")) for s in stations)
        station_total = sum(int_value(s.get("total")) for s in stations)
        reported_valid = int_value(totals.get("validVotes"))
        reported_total = int_value(totals.get("total"))
        ids = [s.get("stationId") for s in stations]
        ac_reports.append(
            {
                "acNo": ac_id,
                "name": item.get("name"),
                "parsed": bool(payload.get("parsed")),
                "stationCount": len(stations),
                "reportedValidVotes": reported_valid,
                "stationValidVotes": station_valid,
                "validVotesMatch": station_valid == reported_valid,
                "reportedTotal": reported_total,
                "stationTotal": station_total,
                "totalMatch": station_total == reported_total,
                "stationIdsUnique": len(ids) == len(set(ids)),
                "stationIdsContiguous": ids == list(range(1, len(ids) + 1)),
                "hasStationData": bool(stations),
            }
        )
    return {
        "source": BASE_URL,
        "endpoint": "/api/constituency/{id}",
        "constituencies": len(ac_reports),
        "withStationData": sum(bool(r["hasStationData"]) for r in ac_reports),
        "validTotalsMatch": sum(bool(r["validVotesMatch"]) for r in ac_reports),
        "totalTotalsMatch": sum(bool(r["totalMatch"]) for r in ac_reports),
        "flagged": [
            r for r in ac_reports
            if not r["hasStationData"]
            or not r["validVotesMatch"]
            or not r["totalMatch"]
            or not r["stationIdsUnique"]
            or not r["stationIdsContiguous"]
        ],
        "acReports": ac_reports,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    args = parser.parse_args()
    report = audit()
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps({k: report[k] for k in ("constituencies", "withStationData", "validTotalsMatch", "totalTotalsMatch")}, indent=2))
    print(f"Wrote {args.out}")


if __name__ == "__main__":
    main()
