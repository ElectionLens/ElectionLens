#!/usr/bin/env python3
"""
Comprehensive status report for TN 2024 booth data extraction.
Categorizes issues and calculates actual data coverage.
"""

import json
import re
from pathlib import Path

OUTPUT_BASE = Path("/Users/p0s097d/ElectionLens/public/data/booths/TN")
PC_DATA = Path("/Users/p0s097d/ElectionLens/public/data/elections/pc/TN/2024.json")
SCHEMA = Path("/Users/p0s097d/ElectionLens/public/data/schema.json")


def load_data():
    with open(PC_DATA) as f:
        pc_data = json.load(f)
    with open(SCHEMA) as f:
        schema = json.load(f)
    return pc_data, schema


def get_base_booth_no(booth_no: str) -> int:
    match = re.match(r'^0*(\d+)', str(booth_no))
    return int(match.group(1)) if match else 0


def analyze_pc(pc_id: str, pc_data: dict, schema: dict) -> dict:
    """Comprehensive analysis of a PC."""
    pc_info = schema.get('parliamentaryConstituencies', {}).get(pc_id, {})
    ac_ids = pc_info.get('assemblyIds', [])
    
    official = pc_data.get(pc_id, {})
    official_cands = official.get('candidates', [])
    
    if not ac_ids or not official_cands:
        return None
    
    # Collect AC-level stats
    ac_stats = []
    pc_totals = [0] * len(official_cands)
    total_booths = 0
    total_expected = 0
    
    for ac_id in ac_ids:
        results_file = OUTPUT_BASE / ac_id / "2024.json"
        booths_file = OUTPUT_BASE / ac_id / "booths.json"
        
        if not results_file.exists():
            ac_stats.append({'ac_id': ac_id, 'status': 'no_data'})
            continue
        
        with open(results_file) as f:
            data = json.load(f)
        
        results = data.get('results', {})
        num_cands = len(data.get('candidates', []))
        
        # Calculate totals
        totals = [0] * num_cands
        for r in results.values():
            for i, v in enumerate(r.get('votes', [])):
                if i < num_cands:
                    totals[i] += v
        
        # Check for column offset (col0 > 2x col1)
        col0 = totals[0] if totals else 0
        col1 = totals[1] if len(totals) > 1 else 1
        has_offset = col0 > col1 * 2 and col0 > 50000
        
        # Expected booths
        expected = 0
        if booths_file.exists():
            with open(booths_file) as f:
                meta = json.load(f)
            expected = len(set(get_base_booth_no(b['boothNo']) for b in meta.get('booths', [])))
        
        extracted = len(set(get_base_booth_no(k.split('-')[-1]) for k in results.keys()))
        
        total_booths += extracted
        total_expected += expected
        
        # Add to PC totals (adjusting for offset if detected)
        for i, v in enumerate(totals):
            idx = i + 1 if has_offset else i  # Skip col0 if offset detected
            if idx < len(pc_totals):
                pc_totals[idx] += v
        
        ac_stats.append({
            'ac_id': ac_id,
            'status': 'data',
            'booths': extracted,
            'expected': expected,
            'has_offset': has_offset,
            'col0': col0,
            'col1': col1
        })
    
    # Compare to official
    errors = []
    for i in range(min(5, len(official_cands))):
        official_val = official_cands[i].get('votes', 0)
        extracted_val = pc_totals[i]
        
        if official_val > 1000:
            err = abs(official_val - extracted_val) / official_val * 100
            errors.append({
                'idx': i,
                'name': official_cands[i].get('name', '?'),
                'party': official_cands[i].get('party', '?'),
                'official': official_val,
                'extracted': extracted_val,
                'diff': extracted_val - official_val,
                'error': err
            })
    
    avg_error = sum(e['error'] for e in errors) / len(errors) if errors else 100
    
    # Categorize
    offset_acs = [a for a in ac_stats if a.get('has_offset')]
    missing_acs = [a for a in ac_stats if a.get('expected', 0) > a.get('booths', 0) + 10]
    
    return {
        'pc_id': pc_id,
        'pc_name': official.get('constituencyName', pc_id),
        'total_booths': total_booths,
        'expected_booths': total_expected,
        'avg_error': avg_error,
        'errors': errors,
        'ac_stats': ac_stats,
        'offset_acs': len(offset_acs),
        'missing_acs': len(missing_acs),
        'category': categorize(avg_error, len(offset_acs), len(missing_acs))
    }


def categorize(error, offset_count, missing_count):
    if error < 5:
        return 'COMPLETE'
    elif offset_count > 0 and error > 50:
        return 'COLUMN_OFFSET'
    elif error < 20:
        return 'NEAR_COMPLETE'
    elif missing_count > 2:
        return 'MISSING_DATA'
    else:
        return 'NEEDS_REVIEW'


def main():
    print("=" * 80)
    print("COMPREHENSIVE TN 2024 BOOTH DATA STATUS")
    print("=" * 80)
    
    pc_data, schema = load_data()
    
    results = []
    pc_ids = sorted([p for p in schema.get('parliamentaryConstituencies', {}).keys() if p.startswith('TN-')])
    
    for pc_id in pc_ids:
        result = analyze_pc(pc_id, pc_data, schema)
        if result:
            results.append(result)
    
    # Group by category
    categories = {}
    for r in results:
        cat = r['category']
        if cat not in categories:
            categories[cat] = []
        categories[cat].append(r)
    
    # Print summary
    for cat in ['COMPLETE', 'NEAR_COMPLETE', 'COLUMN_OFFSET', 'MISSING_DATA', 'NEEDS_REVIEW']:
        if cat in categories:
            print(f"\n{'=' * 80}")
            print(f"{cat}: {len(categories[cat])} PCs")
            print("=" * 80)
            
            for r in sorted(categories[cat], key=lambda x: x['avg_error']):
                offset_flag = f" [OFFSET:{r['offset_acs']}ACs]" if r['offset_acs'] > 0 else ""
                print(f"  {r['pc_id']} {r['pc_name']}: {r['avg_error']:.1f}% error, {r['total_booths']}/{r['expected_booths']} booths{offset_flag}")
    
    # Overall stats
    print(f"\n{'=' * 80}")
    print("OVERALL SUMMARY")
    print("=" * 80)
    
    total_booths = sum(r['total_booths'] for r in results)
    total_expected = sum(r['expected_booths'] for r in results)
    
    for cat, items in sorted(categories.items()):
        print(f"  {cat:20s}: {len(items):2d} PCs")
    
    print(f"\n  Total booths extracted: {total_booths:,}")
    print(f"  Total booths expected:  {total_expected:,}")
    print(f"  Booth coverage: {total_booths/total_expected*100:.1f}%")
    
    # Calculate actual vote coverage (ignoring offset issues)
    complete = categories.get('COMPLETE', []) + categories.get('NEAR_COMPLETE', [])
    complete_votes = sum(r['errors'][0]['extracted'] for r in complete if r['errors'])
    complete_official = sum(r['errors'][0]['official'] for r in complete if r['errors'])
    
    if complete_official > 0:
        print(f"\n  Vote coverage in COMPLETE/NEAR_COMPLETE PCs: {complete_votes:,} / {complete_official:,} = {complete_votes/complete_official*100:.1f}%")
    
    # ACs needing attention
    print(f"\n{'=' * 80}")
    print("TOP ACs NEEDING WORK")
    print("=" * 80)
    
    problem_acs = []
    for r in results:
        if r['category'] in ['COLUMN_OFFSET', 'MISSING_DATA', 'NEEDS_REVIEW']:
            for ac in r['ac_stats']:
                if ac.get('has_offset') or (ac.get('expected', 0) - ac.get('booths', 0) > 20):
                    problem_acs.append({
                        'ac_id': ac.get('ac_id'),
                        'pc_id': r['pc_id'],
                        'issue': 'offset' if ac.get('has_offset') else 'missing',
                        'booths': ac.get('booths', 0),
                        'expected': ac.get('expected', 0),
                        'gap': ac.get('expected', 0) - ac.get('booths', 0)
                    })
    
    problem_acs.sort(key=lambda x: (-1 if x['issue'] == 'offset' else x['gap']), reverse=True)
    
    print("\nColumn offset issues (need candidate column realignment):")
    for a in [p for p in problem_acs if p['issue'] == 'offset'][:15]:
        print(f"  {a['ac_id']} (in {a['pc_id']})")
    
    print("\nMissing data (need more OCR extraction):")
    for a in [p for p in problem_acs if p['issue'] == 'missing'][:15]:
        print(f"  {a['ac_id']} (in {a['pc_id']}): {a['booths']}/{a['expected']} (gap: {a['gap']})")


if __name__ == "__main__":
    main()
