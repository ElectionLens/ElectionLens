#!/usr/bin/env python3
"""
Fix vote shift in Nagapattinam PC ACs.

The issue: Votes are shifted - NTK has votes that belong to ADMK, etc.
This script detects the shift by comparing extracted totals to official AC-wise totals
and applies the correct shift.
"""

import json
from pathlib import Path

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


def get_ac_wise_targets(ac_id, pc_data, schema):
    """Get AC-wise vote targets for all candidates."""
    pc_id, _ = get_pc_for_ac(ac_id, schema)
    if not pc_id:
        return None
    
    pc_result = pc_data.get(pc_id, {})
    if not pc_result:
        return None
    
    # Get AC name from booth data
    booth_file = BOOTHS_DIR / ac_id / "2024.json"
    ac_name = None
    if booth_file.exists():
        with open(booth_file) as f:
            booth_data = json.load(f)
            ac_name = booth_data.get('acName', '')
    
    if not ac_name:
        return None
    
    # Get all candidates with AC-wise votes
    candidates = pc_result.get('candidates', [])
    targets = {}
    
    ac_name_normalized = ac_name.upper().strip()
    
    for i, cand in enumerate(candidates):
        ac_votes = cand.get('acWiseVotes', [])
        for ac_vote in ac_votes:
            ac_vote_name = ac_vote.get('acName', '').upper().strip()
            if (ac_name_normalized == ac_vote_name or 
                ac_name_normalized in ac_vote_name or 
                ac_vote_name in ac_name_normalized):
                targets[i] = ac_vote.get('votes', 0)
                break
    
    return targets if targets else None


def find_best_shift(extracted_totals, targets, num_candidates):
    """Find best shift to align extracted totals with targets."""
    if not targets:
        return 0
    
    best_shift = 0
    best_error = float('inf')
    
    # Try shifts from -3 to +3
    for shift in range(-3, 4):
        total_error = 0
        matched = 0
        
        for off_idx, target_votes in targets.items():
            src_idx = off_idx - shift
            if 0 <= src_idx < len(extracted_totals):
                extracted = extracted_totals[src_idx]
                error = abs(extracted - target_votes) / target_votes if target_votes > 0 else abs(extracted - target_votes)
                total_error += error
                matched += 1
        
        if matched > 0:
            avg_error = total_error / matched
            if avg_error < best_error:
                best_error = avg_error
                best_shift = shift
    
    return best_shift


def apply_shift(ac_id, results_data, shift, num_candidates, dry_run=False):
    """Apply vote shift to all booths."""
    results = results_data.get('results', {})
    booths_fixed = 0
    
    for booth_id, booth_result in results.items():
        votes = booth_result.get('votes', [])
        if not votes:
            continue
        
        # Apply shift: new_votes[i] = votes[i + shift]
        new_votes = [0] * num_candidates
        for i in range(num_candidates):
            src_idx = i + shift
            if 0 <= src_idx < len(votes):
                new_votes[i] = votes[src_idx]
        
        booth_result['votes'] = new_votes
        booth_result['total'] = sum(new_votes)
        booths_fixed += 1
    
    return booths_fixed


def fix_ac(ac_id: str, pc_data: dict, schema: dict, dry_run: bool = False) -> dict:
    """Fix vote shift for a single AC."""
    results_file = BOOTHS_DIR / ac_id / "2024.json"
    
    if not results_file.exists():
        return {'status': 'missing', 'fixed': False}
    
    with open(results_file) as f:
        data = json.load(f)
    
    candidates = data.get('candidates', [])
    results = data.get('results', {})
    
    if not candidates or not results:
        return {'status': 'empty', 'fixed': False}
    
    # Calculate extracted totals
    extracted_totals = [0] * len(candidates)
    for booth_result in results.values():
        votes = booth_result.get('votes', [])
        for i, v in enumerate(votes):
            if i < len(extracted_totals):
                extracted_totals[i] += v
    
    # Get AC-wise targets
    targets = get_ac_wise_targets(ac_id, pc_data, schema)
    if not targets:
        return {'status': 'no_targets', 'fixed': False}
    
    # Get official candidate count
    pc_id, _ = get_pc_for_ac(ac_id, schema)
    pc_result = pc_data.get(pc_id, {})
    official_candidates = pc_result.get('candidates', [])
    num_candidates = len(official_candidates)
    
    # Find best shift
    best_shift = find_best_shift(extracted_totals, targets, num_candidates)
    
    if best_shift == 0:
        return {'status': 'no_shift_needed', 'fixed': False}
    
    print(f"  {ac_id}: Applying shift {best_shift}")
    
    # Apply shift
    booths_fixed = apply_shift(ac_id, data, best_shift, num_candidates, dry_run)
    
    if not dry_run:
        with open(results_file, 'w') as f:
            json.dump(data, f, indent=2)
    
    # Verify
    new_extracted_totals = [0] * num_candidates
    for booth_result in results.values():
        votes = booth_result.get('votes', [])
        for i, v in enumerate(votes):
            if i < num_candidates:
                new_extracted_totals[i] += v
    
    errors_before = []
    errors_after = []
    for off_idx, target_votes in targets.items():
        if off_idx < len(extracted_totals):
            before_error = abs(extracted_totals[off_idx] - target_votes) / target_votes * 100 if target_votes > 0 else 0
            errors_before.append(before_error)
        if off_idx < len(new_extracted_totals):
            after_error = abs(new_extracted_totals[off_idx] - target_votes) / target_votes * 100 if target_votes > 0 else 0
            errors_after.append(after_error)
    
    avg_error_before = sum(errors_before) / len(errors_before) if errors_before else 0
    avg_error_after = sum(errors_after) / len(errors_after) if errors_after else 0
    
    return {
        'status': 'fixed',
        'fixed': True,
        'shift': best_shift,
        'booths_fixed': booths_fixed,
        'avg_error_before': avg_error_before,
        'avg_error_after': avg_error_after
    }


def main():
    import sys
    
    dry_run = '--dry-run' in sys.argv
    
    if dry_run:
        print("🔍 DRY RUN MODE - No files will be modified")
        print()
    
    pc_data = load_json(PC_DATA)
    schema = load_json(SCHEMA)
    
    # Find Nagapattinam PC
    nagapattinam_ac_ids = []
    
    for pc_id, pc_info in schema.get('parliamentaryConstituencies', {}).items():
        pc_name = pc_info.get('name', '').upper()
        if 'NAGAPATTINAM' in pc_name:
            nagapattinam_ac_ids = pc_info.get('assemblyIds', [])
            print(f"Found Nagapattinam PC: {pc_id} - {pc_info.get('name', '')}")
            print(f"ACs: {nagapattinam_ac_ids}")
            break
    
    if not nagapattinam_ac_ids:
        print("❌ Could not find Nagapattinam PC")
        return
    
    print()
    print("=" * 80)
    print("Fixing Vote Shift in Nagapattinam PC")
    print("=" * 80)
    print()
    
    total_fixed = 0
    
    for ac_id in nagapattinam_ac_ids:
        result = fix_ac(ac_id, pc_data, schema, dry_run=dry_run)
        
        if result.get('fixed'):
            total_fixed += 1
            print(f"✅ {ac_id}: Fixed (shift {result['shift']})")
            print(f"   Error: {result['avg_error_before']:.1f}% → {result['avg_error_after']:.1f}%")
            print(f"   Booths fixed: {result['booths_fixed']}")
        elif result.get('status') == 'no_shift_needed':
            print(f"✓ {ac_id}: No shift needed")
    
    print()
    print("=" * 80)
    print("SUMMARY")
    print("=" * 80)
    print(f"ACs fixed: {total_fixed}/{len(nagapattinam_ac_ids)}")
    
    if dry_run:
        print()
        print("🔍 This was a dry run. Run without --dry-run to apply fixes.")


if __name__ == "__main__":
    main()
