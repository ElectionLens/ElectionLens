#!/usr/bin/env python3
"""
Fix vote misalignment in Nagapattinam PC ACs.

The issue: Votes are in wrong positions, causing NTK to show unusually high booth wins.
This script checks vote totals against AC-wise official data and realigns votes.
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


def find_best_offset(ac_id, results_data, targets, num_candidates):
    """Find best column offset to align votes with targets."""
    if not targets:
        return 0
    
    best_offset = 0
    best_error = float('inf')
    
    # Try offsets from -3 to +3
    for offset in range(-3, 4):
        total_error = 0
        matched = 0
        
        # Calculate extracted totals with this offset
        extracted_totals = [0] * num_candidates
        for booth_result in results_data.get('results', {}).values():
            votes = booth_result.get('votes', [])
            for i in range(num_candidates):
                src_idx = i - offset
                if 0 <= src_idx < len(votes):
                    extracted_totals[i] += votes[src_idx]
        
        # Compare with targets
        for off_idx, target_votes in targets.items():
            if off_idx < len(extracted_totals):
                error = abs(extracted_totals[off_idx] - target_votes)
                total_error += error
                matched += 1
        
        if matched > 0:
            avg_error = total_error / matched
            if avg_error < best_error:
                best_error = avg_error
                best_offset = offset
    
    return best_offset


def apply_offset(ac_id, results_data, offset, num_candidates, dry_run=False):
    """Apply column offset to all booths."""
    results = results_data.get('results', {})
    booths_fixed = 0
    
    for booth_id, booth_result in results.items():
        votes = booth_result.get('votes', [])
        if not votes:
            continue
        
        # Apply offset
        new_votes = [0] * num_candidates
        for i in range(num_candidates):
            src_idx = i - offset
            if 0 <= src_idx < len(votes):
                new_votes[i] = votes[src_idx]
        
        booth_result['votes'] = new_votes
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
    
    # Check NTK position and wins before
    ntk_extracted_idx = None
    for i, cand in enumerate(candidates):
        if cand.get('party', '').upper() == 'NTK':
            ntk_extracted_idx = i
            break
    
    if ntk_extracted_idx is None:
        return {'status': 'no_ntk', 'fixed': False}
    
    booth_wins_before = Counter()
    for booth_result in results.values():
        votes = booth_result.get('votes', [])
        if votes:
            winner_idx = max(range(len(votes)), key=lambda i: votes[i])
            booth_wins_before[winner_idx] += 1
    
    ntk_wins_before = booth_wins_before.get(ntk_extracted_idx, 0)
    total_booths = len(results)
    ntk_win_pct_before = (ntk_wins_before / total_booths * 100) if total_booths > 0 else 0
    
    # Find best offset
    best_offset = find_best_offset(ac_id, data, targets, num_candidates)
    
    if best_offset == 0:
        return {'status': 'no_offset_needed', 'fixed': False, 'ntk_wins': ntk_wins_before}
    
    print(f"  {ac_id}: Applying offset {best_offset}, NTK wins before: {ntk_wins_before}/{total_booths} ({ntk_win_pct_before:.1f}%)")
    
    # Apply offset
    booths_fixed = apply_offset(ac_id, data, best_offset, num_candidates, dry_run)
    
    # Update candidates to match official order
    data['candidates'] = [{'name': c.get('name', ''), 'party': c.get('party', ''), 'symbol': ''} 
                          for c in official_candidates]
    
    if not dry_run:
        with open(results_file, 'w') as f:
            json.dump(data, f, indent=2)
    
    # Check NTK wins after
    booth_wins_after = Counter()
    for booth_result in results.values():
        votes = booth_result.get('votes', [])
        if votes:
            winner_idx = max(range(len(votes)), key=lambda i: votes[i])
            booth_wins_after[winner_idx] += 1
    
    # Find NTK in official position
    ntk_official_idx = None
    for i, cand in enumerate(official_candidates):
        if cand.get('party', '').upper() == 'NTK':
            ntk_official_idx = i
            break
    
    ntk_wins_after = booth_wins_after.get(ntk_official_idx, 0) if ntk_official_idx is not None else 0
    ntk_win_pct_after = (ntk_wins_after / total_booths * 100) if total_booths > 0 else 0
    
    return {
        'status': 'fixed',
        'fixed': True,
        'offset': best_offset,
        'booths_fixed': booths_fixed,
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
    print("Fixing Vote Alignment in Nagapattinam PC")
    print("=" * 80)
    print()
    
    total_fixed = 0
    
    for ac_id in nagapattinam_ac_ids:
        result = fix_ac(ac_id, pc_data, schema, dry_run=dry_run)
        
        if result.get('fixed'):
            total_fixed += 1
            print(f"✅ {ac_id}: Fixed (offset {result['offset']})")
            print(f"   NTK wins: {result['ntk_wins_before']} → {result['ntk_wins_after']} "
                  f"({result['ntk_win_pct_before']:.1f}% → {result['ntk_win_pct_after']:.1f}%)")
            print(f"   Booths fixed: {result['booths_fixed']}")
        elif result.get('status') == 'no_offset_needed':
            print(f"✓ {ac_id}: No offset needed (NTK wins: {result['ntk_wins']})")
    
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
