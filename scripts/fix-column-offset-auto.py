#!/usr/bin/env python3
"""
Automatically fix column offset issues in ACs where "Total Electors" 
was incorrectly parsed as the first candidate column.

Detection: col0 sum > 2x col1 sum and col0 > 50000
Fix: Remove first column from all booth results and candidate list
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


def detect_offset(ac_id: str) -> bool:
    """Detect if AC has column offset issue."""
    results_file = OUTPUT_BASE / ac_id / "2024.json"
    if not results_file.exists():
        return False
    
    with open(results_file) as f:
        data = json.load(f)
    
    results = data.get('results', {})
    if not results:
        return False
    
    num_cands = len(data.get('candidates', []))
    col_totals = [0] * num_cands
    
    for r in results.values():
        votes = r.get('votes', [])
        for i, v in enumerate(votes):
            if i < num_cands:
                col_totals[i] += v
    
    col0 = col_totals[0] if col_totals else 0
    col1 = col_totals[1] if len(col_totals) > 1 else 1
    
    # Offset detected if col0 > 2x col1 and col0 is large
    return col0 > col1 * 2 and col0 > 50000


def fix_ac(ac_id: str) -> dict:
    """Fix column offset by removing first column."""
    results_file = OUTPUT_BASE / ac_id / "2024.json"
    
    with open(results_file) as f:
        data = json.load(f)
    
    # Check if already fixed
    source = data.get('source', '')
    if 'column offset fixed' in source:
        return {'status': 'already_fixed'}
    
    original_cands = len(data.get('candidates', []))
    
    # Remove first candidate
    candidates = data.get('candidates', [])
    if candidates:
        data['candidates'] = candidates[1:]
    
    # Remove first vote column from all booths
    booths_fixed = 0
    for booth_id, r in data.get('results', {}).items():
        votes = r.get('votes', [])
        if votes:
            r['votes'] = votes[1:]
            r['total'] = sum(r['votes'])
            booths_fixed += 1
    
    data['source'] = source + ' (column offset fixed)'
    
    with open(results_file, 'w') as f:
        json.dump(data, f, indent=2)
    
    return {
        'status': 'fixed',
        'booths': booths_fixed,
        'cands_before': original_cands,
        'cands_after': len(data.get('candidates', []))
    }


def main():
    print("=" * 60)
    print("FIXING COLUMN OFFSET ISSUES")
    print("=" * 60)
    
    pc_data, schema = load_data()
    
    # Find all ACs with offset
    to_fix = []
    for ac_num in range(1, 235):
        ac_id = f"TN-{ac_num:03d}"
        if detect_offset(ac_id):
            to_fix.append(ac_id)
    
    print(f"\nDetected {len(to_fix)} ACs with column offset issues")
    print("-" * 60)
    
    fixed = 0
    skipped = 0
    
    for ac_id in to_fix:
        result = fix_ac(ac_id)
        
        if result['status'] == 'fixed':
            print(f"  ✓ {ac_id}: Fixed {result['booths']} booths ({result['cands_before']} → {result['cands_after']} candidates)")
            fixed += 1
        else:
            print(f"  - {ac_id}: {result['status']}")
            skipped += 1
    
    print(f"\n{'=' * 60}")
    print(f"Fixed: {fixed} ACs")
    print(f"Skipped: {skipped} ACs")
    print("=" * 60)


if __name__ == "__main__":
    main()
