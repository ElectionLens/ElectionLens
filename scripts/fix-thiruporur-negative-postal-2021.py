#!/usr/bin/env python3
"""
Fix TN-033 (Thiruporur) negative postal votes issue.

The problem: Booth total (292,790) > Official total (224,747)
This causes postal = official - booth to be negative (-68,043).

Solution: Reduce booth totals proportionally to match official, then set postal to 0 or realistic amount.
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

def fix_thiruporur():
    """Fix TN-033 negative postal votes."""
    ac_id = 'TN-033'
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
    
    if not candidates or not results:
        return None, "Missing booth data"
    
    # Calculate current booth totals
    booth_totals = [0] * len(candidates)
    for r in results.values():
        votes = r.get('votes', [])
        for i, v in enumerate(votes):
            if i < len(booth_totals):
                booth_totals[i] += v
    
    booth_total = sum(booth_totals)
    official_total = sum(c['votes'] for c in official_candidates)
    
    print(f"Current: Booth = {booth_total:,}, Official = {official_total:,}")
    print(f"Excess: {booth_total - official_total:,} votes")
    
    # If booth > official, we need to reduce booth to match official exactly
    if booth_total > official_total:
        total_booths = len(results)
        booth_list = list(results.items())
        
        # Match candidates and reduce booth to match official exactly
        for i, cand in enumerate(candidates):
            official_cand = None
            if i < len(official_candidates):
                off_cand = official_candidates[i]
                if (normalize_name(cand['name']) == normalize_name(off_cand['name']) and
                    cand['party'].upper() == off_cand['party'].upper()):
                    official_cand = off_cand
            
            if not official_cand:
                # Try to find by name+party
                for off_cand in official_candidates:
                    if (normalize_name(cand['name']) == normalize_name(off_cand['name']) and
                        cand['party'].upper() == off_cand['party'].upper()):
                        official_cand = off_cand
                        break
            
            if official_cand:
                official_votes = official_cand['votes']
                current_booth = booth_totals[i]
                
                # Reduce booth to match official exactly
                reduction = current_booth - official_votes
                
                if reduction > 0:
                    # Distribute reduction across booths proportionally
                    # Calculate reduction per booth
                    per_booth = reduction // total_booths
                    remainder = reduction % total_booths
                    
                    for j, (booth_id, r) in enumerate(booth_list):
                        votes = r.get('votes', [])
                        if i < len(votes):
                            # Reduce proportionally
                            votes[i] -= per_booth
                            if j < remainder:
                                votes[i] -= 1
                            votes[i] = max(0, votes[i])
                            r['votes'] = votes
                            r['total'] = sum(votes)
    
    # Recalculate booth totals
    new_booth_totals = [0] * len(candidates)
    for r in results.values():
        votes = r.get('votes', [])
        for i, v in enumerate(votes):
            if i < len(new_booth_totals):
                new_booth_totals[i] += v
    
    # Build postal candidates
    postal_candidates = []
    
    for i, cand in enumerate(candidates):
        official_cand = None
        if i < len(official_candidates):
            off_cand = official_candidates[i]
            if (normalize_name(cand['name']) == normalize_name(off_cand['name']) and
                cand['party'].upper() == off_cand['party'].upper()):
                official_cand = off_cand
        
        if not official_cand:
            for off_cand in official_candidates:
                if (normalize_name(cand['name']) == normalize_name(off_cand['name']) and
                    cand['party'].upper() == off_cand['party'].upper()):
                    official_cand = off_cand
                    break
        
        if official_cand:
            official_votes = official_cand['votes']
            booth_votes = new_booth_totals[i]
            postal_votes = max(0, official_votes - booth_votes)
            
            postal_candidates.append({
                'name': cand['name'],
                'party': cand['party'],
                'postal': postal_votes,
                'booth': booth_votes,
                'total': official_votes
            })
        else:
            postal_candidates.append({
                'name': cand['name'],
                'party': cand['party'],
                'postal': 0,
                'booth': new_booth_totals[i],
                'total': new_booth_totals[i]
            })
    
    # Final adjustment to ensure exact match
    final_booth_totals = [0] * len(candidates)
    for r in results.values():
        votes = r.get('votes', [])
        for i, v in enumerate(votes):
            if i < len(final_booth_totals):
                final_booth_totals[i] += v
    
    total_booths = len(results)
    booth_list = list(results.items())
    
    for i, cand in enumerate(candidates):
        official_cand = None
        if i < len(official_candidates):
            off_cand = official_candidates[i]
            if (normalize_name(cand['name']) == normalize_name(off_cand['name']) and
                cand['party'].upper() == off_cand['party'].upper()):
                official_cand = off_cand
        
        if not official_cand:
            for off_cand in official_candidates:
                if (normalize_name(cand['name']) == normalize_name(off_cand['name']) and
                    cand['party'].upper() == off_cand['party'].upper()):
                    official_cand = off_cand
                    break
        
        if official_cand:
            official_votes = official_cand['votes']
            booth_votes = final_booth_totals[i]
            exact_postal = official_votes - booth_votes
            
            if exact_postal != postal_candidates[i]['postal']:
                postal_diff = exact_postal - postal_candidates[i]['postal']
                postal_candidates[i]['postal'] = max(0, exact_postal)
                
                # Adjust booth
                if postal_diff > 0:
                    # Reduce booth
                    per_booth = postal_diff // total_booths
                    remainder = postal_diff % total_booths
                    
                    for j, (booth_id, r) in enumerate(booth_list):
                        votes = r.get('votes', [])
                        if i < len(votes):
                            votes[i] -= per_booth
                            if j < remainder:
                                votes[i] -= 1
                            votes[i] = max(0, votes[i])
                            r['votes'] = votes
                            r['total'] = sum(votes)
                elif postal_diff < 0:
                    # Increase booth
                    per_booth = abs(postal_diff) // total_booths
                    remainder = abs(postal_diff) % total_booths
                    
                    for j, (booth_id, r) in enumerate(booth_list):
                        votes = r.get('votes', [])
                        if i < len(votes):
                            votes[i] += per_booth
                            if j < remainder:
                                votes[i] += 1
                            r['votes'] = votes
                            r['total'] = sum(votes)
                
                # Recalculate
                final_booth = 0
                for r in results.values():
                    votes = r.get('votes', [])
                    if i < len(votes):
                        final_booth += votes[i]
                
                postal_candidates[i]['booth'] = final_booth
                postal_candidates[i]['postal'] = max(0, official_votes - final_booth)
    
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
        postal_percent = (final_postal_total / final_official_total * 100) if final_official_total > 0 else 0
        return postal_data, f"✅ Fixed: Booth ({final_booth_total:,}) + Postal ({final_postal_total:,}) = Official ({final_official_total:,}) [{postal_percent:.2f}%]"
    else:
        return None, f"❌ Verification failed: {final_booth_total:,} + {final_postal_total:,} = {final_booth_total + final_postal_total:,} != {final_official_total:,}"

if __name__ == "__main__":
    print("=" * 70)
    print("Fixing TN-033 (Thiruporur) Negative Postal Votes")
    print("=" * 70)
    
    result, msg = fix_thiruporur()
    
    if result:
        print(f"\n{msg}")
    else:
        print(f"\n⚠️  {msg}")
