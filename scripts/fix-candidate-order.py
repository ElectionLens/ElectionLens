#!/usr/bin/env python3
"""
Analyze and fix candidate column ordering issues.
Many PCs show high errors because extracted columns don't match official candidate order.
"""

import json
import re
from pathlib import Path
from itertools import permutations

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


def get_pc_extracted_totals(pc_id: str, schema: dict) -> list:
    """Get extracted vote totals for a PC by summing all AC booth data."""
    pc_info = schema.get('parliamentaryConstituencies', {}).get(pc_id, {})
    ac_ids = pc_info.get('assemblyIds', [])
    
    all_totals = []
    
    for ac_id in ac_ids:
        results_file = OUTPUT_BASE / ac_id / "2024.json"
        if not results_file.exists():
            continue
        
        with open(results_file) as f:
            data = json.load(f)
        
        results = data.get('results', {})
        num_candidates = len(data.get('candidates', []))
        
        if not all_totals:
            all_totals = [0] * num_candidates
        
        for booth_result in results.values():
            votes = booth_result.get('votes', [])
            for i, v in enumerate(votes):
                if i < len(all_totals):
                    all_totals[i] += v
    
    return all_totals


def find_best_column_mapping(extracted: list, official: list, n_candidates: int = 5) -> tuple:
    """Find the best column permutation to match official results."""
    if len(extracted) < n_candidates or len(official) < n_candidates:
        return None, 100.0
    
    extracted = extracted[:n_candidates]
    official_votes = [c.get('votes', 0) for c in official[:n_candidates]]
    
    best_mapping = None
    best_error = 100.0
    
    # Try all permutations of columns
    for perm in permutations(range(n_candidates)):
        mapped = [extracted[p] for p in perm]
        
        errors = []
        for i in range(n_candidates):
            if official_votes[i] > 1000:
                err = abs(mapped[i] - official_votes[i]) / official_votes[i] * 100
                errors.append(err)
        
        avg_err = sum(errors) / len(errors) if errors else 100
        
        if avg_err < best_error:
            best_error = avg_err
            best_mapping = list(perm)
    
    return best_mapping, best_error


def analyze_pc(pc_id: str, pc_data: dict, schema: dict) -> dict:
    """Analyze a PC for column ordering issues."""
    official = pc_data.get(pc_id, {})
    official_candidates = official.get('candidates', [])
    
    if not official_candidates:
        return {'status': 'no_official'}
    
    extracted_totals = get_pc_extracted_totals(pc_id, schema)
    
    if not extracted_totals:
        return {'status': 'no_extracted'}
    
    # Current error (assuming 1:1 mapping)
    current_errors = []
    for i in range(min(5, len(extracted_totals), len(official_candidates))):
        official_val = official_candidates[i].get('votes', 0)
        if official_val > 1000:
            err = abs(extracted_totals[i] - official_val) / official_val * 100
            current_errors.append(err)
    
    current_avg_error = sum(current_errors) / len(current_errors) if current_errors else 100
    
    # Find best mapping
    best_mapping, best_error = find_best_column_mapping(extracted_totals, official_candidates)
    
    return {
        'pc_id': pc_id,
        'pc_name': official.get('constituencyName', pc_id),
        'current_error': current_avg_error,
        'best_error': best_error,
        'best_mapping': best_mapping,
        'extracted_totals': extracted_totals[:5],
        'official_totals': [c.get('votes', 0) for c in official_candidates[:5]],
        'official_names': [f"{c.get('name', '?')} ({c.get('party', '?')})" for c in official_candidates[:5]],
        'needs_reorder': best_error < current_avg_error * 0.5 and best_mapping != list(range(5))
    }


def main():
    print("=" * 80)
    print("CANDIDATE COLUMN ORDER ANALYSIS")
    print("=" * 80)
    
    pc_data, schema = load_data()
    
    needs_fix = []
    already_ok = []
    
    pc_ids = sorted(schema.get('parliamentaryConstituencies', {}).keys())
    
    for pc_id in pc_ids:
        if not pc_id.startswith('TN-'):
            continue
        
        result = analyze_pc(pc_id, pc_data, schema)
        
        if result.get('status'):
            continue
        
        if result.get('needs_reorder'):
            needs_fix.append(result)
        else:
            already_ok.append(result)
    
    print(f"\n{'=' * 80}")
    print(f"PCs WITH COLUMN ORDER ISSUES: {len(needs_fix)}")
    print("=" * 80)
    
    for r in sorted(needs_fix, key=lambda x: -x['current_error']):
        print(f"\n  {r['pc_id']} {r['pc_name']}")
        print(f"    Current error: {r['current_error']:.1f}% → Best possible: {r['best_error']:.1f}%")
        print(f"    Best mapping: {r['best_mapping']}")
        print(f"    Official: {[f'{v:,}' for v in r['official_totals']]}")
        print(f"    Extracted: {[f'{v:,}' for v in r['extracted_totals']]}")
        if r['best_mapping']:
            reordered = [r['extracted_totals'][i] for i in r['best_mapping']]
            print(f"    Reordered: {[f'{v:,}' for v in reordered]}")
    
    print(f"\n{'=' * 80}")
    print(f"PCs ALREADY OK (no reorder needed): {len(already_ok)}")
    print("=" * 80)
    
    for r in sorted(already_ok, key=lambda x: x['current_error'])[:15]:
        print(f"  {r['pc_id']} {r['pc_name']}: {r['current_error']:.1f}% error")
    
    # Summary
    total_improvable = sum(1 for r in needs_fix if r['best_error'] < 5)
    print(f"\n{'=' * 80}")
    print("SUMMARY")
    print("=" * 80)
    print(f"PCs needing column reorder: {len(needs_fix)}")
    print(f"PCs that could be <5% error after reorder: {total_improvable}")
    print(f"PCs already OK: {len(already_ok)}")


if __name__ == "__main__":
    main()
