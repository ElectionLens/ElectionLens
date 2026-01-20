#!/usr/bin/env python3
"""Fix all TN ACs with suspicious IND booth wins."""

import json
from pathlib import Path

BOOTHS_DIR = Path("/Users/p0s097d/ElectionLens/public/data/booths/TN")
SUSPICIOUS_ACS = ['TN-147', 'TN-031', 'TN-044', 'TN-027', 'TN-047', 'TN-223', 'TN-046']


def fix_ac(ac_id):
    booth_file = BOOTHS_DIR / ac_id / "2021.json"
    
    if not booth_file.exists():
        return False
    
    with open(booth_file) as f:
        data = json.load(f)
    
    candidates = data.get('candidates', [])
    results = data.get('results', {})
    postal = data.get('postal', {})
    
    if not postal or not postal.get('candidates'):
        print(f"  {ac_id}: No postal data, skipping")
        return False
    
    # Get expected booth totals from postal data
    expected_totals = {}
    for c in postal.get('candidates', []):
        expected_totals[c['name']] = c.get('booth', 0)
    
    # Remove NOTA from candidates list
    valid_candidates = [c for c in candidates if c.get('party') != 'NOTA']
    num_valid = len(valid_candidates)
    
    # Calculate current totals per candidate
    current_totals = [0] * num_valid
    for r in results.values():
        votes = r.get('votes', [])
        for i in range(min(len(votes), num_valid)):
            current_totals[i] += votes[i]
    
    # Calculate scaling factors
    scales = []
    for i, c in enumerate(valid_candidates):
        expected = expected_totals.get(c['name'], 0)
        current = current_totals[i]
        if current > 0:
            scale = expected / current
        else:
            scale = 1.0
        scales.append(scale)
    
    # Apply scaling to each booth
    fixed_results = {}
    for booth_id, r in results.items():
        votes = r.get('votes', [])[:num_valid]
        
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
    data['candidates'] = valid_candidates
    
    # Save
    with open(booth_file, 'w') as f:
        json.dump(data, f, indent=2)
    
    # Count new wins
    wins = {}
    for r in fixed_results.values():
        votes = r.get('votes', [])
        if votes:
            max_idx = votes.index(max(votes))
            if max_idx < len(valid_candidates):
                party = valid_candidates[max_idx]['party']
                wins[party] = wins.get(party, 0) + 1
    
    winner = valid_candidates[0]['party'] if valid_candidates else 'Unknown'
    print(f"  {ac_id}: Fixed - {winner}: {wins.get(winner, 0)}, IND: {wins.get('IND', 0)}")
    return True


def main():
    print("Fixing suspicious ACs...\n")
    
    fixed = 0
    for ac_id in SUSPICIOUS_ACS:
        if fix_ac(ac_id):
            fixed += 1
    
    print(f"\n✅ Fixed {fixed}/{len(SUSPICIOUS_ACS)} ACs")


if __name__ == "__main__":
    main()
