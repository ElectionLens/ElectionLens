#!/usr/bin/env python3
"""
Fix postal estimation to ensure booth + postal = official exactly.

The issue: After estimating postal votes, booth + postal > official in some cases.
This script ensures exact matching by properly adjusting booth totals.
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

def fix_postal_accuracy(ac_id):
    """Fix postal data to ensure booth + postal = official exactly."""
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
    
    # Recalculate postal to ensure exact match
    postal_candidates = []
    total_booths = len(results)
    booth_list = list(results.items())
    
    # Calculate official total
    official_total = sum(c['votes'] for c in official_candidates)
    current_booth_total = sum(booth_totals)
    
    # Estimate postal as percentage of official (1.5%)
    estimated_postal_total = int(official_total * 0.015)
    
    # Distribute postal proportionally and adjust booth
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
            
            # Estimate postal proportional to candidate's vote share
            candidate_share = official_votes / official_total if official_total > 0 else 0
            estimated_postal = int(estimated_postal_total * candidate_share)
            
            # Ensure postal doesn't exceed booth votes
            if estimated_postal > booth_votes:
                estimated_postal = booth_votes
            
            # Subtract postal from booth
            if estimated_postal > 0:
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
            
            # Recalculate booth total
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
    
    # Final adjustment to ensure exact match
    final_booth_totals = [0] * len(candidates)
    for r in results.values():
        votes = r.get('votes', [])
        for i, v in enumerate(votes):
            if i < len(final_booth_totals):
                final_booth_totals[i] += v
    
    # Adjust each candidate to match official exactly
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
                    
                    # If postal increased, reduce booth further
                    if postal_diff > 0:
                        per_booth_adj = postal_diff // total_booths
                        remainder_adj = postal_diff % total_booths
                        
                        for j, (booth_id, r) in enumerate(booth_list):
                            votes = r.get('votes', [])
                            if i < len(votes):
                                votes[i] -= per_booth_adj
                                if j < remainder_adj:
                                    votes[i] -= 1
                                votes[i] = max(0, votes[i])
                                r['votes'] = votes
                                r['total'] = sum(votes)
                        
                        # Recalculate
                        new_booth = 0
                        for r in results.values():
                            votes = r.get('votes', [])
                            if i < len(votes):
                                new_booth += votes[i]
                        postal_cand['booth'] = new_booth
    
    # Update postal data
    postal_total = sum(c['postal'] for c in postal_candidates)
    
    postal_data = {
        'candidates': postal_candidates,
        'totalValid': postal_total,
        'rejected': 0,
        'nota': next((c['postal'] for c in postal_candidates if c['party'] == 'NOTA'), 0),
        'total': postal_total
    }
    
    booth_data['postal'] = postal_data
    save_json(booth_file, booth_data)
    
    # Final verification
    final_booth_totals = [0] * len(candidates)
    for r in results.values():
        votes = r.get('votes', [])
        for i, v in enumerate(votes):
            if i < len(final_booth_totals):
                final_booth_totals[i] += v
    
    final_booth_total = sum(final_booth_totals)
    final_postal_total = sum(c['postal'] for c in postal_candidates)
    final_official_total = sum(c['votes'] for c in official_candidates)
    
    if final_booth_total + final_postal_total == final_official_total:
        return postal_data, f"Fixed: Booth ({final_booth_total:,}) + Postal ({final_postal_total:,}) = Official ({final_official_total:,})"
    else:
        return None, f"Verification failed: {final_booth_total:,} + {final_postal_total:,} = {final_booth_total + final_postal_total:,} != {final_official_total:,}"

def main():
    print("=" * 70)
    print("Fixing Postal Estimation Accuracy for 2021")
    print("=" * 70)
    
    fixed = 0
    errors = 0
    
    for ac_num in range(1, 235):
        ac_id = f"TN-{ac_num:03d}"
        result, msg = fix_postal_accuracy(ac_id)
        
        if result:
            fixed += 1
            if ac_num % 50 == 0:
                print(f"✅ {ac_id}: {msg}")
        else:
            if "not found" not in msg.lower():
                if ac_num % 50 == 0:
                    print(f"⚠️  {ac_id}: {msg}")
                errors += 1
    
    print()
    print("=" * 70)
    print(f"✅ Fixed: {fixed} constituencies")
    print(f"⚠️  Errors: {errors} constituencies")

if __name__ == "__main__":
    main()
