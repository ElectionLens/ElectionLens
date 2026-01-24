#!/usr/bin/env python3
"""
Validate 2024 booth data against AC-wise totals (more accurate than PC totals).

This validation compares extracted booth totals to AC-wise votes from PC data,
which is the correct comparison since booth data is AC-level, not PC-level.
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


def validate_ac(ac_id, pc_data, schema):
    """Validate AC against AC-wise totals."""
    results_file = BOOTHS_DIR / ac_id / "2024.json"
    
    if not results_file.exists():
        return {'status': 'missing', 'accurate_candidates': 0, 'total_candidates': 0}
    
    with open(results_file) as f:
        results_data = json.load(f)
    
    results = results_data.get('results', {})
    candidates = results_data.get('candidates', [])
    
    if not results or not candidates:
        return {'status': 'empty', 'accurate_candidates': 0, 'total_candidates': 0}
    
    # Get AC-wise targets
    targets = get_ac_wise_targets(ac_id, pc_data, schema)
    if not targets:
        return {'status': 'no_targets', 'accurate_candidates': 0, 'total_candidates': 0}
    
    # Calculate extracted totals
    num_candidates = len(candidates)
    extracted_totals = [0] * num_candidates
    
    for booth_result in results.values():
        votes = booth_result.get('votes', [])
        for i, v in enumerate(votes):
            if i < num_candidates:
                extracted_totals[i] += v
    
    # Compare to targets
    accurate_count = 0
    total_compared = 0
    errors = []
    
    for i, cand in enumerate(candidates):
        party = cand.get('party', '')
        extracted = extracted_totals[i]
        target = targets.get(party, 0)
        
        if target > 0:  # Only compare candidates with AC-wise data
            total_compared += 1
            error_pct = abs(extracted - target) / target * 100 if target > 0 else 100
            
            if error_pct <= 1.0:  # Within 1% is considered accurate
                accurate_count += 1
            else:
                errors.append({
                    'party': party,
                    'extracted': extracted,
                    'target': target,
                    'error_pct': error_pct
                })
    
    # Determine status
    if total_compared == 0:
        status = 'no_comparison'
    elif accurate_count == total_compared:
        status = 'excellent'
    elif accurate_count >= total_compared * 0.9:  # 90%+ accurate
        status = 'good'
    elif accurate_count >= total_compared * 0.7:  # 70%+ accurate
        status = 'acceptable'
    else:
        status = 'poor'
    
    return {
        'status': status,
        'accurate_candidates': accurate_count,
        'total_candidates': total_compared,
        'accuracy_pct': (accurate_count / total_compared * 100) if total_compared > 0 else 0,
        'errors': errors[:5]  # Top 5 errors
    }


def main():
    pc_data = load_json(PC_DATA)
    schema = load_json(SCHEMA)
    
    print("=" * 80)
    print("2024 Booth Data Validation - AC-wise Totals")
    print("=" * 80)
    print("\nValidating extracted booth totals against AC-wise votes from PC data")
    print("(This is the correct comparison since booth data is AC-level)\n")
    
    status_counts = defaultdict(int)
    total_accurate = 0
    total_candidates = 0
    excellent_acs = []
    poor_acs = []
    
    for ac_num in range(1, 235):
        ac_id = f"TN-{ac_num:03d}"
        result = validate_ac(ac_id, pc_data, schema)
        
        status = result['status']
        status_counts[status] += 1
        
        total_accurate += result.get('accurate_candidates', 0)
        total_candidates += result.get('total_candidates', 0)
        
        if status == 'excellent':
            excellent_acs.append(ac_id)
        elif status == 'poor':
            poor_acs.append((ac_id, result))
    
    # Print summary
    print("=" * 80)
    print("VALIDATION SUMMARY")
    print("=" * 80)
    print(f"\n📊 Status Distribution:")
    print(f"   ✅ Excellent (100% accurate): {status_counts['excellent']}")
    print(f"   ✓ Good (≥90% accurate): {status_counts['good']}")
    print(f"   ⚠️  Acceptable (≥70% accurate): {status_counts['acceptable']}")
    print(f"   ❌ Poor (<70% accurate): {status_counts['poor']}")
    print(f"   ❓ No comparison data: {status_counts['no_targets'] + status_counts['no_comparison']}")
    print(f"   ❓ Missing/Empty: {status_counts['missing'] + status_counts['empty']}")
    
    if total_candidates > 0:
        overall_accuracy = (total_accurate / total_candidates * 100)
        print(f"\n📈 Overall Accuracy:")
        print(f"   Accurate candidates: {total_accurate:,}/{total_candidates:,}")
        print(f"   Accuracy rate: {overall_accuracy:.1f}%")
    
    if excellent_acs:
        print(f"\n✅ Excellent ACs (100% accurate): {len(excellent_acs)}")
        print(f"   Examples: {', '.join(excellent_acs[:10])}")
        if len(excellent_acs) > 10:
            print(f"   ... and {len(excellent_acs) - 10} more")
    
    if poor_acs:
        print(f"\n❌ Poor ACs (<70% accurate): {len(poor_acs)}")
        for ac_id, result in poor_acs[:5]:
            print(f"   {ac_id}: {result['accurate_candidates']}/{result['total_candidates']} accurate ({result['accuracy_pct']:.1f}%)")
            for err in result['errors'][:2]:
                print(f"      - {err['party']}: {err['error_pct']:.1f}% error")
    
    print("\n" + "=" * 80)
    
    return {
        'status_counts': dict(status_counts),
        'overall_accuracy': overall_accuracy if total_candidates > 0 else 0,
        'excellent_count': len(excellent_acs)
    }


if __name__ == "__main__":
    main()
