#!/usr/bin/env python3
"""
Fix ACs with too few votes (<90%) by re-extracting or fixing mapping.
"""

import json
import subprocess
from pathlib import Path

OUTPUT_BASE = Path("/Users/p0s097d/ElectionLens/public/data/booths/TN")
AC_DATA = Path("/Users/p0s097d/ElectionLens/public/data/elections/ac/TN/2021.json")
FORM20_DIR = Path.home() / "Desktop/TNLA_2021_PDFs"


def load_data():
    with open(AC_DATA) as f:
        return json.load(f)


def re_extract_ac(ac_num: int) -> dict:
    """Re-extract AC using enhanced parser."""
    ac_id = f"TN-{ac_num:03d}"
    
    result = subprocess.run(
        ['python3', 'scripts/unified-pdf-parser-v2-2021.py', str(ac_num)],
        capture_output=True,
        text=True,
        cwd='/Users/p0s097d/ElectionLens',
        timeout=300
    )
    
    return {'status': 'success' if result.returncode == 0 else 'error', 'output': result.stdout, 'error': result.stderr}


def main():
    print("=" * 80)
    print("FIXING ACs WITH TOO FEW VOTES (<90%)")
    print("=" * 80)
    
    ac_data = load_data()
    
    # Find ACs with <90% votes (excluding scanned PDFs)
    under_votes = []
    scanned_acs = [32, 33, 108, 109]  # Known scanned PDFs
    
    for ac_num in range(1, 235):
        if ac_num in scanned_acs:
            continue
            
        ac_id = f'TN-{ac_num:03d}'
        official = ac_data.get(ac_id, {})
        official_total = official.get('validVotes', 0)
        
        if official_total == 0:
            continue
        
        data_file = OUTPUT_BASE / ac_id / "2021.json"
        if not data_file.exists():
            continue
        
        with open(data_file) as f:
            data = json.load(f)
        
        current_total = sum(sum(r.get('votes', [])) for r in data.get('results', {}).values())
        ratio = current_total / official_total if official_total > 0 else 0
        
        if ratio < 0.90:
            under_votes.append((ac_num, ac_id, ratio, current_total, official_total))
    
    print(f"Found {len(under_votes)} ACs with <90% votes (excluding scanned PDFs)\n")
    
    # Sort by worst ratio
    under_votes.sort(key=lambda x: x[2])
    
    fixed_count = 0
    for ac_num, ac_id, ratio, curr, off in under_votes[:15]:  # Fix top 15
        print(f"Re-extracting {ac_id} ({curr:,}/{off:,} = {ratio:.1%})...")
        result = re_extract_ac(ac_num)
        
        if result['status'] == 'success':
            # Check if improved
            with open(OUTPUT_BASE / ac_id / "2021.json") as f:
                new_data = json.load(f)
            new_total = sum(sum(r.get('votes', [])) for r in new_data.get('results', {}).values())
            new_ratio = new_total / off if off > 0 else 0
            
            if new_ratio > ratio:
                print(f"  ✓ Improved: {ratio:.1%} → {new_ratio:.1%}")
                fixed_count += 1
            else:
                print(f"  ⊘ No improvement: {new_ratio:.1%}")
        else:
            print(f"  ✗ Error: {result.get('error', 'Unknown')[:100]}")
    
    print(f"\n{'='*80}")
    print(f"SUMMARY: Re-extracted {fixed_count}/{len(under_votes)} ACs")
    
    # Run vote column fix
    print("\nRunning vote column fix...")
    subprocess.run(['python3', 'scripts/fix-2021-vote-columns.py'], cwd='/Users/p0s097d/ElectionLens')


if __name__ == "__main__":
    main()
