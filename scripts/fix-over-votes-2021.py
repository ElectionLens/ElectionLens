#!/usr/bin/env python3
"""
Fix ACs with too many votes (>110%) by removing extra columns.
"""

import json
from pathlib import Path

OUTPUT_BASE = Path("/Users/p0s097d/ElectionLens/public/data/booths/TN")
AC_DATA = Path("/Users/p0s097d/ElectionLens/public/data/elections/ac/TN/2021.json")


def load_data():
    with open(AC_DATA) as f:
        return json.load(f)


def fix_ac(ac_id: str, ac_data: dict) -> dict:
    """Fix AC with too many votes."""
    results_file = OUTPUT_BASE / ac_id / "2021.json"
    if not results_file.exists():
        return {'status': 'error', 'error': 'File not found'}
    
    with open(results_file) as f:
        data = json.load(f)
    
    official = ac_data.get(ac_id, {})
    official_total = official.get('validVotes', 0)
    official_cands = official.get('candidates', [])
    num_official = len(official_cands)
    
    if official_total == 0 or num_official == 0:
        return {'status': 'error', 'error': 'No official data'}
    
    results = data.get('results', {})
    if not results:
        return {'status': 'error', 'error': 'No results'}
    
    # Calculate column sums
    num_cols = max(len(r.get('votes', [])) for r in results.values())
    col_sums = [0] * num_cols
    
    for r in results.values():
        votes = r.get('votes', [])
        for i, v in enumerate(votes):
            if i < num_cols:
                col_sums[i] += v
    
    current_total = sum(col_sums)
    ratio = current_total / official_total
    
    if ratio <= 1.10:
        return {'status': 'skipped', 'reason': f'Ratio OK ({ratio:.1%})'}
    
    # Try different column selections
    best_selection = None
    best_ratio = ratio
    best_total = current_total
    
    # Try keeping first N columns
    if num_cols >= num_official:
        test_total = sum(col_sums[:num_official])
        test_ratio = test_total / official_total
        if abs(test_ratio - 1.0) < abs(best_ratio - 1.0):
            best_ratio = test_ratio
            best_total = test_total
            best_selection = (0, num_official)
    
    # Try removing first column (might be offset)
    if num_cols > num_official:
        test_total = sum(col_sums[1:num_official+1])
        test_ratio = test_total / official_total
        if abs(test_ratio - 1.0) < abs(best_ratio - 1.0):
            best_ratio = test_ratio
            best_total = test_total
            best_selection = (1, num_official+1)
    
    # Try removing last columns
    for remove_end in range(1, min(5, num_cols - num_official + 1)):
        test_total = sum(col_sums[:len(col_sums) - remove_end])
        test_ratio = test_total / official_total
        if abs(test_ratio - 1.0) < abs(best_ratio - 1.0):
            best_ratio = test_ratio
            best_total = test_total
            best_selection = (0, len(col_sums) - remove_end)
    
    if best_selection and abs(best_ratio - 1.0) < abs(ratio - 1.0):
        # Apply fix
        start_idx, end_idx = best_selection
        booths_fixed = 0
        for booth_id, r in results.items():
            old_votes = r.get('votes', [])
            if len(old_votes) >= end_idx:
                r['votes'] = old_votes[start_idx:end_idx]
                # Ensure we have exactly num_official columns
                if len(r['votes']) < num_official:
                    r['votes'] = r['votes'] + [0] * (num_official - len(r['votes']))
                elif len(r['votes']) > num_official:
                    r['votes'] = r['votes'][:num_official]
                r['total'] = sum(r['votes'])
                booths_fixed += 1
        
        data['candidates'] = [
            {'name': c.get('name', ''), 'party': c.get('party', ''), 'symbol': ''}
            for c in official_cands
        ]
        
        data['source'] = data.get('source', '') + f' (removed {best_removal} extra columns)'
        
        with open(results_file, 'w') as f:
            json.dump(data, f, indent=2)
        
        removed = num_cols - num_official if best_selection else 0
        return {
            'status': 'fixed',
            'booths': booths_fixed,
            'old_ratio': ratio,
            'new_ratio': best_ratio,
            'removed': removed,
            'selection': best_selection
        }
    
    return {'status': 'skipped', 'reason': 'No improvement found'}


def main():
    print("=" * 80)
    print("FIXING ACs WITH TOO MANY VOTES (>110%)")
    print("=" * 80)
    
    ac_data = load_data()
    
    # Find ACs with >110% votes
    over_votes = []
    for ac_num in range(1, 235):
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
        
        if ratio > 1.10:
            over_votes.append((ac_id, ratio))
    
    print(f"Found {len(over_votes)} ACs with >110% votes\n")
    
    fixed_count = 0
    for ac_id, ratio in sorted(over_votes, key=lambda x: -x[1]):
        result = fix_ac(ac_id, ac_data)
        
        if result['status'] == 'fixed':
            print(f"✓ {ac_id}: {result['old_ratio']:.1%} → {result['new_ratio']:.1%} (removed {result['removed']} cols, {result['booths']} booths)")
            fixed_count += 1
        elif result['status'] == 'skipped':
            print(f"⊘ {ac_id}: {result.get('reason', 'Skipped')}")
    
    print(f"\n{'='*80}")
    print(f"SUMMARY: Fixed {fixed_count}/{len(over_votes)} ACs")


if __name__ == "__main__":
    main()
