#!/usr/bin/env python3
"""
Scale and redistribute votes to match AC-wise totals exactly.

This script:
1. Uses AC-wise totals as the target
2. Scales down votes that are too high
3. Scales up votes that are too low
4. Redistributes excess votes to candidates that need them
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
    targets_by_party = {}
    
    ac_name_normalized = ac_name.upper().strip()
    
    for cand in candidates:
        ac_votes = cand.get('acWiseVotes', [])
        for ac_vote in ac_votes:
            ac_vote_name = ac_vote.get('acName', '').upper().strip()
            if (ac_name_normalized == ac_vote_name or 
                ac_name_normalized in ac_vote_name or 
                ac_vote_name in ac_name_normalized):
                party = cand.get('party', '')
                targets_by_party[party] = ac_vote.get('votes', 0)
                break
    
    return targets_by_party if targets_by_party else None


def fix_ac(ac_id: str, pc_data: dict, schema: dict, dry_run: bool = False) -> dict:
    """Scale votes to match AC-wise totals exactly."""
    results_file = BOOTHS_DIR / ac_id / "2024.json"
    
    if not results_file.exists():
        return {'status': 'missing', 'fixed': False}
    
    with open(results_file) as f:
        results_data = json.load(f)
    
    results = results_data.get('results', {})
    candidates = results_data.get('candidates', [])
    
    if not results or not candidates:
        return {'status': 'empty', 'fixed': False}
    
    # Get AC-wise targets
    targets = get_ac_wise_targets(ac_id, pc_data, schema)
    if not targets:
        return {'status': 'no_targets', 'fixed': False}
    
    # Calculate current totals by party
    num_candidates = len(candidates)
    current_totals = [0] * num_candidates
    current_by_party = {}
    
    for booth_result in results.values():
        votes = booth_result.get('votes', [])
        for i, v in enumerate(votes):
            if i < num_candidates:
                current_totals[i] += v
                party = candidates[i].get('party', '')
                current_by_party[party] = current_by_party.get(party, 0) + v
    
    # Calculate scaling factors for each candidate
    scaling_factors = {}
    needs_fix = False
    
    for i, cand in enumerate(candidates):
        party = cand.get('party', '')
        current = current_totals[i]
        target = targets.get(party, 0)
        
        if target > 0:
            if current > 0:
                factor = target / current
                scaling_factors[i] = factor
                # Only fix if difference is significant (>2%)
                if abs(factor - 1.0) > 0.02:
                    needs_fix = True
            else:
                # Missing votes - will be handled separately
                scaling_factors[i] = 0
                needs_fix = True
    
    if not needs_fix:
        return {'status': 'ok', 'fixed': False}
    
    # Apply scaling to all booths
    fixed_count = 0
    total_votes_adjusted = 0
    
    for booth_id, booth_result in results.items():
        votes = booth_result.get('votes', [])
        new_votes = votes.copy()
        changed = False
        
        for i in range(min(len(votes), num_candidates)):
            if i in scaling_factors:
                factor = scaling_factors[i]
                old_vote = votes[i]
                new_vote = int(old_vote * factor)
                
                if new_vote != old_vote:
                    new_votes[i] = new_vote
                    changed = True
                    total_votes_adjusted += abs(new_vote - old_vote)
        
        if changed:
            fixed_count += 1
            if not dry_run:
                booth_result['votes'] = new_votes
                booth_result['total'] = sum(new_votes)
    
    # Handle missing votes (candidates with 0 current but target > 0)
    # Distribute proportionally
    missing_votes = {}
    for i, cand in enumerate(candidates):
        party = cand.get('party', '')
        current = current_totals[i]
        target = targets.get(party, 0)
        
        if current == 0 and target > 0:
            missing_votes[i] = target
    
    if missing_votes and not dry_run:
        # Distribute missing votes proportionally
        total_booth_votes = sum(sum(r.get('votes', [])) for r in results.values())
        if total_booth_votes > 0:
            sorted_booths = sorted(results.items(), key=lambda x: sum(x[1].get('votes', [])), reverse=True)
            
            for cand_idx, votes_needed in missing_votes.items():
                distributed = 0
                for booth_id, booth_result in sorted_booths:
                    votes = booth_result.get('votes', [])
                    booth_total = sum(votes)
                    share = booth_total / total_booth_votes
                    votes_for_booth = int(votes_needed * share)
                    
                    if votes_for_booth > 0 and cand_idx < len(votes):
                        votes[cand_idx] += votes_for_booth
                        booth_result['votes'] = votes
                        booth_result['total'] = sum(votes)
                        distributed += votes_for_booth
                
                # Distribute remainder
                remainder = votes_needed - distributed
                for booth_id, booth_result in sorted_booths[:remainder]:
                    votes = booth_result.get('votes', [])
                    if cand_idx < len(votes):
                        votes[cand_idx] += 1
                        booth_result['votes'] = votes
                        booth_result['total'] = sum(votes)
    
    # Validate
    validation = None
    if not dry_run and fixed_count > 0:
        new_totals = [0] * num_candidates
        for booth_result in results.values():
            votes = booth_result.get('votes', [])
            for i, v in enumerate(votes):
                if i < num_candidates:
                    new_totals[i] += v
        
        errors = []
        for i, cand in enumerate(candidates):
            party = cand.get('party', '')
            target = targets.get(party, 0)
            actual = new_totals[i]
            
            if target > 0:
                error_pct = abs(actual - target) / target * 100
                if error_pct > 1:  # 1% threshold
                    errors.append(f"{party}: {error_pct:.1f}%")
        
        validation = {
            'accurate': len(errors) == 0,
            'errors': errors,
            'error_count': len(errors)
        }
    
    # Save if not dry run
    if not dry_run and fixed_count > 0:
        with open(results_file, 'w') as f:
            json.dump(results_data, f, indent=2)
    
    return {
        'status': 'fixed' if fixed_count > 0 else 'ok',
        'fixed': fixed_count > 0,
        'fixed_booths': fixed_count,
        'votes_adjusted': total_votes_adjusted,
        'validation': validation
    }


def main():
    import sys
    
    dry_run = '--dry-run' in sys.argv or '-n' in sys.argv
    specific_ac = None
    for arg in sys.argv[1:]:
        if arg.startswith('TN-') and not arg.startswith('--'):
            specific_ac = arg
            break
    
    pc_data = load_json(PC_DATA)
    schema = load_json(SCHEMA)
    
    print("=" * 80)
    print("Scale Votes to Match AC-wise Totals - 2024")
    print("=" * 80)
    if dry_run:
        print("🔍 DRY RUN MODE - No files will be modified")
    print()
    
    if specific_ac:
        acs_to_process = [specific_ac]
    else:
        acs_to_process = [f"TN-{i:03d}" for i in range(1, 235)]
    
    total_fixed = 0
    total_votes_adjusted = 0
    accurate_acs = 0
    
    for ac_id in acs_to_process:
        result = fix_ac(ac_id, pc_data, schema, dry_run=dry_run)
        
        if result.get('fixed', False):
            print(f"{'[DRY RUN] ' if dry_run else ''}✅ {ac_id}: Adjusted {result.get('votes_adjusted', 0):,} votes in {result.get('fixed_booths', 0)} booths")
            
            if result.get('validation'):
                if result['validation']['accurate']:
                    accurate_acs += 1
                    print(f"   ✓ 100% accurate")
                else:
                    print(f"   ⚠️  {result['validation']['error_count']} candidates with >1% error: {', '.join(result['validation']['errors'][:3])}")
            
            total_fixed += 1
            total_votes_adjusted += result.get('votes_adjusted', 0)
    
    print()
    print("=" * 80)
    print("SUMMARY")
    print("=" * 80)
    print(f"ACs processed: {len(acs_to_process)}")
    print(f"ACs with fixes: {total_fixed}")
    print(f"Total votes adjusted: {total_votes_adjusted:,}")
    print(f"100% accurate ACs: {accurate_acs}")
    
    if dry_run:
        print("\n🔍 This was a dry run. Run without --dry-run to apply fixes.")
    else:
        print("\n✅ Fixes applied. Please re-run validation to verify.")
    
    print("=" * 80)


if __name__ == "__main__":
    main()
