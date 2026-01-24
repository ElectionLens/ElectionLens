#!/usr/bin/env python3
"""
Fix column offset issues in extracted booth data.

Problem: Some ACs have "Total Electors" column incorrectly parsed as first candidate votes,
causing ~2x inflation of vote totals.

Detection: If sum of booth votes is ~2x expected (based on PC totals), the first column
likely needs to be removed.
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


def analyze_ac(ac_id: str, pc_data: dict, schema: dict) -> dict:
    """Analyze an AC for column offset issues."""
    results_file = OUTPUT_BASE / ac_id / "2024.json"
    if not results_file.exists():
        return None
    
    with open(results_file) as f:
        data = json.load(f)
    
    results = data.get('results', {})
    if not results:
        return None
    
    # Get PC for this AC
    pc_id = None
    for pid, pinfo in schema.get('parliamentaryConstituencies', {}).items():
        if ac_id in pinfo.get('assemblyIds', []):
            pc_id = pid
            break
    
    if not pc_id or pc_id not in pc_data:
        return None
    
    official = pc_data[pc_id]
    official_cands = official.get('candidates', [])
    
    # Count ACs in this PC for proportional check
    pc_acs = schema['parliamentaryConstituencies'][pc_id]['assemblyIds']
    num_acs = len(pc_acs)
    
    # Calculate sums
    num_cands = len(data.get('candidates', []))
    col_totals = [0] * num_cands
    col_totals_without_first = [0] * (num_cands - 1)
    
    suspicious_booths = 0
    
    for r in results.values():
        votes = r.get('votes', [])
        for i, v in enumerate(votes):
            if i < num_cands:
                col_totals[i] += v
            if i > 0 and i - 1 < len(col_totals_without_first):
                col_totals_without_first[i-1] += v
        
        # Check if first column looks like "Total Electors"
        if len(votes) >= 2:
            # Total Electors is usually between 500-2000
            if 400 < votes[0] < 2500 and sum(votes[1:]) > 0:
                # Check if votes[0] is suspiciously close to sum(votes[1:])
                rest_sum = sum(votes[1:])
                if 0.4 < rest_sum / votes[0] < 2.0:
                    suspicious_booths += 1
    
    # Expected votes per AC (roughly equal share)
    expected_per_ac = {}
    for i, c in enumerate(official_cands[:5]):
        expected_per_ac[i] = c.get('votes', 0) / num_acs
    
    # Calculate error with and without first column
    error_with = 0
    error_without = 0
    
    for i in range(min(3, len(official_cands))):
        official_votes = expected_per_ac.get(i, 0)
        if official_votes > 1000:
            extracted_with = col_totals[i] if i < len(col_totals) else 0
            extracted_without = col_totals_without_first[i] if i < len(col_totals_without_first) else 0
            
            error_with += abs(extracted_with - official_votes) / official_votes * 100
            error_without += abs(extracted_without - official_votes) / official_votes * 100
    
    error_with /= 3
    error_without /= 3
    
    return {
        'ac_id': ac_id,
        'pc_id': pc_id,
        'num_booths': len(results),
        'num_candidates': num_cands,
        'error_with_col0': error_with,
        'error_without_col0': error_without,
        'suspicious_booths': suspicious_booths,
        'suspicious_pct': suspicious_booths / len(results) * 100 if results else 0,
        'needs_fix': error_without < error_with * 0.5 and suspicious_booths > len(results) * 0.3,
        'col0_sum': col_totals[0],
        'col1_sum': col_totals[1] if len(col_totals) > 1 else 0
    }


def fix_ac(ac_id: str) -> bool:
    """Remove first column from all booth results."""
    results_file = OUTPUT_BASE / ac_id / "2024.json"
    if not results_file.exists():
        return False
    
    with open(results_file) as f:
        data = json.load(f)
    
    # Update candidates list (remove first)
    candidates = data.get('candidates', [])
    if candidates:
        data['candidates'] = candidates[1:]
    
    # Update all booth results (remove first vote column)
    for booth_id, r in data.get('results', {}).items():
        votes = r.get('votes', [])
        if votes:
            r['votes'] = votes[1:]
            r['total'] = sum(r['votes'])
    
    data['source'] = data.get('source', '') + ' (column offset fixed)'
    
    with open(results_file, 'w') as f:
        json.dump(data, f, indent=2)
    
    return True


def main():
    print("=" * 80)
    print("COLUMN OFFSET ANALYSIS")
    print("=" * 80)
    
    pc_data, schema = load_data()
    
    needs_fix = []
    
    for ac_num in range(1, 235):
        ac_id = f"TN-{ac_num:03d}"
        result = analyze_ac(ac_id, pc_data, schema)
        
        if result and result.get('needs_fix'):
            needs_fix.append(result)
    
    print(f"\nACs with likely column offset issue: {len(needs_fix)}")
    print("=" * 80)
    
    for r in sorted(needs_fix, key=lambda x: -x['error_with_col0']):
        print(f"\n{r['ac_id']} (in {r['pc_id']}):")
        print(f"  Error with col0: {r['error_with_col0']:.1f}%")
        print(f"  Error without col0: {r['error_without_col0']:.1f}%")
        print(f"  Suspicious booths: {r['suspicious_booths']}/{r['num_booths']} ({r['suspicious_pct']:.0f}%)")
        print(f"  Col0 sum: {r['col0_sum']:,}, Col1 sum: {r['col1_sum']:,}")
    
    if needs_fix:
        print(f"\n{'=' * 80}")
        response = input("Fix these ACs? (y/n): ")
        if response.lower() == 'y':
            for r in needs_fix:
                if fix_ac(r['ac_id']):
                    print(f"  Fixed {r['ac_id']}")
            print("Done!")


if __name__ == "__main__":
    main()
