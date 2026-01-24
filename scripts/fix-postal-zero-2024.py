#!/usr/bin/env python3
"""
Fix postal votes for 2024 PC elections.
For 2024 PC elections, postal votes are PC-level, not AC-level.
AC-level postal votes should be 0, and total = booth votes only.
"""

import json
from pathlib import Path

BASE_DIR = Path("/Users/p0s097d/ElectionLens")
BOOTHS_DIR = BASE_DIR / "public/data/booths/TN"

def main():
    print("="*80)
    print("FIXING POSTAL VOTES FOR 2024 PC ELECTIONS")
    print("Setting AC-level postal votes to 0 (postal votes are PC-level)")
    print("="*80)
    print()
    
    total_acs = 234
    acs_fixed = 0
    
    for ac_num in range(1, 235):
        ac_id = f"TN-{ac_num:03d}"
        booth_file = BOOTHS_DIR / ac_id / "2024.json"
        
        if not booth_file.exists():
            continue
        
        try:
            with open(booth_file, 'r') as f:
                data = json.load(f)
        except Exception as e:
            print(f"❌ {ac_id}: Error reading: {e}")
            continue
        
        postal = data.get('postal', {})
        postal_candidates = postal.get('candidates', [])
        
        if not postal_candidates:
            continue
        
        needs_fix = False
        fixed_count = 0
        
        for postal_cand in postal_candidates:
            current_postal = postal_cand.get('postal', 0)
            booth_votes = postal_cand.get('booth', 0)
            current_total = postal_cand.get('total', 0)
            
            # For 2024 PC elections: postal = 0, total = booth
            if current_postal != 0:
                postal_cand['postal'] = 0
                needs_fix = True
                fixed_count += 1
            
            # Ensure total = booth (since postal = 0)
            if current_total != booth_votes:
                postal_cand['total'] = booth_votes
                needs_fix = True
        
        if needs_fix:
            # Update postal totals
            total_booth = sum(c.get('booth', 0) for c in postal_candidates)
            postal['totalValid'] = total_booth
            postal['total'] = total_booth
            
            try:
                with open(booth_file, 'w') as f:
                    json.dump(data, f, indent=2, ensure_ascii=False)
                acs_fixed += 1
                print(f"✅ {ac_id}: Fixed {fixed_count} candidates (postal → 0, total = booth)")
            except Exception as e:
                print(f"❌ {ac_id}: Error saving: {e}")
    
    print()
    print("="*80)
    print("SUMMARY")
    print("="*80)
    print(f"Total ACs: {total_acs}")
    print(f"ACs fixed: {acs_fixed}")
    print()
    print("For 2024 PC elections:")
    print("  - Postal votes are PC-level (shown in PC view)")
    print("  - AC-level postal votes = 0")
    print("  - AC-level total = booth votes only")

if __name__ == "__main__":
    main()
