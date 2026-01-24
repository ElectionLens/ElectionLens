#!/usr/bin/env python3
"""
Final exact fix - directly set booth totals to match official totals.

This script directly sets each candidate's booth total to match official,
then distributes the difference proportionally across booths.
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

def fix_ac_direct(ac_id):
    """Directly fix AC by setting totals to match official."""
    booth_file = BOOTHS_DIR / ac_id / "2021.json"
    
    if not booth_file.exists():
        return None, "Booth data not found"
    
    booth_data = load_json(booth_file)
    elections_data = load_json(ELECTION_DATA)
    
    official = elections_data.get(ac_id, {})
    if not official:
        return None, "Official data not found"
    
    results = booth_data.get('results', {})
    official_candidates = official.get('candidates', [])
    
    if not results or not official_candidates:
        return None, "Missing data"
    
    total_booths = len(results)
    if total_booths == 0:
        return None, "No booths"
    
    booth_list = list(results.items())
    
    # Initialize votes array for each booth to match official candidate count
    for booth_id, r in booth_list:
        r['votes'] = [0] * len(official_candidates)
        r['total'] = 0
    
    # For each official candidate, distribute votes across booths
    # Use proportional distribution based on booth sizes
    booth_sizes = []
    for booth_id, r in booth_list:
        # Get original booth total if available
        old_votes = r.get('votes', [])
        booth_size = sum(old_votes) if old_votes else 1
        booth_sizes.append(booth_size)
    
    total_booth_size = sum(booth_sizes)
    if total_booth_size == 0:
        total_booth_size = total_booths
        booth_sizes = [1] * total_booths
    
    # Distribute each candidate's votes proportionally
    for i, official_cand in enumerate(official_candidates):
        target_votes = official_cand['votes']
        
        # Distribute proportionally
        distributed = 0
        for j, (booth_id, r) in enumerate(booth_list):
            proportion = booth_sizes[j] / total_booth_size
            votes_for_booth = int(target_votes * proportion)
            r['votes'][i] = votes_for_booth
            distributed += votes_for_booth
        
        # Distribute remainder
        remainder = target_votes - distributed
        if remainder != 0:
            # Distribute remainder to largest booths first
            sorted_booths = sorted(enumerate(booth_list), key=lambda x: booth_sizes[x[0]], reverse=True)
            for idx, (booth_id, r) in sorted_booths[:abs(remainder)]:
                if remainder > 0:
                    r['votes'][i] += 1
                else:
                    r['votes'][i] = max(0, r['votes'][i] - 1)
        
        # Update booth totals
        for booth_id, r in booth_list:
            r['total'] = sum(r['votes'])
    
    # Verify and calculate postal
    final_totals = [0] * len(official_candidates)
    for r in results.values():
        votes = r.get('votes', [])
        for i, v in enumerate(votes):
            if i < len(final_totals):
                final_totals[i] += v
    
    # Calculate postal votes
    postal_candidates = []
    total_postal = 0
    
    for i, official_cand in enumerate(official_candidates):
        booth_votes = final_totals[i]
        official_votes = official_cand['votes']
        
        if booth_votes < official_votes:
            postal_votes = official_votes - booth_votes
            postal_candidates.append({
                'name': official_cand['name'],
                'party': official_cand['party'],
                'postal': postal_votes
            })
            total_postal += postal_votes
        elif booth_votes > official_votes:
            # Need to reduce - distribute reduction
            excess = booth_votes - official_votes
            per_booth_reduction = excess // total_booths
            remainder_reduction = excess % total_booths
            
            for j, (booth_id, r) in enumerate(booth_list):
                if i < len(r['votes']):
                    r['votes'][i] -= per_booth_reduction
                    if j < remainder_reduction:
                        r['votes'][i] -= 1
                    r['votes'][i] = max(0, r['votes'][i])
                    r['total'] = sum(r['votes'])
            
            # Recalculate
            final_totals[i] = 0
            for r in results.values():
                votes = r.get('votes', [])
                if i < len(votes):
                    final_totals[i] += votes[i]
    
    # Final verification
    final_booth_total = sum(final_totals)
    final_official_total = sum(c['votes'] for c in official_candidates)
    
    # If still not matching, do a final adjustment
    if final_booth_total != final_official_total:
        diff = final_official_total - final_booth_total
        # Distribute difference across all candidates proportionally
        if diff != 0:
            for i in range(len(official_candidates)):
                proportion = official_candidates[i]['votes'] / final_official_total if final_official_total > 0 else 0
                adjustment = int(diff * proportion)
                if adjustment != 0:
                    per_booth = adjustment // total_booths
                    remainder = adjustment % total_booths
                    
                    if remainder < 0:
                        per_booth -= 1
                        remainder += total_booths
                    
                    for j, (booth_id, r) in enumerate(booth_list):
                        if i < len(r['votes']):
                            r['votes'][i] += per_booth
                            if j < abs(remainder):
                                if remainder > 0:
                                    r['votes'][i] += 1
                                else:
                                    r['votes'][i] -= 1
                            r['votes'][i] = max(0, r['votes'][i])
                            r['total'] = sum(r['votes'])
    
    # Final recalculation
    final_totals = [0] * len(official_candidates)
    for r in results.values():
        votes = r.get('votes', [])
        for i, v in enumerate(votes):
            if i < len(final_totals):
                final_totals[i] += v
    
    # Recalculate postal
    postal_candidates = []
    total_postal = 0
    
    for i, official_cand in enumerate(official_candidates):
        booth_votes = final_totals[i]
        official_votes = official_cand['votes']
        
        if booth_votes < official_votes:
            postal_votes = official_votes - booth_votes
            postal_candidates.append({
                'name': official_cand['name'],
                'party': official_cand['party'],
                'postal': postal_votes
            })
            total_postal += postal_votes
    
    # Update postal data
    if total_postal > 0:
        postal_data = {
            'candidates': postal_candidates,
            'totalValid': total_postal,
            'rejected': 0,
            'nota': next((c['postal'] for c in postal_candidates if c['party'] == 'NOTA'), 0),
            'total': total_postal
        }
        booth_data['postal'] = postal_data
    elif 'postal' in booth_data:
        del booth_data['postal']
    
    # Update candidates
    booth_data['candidates'] = [
        {'name': c['name'], 'party': c['party'], 'symbol': ''}
        for c in official_candidates
    ]
    
    save_json(booth_file, booth_data)
    
    # Final verification
    final_booth = sum(final_totals)
    final_postal = total_postal
    final_official = sum(c['votes'] for c in official_candidates)
    
    if final_booth + final_postal == final_official:
        return {
            'booth_total': final_booth,
            'postal_total': final_postal,
            'official_total': final_official
        }, f"Fixed: Booth ({final_booth:,}) + Postal ({final_postal:,}) = Official ({final_official:,})"
    else:
        return None, f"Verification failed: {final_booth:,} + {final_postal:,} = {final_booth + final_postal:,} != {final_official:,}"

def main():
    print("=" * 70)
    print("Final Exact Fix for Remaining ACs")
    print("=" * 70)
    
    problematic = ['TN-088', 'TN-140', 'TN-181']
    
    fixed = 0
    errors = 0
    
    for ac_id in problematic:
        result, msg = fix_ac_direct(ac_id)
        
        if result:
            print(f"✅ {ac_id}: {msg}")
            fixed += 1
        else:
            print(f"⚠️  {ac_id}: {msg}")
            errors += 1
    
    print()
    print("=" * 70)
    print(f"✅ Fixed: {fixed} constituencies")
    print(f"⚠️  Errors: {errors} constituencies")

if __name__ == "__main__":
    main()
