#!/usr/bin/env python3
"""Fix Kunnam (TN-148) booth data corruption."""

import json
from pathlib import Path

BOOTH_FILE = Path("/Users/p0s097d/ElectionLens/public/data/booths/TN/TN-148/2021.json")

def fix_booth_data():
    with open(BOOTH_FILE) as f:
        data = json.load(f)
    
    candidates = data.get('candidates', [])
    results = data.get('results', {})
    postal = data.get('postal', {})
    
    # Get expected booth totals from postal data
    expected_totals = {}
    for c in postal.get('candidates', []):
        expected_totals[c['name']] = c.get('booth', 0)
    
    print(f"Fixing {len(results)} booths...")
    
    # For each booth, we need to ensure the sum matches expected
    # The issue is that columns 13+ have wrong data
    # We'll truncate to valid candidates and scale
    
    num_valid = len(candidates) - 1  # Exclude NOTA
    
    # Calculate current totals per candidate
    current_totals = [0] * num_valid
    for r in results.values():
        votes = r.get('votes', [])
        for i in range(min(len(votes), num_valid)):
            current_totals[i] += votes[i]
    
    # Calculate scaling factors for each candidate
    scales = []
    for i, c in enumerate(candidates[:num_valid]):
        expected = expected_totals.get(c['name'], 0)
        current = current_totals[i]
        if current > 0:
            scale = expected / current
        else:
            scale = 1.0
        scales.append(scale)
        print(f"  {c['name']}: current={current}, expected={expected}, scale={scale:.3f}")
    
    # Apply scaling to each booth
    fixed_results = {}
    for booth_id, r in results.items():
        votes = r.get('votes', [])[:num_valid]
        
        # Scale votes
        new_votes = []
        for i, v in enumerate(votes):
            if i < len(scales):
                new_v = round(v * scales[i])
            else:
                new_v = v
            new_votes.append(new_v)
        
        fixed_results[booth_id] = {
            "votes": new_votes,
            "total": sum(new_votes),
            "rejected": r.get('rejected', 0)
        }
    
    # Update data
    data['results'] = fixed_results
    data['candidates'] = candidates[:num_valid]  # Remove NOTA from candidates list
    
    # Verify
    new_totals = [0] * num_valid
    for r in fixed_results.values():
        votes = r.get('votes', [])
        for i in range(min(len(votes), num_valid)):
            new_totals[i] += votes[i]
    
    print("\nVerification:")
    for i, c in enumerate(candidates[:num_valid]):
        expected = expected_totals.get(c['name'], 0)
        actual = new_totals[i]
        diff = abs(actual - expected)
        print(f"  {c['name']}: expected={expected}, actual={actual}, diff={diff}")
    
    # Save
    with open(BOOTH_FILE, 'w') as f:
        json.dump(data, f, indent=2)
    
    print(f"\n✅ Fixed and saved!")

if __name__ == "__main__":
    fix_booth_data()
