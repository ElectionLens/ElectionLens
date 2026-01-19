#!/usr/bin/env python3
"""
Final validation of all 234 ACs - check postal data integrity.
"""

import json
from pathlib import Path

BASE_DIR = Path("/Users/p0s097d/ElectionLens")
BOOTHS_DIR = BASE_DIR / "public/data/booths/TN"
ELECTION_DATA = BASE_DIR / "public/data/elections/ac/TN/2021.json"

def load_json(path):
    with open(path, 'r') as f:
        return json.load(f)

def main():
    election_data = load_json(ELECTION_DATA)
    
    all_have_postal = True
    all_booth_postal_equal_total = True
    all_under_2_pct = True
    
    issues = []
    
    for ac_num in range(1, 235):
        ac_id = f"TN-{ac_num:03d}"
        booth_file = BOOTHS_DIR / ac_id / "2021.json"
        
        if not booth_file.exists():
            issues.append(f"{ac_id}: Missing booth file")
            continue
        
        booth_data = load_json(booth_file)
        official = election_data.get(ac_id, {})
        
        # Check postal section exists
        if "postal" not in booth_data:
            all_have_postal = False
            issues.append(f"{ac_id}: Missing postal section")
            continue
        
        postal_candidates = booth_data.get("postal", {}).get("candidates", [])
        
        # Check booth + postal = total
        for pc in postal_candidates:
            booth = pc.get("booth", 0)
            postal = pc.get("postal", 0)
            total = pc.get("total", 0)
            
            if booth + postal != total:
                all_booth_postal_equal_total = False
                issues.append(f"{ac_id}: {pc.get('name')}: {booth} + {postal} != {total}")
        
        # Check total matches official
        postal_total = sum(pc.get("total", 0) for pc in postal_candidates)
        official_total = official.get("validVotes", 0)
        
        if official_total > 0:
            error_pct = abs(postal_total - official_total) / official_total * 100
            if error_pct >= 2:
                all_under_2_pct = False
                issues.append(f"{ac_id}: {error_pct:.2f}% error")
    
    print(f"\n{'='*80}")
    print("FINAL VALIDATION RESULTS")
    print(f"{'='*80}")
    print(f"\n✓ All 234 ACs have postal section: {all_have_postal}")
    print(f"✓ All booth + postal = total: {all_booth_postal_equal_total}")
    print(f"✓ All ACs under 2% error: {all_under_2_pct}")
    
    if issues:
        print(f"\nIssues found ({len(issues)}):")
        for issue in issues[:10]:
            print(f"  - {issue}")
        if len(issues) > 10:
            print(f"  ... and {len(issues) - 10} more")
    else:
        print("\n🎉 ALL 234 ACS VALIDATED SUCCESSFULLY!")

if __name__ == "__main__":
    main()
