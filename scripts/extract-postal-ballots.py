#!/usr/bin/env python3
"""
Extract postal ballot data from Form 20 PDFs and add to booth results.
"""

import json
import sys
from pathlib import Path

OUTPUT_BASE = Path("public/data/booths/TN")
ELECTIONS_FILE = Path("public/data/elections/ac/TN/2021.json")

# Load election data for reference
with open(ELECTIONS_FILE) as f:
    elections_data = json.load(f)


def calculate_postal_from_difference(ac_id):
    """Calculate postal votes as difference between official and booth totals."""
    booth_file = OUTPUT_BASE / ac_id / "2021.json"
    if not booth_file.exists():
        return None
    
    with open(booth_file) as f:
        booth_data = json.load(f)
    
    election = elections_data.get(ac_id, {})
    if not election:
        return None
    
    candidates = booth_data.get('candidates', [])
    election_candidates = {(c['name'], c['party']): c['votes'] for c in election.get('candidates', [])}
    
    # Calculate booth totals
    booth_totals = [0] * len(candidates)
    for r in booth_data.get('results', {}).values():
        for i, v in enumerate(r.get('votes', [])):
            if i < len(booth_totals):
                booth_totals[i] += v
    
    postal_data = {
        'candidates': [],
        'totalValid': 0,
    }
    
    for i, cand in enumerate(candidates):
        key = (cand['name'], cand['party'])
        official_votes = election_candidates.get(key, 0)
        booth_votes = booth_totals[i]
        postal_votes = max(0, official_votes - booth_votes)
        
        postal_data['candidates'].append({
            'name': cand['name'],
            'party': cand['party'],
            'postal': postal_votes,
            'booth': booth_votes,
            'total': official_votes
        })
    
    postal_data['totalValid'] = sum(c['postal'] for c in postal_data['candidates'])
    
    return postal_data


def process_constituency(ac_num):
    """Process a single constituency."""
    ac_id = f"TN-{ac_num:03d}"
    booth_file = OUTPUT_BASE / ac_id / "2021.json"
    
    if not booth_file.exists():
        return None, "Booth data not found"
    
    # Calculate postal votes from difference
    postal_data = calculate_postal_from_difference(ac_id)
    
    if not postal_data or not postal_data['candidates']:
        return None, "Could not calculate postal votes"
    
    # Sanity check: postal votes should be < 5% of total votes
    total_postal = sum(max(0, c['postal']) for c in postal_data['candidates'])
    total_official = sum(c['total'] for c in postal_data['candidates'])
    
    # If "postal" is > 5% of total, booth data is likely incomplete
    if total_official > 0 and total_postal / total_official > 0.05:
        # Remove postal data if it exists
        with open(booth_file) as f:
            booth_data = json.load(f)
        if 'postal' in booth_data:
            del booth_data['postal']
            with open(booth_file, 'w') as f:
                json.dump(booth_data, f, indent=2)
        return None, f"Skipped - {total_postal / total_official * 100:.0f}% diff"
    
    # Load and update booth data
    with open(booth_file) as f:
        booth_data = json.load(f)
    
    booth_data['postal'] = postal_data
    
    with open(booth_file, 'w') as f:
        json.dump(booth_data, f, indent=2)
    
    return postal_data, f"Postal: {total_postal:,} ({total_postal / total_official * 100:.1f}%)"


def main():
    print("=" * 60)
    print("Extracting Postal Ballot Data")
    print("=" * 60)
    
    start = int(sys.argv[1]) if len(sys.argv) > 1 else 1
    end = int(sys.argv[2]) if len(sys.argv) > 2 else 234
    
    success = 0
    skipped = 0
    total_postal = 0
    
    for ac_num in range(start, end + 1):
        ac_id = f"TN-{ac_num:03d}"
        result, msg = process_constituency(ac_num)
        
        if result:
            postal_sum = sum(c['postal'] for c in result['candidates'])
            total_postal += postal_sum
            print(f"✅ {ac_id}: {msg}")
            success += 1
        else:
            if "Skipped" in msg:
                print(f"⚠️  {ac_id}: {msg}")
                skipped += 1
            elif "not found" not in msg:
                print(f"❌ {ac_id}: {msg}")
    
    print()
    print("=" * 60)
    print(f"✅ Valid: {success} | ⚠️  Skipped: {skipped}")
    print(f"📮 Total postal: {total_postal:,}")


if __name__ == "__main__":
    main()
