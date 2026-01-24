#!/usr/bin/env python3
"""
Validate and fix postal ballot data for 2021 elections.

This script:
1. Checks all ACs with postal data
2. Validates that booth + postal = official for each candidate
3. Fixes mismatches by recalculating postal votes
4. Removes postal data where booth >= official (extraction errors)
5. Reports all issues found
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

def validate_and_fix_postal(ac_id):
    """Validate and fix postal data for a single AC."""
    booth_file = BOOTHS_DIR / ac_id / "2021.json"
    
    if not booth_file.exists():
        return None, "Booth data not found", []
    
    booth_data = load_json(booth_file)
    elections_data = load_json(ELECTION_DATA)
    
    official = elections_data.get(ac_id, {})
    if not official:
        return None, "Official data not found", []
    
    candidates = booth_data.get('candidates', [])
    results = booth_data.get('results', {})
    official_candidates = official.get('candidates', [])
    postal = booth_data.get('postal', {})
    
    if not candidates or not results:
        return None, "Missing booth data", []
    
    # Calculate booth totals
    booth_totals = [0] * len(candidates)
    for r in results.values():
        votes = r.get('votes', [])
        for i, v in enumerate(votes):
            if i < len(booth_totals):
                booth_totals[i] += v
    
    issues = []
    postal_candidates = []
    total_postal = 0
    has_errors = False
    
    # Check each candidate
    for i, cand in enumerate(candidates):
        official_cand = match_candidate(cand['name'], cand['party'], official_candidates)
        
        if not official_cand:
            issues.append(f"  ⚠️  {cand['name']} ({cand['party']}): Not found in official data")
            continue
        
        official_votes = official_cand['votes']
        booth_votes = booth_totals[i]
        stored_postal = next(
            (p.get('postal', 0) for p in postal.get('candidates', []) 
             if normalize_name(p.get('name', '')) == normalize_name(cand['name']) 
             and p.get('party', '').upper() == cand['party'].upper()),
            0
        )
        
        # Calculate correct postal votes
        if booth_votes > official_votes:
            # Error: booth > official
            issues.append(
                f"  ❌ {cand['name']} ({cand['party']}): "
                f"Booth ({booth_votes:,}) > Official ({official_votes:,}) by {booth_votes - official_votes:,}"
            )
            has_errors = True
            # Don't assign postal votes for this candidate
            postal_votes = 0
        elif booth_votes == official_votes:
            # Perfect match, no postal votes
            postal_votes = 0
        else:
            # Calculate postal votes
            postal_votes = official_votes - booth_votes
        
        # Check if stored postal matches calculated
        if stored_postal != postal_votes:
            issues.append(
                f"  🔧 {cand['name']} ({cand['party']}): "
                f"Stored postal ({stored_postal:,}) != Calculated ({postal_votes:,})"
            )
            has_errors = True
        
        # Add to postal candidates if > 0
        if postal_votes > 0:
            postal_candidates.append({
                'name': cand['name'],
                'party': cand['party'],
                'postal': postal_votes
            })
            total_postal += postal_votes
    
    # Handle NOTA
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
    
    # Update postal data
    if total_postal == 0:
        # Remove postal data if it exists
        if 'postal' in booth_data:
            del booth_data['postal']
            save_json(booth_file, booth_data)
            return None, "Removed postal data (no valid postal votes)", issues
        return None, "No postal votes needed", issues
    
    postal_data = {
        'candidates': postal_candidates,
        'totalValid': total_postal,
        'rejected': 0,
        'nota': next((c['postal'] for c in postal_candidates if c['party'] == 'NOTA'), 0),
        'total': total_postal
    }
    
    booth_data['postal'] = postal_data
    save_json(booth_file, booth_data)
    
    status = "Fixed" if has_errors else "Valid"
    return postal_data, f"{status}: {total_postal:,} postal votes ({len(postal_candidates)} candidates)", issues

def main():
    print("=" * 70)
    print("Validating and Fixing Postal Ballot Data for 2021")
    print("=" * 70)
    
    fixed = 0
    valid = 0
    removed = 0
    errors = 0
    total_postal = 0
    all_issues = []
    
    for ac_num in range(1, 235):
        ac_id = f"TN-{ac_num:03d}"
        result, msg, issues = validate_and_fix_postal(ac_id)
        
        if result:
            postal_sum = sum(c['postal'] for c in result['candidates'])
            total_postal += postal_sum
            if "Fixed" in msg:
                print(f"🔧 {ac_id}: {msg}")
                fixed += 1
                if issues:
                    all_issues.append((ac_id, issues))
            else:
                print(f"✅ {ac_id}: {msg}")
                valid += 1
        else:
            if "Removed" in msg:
                print(f"🗑️  {ac_id}: {msg}")
                removed += 1
                if issues:
                    all_issues.append((ac_id, issues))
            elif "not found" not in msg.lower():
                print(f"⚠️  {ac_id}: {msg}")
                errors += 1
    
    print()
    print("=" * 70)
    print(f"✅ Valid: {valid} constituencies")
    print(f"🔧 Fixed: {fixed} constituencies")
    print(f"🗑️  Removed: {removed} constituencies")
    print(f"⚠️  Errors: {errors} constituencies")
    print(f"📮 Total postal votes: {total_postal:,}")
    
    if all_issues:
        print()
        print("=" * 70)
        print("Issues Found:")
        print("=" * 70)
        for ac_id, issues in all_issues[:20]:  # Show first 20
            print(f"\n{ac_id}:")
            for issue in issues:
                print(issue)
        if len(all_issues) > 20:
            print(f"\n... and {len(all_issues) - 20} more ACs with issues")

if __name__ == "__main__":
    main()
