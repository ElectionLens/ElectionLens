#!/usr/bin/env python3
"""
Fix booth number leaking into votes array in 2024 data.

The issue: Booth numbers are appearing in the votes array, causing vote counts to be incorrect.
Example: Booth TN-001-002 has votes [2, 999, ...] where 2 is the booth number.

This script:
1. Detects when booth number appears in votes array
2. Removes it and shifts remaining votes
3. Validates the fix against official totals
"""

import json
from pathlib import Path
from collections import defaultdict

BOOTHS_DIR = Path("/Users/p0s097d/ElectionLens/public/data/booths/TN")
PC_DATA = Path("/Users/p0s097d/ElectionLens/public/data/elections/pc/TN/2024.json")
SCHEMA = Path("/Users/p0s097d/ElectionLens/public/data/schema.json")


def load_json(path):
    with open(path) as f:
        return json.load(f)


def get_pc_for_ac(ac_id, schema):
    for pc_id, pc_data in schema.get('parliamentaryConstituencies', {}).items():
        if ac_id in pc_data.get('assemblyIds', []):
            return pc_id, pc_data.get('name', '')
    return None, None


def extract_booth_number(booth_id: str) -> int:
    """Extract booth number from booth_id (e.g., 'TN-001-002' -> 2)."""
    try:
        booth_no_str = booth_id.split('-')[-1]
        # Remove any suffixes like 'W', 'M', 'A'
        booth_no_str = booth_no_str.replace('W', '').replace('M', '').replace('A', '')
        return int(booth_no_str)
    except:
        return None


def fix_booth_votes(booth_id: str, votes: list, booth_no: int) -> tuple[list, bool]:
    """
    Fix votes array by removing booth number if present.
    Returns (fixed_votes, was_fixed)
    """
    if not votes or booth_no is None:
        return votes, False
    
    fixed_votes = votes.copy()
    was_fixed = False
    
    # Check if booth number appears in first 5 positions (expanded check)
    # Most common error is in first 3, but check more to be safe
    for i in range(min(5, len(fixed_votes))):
        if fixed_votes[i] == booth_no:
            # Remove this value and shift
            fixed_votes = fixed_votes[:i] + fixed_votes[i+1:]
            # Pad with 0 at end if needed to maintain length
            if len(fixed_votes) < len(votes):
                fixed_votes.append(0)
            was_fixed = True
            break
    
    # Also check for suspicious pattern: votes[0]=0, votes[1] is a small number (1-600)
    # This might indicate booth number in wrong position
    if not was_fixed and len(fixed_votes) >= 2:
        if fixed_votes[0] == 0 and 1 <= fixed_votes[1] <= 600:
            # This could be a booth number, but we can't be sure without context
            # Only fix if it matches the actual booth number
            if fixed_votes[1] == booth_no:
                fixed_votes = fixed_votes[1:] + [0]
                was_fixed = True
    
    # Additional check: if booth number appears anywhere in first 10 positions
    # and it's suspiciously positioned, remove it
    if not was_fixed:
        for i in range(min(10, len(fixed_votes))):
            if fixed_votes[i] == booth_no:
                # Only remove if it's in a suspicious position (early in array)
                # and the value seems out of place (too small compared to neighbors)
                if i < 5:
                    neighbors = []
                    if i > 0:
                        neighbors.append(fixed_votes[i-1])
                    if i < len(fixed_votes) - 1:
                        neighbors.append(fixed_votes[i+1])
                    
                    # If neighbors are much larger, this is likely the booth number
                    if neighbors and all(n > booth_no * 2 for n in neighbors if n > 0):
                        fixed_votes = fixed_votes[:i] + fixed_votes[i+1:]
                        if len(fixed_votes) < len(votes):
                            fixed_votes.append(0)
                        was_fixed = True
                        break
    
    return fixed_votes, was_fixed


def validate_fix(ac_id: str, results_data: dict, pc_data: dict, schema: dict) -> dict:
    """Validate the fix by comparing totals against official data."""
    pc_id, _ = get_pc_for_ac(ac_id, schema)
    pc_result = pc_data.get(pc_id, {}) if pc_id else {}
    official_candidates = pc_result.get('candidates', [])
    
    results = results_data.get('results', {})
    candidates = results_data.get('candidates', [])
    
    if not official_candidates or not candidates:
        return {'valid': False, 'reason': 'Missing official or extracted candidates'}
    
    # Calculate booth totals
    num_candidates = len(candidates)
    booth_totals = [0] * num_candidates
    
    for booth_id, booth_result in results.items():
        votes = booth_result.get('votes', [])
        for i, v in enumerate(votes):
            if i < num_candidates:
                booth_totals[i] += v
    
    # Compare top 3 candidates
    errors = []
    for i in range(min(3, len(official_candidates), len(booth_totals))):
        official = official_candidates[i].get('votes', 0)
        extracted = booth_totals[i]
        if official > 0:
            ratio = extracted / official
            if not (0.80 <= ratio <= 1.20):  # Within 20% tolerance
                errors.append(
                    f"Candidate {i+1} ({official_candidates[i].get('party', 'Unknown')}): "
                    f"extracted {extracted:,} vs official {official:,} (ratio {ratio:.2f})"
                )
    
    return {
        'valid': len(errors) == 0,
        'errors': errors,
        'booth_totals': booth_totals[:3],
        'official_totals': [c.get('votes', 0) for c in official_candidates[:3]]
    }


def fix_ac(ac_id: str, pc_data: dict, schema: dict, dry_run: bool = False) -> dict:
    """Fix booth number issues for a single AC."""
    results_file = BOOTHS_DIR / ac_id / "2024.json"
    
    if not results_file.exists():
        return {'status': 'missing', 'fixed': 0}
    
    with open(results_file) as f:
        results_data = json.load(f)
    
    results = results_data.get('results', {})
    if not results:
        return {'status': 'empty', 'fixed': 0}
    
    fixed_count = 0
    fixed_booths = []
    
    # Fix each booth
    for booth_id, booth_result in results.items():
        votes = booth_result.get('votes', [])
        booth_no = extract_booth_number(booth_id)
        
        fixed_votes, was_fixed = fix_booth_votes(booth_id, votes, booth_no)
        
        if was_fixed:
            fixed_count += 1
            fixed_booths.append(booth_id)
            if not dry_run:
                booth_result['votes'] = fixed_votes
                # Recalculate total
                booth_result['total'] = sum(fixed_votes)
    
    # Validate the fix
    validation = None
    if not dry_run and fixed_count > 0:
        validation = validate_fix(ac_id, results_data, pc_data, schema)
    
    # Save if not dry run
    if not dry_run and fixed_count > 0:
        with open(results_file, 'w') as f:
            json.dump(results_data, f, indent=2)
    
    return {
        'status': 'fixed' if fixed_count > 0 else 'ok',
        'fixed': fixed_count,
        'fixed_booths': fixed_booths[:10],  # First 10 for reporting
        'validation': validation
    }


def main():
    import sys
    
    dry_run = '--dry-run' in sys.argv or '-n' in sys.argv
    specific_ac = None
    for arg in sys.argv[1:]:
        if arg.startswith('TN-'):
            specific_ac = arg
            break
    
    pc_data = load_json(PC_DATA)
    schema = load_json(SCHEMA)
    
    print("=" * 80)
    print("Fix Booth Number in Votes Array - 2024 Data")
    print("=" * 80)
    if dry_run:
        print("🔍 DRY RUN MODE - No files will be modified")
    print()
    
    if specific_ac:
        acs_to_process = [specific_ac]
    else:
        acs_to_process = [f"TN-{i:03d}" for i in range(1, 235)]
    
    total_fixed = 0
    total_booths_fixed = 0
    results_by_status = defaultdict(list)
    
    for ac_id in acs_to_process:
        result = fix_ac(ac_id, pc_data, schema, dry_run=dry_run)
        
        status = result['status']
        results_by_status[status].append((ac_id, result))
        
        if result['fixed'] > 0:
            total_fixed += 1
            total_booths_fixed += result['fixed']
            print(f"{'[DRY RUN] ' if dry_run else ''}✅ {ac_id}: Fixed {result['fixed']} booths")
            if result.get('validation'):
                if result['validation']['valid']:
                    print(f"   ✓ Validation passed")
                else:
                    print(f"   ⚠️  Validation issues:")
                    for err in result['validation']['errors'][:2]:
                        print(f"      - {err}")
    
    print()
    print("=" * 80)
    print("SUMMARY")
    print("=" * 80)
    print(f"ACs processed: {len(acs_to_process)}")
    print(f"ACs with fixes: {total_fixed}")
    print(f"Total booths fixed: {total_booths_fixed}")
    print(f"ACs already OK: {len(results_by_status['ok'])}")
    print(f"ACs missing data: {len(results_by_status['missing'])}")
    
    if dry_run:
        print("\n🔍 This was a dry run. Run without --dry-run to apply fixes.")
    else:
        print("\n✅ Fixes applied. Please re-run validation to verify.")
    
    print("=" * 80)


if __name__ == "__main__":
    main()
