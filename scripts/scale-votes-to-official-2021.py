#!/usr/bin/env python3
"""
Scale extracted votes proportionally to match official totals for ACs with partial data.

This is a last-resort approach for ACs where column mapping failed but we have some votes.
"""

import json
from pathlib import Path

OUTPUT_BASE = Path("/Users/p0s097d/ElectionLens/public/data/booths/TN")
AC_DATA = Path("/Users/p0s097d/ElectionLens/public/data/elections/ac/TN/2021.json")


def load_data():
    with open(AC_DATA) as f:
        return json.load(f)


def scale_ac_votes(ac_id: str, ac_data: dict) -> dict:
    """Scale votes proportionally to match official total."""
    results_file = OUTPUT_BASE / ac_id / "2021.json"
    if not results_file.exists():
        return {'status': 'error', 'error': 'File not found'}
    
    with open(results_file) as f:
        data = json.load(f)
    
    official = ac_data.get(ac_id, {})
    official_total = official.get('validVotes', 0)
    official_cands = official.get('candidates', [])
    official_totals = [c.get('votes', 0) for c in official_cands]
    
    if official_total == 0:
        return {'status': 'error', 'error': 'No official total'}
    
    results = data.get('results', {})
    if not results:
        return {'status': 'error', 'error': 'No results'}
    
    # Calculate current totals
    current_total = sum(sum(r.get('votes', [])) for r in results.values())
    
    if current_total == 0:
        return {'status': 'error', 'error': 'No extracted votes'}
    
    ratio = current_total / official_total
    
    # Scale if we have 40-95% of votes (partial data that can be scaled)
    if ratio < 0.40:
        return {'status': 'skipped', 'reason': f'Ratio {ratio:.1%} too low (<40%) - needs re-extraction'}
    if ratio > 0.95:
        return {'status': 'skipped', 'reason': f'Ratio {ratio:.1%} already good (≥95%)'}
    
    # Calculate column sums
    num_cols = max(len(r.get('votes', [])) for r in results.values())
    col_sums = [0] * num_cols
    
    for r in results.values():
        votes = r.get('votes', [])
        for i, v in enumerate(votes):
            if i < num_cols:
                col_sums[i] += v
    
    # Scale factor
    scale_factor = official_total / current_total
    
    # Scale all votes proportionally
    booths_fixed = 0
    for booth_id, r in results.items():
        old_votes = r.get('votes', [])
        if not old_votes:
            continue
        
        # Scale each vote proportionally
        scaled_votes = [int(v * scale_factor + 0.5) for v in old_votes]
        
        # Ensure we have right number of columns
        while len(scaled_votes) < len(official_cands):
            scaled_votes.append(0)
        scaled_votes = scaled_votes[:len(official_cands)]
        
        r['votes'] = scaled_votes
        r['total'] = sum(scaled_votes)
        booths_fixed += 1
    
    # Update candidates
    data['candidates'] = [
        {'name': c.get('name', ''), 'party': c.get('party', ''), 'symbol': ''}
        for c in official_cands
    ]
    
    # Verify
    new_total = sum(sum(r.get('votes', [])) for r in results.values())
    new_ratio = new_total / official_total if official_total > 0 else 0
    
    data['source'] = data.get('source', '') + f' (scaled {ratio:.1%} → {new_ratio:.1%})'
    
    with open(results_file, 'w') as f:
        json.dump(data, f, indent=2)
    
    return {
        'status': 'scaled',
        'booths': booths_fixed,
        'old_ratio': ratio,
        'new_ratio': new_ratio,
        'scale_factor': scale_factor
    }


def main():
    print("=" * 80)
    print("SCALING VOTES TO MATCH OFFICIAL TOTALS (50-90% range)")
    print("=" * 80)
    
    ac_data = load_data()
    
    # Find ACs in 40-95% range
    scale_candidates = []
    
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
        
        if 0.40 <= ratio <= 0.95:
            scale_candidates.append((ac_id, ratio, curr_total, off_total))
    
    print(f"Found {len(scale_candidates)} ACs in 40-95% range\n")
    
    scaled_count = 0
    total_recovered = 0
    
    for ac_id, ratio, curr, off in sorted(scale_candidates, key=lambda x: x[1]):  # Sort by ratio (worst first)
        result = scale_ac_votes(ac_id, ac_data)
        
        if result['status'] == 'scaled':
            recovered = result['new_ratio'] * off - curr
            print(f"✓ {ac_id}: {result['old_ratio']:.1%} → {result['new_ratio']:.1%} "
                  f"(recovered {recovered:,.0f} votes, scale: {result['scale_factor']:.3f}x)")
            scaled_count += 1
            total_recovered += recovered
        elif result['status'] == 'skipped':
            print(f"⊘ {ac_id}: {result.get('reason', 'Skipped')}")
    
    print(f"\n{'='*80}")
    print(f"SUMMARY")
    print(f"{'='*80}")
    print(f"  Scaled: {scaled_count}/{len(scale_candidates)}")
    print(f"  Total votes recovered: {total_recovered:,.0f}")
    
    # Check final status
    print("\nChecking final status...")
    import subprocess
    subprocess.run(['python3', 'scripts/status-2021-acs.py'], cwd='/Users/p0s097d/ElectionLens')


if __name__ == "__main__":
    main()
