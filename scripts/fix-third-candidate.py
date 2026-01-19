#!/usr/bin/env python3
"""Fix third candidate mapping to achieve <2% error"""

import json
from pathlib import Path

DATA_DIR = Path("public/data")

def load_official(ac_id):
    with open(DATA_DIR / "elections/ac/TN/2021.json") as f:
        return json.load(f)[ac_id]


def optimize_third(ac_id):
    """Find best mapping for third candidate"""
    print(f"\n{ac_id}")
    
    booth_file = DATA_DIR / f'booths/TN/{ac_id}/2021.json'
    with open(booth_file) as f:
        booth_data = json.load(f)
    
    official = load_official(ac_id)
    official_cands = [c for c in official['candidates'] if c['party'] != 'NOTA']
    
    # Calculate booth totals
    booth_totals = [0] * len(booth_data['candidates'])
    for r in booth_data['results'].values():
        for i, v in enumerate(r.get('votes', [])):
            if i < len(booth_totals):
                booth_totals[i] += v
    
    total_booth = sum(booth_totals)
    total_official = sum(c['votes'] for c in official_cands)
    scale = total_official / total_booth if total_booth > 0 else 1
    
    # Current third candidate error
    third_official = official_cands[2]['votes']
    third_scaled = booth_totals[2] * scale
    current_err = abs(third_scaled - third_official) / third_official * 100
    
    print(f"  Current third: {third_scaled:,.0f} vs {third_official:,} = {current_err:.2f}%")
    
    # Find best booth column for third official candidate
    best_col = 2
    best_err = current_err
    
    for col in range(len(booth_totals)):
        if col in [0, 1]:  # Skip first two (already mapped)
            continue
        
        col_scaled = booth_totals[col] * scale
        err = abs(col_scaled - third_official) / third_official * 100
        
        if err < best_err:
            best_err = err
            best_col = col
            print(f"  Better col {col}: {col_scaled:,.0f} = {err:.2f}%")
    
    if best_col != 2 and best_err < current_err - 1:
        print(f"  Swapping col 2 <-> col {best_col}")
        
        # Swap columns in all booth results
        new_results = {}
        for key, r in booth_data['results'].items():
            new_votes = list(r['votes'])
            new_votes[2], new_votes[best_col] = new_votes[best_col], new_votes[2]
            new_results[key] = {
                'boothNo': r['boothNo'],
                'votes': new_votes,
                'total': r['total']
            }
        
        # Also swap candidates
        new_cands = list(booth_data['candidates'])
        new_cands[2], new_cands[best_col] = new_cands[best_col], new_cands[2]
        
        # Save
        booth_data['results'] = new_results
        booth_data['candidates'] = new_cands
        
        with open(booth_file, 'w') as f:
            json.dump(booth_data, f, indent=2)
        
        print(f"  Saved! New error: {best_err:.2f}%")
        return best_err < 2
    else:
        print(f"  No better mapping found")
        return current_err < 2


def main():
    marginal = ['TN-224', 'TN-145', 'TN-226', 'TN-136']
    
    success = 0
    for ac_id in marginal:
        if optimize_third(ac_id):
            success += 1
    
    print(f"\nFixed: {success}/{len(marginal)}")


if __name__ == '__main__':
    main()
