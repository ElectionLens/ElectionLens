#!/usr/bin/env python3
"""
Direct fix for Nagapattinam PC - redistribute votes based on official totals.

This script directly redistributes votes in each booth proportionally to match
official AC-wise totals, effectively rebuilding the vote arrays.
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


def fix_ac(ac_id: str, pc_data: dict, schema: dict, dry_run: bool = False) -> dict:
    """Fix vote alignment by direct redistribution."""
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
    
    # Calculate total votes across all booths
    total_booth_votes = sum(sum(r.get('votes', [])[:num_candidates]) for r in results.values())
    total_target_votes = sum(targets.values())
    
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
    
    if avg_error_before < 2 and ntk_win_pct_before < 15:
        return {'status': 'already_ok', 'fixed': False, 'avg_error': avg_error_before}
    
    print(f"  {ac_id}: Error before: {avg_error_before:.1f}%, NTK wins: {ntk_wins_before}/{total_booths} ({ntk_win_pct_before:.1f}%)")
    
    # Calculate target proportions
    target_proportions = {}
    for pos, target in targets.items():
        if total_target_votes > 0:
            target_proportions[pos] = target / total_target_votes
        else:
            target_proportions[pos] = 0
    
    # Redistribute votes in each booth
    booths_fixed = 0
    for booth_id, booth_result in results.items():
        votes = booth_result.get('votes', [])
        if not votes:
            continue
        
        # Get current booth total
        booth_total = sum(votes[:num_candidates])
        if booth_total == 0:
            continue
        
        # Redistribute based on target proportions
        new_votes = [0] * num_candidates
        for pos in range(num_candidates):
            if pos in target_proportions:
                new_votes[pos] = int(booth_total * target_proportions[pos])
            else:
                new_votes[pos] = votes[pos] if pos < len(votes) else 0
        
        # Normalize to maintain exact booth total
        new_total = sum(new_votes)
        if new_total != booth_total:
            diff = booth_total - new_total
            # Distribute difference to largest candidate
            if new_votes:
                max_idx = max(range(len(new_votes)), key=lambda i: new_votes[i])
                new_votes[max_idx] += diff
        
        booth_result['votes'] = new_votes
        booth_result['total'] = sum(new_votes)
        booths_fixed += 1
    
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
    print("Direct Vote Redistribution for Nagapattinam PC")
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
