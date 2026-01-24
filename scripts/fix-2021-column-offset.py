#!/usr/bin/env python3
"""
Fix column offset issues in 2021 ACS data.

Problem: Some ACs have "Total Electors" column incorrectly parsed as first candidate votes,
causing ~2x inflation of vote totals.

Detection: If sum of first column is much larger than expected votes, remove first column.
"""

import json
import re
from pathlib import Path

OUTPUT_BASE = Path("/Users/p0s097d/ElectionLens/public/data/booths/TN")
AC_DATA = Path("/Users/p0s097d/ElectionLens/public/data/elections/ac/TN/2021.json")


def load_data():
    with open(AC_DATA) as f:
        return json.load(f)


def get_base_booth_no(booth_no: str) -> int:
    match = re.match(r'^0*(\d+)', str(booth_no))
    return int(match.group(1)) if match else 0


def detect_offset(ac_id: str, ac_data: dict) -> bool:
    """Detect if AC has column offset issue."""
    results_file = OUTPUT_BASE / ac_id / "2021.json"
    if not results_file.exists():
        return False
    
    with open(results_file) as f:
        data = json.load(f)
    
    official = ac_data.get(ac_id, {})
    if not official:
        return False
    
    official_total = official.get('validVotes', 0)
    if official_total == 0:
        return False
    
    results = data.get('results', {})
    if not results:
        return False
    
    # Calculate column sums
    num_cands = len(data.get('candidates', []))
    if num_cands == 0:
        return False
    
    col_sums = [0] * num_cands
    for r in results.values():
        votes = r.get('votes', [])
        for i, v in enumerate(votes):
            if i < num_cands:
                col_sums[i] += v
    
    if len(col_sums) < 2:
        return False
    
    # Check for offset: col0 > 2x col1 and col0 > 50000
    total_with_first = sum(col_sums[:num_cands])
    total_without_first = sum(col_sums[1:num_cands+1])
    
    if official_total > 0:
        ratio_with = total_with_first / official_total
        ratio_without = total_without_first / official_total
        
        # If total with first column is way too high (>120%) and without is better
        if ratio_with > 1.20 and ratio_without < ratio_with * 0.9:
            return True
        
        # Classic offset: col0 > 2x col1 and col0 > 50000
        if col_sums[0] > col_sums[1] * 2 and col_sums[0] > 50000:
            # Also check if removing first column improves match
            ratio_with_err = abs(total_with_first - official_total) / official_total
            ratio_without_err = abs(total_without_first - official_total) / official_total
            
            # If removing first column gives better match, it's offset
            if ratio_without_err < ratio_with_err * 0.8:
                return True
    
    # Also check if first column values look like "Total Electors" (400-2500 range)
    sample_booths = list(results.values())[:20]
    if sample_booths:
        first_col_values = [r.get('votes', [])[0] for r in sample_booths if r.get('votes') and len(r.get('votes', [])) > 0]
        if first_col_values:
            avg_first = sum(first_col_values) / len(first_col_values)
            # Total Electors typically 400-2500, votes typically 50-2000
            if 400 <= avg_first <= 2500:
                # Check if total with first column is way off
                total_with_first = sum(col_sums)
                if total_with_first > official_total * 1.2:
                    return True
    
    return False


def fix_ac(ac_id: str) -> dict:
    """Fix column offset by removing first column."""
    results_file = OUTPUT_BASE / ac_id / "2021.json"
    
    if not results_file.exists():
        return {'status': 'error', 'error': 'File not found'}
    
    with open(results_file) as f:
        data = json.load(f)
    
    # Check if already fixed
    source = data.get('source', '')
    if 'column offset fixed' in source.lower():
        return {'status': 'already_fixed'}
    
    original_cands = len(data.get('candidates', []))
    
    # Remove first candidate
    candidates = data.get('candidates', [])
    if candidates:
        data['candidates'] = candidates[1:]
    
    # Remove first vote column from all booths
    booths_fixed = 0
    for booth_id, r in data.get('results', {}).items():
        votes = r.get('votes', [])
        if votes and len(votes) > 0:
            r['votes'] = votes[1:]
            r['total'] = sum(r['votes'])
            booths_fixed += 1
    
    data['source'] = source + ' (column offset fixed)'
    
    with open(results_file, 'w') as f:
        json.dump(data, f, indent=2)
    
    return {
        'status': 'fixed',
        'booths': booths_fixed,
        'cands_before': original_cands,
        'cands_after': len(data.get('candidates', []))
    }


def main():
    print("=" * 80)
    print("FIXING 2021 COLUMN OFFSET ISSUES")
    print("=" * 80)
    
    ac_data = load_data()
    
    # ACs with known column offset issues from status report
    offset_acs = [
        5, 12, 13, 15, 16, 19, 63, 76, 86, 129, 140, 141, 144, 173, 208, 214, 226, 234, 159
    ]
    
    fixed_count = 0
    already_fixed = 0
    error_count = 0
    
    for ac_num in offset_acs:
        ac_id = f"TN-{ac_num:03d}"
        
        # Double-check detection
        if detect_offset(ac_id, ac_data):
            result = fix_ac(ac_id)
            if result['status'] == 'fixed':
                print(f"✓ {ac_id}: Fixed {result['booths']} booths, {result['cands_before']} → {result['cands_after']} candidates")
                fixed_count += 1
            elif result['status'] == 'already_fixed':
                print(f"⊘ {ac_id}: Already fixed")
                already_fixed += 1
            else:
                print(f"✗ {ac_id}: {result.get('error', 'Unknown error')}")
                error_count += 1
        else:
            print(f"⊘ {ac_id}: No offset detected (may have been fixed already)")
    
    print(f"\n{'='*80}")
    print(f"SUMMARY")
    print(f"{'='*80}")
    print(f"  Fixed: {fixed_count}")
    print(f"  Already fixed: {already_fixed}")
    print(f"  Errors: {error_count}")


if __name__ == "__main__":
    main()
