#!/usr/bin/env python3
"""
Status report for TN 2021 Assembly Constituency (ACS) data.
Analyzes coverage, completeness, and data quality for 2021 election data.
"""

import json
import re
from pathlib import Path
from collections import defaultdict

OUTPUT_BASE = Path("/Users/p0s097d/ElectionLens/public/data/booths/TN")
AC_DATA = Path("/Users/p0s097d/ElectionLens/public/data/elections/ac/TN/2021.json")
SCHEMA = Path("/Users/p0s097d/ElectionLens/public/data/schema.json")


def load_data():
    """Load election data and schema."""
    with open(AC_DATA) as f:
        ac_data = json.load(f)
    with open(SCHEMA) as f:
        schema = json.load(f)
    return ac_data, schema


def get_base_booth_no(booth_no: str) -> int:
    """Extract base booth number from booth identifier."""
    match = re.match(r'^0*(\d+)', str(booth_no))
    return int(match.group(1)) if match else 0


def analyze_ac(ac_id: str, ac_data: dict, schema: dict) -> dict:
    """Analyze a single AC's 2021 data."""
    official = ac_data.get(ac_id, {})
    
    if not official:
        return {
            'ac_id': ac_id,
            'status': 'no_official_data',
            'has_file': False
        }
    
    results_file = OUTPUT_BASE / ac_id / "2021.json"
    booths_file = OUTPUT_BASE / ac_id / "booths.json"
    
    has_file = results_file.exists()
    
    if not has_file:
        return {
            'ac_id': ac_id,
            'status': 'missing_file',
            'has_file': False,
            'official_votes': official.get('validVotes', 0),
            'official_candidates': len(official.get('candidates', []))
        }
    
    # Load extracted data
    with open(results_file) as f:
        extracted_data = json.load(f)
    
    results = extracted_data.get('results', {})
    extracted_candidates = extracted_data.get('candidates', [])
    official_candidates = official.get('candidates', [])
    
    # Count extracted booths
    extracted_booths = len(set(get_base_booth_no(k.split('-')[-1]) for k in results.keys()))
    
    # Expected booths from booths.json
    expected_booths = 0
    if booths_file.exists():
        with open(booths_file) as f:
            booths_meta = json.load(f)
        expected_booths = len(set(get_base_booth_no(b['boothNo']) for b in booths_meta.get('booths', [])))
    
    # Calculate vote totals from extracted data
    num_cands = len(extracted_candidates)
    extracted_totals = [0] * num_cands
    for r in results.values():
        votes = r.get('votes', [])
        for i, v in enumerate(votes):
            if i < num_cands:
                extracted_totals[i] += v
    
    # Check for column offset (col0 > 2x col1)
    col0 = extracted_totals[0] if extracted_totals else 0
    col1 = extracted_totals[1] if len(extracted_totals) > 1 else 1
    has_offset = col0 > col1 * 2 and col0 > 50000
    
    # Compare with official totals
    official_totals = [c.get('votes', 0) for c in official_candidates]
    
    # Match candidates and calculate errors
    errors = []
    max_compare = min(len(official_totals), len(extracted_totals))
    
    for i in range(max_compare):
        official_val = official_totals[i]
        # Adjust index if offset detected
        extracted_idx = i + 1 if has_offset and i == 0 else i
        extracted_val = extracted_totals[extracted_idx] if extracted_idx < len(extracted_totals) else 0
        
        if official_val > 1000:  # Only compare significant vote counts
            err = abs(official_val - extracted_val) / official_val * 100 if official_val > 0 else 100
            errors.append({
                'idx': i,
                'name': official_candidates[i].get('name', '?'),
                'party': official_candidates[i].get('party', '?'),
                'official': official_val,
                'extracted': extracted_val,
                'diff': extracted_val - official_val,
                'error': err
            })
    
    avg_error = sum(e['error'] for e in errors) / len(errors) if errors else 100
    
    # Calculate coverage
    booth_coverage = (extracted_booths / expected_booths * 100) if expected_booths > 0 else 0
    
    # Total votes comparison
    official_total = official.get('validVotes', 0)
    extracted_total = sum(extracted_totals)
    vote_coverage = (extracted_total / official_total * 100) if official_total > 0 else 0
    
    # Categorize status
    status = categorize_status(avg_error, booth_coverage, vote_coverage, has_offset, extracted_booths, expected_booths)
    
    return {
        'ac_id': ac_id,
        'ac_name': official.get('constituencyName', ac_id),
        'status': status,
        'has_file': True,
        'extracted_booths': extracted_booths,
        'expected_booths': expected_booths,
        'booth_coverage': booth_coverage,
        'official_votes': official_total,
        'extracted_votes': extracted_total,
        'vote_coverage': vote_coverage,
        'avg_error': avg_error,
        'has_offset': has_offset,
        'errors': errors,
        'num_candidates': len(extracted_candidates),
        'official_candidates': len(official_candidates)
    }


def categorize_status(avg_error, booth_coverage, vote_coverage, has_offset, extracted_booths, expected_booths):
    """Categorize AC status based on data quality."""
    if has_offset:
        return 'COLUMN_OFFSET'
    elif avg_error < 5 and booth_coverage >= 95:
        return 'EXCELLENT'
    elif avg_error < 10 and booth_coverage >= 80:
        return 'GOOD'
    elif avg_error < 20 and booth_coverage >= 50:
        return 'PARTIAL'
    elif extracted_booths == 0:
        return 'EMPTY'
    elif booth_coverage < 50:
        return 'POOR'
    else:
        return 'NEEDS_REVIEW'


def main():
    print("=" * 80)
    print("TN 2021 ASSEMBLY CONSTITUENCY (ACS) DATA STATUS")
    print("=" * 80)
    print()
    
    ac_data, schema = load_data()
    
    # Get all TN ACs from schema
    all_acs = [ac_id for ac_id in schema.get('assemblyConstituencies', {}).keys() if ac_id.startswith('TN-')]
    all_acs.sort(key=lambda x: int(x.split('-')[1]))
    
    results = []
    status_counts = defaultdict(int)
    
    for ac_id in all_acs:
        result = analyze_ac(ac_id, ac_data, schema)
        results.append(result)
        status_counts[result['status']] += 1
    
    # Group by status
    by_status = defaultdict(list)
    for r in results:
        by_status[r['status']].append(r)
    
    # Print summary by status
    status_order = ['EXCELLENT', 'GOOD', 'PARTIAL', 'POOR', 'COLUMN_OFFSET', 'NEEDS_REVIEW', 'EMPTY', 'missing_file', 'no_official_data']
    
    for status in status_order:
        if status in by_status:
            items = by_status[status]
            print(f"\n{'=' * 80}")
            print(f"{status}: {len(items)} ACs")
            print("=" * 80)
            
            # Sort by coverage or error
            if status in ['EXCELLENT', 'GOOD', 'PARTIAL', 'POOR']:
                items.sort(key=lambda x: (x.get('booth_coverage', 0), -x.get('avg_error', 100)))
            elif status == 'COLUMN_OFFSET':
                items.sort(key=lambda x: x.get('ac_id', ''))
            else:
                items.sort(key=lambda x: x.get('ac_id', ''))
            
            for r in items[:20]:  # Show top 20
                if r.get('has_file'):
                    booth_info = f"{r.get('extracted_booths', 0)}/{r.get('expected_booths', 0)} booths ({r.get('booth_coverage', 0):.1f}%)"
                    vote_info = f"{r.get('extracted_votes', 0):,}/{r.get('official_votes', 0):,} votes ({r.get('vote_coverage', 0):.1f}%)"
                    error_info = f"error: {r.get('avg_error', 0):.1f}%"
                    offset_info = " [OFFSET]" if r.get('has_offset') else ""
                    print(f"  {r['ac_id']} {r.get('ac_name', '')}: {booth_info}, {vote_info}, {error_info}{offset_info}")
                else:
                    print(f"  {r['ac_id']}: No 2021.json file")
            
            if len(items) > 20:
                print(f"  ... and {len(items) - 20} more")
    
    # Overall statistics
    print(f"\n{'=' * 80}")
    print("OVERALL SUMMARY")
    print("=" * 80)
    
    total_acs = len(all_acs)
    acs_with_files = sum(1 for r in results if r.get('has_file'))
    acs_with_data = sum(1 for r in results if r.get('has_file') and r.get('extracted_booths', 0) > 0)
    
    print(f"\nTotal ACs in schema: {total_acs}")
    print(f"ACs with 2021.json files: {acs_with_files} ({acs_with_files/total_acs*100:.1f}%)")
    print(f"ACs with extracted data: {acs_with_data} ({acs_with_data/total_acs*100:.1f}%)")
    
    # Calculate totals
    total_extracted_booths = sum(r.get('extracted_booths', 0) for r in results)
    total_expected_booths = sum(r.get('expected_booths', 0) for r in results)
    total_official_votes = sum(r.get('official_votes', 0) for r in results)
    total_extracted_votes = sum(r.get('extracted_votes', 0) for r in results)
    
    print(f"\nBooth Coverage:")
    print(f"  Extracted: {total_extracted_booths:,}")
    print(f"  Expected:  {total_expected_booths:,}")
    if total_expected_booths > 0:
        print(f"  Coverage:  {total_extracted_booths/total_expected_booths*100:.1f}%")
    
    print(f"\nVote Coverage:")
    print(f"  Extracted: {total_extracted_votes:,}")
    print(f"  Official:  {total_official_votes:,}")
    if total_official_votes > 0:
        print(f"  Coverage:  {total_extracted_votes/total_official_votes*100:.1f}%")
    
    # Status breakdown
    print(f"\nStatus Breakdown:")
    for status in status_order:
        if status in status_counts:
            count = status_counts[status]
            pct = count / total_acs * 100
            print(f"  {status:20s}: {count:3d} ACs ({pct:5.1f}%)")
    
    # ACs needing attention
    print(f"\n{'=' * 80}")
    print("ACs NEEDING ATTENTION")
    print("=" * 80)
    
    problem_acs = []
    for r in results:
        if r.get('has_file'):
            if r.get('has_offset'):
                problem_acs.append({
                    'ac_id': r['ac_id'],
                    'issue': 'column_offset',
                    'priority': 1
                })
            elif r.get('booth_coverage', 0) < 80 and r.get('expected_booths', 0) > 0:
                gap = r.get('expected_booths', 0) - r.get('extracted_booths', 0)
                problem_acs.append({
                    'ac_id': r['ac_id'],
                    'issue': 'missing_booths',
                    'gap': gap,
                    'coverage': r.get('booth_coverage', 0),
                    'priority': 2
                })
            elif r.get('avg_error', 100) > 20:
                problem_acs.append({
                    'ac_id': r['ac_id'],
                    'issue': 'high_error',
                    'error': r.get('avg_error', 0),
                    'priority': 3
                })
        else:
            problem_acs.append({
                'ac_id': r['ac_id'],
                'issue': 'missing_file',
                'priority': 4
            })
    
    problem_acs.sort(key=lambda x: (x['priority'], -x.get('gap', 0), -x.get('error', 0)))
    
    print("\nColumn Offset Issues (Priority 1):")
    offset_acs = [p for p in problem_acs if p['issue'] == 'column_offset']
    for a in offset_acs[:10]:
        print(f"  {a['ac_id']}")
    
    print("\nMissing Booths (Priority 2):")
    missing_acs = [p for p in problem_acs if p['issue'] == 'missing_booths']
    for a in missing_acs[:15]:
        print(f"  {a['ac_id']}: {a.get('gap', 0)} booths missing ({a.get('coverage', 0):.1f}% coverage)")
    
    print("\nHigh Error Rate (Priority 3):")
    error_acs = [p for p in problem_acs if p['issue'] == 'high_error']
    for a in error_acs[:10]:
        print(f"  {a['ac_id']}: {a.get('error', 0):.1f}% error")
    
    print("\nMissing Files (Priority 4):")
    file_acs = [p for p in problem_acs if p['issue'] == 'missing_file']
    print(f"  {len(file_acs)} ACs missing 2021.json files")
    if len(file_acs) <= 20:
        for a in file_acs:
            print(f"    {a['ac_id']}")
    else:
        for a in file_acs[:10]:
            print(f"    {a['ac_id']}")
        print(f"    ... and {len(file_acs) - 10} more")


if __name__ == "__main__":
    main()
