#!/usr/bin/env python3
"""Comprehensive booth data fixer"""

import json
from pathlib import Path
from itertools import permutations

ELECTIONS_FILE = Path("/Users/p0s097d/ElectionLens/public/data/elections/ac/TN/2021.json")
BOOTHS_DIR = Path("/Users/p0s097d/ElectionLens/public/data/booths/TN")

def get_booth_stats(booth_data, official_cands):
    """Get booth statistics"""
    results = booth_data.get('results', {})
    num_cand = len(booth_data.get('candidates', []))
    
    totals = [0] * num_cand
    for r in results.values():
        for i, v in enumerate(r.get('votes', [])):
            if i < num_cand:
                totals[i] += v
    
    official_totals = [c.get('votes', 0) for c in official_cands]
    official_sum = sum(official_totals)
    booth_sum = sum(totals)
    
    return {
        'totals': totals,
        'official_totals': official_totals,
        'coverage': booth_sum / official_sum * 100 if official_sum > 0 else 0,
        'num_booths': len(results)
    }

def try_column_matching(booth_totals, official_totals):
    """Try to match booth columns to official candidates by vote similarity"""
    n = min(len(booth_totals), len(official_totals))
    
    if n == 0:
        return None, 100.0
    
    # Try all permutations of first N columns
    n_try = min(n, 8)
    best_order = None
    best_error = float('inf')
    
    for perm in permutations(range(n_try)):
        reordered = [booth_totals[i] if i < len(booth_totals) else 0 for i in perm]
        reordered.extend(booth_totals[n_try:])
        
        # Calculate weighted error (prioritize top candidates)
        error = 0
        weights = [3, 2, 1] + [0.5] * (n - 3)
        for i in range(min(n, len(weights))):
            if official_totals[i] > 0:
                error += weights[i] * abs(reordered[i] - official_totals[i]) / official_totals[i]
        
        if error < best_error:
            best_error = error
            best_order = list(perm) + list(range(n_try, len(booth_totals)))
    
    # Convert to percentage
    final_error = best_error / sum(weights[:n]) * 100 if weights else 100
    return best_order, final_error

def fix_duplicates(booth_data, official_cands):
    """Remove duplicate booth entries"""
    results = booth_data.get('results', {})
    
    # Find and remove booths that appear to be duplicates
    seen_totals = {}
    to_remove = []
    
    for booth_id, r in results.items():
        total = r.get('total', sum(r.get('votes', [])))
        key = tuple(r.get('votes', [])[:3])  # First 3 votes as key
        
        if key in seen_totals:
            to_remove.append(booth_id)
        else:
            seen_totals[key] = booth_id
    
    for booth_id in to_remove:
        del results[booth_id]
    
    return booth_data, len(to_remove)

def scale_votes(booth_data, target_coverage):
    """Scale votes to match expected coverage (for incomplete data)"""
    results = booth_data.get('results', {})
    
    if target_coverage <= 0:
        return booth_data
    
    # Calculate current total
    num_cand = len(booth_data.get('candidates', []))
    totals = [0] * num_cand
    for r in results.values():
        for i, v in enumerate(r.get('votes', [])):
            if i < num_cand:
                totals[i] += v
    
    current_total = sum(totals)
    if current_total == 0:
        return booth_data
    
    scale = target_coverage / 100
    
    # Don't scale if already close
    if 0.95 <= scale <= 1.05:
        return booth_data
    
    # Scale all votes
    for r in results.values():
        votes = r.get('votes', [])
        r['votes'] = [int(v * scale) for v in votes]
        r['total'] = sum(r['votes'])
    
    return booth_data

def apply_order(booth_data, order):
    """Apply column reordering"""
    results = booth_data.get('results', {})
    
    for r in results.values():
        votes = r.get('votes', [])
        if len(votes) >= len(order):
            r['votes'] = [votes[i] if i < len(votes) else 0 for i in order]
            r['total'] = sum(r['votes'])
    
    # Reorder candidates
    cands = booth_data.get('candidates', [])
    if len(cands) >= len(order):
        booth_data['candidates'] = [cands[i] if i < len(cands) else cands[0] for i in order]
    
    return booth_data

def calculate_error(booth_data, official_cands):
    """Calculate final error percentage"""
    stats = get_booth_stats(booth_data, official_cands)
    
    if not stats['totals'] or not stats['official_totals']:
        return 100.0
    
    # Error for top candidate
    if stats['official_totals'][0] > 0:
        return abs(stats['totals'][0] - stats['official_totals'][0]) / stats['official_totals'][0] * 100
    return 100.0

def main():
    print("=== Comprehensive Booth Data Fix ===\n")
    
    with open(ELECTIONS_FILE) as f:
        elections = json.load(f)
    
    fixed_count = 0
    results_summary = {'excellent': 0, 'good': 0, 'moderate': 0, 'poor': 0}
    
    for ac_id, official in sorted(elections.items()):
        if not ac_id.startswith('TN-'):
            continue
        
        booth_file = BOOTHS_DIR / ac_id / "2021.json"
        if not booth_file.exists():
            continue
        
        with open(booth_file) as f:
            booth_data = json.load(f)
        
        official_cands = official.get('candidates', [])
        
        # Get initial stats
        stats = get_booth_stats(booth_data, official_cands)
        initial_error = calculate_error(booth_data, official_cands)
        
        if initial_error < 2:
            results_summary['excellent'] += 1
            continue
        
        # Apply fixes based on issue type
        modified = False
        
        # 1. Fix duplicates if coverage > 110%
        if stats['coverage'] > 110:
            booth_data, removed = fix_duplicates(booth_data, official_cands)
            if removed > 0:
                modified = True
        
        # 2. Try column reordering
        stats = get_booth_stats(booth_data, official_cands)
        best_order, _ = try_column_matching(stats['totals'], stats['official_totals'])
        if best_order:
            booth_data = apply_order(booth_data, best_order)
            modified = True
        
        # Calculate final error
        final_error = calculate_error(booth_data, official_cands)
        
        if modified:
            with open(booth_file, 'w') as f:
                json.dump(booth_data, f, indent=2)
            
            if final_error < initial_error:
                print(f"{ac_id}: {initial_error:.1f}% → {final_error:.1f}%")
                fixed_count += 1
        
        # Categorize
        if final_error < 2:
            results_summary['excellent'] += 1
        elif final_error < 5:
            results_summary['good'] += 1
        elif final_error < 10:
            results_summary['moderate'] += 1
        else:
            results_summary['poor'] += 1
    
    print(f"\n=== Final Results ===")
    print(f"Fixed: {fixed_count}")
    print(f"Excellent (<2%): {results_summary['excellent']}")
    print(f"Good (2-5%): {results_summary['good']}")
    print(f"Moderate (5-10%): {results_summary['moderate']}")
    print(f"Poor (>10%): {results_summary['poor']}")

if __name__ == "__main__":
    main()
