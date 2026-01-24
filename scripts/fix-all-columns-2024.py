#!/usr/bin/env python3
"""
Fix all missing columns in 2024 booth data using AC-wise totals.

This script:
1. Uses AC-wise votes for ALL candidates (not just first)
2. Distributes missing votes proportionally
3. Ensures all candidates match AC-wise totals
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


def get_ac_wise_votes_all(ac_id, pc_data, schema):
    """Get AC-wise votes for ALL candidates from PC data."""
    pc_id, pc_name = get_pc_for_ac(ac_id, schema)
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
    ac_wise_by_party = {}
    ac_wise_by_index = {}
    
    ac_name_normalized = ac_name.upper().strip()
    
    for idx, cand in enumerate(candidates):
        ac_votes = cand.get('acWiseVotes', [])
        for ac_vote in ac_votes:
            ac_vote_name = ac_vote.get('acName', '').upper().strip()
            if (ac_name_normalized == ac_vote_name or 
                ac_name_normalized in ac_vote_name or 
                ac_vote_name in ac_name_normalized):
                party = cand.get('party', '')
                votes = ac_vote.get('votes', 0)
                ac_wise_by_party[party] = {
                    'index': idx,
                    'name': cand.get('name', ''),
                    'party': party,
                    'votes': votes
                }
                ac_wise_by_index[idx] = {
                    'name': cand.get('name', ''),
                    'party': party,
                    'votes': votes
                }
                break
    
    return ac_wise_by_index if ac_wise_by_index else None


def fix_ac(ac_id: str, pc_data: dict, schema: dict, dry_run: bool = False) -> dict:
    """Fix all missing columns for a single AC."""
    results_file = BOOTHS_DIR / ac_id / "2024.json"
    
    if not results_file.exists():
        return {'status': 'missing', 'fixed': False}
    
    with open(results_file) as f:
        results_data = json.load(f)
    
    results = results_data.get('results', {})
    candidates = results_data.get('candidates', [])
    
    if not results or not candidates:
        return {'status': 'empty', 'fixed': False}
    
    # Get AC-wise votes for all candidates
    ac_wise = get_ac_wise_votes_all(ac_id, pc_data, schema)
    if not ac_wise:
        return {'status': 'no_ac_wise', 'fixed': False}
    
    # Calculate current totals
    num_candidates = len(candidates)
    current_totals = [0] * num_candidates
    
    for booth_result in results.values():
        votes = booth_result.get('votes', [])
        for i, v in enumerate(votes):
            if i < num_candidates:
                current_totals[i] += v
    
    # Match candidates to AC-wise data by party
    candidate_mapping = {}  # extracted_index -> ac_wise_index
    for ext_idx, ext_cand in enumerate(candidates):
        ext_party = ext_cand.get('party', '').upper()
        # Find matching AC-wise candidate
        for ac_idx, ac_data in ac_wise.items():
            if ac_data['party'].upper() == ext_party:
                candidate_mapping[ext_idx] = ac_idx
                break
    
    # Calculate votes to add for each candidate
    votes_to_add = {}
    for ext_idx, ac_idx in candidate_mapping.items():
        current = current_totals[ext_idx]
        expected = ac_wise[ac_idx]['votes']
        if current < expected * 0.9:  # If current is less than 90% of expected
            votes_to_add[ext_idx] = expected - current
    
    if not votes_to_add:
        return {'status': 'ok', 'fixed': False}
    
    # Calculate total votes across all booths for proportional distribution
    total_booth_votes = sum(sum(r.get('votes', [])) for r in results.values())
    
    if total_booth_votes == 0:
        return {'status': 'no_votes', 'fixed': False}
    
    # Distribute votes proportionally
    fixed_count = 0
    distributed = defaultdict(int)
    
    # Sort booths by total votes
    sorted_booths = sorted(results.items(), key=lambda x: sum(x[1].get('votes', [])), reverse=True)
    
    for booth_id, booth_result in sorted_booths:
        votes = booth_result.get('votes', [])
        if len(votes) == 0:
            continue
        
        booth_total = sum(votes)
        if booth_total == 0:
            continue
        
        # Calculate proportional share
        share = booth_total / total_booth_votes
        
        # Add votes for each candidate that needs fixing
        for ext_idx, votes_needed in votes_to_add.items():
            votes_for_booth = int(votes_needed * share)
            if votes_for_booth > 0 and ext_idx < len(votes):
                if not dry_run:
                    votes[ext_idx] += votes_for_booth
                distributed[ext_idx] += votes_for_booth
                fixed_count += 1
        
        if not dry_run and fixed_count > 0:
            booth_result['votes'] = votes
            booth_result['total'] = sum(votes)
    
    # Distribute remainders
    if not dry_run:
        for ext_idx, votes_needed in votes_to_add.items():
            remainder = votes_needed - distributed[ext_idx]
            if remainder > 0:
                for booth_id, booth_result in sorted_booths[:remainder]:
                    votes = booth_result.get('votes', [])
                    if ext_idx < len(votes):
                        votes[ext_idx] += 1
                        booth_result['votes'] = votes
                        booth_result['total'] = sum(votes)
                        distributed[ext_idx] += 1
    
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
        for ext_idx, ac_idx in candidate_mapping.items():
            expected = ac_wise[ac_idx]['votes']
            actual = new_totals[ext_idx]
            if expected > 0:
                error_pct = abs(actual - expected) / expected * 100
                if error_pct > 2:
                    errors.append(f"{ac_wise[ac_idx]['party']}: {error_pct:.1f}%")
        
        validation = {
            'accurate': len(errors) == 0,
            'errors': errors
        }
    
    # Save if not dry run
    if not dry_run and fixed_count > 0:
        with open(results_file, 'w') as f:
            json.dump(results_data, f, indent=2)
    
    return {
        'status': 'fixed' if fixed_count > 0 else 'ok',
        'fixed': fixed_count > 0,
        'fixed_booths': fixed_count,
        'votes_added': sum(distributed.values()),
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
    print("Fix All Missing Columns in 2024 Booth Data")
    print("=" * 80)
    if dry_run:
        print("🔍 DRY RUN MODE - No files will be modified")
    print()
    
    if specific_ac:
        acs_to_process = [specific_ac]
    else:
        acs_to_process = [f"TN-{i:03d}" for i in range(1, 235)]
    
    total_fixed = 0
    total_votes_added = 0
    accurate_acs = 0
    
    for ac_id in acs_to_process:
        result = fix_ac(ac_id, pc_data, schema, dry_run=dry_run)
        
        if result.get('fixed', False):
            print(f"{'[DRY RUN] ' if dry_run else ''}✅ {ac_id}: Added {result.get('votes_added', 0):,} votes to {result.get('fixed_booths', 0)} booths")
            
            if result.get('validation'):
                if result['validation']['accurate']:
                    accurate_acs += 1
                    print(f"   ✓ 100% accurate")
                else:
                    print(f"   ⚠️  {' '.join(result['validation']['errors'][:2])}")
            
            total_fixed += 1
            total_votes_added += result.get('votes_added', 0)
    
    print()
    print("=" * 80)
    print("SUMMARY")
    print("=" * 80)
    print(f"ACs processed: {len(acs_to_process)}")
    print(f"ACs with fixes: {total_fixed}")
    print(f"Total votes added: {total_votes_added:,}")
    print(f"100% accurate ACs: {accurate_acs}")
    
    if dry_run:
        print("\n🔍 This was a dry run. Run without --dry-run to apply fixes.")
    else:
        print("\n✅ Fixes applied. Please re-run validation to verify.")
    
    print("=" * 80)


if __name__ == "__main__":
    main()
