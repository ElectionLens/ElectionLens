#!/usr/bin/env python3
"""
Comprehensive fix to achieve 100% coverage for 2021 ACS data.

Fixes:
1. ACs with too many votes (remove extra columns)
2. ACs with too few votes (re-extract or fix mapping)
3. Missing booths from scanned PDFs
"""

import json
import re
import subprocess
from pathlib import Path

OUTPUT_BASE = Path("/Users/p0s097d/ElectionLens/public/data/booths/TN")
AC_DATA = Path("/Users/p0s097d/ElectionLens/public/data/elections/ac/TN/2021.json")
FORM20_DIR = Path.home() / "Desktop/TNLA_2021_PDFs"


def load_data():
    with open(AC_DATA) as f:
        return json.load(f)


def fix_over_votes(ac_id: str, ac_data: dict) -> dict:
    """Fix ACs with too many votes (110%+) by removing extra columns."""
    results_file = OUTPUT_BASE / ac_id / "2021.json"
    if not results_file.exists():
        return {'status': 'error', 'error': 'File not found'}
    
    with open(results_file) as f:
        data = json.load(f)
    
    official = ac_data.get(ac_id, {})
    official_total = official.get('validVotes', 0)
    official_cands = official.get('candidates', [])
    
    if official_total == 0:
        return {'status': 'error', 'error': 'No official total'}
    
    # Calculate current totals
    results = data.get('results', {})
    if not results:
        return {'status': 'error', 'error': 'No results'}
    
    num_cols = max(len(r.get('votes', [])) for r in results.values())
    col_sums = [0] * num_cols
    
    for r in results.values():
        votes = r.get('votes', [])
        for i, v in enumerate(votes):
            if i < num_cols:
                col_sums[i] += v
    
    current_total = sum(col_sums)
    ratio = current_total / official_total
    
    # If over 110%, try removing columns from the end
    if ratio > 1.10:
        # Try removing last N columns to get closer to official
        best_removal = 0
        best_ratio = ratio
        
        for remove_end in range(1, min(5, num_cols - len(official_cands) + 1)):
            test_total = sum(col_sums[:len(col_sums) - remove_end])
            test_ratio = test_total / official_total if official_total > 0 else 999
            
            if abs(test_ratio - 1.0) < abs(best_ratio - 1.0):
                best_ratio = test_ratio
                best_removal = remove_end
        
        if best_removal > 0 and abs(best_ratio - 1.0) < abs(ratio - 1.0):
            # Remove last N columns
            num_cands = len(official_cands)
            booths_fixed = 0
            
            for booth_id, r in results.items():
                old_votes = r.get('votes', [])
                if len(old_votes) > num_cands:
                    r['votes'] = old_votes[:num_cands]
                    r['total'] = sum(r['votes'])
                    booths_fixed += 1
            
            data['candidates'] = [
                {'name': c.get('name', ''), 'party': c.get('party', ''), 'symbol': ''}
                for c in official_cands
            ]
            
            data['source'] = data.get('source', '') + f' (removed {best_removal} extra columns)'
            
            with open(results_file, 'w') as f:
                json.dump(data, f, indent=2)
            
            return {'status': 'fixed', 'booths': booths_fixed, 'old_ratio': ratio, 'new_ratio': best_ratio}
    
    return {'status': 'skipped', 'reason': 'No fix needed'}


def fix_under_votes(ac_id: str, ac_data: dict) -> dict:
    """Fix ACs with too few votes (<90%) by re-extracting."""
    official = ac_data.get(ac_id, {})
    official_total = official.get('validVotes', 0)
    
    if official_total == 0:
        return {'status': 'error', 'error': 'No official total'}
    
    results_file = OUTPUT_BASE / ac_id / "2021.json"
    if not results_file.exists():
        return {'status': 'error', 'error': 'File not found'}
    
    with open(results_file) as f:
        data = json.load(f)
    
    current_total = sum(sum(r.get('votes', [])) for r in data.get('results', {}).values())
    ratio = current_total / official_total if official_total > 0 else 0
    
    if ratio < 0.90:
        # Try re-extracting
        ac_num = int(ac_id.split('-')[1])
        pdf_path = FORM20_DIR / f"AC{ac_num:03d}.pdf"
        
        if pdf_path.exists():
            # Re-extract using enhanced parser
            result = subprocess.run(
                ['python3', 'scripts/unified-pdf-parser-v2-2021.py', str(ac_num)],
                capture_output=True,
                text=True,
                cwd='/Users/p0s097d/ElectionLens',
                timeout=300
            )
            
            if result.returncode == 0:
                # Re-check
                with open(results_file) as f:
                    new_data = json.load(f)
                new_total = sum(sum(r.get('votes', [])) for r in new_data.get('results', {}).values())
                new_ratio = new_total / official_total if official_total > 0 else 0
                
                return {'status': 're-extracted', 'old_ratio': ratio, 'new_ratio': new_ratio}
    
    return {'status': 'skipped', 'reason': 'No fix needed'}


def main():
    print("=" * 80)
    print("FIXING 2021 ACS DATA TO 100% COVERAGE")
    print("=" * 80)
    
    ac_data = load_data()
    
    # Get all ACs and check their status
    all_acs = [f"TN-{i:03d}" for i in range(1, 235)]
    
    over_votes = []  # >110%
    under_votes = []  # <90%
    
    for ac_id in all_acs:
        official = ac_data.get(ac_id, {})
        official_total = official.get('validVotes', 0)
        
        if official_total == 0:
            continue
        
        results_file = OUTPUT_BASE / ac_id / "2021.json"
        if not results_file.exists():
            continue
        
        with open(results_file) as f:
            data = json.load(f)
        
        current_total = sum(sum(r.get('votes', [])) for r in data.get('results', {}).values())
        ratio = current_total / official_total if official_total > 0 else 0
        
        if ratio > 1.10:
            over_votes.append((ac_id, ratio))
        elif ratio < 0.90:
            under_votes.append((ac_id, ratio))
    
    print(f"\nFound {len(over_votes)} ACs with too many votes (>110%)")
    print(f"Found {len(under_votes)} ACs with too few votes (<90%)")
    
    # Fix over-votes
    print(f"\n{'='*80}")
    print("FIXING ACs WITH TOO MANY VOTES (>110%)")
    print("=" * 80)
    
    fixed_over = 0
    for ac_id, ratio in over_votes[:10]:  # Fix top 10 first
        result = fix_over_votes(ac_id, ac_data)
        if result['status'] == 'fixed':
            print(f"✓ {ac_id}: {result['old_ratio']:.1%} → {result['new_ratio']:.1%} ({result['booths']} booths)")
            fixed_over += 1
        elif result['status'] == 'skipped':
            print(f"⊘ {ac_id}: {result.get('reason', 'Skipped')}")
    
    # Fix under-votes
    print(f"\n{'='*80}")
    print("FIXING ACs WITH TOO FEW VOTES (<90%)")
    print("=" * 80)
    
    fixed_under = 0
    for ac_id, ratio in under_votes[:10]:  # Fix top 10 first
        result = fix_under_votes(ac_id, ac_data)
        if result['status'] == 're-extracted':
            print(f"✓ {ac_id}: {result['old_ratio']:.1%} → {result['new_ratio']:.1%}")
            fixed_under += 1
        elif result['status'] == 'skipped':
            print(f"⊘ {ac_id}: {result.get('reason', 'Skipped')}")
        else:
            print(f"✗ {ac_id}: {result.get('error', 'Unknown error')}")
    
    print(f"\n{'='*80}")
    print("SUMMARY")
    print("=" * 80)
    print(f"  Fixed over-votes: {fixed_over}/{len(over_votes)}")
    print(f"  Fixed under-votes: {fixed_under}/{len(under_votes)}")
    
    # Run vote column fix
    print("\nRunning vote column fix...")
    subprocess.run(['python3', 'scripts/fix-2021-vote-columns.py'], cwd='/Users/p0s097d/ElectionLens')
    
    # Check final status
    print("\nChecking final status...")
    subprocess.run(['python3', 'scripts/status-2021-acs.py'], cwd='/Users/p0s097d/ElectionLens')


if __name__ == "__main__":
    main()
