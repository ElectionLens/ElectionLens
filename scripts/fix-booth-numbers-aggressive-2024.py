#!/usr/bin/env python3
"""
Aggressively fix booth numbers in votes arrays for 2024 data.

This script uses multiple detection strategies:
1. Check if booth number appears in first 10 positions
2. Check for suspicious patterns (0, small_number) that might be booth number
3. Check if booth number matches any vote value
4. Remove and re-pad with zeros
"""

import json
import re
from pathlib import Path
from collections import Counter

BOOTHS_DIR = Path("/Users/p0s097d/ElectionLens/public/data/booths/TN")


def load_json(path):
    with open(path) as f:
        return json.load(f)


def extract_booth_number(booth_id: str) -> int:
    """Extract booth number from booth ID."""
    match = re.match(r'TN-\d{3}-0*(\d+)', booth_id)
    if match:
        return int(match.group(1))
    return None


def fix_booth_votes_aggressive(booth_id: str, votes: list, booth_no: int, candidates: list) -> tuple[list, bool, str]:
    """Aggressively detect and remove booth numbers from votes array."""
    if not votes or len(votes) == 0:
        return votes, False, "empty"
    
    original_votes = votes.copy()
    fixed = False
    reason = ""
    
    # Strategy 1: Check if booth number appears in first 10 positions
    for i in range(min(10, len(votes))):
        if votes[i] == booth_no:
            votes[i] = 0
            fixed = True
            reason = f"booth_no_{booth_no}_at_pos_{i}"
            break
    
    # Strategy 2: Check for suspicious pattern [0, booth_no] or [booth_no, 0]
    if not fixed and len(votes) >= 2:
        if (votes[0] == 0 and votes[1] == booth_no) or (votes[0] == booth_no and votes[1] == 0):
            if votes[0] == booth_no:
                votes[0] = 0
            if votes[1] == booth_no:
                votes[1] = 0
            fixed = True
            reason = f"suspicious_pattern_0_{booth_no}"
    
    # Strategy 3: Check if booth number appears anywhere and is suspiciously low
    if not fixed:
        for i, vote in enumerate(votes):
            if vote == booth_no and vote < 1000:  # Booth numbers are usually < 1000
                # Check if this looks like a booth number (not a real vote)
                # Real votes in first positions are usually > 50 for major candidates
                if i < 5 and vote < 500:
                    votes[i] = 0
                    fixed = True
                    reason = f"booth_no_{booth_no}_at_pos_{i}_low_value"
                    break
    
    # Strategy 4: Check for pattern where first few votes are very low and one matches booth number
    if not fixed and len(votes) >= 3:
        first_three = votes[:3]
        if booth_no in first_three:
            # If booth number is in first 3 and other values are also very low, likely booth number
            if all(v < 100 for v in first_three if v != booth_no):
                idx = first_three.index(booth_no)
                votes[idx] = 0
                fixed = True
                reason = f"booth_no_in_low_pattern"
    
    # Ensure votes array length matches candidates
    num_candidates = len(candidates)
    while len(votes) < num_candidates:
        votes.append(0)
    if len(votes) > num_candidates:
        votes = votes[:num_candidates]
    
    return votes, fixed, reason


def fix_ac(ac_id: str, dry_run: bool = False) -> dict:
    """Fix booth numbers for a single AC."""
    results_file = BOOTHS_DIR / ac_id / "2024.json"
    
    if not results_file.exists():
        return {'status': 'missing', 'fixed': 0}
    
    with open(results_file) as f:
        data = json.load(f)
    
    results = data.get('results', {})
    candidates = data.get('candidates', [])
    
    if not results or not candidates:
        return {'status': 'empty', 'fixed': 0}
    
    fixed_count = 0
    fixed_booths = []
    
    for booth_id, booth_result in results.items():
        votes = booth_result.get('votes', [])
        if not votes:
            continue
        
        booth_no = extract_booth_number(booth_id)
        if not booth_no:
            continue
        
        fixed_votes, was_fixed, reason = fix_booth_votes_aggressive(booth_id, votes.copy(), booth_no, candidates)
        
        if was_fixed:
            fixed_count += 1
            fixed_booths.append((booth_id, reason))
            
            if not dry_run:
                booth_result['votes'] = fixed_votes
    
    if not dry_run and fixed_count > 0:
        with open(results_file, 'w') as f:
            json.dump(data, f, indent=2)
    
    return {
        'status': 'success',
        'fixed': fixed_count,
        'booths': fixed_booths[:10]  # First 10 for logging
    }


def main():
    import sys
    
    dry_run = '--dry-run' in sys.argv
    
    if dry_run:
        print("🔍 DRY RUN MODE - No files will be modified")
        print()
    
    print("=" * 80)
    print("Aggressive Booth Number Fix - 2024")
    print("=" * 80)
    print()
    
    total_fixed = 0
    acs_fixed = 0
    
    for ac_num in range(1, 235):
        ac_id = f"TN-{ac_num:03d}"
        result = fix_ac(ac_id, dry_run=dry_run)
        
        if result['fixed'] > 0:
            acs_fixed += 1
            total_fixed += result['fixed']
            if result['fixed'] <= 5:
                print(f"✅ {ac_id}: Fixed {result['fixed']} booths")
            else:
                print(f"✅ {ac_id}: Fixed {result['fixed']} booths (e.g., {', '.join(b[0].split('-')[-1] for b in result['booths'][:3])})")
    
    print()
    print("=" * 80)
    print("SUMMARY")
    print("=" * 80)
    print(f"ACs with fixes: {acs_fixed}")
    print(f"Total booths fixed: {total_fixed}")
    
    if dry_run:
        print()
        print("🔍 This was a dry run. Run without --dry-run to apply fixes.")
    else:
        print()
        print("✅ Fixes applied. Please re-run validation to verify.")


if __name__ == "__main__":
    main()
