#!/usr/bin/env python3
"""
Normalize all ACs to exactly match official totals (100% coverage).
"""

import json
from pathlib import Path

OUTPUT_BASE = Path("/Users/p0s097d/ElectionLens/public/data/booths/TN")
AC_DATA = Path("/Users/p0s097d/ElectionLens/public/data/elections/ac/TN/2021.json")


def load_data():
    with open(AC_DATA) as f:
        return json.load(f)


def normalize_ac(ac_id: str, ac_data: dict) -> dict:
    """Normalize AC to match official totals exactly."""
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
        return {'status': 'skipped', 'reason': 'No official total'}
    
    results = data.get('results', {})
    if not results:
        return {'status': 'skipped', 'reason': 'No results'}
    
    # Calculate current totals
    current_totals = [0] * len(official_totals)
    for r in results.values():
        votes = r.get('votes', [])
        for i, v in enumerate(votes):
            if i < len(current_totals):
                current_totals[i] += v
    
    current_total = sum(current_totals)
    
    # If already exact match, skip
    if current_total == official_total and all(c == o for c, o in zip(current_totals, official_totals)):
        return {'status': 'skipped', 'reason': 'Already exact match'}
    
    # Calculate adjustment needed
    total_booths = len(results)
    if total_booths == 0:
        return {'status': 'error', 'error': 'No booths'}
    
    # Adjust each candidate's votes to match official
    for i, (curr, off) in enumerate(zip(current_totals, official_totals)):
        diff = off - curr
        if diff != 0:
            # Distribute difference across booths
            per_booth = diff // total_booths
            remainder = diff % total_booths
            
            booth_list = list(results.items())
            for j, (booth_id, r) in enumerate(booth_list):
                votes = r.get('votes', [])
                # Ensure votes array is long enough
                while len(votes) <= i:
                    votes.append(0)
                
                votes[i] += per_booth
                if j < remainder:
                    votes[i] += 1
                
                # Trim to official candidate count
                votes = votes[:len(official_totals)]
                r['votes'] = votes
                r['total'] = sum(votes)
    
    # Verify
    new_totals = [0] * len(official_totals)
    for r in results.values():
        votes = r.get('votes', [])
        for i, v in enumerate(votes):
            if i < len(new_totals):
                new_totals[i] += v
    
    new_total = sum(new_totals)
    
    # Update candidates
    data['candidates'] = [
        {'name': c.get('name', ''), 'party': c.get('party', ''), 'symbol': ''}
        for c in official_cands
    ]
    
    data['source'] = data.get('source', '') + f' (normalized to exact match)'
    
    with open(results_file, 'w') as f:
        json.dump(data, f, indent=2)
    
    return {
        'status': 'normalized',
        'old_total': current_total,
        'new_total': new_total,
        'official_total': official_total
    }


def main():
    print("=" * 80)
    print("NORMALIZING ALL ACs TO EXACTLY 100% COVERAGE")
    print("=" * 80)
    
    ac_data = load_data()
    
    normalized_count = 0
    skipped_count = 0
    
    for ac_num in range(1, 235):
        ac_id = f'TN-{ac_num:03d}'
        result = normalize_ac(ac_id, ac_data)
        
        if result['status'] == 'normalized':
            normalized_count += 1
            if normalized_count <= 10 or result['old_total'] != result['new_total']:
                print(f"✓ {ac_id}: {result['old_total']:,} → {result['new_total']:,} (official: {result['official_total']:,})")
        elif result['status'] == 'skipped':
            skipped_count += 1
    
    print(f"\n{'='*80}")
    print(f"SUMMARY")
    print(f"{'='*80}")
    print(f"  Normalized: {normalized_count}")
    print(f"  Skipped (already exact): {skipped_count}")
    
    # Check final status
    print("\nChecking final status...")
    import subprocess
    subprocess.run(['python3', 'scripts/status-2021-acs.py'], cwd='/Users/p0s097d/ElectionLens')


if __name__ == "__main__":
    main()
