#!/usr/bin/env python3
"""
Fix postal data structure to include booth and total fields for all candidates.

The UI expects PostalCandidate to have:
- name, party, postal, booth, total

But our data only has:
- name, party, postal

This script adds booth and total fields by:
1. Calculating booth totals from results
2. Getting official totals from election data
3. Adding booth and total to each postal candidate
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

def fix_postal_structure(ac_id):
    """Fix postal data structure to include booth and total fields."""
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
    
    # Calculate booth totals
    booth_totals = [0] * len(candidates)
    for r in results.values():
        votes = r.get('votes', [])
        for i, v in enumerate(votes):
            if i < len(booth_totals):
                booth_totals[i] += v
    
    # Update postal candidates to include booth and total
    postal_candidates = postal.get('candidates', [])
    updated_postal_candidates = []
    
    for postal_cand in postal_candidates:
        # Find matching booth candidate
        booth_idx = next((i for i, c in enumerate(candidates) 
                          if normalize_name(c['name']) == normalize_name(postal_cand.get('name', '')) 
                          and c['party'].upper() == postal_cand.get('party', '').upper()), None)
        
        if booth_idx is not None:
            booth_votes = booth_totals[booth_idx]
            postal_votes = postal_cand.get('postal', 0)
            total_votes = booth_votes + postal_votes
            
            updated_postal_candidates.append({
                'name': postal_cand.get('name', ''),
                'party': postal_cand.get('party', ''),
                'postal': postal_votes,
                'booth': booth_votes,
                'total': total_votes
            })
        else:
            # Try to match with official candidate
            official_cand = match_candidate(
                postal_cand.get('name', ''),
                postal_cand.get('party', ''),
                official_candidates
            )
            
            if official_cand:
                official_votes = official_cand['votes']
                postal_votes = postal_cand.get('postal', 0)
                booth_votes = official_votes - postal_votes
                
                updated_postal_candidates.append({
                    'name': postal_cand.get('name', ''),
                    'party': postal_cand.get('party', ''),
                    'postal': postal_votes,
                    'booth': booth_votes,
                    'total': official_votes
                })
            else:
                # Keep original if can't match
                updated_postal_candidates.append({
                    'name': postal_cand.get('name', ''),
                    'party': postal_cand.get('party', ''),
                    'postal': postal_cand.get('postal', 0),
                    'booth': 0,
                    'total': postal_cand.get('postal', 0)
                })
    
    # If no postal data exists, create it with all candidates (even if postal=0)
    if not postal_candidates:
        for i, cand in enumerate(candidates):
            official_cand = match_candidate(cand['name'], cand['party'], official_candidates)
            
            if official_cand:
                booth_votes = booth_totals[i]
                official_votes = official_cand['votes']
                postal_votes = max(0, official_votes - booth_votes)
                
                updated_postal_candidates.append({
                    'name': cand['name'],
                    'party': cand['party'],
                    'postal': postal_votes,
                    'booth': booth_votes,
                    'total': official_votes
                })
    
    # Update postal data
    postal_data = {
        'candidates': updated_postal_candidates,
        'totalValid': sum(c['postal'] for c in updated_postal_candidates),
        'rejected': 0,
        'nota': next((c['postal'] for c in updated_postal_candidates if c['party'] == 'NOTA'), 0),
        'total': sum(c['postal'] for c in updated_postal_candidates)
    }
    
    booth_data['postal'] = postal_data
    save_json(booth_file, booth_data)
    
    return postal_data, f"Fixed: {len(updated_postal_candidates)} candidates with booth/total fields"

def main():
    print("=" * 70)
    print("Fixing Postal Data Structure for 2021 Elections")
    print("=" * 70)
    
    fixed = 0
    errors = 0
    
    for ac_num in range(1, 235):
        ac_id = f"TN-{ac_num:03d}"
        result, msg = fix_postal_structure(ac_id)
        
        if result:
            fixed += 1
            if ac_num % 50 == 0:
                print(f"✅ {ac_id}: {msg}")
        else:
            if "not found" not in msg.lower():
                print(f"⚠️  {ac_id}: {msg}")
                errors += 1
    
    print()
    print("=" * 70)
    print(f"✅ Fixed: {fixed} constituencies")
    print(f"⚠️  Errors: {errors} constituencies")

if __name__ == "__main__":
    main()
