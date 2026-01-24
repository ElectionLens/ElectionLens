#!/usr/bin/env python3
"""
Fix top 20 worst ACs by missing votes - targeted approach.
"""

import json
from pathlib import Path

OUTPUT_BASE = Path("/Users/p0s097d/ElectionLens/public/data/booths/TN")
AC_DATA = Path("/Users/p0s097d/ElectionLens/public/data/elections/ac/TN/2021.json")


def load_data():
    with open(AC_DATA) as f:
        return json.load(f)


def find_best_mapping(col_sums, official_totals):
    """Find best column mapping."""
    mapping = {}
    used = set()
    
    # Sort by official total (descending)
    sorted_off = sorted(enumerate(official_totals), key=lambda x: -x[1])
    
    for off_idx, off_total in sorted_off:
        if off_total < 100:
            continue
        
        best_idx = None
        best_err = float('inf')
        
        for ext_idx, ext_sum in enumerate(col_sums):
            if ext_idx in used or ext_sum < 50:
                continue
            
            err = abs(ext_sum - off_total) / off_total if off_total > 0 else 999
            max_err = 0.4 if off_total > 10000 else 0.8
            
            if err < best_err and err < max_err:
                best_err = err
                best_idx = ext_idx
        
        if best_idx is not None:
            mapping[off_idx] = best_idx
            used.add(best_idx)
    
    return mapping


def fix_ac(ac_id: str, ac_data: dict):
    """Fix a single AC."""
    results_file = OUTPUT_BASE / ac_id / "2021.json"
    if not results_file.exists():
        return {'status': 'error', 'error': 'No file'}
    
    with open(results_file) as f:
        data = json.load(f)
    
    official = ac_data.get(ac_id, {})
    official_totals = [c.get('votes', 0) for c in official.get('candidates', [])]
    num_off = len(official_totals)
    
    if num_off == 0:
        return {'status': 'error', 'error': 'No official'}
    
    results = data.get('results', {})
    if not results:
        return {'status': 'error', 'error': 'No results'}
    
    # Calculate column sums
    num_cols = max(len(r.get('votes', [])) for r in results.values())
    col_sums = [0] * num_cols
    
    for r in results.values():
        for i, v in enumerate(r.get('votes', [])):
            if i < num_cols:
                col_sums[i] += v
    
    old_total = sum(col_sums)
    off_total = sum(official_totals)
    old_ratio = old_total / off_total if off_total > 0 else 0
    
    # Find mapping
    mapping = find_best_mapping(col_sums, official_totals)
    
    if len(mapping) < max(3, num_off * 0.2):
        return {'status': 'error', 'error': f'Too few matches ({len(mapping)}/{num_off})'}
    
    # Remap votes
    for r in results.values():
        old_votes = r.get('votes', [])
        new_votes = [0] * num_off
        
        for off_idx in range(num_off):
            if off_idx in mapping:
                ext_idx = mapping[off_idx]
                if ext_idx < len(old_votes):
                    new_votes[off_idx] = old_votes[ext_idx]
        
        r['votes'] = new_votes
        r['total'] = sum(new_votes)
    
    # Update candidates
    data['candidates'] = [
        {'name': c.get('name', ''), 'party': c.get('party', ''), 'symbol': ''}
        for c in official.get('candidates', [])
    ]
    
    # Check new total
    new_total = sum(sum(r.get('votes', [])) for r in results.values())
    new_ratio = new_total / off_total if off_total > 0 else 0
    
    data['source'] = data.get('source', '') + f' (top-20-fix: {len(mapping)}/{num_off} matches)'
    
    with open(results_file, 'w') as f:
        json.dump(data, f, indent=2)
    
    return {
        'status': 'fixed',
        'old_ratio': old_ratio,
        'new_ratio': new_ratio,
        'old_total': old_total,
        'new_total': new_total,
        'matches': len(mapping)
    }


def main():
    print("=" * 80)
    print("FIXING TOP 20 WORST ACs BY MISSING VOTES")
    print("=" * 80)
    
    ac_data = load_data()
    
    # Find worst ACs
    gaps = []
    for ac_num in range(1, 235):
        ac_id = f'TN-{ac_num:03d}'
        official = ac_data.get(ac_id, {})
        off_total = official.get('validVotes', 0)
        
        if off_total == 0:
            continue
        
        data_file = OUTPUT_BASE / ac_id / "2021.json"
        if not data_file.exists():
            gaps.append((ac_id, off_total, 0, off_total))
            continue
        
        with open(data_file) as f:
            data = json.load(f)
        
        curr_total = sum(sum(r.get('votes', [])) for r in data.get('results', {}).values())
        gap = off_total - curr_total
        
        if gap > 10000:
            gaps.append((ac_id, off_total, curr_total, gap))
    
    gaps.sort(key=lambda x: -x[3])
    top_20 = gaps[:20]
    
    print(f"\nFixing top {len(top_20)} ACs...\n")
    
    fixed = 0
    improved = 0
    total_improvement = 0
    
    for ac_id, off_total, curr_total, gap in top_20:
        result = fix_ac(ac_id, ac_data)
        
        if result['status'] == 'fixed':
            improvement = result['new_total'] - result['old_total']
            if improvement > 0:
                print(f"✓ {ac_id}: {result['old_ratio']:.1%} → {result['new_ratio']:.1%} "
                      f"(+{improvement:,} votes, {result['matches']} matches)")
                improved += 1
                total_improvement += improvement
            else:
                print(f"⊘ {ac_id}: {result['old_ratio']:.1%} → {result['new_ratio']:.1%} (no improvement)")
            fixed += 1
        else:
            print(f"✗ {ac_id}: {result.get('error', 'Unknown')}")
    
    print(f"\n{'='*80}")
    print(f"SUMMARY")
    print(f"{'='*80}")
    print(f"  Fixed: {fixed}/{len(top_20)}")
    print(f"  Improved: {improved}")
    print(f"  Total votes recovered: {total_improvement:,}")


if __name__ == "__main__":
    main()
