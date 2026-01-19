#!/usr/bin/env python3
"""Fix booth data by reordering candidates to match official results"""

import json
import os
from pathlib import Path
from itertools import permutations

ELECTIONS_FILE = Path("/Users/p0s097d/ElectionLens/public/data/elections/ac/TN/2021.json")
BOOTHS_DIR = Path("/Users/p0s097d/ElectionLens/public/data/booths/TN")

def calculate_error(booth_totals, official_totals):
    """Calculate error percentage for first N candidates"""
    if not booth_totals or not official_totals:
        return 100.0
    
    total_error = 0
    for i in range(min(len(booth_totals), len(official_totals), 3)):  # Top 3
        if official_totals[i] > 0:
            total_error += abs(booth_totals[i] - official_totals[i]) / official_totals[i]
    return total_error * 100 / 3

def find_best_order(booth_data, official_cands):
    """Find the best column reordering to match official results"""
    results = booth_data.get('results', {})
    num_cand = len(booth_data.get('candidates', []))
    
    if not results or num_cand == 0:
        return None, 100.0
    
    # Calculate booth totals
    totals = [0] * num_cand
    for r in results.values():
        votes = r.get('votes', [])
        for i, v in enumerate(votes):
            if i < num_cand:
                totals[i] += v
    
    official_totals = [c.get('votes', 0) for c in official_cands[:num_cand]]
    
    # Current error
    current_error = calculate_error(totals, official_totals)
    
    if current_error < 2:
        return None, current_error  # Already good
    
    # Try to find a better ordering (only for small number of candidates)
    best_order = None
    best_error = current_error
    
    # For efficiency, only try reordering top candidates
    n_try = min(num_cand, 6)  # Max 6 factorial = 720 permutations
    
    for perm in permutations(range(n_try)):
        # Reorder totals
        reordered = [totals[i] if i < len(totals) else 0 for i in perm]
        # Add remaining unchanged
        reordered.extend(totals[n_try:])
        
        error = calculate_error(reordered, official_totals)
        if error < best_error:
            best_error = error
            best_order = list(perm) + list(range(n_try, num_cand))
    
    return best_order, best_error

def reorder_booth_data(booth_data, order):
    """Reorder votes in all booths according to order"""
    results = booth_data.get('results', {})
    
    for booth_id, result in results.items():
        votes = result.get('votes', [])
        if len(votes) >= len(order):
            new_votes = [votes[i] if i < len(votes) else 0 for i in order]
            result['votes'] = new_votes
            result['total'] = sum(new_votes)
    
    # Also reorder candidates list
    old_cands = booth_data.get('candidates', [])
    if len(old_cands) >= len(order):
        booth_data['candidates'] = [old_cands[i] if i < len(old_cands) else old_cands[0] for i in order]
    
    return booth_data

def main():
    print("=== Fixing Booth Data Order ===\n")
    
    with open(ELECTIONS_FILE) as f:
        elections = json.load(f)
    
    fixed = 0
    still_bad = []
    
    for ac_id, official in sorted(elections.items()):
        if not ac_id.startswith('TN-'):
            continue
        
        booth_file = BOOTHS_DIR / ac_id / "2021.json"
        if not booth_file.exists():
            continue
        
        with open(booth_file) as f:
            booth_data = json.load(f)
        
        official_cands = official.get('candidates', [])
        
        # Find best order
        best_order, best_error = find_best_order(booth_data, official_cands)
        
        if best_order is not None:
            # Apply reordering
            booth_data = reorder_booth_data(booth_data, best_order)
            
            with open(booth_file, 'w') as f:
                json.dump(booth_data, f, indent=2)
            
            print(f"{ac_id}: Reordered → {best_error:.1f}% error")
            fixed += 1
            
            if best_error >= 2:
                still_bad.append((ac_id, best_error))
        else:
            # Check current error
            results = booth_data.get('results', {})
            num_cand = len(booth_data.get('candidates', []))
            totals = [0] * num_cand
            for r in results.values():
                for i, v in enumerate(r.get('votes', [])):
                    if i < num_cand:
                        totals[i] += v
            
            official_totals = [c.get('votes', 0) for c in official_cands[:num_cand]]
            error = calculate_error(totals, official_totals)
            
            if error >= 2:
                still_bad.append((ac_id, error))
    
    print(f"\n=== Summary ===")
    print(f"Fixed: {fixed}")
    print(f"Still >2%: {len(still_bad)}")
    
    if still_bad:
        print("\nStill problematic:")
        for ac_id, error in sorted(still_bad, key=lambda x: -x[1])[:20]:
            print(f"  {ac_id}: {error:.1f}%")

if __name__ == "__main__":
    main()
