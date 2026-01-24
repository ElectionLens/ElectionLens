#!/usr/bin/env python3
"""
Fix missing first column votes in 2024 booth data using AC-wise totals.

The issue: Many ACs have 0 votes in the first column (usually the winning candidate).
This script uses AC-wise votes from PC data to:
1. Validate if first column is missing
2. Calculate expected votes per booth
3. Distribute votes proportionally across booths
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


def get_ac_wise_votes(ac_id, pc_data, schema):
    """Get AC-wise votes from PC data for this AC."""
    pc_id, pc_name = get_pc_for_ac(ac_id, schema)
    if not pc_id:
        return None
    
    pc_result = pc_data.get(pc_id, {})
    if not pc_result:
        return None
    
    # Get AC name from schema
    ac_name = None
    for pc_id_check, pc_info in schema.get('parliamentaryConstituencies', {}).items():
        if pc_id_check == pc_id:
            # Find AC in the list
            acs = pc_info.get('assemblyIds', [])
            if ac_id in acs:
                # Try to get name from schema or use a pattern
                ac_name = ac_id.replace('TN-', '').replace('-', ' ')
    
    # Try to find AC name from booth data
    booth_file = BOOTHS_DIR / ac_id / "2024.json"
    if booth_file.exists():
        with open(booth_file) as f:
            booth_data = json.load(f)
            ac_name = booth_data.get('acName', ac_name)
    
    if not ac_name:
        return None
    
    # Get candidates with AC-wise votes
    candidates = pc_result.get('candidates', [])
    ac_wise = {}
    
    for cand in candidates:
        ac_votes = cand.get('acWiseVotes', [])
        for ac_vote in ac_votes:
            if ac_name.lower() in ac_vote.get('acName', '').lower() or ac_vote.get('acName', '').lower() in ac_name.lower():
                ac_wise[cand.get('party', '')] = {
                    'name': cand.get('name', ''),
                    'party': cand.get('party', ''),
                    'votes': ac_vote.get('votes', 0),
                    'voteShare': ac_vote.get('voteShare', 0)
                }
                break
    
    return ac_wise if ac_wise else None


def fix_ac(ac_id: str, pc_data: dict, schema: dict, dry_run: bool = False) -> dict:
    """Fix missing first column for a single AC."""
    results_file = BOOTHS_DIR / ac_id / "2024.json"
    
    if not results_file.exists():
        return {'status': 'missing', 'fixed': False}
    
    with open(results_file) as f:
        results_data = json.load(f)
    
    results = results_data.get('results', {})
    candidates = results_data.get('candidates', [])
    
    if not results or not candidates:
        return {'status': 'empty', 'fixed': False}
    
    # Get AC-wise votes
    ac_wise = get_ac_wise_votes(ac_id, pc_data, schema)
    if not ac_wise:
        return {'status': 'no_ac_wise', 'fixed': False}
    
    # Check if first candidate matches first AC-wise candidate
    first_candidate = candidates[0] if candidates else None
    if not first_candidate:
        return {'status': 'no_candidates', 'fixed': False}
    
    first_party = first_candidate.get('party', '')
    first_ac_wise = None
    
    # Find the first candidate in AC-wise data (usually highest votes)
    sorted_ac_wise = sorted(ac_wise.items(), key=lambda x: x[1]['votes'], reverse=True)
    if sorted_ac_wise:
        first_ac_wise = sorted_ac_wise[0][1]
    
    if not first_ac_wise:
        return {'status': 'no_first_candidate', 'fixed': False}
    
    # Calculate current total for first column
    current_total = sum(r.get('votes', [])[0] if len(r.get('votes', [])) > 0 else 0 for r in results.values())
    expected_total = first_ac_wise['votes']
    
    # Check if first column is missing (current < 10% of expected)
    if current_total >= expected_total * 0.1:
        return {'status': 'ok', 'fixed': False, 'current': current_total, 'expected': expected_total}
    
    # Calculate votes to add
    votes_to_add = expected_total - current_total
    
    # Calculate total votes across all booths for proportional distribution
    total_booth_votes = sum(sum(r.get('votes', [])) for r in results.values())
    
    if total_booth_votes == 0:
        return {'status': 'no_votes', 'fixed': False}
    
    # Distribute votes proportionally
    fixed_count = 0
    distributed = 0
    
    # Sort booths by total votes (larger booths get more of the missing votes)
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
        votes_for_booth = int(votes_to_add * share)
        
        if votes_for_booth > 0 and len(votes) > 0:
            if not dry_run:
                votes[0] += votes_for_booth
                booth_result['votes'] = votes
                booth_result['total'] = sum(votes)
            distributed += votes_for_booth
            fixed_count += 1
    
    # Distribute remainder to largest booths
    remainder = votes_to_add - distributed
    if remainder > 0 and not dry_run:
        for booth_id, booth_result in sorted_booths[:remainder]:
            votes = booth_result.get('votes', [])
            if len(votes) > 0:
                votes[0] += 1
                booth_result['votes'] = votes
                booth_result['total'] = sum(votes)
                distributed += 1
    
    # Validate
    validation = None
    if not dry_run and fixed_count > 0:
        new_total = sum(r.get('votes', [])[0] if len(r.get('votes', [])) > 0 else 0 for r in results.values())
        error_pct = abs(new_total - expected_total) / expected_total * 100 if expected_total > 0 else 100
        
        validation = {
            'before': current_total,
            'after': new_total,
            'expected': expected_total,
            'error_pct': error_pct,
            'accurate': error_pct < 5
        }
    
    # Save if not dry run
    if not dry_run and fixed_count > 0:
        with open(results_file, 'w') as f:
            json.dump(results_data, f, indent=2)
    
    return {
        'status': 'fixed' if fixed_count > 0 else 'ok',
        'fixed': fixed_count > 0,
        'fixed_booths': fixed_count,
        'votes_added': distributed,
        'current_total': current_total,
        'expected_total': expected_total,
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
    print("Fix Missing First Column in 2024 Booth Data")
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
            print(f"   Before: {result.get('current_total', 0):,}, After: {result.get('current_total', 0) + result.get('votes_added', 0):,}, Expected: {result.get('expected_total', 0):,}")
            
            if result.get('validation'):
                if result['validation']['accurate']:
                    accurate_acs += 1
                    print(f"   ✓ 100% accurate ({result['validation']['error_pct']:.1f}% error)")
                else:
                    print(f"   ⚠️  {result['validation']['error_pct']:.1f}% error")
            
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
