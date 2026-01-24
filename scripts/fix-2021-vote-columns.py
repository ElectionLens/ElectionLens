#!/usr/bin/env python3
"""
Fix vote column mapping by matching extracted column sums to official totals.

The issue: Candidate alignment created correct candidate list but votes are in wrong columns.
Solution: Find best column-to-candidate mapping by matching totals.
"""

import json
from pathlib import Path

OUTPUT_BASE = Path("/Users/p0s097d/ElectionLens/public/data/booths/TN")
AC_DATA = Path("/Users/p0s097d/ElectionLens/public/data/elections/ac/TN/2021.json")


def load_data():
    with open(AC_DATA) as f:
        return json.load(f)


def find_best_column_mapping(extracted_sums: list, official_totals: list) -> dict:
    """Find best mapping from extracted columns to official candidates using greedy matching."""
    return find_greedy_mapping(extracted_sums, official_totals)


def find_greedy_mapping(extracted_sums: list, official_totals: list) -> dict:
    """Greedy matching: match each official to closest extracted."""
    mapping = {}
    used_extracted = set()
    
    # Sort by official total (descending) to match top candidates first
    sorted_official = sorted(enumerate(official_totals), key=lambda x: -x[1])
    
    # First pass: strict matching for top candidates
    for off_idx, off_total in sorted_official:
        if off_total < 5000:  # Lower threshold for first pass
            continue
        
        best_ext_idx = None
        best_error = float('inf')
        
        for ext_idx, ext_sum in enumerate(extracted_sums):
            if ext_idx in used_extracted:
                continue
            
            if ext_sum < 1000:  # Skip very small extracted values
                continue
            
            error = abs(ext_sum - off_total) / off_total if off_total > 0 else 999
            if error < best_error and error < 0.3:  # 30% error threshold for top candidates
                best_error = error
                best_ext_idx = ext_idx
        
        if best_ext_idx is not None:
            mapping[off_idx] = best_ext_idx
            used_extracted.add(best_ext_idx)
    
    # Second pass: looser matching for remaining candidates
    for off_idx, off_total in sorted_official:
        if off_idx in mapping:  # Already matched
            continue
        
        if off_total < 1000:
            continue
        
        best_ext_idx = None
        best_error = float('inf')
        
        for ext_idx, ext_sum in enumerate(extracted_sums):
            if ext_idx in used_extracted:
                continue
            
            if ext_sum < 500:
                continue
            
            error = abs(ext_sum - off_total) / off_total if off_total > 0 else 999
            if error < best_error and error < 0.6:  # 60% error threshold for others
                best_error = error
                best_ext_idx = ext_idx
        
        if best_ext_idx is not None:
            mapping[off_idx] = best_ext_idx
            used_extracted.add(best_ext_idx)
    
    return mapping


def fix_ac_vote_columns(ac_id: str, ac_data: dict) -> dict:
    """Fix vote column mapping for an AC."""
    results_file = OUTPUT_BASE / ac_id / "2021.json"
    if not results_file.exists():
        return {'status': 'error', 'error': 'File not found'}
    
    with open(results_file) as f:
        data = json.load(f)
    
    official = ac_data.get(ac_id, {})
    official_candidates = official.get('candidates', [])
    official_totals = [c.get('votes', 0) for c in official_candidates]
    
    if not official_candidates:
        return {'status': 'error', 'error': 'No official candidates'}
    
    # Calculate current column sums
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
    
    # Find best mapping
    mapping = find_best_column_mapping(col_sums, official_totals)
    
    if len(mapping) < min(3, len(official_candidates) * 0.2):  # Need at least 3 matches or 20%
        return {'status': 'error', 'error': f'Too few matches ({len(mapping)}/{len(official_candidates)})'}
    
    # Realign votes
    booths_fixed = 0
    for booth_id, r in results.items():
        old_votes = r.get('votes', [])
        if not old_votes:
            continue
        
        # Create new vote array
        new_votes = [0] * len(official_candidates)
        for off_idx in range(len(official_candidates)):
            if off_idx in mapping:
                ext_idx = mapping[off_idx]
                if ext_idx < len(old_votes):
                    new_votes[off_idx] = old_votes[ext_idx]
        
        r['votes'] = new_votes
        r['total'] = sum(new_votes)
        booths_fixed += 1
    
    # Update candidates
    data['candidates'] = [
        {
            'name': c.get('name', ''),
            'party': c.get('party', ''),
            'symbol': ''
        }
        for c in official_candidates
    ]
    
    # Verify improvement
    new_col_sums = [0] * len(official_candidates)
    for r in results.values():
        votes = r.get('votes', [])
        for i, v in enumerate(votes):
            if i < len(new_col_sums):
                new_col_sums[i] += v
    
    old_total = sum(col_sums)
    new_total = sum(new_col_sums)
    official_total = sum(official_totals)
    
    old_error = abs(old_total - official_total) / official_total if official_total > 0 else 1.0
    new_error = abs(new_total - official_total) / official_total if official_total > 0 else 1.0
    
    data['source'] = data.get('source', '') + f' (vote columns remapped - {len(mapping)} matches)'
    
    with open(results_file, 'w') as f:
        json.dump(data, f, indent=2)
    
    return {
        'status': 'fixed',
        'booths': booths_fixed,
        'matches': len(mapping),
        'old_error': old_error,
        'new_error': new_error
    }


def main():
    print("=" * 80)
    print("FIXING 2021 VOTE COLUMN MAPPING")
    print("=" * 80)
    
    ac_data = load_data()
    
    # ACs with vote mapping issues (first candidate has 0 votes)
    problem_acs = [159, 16, 86, 144, 129, 173, 149, 76, 234, 5, 12, 13, 15, 19, 63, 214, 226]
    
    fixed_count = 0
    error_count = 0
    
    for ac_num in problem_acs:
        ac_id = f"TN-{ac_num:03d}"
        result = fix_ac_vote_columns(ac_id, ac_data)
        
        if result['status'] == 'fixed':
            print(f"✓ {ac_id}: {result['booths']} booths, {result['matches']} matches, error: {result['old_error']:.1%} → {result['new_error']:.1%}")
            fixed_count += 1
        else:
            print(f"✗ {ac_id}: {result.get('error', 'Unknown error')}")
            error_count += 1
    
    print(f"\n{'='*80}")
    print(f"SUMMARY")
    print(f"{'='*80}")
    print(f"  Fixed: {fixed_count}")
    print(f"  Errors: {error_count}")


if __name__ == "__main__":
    main()
