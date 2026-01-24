#!/usr/bin/env python3
"""
Re-extract high error ACs with enhanced parser to fix issues.
"""

import json
import subprocess
from pathlib import Path

OUTPUT_BASE = Path("/Users/p0s097d/ElectionLens/public/data/booths/TN")
AC_DATA = Path("/Users/p0s097d/ElectionLens/public/data/elections/ac/TN/2021.json")
SCHEMA = Path("/Users/p0s097d/ElectionLens/public/data/schema.json")


def load_data():
    with open(AC_DATA) as f:
        ac_data = json.load(f)
    with open(SCHEMA) as f:
        schema = json.load(f)
    return ac_data, schema


def check_ac_error(ac_id: str, ac_data: dict) -> float:
    """Check current error rate for an AC."""
    official = ac_data.get(ac_id, {})
    official_total = official.get('validVotes', 0)
    
    data_file = OUTPUT_BASE / ac_id / "2021.json"
    if not data_file.exists():
        return 999.0
    
    with open(data_file) as f:
        data = json.load(f)
    
    total_votes = 0
    for r in data.get('results', {}).values():
        total_votes += sum(r.get('votes', []))
    
    if official_total > 0:
        error = abs(total_votes - official_total) / official_total * 100
        return error
    return 999.0


def re_extract_ac(ac_num: int) -> dict:
    """Re-extract AC using enhanced parser."""
    ac_id = f"TN-{ac_num:03d}"
    
    print(f"\n{'='*70}")
    print(f"Re-extracting {ac_id}")
    print(f"{'='*70}")
    
    # Run enhanced parser with force flag
    result = subprocess.run(
        ['python3', 'scripts/unified-pdf-parser-v2-2021.py', str(ac_num)],
        capture_output=True,
        text=True,
        cwd='/Users/p0s097d/ElectionLens',
        timeout=300
    )
    
    if result.returncode == 0:
        # Check if it improved
        return {'status': 'success', 'output': result.stdout}
    else:
        return {'status': 'error', 'error': result.stderr}


def main():
    print("=" * 80)
    print("RE-EXTRACTING HIGH ERROR ACs FOR 2021 DATA")
    print("=" * 80)
    
    ac_data, schema = load_data()
    
    # High error ACs
    high_error_acs = [128, 141, 140, 204, 35, 74, 130, 94, 113, 208]
    
    print("\nCurrent error rates:")
    for ac_num in high_error_acs:
        ac_id = f"TN-{ac_num:03d}"
        error = check_ac_error(ac_id, ac_data)
        print(f"  {ac_id}: {error:.1f}% error")
    
    print("\nRe-extracting with enhanced parser...")
    print("-" * 80)
    
    success_count = 0
    error_count = 0
    
    for ac_num in high_error_acs:
        result = re_extract_ac(ac_num)
        
        if result['status'] == 'success':
            # Check if error improved
            ac_id = f"TN-{ac_num:03d}"
            old_error = check_ac_error(ac_id, ac_data)
            print(f"✓ {ac_id}: Re-extracted (current error: {old_error:.1f}%)")
            success_count += 1
        else:
            print(f"✗ TN-{ac_num:03d}: {result.get('error', 'Unknown error')[:100]}")
            error_count += 1
    
    print(f"\n{'='*80}")
    print(f"SUMMARY")
    print(f"{'='*80}")
    print(f"  Success: {success_count}")
    print(f"  Errors: {error_count}")
    
    # Run vote column fix after re-extraction
    print("\nRunning vote column fix...")
    subprocess.run(['python3', 'scripts/fix-2021-vote-columns.py'], cwd='/Users/p0s097d/ElectionLens')


if __name__ == "__main__":
    main()
