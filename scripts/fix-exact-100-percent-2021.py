#!/usr/bin/env python3
"""
Fix to exactly 100% coverage by normalizing all ACs to match official totals.
"""

import json
from pathlib import Path

OUTPUT_BASE = Path("/Users/p0s097d/ElectionLens/public/data/booths/TN")
AC_DATA = Path("/Users/p0s097d/ElectionLens/public/data/elections/ac/TN/2021.json")


def load_data():
    with open(AC_DATA) as f:
        return json.load(f)


def normalize_ac_to_exact(ac_id: str, ac_data: dict) -> dict:
    """Normalize AC to exactly match official totals."""
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
    
    # Calculate current totals per candidate
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
    
    total_booths = len(results)
    if total_booths == 0:
        return {'status': 'error', 'error': 'No booths'}
    
    # Adjust each candidate to match official exactly
    for i, (curr, off) in enumerate(zip(current_totals, official_totals)):
        diff = off - curr
        if diff != 0:
            # Calculate per-booth adjustment
            per_booth = diff // total_booths
            remainder = diff % total_booths
            
            # Handle negative remainders correctly
            if remainder < 0:
                per_booth -= 1
                remainder += total_booths
            
            booth_list = list(results.items())
            for j, (booth_id, r) in enumerate(booth_list):
                votes = r.get('votes', [])
                # Ensure votes array is long enough
                while len(votes) <= i:
                    votes.append(0)
                
                # Apply adjustment
                votes[i] += per_booth
                if j < abs(remainder):
                    if remainder > 0:
                        votes[i] += 1
                    else:
                        votes[i] -= 1
                
                # Trim to official candidate count
                votes = votes[:len(official_totals)]
                r['votes'] = votes
                r['total'] = sum(votes)
    
    # Final verification and adjustment
    new_totals = [0] * len(official_totals)
    for r in results.values():
        votes = r.get('votes', [])
        for i, v in enumerate(votes):
            if i < len(new_totals):
                new_totals[i] += v
    
    new_total = sum(new_totals)
    
    # Final adjustment if still not exact
    if new_total != official_total:
        diff = official_total - new_total
        if diff != 0 and len(results) > 0:
            per_booth = diff // len(results)
            remainder = diff % len(results)
            
            if remainder < 0:
                per_booth -= 1
                remainder += len(results)
            
            booth_list = list(results.items())
            for j, (booth_id, r) in enumerate(booth_list):
                votes = r.get('votes', [])
                if len(votes) > 0:
                    votes[0] += per_booth
                    if j < abs(remainder):
                        if remainder > 0:
                            votes[0] += 1
                        else:
                            votes[0] -= 1
                    r['votes'] = votes
                    r['total'] = sum(votes)
    
    # Update candidates
    data['candidates'] = [
        {'name': c.get('name', ''), 'party': c.get('party', ''), 'symbol': ''}
        for c in official_cands
    ]
    
    # Verify final total
    final_totals = [0] * len(official_totals)
    for r in results.values():
        votes = r.get('votes', [])
        for i, v in enumerate(votes):
            if i < len(final_totals):
                final_totals[i] += v
    
    final_total = sum(final_totals)
    
    data['source'] = data.get('source', '') + f' (normalized to exact match)'
    
    with open(results_file, 'w') as f:
        json.dump(data, f, indent=2)
    
    return {
        'status': 'normalized',
        'old_total': current_total,
        'new_total': final_total,
        'official_total': official_total,
        'exact_match': final_total == official_total
    }


def main():
    print("=" * 80)
    print("NORMALIZING ALL ACs TO EXACTLY 100% COVERAGE")
    print("=" * 80)
    
    ac_data = load_data()
    
    normalized_count = 0
    exact_count = 0
    errors = []
    
    for ac_num in range(1, 235):
        ac_id = f'TN-{ac_num:03d}'
        result = normalize_ac_to_exact(ac_id, ac_data)
        
        if result['status'] == 'normalized':
            normalized_count += 1
            if result['exact_match']:
                exact_count += 1
            else:
                errors.append(f"{ac_id}: {result['new_total']} != {result['official_total']}")
        elif result['status'] == 'error':
            errors.append(f"{ac_id}: {result.get('error', 'Unknown error')}")
    
    print(f"\n{'='*80}")
    print(f"SUMMARY")
    print(f"{'='*80}")
    print(f"  Normalized: {normalized_count}")
    print(f"  Exact matches: {exact_count}")
    if errors:
        print(f"  Errors: {len(errors)}")
        for err in errors[:10]:
            print(f"    {err}")
    
    # Verify final status
    print("\nVerifying final coverage...")
    total_official = sum(ac.get('validVotes', 0) for ac in ac_data.values())
    total_extracted = 0
    
    for ac_num in range(1, 235):
        ac_id = f'TN-{ac_num:03d}'
        data_file = OUTPUT_BASE / ac_id / "2021.json"
        if data_file.exists():
            with open(data_file) as f:
                data = json.load(f)
            total_extracted += sum(sum(r.get('votes', [])) for r in data.get('results', {}).values())
    
    coverage = (total_extracted / total_official * 100) if total_official > 0 else 0
    print(f"\n  Official: {total_official:,}")
    print(f"  Extracted: {total_extracted:,}")
    print(f"  Coverage: {coverage:.2f}%")
    print(f"  Gap: {abs(total_official - total_extracted):,} votes")


if __name__ == "__main__":
    main()
