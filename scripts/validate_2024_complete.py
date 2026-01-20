#!/usr/bin/env python3
"""
Complete validation for 2024 PC booth data.
Validates:
1. Vote totals against PC official results
2. Booth coverage (extracted vs expected from booths.json)
3. Booth name/address data quality
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


def validate_ac(ac_id, pc_data, schema):
    """Validate a single AC's data."""
    booths_file = BOOTHS_DIR / ac_id / "booths.json"
    results_file = BOOTHS_DIR / ac_id / "2024.json"
    
    issues = []
    
    # Load booth metadata
    if not booths_file.exists():
        return {'status': 'error', 'issues': ['No booths.json']}
    
    with open(booths_file) as f:
        booths_meta = json.load(f)
    
    expected_booths = booths_meta.get('totalBooths', len(booths_meta.get('booths', [])))
    booth_list = booths_meta.get('booths', [])
    
    # Check booth metadata quality
    booths_with_name = sum(1 for b in booth_list if b.get('name') and len(b['name']) > 5)
    booths_with_address = sum(1 for b in booth_list if b.get('address') and len(b['address']) > 10)
    
    name_coverage = booths_with_name / len(booth_list) * 100 if booth_list else 0
    address_coverage = booths_with_address / len(booth_list) * 100 if booth_list else 0
    
    # Load 2024 results
    if not results_file.exists():
        return {
            'status': 'missing',
            'expected_booths': expected_booths,
            'extracted_booths': 0,
            'name_coverage': name_coverage,
            'address_coverage': address_coverage,
            'issues': ['No 2024.json - needs extraction']
        }
    
    with open(results_file) as f:
        results_data = json.load(f)
    
    results = results_data.get('results', {})
    extracted_booths = len(results)
    
    # Get PC data for validation
    pc_id, pc_name = get_pc_for_ac(ac_id, schema)
    pc_result = pc_data.get(pc_id, {}) if pc_id else {}
    candidates = pc_result.get('candidates', [])
    
    # Calculate vote totals from booths
    num_candidates = len(results_data.get('candidates', []))
    booth_totals = [0] * num_candidates
    total_votes = 0
    
    for booth_id, booth_result in results.items():
        votes = booth_result.get('votes', [])
        total_votes += sum(votes)
        for i, v in enumerate(votes):
            if i < num_candidates:
                booth_totals[i] += v
    
    # Validate against PC results
    vote_errors = []
    if candidates:
        for i in range(min(3, len(candidates), len(booth_totals))):
            official = candidates[i].get('votes', 0)
            extracted = booth_totals[i]
            if official > 0:
                error_pct = abs(extracted - official) / official * 100
                if error_pct > 5:  # More than 5% error
                    vote_errors.append(f"Candidate {i+1}: {extracted:,} vs {official:,} ({error_pct:.1f}% error)")
    
    # Calculate coverage
    coverage_pct = (extracted_booths / expected_booths * 100) if expected_booths > 0 else 0
    
    # Check for booth ID mismatches
    extracted_booth_nos = set()
    for booth_id in results.keys():
        booth_no = booth_id.split('-')[-1]
        extracted_booth_nos.add(booth_no)
    
    expected_booth_nos = set(b.get('boothNo', '') for b in booth_list)
    missing_booths = expected_booth_nos - extracted_booth_nos
    extra_booths = extracted_booth_nos - expected_booth_nos
    
    # Determine status
    if coverage_pct >= 95 and not vote_errors and len(missing_booths) < 5:
        status = 'excellent'
    elif coverage_pct >= 80 and len(vote_errors) <= 1:
        status = 'good'
    elif coverage_pct >= 50:
        status = 'partial'
    else:
        status = 'poor'
    
    if missing_booths and len(missing_booths) < 20:
        issues.append(f"Missing {len(missing_booths)} booths: {sorted(missing_booths)[:5]}...")
    elif missing_booths:
        issues.append(f"Missing {len(missing_booths)} booths")
    
    if extra_booths and len(extra_booths) < 10:
        issues.append(f"Extra {len(extra_booths)} booths not in metadata")
    
    issues.extend(vote_errors)
    
    return {
        'status': status,
        'pc_id': pc_id,
        'pc_name': pc_name,
        'expected_booths': expected_booths,
        'extracted_booths': extracted_booths,
        'coverage_pct': coverage_pct,
        'total_votes': total_votes,
        'name_coverage': name_coverage,
        'address_coverage': address_coverage,
        'missing_booths': len(missing_booths),
        'extra_booths': len(extra_booths),
        'issues': issues
    }


def main():
    pc_data = load_json(PC_DATA)
    schema = load_json(SCHEMA)
    
    print("=" * 80)
    print("2024 PC Booth Data - Complete Validation")
    print("=" * 80)
    
    status_counts = defaultdict(int)
    total_booths = 0
    total_expected = 0
    issues_by_status = defaultdict(list)
    
    # Group by PC for summary
    pc_summary = defaultdict(lambda: {'acs': [], 'booths': 0, 'expected': 0, 'issues': 0})
    
    for ac_num in range(1, 235):
        ac_id = f"TN-{ac_num:03d}"
        result = validate_ac(ac_id, pc_data, schema)
        
        status = result['status']
        status_counts[status] += 1
        
        if result.get('extracted_booths'):
            total_booths += result['extracted_booths']
        if result.get('expected_booths'):
            total_expected += result['expected_booths']
        
        pc_id = result.get('pc_id', 'Unknown')
        pc_summary[pc_id]['acs'].append(ac_id)
        pc_summary[pc_id]['booths'] += result.get('extracted_booths', 0)
        pc_summary[pc_id]['expected'] += result.get('expected_booths', 0)
        pc_summary[pc_id]['name'] = result.get('pc_name', '')
        
        if result['issues']:
            pc_summary[pc_id]['issues'] += 1
            issues_by_status[status].append((ac_id, result))
    
    # Print summary by status
    print(f"\n📊 Status Summary:")
    print(f"   Excellent (≥95% coverage, no errors): {status_counts['excellent']}")
    print(f"   Good (≥80% coverage): {status_counts['good']}")
    print(f"   Partial (≥50% coverage): {status_counts['partial']}")
    print(f"   Poor (<50% coverage): {status_counts['poor']}")
    print(f"   Missing (no 2024.json): {status_counts['missing']}")
    print(f"   Error: {status_counts['error']}")
    
    print(f"\n📈 Totals:")
    print(f"   Total booths extracted: {total_booths:,}")
    print(f"   Total booths expected: {total_expected:,}")
    print(f"   Overall coverage: {total_booths/total_expected*100:.1f}%")
    
    # Print issues by PC
    print(f"\n🔍 Issues by PC:")
    for pc_id in sorted(pc_summary.keys()):
        pc = pc_summary[pc_id]
        if pc['issues'] > 0 or pc['booths'] < pc['expected'] * 0.8:
            coverage = pc['booths'] / pc['expected'] * 100 if pc['expected'] > 0 else 0
            print(f"   {pc_id} ({pc['name']}): {pc['booths']:,}/{pc['expected']:,} booths ({coverage:.0f}%), {pc['issues']} ACs with issues")
    
    # Print detailed issues for poor/missing
    if issues_by_status['poor'] or issues_by_status['missing']:
        print(f"\n❌ ACs Needing Attention:")
        for ac_id, result in issues_by_status['missing'][:10]:
            print(f"   {ac_id}: Missing 2024 data (expected {result['expected_booths']} booths)")
        for ac_id, result in issues_by_status['poor'][:10]:
            print(f"   {ac_id}: {result['extracted_booths']}/{result['expected_booths']} booths ({result['coverage_pct']:.0f}%)")
            for issue in result['issues'][:2]:
                print(f"      - {issue}")
    
    print("\n" + "=" * 80)
    
    return status_counts


if __name__ == "__main__":
    main()
