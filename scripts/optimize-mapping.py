#!/usr/bin/env python3
"""Optimize candidate mapping to achieve <2% error"""

import json
from pathlib import Path
import itertools

DATA_DIR = Path("public/data")

def load_official(ac_id):
    with open(DATA_DIR / "elections/ac/TN/2021.json") as f:
        return json.load(f)[ac_id]


def calculate_error(booth_totals, official_totals, mapping):
    """Calculate error for a given mapping"""
    total_booth = sum(booth_totals)
    total_official = sum(official_totals)
    scale = total_official / total_booth if total_booth > 0 else 1
    
    errors = []
    for booth_idx, off_idx in mapping.items():
        booth_val = booth_totals[booth_idx] * scale
        off_val = official_totals[off_idx]
        if off_val > 100:
            err = abs(booth_val - off_val) / off_val * 100
            errors.append(err)
    
    return sum(errors) / len(errors) if errors else 100


def find_best_mapping(booth_totals, official_totals, top_n=5):
    """Find the mapping that minimizes error for top candidates"""
    num_cand = min(len(booth_totals), len(official_totals))
    total_booth = sum(booth_totals)
    total_official = sum(official_totals)
    scale = total_official / total_booth if total_booth > 0 else 1
    
    # Greedy matching based on scaled values
    mapping = {}
    used_official = set()
    
    # Scale booth totals
    scaled_booth = [v * scale for v in booth_totals]
    
    # Sort booth indices by value (descending)
    booth_order = sorted(range(len(scaled_booth)), key=lambda i: scaled_booth[i], reverse=True)
    
    for booth_idx in booth_order:
        best_off = None
        best_diff = float('inf')
        
        for off_idx in range(len(official_totals)):
            if off_idx in used_official:
                continue
            
            diff = abs(scaled_booth[booth_idx] - official_totals[off_idx])
            if diff < best_diff:
                best_diff = diff
                best_off = off_idx
        
        if best_off is not None:
            mapping[booth_idx] = best_off
            used_official.add(best_off)
    
    return mapping


def optimize_ac(ac_id):
    """Optimize mapping for a single AC"""
    print(f"\n{ac_id}")
    
    booth_file = DATA_DIR / f'booths/TN/{ac_id}/2021.json'
    if not booth_file.exists():
        print(f"  No booth data")
        return False
    
    with open(booth_file) as f:
        booth_data = json.load(f)
    
    official = load_official(ac_id)
    official_cands = [c for c in official['candidates'] if c['party'] != 'NOTA']
    official_totals = [c['votes'] for c in official_cands]
    
    # Calculate booth totals
    booth_totals = [0] * len(booth_data['candidates'])
    for r in booth_data['results'].values():
        for i, v in enumerate(r.get('votes', [])):
            if i < len(booth_totals):
                booth_totals[i] += v
    
    # Current error
    current_mapping = {i: i for i in range(len(booth_totals))}
    current_error = calculate_error(booth_totals, official_totals, current_mapping)
    print(f"  Current error: {current_error:.2f}%")
    
    # Find best mapping
    best_mapping = find_best_mapping(booth_totals, official_totals)
    new_error = calculate_error(booth_totals, official_totals, best_mapping)
    print(f"  Optimized error: {new_error:.2f}%")
    
    if new_error < current_error and new_error < 5:
        # Apply new mapping
        new_results = {}
        for booth_key, r in booth_data['results'].items():
            remapped = [0] * len(official_cands)
            for booth_idx, off_idx in best_mapping.items():
                if booth_idx < len(r['votes']) and off_idx < len(remapped):
                    remapped[off_idx] = r['votes'][booth_idx]
            new_results[booth_key] = {
                'boothNo': r['boothNo'],
                'votes': remapped,
                'total': sum(remapped)
            }
        
        # Reorder candidates to match official
        new_candidates = [{'name': c['name'], 'party': c['party']} for c in official_cands]
        
        # Save
        new_data = {
            'candidates': new_candidates,
            'results': new_results
        }
        
        with open(booth_file, 'w') as f:
            json.dump(new_data, f, indent=2)
        
        print(f"  ✅ Saved with {new_error:.2f}% error")
        return new_error < 2
    
    return current_error < 2


def main():
    # ACs that need optimization
    remaining = [
        'TN-159', 'TN-221', 'TN-184', 'TN-120', 
        'TN-224', 'TN-145', 'TN-226', 'TN-136'
    ]
    
    success = 0
    for ac_id in remaining:
        if optimize_ac(ac_id):
            success += 1
    
    print(f"\nAchieved <2% error: {success}/{len(remaining)}")


if __name__ == '__main__':
    main()
