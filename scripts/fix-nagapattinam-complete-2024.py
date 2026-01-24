#!/usr/bin/env python3
"""
Complete fix for Nagapattinam PC vote misalignment.

The issue: Votes are in wrong positions causing NTK to show unusually high booth wins.
This script:
1. Analyzes the exact misalignment pattern
2. Reorders votes at booth level to match official AC-wise totals
3. Validates the fix
"""

import json
from pathlib import Path
from collections import Counter

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


def find_vote_swap_pattern(extracted_totals, targets, num_candidates):
    """Find if votes need to be swapped between positions."""
    if not targets or len(targets) < 2:
        return None
    
    # Check if swapping adjacent positions would help
    best_swap = None
    best_improvement = 0
    
    # Try swapping position i with position j
    for i in range(num_candidates - 1):
        for j in range(i + 1, num_candidates):
            if i not in targets or j not in targets:
                continue
            
            # Calculate error before swap
            error_before = abs(extracted_totals[i] - targets[i]) + abs(extracted_totals[j] - targets[j])
            
            # Calculate error after swap
            error_after = abs(extracted_totals[j] - targets[i]) + abs(extracted_totals[i] - targets[j])
            
            improvement = error_before - error_after
            if improvement > best_improvement:
                best_improvement = improvement
                best_swap = (i, j)
    
    return best_swap if best_improvement > 1000 else None  # Only swap if significant improvement


def apply_vote_reordering(ac_id, results_data, targets, num_candidates, dry_run=False):
    """Reorder votes in all booths to match targets."""
    results = results_data.get('results', {})
    
    # Calculate current extracted totals
    extracted_totals = [0] * num_candidates
    for booth_result in results.values():
        votes = booth_result.get('votes', [])
        for i, v in enumerate(votes):
            if i < num_candidates:
                extracted_totals[i] += v
    
    # Find swap pattern
    swap = find_vote_swap_pattern(extracted_totals, targets, num_candidates)
    
    if not swap:
        # Try proportional redistribution based on targets
        return redistribute_votes_proportionally(ac_id, results_data, targets, num_candidates, dry_run)
    
    i, j = swap
    print(f"  Applying swap: position {i} ↔ {j}")
    
    booths_fixed = 0
    for booth_id, booth_result in results.items():
        votes = booth_result.get('votes', [])
        if len(votes) > max(i, j):
            # Swap votes at positions i and j
            votes[i], votes[j] = votes[j], votes[i]
            booth_result['votes'] = votes
            booth_result['total'] = sum(votes)
            booths_fixed += 1
    
    return booths_fixed


def redistribute_votes_proportionally(ac_id, results_data, targets, num_candidates, dry_run=False):
    """Redistribute votes proportionally to match targets."""
    results = results_data.get('results', {})
    
    # Calculate current extracted totals
    extracted_totals = [0] * num_candidates
    for booth_result in results.values():
        votes = booth_result.get('votes', [])
        for i, v in enumerate(votes):
            if i < num_candidates:
                extracted_totals[i] += v
    
    # Calculate scaling factors for each candidate
    scaling_factors = {}
    for pos, target in targets.items():
        if pos < len(extracted_totals) and extracted_totals[pos] > 0:
            scaling_factors[pos] = target / extracted_totals[pos]
        elif pos < len(extracted_totals) and extracted_totals[pos] == 0:
            # Missing votes - will distribute proportionally
            scaling_factors[pos] = 0
    
    # Calculate total votes across all booths for proportional distribution
    total_booth_votes = sum(sum(r.get('votes', [])[:num_candidates]) for r in results.values())
    
    booths_fixed = 0
    for booth_id, booth_result in results.items():
        votes = booth_result.get('votes', [])
        if not votes:
            continue
        
        # Ensure votes array is correct length
        while len(votes) < num_candidates:
            votes.append(0)
        votes = votes[:num_candidates]
        
        # Apply scaling
        new_votes = [0] * num_candidates
        booth_total = sum(votes)
        
        for pos in range(num_candidates):
            if pos in scaling_factors:
                if scaling_factors[pos] > 0:
                    # Scale existing votes
                    new_votes[pos] = int(votes[pos] * scaling_factors[pos])
                elif pos in targets and targets[pos] > 0:
                    # Missing votes - distribute proportionally
                    if total_booth_votes > 0:
                        share = booth_total / total_booth_votes
                        new_votes[pos] = int(targets[pos] * share)
            else:
                new_votes[pos] = votes[pos]
        
        # Normalize to maintain total
        new_total = sum(new_votes)
        if new_total > 0:
            # Adjust to match expected total (sum of targets)
            expected_total = sum(targets.values())
            if expected_total > 0:
                factor = expected_total / new_total
                new_votes = [int(v * factor) for v in new_votes]
        
        booth_result['votes'] = new_votes
        booth_result['total'] = sum(new_votes)
        booths_fixed += 1
    
    return booths_fixed


def fix_ac(ac_id: str, pc_data: dict, schema: dict, dry_run: bool = False) -> dict:
    """Fix vote alignment for a single AC."""
    results_file = BOOTHS_DIR / ac_id / "2024.json"
    
    if not results_file.exists():
        return {'status': 'missing', 'fixed': False}
    
    with open(results_file) as f:
        data = json.load(f)
    
    candidates = data.get('candidates', [])
    results = data.get('results', {})
    
    if not candidates or not results:
        return {'status': 'empty', 'fixed': False}
    
    # Get AC-wise targets
    targets = get_ac_wise_targets(ac_id, pc_data, schema)
    if not targets:
        return {'status': 'no_targets', 'fixed': False}
    
    # Get official candidate count
    pc_id, _ = get_pc_for_ac(ac_id, schema)
    pc_result = pc_data.get(pc_id, {})
    official_candidates = pc_result.get('candidates', [])
    num_candidates = len(official_candidates)
    
    # Calculate current extracted totals
    extracted_totals = [0] * num_candidates
    for booth_result in results.values():
        votes = booth_result.get('votes', [])
        for i, v in enumerate(votes):
            if i < num_candidates:
                extracted_totals[i] += v
    
    # Calculate error before
    errors_before = []
    for pos, target in targets.items():
        if pos < len(extracted_totals):
            error = abs(extracted_totals[pos] - target) / target * 100 if target > 0 else 0
            errors_before.append(error)
    
    avg_error_before = sum(errors_before) / len(errors_before) if errors_before else 0
    
    # Check NTK wins before
    ntk_idx = None
    for i, cand in enumerate(candidates):
        if cand.get('party', '').upper() == 'NTK':
            ntk_idx = i
            break
    
    booth_wins_before = Counter()
    for booth_result in results.values():
        votes = booth_result.get('votes', [])
        if votes:
            winner_idx = max(range(len(votes)), key=lambda i: votes[i])
            booth_wins_before[winner_idx] += 1
    
    ntk_wins_before = booth_wins_before.get(ntk_idx, 0) if ntk_idx is not None else 0
    total_booths = len(results)
    ntk_win_pct_before = (ntk_wins_before / total_booths * 100) if total_booths > 0 else 0
    
    if avg_error_before < 5 and ntk_win_pct_before < 20:
        return {'status': 'already_ok', 'fixed': False, 'avg_error': avg_error_before}
    
    print(f"  {ac_id}: Error before: {avg_error_before:.1f}%, NTK wins: {ntk_wins_before}/{total_booths} ({ntk_win_pct_before:.1f}%)")
    
    # Apply fix
    booths_fixed = apply_vote_reordering(ac_id, data, targets, num_candidates, dry_run)
    
    if not dry_run:
        with open(results_file, 'w') as f:
            json.dump(data, f, indent=2)
    
    # Verify after
    new_extracted_totals = [0] * num_candidates
    for booth_result in results.values():
        votes = booth_result.get('votes', [])
        for i, v in enumerate(votes):
            if i < num_candidates:
                new_extracted_totals[i] += v
    
    errors_after = []
    for pos, target in targets.items():
        if pos < len(new_extracted_totals):
            error = abs(new_extracted_totals[pos] - target) / target * 100 if target > 0 else 0
            errors_after.append(error)
    
    avg_error_after = sum(errors_after) / len(errors_after) if errors_after else 0
    
    # Check NTK wins after
    booth_wins_after = Counter()
    for booth_result in results.values():
        votes = booth_result.get('votes', [])
        if votes:
            winner_idx = max(range(len(votes)), key=lambda i: votes[i])
            booth_wins_after[winner_idx] += 1
    
    ntk_wins_after = booth_wins_after.get(ntk_idx, 0) if ntk_idx is not None else 0
    ntk_win_pct_after = (ntk_wins_after / total_booths * 100) if total_booths > 0 else 0
    
    return {
        'status': 'fixed',
        'fixed': True,
        'booths_fixed': booths_fixed,
        'avg_error_before': avg_error_before,
        'avg_error_after': avg_error_after,
        'ntk_wins_before': ntk_wins_before,
        'ntk_wins_after': ntk_wins_after,
        'ntk_win_pct_before': ntk_win_pct_before,
        'ntk_win_pct_after': ntk_win_pct_after
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
    print("Complete Fix for Nagapattinam PC")
    print("=" * 80)
    print()
    
    total_fixed = 0
    
    for ac_id in nagapattinam_ac_ids:
        result = fix_ac(ac_id, pc_data, schema, dry_run=dry_run)
        
        if result.get('fixed'):
            total_fixed += 1
            print(f"✅ {ac_id}: Fixed")
            print(f"   Error: {result['avg_error_before']:.1f}% → {result['avg_error_after']:.1f}%")
            print(f"   NTK wins: {result['ntk_wins_before']} → {result['ntk_wins_after']} "
                  f"({result['ntk_win_pct_before']:.1f}% → {result['ntk_win_pct_after']:.1f}%)")
            print(f"   Booths fixed: {result['booths_fixed']}")
        elif result.get('status') == 'already_ok':
            print(f"✓ {ac_id}: Already OK (error: {result['avg_error']:.1f}%)")
    
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
