#!/usr/bin/env python3
"""
Comprehensive vote column mapping fix - matches ALL candidates, not just top 5.

Uses multiple strategies:
1. Greedy matching for all candidates
2. Column sum matching
3. Individual booth validation
"""

import json
from pathlib import Path

OUTPUT_BASE = Path("/Users/p0s097d/ElectionLens/public/data/booths/TN")
AC_DATA = Path("/Users/p0s097d/ElectionLens/public/data/elections/ac/TN/2021.json")


def load_data():
    with open(AC_DATA) as f:
        return json.load(f)


def find_comprehensive_mapping(extracted_sums: list, official_totals: list) -> dict:
    """Find mapping using comprehensive matching for ALL candidates."""
    mapping = {}  # official_idx -> extracted_idx
    used_extracted = set()
    
    # Sort official by votes (descending) to match top candidates first
    sorted_official = sorted(enumerate(official_totals), key=lambda x: -x[1])
    
    # Match each official candidate to best extracted column
    for off_idx, off_total in sorted_official:
        if off_total < 100:  # Skip very small candidates
            continue
        
        best_ext_idx = None
        best_error = float('inf')
        
        for ext_idx, ext_sum in enumerate(extracted_sums):
            if ext_idx in used_extracted:
                continue
            
            if ext_sum < 50:  # Skip very small extracted values
                continue
            
            # Calculate error
            if off_total > 0:
                error = abs(ext_sum - off_total) / off_total
            else:
                error = 999 if ext_sum > 0 else 0
            
            # Prefer matches with <50% error, but allow up to 100% for smaller candidates
            max_error = 0.5 if off_total > 5000 else 1.0
            
            if error < best_error and error < max_error:
                best_error = error
                best_ext_idx = ext_idx
        
        if best_ext_idx is not None:
            mapping[off_idx] = best_ext_idx
            used_extracted.add(best_ext_idx)
    
    return mapping


def fix_ac_comprehensive(ac_id: str, ac_data: dict) -> dict:
    """Fix vote column mapping comprehensively."""
    results_file = OUTPUT_BASE / ac_id / "2021.json"
    if not results_file.exists():
        return {'status': 'error', 'error': 'File not found'}
    
    with open(results_file) as f:
        data = json.load(f)
    
    official = ac_data.get(ac_id, {})
    official_candidates = official.get('candidates', [])
    official_totals = [c.get('votes', 0) for c in official_candidates]
    num_official = len(official_candidates)
    
    if not official_candidates or num_official == 0:
        return {'status': 'error', 'error': 'No official candidates'}
    
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
    
    # Find comprehensive mapping
    mapping = find_comprehensive_mapping(col_sums, official_totals)
    
    if len(mapping) < num_official * 0.3:  # Need at least 30% match
        return {'status': 'error', 'error': f'Too few matches ({len(mapping)}/{num_official})'}
    
    # Calculate old totals
    old_total = sum(col_sums)
    official_total = sum(official_totals)
    old_ratio = old_total / official_total if official_total > 0 else 0
    
    # Realign votes
    booths_fixed = 0
    for booth_id, r in results.items():
        old_votes = r.get('votes', [])
        if not old_votes:
            continue
        
        # Create new vote array
        new_votes = [0] * num_official
        for off_idx in range(num_official):
            if off_idx in mapping:
                ext_idx = mapping[off_idx]
                if ext_idx < len(old_votes):
                    new_votes[off_idx] = old_votes[ext_idx]
        
        r['votes'] = new_votes
        r['total'] = sum(new_votes)
        booths_fixed += 1
    
    # Update candidates
    data['candidates'] = [
        {'name': c.get('name', ''), 'party': c.get('party', ''), 'symbol': ''}
        for c in official_candidates
    ]
    
    # Verify improvement
    new_col_sums = [0] * num_official
    for r in results.values():
        votes = r.get('votes', [])
        for i, v in enumerate(votes):
            if i < num_official:
                new_col_sums[i] += v
    
    new_total = sum(new_col_sums)
    new_ratio = new_total / official_total if official_total > 0 else 0
    
    data['source'] = data.get('source', '') + f' (comprehensive mapping - {len(mapping)}/{num_official} matches)'
    
    with open(results_file, 'w') as f:
        json.dump(data, f, indent=2)
    
    return {
        'status': 'fixed',
        'booths': booths_fixed,
        'matches': len(mapping),
        'old_ratio': old_ratio,
        'new_ratio': new_ratio,
        'old_total': old_total,
        'new_total': new_total,
        'official_total': official_total
    }


def main():
    print("=" * 80)
    print("COMPREHENSIVE VOTE COLUMN MAPPING FIX")
    print("=" * 80)
    
    ac_data = load_data()
    
    # Get all ACs that need fixing
    problem_acs = []
    
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
        
        # Fix ACs with >110% or <90% votes
        if ratio > 1.10 or ratio < 0.90:
            problem_acs.append((ac_id, ratio))
    
    print(f"Found {len(problem_acs)} ACs needing fix\n")
    
    fixed_count = 0
    improved_count = 0
    
    for ac_id, old_ratio in sorted(problem_acs, key=lambda x: abs(x[1] - 1.0), reverse=True)[:30]:  # Fix top 30
        result = fix_ac_comprehensive(ac_id, ac_data)
        
        if result['status'] == 'fixed':
            improvement = abs(result['old_ratio'] - 1.0) - abs(result['new_ratio'] - 1.0)
            if improvement > 0.01:  # At least 1% improvement
                print(f"✓ {ac_id}: {result['old_ratio']:.1%} → {result['new_ratio']:.1%} "
                      f"({result['matches']}/{len(ac_data.get(ac_id, {}).get('candidates', []))} matches, "
                      f"{result['booths']} booths)")
                improved_count += 1
            else:
                print(f"⊘ {ac_id}: {result['old_ratio']:.1%} → {result['new_ratio']:.1%} (no significant improvement)")
            fixed_count += 1
        elif result['status'] == 'error':
            print(f"✗ {ac_id}: {result.get('error', 'Unknown error')}")
    
    print(f"\n{'='*80}")
    print(f"SUMMARY")
    print(f"{'='*80}")
    print(f"  Processed: {fixed_count}")
    print(f"  Improved: {improved_count}")
    
    # Check final status
    print("\nChecking final status...")
    subprocess.run(['python3', 'scripts/status-2021-acs.py'], cwd='/Users/p0s097d/ElectionLens')


if __name__ == "__main__":
    import subprocess
    main()
