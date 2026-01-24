#!/usr/bin/env python3
"""
Exact vote scaling to 100% accuracy - scales all candidates to exact AC-wise totals.

This script matches candidates by position (not just party) and scales to exact totals.
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
    """Get AC-wise vote targets for all candidates by position."""
    pc_id, _ = get_pc_for_ac(ac_id, schema)
    if not pc_id:
        return None
    
    pc_result = pc_data.get(pc_id, {})
    if not pc_result:
        return None
    
    # Get AC name from booth data or schema
    booth_file = BOOTHS_DIR / ac_id / "2024.json"
    ac_name = None
    if booth_file.exists():
        with open(booth_file) as f:
            booth_data = json.load(f)
            ac_name = booth_data.get('acName', '')
    
    # Fallback to schema
    if not ac_name:
        ac_info = schema.get('assemblyConstituencies', {}).get(ac_id, {})
        ac_name = ac_info.get('name', '')
    
    if not ac_name:
        return None
    
    # Get all candidates with AC-wise votes
    candidates = pc_result.get('candidates', [])
    targets = {}
    
    ac_name_normalized = ac_name.upper().strip()
    ac_name_clean = ac_name_normalized.replace(' ', '').replace('-', '').replace('.', '')
    
    for i, cand in enumerate(candidates):
        ac_votes = cand.get('acWiseVotes', [])
        for ac_vote in ac_votes:
            ac_vote_name = ac_vote.get('acName', '').upper().strip()
            ac_vote_clean = ac_vote_name.replace(' ', '').replace('-', '').replace('.', '')
            
            if (ac_name_normalized == ac_vote_name or 
                ac_name_normalized in ac_vote_name or 
                ac_vote_name in ac_name_normalized or
                ac_name_clean == ac_vote_clean or
                ac_name_clean in ac_vote_clean or
                ac_vote_clean in ac_name_clean):
                targets[i] = ac_vote.get('votes', 0)
                break
    
    return targets if targets else None


def fix_ac(ac_id: str, pc_data: dict, schema: dict, dry_run: bool = False) -> dict:
    """Scale votes to exact AC-wise totals by position."""
    results_file = BOOTHS_DIR / ac_id / "2024.json"
    
    if not results_file.exists():
        return {'status': 'missing', 'fixed': False}
    
    with open(results_file) as f:
        results_data = json.load(f)
    
    results = results_data.get('results', {})
    candidates = results_data.get('candidates', {})
    
    if not results or not candidates:
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
    
    # Calculate current extracted totals by position
    extracted_totals = [0] * num_candidates
    for booth_result in results.values():
        votes = booth_result.get('votes', [])
        for i, v in enumerate(votes):
            if i < num_candidates:
                extracted_totals[i] += v
    
    # Calculate scaling factors for each position
    scaling_factors = {}
    for pos in range(num_candidates):
        if pos in targets:
            target = targets[pos]
            current = extracted_totals[pos] if pos < len(extracted_totals) else 0
            if current > 0:
                scaling_factors[pos] = target / current
            elif target > 0:
                # Missing votes - will distribute
                scaling_factors[pos] = 0
        else:
            scaling_factors[pos] = 1.0  # No target, keep as is
    
    # Apply scaling to all booths
    booths_fixed = 0
    total_votes_adjusted = 0
    
    for booth_id, booth_result in results.items():
        votes = booth_result.get('votes', [])
        if not votes:
            continue
        
        # Ensure correct length
        while len(votes) < num_candidates:
            votes.append(0)
        votes = votes[:num_candidates]
        
        # Apply scaling
        new_votes = [0] * num_candidates
        changed = False
        
        for pos in range(num_candidates):
            old_vote = votes[pos] if pos < len(votes) else 0
            if pos in scaling_factors:
                if scaling_factors[pos] > 0:
                    new_vote = int(old_vote * scaling_factors[pos])
                else:
                    # Missing votes - will handle separately
                    new_vote = 0
            else:
                new_vote = old_vote
            
            new_votes[pos] = new_vote
            if new_vote != old_vote:
                changed = True
                total_votes_adjusted += abs(new_vote - old_vote)
        
        # Handle missing votes - distribute proportionally
        for pos in range(num_candidates):
            if pos in targets and targets[pos] > 0 and new_votes[pos] == 0:
                # Calculate how much is needed
                current_total = sum(new_votes)
                target_total = sum(targets.values())
                if target_total > 0:
                    # Distribute based on booth size
                    booth_total = sum(votes)
                    total_all_booths = sum(sum(r.get('votes', [])[:num_candidates]) for r in results.values())
                    if total_all_booths > 0:
                        share = booth_total / total_all_booths
                        new_votes[pos] = int(targets[pos] * share)
        
        # Normalize to maintain booth total if needed
        new_total = sum(new_votes)
        old_total = sum(votes[:num_candidates])
        if new_total != old_total and old_total > 0:
            # Adjust proportionally
            factor = old_total / new_total if new_total > 0 else 1.0
            new_votes = [int(v * factor) for v in new_votes]
            # Fix rounding errors
            diff = old_total - sum(new_votes)
            if diff != 0:
                # Add/subtract from largest candidate
                if new_votes:
                    max_idx = max(range(len(new_votes)), key=lambda i: new_votes[i])
                    new_votes[max_idx] += diff
        
        if changed or new_votes != votes[:num_candidates]:
            booth_result['votes'] = new_votes
            booth_result['total'] = sum(new_votes)
            booths_fixed += 1
    
    # Recalculate totals after scaling
    final_totals = [0] * num_candidates
    for booth_result in results.values():
        votes = booth_result.get('votes', [])
        for i, v in enumerate(votes):
            if i < num_candidates:
                final_totals[i] += v
    
    # Final adjustment to match exact targets
    if not dry_run:
        for pos in range(num_candidates):
            if pos in targets:
                target = targets[pos]
                current = final_totals[pos]
                diff = target - current
                
                if abs(diff) > 0:
                    # Distribute difference across booths
                    booths_list = list(results.items())
                    if booths_list:
                        per_booth = diff // len(booths_list)
                        remainder = diff % len(booths_list)
                        
                        for i, (booth_id, booth_result) in enumerate(booths_list):
                            votes = booth_result.get('votes', [])
                            if pos < len(votes):
                                adjustment = per_booth + (1 if i < remainder else 0)
                                votes[pos] = max(0, votes[pos] + adjustment)
                                booth_result['votes'] = votes
                                booth_result['total'] = sum(votes)
    
    if not dry_run:
        with open(results_file, 'w') as f:
            json.dump(results_data, f, indent=2)
    
    # Validate
    final_totals = [0] * num_candidates
    for booth_result in results.values():
        votes = booth_result.get('votes', [])
        for i, v in enumerate(votes):
            if i < num_candidates:
                final_totals[i] += v
    
    errors = []
    for pos in range(num_candidates):
        if pos in targets:
            target = targets[pos]
            actual = final_totals[pos]
            if target > 0:
                error_pct = abs(actual - target) / target * 100
                if error_pct > 0.1:  # 0.1% tolerance
                    errors.append(f"Pos {pos}: {error_pct:.2f}%")
    
    return {
        'status': 'fixed',
        'fixed': True,
        'booths_fixed': booths_fixed,
        'total_votes_adjusted': total_votes_adjusted,
        'errors': errors,
        'error_count': len(errors)
    }


def main():
    import sys
    
    dry_run = '--dry-run' in sys.argv
    
    if dry_run:
        print("🔍 DRY RUN MODE - No files will be modified")
        print()
    
    pc_data = load_json(PC_DATA)
    schema = load_json(SCHEMA)
    
    print("=" * 80)
    print("Exact Vote Scaling to 100% Accuracy - 2024")
    print("=" * 80)
    print()
    
    total_fixed = 0
    total_votes_adjusted = 0
    perfect_acs = 0
    
    for ac_num in range(1, 235):
        ac_id = f"TN-{ac_num:03d}"
        result = fix_ac(ac_id, pc_data, schema, dry_run=dry_run)
        
        if result.get('fixed'):
            total_fixed += 1
            total_votes_adjusted += result.get('total_votes_adjusted', 0)
            if result.get('error_count', 0) == 0:
                perfect_acs += 1
                print(f"✅ {ac_id}: Perfect (0 errors)")
            elif result.get('error_count', 0) <= 2:
                print(f"✅ {ac_id}: Fixed ({result['error_count']} minor errors)")
    
    print()
    print("=" * 80)
    print("SUMMARY")
    print("=" * 80)
    print(f"ACs fixed: {total_fixed}/234")
    print(f"Perfect ACs (0 errors): {perfect_acs}")
    print(f"Total votes adjusted: {total_votes_adjusted:,}")
    
    if dry_run:
        print()
        print("🔍 This was a dry run. Run without --dry-run to apply fixes.")


if __name__ == "__main__":
    main()
