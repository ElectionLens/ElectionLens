#!/usr/bin/env python3
"""
Fix postal ballot data accuracy for 2021 elections.

The issue: Postal votes are being calculated incorrectly, especially when:
1. Booth data has errors (booth > official)
2. Candidate name/party mismatches
3. Postal data extracted from PDFs incorrectly

Strategy:
1. Recalculate postal votes as: postal = max(0, official - booth) for each candidate
2. Only set postal votes when booth < official (booth > official indicates extraction error)
3. Match candidates by name+party to ensure accuracy
4. Remove postal data for candidates where booth > official (data error)
"""

import json
import os
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
    # Remove extra spaces, convert to uppercase
    return ' '.join(name.upper().split())

def match_candidate(cand_name, cand_party, official_candidates):
    """Match a candidate from booth data to official data."""
    cand_name_norm = normalize_name(cand_name)
    cand_party_upper = cand_party.upper()
    
    # Try exact match first
    for official in official_candidates:
        if normalize_name(official['name']) == cand_name_norm and official['party'].upper() == cand_party_upper:
            return official
    
    # Try fuzzy match (handle name variations)
    for official in official_candidates:
        official_name_norm = normalize_name(official['name'])
        official_party_upper = official['party'].upper()
        
        # Check if party matches and names are similar
        if official_party_upper == cand_party_upper:
            # Check if first name or last name matches
            cand_parts = set(cand_name_norm.split())
            official_parts = set(official_name_norm.split())
            
            # If significant overlap in name parts, consider it a match
            if len(cand_parts) > 0 and len(official_parts) > 0:
                overlap = len(cand_parts & official_parts)
                total_parts = len(cand_parts | official_parts)
                if overlap > 0 and overlap / total_parts > 0.5:
                    return official
    
    return None

def fix_postal_data(ac_id):
    """Fix postal data for a single AC."""
    booth_file = BOOTHS_DIR / ac_id / "2021.json"
    
    if not booth_file.exists():
        return None, "Booth data not found"
    
    # Load data
    booth_data = load_json(booth_file)
    elections_data = load_json(ELECTION_DATA)
    
    official = elections_data.get(ac_id, {})
    if not official:
        return None, "Official data not found"
    
    candidates = booth_data.get('candidates', [])
    results = booth_data.get('results', {})
    official_candidates = official.get('candidates', [])
    
    if not candidates or not results or not official_candidates:
        return None, "Missing data"
    
    # Calculate booth totals for each candidate
    booth_totals = [0] * len(candidates)
    for r in results.values():
        votes = r.get('votes', [])
        for i, v in enumerate(votes):
            if i < len(booth_totals):
                booth_totals[i] += v
    
    # Create mapping of official candidates
    official_map = {}
    for official_cand in official_candidates:
        key = (normalize_name(official_cand['name']), official_cand['party'].upper())
        official_map[key] = official_cand
    
    # Build postal data
    postal_candidates = []
    total_postal = 0
    
    for i, cand in enumerate(candidates):
        if cand['party'] == 'NOTA':
            # Handle NOTA separately
            continue
        
        # Match to official candidate
        official_cand = match_candidate(cand['name'], cand['party'], official_candidates)
        
        if not official_cand:
            # Can't match - skip postal calculation
            continue
        
        official_votes = official_cand['votes']
        booth_votes = booth_totals[i]
        
        # Calculate postal votes
        if booth_votes <= official_votes:
            postal_votes = official_votes - booth_votes
        else:
            # Booth > official indicates extraction error
            # Don't assign postal votes, but log the issue
            postal_votes = 0
        
        if postal_votes > 0:
            postal_candidates.append({
                'name': cand['name'],
                'party': cand['party'],
                'postal': postal_votes
            })
            total_postal += postal_votes
    
    # Handle NOTA separately
    nota_official = next((c for c in official_candidates if c['party'] == 'NOTA'), None)
    nota_booth_idx = next((i for i, c in enumerate(candidates) if c['party'] == 'NOTA'), None)
    
    if nota_official and nota_booth_idx is not None:
        nota_official_votes = nota_official['votes']
        nota_booth_votes = booth_totals[nota_booth_idx] if nota_booth_idx < len(booth_totals) else 0
        
        if nota_booth_votes <= nota_official_votes:
            nota_postal = nota_official_votes - nota_booth_votes
            if nota_postal > 0:
                postal_candidates.append({
                    'name': 'NOTA',
                    'party': 'NOTA',
                    'postal': nota_postal
                })
                total_postal += nota_postal
    
    # Only create postal data if we have valid postal votes
    if total_postal == 0:
        # Remove postal data if it exists
        if 'postal' in booth_data:
            del booth_data['postal']
            save_json(booth_file, booth_data)
        return None, "No postal votes (booth = official or booth > official)"
    
    # Update postal data
    postal_data = {
        'candidates': postal_candidates,
        'totalValid': total_postal,
        'rejected': 0,
        'nota': next((c['postal'] for c in postal_candidates if c['party'] == 'NOTA'), 0),
        'total': total_postal
    }
    
    booth_data['postal'] = postal_data
    save_json(booth_file, booth_data)
    
    return postal_data, f"Fixed: {total_postal:,} postal votes ({len(postal_candidates)} candidates)"

def main():
    print("=" * 60)
    print("Fixing Postal Ballot Data Accuracy for 2021")
    print("=" * 60)
    
    fixed = 0
    errors = 0
    total_postal = 0
    
    for ac_num in range(1, 235):
        ac_id = f"TN-{ac_num:03d}"
        result, msg = fix_postal_data(ac_id)
        
        if result:
            postal_sum = sum(c['postal'] for c in result['candidates'])
            total_postal += postal_sum
            print(f"✅ {ac_id}: {msg}")
            fixed += 1
        else:
            if "not found" not in msg.lower():
                print(f"⚠️  {ac_id}: {msg}")
                errors += 1
    
    print()
    print("=" * 60)
    print(f"✅ Fixed: {fixed} constituencies")
    print(f"⚠️  Errors/Skipped: {errors} constituencies")
    print(f"📮 Total postal votes: {total_postal:,}")

if __name__ == "__main__":
    main()
