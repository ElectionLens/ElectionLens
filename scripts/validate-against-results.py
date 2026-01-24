#!/usr/bin/env python3
"""
Validate extracted booth data against official PC results.
If sum of booth votes matches official candidate totals, data is complete.
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


def get_pc_for_ac(ac_id, schema):
    for pc_id, pc_info in schema.get('parliamentaryConstituencies', {}).items():
        if ac_id in pc_info.get('assemblyIds', []):
            return pc_id, pc_info
    return None, None


def get_base_booth_no(booth_no: str) -> int:
    match = re.match(r'^0*(\d+)', str(booth_no))
    return int(match.group(1)) if match else 0


def get_ac_totals(ac_num: int) -> tuple:
    """Get extracted totals for an AC."""
    ac_id = f"TN-{ac_num:03d}"
    
    results_file = OUTPUT_BASE / ac_id / "2024.json"
    if not results_file.exists():
        return ac_id, None, 0, 0
    
    with open(results_file) as f:
        data = json.load(f)
    
    results = data.get('results', {})
    num_candidates = len(data.get('candidates', []))
    
    totals = [0] * num_candidates
    for booth_result in results.values():
        votes = booth_result.get('votes', [])
        for i, v in enumerate(votes):
            if i < num_candidates:
                totals[i] += v
    
    # Count booths
    booths_file = OUTPUT_BASE / ac_id / "booths.json"
    if booths_file.exists():
        with open(booths_file) as f:
            meta = json.load(f)
        expected = set(get_base_booth_no(b['boothNo']) for b in meta.get('booths', []))
        existing = set(get_base_booth_no(k.split('-')[-1]) for k in results.keys())
        return ac_id, totals, len(existing), len(expected)
    
    return ac_id, totals, len(results), 0


def validate_pc(pc_id: str, pc_data: dict, schema: dict) -> dict:
    """Validate PC by summing all AC booth data and comparing to official."""
    pc_info = schema.get('parliamentaryConstituencies', {}).get(pc_id, {})
    ac_ids = pc_info.get('assemblyIds', [])
    
    if not ac_ids:
        return {'status': 'no_acs', 'pc_id': pc_id}
    
    official = pc_data.get(pc_id, {})
    official_candidates = official.get('candidates', [])
    
    if not official_candidates:
        return {'status': 'no_official', 'pc_id': pc_id}
    
    num_candidates = len(official_candidates)
    pc_totals = [0] * num_candidates
    total_booths_extracted = 0
    total_booths_expected = 0
    ac_details = []
    
    for ac_id in ac_ids:
        ac_num = int(ac_id.replace('TN-', ''))
        _, ac_totals, extracted, expected = get_ac_totals(ac_num)
        
        if ac_totals:
            for i in range(min(len(ac_totals), num_candidates)):
                pc_totals[i] += ac_totals[i]
        
        total_booths_extracted += extracted
        total_booths_expected += expected
        ac_details.append({
            'ac_id': ac_id,
            'extracted': extracted,
            'expected': expected,
            'totals': ac_totals[:3] if ac_totals else []
        })
    
    # Compare to official
    errors = []
    for i in range(min(5, num_candidates)):
        official_val = official_candidates[i].get('votes', 0)
        extracted_val = pc_totals[i]
        
        if official_val > 100:
            error_pct = abs(official_val - extracted_val) / official_val * 100
            errors.append({
                'idx': i,
                'name': official_candidates[i].get('name', '?'),
                'party': official_candidates[i].get('party', '?'),
                'official': official_val,
                'extracted': extracted_val,
                'diff': extracted_val - official_val,
                'error_pct': error_pct
            })
    
    avg_error = sum(e['error_pct'] for e in errors) / len(errors) if errors else 100
    
    return {
        'pc_id': pc_id,
        'pc_name': official.get('constituencyName', pc_id),
        'status': 'validated',
        'booths_extracted': total_booths_extracted,
        'booths_expected': total_booths_expected,
        'avg_error': avg_error,
        'errors': errors,
        'ac_details': ac_details,
        'complete': avg_error < 2.0
    }


def main():
    print("=" * 80)
    print("VALIDATION AGAINST OFFICIAL PC RESULTS")
    print("=" * 80)
    
    pc_data, schema = load_data()
    
    # Validate at PC level
    complete_pcs = []
    partial_pcs = []
    
    pc_ids = sorted(schema.get('parliamentaryConstituencies', {}).keys())
    
    for pc_id in pc_ids:
        if not pc_id.startswith('TN-'):
            continue
        result = validate_pc(pc_id, pc_data, schema)
        if result.get('status') == 'validated':
            if result.get('complete'):
                complete_pcs.append(result)
            else:
                partial_pcs.append(result)
    
    # Sort by error
    partial_pcs.sort(key=lambda x: x.get('avg_error', 100))
    
    print(f"\n{'=' * 80}")
    print(f"COMPLETE PCs (< 2% error): {len(complete_pcs)}")
    print("=" * 80)
    
    for r in complete_pcs:
        print(f"  {r['pc_id']} {r['pc_name']}: {r['booths_extracted']}/{r['booths_expected']} booths, {r['avg_error']:.2f}% error")
    
    print(f"\n{'=' * 80}")
    print(f"NEAR-COMPLETE PCs (2-5% error): {len([p for p in partial_pcs if p['avg_error'] < 5])}")
    print("=" * 80)
    
    for r in [p for p in partial_pcs if p['avg_error'] < 5]:
        print(f"\n  {r['pc_id']} {r['pc_name']}: {r['booths_extracted']}/{r['booths_expected']} booths, {r['avg_error']:.2f}% error")
        for e in r['errors'][:3]:
            print(f"    {e['name']} ({e['party']}): official={e['official']:,} extracted={e['extracted']:,} ({e['diff']:+,} = {e['error_pct']:.1f}%)")
    
    print(f"\n{'=' * 80}")
    print(f"PARTIAL PCs (5-15% error): {len([p for p in partial_pcs if 5 <= p['avg_error'] < 15])}")
    print("=" * 80)
    
    for r in [p for p in partial_pcs if 5 <= p['avg_error'] < 15]:
        print(f"\n  {r['pc_id']} {r['pc_name']}: {r['booths_extracted']}/{r['booths_expected']} booths, {r['avg_error']:.2f}% error")
        for e in r['errors'][:2]:
            print(f"    {e['name']} ({e['party']}): official={e['official']:,} extracted={e['extracted']:,} ({e['diff']:+,})")
        # Show ACs with biggest gaps
        gaps = [(a['ac_id'], a['expected'] - a['extracted']) for a in r['ac_details'] if a['expected'] > 0]
        gaps.sort(key=lambda x: -x[1])
        if gaps:
            print(f"    Biggest AC gaps: {', '.join(f'{a[0]}(-{a[1]})' for a in gaps[:3])}")
    
    print(f"\n{'=' * 80}")
    print(f"INCOMPLETE PCs (>15% error): {len([p for p in partial_pcs if p['avg_error'] >= 15])}")
    print("=" * 80)
    
    for r in [p for p in partial_pcs if p['avg_error'] >= 15]:
        print(f"\n  {r['pc_id']} {r['pc_name']}: {r['booths_extracted']}/{r['booths_expected']} booths, {r['avg_error']:.2f}% error")
        for e in r['errors'][:2]:
            print(f"    {e['name']} ({e['party']}): official={e['official']:,} extracted={e['extracted']:,} ({e['diff']:+,})")
    
    # Summary
    print(f"\n{'=' * 80}")
    print("SUMMARY BY PC")
    print("=" * 80)
    print(f"Complete (< 2% error):     {len(complete_pcs):3d} PCs")
    print(f"Near-complete (2-5%):      {len([p for p in partial_pcs if p['avg_error'] < 5]):3d} PCs")
    print(f"Partial (5-15%):           {len([p for p in partial_pcs if 5 <= p['avg_error'] < 15]):3d} PCs")
    print(f"Incomplete (> 15%):        {len([p for p in partial_pcs if p['avg_error'] >= 15]):3d} PCs")
    print(f"{'=' * 80}")
    
    # Calculate actual vote coverage
    total_official = 0
    total_extracted = 0
    
    for r in complete_pcs + partial_pcs:
        for e in r.get('errors', []):
            total_official += e['official']
            total_extracted += e['extracted']
    
    if total_official > 0:
        coverage = total_extracted / total_official * 100
        print(f"\nActual VOTE coverage: {total_extracted:,} / {total_official:,} = {coverage:.1f}%")
    
    # ACs that need work
    print(f"\n{'=' * 80}")
    print("ACs NEEDING WORK (from incomplete PCs)")
    print("=" * 80)
    
    problem_acs = []
    for r in partial_pcs:
        if r['avg_error'] >= 5:
            for a in r['ac_details']:
                gap = a['expected'] - a['extracted'] if a['expected'] > 0 else 0
                if gap > 10:
                    problem_acs.append({
                        'ac_id': a['ac_id'],
                        'pc_id': r['pc_id'],
                        'extracted': a['extracted'],
                        'expected': a['expected'],
                        'gap': gap
                    })
    
    problem_acs.sort(key=lambda x: -x['gap'])
    for a in problem_acs[:30]:
        print(f"  {a['ac_id']} (in {a['pc_id']}): {a['extracted']}/{a['expected']} (missing {a['gap']})")
    
    # Save report
    report = {
        'complete_pcs': complete_pcs,
        'partial_pcs': partial_pcs,
        'problem_acs': problem_acs
    }
    
    with open('/tmp/validation_report.json', 'w') as f:
        json.dump(report, f, indent=2)
    
    print(f"\nDetailed report saved to /tmp/validation_report.json")


if __name__ == "__main__":
    main()
