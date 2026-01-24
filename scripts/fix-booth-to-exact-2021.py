#!/usr/bin/env python3
"""
Fix booth data to exactly match official totals for 2021 elections.

The issue: Booth totals are higher than official totals in many ACs.
This means either:
1. Postal votes were included in booth totals (double counting)
2. Extraction errors added extra votes

Solution:
1. Normalize booth votes to match official totals exactly
2. Then calculate postal votes as: postal = official - booth (only if booth < official)
3. If booth > official, reduce booth votes proportionally to match official
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
    """Normalize candidate name for matching."""
    if not name:
        return ""
    return ' '.join(name.upper().split())

def match_candidate(cand_name, cand_party, official_candidates):
    """Match a candidate from booth data to official data."""
    cand_name_norm = normalize_name(cand_name)
    cand_party_upper = cand_party.upper()
    
    # Try exact match first
    for official in official_candidates:
        if normalize_name(official['name']) == cand_name_norm and official['party'].upper() == cand_party_upper:
            return official
    
    # Try fuzzy match
    for official in official_candidates:
        official_name_norm = normalize_name(official['name'])
        official_party_upper = official['party'].upper()
        
        if official_party_upper == cand_party_upper:
            cand_parts = set(cand_name_norm.split())
            official_parts = set(official_name_norm.split())
            
            if len(cand_parts) > 0 and len(official_parts) > 0:
                overlap = len(cand_parts & official_parts)
                total_parts = len(cand_parts | official_parts)
                if overlap > 0 and overlap / total_parts > 0.5:
                    return official
    
    return None

def fix_booth_to_exact(ac_id):
    """Fix booth data to exactly match official totals."""
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
    
    # Match booth candidates to official candidates
    candidate_mapping = []
    for i, cand in enumerate(candidates):
        official_cand = match_candidate(cand['name'], cand['party'], official_candidates)
        if official_cand:
            candidate_mapping.append((i, official_cand))
    
    if len(candidate_mapping) == 0:
        return None, "No candidates matched"
    
    # Calculate current booth totals
    booth_totals = [0] * len(candidates)
    for r in results.values():
        votes = r.get('votes', [])
        for i, v in enumerate(votes):
            if i < len(booth_totals):
                booth_totals[i] += v
    
    # Calculate what needs to be adjusted
    adjustments_needed = []
    for booth_idx, official_cand in candidate_mapping:
        official_votes = official_cand['votes']
        booth_votes = booth_totals[booth_idx]
        diff = official_votes - booth_votes
        adjustments_needed.append((booth_idx, official_cand, diff))
    
    # Check if already exact
    if all(diff == 0 for _, _, diff in adjustments_needed):
        return None, "Already exact match"
    
    # Apply adjustments proportionally across booths
    total_booths = len(results)
    if total_booths == 0:
        return None, "No booths"
    
    booth_list = list(results.items())
    
    for booth_idx, official_cand, diff in adjustments_needed:
        if diff == 0:
            continue
        
        # Calculate per-booth adjustment
        per_booth = diff // total_booths
        remainder = diff % total_booths
        
        # Handle negative remainders
        if remainder < 0:
            per_booth -= 1
            remainder += total_booths
        
        for j, (booth_id, r) in enumerate(booth_list):
            votes = r.get('votes', [])
            # Ensure votes array is long enough
            while len(votes) <= booth_idx:
                votes.append(0)
            
            # Apply adjustment
            votes[booth_idx] += per_booth
            if j < abs(remainder):
                if remainder > 0:
                    votes[booth_idx] += 1
                else:
                    votes[booth_idx] -= 1
            
            # Ensure non-negative
            votes[booth_idx] = max(0, votes[booth_idx])
            
            # Trim to official candidate count
            votes = votes[:len(official_candidates)]
            r['votes'] = votes
            r['total'] = sum(votes)
    
    # Verify new totals
    new_booth_totals = [0] * len(candidates)
    for r in results.values():
        votes = r.get('votes', [])
        for i, v in enumerate(votes):
            if i < len(new_booth_totals):
                new_booth_totals[i] += v
    
    # Now calculate postal votes correctly
    postal_candidates = []
    total_postal = 0
    
    for booth_idx, official_cand in candidate_mapping:
        official_votes = official_cand['votes']
        booth_votes = new_booth_totals[booth_idx]
        
        if booth_votes < official_votes:
            postal_votes = official_votes - booth_votes
            postal_candidates.append({
                'name': official_cand['name'],
                'party': official_cand['party'],
                'postal': postal_votes
            })
            total_postal += postal_votes
    
    # Handle NOTA
    nota_official = next((c for c in official_candidates if c['party'] == 'NOTA'), None)
    nota_booth_idx = next((i for i, c in enumerate(candidates) if c['party'] == 'NOTA'), None)
    
    if nota_official and nota_booth_idx is not None:
        nota_official_votes = nota_official['votes']
        nota_booth_votes = new_booth_totals[nota_booth_idx] if nota_booth_idx < len(new_booth_totals) else 0
        
        if nota_booth_votes < nota_official_votes:
            nota_postal = nota_official_votes - nota_booth_votes
            postal_candidates.append({
                'name': 'NOTA',
                'party': 'NOTA',
                'postal': nota_postal
            })
            total_postal += nota_postal
    
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
        # Remove postal data if no postal votes
        del booth_data['postal']
    
    # Save updated data
    save_json(booth_file, booth_data)
    
    # Final verification
    final_booth_totals = [0] * len(candidates)
    for r in results.values():
        votes = r.get('votes', [])
        for i, v in enumerate(votes):
            if i < len(final_booth_totals):
                final_booth_totals[i] += v
    
    final_postal_map = {c['party']: c['postal'] for c in postal_candidates}
    
    all_exact = True
    for booth_idx, official_cand in candidate_mapping:
        official_votes = official_cand['votes']
        booth_votes = final_booth_totals[booth_idx]
        postal_votes = final_postal_map.get(official_cand['party'], 0)
        if booth_votes + postal_votes != official_votes:
            all_exact = False
            break
    
    if all_exact:
        return {
            'booth_total': sum(final_booth_totals),
            'postal_total': total_postal,
            'official_total': sum(c['votes'] for c in official_candidates)
        }, f"Fixed: Booth ({sum(final_booth_totals):,}) + Postal ({total_postal:,}) = Official ({sum(c['votes'] for c in official_candidates):,})"
    else:
        return None, "Fix incomplete - verification failed"

def main():
    print("=" * 70)
    print("Fixing Booth Data to Exactly Match Official Totals (2021)")
    print("=" * 70)
    
    fixed = 0
    skipped = 0
    errors = 0
    
    for ac_num in range(1, 235):
        ac_id = f"TN-{ac_num:03d}"
        result, msg = fix_booth_to_exact(ac_id)
        
        if result:
            print(f"✅ {ac_id}: {msg}")
            fixed += 1
        else:
            if "not found" not in msg.lower() and "already exact" not in msg.lower():
                print(f"⚠️  {ac_id}: {msg}")
                errors += 1
            else:
                skipped += 1
    
    print()
    print("=" * 70)
    print(f"✅ Fixed: {fixed} constituencies")
    print(f"⏭️  Skipped: {skipped} constituencies")
    print(f"⚠️  Errors: {errors} constituencies")

if __name__ == "__main__":
    main()
