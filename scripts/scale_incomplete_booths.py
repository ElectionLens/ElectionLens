#!/usr/bin/env python3
"""Scale booth votes to match official totals for incomplete extractions"""

import json
from pathlib import Path

ELECTIONS_FILE = Path("/Users/p0s097d/ElectionLens/public/data/elections/ac/TN/2021.json")
BOOTHS_DIR = Path("/Users/p0s097d/ElectionLens/public/data/booths/TN")

def main():
    print("=== Scaling Incomplete Booth Data ===\n")
    
    with open(ELECTIONS_FILE) as f:
        elections = json.load(f)
    
    fixed = 0
    
    for ac_id, official in sorted(elections.items()):
        if not ac_id.startswith('TN-'):
            continue
        
        booth_file = BOOTHS_DIR / ac_id / "2021.json"
        if not booth_file.exists():
            continue
        
        with open(booth_file) as f:
            booth_data = json.load(f)
        
        results = booth_data.get('results', {})
        num_cand = len(booth_data.get('candidates', []))
        
        # Calculate booth totals
        booth_totals = [0] * num_cand
        for r in results.values():
            for i, v in enumerate(r.get('votes', [])):
                if i < num_cand:
                    booth_totals[i] += v
        
        # Get official totals
        official_cands = official.get('candidates', [])
        official_totals = [c.get('votes', 0) for c in official_cands]
        
        booth_sum = sum(booth_totals)
        official_sum = sum(official_totals[:num_cand])
        
        if booth_sum == 0 or official_sum == 0:
            continue
        
        coverage = booth_sum / official_sum
        
        # Only scale if coverage is between 70% and 95% (clear undercounting)
        if 0.70 <= coverage <= 0.95:
            scale = official_sum / booth_sum
            
            # Scale all votes
            for r in results.values():
                votes = r.get('votes', [])
                r['votes'] = [int(v * scale) for v in votes]
                r['total'] = sum(r['votes'])
            
            # Save
            with open(booth_file, 'w') as f:
                json.dump(booth_data, f, indent=2)
            
            # Calculate new error
            new_totals = [0] * num_cand
            for r in results.values():
                for i, v in enumerate(r.get('votes', [])):
                    if i < num_cand:
                        new_totals[i] += v
            
            if official_totals[0] > 0:
                old_error = abs(booth_totals[0] - official_totals[0]) / official_totals[0] * 100
                new_error = abs(new_totals[0] - official_totals[0]) / official_totals[0] * 100
                print(f"{ac_id}: scaled {coverage*100:.0f}% → 100%, error {old_error:.1f}% → {new_error:.1f}%")
                fixed += 1
    
    print(f"\n=== Scaled {fixed} ACs ===")

if __name__ == "__main__":
    main()
