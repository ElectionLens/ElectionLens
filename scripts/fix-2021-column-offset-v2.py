#!/usr/bin/env python3
"""
Fix column offset issues in 2021 ACS data - Enhanced version.
Can remove multiple offset columns (Total Electors, etc.)
"""

import json
import re
from pathlib import Path

OUTPUT_BASE = Path("/Users/p0s097d/ElectionLens/public/data/booths/TN")
AC_DATA = Path("/Users/p0s097d/ElectionLens/public/data/elections/ac/TN/2021.json")


def load_data():
    with open(AC_DATA) as f:
        return json.load(f)


def find_best_column_removal(ac_id: str, ac_data: dict) -> int:
    """Find how many columns to remove for best match."""
    results_file = OUTPUT_BASE / ac_id / "2021.json"
    if not results_file.exists():
        return 0
    
    with open(results_file) as f:
        data = json.load(f)
    
    official = ac_data.get(ac_id, {})
    official_total = official.get('validVotes', 0)
    if official_total == 0:
        return 0
    
    results = data.get('results', {})
    if not results:
        return 0
    
    num_cands = len(data.get('candidates', []))
    if num_cands == 0:
        return 0
    
    # Calculate column sums
    col_sums = [0] * (num_cands + 10)  # Allow more columns
    for r in results.values():
        votes = r.get('votes', [])
        for i, v in enumerate(votes):
            if i < len(col_sums):
                col_sums[i] += v
    
    # Try removing 0, 1, 2, 3, 4 columns
    best_removal = 0
    best_ratio = 999.0
    best_total = 0
    
    for remove_count in range(5):
        if remove_count + num_cands > len(col_sums):
            break
        
        total = sum(col_sums[remove_count:remove_count+num_cands])
        if official_total > 0:
            # Calculate ratio - prefer ratios close to 1.0
            ratio = abs(total - official_total) / official_total
            if ratio < best_ratio:
                best_ratio = ratio
                best_removal = remove_count
                best_total = total
    
    # Check if best removal gives us a good match (90-110% of official)
    if official_total > 0:
        ratio_best = best_total / official_total
        
        # If current state is already good (90-110%), don't change
        total_current = sum(col_sums[:num_cands])
        ratio_current = total_current / official_total
        
        if 0.90 <= ratio_current <= 1.10:
            return 0  # Already good, no need to remove
        
        # If best removal gives us a good match, use it
        if 0.90 <= ratio_best <= 1.10:
            return best_removal
        
        # If best removal is significantly better than current, use it
        if best_ratio < (abs(total_current - official_total) / official_total) * 0.8:
            return best_removal
    
    return 0


def fix_ac(ac_id: str, remove_count: int) -> dict:
    """Fix column offset by removing specified number of columns."""
    results_file = OUTPUT_BASE / ac_id / "2021.json"
    
    if not results_file.exists():
        return {'status': 'error', 'error': 'File not found'}
    
    if remove_count == 0:
        return {'status': 'skipped', 'reason': 'No removal needed'}
    
    with open(results_file) as f:
        data = json.load(f)
    
    # Check if already fixed
    source = data.get('source', '')
    if f'column offset fixed ({remove_count} cols)' in source.lower():
        return {'status': 'already_fixed'}
    
    original_cands = len(data.get('candidates', []))
    
    # Remove first N candidates
    candidates = data.get('candidates', [])
    if candidates and remove_count > 0:
        data['candidates'] = candidates[remove_count:]
    
    # Remove first N vote columns from all booths
    booths_fixed = 0
    for booth_id, r in data.get('results', {}).items():
        votes = r.get('votes', [])
        if votes and len(votes) > remove_count:
            r['votes'] = votes[remove_count:]
            r['total'] = sum(r['votes'])
            booths_fixed += 1
    
    data['source'] = source + f' (column offset fixed - removed {remove_count} cols)'
    
    with open(results_file, 'w') as f:
        json.dump(data, f, indent=2)
    
    return {
        'status': 'fixed',
        'booths': booths_fixed,
        'cands_before': original_cands,
        'cands_after': len(data.get('candidates', [])),
        'removed_cols': remove_count
    }


def main():
    print("=" * 80)
    print("FIXING 2021 COLUMN OFFSET ISSUES (Enhanced - Multi-column removal)")
    print("=" * 80)
    
    ac_data = load_data()
    
    # ACs with known column offset issues
    offset_acs = [
        5, 12, 13, 15, 16, 19, 63, 76, 86, 129, 140, 141, 144, 173, 208, 214, 226, 234, 159
    ]
    
    fixed_count = 0
    already_fixed = 0
    skipped_count = 0
    error_count = 0
    
    for ac_num in offset_acs:
        ac_id = f"TN-{ac_num:03d}"
        
        # Find best removal count
        remove_count = find_best_column_removal(ac_id, ac_data)
        
        if remove_count > 0:
            result = fix_ac(ac_id, remove_count)
            if result['status'] == 'fixed':
                print(f"✓ {ac_id}: Removed {result['removed_cols']} columns, {result['booths']} booths, {result['cands_before']} → {result['cands_after']} candidates")
                fixed_count += 1
            elif result['status'] == 'already_fixed':
                print(f"⊘ {ac_id}: Already fixed")
                already_fixed += 1
            else:
                print(f"✗ {ac_id}: {result.get('error', 'Unknown error')}")
                error_count += 1
        else:
            print(f"⊘ {ac_id}: No offset detected (ratio already good)")
            skipped_count += 1
    
    print(f"\n{'='*80}")
    print(f"SUMMARY")
    print(f"{'='*80}")
    print(f"  Fixed: {fixed_count}")
    print(f"  Already fixed: {already_fixed}")
    print(f"  Skipped (no fix needed): {skipped_count}")
    print(f"  Errors: {error_count}")


if __name__ == "__main__":
    main()
