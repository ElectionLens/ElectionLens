#!/usr/bin/env python3
"""
Fix booth totals - ensure each booth's 'total' field equals sum of votes.
"""

import json
import os
from pathlib import Path

BOOTH_BASE = Path("/Users/p0s097d/.cursor/worktrees/ElectionLens/snj/public/data/booths/TN")


def fix_all_booth_data():
    """Fix totals in all booth data files."""
    fixed_acs = 0
    fixed_booths = 0
    
    for ac_dir in sorted(BOOTH_BASE.iterdir()):
        if not ac_dir.is_dir():
            continue
        
        booth_file = ac_dir / "2021.json"
        if not booth_file.exists():
            continue
        
        with open(booth_file) as f:
            data = json.load(f)
        
        results = data.get('results', {})
        ac_fixed = False
        
        for booth_id, result in results.items():
            votes = result.get('votes', [])
            current_total = result.get('total', 0)
            correct_total = sum(votes)
            
            if current_total != correct_total:
                result['total'] = correct_total
                fixed_booths += 1
                ac_fixed = True
        
        if ac_fixed:
            with open(booth_file, 'w') as f:
                json.dump(data, f, indent=2)
            fixed_acs += 1
    
    return fixed_acs, fixed_booths


def main():
    print("Fixing booth totals...")
    fixed_acs, fixed_booths = fix_all_booth_data()
    print(f"Fixed {fixed_booths} booths across {fixed_acs} ACs")


if __name__ == "__main__":
    main()
