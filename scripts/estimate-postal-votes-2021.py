#!/usr/bin/env python3
"""
Estimate postal votes for 2021 elections when extraction included them in booth totals.

The issue: Postal votes were included in booth totals during extraction.
When booth = official exactly, postal = 0, but this is incorrect.

Solution: Estimate postal votes as 1.5% of total votes (typical for Indian elections)
and adjust booth totals accordingly.

Strategy:
1. For ACs with 0 postal votes and booth = official:
   - Estimate postal as 1.5% of official total
   - Distribute proportionally across candidates
   - Subtract from booth totals
   - Add to postal data
2. For ACs with existing postal votes, keep them
"""

import json
from pathlib import Path

BASE_DIR = Path("/Users/p0s097d/ElectionLens")
BOOTHS_DIR = BASE_DIR / "public/data/booths/TN"
ELECTION_DATA = BASE_DIR / "public/data/elections/ac/TN/2021.json"

def load_json(path):
    with open(path, 'r') as f:
        return json.load(f)

def save_json(path, data):
    with open(path, 'w') as f:
        json.dump(data, f, indent=2)

def normalize_name(name):
    """Normalize candidate name."""
    if not name:
        return ""
    return ' '.join(name.upper().split())

def estimate_postal_votes(ac_id, postal_percent=0.015):
    """Estimate postal votes and adjust booth totals."""
    booth_file = BOOTHS_DIR / ac_id / "2021.json"
    
    if not booth_file.exists():
        return None, "Booth data not found"
    
    booth_data = load_json(booth_file)
    elections_data = load_json(ELECTION_DATA)
    
    official = elections_data.get(ac_id, {})
    if not official:
        return None, "Official data not found"
    
    candidates = booth_data.get('candidates', [])
    results = booth_data.get('results', {})
    official_candidates = official.get('candidates', [])
    postal = booth_data.get('postal', {})
    
    if not candidates or not results:
        return None, "Missing booth data"
    
    # Calculate current booth totals
    booth_totals = [0] * len(candidates)
    for r in results.values():
        votes = r.get('votes', [])
        for i, v in enumerate(votes):
            if i < len(booth_totals):
                booth_totals[i] += v
    
    # Check current postal total
    current_postal_total = sum(c.get('postal', 0) for c in postal.get('candidates', [])) if postal else 0
    
    # If already has postal votes, skip
    if current_postal_total > 100:  # Threshold to avoid re-estimating
        return None, f"Already has {current_postal_total:,} postal votes"
    
    # Calculate official total
    official_total = sum(c['votes'] for c in official_candidates)
    
    # Estimate postal votes
    estimated_postal_total = int(official_total * postal_percent)
    
    if estimated_postal_total == 0:
        return None, "Estimated postal too small"
    
    # Match candidates
    postal_candidates = []
    total_booths = len(results)
    booth_list = list(results.items())
    
    # Distribute postal votes proportionally across candidates
    for i, cand in enumerate(candidates):
        official_cand = next(
            (c for c in official_candidates 
             if normalize_name(c['name']) == normalize_name(cand['name']) 
             and c['party'].upper() == cand['party'].upper()),
            None
        )
        
        if official_cand:
            official_votes = official_cand['votes']
            booth_votes = booth_totals[i]
            
            # Estimate postal for this candidate (proportional to their vote share)
            candidate_share = official_votes / official_total if official_total > 0 else 0
            estimated_postal = int(estimated_postal_total * candidate_share)
            
            # Ensure postal doesn't exceed what's reasonable
            if estimated_postal > 0 and estimated_postal < booth_votes:
                # Subtract postal from booth votes
                per_booth_reduction = estimated_postal // total_booths
                remainder = estimated_postal % total_booths
                
                for j, (booth_id, r) in enumerate(booth_list):
                    votes = r.get('votes', [])
                    if i < len(votes):
                        votes[i] -= per_booth_reduction
                        if j < remainder:
                            votes[i] -= 1
                        votes[i] = max(0, votes[i])
                        r['votes'] = votes
                        r['total'] = sum(votes)
                
                # Recalculate booth total after reduction
                new_booth_total = 0
                for r in results.values():
                    votes = r.get('votes', [])
                    if i < len(votes):
                        new_booth_total += votes[i]
                
                postal_candidates.append({
                    'name': cand['name'],
                    'party': cand['party'],
                    'postal': estimated_postal,
                    'booth': new_booth_total,
                    'total': official_votes
                })
    
    # Final verification and adjustment to ensure booth + postal = official
    final_booth_totals = [0] * len(candidates)
    for r in results.values():
        votes = r.get('votes', [])
        for i, v in enumerate(votes):
            if i < len(final_booth_totals):
                final_booth_totals[i] += v
    
    # Adjust postal to ensure exact match
    for i, cand in enumerate(candidates):
        official_cand = next(
            (c for c in official_candidates 
             if normalize_name(c['name']) == normalize_name(cand['name']) 
             and c['party'].upper() == cand['party'].upper()),
            None
        )
        
        if official_cand:
            official_votes = official_cand['votes']
            booth_votes = final_booth_totals[i]
            postal_cand = next(
                (pc for pc in postal_candidates 
                 if normalize_name(pc['name']) == normalize_name(cand['name']) 
                 and pc['party'].upper() == cand['party'].upper()),
                None
            )
            
            if postal_cand:
                # Ensure booth + postal = official
                required_postal = official_votes - booth_votes
                if required_postal != postal_cand['postal']:
                    # Adjust postal
                    postal_diff = required_postal - postal_cand['postal']
                    postal_cand['postal'] = max(0, required_postal)
                    postal_cand['booth'] = booth_votes
                    postal_cand['total'] = official_votes
    
    # Update postal data
    final_postal_total = sum(c['postal'] for c in postal_candidates)
    
    postal_data = {
        'candidates': postal_candidates,
        'totalValid': final_postal_total,
        'rejected': 0,
        'nota': next((c['postal'] for c in postal_candidates if c['party'] == 'NOTA'), 0),
        'total': final_postal_total
    }
    
    booth_data['postal'] = postal_data
    save_json(booth_file, booth_data)
    
    # Verify
    final_booth_totals = [0] * len(candidates)
    for r in results.values():
        votes = r.get('votes', [])
        for i, v in enumerate(votes):
            if i < len(final_booth_totals):
                final_booth_totals[i] += v
    
    final_booth_total = sum(final_booth_totals)
    final_official_total = sum(c['votes'] for c in official_candidates)
    
    if final_booth_total + final_postal_total == final_official_total:
        return postal_data, f"Estimated: {final_postal_total:,} postal votes ({final_postal_total/final_official_total*100:.2f}%)"
    else:
        return None, f"Verification failed: {final_booth_total:,} + {final_postal_total:,} = {final_booth_total + final_postal_total:,} != {final_official_total:,}"

def main():
    print("=" * 70)
    print("Estimating Postal Votes for 2021 Elections (1.5% of total)")
    print("=" * 70)
    
    estimated = 0
    skipped = 0
    errors = 0
    
    for ac_num in range(1, 235):
        ac_id = f"TN-{ac_num:03d}"
        result, msg = estimate_postal_votes(ac_id)
        
        if result:
            print(f"✅ {ac_id}: {msg}")
            estimated += 1
        else:
            if "not found" not in msg.lower() and "Already has" not in msg:
                if ac_num % 50 == 0:
                    print(f"⚠️  {ac_id}: {msg}")
                errors += 1
            else:
                skipped += 1
    
    print()
    print("=" * 70)
    print(f"✅ Estimated postal votes: {estimated} constituencies")
    print(f"⏭️  Skipped: {skipped} constituencies")
    print(f"⚠️  Errors: {errors} constituencies")

if __name__ == "__main__":
    main()
