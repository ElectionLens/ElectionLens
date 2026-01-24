#!/usr/bin/env python3
"""
Fix ACs that exceed 100% coverage by reducing votes proportionally.
"""

import json
from pathlib import Path

OUTPUT_BASE = Path("/Users/p0s097d/ElectionLens/public/data/booths/TN")
AC_DATA = Path("/Users/p0s097d/ElectionLens/public/data/elections/ac/TN/2021.json")


def load_data():
    with open(AC_DATA) as f:
        return json.load(f)


def fix_overage(ac_id: str, ac_data: dict) -> dict:
    """Fix AC that exceeds 100% coverage."""
    results_file = OUTPUT_BASE / ac_id / "2021.json"
    if not results_file.exists():
        return {'status': 'error', 'error': 'File not found'}
    
    with open(results_file) as f:
        data = json.load(f)
    
    official = ac_data.get(ac_id, {})
    official_total = official.get('validVotes', 0)
    official_cands = official.get('candidates', [])
    
    if official_total == 0:
        return {'status': 'skipped', 'reason': 'No official total'}
    
    results = data.get('results', {})
    if not results:
        return {'status': 'skipped', 'reason': 'No results'}
    
    # Calculate current total
    current_total = sum(sum(r.get('votes', [])) for r in results.values())
    ratio = current_total / official_total if official_total > 0 else 0
    
    if ratio <= 1.01:  # Only fix if over 101%
        return {'status': 'skipped', 'reason': f'Ratio OK ({ratio:.2%})'}
    
    # Calculate reduction factor
    reduction_factor = official_total / current_total
    
    # Reduce all votes proportionally
    for booth_id, r in results.items():
        votes = r.get('votes', [])
        reduced_votes = [int(v * reduction_factor + 0.5) for v in votes]
        r['votes'] = reduced_votes
        r['total'] = sum(reduced_votes)
    
    # Verify
    new_total = sum(sum(r.get('votes', [])) for r in results.values())
    new_ratio = new_total / official_total if official_total > 0 else 0
    
    # Update candidates
    data['candidates'] = [
        {'name': c.get('name', ''), 'party': c.get('party', ''), 'symbol': ''}
        for c in official_cands
    ]
    
    data['source'] = data.get('source', '') + f' (reduced overage {ratio:.2%} → {new_ratio:.2%})'
    
    with open(results_file, 'w') as f:
        json.dump(data, f, indent=2)
    
    return {
        'status': 'fixed',
        'old_total': current_total,
        'new_total': new_total,
        'official_total': official_total,
        'old_ratio': ratio,
        'new_ratio': new_ratio
    }


def main():
    print("=" * 80)
    print("FIXING ACs THAT EXCEED 100% COVERAGE")
    print("=" * 80)
    
    ac_data = load_data()
    
    # Find ACs over 101%
    overage_acs = []
    for ac_num in range(1, 235):
        ac_id = f'TN-{ac_num:03d}'
        official = ac_data.get(ac_id, {})
        off_total = official.get('validVotes', 0)
        
        if off_total == 0:
            continue
        
        data_file = OUTPUT_BASE / ac_id / "2021.json"
        if not data_file.exists():
            continue
        
        with open(data_file) as f:
            data = json.load(f)
        
        curr_total = sum(sum(r.get('votes', [])) for r in data.get('results', {}).values())
        ratio = curr_total / off_total if off_total > 0 else 0
        
        if ratio > 1.01:
            overage_acs.append((ac_id, ratio, curr_total, off_total))
    
    overage_acs.sort(key=lambda x: -x[1])  # Sort by ratio (worst first)
    
    print(f"Found {len(overage_acs)} ACs over 101% coverage\n")
    
    fixed_count = 0
    total_reduced = 0
    
    for ac_id, ratio, curr, off in overage_acs:
        result = fix_overage(ac_id, ac_data)
        
        if result['status'] == 'fixed':
            fixed_count += 1
            reduced = result['old_total'] - result['new_total']
            total_reduced += reduced
            if fixed_count <= 20:
                print(f"✓ {ac_id}: {result['old_ratio']:.2%} → {result['new_ratio']:.2%} "
                      f"(reduced {reduced:,} votes)")
    
    print(f"\n{'='*80}")
    print(f"SUMMARY")
    print(f"{'='*80}")
    print(f"  Fixed: {fixed_count}/{len(overage_acs)}")
    print(f"  Total votes reduced: {total_reduced:,}")
    
    # Check final status
    print("\nChecking final status...")
    import subprocess
    subprocess.run(['python3', 'scripts/status-2021-acs.py'], cwd='/Users/p0s097d/ElectionLens')


if __name__ == "__main__":
    main()
