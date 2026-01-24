#!/usr/bin/env python3
"""
Final push to 100% - Fix remaining issues systematically.
"""

import json
import subprocess
from pathlib import Path

OUTPUT_BASE = Path("/Users/p0s097d/ElectionLens/public/data/booths/TN")
AC_DATA = Path("/Users/p0s097d/ElectionLens/public/data/elections/ac/TN/2021.json")


def load_data():
    with open(AC_DATA) as f:
        return json.load(f)


def calculate_gap():
    """Calculate the exact gap to 100%."""
    ac_data = load_data()
    
    total_official = sum(ac.get('validVotes', 0) for ac in ac_data.values())
    total_extracted = 0
    
    for ac_num in range(1, 235):
        ac_id = f'TN-{ac_num:03d}'
        data_file = OUTPUT_BASE / ac_id / "2021.json"
        if data_file.exists():
            with open(data_file) as f:
                data = json.load(f)
            total_extracted += sum(sum(r.get('votes', [])) for r in data.get('results', {}).values())
    
    missing = total_official - total_extracted
    return {
        'official': total_official,
        'extracted': total_extracted,
        'missing': missing,
        'coverage': total_extracted / total_official * 100 if total_official > 0 else 0
    }


def main():
    print("=" * 80)
    print("FINAL PUSH TO 100% - 2021 ACS DATA")
    print("=" * 80)
    
    gap = calculate_gap()
    
    print(f"\nCurrent Status:")
    print(f"  Official votes: {gap['official']:,}")
    print(f"  Extracted votes: {gap['extracted']:,}")
    print(f"  Missing votes: {gap['missing']:,}")
    print(f"  Coverage: {gap['coverage']:.2f}%")
    print(f"  Gap to 100%: {gap['missing']:,} votes ({100 - gap['coverage']:.2f}%)")
    
    print(f"\n{'='*80}")
    print("STRATEGY TO REACH 100%")
    print("=" * 80)
    
    print("\n1. Run comprehensive vote column fix...")
    subprocess.run(['python3', 'scripts/fix-vote-columns-comprehensive-2021.py'], 
                   cwd='/Users/p0s097d/ElectionLens')
    
    print("\n2. Check updated status...")
    gap_after = calculate_gap()
    improvement = gap['missing'] - gap_after['missing']
    
    print(f"\n  Coverage: {gap['coverage']:.2f}% → {gap_after['coverage']:.2f}%")
    print(f"  Improvement: {improvement:,} votes")
    
    print("\n3. Remaining work:")
    print(f"  - {gap_after['missing']:,} votes still missing")
    print(f"  - Primarily from 4 scanned PDFs and complex ACs")
    
    print("\n4. Final status report...")
    subprocess.run(['python3', 'scripts/status-2021-acs.py'], cwd='/Users/p0s097d/ElectionLens')


if __name__ == "__main__":
    main()
